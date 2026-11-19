"""Сообщения в личных переписках владельца (Telegram Business / «Автоматизация чатов»)."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.types import (
    BusinessMessagesDeleted,
    CallbackQuery,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .. import texts
from ..animations import love_frames
from ..core import App, retry_flood
from ..db import Connection
from ..downloader import DownloadError, detect_site, download_video, extract_url
from ..media import resend_as_owner, send_media_to_owner
from ..utils import (
    MEDIA_NAMES,
    Command,
    DurationError,
    esc,
    human_duration,
    is_self_destructing,
    media_kind,
    message_text,
    parse_command,
    parse_duration,
    user_mention_html,
    username_html,
)

log = logging.getLogger(__name__)

# одноразовыми могут быть только эти типы
VIEW_ONCE_KINDS = {"photo", "video", "video_note", "voice", "live_photo"}
OFF_WORDS = {"off", "выкл", "выключить", "0", "stop", "нет", "no"}


# =================================================================== вход

async def on_business_message(message: Message, app: App) -> None:
    conn = await app.get_connection(message.business_connection_id)
    if conn is None or not conn.is_enabled or not app.config.is_allowed(conn.user_id):
        return
    sender = message.from_user
    if sender is not None and sender.id == conn.user_id:
        # Сообщения, которые отправил бот (наш или чужой) от имени владельца, не трогаем —
        # иначе антимут/спам зациклятся сами на себя.
        if message.sender_business_bot is not None:
            return
        await handle_owner_message(message, conn, app)
    else:
        await handle_incoming_message(message, conn, app)


async def handle_incoming_message(message: Message, conn: Connection, app: App) -> None:
    chat_id = message.chat.id
    mute = app.db.get_mute(conn.user_id, chat_id)
    if mute is not None:
        if not mute.expired():
            # самое горячее место: удаляем моментально, до любых записей в базу
            if not await app.delete(conn, chat_id, message.message_id):
                fresh = await app.get_connection(conn.id, refresh=True)
                if fresh is not None and not fresh.can_delete_all:
                    await app.warn_once(conn, "need_delete", texts.MUTE_NEED_RIGHTS)
            return
        await expire_mute(app, conn.user_id, chat_id)

    kind = media_kind(message)
    await app.db.cache_message(
        conn.user_id, chat_id, message.message_id,
        message.from_user.id if message.from_user else None,
        message_text(message) or None,
        kind[0] if kind else None, kind[1] if kind else None,
        message.date.timestamp() if message.date else None,
    )


async def handle_owner_message(message: Message, conn: Connection, app: App) -> None:
    command = parse_command(message.text)
    if command is not None:
        await run_command(command, message, conn, app)
        return

    reply = message.reply_to_message
    if reply is not None and app.db.settings(conn.user_id).save_view_once:
        await maybe_save_view_once(message, reply, conn, app, explicit=False)

    if app.db.has_antimute(conn.user_id, message.chat.id):
        await antimute_resend(message, conn, app)


# =================================================================== команды

async def run_command(command: Command, message: Message, conn: Connection, app: App) -> None:
    handler = COMMANDS[command.name]
    try:
        await handler(command, message, conn, app)
    except TelegramAPIError as e:
        log.warning("command .%s failed: %s", command.name, e)
        await app.notify(conn, texts.CANT_SEND.format(
            command="." + command.name, chat=chat_title(message), error=esc(str(e))[:300]))


def chat_title(message: Message) -> str:
    chat = message.chat
    name = " ".join(p for p in (chat.first_name, chat.last_name) if p) or chat.title or str(chat.id)
    return f"<b>{esc(name)}</b>"


# ------------------------------------------------------------------- .mute / .unmute

def unmute_keyboard(chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=texts.MUTE_BUTTON, callback_data=f"unmute:{chat_id}")
    ]])


async def cmd_mute(command: Command, message: Message, conn: Connection, app: App) -> None:
    chat_id = message.chat.id
    try:
        seconds = parse_duration(command.args)
    except DurationError:
        await app.flash(conn, message, texts.BAD_DURATION)
        return

    until = time.time() + seconds if seconds is not None else None
    old = app.db.get_mute(conn.user_id, chat_id)
    # мут включаем сразу, чтобы удаление работало уже пока рисуется плашка
    await app.db.set_mute(conn.user_id, chat_id, until, None, conn.id)

    duration = "навсегда" if seconds is None else "на " + human_duration(seconds, accusative=True)
    status_id = await app.respond(conn, message, texts.MUTE_STATUS.format(duration=duration),
                                  reply_markup=unmute_keyboard(chat_id))
    await app.db.set_mute_status_msg(conn.user_id, chat_id, status_id)

    if old is not None and old.status_msg_id and old.status_msg_id != status_id:
        await app.delete(conn, chat_id, old.status_msg_id)
    if not conn.can_delete_all:
        fresh = await app.get_connection(conn.id, refresh=True)
        if fresh is None or not fresh.can_delete_all:
            await app.notify(conn, texts.MUTE_NEED_RIGHTS)


async def cmd_unmute(command: Command, message: Message, conn: Connection, app: App) -> None:
    chat_id = message.chat.id
    mute = await app.db.remove_mute(conn.user_id, chat_id)
    if mute is None:
        await app.flash(conn, message, texts.NOT_MUTED)
        return
    # красиво: старая плашка «в муте» превращается в «мут снят», а команда исчезает
    if mute.status_msg_id and await app.edit(conn, chat_id, mute.status_msg_id, texts.UNMUTED):
        await app.delete(conn, chat_id, message.message_id)
    else:
        await app.respond(conn, message, texts.UNMUTED)


async def expire_mute(app: App, owner_id: int, chat_id: int) -> None:
    mute = await app.db.remove_mute(owner_id, chat_id)
    if mute is None or not mute.status_msg_id:
        return
    conn = app.db.active_connection_of(owner_id) or await app.get_connection(mute.connection_id)
    if conn is not None:
        await app.edit(conn, chat_id, mute.status_msg_id, texts.MUTE_EXPIRED)


async def on_unmute_button(callback: CallbackQuery, app: App) -> None:
    try:
        chat_id = int((callback.data or "").split(":", 1)[1])
    except (IndexError, ValueError):
        await callback.answer()
        return
    presser = callback.from_user
    mute = app.db.get_mute(presser.id, chat_id)
    if mute is None:
        is_owner = bool(app.db.connections_of(presser.id))
        await callback.answer("Мут уже снят 🔊" if is_owner else texts.ONLY_OWNER_CAN_UNMUTE,
                              show_alert=not is_owner)
        return
    await app.db.remove_mute(presser.id, chat_id)
    conn = app.db.active_connection_of(presser.id) or await app.get_connection(mute.connection_id)
    msg_id = mute.status_msg_id
    if msg_id is None and callback.message is not None:
        msg_id = callback.message.message_id
    if conn is not None and msg_id:
        await app.edit(conn, chat_id, msg_id, texts.UNMUTED)
    await callback.answer("Размучен 🔊")


# ------------------------------------------------------------------- .spam

async def cmd_spam(command: Command, message: Message, conn: Connection, app: App) -> None:
    parts = command.args.split(maxsplit=1)
    if len(parts) < 2 or not parts[0].isdigit() or int(parts[0]) < 1:
        await app.flash(conn, message, texts.SPAM_USAGE)
        return
    count, text = int(parts[0]), parts[1]
    if count > app.config.spam_limit:
        await app.flash(conn, message, texts.SPAM_LIMIT.format(limit=app.config.spam_limit))
        return
    chat_id = message.chat.id
    await app.delete(conn, chat_id, message.message_id)
    app.spawn(spam_task(app, conn, chat_id, text[:4096], count), chat_key=(conn.user_id, chat_id))


async def spam_task(app: App, conn: Connection, chat_id: int, text: str, count: int) -> None:
    for i in range(count):
        try:
            await app.send(conn, chat_id, text, parse_mode=None)
        except TelegramAPIError as e:
            log.info("spam stopped at %s/%s: %s", i, count, e)
            await app.notify(conn, texts.CANT_SEND.format(
                command=".spam", chat=f"<code>{chat_id}</code>", error=esc(str(e))[:300]))
            return
        if i != count - 1:
            await asyncio.sleep(app.config.spam_delay)


# ------------------------------------------------------------------- .stop

async def cmd_stop(command: Command, message: Message, conn: Connection, app: App) -> None:
    app.cancel_chat_tasks(conn.user_id, message.chat.id)
    await app.delete(conn, message.chat.id, message.message_id)


# ------------------------------------------------------------------- .unmuteme (антимут)

async def cmd_unmuteme(command: Command, message: Message, conn: Connection, app: App) -> None:
    chat_id = message.chat.id
    if command.args.lower() in OFF_WORDS:
        if not app.db.has_antimute(conn.user_id, chat_id):
            await app.flash(conn, message, texts.ANTIMUTE_ALREADY_OFF)
            return
        await app.db.set_antimute(conn.user_id, chat_id, False)
        await app.flash(conn, message, texts.ANTIMUTE_OFF)
        return
    await app.db.set_antimute(conn.user_id, chat_id, True)
    # чужой мут-бот может снести наше сообщение-команду, поэтому плашку шлём новым сообщением
    await app.respond(conn, message, texts.ANTIMUTE_ON, prefer_edit=False)


# Сторож удалений: если чужой бот всё-таки видит и сносит наши копии — переотправляем,
# но не больше ANTIMUTE_MAX_GEN раз на одно сообщение и только сразу после отправки
# (если удалили позже — это, скорее всего, сделал сам владелец, и воскрешать не надо).
ANTIMUTE_MAX_GEN = 3
ANTIMUTE_WATCH_SECONDS = 6.0
ANTIMUTE_BACKOFF = (0.3, 1.0, 2.0)


@dataclass
class _AntimuteCopy:
    original: Message
    gen: int
    sent_at: float


def _copies(app: App) -> dict[tuple[int, int, int], _AntimuteCopy]:
    store = getattr(app, "_antimute_copies", None)
    if store is None:
        store = {}
        app._antimute_copies = store  # type: ignore[attr-defined]
    return store


def _remember_copy(app: App, owner_id: int, chat_id: int, copy_id: int, original: Message, gen: int) -> None:
    store = _copies(app)
    now = time.monotonic()
    for key in [k for k, v in store.items() if now - v.sent_at > 120]:
        store.pop(key, None)
    store[(owner_id, chat_id, copy_id)] = _AntimuteCopy(original, gen, now)


async def antimute_resend(message: Message, conn: Connection, app: App, gen: int = 1) -> None:
    """Антимут: бот сразу дублирует сообщение владельца от его имени, а оригинал удаляет.

    Чужой мут-бот удаляет оригинал (или не успевает — тогда удалим мы, чтобы не было дублей),
    а копия, отправленная ботом, остаётся: другие боты обычно не видят сообщения ботов,
    поэтому «тот бот думает, что удалил сообщение», а оно на месте.
    """
    try:
        sent = await resend_as_owner(app, conn, message)
    except TelegramAPIError as e:
        log.info("antimute resend failed: %s", e)
        await app.warn_once(conn, "antimute_fail", texts.CANT_SEND.format(
            command=".unmuteme", chat=chat_title(message), error=esc(str(e))[:300]))
        return
    if sent is None:
        return  # такой тип сообщения переотправить нельзя — оставляем оригинал
    _remember_copy(app, conn.user_id, message.chat.id, sent.message_id, message, gen)
    if gen == 1:
        await app.delete(conn, message.chat.id, message.message_id)


async def on_deleted_business_messages(event: BusinessMessagesDeleted, app: App) -> None:
    conn = await app.get_connection(event.business_connection_id)
    if conn is None or not conn.is_enabled:
        return
    chat_id = event.chat.id
    if not app.db.has_antimute(conn.user_id, chat_id):
        return
    store = _copies(app)
    now = time.monotonic()
    for message_id in event.message_ids:
        copy = store.pop((conn.user_id, chat_id, message_id), None)
        if copy is None or copy.gen >= ANTIMUTE_MAX_GEN:
            continue
        if now - copy.sent_at > ANTIMUTE_WATCH_SECONDS:
            continue
        app.spawn(_resend_later(app, conn, copy), chat_key=(conn.user_id, chat_id))


async def _resend_later(app: App, conn: Connection, copy: _AntimuteCopy) -> None:
    await asyncio.sleep(ANTIMUTE_BACKOFF[min(copy.gen, len(ANTIMUTE_BACKOFF)) - 1])
    if app.db.has_antimute(conn.user_id, copy.original.chat.id):
        await antimute_resend(copy.original, conn, app, gen=copy.gen + 1)


# ------------------------------------------------------------------- .link

async def cmd_link(command: Command, message: Message, conn: Connection, app: App) -> None:
    url = extract_url(command.args)
    if url is None and message.reply_to_message is not None:
        url = extract_url(message_text(message.reply_to_message))
    if url is None:
        await app.flash(conn, message, texts.LINK_USAGE)
        return
    if detect_site(url) is None:
        await app.flash(conn, message, texts.LINK_UNSUPPORTED)
        return
    status_id = await app.respond(conn, message, texts.LINK_LOADING)
    chat_id = message.chat.id
    app.spawn(link_task(app, conn, chat_id, url, status_id), chat_key=(conn.user_id, chat_id))


async def _keep_action(app: App, conn: Connection, chat_id: int) -> None:
    while True:
        with contextlib.suppress(TelegramAPIError):
            await app.bot.send_chat_action(chat_id=chat_id, action="upload_video",
                                           business_connection_id=conn.id)
        await asyncio.sleep(4.5)


async def link_task(app: App, conn: Connection, chat_id: int, url: str, status_id: int | None) -> None:
    action = app.spawn(_keep_action(app, conn, chat_id))
    video = None
    try:
        try:
            video = await download_video(url, app.config)
        except DownloadError as e:
            await _link_failed(app, conn, chat_id, status_id, str(e))
            return
        if status_id:
            await app.edit(conn, chat_id, status_id, texts.LINK_SENDING)
        try:
            await retry_flood(lambda: app.bot.send_video(
                chat_id=chat_id,
                video=FSInputFile(video.path),
                business_connection_id=conn.id,
                supports_streaming=True,
                width=video.width,
                height=video.height,
                duration=video.duration,
                request_timeout=600,
            ))
        except TelegramAPIError as e:
            await _link_failed(app, conn, chat_id, status_id, f"Telegram не принял видео: {e}")
            return
        await app.delete(conn, chat_id, status_id)
    finally:
        action.cancel()
        if video is not None:
            video.cleanup()


async def _link_failed(app: App, conn: Connection, chat_id: int, status_id: int | None, error: str) -> None:
    text = texts.LINK_FAILED.format(error=esc(error))
    if status_id and await app.edit(conn, chat_id, status_id, text):
        await asyncio.sleep(8)
        await app.delete(conn, chat_id, status_id)
    else:
        await app.notify(conn, text)


# ------------------------------------------------------------------- .love

async def cmd_love(command: Command, message: Message, conn: Connection, app: App) -> None:
    frames = love_frames(command.args or None)
    chat_id = message.chat.id
    target: int | None = None
    if not app.db.has_antimute(conn.user_id, chat_id):
        if await app.edit(conn, chat_id, message.message_id, frames[0], parse_mode=None):
            target = message.message_id
    if target is None:
        await app.delete(conn, chat_id, message.message_id)
        sent = await app.send(conn, chat_id, frames[0], parse_mode=None)
        target = sent.message_id
    app.spawn(love_task(app, conn, chat_id, target, frames[1:]), chat_key=(conn.user_id, chat_id))


async def love_task(app: App, conn: Connection, chat_id: int, message_id: int, frames: list[str]) -> None:
    for frame in frames:
        await asyncio.sleep(app.config.love_frame_delay)
        if not await app.edit(conn, chat_id, message_id, frame, parse_mode=None):
            return  # сообщение удалили или правка запрещена


# ------------------------------------------------------------------- одноразовые медиа

async def cmd_save(command: Command, message: Message, conn: Connection, app: App) -> None:
    reply = message.reply_to_message
    if reply is None or media_kind(reply) is None:
        await app.flash(conn, message, texts.SAVE_NOTHING)
        return
    # команду .save убираем из переписки, чтобы собеседник её не видел
    await app.delete(conn, message.chat.id, message.message_id)
    await maybe_save_view_once(message, reply, conn, app, explicit=True)


async def maybe_save_view_once(message: Message, reply: Message, conn: Connection, app: App,
                               explicit: bool) -> None:
    """Сохраняет медиа, на которое ответил владелец.

    Bot API никогда не присылает ботам одноразовые (view once / с таймером) сообщения
    напрямую, но если владелец ОТВЕЧАЕТ на такое сообщение, оно приходит целиком внутри
    reply_to_message. Одноразовость определяем точно — по типу файла внутри file_id.
    • обычный ответ на одноразовое — сохраняем автоматически;
    • .save — сохраняем любое медиа.
    """
    kind_info = media_kind(reply)
    if kind_info is None:
        return
    kind, file_id = kind_info
    view_once = is_self_destructing(file_id)
    if not explicit:
        if kind not in VIEW_ONCE_KINDS:
            return
        if reply.from_user is not None and reply.from_user.id == conn.user_id:
            return
        if view_once is False:
            return  # обычное медиа
        if view_once is None:
            # не смогли разобрать file_id — запасной признак: бот этого сообщения не получал
            if await app.db.get_message(conn.user_id, message.chat.id, reply.message_id) is not None:
                return
    if not await app.db.mark_saved(conn.user_id, message.chat.id, reply.message_id):
        return  # уже сохраняли
    sender = reply.from_user
    names = {"name": user_mention_html(sender), "username": username_html(sender)}
    if view_once is not False and kind in texts.VIEW_ONCE_TITLES:
        caption = texts.VIEW_ONCE_CAPTION.format(title=texts.VIEW_ONCE_TITLES[kind], **names)
    else:
        caption = texts.SAVED_CAPTION.format(kind=MEDIA_NAMES.get(kind, kind), **names)
    if reply.caption:
        caption += "\n\n" + esc(reply.caption[:700])
    try:
        await send_media_to_owner(app, conn, reply, kind, file_id, caption)
    except Exception as e:  # noqa: BLE001
        log.warning("save media failed: %s", e)
        await app.db.unmark_saved(conn.user_id, message.chat.id, reply.message_id)
        await app.notify(conn, texts.SAVE_FAILED.format(
            kind=MEDIA_NAMES.get(kind, kind), name=user_mention_html(sender), error=esc(str(e))[:300]))


# ------------------------------------------------------------------- .help

async def cmd_help(command: Command, message: Message, conn: Connection, app: App) -> None:
    await app.delete(conn, message.chat.id, message.message_id)
    sent = await app.notify(conn, texts.COMMANDS_HELP)
    if sent is None:
        await app.flash(conn, message, f"Открой @{app.bot_username} и нажми «Старт» — "
                                       "туда придёт список команд.")


COMMANDS = {
    "mute": cmd_mute,
    "unmute": cmd_unmute,
    "spam": cmd_spam,
    "stop": cmd_stop,
    "unmuteme": cmd_unmuteme,
    "link": cmd_link,
    "love": cmd_love,
    "save": cmd_save,
    "help": cmd_help,
}


def make_router() -> Router:
    router = Router(name="business")
    router.business_message()(on_business_message)
    router.deleted_business_messages()(on_deleted_business_messages)
    router.callback_query(F.data.startswith("unmute:"))(on_unmute_button)
    return router
