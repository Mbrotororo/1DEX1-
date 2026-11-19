"""Уведомления, когда собеседник изменил сообщение."""

from __future__ import annotations

from aiogram import Router
from aiogram.types import Message

from .. import texts
from ..core import App
from ..utils import cut, esc, media_kind, message_text, user_mention_html, username_html

TEXT_LIMIT = 1500  # чтобы уведомление влезло в лимит Telegram (4096)


async def on_edited_business_message(message: Message, app: App) -> None:
    conn = await app.get_connection(message.business_connection_id)
    if conn is None or not conn.is_enabled or not app.config.is_allowed(conn.user_id):
        return
    sender = message.from_user
    if sender is None or sender.id == conn.user_id or message.sender_business_bot is not None:
        return  # свои правки (и правки наших анимаций) не интересны

    chat_id = message.chat.id
    new_text = message_text(message)
    cached = await app.db.get_message(conn.user_id, chat_id, message.message_id)
    old_text = cached.text if cached is not None else None
    if cached is not None and (old_text or "") == new_text:
        return  # текст не менялся (Telegram шлёт правки и при смене реакций/медиа)

    kind = media_kind(message)
    await app.db.cache_message(
        conn.user_id, chat_id, message.message_id, sender.id, new_text or None,
        kind[0] if kind else (cached.media_type if cached else None),
        kind[1] if kind else (cached.file_id if cached else None),
        cached.date if cached else None,
    )

    if not app.db.settings(conn.user_id).notify_edits:
        return

    if cached is None:
        old_html = texts.EDITED_UNKNOWN_OLD
    else:
        old_html = esc(cut(old_text, TEXT_LIMIT)) if old_text else texts.EMPTY_TEXT
    new_html = esc(cut(new_text, TEXT_LIMIT)) if new_text else texts.EMPTY_TEXT

    await app.notify(conn, texts.EDITED.format(
        name=user_mention_html(sender),
        username=username_html(sender),
        old=old_html,
        new=new_html,
    ))


def make_router() -> Router:
    router = Router(name="edits")
    router.edited_business_message()(on_edited_business_message)
    return router
