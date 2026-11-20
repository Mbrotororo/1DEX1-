"""День рождения владельца: поздравление в полночь и итоги дня — кто поздравил.

Никаких команд: дата берётся из настройки BIRTHDAY (по умолчанию 27.01 — др 1DEX1).
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import re
import time

from aiogram.exceptions import TelegramAPIError
from aiogram.types import Message

from .animations import birthday_frames
from .core import App, retry_flood
from .db import Connection
from .utils import _plural, cut, esc, message_text, user_full_name

log = logging.getLogger(__name__)

# Итоги присылаем на следующий день (в первые минуты после полуночи), чтобы учесть
# и тех, кто поздравил поздно вечером.
SUMMARY_MAX_CHARS = 3500  # с запасом до лимита Telegram 4096

# «с днём рождения/рожденья», «с др», «с д.р.», «с днюхой», «с днюшечкой», «с днём варенья»,
# «happy birthday», «happy bday», «hbd», «поздравляю»…
CONGRATS_RE = re.compile(
    r"(с\s*дн[её]м\s*(рожден[иь]|варень)|\bс\s*д\.?\s*р\b\.?|\bсдр\b|\bс\s*днюх|\bс\s*днюш|"
    r"happy\s*b(irth)?-?day|\bb-?day\b|\bhbd\b|\bс\s*праздником\b|\bпоздравляю\b|"
    r"\bпоздравля[ею]м\b)",
    re.IGNORECASE,
)


def is_congrats(text: str) -> bool:
    return bool(text) and CONGRATS_RE.search(text) is not None


def local_now(app: App, now: float | None = None) -> dt.datetime:
    return dt.datetime.fromtimestamp(now if now is not None else time.time(), app.config.tz)


def is_birthday(app: App, when: dt.datetime) -> bool:
    bday = app.config.birthday
    if bday is None:
        return False
    day, month = bday
    if (day, month) == (29, 2) and not _is_leap(when.year):
        day, month = 28, 2  # в невисокосный год празднуем 28 февраля
    return (when.day, when.month) == (day, month)


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def is_birthday_owner(app: App, user_id: int) -> bool:
    """День рождения из настроек — только для владельца бота (его ID в ALLOWED_USER_IDS).
    Если список пустой, ботом может пользоваться кто угодно — тогда поздравлять некого."""
    return bool(app.config.allowed_user_ids) and user_id in app.config.allowed_user_ids


async def track_congrats(app: App, conn: Connection, message: Message) -> None:
    """Вызывается на каждое входящее сообщение: в др запоминаем, кто поздравил."""
    if not is_birthday_owner(app, conn.user_id):
        return
    when = local_now(app, message.date.timestamp() if message.date else None)
    if not is_birthday(app, when):
        return
    text = message_text(message)
    if not is_congrats(text):
        return
    sender = message.from_user
    await app.db.add_bday_wish(conn.user_id, when.year, message.chat.id,
                               user_full_name(sender), cut(text, 300), when.timestamp())


async def play_greeting(app: App, chat_id: int, name: str) -> bool:
    """Анимированное поздравление в личке с ботом (там нет ограничений бизнес-чатов).
    True — первый кадр доставлен."""
    frames = birthday_frames(name)
    try:
        sent = await retry_flood(lambda: app.bot.send_message(chat_id=chat_id, text=frames[0],
                                                              parse_mode=None))
    except TelegramAPIError as e:
        log.warning("birthday greeting failed: %s", e)
        return False
    app.spawn(_play_rest(app, chat_id, sent.message_id, frames[1:]))
    return True


async def _play_rest(app: App, chat_id: int, message_id: int, frames: list[str]) -> None:
    for frame in frames:
        await asyncio.sleep(app.config.love_frame_delay)
        try:
            await retry_flood(lambda f=frame: app.bot.edit_message_text(
                text=f, chat_id=chat_id, message_id=message_id, parse_mode=None))
        except TelegramAPIError as e:
            if "not modified" not in str(e).lower():
                log.info("birthday frame failed: %s", e)
                return


def render_summary(name: str, wishes: list[tuple[int, str, str | None]]) -> list[str]:
    """Итоги дня рождения — список сообщений, каждое заведомо меньше лимита Telegram."""
    n = len(wishes)
    head = (f"🎉 <b>Итоги дня рождения, {esc(name)}!</b>\n"
            f"Тебя поздравили <b>{n}</b> {_plural(n, 'человек', 'человека', 'человек')}:\n")
    tail = "\n🎂 С днём рождения ещё раз! 💎"
    chunks: list[str] = []
    current = head
    for i, (chat_id, who, text) in enumerate(wishes, 1):
        line = f'\n{i}. <a href="tg://user?id={chat_id}">{esc(cut(who, 60))}</a>'
        if text:
            line += f" — «{esc(cut(text, 80))}»"
        if len(current) + len(line) > SUMMARY_MAX_CHARS:
            chunks.append(current)
            current = "🎉 <b>Итоги дня рождения (продолжение)</b>\n"
        current += line
    chunks.append(current + "\n" + tail)
    return chunks


def _owners(app: App) -> dict[int, Connection]:
    owners: dict[int, Connection] = {}
    for conn in app.db.connections.values():
        if conn.is_enabled and is_birthday_owner(app, conn.user_id):
            owners.setdefault(conn.user_id, conn)
    return owners


async def birthday_tick(app: App, now: float | None = None) -> None:
    """Раз в полминуты из фоновой задачи: поздравить в полночь, итоги — на следующий день."""
    when = local_now(app, now)
    yesterday = when - dt.timedelta(days=1)
    today_bday, yesterday_bday = is_birthday(app, when), is_birthday(app, yesterday)
    if not (today_bday or yesterday_bday):
        return
    in_progress: set[str] = getattr(app, "_bday_in_progress", set())
    app._bday_in_progress = in_progress  # type: ignore[attr-defined]
    for owner_id, conn in _owners(app).items():
        if today_bday:
            greet_key = f"bday_greet:{owner_id}:{when.year}"
            if greet_key not in in_progress and await app.db.kv_get(greet_key) is None:
                in_progress.add(greet_key)
                try:
                    if await play_greeting(app, conn.user_chat_id, app.config.owner_name):
                        await app.db.kv_set(greet_key, "1")  # флаг — только после доставки
                finally:
                    in_progress.discard(greet_key)
        if yesterday_bday:
            summary_key = f"bday_summary:{owner_id}:{yesterday.year}"
            if summary_key in in_progress or await app.db.kv_get(summary_key) is not None:
                continue
            wishes = await app.db.bday_wishes(owner_id, yesterday.year)
            if not wishes:
                await app.db.kv_set(summary_key, "0")
                continue
            in_progress.add(summary_key)
            try:
                sent_all = True
                for chunk in render_summary(app.config.owner_name, wishes):
                    if await app.notify(conn, chunk) is None:
                        sent_all = False
                        break
                if sent_all:
                    await app.db.kv_set(summary_key, "1")
            finally:
                in_progress.discard(summary_key)
