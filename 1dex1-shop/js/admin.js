// Админка 1DEX1 SHOP — только для владельца сайта. Работает с сервером: доступ даёт команда
// на сервере `npm run admin -- user admin Ник`, после этого в профиле появляется кнопка «Админка».
// Вкладки: Продажи (выручка и последние покупки), Товары (цены, тексты, файлы, картинки,
// эксклюзив, показать/скрыть), Промокоды (скидка, лимит, срок), Игроки (поиск, баланс).
// Всё, что меняется здесь, сразу видно на сайте. Тексты админки только на русском — она для тебя.

import * as auth from './auth.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
let H = null; // помощники из app.js: openDialog, closeDialog, notify, esc, price, date, reloadShop
let tab = 'sales';
const dlg = $('#admin-dialog');
const body = $('#adm-body');

const ERR = {
	admin_id: 'id: латиница, цифры и дефис, от 2 до 40 символов (например pvp-ai)',
	admin_exists: 'Товар с таким id уже есть',
	admin_title: 'Нужно название',
	admin_price: 'Сумма: число, например 49 или 19.90',
	admin_date: 'Дата в виде ГГГГ-ММ-ДД',
	admin_url: 'Ссылка должна начинаться с https://',
	admin_upload: 'Не получилось загрузить',
	admin_ext: 'Такой тип файла не подходит',
	admin_size: 'Файл слишком большой (файл товара — до 30 МБ, картинка — до 5 МБ)',
	admin_code: 'Код: латиница, цифры, «-» и «_», от 3 до 24 символов',
	admin_percent: 'Скидка — целое число от 1 до 90',
	admin_uses: 'Сколько раз — целое число от 1 (или пусто — без лимита)',
	admin_user: 'Нет такого игрока',
	balance: 'Столько на балансе нет',
	forbidden: 'Нет доступа: этот аккаунт не админ',
	login: 'Сначала войди в аккаунт',
	network: 'Нет связи с сервером',
};
const errText = (code) => ERR[code] || 'Что-то пошло не так. Попробуй ещё раз';
const esc = (s) => H.esc(String(s ?? ''));
const rub = (v) => H.price(Math.round(Number(v || 0) * 100) / 100);
const when = (iso) => new Date(iso).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const plural = (n, [one, few, many]) => {
	const a = Math.abs(n) % 100;
	const b = a % 10;
	return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const PAID = {balance: 'баланс', coupon: 'купон', card: 'карта', sbp: 'СБП', free: 'бесплатно'};
const loading = () => (body.innerHTML = '<p class="adm__empty">Загружаю…</p>');
const failBox = (code) => (body.innerHTML = `<p class="adm__empty adm__bad">${esc(errText(code))}</p>`);

// ---------- Продажи ----------
const sales = async () => {
	const r = await auth.admin('summary');
	if (r.error) return failBox(r.error);
	const tile = (name, s) => `<div class="adm__tile"><small>${name}</small><b>${rub(s.sum)}</b><span>${s.count} ${plural(s.count, ['продажа', 'продажи', 'продаж'])}</span></div>`;
	const rows = r.orders
		.map(
			(o) =>
				`<tr><td data-l="Когда">${when(o.at)}</td><td data-l="Игрок">${esc(o.nick)}${o.num ? ` <small>ID ${o.num}</small>` : ''}</td><td data-l="Товар">${esc(o.title)}</td><td data-l="Сумма" class="adm__num">${rub(o.price)}</td><td data-l="Оплата">${PAID[o.paidWith] || esc(o.paidWith)}</td><td data-l="Промокод">${o.promo ? esc(o.promo) : '—'}</td></tr>`,
		)
		.join('');
	body.innerHTML = `
		<div class="adm__tiles">${tile('Сегодня', r.sales.today)}${tile('7 дней', r.sales.week)}${tile('30 дней', r.sales.month)}${tile('Всего', r.sales.all)}</div>
		<p class="adm__note">Игроков с подтверждённой почтой: <b>${r.users.all}</b> · новых сегодня: <b>${r.users.today}</b></p>
		<h3 class="adm__h">Последние покупки</h3>
		${r.orders.length ? `<div class="adm__table"><table><thead><tr><th>Когда</th><th>Игрок</th><th>Товар</th><th>Сумма</th><th>Оплата</th><th>Промокод</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="adm__empty">Покупок пока нет</p>'}`;
};

// ---------- Товары ----------
const productForm = (p = {}) => {
	const isNew = !p.id;
	return `<form class="adm__card" data-id="${esc(p.id || '')}" ${isNew ? 'data-new' : ''} novalidate>
		<div class="adm__cover">${p.cover ? `<img src="${esc(p.cover)}" alt="">` : '<span>Нет картинки</span>'}</div>
		<div class="adm__fields">
			<div class="adm__top">
				${isNew ? '<label>id (латиница) <input name="id" required placeholder="new-mod"></label>' : `<b class="adm__id">${esc(p.id)}</b>`}
				${isNew ? '' : `<span class="adm__stat">Продано: <b>${p.sold}</b> на <b>${rub(p.revenue)}</b></span>`}
				<label class="adm__check"><input type="checkbox" name="active" ${p.active === false ? '' : 'checked'}> Показывать на сайте</label>
			</div>
			<div class="adm__grid">
				<label>Название <input name="title" value="${esc(p.title)}" maxlength="80" required></label>
				<label>Название (англ.) <input name="titleEn" value="${esc(p.titleEn)}" maxlength="80"></label>
				<label class="adm__wide">Описание <textarea name="desc" rows="2" maxlength="600">${esc(p.desc)}</textarea></label>
				<label class="adm__wide">Описание (англ.) <textarea name="descEn" rows="2" maxlength="600">${esc(p.descEn)}</textarea></label>
				<label>Цена, ₽ <input name="price" inputmode="decimal" value="${p.price ?? ''}" placeholder="пусто — «Цена позже»"></label>
				<label>Метки через запятую <input name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="1.21.11, Fabric"></label>
				<label>Тип <select name="kind"><option value="mod" ${p.kind === 'rp' ? '' : 'selected'}>Мод</option><option value="rp" ${p.kind === 'rp' ? 'selected' : ''}>Ресурс-пак</option></select></label>
				<label>Статус <select name="status"><option value="ready" ${p.status === 'soon' ? '' : 'selected'}>Готов</option><option value="soon" ${p.status === 'soon' ? 'selected' : ''}>В разработке</option></select></label>
				<label>Эксклюзив до (включительно) <input name="until" type="date" value="${esc(p.until)}"></label>
				<label>Порядок в магазине <input name="sort" type="number" step="1" value="${p.sort ?? 0}"></label>
			</div>
			${
				isNew
					? '<p class="adm__note">Файл и картинку можно загрузить после первого сохранения.</p>'
					: `<div class="adm__files">
				<span>Файл: <b>${p.file ? esc(p.file) : 'не загружен'}</b></span>
				<label class="btn btn--ghost btn--sm adm__upload">Загрузить файл<input type="file" data-upload="file" accept=".jar,.zip,.mrpack,.7z,.rar" hidden></label>
				<label class="btn btn--ghost btn--sm adm__upload">Сменить картинку<input type="file" data-upload="cover" accept="image/webp,image/png,image/jpeg,image/gif" hidden></label>
			</div>`
			}
			<p class="form__error adm__err" role="alert"></p>
			<div class="adm__actions"><button class="btn btn--lime btn--sm" type="submit">${isNew ? 'Создать товар' : 'Сохранить'}</button>${isNew ? '<button class="btn btn--ghost btn--sm" type="button" data-cancel>Отмена</button>' : ''}</div>
		</div>
	</form>`;
};
const products = async () => {
	const r = await auth.admin('products');
	if (r.error) return failBox(r.error);
	body.innerHTML = `
		<div class="adm__bar"><p class="adm__note">Цена пустая — на сайте «Цена позже». Снятая галочка «Показывать» прячет товар, у купивших он остаётся.</p><button class="btn btn--purple btn--sm" type="button" data-new-product>+ Новый товар</button></div>
		<div class="adm__list">${r.products.map(productForm).join('') || '<p class="adm__empty">Товаров пока нет</p>'}</div>`;
};
const readFile = (file) =>
	new Promise((ok, fail) => {
		const r = new FileReader();
		r.onerror = () => fail(new Error('read'));
		r.onload = () => ok(String(r.result).split(',')[1] || '');
		r.readAsDataURL(file);
	});
const formData = (form) => {
	const d = Object.fromEntries(new FormData(form));
	d.active = form.elements.active.checked;
	d.id = form.dataset.id || d.id;
	d.isNew = form.hasAttribute('data-new');
	return d;
};

// ---------- Промокоды ----------
const promos = async () => {
	const r = await auth.admin('promos');
	if (r.error) return failBox(r.error);
	const rows = r.promos
		.map(
			(p) => `<tr data-code="${esc(p.code)}">
				<td data-l="Код"><b>${esc(p.code)}</b></td><td data-l="Скидка" class="adm__num">−${p.percent}%</td>
				<td data-l="Применили" class="adm__num">${p.used}${p.maxUses ? ` из ${p.maxUses}` : ''}</td>
				<td data-l="Срок">${p.until ? esc(p.until) : 'без срока'}</td>
				<td><label class="adm__check"><input type="checkbox" data-promo-active ${p.active ? 'checked' : ''}> работает</label></td>
				<td><button class="adm__link" type="button" data-promo-del>Удалить</button></td></tr>`,
		)
		.join('');
	const usage = r.usage.map((u) => `<li><b>${esc(u.code)}</b> — ${u.count} ${plural(u.count, ['раз', 'раза', 'раз'])}, на ${rub(u.sum)}</li>`).join('');
	body.innerHTML = `
		<form class="adm__card adm__promo-form" id="adm-promo-form" novalidate>
			<div class="adm__grid adm__grid--4">
				<label>Код <input name="code" required maxlength="24" placeholder="WINTER" autocapitalize="characters"></label>
				<label>Скидка, % <input name="percent" type="number" min="1" max="90" value="10" required></label>
				<label>Сколько раз всего <input name="maxUses" type="number" min="1" placeholder="без лимита"></label>
				<label>Действует до <input name="until" type="date"></label>
			</div>
			<p class="form__error adm__err" role="alert"></p>
			<div class="adm__actions"><button class="btn btn--lime btn--sm" type="submit">Создать промокод</button></div>
			<p class="adm__note">Коды нигде на сайте не показываются — их знают те, кому ты скажешь. Тот же код, созданный здесь, главнее кода из js/data.js: его можно выключить, ограничить сроком и числом применений.</p>
		</form>
		<h3 class="adm__h">Промокоды из админки</h3>
		${r.promos.length ? `<div class="adm__table"><table><thead><tr><th>Код</th><th>Скидка</th><th>Применили</th><th>Срок</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="adm__empty">Здесь ещё ничего не создано</p>'}
		<h3 class="adm__h">Как применяли промокоды</h3>
		${usage ? `<ul class="adm__usage">${usage}</ul>` : '<p class="adm__empty">Промокоды ещё не применяли</p>'}
		${r.hidden ? `<p class="adm__note">Ещё ${r.hidden} ${plural(r.hidden, ['код записан', 'кода записаны', 'кодов записаны'])} в js/data.js отпечатком — сам код там не виден, а применения видны в списке выше.</p>` : ''}`;
};

// ---------- Игроки ----------
let userQuery = '';
const users = async () => {
	const r = await auth.admin(`users?q=${encodeURIComponent(userQuery)}`);
	if (r.error) return failBox(r.error);
	const rows = r.users
		.map(
			(u) => `<tr data-nick="${esc(u.nick)}">
				<td data-l="ID" class="adm__num">${u.num ?? '—'}</td>
				<td data-l="Ник"><b>${esc(u.nick)}</b>${u.admin ? ' <small class="adm__badge">админ</small>' : ''}${u.verified ? '' : ' <small>почта не подтверждена</small>'}</td>
				<td data-l="Почта">${esc(u.email)}</td><td data-l="Баланс" class="adm__num">${rub(u.balance)}</td>
				<td data-l="Покупки" class="adm__num">${u.orders} · ${rub(u.spent)}</td>
				<td data-l="С нами с">${new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
				<td><button class="adm__link" type="button" data-balance>Баланс ±</button></td></tr>`,
		)
		.join('');
	body.innerHTML = `
		<form class="adm__search" id="adm-search"><input name="q" value="${esc(userQuery)}" placeholder="Ник, почта или ID" autocomplete="off"><button class="btn btn--ghost btn--sm" type="submit">Найти</button></form>
		${r.users.length ? `<div class="adm__table"><table><thead><tr><th>ID</th><th>Ник</th><th>Почта</th><th>Баланс</th><th>Покупки</th><th>С нами с</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="adm__empty">Никого не нашлось</p>'}
		<p class="adm__note">Показаны последние 50. «Баланс ±»: начислить (например 50) или списать (−50) — игрок увидит это в истории с твоим комментарием.</p>`;
};

const VIEWS = {sales, products, promos, users};
const show = async (next = tab) => {
	tab = next;
	$$('[data-adm-tab]', dlg).forEach((b) => {
		b.classList.toggle('is-active', b.dataset.admTab === tab);
		b.setAttribute('aria-selected', String(b.dataset.admTab === tab));
	});
	loading();
	await VIEWS[tab]();
};

// ---------- события (вешаются один раз) ----------
let wired = false;
const wire = () => {
	if (wired) return;
	wired = true;
	$('.adm__tabs', dlg).addEventListener('click', (e) => {
		const b = e.target.closest('[data-adm-tab]');
		if (b) show(b.dataset.admTab);
	});
	body.addEventListener('click', async (e) => {
		if (e.target.closest('[data-new-product]')) {
			if ($('form[data-new]', body)) return;
			$('.adm__list', body).insertAdjacentHTML('afterbegin', productForm({kind: 'mod', status: 'ready', tags: ['1.21.11', 'Fabric']}));
			$('form[data-new] input[name="id"]', body).focus();
			return;
		}
		if (e.target.closest('[data-cancel]')) return e.target.closest('form').remove();
		const row = e.target.closest('tr');
		if (e.target.closest('[data-promo-del]') && row) {
			if (!confirm(`Удалить промокод ${row.dataset.code}?`)) return;
			const r = await auth.admin('promo/delete', {code: row.dataset.code});
			if (r.error) return H.notify(errText(r.error));
			return show('promos');
		}
		if (e.target.closest('[data-balance]') && row) {
			const amount = prompt(`Сколько рублей начислить игроку ${row.dataset.nick}? (со знаком минус — списать)`, '50');
			if (amount === null || !amount.trim()) return;
			const note = prompt('Комментарий — игрок увидит его в истории (можно пусто)', 'Начисление от 1DEX1') ?? '';
			const r = await auth.admin('user/balance', {nick: row.dataset.nick, amount: Number(amount.replace(',', '.')), note});
			if (r.error) return H.notify(errText(r.error));
			H.notify(`Баланс ${row.dataset.nick}: ${rub(r.balance)}`);
			return show('users');
		}
	});
	body.addEventListener('change', async (e) => {
		// включить / выключить промокод
		const sw = e.target.closest('[data-promo-active]');
		if (sw) {
			const r0 = await auth.admin('promos');
			const p = r0.promos?.find((x) => x.code === sw.closest('tr').dataset.code);
			if (!p) return;
			const r = await auth.admin('promo', {...p, maxUses: p.maxUses ?? '', active: sw.checked});
			if (r.error) H.notify(errText(r.error));
			return;
		}
		// загрузка файла товара или картинки
		const up = e.target.closest('[data-upload]');
		if (up?.files?.[0]) {
			const form = up.closest('form');
			const file = up.files[0];
			const err = $('.adm__err', form);
			const max = up.dataset.upload === 'file' ? 30 : 5;
			if (file.size > max * 1024 * 1024) return (err.textContent = errText('admin_size'));
			err.textContent = '';
			const label = up.closest('label');
			label.classList.add('is-busy');
			try {
				const r = await auth.admin('upload', {id: form.dataset.id, what: up.dataset.upload, name: file.name, data: await readFile(file)});
				if (r.error) err.textContent = errText(r.error);
				else {
					H.notify(up.dataset.upload === 'file' ? 'Файл загружен' : 'Картинка обновлена');
					await H.reloadShop();
					await show('products');
				}
			} finally {
				label.classList.remove('is-busy');
			}
		}
	});
	body.addEventListener('submit', async (e) => {
		e.preventDefault();
		const form = e.target;
		const err = $('.adm__err', form);
		if (form.id === 'adm-search') {
			userQuery = form.elements.q.value.trim();
			return show('users');
		}
		const btn = $('button[type="submit"]', form);
		btn.disabled = true;
		const r = form.id === 'adm-promo-form' ? await auth.admin('promo', Object.fromEntries(new FormData(form))) : await auth.admin('product', formData(form));
		btn.disabled = false;
		if (r.error) return (err.textContent = errText(r.error));
		H.notify(form.id === 'adm-promo-form' ? 'Промокод сохранён' : 'Товар сохранён');
		if (form.id === 'adm-promo-form') return show('promos');
		await H.reloadShop();
		show('products');
	});
};

export const openAdmin = (helpers) => {
	H = helpers;
	wire();
	H.openDialog(dlg);
	show(tab);
};
