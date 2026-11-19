"""Скачивание видео для команды .link (TikTok / YouTube / VK) через yt-dlp."""

from __future__ import annotations

import asyncio
import logging
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from .config import Config

log = logging.getLogger(__name__)

SITES: dict[str, tuple[str, ...]] = {
    "tiktok": ("tiktok.com",),
    "youtube": ("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "vk": ("vk.com", "vk.ru", "vkvideo.ru", "vk.video"),
}

# Не больше двух загрузок одновременно, чтобы не положить сервер.
_SEMAPHORE = asyncio.Semaphore(2)


class DownloadError(Exception):
    """Ошибка с понятным для пользователя текстом."""


@dataclass
class DownloadedVideo:
    path: Path
    workdir: Path
    title: str
    width: int | None
    height: int | None
    duration: int | None

    def cleanup(self) -> None:
        shutil.rmtree(self.workdir, ignore_errors=True)


def extract_url(text: str) -> str | None:
    for token in text.split():
        token = token.strip("<>()[]\"'")
        if token.startswith(("http://", "https://")):
            return token
        if any(token.startswith(d) or token.startswith("www." + d) or token.startswith("m." + d)
               for hosts in SITES.values() for d in hosts):
            return "https://" + token
    return None


def detect_site(url: str) -> str | None:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    for site, domains in SITES.items():
        if any(host == d or host.endswith("." + d) for d in domains):
            return site
    return None


# У TikTok формат «download» — с водяным знаком (format_note='watermarked'),
# у остальных форматов format_note пустой, поэтому фильтр с «?» (пропускать пустые).
_NO_WM = "[format_id!=download][format_note!*=?watermark][vcodec!=none]"


def _format_ladder(site: str, tiktok_hd: bool = False) -> list[str]:
    if site == "tiktok":
        if tiktok_hd:  # 1080p, но кодек HEVC (h265) — на очень старых устройствах может не играть
            return [f"b{_NO_WM}/b[vcodec^=h264]{_NO_WM}/b"]
        return [f"b[vcodec^=h264]{_NO_WM}/b{_NO_WM}/b"]
    ladder = []
    for h in (720, 480, 360):
        ladder.append(
            f"bv*[height<={h}][vcodec^=avc1]+ba[ext=m4a]"
            f"/b[height<={h}][ext=mp4]"
            f"/bv*[height<={h}]+ba"
            f"/b[height<={h}]"
        )
    ladder.append("worst[vcodec!=none]")
    return ladder


class _YtdlpLogger:
    """Перенаправляет вывод yt-dlp в наш логгер вместо stderr."""

    def debug(self, msg: str) -> None:
        log.debug("yt-dlp: %s", msg)

    def info(self, msg: str) -> None:
        log.debug("yt-dlp: %s", msg)

    def warning(self, msg: str) -> None:
        log.info("yt-dlp: %s", msg)

    def error(self, msg: str) -> None:
        log.info("yt-dlp: %s", msg)


def _base_opts(cfg: Config, workdir: Path) -> dict:
    opts: dict = {
        "logger": _YtdlpLogger(),
        "outtmpl": str(workdir / "%(id).60B.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "merge_output_format": "mp4",
        "max_filesize": cfg.max_video_mb * 1024 * 1024,
        "socket_timeout": 30,
        "retries": 3,
        "concurrent_fragment_downloads": 4,
        "overwrites": True,
    }
    if cfg.ytdlp_cookies and cfg.ytdlp_cookies.exists():
        opts["cookiefile"] = str(cfg.ytdlp_cookies)
    if cfg.ytdlp_js_runtime:
        name, _, path = cfg.ytdlp_js_runtime.partition(":")
        opts["js_runtimes"] = {name.lower(): {"path": path or None}}
    elif shutil.which("deno") is None and shutil.which("node"):
        opts["js_runtimes"] = {"node": {"path": None}}
    return opts


def _friendly(err: Exception, site: str) -> str:
    msg = str(err)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low:
        return ("YouTube не пускает сервер без входа. Положи cookies YouTube в файл "
                "и укажи путь в YTDLP_COOKIES (см. README).")
    if "private" in low or "login" in low or "log in" in low:
        return "Видео приватное или требует входа в аккаунт."
    if "unsupported url" in low:
        return "Эта ссылка не поддерживается (может, это фото-пост, а не видео?)."
    if "unavailable" in low or "not available" in low or "404" in low:
        return "Видео недоступно или удалено."
    if "geo" in low:
        return "Видео недоступно в стране сервера."
    return "Не получилось скачать: " + msg.replace("ERROR: ", "")[:200]


def _download_sync(url: str, site: str, cfg: Config) -> DownloadedVideo:
    from yt_dlp import YoutubeDL  # тяжёлый импорт — только когда нужен

    workdir = cfg.download_dir / uuid.uuid4().hex
    workdir.mkdir(parents=True, exist_ok=True)
    limit = cfg.max_video_mb * 1024 * 1024
    try:
        with YoutubeDL(_base_opts(cfg, workdir)) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:  # noqa: BLE001
                raise DownloadError(_friendly(e, site)) from e
        if info is None:
            raise DownloadError("Не нашёл видео по ссылке.")
        if info.get("_type") == "playlist":
            entries = [e for e in (info.get("entries") or []) if e]
            if not entries:
                raise DownloadError("По ссылке нет видео.")
            info = entries[0]
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
            raise DownloadError("Это прямой эфир — его скачать нельзя.")
        duration = info.get("duration")
        if duration and duration > cfg.max_video_minutes * 60:
            raise DownloadError(
                f"Видео слишком длинное (лимит {cfg.max_video_minutes} мин)."
            )

        last_error: Exception | None = None
        for fmt in _format_ladder(site, cfg.tiktok_hd):
            for f in workdir.iterdir():
                f.unlink(missing_ok=True)
            opts = _base_opts(cfg, workdir)
            opts["format"] = fmt
            try:
                with YoutubeDL(opts) as ydl:
                    result = ydl.process_ie_result(dict(info), download=True)
            except Exception as e:  # noqa: BLE001
                last_error = e
                log.info("yt-dlp format %r failed: %s", fmt, e)
                continue
            files = [p for p in workdir.iterdir()
                     if p.is_file() and not p.name.endswith((".part", ".ytdl", ".json"))]
            if not files:
                continue  # пропущено из-за max_filesize
            path = max(files, key=lambda p: p.stat().st_size)
            if path.stat().st_size > limit:
                continue
            if (result or {}).get("vcodec") == "none" and path.suffix in {".mp3", ".m4a"}:
                raise DownloadError("По ссылке нет видео (только звук).")
            return DownloadedVideo(
                path=path,
                workdir=workdir,
                title=str((result or info).get("title") or "")[:200],
                width=(result or {}).get("width") or info.get("width"),
                height=(result or {}).get("height") or info.get("height"),
                duration=int(duration) if duration else None,
            )
        if last_error is not None:
            raise DownloadError(_friendly(last_error, site))
        raise DownloadError(f"Видео больше {cfg.max_video_mb} МБ — Telegram такое не пропустит.")
    except BaseException:
        shutil.rmtree(workdir, ignore_errors=True)
        raise


async def download_video(url: str, cfg: Config, timeout: float = 300) -> DownloadedVideo:
    site = detect_site(url)
    if site is None:
        raise DownloadError("Поддерживаются только TikTok, YouTube и VK Видео.")
    async with _SEMAPHORE:
        try:
            return await asyncio.wait_for(asyncio.to_thread(_download_sync, url, site, cfg), timeout)
        except asyncio.TimeoutError as e:
            raise DownloadError("Скачивание заняло слишком много времени.") from e
