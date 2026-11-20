"""Запуск: python -m bot"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shutil
import time

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramNetworkError,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.types import BotCommand, BotCommandScopeAllPrivateChats, User

from . import downloader, texts
from .config import Config, load_config
from .core import App
from .db import Database
from .handlers import build_router
from .birthday import birthday_tick
from .handlers.business import expire_mute

log = logging.getLogger("bot")


async def setup_bot_profile(bot: Bot) -> None:
    """Меню команд и описание бота (то, что видно до нажатия «Старт»)."""
    try:
        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Как подключить и все команды"),
                BotCommand(command="status", description="Статус подключения и настройки"),
                BotCommand(command="help", description="Шпаргалка по командам"),
                BotCommand(command="music", description="Найти трек: /music название"),
            ],
            scope=BotCommandScopeAllPrivateChats(),
        )
        await bot.set_my_short_description(short_description=texts.SHORT_DESCRIPTION)
        await bot.set_my_description(description=texts.DESCRIPTION)
    except TelegramAPIError as e:
        log.warning("Не удалось обновить профиль бота: %s", e)


async def _get_me_with_retry(bot: Bot, attempts: int = 8) -> User:
    """На телефоне сеть может появиться не сразу — не падаем на первом же обрыве."""
    delay = 2.0
    for attempt in range(1, attempts + 1):
        try:
            return await bot.get_me()
        except (TelegramNetworkError, TelegramServerError) as e:
            if attempt == attempts:
                raise
            log.warning("Нет связи с Telegram (%s), пробую ещё раз через %.0f с…", e, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60)
    raise RuntimeError("unreachable")


async def maintenance(app: App) -> None:
    """Фон: снятие мутов по таймеру, чистка старого кэша и временных файлов."""
    last_purge = 0.0
    last_bday = 0.0
    while True:
        await asyncio.sleep(3)
        now = time.time()
        if now - last_bday > 30:
            last_bday = now
            try:
                await birthday_tick(app)
            except Exception:  # noqa: BLE001
                log.exception("birthday tick failed")
        for owner_id, chat_id, mute in app.db.expired_mutes(now):
            try:
                await expire_mute(app, owner_id, chat_id, mute)
            except Exception:  # noqa: BLE001
                log.exception("expire_mute failed")
        if now - last_purge > 3600:
            last_purge = now
            try:
                await app.db.purge_old(app.config.cache_days * 86400)
                _cleanup_downloads(app.config, max_age=3600)
            except Exception:  # noqa: BLE001
                log.exception("purge failed")


def _cleanup_downloads(cfg: Config, max_age: float) -> None:
    if not cfg.download_dir.exists():
        return
    border = time.time() - max_age
    for item in cfg.download_dir.iterdir():
        with contextlib.suppress(OSError):
            if item.stat().st_mtime < border:
                shutil.rmtree(item, ignore_errors=True) if item.is_dir() else item.unlink()


async def main() -> None:
    cfg = load_config()
    logging.basicConfig(
        level=getattr(logging, cfg.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)

    bot = Bot(
        token=cfg.bot_token,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML, link_preview_is_disabled=True),
    )
    db = Database(cfg.db_path)
    await db.open()
    app = App(bot, db, cfg)
    bg: asyncio.Task[None] | None = None
    try:
        cfg.download_dir.mkdir(parents=True, exist_ok=True)
        _cleanup_downloads(cfg, max_age=0)

        me = await _get_me_with_retry(bot)
        if not me.supports_inline_queries:
            log.warning(
                "Inline-меню команд выключено. Чтобы при вводе @%s в переписке всплывал список "
                "команд: @BotFather → /setinline → @%s → напиши подсказку, например «команда…».",
                me.username, me.username,
            )
        if cfg.allowed_user_ids:
            log.info("Доступ только для ID: %s", ", ".join(map(str, sorted(cfg.allowed_user_ids))))
        else:
            log.warning("ALLOWED_USER_IDS пустой — ботом может пользоваться любой, кто его подключит. "
                        "Впиши свой ID (бот покажет его по /start) в .env.")
        app.bot_id, app.bot_username = me.id, me.username or app.bot_username
        app.inline_enabled = bool(me.supports_inline_queries)
        log.info("Бот @%s (id %s) запускается", me.username, me.id)
        if not me.can_connect_to_business:
            log.warning(
                "‼️  У бота выключен Secretary Mode (он же Chat Access Mode, раньше Business Mode). "
                "Открой @BotFather → /mybots → @%s → Bot Settings → Secretary Mode → Turn on. "
                "Без этого бота нельзя подключить к аккаунту.", me.username,
            )

        if cfg.set_bot_profile:
            await setup_bot_profile(bot)

        dp = Dispatcher()
        dp["app"] = app
        dp.include_router(build_router())

        bg = asyncio.create_task(maintenance(app))
        await bot.delete_webhook(drop_pending_updates=False)
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        if bg is not None:
            bg.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await bg
        await app.shutdown()
        downloader.shutdown()
        await db.close()
        await bot.session.close()


# Код выхода «ошибка настроек»: run.sh/run.bat --forever по нему НЕ перезапускают бота
# (перезапуск не поможет — нужно поправить .env).
EXIT_CONFIG = 78

if __name__ == "__main__":
    import sys
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except TelegramUnauthorizedError:
        print("❌ Telegram не принял BOT_TOKEN — проверь токен в файле .env", file=sys.stderr)
        sys.exit(EXIT_CONFIG)
    except SystemExit as e:
        if isinstance(e.code, str):  # понятная ошибка настроек из config.py
            print(e.code, file=sys.stderr)
            sys.exit(EXIT_CONFIG)
        raise
