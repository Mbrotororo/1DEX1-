from aiogram import Router

from . import business, connection, edits, inline, private


def build_router() -> Router:
    root = Router(name="root")
    root.include_routers(
        connection.make_router(),
        business.make_router(),
        edits.make_router(),
        inline.make_router(),
        private.make_router(),
    )
    return root
