"""Inline-меню команд: «@my1dex1_bot» в строке ввода любой переписки показывает все команды.

Выбрал команду — она отправляется от твоего имени (с пометкой «via @my1dex1_bot»), бот видит
её как обычную команду и сразу выполняет. Аргументы можно дописать прямо в строке:
«@my1dex1_bot love я скучаю».
"""

from __future__ import annotations

from aiogram import Router
from aiogram.types import InlineQuery, InlineQueryResultArticle, InputTextMessageContent

from .. import menu
from ..core import App


async def on_inline_query(query: InlineQuery, app: App) -> None:
    if not app.config.is_allowed(query.from_user.id):
        await query.answer([], cache_time=60, is_personal=True)
        return
    results = []
    for i, (item, text) in enumerate(menu.search(query.query)[:50]):
        description = f"Отправит: {text}"
        if item.hint and text == f".{item.name}" + (f" {item.example}" if item.example else ""):
            description = f"{item.hint} · {description}"
        results.append(InlineQueryResultArticle(
            id=f"{item.name}:{i}",
            title=f"{item.emoji} .{item.name} — {item.title}",
            description=description[:200],
            input_message_content=InputTextMessageContent(message_text=text, parse_mode=None),
        ))
    await query.answer(results, cache_time=1, is_personal=True)


def make_router() -> Router:
    router = Router(name="inline")
    router.inline_query()(on_inline_query)
    return router
