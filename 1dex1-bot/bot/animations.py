"""Кадры анимации .love — сетка сердечек 7×5 с текстом посередине (как на скрине)."""

from __future__ import annotations

COLS = 7
ROWS = 5
MID = ROWS // 2
RED = "❤️"
RAINBOW = ("❤️", "🧡", "💛", "💚", "💙", "💜")
DEFAULT_LOVE_TEXT = "сладких снов"
MAX_LOVE_TEXT = 40


def _row(heart: str = RED) -> str:
    return heart * COLS


def _text_row(text: str, left: str = RED, right: str = RED) -> str:
    return f"{left} {text} {right}" if text else f"{left}   {right}"


def _grid(rows: list[str]) -> str:
    return "\n".join(rows)


def love_frames(text: str | None = None) -> list[str]:
    """Возвращает список кадров. Соседние кадры всегда различаются,
    последний кадр — финальная картинка (красная сетка + текст)."""
    text = " ".join((text or DEFAULT_LOVE_TEXT).split())[:MAX_LOVE_TEXT] or DEFAULT_LOVE_TEXT

    frames: list[str] = []

    # 1) сердечко появляется и растягивается в ряд
    frames.append(RED)
    frames.append(RED * 4)
    frames.append(_row())

    # 2) ряды «вырастают» сверху вниз
    for count in range(2, ROWS + 1):
        frames.append(_grid([_row() for _ in range(count)]))

    # 3) радужная волна по диагонали
    for shift in range(len(RAINBOW)):
        rows = []
        for r in range(ROWS):
            rows.append("".join(RAINBOW[(r + c + shift) % len(RAINBOW)] for c in range(COLS)))
        frames.append(_grid(rows))

    # 4) середина «раскрывается» и печатается текст
    full_rows = [_row() for _ in range(ROWS)]
    steps = _typing_steps(text)
    for part in [""] + steps:
        rows = list(full_rows)
        rows[MID] = _text_row(part)
        frames.append(_grid(rows))

    # 5) сердцебиение и финальный кадр
    pulse = [_row("💗") for _ in range(ROWS)]
    pulse[MID] = _text_row(text, "💗", "💗")
    frames.append(_grid(pulse))

    final = [_row() for _ in range(ROWS)]
    final[MID] = _text_row(text)
    frames.append(_grid(final))

    # подстраховка: убираем подряд идущие одинаковые кадры
    deduped: list[str] = []
    for frame in frames:
        if not deduped or deduped[-1] != frame:
            deduped.append(frame)
    return deduped


def _typing_steps(text: str, max_steps: int = 5) -> list[str]:
    """Печатаем текст кусками, чтобы не делать слишком много правок."""
    n = len(text)
    if n == 0:
        return []
    steps = min(max_steps, n)
    out = []
    for i in range(1, steps + 1):
        end = round(n * i / steps)
        part = text[:end].rstrip()
        if part and (not out or out[-1] != part):
            out.append(part)
    if out[-1] != text:
        out.append(text)
    return out
