"""Новые функции: удалённые сообщения, статистика, .weather, .music, анимации, миграции."""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from aiogram.types import BusinessMessagesDeleted, Chat

from bot import texts
from bot.animations import ANIMATIONS, love_frames
from bot.db import Database
from bot.handlers import business, edits

from .conftest import CONN_ID, FRIEND, OWNER, OWNER_DM, Harness, bad_request, photo

pytestmark = pytest.mark.asyncio


def dm(h: Harness) -> list:
    return [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]


# ------------------------------------------------------------------ удалённые сообщения

async def test_deleted_text_is_reported(h: Harness) -> None:
    m1 = await h.friend_says("я тебя люблю")
    m2 = await h.friend_says("шучу <3")
    h.session.clear()
    await h.friend_deletes(m1.message_id, m2.message_id)
    notes = dm(h)
    assert len(notes) == 1
    body = notes[0].text
    for part in ("Удалено 2 сообщения", "Вася Пупкин", "@vasya", "я тебя люблю", "шучу &lt;3"):
        assert part in body
    assert notes[0].business_connection_id is None


async def test_deleted_media_is_resent(h: Harness) -> None:
    m = await h.friend_says(None, photo=photo("AgACAgIAAxkBAAIBY2ZtNORMAL"), caption="смотри")
    h.session.clear()
    await h.friend_deletes(m.message_id)
    sent = h.session.of("SendPhoto")
    assert len(sent) == 1 and sent[0].chat_id == OWNER_DM
    assert sent[0].photo == "AgACAgIAAxkBAAIBY2ZtNORMAL"  # обычное фото — по file_id
    assert "Удалено: фото" in sent[0].caption and "смотри" in sent[0].caption


async def test_muted_messages_are_not_reported_as_deleted(h: Harness) -> None:
    await h.owner_says(".mute")
    spam = await h.friend_says("я в муте")
    h.session.clear()
    await h.friend_deletes(spam.message_id)  # это удаление сделал сам бот
    assert not dm(h)


async def test_bot_deletes_are_not_reported(h: Harness) -> None:
    m = await h.friend_says("привет")
    await h.app.delete(h.app.db.connections[CONN_ID], FRIEND.id, m.message_id)
    h.session.clear()
    await h.friend_deletes(m.message_id)
    assert not dm(h)


async def test_owner_messages_and_unknown_ids_are_ignored(h: Harness) -> None:
    mine = await h.owner_says("моё сообщение")
    h.session.clear()
    await h.friend_deletes(mine.message_id, 99999)
    assert not dm(h)


async def test_deleted_notifications_can_be_disabled(h: Harness) -> None:
    m = await h.friend_says("секрет")
    await h.app.db.toggle_setting(OWNER.id, "notify_deleted")
    h.session.clear()
    await h.friend_deletes(m.message_id)
    assert not dm(h)


async def test_many_deleted_messages_are_capped(h: Harness) -> None:
    ids = [(await h.friend_says("x" * 600)).message_id for _ in range(12)]
    h.session.clear()
    await h.friend_deletes(*ids)
    body = dm(h)[0].text
    assert len(body) <= 4096 and "…и ещё" in body


# ------------------------------------------------------------------ правки (склейка)

async def test_rapid_edits_produce_one_notification(h: Harness) -> None:
    edits.EDIT_DEBOUNCE = 0.2
    m = await h.friend_says("v0")
    h.session.clear()
    for i in range(1, 6):
        await h.friend_edits(m.message_id, f"v{i}", settle=False)
    await h.settle()
    notes = dm(h)
    assert len(notes) == 1
    assert "v0" in notes[0].text and "v5" in notes[0].text


async def test_edit_back_to_original_is_silent(h: Harness) -> None:
    edits.EDIT_DEBOUNCE = 0.2
    m = await h.friend_says("исходник")
    h.session.clear()
    await h.friend_edits(m.message_id, "другое", settle=False)
    await h.friend_edits(m.message_id, "исходник", settle=False)
    await h.settle()
    assert not dm(h)


# ------------------------------------------------------------------ статистика

async def test_stats_counts_both_sides(h: Harness) -> None:
    await h.friend_says("привет")
    await h.owner_says("здарова")
    await h.owner_says("как дела")
    await h.friend_says(None, photo=photo("AgACAgIAAxkBAAIBNORM"))
    h.session.clear()
    cmd = await h.owner_says(".stats")
    edit = h.session.of("EditMessageText")[0]
    assert edit.message_id == cmd.message_id
    text = edit.text
    assert "Статистика переписки с Вася" in text
    assert "Всего: <b>4</b>" in text
    assert "Ты: <b>2</b> (50%)" in text
    assert "Фото/видео: ты 0 · Вася 1" in text
    # команда .stats сама в статистику не попадает
    stats = await h.app.db.chat_stats(OWNER.id, FRIEND.id, business._day(h.app, time.time()), [])
    assert stats is not None and stats.total == 4


async def test_stats_reply_time_and_peer_events(h: Harness) -> None:
    m = await h.friend_says("раз")
    await h.owner_says("два")
    await h.friend_edits(m.message_id, "раз (изм)")
    await h.friend_deletes(m.message_id)
    stats = await h.app.db.chat_stats(OWNER.id, FRIEND.id, "x", [])
    assert stats.owner_reply_n == 1 and stats.peer_edits == 1 and stats.peer_deletes == 1


async def test_stats_empty(h: Harness) -> None:
    await h.owner_says(".stats")
    assert h.session.of("EditMessageText")[0].text == texts.STATS_EMPTY


def test_render_stats_handles_zero_division() -> None:
    import datetime as dt
    from bot.db import ChatStats
    text = business.render_stats(ChatStats(first_ts=0, owner_msgs=3), "<b>Хак</b>", dt.timezone.utc)
    assert "&lt;b&gt;Хак&lt;/b&gt;" in text and "—" in text


# ------------------------------------------------------------------ анимации

@pytest.mark.parametrize("name", ["rose", "fire", "heart", "loading"])
async def test_new_animations_run(h: Harness, name: str) -> None:
    cmd = await h.owner_says(f".{name} для тебя")
    await h.settle()
    frames = ANIMATIONS[name]("для тебя")
    edits_ = h.session.of("EditMessageText")
    assert [e.text for e in edits_] == frames
    assert all(e.message_id == cmd.message_id and e.parse_mode is None for e in edits_)


async def test_love_custom_text(h: Harness) -> None:
    await h.owner_says(".love я скучаю")
    await h.settle()
    final = h.session.of("EditMessageText")[-1].text
    assert final == love_frames("я скучаю")[-1] and "я скучаю" in final
    assert "сладких снов" not in final


@pytest.mark.parametrize("name", ["type", "glitch"])
async def test_text_animations_need_text(h: Harness, name: str) -> None:
    await h.owner_says(f".{name}")
    await h.settle()
    assert h.session.of("EditMessageText")[0].text in (texts.TYPE_USAGE, texts.GLITCH_USAGE)


async def test_type_animation_ends_with_text(h: Harness) -> None:
    await h.owner_says(".type привет, это 1DEX1")
    await h.settle()
    assert h.session.of("EditMessageText")[-1].text == "привет, это 1DEX1"


async def test_stop_cancels_animation_before_first_frame(h: Harness) -> None:
    await h.owner_says(".rose")
    await h.owner_says(".stop")  # прилетело сразу же
    await h.settle()
    assert len(h.session.of("EditMessageText")) <= 1


# ------------------------------------------------------------------ .weather

async def test_weather(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake(city: str) -> str:
        assert city == "Москва"
        return "🌤 <b>Москва</b>\n🌡 <b>+6°C</b>"

    monkeypatch.setattr(business, "fetch_weather", fake)
    cmd = await h.owner_says(".погода Москва")
    await h.settle()
    texts_ = [e.text for e in h.session.of("EditMessageText") if e.message_id == cmd.message_id]
    assert texts_ == [texts.WEATHER_LOADING, "🌤 <b>Москва</b>\n🌡 <b>+6°C</b>"]


async def test_weather_error(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.weather import WeatherError

    async def fake(city: str) -> str:
        raise WeatherError("Не нашёл город «Абырвалг»")

    async def no_sleep(_s: float) -> None:
        return None

    monkeypatch.setattr(business, "fetch_weather", fake)
    monkeypatch.setattr(business.asyncio, "sleep", no_sleep)
    await h.owner_says(".weather Абырвалг")
    await h.settle()
    assert any("Абырвалг" in e.text for e in h.session.of("EditMessageText"))


async def test_weather_default_city(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from dataclasses import replace
    seen: list[str] = []

    async def fake(city: str) -> str:
        seen.append(city)
        return "ok"

    monkeypatch.setattr(business, "fetch_weather", fake)
    await h.owner_says(".weather")
    assert h.session.of("EditMessageText")[0].text == texts.WEATHER_USAGE
    h.app.config = replace(h.app.config, weather_city="Казань")
    await h.owner_says(".weather")
    await h.settle()
    assert seen == ["Казань"]


# ------------------------------------------------------------------ .music

async def test_music(h: Harness, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.downloader import DownloadedAudio

    track = tmp_path / "t.mp3"
    track.write_bytes(b"\x00" * 10)

    async def fake(query: str, cfg: object) -> DownloadedAudio:
        assert query == "Miyagi I got love"
        return DownloadedAudio(path=track, workdir=tmp_path / "w", title="I Got Love",
                               performer="Miyagi & Эндшпиль", duration=276, thumbnail=None)

    monkeypatch.setattr(business, "download_audio", fake)
    cmd = await h.owner_says(".music Miyagi I got love")
    await h.settle()
    audio = h.session.of("SendAudio")[0]
    assert audio.business_connection_id == CONN_ID and audio.chat_id == FRIEND.id
    assert audio.title == "I Got Love" and audio.performer == "Miyagi & Эндшпиль"
    assert cmd.message_id in h.session.of("DeleteBusinessMessages")[-1].message_ids


async def test_music_not_found(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.downloader import DownloadError

    async def fake(query: str, cfg: object) -> None:
        raise DownloadError("Ничего не нашёл по запросу «asdfgh»")

    async def no_sleep(_s: float) -> None:
        return None

    monkeypatch.setattr(business, "download_audio", fake)
    monkeypatch.setattr(business.asyncio, "sleep", no_sleep)
    await h.owner_says(".music asdfgh")
    await h.settle()
    assert any("asdfgh" in e.text for e in h.session.of("EditMessageText"))
    assert not h.session.of("SendAudio")


# ------------------------------------------------------------------ мелкие исправления

async def test_legacy_unmute_button_still_works(h: Harness) -> None:
    cmd = await h.owner_says(".mute")
    await h.press(OWNER, f"unmute:{FRIEND.id}", cmd.message_id)
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None


async def test_respond_keeps_command_when_sending_fails(h: Harness) -> None:
    await h.friend_says("подключение")
    h.session.fail["EditMessageText"] = bad_request("Bad Request: MESSAGE_AUTHOR_REQUIRED")
    h.session.fail["SendMessage"] = lambda m: (
        bad_request("Bad Request: BUSINESS_PEER_USAGE_MISSING")(m) if m.business_connection_id else None)
    h.session.clear()
    await h.owner_says(".mute")
    assert not h.session.of("DeleteBusinessMessages")  # команда осталась на месте
    report = dm(h)
    assert report and "BUSINESS_PEER_USAGE_MISSING" in report[-1].text


async def test_spam_rejects_unicode_digits(h: Harness) -> None:
    await h.owner_says(".spam ² текст")
    assert h.session.of("EditMessageText")[0].text == texts.SPAM_USAGE


async def test_unmuteme_warns_without_delete_right(h: Harness) -> None:
    from aiogram.types import BusinessBotRights
    h.session.rights = BusinessBotRights(can_reply=True)
    await h.owner_says(".unmuteme")
    assert any("Удалять все сообщения" in c.text for c in dm(h))


async def test_antimute_keeps_dice_and_albums(h: Harness) -> None:
    from aiogram.types import Dice
    await h.owner_says(".unmuteme")
    h.session.clear()
    await h.owner_says(None, dice=Dice(emoji="🎲", value=6))
    await h.owner_says(None, photo=photo("AgACAgIAAxkBAAIBALBUM"), media_group_id="g1")
    assert not h.session.of("SendDice") and not h.session.of("SendPhoto")
    assert not h.session.of("DeleteBusinessMessages")


async def test_expire_does_not_remove_new_mute(h: Harness) -> None:
    await h.owner_says(".mute 1m")
    old = h.app.db.get_mute(OWNER.id, FRIEND.id)
    await h.owner_says(".mute 1h")  # пере-мут, пока таймер старого «истекал»
    await business.expire_mute(h.app, OWNER.id, FRIEND.id, old)
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is not None


async def test_settings_migration(tmp_path: Path) -> None:
    import aiosqlite
    path = tmp_path / "old.sqlite3"
    async with aiosqlite.connect(path) as conn:  # база старой версии, без notify_deleted
        await conn.execute("CREATE TABLE settings (user_id INTEGER PRIMARY KEY, "
                           "notify_edits INTEGER NOT NULL DEFAULT 1, save_view_once INTEGER NOT NULL DEFAULT 1)")
        await conn.execute("INSERT INTO settings VALUES (111, 0, 1)")
        await conn.commit()
    db = Database(path)
    await db.open()
    s = db.settings(111)
    assert s.notify_edits is False and s.save_view_once is True and s.notify_deleted is True
    await db.toggle_setting(111, "notify_deleted")
    assert db.settings(111).notify_deleted is False
    await db.close()


def test_allowed_ids_typo_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.config import _ids
    monkeypatch.setenv("X_IDS", "5374989039, 12abc")
    with pytest.raises(SystemExit):
        _ids("X_IDS")
    monkeypatch.setenv("X_IDS", "5374989039 123;456")
    assert _ids("X_IDS") == frozenset({5374989039, 123, 456})
    monkeypatch.setenv("X_IDS", "")
    assert _ids("X_IDS") == frozenset()


def test_deleted_handler_registered() -> None:
    from aiogram import Dispatcher
    from bot.handlers import build_router
    dp = Dispatcher()
    dp.include_router(build_router())
    assert "deleted_business_messages" in dp.resolve_used_update_types()


async def test_deleted_batch_with_foreign_ids_does_not_resurrect_copies(h: Harness) -> None:
    await h.owner_says(".unmuteme")
    await h.owner_says("копия")
    other = await h.friend_says("чужое")
    copy_ids = [k[2] for k in business._copies(h.app)]
    h.session.clear()
    # владелец очистил историю: в пачке и наша копия, и чужие сообщения
    await h.feed(deleted_business_messages=BusinessMessagesDeleted(
        business_connection_id=CONN_ID, chat=Chat(id=FRIEND.id, type="private", first_name="Вася"),
        message_ids=[*copy_ids, other.message_id]))
    await h.settle()
    assert not [c for c in h.session.of("SendMessage") if c.chat_id == FRIEND.id]



# ------------------------------------------------------------------ исправления после второго ревью

async def test_mute_rolled_back_when_banner_cannot_be_shown(h: Harness) -> None:
    await h.friend_says("подключение")
    h.session.fail["EditMessageText"] = bad_request("Bad Request: BUSINESS_PEER_USAGE_MISSING")
    h.session.fail["SendMessage"] = lambda m: (
        bad_request("Bad Request: BUSINESS_PEER_USAGE_MISSING")(m) if m.business_connection_id else None)
    await h.owner_says(".mute")
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is None
    await h.owner_says(".unmuteme")
    assert not h.app.db.has_antimute(OWNER.id, FRIEND.id)


async def test_late_incoming_does_not_overwrite_edit(h: Harness) -> None:
    m = h.msg(FRIEND, "кадр 1")
    edited = h.msg(FRIEND, "финальный текст", message_id=m.message_id, edit_date=1)
    await h.feed(edited_business_message=edited)  # правка обработалась раньше
    await h.feed(business_message=m)              # а само сообщение — позже
    await h.settle()
    cached = await h.app.db.get_message(OWNER.id, FRIEND.id, m.message_id)
    assert cached is not None and cached.text == "финальный текст"


async def test_stats_anchor_does_not_go_back(h: Harness) -> None:
    db = h.app.db
    await db.record_message(OWNER.id, 5, True, 101, "d", 1, None)
    await db.record_message(OWNER.id, 5, False, 100, "d", 1, None)   # пришло позже, но старее
    await db.record_message(OWNER.id, 5, True, 3600, "d", 1, None)
    stats = await db.chat_stats(OWNER.id, 5, "d", ["d"])
    assert stats.owner_reply_n == 0 and stats.total == 3


async def test_weather_error_not_double_escaped(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.weather import WeatherError

    async def fake(city: str) -> str:
        raise WeatherError("Не нашёл город «A&amp;B»")

    async def no_sleep(_s: float) -> None:
        return None

    monkeypatch.setattr(business, "fetch_weather", fake)
    monkeypatch.setattr(business.asyncio, "sleep", no_sleep)
    await h.owner_says(".weather A&B")
    await h.settle()
    assert any("A&amp;B" in e.text and "&amp;amp;" not in e.text for e in h.session.of("EditMessageText"))


def test_currency_thousands_and_cases() -> None:
    from bot.currency import parse_query
    assert parse_query("$1,000").amount == 1000
    assert parse_query("10,000.50 usd").amount == 10000.5
    assert parse_query("1,5 usd").amount == 1.5
    assert parse_query("100 usd в сумах").codes == ["USD", "UZS"]
    assert parse_query("50 евро в лирах").codes == ["EUR", "TRY"]


def test_tz_offset_parsing() -> None:
    from bot.config import _tz_offset
    assert _tz_offset("5:30") == 5.5 and _tz_offset("UTC+5") == 5 and _tz_offset("GMT-3:30") == -3.5
    with pytest.raises(SystemExit):
        _tz_offset("Москва")



@pytest.mark.parametrize("cmd", [".rain", ".firework", ".rainbow привет", ".wave привет", ".mock привет",
                                 ".дождь", ".салют", ".радуга", ".волна", ".мок"])
async def test_removed_commands_are_plain_messages(h: Harness, cmd: str) -> None:
    await h.owner_says(cmd)
    await h.settle()
    assert not h.session.of("EditMessageText") and not h.session.of("SendMessage")



async def test_status_and_help_in_bot_chat(h: Harness) -> None:
    from aiogram.types import Message
    from .conftest import NOW
    await h.friend_says("подключение")
    for cmd in ("/status", "/start", "/help"):
        h.session.clear()
        await h.feed(message=Message(message_id=1, date=NOW, chat=Chat(id=OWNER.id, type="private"),
                                     from_user=OWNER, text=cmd))
        sent = h.session.of("SendMessage")
        assert sent and sent[0].chat_id == OWNER.id, cmd
