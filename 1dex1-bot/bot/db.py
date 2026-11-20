"""SQLite-хранилище + быстрый кэш в памяти для горячих проверок (мут/антимут)."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

import aiosqlite

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS connections (
    id            TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    user_chat_id  INTEGER NOT NULL,
    is_enabled    INTEGER NOT NULL,
    can_reply     INTEGER NOT NULL DEFAULT 0,
    can_read      INTEGER NOT NULL DEFAULT 0,
    can_delete_sent INTEGER NOT NULL DEFAULT 0,
    can_delete_all  INTEGER NOT NULL DEFAULT 0,
    updated_at    REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS connections_user ON connections(user_id);

CREATE TABLE IF NOT EXISTS mutes (
    owner_id      INTEGER NOT NULL,
    chat_id       INTEGER NOT NULL,
    until         REAL,
    status_msg_id INTEGER,
    connection_id TEXT,
    created_at    REAL NOT NULL,
    PRIMARY KEY (owner_id, chat_id)
);

CREATE TABLE IF NOT EXISTS antimute (
    owner_id   INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    created_at REAL NOT NULL,
    PRIMARY KEY (owner_id, chat_id)
);

CREATE TABLE IF NOT EXISTS messages (
    owner_id   INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    from_id    INTEGER,
    text       TEXT,
    media_type TEXT,
    file_id    TEXT,
    date       REAL NOT NULL,
    PRIMARY KEY (owner_id, chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS messages_date ON messages(date);

CREATE TABLE IF NOT EXISTS saved_media (
    owner_id   INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    saved_at   REAL NOT NULL,
    PRIMARY KEY (owner_id, chat_id, message_id)
);

CREATE TABLE IF NOT EXISTS settings (
    user_id        INTEGER PRIMARY KEY,
    notify_edits   INTEGER NOT NULL DEFAULT 1,
    save_view_once INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chat_stats (
    owner_id        INTEGER NOT NULL,
    chat_id         INTEGER NOT NULL,
    first_ts        REAL NOT NULL,
    last_ts         REAL,
    last_from_owner INTEGER,
    owner_msgs      INTEGER NOT NULL DEFAULT 0,
    peer_msgs       INTEGER NOT NULL DEFAULT 0,
    owner_chars     INTEGER NOT NULL DEFAULT 0,
    peer_chars      INTEGER NOT NULL DEFAULT 0,
    owner_media     INTEGER NOT NULL DEFAULT 0,
    peer_media      INTEGER NOT NULL DEFAULT 0,
    owner_voice     INTEGER NOT NULL DEFAULT 0,
    peer_voice      INTEGER NOT NULL DEFAULT 0,
    owner_stickers  INTEGER NOT NULL DEFAULT 0,
    peer_stickers   INTEGER NOT NULL DEFAULT 0,
    owner_reply_sum REAL NOT NULL DEFAULT 0,
    owner_reply_n   INTEGER NOT NULL DEFAULT 0,
    peer_reply_sum  REAL NOT NULL DEFAULT 0,
    peer_reply_n    INTEGER NOT NULL DEFAULT 0,
    peer_edits      INTEGER NOT NULL DEFAULT 0,
    peer_deletes    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, chat_id)
);

CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bday_wishes (
    owner_id INTEGER NOT NULL,
    year     INTEGER NOT NULL,
    chat_id  INTEGER NOT NULL,
    name     TEXT NOT NULL,
    text     TEXT,
    ts       REAL NOT NULL,
    PRIMARY KEY (owner_id, year, chat_id)
);

CREATE TABLE IF NOT EXISTS chat_days (
    owner_id   INTEGER NOT NULL,
    chat_id    INTEGER NOT NULL,
    day        TEXT NOT NULL,
    owner_msgs INTEGER NOT NULL DEFAULT 0,
    peer_msgs  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner_id, chat_id, day)
);
"""

# Колонки, добавленные в новых версиях: старые базы (например, на телефоне) мигрируем на лету.
MIGRATIONS: dict[str, dict[str, str]] = {
    "settings": {"notify_deleted": "INTEGER NOT NULL DEFAULT 1"},
}

# Ответ позже этого не считаем «временем ответа» (человек просто спал или был занят).
MAX_REPLY_GAP = 6 * 3600


@dataclass
class Connection:
    id: str
    user_id: int
    user_chat_id: int
    is_enabled: bool
    can_reply: bool
    can_read: bool
    can_delete_sent: bool
    can_delete_all: bool


@dataclass
class Mute:
    until: float | None
    status_msg_id: int | None
    connection_id: str | None

    def expired(self, now: float | None = None) -> bool:
        return self.until is not None and (now or time.time()) >= self.until


@dataclass
class CachedMessage:
    from_id: int | None
    text: str | None
    media_type: str | None
    file_id: str | None
    date: float


@dataclass
class Settings:
    notify_edits: bool = True
    save_view_once: bool = True
    notify_deleted: bool = True


@dataclass
class ChatStats:
    first_ts: float
    owner_msgs: int = 0
    peer_msgs: int = 0
    owner_chars: int = 0
    peer_chars: int = 0
    owner_media: int = 0
    peer_media: int = 0
    owner_voice: int = 0
    peer_voice: int = 0
    owner_stickers: int = 0
    peer_stickers: int = 0
    owner_reply_sum: float = 0.0
    owner_reply_n: int = 0
    peer_reply_sum: float = 0.0
    peer_reply_n: int = 0
    peer_edits: int = 0
    peer_deletes: int = 0
    today: int = 0
    week: int = 0
    top_day: str | None = None
    top_day_count: int = 0

    @property
    def total(self) -> int:
        return self.owner_msgs + self.peer_msgs


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._db: aiosqlite.Connection | None = None
        # горячие кэши
        self.connections: dict[str, Connection] = {}
        self.mutes: dict[tuple[int, int], Mute] = {}
        self.antimute: set[tuple[int, int]] = set()
        self._settings: dict[int, Settings] = {}
        self._stats_lock = asyncio.Lock()

    # ------------------------------------------------------------ lifecycle
    async def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(self.path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(SCHEMA)
        await self._migrate()
        await self._db.commit()
        await self._load_caches()

    async def _migrate(self) -> None:
        for table, columns in MIGRATIONS.items():
            async with self.db.execute(f"PRAGMA table_info({table})") as cur:
                existing = {row["name"] async for row in cur}
            for column, ddl in columns.items():
                if column not in existing:
                    await self.db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")

    async def close(self) -> None:
        if self._db is not None:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db is not None, "Database is not opened"
        return self._db

    async def _load_caches(self) -> None:
        async with self.db.execute("SELECT * FROM connections") as cur:
            async for r in cur:
                self.connections[r["id"]] = Connection(
                    id=r["id"], user_id=r["user_id"], user_chat_id=r["user_chat_id"],
                    is_enabled=bool(r["is_enabled"]), can_reply=bool(r["can_reply"]),
                    can_read=bool(r["can_read"]), can_delete_sent=bool(r["can_delete_sent"]),
                    can_delete_all=bool(r["can_delete_all"]),
                )
        async with self.db.execute("SELECT * FROM mutes") as cur:
            async for r in cur:
                self.mutes[(r["owner_id"], r["chat_id"])] = Mute(
                    until=r["until"], status_msg_id=r["status_msg_id"],
                    connection_id=r["connection_id"],
                )
        async with self.db.execute("SELECT owner_id, chat_id FROM antimute") as cur:
            async for r in cur:
                self.antimute.add((r["owner_id"], r["chat_id"]))
        async with self.db.execute("SELECT * FROM settings") as cur:
            async for r in cur:
                self._settings[r["user_id"]] = Settings(
                    notify_edits=bool(r["notify_edits"]),
                    save_view_once=bool(r["save_view_once"]),
                    notify_deleted=bool(r["notify_deleted"]),
                )

    # ------------------------------------------------------------ connections
    async def save_connection(self, conn: Connection) -> None:
        self.connections[conn.id] = conn
        await self.db.execute(
            """INSERT INTO connections
               (id, user_id, user_chat_id, is_enabled, can_reply, can_read,
                can_delete_sent, can_delete_all, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET
                 user_id=excluded.user_id, user_chat_id=excluded.user_chat_id,
                 is_enabled=excluded.is_enabled, can_reply=excluded.can_reply,
                 can_read=excluded.can_read, can_delete_sent=excluded.can_delete_sent,
                 can_delete_all=excluded.can_delete_all, updated_at=excluded.updated_at""",
            (conn.id, conn.user_id, conn.user_chat_id, int(conn.is_enabled), int(conn.can_reply),
             int(conn.can_read), int(conn.can_delete_sent), int(conn.can_delete_all), time.time()),
        )
        if conn.is_enabled:
            # к аккаунту можно подключить только одного бота: новое подключение
            # (например, после переподключения) делает старые неактуальными
            for other in self.connections_of(conn.user_id):
                if other.id != conn.id and other.is_enabled:
                    other.is_enabled = False
            await self.db.execute(
                "UPDATE connections SET is_enabled=0 WHERE user_id=? AND id<>?",
                (conn.user_id, conn.id),
            )
        await self.db.commit()

    def connections_of(self, user_id: int) -> list[Connection]:
        return [c for c in self.connections.values() if c.user_id == user_id]

    def active_connection_of(self, user_id: int) -> Connection | None:
        for conn in self.connections_of(user_id):
            if conn.is_enabled:
                return conn
        return None

    # ------------------------------------------------------------ mutes
    def get_mute(self, owner_id: int, chat_id: int) -> Mute | None:
        return self.mutes.get((owner_id, chat_id))

    async def set_mute(self, owner_id: int, chat_id: int, until: float | None,
                       status_msg_id: int | None, connection_id: str | None) -> None:
        self.mutes[(owner_id, chat_id)] = Mute(until, status_msg_id, connection_id)
        await self.db.execute(
            """INSERT OR REPLACE INTO mutes
               (owner_id, chat_id, until, status_msg_id, connection_id, created_at)
               VALUES (?,?,?,?,?,?)""",
            (owner_id, chat_id, until, status_msg_id, connection_id, time.time()),
        )
        await self.db.commit()

    async def set_mute_status_msg(self, owner_id: int, chat_id: int, msg_id: int | None) -> None:
        mute = self.mutes.get((owner_id, chat_id))
        if mute is None:
            return
        mute.status_msg_id = msg_id
        await self.db.execute(
            "UPDATE mutes SET status_msg_id=? WHERE owner_id=? AND chat_id=?",
            (msg_id, owner_id, chat_id),
        )
        await self.db.commit()

    async def remove_mute(self, owner_id: int, chat_id: int,
                          only_if: Mute | None = None) -> Mute | None:
        """Снимает мут. С only_if — только если в чате всё ещё именно этот мут
        (чтобы снятие просроченного мута не снесло новый, поставленный за это время)."""
        key = (owner_id, chat_id)
        current = self.mutes.get(key)
        if current is None or (only_if is not None and current is not only_if):
            return None
        self.mutes.pop(key, None)
        await self.db.execute("DELETE FROM mutes WHERE owner_id=? AND chat_id=?", (owner_id, chat_id))
        await self.db.commit()
        return current

    def expired_mutes(self, now: float) -> list[tuple[int, int, Mute]]:
        return [(o, c, m) for (o, c), m in self.mutes.items() if m.expired(now)]

    # ------------------------------------------------------------ antimute
    def has_antimute(self, owner_id: int, chat_id: int) -> bool:
        return (owner_id, chat_id) in self.antimute

    async def set_antimute(self, owner_id: int, chat_id: int, enabled: bool) -> None:
        if enabled:
            self.antimute.add((owner_id, chat_id))
            await self.db.execute(
                "INSERT OR REPLACE INTO antimute (owner_id, chat_id, created_at) VALUES (?,?,?)",
                (owner_id, chat_id, time.time()),
            )
        else:
            self.antimute.discard((owner_id, chat_id))
            await self.db.execute(
                "DELETE FROM antimute WHERE owner_id=? AND chat_id=?", (owner_id, chat_id)
            )
        await self.db.commit()

    # ------------------------------------------------------------ message cache
    async def cache_message(self, owner_id: int, chat_id: int, message_id: int,
                            from_id: int | None, text: str | None,
                            media_type: str | None, file_id: str | None,
                            date: float | None = None, replace: bool = True) -> None:
        verb = "INSERT OR REPLACE" if replace else "INSERT OR IGNORE"
        await self.db.execute(
            f"""{verb} INTO messages
               (owner_id, chat_id, message_id, from_id, text, media_type, file_id, date)
               VALUES (?,?,?,?,?,?,?,?)""",
            (owner_id, chat_id, message_id, from_id, text, media_type, file_id,
             date or time.time()),
        )
        await self.db.commit()

    async def get_message(self, owner_id: int, chat_id: int, message_id: int) -> CachedMessage | None:
        async with self.db.execute(
            "SELECT from_id, text, media_type, file_id, date FROM messages "
            "WHERE owner_id=? AND chat_id=? AND message_id=?",
            (owner_id, chat_id, message_id),
        ) as cur:
            r = await cur.fetchone()
        if r is None:
            return None
        return CachedMessage(r["from_id"], r["text"], r["media_type"], r["file_id"], r["date"])

    async def get_messages(self, owner_id: int, chat_id: int,
                           message_ids: list[int]) -> dict[int, CachedMessage]:
        if not message_ids:
            return {}
        marks = ",".join("?" * len(message_ids))
        async with self.db.execute(
            f"SELECT message_id, from_id, text, media_type, file_id, date FROM messages "
            f"WHERE owner_id=? AND chat_id=? AND message_id IN ({marks})",
            (owner_id, chat_id, *message_ids),
        ) as cur:
            rows = await cur.fetchall()
        return {r["message_id"]: CachedMessage(r["from_id"], r["text"], r["media_type"],
                                               r["file_id"], r["date"]) for r in rows}

    async def update_message_text(self, owner_id: int, chat_id: int, message_id: int,
                                  text: str | None) -> None:
        await self.db.execute(
            "UPDATE messages SET text=? WHERE owner_id=? AND chat_id=? AND message_id=?",
            (text, owner_id, chat_id, message_id),
        )
        await self.db.commit()

    # ------------------------------------------------------------ saved view-once media
    async def mark_saved(self, owner_id: int, chat_id: int, message_id: int) -> bool:
        """True, если раньше это медиа ещё не сохраняли."""
        cur = await self.db.execute(
            "INSERT OR IGNORE INTO saved_media (owner_id, chat_id, message_id, saved_at) "
            "VALUES (?,?,?,?)",
            (owner_id, chat_id, message_id, time.time()),
        )
        await self.db.commit()
        return cur.rowcount > 0

    async def unmark_saved(self, owner_id: int, chat_id: int, message_id: int) -> None:
        await self.db.execute(
            "DELETE FROM saved_media WHERE owner_id=? AND chat_id=? AND message_id=?",
            (owner_id, chat_id, message_id),
        )
        await self.db.commit()

    # ------------------------------------------------------------ settings
    def settings(self, user_id: int) -> Settings:
        return self._settings.get(user_id) or Settings()

    async def toggle_setting(self, user_id: int, field: str) -> Settings:
        current = self.settings(user_id)
        new = Settings(**{**current.__dict__, field: not getattr(current, field)})
        self._settings[user_id] = new
        await self.db.execute(
            "INSERT OR REPLACE INTO settings (user_id, notify_edits, save_view_once, notify_deleted) "
            "VALUES (?,?,?,?)",
            (user_id, int(new.notify_edits), int(new.save_view_once), int(new.notify_deleted)),
        )
        await self.db.commit()
        return new

    # ------------------------------------------------------------ статистика переписки
    async def record_message(self, owner_id: int, chat_id: int, from_owner: bool, ts: float,
                             day: str, chars: int, kind: str | None) -> None:
        """Учитывает сообщение в статистике переписки (+ время ответа)."""
        side = "owner" if from_owner else "peer"
        async with self._stats_lock:
            async with self.db.execute(
                "SELECT last_ts, last_from_owner FROM chat_stats WHERE owner_id=? AND chat_id=?",
                (owner_id, chat_id),
            ) as cur:
                row = await cur.fetchone()
            if row is None:
                await self.db.execute(
                    "INSERT INTO chat_stats (owner_id, chat_id, first_ts) VALUES (?,?,?)",
                    (owner_id, chat_id, ts),
                )
                last_ts, last_from_owner = None, None
            else:
                last_ts, last_from_owner = row["last_ts"], row["last_from_owner"]
            # сообщения могут обрабатываться не по порядку: «якорь» двигаем только вперёд
            advance = last_ts is None or ts >= last_ts
            anchor_ts = ts if advance else last_ts
            anchor_from = int(from_owner) if advance else last_from_owner
            reply_sql = ""
            params: list[object] = []
            if (advance and last_ts is not None and last_from_owner is not None
                    and bool(last_from_owner) != from_owner and 0 <= ts - last_ts <= MAX_REPLY_GAP):
                reply_sql = f", {side}_reply_sum = {side}_reply_sum + ?, {side}_reply_n = {side}_reply_n + 1"
                params.append(ts - last_ts)
            media = int(kind is not None and kind not in ("voice", "video_note", "sticker"))
            voice = int(kind in ("voice", "video_note"))
            sticker = int(kind == "sticker")
            await self.db.execute(
                f"""UPDATE chat_stats SET
                      last_ts = ?, last_from_owner = ?,
                      {side}_msgs = {side}_msgs + 1, {side}_chars = {side}_chars + ?,
                      {side}_media = {side}_media + ?, {side}_voice = {side}_voice + ?,
                      {side}_stickers = {side}_stickers + ? {reply_sql}
                    WHERE owner_id=? AND chat_id=?""",
                (anchor_ts, anchor_from, chars, media, voice, sticker, *params, owner_id, chat_id),
            )
            await self.db.execute(
                f"""INSERT INTO chat_days (owner_id, chat_id, day, {side}_msgs) VALUES (?,?,?,1)
                    ON CONFLICT(owner_id, chat_id, day) DO UPDATE SET {side}_msgs = {side}_msgs + 1""",
                (owner_id, chat_id, day),
            )
            await self.db.commit()

    async def record_peer_event(self, owner_id: int, chat_id: int, event: str, count: int = 1) -> None:
        """event: 'edits' или 'deletes' — сколько раз собеседник правил/удалял сообщения."""
        if event not in ("edits", "deletes") or count <= 0:
            return
        async with self._stats_lock:
            await self.db.execute(
                f"UPDATE chat_stats SET peer_{event} = peer_{event} + ? WHERE owner_id=? AND chat_id=?",
                (count, owner_id, chat_id),
            )
            await self.db.commit()

    async def chat_stats(self, owner_id: int, chat_id: int, today: str,
                         week_days: list[str]) -> ChatStats | None:
        async with self.db.execute(
            "SELECT * FROM chat_stats WHERE owner_id=? AND chat_id=?", (owner_id, chat_id)
        ) as cur:
            row = await cur.fetchone()
        if row is None:
            return None
        fields = {k: row[k] for k in row.keys()
                  if k in ChatStats.__dataclass_fields__}
        stats = ChatStats(**fields)
        async with self.db.execute(
            "SELECT day, owner_msgs + peer_msgs AS n FROM chat_days WHERE owner_id=? AND chat_id=?",
            (owner_id, chat_id),
        ) as cur:
            days = {r["day"]: r["n"] async for r in cur}
        stats.today = days.get(today, 0)
        stats.week = sum(days.get(d, 0) for d in week_days)
        if days:
            stats.top_day, stats.top_day_count = max(days.items(), key=lambda kv: (kv[1], kv[0]))
        return stats

    # ------------------------------------------------------------ ключ-значение (флаги «уже сделано»)
    async def kv_get(self, key: str) -> str | None:
        async with self.db.execute("SELECT value FROM kv WHERE key=?", (key,)) as cur:
            row = await cur.fetchone()
        return row["value"] if row else None

    async def kv_set(self, key: str, value: str) -> None:
        await self.db.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?,?)", (key, value))
        await self.db.commit()

    # ------------------------------------------------------------ поздравления с днём рождения
    async def add_bday_wish(self, owner_id: int, year: int, chat_id: int, name: str,
                            text: str | None, ts: float) -> bool:
        """True, если этот человек поздравил впервые в этом году."""
        cur = await self.db.execute(
            "INSERT OR IGNORE INTO bday_wishes (owner_id, year, chat_id, name, text, ts) "
            "VALUES (?,?,?,?,?,?)",
            (owner_id, year, chat_id, name, text, ts),
        )
        await self.db.commit()
        return cur.rowcount > 0

    async def bday_wishes(self, owner_id: int, year: int) -> list[tuple[int, str, str | None]]:
        async with self.db.execute(
            "SELECT chat_id, name, text FROM bday_wishes WHERE owner_id=? AND year=? ORDER BY ts",
            (owner_id, year),
        ) as cur:
            return [(r["chat_id"], r["name"], r["text"]) async for r in cur]

    # ------------------------------------------------------------ maintenance
    async def purge_old(self, max_age_seconds: float) -> None:
        border = time.time() - max_age_seconds
        await self.db.execute("DELETE FROM messages WHERE date < ?", (border,))
        await self.db.execute("DELETE FROM saved_media WHERE saved_at < ?", (border,))
        await self.db.commit()

    async def stats(self, user_id: int) -> dict[str, int]:
        mutes = sum(1 for (o, _c) in self.mutes if o == user_id)
        anti = sum(1 for (o, _c) in self.antimute if o == user_id)
        async with self.db.execute(
            "SELECT COUNT(*) FROM messages WHERE owner_id=?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
        return {"mutes": mutes, "antimute": anti, "cached": row[0] if row else 0}
