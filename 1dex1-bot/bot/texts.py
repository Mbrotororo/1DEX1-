"""Все тексты бота в одном месте — легко поменять под себя."""

from __future__ import annotations

BOT_NAME = "1DEX1"

SHORT_DESCRIPTION = "Бот для личных переписок: мут, спам, антимут, удалённые сообщения, видео, музыка, анимации ❤️"
DESCRIPTION = (
    "Бот для личных переписок: мут, антимут, удалённые и изменённые сообщения, "
    "сохранение одноразок, видео без водяного знака, музыка, анимации.\n\n"
    "Нажми «Старт» — там как подключить и все команды."
)

# Короткий список — в /start
COMMANDS_SHORT = (
    "<b>Команды</b> — пиши прямо в переписке:\n"
    "Мут: .mute [10m] · .unmute · .unmuteme\n"
    "Анимации: .love · .rose · .fire · .heart · .type · .glitch · .loading\n"
    "Полезное: .link · .music · .weather · .currency · .time · .stats\n"
    "Ещё: .spam · .save · .stop · .help\n\n"
    "Само работает: правки и удалённые сообщения собеседника, одноразки "
    "(ответь на них до открытия)."
)

# Подробнее, по строке на команду — в /help и .help
COMMANDS_HELP = (
    "<b>Мут</b>\n"
    ".mute — замутить собеседника, .mute 10m — на время (30s, 2h, 1d)\n"
    ".unmute — размутить\n"
    ".unmuteme — антимут, если тебя замутил чужой бот (.unmuteme off — выключить)\n\n"
    "<b>Анимации</b> — можно со своим текстом: .love я скучаю\n"
    ".love · .rose · .fire · .heart · .type · .glitch · .loading\n\n"
    "<b>Полезное</b>\n"
    ".link ссылка — видео из TikTok, YouTube, VK без водяного знака\n"
    ".music название — трек\n"
    ".weather город — погода\n"
    ".currency 100 usd — курс валют\n"
    ".time город — время в городе\n"
    ".stats — статистика переписки\n"
    ".save — ответом на фото/видео: сохранить сюда\n\n"
    "<b>Ещё</b>\n"
    ".spam 20 текст — отправить текст 20 раз\n"
    ".stop — остановить спам, анимацию или загрузку\n\n"
    "<b>Само</b>\n"
    "Правки и удалённые сообщения собеседника приходят сюда. Одноразовое фото или видео — "
    "ответь на него до открытия, пришлю копию.\n\n"
    "Меню команд: напиши @my1dex1_bot в любой переписке."
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
    status = "✅ Подключён к твоему аккаунту." if connected else "⚠️ Пока не подключён."
    return (
        f"<b>{BOT_NAME}</b> — бот для личных переписок. Мутит, ловит удалённые и изменённые "
        "сообщения, сохраняет одноразки, качает видео и музыку.\n\n"
        f"{HOW_TO_CONNECT}\n{status}\n\n"
        f"{COMMANDS_SHORT}\n\n"
        "Подробнее — /help, настройки — /status"
    )

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

