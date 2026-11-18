"""Пользовательские настройки бота: значения по умолчанию и проверка того, что прислал клиент.

Единственный источник правды о том, какие настройки существуют. Мини-приложение
получает их через /api/bootstrap и шлёт изменения частями (PATCH /api/settings).
"""

from __future__ import annotations

import copy
import re
from typing import Any

PREFIXES = (".", "!", ",", "-", "+", "/")
ANIM_SPEEDS = {"slow": 1.5, "normal": 1.0, "fast": 0.6}
SPAM_HARD_LIMIT = 50

DEFAULT_SETTINGS: dict[str, Any] = {
    # Символ, с которого начинаются команды в чате
    "prefix": ".",
    # Удалять сообщение с командой, чтобы собеседник его не видел
    "delete_command": True,
    # Выключенные встроенные команды (по каноническому имени)
    "disabled": [],
    # Скорость анимаций: slow | normal | fast
    "anim_speed": "normal",
    # Максимум сообщений за одну команду спама (1..50)
    "spam_limit": 30,
    # Присылать в личку от бота удалённые / изменённые собеседником сообщения
    "notify_deleted": True,
    "notify_edited": True,
    # Пересылать удалённые фото/видео/голосовые/кружки (не только текст)
    "save_media": True,
    # Писать в чат уведомление при муте / размуте
    "mute_notice": True,
    "mute_text": "🔇 {name}, ты в муте {time}. Сообщения будут удаляться.",
    "unmute_text": "🔊 {name}, мут снят.",
    # Автоответчик «не в сети»
    "afk": {"enabled": False, "text": "Сейчас не в сети, отвечу позже 🌙", "cooldown_min": 30},
    # Тексты, которые подставляются в анимации
    "love_text": "люблю тебя",
    "flowers_text": "это тебе 💐",
}

_TEXT_LIMITS = {
    "mute_text": 300,
    "unmute_text": 300,
    "love_text": 100,
    "flowers_text": 100,
}
_BOOL_KEYS = ("delete_command", "notify_deleted", "notify_edited", "save_media", "mute_notice")


class SettingsError(ValueError):
    pass


def defaults() -> dict[str, Any]:
    return copy.deepcopy(DEFAULT_SETTINGS)


def normalize(stored: dict[str, Any] | None) -> dict[str, Any]:
    """Сохранённые настройки + новые ключи по умолчанию (для старых пользователей)."""
    out = defaults()
    if not stored:
        return out
    for key, value in stored.items():
        if key == "afk" and isinstance(value, dict):
            out["afk"].update({k: v for k, v in value.items() if k in out["afk"]})
        elif key in out:
            out[key] = value
    return out


def apply_patch(current: dict[str, Any], patch: dict[str, Any], known_commands: set[str]) -> dict[str, Any]:
    """Проверить и применить частичное обновление. Бросает SettingsError с понятным текстом."""
    if not isinstance(patch, dict):
        raise SettingsError("Ожидался объект с настройками")
    new = normalize(current)
    for key, value in patch.items():
        if key not in DEFAULT_SETTINGS:
            raise SettingsError(f"Неизвестная настройка: {key}")
        if key == "prefix":
            if value not in PREFIXES:
                raise SettingsError("Префикс должен быть одним из: " + " ".join(PREFIXES))
            new["prefix"] = value
        elif key in _BOOL_KEYS:
            if not isinstance(value, bool):
                raise SettingsError(f"{key}: нужно true/false")
            new[key] = value
        elif key == "disabled":
            if not isinstance(value, list) or not all(isinstance(x, str) for x in value):
                raise SettingsError("disabled: нужен список названий команд")
            unknown = [x for x in value if x not in known_commands]
            if unknown:
                raise SettingsError("Нет таких команд: " + ", ".join(unknown[:5]))
            new["disabled"] = sorted(set(value))
        elif key == "anim_speed":
            if value not in ANIM_SPEEDS:
                raise SettingsError("anim_speed: slow, normal или fast")
            new["anim_speed"] = value
        elif key == "spam_limit":
            if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= SPAM_HARD_LIMIT:
                raise SettingsError(f"Лимит спама — от 1 до {SPAM_HARD_LIMIT}")
            new["spam_limit"] = value
        elif key in _TEXT_LIMITS:
            if not isinstance(value, str) or not value.strip():
                raise SettingsError("Текст не может быть пустым")
            if len(value) > _TEXT_LIMITS[key]:
                raise SettingsError(f"Слишком длинный текст (макс. {_TEXT_LIMITS[key]})")
            new[key] = value.strip()
        elif key == "afk":
            if not isinstance(value, dict):
                raise SettingsError("afk: нужен объект")
            afk = dict(new["afk"])
            for k, v in value.items():
                if k == "enabled":
                    if not isinstance(v, bool):
                        raise SettingsError("afk.enabled: true/false")
                    afk["enabled"] = v
                elif k == "text":
                    if not isinstance(v, str) or not v.strip() or len(v) > 1000:
                        raise SettingsError("Текст автоответа: от 1 до 1000 символов")
                    afk["text"] = v.strip()
                elif k == "cooldown_min":
                    if not isinstance(v, int) or isinstance(v, bool) or not 0 <= v <= 1440:
                        raise SettingsError("Пауза автоответа — от 0 до 1440 минут")
                    afk["cooldown_min"] = v
                else:
                    raise SettingsError(f"Неизвестное поле afk.{k}")
            new["afk"] = afk
    return new


# ───────────────────────── свои команды ─────────────────────────

CUSTOM_TRIGGER_RE = re.compile(r"^[a-zа-яё0-9_]{1,24}$")
CUSTOM_RESPONSE_MAX = 2000
CUSTOM_MAX_PER_USER = 50


def validate_custom(trigger: Any, response: Any, builtin_names: set[str]) -> tuple[str, str]:
    if not isinstance(trigger, str) or not isinstance(response, str):
        raise SettingsError("Нужны название и текст")
    trigger = trigger.strip().lstrip("".join(PREFIXES)).lower()
    response = response.strip()
    if not CUSTOM_TRIGGER_RE.match(trigger):
        raise SettingsError("Название: 1–24 символа, буквы, цифры и _")
    if trigger.replace("ё", "е") in builtin_names:
        raise SettingsError(f"Команда .{trigger} уже есть в боте")
    if not response:
        raise SettingsError("Текст ответа не может быть пустым")
    if len(response) > CUSTOM_RESPONSE_MAX:
        raise SettingsError(f"Ответ длиннее {CUSTOM_RESPONSE_MAX} символов")
    return trigger, response
