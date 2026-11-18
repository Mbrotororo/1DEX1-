# Внутренний контракт модулей (для разработки)

Проект: продаваемый Telegram Business-бот (@pasturebot) + мини-приложение для настроек + оплата Stars.
Стек: Python 3.11+, aiogram 3.2x (`aiogram>=3.22,<4`), aiohttp (идёт с aiogram), SQLite (stdlib).
Фронт: чистые HTML/CSS/JS без сборки, `telegram-web-app.js`.

## Структура

```
tg-business-bot/
  app/config.py        # ГОТОВО. config.bot_token, webapp_url, host, port, db_path, webapp_dir, is_admin(id, username)
  app/settings.py      # ГОТОВО. DEFAULT_SETTINGS, normalize(), apply_patch(), validate_custom(), SettingsError
  app/db.py            # ГОТОВО. class Database — все таблицы и методы; validate_plans()
  app/commands/base.py # ГОТОВО. @command, Ctx, REGISTRY, resolve(), catalog(), categories(), all_names()
  app/commands/<cat>.py# moderation, love, animations, spam, text, games, fun, utility
  app/business.py      # роутер Business-апдейтов: команды, мут, afk, журнал удалённых/изменённых
  app/payments.py      # тарифы, инвойсы Stars, pre_checkout, successful_payment, возвраты
  app/private.py       # личка с ботом: /start, /help, /buy, /paysupport, /terms, админ-команды
  app/web.py           # aiohttp: статика мини-приложения + JSON API
  app/tasks.py         # фоновые задачи: напоминания, чистка журнала
  app/main.py          # точка входа: создаёт Database, Bot, Dispatcher, web-сервер, задачи
  webapp/index.html, webapp/app.css, webapp/app.js
  tests/               # pytest
```

Команды регистрируются вызовом `app.commands.load_all()` (main.py и тесты вызывают его один раз).
Общие объекты передаются через aiogram workflow_data: `dp["db"] = db`, поэтому хендлеры получают
`db: Database` аргументом (aiogram DI). В web: `app["db"]`, `app["bot"]`.

## Команды (app/commands/*.py)

```python
from .base import command, Ctx

@command("mut", category="moderation", title="Замутить собеседника", usage="mut 10m",
         description="Все новые сообщения собеседника будут удаляться. Время: 30s, 10m, 2h, 1d или без времени — навсегда.",
         aliases=("мут", "mute"))
async def mut(ctx: Ctx) -> None: ...
```

- Имена и алиасы уникальны глобально (иначе ValueError при импорте). Каноническое имя — латиница.
- В чат пишем только через `ctx.send / ctx.edit / ctx.animate / ctx.dice / ctx.delete` (они логируют id).
  Подсказки об ошибках использования — `ctx.hint(...)` (уходят владельцу в личку, собеседник не видит).
- Задержки только через `ctx.sleep()` / параметр `delay` в `ctx.animate` (учитывают скорость из настроек).
- Анимации: 6–20 кадров, задержка 0.5–1.0 c (лимиты Telegram на правки ~1/с на чат). Кадры не повторяют
  подряд одинаковый текст. Последний кадр — осмысленный итог.
- Спам: не больше `ctx.settings["spam_limit"]` сообщений, пауза ≥ 0.35 c между ними (`ctx.sleep(0.35)`).
- Тексты, которые подставляет пользователь, по умолчанию отправляются без parse_mode (html=False).
  Если нужен HTML — экранируй пользовательский текст через `html.escape`.
- `ctx.text_arg()` — текст после команды или текст сообщения, на которое ответили командой.
- Никаких сетевых запросов к внешним API из команд (бот должен работать везде). Только random/time/math.
- Случайность: `random` (без seed). Числа «IQ/совместимость» — детерминированно от пары id + дата,
  чтобы повторный вызов в тот же день давал тот же ответ (выглядит «честнее»).

## Business-поток (app/business.py)

1. `business_connection` → `db.save_connection(...)`, `db.upsert_user(...)`; при первом подключении
   `db.start_trial(user_id)`; владельцу в личку — статус + какие права не выданы
   (нужны `can_reply` и `can_delete_all_messages` из `conn.rights`; старое поле `conn.can_reply` — запасной вариант).
2. `business_message`:
   - Если `msg.sender_business_bot` не пустой — это сообщение отправил бот (наш) от имени владельца:
     только залогировать, НИКОГДА не разбирать как команду (иначе `.spam 5 .spam 5` уйдёт в рекурсию).
   - owner_id = `db.owner_of(conn_id)` (если нет — `bot.get_business_connection`, сохранить).
   - Сообщение от владельца (`msg.from_user.id == owner_id`):
     - залогировать (для `.del`), сбросить afk-кулдауны не нужно;
     - если текст начинается с `settings.prefix`: имя = первое слово после префикса (lower), `raw` = остаток
       после имени с сохранением переносов строк (`.strip()`), `args = raw.split()`.
       Ищем `resolve(имя)`; если команда выключена в `settings.disabled` — игнор (обычное сообщение).
       Если не встроенная — `db.get_custom(owner_id, имя)` → отправить ответ как есть.
       Нет доступа (`db.access(owner_id)["active"]` False и `cmd.premium`) — команду не выполнять,
       владельцу в личку (не чаще раза в 10 мин) «Подписка закончилась» + кнопка открыть мини-приложение.
       Если `settings.delete_command` — удалить сообщение с командой ДО выполнения.
       Каждую команду запускать `asyncio.create_task` (анимации не должны блокировать другие апдейты);
       ошибки ловить и логировать.
   - Сообщение собеседника:
     - если `db.is_muted(owner_id, chat_id)` и доступ активен → удалить, не логировать, return;
     - залогировать (текст/подпись, тип медиа, file_id) — только при активном доступе;
     - afk: если `settings.afk.enabled` и `db.afk_due(...)` → отправить `settings.afk.text`, `db.mark_afk_sent`.
3. `edited_business_message` от собеседника: если `notify_edited` и в журнале был другой текст —
   владельцу в личку «✏️ Имя изменил сообщение: было / стало», обновить журнал.
4. `deleted_business_messages`: `db.pop_logged(owner_id, chat_id, ids)`; сообщения собеседника
   (from_id != owner_id) — владельцу в личку текстом; если `save_media` и есть file_id — переслать медиа
   по file_id (send_photo/send_video/send_voice/send_video_note/send_document/send_audio/send_animation/send_sticker)
   с подписью «🗑 Имя удалил». Свои сообщения владельца не присылать.

## Оплата (app/payments.py)

- Валюта `XTR`, `provider_token=""` (или не передавать), цена — одна позиция `LabeledPrice`.
- payload: `f"sub:{plan_id}:{days}:{stars}:{user_id}"`.
- `create_invoice_link(...)` для мини-приложения (`Telegram.WebApp.openInvoice(link)`), `send_invoice` для /buy.
- `pre_checkout_query`: распарсить payload, сверить, что тариф существует и `total_amount == stars`
  из payload, а `user_id` из payload == `query.from_user.id`; иначе `ok=False` с понятной ошибкой.
- `successful_payment` (обычное message): `db.add_payment(charge_id, ...)` (если False — дубль, ничего не делать),
  `db.extend_subscription(user_id, days)`, сообщение покупателю, уведомление всем админам
  (у кого `started_bot`, по `config.admin_ids` и по username через `db.find_user`).
- Возврат (админ): `bot.refund_star_payment(user_id, charge_id)` → `db.mark_refunded(charge_id)`.
- Звёзды копятся на балансе бота; владелец бота выводит их через BotFather/Fragment.

## Личка с ботом (app/private.py)

- `/start` — `db.upsert_user(..., started_bot=True)`; приветствие + кнопка WebApp «⚙️ Открыть настройки»
  (если `config.webapp_url` задан) + кнопка «⭐ Купить» + инструкция подключения (Premium → Настройки →
  Telegram Business → Чат-боты → @username бота → права «Отвечать» и «Удалять все сообщения»).
- `/help` — команды по категориям (кратко) + кнопка мини-приложения.
- `/buy` — инвойсы тарифов (inline-кнопки по тарифам → send_invoice).
- `/paysupport`, `/terms` — обязательны для продажи за Stars.
- Админ (config.is_admin): `/admin` (статистика), `/grant <id|@username> <дни|forever>`, `/revoke <id|@username>`,
  `/refund <charge_id>`, `/broadcast <текст>`.

## HTTP API (app/web.py)

Авторизация: заголовок `Authorization: tma <initData>`; проверка подписи
`aiogram.utils.web_app.safe_parse_webapp_init_data(token, init_data)` + `auth_date` не старше `config.init_data_ttl`.
Иначе 401 `{"error": "..."}`. Все ответы JSON; ошибки `{"error": "текст для человека"}` с 4xx.
При каждом запросе `db.upsert_user(user.id, user.username, user.first_name)`.

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/api/bootstrap` | — | `Bootstrap` (ниже) |
| PATCH | `/api/settings` | частичные настройки | `{"settings": {...}}` |
| DELETE | `/api/mutes/{chat_id}` | — | `{"mutes": [...]}` |
| PUT | `/api/custom` | `{"trigger","response"}` | `{"custom": [...]}` |
| DELETE | `/api/custom/{trigger}` | — | `{"custom": [...]}` |
| POST | `/api/trial` | — | `{"access": {...}, "trial_available": false}` |
| POST | `/api/invoice` | `{"plan": "month"}` | `{"link": "https://t.me/$..."}` |
| GET | `/api/admin/stats` | — | `{"stats": {...}, "payments": [...], "plans": [...], "trial_days": 1}` |
| PUT | `/api/admin/plans` | `{"plans": [...], "trial_days": 1}` | `{"plans": [...], "trial_days": 1}` |
| POST | `/api/admin/grant` | `{"user": "@name"|"123", "days": 30}` (0 = навсегда, -1 = забрать) | `{"user": {...}, "access": {...}}` |
| POST | `/api/admin/broadcast` | `{"text": "..."}` | `{"sent": n, "failed": m}` |
| POST | `/api/admin/refund` | `{"charge_id": "..."}` | `{"ok": true}` |

Админские — 403, если `not config.is_admin(user.id, user.username)`.

```jsonc
// Bootstrap
{
  "user": {"id": 1, "first_name": "Родион", "username": "RodionDex", "photo_url": "https://..."},
  "access": {"active": true, "kind": "trial|paid|forever|none", "until": 1732000000},
  "trial_available": false,
  "trial_days": 1,
  "connection": {"connected": true, "can_reply": true, "can_delete": true},   // connected=false если нет записи/enabled=0
  "settings": { ...DEFAULT_SETTINGS... },
  "categories": [{"id": "moderation", "title": "Модерация", "subtitle": "..."}],
  "commands": [{"name","aliases","category","title","usage","description","premium","enabled"}],
  "custom": [{"trigger": "адрес", "response": "..."}],
  "mutes": [{"chat_id": 123, "name": "Вася", "until": null, "created_at": 1732000000}],
  "plans": [{"id": "week", "title": "Неделя", "days": 7, "stars": 49}],
  "bot_username": "pasturebot",
  "support_username": "RodionDex",
  "is_admin": true
}
```

Статика: `GET /` → `webapp/index.html`; остальные файлы `webapp/*` по их пути (`/app.js`, `/app.css`).
Заголовки: `Cache-Control: no-cache` для html.

## Мини-приложение (webapp/)

- Нативный вид Telegram: цвета только из `--tg-theme-*` (с запасными значениями), светлая/тёмная тема,
  системный шрифт, сгруппированные списки как в настройках iOS/Telegram, свитчи, haptics,
  `BackButton` для вложенных экранов, `openInvoice` для оплаты.
- Без Telegram (открыто в браузере) — демо-режим на встроенных моковых данных, чтобы можно было посмотреть.
