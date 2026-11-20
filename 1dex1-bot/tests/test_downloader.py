"""Тесты загрузчика (yt-dlp подменён фейком; сетевые тесты — только с RUN_NETWORK=1)."""

from __future__ import annotations

import asyncio
import os
import threading
import time
from pathlib import Path
from typing import Any

import pytest
import yt_dlp

from bot import downloader as d
from tests.conftest import make_config


# ------------------------------------------------------------------ ссылки

@pytest.mark.parametrize(
    ("text", "url", "site"),
    [("vm.tiktok.com/ZN8aosDJA/", "https://vm.tiktok.com/ZN8aosDJA/", "tiktok"),
     ("глянь vt.tiktok.com/ZSabc/ ахах", "https://vt.tiktok.com/ZSabc/", "tiktok"),
     ("Https://vm.tiktok.com/ZN8aosDJA/", "https://vm.tiktok.com/ZN8aosDJA/", "tiktok"),
     ("HTTPS://YOUTU.BE/abc", "https://YOUTU.BE/abc", "youtube"),
     ("(https://vk.com/video1_2),", "https://vk.com/video1_2", "vk"),
     ("m.youtube.com/watch?v=1", "https://m.youtube.com/watch?v=1", "youtube"),
     ("«www.tiktok.com/@a/video/1»", "https://www.tiktok.com/@a/video/1", "tiktok"),
     ("https://example.com/x", "https://example.com/x", None)],
)
def test_extract_url(text: str, url: str, site: str | None) -> None:
    assert d.extract_url(text) == url
    assert d.detect_site(url) == site


@pytest.mark.parametrize("text", ["просто текст", "example.com/x", "notyoutube.com/x", "привет.", ""])
def test_extract_url_none(text: str) -> None:
    assert d.extract_url(text) is None


def test_audio_url_detection() -> None:
    assert d._looks_like_url("soundcloud.com/miyagi/track") == "https://soundcloud.com/miyagi/track"
    assert d._looks_like_url("https://music.youtube.com/watch?v=1") == "https://music.youtube.com/watch?v=1"
    assert d._looks_like_url("Miyagi I got love") is None
    assert d._looks_like_url("https://example.com/a.mp3") is None
    assert d.detect_site("https://soundcloud.com/x") is None  # в .link SoundCloud не берём


# ------------------------------------------------------------------ выбор формата

def test_selector_strings() -> None:
    tt = d._format_ladder("tiktok")
    assert "[format_note!*=?watermark]" in tt[0] and "[format_id!=download]" in tt[0]
    assert "h264" in tt[0]
    assert "h264" not in d._format_ladder("tiktok", tiktok_hd=True)[0]
    yt = d._format_selector("youtube", limit_mb=50)
    assert yt.count("/") >= 3
    assert "filesize<?" in yt and "filesize_approx<?" in yt
    assert "[vcodec!=?none]" in yt and "worst[vcodec!=none]" not in yt
    assert d._format_sort("youtube")[0] == "res:720"


def _select(formats: list[dict[str, Any]], site: str, **kw: Any) -> list[str]:
    """Прогоняет настоящий выбор формата yt-dlp без сети и скачивания."""
    info = {"id": "x", "title": "t", "extractor": "generic", "extractor_key": "Generic",
            "webpage_url": "https://example.com/x", "duration": 60, "formats": formats}
    for f in formats:
        f.setdefault("url", f"https://example.com/{f['format_id']}")
        f.setdefault("protocol", "https")
    opts = {"quiet": True, "no_warnings": True, "logger": d._YtdlpLogger(),
            "format": d._format_selector(site, kw.get("hd", False), kw.get("mb", 50)),
            "format_sort": d._format_sort(site, kw.get("hd", False))}
    with yt_dlp.YoutubeDL(opts) as ydl:
        res = ydl.process_ie_result(info, download=False)
    return [f["format_id"] for f in res.get("requested_formats") or [res]]


def _v(fid: str, w: int, h: int, codec: str = "avc1.64001F", ext: str = "mp4", **kw: Any) -> dict[str, Any]:
    return {"format_id": fid, "width": w, "height": h, "vcodec": codec, "acodec": "none", "ext": ext, **kw}


AUDIO = {"format_id": "140", "vcodec": "none", "acodec": "mp4a.40.2", "ext": "m4a", "abr": 128}


def test_vertical_short_keeps_720_short_side() -> None:
    fmts = [_v("1080v", 1080, 1920), _v("720v", 720, 1280), _v("480v", 480, 854), dict(AUDIO)]
    assert _select(fmts, "youtube") == ["720v", "140"]


def test_size_filter_skips_big_hls() -> None:
    fmts = [_v("big", 720, 1280, protocol="m3u8_native", filesize_approx=120 * 1024 * 1024),
            _v("ok", 480, 854, protocol="m3u8_native", filesize_approx=20 * 1024 * 1024), dict(AUDIO)]
    assert _select(fmts, "youtube") == ["ok", "140"]


def test_everything_too_big() -> None:
    fmts = [{**_v("big", 720, 1280, filesize=300 * 1024 * 1024), "acodec": "aac"}]
    with pytest.raises(yt_dlp.utils.YoutubeDLError, match="not available"):
        _select(fmts, "youtube")


def test_vk_unknown_vcodec() -> None:
    fmts = [{"format_id": "url240", "ext": "mp4", "width": 426, "height": 240},
            {"format_id": "url480", "ext": "mp4", "width": 854, "height": 480}]
    assert _select(fmts, "vk") == ["url480"]


def test_tiktok_no_watermark() -> None:
    fmts = [{**_v("download", 576, 1024, codec="h264"), "acodec": "aac", "format_note": "watermarked",
             "quality": 1},
            {**_v("h264_540p", 576, 1024, codec="h264"), "acodec": "aac"},
            {**_v("bytevc1_1080p", 1080, 1920, codec="h265"), "acodec": "aac"}]
    assert _select([dict(f) for f in fmts], "tiktok") == ["h264_540p"]
    assert _select([dict(f) for f in fmts], "tiktok", hd=True) == ["bytevc1_1080p"]


# ------------------------------------------------------------------ фейковый yt-dlp

class FakeYDL:
    """Подменяет yt_dlp.YoutubeDL. Поведение задаётся через FakeYDL.handler(self, url)."""

    handler: Any = None
    calls: list[str] = []
    opts_seen: list[dict[str, Any]] = []

    def __init__(self, opts: dict[str, Any]) -> None:
        self.opts = opts
        FakeYDL.opts_seen.append(opts)

    def __enter__(self) -> FakeYDL:
        return self

    def __exit__(self, *exc: object) -> None:
        return None

    @property
    def workdir(self) -> Path:
        return Path(self.opts["outtmpl"]).parent

    def hook(self) -> None:
        for h in self.opts["progress_hooks"]:
            h({"status": "downloading"})

    def extract_info(self, url: str, download: bool = True) -> dict[str, Any] | None:
        FakeYDL.calls.append(url)
        return FakeYDL.handler(self, url)


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> type[FakeYDL]:
    FakeYDL.calls = []
    FakeYDL.opts_seen = []
    FakeYDL.handler = None
    monkeypatch.setattr(yt_dlp, "YoutubeDL", FakeYDL)
    return FakeYDL


async def _wait_idle() -> None:
    """Ждём, пока поток yt-dlp реально закончит и вернёт место в семафоре."""
    for _ in range(200):
        if not d._ACTIVE and d._SEMAPHORE._value == d._MAX_WORKERS:
            return
        await asyncio.sleep(0.02)
    raise AssertionError("поток загрузки не завершился")


def _video_info(path: Path, **kw: Any) -> dict[str, Any]:
    return {"id": "x", "title": "Видео", "width": 720, "height": 1280, "duration": 10,
            "vcodec": "h264", "requested_downloads": [{"filepath": str(path)}], **kw}


async def test_download_video_ok(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        p = ydl.workdir / "x.mp4"
        p.write_bytes(b"0" * 100)
        return _video_info(p)

    fake.handler = handler
    cfg = make_config(tmp_path)
    video = await d.download_video("https://vm.tiktok.com/ZN8aosDJA/", cfg)
    assert video.path.name == "x.mp4" and video.height == 1280 and video.duration == 10
    opts = fake.opts_seen[0]
    assert opts["playlist_items"] == "1" and opts["noplaylist"] is True
    assert "watermark" in opts["format"] and "/" in opts["format"]
    video.cleanup()
    assert not video.workdir.exists()
    await _wait_idle()


async def test_merge_part_is_not_a_video(fake: type[FakeYDL], tmp_path: Path) -> None:
    """Видео-часть оборвана max_filesize, осталась только звуковая часть — это не «видео»."""
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        part = ydl.workdir / "x.f140.m4a"
        part.write_bytes(b"0" * 100)
        return _video_info(ydl.workdir / "x.mp4", requested_formats=[{}, {}])

    fake.handler = handler
    cfg = make_config(tmp_path)
    with pytest.raises(d.DownloadError, match="МБ"):
        await d.download_video("https://youtu.be/abc", cfg)
    assert not any(cfg.download_dir.iterdir())
    await _wait_idle()


async def test_oversized_file(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        p = ydl.workdir / "x.mp4"
        p.write_bytes(b"0" * (2 * 1024 * 1024))
        return _video_info(p)

    fake.handler = handler
    cfg = make_config(tmp_path, max_video_mb=1)
    with pytest.raises(d.DownloadError, match="1 МБ"):
        await d.download_video("https://vk.com/video1_2", cfg)
    await _wait_idle()


async def test_format_unavailable_means_size(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> None:
        raise yt_dlp.utils.DownloadError("ERROR: [vk] 1_2: Requested format is not available")

    fake.handler = handler
    with pytest.raises(d.DownloadError, match="50 МБ"):
        await d.download_video("https://vk.com/video1_2", make_config(tmp_path))
    await _wait_idle()


async def test_duration_rejected(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        info = {"id": "x", "title": "t", "duration": 3 * 3600}
        assert ydl.opts["match_filter"](info, incomplete=False)  # yt-dlp пропустит скачивание
        return info

    fake.handler = handler
    with pytest.raises(d.DownloadError, match="длинное"):
        await d.download_video("https://youtu.be/abc", make_config(tmp_path))
    await _wait_idle()


async def test_unexpected_error_wrapped(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> None:
        raise KeyError("boom")

    fake.handler = handler
    cfg = make_config(tmp_path)
    with pytest.raises(d.DownloadError):
        await d.download_video("https://youtu.be/abc", cfg)
    assert not any(cfg.download_dir.iterdir())
    await _wait_idle()


async def test_cookies_copied(fake: type[FakeYDL], tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(d, "BASE_DIR", tmp_path)
    (tmp_path / "cookies.txt").write_text("# Netscape HTTP Cookie File\noriginal\n")

    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        cookie = Path(ydl.opts["cookiefile"])
        assert cookie.parent == ydl.workdir and cookie.read_text().endswith("original\n")
        cookie.write_text("rewritten by yt-dlp")
        p = ydl.workdir / "x.mp4"
        p.write_bytes(b"0")
        return _video_info(p)

    fake.handler = handler
    cfg = make_config(tmp_path, ytdlp_cookies=Path("cookies.txt"))  # относительный путь
    video = await d.download_video("https://youtu.be/abc", cfg)
    video.cleanup()
    assert (tmp_path / "cookies.txt").read_text().endswith("original\n")
    await _wait_idle()


def _slow_handler(started: threading.Event, finished: threading.Event) -> Any:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        p = ydl.workdir / "x.mp4.part"
        p.write_bytes(b"0")
        started.set()
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                ydl.hook()  # после отмены хук бросит DownloadCancelled
                time.sleep(0.02)
            raise AssertionError("хук не прервал загрузку")
        finally:
            finished.set()
    return handler


async def test_cancel_stops_thread(fake: type[FakeYDL], tmp_path: Path) -> None:
    started, finished = threading.Event(), threading.Event()
    fake.handler = _slow_handler(started, finished)
    cfg = make_config(tmp_path)
    task = asyncio.create_task(d.download_video("https://youtu.be/abc", cfg))
    await asyncio.to_thread(started.wait, 5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await asyncio.to_thread(finished.wait, 5)
    assert finished.is_set()
    await _wait_idle()
    assert not any(cfg.download_dir.iterdir())


async def test_timeout_stops_thread(fake: type[FakeYDL], tmp_path: Path) -> None:
    started, finished = threading.Event(), threading.Event()
    fake.handler = _slow_handler(started, finished)
    cfg = make_config(tmp_path)
    with pytest.raises(d.DownloadError, match="слишком много времени"):
        await d.download_video("https://youtu.be/abc", cfg, timeout=0.3)
    await asyncio.to_thread(finished.wait, 5)
    await _wait_idle()
    assert not any(cfg.download_dir.iterdir())


async def test_shutdown_cancels(fake: type[FakeYDL], tmp_path: Path) -> None:
    started, finished = threading.Event(), threading.Event()
    fake.handler = _slow_handler(started, finished)
    cfg = make_config(tmp_path)
    task = asyncio.create_task(d.download_video("https://youtu.be/abc", cfg))
    await asyncio.to_thread(started.wait, 5)
    d.shutdown()
    with pytest.raises((d.DownloadError, asyncio.CancelledError)):
        await task
    await asyncio.to_thread(finished.wait, 5)
    assert finished.is_set()
    await _wait_idle()
    assert not any(cfg.download_dir.iterdir())


async def test_result_discarded_if_cancelled_after_finish(fake: type[FakeYDL], tmp_path: Path) -> None:
    """Поток успел скачать, но задачу уже отменили — файлы не должны остаться."""
    gate = threading.Event()

    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        gate.wait(5)
        p = ydl.workdir / "x.mp4"
        p.write_bytes(b"0")
        return _video_info(p)

    fake.handler = handler
    cfg = make_config(tmp_path)
    task = asyncio.create_task(d.download_video("https://youtu.be/abc", cfg))
    await asyncio.sleep(0.1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    gate.set()
    await _wait_idle()
    assert not any(cfg.download_dir.iterdir())


# ------------------------------------------------------------------ музыка

async def test_audio_search_falls_back_to_soundcloud(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        if url.startswith("ytsearch1:"):
            raise yt_dlp.utils.DownloadError("ERROR: [youtube] x: Sign in to confirm you're not a bot")
        assert url == "scsearch1:Miyagi I got love"
        p = ydl.workdir / "1.mp3"
        p.write_bytes(b"0" * 10)
        return {"_type": "playlist", "entries": [{
            "id": "1", "title": "I Got Love (feat. Рем Дигга)", "uploader": "Miyagi & Эндшпиль - Topic",
            "duration": 276.4, "requested_downloads": [{"filepath": str(p)}]}]}

    fake.handler = handler
    audio = await d.download_audio("  Miyagi   I got love ", make_config(tmp_path))
    assert fake.calls == ["ytsearch1:Miyagi I got love", "scsearch1:Miyagi I got love"]
    assert audio.title == "I Got Love (feat. Рем Дигга)"
    assert audio.performer == "Miyagi & Эндшпиль"
    assert audio.duration == 276 and audio.path.name == "1.mp3"
    audio.cleanup()
    await _wait_idle()


async def test_audio_nothing_found(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        return {"_type": "playlist", "entries": []}

    fake.handler = handler
    cfg = make_config(tmp_path)
    with pytest.raises(d.DownloadError, match="Ничего не нашёл по запросу «asdfgh»"):
        await d.download_audio("asdfgh", cfg)
    assert len(fake.calls) == 2
    assert not any(cfg.download_dir.iterdir())
    await _wait_idle()


async def test_audio_url_and_options(fake: type[FakeYDL], tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(d.shutil, "which", lambda name: None)  # без ffmpeg — оставляем m4a

    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        assert "postprocessors" not in ydl.opts and ydl.opts["format"].startswith("ba[ext=m4a]")
        p = ydl.workdir / "t.m4a"
        p.write_bytes(b"0")
        return {"id": "t", "track": "Трек", "artist": "Артист", "title": "Артист - Трек",
                "duration": 100, "requested_downloads": [{"filepath": str(p)}]}

    fake.handler = handler
    audio = await d.download_audio("soundcloud.com/a/b", make_config(tmp_path))
    assert fake.calls == ["https://soundcloud.com/a/b"]
    assert (audio.title, audio.performer, audio.thumbnail) == ("Трек", "Артист", None)
    audio.cleanup()
    await _wait_idle()


async def test_audio_too_long(fake: type[FakeYDL], tmp_path: Path) -> None:
    def handler(ydl: FakeYDL, url: str) -> dict[str, Any]:
        info = {"id": "x", "title": "mix", "duration": 3600}
        assert ydl.opts["match_filter"](info, incomplete=False)
        return {"_type": "playlist", "entries": [info]}

    fake.handler = handler
    with pytest.raises(d.DownloadError, match="длинный"):
        await d.download_audio("mix", make_config(tmp_path))
    await _wait_idle()


async def test_audio_unsupported_link(tmp_path: Path) -> None:
    with pytest.raises(d.DownloadError, match="SoundCloud"):
        await d.download_audio("https://example.com/a.mp3", make_config(tmp_path))


# ------------------------------------------------------------------ сеть (вручную)

network = pytest.mark.skipif(os.getenv("RUN_NETWORK") != "1", reason="сетевые тесты: RUN_NETWORK=1")


@network
@pytest.mark.parametrize("url", ["https://vm.tiktok.com/ZN8aosDJA/", "https://vk.com/video205387401_165548505"])
async def test_network_video(url: str, tmp_path: Path) -> None:
    video = await d.download_video(url, make_config(tmp_path), timeout=240)
    try:
        assert video.path.is_file() and 0 < video.path.stat().st_size <= 50 * 1024 * 1024
    finally:
        video.cleanup()


@network
async def test_network_audio(tmp_path: Path) -> None:
    audio = await d.download_audio("Miyagi I got love", make_config(tmp_path), timeout=240)
    try:
        assert audio.path.is_file() and audio.performer and "Miyagi" in audio.performer
    finally:
        audio.cleanup()
