"""Пересылка контента: копия сообщения владельца (антимут) и сохранение медиа в личку."""

from __future__ import annotations

import io
import logging
from typing import Any

from aiogram.types import BufferedInputFile, LinkPreviewOptions, Message, ReplyParameters

from .core import App, retry_flood
from .db import Connection
from .utils import is_self_destructing

log = logging.getLogger(__name__)

GETFILE_LIMIT = 20 * 1024 * 1024  # облачный Bot API отдаёт файлы до 20 МБ
NO_CAPTION_KINDS = {"video_note", "sticker"}
EXTENSIONS = {"photo": "jpg", "video": "mp4", "live_photo": "mp4", "video_note": "mp4", "voice": "ogg",
              "animation": "mp4", "audio": "mp3", "document": "bin", "sticker": "webp"}


def _reply_params(message: Message) -> ReplyParameters | None:
    reply = message.reply_to_message
    if reply is None:
        return None
    return ReplyParameters(message_id=reply.message_id, allow_sending_without_reply=True)


async def resend_as_owner(app: App, conn: Connection, message: Message) -> Message | None:
    """Отправляет копию сообщения владельца от его имени (copyMessage в бизнес-чатах не работает).

    Возвращает отправленное сообщение или None, если тип не поддерживается.
    """
    bot = app.bot
    chat_id = message.chat.id
    common: dict[str, Any] = {
        "chat_id": chat_id,
        "business_connection_id": conn.id,
        "reply_parameters": _reply_params(message),
    }
    caption: dict[str, Any] = {
        "caption": message.caption,
        "caption_entities": message.caption_entities,
        "parse_mode": None,
    }
    if message.has_media_spoiler:
        spoiler = {"has_spoiler": True}
    else:
        spoiler = {}

    async def call() -> Message | None:
        if message.live_photo or message.dice or message.media_group_id:
            # живое фото не переотправить как есть, кубик выпадет другим числом,
            # альбом развалится на отдельные сообщения — такие оставляем как есть
            return None
        if message.text is not None:
            # у бота превью ссылок по умолчанию выключено — для копии берём как у оригинала
            preview = message.link_preview_options or LinkPreviewOptions(is_disabled=False)
            return await bot.send_message(text=message.text, entities=message.entities,
                                          parse_mode=None, link_preview_options=preview, **common)
        if message.photo:
            return await bot.send_photo(photo=message.photo[-1].file_id, **caption, **spoiler, **common)
        if message.video:
            return await bot.send_video(video=message.video.file_id, **caption, **spoiler, **common)
        if message.animation:
            return await bot.send_animation(animation=message.animation.file_id, **caption, **spoiler, **common)
        if message.sticker:
            return await bot.send_sticker(sticker=message.sticker.file_id, **common)
        if message.voice:
            return await bot.send_voice(voice=message.voice.file_id, **caption, **common)
        if message.video_note:
            return await bot.send_video_note(video_note=message.video_note.file_id, **common)
        if message.audio:
            return await bot.send_audio(audio=message.audio.file_id, **caption, **common)
        if message.document:
            return await bot.send_document(document=message.document.file_id, **caption, **common)
        if message.location and not message.venue:
            return await bot.send_location(latitude=message.location.latitude,
                                           longitude=message.location.longitude, **common)
        if message.contact:
            return await bot.send_contact(phone_number=message.contact.phone_number,
                                          first_name=message.contact.first_name,
                                          last_name=message.contact.last_name, **common)
        return None

    return await retry_flood(call)


async def send_media_to_owner(app: App, conn: Connection, source: Message | None, kind: str,
                              file_id: str, caption: str) -> None:
    """Присылает медиа владельцу в личку с ботом обычным (не одноразовым) сообщением.

    • одноразовое (тип файла внутри file_id) — скачиваем (getFile, до 20 МБ) и заливаем заново:
      по file_id Telegram одноразовое фото переотправить не даёт;
    • обычное — сначала по file_id (быстро, без лимита размера, сохраняется имя файла),
      а если не вышло — скачиваем и заливаем заново.
    """
    chat_id = conn.user_chat_id
    if kind in NO_CAPTION_KINDS:
        # у кружков и стикеров нет подписи — подпись отдельным сообщением, один раз
        await retry_flood(lambda: app.bot.send_message(chat_id=chat_id, text=caption))

    size = _file_size(source, kind) if source is not None else None
    filename = _file_name(source, kind) if source is not None else None
    prefer_download = is_self_destructing(file_id) is not False

    async def by_id() -> None:
        await _send_by_file(app, chat_id, kind, file_id, caption)

    async def by_download() -> None:
        if size and size > GETFILE_LIMIT:
            raise RuntimeError("файл больше 20 МБ — Bot API не даёт его скачать")
        buf = io.BytesIO()
        await app.bot.download(file_id, destination=buf)
        data = buf.getvalue()
        if not data:
            raise RuntimeError("Telegram вернул пустой файл")
        name = filename or f"{kind}.{EXTENSIONS.get(kind, 'bin')}"
        await _send_by_file(app, chat_id, kind, BufferedInputFile(data, filename=name), caption)

    attempts = (by_download, by_id) if prefer_download else (by_id, by_download)
    errors: list[str] = []
    for attempt in attempts:
        try:
            await attempt()
            return
        except Exception as e:  # noqa: BLE001
            log.info("save media via %s failed (%s): %s", attempt.__name__, kind, e)
            errors.append(str(e))
    raise RuntimeError("; ".join(errors))


async def _send_by_file(app: App, chat_id: int, kind: str, file: Any, caption: str) -> None:
    bot = app.bot

    async def call() -> None:
        if kind == "photo":
            await bot.send_photo(chat_id=chat_id, photo=file, caption=caption)
        elif kind in ("video", "live_photo"):
            await bot.send_video(chat_id=chat_id, video=file, caption=caption, supports_streaming=True)
        elif kind == "video_note":
            await bot.send_video_note(chat_id=chat_id, video_note=file)
        elif kind == "voice":
            await bot.send_voice(chat_id=chat_id, voice=file, caption=caption)
        elif kind == "animation":
            await bot.send_animation(chat_id=chat_id, animation=file, caption=caption)
        elif kind == "audio":
            await bot.send_audio(chat_id=chat_id, audio=file, caption=caption)
        elif kind == "sticker":
            await bot.send_sticker(chat_id=chat_id, sticker=file)
        else:
            await bot.send_document(chat_id=chat_id, document=file, caption=caption)

    await retry_flood(call)


def _file_size(message: Message, kind: str) -> int | None:
    obj: Any
    if kind == "photo" and message.photo:
        obj = message.photo[-1]
    else:
        obj = getattr(message, kind, None)
    return getattr(obj, "file_size", None)


def _file_name(message: Message, kind: str) -> str | None:
    obj = getattr(message, kind, None) if kind != "photo" else None
    return getattr(obj, "file_name", None)

