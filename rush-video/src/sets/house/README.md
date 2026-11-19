# Дом (`src/sets/house`) и реквизит (`src/props`)

Общая декорация для сцен `a-home` (прихожая, лестница, коридор) и `b-room` (комната). Один воксельный мир на
вкладку (`getHouse()`, через `once`), весь реквизит — отдельные блочные модели, управляемые пропсами.
Галерея: `npm run shots -- --scene=house --sheet --step=2 --from=1` (17 планов по 2 с, см. `src/scenes/_house`).

```ts
import {House, HOUSE_ENV, CLOCK, CORK, STAIRS_PATH, CHAIR, CAMS /* ... */} from '../../sets/house';
import {Beanie, Backpack, Headphones, Book, slamOpen, chairSeat, placeholderScreen} from '../../props';
```

## 1. План

Единица — блок, `y` вверх. Блок `(x, y, z)` — куб `[x..x+1]×[y..y+1]×[z..z+1]`.
Первый этаж: пол — блоки `y = −1`, **герой стоит на `y = 0`**, потолок `y = 4`.
Второй этаж: пол — блоки `y = 4`, **герой стоит на `y = 5`**, потолок `y = 9`.

### Первый этаж (вид сверху, x вправо, z вниз)

```
        x: -1  0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
z = -1     ## [ЧАСЫ 1.85][ДОСКА 3.35]##  ######## стена пролёта (картина x 7.2) ####
z =  0     ##  .   .   .   .   .  с1  с2  с3  с4  с5  с6  с7  с8  с9 |→ площадка 2-го этажа
z =  1     ок  .   .   .   .   .  ===== лестница вверх по +x, дорожка по z=1 =====  (y=5)
z =  2     ок  .   .   .   .   .  с   с   с  [сун] с  [полки 10..13 под лестницей]
z =  3     ##  .   .   .   .   .  ┄┄┄┄┄┄┄ перила z≈2.86 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
z =  4     ВШ  ═══════════ дорожка z = 4..5 ══════════════════════════════  ПОЛ
z =  5     ВШ  ═════════════════════ (BACKPACK_LAND 8.6,4.9) ══════════════  ПОЛ
z =  6     ВШ  .   . [коврик] .   .   .   .   .   .   .   .   .  цветок    ПОЛ
z =  7     ##кирпич [ДВЕРЬ x=2] кирпич ## [окно 6..7] ##### [окно 10..11] ######
                     ↓ улица (снег, ели, забор z=17)
```
`ок` — окно на западной стене (z 1..2, y 1..2). `ВШ` — вешалка (крючки z 5.6/5.2/4.8/4.4, y 1.72) и обувница со
свечами под ней. `ПОЛ` — стеллаж x = 14 (z 4..6), на нём фонарь и книги. Подвесные фонари — (2.5, ·, 4.5) и
(9.5, ·, 4.6); над лестницей — фонарь на длинной цепи (9.5, ≈5.6, 1.1).

### Второй этаж (y = 5)

```
        x: 14  15  16  17  18  19 | 20 | 21  22  23  24  25  26  27  28  29  30 | 31
z =  0     ## стена, балка ####### | ## | ######## [ПОСТЕР 25.5] ##################| ##
z =  1     коридор → → → → → → → → [ДВЕРЬ] →   .   .   .   .   .  [полки 27..30, фонарь, свечи]
z =  2     коридор (фонарь 17)     | ## |  .   .   .   .   .   .   .   .   .   .  | ##
z =  3     ## стена (картина 17) ##| ## |  .   .  ┌──── ковёр 23..28 × 3..6 ───┐  [С  | ##
z =  4                                  |  .   .  │                          │   Т  | ОК
z =  5                                  |  .   .  │        (КРЕСЛО 28.35,5)  │   О  | НО
z =  6                                  |  .   .  └──────────────────────────┘   Л] | ##
z =  7                                  | цветок  .   [КРОВАТЬ 24..26]  .   .   .   . | ##
z =  8                                  |  .   .   .   [  плед  ]   .  [ШТАТИВ 27.05,8.2] [полки]
z =  9                                  |[полки] .  .  [изголовье] [тумба] [полки 27..29] [полки]
z = 10     ######################################## южная стена ######################
```
Стол — вдоль восточной стены (x 29.55..30.95, z 2.75..7.25, верх `y = 5.875`). На нём слева направо (по z):
лампа 2.98, подставка с наушниками 3.35, кружка 3.95, микрофон 4.0, монитор 5.0, клавиатура 5.0 (x 29.93),
коврик/мышь 6.2, системный блок 6.78. Окно за столом — x = 31, z 4..6, y 6..7: за ним закат и снежные холмы.

## 2. Опорные точки (`anchors.ts`, чистые данные)

| имя | что |
|---|---|
| `FLOOR_Y = 0`, `UP_Y = 5`, `ROOMS` | высоты этажей и коробки комнат (клетки включительно) |
| `STAIRS`, `stairFootY(x)` | 9 ступеней x 5..13 по 0.5 блока; высота ступни героя на лестнице |
| `STAIRS_PATH` | точки для `makePath` от низа (4, 0, 1.5) по верхам ступеней до площадки (14.6, 5, 1.5) |
| `CORRIDOR_PATH` | коридор (14.6 → 20.5) и вход в комнату (22.2, 5, 1.6) |
| `FRONT_DOOR` | `hinge` (низ оси петли), `yaw`, `angle` (1.75 рад внутрь), `outside`/`threshold`/`inside`, `enterHeading` |
| `DOORMAT`, `ENTER_PATH`, `HERO_STOP` (+`HERO_STOP_HEADING`) | вход: от улицы до места, где герой видит часы и записку |
| `THROW_FROM`, `BACKPACK_LAND`, `RUN_START` | бросок рюкзака вдоль прихожей (+x), место падения, старт бега |
| `CLOCK` | `center` (лицо часов на стене z = 0), `rotationY`, `width`, `height`, `closeCam` |
| `CORK` | `center`, `time` (центр «13:00»), `closeCam` |
| `COAT_HOOKS` | `center`, `rotationY`, `hooks[4]` — кончики крючков |
| `BEANIE_ON_HOOK` | `position`/`rotation` для `<Beanie mode="loose">` на крючке №2 (конец полёта шапки в A6) |
| `SHOE_BENCH`, `WINDOWS` | обувница; окна (`cells`, `center`, `facing`) |
| `BEDROOM_DOOR` | `hinge`, `yaw`, `angle` (π/2 — до стены), `before`/`after` |
| `DESK`, `MONITOR` | стол (`top` = 5.875); монитор: `screenCenter`, `screenWidth` 1.2, `screenHeight` 0.675, `facing` (−x) |
| `KEYBOARD`, `MOUSE`, `MOUSEPAD`, `MICROPHONE`, `DESK_LAMP` (+`bulb`) | вещи на столе |
| `PC` | `position`, `button` — кнопка питания в мире (для пальца/камеры в B2) |
| `HEADPHONE_STAND`, `HEADPHONES_ON_STAND` | подставка; центр «головы» наушников на ней (старт анимации «снял и надел») |
| `CHAIR` | `position`, `rotationY` (π/2 — к столу), `seatHeight` 0.5, `sitPosition`/`sitRotationY` для `sit()` |
| `CHAIR_JUMP_FROM` | откуда прыгать в кресло (B1) |
| `BED`, `POSTER`, `PAINTINGS`, `DECOR` | кровать (модель), постер, картины, мелочи |
| `TRIPOD` | `position`, `rotationY`, `lens` (центр объектива), `look` (лицо сидящего) |
| `TRIPOD_VIEW` | готовая камера «через видоискатель» `{pos, look, fov: 40}` — B7 |
| `BEDROOM_WIDE` | общий план комнаты от двери (B1) |
| `CAMS` | проверенные камеры из галереи: `hallWide`, `frontDoorLow`, `clockClose`, `noteClose`, `hooks`, `floorBag`, `stairsBottom`, `corridorBack`, `bedroomDoor`, `desk`, `pcButton`, `faceAtMonitor` |
| `HANGING_LANTERNS`, `STANDING_LANTERNS`, `CANDLES` | источники огня (из них же запечён свет) |

Герой на лестнице: `const st = path.at(t)` по `makePath(STAIRS_PATH.map((p, i) => ({t: t0 + i * dt, pos: p})), {stride: 1.5})`;
высота уже в точках. Сидя: `<Player position={CHAIR.sitPosition} rotationY={CHAIR.sitRotationY} pose={sit()} />`,
а если кресло крутится — `chairSeat(CHAIR.position, CHAIR.rotationY, spin)` → `{position, rotationY}`.

## 3. Компонент `<House>`

Рисует весь дом: интерьер (свет запечён: `ambient 0.17` + фонари, свечи, окна, лампа), улицу (её красит `env.tint`),
весь реквизит на местах и «живой» свет для героя/реквизита (`CHAR_LIGHTS`: фонари прихожей, лестницы, комнаты и
закат из окна, плюс лампа). Пропсы (все необязательные, кроме `t`, `env`):

| проп | по умолчанию | что |
|---|---|---|
| `t`, `env` | — | время; окружение сцены (`HOUSE_ENV.*`) |
| `area` | `'all'` | `'hall'` — реквизит только первого этажа, `'up'` — только коридора и комнаты (дешевле) |
| `hide` | `[]` | спрятать предметы: `'frontDoor' 'bedroomDoor' 'clock' 'cork' 'hooks' 'shoeBench' 'banister' 'lanterns' 'candles' 'desk' 'monitor' 'pc' 'keyboard' 'mouse' 'headphones' 'lamp' 'mic' 'chair' 'tripod' 'poster' 'decor' 'bed' 'paintings' 'exterior'` |
| `frontDoorOpen` | 0 | 0..1 (1 — на `FRONT_DOOR.angle` внутрь) |
| `daylight` | 1 | полоска света под дверью, пятно на полу, свет в проёме 0..1 |
| `clockText`, `clockColon`, `clockGlow` | `'16:00'`, мигает раз в секунду от `t`, 1 | табло часов |
| `noteCircle` | 1 | красный круг вокруг «13:00» 0..1 (A4: `prog(t, 7.1, 0.6)`) |
| `beanieOnHook` | false | шапка висит на крючке (после A6) |
| `bedroomDoorOpen` | 0 | 0..1; удар о стену — `slamOpen(t, start, impact, bounce?)` |
| `monitorOn`, `monitorScreen`, `monitorLight`, `monitorGlowColor` | 0, null, 1, `#86b0ff` | экран 16:9 (текстура на весь экран), свечение и точечный свет на лицо |
| `pcPower`, `pcRgb`, `pcPress`, `pcHighlight` | 0 | питание (вентиляторы, индикатор), волна RGB снизу вверх 0..1, нажатие кнопки 0..1, ореол кнопки 0..1 |
| `peripheralsRgb`, `typing`, `mouseClick` | = `pcRgb`, 0, 0 | подсветка клавиатуры/мыши/коврика/ленты стола; вспышки клавиш; клик |
| `headphonesOnStand` | true | false — наушники уже на герое |
| `chairOffset`, `chairSpin`, `chairTilt` | 0 | откат кресла (мир, блоки), поворот сиденья, качание (рад) |
| `tripodRec`, `lampOn` | 1, 1 | лампа REC мигает; настольная лампа |
| `charLights`, `windowLight` | true, 1 | живой свет для персонажей; сила заката из окна (у монитора убавлять до ~0.3) |
| `poster` | null | `assets.holyworld` — без неё постера нет |

```tsx
const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const env = HOUSE_ENV.hallway;
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<House t={t} env={env} area="hall" poster={assets.holyworld}
				frontDoorOpen={smooth(prog(t, 1.2, 0.6)) * (1 - smooth(prog(t, 3.0, 0.4)))}
				noteCircle={prog(t, 7.1, 0.6)} beanieOnHook={t > 10.3} />
			<Player skin={assets.skin} position={...} pose={...}
				headSlot={t < 9.7 ? <Beanie snow={0.7} /> : null} backSlot={t < 10.6 ? <Backpack /> : null} />
		</>
	);
};
```

Окружения (`env.ts`, чистые данные): `HOUSE_ENV.hallway` (тёплые фонари, холодный день в окнах), `upstairs`
(только фонари), `bedroom` (закат 16:00 в окне, оранжевый ключевой свет с +x), `desk` (то же, но закат слабее —
для крупных планов у включённого монитора). `tint` в них — для улицы, интерьер всегда `#ffffff`.
Рекомендуемая постобработка — `POST.warmInterior` на общих, `POST.closeUp` на крупных (фокус: `focusDist(cam, точка)`).

## 4. Реквизит (`src/props`)

Все модели — коробки в пикселях (1/16 блока), слиты в одну геометрию с цветами вершин, освещаются светом сцены.
`position` — центр низа (у настенных — центр задней стороны на плоскости стены), «лицо» — локальный `+z`.

| компонент | пропсы (единицы) |
|---|---|
| `FrontDoor` | `position` (низ оси петли), `yaw`, `open` 0..1, `angle` (рад, +внутрь), `daylight` 0..1, `daylightColor`, `t` |
| `BedroomDoor` / `SwingDoor` | `position`, `yaw`, `open` 0..1, `angle`; `SwingDoor` ещё `style: 'front' \| 'bedroom'`, `tint` |
| `slamOpen(t, start, impact, bounce = 0.12, settle = 0.7)` | 0..1: разгон до удара в `impact`, затухающий отскок от стены |
| `WallClock` | `position`, `rotationY`, `text` ('16:00'), `colon` (bool), `glow` 0..1, `scale`. Табло 13×5.6 px, цифры — шрифт ядра светодиодами |
| `CorkNote` | `position`, `rotationY`, `circle` 0..1 (красный маркер вокруг «13:00»), `scale`. Записка: `21 НОЯБРЯ`, `ВАЙП HOLYWORLD`, `13:00` на холсте 1984×1664 |
| `CoatHooks` | `position`, `rotationY`, `coat`, `scarf` (bool). Крючки на локальных x = −0.6/−0.2/0.2/0.6 |
| `ShoeBench`, `Candle` | обувница; свеча: `position`, `t`, `height` (px), `lit` 0..1, `seed`, `color` |
| `Beanie` | `mode: 'worn'` (в `headSlot`, начало — центр головы) \| `'loose'` (начало — центр шапки), `position`, `rotation`, `snow` 0..1, `scale` |
| `Backpack` | `mode: 'worn'` (в `backSlot`: начало — центр спины торса, рюкзак уходит в −z, лямки через плечи) \| `'loose'` (начало — центр рюкзака), `open` 0..1 (клапан), `position`, `rotation`, `scale` |
| `Headphones` | `position` (центр головы; в `headSlot` — без него), `rotation`, `glow` 0..1 (фиолетовые кольца), `scale` |
| `Book` | `position` (центр), `rotation`, `seed` (цвет), `color`, `open` 0..1 (обложка хлопает), `notebook` (тетрадь на пружине). 5×7 px |
| `Desk` | `position`, `rotationY`, `width` 4.5, `depth` 1.4, `t`, `rgb` 0..1 (лента под столешницей). Верх — `DESK_TOP` = 14 px |
| `Monitor` | `position`, `rotationY`, `on` 0..1, `screen` (`THREE.Texture` 16:9 на весь экран `SCREEN_W×SCREEN_H` = 1.2×0.675), `glowColor`, `light` (точечный свет на лицо), `backlight` 0..1 |
| `PcTower` | `position`, `rotationY`, `t`, `power` 0..1, `rgb` 0..1 (волна снизу вверх, тон бежит от `t`), `fans` (по умолчанию = power), `press` 0..1, `highlight` 0..1. Стекло — локальный −x, перед — +z |
| `Keyboard` | `position`, `rotationY`, `t`, `rgb` 0..1, `typing` 0..1 |
| `Mouse`, `Mousepad` | `position`, `rotationY`, `t`, `rgb`; у мыши `click` 0..1 |
| `Microphone`, `DeskLamp`, `HeadphoneStand` | `glow`; `on`; `headphones` (bool), `glow` |
| `GamingChair` | `position` (центр крестовины на полу), `rotationY`, `spin` (сиденье, рад), `tilt`, `recline`, `casters`, `scale`. Верх сиденья — `SEAT_HEIGHT` = 0.5; `chairSeat(pos, rotY, spin)` → куда ставить героя в `sit()` |
| `CameraTripod` | `position`, `rotationY` (объектив — +z), `t`, `rec` 0..1 (лампа мигает 2 раза в с), `pan`, `tiltCam`. `tripodLens(pos, rotY)` — центр объектива |
| `Poster` | `position`, `rotationY`, `texture` (`assets.holyworld`), `width`, `height` |
| `Painting` | зимний пейзаж в раме: `position`, `rotationY`, `width`, `height`, `seed` |
| `Banister` | перила лестницы: `x0`, `y0`, `z`, `steps`, `rise`, `height` |
| `Bed` | `position` (центр низа, изголовье в +z), `rotationY`, `width` 2, `length` 2.9, `turned` 0..1. Верх матраса — `BED_TOP` |
| `BookStack`, `Mug`, `Plant` | мелочи: `position`, `rotationY`, `count`/`seed`; `color`; `t` |
| `placeholderScreen()` | заглушка экрана 16:9 (обои и три значка без подписей) |

Летящие предметы (A6, A7) — тот же компонент в режиме `'loose'` со своей траекторией: шапка `<Beanie mode="loose"
position={p} rotation={[0, t * 9, 0.3]} />`, конец — `BEANIE_ON_HOOK`; рюкзак `<Backpack mode="loose" open={...} />`
летит к `BACKPACK_LAND` (лежит плашмя: `rotation={[-1.45, yaw, 0]}`, `position=[x, 0.27, z]`); книги `<Book open={...} />`.

## 5. Производительность

1920×1080, одна вкладка, CPU делят несколько агентов (нагрузка ~3–4), поэтому разброс ±20%:

| кадр | без постобработки | с постобработкой (`POST.*`, чужой модуль) |
|---|---|---|
| прихожая общим планом (весь первый этаж + улица) | ~430 мс | ~580–650 мс |
| комната + герой в кресле + весь реквизит включён | ~420–440 мс | ~580–830 мс |

Геометрия: интерьер 3.1 тыс. граней (25 мс постройки), улица 40 тыс. граней (185 мс). Первый кадр вкладки
(постройка мира, текстуры, шейдеры) — ~3 с. Реквизит — десятки маленьких мешей, по стоимости не заметен.
