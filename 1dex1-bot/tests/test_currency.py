"""Тесты .currency: сеть подменяем через bot.currency._get_json, живой тест — только с RUN_NETWORK=1."""

from __future__ import annotations

import copy
import os
from typing import Any

import aiohttp
import pytest

from bot import currency
from bot.currency import CurrencyError, convert, fmt_amount, fmt_money, parse_query
from bot.weather import _HTTPError

# ---------------------------------------------------------------- заготовленные ответы

CBR: dict[str, Any] = {
    "Date": "2026-11-20T11:30:00+03:00",
    "PreviousDate": "2026-11-19T11:30:00+03:00",
    "Timestamp": "2026-11-19T20:00:00+03:00",
    "Valute": {
        "USD": {"CharCode": "USD", "Nominal": 1, "Name": "Доллар США", "Value": 80.0, "Previous": 80.5},
        "EUR": {"CharCode": "EUR", "Nominal": 1, "Name": "Евро", "Value": 90.0, "Previous": 89.75},
        "CNY": {"CharCode": "CNY", "Nominal": 1, "Name": "Юань", "Value": 11.0, "Previous": 11.0},
        "KZT": {"CharCode": "KZT", "Nominal": 100, "Name": "Тенге", "Value": 16.0, "Previous": 16.1},
        "BYN": {"CharCode": "BYN", "Nominal": 1, "Name": "Белорусский рубль", "Value": 25.0, "Previous": 25.004},
        "UAH": {"CharCode": "UAH", "Nominal": 10, "Name": "Гривен", "Value": 20.0, "Previous": 19.9},
        "TRY": {"CharCode": "TRY", "Nominal": 10, "Name": "Турецких лир", "Value": 25.0, "Previous": 25.5},
        "GBP": {"CharCode": "GBP", "Nominal": 1, "Name": "Фунт", "Value": 100.0, "Previous": 99.0},
        "JPY": {"CharCode": "JPY", "Nominal": 100, "Name": "Иен", "Value": 50.0, "Previous": 51.0},
        "XDR": {"CharCode": "XDR", "Nominal": 1, "Name": "СДР", "Value": 110.0, "Previous": 110.0},
    },
}

ER: dict[str, Any] = {
    "result": "success",
    "provider": "https://www.exchangerate-api.com",
    "time_last_update_unix": 1795132952,
    "time_last_update_utc": "Fri, 20 Nov 2026 00:02:32 +0000",
    "base_code": "USD",
    "rates": {"USD": 1, "EUR": 0.9, "RUB": 81.0, "CNY": 7.2, "KZT": 500.0, "JPY": 150.0, "GBP": 0.8,
              "VND": 25000.0, "ARS": 1000.0},
}


class FakeNet:
    """Подмена _get_json: отвечает по URL, запоминает запросы."""

    def __init__(self) -> None:
        self.answers: dict[str, Any] = {currency.CBR_URL: copy.deepcopy(CBR), currency.ER_URL: copy.deepcopy(ER)}
        self.calls: list[tuple[str, dict[str, Any], float]] = []

    async def __call__(self, url: str, params: dict[str, Any], timeout: float) -> Any:
        self.calls.append((url, dict(params), timeout))
        if url not in self.answers:
            raise AssertionError(f"неожиданный URL {url}")
        answer = self.answers[url]
        if isinstance(answer, BaseException):
            raise answer
        return answer

    def urls(self) -> list[str]:
        return [url for url, _, _ in self.calls]


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture(autouse=True)
def clean_cache() -> Any:
    currency.clear_cache()
    yield
    currency.clear_cache()


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> Clock:
    fake = Clock()
    monkeypatch.setattr(currency, "_clock", fake)
    return fake


@pytest.fixture
def net(monkeypatch: pytest.MonkeyPatch, clock: Clock) -> FakeNet:
    fake = FakeNet()
    monkeypatch.setattr(currency, "_get_json", fake)
    return fake


CBR_DOWN = aiohttp.ClientConnectionError("нет сети")
ER_DOWN = _HTTPError(503, "Service Unavailable")


# ---------------------------------------------------------------- разбор запроса

@pytest.mark.parametrize(("query", "amount", "codes"), [
    ("", None, []),
    ("   ", None, []),
    (None, None, []),
    ("100 usd", 100, ["USD"]),
    ("100 USD EUR", 100, ["USD", "EUR"]),
    ("100 usd в eur", 100, ["USD", "EUR"]),
    ("100 usd to eur", 100, ["USD", "EUR"]),
    ("100 usd -> eur", 100, ["USD", "EUR"]),
    ("100 долларов в евро", 100, ["USD", "EUR"]),
    ("1 доллар", 1, ["USD"]),
    ("2 доллара в рублях", 2, ["USD", "RUB"]),
    ("$100", 100, ["USD"]),
    ("100$", 100, ["USD"]),
    ("€50 в рублях", 50, ["EUR", "RUB"]),
    ("100₽ в $", 100, ["RUB", "USD"]),
    ("1000 руб в доллары", 1000, ["RUB", "USD"]),
    ("1000р", 1000, ["RUB"]),
    ("5к рублей в тенге", 5000, ["RUB", "KZT"]),
    ("5 к рублей в тенге", 5000, ["RUB", "KZT"]),
    ("1,5к usd", 1500, ["USD"]),
    ("1.5k usd", 1500, ["USD"]),
    ("2,5 usd", 2.5, ["USD"]),
    ("10 000 руб", 10000, ["RUB"]),
    ("1 000 000,50 rub", 1000000.5, ["RUB"]),
    ("3 тыс рублей", 3000, ["RUB"]),
    ("2 млн тенге в рубли", 2e6, ["KZT", "RUB"]),
    ("1кк рублей", 1e6, ["RUB"]),
    ("100 kzt", 100, ["KZT"]),  # «k» от kzt — не тысяча
    ("100kzt", 100, ["KZT"]),
    ("usd", None, ["USD"]),
    ("Евро", None, ["EUR"]),
    ("курс доллара", None, ["USD"]),
    ("сколько стоит бакс", None, ["USD"]),
    ("usd eur", None, ["USD", "EUR"]),
    ("юань", None, ["CNY"]),
    ("100 юаней", 100, ["CNY"]),
    ("тенге", None, ["KZT"]),
    ("гривна", None, ["UAH"]),
    ("500 гривен", 500, ["UAH"]),
    ("100 грн", 100, ["UAH"]),
    ("белорусский рубль", None, ["BYN"]),
    ("100 бел руб", 100, ["BYN"]),
    ("100 бел. руб в доллары", 100, ["BYN", "USD"]),
    ("белорусских рублей в российские рубли", None, ["BYN", "RUB"]),
    ("10 фунтов", 10, ["GBP"]),
    ("£", None, ["GBP"]),
    ("фунт стерлингов", None, ["GBP"]),
    ("1000 иен", 1000, ["JPY"]),
    ("1000 йен", 1000, ["JPY"]),
    ("¥", None, ["JPY"]),
    ("100 лир", 100, ["TRY"]),
    ("лира", None, ["TRY"]),
    ("100000 сум", 100000, ["UZS"]),
    ("1000 драм", 1000, ["AMD"]),
    ("лари", None, ["GEL"]),
    ("100 злотых", 100, ["PLN"]),
    ("франк", None, ["CHF"]),
    ("100 канадских долларов", 100, ["CAD"]),
    ("100 чешских крон", 100, ["CZK"]),
    ("10 американских долларов в китайские юани", 10, ["USD", "CNY"]),
    ("доллар сша", None, ["USD"]),
    ("100 vnd в ars", 100, ["VND", "ARS"]),
    ("100 usd eur cny", 100, ["USD", "EUR", "CNY"]),
    ("100 usd usd eur", 100, ["USD", "EUR"]),  # повтор не считаем
    ("Сколько будет 100 USD в RUB?", 100, ["USD", "RUB"]),
    ("100 EUR = ? CNY", 100, ["EUR", "CNY"]),
    ("10 рублёв", 10, ["RUB"]),
])
def test_parse_query(query: str | None, amount: float | None, codes: list[str]) -> None:
    parsed = parse_query(query)
    assert parsed.amount == (None if amount is None else pytest.approx(amount))
    assert parsed.codes == codes


@pytest.mark.parametrize(("query", "message"), [
    ("100 тугриков", "Не знаю валюту «тугриков»"),
    ("100 usd в попугаях", "Не знаю валюту «попугаях»"),
    ("ямайский доллар", "Не знаю валюту «ямайский»"),
    ("100", "Укажи валюту: .currency 100 usd"),
    ("1,5к", "Укажи валюту: .currency 100 usd"),
    ("100 usd 200", "Не понял сумму"),
    ("0 usd", "Сумма должна быть больше нуля."),
    ("1000000000000000000 usd", "Слишком большая сумма."),
    ("usd " * 30, "Слишком длинный запрос"),
])
def test_parse_errors(query: str, message: str) -> None:
    with pytest.raises(CurrencyError) as exc:
        parse_query(query)
    assert str(exc.value).startswith(message)


def test_unknown_word_is_html_safe_and_short() -> None:
    with pytest.raises(CurrencyError) as exc:
        parse_query("100 " + "ы" * 40)
    assert str(exc.value) == "Не знаю валюту «" + "ы" * 19 + "…»"
    with pytest.raises(CurrencyError) as exc:
        parse_query("100 <script>&")
    assert str(exc.value) == "Не знаю валюту «script»"


# ---------------------------------------------------------------- форматирование

@pytest.mark.parametrize(("value", "text"), [
    (8192.9, "8 192,90"), (1234567.891, "1 234 567,89"), (1, "1,00"), (12.5, "12,50"),
    (0.5, "0,50"), (0.625, "0,625"), (0.1845, "0,1845"), (0.01221, "0,01221"), (0.002, "0,002"),
    (0, "0"), (1e-13, "≈0"),
])
def test_fmt_money(value: float, text: str) -> None:
    assert fmt_money(value) == text


@pytest.mark.parametrize(("value", "text"), [
    (100, "100"), (10000, "10 000"), (1000000, "1 000 000"), (2.5, "2,5"), (1500.25, "1 500,25"), (0.001, "0,001"),
])
def test_fmt_amount(value: float, text: str) -> None:
    assert fmt_amount(value) == text


def test_flags() -> None:
    assert currency._flag("USD") == "🇺🇸"
    assert currency._flag("EUR") == "🇪🇺"
    assert currency._flag("KZT") == "🇰🇿"
    assert currency._flag("XDR") == "🌐"


# ---------------------------------------------------------------- обзор

async def test_overview(net: FakeNet) -> None:
    card = await convert("")
    assert card == ("💱 <b>Курсы ЦБ на 20.11.2026</b>\n"
                    "🇺🇸 USD 80,00 ₽ ▼0,50\n"
                    "🇪🇺 EUR 90,00 ₽ ▲0,25\n"
                    "🇨🇳 CNY 11,00 ₽ ±0\n"
                    "🇰🇿 100 KZT 16,00 ₽ ▼0,10\n"
                    "🇧🇾 BYN 25,00 ₽ ▼0,0040\n"
                    "🇺🇦 10 UAH 20,00 ₽ ▲0,10\n"
                    "🇹🇷 10 TRY 25,00 ₽ ▼0,50\n"
                    "🇬🇧 GBP 100,00 ₽ ▲1,00")
    assert net.calls == [(currency.CBR_URL, {}, 15.0)]


async def test_overview_skips_missing_and_bad_rows(net: FakeNet) -> None:
    valute = net.answers[currency.CBR_URL]["Valute"]
    del valute["UAH"]
    valute["TRY"]["Value"] = None
    valute["GBP"]["Previous"] = "мусор"
    card = await convert("")
    assert "UAH" not in card and "TRY" not in card
    assert card.endswith("\n🇬🇧 GBP 100,00 ₽")


async def test_overview_falls_back_to_er_api(net: FakeNet) -> None:
    net.answers[currency.CBR_URL] = CBR_DOWN
    card = await convert("")
    assert card == ("💱 <b>Курсы на 20.11.2026</b>\n"
                    "🇺🇸 USD 81,00 ₽\n"
                    "🇪🇺 EUR 90,00 ₽\n"
                    "🇨🇳 CNY 11,25 ₽\n"
                    "🇰🇿 10 KZT 1,62 ₽\n"
                    "🇬🇧 GBP 101,25 ₽\n"
                    "источник: open.er-api.com")
    assert net.urls() == [currency.CBR_URL, currency.ER_URL]


async def test_overview_both_down(net: FakeNet) -> None:
    net.answers[currency.CBR_URL] = TimeoutError()
    net.answers[currency.ER_URL] = {"result": "error", "error-type": "unsupported-code"}
    with pytest.raises(CurrencyError) as exc:
        await convert("")
    assert str(exc.value) == "Курсы сейчас недоступны, попробуй позже."


# ---------------------------------------------------------------- перевод через ЦБ

async def test_amount_to_rub_with_popular(net: FakeNet) -> None:
    card = await convert("100 usd")
    assert card == ("💱 <b>100 USD = 8 000,00 RUB</b>\n"
                    "🇪🇺 88,89 EUR\n"
                    "🇨🇳 727,27 CNY\n"
                    "1 USD = 80,00 ₽ ▼0,50 · курс ЦБ на 20.11.2026")
    assert net.urls() == [currency.CBR_URL]  # всё из одного ответа ЦБ
    assert await convert("$100") == card
    assert await convert("100$") == card
    assert await convert("100 долларов") == card


async def test_rub_to_foreign(net: FakeNet) -> None:
    assert await convert("1000 руб в доллары") == ("💱 <b>1 000 RUB = 12,50 USD</b>\n"
                                                    "1 USD = 80,00 ₽ ▼0,50 · курс ЦБ на 20.11.2026")
    assert await convert("1000 рублей") == ("💱 <b>1 000 RUB = 12,50 USD</b>\n"
                                             "🇪🇺 11,11 EUR\n"
                                             "🇨🇳 90,91 CNY\n"
                                             "1 USD = 80,00 ₽ ▼0,50 · курс ЦБ на 20.11.2026")


async def test_nominal_100(net: FakeNet) -> None:
    assert await convert("5к рублей в тенге") == ("💱 <b>5 000 RUB = 31 250,00 KZT</b>\n"
                                                   "100 KZT = 16,00 ₽ ▼0,10 · курс ЦБ на 20.11.2026")
    assert await convert("100 jpy") == ("💱 <b>100 JPY = 50,00 RUB</b>\n"
                                        "🇺🇸 0,625 USD\n"
                                        "🇪🇺 0,5556 EUR\n"
                                        "100 JPY = 50,00 ₽ ▼1,00 · курс ЦБ на 20.11.2026")
    assert await convert("10 гривен") == ("💱 <b>10 UAH = 20,00 RUB</b>\n"
                                          "🇺🇸 0,25 USD\n"
                                          "🇪🇺 0,2222 EUR\n"
                                          "10 UAH = 20,00 ₽ ▲0,10 · курс ЦБ на 20.11.2026")


async def test_rate_only(net: FakeNet) -> None:
    assert await convert("usd") == ("💱 <b>1 USD = 80,00 RUB</b>\n"
                                    "🇪🇺 0,8889 EUR\n"
                                    "🇨🇳 7,2727 CNY\n"
                                    "▼0,50 за день · курс ЦБ на 20.11.2026")
    assert await convert("рубль") == ("💱 <b>1 RUB = 0,0125 USD</b>\n"
                                      "🇪🇺 0,01111 EUR\n"
                                      "🇨🇳 0,09091 CNY\n"
                                      "1 USD = 80,00 ₽ ▼0,50 · курс ЦБ на 20.11.2026")
    assert await convert("тенге") == ("💱 <b>1 KZT = 0,16 RUB</b>\n"
                                      "🇺🇸 0,002 USD\n"
                                      "🇪🇺 0,001778 EUR\n"
                                      "100 KZT = 16,00 ₽ ▼0,10 · курс ЦБ на 20.11.2026")
    # без вчерашнего курса — без стрелки
    del net.answers[currency.CBR_URL]["Valute"]["CNY"]["Previous"]
    currency.clear_cache()
    assert (await convert("юань")).endswith("\nкурс ЦБ на 20.11.2026")


async def test_popular_missing_is_dropped(net: FakeNet) -> None:
    del net.answers[currency.CBR_URL]["Valute"]["CNY"]
    assert await convert("100 usd") == ("💱 <b>100 USD = 8 000,00 RUB</b>\n"
                                        "🇪🇺 88,89 EUR\n"
                                        "1 USD = 80,00 ₽ ▼0,50 · курс ЦБ на 20.11.2026")
    assert net.urls() == [currency.CBR_URL]


# ---------------------------------------------------------------- перевод через er-api

async def test_cross_rate_from_er_api(net: FakeNet) -> None:
    assert await convert("100 usd в eur") == ("💱 <b>100 USD = 90,00 EUR</b>\n"
                                              "1 EUR = 1,1111 USD · курс open.er-api.com на 20.11.2026")
    assert await convert("100 евро в юани") == ("💱 <b>100 EUR = 800,00 CNY</b>\n"
                                                "1 EUR = 8,0000 CNY · курс open.er-api.com на 20.11.2026")
    assert await convert("eur usd") == ("💱 <b>1 EUR = 1,1111 USD</b>\n"
                                        "курс open.er-api.com на 20.11.2026")
    assert net.urls() == [currency.ER_URL]  # ЦБ для пар без рубля не нужен


async def test_several_targets(net: FakeNet) -> None:
    card = await convert("100 usd eur cny jpy")
    assert card == ("💱 <b>100 USD = 90,00 EUR</b>\n"
                    "🇨🇳 720,00 CNY\n"
                    "🇯🇵 15 000,00 JPY\n"
                    "1 EUR = 1,1111 USD · курс open.er-api.com на 20.11.2026")


async def test_er_api_when_cbr_lacks_currency(net: FakeNet) -> None:
    card = await convert("1000 ars в рубли")
    assert card == ("💱 <b>1 000 ARS = 81,00 RUB</b>\n"
                    "100 ARS = 8,1000 ₽ · курс open.er-api.com на 20.11.2026")
    assert net.urls() == [currency.CBR_URL, currency.ER_URL]


async def test_er_api_when_cbr_down(net: FakeNet) -> None:
    net.answers[currency.CBR_URL] = CBR_DOWN
    assert await convert("100 usd") == ("💱 <b>100 USD = 8 100,00 RUB</b>\n"
                                        "🇪🇺 90,00 EUR\n"
                                        "🇨🇳 720,00 CNY\n"
                                        "1 USD = 81,00 ₽ · курс open.er-api.com на 20.11.2026")
    assert (await convert("1000 тенге")).endswith("\n10 KZT = 1,6200 ₽ · курс open.er-api.com на 20.11.2026")


async def test_cbr_cross_when_er_api_down(net: FakeNet) -> None:
    net.answers[currency.ER_URL] = ER_DOWN
    assert await convert("100 usd eur") == ("💱 <b>100 USD = 88,89 EUR</b>\n"
                                            "1 EUR = 1,1250 USD · кросс-курс ЦБ на 20.11.2026")
    assert net.urls() == [currency.ER_URL, currency.CBR_URL]


@pytest.mark.parametrize("bad", [
    {"Valute": {}}, {"Valute": []}, ["мусор"], None, {"Valute": {"USD": {"Nominal": 0, "Value": 80}}},
])
async def test_bad_cbr_answer_falls_back(net: FakeNet, bad: Any) -> None:
    net.answers[currency.CBR_URL] = bad
    assert (await convert("100 usd")).startswith("💱 <b>100 USD = 8 100,00 RUB</b>")


@pytest.mark.parametrize("bad", [
    {"result": "error", "error-type": "unsupported-code"}, {"result": "success", "rates": {}},
    {"result": "success", "rates": "x"}, "мусор",
])
async def test_bad_er_answer_falls_back(net: FakeNet, bad: Any) -> None:
    net.answers[currency.ER_URL] = bad
    assert (await convert("100 usd eur")).startswith("💱 <b>100 USD = 88,89 EUR</b>")


async def test_both_sources_down(net: FakeNet) -> None:
    net.answers[currency.CBR_URL] = CBR_DOWN
    net.answers[currency.ER_URL] = ER_DOWN
    for query in ("100 usd", "100 usd eur", "usd", "5к рублей в тенге"):
        with pytest.raises(CurrencyError) as exc:
            await convert(query)
        assert str(exc.value) == "Курсы сейчас недоступны, попробуй позже."


async def test_unknown_iso_code(net: FakeNet) -> None:
    with pytest.raises(CurrencyError) as exc:
        await convert("100 qqq")
    assert str(exc.value) == "Не знаю валюту «QQQ»"
    with pytest.raises(CurrencyError, match="Не знаю валюту «QQQ»"):
        await convert("100 usd в qqq")
    # er-api лёг, а ЦБ такую не знает — не можем сказать, есть ли она
    currency.clear_cache()
    net.answers[currency.ER_URL] = ER_DOWN
    with pytest.raises(CurrencyError, match="Курсы сейчас недоступны"):
        await convert("100 qqq")


async def test_unknown_word_no_network(net: FakeNet) -> None:
    with pytest.raises(CurrencyError, match="Не знаю валюту «тугриков»"):
        await convert("100 тугриков")
    assert not net.calls


# ---------------------------------------------------------------- кэш

async def test_cache_hit_avoids_second_request(net: FakeNet, clock: Clock) -> None:
    await convert("100 usd")
    await convert("")
    await convert("5к рублей в тенге")
    assert net.urls() == [currency.CBR_URL]
    clock.now += 29 * 60
    await convert("usd")
    assert net.urls() == [currency.CBR_URL]

    clock.now += 2 * 60  # 31 минута — идём заново
    net.answers[currency.CBR_URL]["Valute"]["USD"]["Value"] = 70.0
    assert (await convert("100 usd")).startswith("💱 <b>100 USD = 7 000,00 RUB</b>")
    assert net.urls() == [currency.CBR_URL, currency.CBR_URL]


async def test_stale_cache_used_when_source_down(net: FakeNet, clock: Clock) -> None:
    first = await convert("100 usd")
    net.answers[currency.CBR_URL] = CBR_DOWN
    net.answers[currency.ER_URL] = ER_DOWN
    clock.now += 3 * 3600
    assert await convert("100 usd") == first  # старый курс лучше, чем ничего
    clock.now += 22 * 3600  # больше суток — уже не отдаём
    with pytest.raises(CurrencyError, match="Курсы сейчас недоступны"):
        await convert("100 usd")


async def test_failure_is_not_cached(net: FakeNet) -> None:
    net.answers[currency.CBR_URL] = CBR_DOWN
    await convert("100 usd")
    net.answers[currency.CBR_URL] = copy.deepcopy(CBR)
    assert (await convert("100 usd")).endswith("курс ЦБ на 20.11.2026")
    assert net.urls() == [currency.CBR_URL, currency.ER_URL, currency.CBR_URL]


async def test_timeout_passed(net: FakeNet) -> None:
    await convert("100 usd eur", timeout=4)
    assert net.calls == [(currency.ER_URL, {}, 4)]


# ---------------------------------------------------------------- размер карточки

async def test_cards_fit_limit(net: FakeNet) -> None:
    for query in ("", "999999999999999 vnd в usd eur cny jpy gbp", "0,000001 jpy в vnd", "1кк usd"):
        card = await convert(query)
        assert len(card) <= 700, query


# ---------------------------------------------------------------- живой тест

@pytest.mark.skipif(os.environ.get("RUN_NETWORK") != "1", reason="живой тест: RUN_NETWORK=1")
async def test_live_currency() -> None:
    overview = await convert("", timeout=30)
    assert "USD" in overview and "₽" in overview and len(overview) <= 700
    card = await convert("100 usd в eur", timeout=30)
    assert card.startswith("💱 <b>100 USD = ") and "EUR" in card
    card = await convert("5к рублей в тенге", timeout=30)
    assert "KZT" in card and "курс ЦБ" in card
