"""Курсы валют для команды .currency (.курс, .валюта).

Источники без ключей:
* ЦБ РФ (www.cbr-xml-daily.ru) — официальный курс к рублю, есть вчерашний курс для ▲/▼.
  Основной для всего, где участвует рубль.
* open.er-api.com — 160+ валют, основной для пар без рубля и запасной, если ЦБ не ответил
  или не знает валюту.

Ответ каждого источника кэшируется на 30 минут; если источник лёг, ещё сутки отдаём
последний удачный ответ (дата курса видна в карточке). Все сетевые запросы идут через
_get_json — в тестах подменяем только его.
"""

from __future__ import annotations

import email.utils
import html
import logging
import math
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from .weather import _FAILURES, _ServiceError, _get_json, _num

log = logging.getLogger(__name__)

CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js"
ER_URL = "https://open.er-api.com/v6/latest/USD"

CACHE_TTL = 30 * 60          # свежий ответ, секунд
STALE_TTL = 24 * 60 * 60     # столько держим старый ответ на случай, если источник лёг
MAX_QUERY_LEN = 100
MAX_AMOUNT = 1e15
MAX_TARGETS = 5

MSG_UNAVAILABLE = "Курсы сейчас недоступны, попробуй позже."
MSG_TOO_LONG = f"Слишком длинный запрос (до {MAX_QUERY_LEN} символов)."
MSG_NO_CURRENCY = "Укажи валюту: .currency 100 usd"
MSG_TWO_AMOUNTS = "Не понял сумму. Пример: .currency 100 usd eur"
MSG_ZERO = "Сумма должна быть больше нуля."
MSG_TOO_BIG = "Слишком большая сумма."

# Обзор по пустому запросу: курс ЦБ к рублю.
OVERVIEW = ("USD", "EUR", "CNY", "KZT", "BYN", "UAH", "TRY", "GBP")
# Во что ещё переводить, если указана одна валюта.
POPULAR = ("USD", "EUR", "CNY")


class CurrencyError(Exception):
    """Ошибка с понятным для пользователя текстом (уже безопасен для parse_mode=HTML)."""


# ---------------------------------------------------------------- разбор запроса

_SYMBOLS = {
    "$": "usd", "€": "eur", "£": "gbp", "¥": "jpy", "₽": "rub", "₸": "kzt", "₴": "uah",
    "₺": "try", "₹": "inr", "₩": "krw", "₾": "gel", "֏": "amd", "₼": "azn",
}

# Названия из нескольких слов -> код (до разбивки на слова).
_PHRASES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p), code) for p, code in (
        (r"бел(?:орусск\w*|\.)?\s*руб\w*", "byn"),
        (r"канадск\w*\s+долл\w*", "cad"),
        (r"австралийск\w*\s+долл\w*", "aud"),
        (r"гонконгск\w*\s+долл\w*", "hkd"),
        (r"сингапурск\w*\s+долл\w*", "sgd"),
        (r"новозеландск\w*\s+долл\w*", "nzd"),
        (r"чешск\w*\s+крон\w*", "czk"),
        (r"шведск\w*\s+крон\w*", "sek"),
        (r"норвежск\w*\s+крон\w*", "nok"),
        (r"датск\w*\s+крон\w*", "dkk"),
        (r"молдавск\w*\s+ле[йияе]\w*", "mdl"),
        (r"румынск\w*\s+ле[йияе]\w*", "ron"),
        (r"туркменск\w*\s+манат\w*", "tmt"),
        (r"фунт\w*\s+стерлинг\w*", "gbp"),
    )
]

# Одно слово -> код (fullmatch, порядок важен: «сомони» раньше «сом»).
_WORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p), code) for p, code in (
        (r"долл\w*|бакс\w*|dollars?|bucks?", "USD"),
        (r"евро|еврик\w*|euros?", "EUR"),
        (r"рубл\w*|руб|рубас\w*|р|rub(?:les?|l\w*)|roubles?", "RUB"),
        (r"юан\w*|yuan|rmb", "CNY"),
        (r"тенге|tenge", "KZT"),
        (r"гривн\w*|гривен|грн|hryvn\w*", "UAH"),
        (r"фунт\w*|pounds?|sterling", "GBP"),
        (r"[йи]ен\w*|yen", "JPY"),
        (r"лир(?:а|ы|у|е|ой|ам|ах|ами)?|lira", "TRY"),
        (r"сум(?:а|ов|ы|ам|ах|ами)?", "UZS"),
        (r"драм(?:а|ов|ы|ам|ах|ами)?", "AMD"),
        (r"лари", "GEL"),
        (r"злот\w*|zloty", "PLN"),
        (r"франк\w*|francs?", "CHF"),
        (r"вон(?:а|ы|у|е|ой|ам|ах|ами)?", "KRW"),
        (r"рупи\w*|rupees?", "INR"),
        (r"сомони", "TJS"),
        (r"сом(?:а|ов|ы|ам|ах|ами)?", "KGS"),
        (r"манат\w*", "AZN"),
        (r"дирхам\w*", "AED"),
        (r"бат(?:а|ов|ы|ам|ах|ами)?|baht", "THB"),
    )
]

_STOP_WORDS = frozenset({
    "в", "во", "на", "к", "из", "за", "по", "и", "сколько", "стоит", "будет", "это", "равно",
    "перевести", "переведи", "конвертировать", "курс", "курса", "курсу", "цб", "сейчас", "сегодня",
    "сша", "рф", "to", "in", "into", "from", "for", "and", "rate", "how", "much", "is", "what",
    "now", "today", "convert",
})
# «российских рублей», «китайский юань» — прилагательное просто пропускаем.
_ADJECTIVE = re.compile(
    r"(?:российск|американск|китайск|японск|турецк|казахстанск|казахск|украинск|британск|"
    r"английск|польск|швейцарск|узбекистанск|узбекск|армянск|грузинск|индийск|южнокорейск|"
    r"корейск|киргизск|кыргызск|таджикск|азербайджанск|европейск)\w*"
)

# Пробел внутри числа: «10 000», «1 000 000».
_DIGIT_SPACE = re.compile(r"(?<=\d)[    ](?=\d{3}(?!\d))")
_NUMBER = re.compile(
    r"(\d+(?:\.\d+)?)"
    r"(?:\s*(кк|kk|к|k|тыс\w*|тыщ\w*|млн\w*|миллион\w*|млрд\w*|миллиард\w*|m)(?![a-zа-я]))?"
)
_ISO = re.compile(r"[a-z]{3}")
# Число с разделителями тысяч: 1-3 цифры, затем группы «,ddd» или «.ddd» одним и тем же
# разделителем, и необязательная дробь другим разделителем.
_THOUSANDS = re.compile(
    r"(?<![\d.,])((?:[1-9]\d{0,2})(?:,\d{3})+|(?:[1-9]\d{0,2})(?:\.\d{3}){2,})((?:\.\d{1,2})?)(?![\d,]|\.\d)"
)


def _multiplier(suffix: str | None) -> float:
    if not suffix:
        return 1.0
    if suffix in ("кк", "kk", "m") or suffix.startswith(("млн", "миллион")):
        return 1e6
    if suffix.startswith(("млрд", "миллиард")):
        return 1e9
    return 1e3


def _word_to_code(word: str) -> str | None:
    for pattern, code in _WORDS:
        if pattern.fullmatch(word):
            return code
    if _ISO.fullmatch(word):
        return word.upper()
    return None


def _unknown(token: str) -> CurrencyError:
    token = token if len(token) <= 20 else token[:19] + "…"
    return CurrencyError(f"Не знаю валюту «{html.escape(token)}»")


@dataclass
class Query:
    amount: float | None             # None — сумма не указана
    codes: list[str] = field(default_factory=list)  # первая — из какой, остальные — в какие


def parse_query(query: str | None) -> Query:
    """«5к рублей в тенге» -> Query(5000, ['RUB', 'KZT']). Ошибки — CurrencyError."""
    text = " ".join((query or "").split()).lower().replace("ё", "е")
    if len(text) > MAX_QUERY_LEN:
        raise CurrencyError(MSG_TOO_LONG)
    for symbol, code in _SYMBOLS.items():
        text = text.replace(symbol, f" {code} ")
    for pattern, code in _PHRASES:
        text = pattern.sub(f" {code} ", text)
    text = _DIGIT_SPACE.sub("", text)
    # «1,000» / «1.000.000» / «10,000.50» — разделители тысяч (группы ровно по 3 цифры),
    # а «1,5» / «2.75» — дробь
    text = _THOUSANDS.sub(lambda m: re.sub(r"[.,]", "", m.group(1)) + (m.group(2) or "").replace(",", "."), text)
    text = re.sub(r"(?<=\d),(?=\d)", ".", text)

    numbers = list(_NUMBER.finditer(text))
    if len(numbers) > 1:
        raise CurrencyError(MSG_TWO_AMOUNTS)
    amount: float | None = None
    if numbers:
        match = numbers[0]
        amount = float(match.group(1)) * _multiplier(match.group(2))
        text = text[: match.start()] + " " + text[match.end():]
        if amount <= 0:
            raise CurrencyError(MSG_ZERO)
        if amount > MAX_AMOUNT:
            raise CurrencyError(MSG_TOO_BIG)

    codes: list[str] = []
    for word in re.split(r"[^a-zа-я]+", text):
        if not word or word in _STOP_WORDS or _ADJECTIVE.fullmatch(word):
            continue
        code = _word_to_code(word)
        if code is None:
            raise _unknown(word)
        if code not in codes:
            codes.append(code)
    if amount is not None and not codes:
        raise CurrencyError(MSG_NO_CURRENCY)
    return Query(amount, codes[: MAX_TARGETS + 1])


# ---------------------------------------------------------------- источники

@dataclass
class _Table:
    kind: str                     # "cbr" | "er"
    values: dict[str, float]      # цена 1 единицы валюты в базовой (ЦБ — в рублях, er-api — в долларах)
    date: str                     # «20.11.2026» или ""
    previous: dict[str, float] = field(default_factory=dict)  # ЦБ: вчерашняя цена 1 единицы в рублях
    nominal: dict[str, int] = field(default_factory=dict)     # ЦБ: за сколько единиц дан курс

    def rate(self, src: str, dst: str) -> float:
        """Сколько dst за 1 src."""
        return self.values[src] / self.values[dst]

    def label(self, pair: tuple[str, str]) -> str:
        if self.kind == "cbr":
            name = "курс ЦБ" if "RUB" in pair else "кросс-курс ЦБ"
        else:
            name = "курс open.er-api.com"
        return f"{name} на {self.date}" if self.date else name


def _positive(value: Any) -> float | None:
    number = _num(value)
    return number if number is not None and number > 0 else None


def _parse_cbr(data: Any) -> _Table:
    if not isinstance(data, dict) or not isinstance(data.get("Valute"), dict):
        raise _ServiceError(f"cbr: {data!r:.200}")
    table = _Table(kind="cbr", values={"RUB": 1.0}, date="", previous={"RUB": 1.0})
    for code, item in data["Valute"].items():
        if not isinstance(code, str) or not re.fullmatch(r"[A-Z]{3}", code) or not isinstance(item, dict):
            continue
        nominal, value = _positive(item.get("Nominal")), _positive(item.get("Value"))
        if nominal is None or value is None:
            continue
        table.values[code] = value / nominal
        table.nominal[code] = round(nominal)
        previous = _positive(item.get("Previous"))
        if previous is not None:
            table.previous[code] = previous / nominal
    if len(table.values) < 2:
        raise _ServiceError("cbr: пустой список валют")
    raw_date = data.get("Date")
    if isinstance(raw_date, str):
        try:
            table.date = datetime.fromisoformat(raw_date).strftime("%d.%m.%Y")
        except ValueError:
            pass
    return table


def _parse_er(data: Any) -> _Table:
    if not isinstance(data, dict) or data.get("result") != "success" or not isinstance(data.get("rates"), dict):
        raise _ServiceError(f"er-api: {data!r:.200}")
    base = data.get("base_code") if isinstance(data.get("base_code"), str) else "USD"
    values = {base: 1.0}
    for code, rate in data["rates"].items():
        rate = _positive(rate)
        if isinstance(code, str) and re.fullmatch(r"[A-Z]{3}", code) and rate is not None:
            values[code] = 1.0 / rate
    if len(values) < 2:
        raise _ServiceError("er-api: пустой список валют")
    date = ""
    raw = data.get("time_last_update_utc")
    try:
        if isinstance(raw, str):
            date = email.utils.parsedate_to_datetime(raw).strftime("%d.%m.%Y")
        elif (unix := _num(data.get("time_last_update_unix"))) is not None:
            date = datetime.fromtimestamp(unix, timezone.utc).strftime("%d.%m.%Y")
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    return _Table(kind="er", values=values, date=date)


# url -> (время по _clock, таблица)
_cache: dict[str, tuple[float, _Table]] = {}
_clock: Callable[[], float] = time.monotonic


def clear_cache() -> None:
    _cache.clear()


async def _load(url: str, parser: Callable[[Any], _Table], timeout: float) -> _Table:
    now = _clock()
    hit = _cache.get(url)
    if hit is not None and now - hit[0] < CACHE_TTL:
        return hit[1]
    try:
        table = parser(await _get_json(url, {}, timeout))
    except _FAILURES as e:
        if hit is not None and now - hit[0] < STALE_TTL:
            log.info("%s недоступен (%s), отдаю курс из кэша", url, e)
            return hit[1]
        raise
    _cache[url] = (now, table)
    return table


async def _cbr(timeout: float) -> _Table:
    return await _load(CBR_URL, _parse_cbr, timeout)


async def _er(timeout: float) -> _Table:
    return await _load(ER_URL, _parse_er, timeout)


async def _table_for(required: list[str], prefer_cbr: bool, timeout: float) -> _Table:
    """Первый источник, где есть все нужные валюты."""
    loaded: list[_Table] = []
    for loader in ((_cbr, _er) if prefer_cbr else (_er, _cbr)):
        try:
            table = await loader(timeout)
        except _FAILURES as e:
            log.info("Источник курсов не ответил: %s", e)
            continue
        if all(code in table.values for code in required):
            return table
        loaded.append(table)
    if not loaded:
        raise CurrencyError(MSG_UNAVAILABLE)
    missing = next((c for c in required if not any(c in t.values for t in loaded)), None)
    # er-api знает почти все валюты мира: если ответил и не знает — валюты нет.
    if missing is not None and any(t.kind == "er" for t in loaded):
        raise _unknown(missing)
    raise CurrencyError(MSG_UNAVAILABLE)


# ---------------------------------------------------------------- форматирование

def _fixed(value: float, decimals: int) -> str:
    """8192.9 -> «8 192,90» (без знака)."""
    return f"{abs(value):,.{decimals}f}".replace(",", " ").replace(".", ",")


def _strip_zeros(text: str, keep: int = 0) -> str:
    if "," not in text:
        return text
    whole, frac = text.split(",")
    frac = frac.rstrip("0")
    frac = frac + "0" * (keep - len(frac)) if len(frac) < keep else frac
    return f"{whole},{frac}" if frac else whole


def fmt_money(value: float) -> str:
    """Результат: 2 знака, а меньше единицы — 4 значащие цифры (0,01221)."""
    value = abs(value)
    if value == 0:
        return "0"
    if value >= 1:
        return _fixed(value, 2)
    decimals = min(10, 3 - math.floor(math.log10(value)))
    text = _strip_zeros(_fixed(value, decimals), keep=2)
    return text if text.strip("0,") else "≈0"


def fmt_amount(value: float) -> str:
    """Введённая сумма: 100 -> «100», 2.5 -> «2,5», 10000 -> «10 000»."""
    if value == int(value):
        return _fixed(value, 0)
    return _strip_zeros(_fixed(value, 6)) if value >= 1e-6 else fmt_money(value)


def _fmt_rate(rate: float) -> str:
    if rate >= 10:
        return _fixed(rate, 2)
    if rate >= 1:
        return _fixed(rate, 4)
    return fmt_money(rate)


def _fmt_change(change: float) -> str:
    if change == 0:
        return "±0"
    arrow = "▲" if change > 0 else "▼"
    text = _fixed(change, 2)
    if not text.strip("0,"):
        text = _fixed(change, 4)
    return arrow + text


def _flag(code: str) -> str:
    if code == "EUR":
        return "🇪🇺"
    if code.startswith("X") or not re.fullmatch(r"[A-Z]{3}", code):
        return "🌐"
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code[:2])


def _nominal(table: _Table, code: str) -> int:
    """За сколько единиц показывать курс к рублю: у ЦБ свой номинал (100 KZT), иначе — чтобы было ≥ 1 ₽."""
    if table.kind == "cbr":
        return table.nominal.get(code, 1)
    price = table.rate(code, "RUB")
    return 10 ** min(12, math.ceil(-math.log10(price))) if price < 1 else 1


def _change(table: _Table, code: str) -> str:
    """▲/▼ за день для «1 code = … ₽» (только ЦБ)."""
    if table.kind != "cbr" or code not in table.previous or code == "RUB":
        return ""
    nominal = table.nominal.get(code, 1)
    return " " + _fmt_change((table.values[code] - table.previous[code]) * nominal)


def _render_overview(table: _Table) -> str:
    title = "Курсы ЦБ" if table.kind == "cbr" else "Курсы"
    lines = [f"💱 <b>{title} на {table.date}</b>" if table.date else f"💱 <b>{title}</b>"]
    for code in OVERVIEW:
        if code not in table.values:
            continue
        nominal = _nominal(table, code)
        count = f"{nominal} " if nominal != 1 else ""
        value = table.rate(code, "RUB") * nominal
        text = _fixed(value, 2) if value >= 1 else fmt_money(value)
        lines.append(f"{_flag(code)} {count}{code} {text} ₽{_change(table, code)}")
    if table.kind != "cbr":
        lines.append("источник: open.er-api.com")
    return "\n".join(lines)


def _render_conversion(amount: float | None, src: str, targets: list[str], table: _Table) -> str:
    """amount=None — просто курс 1 src (с точностью курса, а не денег)."""
    fmt = _fmt_rate if amount is None else fmt_money
    amount = 1.0 if amount is None else amount
    main = targets[0]
    lines = [f"💱 <b>{fmt_amount(amount)} {src} = {fmt(amount * table.rate(src, main))} {main}</b>"]
    for code in targets[1:]:
        lines.append(f"{_flag(code)} {fmt(amount * table.rate(src, code))} {code}")

    label = table.label((src, main))
    if "RUB" in (src, main):
        # «1 USD = 81,93 ₽ ▼0,30», «100 KZT = 18,45 ₽» — как у ЦБ.
        foreign = main if src == "RUB" else src
        count = _nominal(table, foreign)
        change = _change(table, foreign)
        if amount == 1 and src == foreign and count == 1:  # заголовок и так «1 USD = …»
            lines.append(f"{change.strip()} за день · {label}" if change else label)
            return "\n".join(lines)
        rate_line = f"{count} {foreign} = {_fmt_rate(table.rate(foreign, 'RUB') * count)} ₽{change}"
    else:
        # «1 EUR = 1,0980 USD»: та сторона, где курс ≥ 1.
        rate = table.rate(src, main)
        big, small = (src, main) if rate >= 1 else (main, src)
        if amount == 1 and big == src:
            lines.append(label)
            return "\n".join(lines)
        rate_line = f"1 {big} = {_fmt_rate(max(rate, 1 / rate))} {small}"
    lines.append(f"{rate_line} · {label}")
    return "\n".join(lines)


# ---------------------------------------------------------------- команда

async def convert(query: str | None, *, timeout: float = 15.0) -> str:
    """Запрос .currency -> карточка в Telegram-HTML (до ~700 символов).

    ''                 — обзор курсов ЦБ (USD, EUR, CNY, KZT, BYN, UAH, TRY, GBP) с ▲/▼ за день;
    'usd', 'евро'      — курс 1 единицы к рублю (+ в USD/EUR/CNY);
    '100 usd'          — 100 USD в рублях (+ в двух популярных);
    '100 usd в eur', '5к рублей в тенге', '$100', '10 000 руб в доллары eur' — перевод.
    timeout — лимит на каждый источник (в худшем случае ждём оба). Ошибки — CurrencyError.
    """
    parsed = parse_query(query)
    if not parsed.codes:
        try:
            table = await _cbr(timeout)
        except _FAILURES as e:
            log.info("ЦБ не ответил (%s), обзор по open.er-api.com", e)
            try:
                table = await _er(timeout)
            except _FAILURES as e2:
                log.warning("Курсы недоступны: %s", e2)
                raise CurrencyError(MSG_UNAVAILABLE) from e2
        if "RUB" not in table.values:
            raise CurrencyError(MSG_UNAVAILABLE)
        return _render_overview(table)

    src, *targets = parsed.codes
    required = [src, *targets]
    if not targets:
        targets = ["USD"] if src == "RUB" else ["RUB"]
        targets += [c for c in POPULAR if c not in (src, targets[0])][:2]
    table = await _table_for(required + targets[:1], "RUB" in (src, targets[0]), timeout)
    targets = [targets[0]] + [c for c in targets[1:] if c in table.values]
    return _render_conversion(parsed.amount, src, targets, table)
