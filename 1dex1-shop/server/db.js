// Подключение к SQL-базе. Используется SQLite, встроенный в Node.js 22.13+:
// база — один файл (по умолчанию server/data/shop.db), ставить ничего не нужно.
import {mkdirSync, readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH || join(here, 'data', 'shop.db');
mkdirSync(dirname(DB_PATH), {recursive: true});

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));

// База, созданная до появления номеров игроков: добавить колонку и пронумеровать по порядку
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'num')) {
	db.exec('ALTER TABLE users ADD COLUMN num INTEGER');
	db.exec('UPDATE users SET num = (SELECT COUNT(*) FROM users AS o WHERE o.verified = 1 AND o.id <= users.id) WHERE verified = 1');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_num ON users (num)');
// Адской фермы больше нет: убрать её таблицу и счётчик наростов, если остались
db.exec('DROP TABLE IF EXISTS farm');
if (db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'warts')) db.exec('ALTER TABLE users DROP COLUMN warts');

// Несколько изменений как одно целое: либо все, либо ни одного
export const tx = (fn) => {
	db.exec('BEGIN IMMEDIATE');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}
};

const cache = new Map();
export const q = (sql) => {
	if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
	return cache.get(sql);
};
