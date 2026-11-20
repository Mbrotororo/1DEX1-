"""День рождения владельца, inline-меню команд, подключение .currency / .time."""

from __future__ import annotations

import datetime as dt
from dataclasses import replace

import pytest
from aiogram.types import InlineQuery

from bot import birthday, menu, texts
from bot.handlers import business

from .conftest import CONN_ID, FRIEND, OWNER, OWNER_DM, Harness

pytestmark = pytest.mark.asyncio

MSK = dt.timezone(dt.timedelta(hours=3))


def ts(day: int, month: int, hour: int = 12, year: int = 2027) -> float:
    return dt.datetime(year, month, day, hour, 0, tzinfo=MSK).timestamp()


# ------------------------------------------------------------------ день рождения

@pytest.mark.parametrize("text", ["С днём рождения!!!", "с днем рождения бро", "с др", "Сдр 🎉",
                                  "с днюхой", "Happy birthday!", "hbd", "поздравляю тебя",
                                  "С днём рожденья!", "happy bday", "с д.р.", "С Днюшечкой"])
def test_congrats_detected(text: str) -> None:
    assert birthday.is_congrats(text)


@pytest.mark.parametrize("text", ["привет", "сдругом гуляю", "др", "с днём", ""])
def test_not_congrats(text: str) -> None:
    assert not birthday.is_congrats(text)


async def test_birthday_flow(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    h.app.config = replace(h.app.config, allowed_user_ids=frozenset({OWNER.id}))
    await h.friend_says("подключение")  # чтобы бот узнал подключение
    clock = {"now": ts(27, 1, 0)}
    monkeypatch.setattr(birthday.time, "time", lambda: clock["now"])

    # 00:00 27 января — поздравление в личке (один раз)
    h.session.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    await birthday.birthday_tick(h.app)
    await h.settle()
    greetings = [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    assert len(greetings) == 1
    final = [e.text for e in h.session.of("EditMessageText")][-1]
    assert "1DEX1" in final and "рождения" in final.lower()

    # днём люди поздравляют — бот запоминает
    from aiogram.types import User
    other = User(id=333, is_bot=False, first_name="Есюша")
    msg = h.msg(other, "с др!!! 🎉").model_copy(update={"date": dt.datetime.fromtimestamp(ts(27, 1, 15), MSK)})
    msg = msg.model_copy(update={"chat": msg.chat.model_copy(update={"id": 333})})
    await h.feed(business_message=msg)
    msg2 = h.msg(FRIEND, "С днём рождения, бро").model_copy(
        update={"date": dt.datetime.fromtimestamp(ts(27, 1, 16), MSK)})
    await h.feed(business_message=msg2)
    await h.feed(business_message=msg2.model_copy(update={"message_id": 9999}))  # дважды — один раз
    wishes = await h.app.db.bday_wishes(OWNER.id, 2027)
    assert [w[1] for w in wishes] == ["Есюша", "Вася Пупкин"]

    # в 23:00 итогов ещё нет — вдруг кто-то поздравит перед полуночью
    clock["now"] = ts(27, 1, 23)
    h.session.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    assert not [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    # после полуночи — итоги дня
    clock["now"] = ts(28, 1, 0)
    h.session.clear()
    await birthday.birthday_tick(h.app)
    summary = [c for c in h.session.of("SendMessage") if c.chat_id == OWNER_DM]
    assert len(summary) == 1
    assert "поздравили <b>2</b> человека" in summary[0].text
    assert "Есюша" in summary[0].text and "Вася Пупкин" in summary[0].text
    h.session.clear()
    await birthday.birthday_tick(h.app)
    assert not h.session.of("SendMessage")


async def test_no_birthday_on_other_days(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    h.app.config = replace(h.app.config, allowed_user_ids=frozenset({OWNER.id}))
    await h.friend_says("подключение")
    monkeypatch.setattr(birthday.time, "time", lambda: ts(26, 1, 23))
    h.session.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    assert not h.session.calls
    msg = h.msg(FRIEND, "с др").model_copy(update={"date": dt.datetime.fromtimestamp(ts(26, 1), MSK)})
    await h.feed(business_message=msg)
    assert await h.app.db.bday_wishes(OWNER.id, 2027) == []


async def test_birthday_disabled(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    h.app.config = replace(h.app.config, birthday=None)
    await h.friend_says("подключение")
    monkeypatch.setattr(birthday.time, "time", lambda: ts(27, 1, 10))
    h.session.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    assert not h.session.calls


def test_leap_day_birthday_in_regular_year() -> None:
    class Cfg:
        birthday = (29, 2)
    class AppStub:
        config = Cfg()
    assert birthday.is_birthday(AppStub(), dt.datetime(2027, 2, 28))  # type: ignore[arg-type]
    assert birthday.is_birthday(AppStub(), dt.datetime(2028, 2, 29))  # type: ignore[arg-type]
    assert not birthday.is_birthday(AppStub(), dt.datetime(2028, 2, 28))  # type: ignore[arg-type]


def test_birthday_not_in_help_or_menu() -> None:
    assert "рожден" not in texts.COMMANDS_HELP.lower()
    assert all("birth" not in item.name and "bday" not in item.name for item in menu.MENU)


# ------------------------------------------------------------------ inline-меню

def test_menu_search() -> None:
    all_items = menu.search("")
    assert len(all_items) == len(menu.MENU)
    assert menu.search("love я скучаю") == [(menu.search("love")[0][0], ".love я скучаю")]
    assert menu.search(".love")[0][1] == ".love"
    names = [item.name for item, _ in menu.search("m")]
    assert {"mute", "mock", "music"} <= set(names)
    assert menu.search("погода Москва")[0][1] == ".weather Москва"
    assert menu.search("spam")[0][1] == ".spam"  # без аргументов спам сам не запустится
    assert menu.search("zzz") == []


def test_menu_covers_all_chat_commands() -> None:
    hidden = {"save"}  # работает только ответом на сообщение
    names = {item.name for item in menu.MENU}
    assert set(business.COMMANDS) - hidden <= names
    assert names <= set(business.COMMANDS)


async def test_inline_query_answers_owner_only(h: Harness) -> None:
    from aiogram.types import User
    q = InlineQuery(id="q1", from_user=OWNER, query="love я скучаю", offset="")
    await h.feed(inline_query=q)
    answer = h.session.of("AnswerInlineQuery")[-1]
    assert answer.is_personal
    assert answer.results[0].input_message_content.message_text == ".love я скучаю"

    from dataclasses import replace as dc_replace
    h.app.config = dc_replace(h.app.config, allowed_user_ids=frozenset({OWNER.id}))
    stranger = User(id=777, is_bot=False, first_name="X")
    await h.feed(inline_query=InlineQuery(id="q2", from_user=stranger, query="", offset=""))
    assert h.session.of("AnswerInlineQuery")[-1].results == []


async def test_command_sent_via_inline_bot_is_executed(h: Harness) -> None:
    from aiogram.types import User
    via = User(id=9000128594, is_bot=True, first_name="1DEX1", username="my1dex1_bot")
    await h.owner_says(".mute 5m", via_bot=via)
    assert h.app.db.get_mute(OWNER.id, FRIEND.id) is not None


# ------------------------------------------------------------------ .currency / .time

async def test_currency_wiring(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    async def fake(query: str) -> str:
        seen.append(query)
        return "💱 <b>100 USD = 8 192,90 RUB</b>"

    monkeypatch.setattr(business, "convert", fake)
    cmd = await h.owner_says(".курс 100 usd")
    await h.settle()
    assert seen == ["100 usd"]
    edit = h.session.of("EditMessageText")[-1]
    assert edit.message_id == cmd.message_id and "8 192,90" in edit.text


async def test_currency_error(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from bot.currency import CurrencyError

    async def fake(query: str) -> str:
        raise CurrencyError("Не знаю валюту «abc»")

    monkeypatch.setattr(business, "convert", fake)
    await h.owner_says(".currency 5 abc")
    await h.settle()
    assert any("abc" in e.text for e in h.session.of("EditMessageText"))


async def test_time_wiring(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, float]] = []

    async def fake(city: str, *, owner_offset_hours: float = 3.0) -> str:
        seen.append((city, owner_offset_hours))
        return "🕐 <b>Токио, Япония</b>"

    monkeypatch.setattr(business, "city_time", fake)
    await h.owner_says(".время Токио")
    await h.settle()
    assert seen == [("Токио", 3.0)]
    assert h.session.of("EditMessageText")[-1].text == "🕐 <b>Токио, Япония</b>"
    h.session.clear()
    await h.owner_says(".time")
    assert h.session.of("EditMessageText")[0].text == texts.TIME_USAGE


@pytest.mark.parametrize("name", ["rain", "firework", "rainbow", "wave"])
async def test_wave2_animations_run(h: Harness, name: str) -> None:
    from bot.animations import ANIMATIONS
    cmd = await h.owner_says(f".{name} привет")
    await h.settle()
    edits = h.session.of("EditMessageText")
    assert [e.text for e in edits] == ANIMATIONS[name]("привет")
    assert all(e.message_id == cmd.message_id for e in edits)


async def test_birthday_only_for_listed_owner(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    # ALLOWED_USER_IDS пустой — ботом может пользоваться кто угодно, поздравлять некого
    await h.friend_says("подключение")
    monkeypatch.setattr(birthday.time, "time", lambda: ts(27, 1, 10))
    h.session.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    assert not h.session.calls


async def test_birthday_greeting_retried_after_failure(h: Harness, monkeypatch: pytest.MonkeyPatch) -> None:
    from .conftest import bad_request
    h.app.config = replace(h.app.config, allowed_user_ids=frozenset({OWNER.id}))
    await h.friend_says("подключение")
    monkeypatch.setattr(birthday.time, "time", lambda: ts(27, 1, 0))
    h.session.fail["SendMessage"] = bad_request("Bad Request: chat not found")
    await birthday.birthday_tick(h.app)
    assert await h.app.db.kv_get(f"bday_greet:{OWNER.id}:2027") is None
    h.session.fail.clear()
    await birthday.birthday_tick(h.app)
    await h.settle()
    assert await h.app.db.kv_get(f"bday_greet:{OWNER.id}:2027") == "1"


def test_birthday_summary_is_chunked() -> None:
    wishes = [(i, "Очень Длинное Имя Человека " * 2, "с днём рождения, " + "желаю " * 30)
              for i in range(120)]
    chunks = birthday.render_summary("1DEX1", wishes)
    assert len(chunks) > 1
    assert all(len(c) <= 4096 for c in chunks)
    joined = "".join(chunks)
    assert "120. " in joined and "поздравили <b>120</b> человек" in chunks[0]
