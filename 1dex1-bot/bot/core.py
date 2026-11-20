"""Общий контекст приложения и надёжные обёртки над Bot API для бизнес-чатов."""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramRetryAfter
from aiogram.types import BusinessConnection, InlineKeyboardMarkup, Message

from .config import Config
from .db import Connection, Database

log = logging.getLogger(__name__)

T = TypeVar("T")

# Telegram просит ждать до N секунд при флуде — дольше этого не ждём, а сдаёмся.
MAX_FLOOD_WAIT = 60


def connection_from_api(bc: BusinessConnection) -> Connection:
    rights = bc.rights
    if rights is not None:
        can_reply = bool(rights.can_reply)
    else:  # очень старый формат ответа
        can_reply = bool(getattr(bc, "can_reply", False))
    return Connection(
        id=bc.id,
        user_id=bc.user.id,
        user_chat_id=bc.user_chat_id,
        is_enabled=bool(bc.is_enabled),
        can_reply=can_reply,
        can_read=bool(rights and rights.can_read_messages),
        can_delete_sent=bool(rights and rights.can_delete_sent_messages),
        can_delete_all=bool(rights and rights.can_delete_all_messages),
    )


async def retry_flood(call: Callable[[], Awaitable[T]], attempts: int = 4) -> T:
    """Повторяет запрос, если Telegram попросил подождать (429 Flood control)."""
    for attempt in range(attempts):
        try:
            return await call()
        except TelegramRetryAfter as e:
            if attempt == attempts - 1 or e.retry_after > MAX_FLOOD_WAIT:
                raise
            await asyncio.sleep(e.retry_after + 0.3)
    raise RuntimeError("unreachable")


def is_not_modified(err: Exception) -> bool:
    return isinstance(err, TelegramBadRequest) and "not modified" in str(err).lower()


class App:
    """То, что нужно хендлерам: бот, база, конфиг и фоновые задачи по чатам."""

    def __init__(self, bot: Bot, db: Database, config: Config) -> None:
        self.bot = bot
        self.db = db
        self.config = config
        self.bot_id: int = 0
        self.bot_username: str = "my1dex1_bot"
        self.inline_enabled: bool = False  # включён ли inline-режим в @BotFather (getMe)
        # долгие задачи (спам / анимации / загрузки) по чатам — чтобы .stop мог их отменить
        self._chat_tasks: dict[tuple[int, int], set[asyncio.Task[Any]]] = {}
        # сильные ссылки на все фоновые задачи (иначе asyncio может их собрать GC)
        self._all_tasks: set[asyncio.Task[Any]] = set()
        self._warned: set[tuple[int, str]] = set()
        self._conn_locks: dict[str, asyncio.Lock] = {}
        # то, что удалил сам бот (мут, антимут, команды) — чтобы не слать «собеседник удалил»
        self._self_deleted: dict[tuple[int, int, int], float] = {}
        # очередь по чату: сообщения владельца обрабатываются строго по порядку
        self._chat_locks: dict[tuple[int, int], asyncio.Lock] = {}

    # ------------------------------------------------------------ connections
    async def get_connection(self, connection_id: str | None, refresh: bool = False) -> Connection | None:
        if not connection_id:
            return None
        conn = self.db.connections.get(connection_id)
        if conn is not None and not refresh:
            return conn
        lock = self._conn_locks.setdefault(connection_id, asyncio.Lock())
        async with lock:
            conn = self.db.connections.get(connection_id)
            if conn is not None and not refresh:
                return conn
            try:
                bc = await self.bot.get_business_connection(business_connection_id=connection_id)
            except TelegramAPIError as e:
                log.warning("getBusinessConnection(%s) failed: %s", connection_id, e)
                return conn
            conn = connection_from_api(bc)
            await self.db.save_connection(conn)
            return conn

    # ------------------------------------------------------------ owner DM
    async def notify(self, conn_or_chat: Connection | int, text: str, **kwargs: Any) -> Message | None:
        """Сообщение владельцу в личку с ботом (НЕ в бизнес-чат)."""
        chat_id = conn_or_chat.user_chat_id if isinstance(conn_or_chat, Connection) else conn_or_chat
        try:
            return await retry_flood(lambda: self.bot.send_message(chat_id=chat_id, text=text, **kwargs))
        except TelegramAPIError as e:
            log.info("Can't DM owner %s: %s", chat_id, e)
            return None

    async def warn_once(self, conn: Connection, key: str, text: str) -> None:
        marker = (conn.user_id, key)
        if marker in self._warned:
            return
        self._warned.add(marker)
        await self.notify(conn, text)

    def forget_warnings(self, user_id: int) -> None:
        self._warned = {w for w in self._warned if w[0] != user_id}

    # ------------------------------------------------------------ business chat helpers
    async def send(self, conn: Connection, chat_id: int, text: str, **kwargs: Any) -> Message:
        """Отправка в переписку от имени владельца."""
        return await retry_flood(lambda: self.bot.send_message(
            chat_id=chat_id, text=text, business_connection_id=conn.id, **kwargs))

    async def edit(self, conn: Connection, chat_id: int, message_id: int, text: str,
                   **kwargs: Any) -> bool:
        """Редактирует сообщение в переписке. True — успех (или текст не изменился)."""
        try:
            await retry_flood(lambda: self.bot.edit_message_text(
                text=text, chat_id=chat_id, message_id=message_id,
                business_connection_id=conn.id, **kwargs))
            return True
        except TelegramAPIError as e:
            if is_not_modified(e):
                return True
            log.info("edit %s/%s failed: %s", chat_id, message_id, e)
            return False

    def chat_lock(self, owner_id: int, chat_id: int) -> asyncio.Lock:
        return self._chat_locks.setdefault((owner_id, chat_id), asyncio.Lock())

    def mark_self_deleted(self, owner_id: int, chat_id: int, message_ids: list[int]) -> None:
        now = time.monotonic()
        if len(self._self_deleted) > 5000:
            self._self_deleted = {k: v for k, v in self._self_deleted.items() if now - v < 600}
        for mid in message_ids:
            self._self_deleted[(owner_id, chat_id, mid)] = now

    def was_self_deleted(self, owner_id: int, chat_id: int, message_id: int) -> bool:
        ts = self._self_deleted.pop((owner_id, chat_id, message_id), None)
        return ts is not None and time.monotonic() - ts < 600

    async def delete(self, conn: Connection, chat_id: int, *message_ids: int | None) -> bool:
        ids = [m for m in message_ids if m]
        if not ids:
            return True
        self.mark_self_deleted(conn.user_id, chat_id, ids)
        ok = True
        for start in range(0, len(ids), 100):
            batch = ids[start:start + 100]
            try:
                await retry_flood(lambda b=batch: self.bot.delete_business_messages(
                    business_connection_id=conn.id, message_ids=b))
            except TelegramAPIError as e:
                log.info("deleteBusinessMessages chat=%s ids=%s failed: %s", chat_id, batch, e)
                ok = False
        return ok

    async def respond(self, conn: Connection, message: Message, text: str,
                      reply_markup: InlineKeyboardMarkup | None = None,
                      prefer_edit: bool = True, parse_mode: str | None = "HTML") -> int | None:
        """Показывает ответ на команду владельца.

        Сначала пытается превратить само сообщение-команду в ответ (как в тиктоках).
        Если нельзя (или в чате включён антимут, где чужой бот может снести
        сообщение) — удаляет команду и отправляет новое сообщение от имени аккаунта.
        Возвращает id сообщения с ответом.
        """
        chat_id = message.chat.id
        if prefer_edit and not self.db.has_antimute(conn.user_id, chat_id):
            if await self.edit(conn, chat_id, message.message_id, text,
                               reply_markup=reply_markup, parse_mode=parse_mode):
                return message.message_id
        # сначала отправляем ответ и только потом убираем команду: если отправить нельзя
        # (например, 24-часовое окно Telegram), команда останется, а ошибка дойдёт до владельца
        sent = await self.send(conn, chat_id, text, reply_markup=reply_markup, parse_mode=parse_mode)
        await self.delete(conn, chat_id, message.message_id)
        return sent.message_id

    flash_seconds: float = 6.0

    async def flash(self, conn: Connection, message: Message, text: str, seconds: float | None = None) -> None:
        """Временный ответ (ошибки/подсказки), который сам исчезнет из переписки."""
        msg_id = await self.respond(conn, message, text)
        if msg_id:
            delay = self.flash_seconds if seconds is None else seconds
            self.spawn(self._delete_later(conn, message.chat.id, msg_id, delay))

    async def _delete_later(self, conn: Connection, chat_id: int, msg_id: int, seconds: float) -> None:
        await asyncio.sleep(seconds)
        await self.delete(conn, chat_id, msg_id)

    # ------------------------------------------------------------ background tasks
    def spawn(self, coro: Awaitable[Any], chat_key: tuple[int, int] | None = None) -> asyncio.Task[Any]:
        """Запускает фоновую задачу. С chat_key её можно отменить через .stop."""
        task: asyncio.Task[Any] = asyncio.ensure_future(coro)
        self._all_tasks.add(task)
        if chat_key is not None:
            self._chat_tasks.setdefault(chat_key, set()).add(task)

        def _done(t: asyncio.Task[Any]) -> None:
            self._all_tasks.discard(t)
            if chat_key is not None:
                bucket = self._chat_tasks.get(chat_key)
                if bucket is not None:
                    bucket.discard(t)
                    if not bucket:
                        self._chat_tasks.pop(chat_key, None)
            if not t.cancelled() and t.exception() is not None:
                log.error("background task failed", exc_info=t.exception())

        task.add_done_callback(_done)
        return task

    def cancel_chat_tasks(self, owner_id: int, chat_id: int) -> int:
        tasks = self._chat_tasks.pop((owner_id, chat_id), set())
        for t in tasks:
            t.cancel()
        return len(tasks)

    async def shutdown(self) -> None:
        tasks = list(self._all_tasks)
        for t in tasks:
            t.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
