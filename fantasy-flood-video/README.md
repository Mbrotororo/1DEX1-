# Как я затопил весь мир с FantasyVisual

Ролик-интро для канала **1DEX1**: 16 секунд, 1920×1080, 60 fps.
Сделан на [Remotion](https://www.remotion.dev/) + three.js, весь код на TypeScript.

Всё в кадре — настоящее 3D: остров из блоков, игрок со скином, логотип
FantasyVisual из вокселей, вода и объёмные надписи. Голоса нет, только
оригинальные звуки Minecraft.

## Сценарий

| Время | Что происходит |
| --- | --- |
| 0.0–2.7 | Из блоков собирается небольшой летающий мир: деревья, домик с факелами, свинка. Надпись «ОБЫЧНЫЙ МИР» |
| 2.8–5.0 | С неба падает игрок, над головой ник `1DEX1`, машет рукой |
| 5.2–7.6 | Из лавандовых вокселей собирается логотип FantasyVisual |
| 7.6–8.4 | Логотип заряжается, вспышка, луч бьёт в остров |
| 8.4–10.2 | Вода растекается ромбом, тушит факелы и льётся водопадами. Игрок садится в лодку, свинка всплывает. «ЗАТОПИЛ» |
| 10.2–13.0 | Уровень воды растёт, домик и деревья уходят под воду. «ВЕСЬ МИР» |
| 13.0–16.0 | Финал: куб воды, салют, «с FantasyVisual» |

Сверху весь ролик висит объёмный логотип HolyWorld и `mc.holyworld.ru`.

## Запуск

Нужен Node.js 18 или новее.

```bash
cd fantasy-flood-video
npm install
npm run dev      # предпросмотр в браузере (Remotion Studio)
npm run render   # готовое видео: out/1dex1-flood.mp4
```

Обе команды сначала скачивают звуки Minecraft с официальных серверов Mojang
в `public/sounds/` (скрипт `scripts/fetch-sounds.mjs`). В репозитории самих
звуков нет — это ассеты Mojang.

Рендер по умолчанию программный и работает на любом компьютере. С видеокартой
можно быстрее: `npm run render -- --gl=angle-egl`.

## Что где менять

| Что | Где |
| --- | --- |
| Тайминг сцен, длина ролика, fps | `src/lib/timeline.ts` |
| Тексты и цвета надписей, баннер сервера | `src/scene/Hud.tsx` |
| Скин игрока | заменить `public/skin.png` (64×64, тонкие руки) |
| Логотип сервера | заменить `public/holyworld.png` (с прозрачным фоном) |
| Движение камеры | `src/lib/camera.ts` |
| Остров: деревья, домик, цветы | `src/lib/world.ts` |
| Анимация игрока, лодки и свинки | `src/lib/actors.ts` |
| Свинка, факелы, тени, ракеты салюта | `src/scene/Critters.tsx` |
| Логотип FantasyVisual | `src/scene/FantasyLogo.tsx` |
| Звуки и громкость | `src/Soundtrack.tsx` |

Текстуры блоков и пиксельный шрифт нарисованы кодом
(`src/lib/textures.ts`, `src/lib/font.ts`). Шрифт знает латиницу, цифры и
заглавную кириллицу.

## Второй ролик: «Чат админов» (вертикальный)

Страшилка для Shorts, Reels и TikTok: 60 секунд, 1080×1920, 30 fps. Код лежит в `src/admin-chat/`,
сценарий описан в `content-plan/05-chat-adminov.md`.

```bash
npm run render:admin   # готовое видео: out/1dex1-admin-chat.mp4
```

| Что | Где |
| --- | --- |
| Сцены, субтитры, сообщения чата, ники | `src/admin-chat/script.ts` |
| Картинка сцен | `src/admin-chat/Scenes.tsx` |
| Звуки и субтитры | `src/admin-chat/AdminChat.tsx` |
| Шрифт Pixelify Sans (лицензия OFL) | `public/fonts/` |
| Фоновый гул (сгенерирован в ffmpeg) | `public/admin-chat/drone.ogg` |

## Третий ролик: «Не свети» (вертикальный, не Minecraft)

Страшилка про сторожа подсолнухового поля: 2:29, 1080×1920, 30 fps. Плоская 2D-графика, без Minecraft.
План и текст для озвучки лежат в `content-plan/06-ne-sveti*.md`.

```bash
npm run render:nesveti   # готовое видео: out/ne-sveti.mp4
npm run sfx:nesveti      # пересоздать звуки (нужен python3 + numpy), потом сконвертировать wav в ogg
```

| Что | Где |
| --- | --- |
| Текст, порядок сцен, звуки на фразах | `src/sunflower/story.ts` |
| Сцены | `src/sunflower/scenes.tsx` |
| Графика: небо, подсолнухи, люди, вышка | `src/sunflower/art.tsx` |
| Субтитры, фоновые звуки, камера | `src/sunflower/NeSveti.tsx` |
| Звуки (сгенерированы кодом) | `public/sunflower/`, `scripts/make-sunflower-sfx.py` |

### Часть 2: «Обмен»

Продолжение «Не свети», 1:48. Текст лежит в `src/sunflower/story2.ts`, сцены в `src/sunflower/scenes2.tsx`.
Субтитры, камера и звук общие для обеих частей (`makeEpisode` в `NeSveti.tsx`).

```bash
npm run render:nesveti2   # готовое видео: out/ne-sveti-2.mp4
```
