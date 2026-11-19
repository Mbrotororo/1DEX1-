from aiogram import Router

from . import business, connection, edits, private


def build_router() -> Router:
    root = Router(name="root")
    root.include_routers(
        connection.make_router(),
        business.make_router(),
        edits.make_router(),
        private.make_router(),
    )
    return root
