# CORE_API — справочник ядра ролика «ВАЙП 21.11»

Этот файл — всё, что нужно автору сцены: что есть в ядре (`src/core/`), как этим пользоваться,
как проверять свою работу. Сюжет, факты и тайминг — в `SPEC.md`.

Всё импортируется из одного места:

```ts
import {VoxelWorld, VoxelMesh, Player, Caption, ENV /* ... */} from '../../core';
```

Исключение — `sfx.ts` сцены: он чистый и импортирует только `'../../core/sfx'` и `./beats`.

Содержание: [1. Быстрый старт](#1-быстрый-старт) · [2. Соглашения](#2-соглашения) ·
[3. Как написать сцену](#3-как-написать-сцену) · [4. Время и анимация](#4-время-и-анимация) ·
[5. Камера](#5-камера) · [6. Окружение](#6-окружение) · [7. Воксели](#7-воксели) ·
[8. Волна по полосам](#8-волна-по-полосам-сборка-и-распад-мира) · [9. Персонажи](#9-персонажи) ·
[10. Реквизит](#10-реквизит) · [11. Предметы](#11-предметы) · [12. Частицы и эффекты](#12-частицы-и-эффекты) ·
[13. Надписи и интерфейс](#13-надписи-и-интерфейс) · [14. Звук](#14-звук) · [15. Инструменты](#15-инструменты) ·
[16. Производительность](#16-производительность) · [17. Грабли](#17-грабли)

---

## 1. Быстрый старт

```bash
npm install
npm run typecheck                                   # tsc: в своих файлах ошибок быть не должно
npm run shots -- --scene=s3-wipe 0.5 2 7.25         # кадры сцены (локальное время) -> out/shots/s3-wipe/*.png, 960x540
npm run shots -- --scene=s3-wipe --sheet            # контактный лист всей сцены (кадр в секунду)
npm run shots -- --scene=s3-wipe --bench 12         # замер: мс на кадр в 1920x1080
npm run preview -- --scene=s3-wipe                  # mp4 960x540, 30 к/с, со звуком -> out/preview/s3-wipe.mp4
npm run sounds -- --find breeze                     # поиск имён звуков Minecraft
npm run mix -- --scene=s3-wipe                      # звук одной сцены -> out/audio/s3-wipe.wav
npm run audio                                       # скачать звуки + свести весь ролик -> public/audio/soundtrack.wav
npm run dev                                         # Remotion Studio (все композиции)
npm run render                                      # финал: out/wipe-21-11.mp4
```

Готовые образцы (их можно запускать теми же командами, `--scene=<id>`):

| id | папка | что это |
|---|---|---|
| `example` | `src/scenes/_example` | минимальная полная сцена — скопируй и переделай |
| `demo` | `src/scenes/_demo` | стенд ядра: сборка/распад мира, подземелье, все эффекты и интерфейс |
| `envs` | `src/scenes/_envs` | галерея окружений `ENV.*` (по секунде на пресет) |
| `poses` | `src/scenes/_poses` | галерея поз + бег по маршруту с камерой-преследователем |
| `blocks` | `src/scenes/_blocks` | витрина всех блоков с подписями (`--full 0.5 1.5 2.5`) |
| `glyphs` | `src/scenes/_glyphs` | все знаки шрифта объёмным и плоским текстом |
| `bench` | `src/scenes/_bench` | замер производительности (рельеф 160×160) |

---

## 2. Соглашения

**Оси и единицы.** Единица длины — блок. `y` — вверх. Блок с целыми координатами `(x, y, z)` занимает куб
`[x..x+1] × [y..y+1] × [z..z+1]`. Центр блока — `(x+0.5, y+0.5, z+0.5)`. Если верхний блок колонки стоит на
высоте `y = 4`, персонаж стоит на `y = 5` (`world.groundAt(x, z)` вернёт 5).

**Время.** Секунды. `t` в сцене — локальное время от 0 до длительности сцены. Кадр — чистая функция `t`:
никаких `Math.random()`, `Date`, `useFrame`, `useState` для анимации. Случайность — из `hash3`/`mulberry32`.
Кадры рендерятся в произвольном порядке в нескольких вкладках.

**Углы.** Радианы (кроме ключей `orbitCam`: там `az`/`el` в градусах — так удобнее писать).

**Персонаж.** `position` — точка между ступнями. Рост 1.875 блока. При `rotationY = 0` смотрит в `+z`.
`rotationY = cam.azimuth` — смотрит прямо в камеру. Левая сторона персонажа — `+x` (при `rotationY = 0`).

**Камера.** `cam.azimuth` — угол, под которым камера стоит относительно цели: камера находится от цели в
направлении `(sin az, ·, cos az)`.

**Цвета.** Строки `'#rrggbb'` — как в CSS (sRGB). `tint` — множитель цвета («как на глаз»: белый блок с
`tint="#808080"` станет серым `#808080`).

**Экранные координаты (DOM-интерфейс, Overlay).** Пиксели кадра 1920×1080, `(0, 0)` — левый верхний угол,
`x` вправо, `y` вниз. Безопасная зона — отступ 80 px от краёв (`SAFE`). Левый верхний угол занят значком
сервера в сценах s2–s8: прямоугольник `BADGE_AREA = {x: 36, y: 26, width: 470, height: 84}` — туда надписи не ставить.

**Экранные координаты 3D-слоя (`HudLayer`).** Тоже пиксели кадра, но `(0, 0)` — центр кадра, `y` вверх.

**Тяжёлое строится один раз.** Миры и геометрии — в `once(() => ...)` или `useMemo`, не на верхнем уровне
модуля. На верхнем уровне модуля — только лёгкие чистые данные (ключи камеры, `makePath`, `defineBlock`).

---

## 3. Как написать сцену

Сцена живёт в `src/scenes/<id>/` и состоит из трёх файлов. Ниже — полный рабочий пример (`src/scenes/_example`).

### beats.ts — тайминг (чистые данные)

```ts
// Все моменты времени сцены, секунды. Без React и three: файл читают и картинка, и звук.
export const BEATS = {
	walkFrom: 0.3,
	walkTo: 2.6,
	caption: 1.0,
	wave: 2.8,
	snow: 3.2,
	end: 5,
};
```

### sfx.ts — звуки (чистые данные)

```ts
import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

const s = sfx();
s.steps(BEATS.walkFrom, BEATS.walkTo, 'snow', 0.42, 0.4);
s.add(BEATS.caption, 'random/pop', 0.7, {rate: 1.2});
s.add(BEATS.wave, 'random/orb', 0.5);
s.loop(BEATS.snow, BEATS.end, 'ambient/weather/rain1', 2, 0.15, {lowpass: 1500});

export const events = s.events;
```

### index.tsx — камера, мир, интерфейс

```tsx
import React from 'react';
import {
	B, BlobShadow, Caption, ENV, Environment, Fade, NameTag, Player, Snowfall, VoxelMesh, VoxelWorld,
	buildVoxelMeshes, envTrack, fadeFrom, headTop, idle, makePath, mixPose, once, orbitCam, prog, smooth,
	spruceTree, strata, walk, wave, type SceneDef, type SceneProps, type Vec3,
} from '../../core';
import {BEATS} from './beats';

// 1. Мир строится ОДИН раз при первом обращении (а не при загрузке модуля)
const getSet = once(() => {
	const world = new VoxelWorld([-16, -3, -16], [15, 12, 15]);
	world.heightmap(() => 0, {block: strata(B.snowyGrass)});
	spruceTree(world, -5, 1, -6, {snowy: true});
	return {world, meshes: buildVoxelMeshes(world, {cull: {bottom: true}})};
});

// 2. Маршрут героя: положение — сплайн по ключам, фаза шагов — из пройденного пути
const path = makePath([
	{t: BEATS.walkFrom, pos: [-6, 1, 3]},
	{t: BEATS.walkTo, pos: [0, 1, 0]},
]);

// 3. Камера — чистая функция времени
const camera = orbitCam([
	{t: 0, az: 25, el: 14, dist: 13, target: [-2, 2.2, 1]},
	{t: BEATS.end, az: 50, el: 10, dist: 8, target: [0, 2.4, 0]},
]);

const World: React.FC<SceneProps> = ({t, cam, assets}) => {
	const set = getSet();
	const env = envTrack(t, [[BEATS.snow, ENV.frostyMorning], [BEATS.end, ENV.blizzard]]);
	const st = path.at(t);
	const pos: Vec3 = st.position;
	const waving = smooth(prog(t, BEATS.wave, 0.2));
	// идёт -> стоит -> машет; после остановки поворачивается к камере
	const pose = mixPose(mixPose(idle(t), walk(st.phase), st.moving), wave(t), waving);
	const yaw = st.heading + (cam.azimuth - st.heading) * smooth(prog(t, BEATS.walkTo, 0.4));
	return (
		<>
			<Environment env={env} cam={cam} t={t} />
			<VoxelMesh meshes={set.meshes} tint={env.tint} snowCover={prog(t, BEATS.snow, 1.5)} />
			<BlobShadow x={pos[0]} z={pos[2]} y={pos[1]} />
			<Player skin={assets.skin} position={pos} rotationY={yaw} pose={pose} />
			<NameTag text="1DEX1" position={headTop(pos)} cam={cam} />
			<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} density={prog(t, BEATS.snow, 1)} />
		</>
	);
};

const Overlay: React.FC<SceneProps> = ({t}) => (
	<>
		<Caption t={t} from={BEATS.caption} to={BEATS.end - 0.5} x={960} y={900} size={80} color="#ffffff" color2="#9fd0ff">
			ПРИМЕР СЦЕНЫ
		</Caption>
		<Fade color="#ffffff" opacity={fadeFrom(t, 0.5)} />
	</>
);

export const scene: SceneDef = {id: 'example', duration: BEATS.end, camera, World, Overlay};
```

### Правила каркаса

```ts
type SceneProps = {t: number; cam: CameraState; assets: Assets; duration: number};
type Assets = {skin: Skin; holyworld: THREE.Texture; holyworldUrl: string};
type SceneDef = {
	id: string;                              // как в timeline.ts: 's3-wipe'
	duration?: number;                       // ТОЛЬКО для сцен вне таймлайна; у сцен ролика длительность берётся из timeline.ts
	camera: (t: number) => CameraState;      // чистая функция, включает fov
	World: React.FC<SceneProps>;             // 3D (рисуется внутри общего ThreeCanvas)
	Overlay?: React.FC<SceneProps>;          // DOM поверх 3D, координаты 1920x1080
};
```

- `index.tsx` экспортирует `scene`, `sfx.ts` экспортирует `events`, тайминг лежит в `beats.ts`. У сцен ролика поле
  `duration` не задаётся.
- `World` перемонтируется при смене сцены. То, что должно пережить смену сцены (общий мир для s2 и s3),
  строится через `once()` в общем модуле (`src/sets/<name>/`) — геттер вернёт тот же объект обеим сценам.
- Камеру ставит ядро по `scene.camera(t)`; в `World`/`Overlay` она приходит как `cam`.
- Значок сервера и звуковую дорожку добавляет ядро. Сцена их не рисует.
- Проход цвета между сценами (белая вспышка, уход в чёрное) делает `Fade` в `Overlay` — см. таблицу стыков в `SPEC.md`.
- Чего-то нет в ядре — сделай у себя в папке и запиши в `NOTES/<своя-папка>.md`. Ядро не править.

`once(make)` — «построить один раз»: `const getWorld = once(() => build()); ... const w = getWorld();`

---

## 4. Время и анимация

`src/timeline.ts` (чистый): `FPS`, `WIDTH`, `HEIGHT`, `SCENES`, `DURATION_S`, `sceneStart(id)`, `sceneDuration(id)`, `sceneAt(tGlobal)`.
Импорт: `import {sceneStart} from '../../timeline'`. Сцене он обычно не нужен: время приходит локальное.

Помощники (`core/anim`):

| функция | что делает |
|---|---|
| `clamp(v, a, b)`, `clamp01(v)`, `lerp(a, b, k)`, `invLerp(a, b, v)`, `remap(v, a, b, c, d)` | арифметика |
| `prog(t, start, dur)` | прогресс 0..1 с момента `start` за `dur` секунд |
| `pulse(t, start, end, fadeIn?, fadeOut?)` | «окно»: 0 → 1 → 0 |
| `impulse(t, at, rate?)` | 1 в момент `at`, затем `exp(-rate·dt)` — удар, вспышка, тряска |
| `spring(t, at, freq?, damp?)` | затухающее колебание после `at` |
| `smooth`, `smoother`, `linear`, `easeInQuad`, `easeOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeOutExpo`, `easeInBack`, `easeOutBack(x, overshoot?)`, `easeOutElastic`, `easeOutBounce` | кривые 0..1 → 0..1 |
| `track(t, [[time, value, ease?], ...])` | кусочная анимация по ключам (ease — у отрезка, который заканчивается в ключе) |
| `spline(t, [[time, value], ...])` | плавный монотонный сплайн (без перелётов) |
| `angleDelta(a, b)`, `lerpAngle(a, b, k)`, `DEG` | углы |
| `v3lerp`, `v3add`, `v3sub`, `v3scale`, `v3len`, `v3dist` | векторы `Vec3 = [x, y, z]` |
| `hexToRgb`, `rgbToHex`, `mixHex(a, b, k)` | цвета |

Случайность (`core/rng`): `hash3(x, y, z, seed?)` → [0, 1) по целым координатам; `hash1(i, seed?)`;
`hashRange(a, b, i, seed?)`; `mulberry32(seed)` → генератор; `noise1(t, seed?)` → плавный шум −1..1 от времени
(тряска, мерцание); `noise2(x, y, seed?)`, `noise3`, `fbm2(x, y, octaves?, seed?)` → 0..1 (рельеф, пятна).

---

## 5. Камера

```ts
type CameraState = {position: THREE.Vector3; quaternion: THREE.Quaternion; forward: THREE.Vector3; azimuth: number; fov: number};
```

| функция | что делает |
|---|---|
| `lookCam(pos, target, fov = 38, roll = 0)` | камера из точки, смотрит на точку |
| `orbitCam(keys)` → `(t) => CameraState` | облёт цели по ключам `{t, az, el, dist, target, shift?, fov?, roll?}`; `az`, `el` — градусы; `shift` — сдвиг кадра вправо в блоках (цель уходит влево, справа место под надпись) |
| `flyCam(keys)` | свободный пролёт по ключам `{t, pos, look, fov?, roll?}` |
| `shots([{from, cam: (tShot, t) => CameraState}, ...])` | склейка планов с резкими переходами; `tShot` — время от начала плана |
| `shotAt(list, t)` → `{index, tShot}` | какой план идёт сейчас (если от плана зависит не только камера) |
| `mixCam(a, b, k)` | плавный переход между двумя камерами |
| `shake(cam, amount, t, seed?, freq?)` | тряска; `amount` — блоки (0.05 лёгкая, 0.3 удар): `shake(cam, 0.3 * impulse(t, BEATS.hit), t)` |
| `followCam(target, {offset, lookOffset, lag, heading, fov})` | камера летит за целью с запаздыванием; `target(t)` → `Vec3`; `offset = [вправо, вверх, назад]`; `heading(t)` — направление цели (тогда камера держится «за спиной») |
| `projectToScreen(cam, worldPos)` → `{x, y, behind, depth, pxPerBlock}` | экранные пиксели мировой точки (для DOM-подписей) |
| `screenToWorld(cam, sx, sy, depth)` → `THREE.Vector3` | мировая точка, видимая в месте кадра `sx, sy ∈ −1..1` на глубине `depth` (ставить салюты «в кадр») |

Ключи — плавный монотонный сплайн по каждому параметру: камера не «перелетает» ключи, но между соседними
ключами движение идёт всё время — чтобы камера постояла, поставь два ключа с одинаковыми значениями.

```ts
const wide = orbitCam([
	{t: 0, az: 30, el: 28, dist: 96, target: [0, 2, 0]},
	{t: 4, az: 64, el: 12, dist: 17, target: [-1, 2.2, 0], fov: 34},
]);
const close = flyCam([
	{t: 0, pos: [0.5, 2.9, -5.7], look: [0.5, 1.5, 0.5], fov: 64},
	{t: 4, pos: [-3.4, 3.5, -5.6], look: [0.8, 1.3, 1.2], fov: 58},
]);
const camera = shots([
	{from: 0, cam: (ts) => wide(ts)},
	{from: 4, cam: (ts, t) => shake(close(ts), impulse(t, 5.2, 5) * 0.25, t)},
]);
```

Камера-преследователь (пример в `_poses`):

```ts
const chase = followCam((t) => runnerAt(t), {offset: [2.5, 2.4, 7], lookOffset: [0, 1.1, 2], lag: 0.3, heading: (t) => path.at(t).heading, fov: 60});
```

---

## 6. Окружение

`EnvState` — небо, туман, оттенок мира и свет для персонажей:

```ts
type EnvState = {
	skyTop: string; skyHorizon: string;                       // градиент неба
	fogColor: string; fogNear: number; fogFar: number;        // линейный туман, блоки
	tint: string;                                             // множитель цвета блоков — передавай в VoxelMesh/InstancedBlocks
	lightColor: string; ambient: number; sun: number; fill: number;   // свет для персонажей и предметов
	sunDir: Vec3;                                             // направление НА солнце/луну
	sunDisc: number; moonDisc: number; stars: number; clouds: number; cloudColor: string;   // 0..1
};
```

Пресеты: `ENV.day`, `ENV.overcast`, `ENV.blizzard`, `ENV.whiteout`, `ENV.frostyMorning`, `ENV.sunset`, `ENV.night`,
`ENV.dungeon`, `ENV.voidBlack`. Посмотреть все: `npm run shots -- --scene=envs --sheet`.

- `mixEnv(a, b, k)` — смешать два окружения.
- `envTrack(t, [[t0, env0], [t1, env1], ...])` — окружение по ключам времени.
- Свой вариант — обычный объект: `{...ENV.night, fogFar: 120, stars: 0.4}`.
- `<Environment env={env} cam={cam} t={t} cloudHeight={96} cloudSpeed={1.2} noLights={false} />` — рисует небо, солнце/луну,
  звёзды, облака, ставит туман сцены и три источника света (рассеянный, «солнце», заполняющий от камеры).
  **Одна штука на сцену**, первой строкой в `World`.

```tsx
const env = envTrack(t, [[0, ENV.day], [2, ENV.overcast], [6, ENV.blizzard], [18, ENV.whiteout]]);
<Environment env={env} cam={cam} t={t} />
<VoxelMesh meshes={meshes} tint={env.tint} />
```

Блоки мира динамически не освещаются: их вид задают `tint`, туман и запечённый свет (см. `buildVoxelMeshes`).
Персонажи, свинка, предметы и реквизит освещаются светом из `Environment`. В `ENV.dungeon` и `ENV.night` мир тёмный
только если запечь его с малым `ambient` (иначе блоки останутся «дневными» — см. ниже).

---

## 7. Воксели

### Блоки

`B.<имя>` — номер блока (0 — воздух, `B.air`). Стандартный набор:

- земля: `grass`, `dirt`, `snowyGrass`, `snow`, `sand`, `gravel`, `path`, `farmland`
- камень: `stone`, `cobble`, `coalOre`, `ironOre`, `goldOre`, `diamondOre`, `redstoneOre`, `bedrock`, `obsidian`,
  `deepslate`, `deepslateBricks`, `tuff`, `tuffBricks`, `chiseledTuff`, `stoneBricks`, `mossyStoneBricks`, `crackedStoneBricks`
- лёд и вода: `ice`, `packedIce`, `blueIce` (непрозрачные), `water` (полупрозрачная)
- деревья: `oakLog`, `oakLogX`, `oakLogZ`, `oakLeaves`, `oakPlanks`, `darkPlanks`, `spruceLog`, `spruceLogX`, `spruceLogZ`,
  `spruceLeaves`, `snowySpruceLeaves`, `sprucePlanks`, `birchLog`, `birchLeaves`, `cherryLog`, `cherryLeaves`
- постройки: `glass`, `window`, `windowLit` (светится), `doorTop`, `doorBottom`, `chest` (лицом в +z), `chestNz`, `chestPx`,
  `chestNx`, `bookshelf`, `craftingTable`, `hay`
- медь (4 стадии): `copper`, `exposedCopper`, `weatheredCopper`, `oxidizedCopper`; резная плитка `cutCopper`,
  `exposedCutCopper`, `weatheredCutCopper`, `oxidizedCutCopper`; `chiseledCopper`, `exposedChiseledCopper`,
  `weatheredChiseledCopper`, `oxidizedChiseledCopper`; решётки (с дырками) `copperGrate`, `exposedCopperGrate`,
  `weatheredCopperGrate`, `oxidizedCopperGrate`; лампы `copperBulb`, `copperBulbLit`, `oxidizedCopperBulb`,
  `oxidizedCopperBulbLit` (горящие светятся); `ironBars` (тонкая решётка, тянется к соседям)
- ценное и свет: `goldBlock`, `diamondBlock`, `ironBlock`, `glowstone` (светится), `lanternBlock` (маленький светящийся кубик)
- растения (крест из двух плоскостей): `poppy`, `dandelion`, `cornflower`, `pinkFlower`, `tallGrass`, `deadBush`, `wheat`
- полублоки и мелочь: `snowLayer` (2 px), `snowLayer2` (6 px), `stoneBrickSlab`, `stoneBrickSlabTop`, `cobbleSlab`, `oakSlab`,
  `oakSlabTop`, `darkSlab`, `darkSlabTop`, `spruceSlab`, `spruceSlabTop`, `cutCopperSlab`, `oxidizedCutCopperSlab`,
  `tuffBrickSlab`, `deepslateBrickSlab`, `oakFence`, `spruceFence`, `stoneBrickWall`, `ironPost`, `redCarpet`, `whiteCarpet`
- шерсть: `whiteWool`, `redWool`, `greenWool`, `blueWool`, `yellowWool`, `orangeWool`, `purpleWool`, `pinkWool`, `cyanWool`,
  `blackWool`, `grayWool`, `lightBlueWool`

Факел и фонарь — модели (`Torch`, `Lantern`), не блоки. Все блоки на одной картинке: `npm run shots -- --scene=blocks --full 0.5 1.5 2.5`.

**Свой блок / текстура** (на верхнем уровне своего модуля, до первого кадра):

```ts
import {defineBlock, defineTile} from '../../core';

// painter(x, y) -> [r, g, b] или [r, g, b, a], 0..255; y = 0 — верх тайла 16x16
defineTile('flag_stripes', (x, y) => (y % 4 < 2 ? [200, 30, 30] : [240, 240, 240]));
export const FLAG = defineBlock('flagStripes', {all: 'flag_stripes', snow: false});
// грани: all | top/bottom/side | px/nx/pz/nz; layer: 'opaque' | 'cutout' | 'translucent';
// shape: 'cube' | 'cross' | 'pane' | 'box' (+ box: [x0, y0, z0, x1, y1, z1] в долях клетки); emissive: 0..1
```

Имена тайлов и блоков должны быть уникальными (префикс своей сцены избавит от конфликтов). Всего блоков — не больше 254.
Имена стандартных тайлов — в `src/core/voxel/tiles.ts` (`'stone'`, `'oak_planks'`, `'red_wool'` ...).

### VoxelWorld — мир как плотный массив

```ts
const w = new VoxelWorld([-80, -8, -80], [79, 40, 79]);   // границы ВКЛЮЧИТЕЛЬНО: min, max
```

| метод | что делает |
|---|---|
| `set(x, y, z, id)`, `setIfAir(...)`, `get(x, y, z)` | один блок; за границами мира `set` молча игнорируется, `get` даёт 0 |
| `fill(x0, y0, z0, x1, y1, z1, id)` | сплошной параллелепипед (границы включительно); `id = 0` — вырезать |
| `hollowBox(...)`, `walls(x0, y0, z0, x1, y1, z1, id)` | коробка из 6 стенок / только 4 стены |
| `replace(x0..z1, from, to)` | заменить блоки в области |
| `sphere(cx, cy, cz, r \| [rx, ry, rz], id, {hollow?, keep?})` | шар/эллипсоид |
| `cylinder(cx, y0, y1, cz, r, id, {hollow?})` | вертикальный цилиндр (башня) |
| `heightmap(height, {block?, depth?, x0?, x1?, z0?, z1?})` | рельеф: `height(x, z)` — y верхнего блока; `block(x, y, z, top)` — что ставить (по умолчанию трава/земля/камень; `strata(B.snowyGrass)` — свой верх); `depth` — на сколько блоков вниз заполнять (по умолчанию до дна мира) |
| `topAt(x, z)` → `number \| null`, `groundAt(x, z, fallback = 0)` | верхний твёрдый блок колонки / высота, на которой стоит персонаж |
| `isSolid(x, y, z)`, `inside(x, y, z)`, `count()`, `forEach(cb)`, `collect(filter?)` → `BlockInst[]` | запросы |
| `paste(other, dx, dy, dz)`, `clone()` | копирование |

Все методы-строители возвращают `this` (можно цепочкой). `BlockInst = {x, y, z, id, band?, shade?}`.

Готовые строители (пишут в мир; `x, y, z` — нижний блок ствола):
`oakTree(w, x, y, z, {height?, seed?})`, `birchTree(...)`, `spruceTree(w, x, y, z, {height?, snowy?})`,
`cherryTree(...)`, `newYearTree(w, x, y, z, {height = 12, radius = 4, snowy = true})` → `{lights, star, top}`
(огоньки и звезду рисует `<TreeLights lights={tree.lights} star={tree.star} t={t} />`).

```ts
const getSet = once(() => {
	const world = new VoxelWorld([-80, -6, -80], [79, 40, 79]);
	world.heightmap((x, z) => Math.round(fbm2(x * 0.03, z * 0.03, 4, 3) * 14 - 4), {depth: 4});
	for (let i = 0; i < 300; i++) {
		const x = Math.round(hashRange(-76, 76, i, 1));
		const z = Math.round(hashRange(-76, 76, i, 2));
		const top = world.topAt(x, z);
		if (top !== null && world.get(x, top, z) === B.grass) spruceTree(world, x, top + 1, z, {snowy: true});
	}
	return {world, meshes: buildVoxelMeshes(world, {cull: {bottom: true}})};
});
```

### buildVoxelMeshes — слитая геометрия

```ts
const meshes = buildVoxelMeshes(world, {
	bands,                         // полосы для волны (см. раздел 8)
	ambient: 1,                    // общий свет: 1 — день; подземелье 0.15..0.35; ночь 0.4
	ambientColor: '#ffffff',       // его оттенок (ночью — синеватый '#8d9cff')
	lights: [{pos: [2.5, 3.5, 4.5], radius: 9, color: '#ffa858', intensity: 1.1}],   // запечённые факелы/лампы
	shadows: true,                 // свет не проходит сквозь стены
	ao: 1,                         // сила теней в углах 0..1
	cull: {bottom: true, sides: false, top: false},   // не строить грани на границах мира, которых не видно
});
// meshes.stats = {quads, blocks, ms}
```

- Невидимые грани отбрасываются; затенение граней запечено (верх 1.0, бока 0.36/0.3/0.62/0.5, низ 0.22 — линейные
  значения), тени в углах (AO) — в вершинах.
- Точечный свет запекается в вершины: плавное затухание до `radius`, грани «спиной» к источнику не освещаются,
  стены дают блочные тени. Светящиеся блоки (`glowstone`, `*BulbLit`, `windowLit`) сами не темнеют, но соседей
  не освещают — поставь рядом `lights`. `collectLights(world, (id) => id === B.glowstone ? {radius: 8} : null)`
  соберёт источники из блоков мира.
- Результат неизменяем. Поменялся мир — строй заново (и только в `once`/`useMemo`).
- Мир можно резать на несколько `VoxelWorld` и рисовать несколькими `VoxelMesh` (например, статичная часть и та,
  что двигается целиком через `position`).

### VoxelMesh — показать мир

```tsx
<VoxelMesh
	meshes={meshes}
	tint={env.tint}            // оттенок (день/ночь)
	snowCover={0.6}            // 0..1: верхние грани постепенно засыпает снегом (у каждого блока свой порог), у боков — снежная кромка
	snowColor="#edf5ff"
	bands={[0, 12]}            // показать только полосы 0..11 (раздел 8)
	whiten={0.3} whitenColor="#ffffff"   // подмешать цвет ко всему мешу («всё белеет»)
	waterOpacity={1}
	position={[0, 0, 0]} rotation={[0, 0, 0]} scale={1} visible
/>
```

`snowCover` не действует на лёд, стекло, воду, шерсть, светящиеся блоки и растения.

### InstancedBlocks — блоки, которые двигаются по отдельности

```tsx
<InstancedBlocks
	blocks={list}                       // BlockInst[]: {x, y, z, id}; список может меняться между кадрами
	tint={env.tint}
	mixColor="#9fd4ff"                  // к этому цвету блок уходит при out.mix -> 1
	animate={(b, i, out) => {
		// out перед вызовом сброшен: x = y = z = rx = ry = rz = 0, s = 1, mix = 0, shade = 1
		const k = easeOutBack(prog(t, 5 + Math.hypot(b.x, b.z) * 0.08, 0.25));
		out.s = k;                        // масштаб; 0 — блок не рисуется
		out.y = -(1 - k) * 0.5;           // смещение от своей клетки, блоки
		out.ry = (1 - k) * 2;             // поворот вокруг центра блока
		out.mix = 0.25;                   // 0 — родная текстура, 1 — сплошной mixColor (снег, лёд)
	}}
/>
```

Рисуются только кубы (у растений и полублоков будет куб с их текстурой). Соседние блоки друг от друга грани не
прячут, запечённого света и AO нет — поэтому это инструмент для того, что **сейчас** движется, а не для целого мира.
`deps` — необязательный ключ: если он не изменился с прошлого кадра, матрицы не пересчитываются (для неподвижных групп).

### Вода, облака

- Блок `B.water` — полупрозрачный слой воксельного мира (участвует в полосах).
- `<WaterSurface t={t} x0={4} z0={-2} x1={26} z1={20} y={-0.12} tint={env.tint} opacity={0.72} />` — плоскость с анимированной
  рябью (15 кадров/с). Клади на уровень воды поверх чаши в рельефе: суша выше уровня сама закроет плоскость.
  `y` — обычно «верх блока минус 0.12». `color` — свой цвет вместо синего.
- Облака рисует `Environment` (`env.clouds`, `cloudHeight`, `cloudSpeed`).

---

## 8. Волна по полосам: сборка и распад мира

Главный эффект ролика: мир рассыпается в снежинки с краёв к центру (s3) и собирается из снега (s4).

Идея: каждому блоку — целый номер **полосы** (0 — центр, чем дальше, тем больше). Полосы «позади» волны рисует
`VoxelMesh` одной геометрией. Полосы, по которым волна идёт прямо сейчас, рисуются `InstancedBlocks` — каждый блок со
своей анимацией. Грани между соседними полосами построены заранее, поэтому скрытие полосы никогда не открывает дыр.

```ts
// 1. Один раз: мир, полосы, геометрия, блоки по полосам
const getSet = once(() => {
	const world = buildMyWorld();
	// номер полосы = расстояние от центра (с шумом, чтобы край был неровным) / ширина полосы
	const bands = makeBands(world, (x, _y, z) => (Math.hypot(x, z) + (fbm2(x * 0.15, z * 0.15, 2, 21) - 0.5) * 7) / 2);
	const meshes = buildVoxelMeshes(world, {bands, cull: {bottom: true}});
	const shell = bandBlocks(bands);          // shell[b] — блоки полосы b (те, что видны на фронте волны)
	return {world, bands, meshes, shell};
});
```

```tsx
// 2. Каждый кадр: положение фронта и анимация блока
const SPAN = 4;                               // сколько полос анимируется одновременно
const WIND: Vec3 = [7, 1.6, 2.5];
const set = getSet();
const max = set.bands.max;
// распад: фронт идёт от края к центру
const front = lerp(max + 1, -SPAN, prog(t, BEATS.dissolveFrom, BEATS.dissolveTo - BEATS.dissolveFrom));

<BandWave
	meshes={set.meshes}
	shell={set.shell}
	mode="dissolve"                           // или "assemble"
	front={front}
	span={SPAN}
	stagger={0.6}                             // разнобой старта блоков внутри полосы
	tint={env.tint}
	snowCover={snowCover}                     // и остальные пропсы VoxelMesh
	mixColor="#ffffff"
	animate={(b, p, out) => {
		// p — прогресс блока 0..1: при dissolve 0 — цел, 1 — исчез
		const h = hash3(b.x, b.y, b.z, 6);
		const fly = smooth((p - 0.3) / 0.7);
		out.mix = clamp01(p * 3.2);             // сначала белеет
		out.s = 1 - fly * 0.86 - (p >= 1 ? 1 : 0);   // потом съёживается (в конце — ноль)
		out.x = WIND[0] * fly * fly * (0.5 + h);     // и улетает по ветру
		out.y = WIND[1] * fly * fly * 2;
		out.z = WIND[2] * fly * fly * (0.5 + h);
		out.rx = fly * (h * 5 - 2);
	}}
/>
```

Сборка — то же самое наоборот:

```tsx
// фронт идёт от центра к краю; p: 0 — блока ещё нет, 1 — встал на место
const front = lerp(-1, max + SPAN + 1, easeInOutCubic(prog(t, BEATS.assembleFrom, BEATS.assembleTo - BEATS.assembleFrom)));
<BandWave meshes={set.meshes} shell={set.shell} mode="assemble" front={front} span={SPAN} tint={env.tint} mixColor="#ffffff"
	animate={(b, p, out) => {
		const h = hash3(b.x, b.y, b.z, 5);
		out.y = (1 - easeOutCubic(p)) * (7 + h * 8);     // прилетает сверху
		out.s = p <= 0 ? 0 : easeOutBack(p, 1.2);
		out.mix = 1 - smooth((p - 0.55) / 0.45);         // белый «снежок» -> родная текстура
	}}
/>
```

Снежинки из рассыпающихся блоков — `FlakeStream` (тысячи точек, считаются в шейдере):

```tsx
// один раз: источники = блоки оболочки (не все — каждый третий), момент = когда волна дошла до полосы
const flakes = useMemo(() => {
	const out: FlakeSource[] = [];
	const dur = BEATS.dissolveTo - BEATS.dissolveFrom;
	set.shell.forEach((list, band) => {
		const at = BEATS.dissolveFrom + ((max + 1 - band) / (max + 1 + SPAN)) * dur;
		list.forEach((blk, i) => {
			if (i % 3 === 0) out.push({pos: [blk.x + 0.5, blk.y + 0.5, blk.z + 0.5], at: at + hash3(blk.x, blk.y, blk.z, 7) * 0.5});
		});
	});
	return out;
}, [set, max]);

<FlakeStream t={t} sources={flakes} wind={WIND} life={1.8} size={0.16} />
```

Справка:

- `makeBands(world, (x, y, z, id) => номер)` → `Bands {min, max, ...}`. Номер округляется; годится любая функция:
  расстояние от центра (кольца), `x` (волна слева направо), высота (сверху вниз).
- `bandBlocks(bands, {all?, maxPerBand?})` → `BlockInst[][]`. По умолчанию — «оболочка» полосы (кубы, у которых есть
  сосед-воздух или сосед из другой полосы); `all: true` — все кубы.
- `waveSplit(front, span, mode, maxBand)` → `{meshBands, active, progress(band)}` и `blockProgress(bandP, block, stagger)` —
  арифметика волны, если нужно собрать её вручную из `VoxelMesh bands={...}` + `InstancedBlocks`.
- Арифметика: `assemble` — `front` растёт от `0` до `max + span + 1`, `p = (front − b) / span`;
  `dissolve` — `front` убывает от `max + 1` до `−span`, `p = (b − front) / span`.
- То, что не блоки (персонажи, `WaterSurface`, факелы, частицы), волна не трогает — прячь сам по времени.
  Растения и решётки исчезают/появляются вместе со своей полосой без анимации.
- **Цена.** Каждый анимируемый блок — отдельный куб. Число блоков в волне ≈ длина полосы × её ширина × глубина мира × `span`.
  Держи его до 10–15 тысяч: полосы шириной 2–3 блока, `span` 3–5, глубина мира (параметр `depth` у `heightmap`) 3–5
  блоков. См. раздел 16.

Полный рабочий пример — `src/scenes/_demo/index.tsx` (`IslandShot`).

---

## 9. Персонажи

### Humanoid / Player

`Player` — то же самое, что `Humanoid` (второе имя для героя).

```tsx
<Player
	skin={assets.skin}             // скин героя; мобы: getSkin('griefer' | 'zombie' | 'skeleton')
	position={[x, y, z]}           // между ступнями
	rotationY={st.heading}         // 0 — лицом к +z; cam.azimuth — лицом в камеру
	pose={pose}                    // см. позы
	lean={[0.2, 0]}                // наклон тела вокруг ступней [вперёд, вбок]
	tumble={[t * 6, 0]}            // кувырок вокруг центра тела [вперёд, вбок]
	squash={0.85}                  // сплющивание по высоте (приземление)
	scale={1}
	handR={<PixelItem art="diamondSword" held />}   // предмет в правой руке
	handL={...}                    // в левой
	headSlot={...}                 // на голове: единицы — блоки, начало — центр головы
	hurt={impulse(t, BEATS.hit, 5)}   // красная вспышка урона 0..1
	frozen={0.8}                   // ледяной оттенок 0..1
	opacity={0.3}                  // послеобразы скорости
	color="#ffffff" visible
/>
```

Константы: `PX = 1.875 / 32` (пиксель скина в блоках), `PLAYER_HEIGHT = 1.875`, `EYE_HEIGHT`.
`headTop(position, scale?, squash?, pose?)` → точка макушки (для ника).

Скины: `assets.skin` (герой, тонкие руки), `getSkin('griefer')` — тёмное худи, красные светящиеся глаза, красная бандана;
`getSkin('zombie')`; `getSkin('skeleton')` (тонкие кости). Свой скин из картинки: `imageSkin(texture, 'slim' | 'classic')`.

### Позы

```ts
type Pose = {
	headYaw: number; headPitch: number;      // yaw > 0 — влево (к +x персонажа), pitch > 0 — вниз
	armR: [number, number]; armL: [number, number];   // [вперёд/назад, в сторону]: −PI/2 — рука вытянута вперёд, −PI — вверх;
	                                                  // «в сторону»: правая рука уходит при отрицательном, левая — при положительном
	legR: [number, number]; legL: [number, number];   // [вперёд/назад, разворот носка]
	lean?: number;                           // наклон корпуса вперёд
	dy?: number;                             // смещение по высоте, блоки (сидит)
};
```

| поза | аргументы |
|---|---|
| `idle(t)` | стоит и «дышит» |
| `walk(phase, amount?)`, `run(phase, amount?)`, `sprint(phase, amount?)` | шаг/бег/рывок; `phase` — из `makePath().at(t).phase` (или `t * 7`, `t * 10`, `t * 14`) |
| `jump(k)` | k: 0 толчок → 0.5 верх → 1 приземление |
| `fall(t)` | падает, руки вверх |
| `swing(k)` | удар правой рукой: 0 замах → ~0.45 контакт → 1 |
| `smash(k)` | удар сверху двумя руками: 0 — оружие над головой, 1 — обрушил |
| `drink(k)` | пьёт из правой руки (0.25..0.85 — пьёт) |
| `throwing(k)` | бросок: 0 замах → ~0.5 выпуск → 1 |
| `wave(t)`, `cheer(t)`, `scared(t)` | машет / радуется / испуган |
| `sit()` | сидит (опускает корпус на 0.59 блока) |
| `zombieArms(phase, amount?)` | руки вперёд, шаркает |
| `aimBow(pull?)` | целится из лука (лук — в левой руке: `handL`) |
| `hold(k?)` | показывает предмет в правой руке |
| `shoulder(t?)` | оружие на плече |
| `frozenPose()` | вмёрз в нелепой позе |
| `lookAround(t, k)` | оглядывается (k 0..1 — один цикл) |

`mixPose(a, b, k)` — смешать; `withPose(pose, {headYaw: 0.4})` — подправить; `POSE_ZERO`; `blendIn(t, at, dur)`.
Все позы разом: `npm run shots -- --scene=poses --full 0.8`.

```ts
const k = prog(t, BEATS.drink, 1.2);
let pose = mixPose(idle(t), drink(k), k > 0 && k < 1 ? 1 : 0);
pose = mixPose(pose, run(st.phase), st.moving);
```

### makePath — ходьба по маршруту

```ts
const path = makePath([{t: 4.2, pos: [0, 0, 0]}, {t: 5.2, pos: [3, 0, 2]}, {t: 6.0, pos: [2, 0, 5]}], {stride: 1.5});
const st = path.at(t);
// st.position: Vec3; st.heading — куда смотрит (rotationY); st.speed — блоков/с;
// st.distance — пройденный путь; st.phase — фаза шага для walk()/run(); st.moving — 0..1 (движется ли)
```

`stride` — длина шага: ходьба ≈ 0.95, бег ≈ 1.5, спринт ≈ 2.2 (ноги не «скользят»). `linear: true` — ломаная без
сглаживания. До первого и после последнего ключа персонаж стоит. Высоту по рельефу бери сам:
`[p[0], world.groundAt(p[0], p[2]), p[2]]`.

### NameTag, тень, свечение

```tsx
<NameTag text="GRIEFER" position={headTop(pos)} cam={cam} color="#ff4a3c" />
// size = 0.032 — пиксель шрифта в блоках; minPx = 3 — не мельче 3 экранных px на пиксель шрифта (читается на общих планах);
// lift, opacity, onTop (видно сквозь стены)
<BlobShadow x={pos[0]} z={pos[2]} y={groundY} size={1.7} opacity={0.5} />
// тень прыгающего: const sh = shadowFor(heightAboveGround); <BlobShadow ... size={sh.size} opacity={sh.opacity} />
<Glow position={[x, y, z]} color="#ff9a2e" size={3.4} opacity={0.5} onTop={false} />   // аддитивное пятно света
```

### Мобы

```tsx
<Pig position={[x, y, z]} rotationY={a} legSwing={t * 9} headYaw={0.3} tilt={0} roll={0} hurt={0} whiten={0} scale={1} />
<Breeze position={[x, y, z]} t={t} rotationY={a} hover={0.35} charge={0.6} hurt={0} dissolve={0} tilt={[0, 0]} scale={1} />
```

`Pig`: `legSwing = 0` — стоит; `whiten` — «превращается в снег». `Breeze` — вихрь (мини-босс): `charge` — заряд перед
выстрелом (кольца ускоряются, светится), `dissolve` 0..1 — рассыпается. Зомби и скелет — `Humanoid` со скинами
`getSkin('zombie')` + `zombieArms(...)`, `getSkin('skeleton')` + `aimBow()` + `handL={<PixelItem art="bow" held />}`.

---

## 10. Реквизит

`position` у «блочного» реквизита — центр нижней грани клетки: `(x + 0.5, y, z + 0.5)`.

| компонент | пропсы |
|---|---|
| `Torch` | `position, t, lit = 1` (0 — потух), `wall?: [dx, dz]` — на стене, направление ОТ стены, `seed, glow, scale` |
| `Lantern` | `position, t, hanging = 0` (длина цепи; тогда `position` — точка крепления на потолке), `lit, color, seed, glow` |
| `TrialSpawner` | `position, t, active` 0..1 (тлеет синим → разгорается оранжевым), `scale` |
| `Vault` | `position, t, lid` 0..1 (крышка), `keys` 0..3 (вставленные ключи — скважины загораются), `glow` 0..1, `rotationY` (лицо — в +z), `scale` |
| `Chest` | деревянный сундук с крышкой: `position, lid` 0..1, `rotationY` (замок — в +z), `glow` 0..1 и `glowColor` (блеск изнутри), `scale` |
| `Door` | дверь на петлях в проёме 1×2: `position` — нижний угол проёма со стороны петли (целые координаты; в мире там должен быть воздух), закрытая дверь идёт от петли вдоль +x у грани −z; `open` 0..1 — распахивается в сторону +z (отрицательное — внутрь), `rotationY` — повернуть вокруг петли, `tint` |
| `CopperGate` | `position` (нижний угол проёма, целые координаты), `width, height, open` 0..1 (уезжает вверх), `axis: 'x' \| 'z'`, `block = B.copperGrate`, `tint, shake` |
| `TreeLights` | `lights, star, t, on = 1, blink = 0.6, glow` — гирлянда и звезда для `newYearTree` |
| `Mace` | объёмная булава: `held` (в руке), `position, rotation, scale, length = 1, glow, mix, mixColor` |
| `IceCube` | полупрозрачная ледяная глыба: `position, size = [1.4, 2.3, 1.4], opacity = 0.55, grow` 0..1, `color, rotationY` |
| `Glow` | пятно света (см. выше) |

`flicker(t, seed)` — мерцание огня −1..1 (для своих источников).

Свет факелов на стенах — это запечённые `lights` в `buildVoxelMeshes`; `Torch`/`Lantern` рисуют саму модель и ореол.
Держи их списком в одном месте:

```ts
const TORCHES: Vec3[] = [[2.5, 3, 2.5], [-3.5, 3, 2.5]];
const meshes = buildVoxelMeshes(world, {ambient: 0.22, ambientColor: '#b9a08a', lights: TORCHES.map((pos) => ({pos: [pos[0], pos[1] + 0.6, pos[2]], radius: 9, color: '#ffa858'}))});
// ...
{TORCHES.map((p, i) => <Torch key={i} position={p} t={t} seed={i} />)}
```

---

## 11. Предметы

`PixelItem` — пиксельный рисунок, выдавленный в объём толщиной в 1 пиксель (как предметы в игре).

```tsx
<PixelItem art="enchantedBook" size={0.8} position={[x, y, z]} rotation={[0, t * 2, 0]} glint={t} glow={0.4} />
```

| проп | смысл |
|---|---|
| `art` | имя из библиотеки или свой рисунок |
| `size` | размер в блоках (по умолчанию 0.85; обычный предмет в руке — 0.6) |
| `held` | предмет в руке (передаётся в `handR`/`handL`) |
| `billboard={cam}` | всегда лицом к камере (летящий снежок, жемчуг, ключ) |
| `glint={t}` | перелив зачарования (фиолетовые бегущие полосы); `glintColor` |
| `glow` | собственное свечение 0..1 (не темнеет в подземелье) |
| `mix`, `mixColor` | подмешать цвет («рассыпается в снег») |
| `position`, `rotation`, `scale`, `opacity`, `visible` | как обычно |

Библиотека `ART`: `ironSword`, `diamondSword`, `mace`, `bow`, `arrow` (это «оружие»), `snowball`, `enderPearl`, `trialKey`,
`enchantedBook`, `fireworkRocket`, `diamond`, `goldIngot`, `emptyBottle`, `heartFull`, `heartHalf`, `heartEmpty`.
Зелье с жидкостью любого цвета: `potionArt('#33ccff')`; зелье Скорости — `potionArt(SPEED_POTION)`.

Свой рисунок: `const MY: ItemArt = {rows: ['..KK..', ...], palette: {K: '#101010'}, grip: [3, 3], tool: true}` — строка 0 — верх,
`'.'` — прозрачно; `grip` — пиксель хвата от левого нижнего угла; `tool` — держится как оружие.

**Как предмет лежит в руке.** Без `held` рисунок стоит в плоскости XY лицом к `+z`, центр — в `position`.
С `held` (внутри `handR`/`handL`) он сам встаёт в кулак:

- оружие (`tool`): плоскость рисунка — вдоль руки, остриё смотрит вперёд и чуть вверх от кулака (как меч в игре);
  спереди видно ребром, сбоку — целиком;
- обычный предмет: лежит плоскостью поперёк руки, верх рисунка — «вперёд». Когда рука вытянута вперёд
  (`hold()`, `drink()`), рисунок смотрит на зрителя перед персонажем.

Довернуть предмет в руке — `rotation` (вращение вокруг кулака). Система координат кулака: `+z` — вперёд (куда смотрит
персонаж, когда рука опущена), `+y` — вдоль руки к плечу, `x` — вбок. Единицы внутри `handR`/`handL` — блоки.

**Булава** — отдельная объёмная модель `Mace` (читается с любого ракурса):

```tsx
<Player ... pose={shoulder(t)} handR={<Mace held />} />                          // на плече
<Player ... pose={cheer(t)} handR={<Mace held rotation={[-1.3, 0, 0]} />} />     // поднята над головой навершием вверх
<Mace length={1.1} position={[x, y, z]} rotation={[0.3, t * 2, 0.5]} glow={0.5} />   // парит и вращается
```

Плоская иконка в интерфейсе — тот же рисунок: `<ItemIcon art="trialKey" x={150} y={930} size={96} />`.
`itemTexture(art)` — текстура рисунка (для своих спрайтов).

---

## 12. Частицы и эффекты

Всё считается формулой от `t`. Частицы — кубики (кроме снега — это квадратные точки).

| компонент | для чего | главные пропсы |
|---|---|---|
| `Burst` | разовый выброс: брызги, пыль, осколки | `t, at, origin, count, colors, speed: [мин, макс], shape: 'sphere' \| 'up' \| 'ring' \| 'cone'`, `dir, angle` (для cone), `gravity = -14, drag = 1.2, life = [0.5, 1], size = [0.12, 0.26], spreadDelay, spawn, additive, seed` |
| `Trail` | шлейф за движущейся точкой: пыль из-под ног, брызги по воде | `t, from, to, rate = 30, origin: (time) => Vec3, colors, life, size, spread, rise, drift, seed, additive` |
| `Sparkles` | мерцающие искры в объёме | `t, center, box = [2, 2, 2], count = 30, colors, size, speed, rise, amount` 0..1 |
| `PotionSwirl` | спиральки эффекта зелья вокруг героя | `t, center` (ступни), `color, amount` 0..1, `height = 2, radius, count` |
| `PortalParticles` | фиолетовые частицы телепорта | `t, at, origin, mode: 'in'` (появился) `\| 'out'` (исчез), `count, duration` |
| `Poof` | облачко дыма (моб лопнул) | `t, at, origin, count, colors, size` |
| `Shockwave` | ударная волна: кольцо + выбитые кубики | `t, at, origin, radius = 5, duration, color, debris` (цвета кубиков; `[]` — без них), `count`, `rotation` (`[0, yaw, 0]` — кольцо стоит стеной) |
| `LightBeam` | столб света | `position, height = 12, width, color, amount` 0..1, `t` |
| `Firework` | залп салюта: ракета + вспышка + огни | `t, at, origin` (точка взрыва), `colors, size, count, seed`; только ракета — `Rocket` |
| `Snowfall` | снегопад вокруг камеры | `t, center` (положение камеры), `count = 2000, box = [40, 26, 40], wind = [1.2, -3.2, 0.4], size = 0.09, density` 0..1, `opacity, color, sway, maxPx` |
| `FlakeStream` | снежинки из заданных точек в заданные моменты | `t, sources: {pos, at}[]` (неизменный список), `perSource = 3, wind, life, size, spread, gravity, color` |
| `Particles` | свой рой: формула одной частицы | `count, colors, fn: (i, r, out) => void, seed, additive, opacity, active` |

```tsx
<Burst t={t} at={BEATS.land} origin={[x, y + 0.1, z]} count={28} colors={['#ffffff', '#dfeaf5']} speed={[2, 5.5]} shape="ring" gravity={-7} life={[0.35, 0.75]} />
<Trail t={t} from={4.3} to={7.5} rate={40} origin={(time) => feetAt(time)} colors={['#ffffff', '#e6eef6']} />
<Snowfall t={t} center={[cam.position.x, cam.position.y, cam.position.z]} count={3000} density={prog(t, 2, 1.5)} wind={[9, -3, 2.5]} />
<Firework t={t} at={BEATS.salute} origin={[-7, 15, -16]} colors={['#ff5a5a', '#ffd0d0', '#ffffff']} seed={1} />
```

Свой эффект на `Particles` (r — восемь личных случайных чисел частицы, `out.s = 0` — частица не видна):

```tsx
<Particles count={40} seed={3} colors={['#bfe8ff', '#ffffff']} additive active={t > 5 && t < 7}
	fn={(i, r, out) => {
		const tau = t - 5 - r[0] * 0.5;
		if (tau <= 0 || tau > 1) return;
		out.x = x + Math.cos(r[1] * 6.28) * tau * 3;
		out.y = y + tau * 2;
		out.z = z + Math.sin(r[1] * 6.28) * tau * 3;
		out.s = 0.15 * (1 - tau);
	}}
/>
```

`Snowfall`: объём ездит вместе с центром, хлопья заворачиваются через границы — снег есть везде, куда летит камера.
Метель — большие `wind` и `count`; редкий снег — `density={0.3}`. Тысячи хлопьев почти бесплатны.

---

## 13. Надписи и интерфейс

Два вида надписей (см. `SPEC.md` §4): объёмные «геройские» (`VoxelText`) и плоские (`PixelText` и его семейство).
Оба рисуются одним и тем же пиксельным шрифтом ядра: вся заглавная кириллица с «Ё», латиница (заглавная и строчная),
цифры и знаки `. , ! ? : ; - – — − · % + / ( ) « » … ' " = < > # * × @ & _ [ ]`. Строчная кириллица рисуется заглавными.
Проверить знак: `hasGlyph('Ё')`. Ширина строки в пикселях шрифта: `textWidth('ВАЙП')`.

> Про шрифт Pixelify Sans. В исходных файлах шрифта нет заглавных «О» и «П», у «К» лишний штрих, а «С» почти
> не отличить от «О» — канонические надписи им набрать нельзя. Поэтому плоский интерфейс рисуется шрифтом ядра
> (он же — шрифт объёмных букв). Починенный Pixelify Sans (`public/fonts/pixelify-sans-ru-*.woff2`, собран скриптом
> `scripts/patch-font.py`) подключён и доступен как `SansText` — для мелких второстепенных подписей.

### VoxelText — объёмные буквы

```tsx
<VoxelText
	text="ВСЁ ИСЧЕЗНЕТ" t={t}
	px={0.5}                      // размер пикселя буквы в единицах родителя (блоки в мире, пиксели кадра в HudLayer)
	depth={2.2}                   // толщина в пикселях шрифта
	top="#ffffff" bottom="#9fd0ff" body="#1b3a6e"   // градиент лица сверху вниз и цвет «тела»
	appearAt={2.0} stagger={0.045}   // буквы выпадают по очереди
	exitAt={6.5}                  // улетают (если не задано — остаются)
	enter="drop"                  // 'drop' — падают сверху, 'pop' — вырастают, 'none' — сразу стоят
	wobble={0.22}                 // покачивание после появления
	align="center"                // 'center' | 'left' | 'right' относительно position
	scale={1 + impulse(t, 2, 8) * 0.2}
	position={[0, 17, 0]} rotation={[0, cam.azimuth, 0]}   // в мире: лицом к камере
	fog={false}
/>
```

Высота заглавной буквы — `7 * px`, ширина строки — `textWidth(text) * px`.

### HudLayer — экранный 3D-слой

Группа, приклеенная к камере. Внутри координаты — пиксели кадра: `(0, 0)` — центр, `x` вправо, `y` вверх, `z` — на зрителя.
Всё внутри рисуется поверх мира и не тонет в тумане.

```tsx
<HudLayer cam={cam}>
	<VoxelText text="21 НОЯБРЯ · 13:00 МСК" t={t} px={7} top="#ffffff" bottom="#ffd86b" body="#5a2408" appearAt={4.6} position={[0, -300, 0]} rotation={[0.05, 0, 0]} />
	<ExtrudedLogo texture={assets.holyworld} height={150} position={[760, 380, 0]} rotation={[0.1, Math.sin(t * 1.1) * 0.42, 0]} scale={easeOutBack(prog(t, 0.6, 0.4))} />
</HudLayer>
```

`ExtrudedLogo` — объёмный логотип из картинки (стопка слоёв): `texture, height, layers = 22, step, side, back, position, rotation, scale, opacity`.
Работает и в мире (единицы — блоки). `HudLayer` — один на сцену (несколько надписей кладутся в один).

### Плоский интерфейс (DOM, Overlay)

Координаты — пиксели кадра, `(0, 0)` — левый верхний угол.

**`PixelText`** — строка с тёмной обводкой.

```tsx
<PixelText x={960} y={900} size={80} color="#ffffff" color2="#9fd0ff" align="center">НОВАЯ ГЕНЕРАЦИЯ МИРА</PixelText>
```

| проп | смысл |
|---|---|
| `x`, `y` | точка привязки: по горизонтали — по `align`, по вертикали — середина заглавных букв |
| `size` | кегль: **пиксель шрифта = size / 10**, заглавная буква высотой `0.7 * size`. Бери кратное 10 (40, 50, 60, 80), тогда пиксели ровные |
| `color`, `color2` | цвет; `color2` — градиент сверху вниз |
| `outline = 1`, `outlineColor`, `drop = 1` | обводка и нижняя «тень» в пикселях шрифта |
| `bold` | штрихи на пиксель толще |
| `opacity`, `scale`, `rotate` (градусы) | вокруг точки привязки |

Текст — только строка (дети-строки и числа склеиваются; шаблонная строка — надёжнее всего: `` {`КЛЮЧ ${n}/3`} ``).
Ширина в пикселях кадра: `pixelTextWidth(text, size)`. Читаемость на превью 960×540: для важных надписей `size ≥ 50`.

| компонент | что делает |
|---|---|
| `Caption` | `PixelText`, который «выстреливает» в `from` и убирается в `to`: `t, from, to, wobble?, scale?` + пропсы `PixelText` |
| `Stamp` | надпись «впечатывается» в `at`; `strikeAt` — зачёркивается красной полосой; `to?`, `strikeColor`, `rotate = -4` |
| `Countdown` | таймер: `label="ДО ВАЙПА"`, `remaining` (секунд осталось, дробное — цифры вздрагивают на каждой секунде), `urgent` 0..1 (краснеет), `x, y, size = 90` |
| `Counter` | число: `value, prefix, suffix, digits, pop` (вспышка масштаба) + пропсы `PixelText` |
| `Hearts` | ряд сердец: `value` (в сердцах, шаг 0.5), `max = 10`, `x, y` (центр ряда), `size = 54`, `t, shake` 0..1, `flash` 0..1, `lowPulse` |
| `CooldownClock` | «часики» перезарядки: `x, y, size, progress` 0..1 (1 — готово), `color` |
| `ItemIcon` | иконка предмета: `art, x, y` (центр), `size, opacity, scale, rotate, shadow` |
| `WorldLabel` | дети рисуются вокруг экранной проекции 3D-точки: `cam, at: Vec3, dx, dy, clamp = true`; внутри `x = 0, y = 0` — сама точка |
| `Fade` | заливка кадра: `color = '#000000', opacity` |
| `Flash` | короткая вспышка: `t, at, dur = 0.4, color, peak` |
| `Vignette` | затемнение (или иней — светлым цветом) по краям: `amount, color, inner` |
| `Letterbox` | киношные полосы: `amount` 0..1, `height = 110` |
| `SpeedLines` | линии скорости по краям: `t, amount` 0..1, `color, count, cx, cy` |
| `SansText` | Pixelify Sans: `x, y, align, size, color, outline, weight: 500 \| 700, ...` |

Помощники: `captionEnv(t, from, to)` → `{scale, opacity}`; `formatClock(75)` → `"01:15"`;
`fadeFrom(t, dur)` — 1 → 0 в начале сцены; `fadeTo(t, end, dur)` — 0 → 1 к моменту `end`.

```tsx
const Overlay: React.FC<SceneProps> = ({t, cam, duration}) => (
	<>
		<Countdown label="ДО ВАЙПА" remaining={Math.max(0, 10 - (t - BEATS.countdown))} urgent={prog(t, BEATS.countdown + 7, 1)} y={210} />
		<Hearts value={t < BEATS.hit ? 10 : 5} t={t} shake={impulse(t, BEATS.hit, 5)} flash={impulse(t, BEATS.hit, 8)} />
		<Stamp t={t} at={BEATS.stamp} strikeAt={BEATS.stamp + 0.35} x={960} y={520} size={90}>СКОРОСТЬ III</Stamp>
		<Caption t={t} from={BEATS.stamp + 0.5} to={BEATS.stamp + 3} x={960} y={640} size={50} color="#ffe95a">МАКСИМУМ — СКОРОСТЬ II</Caption>
		<WorldLabel cam={cam} at={[hero[0], hero[1] + 2.6, hero[2]]} dy={-70}>
			<Caption t={t} from={2.4} to={3.9} x={0} y={0} size={50} color="#33ccff">СКОРОСТЬ III</Caption>
		</WorldLabel>
		<Fade color="#ffffff" opacity={fadeFrom(t, 0.5) + fadeTo(t, duration, 0.5)} />
	</>
);
```

Порядок слоёв: 3D-мир → `HudLayer` (в том же холсте, поверх мира) → значок сервера → `Overlay` сцены. Заливка `Fade`
закрывает и значок.

---

## 14. Звук

Только оригинальные звуки Minecraft. Сцена описывает их в `sfx.ts` (локальное время), скрипты скачивают файлы и сводят
одну дорожку.

```ts
import {sfx} from '../../core/sfx';
import {BEATS} from './beats';

const s = sfx();                       // sfx({reverb: 0.4}) — значения по умолчанию для всех событий (например, эхо подземелья)
s.add(BEATS.hit, 'item/mace/smash_ground1', 0.8, {pan: -0.3});
export const events = s.events;
```

| метод | что делает |
|---|---|
| `add(at, src, volume = 0.5, opts?)` | один звук |
| `seq(times, src \| (i) => src, volume, opts \| (i) => opts)` | несколько звуков в заданные моменты |
| `every(from, to, step, src \| (i) => src, volume, opts \| (i) => opts)` | повтор каждые `step` секунд |
| `loop(from, to, src, len, volume = 0.3, {cross?, edge?, ...})` | зациклить длинный звук (ветер, пещера) кусками по `len` секунд внахлёст, с плавными краями |
| `steps(from, to, material, interval = 0.4, volume = 0.35, {variants = 4})` | шаги: `step/<material>1..N` (`grass`, `snow`, `stone`, `wood`, `sand`, `gravel` ...); ходьба ≈ 0.42 с, бег ≈ 0.3, спринт ≈ 0.22 |
| `merge(events, shift)` | добавить готовый список со сдвигом |

Параметры события (`opts`): `rate` — скорость/высота (2 — октава вверх и вдвое короче); `dur` — обрезать, сек;
`fadeIn`, `fade` — плавный вход/затухание, сек; `pan` −1..1; `reverb` 0..1 — сколько отправить в эхо; `lowpass` — срез
высоких, Гц («издалека», «за стеной»); `offset` — пропустить начало файла, сек.

- Имя звука — путь в ассетах игры без `.ogg`: `'random/pop'`, `'mob/zombie/say1'`, `'block/vault/open_shutter'`.
  Поиск: `npm run sounds -- --find vault` (также `trial_spawner`, `mace`, `breeze`, `wind_charge`, `powder_snow`, `glass`,
  `endermen`, `note/` ...). Неизвестное имя — `npm run sounds` упадёт и покажет похожие.
- Время — локальное время сцены; хвосты звуков спокойно доигрывают в следующей сцене.
- Громкость линейная. Ориентиры: атмосфера 0.1–0.25, шаги 0.3–0.4, события 0.5–0.8, акценты до 1. Общий ограничитель держит
  пики не выше −1 дБ; если отчёт пишет, что он «давит больше 6 дБ» — убавь.
- Проверка: `npm run sounds -- --scene=<id>` (скачать), `npm run mix -- --scene=<id>` (свести в `out/audio/<id>.wav` с отчётом),
  `npm run preview -- --scene=<id>` (видео со звуком).

**Музыка** — `src/music/score.ts`: `SCORE: NoteEvent[]`, `{at, inst, note, volume?, pan?, dur?, fade?, reverb?}`;
`at` — **глобальное** время ролика; `inst`: `harp, bass, bd, snare, hat, bell, flute, chime, guitar, xylophone, iron_xylophone,
cow_bell, didgeridoo, bit, banjo, pling` (семплы `note/*`); `note` — полутоны от базовой ноты семпла (0 — как записан,
12 — октава вверх, можно дробные и отрицательные). `MUSIC_GAIN` — общая громкость музыки.

---

## 15. Инструменты

### Кадры и листы — `npm run shots`

```bash
npm run shots -- --scene=<id> 0.5 2 7.25            # кадры в моменты локального времени, 960x540 -> out/shots/<id>/t000.50.png ...
npm run shots -- --scene=<id> --full 12             # 1920x1080 -> t012.00-full.png
npm run shots -- --scene=<id> --sheet               # контактный лист: кадр в секунду, по 16 на лист -> out/shots/<id>/sheet-01.png
npm run shots -- --scene=<id> --sheet --step=0.5 --from=10 --to=16
npm run shots -- --scene=<id> --bench 12            # замер: 6 кадров подряд в 1920x1080 в одной вкладке, мс на кадр
npm run shots -- --global 31 52.5                   # весь ролик по глобальному времени -> out/shots/global/
npm run shots -- --global --sheet --step=5
```

- Для сцены собирается **только она** — сломанный файл в чужой папке не мешает.
- На каждой плитке листа впечатано локальное время (у `--global` — глобальное время, сцена и её локальное время).
- `--jobs=N` — сколько кадров рендерить одновременно (по умолчанию 2); `--stamp` — впечатать время и в обычный кадр;
  `--noaa` — без сглаживания; `--scale=0.5` — масштаб для `--bench`.
- Сообщения `console.log`/ошибки из браузера печатаются с пометкой `[браузер ...]`.
- Время в списке кадров включает загрузку страницы и постройку мира. Чистое время кадра — `--bench`.

Смотри глазами каждый бит сцены и минимум кадр на 1.5–2 секунды (открой PNG).

### Превью — `npm run preview`

```bash
npm run preview -- --scene=<id>                     # out/preview/<id>.mp4: 960x540, 30 к/с, со звуком сцены
npm run preview -- --scene=<id> --from=10 --to=14   # кусок сцены
npm run preview -- --global                         # весь ролик (нужен public/audio/soundtrack.wav: npm run audio)
# --fps=60 --full --jobs=4
```

Если звуки не скачаны, превью будет немым (скрипт об этом скажет).

### Remotion напрямую

```bash
npx remotion studio                                               # все композиции: WipeVideo, s1-hook ... s9-finale и служебные (demo, example, envs, poses, blocks, glyphs, bench)
npx remotion still s3-wipe out/x.png --frame=300 --scale=0.5      # кадр композиции сцены (frame = t * 60)
npx remotion render WipeVideo out/draft.mp4 --props='{"fps":30}'  # черновик всего ролика в 30 к/с (сцены не меняются: всё от времени)
npx remotion render WipeVideo out/part.mp4 --frames=1800-2999     # кусок финала
```

Входные параметры композиций: `fps` (по умолчанию 60), `audio: false` (без дорожки), `stamp: true` (время в кадре),
`antialias: false`.

---

## 16. Производительность

Рендер программный (без видеокарты), 4 ядра. Замеры: 1920×1080, сглаживание включено, одна вкладка
(`npm run shots -- --scene=bench --bench <t>`):

| что в кадре | мс на кадр |
|---|---|
| почти пустая сцена (площадка 28×28, герой, ник, надпись, снег) | ~150 |
| рельеф 160×160 с 244 деревьями одним `VoxelMesh` (172 тыс. блоков, 120 тыс. граней) | ~430 |
| то же + 3000 анимированных `InstancedBlocks` | ~515 |
| то же + 3000 хлопьев `Snowfall` | ~535 |
| волна распада по этому рельефу (`BandWave`, span 4, полосы шириной 3, глубина 6 — около 20 тыс. блоков в анимации) + `FlakeStream` | ~1160 |
| демо: остров 72×72 целиком / его распад / подземелье с мобами и эффектами | ~340 / ~640 / ~310 |

Постройка мира 160×160 (заполнение + полосы + геометрия + блоки по полосам) — около 0.5–0.6 с, **один раз на вкладку**
(при финальном рендере вкладок четыре, у `shots` каждая отдельная картинка — новая вкладка).

Из чего складывается кадр:

- ~100–150 мс — постоянные расходы (снимок кадра, сжатие).
- Геометрия: ≈ 2.3 мс на 1000 видимых граней `VoxelMesh`. Грани считаются, а не блоки: сплошной мир глубиной 6 стоит
  столько же, сколько «корка».
- `InstancedBlocks`: ≈ 25–30 мс на 1000 блоков (каждый — 6 граней, соседей не отсекает).
- Сглаживание — около 40% времени тяжёлого кадра (430 → 300 мс без него). В финале оно включено.
- Разрешение влияет слабо: 960×540 даёт тот же рельеф за ~310 мс — упор в вершины, а не в пиксели.
- `Snowfall`/`FlakeStream` — практически бесплатны (тысячи точек — единицы миллисекунд).
- Персонаж — 6–12 мелких мешей, десяток персонажей в кадре не заметен.

Ориентир из ТЗ — кадр не дольше ~1.5 с. Что делать, если не укладываешься:

1. `cull: {bottom: true}` (и `sides`, если краёв мира не видно) в `buildVoxelMeshes`.
2. Меньше глубина мира: `heightmap(..., {depth: 4})`. Под землёй, куда камера не заглядывает, блоки не нужны.
3. В волне: уже полосы, меньше `span`, меньше глубина. Число блоков в анимации = сумма `shell[b].length` по активным
   полосам — выведи его через `console.log` и держи до 10–15 тысяч.
4. Не клади в `InstancedBlocks` то, что стоит на месте.
5. Дальний план закрывай туманом (`fogFar`) и не строй мир дальше, чем видно.
6. Один большой `VoxelMesh` лучше сотни мелких.

---

## 17. Грабли

- **Тяжёлое — в `once()`/`useMemo`.** Мир на верхнем уровне модуля строится при загрузке бандла в каждой вкладке, даже если
  сцена не показывается. `buildVoxelMeshes` в теле компонента без `useMemo` — пересборка каждый кадр.
- **R3F не замечает изменений внутри объекта.** Нельзя менять `vector.x = ...` у объекта, переданного в проп, — передавай
  новый массив/объект каждый кадр: `position={[x, y, z]}`, `quaternion={cam.quaternion.clone()}`.
- **Матрицы инстансов — в `useLayoutEffect`**, не в теле рендера и не в `useFrame` (его в ролике быть не должно).
  Готовые `InstancedBlocks`/`Particles` это уже делают — свой `instancedMesh` нужен редко.
- **Списки для `InstancedBlocks`, `FlakeStream`, `TreeLights` должны быть стабильными** (из `once`/`useMemo`). Новый массив
  каждый кадр — лишняя перезаливка буферов; у `FlakeStream` — пересборка геометрии.
- **Никакого состояния между кадрами.** Кадр 500 может отрендериться раньше кадра 10 и в другой вкладке. Всё — формула от `t`.
  «Запаздывание» делай усреднением прошлых значений (как `followCam`), «накопление» — интегралом по формуле.
- **Блок `(x, y, z)` — это куб от `x` до `x+1`.** Персонаж в центре клетки — `x + 0.5`. Стоит на блоке `y` — `position.y = y + 1`
  (`world.groundAt`).
- **Персонаж смотрит в `+z`**, камера `azimuth = 0` стоит со стороны `+z`. Чтобы смотрел в камеру: `rotationY={cam.azimuth}`.
- **`tint` — для блоков, свет — для персонажей.** Оба берутся из одного `env`: `<VoxelMesh tint={env.tint}>` + `<Environment env={env}>`.
  Забытый `tint` — светлый мир в ночной сцене.
- **Подземелье и ночь запекаются**: `buildVoxelMeshes(world, {ambient: 0.22, lights})` и `tint="#ffffff"` (или `ENV.dungeon.tint`).
  Нельзя одновременно затемнить мир и `tint`-ом, и `ambient`-ом — будет чернота.
- **`set` за границами мира молча пропадает.** Дерево у края обрежется. Заложи запас в границы `VoxelWorld`.
- **Прозрачное сортируется грубо.** Воду, `IceCube`, свечения и частицы three рисует после непрозрачного в порядке
  расстояния до центра объекта; не строй сцену на точном порядке прозрачных слоёв.
- **Ник (`NameTag`), тень, свечение — отдельные компоненты**, персонаж их сам не рисует. Тени нужен `y` поверхности.
- **`PixelText` принимает только текст.** Внутрь нельзя класть элементы; для сложной надписи поставь несколько `PixelText` рядом
  (`pixelTextWidth` поможет с шириной).
- **Картинки в DOM** — через `<Img>` из `remotion` (ждёт загрузки), не через голый `<img>`: иначе кадр может сняться раньше.
  `ItemIcon` и `PixelText` рисуются синхронно, с ними этой проблемы нет.
- **Имена звуков проверяются при скачивании**, а не при `typecheck`. После правок `sfx.ts` запусти `npm run sounds -- --scene=<id>`.
- **`defineBlock`/`defineTile` — только на верхнем уровне модуля** (до первого кадра атлас текстур уже собран).
- **Не меняй длительность сцены**: она в `src/timeline.ts`. Локальное `t` идёт от 0 до `duration` (приходит в пропсах).
- **Безопасная зона текста — 80 px от краёв**, левый верхний угол (`BADGE_AREA`) занят значком сервера в s2–s8.
- **Чужие файлы могут временно не компилироваться** — `npm run typecheck` покажет и их ошибки; смотри только свои.
  `shots`/`preview` для сцены собирают только её.
