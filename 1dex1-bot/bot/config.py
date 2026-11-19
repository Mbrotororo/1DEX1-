"""Настройки бота. Всё читается из переменных окружения / файла .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip().replace(",", ".")
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on", "да"}


def _ids(name: str) -> frozenset[int]:
    out: set[int] = set()
    for part in os.getenv(name, "").replace(";", ",").split(","):
        part = part.strip()
        if part.lstrip("-").isdigit():
            out.add(int(part))
    return frozenset(out)


@dataclass(frozen=True)
class Config:
    bot_token: str
    allowed_user_ids: frozenset[int]
    db_path: Path
    download_dir: Path
    spam_limit: int
    spam_delay: float
    love_frame_delay: float
    cache_days: int
    max_video_mb: int
    max_video_minutes: int
    ytdlp_cookies: Path | None
    ytdlp_js_runtime: str
    tiktok_hd: bool
    set_bot_profile: bool
    log_level: str

    def is_allowed(self, user_id: int) -> bool:
        return not self.allowed_user_ids or user_id in self.allowed_user_ids


def load_config() -> Config:
    load_dotenv(BASE_DIR / ".env")
    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit(
            "Не найден BOT_TOKEN. Скопируй .env.example в .env и впиши туда токен от @BotFather."
        )

    data_dir = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data")))
    cookies = os.getenv("YTDLP_COOKIES", "").strip()

    return Config(
        bot_token=token,
        allowed_user_ids=_ids("ALLOWED_USER_IDS"),
        db_path=data_dir / "bot.sqlite3",
        download_dir=data_dir / "downloads",
        spam_limit=max(1, _int("SPAM_LIMIT", 100)),
        spam_delay=max(0.05, _float("SPAM_DELAY", 0.5)),
        love_frame_delay=max(0.2, _float("LOVE_FRAME_DELAY", 0.7)),
        cache_days=max(1, _int("CACHE_DAYS", 7)),
        max_video_mb=max(1, min(_int("MAX_VIDEO_MB", 50), 2000)),
        max_video_minutes=max(1, _int("MAX_VIDEO_MINUTES", 20)),
        ytdlp_cookies=Path(cookies) if cookies else None,
        ytdlp_js_runtime=os.getenv("YTDLP_JS_RUNTIME", "").strip(),
        tiktok_hd=_bool("TIKTOK_HD", False),
        set_bot_profile=_bool("SET_BOT_PROFILE", True),
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO",
    )
