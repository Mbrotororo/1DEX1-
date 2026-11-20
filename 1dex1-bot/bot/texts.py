"""Все тексты бота в одном месте — легко поменять под себя."""

from __future__ import annotations

BOT_NAME = "1DEX1"

SHORT_DESCRIPTION = "Бот для личных переписок: мут, спам, антимут, удалённые сообщения, видео, музыка, анимации ❤️"
DESCRIPTION = (
    "Бот 1DEX1 работает прямо в твоих личных чатах.\n\n"
    "• .mute / .unmute — замутить собеседника\n"
    "• .spam — заспамить\n"
    "• .unmuteme — антимут, если тебя замутили другим ботом\n"
    "• изменённые и удалённые сообщения собеседника\n"
    "• сохранение одноразовых фото и видео\n"
    "• .link — видео из TikTok / YouTube / VK без водяного знака\n"
    "• .music — музыка по названию\n"
    "• .love .rose .fire .heart .type .glitch .loading — анимации\n"
    "• .weather — погода, .stats — статистика переписки\n\n"
    "Нажми «Старт», чтобы узнать, как подключить."
)

COMMANDS_HELP = (
    "<b>Команды — пиши их прямо в личке с человеком:</b>\n\n"
    "<b>🔇 Мут</b>\n"
    "<code>.mute</code> — замутить навсегда, <code>.mute 10m</code> — на время "
    "(<code>30s</code>, <code>10m</code>, <code>2h</code>, <code>1d</code>, просто число = минуты)\n"
    "<code>.unmute</code> — размутить\n"
    "<code>.unmuteme</code> — антимут, если тебя замутили другим ботом "
    "(<code>.unmuteme off</code> — выключить)\n\n"
    "<b>✨ Анимации</b> (текст можно не писать)\n"
    "<code>.love текст</code> — сердечки ❤️ (без текста: «сладких снов»)\n"
    "<code>.rose текст</code> — розы 🌹\n"
    "<code>.fire текст</code> — огонь 🔥\n"
    "<code>.heart текст</code> — большое сердце\n"
    "<code>.type текст</code> — печатная машинка\n"
    "<code>.glitch текст</code> — глитч-эффект\n"
    "<code>.loading текст</code> — полоска загрузки\n\n"
    "<b>😈 Приколы</b>\n"
    "<code>.spam 20 текст</code> — отправить текст 20 раз\n"
    "\n"
    "<b>🛠 Полезное</b>\n"
    "<code>.link ссылка</code> — видео из TikTok / YouTube / VK без водяного знака\n"
    "<code>.music название</code> — найти и прислать трек\n"
    "<code>.weather город</code> — погода\n"
    "<code>.currency 100 usd</code> — курс валют (<code>.currency</code> — курсы ЦБ)\n"
    "<code>.time Токио</code> — сколько сейчас времени в городе\n"
    "<code>.stats</code> — статистика переписки с этим человеком\n"
    "<code>.save</code> — ответь на фото/видео/кружок, чтобы сохранить его сюда\n"
    "<code>.stop</code> — остановить спам, анимацию или загрузку\n"
    "<code>.help</code> — эта шпаргалка (придёт сюда, в бота)\n\n"
    "💡 <b>Меню команд:</b> напиши <code>@my1dex1_bot</code> в любой переписке — всплывёт список "
    "всех команд, нажми нужную. Текст можно дописать: <code>@my1dex1_bot love я скучаю</code>\n\n"
    "<b>Работает само:</b>\n"
    "✏️ собеседник изменил сообщение — пришлю, что было и что стало\n"
    "🗑 собеседник удалил сообщение — пришлю, что там было\n"
    "🔥 одноразовые фото/видео/кружки/голосовые — ответь на них <b>до открытия</b> "
    "любым текстом, и я пришлю их сюда обычными, чтобы можно было сохранить"
)

HOW_TO_CONNECT = (
    "<b>Как подключить (Premium не нужен):</b>\n"
    "1. Telegram → <b>Настройки</b> → <b>Автоматизация чатов</b>\n"
    "   <i>(в старых версиях: Telegram для бизнеса → Чат-боты)</i>\n"
    "2. Впиши <code>@my1dex1_bot</code>\n"
    "3. Выбери, к каким чатам у бота будет доступ (лучше — ко всем)\n"
    "4. В правах на сообщения включи всё: <b>отвечать</b>, <b>читать</b>, "
    "<b>удалять отправленные</b> и <b>удалять все сообщения</b>\n"
    "5. Готово — пиши команды прямо в переписках!"
)


PRIVACY = (
    "🔒 <b>Что бот хранит:</b> тексты сообщений собеседников — {days} дн., только чтобы показать "
    "«было → стало» при редактировании. Медиа не хранятся: сохранённые одноразовые приходят "
    "только тебе сюда. Всё лежит на сервере, где запущен бот, и никому не передаётся."
)


def start_text(name: str, user_id: int, connected: bool, cache_days: int = 7) -> str:
    status = (
        "✅ Бот подключён к твоему аккаунту."
        if connected
        else "⚠️ Бот ещё не подключён к твоему аккаунту."
    )
    return (
        f"Привет, <b>{name}</b>! Это бот <b>{BOT_NAME}</b> 💎\n\n"
        f"{status}\n\n"
        f"{HOW_TO_CONNECT}\n\n"
        f"{COMMANDS_HELP}\n\n"
        f"{PRIVACY.format(days=cache_days)}\n\n"
        f"Твой ID: <code>{user_id}</code>\n"
        "Статус и настройки: /status"
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

