"""Реестр команд и контекст выполнения.

Каждая команда — это async-функция `handler(ctx: Ctx) -> None`, зарегистрированная
декоратором @command(...). Метаданные (название, категория, описание, пример) уходят
в мини-приложение, поэтому список команд нигде больше не дублируется.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramRetryAfter
from aiogram.types import InlineKeyboardMarkup, Message

from ..db import Database
from ..settings import ANIM_SPEEDS

log = logging.getLogger(__name__)

# (id, название, подпись) — порядок = порядок в мини-приложении
CATEGORIES: list[tuple[str, str, str]] = [
    ("moderation", "Модерация", "Мут, автоответчик, чистка чата"),
    ("love", "Романтика", "Цветы, сердечки, комплименты"),
    ("animations", "Анимации", "Живые сообщения, которые меняются на глазах"),
    ("spam", "Спам", "Много сообщений подряд"),
    ("text", "Текст", "Шрифты, перевёртыши, приколы с текстом"),
    ("games", "Игры", "Кубики, монетка, шар судьбы"),
    ("fun", "Развлечения", "Шутки, рейтинги, проверки"),
    ("utility", "Полезное", "Напоминания, калькулятор, инфо"),
]
CATEGORY_IDS = {c[0] for c in CATEGORIES}

Handler = Callable[["Ctx"], Awaitable[None]]


@dataclass(frozen=True)
class Command:
    name: str                 # каноническое имя без префикса, латиницей: "mut"
    aliases: tuple[str, ...]  # другие имена, в т.ч. русские: ("мут", "mute")
    category: str             # один из CATEGORY_IDS
    title: str                # коротко, для списка: "Замутить собеседника"
    usage: str                # пример без префикса: "mut 10m"
    description: str          # 1–2 предложения для мини-приложения
    handler: Handler
    premium: bool = True      # False — работает и без подписки


REGISTRY: dict[str, Command] = {}
ALIASES: dict[str, str] = {}


def norm(word: str) -> str:
    """Регистр и «ё» не важны: .звёзды == .ЗВЕЗДЫ."""
    return word.lower().replace("ё", "е")


def command(name: str, *, category: str, title: str, usage: str = "", description: str = "",
            aliases: tuple[str, ...] = (), premium: bool = True) -> Callable[[Handler], Handler]:
    if category not in CATEGORY_IDS:
        raise ValueError(f"Неизвестная категория {category!r} у команды {name}")

    def deco(fn: Handler) -> Handler:
        cmd = Command(name=name, aliases=tuple(aliases), category=category, title=title,
                      usage=usage or name, description=description or title, handler=fn, premium=premium)
        for key in (name, *aliases):
            key = norm(key)
            if key in ALIASES:
                raise ValueError(f"Имя .{key} уже занято командой .{ALIASES[key]}")
            ALIASES[key] = name
        REGISTRY[name] = cmd
        return fn

    return deco


def resolve(word: str) -> Command | None:
    name = ALIASES.get(norm(word))
    return REGISTRY.get(name) if name else None


def all_names() -> set[str]:
    """Все имена и алиасы — свои команды не могут их перекрывать."""
    return set(ALIASES)


def catalog(disabled: list[str] | None = None) -> list[dict]:
    disabled_set = set(disabled or [])
    order = {c[0]: i for i, c in enumerate(CATEGORIES)}
    cmds = sorted(REGISTRY.values(), key=lambda c: (order[c.category], c.name))
    return [
        {
            "name": c.name, "aliases": list(c.aliases), "category": c.category, "title": c.title,
            "usage": c.usage, "description": c.description, "premium": c.premium,
            "enabled": c.name not in disabled_set,
        }
        for c in cmds
    ]


def categories() -> list[dict]:
    return [{"id": i, "title": t, "subtitle": s} for i, t, s in CATEGORIES]


@dataclass
class Ctx:
    """Всё, что нужно команде. Сообщения уходят в тот же личный чат от имени владельца."""

    bot: Bot
    db: Database
    msg: Message              # сообщение владельца с командой
    owner_id: int
    settings: dict
    command: str              # каноническое имя
    args: list[str] = field(default_factory=list)  # слова после команды
    raw: str = ""             # весь текст после команды как есть (с переносами строк)

    # ── удобные свойства ──
    @property
    def conn_id(self) -> str:
        return self.msg.business_connection_id  # type: ignore[return-value]

    @property
    def chat_id(self) -> int:
        return self.msg.chat.id

    @property
    def peer_name(self) -> str:
        """Имя собеседника (в личке chat — это и есть собеседник)."""
        return self.msg.chat.full_name or self.msg.chat.username or str(self.msg.chat.id)

    @property
    def peer_id(self) -> int:
        return self.msg.chat.id

    @property
    def reply(self) -> Message | None:
        """Сообщение, на которое владелец ответил командой (если ответил)."""
        return self.msg.reply_to_message

    @property
    def prefix(self) -> str:
        return self.settings.get("prefix", ".")

    @property
    def speed(self) -> float:
        return ANIM_SPEEDS.get(self.settings.get("anim_speed", "normal"), 1.0)

    def text_arg(self, default: str = "") -> str:
        """Текст команды, а если пусто — текст сообщения, на которое ответили."""
        if self.raw:
            return self.raw
        if self.reply and (self.reply.text or self.reply.caption):
            return self.reply.text or self.reply.caption or default
        return default

    # ── действия ──
    async def send(self, text: str, *, html: bool = False,
                   reply_markup: InlineKeyboardMarkup | None = None) -> Message | None:
        try:
            m = await self.bot.send_message(
                chat_id=self.chat_id, text=text, business_connection_id=self.conn_id,
                parse_mode="HTML" if html else None, reply_markup=reply_markup,
            )
        except TelegramRetryAfter as e:
            await asyncio.sleep(e.retry_after)
            return await self.send(text, html=html, reply_markup=reply_markup)
        self.db.log_message(self.owner_id, self.chat_id, m.message_id, self.owner_id, text)
        return m

    async def edit(self, target: Message, text: str, *, html: bool = False) -> bool:
        for _ in range(2):
            try:
                await self.bot.edit_message_text(
                    text=text, chat_id=self.chat_id, message_id=target.message_id,
                    business_connection_id=self.conn_id, parse_mode="HTML" if html else None,
                )
                return True
            except TelegramRetryAfter as e:
                await asyncio.sleep(e.retry_after)
            except TelegramBadRequest as e:
                if "not modified" in str(e).lower():
                    return True
                log.info("edit failed: %s", e)
                return False
        return False

    async def sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds * self.speed)

    async def animate(self, frames: list[str], delay: float = 0.7, *, html: bool = False) -> Message | None:
        """Отправить первый кадр и по очереди заменить его остальными."""
        if not frames:
            return None
        m = await self.send(frames[0], html=html)
        if m is None:
            return None
        for frame in frames[1:]:
            await self.sleep(delay)
            await self.edit(m, frame, html=html)
        return m

    async def delete(self, message_ids: list[int]) -> bool:
        ok = True
        for i in range(0, len(message_ids), 100):
            try:
                await self.bot.delete_business_messages(
                    business_connection_id=self.conn_id, message_ids=message_ids[i:i + 100])
            except Exception as e:  # нет прав / слишком старое сообщение
                log.info("delete failed: %s", e)
                ok = False
        self.db.forget_messages(self.owner_id, self.chat_id, message_ids)
        return ok

    async def notify(self, text: str, *, html: bool = True) -> bool:
        """Написать владельцу в личку от бота (собеседник это не увидит)."""
        try:
            await self.bot.send_message(self.owner_id, text, parse_mode="HTML" if html else None)
            return True
        except Exception as e:
            log.info("notify owner failed: %s", e)
            return False

    async def hint(self, text: str) -> None:
        """Подсказка по использованию — только владельцу, не в чат."""
        await self.notify(f"💡 {text}", html=False)

    async def dice(self, emoji: str = "🎲") -> Message | None:
        m = await self.bot.send_dice(self.chat_id, business_connection_id=self.conn_id, emoji=emoji)
        self.db.log_message(self.owner_id, self.chat_id, m.message_id, self.owner_id, emoji, "dice")
        return m
