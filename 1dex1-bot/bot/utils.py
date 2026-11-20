"""Мелкие помощники: разбор команд, времени, форматирование."""

from __future__ import annotations

import base64
import binascii
import html
import re
from dataclasses import dataclass

from aiogram.types import Message, User

# ---------------------------------------------------------------- команды

# Точка-команды, которые пишет владелец прямо в переписке.
# Ключ — каноническое имя, значения — все допустимые написания.
COMMAND_ALIASES: dict[str, tuple[str, ...]] = {
    "mute": ("mute", "мут", "замутить"),
    "unmute": ("unmute", "размут", "размутить", "анмут"),
    "spam": ("spam", "спам"),
    "unmuteme": ("unmuteme", "antimute", "антимут", "размутьменя"),
    "link": ("link", "линк", "ссылка", "dl", "скачать"),
    "love": ("love", "лав", "люблю"),
    "rose": ("rose", "roses", "роза", "розы"),
    "fire": ("fire", "огонь", "фаер"),
    "heart": ("heart", "сердце", "сердечко"),
    "type": ("type", "тайп", "печать"),
    "glitch": ("glitch", "глитч"),
    "loading": ("loading", "load", "загрузка"),
    "mock": ("mock", "мок"),
    "weather": ("weather", "погода"),
    "music": ("music", "song", "музыка", "трек", "песня"),
    "stats": ("stats", "stat", "стата", "статистика"),
    "save": ("save", "сохранить", "сейв"),
    "stop": ("stop", "стоп"),
    "help": ("help", "помощь", "команды"),
}

_ALIAS_TO_NAME = {alias: name for name, aliases in COMMAND_ALIASES.items() for alias in aliases}

_COMMAND_RE = re.compile(r"^\.([A-Za-zА-Яа-яЁё]+)(?:[ \t\n]+(.*))?$", re.DOTALL)


@dataclass(frozen=True)
class Command:
    name: str
    args: str  # всё после имени команды, без внешних пробелов (может быть "")


def parse_command(text: str | None) -> Command | None:
    """'.spam 5 привет' -> Command('spam', '5 привет'). Неизвестные команды -> None."""
    if not text:
        return None
    match = _COMMAND_RE.match(text.strip())
    if not match:
        return None
    name = _ALIAS_TO_NAME.get(match.group(1).lower())
    if name is None:
        return None
    return Command(name=name, args=(match.group(2) or "").strip())


# ---------------------------------------------------------------- время

_UNITS: dict[str, int] = {}
for _seconds, _names in (
    (1, ("s", "sec", "secs", "second", "seconds", "с", "сек", "секунд", "секунда", "секунды",
         "секунду")),
    (60, ("m", "min", "mins", "minute", "minutes", "м", "мин", "минут", "минута", "минуты",
          "минуту", "минутка", "минутку")),
    (3600, ("h", "hr", "hrs", "hour", "hours", "ч", "час", "часа", "часов", "часик")),
    (86400, ("d", "day", "days", "д", "дн", "день", "дня", "дней", "сутки", "суток")),
    (604800, ("w", "week", "weeks", "н", "нед", "неделя", "недели", "недель", "неделю")),
):
    for _n in _names:
        _UNITS[_n] = _seconds

_DURATION_PART_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*([A-Za-zА-Яа-яЁё]*)")

FOREVER_WORDS = {"", "forever", "навсегда", "inf", "∞", "бессрочно"}

MAX_MUTE_SECONDS = 366 * 86400


class DurationError(ValueError):
    pass


def parse_duration(raw: str) -> int | None:
    """Разбирает '10m', '1h30m', '2 часа', '45' (минуты). None = навсегда.

    Бросает DurationError, если строку не удалось понять.
    """
    text = raw.strip().lower()
    if text in FOREVER_WORDS:
        return None
    pos = 0
    total = 0.0
    found = False
    while pos < len(text):
        if text[pos].isspace():
            pos += 1
            continue
        match = _DURATION_PART_RE.match(text, pos)
        if not match or match.end() == pos:
            raise DurationError(raw)
        number = float(match.group(1).replace(",", "."))
        unit = match.group(2)
        pos_after = match.end()
        if pos_after < len(text) and text[pos_after] == ".":  # «10 мин.»
            pos_after += 1
        if unit == "":
            multiplier = 60  # просто число = минуты
        elif unit in _UNITS:
            multiplier = _UNITS[unit]
        else:
            raise DurationError(raw)
        total += number * multiplier
        found = True
        pos = pos_after
    if not found or total < 1:
        raise DurationError(raw)
    return int(min(total, MAX_MUTE_SECONDS))


def _plural(n: int, one: str, few: str, many: str) -> str:
    n_abs = abs(n) % 100
    if 11 <= n_abs <= 14:
        return many
    last = n_abs % 10
    if last == 1:
        return one
    if 2 <= last <= 4:
        return few
    return many


def human_duration(seconds: int | None, accusative: bool = False) -> str:
    """3700 -> '1 час 1 минута' (или '1 час 1 минуту' для «на …»); None -> 'навсегда'."""
    if seconds is None:
        return "навсегда"
    seconds = int(seconds)
    parts: list[str] = []
    for size, forms in (
        (86400, ("день", "дня", "дней")),
        (3600, ("час", "часа", "часов")),
        (60, ("минуту" if accusative else "минута", "минуты", "минут")),
        (1, ("секунду" if accusative else "секунда", "секунды", "секунд")),
    ):
        value, seconds = divmod(seconds, size)
        if value:
            parts.append(f"{value} {_plural(value, *forms)}")
        if len(parts) == 2:
            break
    return " ".join(parts) or "0 секунд"


# ---------------------------------------------------------------- текст

def esc(text: object) -> str:
    return html.escape(str(text), quote=False)


def cut(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1] + "…"


def user_full_name(user: User | None) -> str:
    if user is None:
        return "Неизвестный"
    name = " ".join(p for p in (user.first_name, user.last_name) if p).strip()
    return name or "Без имени"


def user_mention_html(user: User | None) -> str:
    if user is None:
        return "Неизвестный"
    return f'<a href="tg://user?id={user.id}">{esc(user_full_name(user))}</a>'


def username_html(user: User | None) -> str:
    if user is None or not user.username:
        return "нет"
    return "@" + esc(user.username)


def message_text(message: Message) -> str:
    return message.text or message.caption or ""


def media_kind(message: Message) -> tuple[str, str] | None:
    """Возвращает (тип, file_id) для медиа в сообщении или None."""
    if message.live_photo:
        return "live_photo", message.live_photo.file_id
    if message.photo:
        return "photo", message.photo[-1].file_id
    if message.video:
        return "video", message.video.file_id
    if message.video_note:
        return "video_note", message.video_note.file_id
    if message.voice:
        return "voice", message.voice.file_id
    if message.animation:
        return "animation", message.animation.file_id
    if message.audio:
        return "audio", message.audio.file_id
    if message.document:
        return "document", message.document.file_id
    if message.sticker:
        return "sticker", message.sticker.file_id
    return None


MEDIA_NAMES = {
    "live_photo": "живое фото",
    "photo": "фото",
    "video": "видео",
    "video_note": "кружок",
    "voice": "голосовое",
    "animation": "гифка",
    "audio": "аудио",
    "document": "файл",
    "sticker": "стикер",
}


# ---------------------------------------------------------------- одноразовые медиа

# Типы файлов TDLib для самоуничтожающихся медиа (view once / таймер):
# 22 SelfDestructingPhoto, 23 SelfDestructingVideo, 24 SelfDestructingVideoNote,
# 25 SelfDestructingVoiceNote, 27 SelfDestructingLivePhoto.
SELF_DESTRUCT_FILE_TYPES = frozenset({22, 23, 24, 25, 27})
_FILE_FLAGS = (1 << 24) | (1 << 25)  # web location / file reference


def file_id_type(file_id: str) -> int | None:
    """Достаёт внутренний тип файла TDLib из Bot API file_id.

    file_id = base64url(zero_encode(int32 type|flags + ...)). Нам нужны только первые 4 байта.
    """
    head = file_id[:8]  # 8 символов base64 = 6 байт, этого хватает на int32 даже после zero_decode
    if len(head) < 8:
        return None
    try:
        raw = base64.urlsafe_b64decode(head)
    except (binascii.Error, ValueError):
        return None
    out = bytearray()
    i = 0
    while i < len(raw) and len(out) < 4:
        byte = raw[i]
        if byte == 0 and i + 1 < len(raw):
            out.extend(b"\x00" * raw[i + 1])
            i += 2
        else:
            out.append(byte)
            i += 1
    if len(out) < 4:
        return None
    return int.from_bytes(out[:4], "little") & ~_FILE_FLAGS


def is_self_destructing(file_id: str) -> bool | None:
    """True — одноразовое, False — обычное, None — не удалось понять."""
    kind = file_id_type(file_id)
    if kind is None or kind > 64:
        return None
    return kind in SELF_DESTRUCT_FILE_TYPES
