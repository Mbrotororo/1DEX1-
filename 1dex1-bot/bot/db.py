"""SQLite-хранилище + быстрый кэш в памяти для горячих проверок (мут/антимут)."""

from __future__ import annotations

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
"""


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


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._db: aiosqlite.Connection | None = None
        # горячие кэши
        self.connections: dict[str, Connection] = {}
        self.mutes: dict[tuple[int, int], Mute] = {}
        self.antimute: set[tuple[int, int]] = set()
        self._settings: dict[int, Settings] = {}

    # ------------------------------------------------------------ lifecycle
    async def open(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(self.path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(SCHEMA)
        await self._db.commit()
        await self._load_caches()

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

    async def remove_mute(self, owner_id: int, chat_id: int) -> Mute | None:
        mute = self.mutes.pop((owner_id, chat_id), None)
        await self.db.execute("DELETE FROM mutes WHERE owner_id=? AND chat_id=?", (owner_id, chat_id))
        await self.db.commit()
        return mute

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
                            date: float | None = None) -> None:
        await self.db.execute(
            """INSERT OR REPLACE INTO messages
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
            "INSERT OR REPLACE INTO settings (user_id, notify_edits, save_view_once) VALUES (?,?,?)",
            (user_id, int(new.notify_edits), int(new.save_view_once)),
        )
        await self.db.commit()
        return new

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
