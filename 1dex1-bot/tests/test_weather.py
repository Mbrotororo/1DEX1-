"""Тесты .weather: сеть подменяем через bot.weather._get_json, живой тест — только с RUN_NETWORK=1."""

from __future__ import annotations

import os
from typing import Any

import aiohttp
import pytest
from aiohttp import web
from aiohttp.test_utils import TestServer

from bot import weather
from bot.weather import WeatherError, _round, _signed, describe_wmo, fetch_weather

# ---------------------------------------------------------------- заготовленные ответы

GEO_MOSCOW = {"results": [{"id": 524901, "name": "Москва", "latitude": 55.75204, "longitude": 37.61781,
                           "country_code": "RU", "country": "Россия", "admin1": "Москва"}],
              "generationtime_ms": 0.2}
GEO_EMPTY = {"generationtime_ms": 0.06}
LIMIT = {"reason": "Hourly API request limit exceeded. Please try again in the next hour.", "error": True}


def forecast(temp: float = 6.2, feels: float | None = 3.6, humidity: float | None = 93, code: int = 3,
             wind: float | None = 2.7, is_day: int = 1, t_max: float | None = 7.4,
             t_min: float | None = 1.6, precip: float | None = 20) -> dict[str, Any]:
    return {
        "latitude": 55.75, "longitude": 37.62, "timezone": "Europe/Moscow",
        "current": {"time": "2026-11-20T03:15", "temperature_2m": temp, "apparent_temperature": feels,
                    "relative_humidity_2m": humidity, "weather_code": code, "wind_speed_10m": wind,
                    "is_day": is_day},
        "daily": {"time": ["2026-11-20"], "temperature_2m_max": [t_max], "temperature_2m_min": [t_min],
                  "precipitation_probability_max": [precip]},
    }


def wttr(temp: str = "6", desc_ru: str = "Слабый туман", code: str = "143", desc_en: str = "Mist",
         area: str = "Москва", country: str = "Russia") -> dict[str, Any]:
    return {
        "current_condition": [{"temp_C": temp, "FeelsLikeC": "4", "humidity": "93", "windspeedKmph": "10",
                               "weatherCode": code, "lang_ru": [{"value": desc_ru}],
                               "weatherDesc": [{"value": desc_en}]}],
        "nearest_area": [{"areaName": [{"value": area}], "country": [{"value": country}]}],
        "weather": [{"maxtempC": "5", "mintempC": "-4",
                     "hourly": [{"chanceofrain": "42", "chanceofsnow": "0"},
                                {"chanceofrain": "30", "chanceofsnow": "55"}]}],
    }


class FakeNet:
    """Подмена _get_json: отвечает по префиксу URL, запоминает запросы."""

    def __init__(self, geo: Any = GEO_MOSCOW, fc: Any = None, wt: Any = None) -> None:
        self.answers = {weather.GEOCODING_URL: geo, weather.FORECAST_URL: fc if fc is not None else forecast(),
                        weather.WTTR_URL: wt if wt is not None else wttr()}
        self.calls: list[tuple[str, dict[str, Any], float]] = []

    async def __call__(self, url: str, params: dict[str, Any], timeout: float) -> Any:
        self.calls.append((url, dict(params), timeout))
        for prefix in (weather.GEOCODING_URL, weather.FORECAST_URL, weather.WTTR_URL):
            if url.startswith(prefix):
                answer = self.answers[prefix]
                if isinstance(answer, BaseException):
                    raise answer
                return answer
        raise AssertionError(f"неожиданный URL {url}")

    def urls(self, prefix: str) -> list[str]:
        return [url for url, _, _ in self.calls if url.startswith(prefix)]

    def params(self, prefix: str) -> dict[str, Any]:
        return next(p for url, p, _ in self.calls if url.startswith(prefix))


@pytest.fixture
def net(monkeypatch: pytest.MonkeyPatch) -> FakeNet:
    fake = FakeNet()
    monkeypatch.setattr(weather, "_get_json", fake)
    return fake


# ---------------------------------------------------------------- Open-Meteo

async def test_open_meteo_success(net: FakeNet) -> None:
    card = await fetch_weather("  москва ")
    assert card == ("🌤 <b>Москва, Россия</b>\n"
                    "🌡 <b>+6°C</b>, ощущается как +4°C\n"
                    "☁️ Пасмурно\n"
                    "💧 93% · 💨 3 м/с · ☔ 20%\n"
                    "📈 днём до +7°, ночью до +2°")
    assert not net.urls(weather.WTTR_URL)
    geo = net.params(weather.GEOCODING_URL)
    assert geo == {"name": "москва", "count": 1, "language": "ru", "format": "json"}
    fc = net.params(weather.FORECAST_URL)
    assert fc["latitude"] == "55.7520" and fc["longitude"] == "37.6178"
    assert set(fc["current"].split(",")) == {"temperature_2m", "apparent_temperature", "relative_humidity_2m",
                                             "weather_code", "wind_speed_10m", "is_day"}
    assert set(fc["daily"].split(",")) == {"temperature_2m_max", "temperature_2m_min",
                                           "precipitation_probability_max"}
    assert (fc["timezone"], fc["forecast_days"], fc["wind_speed_unit"]) == ("auto", 1, "ms")
    # Open-Meteo делит лимит пополам, чтобы осталось время на wttr.in.
    assert all(t == 7.5 for _, _, t in net.calls)


async def test_unknown_city(net: FakeNet) -> None:
    net.answers[weather.GEOCODING_URL] = GEO_EMPTY
    with pytest.raises(WeatherError, match="Не нашёл город «Абырвалг»"):
        await fetch_weather("Абырвалг")
    assert not net.urls(weather.FORECAST_URL) and not net.urls(weather.WTTR_URL)


async def test_negative_temperatures(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = forecast(temp=-12.6, feels=-15.2, t_max=-0.4, t_min=-20.5,
                                                 code=75, wind=0.3)
    card = await fetch_weather("Норильск")
    assert "🌡 <b>−13°C</b>, ощущается как −15°C" in card
    assert "📈 днём до 0°, ночью до −21°" in card
    assert "❄️ Сильный снег" in card
    assert "💨 штиль" in card
    assert "-" not in card  # только настоящий минус «−»


async def test_zero_and_rounding(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = forecast(temp=-0.4, feels=0.5, t_max=2.5, t_min=-2.5)
    card = await fetch_weather("Москва")
    assert "🌡 <b>0°C</b>, ощущается как +1°C" in card
    assert "днём до +3°, ночью до −3°" in card


async def test_night_clear_sky(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = forecast(code=0, is_day=0)
    assert "\n🌙 Ясно\n" in await fetch_weather("Москва")
    net.answers[weather.FORECAST_URL] = forecast(code=0, is_day=1)
    assert "\n☀️ Ясно\n" in await fetch_weather("Москва")
    net.answers[weather.FORECAST_URL] = forecast(code=2, is_day=0)
    assert "\n☁️ Переменная облачность\n" in await fetch_weather("Москва")


async def test_missing_optional_fields(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = forecast(feels=None, humidity=None, wind=None, precip=None,
                                                 t_max=None, t_min=None, code=999)
    card = await fetch_weather("Москва")
    assert card == "🌤 <b>Москва, Россия</b>\n🌡 <b>+6°C</b>\n❔ Нет описания"


async def test_html_escaping(net: FakeNet) -> None:
    evil = "<b>Зло</b> & <a href='x'>"
    net.answers[weather.GEOCODING_URL] = {"results": [{"name": evil, "latitude": 1, "longitude": 2,
                                                       "country": "<i>"}]}
    card = await fetch_weather("Зло")
    assert card.startswith("🌤 <b>&lt;b&gt;Зло&lt;/b&gt; &amp; &lt;a href=&#x27;x&#x27;&gt;, &lt;i&gt;</b>\n")
    assert "<a" not in card and "<i>" not in card

    net.answers[weather.GEOCODING_URL] = GEO_EMPTY
    with pytest.raises(WeatherError) as exc:
        await fetch_weather("<script>&")
    assert str(exc.value) == "Не нашёл город «&lt;script&gt;&amp;»"


async def test_html_escaping_wttr_description(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = LIMIT
    net.answers[weather.WTTR_URL] = wttr(desc_ru="<b>дождь</b> & гроза" + "!" * 300)
    card = await fetch_weather("Москва")
    assert "&lt;b&gt;дождь&lt;/b&gt; &amp; гроза" in card and "<b>дождь" not in card
    assert len(card) <= 600


async def test_long_names_fit_card(net: FakeNet) -> None:
    net.answers[weather.GEOCODING_URL] = {"results": [{"name": "&" * 300, "latitude": 1, "longitude": 2,
                                                       "country": "Страна" * 50}]}
    net.answers[weather.FORECAST_URL] = forecast(temp=-45.4, feels=-60.2, t_max=-40, t_min=-50, code=99)
    assert len(await fetch_weather("x" * 100)) <= 600


# ---------------------------------------------------------------- запасной wttr.in

@pytest.mark.parametrize(
    "failure",
    [LIMIT, weather._HTTPError(429, '{"error":true}'), aiohttp.ClientConnectionError("нет сети"),
     TimeoutError(), {"current": {"temperature_2m": None}}, ["мусор"]],
)
async def test_fallback_to_wttr(net: FakeNet, failure: Any) -> None:
    net.answers[weather.FORECAST_URL] = failure
    card = await fetch_weather("Москва")
    assert card == ("🌤 <b>Москва, Россия</b>\n"
                    "🌡 <b>+6°C</b>, ощущается как +4°C\n"
                    "🌫 Слабый туман\n"
                    "💧 93% · 💨 3 м/с · ☔ 55%\n"
                    "📈 днём до +5°, ночью до −4°")
    # По координатам из геокодера, а не по названию.
    assert net.urls(weather.WTTR_URL) == [weather.WTTR_URL + "55.7520,37.6178"]
    assert net.params(weather.WTTR_URL) == {"format": "j1", "lang": "ru"}
    assert net.calls[-1][2] == 15.0


async def test_fallback_when_geocoder_fails(net: FakeNet) -> None:
    net.answers[weather.GEOCODING_URL] = aiohttp.ClientConnectionError("нет сети")
    net.answers[weather.WTTR_URL] = wttr(area="St James", country="United Kingdom", code="296",
                                         desc_ru="Слабый дождь", desc_en="Light rain")
    card = await fetch_weather("нью йорк")
    assert card.startswith("🌤 <b>Нью Йорк, United Kingdom</b>\n")
    assert "🌦 Слабый дождь" in card
    assert not net.urls(weather.FORECAST_URL)
    assert net.urls(weather.WTTR_URL) == [weather.WTTR_URL + "%D0%BD%D1%8C%D1%8E+%D0%B9%D0%BE%D1%80%D0%BA"]


async def test_wttr_night_and_unknown_code(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = LIMIT
    net.answers[weather.WTTR_URL] = wttr(code="113", desc_ru="ясно", desc_en="Clear")
    assert "\n🌙 Ясно\n" in await fetch_weather("Москва")
    net.answers[weather.WTTR_URL] = wttr(code="113", desc_ru="Солнечно", desc_en="Sunny")
    assert "\n☀️ Солнечно\n" in await fetch_weather("Москва")
    bare = wttr(code="1")
    bare["current_condition"][0]["lang_ru"] = []
    net.answers[weather.WTTR_URL] = bare
    assert "\n❔ Нет описания\n" in await fetch_weather("Москва")


async def test_both_services_fail(net: FakeNet) -> None:
    net.answers[weather.FORECAST_URL] = LIMIT
    net.answers[weather.WTTR_URL] = weather._HTTPError(503, "Service Unavailable")
    with pytest.raises(WeatherError, match="Погодный сервис не отвечает"):
        await fetch_weather("Москва")

    net.answers[weather.GEOCODING_URL] = TimeoutError()
    net.answers[weather.WTTR_URL] = aiohttp.ClientConnectionError()
    with pytest.raises(WeatherError, match="Погодный сервис не отвечает"):
        await fetch_weather("Москва")


async def test_wttr_location_not_found(net: FakeNet) -> None:
    net.answers[weather.GEOCODING_URL] = LIMIT
    net.answers[weather.WTTR_URL] = weather._HTTPError(500, "location not found: upstream error")
    with pytest.raises(WeatherError, match="Не нашёл город «Абырвалг»"):
        await fetch_weather("Абырвалг")


# ---------------------------------------------------------------- ввод

@pytest.mark.parametrize("city", ["", "   ", "\n", ",", " , США"])
async def test_empty_city(net: FakeNet, city: str) -> None:
    with pytest.raises(WeatherError) as exc:
        await fetch_weather(city)
    assert str(exc.value) == "Напиши город: .weather Москва"
    assert not net.calls


async def test_too_long_city(net: FakeNet) -> None:
    await fetch_weather("ы" * 100)
    with pytest.raises(WeatherError, match="Слишком длинное"):
        await fetch_weather("ы" * 101)
    assert len(net.calls) == 2  # геокодер + прогноз только для первого


async def test_aliases_and_qualifier(net: FakeNet) -> None:
    await fetch_weather("СПб")
    assert net.params(weather.GEOCODING_URL)["name"] == "Санкт-Петербург"

    net.calls.clear()
    net.answers[weather.GEOCODING_URL] = {"results": [
        {"name": "Одесса", "latitude": 46.48, "longitude": 30.73, "country": "Украина", "admin1": "Одесская"},
        {"name": "Одесса", "latitude": 31.85, "longitude": -102.37, "country": "США", "admin1": "Техас"},
    ]}
    card = await fetch_weather("Одесса, техас")
    assert net.params(weather.GEOCODING_URL) == {"name": "Одесса", "count": 10, "language": "ru",
                                                 "format": "json"}
    assert net.params(weather.FORECAST_URL)["latitude"] == "31.8500"
    assert card.startswith("🌤 <b>Одесса, США</b>")


def test_wttr_location_sanitized() -> None:
    assert weather._wttr_location("~Eiffel/../tower?x#y") == "Eiffel+..+tower+x+y"
    assert weather._wttr_location("@:/") == ""


# ---------------------------------------------------------------- форматирование и таблицы

@pytest.mark.parametrize(("value", "text"), [(6.2, "+6"), (0.49, "0"), (-0.49, "0"), (-0.5, "−1"),
                                             (2.5, "+3"), (-2.5, "−3"), (-12.6, "−13"), (0, "0")])
def test_signed(value: float, text: str) -> None:
    assert _signed(value) == text


def test_round_half_away_from_zero() -> None:
    assert [_round(x) for x in (0.5, 1.5, 2.5, -0.5, -1.5)] == [1, 2, 3, -1, -2]


def test_wmo_table_complete() -> None:
    codes = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
             80, 81, 82, 85, 86, 95, 96, 99]
    for code in codes:
        emoji, text = describe_wmo(code)
        assert emoji and text and text != "Нет описания"
    assert describe_wmo(0, is_day=False) == ("🌙", "Ясно")
    assert describe_wmo(None) == ("❔", "Нет описания")
    assert set(weather._WWO_TO_WMO.values()) <= set(codes)


# ---------------------------------------------------------------- настоящий HTTP-слой (локальный сервер)

async def test_get_json_http_layer(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy"):
        monkeypatch.delenv(var, raising=False)

    async def ok(request: web.Request) -> web.Response:
        return web.json_response({"name": request.query["name"]})

    async def limited(_: web.Request) -> web.Response:
        return web.json_response(LIMIT, status=429)

    async def not_json(_: web.Request) -> web.Response:
        return web.Response(text="<html>oops</html>")

    app = web.Application()
    app.router.add_get("/ok", ok)
    app.router.add_get("/limited", limited)
    app.router.add_get("/html", not_json)
    async with TestServer(app) as server:
        base = str(server.make_url(""))
        assert await weather._get_json(base + "/ok", {"name": "Москва & Co"}, 5) == {"name": "Москва & Co"}
        with pytest.raises(weather._HTTPError) as exc:
            await weather._get_json(base + "/limited", {}, 5)
        assert exc.value.status == 429 and "limit exceeded" in exc.value.body
        with pytest.raises(weather._HTTPError):
            await weather._get_json(base + "/html", {}, 5)


# ---------------------------------------------------------------- живой тест

@pytest.mark.skipif(os.environ.get("RUN_NETWORK") != "1", reason="живой тест: RUN_NETWORK=1")
async def test_live_weather() -> None:
    card = await fetch_weather("Москва", timeout=30)
    assert "Москва" in card and "°C" in card and len(card) <= 600
