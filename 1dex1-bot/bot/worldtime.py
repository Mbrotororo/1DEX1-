"""Время в городе для команды .time (.время).

Город ищем геокодером Open-Meteo (тот же, что у .weather): он отдаёт часовой пояс IANA
(«Asia/Tokyo»), время считаем через zoneinfo. Если базы часовых поясов нет (на Android/Termux
бывает без системного tzdata — тогда нужен pip-пакет tzdata), берём смещение из прогноза
Open-Meteo (utc_offset_seconds). Если геокодер не отвечает, крупные города знаем сами.
Все сетевые запросы идут через _get_json — в тестах подменяем только его.
"""

from __future__ import annotations

import html
import logging
import re
from datetime import date, datetime, timedelta, timezone, tzinfo
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .weather import (
    _CITY_ALIASES,
    _FAILURES,
    FORECAST_URL,
    GEOCODING_URL,
    MAX_CITY_LEN,
    _cut,
    _get_json,
    _join_place,
    _num,
    _ServiceError,
)

log = logging.getLogger(__name__)

_MAX_PLACE_LEN = 80

MSG_EMPTY = "Напиши город: .time Токио"
MSG_TOO_LONG = f"Слишком длинное название города (до {MAX_CITY_LEN} символов)."
MSG_UNAVAILABLE = "Сервис времени не отвечает, попробуй позже."

WEEKDAYS = ("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
MONTHS = ("января", "февраля", "марта", "апреля", "мая", "июня",
          "июля", "августа", "сентября", "октября", "ноября", "декабря")
_DAY_SHIFT = {1: "завтра", -1: "вчера", 2: "послезавтра", -2: "позавчера"}

# Запасной справочник на случай, когда геокодер не отвечает.
_KNOWN: dict[str, tuple[str, str]] = {
    "москва": ("Москва, Россия", "Europe/Moscow"),
    "санкт-петербург": ("Санкт-Петербург, Россия", "Europe/Moscow"),
    "калининград": ("Калининград, Россия", "Europe/Kaliningrad"),
    "казань": ("Казань, Россия", "Europe/Moscow"),
    "нижний новгород": ("Нижний Новгород, Россия", "Europe/Moscow"),
    "ростов-на-дону": ("Ростов-на-Дону, Россия", "Europe/Moscow"),
    "краснодар": ("Краснодар, Россия", "Europe/Moscow"),
    "сочи": ("Сочи, Россия", "Europe/Moscow"),
    "воронеж": ("Воронеж, Россия", "Europe/Moscow"),
    "самара": ("Самара, Россия", "Europe/Samara"),
    "волгоград": ("Волгоград, Россия", "Europe/Volgograd"),
    "уфа": ("Уфа, Россия", "Asia/Yekaterinburg"),
    "пермь": ("Пермь, Россия", "Asia/Yekaterinburg"),
    "екатеринбург": ("Екатеринбург, Россия", "Asia/Yekaterinburg"),
    "челябинск": ("Челябинск, Россия", "Asia/Yekaterinburg"),
    "тюмень": ("Тюмень, Россия", "Asia/Yekaterinburg"),
    "омск": ("Омск, Россия", "Asia/Omsk"),
    "новосибирск": ("Новосибирск, Россия", "Asia/Novosibirsk"),
    "красноярск": ("Красноярск, Россия", "Asia/Krasnoyarsk"),
    "иркутск": ("Иркутск, Россия", "Asia/Irkutsk"),
    "якутск": ("Якутск, Россия", "Asia/Yakutsk"),
    "хабаровск": ("Хабаровск, Россия", "Asia/Vladivostok"),
    "владивосток": ("Владивосток, Россия", "Asia/Vladivostok"),
    "магадан": ("Магадан, Россия", "Asia/Magadan"),
    "петропавловск-камчатский": ("Петропавловск-Камчатский, Россия", "Asia/Kamchatka"),
    "минск": ("Минск, Беларусь", "Europe/Minsk"),
    "киев": ("Киев, Украина", "Europe/Kyiv"),
    "алматы": ("Алматы, Казахстан", "Asia/Almaty"),
    "астана": ("Астана, Казахстан", "Asia/Almaty"),
    "ташкент": ("Ташкент, Узбекистан", "Asia/Tashkent"),
    "бишкек": ("Бишкек, Киргизия", "Asia/Bishkek"),
    "душанбе": ("Душанбе, Таджикистан", "Asia/Dushanbe"),
    "баку": ("Баку, Азербайджан", "Asia/Baku"),
    "ереван": ("Ереван, Армения", "Asia/Yerevan"),
    "тбилиси": ("Тбилиси, Грузия", "Asia/Tbilisi"),
    "стамбул": ("Стамбул, Турция", "Europe/Istanbul"),
    "анталья": ("Анталья, Турция", "Europe/Istanbul"),
    "дубай": ("Дубай, ОАЭ", "Asia/Dubai"),
    "лондон": ("Лондон, Великобритания", "Europe/London"),
    "париж": ("Париж, Франция", "Europe/Paris"),
    "берлин": ("Берлин, Германия", "Europe/Berlin"),
    "рим": ("Рим, Италия", "Europe/Rome"),
    "мадрид": ("Мадрид, Испания", "Europe/Madrid"),
    "прага": ("Прага, Чехия", "Europe/Prague"),
    "варшава": ("Варшава, Польша", "Europe/Warsaw"),
    "хельсинки": ("Хельсинки, Финляндия", "Europe/Helsinki"),
    "токио": ("Токио, Япония", "Asia/Tokyo"),
    "сеул": ("Сеул, Южная Корея", "Asia/Seoul"),
    "пекин": ("Пекин, Китай", "Asia/Shanghai"),
    "шанхай": ("Шанхай, Китай", "Asia/Shanghai"),
    "гонконг": ("Гонконг", "Asia/Hong_Kong"),
    "бангкок": ("Бангкок, Таиланд", "Asia/Bangkok"),
    "пхукет": ("Пхукет, Таиланд", "Asia/Bangkok"),
    "сингапур": ("Сингапур", "Asia/Singapore"),
    "дели": ("Дели, Индия", "Asia/Kolkata"),
    "нью-дели": ("Нью-Дели, Индия", "Asia/Kolkata"),
    "гоа": ("Гоа, Индия", "Asia/Kolkata"),
    "катманду": ("Катманду, Непал", "Asia/Kathmandu"),
    "бали": ("Бали, Индонезия", "Asia/Makassar"),
    "сидней": ("Сидней, Австралия", "Australia/Sydney"),
    "нью-йорк": ("Нью-Йорк, США", "America/New_York"),
    "нью йорк": ("Нью-Йорк, США", "America/New_York"),
    "вашингтон": ("Вашингтон, США", "America/New_York"),
    "майами": ("Майами, США", "America/New_York"),
    "чикаго": ("Чикаго, США", "America/Chicago"),
    "лос-анджелес": ("Лос-Анджелес, США", "America/Los_Angeles"),
    "сан-франциско": ("Сан-Франциско, США", "America/Los_Angeles"),
    "торонто": ("Торонто, Канада", "America/Toronto"),
    "мехико": ("Мехико, Мексика", "America/Mexico_City"),
    "буэнос-айрес": ("Буэнос-Айрес, Аргентина", "America/Argentina/Buenos_Aires"),
    "рио-де-жанейро": ("Рио-де-Жанейро, Бразилия", "America/Sao_Paulo"),
    "каир": ("Каир, Египет", "Africa/Cairo"),
}

_UTC_INPUT = re.compile(r"(?:utc|gmt|утс|гмт)\s*(?:([+\-−])\s*(\d{1,2})(?:[:.]?(\d{2}))?)?")
_IANA_INPUT = re.compile(r"[A-Za-z_]+(?:/[A-Za-z0-9_+\-]+){1,2}")


class WorldTimeError(Exception):
    """Ошибка с понятным для пользователя текстом (уже безопасен для parse_mode=HTML)."""


# ---------------------------------------------------------------- часовые пояса

def _zone(name: Any) -> tzinfo | None:
    """IANA-имя -> tzinfo. Нет базы поясов или кривое имя -> None."""
    if not isinstance(name, str) or not name:
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError) as e:
        log.info("zoneinfo не знает %r: %s", name, e)
        return None


async def _forecast_offset(latitude: float, longitude: float, timeout: float) -> tzinfo:
    """Смещение от UTC из прогноза Open-Meteo (timezone=auto) — когда zoneinfo не помог."""
    data = await _get_json(FORECAST_URL, {
        "latitude": f"{latitude:.4f}",
        "longitude": f"{longitude:.4f}",
        "timezone": "auto",
        "forecast_days": 1,
        "current": "temperature_2m",
    }, timeout)
    if not isinstance(data, dict) or data.get("error"):
        raise _ServiceError(f"open-meteo: {data!r:.200}")
    seconds = _num(data.get("utc_offset_seconds"))
    if seconds is None or abs(seconds) > 18 * 3600:
        raise _ServiceError(f"open-meteo: нет utc_offset_seconds {data!r:.200}")
    abbreviation = data.get("timezone_abbreviation")
    offset = timedelta(seconds=round(seconds))
    if isinstance(abbreviation, str) and abbreviation.isalpha():
        return timezone(offset, abbreviation)
    return timezone(offset)


def _fixed_offset(text: str) -> tuple[str, tzinfo] | None:
    """«UTC+5», «gmt-3:30», «utc» -> (подпись, пояс)."""
    match = _UTC_INPUT.fullmatch(text.lower())
    if not match:
        return None
    sign, hours, minutes = match.groups()
    total = int(hours or 0) * 60 + int(minutes or 0)
    if total > 14 * 60 or int(minutes or 0) >= 60:
        return None
    if sign in ("-", "−"):
        total = -total
    return _fmt_offset(total), timezone(timedelta(minutes=total))


# ---------------------------------------------------------------- геокодер

def _pick_result(data: Any, qualifier: str) -> dict[str, Any] | None:
    """Ответ геокодера -> лучший результат (как в .weather: «Одесса, США»). None = не найден."""
    if not isinstance(data, dict) or data.get("error"):
        raise _ServiceError(f"geocoding: {data!r:.200}")
    results = [r for r in data.get("results") or [] if isinstance(r, dict)]
    if not results:
        return None
    best = results[0]
    if qualifier:
        q = qualifier.lower()
        for r in results:
            fields = (r.get("country"), r.get("country_code"), r.get("admin1"), r.get("admin2"))
            if any(isinstance(f, str) and q in f.lower() for f in fields):
                best = r
                break
    if (not isinstance(best.get("name"), str) or _num(best.get("latitude")) is None
            or _num(best.get("longitude")) is None):
        raise _ServiceError(f"geocoding: bad result {best!r:.200}")
    return best


# ---------------------------------------------------------------- карточка

def _fmt_offset(minutes: int) -> str:
    """540 -> «UTC+9», 330 -> «UTC+5:30», -180 -> «UTC−3»."""
    sign = "+" if minutes >= 0 else "−"
    hours, rest = divmod(abs(minutes), 60)
    return f"UTC{sign}{hours}" + (f":{rest:02d}" if rest else "")


def _fmt_span(minutes: int) -> str:
    hours, rest = divmod(abs(minutes), 60)
    parts = ([f"{hours} ч"] if hours else []) + ([f"{rest} мин"] if rest else [])
    return " ".join(parts)


def _relative(diff_minutes: int) -> str:
    if diff_minutes == 0:
        return "как у тебя"
    side = "впереди" if diff_minutes > 0 else "позади"
    return f"на {_fmt_span(diff_minutes)} {side} тебя"


def _abbreviation(local: datetime) -> str:
    """«JST», «MSK», «CET»; цифровые «+05» и «UTC» не показываем."""
    name = local.tzname() or ""
    if name.isalpha() and name.isupper() and 3 <= len(name) <= 5 and name not in ("UTC", "GMT"):
        return f" ({name})"
    return ""


def _render(place: str, local: datetime, owner_minutes: int, owner_date: date) -> str:
    offset = local.utcoffset() or timedelta(0)
    offset_minutes = round(offset.total_seconds() / 60)
    day = f"{WEEKDAYS[local.weekday()]}, {local.day} {MONTHS[local.month - 1]}"
    if local.year != owner_date.year:
        day += f" {local.year}"
    shift = _DAY_SHIFT.get((local.date() - owner_date).days)
    if shift:
        day += f" ({shift})"
    emoji = "☀️" if 6 <= local.hour < 22 else "🌙"
    return "\n".join([
        f"🕐 <b>{html.escape(_cut(place, _MAX_PLACE_LEN))}</b>",
        f"{emoji} <b>{local:%H:%M}</b> · {day}",
        f"{_fmt_offset(offset_minutes)}{_abbreviation(local)} · {_relative(offset_minutes - owner_minutes)}",
    ])


def _not_found(city: str) -> WorldTimeError:
    return WorldTimeError(f"Не нашёл город «{html.escape(_cut(city, 40))}»")


# ---------------------------------------------------------------- команда

async def city_time(city: str, *, owner_offset_hours: float = 3.0, now: datetime | None = None,
                    timeout: float = 15.0) -> str:
    """Местное время в городе -> карточка в Telegram-HTML (до ~300 символов).

    owner_offset_hours — пояс владельца (TZ_OFFSET), от него «на 6 ч впереди тебя» и «завтра».
    now — текущий момент (для тестов; naive считается UTC). timeout — на каждый запрос.
    Понимает «Токио», «Одесса, США», «мск», «UTC+5», «Europe/Berlin». Ошибки — WorldTimeError.
    """
    city = " ".join((city or "").split())
    if not city:
        raise WorldTimeError(MSG_EMPTY)
    if len(city) > MAX_CITY_LEN:
        raise WorldTimeError(MSG_TOO_LONG)

    if now is None:
        now_utc = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now_utc = now.replace(tzinfo=timezone.utc)
    else:
        now_utc = now.astimezone(timezone.utc)
    owner_minutes = round(owner_offset_hours * 60)
    owner_date = (now_utc + timedelta(minutes=owner_minutes)).date()

    def render(place: str, tz: tzinfo) -> str:
        return _render(place, now_utc.astimezone(tz), owner_minutes, owner_date)

    # «UTC+5» и «Europe/Berlin» — без сети.
    fixed = _fixed_offset(city)
    if fixed is not None:
        return render(*fixed)
    if _IANA_INPUT.fullmatch(city) and (tz := _zone(city)) is not None:
        return render(city, tz)

    name, _, qualifier = city.partition(",")
    name, qualifier = name.strip(), qualifier.strip()
    if not name:
        raise WorldTimeError(MSG_EMPTY)
    name = _CITY_ALIASES.get(name.lower(), name)

    try:
        geo = await _get_json(GEOCODING_URL, {
            "name": name, "count": 10 if qualifier else 1, "language": "ru", "format": "json",
        }, timeout)
        result = _pick_result(geo, qualifier)
    except _FAILURES as e:
        known = _KNOWN.get(name.lower().replace("ё", "е"))
        tz = _zone(known[1]) if known else None
        if known and tz is not None:
            log.info("Геокодер Open-Meteo недоступен (%s), %r из справочника", e, name)
            return render(known[0], tz)
        log.warning("Геокодер Open-Meteo недоступен для %r: %s", city, e)
        raise WorldTimeError(MSG_UNAVAILABLE) from e
    if result is None:
        raise _not_found(city)

    country = result.get("country") if isinstance(result.get("country"), str) else ""
    place = _join_place(result["name"], country)
    tz = _zone(result.get("timezone"))
    if tz is None:
        try:
            tz = await _forecast_offset(_num(result["latitude"]) or 0.0, _num(result["longitude"]) or 0.0,
                                        timeout)
        except _FAILURES as e:
            log.warning("Не узнал часовой пояс %r: %s", place, e)
            raise WorldTimeError(MSG_UNAVAILABLE) from e
    return render(place, tz)
