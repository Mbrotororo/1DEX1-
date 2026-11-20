"""Уведомления, когда собеседник изменил сообщение."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from aiogram import Router
from aiogram.types import Message, User

from .. import texts
from ..core import App
from ..db import Connection
from ..utils import cut, esc, media_kind, message_text, user_mention_html, username_html

TEXT_LIMIT = 1500  # чтобы уведомление влезло в лимит Telegram (4096)
# Правки одного сообщения в течение этого времени склеиваем в одно уведомление:
# если у собеседника работает анимация (десятки правок подряд), придёт одно «было → стало».
EDIT_DEBOUNCE = 3.0


@dataclass
class _PendingEdit:
    conn: Connection
    sender: User
    original: str | None
    original_known: bool
    latest: str


def _pending(app: App) -> dict[tuple[int, int, int], _PendingEdit]:
    store = getattr(app, "_pending_edits", None)
    if store is None:
        store = {}
        app._pending_edits = store  # type: ignore[attr-defined]
    return store


async def on_edited_business_message(message: Message, app: App) -> None:
    conn = await app.get_connection(message.business_connection_id)
    if conn is None or not conn.is_enabled or not app.config.is_allowed(conn.user_id):
        return
    sender = message.from_user
    if sender is None or sender.id == conn.user_id or message.sender_business_bot is not None:
        return  # свои правки (и правки наших анимаций) не интересны

    chat_id = message.chat.id
    key = (conn.user_id, chat_id, message.message_id)
    new_text = message_text(message)

    async with app.chat_lock(conn.user_id, chat_id):
        cached = await app.db.get_message(conn.user_id, chat_id, message.message_id)
        old_text = cached.text if cached is not None else None
        pending = _pending(app).get(key)
        if pending is None and cached is not None and (old_text or "") == new_text:
            return  # текст не менялся (Telegram шлёт правки и при смене реакций/медиа)

        # сначала обновляем «ожидающее» уведомление, потом пишем в базу (await) —
        # чтобы таймер не успел отправить уведомление без этой правки
        is_new = pending is None
        if pending is not None:
            pending.latest = new_text
            pending.sender = sender
        else:
            _pending(app)[key] = _PendingEdit(conn, sender, old_text, cached is not None, new_text)
        kind = media_kind(message)
        await app.db.cache_message(
            conn.user_id, chat_id, message.message_id, sender.id, new_text or None,
            kind[0] if kind else (cached.media_type if cached else None),
            kind[1] if kind else (cached.file_id if cached else None),
            cached.date if cached else None,
        )
    if is_new:
        app.spawn(_flush_later(app, key))


async def _flush_later(app: App, key: tuple[int, int, int]) -> None:
    await asyncio.sleep(EDIT_DEBOUNCE)
    async with app.chat_lock(key[0], key[1]):
        pending = _pending(app).pop(key, None)
    if pending is None:
        return
    if pending.original_known and (pending.original or "") == pending.latest:
        return  # изменили и вернули как было
    owner_id, chat_id, _ = key
    await app.db.record_peer_event(owner_id, chat_id, "edits")
    if not app.db.settings(owner_id).notify_edits:
        return

    if not pending.original_known:
        old_html = texts.EDITED_UNKNOWN_OLD
    else:
        old_html = esc(cut(pending.original, TEXT_LIMIT)) if pending.original else texts.EMPTY_TEXT
    new_html = esc(cut(pending.latest, TEXT_LIMIT)) if pending.latest else texts.EMPTY_TEXT

    await app.notify(pending.conn, texts.EDITED.format(
        name=user_mention_html(pending.sender),
        username=username_html(pending.sender),
        old=old_html,
        new=new_html,
    ))


def make_router() -> Router:
    router = Router(name="edits")
    router.edited_business_message()(on_edited_business_message)
    return router
