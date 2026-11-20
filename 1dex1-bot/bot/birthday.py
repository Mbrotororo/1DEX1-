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

SUMMARY_HOUR = 23  # во сколько (по времени владельца) прислать итоги дня

# «с днём рождения», «с др», «с днюхой», «с днём варенья», «happy birthday», «hbd»…
CONGRATS_RE = re.compile(
    r"(с\s*дн[её]м\s*(рождени|варень)|\bс\s*др\b|\bсдр\b|\bс\s*днюх|\bс\s*днюшк|\bднюх|"
    r"happy\s*birth|\bhbd\b|\bс\s*праздником\b|\bпоздравляю\b|\bпоздравля[ею]м\b)",
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


async def track_congrats(app: App, conn: Connection, message: Message) -> None:
    """Вызывается на каждое входящее сообщение: в др запоминаем, кто поздравил."""
    when = local_now(app, message.date.timestamp() if message.date else None)
    if not is_birthday(app, when):
        return
    text = message_text(message)
    if not is_congrats(text):
        return
    sender = message.from_user
    await app.db.add_bday_wish(conn.user_id, when.year, message.chat.id,
                               user_full_name(sender), cut(text, 300), when.timestamp())


async def play_greeting(app: App, chat_id: int, name: str) -> None:
    """Анимированное поздравление в личке с ботом (там нет ограничений бизнес-чатов)."""
    frames = birthday_frames(name)
    try:
        sent = await retry_flood(lambda: app.bot.send_message(chat_id=chat_id, text=frames[0],
                                                              parse_mode=None))
    except TelegramAPIError as e:
        log.warning("birthday greeting failed: %s", e)
        return
    for frame in frames[1:]:
        await asyncio.sleep(app.config.love_frame_delay)
        try:
            await retry_flood(lambda f=frame: app.bot.edit_message_text(
                text=f, chat_id=chat_id, message_id=sent.message_id, parse_mode=None))
        except TelegramAPIError as e:
            if "not modified" not in str(e).lower():
                log.info("birthday frame failed: %s", e)
                return


def render_summary(name: str, wishes: list[tuple[int, str, str | None]]) -> str:
    n = len(wishes)
    lines = [
        f"🎉 <b>Итоги дня рождения, {esc(name)}!</b>",
        f"Тебя поздравили <b>{n}</b> {_plural(n, 'человек', 'человека', 'человек')}:",
        "",
    ]
    for i, (chat_id, who, text) in enumerate(wishes[:40], 1):
        line = f'{i}. <a href="tg://user?id={chat_id}">{esc(who)}</a>'
        if text:
            line += f" — «{esc(cut(text, 80))}»"
        lines.append(line)
    if n > 40:
        lines.append(f"…и ещё {n - 40}")
    lines += ["", "🎂 С днём рождения ещё раз! 💎"]
    return "\n".join(lines)


async def birthday_tick(app: App, now: float | None = None) -> None:
    """Раз в минуту из фоновой задачи: поздравить в полночь и прислать итоги вечером."""
    when = local_now(app, now)
    if not is_birthday(app, when):
        return
    owners: dict[int, Connection] = {}
    for conn in app.db.connections.values():
        if conn.is_enabled and app.config.is_allowed(conn.user_id):
            owners.setdefault(conn.user_id, conn)
    for owner_id, conn in owners.items():
        greet_key = f"bday_greet:{owner_id}:{when.year}"
        if await app.db.kv_get(greet_key) is None:
            await app.db.kv_set(greet_key, "1")  # сначала флаг — чтобы не поздравить дважды
            app.spawn(play_greeting(app, conn.user_chat_id, app.config.owner_name))
        summary_key = f"bday_summary:{owner_id}:{when.year}"
        if when.hour >= SUMMARY_HOUR and await app.db.kv_get(summary_key) is None:
            wishes = await app.db.bday_wishes(owner_id, when.year)
            await app.db.kv_set(summary_key, "1")
            if wishes:
                await app.notify(conn, render_summary(app.config.owner_name, wishes))
