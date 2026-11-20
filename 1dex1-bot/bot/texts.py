"""Все тексты бота в одном месте — легко поменять под себя."""

from __future__ import annotations

BOT_NAME = "1DEX1"

SHORT_DESCRIPTION = "Личный бот 1DEX1 для переписок"
DESCRIPTION = (
    "Мут, антимут, удалённые и изменённые сообщения, одноразки, видео без вотермарки, музыка."
)

# Короткий список — в /start
COMMANDS_SHORT = (
    ".mute [10m] · .unmute · .unmuteme\n"
    ".love · .rose · .fire · .heart · .type · .glitch · .loading\n"
    ".link · .music · .weather · .currency · .time · .stats\n"
    ".spam · .save · .stop"
)

# Подробнее, по строке на команду — в /help и .help
COMMANDS_HELP = (
    ".mute — мут (.mute 10m — на время)\n"
    ".unmute — снять мут\n"
    ".unmuteme — антимут (off — выключить)\n"
    ".love .rose .fire .heart .type .glitch .loading — анимации, можно с текстом\n"
    ".link ссылка — видео TikTok/YouTube/VK\n"
    ".music название — трек\n"
    ".weather город · .currency 100 usd · .time город\n"
    ".stats — статистика чата\n"
    ".save — ответом на медиа, сохранить\n"
    ".spam 20 текст · .stop\n\n"
    "Правки, удалённые сообщения и одноразки (ответь до открытия) приходят сюда."
)

HOW_TO_CONNECT = (
    "<b>Подключение</b>\n"
    "Настройки → Автоматизация чатов → @my1dex1_bot → включи все права на сообщения. "
    "Premium не нужен."
)

PRIVACY = (
    "Бот хранит только тексты сообщений собеседников, {days} дн. — чтобы показывать правки "
    "и удалённое. Всё лежит там, где запущен бот, и никуда не передаётся."
)

def start_text(name: str, user_id: int, connected: bool, cache_days: int = 7) -> str:
    status = "✅ Подключён" if connected else "⚠️ Не подключён"
    return f"<b>{BOT_NAME}</b> · {status}\n\n{COMMANDS_SHORT}\n\nПодробно — /help, настройки — /status"

def rights_text(can_reply: bool, can_read: bool, can_delete_all: bool) -> str:
    def mark(ok: bool) -> str:
        return "✅" if ok else "❌"

    return (
        f"{mark(can_reply)} отвечать на сообщения — нужно для всех команд\n"
        f"{mark(can_delete_all)} удалять все сообщения — нужно для .mute, .unmuteme и чтобы команды исчезали\n"
        f"{mark(can_read)} читать сообщения"
    )


CONNECTED = "✅ <b>Бот подключён!</b>\n\nПрава:\n{rights}\n\n{warn}Пиши <code>.help</code> в любой переписке, чтобы увидеть команды."
MISSING_RIGHTS_WARN = (
    "⚠️ Не хватает прав — зайди в Настройки → Автоматизация чатов → "
    "{bot} и включи всё, что отмечено ❌.\n\n"
)
DISCONNECTED = "❌ Бот отключён от твоего аккаунта. Подключить снова: Настройки → Автоматизация чатов."
NOT_ALLOWED = "⛔ Это приватный бот — он работает только для своего владельца."

# ---- мут
MUTE_STATUS = "🔇 <b>Собеседник в муте{duration}</b>"
MUTE_BUTTON = "🔊 Размутить"
UNMUTED = "🔊 <b>Мут снят</b>"
MUTE_EXPIRED = "🔊 <b>Мут закончился</b>"
NOT_MUTED = "ℹ️ Собеседник и так не в муте."
ONLY_OWNER_CAN_UNMUTE = "Размутить может только тот, кто замутил 😏"
MUTE_NEED_RIGHTS = (
    "⚠️ Не могу удалять сообщения: у бота нет права <b>«Удалять все сообщения»</b>.\n"
    "Включи его: Настройки → Автоматизация чатов → @my1dex1_bot → права на сообщения."
)
BAD_DURATION = "❌ Не понял время. Примеры: <code>.mute 30s</code>, <code>.mute 10m</code>, <code>.mute 2h</code>, <code>.mute 1d</code>"

# ---- спам
SPAM_USAGE = "❌ Формат: <code>.spam 10 текст</code>"
SPAM_LIMIT = "❌ Максимум {limit} сообщений за раз."

# ---- антимут
ANTIMUTE_ON = (
    "🛡 <b>Антимут включён в этом чате</b>\n"
    "<blockquote>Даже если тебя замутили другим ботом — твои сообщения будут доходить.\n"
    "Выключить: <code>.unmuteme off</code></blockquote>"
)
ANTIMUTE_OFF = "🛡 <b>Антимут выключен</b>"
ANTIMUTE_ALREADY_OFF = "ℹ️ Антимут и так выключен."

# ---- link
LINK_USAGE = "❌ Формат: <code>.link https://vm.tiktok.com/...</code>"
LINK_UNSUPPORTED = "❌ Поддерживаются только TikTok, YouTube и VK Видео."
LINK_LOADING = "⏳ Скачиваю видео…"
LINK_SENDING = "📤 Отправляю…"
LINK_FAILED = "❌ {error}"

# ---- сохранение одноразовых
VIEW_ONCE_CAPTION = "🔥 <b>{title}</b> от {name} ({username})"
VIEW_ONCE_TITLES = {
    "photo": "Одноразовое фото",
    "video": "Одноразовое видео",
    "video_note": "Одноразовый кружок",
    "voice": "Одноразовое голосовое",
    "live_photo": "Одноразовое живое фото",
}
SAVED_CAPTION = "📥 <b>Сохранено: {kind}</b> от {name} ({username})"
SAVE_NOTHING = (
    "❌ Ответь командой <code>.save</code> на фото, видео, кружок или голосовое.\n"
    "Одноразовое нужно сохранять <b>до</b> того, как откроешь его."
)
SAVE_FAILED = "❌ Не получилось сохранить {kind} от {name}: {error}"

# ---- редактирование
EDITED = (
    "✏️ <b>Сообщение изменено</b>\n\n"
    "👤 Ник: {name}\n"
    "🔗 Юзернейм: {username}\n\n"
    "📄 <b>Начальное сообщение:</b>\n<blockquote expandable>{old}</blockquote>\n"
    "📝 <b>Изменённый текст:</b>\n<blockquote expandable>{new}</blockquote>"
)
EDITED_UNKNOWN_OLD = "<i>не знаю — сообщение пришло, когда бот был выключен</i>"
EMPTY_TEXT = "<i>(без текста)</i>"

# ---- общие ошибки
CANT_SEND = (
    "⚠️ Не получилось выполнить <code>{command}</code> в чате с {chat}:\n<code>{error}</code>\n\n"
    "Частая причина: Telegram разрешает боту писать только в чаты, где тебе писали "
    "за последние 24 часа, или у бота не хватает прав."
)

# ---- удалённые сообщения
DELETED_HEADER = "🗑 <b>{title}</b>\n\n👤 Ник: {name}\n🔗 Юзернейм: {username}"
DELETED_ITEM = "\n\n<blockquote expandable>{text}</blockquote>"
DELETED_MEDIA_CAPTION = "🗑 <b>Удалено: {kind}</b> от {name} ({username})"
DELETED_MORE = "\n\n…и ещё {count}"

# ---- новые команды
TYPE_USAGE = "❌ Формат: <code>.type текст</code>"
GLITCH_USAGE = "❌ Формат: <code>.glitch текст</code>"
WEATHER_USAGE = "❌ Формат: <code>.weather Москва</code>"
TIME_USAGE = "❌ Формат: <code>.time Токио</code>"
WEATHER_LOADING = "🌤 Узнаю погоду…"
MUSIC_USAGE = "❌ Формат: <code>.music название трека</code> или ссылка"
MUSIC_LOADING = "🎵 Ищу трек…"
MUSIC_SENDING = "📤 Отправляю трек…"
UNMUTEME_NEED_RIGHTS = (
    "⚠️ Для <code>.unmuteme</code> боту нужно право <b>«Удалять все сообщения»</b>, иначе "
    "собеседник будет видеть каждое твоё сообщение дважды.\n"
    "Включи его: Настройки → Автоматизация чатов → @my1dex1_bot → права на сообщения."
)
STATS_EMPTY = "📊 Пока нечего считать — статистика копится с момента, как бот подключён."

