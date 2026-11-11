// Главный файл сайта: собирает страницу из данных в data.js и оживляет её.
import {CASE, MARQUEE, PRODUCTS, SITE, VISUALS} from './data.js';
import {ACHIEVEMENTS, count, notify, onChange, renderList, reset, unlock} from './achievements.js';
import {changePassword, credit, current, fileToAvatar, login, logout, onAuth, openCase, register, update} from './auth.js';
import {initCollab} from './collab.js';
import {initFootWord} from './footer.js';
import {caseArt, coverArt, icon, navIcon} from './pixel.js';
import {breakSound} from './sound.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

// ---------- пиксельные иконки в разметке: <span data-icon="trophy"> ----------
$$('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
const CLOSE_ICON =
	'<svg viewBox="0 0 7 7" aria-hidden="true"><path d="M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM6 0h1v1H6zM5 1h1v1H5zM4 2h1v1H4zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z"/></svg>';
$$('[data-icon-x]').forEach((el) => (el.innerHTML = CLOSE_ICON));
$$('[data-nav-icon]').forEach((el) => (el.innerHTML = navIcon(el.dataset.navIcon)));

// ---------- надпись «1DEX1 SHOP» в шапке ----------
// На компьютере пульсирует под курсором (это делает CSS), на телефоне — от нажатия.
$$('.logo__name').forEach((el) => {
	const pulse = () => {
		el.classList.remove('is-pulse');
		void el.offsetWidth; // перезапуск анимации
		el.classList.add('is-pulse');
	};
	el.closest('a').addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && pulse());
	el.addEventListener('animationend', () => el.classList.remove('is-pulse'));
});

// ---------- ссылки на соцсети ----------
$$('[data-link]').forEach((a) => {
	const url = {youtube: SITE.youtube, telegram: SITE.telegram}[a.dataset.link];
	if (url) a.href = url;
});
$$('[data-text]').forEach((el) => {
	const v = {yt: SITE.youtubeHandle, tg: SITE.telegramHandle}[el.dataset.text];
	if (v) el.textContent = v;
});
document.addEventListener('click', (e) => e.target.closest('a[data-link]') && unlock('contact'));

// ---------- бегущая строка ----------
{
	// слов мало, поэтому повторяем их много раз: лента должна быть шире экрана
	const words = Array.from({length: 24}, (_, i) => MARQUEE[i % MARQUEE.length]);
	const half = words.map((w, i) => `<span class="${i % 2 ? 'is-outline' : ''}">${esc(w)}</span><i></i>`).join('');
	$('#marquee').innerHTML = `<div class="marquee__track">${half}${half}</div>`;
}

// ---------- сломанные блоки: общий счётчик для достижений ----------
let blocksBroken = 0;
const blockBroken = (first) => {
	breakSound();
	unlock(first);
	if (++blocksBroken >= 30) unlock('mason');
};

// ---------- магазин ----------
const KIND = {mod: 'Мод', rp: 'Ресурс-пак'};
let filter = 'all';
const seenTabs = new Set();

const card = (p, i) => {
	const hasPrice = typeof p.price === 'number';
	const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : coverArt(p.kind, i);
	const action = p.link
		? `<a class="btn btn--lime btn--sm" href="${esc(p.link)}" target="_blank" rel="noopener">${hasPrice ? 'Купить' : 'Скачать'}</a>`
		: '<span class="item__soon px">Скоро</span>';
	return `<article class="item card" data-kind="${p.kind}" style="--i:${i}">
		<div class="item__cover ${p.cover ? '' : 'is-art'}">${cover}
			<span class="tag ${p.status === 'ready' ? 'tag--lime' : 'tag--gold'} px">${p.status === 'ready' ? 'Готово' : 'В разработке'}</span>
		</div>
		<div class="item__body">
			<span class="item__kind px">${KIND[p.kind] || ''}</span>
			<h3 class="item__title">${esc(p.title)}</h3>
			<p class="item__desc">${esc(p.desc)}</p>
			${p.tags?.length ? `<ul class="item__tags px">${p.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
			<div class="item__foot">
				<span class="item__price px ${hasPrice ? 'has-price' : ''}">${hasPrice ? `${p.price} ₽` : 'Цена позже'}</span>
				${action}
			</div>
		</div>
	</article>`;
};

const renderShop = () => {
	const list = PRODUCTS.filter((p) => filter === 'all' || p.kind === filter);
	const emptyText = {
		all: ['Товаров пока нет', 'Моды и ресурс-паки скоро появятся здесь.'],
		mod: ['Модов пока нет', 'Первые моды скоро появятся здесь.'],
		rp: ['Ресурс-паков пока нет', 'Первые паки скоро появятся здесь.'],
	}[filter];
	$('#shop-grid').innerHTML = list.length
		? list.map(card).join('')
		: `<div class="empty card"><span class="empty__icon">${icon('chest')}</span><b>${emptyText[0]}</b><p>${emptyText[1]}</p></div>`;
	$$('#shop-tabs [data-filter]').forEach((b) => {
		const kind = b.dataset.filter;
		b.classList.toggle('is-active', kind === filter);
		b.setAttribute('aria-selected', kind === filter);
		$('b', b).textContent = PRODUCTS.filter((p) => kind === 'all' || p.kind === kind).length;
	});
};
$('#shop-tabs').addEventListener('click', (e) => {
	const b = e.target.closest('[data-filter]');
	if (!b) return;
	filter = b.dataset.filter;
	seenTabs.add(filter);
	if (seenTabs.has('mod') && seenTabs.has('rp')) unlock('showcase');
	renderShop();
});
renderShop();

// ---------- сотрудничество: личный профиль и визуалы вокруг аватарки ----------
{
	const nick = SITE.contact.trim().replace(/^@?/, '@');
	const btn = $('#collab-btn');
	if (nick.length > 1) {
		const url = `https://t.me/${nick.slice(1)}`;
		btn.href = url;
		$('#collab-user').textContent = nick;
		$('#collab-user').hidden = false;
		$('#collab-nick').textContent = nick;
		$('#collab-row').hidden = false;
		$('#collab-copy').addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(nick);
				notify(`Скопировано: ${nick}`);
			} catch {
				notify(nick);
			}
		});
	} else {
		// ник ещё не указан в data.js — кнопка неактивна
		btn.removeAttribute('href');
		btn.setAttribute('aria-disabled', 'true');
		btn.classList.add('is-off');
		btn.textContent = 'Ник для связи скоро появится';
	}
	initCollab($('#collab-space'), $('.collab__ava'), VISUALS, {reducedMotion});
}

// ---------- окна (достижения, вход, профиль) ----------
const openDialog = (dlg) => !dlg.open && dlg.showModal();
$$('dialog').forEach((dlg) =>
	dlg.addEventListener('click', (e) => {
		if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
	}),
);

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
			openDialog(dlg);
		}),
	);
	$('#ach-reset').addEventListener('click', () => {
		reset();
		notify('Достижения сброшены');
	});
}

// ---------- аккаунт: регистрация, вход, профиль ----------
{
	const authDlg = $('#auth-dialog');
	const profileDlg = $('#profile-dialog');
	const form = $('#auth-form');
	const error = $('#auth-error');
	let mode = 'register';

	// по умолчанию аватарка — первая буква ника на цветном фоне (цвет зависит от ника)
	const nickHue = (nick) => [...nick.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
	const avatarHtml = (user) => {
		if (user.avatar) return `<img src="${user.avatar}" alt="">`;
		const h = nickHue(user.nick);
		return `<span class="ava-letter" style="--h1:${h};--h2:${(h + 50) % 360}">${esc(user.nick[0].toUpperCase())}</span>`;
	};
	const money = (v) => Number(v || 0).toLocaleString('ru-RU', {minimumFractionDigits: 2, maximumFractionDigits: 2});
	const walletId = (nick) => String(1000 + (nickHue(nick) * 37 + nick.length * 911) % 9000);

	const setMode = (next) => {
		mode = next;
		authDlg.dataset.mode = mode;
		$$('[data-auth-tab]', authDlg).forEach((b) => {
			b.classList.toggle('is-active', b.dataset.authTab === mode);
			b.setAttribute('aria-selected', b.dataset.authTab === mode);
		});
		$('#auth-title').textContent = mode === 'register' ? 'Создай аккаунт' : 'С возвращением';
		$('#auth-submit').textContent = mode === 'register' ? 'Зарегистрироваться' : 'Войти';
		// поля, которых нет в этом режиме, выключаем, чтобы форма их не проверяла
		$$('[data-only]', form).forEach((row) => {
			const on = row.dataset.only === mode;
			row.hidden = !on;
			$$('input', row).forEach((i) => (i.disabled = !on));
		});
		$('#auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
		error.textContent = '';
	};
	authDlg.addEventListener('click', (e) => {
		const tab = e.target.closest('[data-auth-tab]');
		if (tab) setMode(tab.dataset.authTab);
	});

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		error.textContent = '';
		const data = Object.fromEntries(new FormData(form));
		const res = mode === 'register' ? await register(data) : await login(data);
		if (res.error) {
			error.textContent = res.error;
			if (res.field) $(`#auth-${res.field}`)?.focus();
			return;
		}
		form.reset();
		authDlg.close();
		if (mode === 'register') unlock('newcomer');
		notify(mode === 'register' ? `Аккаунт создан. Привет, ${res.user.nick}!` : `С возвращением, ${res.user.nick}!`);
		openDialog(profileDlg);
	});

	const paint = () => {
		const user = current();
		document.documentElement.classList.toggle('is-authed', !!user);
		$$('[data-auth-label]').forEach((el) => (el.textContent = user ? user.nick : el.dataset.authLabel));
		$$('[data-auth-avatar]').forEach((el) => (el.innerHTML = user ? avatarHtml(user) : icon('user')));
		if (!user) return;
		$('#profile-avatar').innerHTML = avatarHtml(user);
		$('#profile-nick').textContent = user.nick;
		$('#profile-email').textContent = user.email;
		$('#profile-since').textContent = new Date(user.createdAt).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
		$('#profile-balance').textContent = money(user.balance);
		$('#wallet-id').textContent = `ID •••• ${walletId(user.nick)}`;
		$('#wallet-owner').textContent = user.nick;
		// история видна, только когда в ней что-то есть
		$('#wallet-history-box').hidden = !user.history.length;
		$('#wallet-history').innerHTML = user.history
			.map(
				(h) => `<li><span class="wallet__op">${icon(h.kind === 'case' ? 'chest' : 'trophy')}</span><span class="wallet__what"><b>${esc(h.title)}</b><time>${new Date(h.at).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'})}</time></span><span class="wallet__amount">+${money(h.amount)} ₽</span></li>`,
			)
			.join('');
		// купоны из кейса (например, любой ресурс-пак бесплатно)
		$('#coupons-box').hidden = !user.coupons.length;
		$('#coupons').innerHTML = user.coupons
			.map(
				(c) => `<li><span class="wallet__op wallet__op--gem">${icon('gem')}</span><span class="wallet__what"><b>${esc(c.title)}</b><time>Из кейса, ${new Date(c.at).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long'})}. Обменяешь, когда в магазине появятся ресурс-паки</time></span><span class="wallet__tag">Купон</span></li>`,
			)
			.join('');
	};
	onAuth(paint);
	paint();

	$$('[data-open-profile]').forEach((b) =>
		b.addEventListener('click', () => {
			if (current()) return openDialog(profileDlg);
			setMode('register');
			openDialog(authDlg);
		}),
	);

	// аватарка из галереи
	$('#avatar-file').addEventListener('change', async (e) => {
		const file = e.target.files[0];
		e.target.value = '';
		if (!file) return;
		try {
			const avatar = await fileToAvatar(file);
			if (!update({avatar})) throw new Error('Браузер не дал сохранить картинку');
			unlock('face');
			notify('Аватарка обновлена');
		} catch (err) {
			notify(err.message);
		}
	});
	// смена пароля
	const pwForm = $('#pw-form');
	pwForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const res = await changePassword(Object.fromEntries(new FormData(pwForm)));
		$('#pw-error').textContent = res.error || '';
		if (res.error) {
			$(res.field === 'old' ? '#pw-old' : '#pw-new').focus();
			return;
		}
		pwForm.reset();
		pwForm.closest('details').open = false;
		notify('Пароль изменён');
	});

	$('#logout').addEventListener('click', () => {
		profileDlg.close();
		logout();
		notify('Ты вышел из аккаунта');
	});
	setMode('register');
}

// ---------- награда: 5 ₽ на баланс за все достижения (один раз на аккаунт) ----------
{
	const reward = () => {
		if (count() < ACHIEVEMENTS.length || !current()) return;
		if (credit({id: 'all-achievements', amount: 5, title: 'Награда за все достижения'})) notify('+5 ₽ на баланс за все достижения!');
	};
	onChange(reward);
	onAuth(reward);
	reward();
}

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

	// хотбар: рамка выделения стоит на разделе, который сейчас на экране,
	// а пока открыто окно профиля или входа — на «Профиле»
	const bar = $('#hotbar');
	const slots = $$('.hotbar__slot', bar);
	const dialogs = [$('#profile-dialog'), $('#auth-dialog')];
	let sectionSlot = 'top';
	let lockUntil = 0;
	const select = (name) => {
		const i = slots.findIndex((s) => s.dataset.slot === name);
		if (i < 0) return;
		bar.style.setProperty('--i', i);
		slots.forEach((s, k) => {
			s.classList.toggle('is-on', k === i);
			if (k === i) s.setAttribute('aria-current', 'page');
			else s.removeAttribute('aria-current');
		});
	};
	const spy = new IntersectionObserver(
		(entries) => {
			entries.forEach((e) => {
				if (!e.isIntersecting) return;
				$$('.topnav a').forEach((a) => a.classList.toggle('is-on', a.hash === `#${e.target.id}`));
				if (!slots.some((s) => s.dataset.slot === e.target.id)) return;
				sectionSlot = e.target.id;
				if (performance.now() > lockUntil && !dialogs.some((d) => d.open)) select(sectionSlot);
			});
		},
		{rootMargin: '-45% 0px -50% 0px'},
	);
	$$('main section[id]').forEach((s) => spy.observe(s));
	slots.forEach((s) =>
		s.addEventListener('click', () => {
			if (s.dataset.slot === 'profile') return;
			// пока страница плавно едет к разделу, промежуточные разделы рамку не дёргают
			sectionSlot = s.dataset.slot;
			lockUntil = performance.now() + 900;
			select(sectionSlot);
		}),
	);
	$$('[data-open-profile]').forEach((b) => b.addEventListener('click', () => select('profile')));
	dialogs.forEach((d) => d.addEventListener('close', () => setTimeout(() => !dialogs.some((x) => x.open) && select(sectionSlot))));
}

// ---------- ежедневный кейс ----------
{
	const art = $('#case-art');
	const prizeBox = $('#case-prize');
	const btn = $('#case-open');
	const dot = $('.hotbar__dot');
	const LOOT_ICON = {money: 'coin', rp: 'gem'};
	art.innerHTML = caseArt();
	$('#case-title').textContent = CASE.title;
	const total = CASE.loot.reduce((sum, l) => sum + l.chance, 0);
	const pct = (c) => {
		const v = (c / total) * 100;
		return `${v < 1 ? v.toFixed(1) : Math.round(v)}%`;
	};
	$('#case-loot').innerHTML = CASE.loot
		.map((l) => `<li data-rarity="${l.rarity}">${icon(LOOT_ICON[l.kind] || 'gem')}<span><b>${esc(l.title)}</b><small>Шанс ${pct(l.chance)}</small></span></li>`)
		.join('');

	const wait = CASE.cooldownHours * 3600e3;
	const left = () => {
		const u = current();
		return u && u.caseAt ? Math.max(0, u.caseAt + wait - Date.now()) : 0;
	};
	const clock = (ms) => {
		const sec = Math.ceil(ms / 1000);
		return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((v) => String(v).padStart(2, '0')).join(':');
	};
	const set = (el, prop, value) => el[prop] !== value && (el[prop] = value);
	let opening = false;
	const paint = () => {
		if (opening) return;
		const ms = left();
		dot.hidden = ms > 0;
		if (!current()) {
			set(btn, 'disabled', false);
			set(btn, 'textContent', 'Войти и открыть');
		} else if (ms > 0) {
			set(btn, 'disabled', true);
			set(btn, 'textContent', `Откроется через ${clock(ms)}`);
		} else {
			set(btn, 'disabled', false);
			set(btn, 'textContent', 'Открыть кейс');
		}
	};
	paint();
	onAuth(paint);
	setInterval(paint, 1000);

	const showPrize = (p) => {
		prizeBox.dataset.rarity = p.rarity;
		prizeBox.innerHTML =
			p.kind === 'money'
				? `${icon('coin')}<b>+${p.amount} ₽</b><span>Зачислено на баланс</span>`
				: `${icon('gem')}<b>Ресурс-пак</b><span>Любой ресурс-пак бесплатно. Купон лежит в профиле</span>`;
		prizeBox.hidden = false;
		notify(p.kind === 'money' ? `Кейс: +${p.amount} ₽ на баланс!` : 'Кейс: любой ресурс-пак бесплатно! Купон — в профиле');
	};
	const open = () => {
		if (opening) return;
		if (!current()) return $('[data-slot="profile"]').click(); // откроется окно входа
		const res = openCase(CASE);
		if (res.error === 'wait') return paint();
		if (res.error) return notify('Браузер не дал сохранить награду. Выключи приватный режим и попробуй ещё раз.');
		opening = true;
		btn.disabled = true;
		btn.textContent = 'Открываем…';
		// на телефоне сундук выше кнопки — подкручиваем страницу, чтобы награду было видно
		const stage = art.parentElement.getBoundingClientRect();
		if (stage.top < 70 || stage.bottom > innerHeight - 80) art.parentElement.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'center'});
		prizeBox.hidden = true;
		art.classList.remove('is-open');
		art.classList.add('is-shaking');
		setTimeout(
			() => {
				art.classList.remove('is-shaking');
				art.classList.add('is-open');
				breakSound();
				showPrize(res.prize);
				opening = false;
				paint();
			},
			reducedMotion ? 50 : 1100,
		);
	};
	btn.addEventListener('click', open);
	art.addEventListener('click', () => !btn.disabled && open());
	// клик по награде — убрать её и закрыть сундук
	prizeBox.addEventListener('click', () => {
		prizeBox.hidden = true;
		art.classList.remove('is-open');
	});
}

// ---------- подвал: надпись «1DEX1 SHOP» из ломающихся блоков ----------
initFootWord($('#foot-word'), {reducedMotion, on: () => blockBroken('digger')});

$('#year').textContent = new Date().getFullYear();

// ---------- 3D-сцена первого экрана (грузится последней, чтобы не тормозить страницу) ----------
import('./hero.js')
	.then(({initHero}) => {
		const ok = initHero($('#hero-gl'), {
			reducedMotion,
			wall: $('#marquee'),
			sky: $('#hero-sky'),
			on(event, data) {
				switch (event) {
					case 'break':
						blockBroken('kirka');
						break;
					case 'mine':
					case 'wallHit':
						breakSound();
						break;
					case 'tier':
						notify(`Новая кирка: ${data}!`);
						break;
					case 'diamond':
						unlock('treasure');
						setTimeout(() => notify('С алмазной киркой можно сломать стену «Магазин · Моды · РП»'), 1800);
						break;
					case 'torch':
						notify(data === 1 ? 'Уголь! На дереве загорелся факел' : 'Ещё один факел на дереве');
						break;
					case 'need':
						notify(`Нужна ${data} кирка`);
						break;
					case 'far':
						notify('Не дотянуться — блок слишком глубоко');
						break;
					case 'busy':
						notify('Сначала закончит с прошлым блоком');
						break;
					case 'away':
						notify('Сначала верни персонажа на остров');
						break;
					case 'wallNeed':
						notify(`Стену ломает только алмазная кирка. Сейчас — ${data}`);
						break;
					case 'free':
						breakSound();
						notify('Стена сломана — теперь можно летать по всему сайту');
						break;
					case 'drag':
						unlock('telekinesis');
						break;
					case 'tickle':
						unlock('tickle');
						break;
					default:
				}
			},
		});
		document.documentElement.classList.add(ok ? 'has-gl' : 'no-gl');
		// адрес с ?debug открывает доступ к сцене из консоли — нужно только для проверки
		if (new URLSearchParams(location.search).has('debug')) window.__hero = ok;
	})
	.catch(() => document.documentElement.classList.add('no-gl'));
