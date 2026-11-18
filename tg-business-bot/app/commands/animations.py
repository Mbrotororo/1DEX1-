"""Анимации: сообщения, которые меняются прямо на глазах у собеседника.

Кадры строятся программно. Картинки-«пиксели» собраны только из эмодзи (так столбцы
не разъезжаются), в строке не больше 10 эмодзи. Сцены с дождём/снегом — «воздушные»,
с пробелами: там точное выравнивание не нужно. Первая строка кадра никогда не начинается
с пробела — Telegram обрезает пробелы в начале сообщения.
"""

from __future__ import annotations

import html
import math
import random
import re

from .base import Ctx, command

MAX_LEN = 4000
BG = "⬛"  # ночное небо / фон для пиксельных сцен


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


def _cluster_end(text: str, i: int) -> int:
    """Сдвинуть позицию разреза так, чтобы не порвать эмодзи (вариации, ZWJ, тон кожи, флаги)."""
    n = len(text)
    while 0 < i < n:
        ch, prev = text[i], text[i - 1]
        o = ord(ch)
        if (ch in "\ufe0f\ufe0e\u200d\u20e3" or prev == "\u200d" or 0x1F3FB <= o <= 0x1F3FF
                or 0xE0020 <= o <= 0xE007F or 0x0300 <= o <= 0x036F):
            i += 1
        elif 0x1F1E6 <= o <= 0x1F1FF:
            k = i
            while k > 0 and 0x1F1E6 <= ord(text[k - 1]) <= 0x1F1FF:
                k -= 1
            if (i - k) % 2 == 1:
                i += 1
            else:
                break
        else:
            break
    return i


def _clusters(text: str) -> list[str]:
    out, i = [], 0
    while i < len(text):
        j = _cluster_end(text, i + 1)
        out.append(text[i:j])
        i = j
    return out


def _grid(rows: list[list[str]]) -> str:
    return "\n".join("".join(r) for r in rows)


def _bar(fraction: float, width: int = 10) -> str:
    filled = round(max(0.0, min(1.0, fraction)) * width)
    return "█" * filled + "░" * (width - filled)


def _peer(ctx: Ctx, limit: int = 32) -> str:
    return _clip(ctx.peer_name, limit) or "собеседник"


# ───────────────────────── печать ─────────────────────────

@command("type", category="animations", title="Эффект печатной машинки",
         usage="type привет, как дела?",
         description="Текст появляется по буквам с мигающим курсором, будто его печатают прямо сейчас. "
                     "Можно ответить командой на сообщение — напечатает его.",
         aliases=("печать",))
async def type_(ctx: Ctx) -> None:
    text = ctx.text_arg("Смотри, это сообщение печатается прямо у тебя на глазах ✨").strip()
    if len(text) > 3900:
        await ctx.hint("Текст длинноват — напечатаю первые 3900 символов.")
        text = _clip(text, 3900)
    n = len(text)
    steps = min(n, 22)
    cuts: list[int] = []
    for k in range(1, steps + 1):
        cut = _cluster_end(text, math.ceil(n * k / steps))
        if cut < n and (not cuts or cut > cuts[-1]):
            cuts.append(cut)
    frames = ["▌"] + [text[:c] + "▌" for c in cuts] + [text]
    await ctx.animate(_uniq(frames), 0.5)


# ───────────────────────── взлом ─────────────────────────

HACK_STEPS = (
    ("подбираю пароль от Minecraft-аккаунта", "пароль Minecraft: ********* (почти)"),
    ("сканирую галерею", "в галерее 37 сохранённых мемов"),
    ("открываю заметки", "заметки: «купить хлеб» ×12"),
    ("проверяю историю поиска", "поиск: «как стать миллионером за неделю»"),
    ("смотрю рекомендации TikTok", "TikTok: 4 часа котиков в день 🐈"),
    ("ищу секретные файлы", "папка «Домашка» (внутри игры)"),
    ("взламываю будильник", "будильник: отложен 9 раз подряд ⏰"),
    ("проверяю плейлист", "одна песня на повторе 214 раз 🎧"),
    ("считаю непрочитанные чаты", "непрочитанных чатов: 99+"),
    ("ищу алмазы в сохранениях", "сохранения: 3 алмаза и 64 земли 💎"),
    ("читаю черновики", "черновик «привет как дела» так и не отправлен"),
)
HACK_ENDINGS = (
    "Опасных данных не найдено. Только хорошее настроение и мемы 😎",
    "Главная уязвимость найдена: слишком хорошее чувство юмора 😄",
    "Доступ получен… к твоей улыбке. Остальное не трогаю 😇",
    "Пароль оказался «12345». Шучу. Наверное 🙃",
)


@command("hack", category="animations", title="Фейковый взлом",
         usage="hack",
         description="Хакерский терминал «взламывает» собеседника: шкала прогресса, пароль от Minecraft, "
                     "37 сохранённых мемов. В конце честно признаётся, что это прикол.",
         aliases=("взлом",))
async def hack(ctx: Ctx) -> None:
    peer = html.escape(_peer(ctx))
    steps = [("подключаюсь к телефону", "подключено 📶")]
    steps += random.sample(HACK_STEPS, 5)
    steps.append(("загружаю всё на секретный сервер", "загрузка завершена"))
    total = len(steps)

    def screen(done: int, current: str | None) -> str:
        pct = round(done / total * 100)
        lines = [f"💻 <b>Взлом: {peer}</b>", f"<code>[{_bar(done / total)}] {pct}%</code>", ""]
        lines += [f"<code>✓ {html.escape(steps[i][1])}</code>" for i in range(max(0, done - 4), done)]
        if current:
            lines.append(f"<code>› {html.escape(current)}…</code>")
        return "\n".join(lines)

    frames = [f"💻 <b>Взлом: {peer}</b>\n<code>&gt; запускаю hack.exe…</code>"]
    for i in range(total):
        frames.append(screen(i, steps[i][0]))
    frames.append(screen(total, None) + f"\n\n✅ <b>Взлом завершён!</b>\n{random.choice(HACK_ENDINGS)}"
                  "\n<i>(это прикол, ничего не взламывалось)</i>")
    await ctx.animate(_uniq(frames), 0.7, html=True)


# ───────────────────────── загрузка ─────────────────────────

_EIGHTHS = ("", "▏", "▎", "▍", "▌", "▋", "▊", "▉")


def _smooth_bar(pct: int, width: int = 12) -> str:
    eighths = round(pct / 100 * width * 8)
    full, rem = divmod(eighths, 8)
    bar = "█" * full + _EIGHTHS[rem]
    return bar + " " * (width - full - (1 if rem else 0))


@command("loading", category="animations", title="Полоска загрузки",
         usage="loading Загружаю хорошее настроение",
         description="Плавная полоска загрузки ползёт от 0 до 100% с твоей подписью — "
                     "например, «Загружаю хорошее настроение».",
         aliases=("загрузка",))
async def loading(ctx: Ctx) -> None:
    label = html.escape(_clip(ctx.raw, 100) or "Загрузка")
    # 10 почти равных шагов с небольшим разбросом — плавно, но «живо»
    points = [0] + [min(97, max(3, round(100 * k / 11 + random.uniform(-3, 3)))) for k in range(1, 11)] + [100]
    frames = []
    for i, pct in enumerate(points[:-1]):
        glass = "⏳" if i % 2 == 0 else "⌛"
        frames.append(f"{glass} {label}…\n<code>[{_smooth_bar(pct)}] {pct:>3}%</code>")
    frames.append(f"✅ {label}\n<code>[{_smooth_bar(100)}] 100%</code>\nГотово!")
    await ctx.animate(_uniq(frames), 0.6, html=True)


# ───────────────────────── отсчёт ─────────────────────────

def _keycap(n: int) -> str:
    return "🔟" if n == 10 else f"{n}\ufe0f\u20e3"


@command("countdown", category="animations", title="Обратный отсчёт",
         usage="countdown 5 С днём рождения! 🎉",
         description="Большие цифры отсчитывают от N до 1 (максимум 10), а потом — «🚀 Поехали!» "
                     "или твоя фраза после числа.",
         aliases=("отсчёт",))
async def countdown(ctx: Ctx) -> None:
    n, text = 5, ctx.raw
    if ctx.args and re.fullmatch(r"-?\d{1,9}", ctx.args[0]):
        n = int(ctx.args[0])
        text = ctx.raw.strip()[len(ctx.args[0]):]
        if n > 10:
            await ctx.hint("Отсчёт максимум с 10 — посчитаю с десяти.")
            n = 10
        elif n < 1:
            await ctx.hint("Отсчёт хотя бы с 1. Пример: countdown 5")
            n = 1
    finale = _clip(text, 1000) or "🚀 Поехали!"
    frames = [_keycap(i) for i in range(n, 0, -1)] + [finale]
    await ctx.animate(_uniq(frames), 1.0)


# ───────────────────────── бомба ─────────────────────────

@command("bomb", category="animations", title="Бомба с фитилём",
         usage="bomb",
         description="Фитиль догорает до бомбы, а потом — БАБАХ! Взрыв, дым и все живы.",
         aliases=("бомба",))
async def bomb(ctx: Ctx) -> None:
    frames = ["💣"]
    for k in range(6, -1, -1):
        frames.append("💣" + "〰️" * k + "🔥")
    frames += [
        "💥",
        "🔥💥🔥\n💥💥💥\n🔥💥🔥",
        "✨🔥💥🔥✨\n🔥💥💥💥🔥\n💥💥💥💥💥\n🔥💥💥💥🔥\n✨🔥💥🔥✨",
        "💨☁️💨☁️💨\n☁️💨☁️💨☁️\n💨☁️💨☁️💨",
        "💥 БАБАХ!\nВсе живы, это была пиротехника 😅",
    ]
    await ctx.animate(_uniq(frames), 0.7)


# ───────────────────────── погода и небо ─────────────────────────

def _drift_rows(count: int, slots: int, glyphs: tuple[str, ...], gap: str = "   ") -> list[str]:
    """Разные строки «осадков»: несколько капель/снежинок вперемешку с пустотой."""
    rows: list[str] = []
    while len(rows) < count:
        pos = set(random.sample(range(slots), random.randint(2, 3)))
        row = "".join(random.choice(glyphs) if i in pos else gap for i in range(slots)).rstrip()
        if row not in rows:
            rows.append(row)
    return rows


def _falling(rows: list[str], t: int, height: int) -> list[str]:
    """Строки сдвигаются вниз на каждом кадре — кажется, что всё падает."""
    return [rows[(t - r) % len(rows)] if r <= t else "" for r in range(height)]


@command("rain", category="animations", title="Дождь за окном",
         usage="rain",
         description="Тучи, капли падают вниз, иногда сверкает молния. Уютная дождливая сцена прямо в чате.",
         aliases=("дождь",))
async def rain(ctx: Ctx) -> None:
    rows = _drift_rows(4, 7, ("💧",))
    clouds = ("🌧️☁️🌧️☁️🌧️☁️", "☁️🌧️☁️🌧️☁️🌧️")
    ground = "🌱🌿🌱🌿🌱🌿"
    frames = ["☁️☁️☁️☁️☁️☁️\n\n" + ground]
    last = ""
    for t in range(9):
        sky = clouds[t % 2]
        drops = _falling(rows, t, 3)
        if t == 5:  # вспышка молнии
            sky = "🌧️⛈️🌧️☁️🌧️☁️"
            drops[0] = drops[0] + "   ⚡"
        last = sky + "\n" + "\n".join(drops) + "\n" + ground
        frames.append(last)
    frames.append(last + "\n\n☔ Дождь за окном, а у нас тут уютно")
    await ctx.animate(_uniq(frames), 0.7)


@command("snow", category="animations", title="Тихий снегопад",
         usage="snow",
         description="Снежинки разных размеров медленно падают на домики и ёлки, а в конце появляется снеговик.",
         aliases=("снег",))
async def snow(ctx: Ctx) -> None:
    rows = _drift_rows(4, 7, ("❄️", "❅", "❆", "❄️"))
    clouds = ("🌨️☁️🌨️☁️🌨️☁️", "☁️🌨️☁️🌨️☁️🌨️")
    ground = "🌲🏠🌲🌲🏡🌲"
    frames = ["☁️☁️☁️☁️☁️☁️\n\n" + ground]
    last_sky = ""
    for t in range(9):
        last_sky = clouds[t % 2] + "\n" + "\n".join(_falling(rows, t, 3))
        frames.append(last_sky + "\n" + ground)
    frames.append(last_sky + "\n🌲⛄🌲🌲🏡🌲\n\n❄️ Снег идёт… самое время для какао ☕")
    await ctx.animate(_uniq(frames), 0.8)


def _flames(level: int) -> list[list[str]]:
    """Костёр 5×5 на ночном фоне. level 0..3 — разгорается, 4 — случайное пламя."""
    g = [[BG] * 5 for _ in range(4)] + [["🪵"] * 5]
    if level == 0:
        g[3][2] = "✨"
    elif level == 1:
        g[3][2] = "🔥"
    elif level == 2:
        g[3][1] = g[3][2] = g[3][3] = "🔥"
        g[2][2] = "🔥"
    elif level == 3:
        g[3] = ["🔥"] * 5
        g[2][1] = g[2][2] = g[2][3] = "🔥"
        g[1][2] = "🔥"
    else:
        g[3] = ["🔥"] * 5
        for c in (1, 2, 3):
            g[2][c] = "🔥"
        for c in (0, 4):
            if random.random() < 0.3:
                g[2][c] = "🔥"
        for c in random.sample((1, 2, 3), random.randint(1, 2)):
            g[1][c] = "🔥"
        if random.random() < 0.7:
            g[0][random.randint(0, 4)] = "✨"
    return g


@command("fire", category="animations", title="Костёр в ночи",
         usage="fire",
         description="Из искры разгорается костёр: пламя пляшет и искрит на ночном фоне.",
         aliases=("огонь",))
async def fire(ctx: Ctx) -> None:
    frames = [_grid(_flames(lv)) for lv in range(4)]
    while len(frames) < 11:
        frame = _grid(_flames(4))
        if frame != frames[-1]:
            frames.append(frame)
    frames.append(frames[-1] + "\n\n🔥 Ты огонь, если что 😏")
    await ctx.animate(_uniq(frames), 0.6)


@command("stars", category="animations", title="Звёздное небо",
         usage="stars",
         description="Ночное небо над городом: звёзды зажигаются и мерцают, а потом пролетает падающая звезда — "
                     "время загадывать желание.",
         aliases=("звёзды",))
async def stars(ctx: Ctx) -> None:
    height, width = 4, 7
    moon = (0, 5)
    path = [(0, 0), (1, 2), (2, 4), (3, 6)]
    free = [(r, c) for r in range(height) for c in range(width) if (r, c) != moon]
    spots = random.sample(free, 8)
    town = "🏠🌲🏡🌲🏠🌲🏡"

    def sky(lit: list[tuple[int, int]], comet: tuple[int, int] | None = None, twinkle: bool = True) -> str:
        g = [[BG] * width for _ in range(height)]
        g[moon[0]][moon[1]] = "🌙"
        for r, c in lit:
            g[r][c] = random.choice(("✨", "⭐", "🌟", "✨", BG)) if twinkle else "✨"
        if comet:
            g[comet[0]][comet[1]] = "💫"
        return _grid(g) + "\n" + town

    frames = [sky(spots[:3], twinkle=False), sky(spots[:6], twinkle=False), sky(spots, twinkle=False)]
    for _ in range(4):
        frames.append(sky(spots))
    for cell in path:
        frames.append(sky(spots, cell))
    frames.append(sky(spots) + "\n\n🌠 Падающая звезда! Загадывай желание")
    await ctx.animate(_uniq(frames), 0.7)


@command("moon", category="animations", title="Фазы луны",
         usage="moon",
         description="Большая луна проходит все фазы от новолуния до полной и обратно — и в конце хитро смотрит 🌚",
         aliases=("луна",))
async def moon(ctx: Ctx) -> None:
    frames = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌝", "🌖", "🌗", "🌘", "🌑", "🌚"]
    await ctx.animate(frames, 0.6)


@command("clock", category="animations", title="Часы тикают",
         usage="clock",
         description="Стрелки часов делают полный круг, а в конце — «время летит» или твоя фраза.",
         aliases=("часы",))
async def clock(ctx: Ctx) -> None:
    frames = [chr(0x1F550 + i) for i in range(12)]  # 🕐 … 🕛
    frames.append("⏰ " + (_clip(ctx.raw, 1000) or "Время летит, когда мы общаемся"))
    await ctx.animate(_uniq(frames), 0.5)


RAINBOW_ROWS = ("🟥", "🟧", "🟨", "🟩", "🟦", "🟪")


@command("rainbow", category="animations", title="Радуга из квадратиков",
         usage="rainbow",
         description="Разноцветные квадратики хаотично мигают и постепенно встают по местам, складываясь в радугу.",
         aliases=("радуга",))
async def rainbow(ctx: Ctx) -> None:
    width = 7
    cells = [(r, c) for r in range(len(RAINBOW_ROWS)) for c in range(width)]
    random.shuffle(cells)
    frames = []
    for step in range(8):
        fixed = set(cells[: len(cells) * step // 7])
        g = [[RAINBOW_ROWS[r] if (r, c) in fixed else random.choice(RAINBOW_ROWS) for c in range(width)]
             for r in range(len(RAINBOW_ROWS))]
        frames.append(_grid(g))
    frames.append(frames[-1] + "\n\n🌈 Держи радугу — для настроения")
    await ctx.animate(_uniq(frames), 0.6)


@command("ghost", category="animations", title="Призрак говорит «Бу»",
         usage="ghost",
         description="Свеча, тишина, туман… из тумана подлетает призрак и как крикнет «БУ!» 👻",
         aliases=("призрак",))
async def ghost(ctx: Ctx) -> None:
    frames = ["🕯️", "🕯️ тсс…", "🕯️ ты тоже это слышишь?"]
    fog = 7
    for pos in (6, 4, 2, 0):
        cells = ["🌫️"] * fog
        cells[pos] = "👻"
        frames.append("".join(cells))
    frames += ["👀", "👻", "👻 БУ!", "👻 БУ!\n\nНу что, страшно? 😏"]
    await ctx.animate(_uniq(frames), 0.7)


SPARKS = "✧✦⋆✶˚"


@command("magic", category="animations", title="Магическое появление",
         usage="magic абракадабра",
         description="Волшебная палочка, искры — и из блёсток постепенно проявляется твой текст. "
                     "Можно ответить командой на сообщение.",
         aliases=("магия",))
async def magic(ctx: Ctx) -> None:
    text = _clip(ctx.text_arg("абракадабра"), 600)
    parts = _clusters(text)
    hidden = [i for i, p in enumerate(parts) if not p.isspace()]
    random.shuffle(hidden)
    frames = ["🪄", "🪄✨", "🪄✨✨✨"]
    for share in (0.0, 0.2, 0.45, 0.7, 0.9):
        shown = set(hidden[: int(len(hidden) * share)])
        masked = "".join(p if p.isspace() or i in shown else random.choice(SPARKS) for i, p in enumerate(parts))
        frames.append(f"🪄 {masked}")
    frames.append(f"✨ {text} ✨")
    await ctx.animate(_uniq(frames), 0.6)


@command("matrix", category="animations", title="Код из Матрицы",
         usage="matrix",
         description="Зелёный код сыпется столбцами, как в фильме, а потом матрица обращается к собеседнику по имени.",
         aliases=("матрица",))
async def matrix(ctx: Ctx) -> None:
    peer = html.escape(_peer(ctx, 24))
    height, width = 6, 16
    columns = []
    for _ in range(width):
        trail = random.randint(3, 5)
        period = height + trail + random.randint(0, 2)
        columns.append((random.randrange(period), trail, period))

    def rain_frame(t: int) -> str:
        rows = []
        for r in range(height):
            line = []
            for offset, trail, period in columns:
                head = (offset + t) % period
                line.append(random.choice("01") if head - trail < r <= head else " ")
            rows.append("".join(line).rstrip())
        return "🟩 <b>матрица на связи</b>\n<code>" + "\n".join(rows) + "</code>"

    frames = [rain_frame(t) for t in range(9)]
    wake = f"<code>Проснись, {peer}…</code>"
    frames += ["<code>Проснись…</code>", wake,
               f"{wake}\n<code>Матрица уже здесь.</code>\n\n🐇 Иди за белым кроликом"]
    await ctx.animate(_uniq(frames), 0.6, html=True)


@command("car", category="animations", title="Машинка едет",
         usage="car",
         description="Машинка заводится и мчит по дороге мимо деревьев и домиков прямо к финишному флагу.",
         aliases=("машина",))
async def car(ctx: Ctx) -> None:
    vehicle = random.choice(("🚗", "🚕", "🚙", "🏎️"))
    scenery = random.choice(("🌳🌲🏠🌳🌲🌳🏡🌲🌳", "🌲🌳🌲🏪🌳🌲🌳🏠🌲", "🌳🏡🌲🌳🌲🏠🌳🌲🌳"))
    width = 9

    def road(pos: int, dust: bool) -> str:
        cells = ["🏁"] + ["➖"] * (width - 1)
        cells[pos] = vehicle
        if dust and pos + 1 < width:
            cells[pos + 1] = "💨"
        return scenery + "\n" + "".join(cells)

    # Эмодзи машин в Telegram смотрят влево, поэтому едем справа налево — так выглядит естественно.
    frames = [road(width - 1, False) + "\n\n🔑 Завожу мотор…"]
    for pos in range(width - 2, 0, -1):
        frames.append(road(pos, True))
    frames.append(road(1, False) + "\n\n🏁 Приехали!")
    await ctx.animate(_uniq(frames), 0.6)


def _launch(rocket_row: int | None, ignition: bool) -> str:
    """Сцена 5×7: космос (чёрный), небо (синее) с облаками, земля. Ракета в центральном столбце."""
    g = [[BG] * 5 for _ in range(3)] + [["🟦"] * 5 for _ in range(3)] + [["🟩"] * 5]
    g[0][1], g[1][4], g[2][0] = "✨", "🪐", "⭐"
    g[3][0], g[4][4] = "☁️", "☁️"
    if rocket_row is not None:
        g[rocket_row][2] = "🚀"
        if ignition and rocket_row + 1 <= 6:
            g[rocket_row + 1][2] = "🔥"
    if ignition:
        g[6][1] = g[6][3] = "💨"
    return _grid(g)


@command("rocket", category="animations", title="Запуск ракеты",
         usage="rocket",
         description="Обратный отсчёт, зажигание — и ракета пролетает сквозь облака прямо в космос.",
         aliases=("ракета",))
async def rocket(ctx: Ctx) -> None:
    frames = [_launch(5, False) + f"\n\nСтарт через {n}…" for n in (3, 2, 1)]
    frames.append(_launch(5, True) + "\n\n🔥 Зажигание!")
    for row in (4, 3, 2, 1, 0):
        frames.append(_launch(row, True))
    frames.append(_launch(None, False) + "\n\n🛰️ Вышли на орбиту. Всем пока! 👋")
    await ctx.animate(_uniq(frames), 0.7)


@command("wave", category="animations", title="Морская волна",
         usage="wave",
         description="По морю катятся волны 🌊, а в финале на гребне появляется сёрфер.",
         aliases=("волна",))
async def wave(ctx: Ctx) -> None:
    width = 8

    def sea(t: int, surfer: bool = False) -> str:
        rows = []
        for r in range(3):
            cells = ["〰️"] * width
            crest = (t + r) % width  # гребни идут наискосок — волна «катится»
            cells[crest] = "🌊"
            cells[(crest + 4) % width] = "🌊"
            if surfer and r == 0:
                cells[crest] = "🏄"
            rows.append("".join(cells))
        return "\n".join(rows)

    frames = [sea(t) for t in range(10)]
    frames.append(sea(10, surfer=True) + "\n\n🏄 Ловим волну!")
    await ctx.animate(_uniq(frames), 0.6)


THOUGHTS = (
    "Вывод: срочно нужна пицца 🍕",
    "Вывод: ты лучше всех. Вопросов больше нет 😌",
    "Короче, всё будет хорошо. Это научный факт 🤝",
    "Мысль была гениальная, но убежала. Бывает 🙃",
    "Решено: идём гулять 🚶",
    "Итог: нужен чай и ты рядом ☕",
    "Ответ — 42. Вопрос уточняется 🤓",
    "Подумалось, что без тебя было бы скучно 💛",
)


@command("think", category="animations", title="Глубокие раздумья",
         usage="think а может в кино?",
         description="Смайлик долго и сосредоточенно думает, а потом выдаёт гениальный вывод — смешной или твой.",
         aliases=("думаю",))
async def think(ctx: Ctx) -> None:
    conclusion = _clip(ctx.raw, 1000) or random.choice(THOUGHTS)
    frames = ["🤔", "🤔 Думаю.", "🤔 Думаю..", "🤔 Думаю...", "🧐 Так-так…", "💭 Ещё секунду…",
              "💡 Есть мысль!", f"💡 {conclusion}"]
    await ctx.animate(_uniq(frames), 0.7)


@command("sad", category="animations", title="Грусть проходит",
         usage="sad",
         description="Хмурая туча, дождик, грустный смайлик… и постепенно выходит солнце. "
                     "В конце — поддержка или твой текст.",
         aliases=("грусть",))
async def sad(ctx: Ctx) -> None:
    cheer = _clip(ctx.raw, 1000) or "Всё наладится, правда 💛"
    frames = [
        "☁️",
        "☁️☁️☁️\n\n😔",
        "🌧️☁️🌧️\n💧\n😔",
        "🌧️🌧️🌧️\n💧   💧   💧\n😢",
        "🌧️🌧️🌧️\n   💧   💧   💧\n😢",
        "🌧️☁️🌧️\n💧      💧\n😔",
        "☁️⛅☁️\n\n😐",
        "🌥️\n\n🙂",
        "🌤️\n\n😊",
        f"🌈☀️\n\n😊 {cheer}",
    ]
    await ctx.animate(_uniq(frames), 0.8)


POSES = (
    "┌(・。・)┘♪", "└(・。・)┐♪", "♪┏(・o･)┛", "┗(･o･)┓♪", "ヾ(⌐■_■)ノ♪",
    "♪(┌・。・)┌", "┏(＾0＾)┛", "┗(＾0＾)┓", "ᕕ(ᐛ)ᕗ", "\\(^o^)/", "(ノ^∇^)ノ♪",
)
LIGHTS = ("🔴", "🟠", "🟡", "🟢", "🔵", "🟣")


@command("dance", category="animations", title="Танцы под музыку",
         usage="dance",
         description="Включается светомузыка, и человечек отжигает, меняя движения под музыку 🎶",
         aliases=("танец",))
async def dance(ctx: Ctx) -> None:
    frames = []
    for t, pose in enumerate(POSES):
        lights = "".join(LIGHTS[(i + t) % len(LIGHTS)] for i in range(len(LIGHTS)))
        notes = ("🎵", "🎶", "🎵🎶")[t % 3]
        frames.append(f"{lights}\n\n{pose}\n\n{notes}")
    lights = "".join(LIGHTS[(i + len(POSES)) % len(LIGHTS)] for i in range(len(LIGHTS)))
    frames.append(f"{lights}\n\n🕺💃🕺💃\n\nТанцуют все! 🎶")
    await ctx.animate(_uniq(frames), 0.6)
