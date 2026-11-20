"""Сквозные сценарии: апдейты Telegram -> настоящие хендлеры -> вызовы Bot API."""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from aiogram.types import User

from bot import texts
from bot.animations import love_frames
from bot.handlers import business

from .conftest import CONN_ID, FRIEND, OWNER, OWNER_DM, Harness, bad_request, photo

pytestmark = pytest.mark.asyncio


# ------------------------------------------------------------------ подключение

async def test_unknown_connection_is_fetched_once(h: Harness) -> None:
    await h.friend_says("привет")
    await h.friend_says("как дела")
    assert len(h.session.of("GetBusinessConnection")) == 1
    assert h.app.db.connections[CONN_ID].user_id == OWNER.id


# ------------------------------------------------------------------ .mute / .unmute

async def test_mute_deletes_friend_messages_instantly(h: Harness) -> None:
    cmd = await h.owner_says(".mute 10m")
    edits = h.session.of("EditMessageText")
    assert edits and edits[0].message_id == cmd.message_id
    assert "на 10 минут" in edits[0].text
    assert edits[0].reply_markup.inline_keyboard[0][0].callback_data == f"unmute:{OWNER.id}:{FRIEND.id}"
    mute = h.app.db.get_mute(OWNER.id, FRIEND.id)
    assert mute is not None and mute.until and 590 < mute.until - time.time() <= 600
    assert mute.status_msg_id == cmd.message_id

    h.session.clear()
    spam = await h.friend_says("ты замучен?")
    deletes = h.session.of("DeleteBusinessMessages")
    assert len(deletes) == 1 and deletes[0].message_ids == [spam.message_id]
    assert deletes[0].business_connection_id == CONN_ID
    # сообщения замученного не кэшируются
    assert await h.app.db.get_message(OWNER.id, FRIEND.id, spam.message_id) is None


async def test_mute_forever_and_bad_duration(h: Harness) -> None:
    await h.owner_says(".mute")
    assert h.session.of("EditMessageText")[0].text == "🔇 <b>Собеседник в муте</b>"
    assert h.app.db.get_mute(OWNER.id, FRIEND.id).until is None

    await h.owner_says(".unmute")
    h.session.clear()
    await h.owner_says(".mute десять")
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
    assert texts.BAD_DURATION in h.session.of("EditMessageText")[0].text


async def test_mute_falls_back_to_new_message_if_edit_forbidden(h: Harness) -> None:
    h.session.fail["EditMessageText"] = bad_request("Bad Request: MESSAGE_AUTHOR_REQUIRED")
    cmd = await h.owner_says(".mute 1h")
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]
    sent = h.session.of("SendMessage")
    assert sent and sent[0].business_connection_id == CONN_ID and "в муте" in sent[0].text
    assert h.app.db.get_mute(OWNER.id, FRIEND.id).status_msg_id != cmd.message_id


async def test_unmute_turns_status_into_unmuted(h: Harness) -> None:
    cmd = await h.owner_says(".mute")
    h.session.clear()
    unmute = await h.owner_says(".unmute")
    edit = h.session.of("EditMessageText")[0]
    assert edit.message_id == cmd.message_id and edit.text == texts.UNMUTED
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [unmute.message_id]
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None

    h.session.clear()
    await h.friend_says("я снова тут")
    assert not h.session.of("DeleteBusinessMessages")


async def test_unmute_when_not_muted_flashes(h: Harness) -> None:
    await h.owner_says(".unmute")
    assert h.session.of("EditMessageText")[0].text == texts.NOT_MUTED


async def test_friend_cannot_use_commands(h: Harness) -> None:
    await h.friend_says(".mute")
    await h.friend_says(".spam 5 хаха")
    await h.settle()
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
    assert not h.session.of("SendMessage") and not h.session.of("EditMessageText")


async def test_unmute_button_only_for_owner(h: Harness) -> None:
    cmd = await h.owner_says(".mute")
    h.session.clear()
    await h.press(FRIEND, f"unmute:{OWNER.id}:{FRIEND.id}", cmd.message_id)
    answer = h.session.of("AnswerCallbackQuery")[0]
    assert answer.text == texts.ONLY_OWNER_CAN_UNMUTE and answer.show_alert
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is not None

    await h.press(OWNER, f"unmute:{OWNER.id}:{FRIEND.id}", cmd.message_id)
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
    edit = h.session.of("EditMessageText")[-1]
    assert edit.text == texts.UNMUTED and edit.business_connection_id == CONN_ID


async def test_timed_mute_expires(h: Harness) -> None:
    cmd = await h.owner_says(".mute 30s")
    mute = h.app.db.get_mute(OWNER.id, FRIEND.id)
    mute.until = time.time() - 1  # время вышло
    h.session.clear()
    msg = await h.friend_says("я свободен")
    assert not h.session.of("DeleteBusinessMessages")
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
    expired = h.session.of("EditMessageText")[0]
    assert expired.message_id == cmd.message_id and expired.text == texts.MUTE_EXPIRED
    assert await h.app.db.get_message(OWNER.id, FRIEND.id, msg.message_id) is not None


async def test_missing_delete_right_warns_owner(h: Harness) -> None:
    from aiogram.types import BusinessBotRights
    h.session.rights = BusinessBotRights(can_reply=True, can_delete_sent_messages=True)
    await h.owner_says(".mute")
    warn = [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    assert warn and "Удалять все сообщения" in warn[0].text


# ------------------------------------------------------------------ .spam / .stop

async def test_spam_sends_n_messages(h: Harness) -> None:
    cmd = await h.owner_says(".spam 3 сабака\nсутулая")
    await h.settle()
    sent = h.session.of("SendMessage")
    assert len(sent) == 3
    assert all(s.text == "сабака\nсутулая" and s.business_connection_id == CONN_ID
               and s.chat_id == FRIEND.id and s.parse_mode is None for s in sent)
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]


@pytest.mark.parametrize("text", [".spam", ".spam abc текст", ".spam 5", ".spam 0 hi"])
async def test_spam_usage_errors(h: Harness, text: str) -> None:
    await h.owner_says(text)
    await h.settle()
    assert h.session.of("EditMessageText")[0].text == texts.SPAM_USAGE
    assert not [s for s in h.session.of("SendMessage") if s.chat_id == FRIEND.id]


async def test_spam_limit(h: Harness) -> None:
    await h.owner_says(".spam 1000 хаха")
    assert "Максимум 100" in h.session.of("EditMessageText")[0].text


async def test_stop_cancels_spam(h: Harness, tmp_path: Path) -> None:
    from dataclasses import replace
    h.app.config = replace(h.app.config, spam_delay=0.05)
    await h.owner_says(".spam 100 флуд")
    import asyncio
    await asyncio.sleep(0.12)
    await h.owner_says(".stop")
    await h.settle()
    assert 1 <= len(h.session.of("SendMessage")) < 10


# ------------------------------------------------------------------ .unmuteme

async def test_antimute_duplicates_and_removes_original(h: Harness) -> None:
    cmd = await h.owner_says(".unmuteme")
    assert h.app.db.has_antimute(OWNER.id, FRIEND.id)
    # плашку шлём новым сообщением, команду удаляем (её мог снести чужой бот)
    assert not h.session.of("EditMessageText")
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]
    assert h.session.of("SendMessage")[0].text == texts.ANTIMUTE_ON

    h.session.clear()
    orig = await h.owner_says("ты меня не заткнёшь")
    copy = h.session.of("SendMessage")
    assert len(copy) == 1 and copy[0].text == "ты меня не заткнёшь"
    assert copy[0].business_connection_id == CONN_ID and copy[0].parse_mode is None
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [orig.message_id]

    h.session.clear()
    await h.owner_says(None, photo=photo("OWNER_PIC"), caption="смотри")
    sent_photo = h.session.of("SendPhoto")[0]
    assert sent_photo.photo == "OWNER_PIC" and sent_photo.caption == "смотри"


async def test_antimute_watchdog_resends_deleted_copy(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from aiogram.types import BusinessMessagesDeleted, Chat
    monkeypatch.setattr(business.asyncio, "sleep", _instant_sleep)
    await h.owner_says(".unmuteme")
    h.session.clear()
    await h.owner_says("не удалишь")
    copy_ids = [h.session.of("SendMessage")[0]]
    assert len(copy_ids) == 1
    chat = Chat(id=FRIEND.id, type="private")
    resends = 0
    # чужой бот сносит каждую нашу копию — мы переотправляем, но максимум до 3-го поколения
    for _ in range(5):
        live = [k[2] for k in business._copies(h.app)]
        if not live:
            break
        h.session.clear()
        await h.feed(deleted_business_messages=BusinessMessagesDeleted(
            business_connection_id=CONN_ID, chat=chat, message_ids=live))
        await h.settle()
        sent = h.session.of("SendMessage")
        assert all(m.text == "не удалишь" for m in sent)
        resends += len(sent)
        # переотправленные копии оригинал уже не удаляют (его нет)
        assert not h.session.of("DeleteBusinessMessages")
    assert resends == 2
    assert not business._copies(h.app)


async def test_antimute_watchdog_ignores_late_deletes(h: Harness) -> None:
    from aiogram.types import BusinessMessagesDeleted, Chat
    await h.owner_says(".unmuteme")
    await h.owner_says("удалю сам потом")
    key = next(iter(business._copies(h.app)))
    business._copies(h.app)[key].sent_at -= 60  # прошла минута — это удалил владелец
    h.session.clear()
    await h.feed(deleted_business_messages=BusinessMessagesDeleted(
        business_connection_id=CONN_ID, chat=Chat(id=FRIEND.id, type="private"), message_ids=[key[2]]))
    await h.settle()
    assert not h.session.of("SendMessage")


async def test_antimute_ignores_messages_sent_by_bots(h: Harness) -> None:
    await h.owner_says(".unmuteme")
    h.session.clear()
    bot_user = User(id=999, is_bot=True, first_name="1DEX1")
    await h.owner_says("копия от бота", sender_business_bot=bot_user)
    assert not h.session.calls  # никакого зацикливания


async def test_antimute_off(h: Harness) -> None:
    await h.owner_says(".unmuteme")
    await h.owner_says(".unmuteme off")
    assert not h.app.db.has_antimute(OWNER.id, FRIEND.id)
    await h.settle()  # плашка «Антимут выключен» исчезает сама
    h.session.clear()
    await h.owner_says("обычное сообщение")
    assert not h.session.calls


async def test_antimute_love_uses_new_message(h: Harness) -> None:
    await h.owner_says(".unmuteme")
    h.session.clear()
    cmd = await h.owner_says(".love")
    await h.settle()
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]
    first = h.session.of("SendMessage")[0]
    edits = h.session.of("EditMessageText")
    assert all(e.message_id != cmd.message_id for e in edits)
    assert edits[-1].text == love_frames()[-1]
    assert first.text == love_frames()[0]


# ------------------------------------------------------------------ правки

async def test_edit_notification(h: Harness) -> None:
    m = await h.friend_says("я тебя люблю")
    h.session.clear()
    await h.friend_edits(m.message_id, "я тебя ненавижу")
    note = h.session.of("SendMessage")
    assert len(note) == 1 and note[0].chat_id == OWNER_DM
    assert note[0].business_connection_id is None
    body = note[0].text
    for part in ("Вася Пупкин", "@vasya", "я тебя люблю", "я тебя ненавижу"):
        assert part in body
    # вторая правка показывает предыдущий вариант как «начальный»
    h.session.clear()
    await h.friend_edits(m.message_id, "шучу <3")
    body = h.session.of("SendMessage")[0].text
    assert "я тебя ненавижу" in body and "шучу &lt;3" in body


async def test_edit_without_text_change_is_ignored(h: Harness) -> None:
    m = await h.friend_says("одно и то же")
    h.session.clear()
    await h.friend_edits(m.message_id, "одно и то же")
    assert not h.session.of("SendMessage")


async def test_edit_of_unknown_message(h: Harness) -> None:
    await h.friend_says("для загрузки подключения")
    h.session.clear()
    await h.friend_edits(4242, "новый текст")
    body = h.session.of("SendMessage")[0].text
    assert texts.EDITED_UNKNOWN_OLD in body and "новый текст" in body


async def test_owner_edits_are_not_reported(h: Harness) -> None:
    m = await h.owner_says("моё")
    h.session.clear()
    edited = h.msg(OWNER, "моё изменённое", message_id=m.message_id, edit_date=None)
    await h.feed(edited_business_message=edited)
    assert not h.session.of("SendMessage")


async def test_edit_notifications_can_be_disabled(h: Harness) -> None:
    m = await h.friend_says("раз")
    await h.app.db.toggle_setting(OWNER.id, "notify_edits")
    h.session.clear()
    await h.friend_edits(m.message_id, "два")
    assert not h.session.of("SendMessage")


# ------------------------------------------------------------------ одноразовые

VIEW_ONCE_PHOTO = "FgACAgIAAxkBAAIBY2ZtSECRET"  # тип 22 = SelfDestructingPhoto
NORMAL_PHOTO = "AgACAgIAAxkBAAIBY2ZtNORMAL"     # тип 2 = Photo
VIEW_ONCE_NOTE = "GAACAgIAAxkBAAIBY2ZtNOTE"      # тип 24 = SelfDestructingVideoNote
VIEW_ONCE_VIDEO = "FwACAgIAAxkBAAIBY2ZtVIDEO"    # тип 23 = SelfDestructingVideo


async def test_reply_to_view_once_photo_saves_it(h: Harness) -> None:
    await h.friend_says("чтобы было подключение")
    view_once = h.msg(FRIEND, None, photo=photo(VIEW_ONCE_PHOTO), message_id=777)
    h.session.clear()
    await h.owner_says("ого", reply_to_message=view_once)
    # фото: скачали через getFile и залили заново (по file_id одноразовое не переотправить)
    assert h.session.of("GetFile")[0].file_id == VIEW_ONCE_PHOTO
    saved = h.session.of("SendPhoto")
    assert len(saved) == 1 and saved[0].chat_id == OWNER_DM and not isinstance(saved[0].photo, str)
    assert "Одноразовое фото" in saved[0].caption
    assert "Вася Пупкин" in saved[0].caption and "@vasya" in saved[0].caption
    # ответ владельца остаётся в переписке, ничего не удаляем
    assert not h.session.of("DeleteBusinessMessages")
    # повторный ответ на то же сообщение не дублирует
    h.session.clear()
    await h.owner_says("ещё раз", reply_to_message=view_once)
    assert not h.session.of("SendPhoto")


async def test_reply_to_normal_photo_is_not_saved(h: Harness) -> None:
    await h.friend_says("подключение")
    normal = h.msg(FRIEND, None, photo=photo(NORMAL_PHOTO), message_id=555)  # даже если нет в кэше
    h.session.clear()
    await h.owner_says("красиво", reply_to_message=normal)
    assert not h.session.of("SendPhoto")


async def test_unknown_file_id_format_uses_cache_heuristic(h: Harness) -> None:
    cached = await h.friend_says(None, photo=photo("WEIRD_ID_1"))
    h.session.clear()
    await h.owner_says("ок", reply_to_message=cached)
    assert not h.session.of("SendPhoto")
    unknown = h.msg(FRIEND, None, photo=photo("WEIRD_ID_2"), message_id=556)
    await h.owner_says("а это?", reply_to_message=unknown)
    assert len(h.session.of("SendPhoto")) == 1


async def test_reply_to_own_media_is_ignored(h: Harness) -> None:
    await h.friend_says("подключение")
    mine = h.msg(OWNER, None, photo=photo(VIEW_ONCE_PHOTO), message_id=600)
    h.session.clear()
    await h.owner_says("моё", reply_to_message=mine)
    assert not h.session.of("SendPhoto")


async def test_save_command_forces_and_hides_itself(h: Harness) -> None:
    normal = await h.friend_says(None, photo=photo(NORMAL_PHOTO))
    h.session.clear()
    cmd = await h.owner_says(".save", reply_to_message=normal)
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]
    sent = h.session.of("SendPhoto")[0]
    assert "Сохранено: фото" in sent.caption


async def test_save_without_media_explains(h: Harness) -> None:
    text_msg = await h.friend_says("просто текст")
    h.session.clear()
    await h.owner_says(".save", reply_to_message=text_msg)
    assert "до" in h.session.of("EditMessageText")[0].text


async def test_big_view_once_video_resent_by_file_id(h: Harness) -> None:
    from aiogram.types import Video
    await h.friend_says("подключение")
    big = h.msg(FRIEND, None, message_id=901, video=Video(
        file_id=VIEW_ONCE_VIDEO, file_unique_id="v", width=1080, height=1920, duration=60,
        file_size=40 * 1024 * 1024))
    h.session.clear()
    await h.owner_says("😳", reply_to_message=big)
    assert not h.session.of("GetFile")  # больше 20 МБ — не качаем
    video = h.session.of("SendVideo")[0]
    assert video.video == VIEW_ONCE_VIDEO and video.chat_id == OWNER_DM


async def test_save_failure_is_reported_and_retryable(h: Harness) -> None:
    await h.friend_says("подключение")
    h.session.fail["SendPhoto"] = bad_request("Bad Request: Can't use file of type SelfDestructingPhoto as Photo")
    view_once = h.msg(FRIEND, None, photo=photo(VIEW_ONCE_PHOTO), message_id=778)
    h.session.clear()
    await h.owner_says("ой", reply_to_message=view_once)
    report = [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    assert report and "Не получилось сохранить" in report[0].text
    # после ошибки можно попробовать снова
    h.session.fail.clear()
    await h.owner_says(".save", reply_to_message=view_once)
    assert any(not isinstance(p.photo, str) for p in h.session.of("SendPhoto"))


async def test_video_note_saved_with_separate_caption(h: Harness) -> None:
    from aiogram.types import VideoNote
    await h.friend_says("подключение")
    note = h.msg(FRIEND, None, message_id=999,
                 video_note=VideoNote(file_id=VIEW_ONCE_NOTE, file_unique_id="n", length=240, duration=5))
    h.session.clear()
    await h.owner_says("ахах", reply_to_message=note)
    captions = [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    assert len(captions) == 1 and "Одноразовый кружок" in captions[0].text
    assert len(h.session.of("SendVideoNote")) == 1


# ------------------------------------------------------------------ .love

async def test_love_animates_owner_message(h: Harness) -> None:
    cmd = await h.owner_says(".love")
    await h.settle()
    edits = h.session.of("EditMessageText")
    frames = love_frames()
    assert [e.text for e in edits] == frames
    assert all(e.message_id == cmd.message_id and e.parse_mode is None for e in edits)
    assert "сладких снов" in edits[-1].text


async def test_love_custom_text_and_fallback(h: Harness) -> None:
    h.session.fail["EditMessageText"] = lambda m: (
        bad_request()(m) if m.message_id < 10_000 else None)  # своё сообщение править нельзя
    cmd = await h.owner_says(".love я тебя люблю")
    await h.settle()
    assert h.session.of("DeleteBusinessMessages")[0].message_ids == [cmd.message_id]
    ok_edits = [e for e in h.session.of("EditMessageText") if e.message_id >= 10_000]
    assert ok_edits and "я тебя люблю" in ok_edits[-1].text


# ------------------------------------------------------------------ .link

async def test_link_sends_video(h: Harness, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.downloader import DownloadedVideo

    video_file = tmp_path / "v.mp4"
    video_file.write_bytes(b"\x00" * 100)

    async def fake_download(url: str, cfg: object) -> DownloadedVideo:
        assert url == "https://vm.tiktok.com/ZN8aosDJA/"
        return DownloadedVideo(path=video_file, workdir=tmp_path / "work", title="t",
                               width=576, height=1024, duration=20)

    monkeypatch.setattr(business, "download_video", fake_download)
    cmd = await h.owner_says(".link https://vm.tiktok.com/ZN8aosDJA/")
    await h.settle()
    assert h.session.of("EditMessageText")[0].text == texts.LINK_LOADING
    video = h.session.of("SendVideo")[0]
    assert video.business_connection_id == CONN_ID and video.chat_id == FRIEND.id
    assert video.width == 576 and video.supports_streaming
    assert cmd.message_id in h.session.of("DeleteBusinessMessages")[-1].message_ids


async def test_link_rejects_other_sites(h: Harness) -> None:
    await h.owner_says(".link https://example.com/video.mp4")
    assert h.session.of("EditMessageText")[0].text == texts.LINK_UNSUPPORTED


async def test_link_error_is_shown(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.downloader import DownloadError

    async def fail(url: str, cfg: object) -> None:
        raise DownloadError("Видео недоступно или удалено.")

    monkeypatch.setattr(business, "download_video", fail)
    monkeypatch.setattr(business.asyncio, "sleep", _instant_sleep)
    await h.owner_says(".link youtu.be/abc")
    await h.settle()
    assert any("недоступно" in e.text for e in h.session.of("EditMessageText"))


async def _instant_sleep(_seconds: float) -> None:
    return None


# ------------------------------------------------------------------ доступ

async def test_allowed_users_whitelist(h: Harness) -> None:
    from dataclasses import replace
    h.app.config = replace(h.app.config, allowed_user_ids=frozenset({12345}))
    await h.owner_says(".mute")
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
