from __future__ import annotations

import pytest

from bot.animations import COLS, ROWS, love_frames
from bot.downloader import _format_ladder, detect_site, extract_url
from bot.utils import DurationError, human_duration, parse_command, parse_duration


@pytest.mark.parametrize(
    ("raw", "seconds"),
    [("", None), ("навсегда", None), ("10m", 600), ("10м", 600), ("1h30m", 5400), ("2 часа", 7200),
     ("45", 2700), ("1д", 86400), ("30s", 30), ("1.5h", 5400), ("1w", 604800), ("10 мин", 600)],
)
def test_parse_duration(raw: str, seconds: int | None) -> None:
    assert parse_duration(raw) == seconds


@pytest.mark.parametrize("raw", ["abc", "10x", "0", "-5m", "m"])
def test_parse_duration_errors(raw: str) -> None:
    with pytest.raises(DurationError):
        parse_duration(raw)


def test_human_duration() -> None:
    assert human_duration(None) == "навсегда"
    assert human_duration(60, accusative=True) == "1 минуту"
    assert human_duration(3660) == "1 час 1 минута"
    assert human_duration(86400 * 2 + 3600 * 5) == "2 дня 5 часов"
    assert human_duration(11 * 60) == "11 минут"


def test_parse_command() -> None:
    assert parse_command(".spam 5 привет") .name == "spam"
    assert parse_command(".SPAM 5 привет").args == "5 привет"
    assert parse_command(".мут 10м").name == "mute"
    assert parse_command(".antimute").name == "unmuteme"
    assert parse_command("  .love  ").args == ""
    for not_cmd in ("...", ".", "привет", ". mute", ".unknown", "", None, "текст .mute"):
        assert parse_command(not_cmd) is None


def test_love_frames() -> None:
    frames = love_frames()
    assert len(frames) <= 25
    assert all(a != b for a, b in zip(frames, frames[1:]))
    final = frames[-1].split("\n")
    assert len(final) == ROWS
    assert final[ROWS // 2] == "❤️ сладких снов ❤️"
    assert all(r == "❤️" * COLS for i, r in enumerate(final) if i != ROWS // 2)
    assert all(len(f) <= 4096 for f in frames)
    long = love_frames("x" * 500)
    assert "x" * 40 in long[-1] and "x" * 41 not in long[-1]


@pytest.mark.parametrize(
    ("text", "site"),
    [("https://vm.tiktok.com/ZN8aosDJA/", "tiktok"),
     ("смотри https://www.tiktok.com/@a/video/1 ахах", "tiktok"),
     ("https://youtu.be/dQw4w9WgXcQ", "youtube"),
     ("https://www.youtube.com/shorts/abc", "youtube"),
     ("youtube.com/watch?v=1", "youtube"),
     ("https://vk.com/video-1_2", "vk"),
     ("https://vkvideo.ru/video-1_2", "vk"),
     ("https://example.com/x", None),
     ("https://notyoutube.com/x", None)],
)
def test_url_detection(text: str, site: str | None) -> None:
    url = extract_url(text)
    assert url is not None
    assert detect_site(url) == site


def test_format_ladder() -> None:
    assert "watermark" in _format_ladder("tiktok")[0]
    assert len(_format_ladder("youtube")) >= 3
