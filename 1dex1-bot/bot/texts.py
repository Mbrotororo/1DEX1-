"""Все тексты бота в одном месте — легко поменять под себя."""

from __future__ import annotations

BOT_NAME = "1DEX1"

SHORT_DESCRIPTION = "Личный бот для чатов."
DESCRIPTION = "Личный бот для чатов."

# Короткий список — в /start
COMMANDS_SHORT = (
    "Команды пишутся прямо в переписке с человеком.\n\n"
    "🔇 <b>Мут</b>\n"
    "<code>.mute</code> — его сообщения сразу удаляются\n"
    "<code>.mute 10m</code> — на время: 30s, 10m, 2h, 1d\n"
    "<code>.unmute</code> — снять мут\n"
    "<code>.unmuteme</code> — если тебя замутили чужим ботом, твои сообщения всё равно дойдут\n\n"
    "✨ <b>Анимации</b>\n"
    "<code>.love</code> <code>.rose</code> <code>.fire</code> <code>.heart</code> "
    "<code>.type</code> <code>.glitch</code> <code>.loading</code>\n"
    "Можно со своим текстом: <code>.love я скучаю</code>\n\n"
    "🎬 <b>Скачать</b>\n"
    "<code>.link ссылка</code> — видео из TikTok, YouTube или VK без вотермарки\n"
    "<code>.music название</code> — трек в mp3\n\n"
    "🧰 <b>Полезное</b>\n"
    "<code>.weather Москва</code> — погода\n"
    "<code>.currency 100 usd</code> — курс валют\n"
    "<code>.time Токио</code> — сколько там времени\n"
    "<code>.stats</code> — статистика переписки\n"
    "<code>.save</code> — ответь на фото или видео, и оно придёт сюда\n\n"
    "💥 <b>Ещё</b>\n"
    "<code>.spam 20 текст</code> — отправить текст 20 раз\n"
    "<code>.stop</code> — остановить спам или анимацию\n\n"
    "👀 <b>Работает само</b>\n"
    "Если собеседник изменит или удалит сообщение — пришлю сюда, что там было.\n"
    "Одноразовое фото или видео — ответь на него до открытия, и я пришлю копию."
)

# Подробнее, по строке на команду — в /help и .help
COMMANDS_HELP = COMMANDS_SHORT

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
    status = "✅ Бот подключён" if connected else (
        "⚠️ Бот не подключён: Настройки → Автоматизация чатов → @my1dex1_bot, включи все права"
    )
    return (
        f"<b>{BOT_NAME}</b> — личный бот для чатов.\n{status}\n\n"
        f"{COMMANDS_SHORT}\n\n"
        "Настройки — /status"
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

