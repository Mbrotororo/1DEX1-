"""Тесты .time: сеть подменяем через bot.worldtime._get_json, живой тест — только с RUN_NETWORK=1."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfoNotFoundError

import aiohttp
import pytest

from bot import worldtime
from bot.weather import FORECAST_URL, GEOCODING_URL
from bot.worldtime import WorldTimeError, city_time

UTC = timezone.utc
# 18:15 UTC = 21:15 пятницы в Москве = 03:15 субботы в Токио.
NOW = datetime(2026, 11, 20, 18, 15, tzinfo=UTC)


def geo(name: str, country: str, tz: str | None, lat: float = 10.0, lon: float = 20.0,
        admin1: str = "") -> dict[str, Any]:
    result: dict[str, Any] = {"id": 1, "name": name, "latitude": lat, "longitude": lon, "country": country,
                              "admin1": admin1}
    if tz is not None:
        result["timezone"] = tz
    return {"results": [result], "generationtime_ms": 0.1}


GEO_TOKYO = geo("Токио", "Япония", "Asia/Tokyo", 35.6895, 139.69171)
GEO_EMPTY = {"generationtime_ms": 0.06}
LIMIT = {"reason": "Hourly API request limit exceeded.", "error": True}


def forecast(offset: int = 32400, abbreviation: str = "GMT+9") -> dict[str, Any]:
    return {"latitude": 35.7, "longitude": 139.69, "utc_offset_seconds": offset, "timezone": "Asia/Tokyo",
            "timezone_abbreviation": abbreviation, "current": {"time": "2026-11-21T03:15", "temperature_2m": 9.1}}


class FakeNet:
    def __init__(self) -> None:
        self.answers: dict[str, Any] = {GEOCODING_URL: GEO_TOKYO, FORECAST_URL: forecast()}
        self.calls: list[tuple[str, dict[str, Any], float]] = []

    async def __call__(self, url: str, params: dict[str, Any], timeout: float) -> Any:
        self.calls.append((url, dict(params), timeout))
        answer = self.answers[url]
        if isinstance(answer, BaseException):
            raise answer
        return answer

    def urls(self) -> list[str]:
        return [url for url, _, _ in self.calls]

    def params(self, url: str) -> dict[str, Any]:
        return next(p for u, p, _ in self.calls if u == url)


@pytest.fixture
def net(monkeypatch: pytest.MonkeyPatch) -> FakeNet:
    fake = FakeNet()
    monkeypatch.setattr(worldtime, "_get_json", fake)
    return fake


def no_zoneinfo(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(name: str) -> Any:
        raise ZoneInfoNotFoundError(f"No time zone found with key {name}")
    monkeypatch.setattr(worldtime, "ZoneInfo", broken)


# ---------------------------------------------------------------- основной сценарий

async def test_tokyo(net: FakeNet) -> None:
    card = await city_time("  токио ", now=NOW)
    assert card == ("🕐 <b>Токио, Япония</b>\n"
                    "🌙 <b>03:15</b> · суббота, 21 ноября (завтра)\n"
                    "UTC+9 (JST) · на 6 ч впереди тебя")
    assert net.calls == [(GEOCODING_URL, {"name": "токио", "count": 1, "language": "ru", "format": "json"}, 15.0)]


async def test_half_hour_offsets(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("Дели", "Индия", "Asia/Kolkata")
    assert await city_time("Дели", now=NOW) == ("🕐 <b>Дели, Индия</b>\n"
                                                "🌙 <b>23:45</b> · пятница, 20 ноября\n"
                                                "UTC+5:30 (IST) · на 2 ч 30 мин впереди тебя")
    net.answers[GEOCODING_URL] = geo("Катманду", "Непал", "Asia/Kathmandu")
    assert await city_time("Катманду", now=NOW) == ("🕐 <b>Катманду, Непал</b>\n"
                                                    "🌙 <b>00:00</b> · суббота, 21 ноября (завтра)\n"
                                                    "UTC+5:45 · на 2 ч 45 мин впереди тебя")
    net.answers[GEOCODING_URL] = geo("Сент-Джонс", "Канада", "America/St_Johns")
    card = await city_time("Сент-Джонс", now=NOW)
    assert "<b>14:45</b>" in card and "UTC−3:30 (NST) · на 6 ч 30 мин позади тебя" in card


async def test_behind_and_same(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("Нью-Йорк", "США", "America/New_York")
    assert await city_time("Нью-Йорк", now=NOW) == ("🕐 <b>Нью-Йорк, США</b>\n"
                                                    "☀️ <b>13:15</b> · пятница, 20 ноября\n"
                                                    "UTC−5 (EST) · на 8 ч позади тебя")
    net.answers[GEOCODING_URL] = geo("Москва", "Россия", "Europe/Moscow")
    assert await city_time("Москва", now=NOW) == ("🕐 <b>Москва, Россия</b>\n"
                                                  "☀️ <b>21:15</b> · пятница, 20 ноября\n"
                                                  "UTC+3 (MSK) · как у тебя")
    net.answers[GEOCODING_URL] = geo("Лондон", "Великобритания", "Europe/London")
    assert (await city_time("Лондон", now=NOW)).endswith("\nUTC+0 · на 3 ч позади тебя")


async def test_owner_offset(net: FakeNet) -> None:
    card = await city_time("Токио", now=NOW, owner_offset_hours=-5)
    assert card.endswith("\nUTC+9 (JST) · на 14 ч впереди тебя")
    assert "(послезавтра)" not in card and "(завтра)" in card  # у владельца 13:15 пятницы
    net.answers[GEOCODING_URL] = geo("Дели", "Индия", "Asia/Kolkata")
    assert (await city_time("Дели", now=NOW, owner_offset_hours=5.5)).endswith(" · как у тебя")
    net.answers[GEOCODING_URL] = geo("Москва", "Россия", "Europe/Moscow")
    assert (await city_time("Москва", now=NOW, owner_offset_hours=3.75)).endswith(" · на 45 мин позади тебя")


async def test_day_change_wording(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("Нью-Йорк", "США", "America/New_York")
    # 22:30 UTC: у владельца уже 01:30 субботы, в Нью-Йорке ещё пятница.
    card = await city_time("Нью-Йорк", now=datetime(2026, 11, 20, 22, 30, tzinfo=UTC))
    assert "☀️ <b>17:30</b> · пятница, 20 ноября (вчера)\n" in card

    # Новый год: у владельца 1 января 2027, в Нью-Йорке ещё 31 декабря 2026.
    card = await city_time("Нью-Йорк", now=datetime(2026, 12, 31, 22, 0, tzinfo=UTC))
    assert "☀️ <b>17:00</b> · четверг, 31 декабря 2026 (вчера)\n" in card

    # Киритимати (UTC+14) против Гавайев у владельца (UTC−10): разница больше суток.
    net.answers[GEOCODING_URL] = geo("Киритимати", "Кирибати", "Pacific/Kiritimati")
    card = await city_time("Киритимати", now=datetime(2026, 11, 20, 9, 30, tzinfo=UTC), owner_offset_hours=-10)
    assert "<b>23:30</b> · пятница, 20 ноября (завтра)" in card
    card = await city_time("Киритимати", now=datetime(2026, 11, 20, 10, 30, tzinfo=UTC), owner_offset_hours=-11)
    assert "<b>00:30</b> · суббота, 21 ноября (послезавтра)" in card
    assert card.endswith("UTC+14 · на 25 ч впереди тебя")


async def test_dst(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("Нью-Йорк", "США", "America/New_York")
    card = await city_time("Нью-Йорк", now=datetime(2026, 7, 1, 12, 0, tzinfo=UTC))
    assert "<b>08:00</b> · среда, 1 июля" in card and "UTC−4 (EDT) · на 7 ч позади тебя" in card


async def test_naive_now_is_utc(net: FakeNet) -> None:
    assert await city_time("Токио", now=NOW.replace(tzinfo=None)) == await city_time("Токио", now=NOW)
    other_tz = NOW.astimezone(timezone(timedelta(hours=-7)))
    assert await city_time("Токио", now=other_tz) == await city_time("Токио", now=NOW)


async def test_real_clock(net: FakeNet) -> None:
    card = await city_time("Токио")
    assert card.startswith("🕐 <b>Токио, Япония</b>\n") and "UTC+9" in card


# ---------------------------------------------------------------- ввод и ошибки

@pytest.mark.parametrize("city", ["", "   ", ",", " , США"])
async def test_empty_city(net: FakeNet, city: str) -> None:
    with pytest.raises(WorldTimeError) as exc:
        await city_time(city, now=NOW)
    assert str(exc.value) == "Напиши город: .time Токио"
    assert not net.calls


async def test_too_long(net: FakeNet) -> None:
    with pytest.raises(WorldTimeError, match="Слишком длинное"):
        await city_time("ы" * 101, now=NOW)
    assert not net.calls


async def test_unknown_city(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = GEO_EMPTY
    with pytest.raises(WorldTimeError) as exc:
        await city_time("Абырвалг", now=NOW)
    assert str(exc.value) == "Не нашёл город «Абырвалг»"
    assert net.urls() == [GEOCODING_URL]


async def test_html_escaping(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("<b>Зло</b> & <a href='x'>", "<i>", "Asia/Tokyo")
    card = await city_time("Зло", now=NOW)
    assert card.startswith("🕐 <b>&lt;b&gt;Зло&lt;/b&gt; &amp; &lt;a href=&#x27;x&#x27;&gt;, &lt;i&gt;</b>\n")
    assert "<a" not in card and "<i>" not in card
    net.answers[GEOCODING_URL] = GEO_EMPTY
    with pytest.raises(WorldTimeError) as exc:
        await city_time("<script>&", now=NOW)
    assert str(exc.value) == "Не нашёл город «&lt;script&gt;&amp;»"


async def test_long_name_fits(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("&" * 300, "Страна" * 50, "Asia/Tokyo")
    assert len(await city_time("x" * 100, now=NOW)) <= 600


async def test_aliases_and_qualifier(net: FakeNet) -> None:
    await city_time("СПб", now=NOW)
    assert net.params(GEOCODING_URL)["name"] == "Санкт-Петербург"

    net.calls.clear()
    net.answers[GEOCODING_URL] = {"results": [
        {"name": "Одесса", "latitude": 46.48, "longitude": 30.73, "country": "Украина", "admin1": "Одесская",
         "timezone": "Europe/Kyiv"},
        {"name": "Одесса", "latitude": 31.85, "longitude": -102.37, "country": "США", "admin1": "Техас",
         "timezone": "America/Chicago"},
    ]}
    card = await city_time("Одесса, техас", now=NOW)
    assert net.params(GEOCODING_URL) == {"name": "Одесса", "count": 10, "language": "ru", "format": "json"}
    assert card.startswith("🕐 <b>Одесса, США</b>\n☀️ <b>12:15</b>")
    assert "UTC−6 (CST) · на 9 ч позади тебя" in card


@pytest.mark.parametrize(("text", "label", "clock"), [
    ("UTC+5", "UTC+5", "23:15"), ("utc", "UTC+0", "18:15"), ("GMT-3:30", "UTC−3:30", "14:45"),
    ("utc +5.45", "UTC+5:45", "00:00"), ("UTC−10", "UTC−10", "08:15"), ("гмт+3", "UTC+3", "21:15"),
])
async def test_fixed_offset_without_network(net: FakeNet, text: str, label: str, clock: str) -> None:
    card = await city_time(text, now=NOW)
    assert card.startswith(f"🕐 <b>{label}</b>\n") and f"<b>{clock}</b>" in card
    assert card.split("\n")[2].startswith(label + " · ")
    assert not net.calls


async def test_bad_fixed_offset_goes_to_geocoder(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = GEO_EMPTY
    with pytest.raises(WorldTimeError, match="Не нашёл город «UTC\\+15»"):
        await city_time("UTC+15", now=NOW)


async def test_iana_name_without_network(net: FakeNet) -> None:
    card = await city_time("Europe/Berlin", now=NOW)
    assert card == ("🕐 <b>Europe/Berlin</b>\n"
                    "☀️ <b>19:15</b> · пятница, 20 ноября\n"
                    "UTC+1 (CET) · на 2 ч позади тебя")
    assert not net.calls


# ---------------------------------------------------------------- запасные пути

async def test_zoneinfo_missing_uses_forecast_offset(net: FakeNet, monkeypatch: pytest.MonkeyPatch) -> None:
    no_zoneinfo(monkeypatch)
    card = await city_time("Токио", now=NOW)
    assert card == ("🕐 <b>Токио, Япония</b>\n"
                    "🌙 <b>03:15</b> · суббота, 21 ноября (завтра)\n"
                    "UTC+9 · на 6 ч впереди тебя")
    assert net.urls() == [GEOCODING_URL, FORECAST_URL]
    fc = net.params(FORECAST_URL)
    assert fc == {"latitude": "35.6895", "longitude": "139.6917", "timezone": "auto", "forecast_days": 1,
                  "current": "temperature_2m"}

    net.answers[FORECAST_URL] = forecast(offset=19800, abbreviation="IST")
    assert (await city_time("Токио", now=NOW)).endswith("\nUTC+5:30 (IST) · на 2 ч 30 мин впереди тебя")


async def test_no_timezone_in_geocoder_uses_forecast(net: FakeNet) -> None:
    net.answers[GEOCODING_URL] = geo("Токио", "Япония", None)
    net.answers[FORECAST_URL] = forecast(offset=-10800)
    assert (await city_time("Токио", now=NOW)).endswith("\nUTC−3 · на 6 ч позади тебя")
    net.answers[GEOCODING_URL] = geo("Токио", "Япония", "Mars/Olympus_Mons")
    assert (await city_time("Токио", now=NOW)).endswith("\nUTC−3 · на 6 ч позади тебя")


@pytest.mark.parametrize("failure", [LIMIT, aiohttp.ClientConnectionError("нет сети"), TimeoutError(),
                                     {"utc_offset_seconds": None}, {"utc_offset_seconds": 10**9}, ["мусор"]])
async def test_zoneinfo_and_forecast_fail(net: FakeNet, monkeypatch: pytest.MonkeyPatch, failure: Any) -> None:
    no_zoneinfo(monkeypatch)
    net.answers[FORECAST_URL] = failure
    with pytest.raises(WorldTimeError) as exc:
        await city_time("Токио", now=NOW)
    assert str(exc.value) == "Сервис времени не отвечает, попробуй позже."


@pytest.mark.parametrize("failure", [LIMIT, aiohttp.ClientConnectionError("нет сети"), TimeoutError(),
                                     ["мусор"], {"results": [{"name": "x"}]}])
async def test_geocoder_down_uses_builtin_cities(net: FakeNet, failure: Any) -> None:
    net.answers[GEOCODING_URL] = failure
    assert await city_time("Токио", now=NOW) == ("🕐 <b>Токио, Япония</b>\n"
                                                "🌙 <b>03:15</b> · суббота, 21 ноября (завтра)\n"
                                                "UTC+9 (JST) · на 6 ч впереди тебя")
    assert (await city_time("питер", now=NOW)).startswith("🕐 <b>Санкт-Петербург, Россия</b>\n")
    with pytest.raises(WorldTimeError, match="Сервис времени не отвечает"):
        await city_time("Абырвалг", now=NOW)
    assert FORECAST_URL not in net.urls()


def test_builtin_cities_are_valid() -> None:
    for key, (place, tz) in worldtime._KNOWN.items():
        assert key == key.lower() and place and worldtime._zone(tz) is not None, key


def test_formatting_helpers() -> None:
    assert [worldtime._fmt_offset(m) for m in (540, 330, 345, -180, -570, 0)] == [
        "UTC+9", "UTC+5:30", "UTC+5:45", "UTC−3", "UTC−9:30", "UTC+0"]
    assert worldtime._relative(0) == "как у тебя"
    assert worldtime._relative(360) == "на 6 ч впереди тебя"
    assert worldtime._relative(-150) == "на 2 ч 30 мин позади тебя"
    assert worldtime._relative(45) == "на 45 мин впереди тебя"


# ---------------------------------------------------------------- живой тест

@pytest.mark.skipif(os.environ.get("RUN_NETWORK") != "1", reason="живой тест: RUN_NETWORK=1")
async def test_live_time() -> None:
    card = await city_time("Токио", timeout=30)
    assert card.startswith("🕐 <b>Токио, Япония</b>") and "UTC+9" in card
    card = await city_time("Дели", timeout=30)
    assert "UTC+5:30" in card and "2 ч 30 мин впереди тебя" in card
