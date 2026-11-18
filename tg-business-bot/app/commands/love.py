"""Романтика: сердечки, цветы, комплименты и прочие милые анимации.

Кадры собираются программно из эмодзи. В строке картинки не больше 10 эмодзи,
чтобы ничего не разъезжалось на телефоне. Текст пользователя уходит без HTML.
Фразы без рода («скучаю», «у тебя», «с тобой»), потому что пол собеседника неизвестен.
"""

from __future__ import annotations

import hashlib
import html
import math
import random
import re
from datetime import datetime, timedelta, timezone

from .base import Ctx, command

MSK = timezone(timedelta(hours=3))
MAX_LEN = 4000
RAINBOW = ("❤️", "🧡", "💛", "💚", "💙", "💜")
WHITE = "🤍"


# ───────────────────────── помощники ─────────────────────────

def _clip(text: str | None, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _uniq(frames: list[str]) -> list[str]:
    """Без пустых кадров и без одинаковых подряд (иначе Telegram: «message is not modified»)."""
    out: list[str] = []
    for frame in frames:
        frame = _clip(frame, MAX_LEN)
        if frame and (not out or out[-1] != frame):
            out.append(frame)
    return out


def _daily(ctx: Ctx, name: str, extra: str = "") -> int:
    """Одно и то же число для пары собеседников в течение дня (по Москве)."""
    a, b = sorted((ctx.owner_id, ctx.peer_id))
    day = datetime.now(MSK).strftime("%Y-%m-%d")
    key = f"{a}:{b}:{day}:{name}:{extra.strip().lower()}"
    return int.from_bytes(hashlib.sha256(key.encode()).digest()[:8], "big")


def _word_steps(text: str, max_steps: int) -> list[str]:
    """Промежуточные кадры «текст появляется по словам» (без последнего, полного)."""
    tokens = re.findall(r"\S+\s*", text)
    if len(tokens) < 2:
        return []
    steps = min(len(tokens), max_steps)
    return ["".join(tokens[: math.ceil(len(tokens) * j / steps)]).strip() for j in range(1, steps)]


def _owner_name(ctx: Ctx) -> str:
    user = ctx.msg.from_user
    return _clip((user.first_name if user else "") or "Я", 24)


# ───────────────────────── люблю ─────────────────────────

@command("love", category="love", title="Признание с сердечками",
         usage="love ты лучше всех",
         description="Сердечки расходятся цветной волной и складываются в признание. "
                     "Без текста напишет фразу из настроек.",
         aliases=("люблю",))
async def love(ctx: Ctx) -> None:
    text = _clip(ctx.raw or ctx.settings.get("love_text") or "люблю тебя", 500)
    frames: list[str] = []
    # волна сердечек растёт из центра
    for k in range(5):
        frames.append("".join(RAINBOW[abs(i - k) % 6] for i in range(2 * k + 1)))
    # и переливается наружу
    for s in range(1, 4):
        frames.append("".join(RAINBOW[(abs(i - 4) - s) % 6] for i in range(9)))
    frames.append("💖")
    beats = ("💗", "💓")
    for j, part in enumerate(_word_steps(text, 5)):
        frames.append(f"{beats[j % 2]} {part}")
    if "\n" in text or len(text) > 40:
        frames.append(f"💖\n{text}")
    else:
        frames.append(f"❤️ {text} ❤️")
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── цветы ─────────────────────────

BOUQUETS = (
    ("🌷", "🌹", "🌸", "🌹", "🌷"),
    ("🌼", "🌸", "🌺", "🌸", "🌼"),
    ("🌻", "🌼", "🌻", "🌼", "🌻"),
    ("🌹", "🌹", "🌹", "🌹", "🌹"),
    ("🌸", "🌷", "🌺", "🌷", "🌸"),
    ("🌷", "🌼", "🌷", "🌼", "🌷"),
)


@command("flowers", category="love", title="Вырастить букет",
         usage="flowers это тебе 💐",
         description="Прямо в сообщении из семечек вырастают цветы и собираются в букет с бантиком. "
                     "В конце — твоя подпись или фраза из настроек.",
         aliases=("цветы",))
async def flowers(ctx: Ctx) -> None:
    text = _clip(ctx.raw or ctx.settings.get("flowers_text") or "это тебе 💐", 500)
    bloom = random.choice(BOUQUETS)
    soil = "🟫" * 5
    stems = "🌿" * 5
    sprouts = "🌱" * 5
    frames = [
        f"{soil}\n\n🌰 сажаю семечки…",
        f"{'💧' * 5}\n{soil}\n\n💦 поливаю…",
        f"{sprouts}\n{soil}\n\n☀️ проклёвываются…",
        f"{sprouts}\n{stems}\n{soil}\n\n☀️ тянутся к солнцу…",
    ]
    top = ["🌱"] * 5
    for col in (2, 1, 3, 0, 4):  # распускаются от центра к краям
        top[col] = bloom[col]
        frames.append("".join(top) + f"\n{stems}\n{soil}\n\n🌼 распускаются…")
    flowers_row = "".join(bloom)
    tied = "🌿🌿🎀🌿🌿"
    frames.append(f"{flowers_row}\n{tied}\n\n🎀 собираю букет…")
    frames.append(f"{flowers_row}\n{tied}\n\n{text}")
    await ctx.animate(_uniq(frames), 0.7)


# ───────────────────────── сердце ─────────────────────────

HEART = (
    ".XX...XX.",
    "XXXX.XXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X....",
)
_HEART_CELLS = {(r, c) for r, row in enumerate(HEART) for c, ch in enumerate(row) if ch == "X"}
_HEART_OUTLINE = {
    (r, c) for r, c in _HEART_CELLS
    if any((r + dr, c + dc) not in _HEART_CELLS for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)))
}


def _heart(rows: int, paint) -> str:
    width = len(HEART[0])
    return "\n".join("".join(paint(r, c) for c in range(width)) for r in range(rows))


@command("heart", category="love", title="Большое сердце",
         usage="heart",
         description="Рисует большое сердце из эмодзи строчка за строчкой, переливает его радугой "
                     "и заливает красным.",
         aliases=("сердце",))
async def heart(ctx: Ctx) -> None:
    height = len(HEART)
    frames: list[str] = []

    def outline(r: int, c: int) -> str:
        return "❤️" if (r, c) in _HEART_OUTLINE else WHITE

    for n in range(1, height + 1):
        frames.append(_heart(n, outline))
    for s in range(4):
        frames.append(_heart(height, lambda r, c, s=s: RAINBOW[(r + c - s) % 6]
                             if (r, c) in _HEART_OUTLINE else WHITE))
    for level in (5, 3, 0):  # заливка снизу вверх
        frames.append(_heart(height, lambda r, c, lv=level: "❤️"
                             if (r, c) in _HEART_OUTLINE or ((r, c) in _HEART_CELLS and r >= lv) else WHITE))
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── сердечки ─────────────────────────

def _hearts_grid(rows: int, width: int, t: int, sparkles: set[tuple[int, int]] = frozenset()) -> str:
    lines = []
    for r in range(rows):
        lines.append("".join("✨" if (r, c) in sparkles else RAINBOW[(c + 2 * r + t) % 6] for c in range(width)))
    return "\n".join(lines)


@command("hearts", category="love", title="Переливы сердечек",
         usage="hearts",
         description="Ряды разноцветных сердечек переливаются и мерцают, а потом собираются в одно 💞.",
         aliases=("сердечки",))
async def hearts(ctx: Ctx) -> None:
    rows, width = 4, 8
    frames = [_hearts_grid(n, width, n - 1) for n in range(1, rows + 1)]
    for t in range(rows, rows + 5):
        sparkles = {(random.randrange(rows), random.randrange(width)) for _ in range(2)}
        frames.append(_hearts_grid(rows, width, t, sparkles))
    t = rows + 5
    for n, w in ((3, 6), (2, 4), (1, 2)):
        frames.append(_hearts_grid(n, w, t))
        t += 1
    frames.append("💞")
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── поцелуй ─────────────────────────

@command("kiss", category="love", title="Воздушный поцелуй",
         usage="kiss",
         description="Смайлик посылает воздушный поцелуй, 💋 летит через весь экран и попадает точно в цель. "
                     "Можно дописать свою подпись.",
         aliases=("поцелуй",))
async def kiss(ctx: Ctx) -> None:
    frames = ["🙂", "😗", "😙", "😘"]
    track = 5
    for i in range(track):
        cells = ["·"] * track
        cells[i] = "💋"
        frames.append("😘 " + " ".join(cells) + " 🙂")
    dots = " ".join(["·"] * track)
    frames.append(f"😘 {dots} 😳💋")
    frames.append(f"😘 {dots} ☺️💕")
    note = _clip(ctx.raw, 500)
    frames.append(f"😘💋 {note}" if note else "😘 чмок-чмок 💋")
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── обнять ─────────────────────────

@command("hug", category="love", title="Крепкие обнимашки",
         usage="hug",
         description="Два смайлика бегут навстречу друг другу и крепко обнимаются. "
                     "Можно дописать свою подпись.",
         aliases=("обнять",))
async def hug(ctx: Ctx) -> None:
    frames = ["👐"]
    for gap in (8, 6, 4, 2):
        frames.append("🤗" + " ·" * gap + " 🤗")
    frames += ["🤗🤗", "🫂", "🫂💞"]
    note = _clip(ctx.raw, 500)
    frames.append(f"🫂 {note}" if note else "🫂 Обнимаю крепко-крепко 💞")
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── комплимент ─────────────────────────

COMPLIMENTS = (
    "С тобой даже молчать уютно.",
    "У тебя самый заразительный смех. Я начинаю улыбаться раньше, чем понимаю шутку.",
    "Ты умеешь сделать из обычного вторника хороший день. Это суперспособность, если что.",
    "Рядом с тобой как-то спокойнее. Не знаю, как это работает, но работает.",
    "У тебя очень добрые глаза. Сразу видно хорошего человека.",
    "Ты из тех, кому хочется написать первым, когда случилось что-то классное.",
    "Твои сообщения — лучшее уведомление на моём телефоне.",
    "С тобой можно и поржать до слёз, и поговорить о важном. Редкое сочетание.",
    "У тебя отличный вкус. В музыке, в мемах и в людях (я же тут 😌).",
    "Ты очень красиво улыбаешься. Делай это почаще, ладно?",
    "Если бы у доброты была аватарка, там стояло бы твоё фото.",
    "Ты умеешь слушать по-настоящему. Это вообще редкость.",
    "У тебя голос, который хочется слушать. Даже голосовые на три минуты.",
    "С тобой время летит так, будто кто-то включил x2.",
    "Мир чуть-чуть лучше просто потому, что ты в нём есть.",
    "С тобой не надо гадать, что ты думаешь. Твоя честность очень подкупает.",
    "Ты тот самый человек, ради которого стоит проверять телефон.",
    "От тебя такая тёплая энергия, что греет даже через экран.",
    "С тобой интересно спорить. И ещё интереснее соглашаться.",
    "Если бы был топ лучших людей, тебя бы забанили за читы — слишком высоко.",
    "Встретить тебя — как найти алмазы на первом же спуске в шахту. Повезло так повезло 💎",
    "Даже крипер передумал бы взрываться рядом с тобой. Слишком мило.",
    "У тебя талант поднимать настроение. За это вообще-то надо платить.",
    "Мне нравится, как ты думаешь. Нестандартно и по-своему.",
    "С тобой любая прогулка превращается в маленькое приключение.",
    "Ты скидываешь лучшие мемы из всех, что мне присылают.",
    "Ты умеешь поддержать так, что сразу хочется горы свернуть.",
    "Ты настоящий человек: без масок и понтов. Это очень круто.",
    "Мне повезло, что ты есть у меня в контактах. И в жизни.",
    "Твоя улыбка лучше любого фильтра в TikTok.",
    "Ты как плед и какао в дождливый вечер.",
    "У тебя классный стиль. Видно, что он твой, а не с Pinterest.",
    "С тобой не страшно быть собой.",
    "Ты умеешь радоваться мелочам, и это очень заразно.",
    "Ты из тех немногих, с кем мне никогда не скучно.",
    "Твоя доброта не показная, и это чувствуется.",
    "Ты как солнце в ноябре: редкость и сразу праздник ☀️",
    "Твой смех — мой любимый звук.",
    "После разговора с тобой хочется что-то делать. Ты очень вдохновляешь.",
    "Тебе очень идёт улыбка. Носи её почаще.",
    "С тобой даже очередь в столовке не кажется скучной.",
    "Ты так интересно рассказываешь, что я забываю про телефон. А это показатель.",
    "Ты — человек-уют.",
    "С тобой не страшно даже в хардкор-режим.",
    "У тебя очень красивые глаза. Это не подкат, это факт.",
    "Ты всегда находишь нужные слова. Как будто у тебя есть шпаргалка.",
    "Ты умеешь быть рядом, даже когда мы далеко.",
    "Ты — лучшее, что случилось со мной за эту неделю. И это не преувеличение.",
    "С тобой хочется делиться всем: и мемами, и мыслями.",
    "С тобой спокойно, как после сохранения перед боссом.",
    "У тебя золотое сердце. И, кажется, бесконечный запас терпения ко мне 😅",
    "Каждый раз, когда ты пишешь, мой день становится лучше. Проверено.",
    "Никогда не знаю, чего от тебя ждать — и это кайф.",
    "С тобой даже плохая погода кажется уютной.",
    "Ты умеешь смешно рассказывать даже про скучные вещи. Это талант.",
    "Тебя хочется позвать в команду в любой игре. Без раздумий.",
    "Ты как любимый трек: хочется поставить на repeat.",
    "Твоя искренность — как редкий скин. Цени его.",
)

_last_compliment: dict[int, str] = {}


@command("compliment", category="love", title="Искренний комплимент",
         usage="compliment",
         description="Пишет собеседнику случайный тёплый комплимент — как будто печатаешь его прямо сейчас. "
                     "В базе больше полусотни фраз, подряд не повторяются.",
         aliases=("комплимент",))
async def compliment(ctx: Ctx) -> None:
    pool = [c for c in COMPLIMENTS if c != _last_compliment.get(ctx.owner_id)]
    text = random.choice(pool)
    _last_compliment[ctx.owner_id] = text
    frames = ["💭"]
    for part in _word_steps(text, 5):
        frames.append(part + "▌")
    frames.append(text)
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── валентинка ─────────────────────────

VALENTINE_LINES = (
    "Ты — моё любимое уведомление 💕",
    "Спасибо, что ты есть. Правда ❤️",
    "С тобой даже понедельники ничего так 😌",
    "Ты делаешь мои дни теплее ☀️",
    "Если что, ты лучше всех. Это официально 💌",
    "Рядом с тобой всё как будто на своём месте 💞",
)


@command("valentine", category="love", title="Валентинка с рамкой",
         usage="valentine ты делаешь мои дни теплее",
         description="Конверт раскрывается в открытку с рамкой из роз и сердечек, а внутри — твой текст. "
                     "Без текста подставит милую фразу.",
         aliases=("валентинка",))
async def valentine(ctx: Ctx) -> None:
    text = _clip(ctx.raw, 700) or random.choice(VALENTINE_LINES)
    cells = ["🌹" if i % 2 == 0 else "❤️" for i in range(9)]
    border = "".join(cells)
    title = "💌 Валентинка для тебя"
    frames = [
        "💌",
        "💌 Тебе валентинка!",
        "".join(cells[:3]),
        "".join(cells[:6]),
        border,
        f"{border}\n{title}",
        f"{border}\n{title}\n\n{text}",
        f"{border}\n{title}\n\n{text}\n\nС любовью 💋\n{border}",
    ]
    await ctx.animate(_uniq(frames), 0.7)


# ───────────────────────── совместимость ─────────────────────────

VERDICTS = (
    (16, ("Пока искрит слабенько, но совместная пицца творит чудеса 🍕",
          "Связь как Wi-Fi в подвале: есть, но надо поискать 📶")),
    (36, ("Есть контакт! Осталось скинуть друг другу побольше мемов 📲",
          "Неплохое начало — дальше будет только интереснее 🌱")),
    (56, ("Золотая середина: вам точно есть о чём поболтать ✨",
          "Хорошая база. Ещё пара прогулок — и будет огонь 🔥")),
    (76, ("Вы классно совпадаете — это видно даже боту 😏",
          "Отличный мэтч! Берегите эту химию 🧪")),
    (91, ("Почти идеально! Такое редко встречается 💞",
          "Ого! Вам явно хорошо вместе 💘")),
    (101, ("Идеальное совпадение. Даже проверять больше не надо 💖",
           "Вы созданы друг для друга, без вариантов 💘")),
)


def _ship_pair(ctx: Ctx) -> tuple[str, str]:
    raw = _clip(ctx.raw, 60)
    if raw:
        parts = [p.strip() for p in re.split(r"\s*(?:\+|&|\bи\b)\s*", raw, maxsplit=1) if p.strip()]
        if len(parts) == 2:
            return _clip(parts[0], 24), _clip(parts[1], 24)
        return _clip(ctx.peer_name, 24), _clip(raw, 24)
    return _owner_name(ctx), _clip(ctx.peer_name, 24)


@command("ship", category="love", title="Проверка совместимости",
         usage="ship",
         description="Считает совместимость с собеседником: шкала из сердечек заполняется до процента и бот выносит вердикт. "
                     "Можно указать, кого проверять: «ship Аня и Тёма». Весь день результат один и тот же.",
         aliases=("совместимость",))
async def ship(ctx: Ctx) -> None:
    left, right = _ship_pair(ctx)
    target = _daily(ctx, "ship", ctx.raw) % 101
    head = f"💞 Совместимость\n{left} + {right}"

    def frame(p: int) -> str:
        filled = p // 10
        return f"{head}\n\n{'❤️' * filled}{WHITE * (10 - filled)}\n{p}%"

    steps = 8
    frames = [f"{head}\n\n🔍 считаю…"]
    for k in range(steps + 1):
        frames.append(frame(round(target * (1 - (1 - k / steps) ** 3))))
    for limit, options in VERDICTS:
        if target < limit:
            verdict = options[_daily(ctx, "ship-verdict", ctx.raw) % len(options)]
            break
    frames.append(frame(target) + f"\n\n{verdict}")
    await ctx.animate(_uniq(frames), 0.6)


# ───────────────────────── скучаю ─────────────────────────

def _km(value: float) -> str:
    if value < 1:
        return f"{int(value * 1000)} м"
    return f"{int(value):,}".replace(",", " ") + " км"


@command("miss", category="love", title="Скучаю по тебе",
         usage="miss",
         description="Два сердечка на разных концах экрана: километры между ними тают, пока они не встретятся. "
                     "В конце — «скучаю по тебе» или твой текст.",
         aliases=("скучаю",))
async def miss(ctx: Ctx) -> None:
    start = random.randint(700, 3000)
    distances = (start, start * 0.4, start * 0.08, random.uniform(3, 15), random.uniform(0.2, 0.9))
    frames = ["🥺"]
    for dots, dist in zip((8, 6, 4, 2, 1), distances):
        frames.append("❤️" + " ·" * dots + " ❤️\n" + f"между нами {_km(dist)}")
    frames += ["❤️❤️", "💞"]
    note = _clip(ctx.raw, 500)
    frames.append(f"💞 {note}" if note else "💞 скучаю по тебе")
    await ctx.animate(_uniq(frames), 0.7)


# ───────────────────────── я тебя люблю ─────────────────────────

ILY = (
    ("English", "I love you"),
    ("Español", "Te quiero"),
    ("Français", "Je t'aime"),
    ("Deutsch", "Ich liebe dich"),
    ("Italiano", "Ti amo"),
    ("Português", "Eu te amo"),
    ("Українська", "Я тебе кохаю"),
    ("Беларуская", "Я цябе кахаю"),
    ("日本語", "愛してる"),
    ("한국어", "사랑해"),
    ("中文", "我爱你"),
    ("Türkçe", "Seni seviyorum"),
    ("Polski", "Kocham cię"),
    ("Čeština", "Miluji tě"),
    ("Svenska", "Jag älskar dig"),
    ("Suomi", "Rakastan sinua"),
    ("Ελληνικά", "Σ' αγαπώ"),
    ("Nederlands", "Ik hou van jou"),
    ("Esperanto", "Mi amas vin"),
    ("Қазақша", "Мен сені сүйемін"),
)


@command("ily", category="love", title="«Люблю» на разных языках",
         usage="ily",
         description="«Я тебя люблю» по очереди на четырнадцати языках — от английского до корейского, "
                     "а в конце по-русски с сердечком.",
         aliases=("ятл",))
async def ily(ctx: Ctx) -> None:
    langs = random.sample(ILY, 14)
    palette = RAINBOW + ("💗", "💖")
    frames = []
    for i, (lang, phrase) in enumerate(langs):
        frames.append(f"{palette[i % len(palette)]} <b>{html.escape(phrase, quote=False)}</b>\n"
                      f"<i>{html.escape(lang, quote=False)}</i>")
    frames.append("❤️ <b>Я тебя люблю</b>\n<i>на любом языке</i>")
    await ctx.animate(_uniq(frames), 0.6, html=True)
