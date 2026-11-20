"""Личка с самим ботом: /start, /status, настройки, скачивание по ссылке."""

from __future__ import annotations

import asyncio

from aiogram import F, Router
from aiogram.enums import ChatType
from aiogram.exceptions import TelegramAPIError
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    SwitchInlineQueryChosenChat,
)

from .. import texts
from ..core import App, retry_flood
from ..downloader import DownloadError, detect_site, download_audio, download_video, extract_url
from ..utils import esc, user_full_name

SETTING_NAMES = {
    "notify_edits": "✏️ Уведомлять об изменённых сообщениях",
    "save_view_once": "🔥 Сохранять одноразовые медиа",
    "notify_deleted": "🗑 Уведомлять об удалённых сообщениях",
}


def _settings_keyboard(app: App, user_id: int) -> InlineKeyboardMarkup:
    s = app.db.settings(user_id)
    rows = []
    for field, title in SETTING_NAMES.items():
        mark = "✅" if getattr(s, field) else "❌"
        rows.append([InlineKeyboardButton(text=f"{mark} {title}", callback_data=f"set:{field}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def _status_text(app: App, user_id: int) -> str:
    conn = app.db.active_connection_of(user_id)
    if conn is None:
        return "⚠️ Бот не подключён к твоему аккаунту.\n\n" + texts.HOW_TO_CONNECT
    conn = await app.get_connection(conn.id, refresh=True) or conn
    stats = await app.db.stats(user_id)
    return (
        "📊 <b>Статус</b>\n\n"
        f"Подключение: {'✅ активно' if conn.is_enabled else '❌ выключено'}\n\n"
        f"<b>Права бота:</b>\n{texts.rights_text(conn.can_reply, conn.can_read, conn.can_delete_all)}\n\n"
        f"🔇 Замучено чатов: <b>{stats['mutes']}</b>\n"
        f"🛡 Антимут включён в чатах: <b>{stats['antimute']}</b>\n"
        f"💾 Сообщений в кэше: <b>{stats['cached']}</b> (хранятся {app.config.cache_days} дн.)\n\n"
        "<b>Настройки</b> (нажми, чтобы переключить):"
    )


async def on_start(message: Message, app: App) -> None:
    user = message.from_user
    if user is None:
        return
    if not app.config.is_allowed(user.id):
        await message.answer(texts.NOT_ALLOWED + f"\n\nТвой ID: <code>{user.id}</code>")
        return
    connected = app.db.active_connection_of(user.id) is not None
    await message.answer(texts.start_text(esc(user_full_name(user)), user.id, connected,
                                          app.config.cache_days),
                         reply_markup=_menu_keyboard() if app.inline_enabled else None)


def _menu_keyboard() -> InlineKeyboardMarkup:
    """Кнопка: выбрать переписку — и там сразу откроется меню команд бота."""
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(
        text="📋 Меню команд в переписке",
        switch_inline_query_chosen_chat=SwitchInlineQueryChosenChat(
            query="", allow_user_chats=True, allow_bot_chats=False,
            allow_group_chats=False, allow_channel_chats=False),
    )]])


async def on_bday_test(message: Message, app: App) -> None:
    """Скрытая команда /bdaytest — посмотреть поздравление заранее (её нет в меню)."""
    user = message.from_user
    if user is None or not app.config.is_allowed(user.id):
        return
    from ..birthday import play_greeting
    await play_greeting(app, message.chat.id, app.config.owner_name)


async def on_help(message: Message) -> None:
    await message.answer(texts.COMMANDS_HELP + "\n\n" + texts.HOW_TO_CONNECT)


async def on_status(message: Message, app: App) -> None:
    user = message.from_user
    if user is None or not app.config.is_allowed(user.id):
        return
    await message.answer(await _status_text(app, user.id), reply_markup=_settings_keyboard(app, user.id))


async def on_toggle(callback: CallbackQuery, app: App) -> None:
    field = (callback.data or "").split(":", 1)[-1]
    user = callback.from_user
    if field not in SETTING_NAMES or not app.config.is_allowed(user.id):
        await callback.answer()
        return
    await app.db.toggle_setting(user.id, field)
    if isinstance(callback.message, Message):
        try:
            await callback.message.edit_text(await _status_text(app, user.id),
                                             reply_markup=_settings_keyboard(app, user.id))
        except TelegramAPIError:
            pass
    await callback.answer("Сохранено ✅")


async def on_private_text(message: Message, app: App) -> None:
    """В личке с ботом можно просто кинуть ссылку — бот пришлёт видео."""
    user = message.from_user
    if user is None or not app.config.is_allowed(user.id):
        return
    url = extract_url(message.text or "")
    if url is None or detect_site(url) is None:
        await message.answer("Кинь ссылку на TikTok / YouTube / VK видео — пришлю без водяного знака.\n"
                             "Все команды: /help, статус и настройки: /status")
        return
    status = await message.answer(texts.LINK_LOADING)
    action = asyncio.ensure_future(_keep_upload_action(app, message.chat.id))
    video = None
    try:
        try:
            video = await download_video(url, app.config)
        except DownloadError as e:
            await status.edit_text(texts.LINK_FAILED.format(error=esc(str(e))))
            return
        try:
            # через bot.send_video: у шорткатов Message.answer_* request_timeout не работает
            await retry_flood(lambda: app.bot.send_video(
                chat_id=message.chat.id, video=FSInputFile(video.path), supports_streaming=True,
                width=video.width, height=video.height, duration=video.duration,
                request_timeout=600))
        except TelegramAPIError as e:
            await status.edit_text(texts.LINK_FAILED.format(error=esc(f"Telegram не принял видео: {e}")))
            return
        await status.delete()
    finally:
        action.cancel()
        if video is not None:
            video.cleanup()


async def _keep_upload_action(app: App, chat_id: int, action: str = "upload_video") -> None:
    while True:
        try:
            await app.bot.send_chat_action(chat_id=chat_id, action=action)
        except TelegramAPIError:
            pass
        await asyncio.sleep(4.5)


async def on_music(message: Message, command: CommandObject, app: App) -> None:
    """/music название — трек прямо в личку с ботом."""
    user = message.from_user
    if user is None or not app.config.is_allowed(user.id):
        return
    query = (command.args or "").strip()
    if not query:
        await message.answer(texts.MUSIC_USAGE.replace(".music", "/music"))
        return
    status = await message.answer(texts.MUSIC_LOADING)
    action = asyncio.ensure_future(_keep_upload_action(app, message.chat.id, "upload_document"))
    audio = None
    try:
        try:
            audio = await download_audio(query[:200], app.config)
        except DownloadError as e:
            await status.edit_text(texts.LINK_FAILED.format(error=esc(str(e))))
            return
        thumb = FSInputFile(audio.thumbnail) if audio.thumbnail else None
        try:
            await retry_flood(lambda: app.bot.send_audio(
                chat_id=message.chat.id, audio=FSInputFile(audio.path),
                title=audio.title[:64] if audio.title else None,
                performer=(audio.performer or "")[:64] or None,
                duration=audio.duration, thumbnail=thumb, request_timeout=600))
        except TelegramAPIError as e:
            await status.edit_text(texts.LINK_FAILED.format(error=esc(f"Telegram не принял трек: {e}")))
            return
        await status.delete()
    finally:
        action.cancel()
        if audio is not None:
            audio.cleanup()


def make_router() -> Router:
    router = Router(name="private")
    router.message.filter(F.chat.type == ChatType.PRIVATE)
    router.message(CommandStart())(on_start)
    router.message(Command("help"))(on_help)
    router.message(Command("status", "settings"))(on_status)
    router.message(Command("music"))(on_music)
    router.message(Command("bdaytest"))(on_bday_test)
    router.callback_query(F.data.startswith("set:"))(on_toggle)
    router.message(F.text)(on_private_text)
    return router
