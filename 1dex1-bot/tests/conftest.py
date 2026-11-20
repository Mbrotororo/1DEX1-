"""Тестовый стенд: фейковый Telegram Bot API, через который гоняем настоящие хендлеры."""

from __future__ import annotations

import datetime as dt
import itertools
from collections.abc import AsyncGenerator, Callable
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.base import BaseSession
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramBadRequest
from aiogram.methods import TelegramMethod
from aiogram.methods.base import TelegramType
from aiogram.types import (
    BusinessBotRights,
    BusinessConnection,
    CallbackQuery,
    Chat,
    File,
    Message,
    PhotoSize,
    Update,
    User,
)

from bot.config import Config
from bot.core import App
from bot.db import Database
from bot.handlers import build_router

BOT_ID = 9000128594
OWNER = User(id=111, is_bot=False, first_name="1DEX1", username="dex")
FRIEND = User(id=222, is_bot=False, first_name="Вася", last_name="Пупкин", username="vasya")
OWNER_DM = 111  # user_chat_id
CONN_ID = "conn-abc"
NOW = dt.datetime.now(dt.timezone.utc)


class MockSession(BaseSession):
    """Записывает все вызовы API и возвращает правдоподобные ответы."""

    def __init__(self) -> None:
        super().__init__()
        self.calls: list[TelegramMethod[Any]] = []
        self._ids = itertools.count(10_000)
        self.fail: dict[str, Callable[[TelegramMethod[Any]], Exception | None]] = {}
        self.rights = BusinessBotRights(can_reply=True, can_read_messages=True,
                                        can_delete_sent_messages=True, can_delete_all_messages=True)

    async def close(self) -> None:
        pass

    async def stream_content(self, url: str, headers: dict[str, Any] | None = None, timeout: int = 30,
                             chunk_size: int = 65536, raise_for_status: bool = True
                             ) -> AsyncGenerator[bytes, None]:
        yield b"fake-bytes"

    async def make_request(self, bot: Bot, method: TelegramMethod[TelegramType],
                           timeout: int | None = None) -> TelegramType:
        self.calls.append(method)
        name = type(method).__name__
        hook = self.fail.get(name)
        if hook is not None:
            err = hook(method)
            if err is not None:
                raise err
        return self._result(method)  # type: ignore[return-value]

    def _result(self, method: TelegramMethod[Any]) -> Any:
        name = type(method).__name__
        if name.startswith("Send") and name != "SendChatAction":
            chat_id = getattr(method, "chat_id", 0)
            return Message(message_id=next(self._ids), date=NOW,
                           chat=Chat(id=int(chat_id), type="private"),
                           from_user=OWNER, text=getattr(method, "text", None))
        if name == "EditMessageText":
            return Message(message_id=method.message_id, date=NOW,
                           chat=Chat(id=int(method.chat_id), type="private"), text=method.text)
        if name == "GetBusinessConnection":
            return BusinessConnection(id=method.business_connection_id, user=OWNER,
                                      user_chat_id=OWNER_DM, date=NOW, is_enabled=True,
                                      rights=self.rights)
        if name == "GetMe":
            return User(id=BOT_ID, is_bot=True, first_name="1DEX1", username="my1dex1_bot")
        if name == "GetFile":
            return File(file_id=method.file_id, file_unique_id="u", file_path="photos/x.jpg")
        return True

    # ---- помощники для проверок
    def of(self, name: str) -> list[Any]:
        return [c for c in self.calls if type(c).__name__ == name]

    def clear(self) -> None:
        self.calls.clear()


def bad_request(text: str = "Bad Request: message can't be edited") -> Callable[[Any], Exception]:
    def hook(method: Any) -> Exception:
        return TelegramBadRequest(method=method, message=text)
    return hook


def make_config(tmp_path: Path, **overrides: Any) -> Config:
    values: dict[str, Any] = dict(
        bot_token="42:TEST",
        allowed_user_ids=frozenset(),
        db_path=tmp_path / "bot.sqlite3",
        download_dir=tmp_path / "dl",
        spam_limit=100,
        spam_delay=0.0,
        love_frame_delay=0.0,
        cache_days=7,
        max_video_mb=50,
        max_video_minutes=20,
        max_audio_minutes=15,
        ytdlp_cookies=None,
        ytdlp_js_runtime="",
        tiktok_hd=False,
        set_bot_profile=False,
        log_level="DEBUG",
    )
    values.update(overrides)
    return Config(**values)


class Harness:
    def __init__(self, app: App, dp: Dispatcher, session: MockSession) -> None:
        self.app = app
        self.dp = dp
        self.session = session
        self._update_ids = itertools.count(1)
        self._msg_ids = itertools.count(1)

    async def feed(self, **update: Any) -> None:
        await self.dp.feed_update(self.app.bot, Update(update_id=next(self._update_ids), **update))

    def msg(self, sender: User, text: str | None = None, **extra: Any) -> Message:
        return Message(
            message_id=extra.pop("message_id", None) or next(self._msg_ids),
            date=NOW,
            chat=Chat(id=FRIEND.id, type="private", first_name=FRIEND.first_name),
            from_user=sender,
            text=text,
            business_connection_id=extra.pop("business_connection_id", CONN_ID),
            **extra,
        )

    async def owner_says(self, text: str | None = None, **extra: Any) -> Message:
        m = self.msg(OWNER, text, **extra)
        await self.feed(business_message=m)
        return m

    async def friend_says(self, text: str | None = None, **extra: Any) -> Message:
        m = self.msg(FRIEND, text, **extra)
        await self.feed(business_message=m)
        return m

    async def friend_edits(self, message_id: int, text: str, settle: bool = True) -> None:
        m = self.msg(FRIEND, text, message_id=message_id, edit_date=int(NOW.timestamp()))
        await self.feed(edited_business_message=m)
        if settle:
            await self.settle()

    async def friend_deletes(self, *message_ids: int) -> None:
        from aiogram.types import BusinessMessagesDeleted
        chat = Chat(id=FRIEND.id, type="private", first_name=FRIEND.first_name,
                    last_name=FRIEND.last_name, username=FRIEND.username)
        await self.feed(deleted_business_messages=BusinessMessagesDeleted(
            business_connection_id=CONN_ID, chat=chat, message_ids=list(message_ids)))
        await self.settle()

    async def press(self, user: User, data: str, message_id: int) -> None:
        cb = CallbackQuery(id="cb1", from_user=user, chat_instance="ci", data=data,
                           message=Message(message_id=message_id, date=NOW,
                                           chat=Chat(id=FRIEND.id, type="private")))
        await self.feed(callback_query=cb)

    async def settle(self) -> None:
        """Дождаться фоновых задач (спам, анимации, загрузки)."""
        import asyncio
        for _ in range(50):
            pending = [t for t in self.app._all_tasks if not t.done()]
            if not pending:
                return
            await asyncio.wait(pending, timeout=5)


def photo(file_id: str = "PHOTO_FILE") -> list[PhotoSize]:
    return [PhotoSize(file_id=file_id, file_unique_id=file_id + "u", width=800, height=600)]


@pytest_asyncio.fixture
async def h(tmp_path: Path) -> AsyncGenerator[Harness, None]:
    session = MockSession()
    bot = Bot(token="42:TEST", session=session,
              default=DefaultBotProperties(parse_mode=ParseMode.HTML, link_preview_is_disabled=True))
    db = Database(tmp_path / "bot.sqlite3")
    await db.open()
    from bot.handlers import edits as edits_module
    edits_module.EDIT_DEBOUNCE = 0  # в тестах уведомления о правках приходят сразу
    app = App(bot, db, make_config(tmp_path))
    app.bot_id = BOT_ID
    app.flash_seconds = 0
    dp = Dispatcher()
    dp["app"] = app
    dp.include_router(build_router())
    harness = Harness(app, dp, session)
    yield harness
    await app.shutdown()
    await db.close()


@pytest.fixture
def owner() -> User:
    return OWNER


@pytest.fixture
def friend() -> User:
    return FRIEND
