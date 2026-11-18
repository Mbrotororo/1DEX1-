"""
1DEX1 Business Bot — личный бот для личных чатов через Telegram Business.

Как работает: ты подключаешь бота в Настройки → Telegram Business → Чат-боты.
После этого бот видит твои личные переписки и может от твоего имени
отправлять и удалять сообщения. Команды пишешь прямо в чате с человеком,
начиная с точки: .mut, .spam, .flowers и т.д.
"""

import asyncio
import json
import logging
import os
import random
import time
from collections import OrderedDict, deque
from pathlib import Path

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.filters import CommandStart
from aiogram.types import BusinessConnection, BusinessMessagesDeleted, Message
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN")
DATA_FILE = Path(__file__).with_name("data.json")

SPAM_LIMIT = 30          # максимум сообщений за одну команду .spam
SPAM_DELAY = 0.35        # пауза между сообщениями (чтобы Telegram не дал флуд-бан)
CACHE_PER_CHAT = 300     # сколько последних сообщений помнить для «удалённых»

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("1dex1-bot")
router = Router()


# ───────────────────────────── хранилище ─────────────────────────────

class Storage:
    """Мьюты храним в data.json, чтобы они переживали перезапуск бота."""

    def __init__(self, path: Path):
        self.path = path
        self.data = {"mutes": {}, "owners": {}}
        if path.exists():
            try:
                self.data.update(json.loads(path.read_text("utf-8")))
            except Exception:
                log.warning("data.json повреждён — начинаю с чистого листа")

    def save(self):
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), "utf-8")

    @staticmethod
    def _key(conn_id: str, chat_id: int) -> str:
        return f"{conn_id}:{chat_id}"

    def mute(self, conn_id, chat_id, until: float | None, name: str):
        self.data["mutes"][self._key(conn_id, chat_id)] = {"until": until, "name": name}
        self.save()

    def unmute(self, conn_id, chat_id) -> bool:
        removed = self.data["mutes"].pop(self._key(conn_id, chat_id), None)
        self.save()
        return removed is not None

    def is_muted(self, conn_id, chat_id) -> bool:
        m = self.data["mutes"].get(self._key(conn_id, chat_id))
        if not m:
            return False
        if m["until"] is not None and m["until"] < time.time():
            self.unmute(conn_id, chat_id)
            return False
        return True

    def mutes_of(self, conn_id) -> list[dict]:
        out = []
        for key in list(self.data["mutes"]):
            c, chat = key.rsplit(":", 1)
            if c == conn_id and self.is_muted(c, int(chat)):
                out.append(self.data["mutes"][key])
        return out

    def set_owner(self, conn_id: str, user_id: int):
        self.data["owners"][conn_id] = user_id
        self.save()

    def owner(self, conn_id: str) -> int | None:
        return self.data["owners"].get(conn_id)


db = Storage(DATA_FILE)

# кэш сообщений собеседников: (conn_id, chat_id) -> {message_id: текст}
msg_cache: dict[tuple, OrderedDict] = {}
# id сообщений, которые отправил сам бот (для .clear)
sent_by_bot: dict[tuple, deque] = {}


# ───────────────────────────── утилиты ─────────────────────────────

async def get_owner_id(bot: Bot, conn_id: str) -> int | None:
    owner = db.owner(conn_id)
    if owner is None:
        try:
            conn = await bot.get_business_connection(conn_id)
            owner = conn.user.id
            db.set_owner(conn_id, owner)
        except Exception as e:
            log.warning("Не смог получить владельца подключения: %s", e)
    return owner


def parse_duration(s: str) -> int | None:
    """'10m' / '2h' / '1d' / '30' (минуты) -> секунды."""
    s = s.lower().strip()
    mult = {"s": 1, "с": 1, "m": 60, "м": 60, "h": 3600, "ч": 3600, "d": 86400, "д": 86400}
    if s and s[-1] in mult and s[:-1].isdigit():
        return int(s[:-1]) * mult[s[-1]]
    if s.isdigit():
        return int(s) * 60
    return None


def human_time(sec: int) -> str:
    if sec >= 86400:
        return f"{sec // 86400} дн."
    if sec >= 3600:
        return f"{sec // 3600} ч."
    if sec >= 60:
        return f"{sec // 60} мин."
    return f"{sec} сек."


async def safe_delete(bot: Bot, conn_id: str, ids: list[int]):
    try:
        await bot.delete_business_messages(business_connection_id=conn_id, message_ids=ids)
    except Exception as e:
        log.info("Удалить не получилось (%s) — проверь право «Удалять сообщения»", e)


async def send(bot: Bot, msg: Message, text: str, html: bool = False) -> Message:
    m = await bot.send_message(
        chat_id=msg.chat.id, text=text, business_connection_id=msg.business_connection_id,
        parse_mode="HTML" if html else None,
    )
    sent_by_bot.setdefault((msg.business_connection_id, msg.chat.id), deque(maxlen=200)).append(m.message_id)
    return m


async def edit(bot: Bot, msg: Message, target: Message, text: str):
    try:
        await bot.edit_message_text(
            text=text, chat_id=msg.chat.id, message_id=target.message_id,
            business_connection_id=msg.business_connection_id, parse_mode=None,
        )
    except Exception as e:
        if "not modified" not in str(e):
            log.info("edit: %s", e)


async def animate(bot: Bot, msg: Message, frames: list[str], delay: float = 0.6):
    m = await send(bot, msg, frames[0])
    for frame in frames[1:]:
        await asyncio.sleep(delay)
        await edit(bot, msg, m, frame)


# ───────────────────────────── команды ─────────────────────────────

HELP = """<b>1DEX1 Bot — команды</b> (пиши прямо в чате с человеком)

🔇 <b>.mut</b> — замутить собеседника навсегда
🔇 <b>.mut 10m</b> / <b>2h</b> / <b>1d</b> — замутить на время
🔊 <b>.unmut</b> — размутить
📋 <b>.mutes</b> — список замученных

💐 <b>.flowers</b> — букет цветов (анимация)
❤️ <b>.love</b> — сердечки
⌨️ <b>.type текст</b> — печатает текст по буквам
🎲 <b>.dice</b> / <b>.coin</b> — кубик / монетка
💥 <b>.spam 10 текст</b> — отправить текст N раз (макс. 30)
💐 <b>.spamflowers 10</b> — спам цветочками
🧹 <b>.clear</b> — удалить всё, что отправил бот в этом чате

ℹ️ <b>.help</b> — эта справка

Ещё бот присылает тебе в личку сообщения, которые собеседник удалил или изменил."""

FLOWERS = ["🌹", "🌷", "🌸", "🌺", "🌻", "🌼", "💐", "🪷", "🪻", "🏵️"]


async def cmd_mut(bot: Bot, msg: Message, args: list[str]):
    conn, chat = msg.business_connection_id, msg.chat.id
    name = msg.chat.full_name or str(chat)
    until, txt = None, "навсегда"
    if args:
        sec = parse_duration(args[0])
        if sec is None:
            await send(bot, msg, "⚠️ Не понял время. Пример: .mut 10m, .mut 2h, .mut 1d")
            return
        until, txt = time.time() + sec, f"на {human_time(sec)}"
    db.mute(conn, chat, until, name)
    await send(bot, msg, f"🔇 {name} в муте {txt} — его сообщения будут удаляться.")


async def cmd_unmut(bot: Bot, msg: Message, args: list[str]):
    if db.unmute(msg.business_connection_id, msg.chat.id):
        await send(bot, msg, "🔊 Мут снят. Можешь снова писать.")
    else:
        await send(bot, msg, "Этот человек и так не в муте.")


async def cmd_mutes(bot: Bot, msg: Message, args: list[str]):
    mutes = db.mutes_of(msg.business_connection_id)
    if not mutes:
        text = "Мут-лист пуст."
    else:
        lines = []
        for m in mutes:
            left = "навсегда" if m["until"] is None else f"ещё {human_time(int(m['until'] - time.time()))}"
            lines.append(f"• {m['name']} — {left}")
        text = "🔇 В муте:\n" + "\n".join(lines)
    # список видит только владелец — шлём в личку боту, а не собеседнику
    owner = await get_owner_id(bot, msg.business_connection_id)
    try:
        await bot.send_message(owner, text, parse_mode=None)
    except Exception:
        await send(bot, msg, text)


async def cmd_flowers(bot: Bot, msg: Message, args: list[str]):
    frames = ["🌱", "🌱🌱", "🌿🌱🌿", "🌷🌿🌷", "🌷🌹🌷", "🌸🌷🌹🌷🌸",
              "🌸🌷🌹🌷🌸\n  🌺🌻🌺", "🌸🌷🌹🌷🌸\n  🌺🌻🌺\n    🎀",
              "🌸🌷🌹🌷🌸\n  🌺🌻🌺\n    🎀\nЭто тебе 💐"]
    await animate(bot, msg, frames, 0.5)


async def cmd_love(bot: Bot, msg: Message, args: list[str]):
    hearts = ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🩷"]
    frames = ["".join(random.choice(hearts) for _ in range(i)) for i in range(1, 9)]
    frames += [random.choice(hearts) * 8 for _ in range(4)] + ["💖 люблю 💖"]
    await animate(bot, msg, frames, 0.4)


async def cmd_type(bot: Bot, msg: Message, args: list[str]):
    text = " ".join(args) or "1DEX1 на связи"
    m = await send(bot, msg, "▌")
    step = max(1, len(text) // 25)  # не больше ~25 правок, иначе упрёмся в лимиты
    for i in range(step, len(text) + step, step):
        await asyncio.sleep(0.25)
        await edit(bot, msg, m, text[:i] + ("▌" if i < len(text) else ""))


async def cmd_spam(bot: Bot, msg: Message, args: list[str]):
    if not args or not args[0].isdigit():
        await send(bot, msg, "Пример: .spam 10 привет")
        return
    n = min(int(args[0]), SPAM_LIMIT)
    text = " ".join(args[1:]) or "👋"
    for _ in range(n):
        await send(bot, msg, text)
        await asyncio.sleep(SPAM_DELAY)


async def cmd_spamflowers(bot: Bot, msg: Message, args: list[str]):
    n = min(int(args[0]), SPAM_LIMIT) if args and args[0].isdigit() else 10
    for _ in range(n):
        await send(bot, msg, "".join(random.choices(FLOWERS, k=random.randint(1, 5))))
        await asyncio.sleep(SPAM_DELAY)


async def cmd_dice(bot: Bot, msg: Message, args: list[str]):
    await bot.send_dice(msg.chat.id, business_connection_id=msg.business_connection_id)


async def cmd_coin(bot: Bot, msg: Message, args: list[str]):
    await animate(bot, msg, ["🪙", "🔄", "🪙", "🔄", random.choice(["🦅 Орёл!", "🔢 Решка!"])], 0.4)


async def cmd_clear(bot: Bot, msg: Message, args: list[str]):
    ids = list(sent_by_bot.pop((msg.business_connection_id, msg.chat.id), []))
    for i in range(0, len(ids), 100):
        await safe_delete(bot, msg.business_connection_id, ids[i:i + 100])


async def cmd_help(bot: Bot, msg: Message, args: list[str]):
    owner = await get_owner_id(bot, msg.business_connection_id)
    try:
        await bot.send_message(owner, HELP)  # справку видит только владелец
    except Exception:
        await send(bot, msg, HELP, html=True)


COMMANDS = {
    "mut": cmd_mut, "mute": cmd_mut, "мут": cmd_mut,
    "unmut": cmd_unmut, "unmute": cmd_unmut, "размут": cmd_unmut,
    "mutes": cmd_mutes, "mutlist": cmd_mutes,
    "flowers": cmd_flowers, "цветы": cmd_flowers,
    "love": cmd_love, "сердце": cmd_love,
    "type": cmd_type,
    "spam": cmd_spam, "спам": cmd_spam,
    "spamflowers": cmd_spamflowers,
    "dice": cmd_dice, "coin": cmd_coin,
    "clear": cmd_clear,
    "help": cmd_help, "хелп": cmd_help,
}


# ───────────────────────────── обработчики ─────────────────────────────

@router.business_connection()
async def on_connection(conn: BusinessConnection, bot: Bot):
    db.set_owner(conn.id, conn.user.id)
    rights = conn.rights
    if conn.is_enabled:
        warn = ""
        if not rights or not (rights.can_reply and rights.can_delete_all_messages):
            warn = ("\n\n⚠️ Дай боту права «Отвечать на сообщения» и «Удалять все сообщения», "
                    "иначе .mut и анимации работать не будут.")
        text = f"✅ Бот подключён к твоему аккаунту!{warn}\n\nНапиши .help в любом личном чате."
    else:
        text = "❌ Бот отключён от аккаунта."
    try:
        await bot.send_message(conn.user.id, text)
    except Exception:
        pass  # владелец ещё не нажал /start у бота


@router.business_message()
async def on_business_message(msg: Message, bot: Bot):
    conn = msg.business_connection_id
    owner = await get_owner_id(bot, conn)
    from_owner = msg.from_user and msg.from_user.id == owner

    if from_owner:
        text = (msg.text or "").strip()
        if text.startswith(".") and len(text) > 1:
            name, *args = text[1:].split()
            handler = COMMANDS.get(name.lower())
            if handler:
                await safe_delete(bot, conn, [msg.message_id])  # прячем саму команду
                try:
                    await handler(bot, msg, args)
                except Exception as e:
                    log.exception("Ошибка в команде .%s: %s", name, e)
        return

    # сообщение от собеседника
    if db.is_muted(conn, msg.chat.id):
        await safe_delete(bot, conn, [msg.message_id])
        return

    cache = msg_cache.setdefault((conn, msg.chat.id), OrderedDict())
    cache[msg.message_id] = describe(msg)
    while len(cache) > CACHE_PER_CHAT:
        cache.popitem(last=False)


@router.edited_business_message()
async def on_edited(msg: Message, bot: Bot):
    conn = msg.business_connection_id
    owner = await get_owner_id(bot, conn)
    if not owner or (msg.from_user and msg.from_user.id == owner):
        return
    cache = msg_cache.setdefault((conn, msg.chat.id), OrderedDict())
    old = cache.get(msg.message_id)
    new = describe(msg)
    cache[msg.message_id] = new
    if old and old != new:
        await notify(bot, owner, f"✏️ <b>{esc(msg.chat.full_name)}</b> изменил сообщение:\n"
                                 f"<s>{esc(old)}</s>\n➡️ {esc(new)}")


@router.deleted_business_messages()
async def on_deleted(event: BusinessMessagesDeleted, bot: Bot):
    owner = await get_owner_id(bot, event.business_connection_id)
    if not owner:
        return
    cache = msg_cache.get((event.business_connection_id, event.chat.id), {})
    lost = [cache.pop(i) for i in event.message_ids if i in cache]
    if lost:
        body = "\n".join(f"• {esc(t)}" for t in lost)
        await notify(bot, owner, f"🗑 <b>{esc(event.chat.full_name)}</b> удалил:\n{body}")


@router.message(CommandStart())
async def on_start(msg: Message):
    await msg.answer(
        "Привет! Я личный бот 1DEX1 😎\n\n"
        "<b>Как подключить:</b>\n"
        "1. Настройки → Telegram Business → Чат-боты\n"
        "2. Введи мой @username\n"
        "3. Включи права «Отвечать на сообщения» и «Удалять все сообщения»\n\n"
        "Потом в любом личном чате пиши .help\n\n"
        "⚠️ Telegram Business доступен только с Telegram Premium."
    )


# ───────────────────────────── мелочи ─────────────────────────────

def describe(msg: Message) -> str:
    if msg.text:
        return msg.text
    kinds = [("photo", "📷 фото"), ("video", "🎥 видео"), ("voice", "🎤 голосовое"),
             ("video_note", "⭕ кружок"), ("sticker", "🖼 стикер"), ("animation", "GIF"),
             ("document", "📎 файл"), ("audio", "🎵 аудио")]
    for attr, label in kinds:
        if getattr(msg, attr, None):
            return label + (f": {msg.caption}" if msg.caption else "")
    return "[сообщение]"


def esc(s: str | None) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


async def notify(bot: Bot, owner: int, text: str):
    try:
        await bot.send_message(owner, text)
    except Exception as e:
        log.info("Не смог написать владельцу (нажми /start у бота): %s", e)


async def main():
    if not BOT_TOKEN:
        raise SystemExit("Нет BOT_TOKEN. Скопируй .env.example в .env и вставь токен от @BotFather.")
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode="HTML"))
    dp = Dispatcher()
    dp.include_router(router)
    log.info("Бот запущен")
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


if __name__ == "__main__":
    asyncio.run(main())
