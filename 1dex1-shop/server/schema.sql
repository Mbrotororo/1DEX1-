-- База данных 1DEX1 SHOP (SQLite). Деньги хранятся в копейках, время — в миллисекундах.

-- Аккаунты
CREATE TABLE IF NOT EXISTS users (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	num INTEGER,                              -- номер игрока по порядку: 1, 2, 3… (выдаётся после подтверждения почты)
	nick TEXT NOT NULL UNIQUE COLLATE NOCASE,
	email TEXT NOT NULL UNIQUE COLLATE NOCASE,
	pass TEXT NOT NULL,                       -- scrypt$соль$хэш, сам пароль не хранится
	verified INTEGER NOT NULL DEFAULT 0,      -- 1 — почта подтверждена кодом из письма
	avatar TEXT,                              -- маленькая картинка (data:image/jpeg;base64,…)
	balance INTEGER NOT NULL DEFAULT 0,       -- баланс в копейках
	bonus_cases INTEGER NOT NULL DEFAULT 0,   -- бесплатные кейсы за задания
	case_at INTEGER,                          -- когда открыт ежедневный кейс
	role TEXT,                                -- admin — доступ в админку (npm run admin -- user admin Ник)
	nick_changed_at INTEGER,                  -- когда последний раз меняли ник (менять можно раз в 30 дней)
	created_at INTEGER NOT NULL
);

-- Коды подтверждения почты (хранится только хэш кода)
CREATE TABLE IF NOT EXISTS email_codes (
	user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	code TEXT NOT NULL,
	expires_at INTEGER NOT NULL,
	sent_at INTEGER NOT NULL,
	tries INTEGER NOT NULL DEFAULT 0
);

-- Входы: в cookie браузера лежит токен, здесь — его хэш
CREATE TABLE IF NOT EXISTS sessions (
	token TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at INTEGER NOT NULL
);

-- Товары: моды и ресурс-паки
CREATE TABLE IF NOT EXISTS products (
	id TEXT PRIMARY KEY,                      -- короткое имя латиницей, например rp-night
	kind TEXT NOT NULL CHECK (kind IN ('mod', 'rp')),
	status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('soon', 'ready')),
	title TEXT NOT NULL,
	title_en TEXT,
	descr TEXT NOT NULL DEFAULT '',
	descr_en TEXT,
	tags TEXT NOT NULL DEFAULT '[]',          -- JSON-список: ["1.21", "Fabric"]
	price INTEGER,                            -- копейки; NULL — «цена позже», 0 — бесплатно
	cover TEXT,                               -- картинка, например img/rp-night.png
	link TEXT,                                -- внешняя ссылка на скачивание
	file TEXT,                                -- или файл в server/files — отдаётся только купившим
	sale_until TEXT,                          -- эксклюзив: продаётся до этого дня включительно (по Москве), '2027-02-20'; NULL — без срока
	active INTEGER NOT NULL DEFAULT 1,        -- 0 — скрыт с сайта
	sort INTEGER NOT NULL DEFAULT 0,
	created_at INTEGER NOT NULL
);

-- Движение денег: пополнения, покупки, награды. Отсюда же история в профиле
CREATE TABLE IF NOT EXISTS ledger (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	amount INTEGER NOT NULL,                  -- копейки: + пришло, − ушло
	kind TEXT NOT NULL,                       -- topup | purchase | case | reward | admin
	title TEXT,
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger (user_id, id);

-- Покупки
CREATE TABLE IF NOT EXISTS orders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	product_id TEXT NOT NULL REFERENCES products(id),
	price INTEGER NOT NULL,                   -- сколько заплачено, копейки
	paid_with TEXT NOT NULL,                  -- balance | coupon | free | card | sbp
	promo TEXT,                               -- промокод, если был
	cashback INTEGER NOT NULL DEFAULT 0,      -- сколько вернулось на баланс, копейки
	created_at INTEGER NOT NULL,
	UNIQUE (user_id, product_id)
);

-- Промокоды из админки (ещё есть коды-отпечатки в js/data.js; код из этой таблицы главнее)
CREATE TABLE IF NOT EXISTS promos (
	code TEXT PRIMARY KEY COLLATE NOCASE,     -- большими буквами, например WINTER
	percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 90),
	max_uses INTEGER,                         -- сколько раз всего можно применить; NULL — без лимита
	until TEXT,                               -- действует до этого дня включительно (по Москве); NULL — без срока
	active INTEGER NOT NULL DEFAULT 1,
	created_at INTEGER NOT NULL
);

-- Купоны из кейса (ресурс-пак бесплатно); order_id — на что потрачен
CREATE TABLE IF NOT EXISTS coupons (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	order_id INTEGER REFERENCES orders(id),
	created_at INTEGER NOT NULL
);

-- Открытые кейсы: source — daily (ежедневный) или bonus (за задание)
CREATE TABLE IF NOT EXISTS case_opens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	source TEXT NOT NULL,
	prize TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

-- Задания: когда открыл ссылку и когда забрал кейс; achievements — награда за достижения
CREATE TABLE IF NOT EXISTS tasks (
	user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	task TEXT NOT NULL,
	opened_at INTEGER,
	claimed_at INTEGER,
	PRIMARY KEY (user_id, task)
);
