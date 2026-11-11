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
