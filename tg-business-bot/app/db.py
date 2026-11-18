"""Хранилище на SQLite (встроено в Python, отдельный сервер БД не нужен).

Все функции синхронные и быстрые: бот и веб-сервер работают в одном event loop,
а запросы к локальной SQLite занимают микросекунды.
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

from . import settings as settings_mod

FOREVER = "forever"

DEFAULT_PLANS = [
    {"id": "week", "title": "Неделя", "days": 7, "stars": 49},
    {"id": "month", "title": "Месяц", "days": 30, "stars": 149},
    {"id": "forever", "title": "Навсегда", "days": 0, "stars": 499},
]
DEFAULT_TRIAL_DAYS = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id     INTEGER PRIMARY KEY,
    username    TEXT,
    first_name  TEXT,
    created_at  INTEGER NOT NULL,
    settings    TEXT NOT NULL DEFAULT '{}',
    sub_until   INTEGER NOT NULL DEFAULT 0,
    forever     INTEGER NOT NULL DEFAULT 0,
    trial_used  INTEGER NOT NULL DEFAULT 0,
    trial_until INTEGER NOT NULL DEFAULT 0,
    started_bot INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS users_username ON users(lower(username));

CREATE TABLE IF NOT EXISTS connections (
    conn_id     TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    enabled     INTEGER NOT NULL,
    can_reply   INTEGER NOT NULL,
    can_delete  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS connections_user ON connections(user_id);

CREATE TABLE IF NOT EXISTS mutes (
    owner_id INTEGER NOT NULL,
    chat_id  INTEGER NOT NULL,
    until    INTEGER,              -- NULL = навсегда
    name     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (owner_id, chat_id)
);

CREATE TABLE IF NOT EXISTS custom_commands (
    owner_id INTEGER NOT NULL,
    trigger  TEXT NOT NULL,
    response TEXT NOT NULL,
    PRIMARY KEY (owner_id, trigger)
);

CREATE TABLE IF NOT EXISTS msg_log (
    owner_id   INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    from_id    INTEGER,
    text       TEXT,
    media_type TEXT,
    file_id    TEXT,
    ts         INTEGER NOT NULL,
    PRIMARY KEY (owner_id, chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS msg_log_ts ON msg_log(ts);

CREATE TABLE IF NOT EXISTS afk_sent (
    owner_id INTEGER NOT NULL,
    chat_id  INTEGER NOT NULL,
    ts       INTEGER NOT NULL,
    PRIMARY KEY (owner_id, chat_id)
);

CREATE TABLE IF NOT EXISTS reminders (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL,
    conn_id  TEXT NOT NULL,
    chat_id  INTEGER NOT NULL,
    due      INTEGER NOT NULL,
    text     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reminders_due ON reminders(due);

CREATE TABLE IF NOT EXISTS payments (
    charge_id  TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    plan       TEXT NOT NULL,
    days       INTEGER NOT NULL,
    stars      INTEGER NOT NULL,
    ts         INTEGER NOT NULL,
    refunded   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def now() -> int:
    return int(time.time())


class Database:
    def __init__(self, path: Path | str):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.executescript(SCHEMA)

    def close(self):
        self.conn.close()

    def _one(self, sql: str, *args) -> sqlite3.Row | None:
        return self.conn.execute(sql, args).fetchone()

    def _all(self, sql: str, *args) -> list[sqlite3.Row]:
        return self.conn.execute(sql, args).fetchall()

    def _exec(self, sql: str, *args) -> sqlite3.Cursor:
        return self.conn.execute(sql, args)

    # ───────────────────────── пользователи ─────────────────────────

    def upsert_user(self, user_id: int, username: str | None, first_name: str | None,
                    started_bot: bool = False) -> None:
        self._exec(
            """INSERT INTO users(user_id, username, first_name, created_at, started_bot)
               VALUES(?,?,?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET
                   username=excluded.username,
                   first_name=COALESCE(excluded.first_name, users.first_name),
                   started_bot=MAX(users.started_bot, excluded.started_bot)""",
            user_id, username, first_name, now(), int(started_bot),
        )

    def get_user(self, user_id: int) -> dict | None:
        row = self._one("SELECT * FROM users WHERE user_id=?", user_id)
        return dict(row) if row else None

    def find_user(self, query: str | int) -> dict | None:
        """Найти по id или @username."""
        q = str(query).strip()
        if q.lstrip("-").isdigit():
            return self.get_user(int(q))
        row = self._one("SELECT * FROM users WHERE lower(username)=?", q.lstrip("@").lower())
        return dict(row) if row else None

    def get_settings(self, user_id: int) -> dict[str, Any]:
        row = self._one("SELECT settings FROM users WHERE user_id=?", user_id)
        stored = json.loads(row["settings"]) if row else {}
        return settings_mod.normalize(stored)

    def save_settings(self, user_id: int, value: dict[str, Any]) -> None:
        self._exec("UPDATE users SET settings=? WHERE user_id=?",
                   json.dumps(value, ensure_ascii=False), user_id)

    def all_user_ids(self, only_started: bool = True) -> list[int]:
        sql = "SELECT user_id FROM users" + (" WHERE started_bot=1" if only_started else "")
        return [r["user_id"] for r in self._all(sql)]

    # ───────────────────────── доступ / подписка ─────────────────────────

    def access(self, user_id: int) -> dict[str, Any]:
        """{'active': bool, 'kind': 'forever'|'paid'|'trial'|'none', 'until': unix|None}"""
        u = self.get_user(user_id)
        t = now()
        if not u:
            return {"active": False, "kind": "none", "until": None}
        if u["forever"]:
            return {"active": True, "kind": "forever", "until": None}
        if u["sub_until"] > t:
            return {"active": True, "kind": "paid", "until": u["sub_until"]}
        if u["trial_until"] > t:
            return {"active": True, "kind": "trial", "until": u["trial_until"]}
        return {"active": False, "kind": "none", "until": None}

    def trial_available(self, user_id: int) -> bool:
        u = self.get_user(user_id)
        return bool(u) and not u["trial_used"] and not u["forever"] and u["sub_until"] <= now()

    def start_trial(self, user_id: int, days: int | None = None) -> bool:
        """Включить пробный период один раз. True — если включили сейчас."""
        if not self.trial_available(user_id):
            return False
        days = self.get_trial_days() if days is None else days
        if days <= 0:
            return False
        self._exec("UPDATE users SET trial_used=1, trial_until=? WHERE user_id=?",
                   now() + days * 86400, user_id)
        return True

    def extend_subscription(self, user_id: int, days: int) -> dict[str, Any]:
        """days > 0 — продлить на N дней; days == 0 — навсегда."""
        if days == 0:
            self._exec("UPDATE users SET forever=1 WHERE user_id=?", user_id)
        else:
            u = self.get_user(user_id) or {}
            base = max(now(), u.get("sub_until", 0), u.get("trial_until", 0))
            self._exec("UPDATE users SET sub_until=? WHERE user_id=?", base + days * 86400, user_id)
        return self.access(user_id)

    def revoke_subscription(self, user_id: int) -> None:
        self._exec("UPDATE users SET forever=0, sub_until=0, trial_until=0 WHERE user_id=?", user_id)

    # ───────────────────────── Business-подключения ─────────────────────────

    def save_connection(self, conn_id: str, user_id: int, enabled: bool,
                        can_reply: bool, can_delete: bool) -> None:
        self._exec(
            """INSERT INTO connections(conn_id, user_id, enabled, can_reply, can_delete, updated_at)
               VALUES(?,?,?,?,?,?)
               ON CONFLICT(conn_id) DO UPDATE SET user_id=excluded.user_id, enabled=excluded.enabled,
                   can_reply=excluded.can_reply, can_delete=excluded.can_delete,
                   updated_at=excluded.updated_at""",
            conn_id, user_id, int(enabled), int(can_reply), int(can_delete), now(),
        )

    def owner_of(self, conn_id: str) -> int | None:
        row = self._one("SELECT user_id FROM connections WHERE conn_id=?", conn_id)
        return row["user_id"] if row else None

    def connection_of_user(self, user_id: int) -> dict | None:
        row = self._one(
            "SELECT * FROM connections WHERE user_id=? ORDER BY enabled DESC, updated_at DESC LIMIT 1",
            user_id,
        )
        return dict(row) if row else None

    # ───────────────────────── мут ─────────────────────────

    def mute(self, owner_id: int, chat_id: int, until: int | None, name: str) -> None:
        self._exec(
            """INSERT INTO mutes(owner_id, chat_id, until, name, created_at) VALUES(?,?,?,?,?)
               ON CONFLICT(owner_id, chat_id) DO UPDATE SET until=excluded.until, name=excluded.name""",
            owner_id, chat_id, until, name, now(),
        )

    def unmute(self, owner_id: int, chat_id: int) -> bool:
        return self._exec("DELETE FROM mutes WHERE owner_id=? AND chat_id=?", owner_id, chat_id).rowcount > 0

    def is_muted(self, owner_id: int, chat_id: int) -> bool:
        row = self._one("SELECT until FROM mutes WHERE owner_id=? AND chat_id=?", owner_id, chat_id)
        if not row:
            return False
        if row["until"] is not None and row["until"] <= now():
            self.unmute(owner_id, chat_id)
            return False
        return True

    def list_mutes(self, owner_id: int) -> list[dict]:
        self._exec("DELETE FROM mutes WHERE owner_id=? AND until IS NOT NULL AND until<=?", owner_id, now())
        return [dict(r) for r in self._all(
            "SELECT chat_id, name, until, created_at FROM mutes WHERE owner_id=? ORDER BY created_at DESC",
            owner_id,
        )]

    # ───────────────────────── свои команды ─────────────────────────

    def list_custom(self, owner_id: int) -> list[dict]:
        return [dict(r) for r in self._all(
            "SELECT trigger, response FROM custom_commands WHERE owner_id=? ORDER BY trigger", owner_id)]

    def get_custom(self, owner_id: int, trigger: str) -> str | None:
        row = self._one("SELECT response FROM custom_commands WHERE owner_id=? AND trigger=?",
                        owner_id, trigger.lower())
        return row["response"] if row else None

    def set_custom(self, owner_id: int, trigger: str, response: str) -> None:
        exists = self.get_custom(owner_id, trigger) is not None
        if not exists and len(self.list_custom(owner_id)) >= settings_mod.CUSTOM_MAX_PER_USER:
            raise settings_mod.SettingsError(
                f"Максимум {settings_mod.CUSTOM_MAX_PER_USER} своих команд")
        self._exec(
            """INSERT INTO custom_commands(owner_id, trigger, response) VALUES(?,?,?)
               ON CONFLICT(owner_id, trigger) DO UPDATE SET response=excluded.response""",
            owner_id, trigger, response,
        )

    def delete_custom(self, owner_id: int, trigger: str) -> bool:
        return self._exec("DELETE FROM custom_commands WHERE owner_id=? AND trigger=?",
                          owner_id, trigger.lower()).rowcount > 0

    # ───────────────────────── журнал сообщений ─────────────────────────

    def log_message(self, owner_id: int, chat_id: int, message_id: int, from_id: int | None,
                    text: str | None, media_type: str | None = None, file_id: str | None = None) -> None:
        self._exec(
            """INSERT INTO msg_log(owner_id, chat_id, message_id, from_id, text, media_type, file_id, ts)
               VALUES(?,?,?,?,?,?,?,?)
               ON CONFLICT(owner_id, chat_id, message_id) DO UPDATE SET text=excluded.text,
                   media_type=excluded.media_type, file_id=excluded.file_id""",
            owner_id, chat_id, message_id, from_id, text, media_type, file_id, now(),
        )

    def get_logged(self, owner_id: int, chat_id: int, message_id: int) -> dict | None:
        row = self._one("SELECT * FROM msg_log WHERE owner_id=? AND chat_id=? AND message_id=?",
                        owner_id, chat_id, message_id)
        return dict(row) if row else None

    def pop_logged(self, owner_id: int, chat_id: int, message_ids: list[int]) -> list[dict]:
        out = []
        for mid in sorted(message_ids):
            row = self.get_logged(owner_id, chat_id, mid)
            if row:
                out.append(row)
                self._exec("DELETE FROM msg_log WHERE owner_id=? AND chat_id=? AND message_id=?",
                           owner_id, chat_id, mid)
        return out

    def recent_message_ids(self, owner_id: int, chat_id: int, limit: int,
                           from_id: int | None = None) -> list[int]:
        """Последние известные боту сообщения чата (новые первыми). from_id — только от этого человека."""
        if from_id is None:
            rows = self._all("SELECT message_id FROM msg_log WHERE owner_id=? AND chat_id=? "
                             "ORDER BY message_id DESC LIMIT ?", owner_id, chat_id, limit)
        else:
            rows = self._all("SELECT message_id FROM msg_log WHERE owner_id=? AND chat_id=? AND from_id=? "
                             "ORDER BY message_id DESC LIMIT ?", owner_id, chat_id, from_id, limit)
        return [r["message_id"] for r in rows]

    def forget_messages(self, owner_id: int, chat_id: int, message_ids: list[int]) -> None:
        self.conn.executemany("DELETE FROM msg_log WHERE owner_id=? AND chat_id=? AND message_id=?",
                              [(owner_id, chat_id, m) for m in message_ids])

    def chat_stats(self, owner_id: int, chat_id: int) -> dict[str, int]:
        row = self._one("SELECT COUNT(*) AS total, SUM(from_id=?) AS mine FROM msg_log "
                        "WHERE owner_id=? AND chat_id=?", owner_id, owner_id, chat_id)
        total = row["total"] or 0
        mine = row["mine"] or 0
        return {"total": total, "mine": mine, "theirs": total - mine}

    def prune_log(self, older_than_days: int) -> int:
        return self._exec("DELETE FROM msg_log WHERE ts<?", now() - older_than_days * 86400).rowcount

    # ───────────────────────── автоответчик ─────────────────────────

    def afk_due(self, owner_id: int, chat_id: int, cooldown_min: int) -> bool:
        row = self._one("SELECT ts FROM afk_sent WHERE owner_id=? AND chat_id=?", owner_id, chat_id)
        return not row or now() - row["ts"] >= cooldown_min * 60

    def mark_afk_sent(self, owner_id: int, chat_id: int) -> None:
        self._exec("INSERT INTO afk_sent(owner_id, chat_id, ts) VALUES(?,?,?) "
                   "ON CONFLICT(owner_id, chat_id) DO UPDATE SET ts=excluded.ts", owner_id, chat_id, now())

    def reset_afk(self, owner_id: int) -> None:
        self._exec("DELETE FROM afk_sent WHERE owner_id=?", owner_id)

    # ───────────────────────── напоминания ─────────────────────────

    def add_reminder(self, owner_id: int, conn_id: str, chat_id: int, due: int, text: str) -> int:
        return self._exec("INSERT INTO reminders(owner_id, conn_id, chat_id, due, text) VALUES(?,?,?,?,?)",
                          owner_id, conn_id, chat_id, due, text).lastrowid

    def due_reminders(self) -> list[dict]:
        return [dict(r) for r in self._all("SELECT * FROM reminders WHERE due<=? ORDER BY due", now())]

    def delete_reminder(self, reminder_id: int) -> None:
        self._exec("DELETE FROM reminders WHERE id=?", reminder_id)

    # ───────────────────────── оплаты ─────────────────────────

    def add_payment(self, charge_id: str, user_id: int, plan: str, days: int, stars: int) -> bool:
        """False — если такой платёж уже записан (Telegram может прислать повтор)."""
        try:
            self._exec("INSERT INTO payments(charge_id, user_id, plan, days, stars, ts) VALUES(?,?,?,?,?,?)",
                       charge_id, user_id, plan, days, stars, now())
            return True
        except sqlite3.IntegrityError:
            return False

    def get_payment(self, charge_id: str) -> dict | None:
        row = self._one("SELECT * FROM payments WHERE charge_id=?", charge_id)
        return dict(row) if row else None

    def mark_refunded(self, charge_id: str) -> dict | None:
        """Отметить возврат и забрать оплаченные дни. Возвращает платёж или None."""
        p = self.get_payment(charge_id)
        if not p or p["refunded"]:
            return None
        self._exec("UPDATE payments SET refunded=1 WHERE charge_id=?", charge_id)
        if p["days"] == 0:
            self._exec("UPDATE users SET forever=0 WHERE user_id=?", p["user_id"])
        else:
            self._exec("UPDATE users SET sub_until=MAX(0, sub_until-?) WHERE user_id=?",
                       p["days"] * 86400, p["user_id"])
        p["refunded"] = 1
        return p

    def recent_payments(self, limit: int = 30) -> list[dict]:
        return [dict(r) for r in self._all(
            """SELECT p.*, u.username, u.first_name FROM payments p
               LEFT JOIN users u ON u.user_id=p.user_id ORDER BY p.ts DESC LIMIT ?""", limit)]

    # ───────────────────────── настройки магазина ─────────────────────────

    def _get_cfg(self, key: str, default: Any) -> Any:
        row = self._one("SELECT value FROM app_config WHERE key=?", key)
        return json.loads(row["value"]) if row else default

    def _set_cfg(self, key: str, value: Any) -> None:
        self._exec("INSERT INTO app_config(key, value) VALUES(?,?) "
                   "ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, json.dumps(value, ensure_ascii=False))

    def get_plans(self) -> list[dict]:
        return self._get_cfg("plans", [dict(p) for p in DEFAULT_PLANS])

    def get_plan(self, plan_id: str) -> dict | None:
        return next((p for p in self.get_plans() if p["id"] == plan_id), None)

    def set_plans(self, plans: list[dict]) -> None:
        self._set_cfg("plans", plans)

    def get_trial_days(self) -> int:
        return int(self._get_cfg("trial_days", DEFAULT_TRIAL_DAYS))

    def set_trial_days(self, days: int) -> None:
        self._set_cfg("trial_days", int(days))

    # ───────────────────────── статистика ─────────────────────────

    def stats(self) -> dict[str, int]:
        t = now()
        one = lambda sql, *a: (self._one(sql, *a)[0] or 0)  # noqa: E731
        return {
            "users": one("SELECT COUNT(*) FROM users"),
            "connected": one("SELECT COUNT(DISTINCT user_id) FROM connections WHERE enabled=1"),
            "active_subs": one("SELECT COUNT(*) FROM users WHERE forever=1 OR sub_until>?", t),
            "trials": one("SELECT COUNT(*) FROM users WHERE forever=0 AND sub_until<=? AND trial_until>?", t, t),
            "revenue_stars": one("SELECT SUM(stars) FROM payments WHERE refunded=0"),
            "payments": one("SELECT COUNT(*) FROM payments WHERE refunded=0"),
            "revenue_30d": one("SELECT SUM(stars) FROM payments WHERE refunded=0 AND ts>?", t - 30 * 86400),
        }


def validate_plans(plans: Any) -> list[dict]:
    """Проверка тарифов, которые прислала админка."""
    if not isinstance(plans, list) or not 1 <= len(plans) <= 6:
        raise settings_mod.SettingsError("Нужно от 1 до 6 тарифов")
    out, seen = [], set()
    for p in plans:
        if not isinstance(p, dict):
            raise settings_mod.SettingsError("Неверный тариф")
        pid = str(p.get("id", "")).strip()
        title = str(p.get("title", "")).strip()
        days, stars = p.get("days"), p.get("stars")
        if not pid or not pid.replace("_", "").isalnum() or len(pid) > 20 or pid in seen:
            raise settings_mod.SettingsError("У каждого тарифа должен быть уникальный id (латиница/цифры)")
        if not title or len(title) > 32:
            raise settings_mod.SettingsError("Название тарифа: 1–32 символа")
        if not isinstance(days, int) or isinstance(days, bool) or not 0 <= days <= 3650:
            raise settings_mod.SettingsError("Дни: от 0 (навсегда) до 3650")
        if not isinstance(stars, int) or isinstance(stars, bool) or not 1 <= stars <= 10000:
            raise settings_mod.SettingsError("Цена: от 1 до 10000 звёзд")
        seen.add(pid)
        out.append({"id": pid, "title": title, "days": days, "stars": stars})
    return out
