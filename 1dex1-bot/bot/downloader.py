"""Скачивание через yt-dlp: видео для .link (TikTok / YouTube / VK) и треки для .music.

Как это устроено:
* вся работа yt-dlp идёт в отдельном пуле из двух потоков (_executor), не больше двух загрузок сразу;
* у каждой загрузки свой threading.Event — progress_hook проверяет его и прерывает yt-dlp,
  если задачу отменили (.stop, выключение бота) или вышел таймаут;
* место в семафоре освобождается и временная папка удаляется только когда поток
  действительно закончил работу (done-callback), а не когда asyncio перестал ждать.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar
from urllib.parse import urlparse

from .config import BASE_DIR, Config

log = logging.getLogger(__name__)

SITES: dict[str, tuple[str, ...]] = {
    "tiktok": ("tiktok.com",),
    "youtube": ("youtube.com", "youtu.be", "youtube-nocookie.com"),
    "vk": ("vk.com", "vk.ru", "vkvideo.ru", "vk.video"),
}
# Для .music дополнительно принимаем SoundCloud (в .link его нет — там нет видео).
AUDIO_SITES: dict[str, tuple[str, ...]] = {**SITES, "soundcloud": ("soundcloud.com", "snd.sc")}

TELEGRAM_LIMIT_MB = 50  # лимит загрузки файлов у обычного Bot API
_MB = 1024 * 1024

# Не больше двух загрузок одновременно, чтобы не положить сервер (и телефон).
_MAX_WORKERS = 2
_SEMAPHORE = asyncio.Semaphore(_MAX_WORKERS)
_executor_obj: concurrent.futures.ThreadPoolExecutor | None = None
_executor_lock = threading.Lock()
_ACTIVE: set[threading.Event] = set()  # флаги отмены всех текущих загрузок

T = TypeVar("T")

_AUDIO_EXTS = {".mp3", ".m4a", ".opus", ".ogg", ".webm", ".aac", ".flac", ".wav", ".mp4"}
_THUMB_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


class DownloadError(Exception):
    """Ошибка с понятным для пользователя текстом."""


class _Cancelled(Exception):
    """Загрузку отменили — поток должен как можно быстрее выйти."""


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


@dataclass
class DownloadedAudio:
    path: Path
    workdir: Path
    title: str
    performer: str | None
    duration: int | None
    thumbnail: Path | None

    def cleanup(self) -> None:
        shutil.rmtree(self.workdir, ignore_errors=True)


# ------------------------------------------------------------------ ссылки

_SCHEME_RE = re.compile(r"^(https?)://", re.IGNORECASE)


def _host_site(url: str, sites: dict[str, tuple[str, ...]]) -> str | None:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    for site, domains in sites.items():
        if any(host == d or host.endswith("." + d) for d in domains):
            return site
    return None


def _find_url(text: str, sites: dict[str, tuple[str, ...]]) -> str | None:
    """Первая ссылка в тексте. Ссылки без http:// берём, только если это известный сайт."""
    for token in text.split():
        token = token.strip("<>()[]{}\"'«»,;!")
        if not token:
            continue
        m = _SCHEME_RE.match(token)
        if m:
            # «Https://…» с телефона — приводим схему к нижнему регистру
            return m.group(1).lower() + "://" + token[m.end():]
        if "." in token and "/" not in token.split(".", 1)[0]:
            candidate = "https://" + token
            if _host_site(candidate, sites) is not None:
                return candidate
    return None


def extract_url(text: str) -> str | None:
    return _find_url(text, SITES)


def detect_site(url: str) -> str | None:
    return _host_site(url, SITES)


# ------------------------------------------------------------------ выбор формата

# У TikTok формат «download» — с водяным знаком (format_note='watermarked'),
# у остальных форматов format_note пустой, поэтому фильтр с «?» (пропускать пустые).
_NO_WM = "[format_id!=download][format_note!*=?watermark]"


def _effective_limit_mb(cfg: Config) -> int:
    """Лимит размера файла. Больше 50 МБ можно только через свой Bot API сервер."""
    mb = max(1, int(cfg.max_video_mb))
    if not getattr(cfg, "telegram_api_url", None):
        mb = min(mb, TELEGRAM_LIMIT_MB)
    return mb


def _size(limit: int) -> str:
    """Фильтр по размеру. «<?» пропускает форматы, размер которых неизвестен."""
    return f"[filesize<?{limit}][filesize_approx<?{limit}]"


def _format_ladder(site: str, tiktok_hd: bool = False, limit_mb: int = TELEGRAM_LIMIT_MB) -> list[str]:
    """Ступени выбора формата от лучшей к худшей. Их склеивают через «/» в один селектор.

    Размер считаем с запасом 10%: filesize_approx у HLS/DASH — лишь оценка.
    """
    total = int(limit_mb * _MB * 0.9)
    whole = _size(total)
    if site == "tiktok":
        if tiktok_hd:  # 1080p, но кодек HEVC (h265) — на очень старых устройствах может не играть
            return [f"b{_NO_WM}{whole}", f"b[vcodec^=h264]{_NO_WM}{whole}", f"b{whole}", f"w{whole}"]
        return [f"b[vcodec^=h264]{_NO_WM}{whole}", f"b{_NO_WM}{whole}", f"b{whole}", f"w{whole}"]
    # Для склейки бюджет делим: видео 85%, звук 15%.
    video, audio = _size(int(total * 0.85)), _size(int(total * 0.15))
    return [
        f"bv*[vcodec^=avc1]{video}+ba[ext=m4a]{audio}",
        f"b[ext=mp4]{whole}",
        f"bv*{video}+ba{audio}",
        f"b{whole}",
        f"w[vcodec!=?none]{whole}",
        f"w{whole}",
    ]


def _format_selector(site: str, tiktok_hd: bool = False, limit_mb: int = TELEGRAM_LIMIT_MB) -> str:
    return "/".join(_format_ladder(site, tiktok_hd, limit_mb))


def _format_sort(site: str, tiktok_hd: bool = False) -> list[str]:
    """Сортировка форматов. «res» в yt-dlp — МЕНЬШАЯ сторона, так что вертикальные
    Shorts 1080x1920 считаются 1080p, а не 1920p, и ограничение 720 работает правильно."""
    if site == "tiktok":
        return [] if tiktok_hd else ["vcodec:h264"]
    return ["res:720", "vcodec:h264", "ext:mp4:m4a"]


# ------------------------------------------------------------------ общие настройки yt-dlp

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


def _cookie_source(cfg: Config) -> Path | None:
    raw = cfg.ytdlp_cookies
    if not raw:
        return None
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = BASE_DIR / path
    return path if path.is_file() else None


def _copy_cookies(cfg: Config, workdir: Path) -> Path | None:
    """yt-dlp перезаписывает cookie-файл после каждой загрузки — даём ему копию,
    чтобы оригинал не портился и две загрузки не писали в один файл одновременно."""
    src = _cookie_source(cfg)
    if src is None:
        return None
    dst = workdir / "cookies.txt"
    try:
        shutil.copyfile(src, dst)
    except OSError as e:
        log.warning("Не удалось скопировать cookies %s: %s", src, e)
        return None
    return dst


def _js_runtimes(cfg: Config) -> dict[str, dict[str, str | None]] | None:
    """JS-движок, без которого yt-dlp не умеет YouTube (deno 2.3+ или node 22+)."""
    if cfg.ytdlp_js_runtime:
        name, _, path = cfg.ytdlp_js_runtime.partition(":")
        return {name.lower(): {"path": path or None}}
    # deno из requirements.txt лежит рядом с python в venv — находим его, даже если venv не активирован
    local = Path(sys.executable).parent / ("deno.exe" if os.name == "nt" else "deno")
    if local.exists():
        return {"deno": {"path": str(local)}}
    if shutil.which("deno"):
        return {"deno": {"path": None}}
    if shutil.which("node"):
        return {"node": {"path": None}}
    return None


class _Guard:
    """Хуки для yt-dlp: отмена загрузки и проверка длительности до скачивания."""

    def __init__(self, cancel: threading.Event, max_seconds: int) -> None:
        self.cancel = cancel
        self.max_seconds = max_seconds
        self.rejected: str | None = None

    def check(self) -> None:
        if self.cancel.is_set():
            from yt_dlp.utils import DownloadCancelled

            raise DownloadCancelled("cancelled by bot")

    def progress_hook(self, _d: dict[str, Any]) -> None:
        self.check()

    def match_filter(self, info: dict[str, Any], *, incomplete: bool = False) -> str | None:
        self.check()
        if info.get("_type") in {"playlist", "multi_video"}:
            return None
        if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming"}:
            self.rejected = "live"
            return "live"
        duration = info.get("duration")
        if duration and duration > self.max_seconds:
            self.rejected = "long"
            return "too long"
        return None


def _base_opts(cfg: Config, workdir: Path, guard: _Guard) -> dict[str, Any]:
    opts: dict[str, Any] = {
        "logger": _YtdlpLogger(),
        "outtmpl": str(workdir / "%(id).60B.%(ext)s"),
        "noplaylist": True,
        "playlist_items": "1",  # ссылка на канал/плейлист — берём только первое видео
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": 30,
        "retries": 3,
        "fragment_retries": 3,
        "concurrent_fragment_downloads": 4,
        "overwrites": True,
        "cachedir": False,
        "progress_hooks": [guard.progress_hook],
        "postprocessor_hooks": [guard.progress_hook],
        "match_filter": guard.match_filter,
    }
    cookies = _copy_cookies(cfg, workdir)
    if cookies is not None:
        opts["cookiefile"] = str(cookies)
    runtimes = _js_runtimes(cfg)
    if runtimes:
        opts["js_runtimes"] = runtimes
    return opts


def _friendly(err: Exception, what: str = "Видео") -> str:
    msg = str(err)
    low = msg.lower()
    if "sign in to confirm" in low or "not a bot" in low:
        return ("YouTube не пускает сервер без входа. Положи cookies YouTube в файл "
                "и укажи путь в YTDLP_COOKIES (см. README).")
    if "private" in low or "login" in low or "log in" in low:
        return f"{what} приватное или требует входа в аккаунт."
    if "unsupported url" in low:
        return "Эта ссылка не поддерживается (может, это фото-пост, а не видео?)."
    if "geo" in low:
        return f"{what} недоступно в стране сервера."
    if "unavailable" in low or "not available" in low or "404" in low or "deleted" in low:
        return f"{what} недоступно или удалено."
    if "timed out" in low or "timeout" in low:
        return "Сайт слишком долго не отвечает, попробуй позже."
    return "Не получилось скачать: " + msg.replace("ERROR: ", "")[:200]


def _is_format_unavailable(err: Exception) -> bool:
    return "requested format is not available" in str(err).lower()


def _first_entry(info: dict[str, Any] | None) -> dict[str, Any] | None:
    """Из результата-плейлиста (поиск, канал) достаём первое видео."""
    while info is not None and info.get("_type") in {"playlist", "multi_video"}:
        entries = [e for e in (info.get("entries") or []) if e]
        info = entries[0] if entries else None
    return info


def _final_file(info: dict[str, Any]) -> Path | None:
    """Готовый (склеенный) файл. Части вида id.f137.mp4 — не результат."""
    downloads = info.get("requested_downloads") or []
    if not downloads:
        return None
    raw = downloads[0].get("filepath") or downloads[0].get("_filename")
    if not raw:
        return None
    path = Path(raw)
    if not path.is_file() or _is_part_name(path.name):
        return None
    return path


def _is_part_name(name: str) -> bool:
    return bool(re.search(r"\.f[\w-]+\.\w+(\.part)?$", name)) or name.endswith((".part", ".ytdl"))


# ------------------------------------------------------------------ видео

def _download_video_sync(url: str, site: str, cfg: Config, cancel: threading.Event) -> DownloadedVideo:
    from yt_dlp import YoutubeDL  # тяжёлый импорт — только когда нужен

    limit_mb = _effective_limit_mb(cfg)
    limit = limit_mb * _MB
    workdir = cfg.download_dir / uuid.uuid4().hex
    workdir.mkdir(parents=True, exist_ok=True)
    guard = _Guard(cancel, cfg.max_video_minutes * 60)
    try:
        guard.check()
        opts = _base_opts(cfg, workdir, guard)
        opts.update({
            "format": _format_selector(site, cfg.tiktok_hd, limit_mb),
            "format_sort": _format_sort(site, cfg.tiktok_hd),
            "merge_output_format": "mp4",
            "max_filesize": limit,
        })
        size_msg = f"Видео больше {limit_mb} МБ — Telegram такое не пропустит."
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=True)
        except DownloadError:
            raise
        except Exception as e:  # noqa: BLE001
            guard.check()
            if type(e).__name__ == "DownloadCancelled":
                raise _Cancelled from e
            if _is_format_unavailable(e):
                raise DownloadError(size_msg) from e
            raise DownloadError(_friendly(e)) from e
        guard.check()
        if guard.rejected == "live":
            raise DownloadError("Это прямой эфир — его скачать нельзя.")
        if guard.rejected == "long":
            raise DownloadError(f"Видео слишком длинное (лимит {cfg.max_video_minutes} мин).")
        entry = _first_entry(info)
        if entry is None:
            raise DownloadError("По ссылке нет видео.")
        path = _final_file(entry)
        if path is None or path.stat().st_size > limit:
            # max_filesize оборвал скачивание (или склейка не получилась)
            raise DownloadError(size_msg)
        if entry.get("vcodec") == "none":
            raise DownloadError("По ссылке нет видео (только звук).")
        duration = entry.get("duration")
        return DownloadedVideo(
            path=path,
            workdir=workdir,
            title=str(entry.get("title") or "")[:200],
            width=entry.get("width"),
            height=entry.get("height"),
            duration=int(duration) if duration else None,
        )
    except DownloadError:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except _Cancelled:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except BaseException as e:
        shutil.rmtree(workdir, ignore_errors=True)
        if cancel.is_set():
            raise _Cancelled from e
        if isinstance(e, Exception):
            log.exception("Неожиданная ошибка при скачивании %s", url)
            raise DownloadError(_friendly(e)) from e
        raise


# ------------------------------------------------------------------ музыка

def _looks_like_url(query: str) -> str | None:
    """Если запрос .music — ссылка, вернуть её (без схемы — только для известных сайтов)."""
    q = query.strip()
    if " " in q:
        return None
    url = _find_url(q, AUDIO_SITES)
    return url if url and _host_site(url, AUDIO_SITES) else None


def _clean_performer(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, list):
        value = ", ".join(str(v) for v in value if v)
    text = str(value).strip()
    text = re.sub(r"\s*-\s*Topic$", "", text)
    return text[:64] or None


def _make_thumbnail(workdir: Path, cancel: threading.Event) -> Path | None:
    """Маленькая обложка JPEG ≤320px и <200 КБ (так требует Telegram). Без ffmpeg — без обложки."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or cancel.is_set():
        return None
    sources = [p for p in workdir.iterdir() if p.suffix.lower() in _THUMB_EXTS and p.name != "cover.jpg"]
    if not sources:
        return None
    out = workdir / "cover.jpg"
    for quality in (4, 10, 20):
        try:
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(sources[0]),
                 "-vf", "scale=320:320:force_original_aspect_ratio=decrease",
                 "-frames:v", "1", "-q:v", str(quality), str(out)],
                check=True, timeout=30, stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        except (OSError, subprocess.SubprocessError) as e:
            log.info("Не получилось сделать обложку: %s", e)
            return None
        if out.is_file() and out.stat().st_size < 200 * 1024:
            return out
    return None


def _download_audio_sync(query: str, cfg: Config, cancel: threading.Event) -> DownloadedAudio:
    from yt_dlp import YoutubeDL  # тяжёлый импорт — только когда нужен

    max_minutes = int(getattr(cfg, "max_audio_minutes", 15) or 15)
    limit = TELEGRAM_LIMIT_MB * _MB
    if getattr(cfg, "telegram_api_url", None):
        limit = max(limit, _effective_limit_mb(cfg) * _MB)
    url = _looks_like_url(query)
    if url is not None:
        targets = [url]
    else:
        # YouTube часто требует «подтвердить, что не бот» с серверных IP — тогда ищем на SoundCloud
        targets = [f"ytsearch1:{query}", f"scsearch1:{query}"]
    has_ffmpeg = shutil.which("ffmpeg") is not None

    workdir = cfg.download_dir / uuid.uuid4().hex
    workdir.mkdir(parents=True, exist_ok=True)
    guard = _Guard(cancel, max_minutes * 60)
    try:
        last_error: Exception | None = None
        answered_empty = False
        info: dict[str, Any] | None = None
        for target in targets:
            guard.check()
            for f in workdir.iterdir():
                if f.name != "cookies.txt":
                    shutil.rmtree(f, ignore_errors=True) if f.is_dir() else f.unlink(missing_ok=True)
            guard.rejected = None
            opts = _base_opts(cfg, workdir, guard)
            size = _size(int(limit * 0.95))
            opts.update({
                "format": f"ba[ext=m4a]{size}/ba{size}/b{size}" if not has_ffmpeg
                else f"ba{size}/b{size}",
                "max_filesize": limit,
                "writethumbnail": has_ffmpeg,
            })
            if has_ffmpeg:
                opts["postprocessors"] = [{
                    "key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "192",
                }]
            try:
                with YoutubeDL(opts) as ydl:
                    result = ydl.extract_info(target, download=True)
            except Exception as e:  # noqa: BLE001
                guard.check()
                if type(e).__name__ == "DownloadCancelled":
                    raise _Cancelled from e
                last_error = e
                log.info("yt-dlp %r failed: %s", target, e)
                continue
            guard.check()
            if guard.rejected == "long":
                raise DownloadError(f"Трек слишком длинный (лимит {max_minutes} мин).")
            if guard.rejected == "live":
                raise DownloadError("Это прямой эфир — его скачать нельзя.")
            info = _first_entry(result)
            if info is None:
                answered_empty = True
                continue  # поиск ничего не нашёл — пробуем следующий источник
            break

        if info is None:
            if url is None and (answered_empty or last_error is None):
                raise DownloadError(f"Ничего не нашёл по запросу «{query[:100]}».")
            if url is None and last_error is not None:
                raise DownloadError(_friendly(last_error, "Трек"))
            if last_error is not None:
                if _is_format_unavailable(last_error):
                    raise DownloadError("По ссылке нет звука, который можно скачать.")
                raise DownloadError(_friendly(last_error, "Трек"))
            raise DownloadError("По ссылке ничего не нашлось.")

        path = _final_file(info)
        if path is None:
            files = [p for p in workdir.iterdir()
                     if p.is_file() and p.suffix.lower() in _AUDIO_EXTS and not _is_part_name(p.name)]
            path = max(files, key=lambda p: p.stat().st_size) if files else None
        if path is None or path.stat().st_size > limit:
            raise DownloadError(f"Трек больше {limit // _MB} МБ — Telegram такое не пропустит.")
        duration = info.get("duration")
        return DownloadedAudio(
            path=path,
            workdir=workdir,
            title=str(info.get("track") or info.get("title") or query)[:200],
            performer=_clean_performer(info.get("artist") or info.get("artists") or info.get("creator")
                                       or info.get("uploader") or info.get("channel")),
            duration=int(duration) if duration else None,
            thumbnail=_make_thumbnail(workdir, cancel),
        )
    except DownloadError:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except _Cancelled:
        shutil.rmtree(workdir, ignore_errors=True)
        raise
    except BaseException as e:
        shutil.rmtree(workdir, ignore_errors=True)
        if cancel.is_set():
            raise _Cancelled from e
        if isinstance(e, Exception):
            log.exception("Неожиданная ошибка при скачивании трека %r", query)
            raise DownloadError(_friendly(e, "Трек")) from e
        raise


# ------------------------------------------------------------------ потоки и отмена

def _executor() -> concurrent.futures.ThreadPoolExecutor:
    global _executor_obj
    with _executor_lock:
        if _executor_obj is None:
            _executor_obj = concurrent.futures.ThreadPoolExecutor(
                max_workers=_MAX_WORKERS, thread_name_prefix="ytdlp")
        return _executor_obj


def _discard_result(fut: concurrent.futures.Future[Any]) -> None:
    """Результат никому не нужен (задачу отменили) — удаляем скачанное."""
    if fut.cancelled() or not fut.done():
        return
    if fut.exception() is None:
        result = fut.result()
        cleanup = getattr(result, "cleanup", None)
        if callable(cleanup):
            cleanup()


async def _run_worker(fn: Callable[..., T], *args: Any, timeout: float | None) -> T:
    """Запускает fn(*args, cancel_event) в пуле и аккуратно обрабатывает отмену."""
    await _SEMAPHORE.acquire()
    loop = asyncio.get_running_loop()
    cancel = threading.Event()
    _ACTIVE.add(cancel)

    def release() -> None:
        _ACTIVE.discard(cancel)
        try:
            loop.call_soon_threadsafe(_SEMAPHORE.release)
        except RuntimeError:  # цикл уже закрыт — бот выключается
            pass

    try:
        fut = _executor().submit(fn, *args, cancel)
    except BaseException:
        _ACTIVE.discard(cancel)
        _SEMAPHORE.release()
        raise

    def done(f: concurrent.futures.Future[Any]) -> None:
        if cancel.is_set():
            _discard_result(f)
        release()

    fut.add_done_callback(done)
    try:
        return await asyncio.wait_for(asyncio.wrap_future(fut), timeout)
    except asyncio.TimeoutError as e:
        cancel.set()
        _discard_result(fut)
        raise DownloadError("Скачивание заняло слишком много времени.") from e
    except asyncio.CancelledError:
        cancel.set()
        fut.cancel()  # если ещё не начался — просто не начнётся
        _discard_result(fut)
        raise
    except _Cancelled as e:
        raise DownloadError("Скачивание отменено.") from e


def shutdown() -> None:
    """Вызывается при выключении бота: отменяет все загрузки и не ждёт потоки."""
    global _executor_obj
    for event in list(_ACTIVE):
        event.set()
    with _executor_lock:
        ex, _executor_obj = _executor_obj, None
    if ex is not None:
        ex.shutdown(wait=False, cancel_futures=True)


async def download_video(url: str, cfg: Config, timeout: float = 300) -> DownloadedVideo:
    site = detect_site(url)
    if site is None:
        raise DownloadError("Поддерживаются только TikTok, YouTube и VK Видео.")
    return await _run_worker(_download_video_sync, url, site, cfg, timeout=timeout)


async def download_audio(query: str, cfg: Config, timeout: float = 300) -> DownloadedAudio:
    query = " ".join(query.split())
    if not query:
        raise DownloadError("Напиши название трека или ссылку.")
    url = _looks_like_url(query)
    if url is None and _SCHEME_RE.match(query):
        raise DownloadError("Поддерживаются ссылки YouTube, SoundCloud, VK и TikTok.")
    return await _run_worker(_download_audio_sync, query, cfg, timeout=timeout)
