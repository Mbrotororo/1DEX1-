"""Настройки из переменных окружения (.env)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


def _ids(raw: str) -> set[int]:
    return {int(x) for x in raw.replace(";", ",").split(",") if x.strip().lstrip("-").isdigit()}


def _names(raw: str) -> set[str]:
    return {x.strip().lstrip("@").lower() for x in raw.replace(";", ",").split(",") if x.strip()}


@dataclass(frozen=True)
class Config:
    bot_token: str = os.getenv("BOT_TOKEN", "")
    # Публичный HTTPS-адрес мини-приложения, например https://bot.example.com
    webapp_url: str = os.getenv("WEBAPP_URL", "").rstrip("/")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8080"))
    db_path: Path = Path(os.getenv("DB_PATH", str(ROOT / "data" / "bot.sqlite3")))
    webapp_dir: Path = ROOT / "webapp"
    # Админы: по id (надёжно) и/или по username (удобно). По умолчанию — @RodionDex.
    admin_ids: set[int] = field(default_factory=lambda: _ids(os.getenv("ADMIN_IDS", "")))
    admin_usernames: set[str] = field(
        default_factory=lambda: _names(os.getenv("ADMIN_USERNAMES", "RodionDex"))
    )
    # Сколько живёт initData мини-приложения (секунды)
    init_data_ttl: int = int(os.getenv("INIT_DATA_TTL", str(24 * 3600)))
    # Сколько дней хранить сообщения для «удалённых/изменённых»
    log_retention_days: int = int(os.getenv("LOG_RETENTION_DAYS", "7"))
    # Поддержка по оплатам (обязательна для Stars): кого показывать в /paysupport
    support_username: str = os.getenv("SUPPORT_USERNAME", "RodionDex").lstrip("@")

    def is_admin(self, user_id: int | None, username: str | None = None) -> bool:
        if user_id is not None and user_id in self.admin_ids:
            return True
        return bool(username) and username.lower() in self.admin_usernames


config = Config()
