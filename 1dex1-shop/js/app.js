// Главный файл сайта: собирает страницу из данных в data.js и оживляет её.
import {FAQ, IDEA, PRODUCTS, SITE, VIDEOS} from './data.js';
import {ACHIEVEMENTS, count, notify, onChange, renderList, reset, unlock} from './achievements.js';
import {coverArt, icon, wordPixels} from './pixel.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

const store = {
	get(key, fallback) {
		try {
			return JSON.parse(localStorage.getItem(key)) ?? fallback;
		} catch {
			return fallback;
		}
	},
	set(key, value) {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// приватный режим браузера — просто не запоминаем
		}
	},
};

const copy = async (text) => {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		const ta = document.createElement('textarea');
		ta.value = text;
		ta.style.cssText = 'position:fixed;opacity:0';
		document.body.append(ta);
		ta.select();
		const ok = document.execCommand('copy');
		ta.remove();
		return ok;
	}
};

// ---------- пиксельные иконки в разметке: <span data-icon="trophy"> ----------
$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

// ---------- ссылки на соцсети ----------
$$('[data-link]').forEach((a) => {
	const url = {youtube: SITE.youtube, telegram: SITE.telegram, idea: SITE.ideaPost}[a.dataset.link];
	if (url) a.href = url;
});
$$('[data-text]').forEach((el) => {
	const v = {yt: SITE.youtubeHandle, tg: SITE.telegramHandle, ip: SITE.server.ip, server: SITE.server.name}[el.dataset.text];
	if (v) el.textContent = v;
});
document.addEventListener('click', (e) => {
	const a = e.target.closest('a[data-link="telegram"], a[data-link="idea"]');
	if (a) unlock('tg');
});

// ---------- бегущая строка ----------
{
	const words = ['HolyWorld', 'Анархия', 'Моды', 'Ресурс-паки', 'Фарм', 'Дюпы', 'Заработок'];
	const part = words.map((w, i) => `<span class="${i % 2 ? 'is-outline' : ''}">${w}</span><i></i>`).join('');
	$('#marquee').innerHTML = `<div class="marquee__track">${part.repeat(4)}</div>`;
}

// ---------- магазин ----------
const KIND = {mod: 'Мод', rp: 'Ресурс-пак'};
let wanted = new Set(store.get('dex.want', []));
let filter = 'all';

const priceText = (p) => (typeof p.price === 'number' ? `${p.price} ₽` : 'Цена позже');

const card = (p, i) => {
	const want = wanted.has(p.id);
	const cover = p.cover
		? `<img src="${esc(p.cover)}" alt="" loading="lazy">`
		: coverArt(p.kind, i);
	const action = p.link
		? `<a class="btn btn--lime btn--sm" href="${esc(p.link)}" target="_blank" rel="noopener">${typeof p.price === 'number' ? 'Купить' : 'Скачать'}</a>`
		: `<button class="btn btn--sm want ${want ? 'is-on' : 'btn--lime'}" data-want="${p.id}" aria-pressed="${want}">${want ? 'В списке' : 'Хочу'}</button>`;
	return `<article class="item card" data-kind="${p.kind}" style="--i:${i}">
		<div class="item__cover ${p.cover ? '' : 'is-art'}">${cover}
			<span class="tag ${p.status === 'ready' ? 'tag--lime' : 'tag--gold'} px">${p.status === 'ready' ? 'Готово' : 'В разработке'}</span>
		</div>
		<div class="item__body">
			<span class="item__kind px">${KIND[p.kind]}</span>
			<h3 class="item__title">${esc(p.title)}</h3>
			<p class="item__desc">${esc(p.desc)}</p>
			${p.tags?.length ? `<ul class="item__tags px">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
			<div class="item__foot">
				<span class="item__price px ${typeof p.price === 'number' ? 'has-price' : ''}">${priceText(p)}</span>
				${action}
			</div>
		</div>
	</article>`;
};

const renderShop = () => {
	const list = PRODUCTS.filter((p) => (filter === 'all' ? true : filter === 'want' ? wanted.has(p.id) : p.kind === filter));
	const grid = $('#shop-grid');
	grid.innerHTML = list.length
		? list.map(card).join('')
		: `<div class="empty card"><span class="empty__icon">${icon('heart')}</span><p>Пока пусто. Нажми «Хочу» на товаре — он появится здесь.</p></div>`;
	const counts = {
		all: PRODUCTS.length,
		mod: PRODUCTS.filter((p) => p.kind === 'mod').length,
		rp: PRODUCTS.filter((p) => p.kind === 'rp').length,
		want: PRODUCTS.filter((p) => wanted.has(p.id)).length,
	};
	$$('#shop-tabs [data-filter]').forEach((b) => {
		b.classList.toggle('is-active', b.dataset.filter === filter);
		b.setAttribute('aria-selected', b.dataset.filter === filter);
		$('b', b).textContent = counts[b.dataset.filter];
	});
};

$('#shop-tabs').addEventListener('click', (e) => {
	const b = e.target.closest('[data-filter]');
	if (!b) return;
	filter = b.dataset.filter;
	renderShop();
});
$('#shop-grid').addEventListener('click', (e) => {
	const b = e.target.closest('[data-want]');
	if (!b) return;
	const id = b.dataset.want;
	if (wanted.has(id)) wanted.delete(id);
	else {
		wanted.add(id);
		unlock('want');
	}
	store.set('dex.want', [...wanted]);
	renderShop();
});
renderShop();

// ---------- конструктор идеи ----------
{
	const state = {server: IDEA.servers[0], type: IDEA.types[0]};
	const chips = (list, key) =>
		list.map((v) => `<button type="button" class="chip ${state[key] === v ? 'is-active' : ''}" data-${key}="${esc(v)}">${esc(v)}</button>`).join('');
	const text = $('#idea-text');
	const preview = $('#idea-preview');
	const build = () => {
		const details = text.value.trim();
		return `Сервер: ${state.server}. Идея: ${state.type}${details ? ` — ${details}` : ''}`;
	};
	const paint = () => {
		$('#idea-servers').innerHTML = chips(IDEA.servers, 'server');
		$('#idea-types').innerHTML = chips(IDEA.types, 'type');
		preview.textContent = build();
	};
	$('#idea').addEventListener('click', (e) => {
		const b = e.target.closest('.chip');
		if (!b) return;
		if (b.dataset.server) state.server = b.dataset.server;
		if (b.dataset.type) state.type = b.dataset.type;
		paint();
	});
	text.addEventListener('input', () => (preview.textContent = build()));
	$('#idea-send').addEventListener('click', async () => {
		const ok = await copy(build());
		unlock('idea');
		notify(ok ? 'Идея скопирована — вставь её в комментарии' : 'Скопируй текст идеи вручную');
	});
	paint();
}

// ---------- ролики ----------
$('#videos-grid').innerHTML = VIDEOS.map(
	(v, i) => `<a class="video card ${i === 0 ? 'video--big' : ''}" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" data-video>
		<span class="video__thumb">
			<img src="https://i.ytimg.com/vi/${v.id}/${i === 0 ? 'hq720' : 'mqdefault'}.jpg" alt="" loading="lazy" data-fallback="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg">
			<span class="video__time px">${v.duration}</span>
			<span class="video__play">${icon('play')}</span>
		</span>
		<span class="video__title">${esc(v.title)}</span>
		${i === 0 ? '<span class="tag tag--lime px video__new">Новое</span><span class="video__more px">Смотреть на YouTube →</span>' : ''}
	</a>`,
).join('');
$$('#videos-grid img').forEach((img) =>
	img.addEventListener('error', () => {
		if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
		else img.closest('.video__thumb').classList.add('no-thumb');
	}),
);
$('#videos-grid').addEventListener('click', (e) => e.target.closest('[data-video]') && unlock('video'));

// ---------- сервер: копирование IP ----------
$('#copy-ip').addEventListener('click', async () => {
	const ok = await copy(SITE.server.ip);
	notify(ok ? 'IP скопирован' : SITE.server.ip);
	unlock('ip');
	const b = $('#copy-ip');
	b.classList.add('is-done');
	$('span', b).textContent = 'Скопировано';
	setTimeout(() => {
		b.classList.remove('is-done');
		$('span', b).textContent = 'Скопировать IP';
	}, 1800);
});

// ---------- реклама: блок виден, только если указан контакт ----------
if (SITE.contact) {
	const c = $('#contact');
	c.hidden = false;
	const a = $('a', c);
	a.href = `https://t.me/${SITE.contact.replace(/^@/, '')}`;
	$('b', c).textContent = SITE.contact;
}

// ---------- частые вопросы ----------
$('#faq-list').innerHTML = FAQ.map(
	(f) => `<details class="faq card"><summary><span>${esc(f.q)}</span><i aria-hidden="true"></i></summary><p>${esc(f.a)}</p></details>`,
).join('');

// ---------- достижения ----------
{
	const dlg = $('#ach-dialog');
	const paint = () => {
		const total = ACHIEVEMENTS.length;
		$$('[data-ach-count]').forEach((el) => (el.textContent = `${count()}/${total}`));
		$('#ach-bar').style.setProperty('--p', count() / total);
		renderList($('#ach-list'));
	};
	onChange(paint);
	paint();
	$$('[data-open-ach]').forEach((b) =>
		b.addEventListener('click', () => {
			paint();
			dlg.showModal();
		}),
	);
	dlg.addEventListener('click', (e) => {
		if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
	});
	$('#ach-reset').addEventListener('click', () => {
		reset();
		notify('Достижения сброшены');
	});
}

// «До бедрока»: человек долистал до подвала
new IntersectionObserver(
	(entries, obs) => {
		if (entries.some((e) => e.isIntersecting)) {
			unlock('bedrock');
			obs.disconnect();
		}
	},
	{threshold: 0.6},
).observe($('#foot-word'));

// Секрет для любопытных: команда в консоли браузера
window.dex = {
	secret() {
		unlock('secret');
		return 'Секрет найден. Достижение твоё!';
	},
};
console.log('%c1DEX1 SHOP', 'font:700 28px/1.3 monospace;color:#b8ff3d');
console.log('%cВведи %cdex.secret()%c и получишь достижение.', 'color:#aaa3c2', 'color:#ffc83d;font-weight:700', 'color:#aaa3c2');

// ---------- появление блоков при прокрутке ----------
{
	const io = new IntersectionObserver(
		(entries) => {
			entries.forEach((e) => {
				if (e.isIntersecting) {
					e.target.classList.add('in');
					io.unobserve(e.target);
				}
			});
		},
		{rootMargin: '0px 0px -8% 0px'},
	);
	$$('[data-reveal]').forEach((el) => io.observe(el));
}

// ---------- шапка и нижняя панель: подсветка текущего раздела ----------
{
	const top = $('.topbar');
	const onScroll = () => top.classList.toggle('is-stuck', scrollY > 24);
	addEventListener('scroll', onScroll, {passive: true});
	onScroll();

	const links = $$('[data-nav]');
	const spy = new IntersectionObserver(
		(entries) => {
			entries.forEach((e) => {
				if (!e.isIntersecting) return;
				links.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`));
			});
		},
		{rootMargin: '-45% 0px -50% 0px'},
	);
	$$('main section[id]').forEach((s) => spy.observe(s));
}

// ---------- подвал: большой пиксельный ник, который светится под курсором ----------
{
	const canvas = $('#foot-word');
	const ctx = canvas.getContext('2d');
	const word = wordPixels('1DEX1');
	const cells = word.pixels.map((p) => ({...p, glow: 0}));
	let cell = 10;
	let mouse = null;
	let visible = false;
	let t = 0;

	const resize = () => {
		const w = canvas.clientWidth;
		const dpr = Math.min(devicePixelRatio || 1, 2);
		cell = w / word.width;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(cell * word.height * dpr);
		canvas.style.height = `${cell * word.height}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		draw();
	};
	const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
	const draw = () => {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const gap = Math.max(1, cell * 0.08);
		for (const c of cells) {
			const cx = (c.x + 0.5) * cell;
			const cy = (word.height - 1 - c.y + 0.5) * cell;
			let target = reducedMotion ? 0 : (Math.sin(t * 1.4 - c.x * 0.45) * 0.5 + 0.5) * 0.16;
			if (mouse) {
				const d = Math.hypot(mouse.x - cx, mouse.y - cy) / (cell * 3.2);
				target = Math.max(target, 1 - Math.min(1, d));
			}
			c.glow += (target - c.glow) * (target > c.glow ? 0.5 : 0.06);
			const g = c.glow;
			// тёмный блок -> фиолетовый -> салатовый
			const col = g < 0.5 ? mix([30, 24, 50], [154, 107, 255], g * 2) : mix([154, 107, 255], [184, 255, 61], (g - 0.5) * 2);
			ctx.fillStyle = `rgb(${col})`;
			ctx.fillRect(c.x * cell + gap / 2, (word.height - 1 - c.y) * cell + gap / 2, cell - gap, cell - gap);
		}
	};
	const loop = () => {
		if (visible) {
			t += 1 / 60;
			draw();
		}
		requestAnimationFrame(loop);
	};
	canvas.addEventListener('pointermove', (e) => {
		const r = canvas.getBoundingClientRect();
		mouse = {x: e.clientX - r.left, y: e.clientY - r.top};
	});
	canvas.addEventListener('pointerleave', () => (mouse = null));
	new ResizeObserver(resize).observe(canvas);
	new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(canvas);
	resize();
	requestAnimationFrame(loop);
}

$('#year').textContent = new Date().getFullYear();

// ---------- 3D-сцена первого экрана (грузится последней, чтобы не тормозить страницу) ----------
{
	const canvas = $('#hero-gl');
	let ctx;
	let soundOn = store.get('dex.sound', true);
	const soundBtn = $('#sound-toggle');
	const paintSound = () => {
		soundBtn.setAttribute('aria-pressed', soundOn);
		soundBtn.textContent = soundOn ? 'Звук: вкл' : 'Звук: выкл';
	};
	soundBtn.addEventListener('click', () => {
		soundOn = !soundOn;
		store.set('dex.sound', soundOn);
		paintSound();
	});
	paintSound();

	// звук ломания блока синтезируется прямо в браузере
	const breakSound = () => {
		if (!soundOn) return;
		try {
			ctx ||= new (window.AudioContext || window.webkitAudioContext)();
			const dur = 0.17;
			const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
			const src = ctx.createBufferSource();
			src.buffer = buf;
			src.playbackRate.value = 0.8 + Math.random() * 0.5;
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 1700;
			const gain = ctx.createGain();
			gain.gain.value = 0.32;
			src.connect(lp).connect(gain).connect(ctx.destination);
			src.start();
		} catch {
			// звук не обязателен
		}
	};

	import('./hero.js')
		.then(({initHero}) => {
			const hero = initHero(canvas, {
				reducedMotion,
				onBreak(total) {
					breakSound();
					unlock('miner');
					if (total >= 25) unlock('wrecker');
				},
			});
			document.documentElement.classList.add(hero ? 'has-gl' : 'no-gl');
		})
		.catch(() => document.documentElement.classList.add('no-gl'));
}
