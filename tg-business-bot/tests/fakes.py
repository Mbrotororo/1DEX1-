"""Поддельный Telegram для тестов: бот «отправляет» запросы, а мы их записываем и отвечаем правдоподобно.

Пример:
    bot, calls = make_bot()
    db = Database(":memory:")
    msg = business_message(10, from_id=OWNER, text=".mut 10m")
    ctx = make_ctx(bot, db, msg, "mut", "10m")
    await REGISTRY["mut"].handler(ctx)
    assert any(isinstance(c, SendMessage) for c in calls)
"""

from __future__ import annotations

import asyncio
import itertools
from typing import Any

from aiogram import Bot
from aiogram.client.session.base import BaseSession
from aiogram.methods import (
    CreateInvoiceLink,
    EditMessageText,
    GetBusinessConnection,
    GetMe,
    SendDice,
    SendMessage,
    SendPoll,
    TelegramMethod,
)
from aiogram.types import BusinessConnection, Chat, Dice, Message, Update, User

OWNER = 111
PEER = 222
CONN = "conn-1"
BOT_ID = 999

_ids = itertools.count(5000)


class FakeSession(BaseSession):
    def __init__(self) -> None:
        super().__init__()
        self.calls: list[TelegramMethod] = []

    async def make_request(self, bot: Bot, method: TelegramMethod, timeout: int | None = None) -> Any:
        self.calls.append(method)
        chat_id = getattr(method, "chat_id", None) or PEER
        chat = Chat(id=chat_id, type="private", first_name="Вася")
        if isinstance(method, SendDice):
            return Message(message_id=next(_ids), date=0, chat=chat,
                           dice=Dice(emoji=method.emoji or "🎲", value=3))
        if isinstance(method, SendPoll):
            return Message(message_id=next(_ids), date=0, chat=chat)
        if isinstance(method, SendMessage) or type(method).__name__.startswith("Send"):
            return Message(message_id=next(_ids), date=0, chat=chat, text=getattr(method, "text", None))
        if isinstance(method, EditMessageText):
            return Message(message_id=method.message_id or 0, date=0, chat=chat, text=method.text)
        if isinstance(method, CreateInvoiceLink):
            return "https://t.me/$fake-invoice"
        if isinstance(method, GetBusinessConnection):
            return BusinessConnection(id=method.business_connection_id, user=User(id=OWNER, is_bot=False, first_name="1DEX1"),
                                      user_chat_id=OWNER, date=0, is_enabled=True)
        if isinstance(method, GetMe):
            return User(id=BOT_ID, is_bot=True, first_name="Pasture", username="pasturebot")
        return True

    async def close(self) -> None:
        pass

    async def stream_content(self, *args: Any, **kwargs: Any):  # pragma: no cover
        yield b""


def make_bot() -> tuple[Bot, list[TelegramMethod]]:
    session = FakeSession()
    bot = Bot("123456:TEST-TOKEN", session=session)
    return bot, session.calls


def sent_texts(calls: list[TelegramMethod]) -> list[str]:
    return [c.text for c in calls if isinstance(c, (SendMessage, EditMessageText)) and c.text]


def business_message(message_id: int, *, from_id: int, text: str | None = None, chat_id: int = PEER,
                     conn: str = CONN, sender_business_bot: bool = False, **extra: Any) -> Message:
    data: dict[str, Any] = {
        "message_id": message_id, "date": 0, "business_connection_id": conn,
        "chat": {"id": chat_id, "type": "private", "first_name": "Вася", "username": "vasya"},
        "from": {"id": from_id, "is_bot": False, "first_name": "1DEX1" if from_id == OWNER else "Вася"},
    }
    if text is not None:
        data["text"] = text
    if sender_business_bot:
        data["sender_business_bot"] = {"id": BOT_ID, "is_bot": True, "first_name": "Pasture", "username": "pasturebot"}
    data.update(extra)
    return Message.model_validate(data)


def business_update(update_id: int, kind: str = "business_message", **kwargs: Any) -> Update:
    msg = business_message(update_id, **kwargs)
    return Update.model_validate({"update_id": update_id, kind: msg.model_dump(by_alias=True, exclude_none=True)})


def make_ctx(bot: Bot, db: Any, msg: Message, command: str, raw: str = "", settings: dict | None = None):
    from app.commands.base import Ctx
    from app.settings import normalize

    return Ctx(bot=bot, db=db, msg=msg, owner_id=OWNER, settings=normalize(settings), command=command,
               args=raw.split(), raw=raw)


async def no_sleep(*_args: Any, **_kwargs: Any) -> None:
    await asyncio.sleep(0)
