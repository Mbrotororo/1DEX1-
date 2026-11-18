"""Полезные команды: шпаргалка, напоминания, таймер, калькулятор, время, инфо, опросы и т.п.

Здесь же живут общие помощники для времени (parse_duration / human_duration / split_duration),
их импортирует moderation.py — чтобы не дублировать разбор «10m», «2ч», «1д».
"""

from __future__ import annotations

import ast
import asyncio
import html
import logging
import math
import operator
import random
import re
import secrets
import string
from datetime import date, datetime, timedelta, timezone, tzinfo

from aiogram.exceptions import TelegramAPIError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, InputPollOption, WebAppInfo

from ..config import config
from ..db import now
from . import base as _base
from .base import CATEGORIES, REGISTRY, Ctx, command

log = logging.getLogger(__name__)

# ───────────────────────── русские окончания ─────────────────────────


def plural(n: int, forms: tuple[str, str, str]) -> str:
    """forms = (1 минута, 2 минуты, 5 минут)."""
    n = abs(int(n))
    if n % 10 == 1 and n % 100 != 11:
        return forms[0]
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return forms[1]
    return forms[2]


def count(n: int, forms: tuple[str, str, str]) -> str:
    return f"{n} {plural(n, forms)}"


# ───────────────────────── длительности ─────────────────────────

_UNIT_NAMES: list[tuple[int, tuple[str, ...]]] = [
    (1, ("s", "sec", "secs", "second", "seconds", "с", "c", "сек", "секунд", "секунда", "секунды",
         "секунду", "секундочку")),
    (60, ("", "m", "min", "mins", "minute", "minutes", "м", "мин", "минут", "минута", "минуты",
          "минуту", "минутку", "минутки")),
    (3600, ("h", "hr", "hrs", "hour", "hours", "ч", "час", "часа", "часов", "часик", "часика")),
    (86400, ("d", "day", "days", "д", "дн", "день", "дня", "дней", "сут", "сутки", "суток")),
    (604800, ("w", "wk", "week", "weeks", "н", "нед", "неделя", "недели", "недель", "неделю")),
]
_UNITS = {name: sec for sec, names in _UNIT_NAMES for name in names}
# Без числа: «.remind час позвонить», «.mut полчаса»
_WORDS = {
    "полминуты": 30, "минуту": 60, "минутку": 60, "полчаса": 1800, "час": 3600, "часик": 3600,
    "полтора часа": 5400, "день": 86400, "сутки": 86400, "неделю": 604800, "неделя": 604800,
}
_DUR_PART = re.compile(r"(\s*)(\d{1,9}(?:[.,]\d{1,3})?)\s*([a-zа-я]*)")


def parse_duration(text: str | None) -> int | None:
    """«30s», «10m», «2h», «1d», «1w», «10 мин», «1ч30м», «1ч30», «полчаса», «15» (= минуты) → секунды.

    None — если это не похоже на время или получилось 0.
    """
    if not text:
        return None
    s = " ".join(text.lower().replace("ё", "е").split())
    if not s or len(s) > 40:
        return None
    if s in _WORDS:
        return _WORDS[s]
    pos, total, parts, prev_mult = 0, 0.0, 0, 0
    while pos < len(s):
        m = _DUR_PART.match(s, pos)
        if not m or m.end() == pos:
            return None
        space, num, unit = m.groups()
        mult = _UNITS.get(unit)
        if mult is None:
            return None
        if unit == "" and parts:
            # Голое число после другой части — только «1ч30» (минуты сразу за часами)
            if space or prev_mult != 3600:
                return None
        total += float(num.replace(",", ".")) * mult
        parts += 1
        prev_mult = mult
        pos = m.end()
    seconds = int(round(total))
    return seconds if seconds > 0 else None


def split_duration(text: str, max_words: int = 4) -> tuple[int | None, str]:
    """Отрезать время от начала текста: «10m купить хлеб» → (600, «купить хлеб»).

    Пробует самое длинное начало из 1..max_words слов. Переносы строк в остатке сохраняются.
    """
    words = list(re.finditer(r"\S+", text or ""))
    for k in range(min(max_words, len(words)), 0, -1):
        chunk = text[words[0].start():words[k - 1].end()]
        seconds = parse_duration(chunk)
        if seconds is not None:
            return seconds, text[words[k - 1].end():].strip()
    return None, (text or "").strip()


_LONG_UNITS = [
    (604800, ("неделю", "недели", "недель"), "нед"),
    (86400, ("день", "дня", "дней"), "д"),
    (3600, ("час", "часа", "часов"), "ч"),
    (60, ("минуту", "минуты", "минут"), "мин"),
    (1, ("секунду", "секунды", "секунд"), "с"),
]


def human_duration(seconds: float, short: bool = False) -> str:
    """600 → «10 минут», 3600 → «час», 5400 → «1 час 30 минут», 172800 → «2 дня».

    Форма — для «на …» / «через …» (минуту, неделю). short=True → «1 ч 30 мин».
    Показывает максимум две самые крупные единицы.
    """
    left = max(0, int(round(seconds)))
    if left == 0:
        return "0 с" if short else "0 секунд"
    units = _LONG_UNITS if left % 604800 == 0 else _LONG_UNITS[1:]
    parts: list[tuple[int, tuple[str, str, str], str]] = []
    for size, forms, abbr in units:
        if left >= size:
            value, left = divmod(left, size)
            if value:
                parts.append((value, forms, abbr))
        if len(parts) == 2:
            break
    if short:
        return " ".join(f"{v} {abbr}" for v, _, abbr in parts)
    if len(parts) == 1 and parts[0][0] == 1:
        return parts[0][1][0]  # «час», «минуту», «неделю»
    return " ".join(count(v, forms) for v, forms, _ in parts)


# ───────────────────────── часовые пояса ─────────────────────────

MONTHS_GEN = ("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа",
              "сентября", "октября", "ноября", "декабря")
WEEKDAYS = ("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")

# ключ (только буквы) → (как показать, IANA-зона, запасное смещение в минутах без летнего времени)
_CITY_LIST: list[tuple[tuple[str, ...], str, str, int]] = [
    (("москва", "мск", "moscow", "msk"), "Москва", "Europe/Moscow", 180),
    (("питер", "спб", "петербург", "санктпетербург", "spb", "petersburg"), "Питер", "Europe/Moscow", 180),
    (("казань",), "Казань", "Europe/Moscow", 180),
    (("калининград",), "Калининград", "Europe/Kaliningrad", 120),
    (("самара",), "Самара", "Europe/Samara", 240),
    (("екатеринбург", "екб"), "Екатеринбург", "Asia/Yekaterinburg", 300),
    (("омск",), "Омск", "Asia/Omsk", 360),
    (("новосибирск", "нск", "новосиб"), "Новосибирск", "Asia/Novosibirsk", 420),
    (("красноярск",), "Красноярск", "Asia/Krasnoyarsk", 420),
    (("иркутск",), "Иркутск", "Asia/Irkutsk", 480),
    (("владивосток", "влад"), "Владивосток", "Asia/Vladivostok", 600),
    (("киев", "київ", "kyiv", "kiev"), "Киев", "Europe/Kyiv", 120),
    (("минск", "minsk"), "Минск", "Europe/Minsk", 180),
    (("алматы", "алмата", "almaty"), "Алматы", "Asia/Almaty", 300),
    (("астана",), "Астана", "Asia/Almaty", 300),
    (("ташкент",), "Ташкент", "Asia/Tashkent", 300),
    (("бишкек",), "Бишкек", "Asia/Bishkek", 360),
    (("тбилиси",), "Тбилиси", "Asia/Tbilisi", 240),
    (("ереван",), "Ереван", "Asia/Yerevan", 240),
    (("баку",), "Баку", "Asia/Baku", 240),
    (("стамбул", "istanbul"), "Стамбул", "Europe/Istanbul", 180),
    (("дубай", "dubai"), "Дубай", "Asia/Dubai", 240),
    (("лондон", "london"), "Лондон", "Europe/London", 0),
    (("париж", "paris"), "Париж", "Europe/Paris", 60),
    (("берлин", "berlin"), "Берлин", "Europe/Berlin", 60),
    (("варшава",), "Варшава", "Europe/Warsaw", 60),
    (("ньюйорк", "нью", "newyork", "ny", "nyc"), "Нью-Йорк", "America/New_York", -300),
    (("лосанджелес", "la"), "Лос-Анджелес", "America/Los_Angeles", -480),
    (("пекин", "beijing"), "Пекин", "Asia/Shanghai", 480),
    (("сеул", "seoul"), "Сеул", "Asia/Seoul", 540),
    (("токио", "tokyo"), "Токио", "Asia/Tokyo", 540),
    (("utc", "gmt"), "UTC", "UTC", 0),
]
_CITIES = {key: (title, tz, off) for keys, title, tz, off in _CITY_LIST for key in keys}
_CITY_HELP = "Москва, Питер, Киев, Минск, Алматы, Новосибирск, Владивосток, Лондон, Нью-Йорк, Токио, Дубай"
_TZ_CACHE: dict[str, tzinfo] = {}


def _zone(name: str, fallback_minutes: int) -> tzinfo:
    if name not in _TZ_CACHE:
        tz: tzinfo
        try:
            from zoneinfo import ZoneInfo

            tz = ZoneInfo(name)
        except Exception:  # нет tzdata на сервере — фиксированное смещение
            if name == "Europe/Kyiv":
                return _zone("Europe/Kiev", fallback_minutes)
            tz = timezone(timedelta(minutes=fallback_minutes))
        _TZ_CACHE[name] = tz
    return _TZ_CACHE[name]


def moscow_now() -> datetime:
    return datetime.now(timezone.utc).astimezone(_zone("Europe/Moscow", 180))


def _city_key(text: str) -> str:
    s = text.lower().replace("ё", "е").strip()
    s = re.sub(r"^(?:во?|in)\s+", "", s)
    return re.sub(r"[^a-zа-яії]", "", s)


def _find_city(text: str) -> tuple[str, str, int] | None:
    key = _city_key(text)
    if not key:
        return None
    if key in _CITIES:
        return _CITIES[key]
    # «в Москве», «в Лондоне», «в Питере»
    if key.endswith("е"):
        for guess in (key[:-1] + "а", key[:-1]):
            if guess in _CITIES:
                return _CITIES[guess]
    return None


_OFFSET_RE = re.compile(r"^(utc|gmt|мск|msk)?\s*([+-])\s*(\d{1,2})(?:[:.]?(\d{2}))?$")


def _parse_offset(text: str) -> tuple[str, tzinfo] | None:
    m = _OFFSET_RE.match(text.lower().replace(" ", ""))
    if not m:
        return None
    base, sign, hh, mm = m.groups()
    minutes = int(hh) * 60 + int(mm or 0)
    if int(mm or 0) >= 60:
        return None
    minutes = -minutes if sign == "-" else minutes
    if base in ("мск", "msk"):
        minutes += 180
    if not -12 * 60 <= minutes <= 14 * 60:
        return None
    label_sign = "+" if minutes >= 0 else "−"
    h, mi = divmod(abs(minutes), 60)
    label = f"UTC{label_sign}{h}" + (f":{mi:02d}" if mi else "")
    return label, timezone(timedelta(minutes=minutes))


def _date_ru(d: date, with_year: bool = False) -> str:
    out = f"{d.day} {MONTHS_GEN[d.month - 1]}"
    return f"{out} {d.year}" if with_year else out


# ───────────────────────── калькулятор ─────────────────────────


class CalcError(ValueError):
    pass


_MAX_INT = 10 ** 1000


def _num(x):
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        raise CalcError("Получилось что-то странное (например, корень из отрицательного числа)")
    if isinstance(x, float) and (math.isinf(x) or math.isnan(x)):
        raise CalcError("Слишком большое число, калькулятор сдался")
    if isinstance(x, int) and abs(x) > _MAX_INT:
        raise CalcError("Слишком большое число, калькулятор сдался")
    return x


def _pow(a, b):
    if abs(b) > 10000:
        raise CalcError("Слишком большая степень")
    if isinstance(a, int) and isinstance(b, int) and b > 0 and abs(a) > 1 and b * math.log10(abs(a)) > 1000:
        raise CalcError("Слишком большое число, калькулятор сдался")
    if a == 0 and b < 0:
        raise ZeroDivisionError
    return a ** b


def _trig(fn):
    def inner(x):
        r = fn(math.radians(x))
        return round(r, 12)
    return inner


def _tan(x):
    if round(math.cos(math.radians(x)), 12) == 0:
        raise CalcError(f"Тангенс {x}° не существует")
    return round(math.tan(math.radians(x)), 12)


def _sqrt(x):
    if x < 0:
        raise CalcError("Корень из отрицательного числа не извлекается")
    return math.sqrt(x)


def _log(x, base=math.e):
    if x <= 0 or base <= 0 or base == 1:
        raise CalcError("Логарифм определён только для положительных чисел")
    return math.log(x, base)


def _lg(x):
    return _log(x, 10)


def _round(x, nd=0):
    if not isinstance(nd, int) or not -20 <= nd <= 20:
        raise CalcError("round(x, n): n — целое от -20 до 20")
    return round(x, nd) if nd else round(x)


def _fact(n):
    if isinstance(n, float) and n.is_integer():
        n = int(n)
    if not isinstance(n, int) or n < 0 or n > 450:
        raise CalcError("Факториал — только для целых от 0 до 450")
    return math.factorial(n)


_FUNCS = {
    "sqrt": (_sqrt, 1, 1), "корень": (_sqrt, 1, 1),
    "sin": (_trig(math.sin), 1, 1), "cos": (_trig(math.cos), 1, 1),
    "tan": (_tan, 1, 1), "tg": (_tan, 1, 1),
    "log": (_log, 1, 2), "ln": (_log, 1, 1), "lg": (_lg, 1, 1),
    "abs": (abs, 1, 1), "round": (_round, 1, 2), "fact": (_fact, 1, 1),
}
_CONSTS = {"pi": math.pi, "e": math.e}
_BINOPS = {
    ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv, ast.Mod: operator.mod, ast.Pow: _pow,
}


def _eval(node):
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        return _num(node.value)
    if isinstance(node, ast.Name) and node.id in _CONSTS:
        return _CONSTS[node.id]
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        v = _eval(node.operand)
        return -v if isinstance(node.op, ast.USub) else v
    if isinstance(node, ast.BinOp) and type(node.op) in _BINOPS:
        a, b = _eval(node.left), _eval(node.right)
        return _num(_BINOPS[type(node.op)](a, b))
    if (isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _FUNCS
            and not node.keywords):
        fn, lo, hi = _FUNCS[node.func.id]
        if not lo <= len(node.args) <= hi:
            raise CalcError(f"Не то количество чисел в {node.func.id}()")
        return _num(fn(*[_eval(a) for a in node.args]))
    if isinstance(node, ast.Name):
        raise CalcError(f"Не знаю, что такое «{node.id}»")
    raise CalcError("Не понял пример")


def _prepare(expr: str) -> str:
    s = expr.lower().replace("ё", "е")
    s = s.replace("×", "*").replace("·", "*").replace("∙", "*").replace("÷", "/").replace(":", "/")
    s = s.replace("−", "-").replace("–", "-").replace("^", "**").replace("π", "pi").replace("пи", "pi")
    s = re.sub(r"(?<=[\d)\s])[xх](?=[\s\d(])", "*", s)          # 2х2, 3 x 4
    s = re.sub(r"(?<=\d),(?=\d)", ".", s)                       # 2,5 → 2.5
    s = re.sub(r"(?:√|sqrt|корень)\s*(\d+(?:\.\d+)?)", r"sqrt(\1)", s)
    s = s.replace("√", "sqrt")
    s = re.sub(r"(\d+)\s*!", r"fact(\1)", s)                      # 5!
    s = re.sub(r"(\d)\s*\(", r"\1*(", s)                         # 2(3+4)
    s = re.sub(r"\)\s*\(", ")*(", s)                            # (1+2)(3+4)
    return s


def calculate(expr: str):
    """Безопасно посчитать пример. Бросает CalcError с понятным текстом."""
    expr = expr.strip().rstrip("=?").strip()
    if not expr:
        raise CalcError("Пустой пример")
    if len(expr) > 200:
        raise CalcError("Слишком длинный пример — максимум 200 символов")
    try:
        tree = ast.parse(_prepare(expr), mode="eval")
        return _eval(tree)
    except CalcError:
        raise
    except ZeroDivisionError:
        raise CalcError("На ноль делить нельзя 🙃") from None
    except OverflowError:
        raise CalcError("Слишком большое число, калькулятор сдался") from None
    except (SyntaxError, ValueError, TypeError):
        raise CalcError("Не понял пример. Пиши, например: 2+2*2, (5-3)^2, sqrt(16)") from None
    except (RecursionError, MemoryError):
        raise CalcError("Слишком сложный пример") from None


def format_number(x) -> str:
    if isinstance(x, float):
        if x.is_integer() and abs(x) < 1e15:
            return str(int(x))
        return f"{x:.10g}"
    s = str(x)
    if len(s.lstrip("-")) > 40:
        return f"≈ {float(x):.8e}" if abs(x) < 10 ** 300 else f"≈ {s[:9]}… ({len(s.lstrip('-'))} цифр)"
    return s


# ───────────────────────── команды ─────────────────────────

_CAT_EMOJI = {"moderation": "🛡", "love": "💘", "animations": "✨", "spam": "📨", "text": "🔤",
              "games": "🎲", "fun": "😂", "utility": "🧰"}


@command("help", category="utility", title="Шпаргалка по командам", usage="help", premium=False,
         description="Пришлю тебе в личку короткую шпаргалку по командам и кнопку настроек. "
                     "Собеседник ничего не увидит.",
         aliases=("хелп", "помощь", "команды"))
async def help_cmd(ctx: Ctx) -> None:
    p = html.escape(ctx.prefix)
    disabled = set(ctx.settings.get("disabled") or [])
    lines = [
        "<b>Шпаргалка 📋</b>",
        f"Пиши команды прямо в чате с человеком. Префикс сейчас: <code>{p}</code>",
        f"По-русски тоже можно: <code>{p}мут</code> = <code>{p}mut</code>",
    ]
    for cat_id, title, _sub in CATEGORIES:
        cmds = [c for c in REGISTRY.values() if c.category == cat_id and c.name not in disabled][:4]
        if not cmds:
            continue
        examples = "  ".join(f"<code>{html.escape(ctx.prefix + c.usage)}</code>" for c in cmds)
        lines.append(f"\n{_CAT_EMOJI.get(cat_id, '•')} <b>{html.escape(title)}</b>\n{examples}")
    custom = ctx.db.list_custom(ctx.owner_id)
    if custom:
        names = ", ".join(f"<code>{html.escape(ctx.prefix + c['trigger'])}</code>" for c in custom[:15])
        more = f" и ещё {len(custom) - 15}" if len(custom) > 15 else ""
        lines.append(f"\n⭐ <b>Твои команды</b>\n{names}{more}")
    kb = None
    if config.webapp_url:
        lines.append("\nПолный список с описаниями и все настройки — в мини-приложении 👇")
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="⚙️ Открыть настройки", web_app=WebAppInfo(url=config.webapp_url)),
        ]])
    else:
        lines.append("\nПолный список с описаниями — в мини-приложении.")
    text = "\n".join(lines)
    if len(text) > 4000:
        text = text[:3990].rsplit("\n", 1)[0]
    try:
        await ctx.bot.send_message(ctx.owner_id, text, parse_mode="HTML", reply_markup=kb)
    except TelegramAPIError as e:  # владелец не запускал бота в личке
        log.info("help DM failed: %s", e)


MAX_REMIND = 30 * 86400


@command("remind", category="utility", title="Напоминание в чат", usage="remind 10m купить хлеб",
         description="Через указанное время бот напишет в этот чат «⏰ Напоминание: …». "
                     "Время — 30s, 10m, 2h, 1d, до 30 дней.",
         aliases=("напомни",))
async def remind(ctx: Ctx) -> None:
    example = f"{ctx.prefix}remind 10m купить хлеб"
    seconds, text = split_duration(ctx.raw)
    if seconds is None:
        await ctx.hint(f"Сначала время, потом текст: {example}\nВремя можно так: 30s, 10m, 2h, 1d, 1ч30м")
        return
    if seconds > MAX_REMIND:
        await ctx.hint("Напоминать могу максимум через 30 дней.")
        return
    if not text and ctx.reply:
        text = (ctx.reply.text or ctx.reply.caption or "").strip()
    if not text:
        await ctx.hint(f"А о чём напомнить? Допиши текст после времени: {example}")
        return
    if len(text) > 3500:
        await ctx.hint("Текст напоминания слишком длинный — уложись в 3500 символов.")
        return
    ctx.db.add_reminder(ctx.owner_id, ctx.conn_id, ctx.chat_id, now() + seconds, text)
    short = text if len(text) <= 60 else text[:57] + "…"
    await ctx.notify(f"⏰ Ок, напомню в чат с {ctx.peer_name} через {human_duration(seconds)}: «{short}»",
                     html=False)


MAX_TIMER = 600


def _timer_schedule(total: int) -> list[int]:
    """Какие значения показывать: каждую секунду в конце, реже в начале. Заканчивается нулём."""
    values, v = [], total
    while v > 0:
        step = 1 if v <= 30 else 5 if v <= 120 else 15
        v = (v - 1) // step * step
        values.append(v)
    return values


def _timer_frame(left: int, total: int, label: str) -> str:
    m, s = divmod(left, 60)
    filled = round(10 * (total - left) / total)
    bar = "▰" * filled + "▱" * (10 - filled)
    head = f"⏳ {label}" if label else "⏳ Таймер"
    return f"{head}\n{m}:{s:02d}  {bar}"


@command("timer", category="utility", title="Таймер обратного отсчёта", usage="timer 30s",
         description="В чате появится живой таймер, который тикает прямо на глазах, а в конце напишет "
                     "«Время вышло!». До 10 минут, можно с подписью: .timer 5m чай",
         aliases=("таймер",))
async def timer(ctx: Ctx) -> None:
    seconds, label = split_duration(ctx.raw)
    if seconds is None:
        await ctx.hint(f"Укажи время: {ctx.prefix}timer 30s или {ctx.prefix}timer 5m чай заварился")
        return
    if seconds > MAX_TIMER:
        await ctx.hint(f"Таймер — максимум на 10 минут. Для долгого есть {ctx.prefix}remind")
        return
    label = " ".join(label.split())[:100]
    loop = asyncio.get_running_loop()
    start = loop.time()
    msg = await ctx.send(_timer_frame(seconds, seconds, label))
    if msg is None:
        return
    final = "⏰ Время вышло!" + (f"\n{label}" if label else "")
    fails = 0
    for left in _timer_schedule(seconds):
        due = start + seconds - left
        delay = due - loop.time()
        if delay > 0:
            # Настоящее ожидание, без ctx.sleep — скорость анимаций не должна ускорять таймер.
            # Через base.asyncio, чтобы тесты, подменяющие sleep там, подменяли его и здесь.
            await _base.asyncio.sleep(delay)
        elif left and delay < -1:
            continue  # отстали (лаги) — пропускаем устаревший кадр
        ok = await ctx.edit(msg, final if left == 0 else _timer_frame(left, seconds, label))
        fails = 0 if ok else fails + 1
        if fails >= 3:  # сообщение удалили — тикать некуда
            return


@command("calc", category="utility", title="Калькулятор", usage="calc (2+3)*4",
         description="Посчитает пример и отправит в чат ответ вида «2+2 = 4». Понимает скобки, степени (^), "
                     "sqrt, sin/cos (в градусах), log и факториал.",
         aliases=("калк", "посчитай"))
async def calc(ctx: Ctx) -> None:
    expr = " ".join(ctx.text_arg().split())
    if not expr:
        await ctx.hint(f"Напиши пример: {ctx.prefix}calc 2+2*2")
        return
    try:
        result = calculate(expr)
    except CalcError as e:
        await ctx.hint(str(e))
        return
    shown = expr.rstrip("=?").strip()
    await ctx.send(f"{shown} = {format_number(result)}")


@command("time", category="utility", title="Который час", usage="time Токио",
         description="Покажет, сколько сейчас времени — по Москве или в другом городе: Лондон, Токио, "
                     "Нью-Йорк, Алматы… Можно указать пояс, например +5.",
         aliases=("время",))
async def time_cmd(ctx: Ctx) -> None:
    arg = ctx.raw.strip()
    if not arg:
        title, tz = "Москва", _zone("Europe/Moscow", 180)
    else:
        offset = _parse_offset(arg)
        found = None if offset else _find_city(arg)
        if offset:
            title, tz = offset
        elif found:
            title, tz = found[0], _zone(found[1], found[2])
        else:
            await ctx.hint(f"Не знаю такой город. Есть: {_CITY_HELP}. Или напиши пояс: {ctx.prefix}time +5")
            return
    t = datetime.now(timezone.utc).astimezone(tz)
    await ctx.send(f"🕐 {title} — {t:%H:%M}\n{WEEKDAYS[t.weekday()]}, {_date_ru(t.date())}")


@command("id", category="utility", title="Узнать ID", usage="id",
         description="Пришлю тебе в личку ID этого чата и собеседника. В чат ничего не уходит.",
         aliases=("айди",))
async def id_cmd(ctx: Ctx) -> None:
    chat = ctx.msg.chat
    lines = [
        f"🆔 <b>{html.escape(ctx.peer_name)}</b>",
        f"ID чата: <code>{chat.id}</code>",
        f"ID собеседника: <code>{ctx.peer_id}</code>",
        "Юзернейм: " + (f"@{html.escape(chat.username)}" if chat.username else "нет"),
        f"Твой ID: <code>{ctx.owner_id}</code>",
    ]
    if ctx.reply:
        lines.append(f"ID сообщения, на которое ответил: <code>{ctx.reply.message_id}</code>")
    await ctx.notify("\n".join(lines))


@command("info", category="utility", title="Инфо о собеседнике", usage="info",
         description="Пришлю тебе в личку имя, юзернейм и ID собеседника, сколько сообщений видел бот "
                     "и есть ли мут. Собеседник ничего не увидит.",
         aliases=("инфо",))
async def info(ctx: Ctx) -> None:
    chat = ctx.msg.chat
    stats = ctx.db.chat_stats(ctx.owner_id, ctx.chat_id)
    mute = next((m for m in ctx.db.list_mutes(ctx.owner_id) if m["chat_id"] == ctx.chat_id), None)
    if not mute:
        mute_line = "нет"
    elif mute["until"] is None:
        mute_line = "навсегда"
    else:
        mute_line = "ещё " + human_duration(mute["until"] - now(), short=True)
    days = config.log_retention_days
    lines = [
        f"👤 <b>{html.escape(ctx.peer_name)}</b>",
        "Юзернейм: " + (f"@{html.escape(chat.username)}" if chat.username else "нет"),
        f"ID: <code>{ctx.peer_id}</code>",
        "",
        f"💬 Бот видел {count(stats['total'], ('сообщение', 'сообщения', 'сообщений'))} "
        f"за последние {count(days, ('день', 'дня', 'дней'))}",
        f"Твоих — {stats['mine']}, собеседника — {stats['theirs']}",
        f"🔇 Мут: {mute_line}",
    ]
    await ctx.notify("\n".join(lines))


@command("poll", category="utility", title="Создать опрос", usage="poll Куда идём? | Кино | Парк | Дом",
         description="Отправит в чат настоящий опрос с кнопками. Вопрос и варианты разделяй чертой |, "
                     "вариантов — от 2 до 10.",
         aliases=("опрос",))
async def poll(ctx: Ctx) -> None:
    example = f"{ctx.prefix}poll Куда идём? | Кино | Парк | Дом"
    raw = ctx.raw.strip()
    parts = raw.split("|") if "|" in raw else raw.split("\n")
    parts = [" ".join(p.split()) for p in parts]
    parts = [p for p in parts if p]
    if len(parts) < 3:
        await ctx.hint(f"Нужен вопрос и хотя бы 2 варианта через черту: {example}")
        return
    question, options, seen = parts[0], [], set()
    for opt in parts[1:]:
        if opt.lower() not in seen:
            seen.add(opt.lower())
            options.append(opt)
    if len(options) < 2:
        await ctx.hint("Варианты повторяются — нужно хотя бы 2 разных.")
        return
    if len(options) > 10:
        await ctx.hint("Вариантов может быть максимум 10.")
        return
    if len(question) > 300:
        await ctx.hint("Вопрос слишком длинный — максимум 300 символов.")
        return
    if any(len(o) > 100 for o in options):
        await ctx.hint("Каждый вариант — максимум 100 символов.")
        return
    try:
        m = await ctx.bot.send_poll(
            chat_id=ctx.chat_id, question=question, question_parse_mode=None,
            options=[InputPollOption(text=o, text_parse_mode=None) for o in options],
            business_connection_id=ctx.conn_id, is_anonymous=False,
        )
    except TelegramAPIError as e:
        await ctx.hint(f"Telegram не принял опрос: {e}")
        return
    ctx.db.log_message(ctx.owner_id, ctx.chat_id, m.message_id, ctx.owner_id, question, "poll")


_PW_SYMBOLS = "!@#$%*-_+=?"
_PW_ALPHABET = string.ascii_letters + string.digits + _PW_SYMBOLS


def make_password(length: int) -> str:
    while True:
        pw = "".join(secrets.choice(_PW_ALPHABET) for _ in range(length))
        if (any(c.islower() for c in pw) and any(c.isupper() for c in pw)
                and any(c.isdigit() for c in pw) and any(c in _PW_SYMBOLS for c in pw)):
            return pw


@command("password", category="utility", title="Сгенерировать пароль", usage="password 16",
         description="Придумает надёжный пароль и пришлёт тебе в личку — в чат он не попадёт. "
                     "Длина от 6 до 64, по умолчанию 14.",
         aliases=("пароль",))
async def password(ctx: Ctx) -> None:
    length, note = 14, ""
    if ctx.args:
        if not re.fullmatch(r"\d{1,6}", ctx.args[0]):
            await ctx.hint(f"Длину пиши числом: {ctx.prefix}password 16")
            return
        asked = int(ctx.args[0])
        length = min(64, max(6, asked))
        if length != asked:
            note = f"\n(можно от 6 до 64 символов, поэтому сделал {length})"
    pw = make_password(length)
    await ctx.notify(f"🔐 Твой новый пароль:\n<code>{html.escape(pw)}</code>\n\n"
                     f"Нажми на него, чтобы скопировать. В чат он не ушёл.{html.escape(note)}")


_RANGE_RE = re.compile(r"^(-?\d{1,18})\s*(?:-|–|—|\.\.|до|to)\s*(-?\d{1,18})$")


@command("random", category="utility", title="Случайное число", usage="random 1 100",
         description="Выкинет случайное число в заданном диапазоне и отправит в чат. Без чисел — от 1 до 100.",
         aliases=("рандом",))
async def random_cmd(ctx: Ctx) -> None:
    raw = ctx.raw.strip().lower()
    lo, hi = 1, 100
    if raw:
        nums = raw.split()
        if not (len(nums) == 2 and all(re.fullmatch(r"-?\d{1,18}", n) for n in nums)):
            m = _RANGE_RE.match(raw)  # «1-100», «1..100», «от 1 до 100» без пробелов
            nums = [m.group(1), m.group(2)] if m else nums
        if not 1 <= len(nums) <= 2 or not all(re.fullmatch(r"-?\d{1,18}", n) for n in nums):
            await ctx.hint(f"Напиши диапазон числами: {ctx.prefix}random 1 100 или {ctx.prefix}random 6")
            return
        if len(nums) == 1:
            lo, hi = 1, int(nums[0])
        else:
            lo, hi = int(nums[0]), int(nums[1])
        lo, hi = min(lo, hi), max(lo, hi)
    value = random.randint(lo, hi)
    await ctx.send(f"🎲 Число от {lo} до {hi}… выпало {value}!")


_MONTH_KEYS = {name[:3]: i + 1 for i, name in enumerate(MONTHS_GEN)}
_MONTH_KEYS["май"] = 5
_DATE_NUM_RE = re.compile(r"^(\d{1,2})[./\-](\d{1,2})(?:[./\-](\d{2}|\d{4}))?$")
_DATE_WORD_RE = re.compile(r"^(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?(?:\s*г(?:ода|\.)?)?$")


def _parse_day(text: str) -> tuple[int, int, int | None] | None:
    s = text.lower().replace("ё", "е").strip()
    m = _DATE_NUM_RE.match(s)
    if m:
        d, mo, y = m.groups()
        year = None if y is None else (2000 + int(y) if len(y) == 2 else int(y))
        return int(d), int(mo), year
    m = _DATE_WORD_RE.match(s)
    if m:
        d, word, y = m.groups()
        mo = _MONTH_KEYS.get(word[:3])
        if mo:
            return int(d), mo, int(y) if y else None
    return None


@command("days", category="utility", title="Сколько дней до даты", usage="days 31.12",
         description="Посчитает, сколько дней осталось до нужной даты: 31.12, 01.09.2027 или «1 сентября». "
                     "Без даты — до Нового года.",
         aliases=("дни",))
async def days(ctx: Ctx) -> None:
    today = moscow_now().date()
    raw = ctx.raw.strip()
    if not raw or raw.lower() in ("нг", "новый год", "ny"):
        target = date(today.year + 1, 1, 1)
        left = (target - today).days
        await ctx.send(f"🎄 До Нового года {_left_word(left)} {count(left, ('день', 'дня', 'дней'))}!")
        return
    parsed = _parse_day(raw)
    if not parsed:
        await ctx.hint(f"Напиши дату так: {ctx.prefix}days 31.12, {ctx.prefix}days 01.09.2027 "
                       f"или {ctx.prefix}days 1 сентября")
        return
    d, mo, year = parsed
    target = None
    if year is not None:
        if 1 <= year <= 9999:
            try:
                target = date(year, mo, d)
            except ValueError:
                target = None
    else:
        # Без года: ближайшая такая дата (сегодня или позже); 29.02 — ближайший високосный год
        for y in range(today.year, today.year + 9):
            try:
                candidate = date(y, mo, d)
            except ValueError:
                continue
            if candidate >= today:
                target = candidate
                break
    if target is None:
        await ctx.hint("Такой даты не бывает 🙂 Проверь день и месяц.")
        return
    diff = (target - today).days
    shown = _date_ru(target, with_year=target.year != today.year)
    if diff == 0:
        text = f"📅 {shown} — это сегодня! 🎉"
    elif diff == 1:
        text = f"📅 До {shown} остался 1 день — это уже завтра!"
    elif diff > 0:
        text = f"📅 До {shown} {_left_word(diff)} {count(diff, ('день', 'дня', 'дней'))}"
    else:
        passed = -diff
        verb = "прошёл" if plural(passed, ("1", "2", "5")) == "1" else "прошло"
        text = f"📅 С {shown} уже {verb} {count(passed, ('день', 'дня', 'дней'))}"
    await ctx.send(text)


def _left_word(n: int) -> str:
    return "остался" if plural(n, ("1", "2", "5")) == "1" else "осталось"
