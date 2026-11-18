"""Модерация личного чата: мут, автоответчик, удаление сообщений."""

from __future__ import annotations

import html

from ..db import now
from ..settings import DEFAULT_SETTINGS, SettingsError, apply_patch
from .base import REGISTRY, Ctx, command
from .utility import count, human_duration, split_duration

MAX_MUTE = 365 * 86400
_FOREVER_WORDS = {"навсегда", "forever", "inf", "∞", "вечно"}
_MSGS = ("сообщение", "сообщения", "сообщений")


def _fill(template: str, name: str, time_text: str = "") -> str:
    """Подставить {name} и {time}. Без str.format — шаблон пишет пользователь, там могут быть любые скобки."""
    return template.replace("{name}", name).replace("{time}", time_text).strip()


def _parse_count(ctx: Ctx, default: int, maximum: int) -> int | None:
    """Число из первого аргумента (по умолчанию default, сверху — maximum). None — если там не число."""
    if not ctx.args:
        return default
    word = ctx.args[0]
    if not (word.isascii() and word.isdigit()) or len(word) > 6:
        return None
    n = int(word)
    return min(n, maximum) if n > 0 else None


@command("mut", category="moderation", title="Замутить собеседника", usage="mut 10m",
         description="Все новые сообщения собеседника будут сразу удаляться. Можно на время — 30s, 10m, 2h, "
                     "1d — или без времени, тогда навсегда.",
         aliases=("мут", "mute"))
async def mut(ctx: Ctx) -> None:
    raw = ctx.raw.strip()
    seconds: int | None = None
    if raw and raw.lower() not in _FOREVER_WORDS:
        seconds, _rest = split_duration(raw)
        if seconds is None:
            await ctx.hint(f"Не понял время. Пиши так: {ctx.prefix}mut 10m, {ctx.prefix}mut 2ч, "
                           f"{ctx.prefix}mut 1d — или просто {ctx.prefix}mut, тогда навсегда.")
            return
        if seconds > MAX_MUTE:
            await ctx.hint(f"Максимум на год. Если нужно навсегда — просто {ctx.prefix}mut без времени.")
            return
    until = None if seconds is None else now() + seconds
    ctx.db.mute(ctx.owner_id, ctx.chat_id, until, ctx.peer_name)
    time_text = "навсегда" if seconds is None else "на " + human_duration(seconds)
    if ctx.settings.get("mute_notice", True):
        template = ctx.settings.get("mute_text") or DEFAULT_SETTINGS["mute_text"]
        await ctx.send(_fill(template, ctx.peer_name, time_text))
    else:
        await ctx.notify(f"🔇 {ctx.peer_name} в муте {time_text}. Новые сообщения будут удаляться.\n"
                         f"Снять: {ctx.prefix}unmut", html=False)


@command("unmut", category="moderation", title="Снять мут", usage="unmut", premium=False,
         description="Собеседник снова может нормально писать — его сообщения больше не удаляются.",
         aliases=("размут", "unmute"))
async def unmut(ctx: Ctx) -> None:
    if not ctx.db.is_muted(ctx.owner_id, ctx.chat_id):
        await ctx.hint(f"{ctx.peer_name} и так не в муте.")
        return
    ctx.db.unmute(ctx.owner_id, ctx.chat_id)
    if ctx.settings.get("mute_notice", True):
        template = ctx.settings.get("unmute_text") or DEFAULT_SETTINGS["unmute_text"]
        await ctx.send(_fill(template, ctx.peer_name))
    else:
        await ctx.notify(f"🔊 Мут с {ctx.peer_name} снят.", html=False)


@command("mutes", category="moderation", title="Кто сейчас в муте", usage="mutes",
         description="Пришлю тебе в личку список всех, кто в муте, и сколько им ещё сидеть. "
                     "В чат ничего не уходит.",
         aliases=("мутлист", "mutelist"))
async def mutes(ctx: Ctx) -> None:
    items = ctx.db.list_mutes(ctx.owner_id)
    if not items:
        await ctx.notify("🕊 Сейчас никто не в муте.", html=False)
        return
    t = now()
    lines = [f"🔇 <b>В муте: {len(items)}</b>"]
    size, shown = len(lines[0]), 0
    for m in items:
        name = (m["name"] or str(m["chat_id"]))[:40]
        left = "навсегда" if m["until"] is None else "ещё " + human_duration(m["until"] - t, short=True)
        line = f"• {html.escape(name)} — {left}"
        if size + len(line) > 3600:
            break
        lines.append(line)
        size += len(line) + 1
        shown += 1
    if shown < len(items):
        lines.append(f"…и ещё {len(items) - shown}")
    lines.append(f"\nСнять мут: <code>{html.escape(ctx.prefix)}unmut</code> в чате с человеком "
                 "или в мини-приложении.")
    await ctx.notify("\n".join(lines))


def _save_afk(ctx: Ctx, afk_patch: dict) -> dict:
    new = apply_patch(ctx.settings, {"afk": afk_patch}, set(REGISTRY))
    ctx.db.save_settings(ctx.owner_id, new)
    ctx.settings = new
    return new


@command("afk", category="moderation", title="Включить автоответчик", usage="afk ушёл спать, отвечу утром",
         description="Пока тебя нет, бот сам ответит всем, кто напишет. Текст можно задать сразу после "
                     "команды или в мини-приложении.",
         aliases=("афк",))
async def afk(ctx: Ctx) -> None:
    text = ctx.raw.strip()
    afk_patch: dict = {"enabled": True}
    if text:
        afk_patch["text"] = text
    try:
        new = _save_afk(ctx, afk_patch)
    except SettingsError as e:
        await ctx.hint(str(e))
        return
    ctx.db.reset_afk(ctx.owner_id)
    cooldown = new["afk"]["cooldown_min"]
    how_often = ("на каждое сообщение" if cooldown == 0
                 else f"одному человеку — не чаще раза в {count(cooldown, ('минуту', 'минуты', 'минут'))}")
    await ctx.notify(f"🌙 Автоответчик включён.\n"
                     f"Кто напишет, получит: «{new['afk']['text']}»\n"
                     f"Отвечаю {how_often}.\n\n"
                     f"Вернёшься — напиши {ctx.prefix}unafk в любом чате.", html=False)


@command("unafk", category="moderation", title="Выключить автоответчик", usage="unafk", premium=False,
         description="Автоответчик выключается — бот перестаёт отвечать за тебя.",
         aliases=("анафк", "back"))
async def unafk(ctx: Ctx) -> None:
    if not ctx.settings.get("afk", {}).get("enabled"):
        await ctx.notify("☀️ Автоответчик и так выключен.", html=False)
        return
    try:
        _save_afk(ctx, {"enabled": False})
    except SettingsError as e:
        await ctx.hint(str(e))
        return
    ctx.db.reset_afk(ctx.owner_id)
    await ctx.notify("☀️ С возвращением! Автоответчик выключен.", html=False)


@command("del", category="moderation", title="Удалить свои сообщения", usage="del 5",
         description="Удаляет твои последние сообщения в этом чате: по умолчанию одно, максимум 100. "
                     "Работает с тем, что бот видел после подключения.",
         aliases=("дел",))
async def del_cmd(ctx: Ctx) -> None:
    n = _parse_count(ctx, 1, 100)
    if n is None:
        await ctx.hint(f"Сколько удалить? Напиши число: {ctx.prefix}del 5 (максимум 100).")
        return
    found = ctx.db.recent_message_ids(ctx.owner_id, ctx.chat_id, n + 1, from_id=ctx.owner_id)
    ids = [i for i in found if i != ctx.msg.message_id][:n]
    if not ids:
        await ctx.hint("Не нашёл твоих сообщений в этом чате. Я вижу только то, что написано после "
                       "подключения бота.")
        return
    if not await ctx.delete(ids):
        await ctx.hint("Часть сообщений не удалилась. Проверь, что у бота есть право удалять сообщения "
                       "(Настройки → Telegram для бизнеса → Чат-боты).")


@command("purge", category="moderation", title="Почистить чат", usage="purge 50",
         description="Удаляет последние сообщения с обеих сторон — твои и собеседника. По умолчанию 50, "
                     "максимум 300. Работает с тем, что бот видел после подключения.",
         aliases=("чистка",))
async def purge(ctx: Ctx) -> None:
    n = _parse_count(ctx, 50, 300)
    if n is None:
        await ctx.hint(f"Сколько удалить? Напиши число: {ctx.prefix}purge 50 (максимум 300).")
        return
    found = ctx.db.recent_message_ids(ctx.owner_id, ctx.chat_id, n + 1)
    ids = [i for i in found if i != ctx.msg.message_id][:n]
    if not ids:
        await ctx.hint("Тут нечего чистить: я вижу только сообщения, написанные после подключения бота.")
        return
    ok = await ctx.delete(ids)
    if ok:
        text = f"🧹 Чат с {ctx.peer_name} почищен: удалил {count(len(ids), _MSGS)}."
    else:
        text = (f"🧹 Чистил чат с {ctx.peer_name}, но часть из {count(len(ids), _MSGS)} Telegram удалить "
                "не дал. Проверь, что у бота есть право удалять сообщения.")
    if ok and len(ids) < n:
        text += "\nБольше я не видел — бот помнит только сообщения после подключения."
    await ctx.notify(text, html=False)
