// Уведомления владельцу в Telegram (например, о каждой покупке).
//
// Как включить (один раз):
//  1. В Telegram напиши @BotFather → /newbot → получишь токен бота.
//  2. Впиши его в server/.env: TELEGRAM_BOT_TOKEN=123456:ABC...
//  3. Напиши своему боту любое сообщение (например /start).
//  4. Узнай номер чата: npm run admin -- telegram chatid → впиши в server/.env: TELEGRAM_CHAT_ID=...
//  5. Проверка: npm run admin -- telegram test — бот пришлёт тестовое сообщение.
// Пока токена и номера чата нет, уведомления просто не отправляются — сайт работает как обычно.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const API = (process.env.TELEGRAM_API || 'https://api.telegram.org').replace(/\/+$/, '');

export const telegramConfigured = Boolean(TOKEN && CHAT);

const call = async (method, body) => {
	const res = await fetch(`${API}/bot${TOKEN}/${method}`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body || {}),
		signal: AbortSignal.timeout(10e3),
	});
	const data = await res.json().catch(() => null);
	if (!data?.ok) throw new Error(data?.description || `HTTP ${res.status}`);
	return data.result;
};

// Отправить сообщение владельцу. Никогда не мешает покупке: ошибки только пишутся в консоль.
export const tellOwner = (text) => {
	if (!telegramConfigured) return Promise.resolve(false);
	return call('sendMessage', {chat_id: CHAT, text, disable_web_page_preview: true})
		.then(() => true)
		.catch((err) => {
			console.error('Telegram: не отправилось —', err.message);
			return false;
		});
};

// Для настройки: последние чаты, которые писали боту (чтобы узнать TELEGRAM_CHAT_ID)
export const recentChats = async () => {
	if (!TOKEN) throw new Error('нет TELEGRAM_BOT_TOKEN в server/.env');
	const updates = await call('getUpdates', {limit: 50});
	const chats = new Map();
	for (const u of updates) {
		const chat = (u.message || u.channel_post || u.my_chat_member)?.chat;
		if (chat) chats.set(chat.id, chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || '');
	}
	return [...chats].map(([id, name]) => ({id, name}));
};
export const hasToken = Boolean(TOKEN);
