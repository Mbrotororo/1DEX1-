// Письма с кодом подтверждения почты.
// Почтовый ящик для отправки задаётся переменными окружения (см. server/.env.example):
//   SMTP_HOST=smtp.yandex.ru  SMTP_PORT=465  SMTP_USER=shop@yandex.ru  SMTP_PASS=пароль-приложения
//   MAIL_FROM="1DEX1 SHOP <shop@yandex.ru>"
// Подходит любая почта с SMTP по SSL (порт 465): Яндекс, Mail.ru, Gmail.
// Если SMTP_HOST не задан — режим проверки: письмо не уходит, код пишется в консоль
// сервера и в файл server/data/outbox.log.
import {appendFileSync, mkdirSync} from 'node:fs';
import {connect as netConnect} from 'node:net';
import {dirname, join} from 'node:path';
import {connect as tlsConnect} from 'node:tls';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUTBOX = join(here, 'data', 'outbox.log');
const cfg = {
	host: process.env.SMTP_HOST || '',
	port: Number(process.env.SMTP_PORT) || 465,
	secure: process.env.SMTP_SECURE !== '0', // 0 — без шифрования, только для проверки на своём компьютере
	user: process.env.SMTP_USER || '',
	pass: process.env.SMTP_PASS || '',
	from: process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@localhost',
};
export const mailConfigured = Boolean(cfg.host);

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const address = (s) => (s.match(/<([^>]+)>/) || [null, s])[1].trim();

// Отправка одного письма по SMTP (без сторонних библиотек)
const smtpSend = (to, subject, text) =>
	new Promise((resolve, reject) => {
		const sock = cfg.secure ? tlsConnect({host: cfg.host, port: cfg.port, servername: cfg.host}) : netConnect({host: cfg.host, port: cfg.port});
		sock.setEncoding('utf8');
		sock.setTimeout(20000, () => sock.destroy(new Error('SMTP: нет ответа')));
		let buf = '';
		let waiting = null;
		// ответ сервера закончен, когда пришла строка «код + пробел» (например «250 OK»)
		const pump = () => {
			if (!waiting) return;
			const lines = buf.split('\r\n');
			const last = lines.findIndex((l) => /^\d{3} /.test(l));
			if (last < 0) return;
			buf = lines.slice(last + 1).join('\r\n');
			const w = waiting;
			waiting = null;
			w(lines[last]);
		};
		sock.on('data', (chunk) => {
			buf += chunk;
			pump();
		});
		sock.on('error', reject);
		const expect = (codes) =>
			new Promise((ok, fail) => {
				waiting = (line) => (codes.includes(line.slice(0, 3)) ? ok(line) : fail(new Error(`SMTP: ${line}`)));
				pump();
			});
		const say = (line, codes) => {
			const p = expect(codes);
			sock.write(`${line}\r\n`);
			return p;
		};
		const date = new Date().toUTCString();
		const body = b64(text).replace(/.{76}/g, '$&\r\n');
		const message = [
			`From: ${cfg.from}`,
			`To: <${to}>`,
			`Subject: =?UTF-8?B?${b64(subject)}?=`,
			`Date: ${date}`,
			`Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${address(cfg.from).split('@')[1] || 'localhost'}>`,
			'MIME-Version: 1.0',
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			body,
		].join('\r\n');
		(async () => {
			await expect(['220']);
			await say('EHLO 1dex1.shop', ['250']);
			if (cfg.user) {
				await say('AUTH LOGIN', ['334']);
				await say(b64(cfg.user), ['334']);
				await say(b64(cfg.pass), ['235']);
			}
			await say(`MAIL FROM:<${address(cfg.from)}>`, ['250']);
			await say(`RCPT TO:<${to}>`, ['250', '251']);
			await say('DATA', ['354']);
			await say(`${message}\r\n.`, ['250']);
			sock.write('QUIT\r\n');
			sock.end();
		})().then(resolve, (err) => {
			sock.destroy();
			reject(err);
		});
	});

const TEXT = {
	ru: (nick, code) => ({
		subject: `Код подтверждения 1DEX1 SHOP: ${code}`,
		text: `Привет, ${nick}!\n\nТвой код для подтверждения почты в 1DEX1 SHOP: ${code}\nКод действует 15 минут.\n\nЕсли ты не регистрировался на сайте, просто удали это письмо.`,
	}),
	en: (nick, code) => ({
		subject: `1DEX1 SHOP confirmation code: ${code}`,
		text: `Hi, ${nick}!\n\nYour code to confirm your email at 1DEX1 SHOP: ${code}\nThe code is valid for 15 minutes.\n\nIf you did not sign up on the site, just delete this email.`,
	}),
};

export const sendCode = async (to, nick, code, lang = 'ru') => {
	const {subject, text} = (TEXT[lang] || TEXT.ru)(nick, code);
	if (!mailConfigured) {
		mkdirSync(dirname(OUTBOX), {recursive: true});
		appendFileSync(OUTBOX, `${new Date().toISOString()}\t${to}\t${code}\n`);
		console.log(`[почта не настроена] код для ${to}: ${code}`);
		return;
	}
	await smtpSend(to, subject, text);
};
