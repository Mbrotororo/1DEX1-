"""Подключение / отключение бота к аккаунту и смена прав."""

from __future__ import annotations

from aiogram import Router
from aiogram.types import BusinessConnection

from .. import texts
from ..core import App, connection_from_api

async def on_business_connection(bc: BusinessConnection, app: App) -> None:
    conn = connection_from_api(bc)
    await app.db.save_connection(conn)
    app.forget_warnings(conn.user_id)

    if not app.config.is_allowed(conn.user_id):
        await app.notify(conn, texts.NOT_ALLOWED)
        return
    if not conn.is_enabled:
        await app.notify(conn, texts.DISCONNECTED)
        return

    missing = not (conn.can_reply and conn.can_delete_all)
    warn = texts.MISSING_RIGHTS_WARN.format(bot="@" + app.bot_username) if missing else ""
    await app.notify(conn, texts.CONNECTED.format(
        rights=texts.rights_text(conn.can_reply, conn.can_read, conn.can_delete_all),
        warn=warn,
    ))


def make_router() -> Router:
    router = Router(name="connection")
    router.business_connection()(on_business_connection)
    return router
