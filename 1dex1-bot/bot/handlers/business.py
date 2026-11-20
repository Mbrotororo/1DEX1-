"""Сообщения в личных переписках владельца (Telegram Business / «Автоматизация чатов»)."""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from aiogram import F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.types import (
    BusinessMessagesDeleted,
    CallbackQuery,
    Chat,
    FSInputFile,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
)

from .. import texts
from ..animations import ANIMATIONS, mock_text
from ..core import App, retry_flood
from ..db import CachedMessage, ChatStats, Connection, Mute
from ..downloader import DownloadError, detect_site, download_audio, download_video, extract_url
from ..media import resend_as_owner, send_media_to_owner
from ..utils import (
    MEDIA_NAMES,
    Command,
    DurationError,
    _plural,
    cut,
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
from ..birthday import track_congrats
from ..currency import CurrencyError, convert
from ..weather import WeatherError, fetch_weather
from ..worldtime import WorldTimeError, city_time

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
        # aiogram обрабатывает апдейты параллельно — очередь по чату сохраняет порядок
        # (иначе в антимуте копии могут прийти собеседнику вперемешку)
        async with app.chat_lock(conn.user_id, message.chat.id):
            await handle_owner_message(message, conn, app)
    else:
        await handle_incoming_message(message, conn, app)


def _day(app: App, ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, app.config.tz).strftime("%Y-%m-%d")


async def _record_stat(app: App, conn: Connection, message: Message, from_owner: bool) -> None:
    ts = message.date.timestamp() if message.date else time.time()
    kind = media_kind(message)
    await app.db.record_message(conn.user_id, message.chat.id, from_owner, ts, _day(app, ts),
                                len(message_text(message)), kind[0] if kind else None)


async def handle_incoming_message(message: Message, conn: Connection, app: App) -> None:
    chat_id = message.chat.id
    mute = app.db.get_mute(conn.user_id, chat_id)
    if mute is not None:
        if not mute.expired():
            # самое горячее место: удаляем моментально, до любых записей в базу
            if not await app.delete(conn, chat_id, message.message_id) and not message.dice:
                fresh = await app.get_connection(conn.id, refresh=True)
                if fresh is not None and not fresh.can_delete_all:
                    await app.warn_once(conn, "need_delete", texts.MUTE_NEED_RIGHTS)
            return
        await expire_mute(app, conn.user_id, chat_id, mute)

    await _record_stat(app, conn, message, from_owner=False)
    await track_congrats(app, conn, message)
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

    await _record_stat(app, conn, message, from_owner=True)
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
    except Exception as e:  # noqa: BLE001 — владелец должен узнать о любой ошибке
        log.warning("command .%s failed: %s", command.name, e, exc_info=not isinstance(e, TelegramAPIError))
        await app.notify(conn, texts.CANT_SEND.format(
            command="." + command.name, chat=chat_title(message), error=esc(str(e))[:300]))


def _spawn_command(app: App, conn: Connection, message: Message,
                   coro_factory: Callable[[], Awaitable[None]], name: str) -> None:
    """Долгие команды запускаем фоновой задачей сразу — чтобы .stop мог отменить их
    даже на этапе «рисую первую плашку». Ошибки отправляем владельцу."""
    async def runner() -> None:
        try:
            await coro_factory()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("command .%s failed in background: %s", name, e,
                        exc_info=not isinstance(e, TelegramAPIError))
            await app.notify(conn, texts.CANT_SEND.format(
                command="." + name, chat=chat_title(message), error=esc(str(e))[:300]))

    app.spawn(runner(), chat_key=(conn.user_id, message.chat.id))


def chat_title(message: Message) -> str:
    chat = message.chat
    name = " ".join(p for p in (chat.first_name, chat.last_name) if p) or chat.title or str(chat.id)
    return f"<b>{esc(name)}</b>"


# ------------------------------------------------------------------- .mute / .unmute

def unmute_keyboard(owner_id: int, chat_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=texts.MUTE_BUTTON, callback_data=f"unmute:{owner_id}:{chat_id}")
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

    duration = "" if seconds is None else " на " + human_duration(seconds, accusative=True)
    status_id = await app.respond(conn, message, texts.MUTE_STATUS.format(duration=duration),
                                  reply_markup=unmute_keyboard(conn.user_id, chat_id))
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


async def expire_mute(app: App, owner_id: int, chat_id: int, expected: Mute | None = None) -> None:
    mute = await app.db.remove_mute(owner_id, chat_id, only_if=expected)
    if mute is None or not mute.status_msg_id:
        return
    conn = app.db.active_connection_of(owner_id) or await app.get_connection(mute.connection_id)
    if conn is not None:
        await app.edit(conn, chat_id, mute.status_msg_id, texts.MUTE_EXPIRED)


async def on_unmute_button(callback: CallbackQuery, app: App) -> None:
    parts = (callback.data or "").split(":")
    presser = callback.from_user
    try:
        if len(parts) == 3:  # unmute:<владелец>:<чат>
            owner_id, chat_id = int(parts[1]), int(parts[2])
            if presser.id != owner_id:
                await callback.answer(texts.ONLY_OWNER_CAN_UNMUTE, show_alert=True)
                return
        else:  # старые плашки: unmute:<чат>
            chat_id = int(parts[1])
    except (IndexError, ValueError):
        await callback.answer()
        return
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
    if len(parts) < 2 or not (parts[0].isascii() and parts[0].isdigit()) or int(parts[0]) < 1:
        await app.flash(conn, message, texts.SPAM_USAGE)
        return
    count, text = int(parts[0]), parts[1]
    if count > app.config.spam_limit:
        await app.flash(conn, message, texts.SPAM_LIMIT.format(limit=app.config.spam_limit))
        return
    _spawn_command(app, conn, message,
                   lambda: spam_task(app, conn, message.chat.id, text[:4096], count, message.message_id),
                   "spam")


async def spam_task(app: App, conn: Connection, chat_id: int, text: str, count: int,
                    command_id: int | None = None) -> None:
    if command_id:
        await app.delete(conn, chat_id, command_id)
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
    if not conn.can_delete_all:
        fresh = await app.get_connection(conn.id, refresh=True)
        if fresh is None or not fresh.can_delete_all:
            await app.notify(conn, texts.UNMUTEME_NEED_RIGHTS)


# Сторож удалений: если чужой бот всё-таки видит и сносит наши копии — переотправляем,
# но не больше ANTIMUTE_MAX_GEN раз на одно сообщение и только если удалили с «ботской»
# скоростью (человек так быстро не удаляет; удалил позже — значит, это сделал сам владелец).
ANTIMUTE_MAX_GEN = 3
ANTIMUTE_WATCH_SECONDS = 1.5
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
    а копия остаётся, и «тот бот думает, что удалил сообщение». Срабатывает против мут-ботов,
    которые реагируют только на первое сообщение; если чужой бот удаляет и копии, сторож
    удалений переотправит сообщение ещё пару раз и сдастся (без бесконечной войны ботов).
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
    if conn is None or not conn.is_enabled or not app.config.is_allowed(conn.user_id):
        return
    chat_id = event.chat.id
    owner_id = conn.user_id
    # то, что удалил сам бот (мут, антимут, команды), не интересно
    foreign = [m for m in event.message_ids if not app.was_self_deleted(owner_id, chat_id, m)]
    if not foreign:
        return
    store = _copies(app)
    copy_ids = [m for m in foreign if (owner_id, chat_id, m) in store]
    other_ids = [m for m in foreign if (owner_id, chat_id, m) not in store]
    if copy_ids and app.db.has_antimute(owner_id, chat_id) and not other_ids:
        now = time.monotonic()
        for message_id in copy_ids:
            copy = store.pop((owner_id, chat_id, message_id))
            if copy.gen < ANTIMUTE_MAX_GEN and now - copy.sent_at <= ANTIMUTE_WATCH_SECONDS:
                app.spawn(_resend_later(app, conn, copy), chat_key=(owner_id, chat_id))
    else:
        for message_id in copy_ids:  # чистка истории — ничего не воскрешаем
            store.pop((owner_id, chat_id, message_id), None)
    if other_ids:
        await notify_deleted(app, conn, event.chat, other_ids)


def _chat_mention(chat: Chat) -> tuple[str, str]:
    name = " ".join(p for p in (chat.first_name, chat.last_name) if p) or chat.title or "Собеседник"
    mention = f'<a href="tg://user?id={chat.id}">{esc(name)}</a>'
    username = "@" + esc(chat.username) if chat.username else "нет"
    return mention, username


async def notify_deleted(app: App, conn: Connection, chat: Chat, message_ids: list[int]) -> None:
    """Собеседник удалил сообщения — присылаем владельцу, что там было (из кэша)."""
    cached = await app.db.get_messages(conn.user_id, chat.id, message_ids)
    peer: list[CachedMessage] = [c for _, c in sorted(cached.items())
                                 if c.from_id is not None and c.from_id != conn.user_id]
    if not peer:
        return
    await app.db.record_peer_event(conn.user_id, chat.id, "deletes", len(peer))
    if not app.db.settings(conn.user_id).notify_deleted:
        return
    mention, username = _chat_mention(chat)

    plain = [c for c in peer if not c.media_type]
    if plain:
        n = len(plain)
        title = ("Удалено сообщение" if n == 1
                 else f"Удалено {n} {_plural(n, 'сообщение', 'сообщения', 'сообщений')}")
        body = texts.DELETED_HEADER.format(title=title, name=mention, username=username)
        shown = 0
        for c in plain:
            item = texts.DELETED_ITEM.format(text=esc(cut(c.text or "", 700)) or texts.EMPTY_TEXT)
            if len(body) + len(item) > 3800:
                break
            body += item
            shown += 1
        if shown < n:
            body += texts.DELETED_MORE.format(count=n - shown)
        await app.notify(conn, body)

    for c in [c for c in peer if c.media_type and c.file_id][:5]:
        caption = texts.DELETED_MEDIA_CAPTION.format(
            kind=MEDIA_NAMES.get(c.media_type or "", "медиа"), name=mention, username=username)
        if c.text:
            caption += "\n\n" + esc(cut(c.text, 700))
        try:
            await send_media_to_owner(app, conn, None, c.media_type or "document", c.file_id or "", caption)
        except Exception as e:  # noqa: BLE001
            log.info("can't resend deleted media: %s", e)
            await app.notify(conn, caption + "\n\n<i>(файл переслать не получилось)</i>")


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
    async def run() -> None:
        status_id = await app.respond(conn, message, texts.LINK_LOADING)
        await link_task(app, conn, message.chat.id, url, status_id)

    _spawn_command(app, conn, message, run, "link")


async def _keep_action(app: App, conn: Connection, chat_id: int, action: str = "upload_video") -> None:
    while True:
        with contextlib.suppress(TelegramAPIError):
            await app.bot.send_chat_action(chat_id=chat_id, action=action,
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
    except asyncio.CancelledError:
        with contextlib.suppress(Exception):
            await app.delete(conn, chat_id, status_id)  # .stop — убираем «⏳ Скачиваю…»
        raise
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


# ------------------------------------------------------------------- анимации

ANIMATION_USAGE = {"type": texts.TYPE_USAGE, "glitch": texts.GLITCH_USAGE,
                   "rainbow": texts.RAINBOW_USAGE, "wave": texts.WAVE_USAGE}
ANIMATION_NAMES = ("love", "rose", "fire", "heart", "type", "glitch", "loading",
                   "rain", "firework", "rainbow", "wave")


async def cmd_animation(command: Command, message: Message, conn: Connection, app: App) -> None:
    """.love .rose .fire .heart .type .glitch .loading .rain .firework .rainbow .wave —
    сообщение-команда превращается в анимацию."""
    if command.name in ANIMATION_USAGE and not command.args:
        await app.flash(conn, message, ANIMATION_USAGE[command.name])
        return
    frames = ANIMATIONS[command.name](command.args or None)
    _spawn_command(app, conn, message, lambda: animate(app, conn, message, frames), command.name)


async def animate(app: App, conn: Connection, message: Message, frames: list[str]) -> None:
    chat_id = message.chat.id
    target: int | None = None
    if not app.db.has_antimute(conn.user_id, chat_id):
        if await app.edit(conn, chat_id, message.message_id, frames[0], parse_mode=None):
            target = message.message_id
    if target is None:
        sent = await app.send(conn, chat_id, frames[0], parse_mode=None)
        target = sent.message_id
        await app.delete(conn, chat_id, message.message_id)
    for frame in frames[1:]:
        await asyncio.sleep(app.config.love_frame_delay)
        if not await app.edit(conn, chat_id, target, frame, parse_mode=None):
            return  # сообщение удалили или правка запрещена


# ------------------------------------------------------------------- .mock

async def cmd_mock(command: Command, message: Message, conn: Connection, app: App) -> None:
    source = command.args
    if not source and message.reply_to_message is not None:
        source = message_text(message.reply_to_message)
    if not source:
        await app.flash(conn, message, texts.MOCK_USAGE)
        return
    # команда-ответ превращается в «пРиКоЛ» и остаётся ответом на то сообщение
    await app.respond(conn, message, mock_text(source)[:4096], parse_mode=None)


# ------------------------------------------------------------------- .weather

async def cmd_weather(command: Command, message: Message, conn: Connection, app: App) -> None:
    city = command.args or app.config.weather_city
    if not city:
        await app.flash(conn, message, texts.WEATHER_USAGE)
        return

    async def run() -> None:
        status_id = await app.respond(conn, message, texts.WEATHER_LOADING)
        try:
            card = await fetch_weather(city)
        except WeatherError as e:
            await _status_failed(app, conn, message.chat.id, status_id, str(e))
            return
        if status_id is not None:
            await app.edit(conn, message.chat.id, status_id, card)

    _spawn_command(app, conn, message, run, "weather")


async def _status_failed(app: App, conn: Connection, chat_id: int, status_id: int | None,
                         error: str) -> None:
    text = "❌ " + esc(error)
    if status_id and await app.edit(conn, chat_id, status_id, text):
        await asyncio.sleep(8)
        await app.delete(conn, chat_id, status_id)
    else:
        await app.notify(conn, text)


# ------------------------------------------------------------------- .currency / .time

async def cmd_currency(command: Command, message: Message, conn: Connection, app: App) -> None:
    async def run() -> None:
        try:
            card = await convert(command.args)
        except CurrencyError as e:
            await app.flash(conn, message, "❌ " + str(e))
            return
        await app.respond(conn, message, card)

    _spawn_command(app, conn, message, run, "currency")


async def cmd_time(command: Command, message: Message, conn: Connection, app: App) -> None:
    city = command.args or app.config.weather_city
    if not city:
        await app.flash(conn, message, texts.TIME_USAGE)
        return

    async def run() -> None:
        try:
            card = await city_time(city, owner_offset_hours=app.config.tz_offset_hours)
        except WorldTimeError as e:
            await app.flash(conn, message, "❌ " + str(e))
            return
        await app.respond(conn, message, card)

    _spawn_command(app, conn, message, run, "time")


# ------------------------------------------------------------------- .music

async def cmd_music(command: Command, message: Message, conn: Connection, app: App) -> None:
    query = command.args
    if not query and message.reply_to_message is not None:
        query = message_text(message.reply_to_message)
    if not query:
        await app.flash(conn, message, texts.MUSIC_USAGE)
        return

    async def run() -> None:
        status_id = await app.respond(conn, message, texts.MUSIC_LOADING)
        await music_task(app, conn, message.chat.id, query[:200], status_id)

    _spawn_command(app, conn, message, run, "music")


async def music_task(app: App, conn: Connection, chat_id: int, query: str, status_id: int | None) -> None:
    action = app.spawn(_keep_action(app, conn, chat_id, "upload_document"))
    audio = None
    try:
        try:
            audio = await download_audio(query, app.config)
        except DownloadError as e:
            await _status_failed(app, conn, chat_id, status_id, str(e))
            return
        if status_id:
            await app.edit(conn, chat_id, status_id, texts.MUSIC_SENDING)
        thumb = FSInputFile(audio.thumbnail) if audio.thumbnail else None
        try:
            await retry_flood(lambda: app.bot.send_audio(
                chat_id=chat_id,
                audio=FSInputFile(audio.path),
                business_connection_id=conn.id,
                title=audio.title[:64] if audio.title else None,
                performer=(audio.performer or "")[:64] or None,
                duration=audio.duration,
                thumbnail=thumb,
                request_timeout=600,
            ))
        except TelegramAPIError as e:
            await _status_failed(app, conn, chat_id, status_id, f"Telegram не принял трек: {e}")
            return
        await app.delete(conn, chat_id, status_id)
    except asyncio.CancelledError:
        with contextlib.suppress(Exception):
            await app.delete(conn, chat_id, status_id)
        raise
    finally:
        action.cancel()
        if audio is not None:
            audio.cleanup()


# ------------------------------------------------------------------- .stats

def _short_duration(seconds: float) -> str:
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{max(seconds, 1)} сек"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} мин"
    hours, minutes = divmod(minutes, 60)
    return f"{hours} ч {minutes} мин" if minutes else f"{hours} ч"


def render_stats(stats: ChatStats, peer_name: str, tz: dt.tzinfo) -> str:
    name = esc(peer_name)
    total = stats.total
    def pct(n: int) -> int:
        return round(100 * n / total) if total else 0
    def avg(chars: int, msgs: int) -> int:
        return round(chars / msgs) if msgs else 0
    def reply(total_s: float, n: int) -> str:
        return _short_duration(total_s / n) if n else "—"

    since = dt.datetime.fromtimestamp(stats.first_ts, tz).strftime("%d.%m.%Y")
    lines = [
        f"📊 <b>Статистика переписки с {name}</b>",
        f"<i>считаю с {since}</i>",
        "",
        f"💬 Всего: <b>{total}</b> · сегодня {stats.today} · за 7 дней {stats.week}",
        f"👤 Ты: <b>{stats.owner_msgs}</b> ({pct(stats.owner_msgs)}%)",
        f"👤 {name}: <b>{stats.peer_msgs}</b> ({pct(stats.peer_msgs)}%)",
    ]
    if stats.owner_msgs != stats.peer_msgs:
        lines.append("🏆 Больше пишет: " + ("ты" if stats.owner_msgs > stats.peer_msgs else name))
    lines += [
        "",
        f"📝 Средняя длина: ты {avg(stats.owner_chars, stats.owner_msgs)} · "
        f"{name} {avg(stats.peer_chars, stats.peer_msgs)} симв.",
        f"⏱ Отвечает в среднем: ты за {reply(stats.owner_reply_sum, stats.owner_reply_n)} · "
        f"{name} за {reply(stats.peer_reply_sum, stats.peer_reply_n)}",
        f"🖼 Фото/видео: ты {stats.owner_media} · {name} {stats.peer_media}",
        f"🎤 Голосовые и кружки: ты {stats.owner_voice} · {name} {stats.peer_voice}",
        f"🎭 Стикеры: ты {stats.owner_stickers} · {name} {stats.peer_stickers}",
    ]
    if stats.top_day:
        day = dt.datetime.strptime(stats.top_day, "%Y-%m-%d").strftime("%d.%m")
        lines.append(f"🔥 Самый активный день: {day} — {stats.top_day_count}")
    lines.append(f"✏️ {name} изменял(а) сообщения: {stats.peer_edits} · 🗑 удалял(а): {stats.peer_deletes}")
    return "\n".join(lines)


async def cmd_stats(command: Command, message: Message, conn: Connection, app: App) -> None:
    now = time.time()
    today = _day(app, now)
    week = [_day(app, now - 86400 * i) for i in range(7)]
    stats = await app.db.chat_stats(conn.user_id, message.chat.id, today, week)
    if stats is None or stats.total == 0:
        await app.flash(conn, message, texts.STATS_EMPTY)
        return
    chat = message.chat
    peer_name = " ".join(p for p in (chat.first_name, chat.last_name) if p) or "собеседник"
    await app.respond(conn, message, render_stats(stats, peer_name, app.config.tz))


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
    "save": cmd_save,
    "help": cmd_help,
    "mock": cmd_mock,
    "weather": cmd_weather,
    "music": cmd_music,
    "stats": cmd_stats,
    "currency": cmd_currency,
    "time": cmd_time,
    **{name: cmd_animation for name in ANIMATION_NAMES},
}


def make_router() -> Router:
    router = Router(name="business")
    router.business_message()(on_business_message)
    router.deleted_business_messages()(on_deleted_business_messages)
    router.callback_query(F.data.startswith("unmute:"))(on_unmute_button)
    return router
