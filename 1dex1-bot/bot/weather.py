"""Погода для команды .weather: Open-Meteo (без ключа), запасной вариант — wttr.in.

Open-Meteo с общих IP (VPS, мобильный NAT) иногда отвечает
{"error": true, "reason": "Hourly API request limit exceeded"}, поэтому при любой
ошибке прогноза бот идёт в wttr.in. Все сетевые запросы проходят через одну корутину
_get_json — в тестах подменяем только её.
"""

from __future__ import annotations

import asyncio
import html
import json
import logging
import math
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import aiohttp

log = logging.getLogger(__name__)

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
WTTR_URL = "https://wttr.in/"

MAX_CITY_LEN = 100
_MAX_PLACE_LEN = 80   # название места в карточке
_MAX_DESC_LEN = 60    # описание погоды из wttr.in

MSG_EMPTY = "Напиши город: .weather Москва"
MSG_TOO_LONG = f"Слишком длинное название города (до {MAX_CITY_LEN} символов)."
MSG_UNAVAILABLE = "Погодный сервис не отвечает, попробуй позже."

# Разговорные названия, которые геокодер Open-Meteo не знает.
_CITY_ALIASES: dict[str, str] = {
    "спб": "Санкт-Петербург",
    "питер": "Санкт-Петербург",
    "мск": "Москва",
    "екб": "Екатеринбург",
    "нск": "Новосибирск",
    "ростов": "Ростов-на-Дону",
}


class WeatherError(Exception):
    """Ошибка с понятным для пользователя текстом (уже безопасен для parse_mode=HTML)."""


class _ServiceError(Exception):
    """Сервис ответил ошибкой или непонятными данными — пробуем запасной."""


class _HTTPError(_ServiceError):
    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"HTTP {status}: {body[:200]}")
        self.status = status
        self.body = body


# Что считаем «сервис не справился» (сеть, таймаут, плохой ответ).
_FAILURES = (_ServiceError, aiohttp.ClientError, asyncio.TimeoutError)


# ---------------------------------------------------------------- коды погоды

# WMO weather_code (Open-Meteo) -> (эмодзи, описание).
_WMO: dict[int, tuple[str, str]] = {
    0: ("☀️", "Ясно"),
    1: ("🌤", "Преимущественно ясно"),
    2: ("⛅", "Переменная облачность"),
    3: ("☁️", "Пасмурно"),
    45: ("🌫", "Туман"),
    48: ("🌫", "Туман с изморозью"),
    51: ("🌦", "Лёгкая морось"),
    53: ("🌦", "Морось"),
    55: ("🌧", "Сильная морось"),
    56: ("🌧", "Ледяная морось"),
    57: ("🌧", "Сильная ледяная морось"),
    61: ("🌦", "Небольшой дождь"),
    63: ("🌧", "Дождь"),
    65: ("🌧", "Сильный дождь"),
    66: ("🌧", "Ледяной дождь"),
    67: ("🌧", "Сильный ледяной дождь"),
    71: ("🌨", "Небольшой снег"),
    73: ("🌨", "Снег"),
    75: ("❄️", "Сильный снег"),
    77: ("🌨", "Снежная крупа"),
    80: ("🌦", "Небольшой ливень"),
    81: ("🌧", "Ливень"),
    82: ("🌧", "Сильный ливень"),
    85: ("🌨", "Небольшой снегопад"),
    86: ("❄️", "Сильный снегопад"),
    95: ("⛈", "Гроза"),
    96: ("⛈", "Гроза с градом"),
    99: ("⛈", "Сильная гроза с градом"),
}
_UNKNOWN_WEATHER = ("❔", "Нет описания")

# Ночью солнце в эмодзи заменяем.
_NIGHT_EMOJI: dict[str, str] = {"☀️": "🌙", "🌤": "🌙", "⛅": "☁️", "🌦": "🌧"}

# weatherCode из wttr.in (коды WorldWeatherOnline) -> ближайший код WMO.
_WWO_TO_WMO: dict[int, int] = {
    113: 0, 116: 2, 119: 3, 122: 3,
    143: 45, 248: 45, 260: 48,
    176: 61, 179: 71, 182: 71, 185: 56, 200: 95,
    227: 73, 230: 75,
    263: 51, 266: 53, 281: 56, 284: 57,
    293: 61, 296: 61, 299: 63, 302: 63, 305: 65, 308: 65,
    311: 66, 314: 67, 317: 71, 320: 73,
    323: 71, 326: 71, 329: 73, 332: 73, 335: 75, 338: 75, 350: 77,
    353: 80, 356: 81, 359: 82,
    362: 85, 365: 86, 368: 85, 371: 86, 374: 77, 377: 77,
    386: 95, 389: 95, 392: 95, 395: 95,
}


def describe_wmo(code: int | None, is_day: bool = True) -> tuple[str, str]:
    """Код WMO -> (эмодзи, описание по-русски); ночью без солнца."""
    emoji, text = _WMO.get(code, _UNKNOWN_WEATHER) if code is not None else _UNKNOWN_WEATHER
    if not is_day:
        emoji = _NIGHT_EMOJI.get(emoji, emoji)
    return emoji, text


# ---------------------------------------------------------------- форматирование

@dataclass
class _Weather:
    place: str
    temp: float
    feels: float | None
    humidity: float | None
    wind: float | None        # м/с
    emoji: str
    description: str
    precip: float | None      # вероятность осадков за день, %
    t_max: float | None
    t_min: float | None


def _round(value: float) -> int:
    """Округление «как в школе»: 2.5 -> 3, -2.5 -> -3 (round() в Python округляет к чётному)."""
    return int(math.copysign(math.floor(abs(value) + 0.5), value))


def _signed(value: float) -> str:
    """+6 / −3 (настоящий минус) / 0 без знака."""
    n = _round(value)
    if n > 0:
        return f"+{n}"
    if n < 0:
        return f"−{-n}"
    return "0"


def _cut(text: str, limit: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _render(w: _Weather) -> str:
    lines = [f"🌤 <b>{html.escape(_cut(w.place, _MAX_PLACE_LEN))}</b>"]

    temp = f"🌡 <b>{_signed(w.temp)}°C</b>"
    if w.feels is not None:
        temp += f", ощущается как {_signed(w.feels)}°C"
    lines.append(temp)

    lines.append(f"{w.emoji} {html.escape(_cut(w.description, _MAX_DESC_LEN))}")

    extra = []
    if w.humidity is not None:
        extra.append(f"💧 {_round(w.humidity)}%")
    if w.wind is not None:
        wind = _round(w.wind)
        extra.append(f"💨 {wind} м/с" if wind > 0 else "💨 штиль")
    if w.precip is not None:
        extra.append(f"☔ {_round(w.precip)}%")
    if extra:
        lines.append(" · ".join(extra))

    day = []
    if w.t_max is not None:
        day.append(f"днём до {_signed(w.t_max)}°")
    if w.t_min is not None:
        day.append(f"ночью до {_signed(w.t_min)}°")
    if day:
        lines.append("📈 " + ", ".join(day))
    return "\n".join(lines)


# ---------------------------------------------------------------- разбор ответов

def _num(value: Any) -> float | None:
    """Число из JSON (у wttr.in числа строками). Мусор и null -> None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _first(values: Any) -> Any:
    return values[0] if isinstance(values, list) and values else None


def _text(items: Any) -> str:
    """wttr.in кладёт строки как [{"value": "..."}]."""
    item = _first(items)
    value = item.get("value") if isinstance(item, dict) else None
    return value.strip() if isinstance(value, str) else ""


@dataclass
class _Place:
    name: str
    latitude: float
    longitude: float


def _join_place(*parts: str) -> str:
    result: list[str] = []
    for part in parts:
        part = part.strip()
        if part and part not in result:
            result.append(part)
    return ", ".join(result)


def _pick_place(data: Any, qualifier: str) -> _Place | None:
    """Ответ геокодера -> место. None = город не найден. qualifier — то, что после запятой."""
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
    lat, lon = _num(best.get("latitude")), _num(best.get("longitude"))
    name = best.get("name")
    if lat is None or lon is None or not isinstance(name, str):
        raise _ServiceError(f"geocoding: bad result {best!r:.200}")
    country = best.get("country") if isinstance(best.get("country"), str) else ""
    return _Place(name=_join_place(name, country), latitude=lat, longitude=lon)


def _parse_open_meteo(data: Any, place: str) -> _Weather:
    if not isinstance(data, dict) or data.get("error"):
        reason = data.get("reason") if isinstance(data, dict) else data
        raise _ServiceError(f"open-meteo: {reason!r:.200}")
    current = data.get("current")
    if not isinstance(current, dict):
        raise _ServiceError("open-meteo: нет current")
    temp = _num(current.get("temperature_2m"))
    if temp is None:
        raise _ServiceError("open-meteo: нет температуры")
    code = _num(current.get("weather_code"))
    is_day = _num(current.get("is_day"))
    emoji, description = describe_wmo(int(code) if code is not None else None,
                                      is_day=is_day is None or is_day > 0)
    daily = data.get("daily") if isinstance(data.get("daily"), dict) else {}
    return _Weather(
        place=place,
        temp=temp,
        feels=_num(current.get("apparent_temperature")),
        humidity=_num(current.get("relative_humidity_2m")),
        wind=_num(current.get("wind_speed_10m")),
        emoji=emoji,
        description=description,
        precip=_num(_first(daily.get("precipitation_probability_max"))),
        t_max=_num(_first(daily.get("temperature_2m_max"))),
        t_min=_num(_first(daily.get("temperature_2m_min"))),
    )


def _parse_wttr(data: Any, place: str | None, *, add_country: bool = False) -> _Weather:
    """place=None -> название берём из nearest_area; add_country -> дописываем страну оттуда."""
    if not isinstance(data, dict):
        raise _ServiceError(f"wttr.in: {data!r:.200}")
    current = _first(data.get("current_condition"))
    if not isinstance(current, dict):
        raise _ServiceError("wttr.in: нет current_condition")
    temp = _num(current.get("temp_C"))
    if temp is None:
        raise _ServiceError("wttr.in: нет температуры")

    wwo = _num(current.get("weatherCode"))
    wmo = _WWO_TO_WMO.get(int(wwo)) if wwo is not None else None
    # У wttr.in нет is_day, но ясную ночь он называет «Clear», а ясный день — «Sunny».
    is_day = not _text(current.get("weatherDesc")).lower().startswith("clear")
    emoji, description = describe_wmo(wmo, is_day=is_day)
    description = _text(current.get("lang_ru")) or description
    description = description[:1].upper() + description[1:]

    wind_kmh = _num(current.get("windspeedKmph"))
    day = _first(data.get("weather"))
    day = day if isinstance(day, dict) else {}
    chances = [
        _num(hour.get(key))
        for hour in day.get("hourly") or [] if isinstance(hour, dict)
        for key in ("chanceofrain", "chanceofsnow")
    ]
    chances = [c for c in chances if c is not None]

    area = _first(data.get("nearest_area"))
    area = area if isinstance(area, dict) else {}
    country = _text(area.get("country"))
    if not place:
        place = _join_place(_text(area.get("areaName")), country) or "?"
    elif add_country:
        place = _join_place(place, country)

    return _Weather(
        place=place,
        temp=temp,
        feels=_num(current.get("FeelsLikeC")),
        humidity=_num(current.get("humidity")),
        wind=wind_kmh / 3.6 if wind_kmh is not None else None,
        emoji=emoji,
        description=description,
        precip=max(chances) if chances else None,
        t_max=_num(day.get("maxtempC")),
        t_min=_num(day.get("mintempC")),
    )


# ---------------------------------------------------------------- сеть

async def _get_json(url: str, params: dict[str, Any], timeout: float) -> Any:
    """GET -> разобранный JSON. Не-200 или не-JSON -> _HTTPError. Единственная точка сети."""
    client_timeout = aiohttp.ClientTimeout(total=timeout)
    # trust_env: если на машине задан HTTPS_PROXY, ходим через него.
    async with aiohttp.ClientSession(timeout=client_timeout, trust_env=True) as session:
        async with session.get(url, params=params) as resp:
            body = await resp.text(errors="replace")
            if resp.status != 200:
                raise _HTTPError(resp.status, body)
            try:
                return json.loads(body)
            except ValueError as e:
                raise _HTTPError(resp.status, body) from e


def _wttr_location(query: str) -> str:
    """Город для пути wttr.in: убираем спецсимволы (~ @ : / ? #), пробелы -> «+»."""
    cleaned = " ".join(re.sub(r"[/\\?#&%~@:]+", " ", query).split())
    return quote(cleaned.replace(" ", "+"), safe="+,.-")


def _is_not_found(error: BaseException) -> bool:
    if not isinstance(error, _HTTPError):
        return False
    body = error.body.lower()
    return "location not found" in body or "unknown location" in body


async def _open_meteo_forecast(place: _Place, timeout: float) -> _Weather:
    params = {
        "latitude": f"{place.latitude:.4f}",
        "longitude": f"{place.longitude:.4f}",
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
                   "weather_code,wind_speed_10m,is_day",
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        "timezone": "auto",
        "forecast_days": 1,
        "wind_speed_unit": "ms",
    }
    return _parse_open_meteo(await _get_json(FORECAST_URL, params, timeout), place.name)


async def _wttr(location: str, place: str | None, timeout: float, *,
                add_country: bool = False) -> _Weather:
    data = await _get_json(WTTR_URL + location, {"format": "j1", "lang": "ru"}, timeout)
    return _parse_wttr(data, place, add_country=add_country)


def _capitalize_words(text: str) -> str:
    """«нью йорк» -> «Нью Йорк» (str.title() испортил бы «Ростов-на-Дону»)."""
    return " ".join(word[:1].upper() + word[1:] for word in text.split(" "))


def _not_found(city: str) -> WeatherError:
    return WeatherError(f"Не нашёл город «{html.escape(city)}»")


async def fetch_weather(city: str, *, timeout: float = 15.0) -> str:
    """Погода сейчас и на сегодня -> карточка в Telegram-HTML (до ~600 символов).

    timeout — лимит на каждый сервис: Open-Meteo (геокодер + прогноз делят его пополам)
    и отдельно wttr.in, так что в худшем случае ждём около 2 × timeout.
    Ошибки для пользователя — WeatherError с готовым текстом.
    """
    city = " ".join((city or "").split())
    if not city:
        raise WeatherError(MSG_EMPTY)
    if len(city) > MAX_CITY_LEN:
        raise WeatherError(MSG_TOO_LONG)

    # «Одесса, США» -> ищем «Одесса» и выбираем результат из США.
    name, _, qualifier = city.partition(",")
    name, qualifier = name.strip(), qualifier.strip()
    if not name:
        raise WeatherError(MSG_EMPTY)
    name = _CITY_ALIASES.get(name.lower(), name)

    # 1) Геокодер Open-Meteo: русские названия и координаты.
    place: _Place | None = None
    try:
        geo = await _get_json(GEOCODING_URL, {
            "name": name, "count": 10 if qualifier else 1, "language": "ru", "format": "json",
        }, timeout / 2)
        place = _pick_place(geo, qualifier)
        if place is None:
            raise _not_found(city)
    except _FAILURES as e:
        log.info("Геокодер Open-Meteo недоступен (%s), пробую wttr.in", e)

    # 2) Прогноз Open-Meteo.
    if place is not None:
        try:
            return _render(await _open_meteo_forecast(place, timeout / 2))
        except _FAILURES as e:
            log.info("Open-Meteo не дал прогноз (%s), пробую wttr.in", e)

    # 3) Запасной wttr.in: по координатам, если геокодер сработал, иначе по названию.
    # По названию wttr.in показывает ближайший район («St James» вместо Лондона),
    # поэтому в карточку пишем то, что спросили, а страну берём из ответа.
    if place is not None:
        location = f"{place.latitude:.4f},{place.longitude:.4f}"
        place_name, add_country = place.name, False
    else:
        location = _wttr_location(f"{name} {qualifier}".strip())
        if not location:
            raise _not_found(city)
        place_name = _capitalize_words(f"{name}, {qualifier}" if qualifier else name)
        add_country = not qualifier
    try:
        return _render(await _wttr(location, place_name, timeout, add_country=add_country))
    except _FAILURES as e:
        if place is None and _is_not_found(e):
            raise _not_found(city) from e
        log.warning("Погода недоступна для %r: %s", city, e)
        raise WeatherError(MSG_UNAVAILABLE) from e
