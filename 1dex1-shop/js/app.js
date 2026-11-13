// Главный файл сайта: собирает страницу из данных в data.js и оживляет её.
import {ACHIEVEMENTS, count, notify, onChange, renderList, unlock} from './achievements.js';
import * as auth from './auth.js';
import {initCollab} from './collab.js';
import {CASE, LEGAL, MARQUEE, SITE, TASKS, VISUALS} from './data.js';
import {initFootWord} from './footer.js';
import {applyI18n, getLang, locale, onLang, setLang, t} from './i18n.js';
import {getDoc} from './legal.js';
import {fontReady} from './voxelword.js';
import {caseArt, coverArt, icon, navIcon} from './pixel.js';
import {breakSound} from './sound.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// телефон: сайт как приложение — отдельные экраны, плитки, карточка товара снизу
const phoneMQ = matchMedia('(max-width: 700px)');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
const money = (v) => Number(v || 0).toLocaleString(locale(), {minimumFractionDigits: 2, maximumFractionDigits: 2});
const price = (v) => `${Number.isInteger(v) ? v : money(v)} ₽`;
const date = (iso, year = false) => new Date(iso).toLocaleDateString(locale(), year ? {day: 'numeric', month: 'long', year: 'numeric'} : {day: 'numeric', month: 'long'});
// текст ошибки по коду; неизвестный код — общая ошибка
const errText = (code) => {
	const s = t(`err.${code}`);
	return s === `err.${code}` ? t('err.server') : s;
};

// ---------- язык: тексты страницы и переключатель RU / EN ----------
applyI18n();
document.documentElement.classList.remove('pre-i18n');
const paintLangButtons = () => $$('[data-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === getLang())));
$$('[data-lang]').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
paintLangButtons();
onLang(paintLangButtons);

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
document.addEventListener('click', (e) => e.target.closest('a[data-link], a[data-task-open]') && unlock('contact'));

// ---------- бегущая строка ----------
const renderMarquee = () => {
	const list = MARQUEE[getLang()] || MARQUEE.ru;
	// слов мало, поэтому повторяем их много раз: лента должна быть шире экрана
	const words = Array.from({length: 24}, (_, i) => list[i % list.length]);
	const half = words.map((w, i) => `<span class="${i % 2 ? 'is-outline' : ''}">${esc(w)}</span><i></i>`).join('');
	$('#marquee').innerHTML = `<div class="marquee__track">${half}${half}</div>`;
};
renderMarquee();
onLang(renderMarquee);

// ---------- сломанные блоки: общий счётчик для достижений ----------
let blocksBroken = 0;
const blockBroken = (first) => {
	breakSound();
	unlock(first);
	if (++blocksBroken >= 30) unlock('mason');
};

// ---------- окна (достижения, вход, профиль, документы) ----------
// Закрываются плавно: сначала анимация (класс is-closing), потом close().
const openDialog = (dlg) => {
	dlg.classList.remove('is-closing'); // открыли снова, пока закрывалось, — окно остаётся
	if (!dlg.open) dlg.showModal();
};
const closeDialog = (dlg) => {
	if (!dlg.open || dlg.classList.contains('is-closing')) return;
	if (reducedMotion) return dlg.close();
	const done = () => {
		clearTimeout(timer);
		dlg.removeEventListener('animationend', onEnd);
		if (!dlg.classList.contains('is-closing')) return;
		dlg.classList.remove('is-closing');
		dlg.close();
	};
	const onEnd = (e) => e.target === dlg && !e.pseudoElement && done();
	const timer = setTimeout(done, 400);
	dlg.addEventListener('animationend', onEnd);
	dlg.classList.add('is-closing');
};
$$('dialog').forEach((dlg) => {
	dlg.addEventListener('click', (e) => {
		if (e.target === dlg || e.target.closest('[data-close]')) closeDialog(dlg);
	});
	// Esc / «Назад» закрывают окно плавно. Событие cancel бывает и у выбора файла
	// (телефон закрыл галерею или выбрали то же фото) — оно всплывает сюда, такое не трогаем,
	// иначе профиль закрывался при выборе аватарки
	dlg.addEventListener('cancel', (e) => {
		if (e.target !== dlg) return;
		e.preventDefault();
		closeDialog(dlg);
	});
});
const authDlg = $('#auth-dialog');
const profileDlg = $('#profile-dialog');
let openAuth = () => {}; // заполняется в блоке аккаунта

// ---------- магазин ----------
let products = [];
let filter = 'all';
const seenTabs = new Set();
const titleOf = (p) => (getLang() === 'en' && p.titleEn) || p.title;
const descOf = (p) => (getLang() === 'en' && p.descEn) || p.desc || '';

const priceOf = (p) => (p.price === null ? t('price.later') : p.price === 0 ? t('price.free') : price(p.price));
// эксклюзив: продаётся до дня until включительно (по Москве), потом пропадает из магазина
const untilEnd = (p) => Date.parse(`${p.until}T23:59:59.999+03:00`);
const onSale = (p) => !p.until || !(Date.now() > untilEnd(p));
const untilText = (p) => t('item.until', {d: new Date(untilEnd(p)).toLocaleDateString(locale(), {day: 'numeric', month: 'long', timeZone: 'Europe/Moscow'})});
const kindOf = (p) => `${t(`kind.${p.kind}`)}${p.until ? ` · <span class="item__excl">${t('item.excl')}</span>` : ''}`;
const card = (p, i) => {
	const user = auth.current();
	const order = user?.orders?.find((o) => o.productId === p.id);
	const priceText = priceOf(p);
	let action;
	if (p.status !== 'ready') action = `<span class="item__soon px">${t('item.soon')}</span>`;
	else if (order) {
		const url = auth.downloadUrl(order);
		action = url ? `<a class="btn btn--lime btn--sm" href="${esc(url)}" target="_blank" rel="noopener">${t('item.download')}</a>` : '<span class="item__soon px">✓</span>';
	} else if (p.price === 0) action = `<button class="btn btn--lime btn--sm" data-buy="${esc(p.id)}">${t('item.download')}</button>`;
	else action = `<button class="btn btn--lime btn--sm" data-checkout="${esc(p.id)}">${t('item.buy')}</button>`;
	const cover = p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : coverArt(p.kind, i);
	return `<article class="item card" data-kind="${esc(p.kind)}" data-id="${esc(p.id)}" style="--i:${i}">
		<div class="item__cover ${p.cover ? '' : 'is-art'}">${cover}
			<span class="item__badges">${p.status === 'ready' ? '' : `<span class="tag tag--gold px">${t('status.soon')}</span>`}${p.until ? `<span class="tag tag--excl px">${esc(untilText(p))}</span>` : ''}</span>
		</div>
		<div class="item__body">
			<span class="item__kind px">${kindOf(p)}</span>
			<h3 class="item__title">${esc(titleOf(p))}</h3>
			<p class="item__desc">${esc(descOf(p))}</p>
			${p.tags?.length ? `<ul class="item__tags px">${p.tags.map((tag) => `<li>${esc(tag)}</li>`).join('')}</ul>` : ''}
			<div class="item__foot">
				<span class="item__price px ${p.price ? 'has-price' : ''}">${priceText}</span>
				<span class="item__actions">${action}</span>
			</div>
		</div>
	</article>`;
};
// телефон: товары на Главной — сетка 2×2, первые четыре
const renderPhoneShop = () => {
	$('#mcards').innerHTML = products.length
		? products
				.slice(0, 4)
				.map(
					(p) =>
						`<button class="mcard" type="button" data-product="${esc(p.id)}"><span class="mcard__ic">${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : icon(p.kind === 'rp' ? 'gem' : 'pick')}</span><b>${esc(titleOf(p))}</b><small>${kindOf(p)}</small><span class="mcard__price px">${priceOf(p)}</span></button>`,
				)
				.join('')
		: `<div class="mcard mcard--empty"><span class="mcard__ic">${icon('chest')}</span><b>${t('m.soonT')}</b><small>${t('m.soonP')}</small></div>`;
};
// телефон: карточка товара выезжает снизу (описание и кнопки покупки)
const sheet = $('#product-sheet');
let sheetId = null;
const paintSheet = () => {
	const i = products.findIndex((p) => p.id === sheetId);
	if (i < 0) return false;
	$('#sheet-body').innerHTML = card(products[i], i);
	return true;
};
const openProduct = (id) => {
	sheetId = id;
	if (paintSheet()) openDialog(sheet);
};
document.addEventListener('click', (e) => {
	const c = e.target.closest('[data-product]');
	if (c) openProduct(c.dataset.product);
});
// ---------- покупка: окно с промокодом, способом оплаты и итогом (как в приложении) ----------
// Карта и СБП — через платёжный сервис: пока он не подключён, сервер отвечает «скоро».
// Баланс и купон из кейса работают уже сейчас. Промокодов пока нет — поле есть, ответ «такого нет».
const checkout = $('#checkout-dialog');
const coForm = $('#co-form');
let coId = null;
let coPromo = null; // применённый промокод {code, percent}
const coMethod = () => coForm.elements.method.value;
const coMsg = (text = '', bad = false) => {
	const m = $('#co-promo-msg');
	m.textContent = text;
	m.classList.toggle('is-bad', bad);
};
const paintCheckout = () => {
	const p = products.find((x) => x.id === coId);
	if (!p) return false;
	const user = auth.current();
	$('#co-thumb').innerHTML = p.cover ? `<img src="${esc(p.cover)}" alt="">` : icon(p.kind === 'rp' ? 'gem' : 'pick');
	$('#co-kind').innerHTML = kindOf(p);
	$('#co-title').textContent = titleOf(p);
	$('#co-balance').textContent = user ? `${money(user.balance)} ₽` : t('co.balanceLogin');
	const coupon = p.kind === 'rp' && Boolean(user?.coupons?.some((c) => c.kind === 'rp'));
	$('#co-coupon-row').hidden = !coupon;
	if (!coupon && coMethod() === 'coupon') coForm.elements.method.value = 'card';
	const promo = coPromo && p.price && coMethod() !== 'coupon' ? coPromo : null;
	const total = p.price === null ? null : coMethod() === 'coupon' ? 0 : promo ? auth.discounted(p.price, promo.percent) : p.price;
	$('#co-price').textContent = priceOf(p);
	$('#co-disc-row').hidden = !promo;
	$('#co-disc').textContent = promo ? `−${price(Math.round((p.price - total) * 100) / 100)}` : '';
	$('#co-total').textContent = total === null ? '—' : total === 0 ? t('price.free') : price(total);
	const btn = $('#co-pay');
	btn.disabled = total === null;
	$('#co-pay-text').textContent = total === null ? t('co.payLater') : user ? t('co.pay') : t('co.payLogin');
	$('#co-pay-sum').textContent = total ? price(total) : '';
	return true;
};
const openCheckout = (id) => {
	coId = id;
	coPromo = null;
	coForm.elements.method.value = 'card';
	$('#co-promo').value = '';
	coMsg();
	$('#co-error').textContent = '';
	if (!paintCheckout()) return;
	if (sheet.open) closeDialog(sheet); // на телефоне карточка товара уступает место окну покупки
	openDialog(checkout);
};
document.addEventListener('click', (e) => {
	const b = e.target.closest('[data-checkout]');
	if (b) openCheckout(b.dataset.checkout);
});
coForm.addEventListener('change', (e) => {
	if (e.target.name !== 'method') return;
	$('#co-error').textContent = '';
	paintCheckout();
});
$('#co-apply').addEventListener('click', async () => {
	const code = $('#co-promo').value.trim();
	coPromo = null;
	if (!code) {
		paintCheckout();
		return coMsg(t('err.promo_empty'), true);
	}
	const res = await auth.promo(code, coId);
	if (!res.error) coPromo = {code: res.code, percent: res.percent};
	coMsg(res.error ? errText(res.error) : t('co.promoOk', {p: res.percent}), Boolean(res.error));
	paintCheckout();
});
// поменял код после «Применить» — скидка снимается, пока не применишь снова
$('#co-promo').addEventListener('input', () => {
	if (!coPromo || $('#co-promo').value.trim().toUpperCase() === coPromo.code) return;
	coPromo = null;
	coMsg();
	paintCheckout();
});
$('#co-promo').addEventListener('keydown', (e) => {
	if (e.key !== 'Enter') return;
	e.preventDefault();
	$('#co-apply').click();
});
coForm.addEventListener('submit', async (e) => {
	e.preventDefault();
	const p = products.find((x) => x.id === coId);
	if (!p || p.price === null) return;
	if (!auth.current()) return openAuth('register');
	const method = coMethod();
	const btn = $('#co-pay');
	btn.disabled = true;
	$('#co-error').textContent = '';
	const promo = method === 'coupon' ? '' : coPromo?.code || '';
	const res = method === 'card' || method === 'sbp' ? await auth.pay(p.id, method, promo) : await auth.buy(p.id, {coupon: method === 'coupon', promo});
	btn.disabled = false;
	if (res.error === 'login') return openAuth('login');
	if (res.error) return ($('#co-error').textContent = errText(res.error));
	if (res.url) return location.assign(res.url); // страница платёжного сервиса (когда он будет подключён)
	closeDialog(checkout);
	notify(t('toast.bought'));
});
const renderShop = () => {
	renderPhoneShop();
	if (sheet.open) paintSheet();
	if (checkout.open) paintCheckout();
	const list = products.filter((p) => filter === 'all' || p.kind === filter);
	$('#shop-grid').innerHTML = list.length
		? list.map(card).join('')
		: `<div class="empty card"><span class="empty__icon">${icon('chest')}</span><b>${t(`empty.${filter}.t`)}</b><p>${t(`empty.${filter}.p`)}</p></div>`;
	$$('#shop-tabs [data-filter]').forEach((b) => {
		const kind = b.dataset.filter;
		b.classList.toggle('is-active', kind === filter);
		b.setAttribute('aria-selected', kind === filter);
		$('b', b).textContent = products.filter((p) => kind === 'all' || p.kind === kind).length;
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
// телефон: нажатие на строку товара (не на кнопку) открывает его карточку
$('#shop-grid').addEventListener('click', (e) => {
	if (!phoneMQ.matches || e.target.closest('a, button')) return;
	const item = e.target.closest('.item[data-id]');
	if (item) openProduct(item.dataset.id);
});
// бесплатный товар: «Скачать» сразу кладёт его в «Покупки»
document.addEventListener('click', async (e) => {
	const b = e.target.closest('[data-buy]');
	if (!b) return;
	if (!auth.current()) return openAuth('register');
	b.disabled = true;
	const res = await auth.buy(b.dataset.buy);
	b.disabled = false;
	if (res.error === 'login') return openAuth('login');
	if (res.error) return notify(errText(res.error));
	notify(t('toast.bought'));
});
renderShop();
onLang(renderShop);
auth.onAuth(renderShop);

// ---------- сотрудничество: личный профиль и визуалы вокруг аватарки ----------
{
	const nick = SITE.contact.trim().replace(/^@?/, '@');
	const btn = $('#collab-btn');
	if (nick.length > 1) {
		btn.href = `https://t.me/${nick.slice(1)}`;
		$('#collab-name').textContent = nick.slice(1);
		$('#collab-nick').textContent = nick;
		$('#collab-row').hidden = false;
		$('#collab-copy').addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(nick);
				notify(t('collab.copied', {nick}));
			} catch {
				notify(nick);
			}
		});
	} else {
		// ник ещё не указан в data.js — кнопка неактивна
		btn.removeAttribute('href');
		btn.setAttribute('aria-disabled', 'true');
		btn.classList.add('is-off');
		btn.dataset.i18n = 'collab.soon';
		btn.textContent = t('collab.soon');
	}
	initCollab($('#collab-space'), $('.collab__ava'), VISUALS, {reducedMotion});
	const labelVisuals = () => $$('.visual').forEach((a) => a.setAttribute('aria-label', t('visual.open', {name: a.dataset.name})));
	labelVisuals();
	onLang(labelVisuals);
}

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
	onLang(paint);
	paint();
	$$('[data-open-ach]').forEach((b) =>
		b.addEventListener('click', () => {
			paint();
			openDialog(dlg);
		}),
	);
}

// ---------- аккаунт: регистрация, вход, подтверждение почты, профиль ----------
{
	const form = $('#auth-form');
	const error = $('#auth-error');
	const submit = $('#auth-submit');
	const resend = $('#auth-resend');
	let mode = 'register';
	let pendingLogin = ''; // ник, для которого ждём код из письма
	let pendingEmail = ''; // почта, куда ушёл код (при входе — частично скрыта)
	let resendAt = 0;
	let fromRegister = false;

	// по умолчанию аватарка — первая буква ника на цветном фоне (цвет зависит от ника)
	const nickHue = (nick) => [...nick.toLowerCase()].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
	const avatarHtml = (user) => {
		if (user.avatar) return `<img src="${esc(user.avatar)}" alt="">`;
		const h = nickHue(user.nick);
		return `<span class="ava-letter" style="--h1:${h};--h2:${(h + 50) % 360}">${esc(user.nick[0].toUpperCase())}</span>`;
	};

	const paintResend = () => {
		const left = Math.ceil((resendAt - Date.now()) / 1000);
		resend.disabled = left > 0;
		resend.textContent = left > 0 ? t('auth.resendIn', {s: left}) : t('auth.resend');
	};
	setInterval(() => mode === 'verify' && paintResend(), 1000);

	const setMode = (next) => {
		mode = next;
		authDlg.dataset.mode = mode;
		$$('[data-auth-tab]', authDlg).forEach((b) => {
			b.classList.toggle('is-active', b.dataset.authTab === mode);
			b.setAttribute('aria-selected', b.dataset.authTab === mode);
		});
		$('#auth-title').textContent = t({register: 'auth.titleReg', login: 'auth.titleLogin', verify: 'auth.titleVerify'}[mode]);
		submit.textContent = t({register: 'auth.submitReg', login: 'auth.submitLogin', verify: 'auth.submitVerify'}[mode]);
		// поля, которых нет в этом шаге, прячем и выключаем, чтобы форма их не проверяла
		$$('[data-only]', form).forEach((row) => {
			const on = row.dataset.only.split(' ').includes(mode);
			row.hidden = !on;
			$$('input', row).forEach((i) => (i.disabled = !on));
		});
		$('#auth-password').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
		$('#auth-lead').textContent = mode === 'verify' ? t('auth.codeSent', {email: pendingEmail}) : '';
		error.textContent = '';
		if (mode === 'verify') {
			paintResend();
			setTimeout(() => $('#auth-code').focus(), 50);
		}
	};
	openAuth = (next = 'register') => {
		setMode(next);
		openDialog(authDlg);
	};
	authDlg.addEventListener('click', (e) => {
		const tab = e.target.closest('[data-auth-tab]');
		if (tab) setMode(tab.dataset.authTab);
	});
	onLang(() => setMode(mode));

	const toVerify = ({login, email}) => {
		pendingLogin = login;
		pendingEmail = email;
		resendAt = Date.now() + 60e3;
		setMode('verify');
	};
	const done = (user, greeting) => {
		form.reset();
		authDlg.close();
		if (greeting === 'toast.welcome') unlock('newcomer');
		notify(t(greeting, {nick: user.nick}));
		openDialog(profileDlg);
	};

	form.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (submit.disabled) return;
		error.textContent = '';
		const data = Object.fromEntries(new FormData(form));
		submit.disabled = true;
		let res;
		try {
			if (mode === 'register') res = await auth.register(data, getLang());
			else if (mode === 'login') res = await auth.login(data, getLang());
			else res = await auth.verifyEmail({login: pendingLogin, code: data.code});
		} finally {
			submit.disabled = false;
		}
		// с сервером после регистрации и после пароля при входе на почту приходит код
		if (res.verify) {
			fromRegister = mode === 'register';
			return toVerify(res);
		}
		if (res.error) {
			error.textContent = errText(res.error);
			if (res.field) $(`#auth-${res.field}`)?.focus();
			return;
		}
		done(res.user, mode === 'register' || (mode === 'verify' && fromRegister) ? 'toast.welcome' : 'toast.welcomeBack');
	});
	resend.addEventListener('click', async () => {
		resend.disabled = true;
		const res = await auth.resendCode({login: pendingLogin}, getLang());
		if (res.error) {
			error.textContent = errText(res.error);
			resendAt = Date.now() + (res.wait || 15e3);
		} else {
			notify(t('toast.codeSent'));
			resendAt = Date.now() + 60e3;
		}
		paintResend();
	});

	const HIST_ICON = {case: 'chest', reward: 'trophy', topup: 'coin', admin: 'coin', purchase: 'cube'};
	const histTitle = (h) => (h.kind === 'purchase' || (h.kind === 'admin' && h.title) ? h.title : t(`hist.${h.kind}`));
	const paint = () => {
		const user = auth.current();
		document.documentElement.classList.toggle('is-authed', Boolean(user));
		$$('[data-auth-label]').forEach((el) => (el.textContent = user ? user.nick : t('auth.signin')));
		$$('[data-auth-avatar]').forEach((el) => (el.innerHTML = user ? avatarHtml(user) : icon('user')));
		if (!user) {
			if (profileDlg.open) profileDlg.close();
			return;
		}
		$('#profile-avatar').innerHTML = avatarHtml(user);
		$('#profile-nick').textContent = user.nick;
		$('#profile-email').textContent = user.email;
		$('#profile-since').textContent = t('profile.since', {date: date(user.createdAt, true)});
		$('#profile-balance').textContent = money(user.balance);
		$('#wallet-id').textContent = `ID ${user.id ?? '—'}`; // номер игрока по порядку регистрации
		$('#wallet-owner').textContent = user.nick;
		const bonus = $('#wallet-bonus');
		bonus.hidden = !user.bonusCases;
		bonus.innerHTML = `${icon('chest')}${esc(t('wallet.bonus', {n: user.bonusCases}))}`;
		// покупки, история и купоны видны, только когда в них что-то есть
		$('#orders-box').hidden = !user.orders.length;
		$('#orders').innerHTML = user.orders
			.map((o) => {
				const url = auth.downloadUrl(o);
				return `<li><span class="wallet__op">${icon('cube')}</span><span class="wallet__what"><b>${esc((getLang() === 'en' && o.titleEn) || o.title)}</b><time>${date(o.at)}</time></span>${url ? `<a class="wallet__dl" href="${esc(url)}" target="_blank" rel="noopener">${t('order.download')}</a>` : ''}</li>`;
			})
			.join('');
		$('#wallet-history-box').hidden = !user.history.length;
		$('#wallet-history').innerHTML = user.history
			.map(
				(h) =>
					`<li><span class="wallet__op">${icon(HIST_ICON[h.kind] || 'coin')}</span><span class="wallet__what"><b>${esc(histTitle(h))}</b><time>${date(h.at)}</time></span><span class="wallet__amount ${h.amount < 0 ? 'is-minus' : ''}">${h.amount < 0 ? '−' : '+'}${money(Math.abs(h.amount))} ₽</span></li>`,
			)
			.join('');
		$('#coupons-box').hidden = !user.coupons.length;
		$('#coupons').innerHTML = user.coupons
			.map((c) => `<li><span class="wallet__op wallet__op--gem">${icon('gem')}</span><span class="wallet__what"><b>${esc(t('loot.rp'))}</b><time>${esc(t('coupon.note', {date: date(c.at)}))}</time></span><span class="wallet__tag">${t('coupon.tag')}</span></li>`)
			.join('');
	};
	auth.onAuth(paint);
	onLang(paint);
	paint();

	$$('[data-open-profile]').forEach((b) =>
		b.addEventListener('click', () => {
			if (auth.current()) return openDialog(profileDlg);
			openAuth('register');
		}),
	);

	// аватарка из галереи
	$('#avatar-file').addEventListener('change', async (e) => {
		const file = e.target.files[0];
		e.target.value = '';
		if (!file) return;
		try {
			const res = await auth.update({avatar: await auth.fileToAvatar(file)});
			if (res.error) throw new Error(res.error);
			unlock('face');
			notify(t('toast.avatar'));
		} catch (err) {
			notify(errText(err.message));
		}
	});
	// смена пароля
	const pwForm = $('#pw-form');
	pwForm.addEventListener('submit', async (e) => {
		e.preventDefault();
		const res = await auth.changePassword(Object.fromEntries(new FormData(pwForm)));
		$('#pw-error').textContent = res.error ? errText(res.error) : '';
		if (res.error) {
			$(res.field === 'old' ? '#pw-old' : '#pw-new').focus();
			return;
		}
		pwForm.reset();
		pwForm.closest('details').open = false;
		notify(t('toast.pw'));
	});
	$('#logout').addEventListener('click', async () => {
		profileDlg.close();
		await auth.logout();
		notify(t('toast.logout'));
	});
	setMode('register');
}

// ---------- награда: 5 ₽ на баланс за все достижения (один раз на аккаунт) ----------
{
	const tried = new Set();
	const reward = async () => {
		const user = auth.current();
		if (count() < ACHIEVEMENTS.length || !user || tried.has(user.nick)) return;
		tried.add(user.nick);
		const res = await auth.claimAchievements();
		if (res.ok) notify(t('toast.reward5'));
	};
	onChange(reward);
	auth.onAuth(reward);
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

	// хотбар (на телефоне): рамка выделения стоит на разделе, который сейчас на экране,
	// а пока открыто окно профиля или входа — на «Профиле»
	const bar = $('#hotbar');
	const slots = $$('.hotbar__slot', bar);
	const dialogs = [profileDlg, authDlg];
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

	// ---------- телефон: разделы — отдельные экраны, как на onlyy.shop ----------
	// Главная (первый экран, сотрудничество, каналы), Магазин и Кейсы показываются по одному,
	// у каждого своя граница прокрутки. Кнопка «Назад» в телефоне возвращает на прошлый экран.
	// На компьютере сайт листается целиком.
	const phone = phoneMQ;
	// Главная, Магазин, Кейсы — вкладки хотбара; Сотрудничество, Каналы, Вопросы открываются с Главной
	const PAGE_SLOT = {home: 'top', shop: 'shop', cases: 'cases', collab: 'top', social: 'top', faq: 'top'};
	const PAGE_TITLE = {shop: 'shop.label', cases: 'cases.title', collab: 'collab.title', social: 'social.title', faq: 'faq.title'};
	const INNER = new Set(['collab', 'social', 'faq']);
	let depth = 0; // сколько шагов можно вернуться кнопкой «назад» внутри сайта
	const pageOf = (el) => el?.closest('[data-page]')?.dataset.page || 'home';
	const paintTop = () => {
		const page = document.documentElement.dataset.page;
		$('#page-title').textContent = PAGE_TITLE[page] ? t(PAGE_TITLE[page]) : '';
		$('#page-back').hidden = !INNER.has(page);
	};
	onLang(paintTop);
	$('#page-back').addEventListener('click', () => {
		if (depth > 0) history.back();
		else {
			history.pushState(null, '', '#top');
			showPage('home');
		}
	});
	const showPage = (page, target) => {
		const html = document.documentElement;
		const changed = html.dataset.page !== page;
		// персонаж (hero.js) телепортируется: ему нужно знать, где он был, пока экран старый
		if (changed) dispatchEvent(new CustomEvent('dex:page', {detail: {from: html.dataset.page, to: page}}));
		html.dataset.page = page;
		$$('body [data-page]').forEach((el) => el.classList.toggle('page-off', el.dataset.page !== page));
		paintTop();
		sectionSlot = PAGE_SLOT[page];
		select(sectionSlot);
		// другой экран открывается сразу с начала; на том же экране — плавно к нужному месту
		const behavior = changed ? 'instant' : 'smooth';
		const go = () => {
			if (target && page === 'home' && target.id !== 'top') target.scrollIntoView({behavior, block: 'start'});
			else window.scrollTo({top: 0, behavior});
		};
		go();
		if (changed) requestAnimationFrame(go); // ещё раз, когда новый экран уже нарисован
	};
	// прокрутку экранов ведём сами, браузер не должен возвращать старую при «Назад»
	if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
	document.addEventListener('click', (e) => {
		if (!phone.matches || e.defaultPrevented) return;
		const a = e.target.closest('a[href^="#"]');
		const target = a && document.getElementById(a.hash.slice(1));
		if (!target) return;
		e.preventDefault();
		if (location.hash !== a.hash) {
			history.pushState(null, '', a.hash);
			depth++;
		}
		showPage(pageOf(target), target);
	});
	const fromHash = () => {
		const target = document.getElementById(location.hash.slice(1));
		showPage(pageOf(target), target);
	};
	addEventListener('popstate', () => {
		depth = Math.max(0, depth - 1);
		if (phone.matches) fromHash();
	});
	const syncMode = () => {
		if (phone.matches) fromHash();
		else {
			delete document.documentElement.dataset.page;
			$$('.page-off').forEach((el) => el.classList.remove('page-off'));
		}
	};
	phone.addEventListener('change', syncMode);
	syncMode();
}

// ---------- кейс: ежедневный и бесплатные за задания ----------
let paintCase = () => {};
{
	const art = $('#case-art');
	const prizeBox = $('#case-prize');
	const btn = $('#case-open');
	const dots = [$('.hotbar__dot'), $('.topnav__dot')].filter(Boolean);
	const LOOT_ICON = {money: 'coin', rp: 'gem'};
	art.innerHTML = caseArt();
	const total = CASE.loot.reduce((sum, l) => sum + l.chance, 0);
	const pct = (c) => {
		const v = (c / total) * 100;
		return `${v < 1 ? v.toFixed(1) : Math.round(v)}%`;
	};
	const renderLoot = () =>
		($('#case-loot').innerHTML = CASE.loot
			.map((l) => `<li data-rarity="${l.rarity}">${icon(LOOT_ICON[l.kind] || 'gem')}<span><b>${esc(t(`loot.${l.id}`))}</b><small>${t('case.chance', {p: pct(l.chance)})}</small></span></li>`)
			.join(''));
	renderLoot();
	onLang(renderLoot);

	const wait = CASE.cooldownHours * 3600e3;
	const left = () => {
		const u = auth.current();
		return u && u.caseAt ? Math.max(0, u.caseAt + wait - Date.now()) : 0;
	};
	const clock = (ms) => {
		const sec = Math.ceil(ms / 1000);
		return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60].map((v) => String(v).padStart(2, '0')).join(':');
	};
	const set = (el, prop, value) => el[prop] !== value && (el[prop] = value);
	let opening = false;
	paintCase = () => {
		if (opening) return;
		const user = auth.current();
		const ms = left();
		const bonus = user?.bonusCases || 0;
		dots.forEach((d) => (d.hidden = Boolean(user) && ms > 0 && !bonus));
		if (!user) {
			set(btn, 'disabled', false);
			set(btn, 'textContent', t('case.login'));
		} else if (ms === 0) {
			set(btn, 'disabled', false);
			set(btn, 'textContent', t('case.open'));
		} else if (bonus > 0) {
			set(btn, 'disabled', false);
			set(btn, 'textContent', t('case.openBonus', {n: bonus}));
		} else {
			set(btn, 'disabled', true);
			set(btn, 'textContent', t('case.wait', {t: clock(ms)}));
		}
	};
	paintCase();
	auth.onAuth(paintCase);
	onLang(paintCase);
	setInterval(paintCase, 1000);

	let lastPrize = null;
	const prizeHtml = (p) =>
		p.kind === 'money' ? `${icon('coin')}<b>+${p.amount} ₽</b><span>${t('case.money')}</span>` : `${icon('gem')}<b>${t('case.rp')}</b><span>${t('case.rpText')}</span>`;
	const showPrize = (p) => {
		lastPrize = p;
		prizeBox.dataset.rarity = p.rarity;
		prizeBox.innerHTML = prizeHtml(p);
		prizeBox.hidden = false;
		notify(p.kind === 'money' ? t('toast.caseMoney', {n: p.amount}) : t('toast.caseRp'));
	};
	onLang(() => lastPrize && !prizeBox.hidden && (prizeBox.innerHTML = prizeHtml(lastPrize)));
	const open = async () => {
		if (opening) return;
		if (!auth.current()) return openAuth('register');
		opening = true;
		btn.disabled = true;
		btn.textContent = t('case.opening');
		const res = await auth.openCase();
		if (res.error) {
			opening = false;
			if (res.error !== 'wait') notify(errText(res.error));
			return paintCase();
		}
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
				paintCase();
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

// ---------- задания: за каждое — бесплатный кейс ----------
{
	const list = $('#tasks');
	const LINK_ICON = {
		youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3z" fill="#ff3d3d"/><path d="M10 9.5v5l4.5-2.5z" fill="#fff"/></svg>',
		telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 4 2.5 11.2l5.6 2 2.1 6.3 3.1-3.7 4.7 3.5z" fill="#c3a6ff"/><path d="m8.1 13.2 9.3-6.4-6.9 7.8-.3 4.9z" fill="#5b34c9"/></svg>',
	};
	const iconOf = (task) => (task.kind === 'link' ? LINK_ICON[task.link] : icon(task.kind === 'purchase' ? 'chest' : 'coin'));
	const render = () => {
		const user = auth.current();
		list.innerHTML = TASKS.map((task) => {
			const st = user?.tasks?.[task.id] || {state: 'todo'};
			const desc = t(`task.${task.id}.d`, {n: Number(st.progress || 0).toLocaleString(locale()), goal: task.amount});
			let action;
			if (!user) action = `<button class="btn btn--purple btn--sm task__btn" type="button" data-task-login>${t('task.login')}</button>`;
			else if (st.state === 'claimed') action = `<span class="btn btn--sm task__btn">✓ ${t('task.done')}</span>`;
			else if (st.state === 'ready' || st.state === 'opened') action = `<button class="btn btn--gold btn--sm task__btn" type="button" data-task-claim="${task.id}">${t('task.claim')}</button>`;
			else if (task.kind === 'link') action = `<a class="btn btn--purple btn--sm task__btn" href="${esc(SITE[task.link])}" target="_blank" rel="noopener" data-task-open="${task.id}">${t('task.go')}</a>`;
			else if (task.kind === 'purchase') action = `<a class="btn btn--purple btn--sm task__btn" href="#shop">${t('task.toShop')}</a>`;
			else action = `<button class="btn btn--purple btn--sm task__btn" type="button" disabled title="${esc(t('wallet.soon'))}">${t('task.topup')}</button>`;
			return `<li class="task ${st.state === 'claimed' ? 'is-done' : ''}">
				<span class="task__icon">${iconOf(task)}</span>
				<span class="task__text"><b>${t(`task.${task.id}.t`)}</b><small>${esc(desc)} · <span class="task__reward">${t('task.reward')}</span></small></span>
				${action}
			</li>`;
		}).join('');
	};
	render();
	auth.onAuth(render);
	onLang(render);
	list.addEventListener('click', async (e) => {
		if (e.target.closest('[data-task-login]')) return openAuth('register');
		const opened = e.target.closest('[data-task-open]');
		if (opened) {
			// ссылка открывается в новой вкладке, а здесь запоминаем переход
			const res = await auth.openTask(opened.dataset.taskOpen);
			if (!res.error) notify(t('toast.taskWait'));
			return;
		}
		const claim = e.target.closest('[data-task-claim]');
		if (!claim) return;
		claim.disabled = true;
		const res = await auth.claimTask(claim.dataset.taskClaim);
		claim.disabled = false;
		if (res.error) return notify(errText(res.error));
		breakSound();
		notify(t('toast.taskClaimed'));
	});
}

// ---------- частые вопросы (экран телефона): раскрываются по нажатию ----------
{
	const render = () => {
		const contact = SITE.contact.trim().replace(/^@?/, '@');
		$('#faq-list').innerHTML = [1, 2, 3, 4, 5]
			.map((n) => `<details class="faq__item"><summary>${esc(t(`faq.q${n}`))}</summary><p>${esc(t(`faq.a${n}`, {contact}))}</p></details>`)
			.join('');
	};
	render();
	onLang(render);
}

// ---------- подвал: документы (соглашение, политика, оферта) ----------
// Каждая кнопка открывает только свой документ: своя иконка, свой цвет, своё описание.
{
	const dlg = $('#legal-dialog');
	const body = $('#legal-body');
	let docId = 'terms';
	const render = () => {
		const d = getDoc(docId, getLang());
		dlg.dataset.doc = docId;
		$('#legal-icon').innerHTML = navIcon(docId);
		$('#legal-title').textContent = d.title;
		$('#legal-lead').textContent = d.lead;
		// пункты нумеруются: раздел 2 → 2.1, 2.2…; в списках-перечнях — квадратики
		const sections = d.sections.map((s, i) => {
			const n = i + 1;
			const tag = s.list === 'ul' ? 'ul' : 'ol';
			const items = s.items.map((text, j) => `<li><b>${tag === 'ol' ? `${n}.${j + 1}.` : ''}</b><span>${esc(text)}</span></li>`).join('');
			return `<section class="doc__sec" style="--i:${Math.min(i, 8)}"><h3><span>${n}.</span>${esc(s.h)}</h3><${tag}>${items}</${tag}></section>`;
		});
		body.innerHTML = `<p class="doc__date">${esc(t('legal.updated', {date: date(`${LEGAL.updated}T12:00:00`, true)}))}</p>${sections.join('')}`;
		body.scrollTop = 0;
	};
	document.addEventListener('click', (e) => {
		const b = e.target.closest('[data-legal]');
		if (!b) return;
		docId = b.dataset.legal;
		render();
		openDialog(dlg);
		body.focus({preventScroll: true});
	});
	onLang(() => dlg.open && render());
}

// ---------- подвал: надпись «1DEX1 SHOP» из ломающихся блоков ----------
initFootWord($('#foot-word'), {reducedMotion, on: () => blockBroken('digger')});
$('#year').textContent = new Date().getFullYear();

// ---------- запуск: узнать, есть ли сервер, загрузить вошедшего и товары ----------
auth.init().then(async () => {
	products = (await auth.loadProducts()).filter(onSale);
	renderShop();
});

// ---------- 3D-сцена первого экрана (грузится последней, чтобы не тормозить страницу) ----------
// надпись «1DEX1 SHOP» собирается из букв шрифта сайта — сначала ждём шрифт
Promise.all([import('./hero.js'), fontReady()])
	.then(([{initHero}]) => {
		const tier = (id) => t(`tier.${id}`);
		const ok = initHero($('#hero-gl'), {
			reducedMotion,
			wall: $('#marquee'),
			sky: $('#hero-sky'),
			on(event, data) {
				switch (event) {
					case 'portal':
						if (data === 'nether') unlock('nether');
						if (data === 'end') unlock('theEnd');
						break;
					case 'world':
						if (data !== 'over') notify(t(`toast.${data}`));
						break;
					case 'netherite':
						setTimeout(() => notify(t('toast.netherite')), 1800);
						break;
					case 'endPortal':
						breakSound();
						notify(t('toast.endPortal'));
						break;
					case 'egg':
						breakSound();
						notify(t('toast.egg'));
						break;
					case 'break':
						blockBroken('kirka');
						break;
					case 'mine':
					case 'wallHit':
						breakSound();
						break;
					case 'tier':
						notify(t('toast.tier', {name: tier(data)}));
						break;
					case 'diamond':
						unlock('treasure');
						setTimeout(() => notify(t('toast.diamond', {wall: (MARQUEE[getLang()] || MARQUEE.ru).join(' · ')})), 1800);
						break;
					case 'torch':
						notify(t(data === 1 ? 'toast.torch1' : 'toast.torchN'));
						break;
					case 'need':
						notify(t('toast.need', {name: tier(data)}));
						break;
					case 'far':
						notify(t('toast.far'));
						break;
					case 'busy':
						notify(t('toast.busy'));
						break;
					case 'away':
						notify(t('toast.away'));
						break;
					case 'wallNeed':
						notify(t('toast.wallNeed', {name: tier(data)}));
						break;
					case 'free':
						breakSound();
						notify(t('toast.free'));
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
