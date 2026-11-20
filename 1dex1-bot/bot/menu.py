"""Меню команд для inline-режима: пишешь «@my1dex1_bot» в любой переписке — всплывает список."""

from __future__ import annotations

from dataclasses import dataclass

from .utils import COMMAND_ALIASES


@dataclass(frozen=True)
class MenuItem:
    name: str          # каноническое имя команды (без точки)
    emoji: str
    title: str         # что делает — коротко
    hint: str          # подсказка про аргументы
    example: str = ""  # что подставить, если аргументы обязательны, а их не написали


MENU: tuple[MenuItem, ...] = (
    MenuItem("love", "❤️", "сердечки", "свой текст или пусто — «сладких снов»"),
    MenuItem("rose", "🌹", "розы", "свой текст или пусто"),
    MenuItem("fire", "🔥", "огонь", "свой текст или пусто"),
    MenuItem("heart", "💗", "большое сердце", "свой текст или пусто"),
    MenuItem("type", "⌨️", "печатная машинка", "напиши текст", "печатаю…"),
    MenuItem("glitch", "👾", "глитч", "напиши текст", "ERROR 404"),
    MenuItem("loading", "⏳", "загрузка", "текст в конце или пусто"),
    MenuItem("mute", "🔇", "замутить", "время: 10m, 2h, 1d или пусто — навсегда"),
    MenuItem("unmute", "🔊", "размутить", ""),
    MenuItem("unmuteme", "🛡", "антимут", "off — выключить"),
    MenuItem("spam", "💥", "спам", "число и текст: 20 привет"),
    MenuItem("music", "🎵", "найти трек", "название трека или ссылка"),
    MenuItem("link", "🎬", "видео без водяного знака", "ссылка TikTok / YouTube / VK"),
    MenuItem("weather", "🌤", "погода", "город"),
    MenuItem("currency", "💱", "курс валют", "100 usd, 50 евро в рубли или пусто"),
    MenuItem("time", "🕐", "время в городе", "город"),
    MenuItem("stats", "📊", "статистика переписки", ""),
    MenuItem("stop", "⏹", "остановить спам/анимацию", ""),
    MenuItem("help", "❓", "все команды (придут в бота)", ""),
)

_BY_ALIAS: dict[str, MenuItem] = {}
for _item in MENU:
    for _alias in COMMAND_ALIASES.get(_item.name, (_item.name,)):
        _BY_ALIAS.setdefault(_alias, _item)


def search(query: str) -> list[tuple[MenuItem, str]]:
    """По тексту из строки ввода возвращает [(пункт меню, текст сообщения для отправки)].

    'love я скучаю' -> [(love, '.love я скучаю')]; '' -> все команды; 'm' -> mute, music…
    """
    query = " ".join(query.split())
    head, _, rest = query.lstrip(".").partition(" ")
    head = head.lower()
    if not head:
        return [(item, _message(item, "")) for item in MENU]
    exact = _BY_ALIAS.get(head)
    if exact is not None and rest:
        return [(exact, _message(exact, rest))]
    found: list[MenuItem] = []
    for alias, item in _BY_ALIAS.items():
        if alias.startswith(head) and item not in found:
            found.append(item)
    order = {item.name: i for i, item in enumerate(MENU)}
    found.sort(key=lambda it: (it is not exact, order[it.name]))
    return [(item, _message(item, rest)) for item in found]


def _message(item: MenuItem, rest: str) -> str:
    args = rest or item.example
    return f".{item.name} {args}".strip()
