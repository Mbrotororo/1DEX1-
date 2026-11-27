# SKYBREAK (Godot) — контракт модулей

Это внутренний документ для разработки. Он фиксирует структуру проекта и публичные API
каждого модуля, чтобы модули можно было писать параллельно и потом собрать без правок.
Если меняешь публичный API — меняй и этот файл.

## 0. Общие правила

- Godot **4.4**, GDScript, рендерер `gl_compatibility` (работает на слабых ПК, телефоне, в браузере).
- Почти всё строится **из кода**. Сцены `.tscn` минимальные: корневой узел + скрипт.
- Физический движок Godot для самолётов **не используется**. Полёт, попадания и столкновения считаются своим кодом.
- Единицы: метры, секунды, м/с, радианы внутри кода. В интерфейсе — км/ч, м, градусы.
- Оси мира: Y вверх. Уровень моря y = 0. Карта — квадрат 10×10 км: X и Z в [-5000, 5000].
- Оси самолёта (локальные): **вперёд = -Z**, вверх = +Y, право = +X. Модель самолёта строится так же.
- Команды: `0` = Синие (команда игрока), `1` = Красные. Синие базируются на стороне **+Z**, красные на **-Z**.
- Знаки управления:
  - `pitch > 0` — нос вверх (поворот вокруг локальной +X на положительный угол);
  - `roll > 0` — крен вправо (правое крыло вниз);
  - `yaw > 0` — нос вправо.
- Угол атаки `aoa > 0`, когда нос выше вектора скорости.
- Типизация: используй типы там, где это не мешает. Ссылки на чужие модули через `class_name`.
- Никаких внешних плагинов и ассетов из интернета. Текстуры — только из `assets/`.
- Каждый модуль сам пишет тест `tests/test_<модуль>.gd` (см. раздел 12).

### Стиль текста в игре (важно)

Пользователь просил убрать «нейрослоп». Все строки интерфейса:
- короткие и простые, как в обычной игре: «В бой», «Исследовать», «Купить за 8 000», «Шасси: G»;
- без пафоса и рекламных слов: никаких «эпичный», «легендарный», «погрузись», «стань асом небес»;
- без выдуманных пафосных названий подразделений («звено «Вектор»», «лётная подготовка»);
- без тире-лозунгов и длинных описаний. Описание самолёта — одна строка фактов;
- подсказки — в повелительном наклонении: «Выпусти шасси: G», «Сбавь скорость до 250 км/ч»;
- числа с пробелом между тысячами: `8 000`. Для этого есть `Game.fmt_int()`.

## 1. Структура файлов и владельцы

| Файл | Модуль |
|---|---|
| `project.godot`, `autoload/data.gd`, `autoload/game.gd`, `scenes/main.tscn`, `scripts/ui/ui_style.gd`, `tests/test_runner.tscn`, `tests/run_all.gd` | каркас (уже есть) |
| `scripts/sim/flight_model.gd`, `scripts/sim/damage_model.gd`, `tests/test_flight.gd` | FLIGHT |
| `scripts/sim/weapon_system.gd`, `scripts/sim/projectile_manager.gd`, `scripts/fx/effects.gd`, `tests/test_weapons.gd` | WEAPONS |
| `scripts/aircraft/mesh_builder.gd`, `scripts/hangar/showroom.gd`, `tests/test_meshes.gd` | VISUAL |
| `scripts/world/world.gd`, `scripts/world/terrain.gd`, `scripts/world/sky.gd`, `scripts/world/ground_unit.gd`, `tests/test_world.gd` | WORLD |
| `scripts/aircraft/aircraft.gd`, `scripts/aircraft/player_pilot.gd`, `scripts/aircraft/bot_pilot.gd`, `scripts/match/camera_rig.gd`, `tests/test_aircraft.gd` | ENTITY |
| `scripts/match/match_manager.gd`, `scripts/match/matchmaker.gd`, `scripts/match/training.gd`, `scenes/battle.tscn`, `tests/test_match.gd` | MATCH |
| `scripts/ui/hud.gd`, `scripts/ui/cockpit_panel.gd`, `scripts/ui/minimap.gd`, `scripts/ui/touch_controls.gd`, `scripts/ui/spawn_menu.gd`, `scripts/ui/pause_menu.gd`, `scripts/ui/scoreboard.gd`, `tests/test_hud.gd` | HUD |
| `autoload/profile.gd`, `scripts/ui/hangar_ui.gd`, `scripts/ui/research_tree.gd`, `scripts/ui/logbook_panel.gd`, `scripts/ui/settings_panel.gd`, `scripts/ui/results_screen.gd`, `scenes/hangar.tscn`, `scenes/results.tscn`, `tests/test_profile.gd` | MENUS |
| `scripts/replay/recorder.gd`, `scripts/replay/killcam.gd`, `scripts/replay/replay_player.gd`, `scenes/replay.tscn`, `autoload/sfx.gd`, `tests/test_replay.gd` | REPLAY |

Модуль может добавлять **свои** вспомогательные файлы, если имя начинается с префикса модуля
в той же папке (например `scripts/ui/hud_markers.gd`, `scripts/world/world_clouds.gd`).
Чужие файлы не трогать.

## 2. Автозагрузки

- `Data` — `autoload/data.gd`. Все определения: самолёты, оружие, карты, камуфляжи, звания,
  достижения, экономика. Только данные и чистые функции. Смотри сам файл.
- `Game` — `autoload/game.gd`. Переключение сцен, конфиг текущего боя, результат, повтор,
  ссылка `Game.battle` на `MatchManager` во время боя (иначе `null`), форматирование чисел.
- `Profile` — `autoload/profile.gd` (MENUS). Сохранение игрока.
- `Sfx` — `autoload/sfx.gd` (REPLAY). Процедурные звуки.

### 2.1 Game (готово)
```
var match_config: Dictionary      # см. 9.1
var last_result: Dictionary       # см. 9.3
var result_applied: bool
var last_replay: Dictionary       # см. 10
var battle                        # MatchManager или null
func start_battle(config: Dictionary) -> void
func go_hangar() -> void
func go_results() -> void
func go_replay() -> void
func is_touch() -> bool
func fmt_int(n: int) -> String           # 8000 -> "8 000"
func fmt_speed(ms: float) -> String      # "598 км/ч"
func fmt_alt(m: float) -> String         # "1 250 м"
func fmt_time(sec: float) -> String      # "12:05"
```

### 2.2 Profile (MENUS)
```
signal changed
var data: Dictionary   # см. ниже
func load_profile() -> void              # вызывается в _ready
func save_profile() -> void
func get_setting(key: String)            # ключи из Data.DEFAULT_SETTINGS
func set_setting(key: String, value) -> void   # сохраняет и шлёт changed
func plane_state(id: String) -> String   # "owned" | "researched" | "available" | "locked"
       # owned — куплен; researched — исследован, но не куплен;
       # available — можно исследовать (родитель исследован); locked — родитель не исследован
func is_owned(id) -> bool
func research_progress(id) -> int        # накоплено опыта на исследование id
func set_research_focus(id) -> void
func buy(id) -> bool                     # тратит кредиты, если исследован и хватает
func get_lineup() -> Array               # до 4 id купленных самолётов, без пустых
func set_lineup_slot(slot: int, id: String) -> void   # "" — очистить
func selected_camo(plane_id) -> String
func select_camo(plane_id, camo_id) -> void
func is_camo_unlocked(plane_id, camo_id) -> bool
func camo_unlock_text(plane_id, camo_id) -> String    # "Сбей 5 самолётов на Стриже"
func plane_stats(plane_id) -> Dictionary # {battles, kills, wins, xp}
func player_rank() -> Dictionary         # {name, xp, next_xp}
func apply_battle_result(result: Dictionary) -> Dictionary  # см. 9.4
func grant_achievement(id: String) -> bool   # true, если новое
```
`data` = `{version, credits, total_xp, owned:[], researched:[], research_xp:{id:int}, research_focus:"",
plane_stats:{id:{battles,kills,wins,xp,ground_kills}}, camo:{id:camo_id}, lineup:[], logbook:[], achievements:[],
settings:{}, stats:{battles,wins,kills,ground_kills,deaths,landings}}`.
Новый игрок: `owned = researched = Data.STARTER_PLANES`, `credits = Data.ECONOMY.start_credits`, lineup = стартовые.

## 3. FLIGHT

### 3.1 `class_name FlightModel extends RefCounted`
Модель полёта на основе энергии. Должна давать: набор скорости в пикировании, потерю скорости
в вираже (индуктивное сопротивление), сваливание на малой скорости и большом угле атаки,
ограничение перегрузки подъёмной силой, сопротивление на сверхбольших скоростях, штопор
при несимметричной подъёмной силе. Кобра (`def.high_aoa == true`) получается сама: нос можно задрать
до 90° на средней скорости, скорость резко падает.

```
var def: Dictionary
var pos: Vector3
var vel: Vector3
var basis: Basis
var throttle: float = 0.8          # 0..1, выставляется из controls каждый шаг
var afterburner: bool = false
var gear_down: bool = false
var on_ground: bool = false
var brake: bool = false
var assist: bool = true            # аркада: автотриммер + защита от сваливания
var crashed: bool = false
var crash_reason: String = ""      # "ground" | "water" | "gear" (жёсткая посадка)
# выход (только чтение):
var airspeed: float
var aoa: float                     # рад
var slip: float                    # рад
var g_load: float                  # перегрузка в g (1 в горизонтальном полёте)
var stalled: bool
var overspeed: bool                # выше def.vne
var vertical_speed: float
var mach: float
var engine_rpm: float              # 0..1 для звука
# модификаторы от повреждений (пишет DamageModel.update):
var thrust_factor: float = 1.0
var lift_left: float = 1.0
var lift_right: float = 1.0
var pitch_authority: float = 1.0
var roll_authority: float = 1.0
var yaw_authority: float = 1.0
var extra_drag: float = 0.0
var structural_stress: float = 0.0  # 0..1+, растёт при перегрузке/перескорости; DamageModel читает

func setup(p_def: Dictionary, start_pos: Vector3, start_basis: Basis, start_speed: float, p_on_ground := false) -> void
func step(dt: float, ctrl: Dictionary, surface: Dictionary) -> void
     # ctrl: см. Data.empty_controls(). surface = World.surface_at(pos.x, pos.z)
func forward() -> Vector3          # -basis.z
func up() -> Vector3
func right() -> Vector3
func bank() -> float               # рад, + = крен вправо
func pitch_angle() -> float        # рад, угол носа к горизонту
func heading() -> float            # рад, 0 = на -Z, по часовой
func stall_speed() -> float        # м/с при 1g у земли
```
Земля: контакт, когда `pos.y - def.shape.gear_height <= surface.height`.
- Шасси выпущено, вертикальная скорость > -6 м/с, крен < 15°, тангаж от -5° до +20°,
  `surface.kind` в `runway | deck | ground` и `surface.flat == true` → `on_ground = true` (качение).
- Иначе `crashed = true`, `crash_reason` = "water" для воды, иначе "ground" (или "gear", если шасси было выпущено).
- На земле: колёса, трение качения 0.02, тормоз (`ctrl.brake`) замедляет до 6 м/с², руление `yaw`,
  отрыв, когда подъёмная сила > веса. На палубе авианосца — то же самое.

### 3.2 `class_name DamageModel extends RefCounted`
Модули: `engine`, `fuel`, `left_wing`, `right_wing`, `tail`, `pilot`, `structure`.
Максимальное HP берётся из `def.hp` (умножь на 0.8 в реализме).
```
signal module_damaged(module: String, ratio: float)
signal module_destroyed(module: String)
signal fire_started
signal fire_out
var def: Dictionary
var hp: Dictionary
var max_hp: Dictionary
var on_fire: bool
var engine_dead: bool
var oil_leak: bool
var fuel_leak: bool
var left_wing_lost: bool
var right_wing_lost: bool
var tail_lost: bool
var pilot_dead: bool
var last_attacker: int = -1
var last_hit_time: float = -100.0
func setup(p_def: Dictionary, hardcore: bool) -> void
func apply_hit(local_point: Vector3, damage: float, attacker: int, time_now: float) -> String  # имя модуля
func apply_splash(damage: float, attacker: int, time_now: float) -> void
func update(dt: float, fm: FlightModel) -> void   # пожар, утечки, перегрузка → пишет модификаторы в fm
func is_destroyed() -> bool
func destroyed_reason() -> String   # "pilot" | "wing" | "tail" | "fire" | "structure" | ""
func module_ratio(module: String) -> float   # 0..1 для схемы повреждений
func try_extinguish() -> bool       # раз в 20 с, шанс 70 %
func repair_step(dt: float) -> bool # true, когда полностью отремонтирован (~20 с на всё)
func repair_full() -> void
func is_damaged() -> bool
```
Зоны попадания считаются от `def.shape` (локальные координаты модели):
`|x| > fuselage_radius*1.3` → крыло по знаку x; `z > 0.32*length` → хвост; двигатель: для винтовых
нос (`z < -0.3*length`), для реактивных зад (`0.05*length < z < 0.35*length`); пилот: рядом с
`shape.cockpit_z` (±1.2 м) и `y > 0`; топливо — центр; иначе `structure`.
Последствия: двигатель < 40 % — тяга падает, < 15 % — утечка масла, 0 — стоп. Крыло 0 — отрыв,
подъёмная сила этой стороны 0, сильный крен → штопор. Хвост < 50 % — меньше управляемости, 0 — потеря.
Топливо — утечка, шанс пожара. Пожар отнимает HP у `fuel` и `structure`. Перегрузка выше `def.g_limit`
и перескорость (выше `def.vne * 1.08`) повреждают крылья.

## 4. WEAPONS

### 4.1 `class_name WeaponSystem extends RefCounted`
```
var def: Dictionary
var ammo: Dictionary        # {"guns":[int per gun group], "rockets":int, "bombs":int, "missiles":int, "flares":int}
var max_ammo: Dictionary
var lock_target            # Aircraft или null
var lock_progress: float   # 0..1, захват за 1.2 с
var bomb_cooldown: float
func setup(p_def: Dictionary) -> void
func update(dt: float, owner, ctrl: Dictionary) -> void   # owner: Aircraft. Стреляет через Game.battle.projectiles
func gun_convergence() -> float        # м, дистанция сведения (400)
func gun_speed() -> float              # скорость пули основной группы
func rearm_full() -> void
func rearm_step(dt: float) -> bool     # true, когда всё пополнено (~15 с)
func is_empty() -> bool                # кончилось всё
func has_ordnance() -> bool            # есть бомбы или ракеты
func summary() -> Array                # [{label:"20 мм", cur:int, max:int}, ...] для HUD
```
Оружие привязано к самолёту (`def.weapons`). Ракеты «воздух-воздух» есть только у тех, у кого они
прописаны. Пули имеют разброс 0.3°, трассер каждая 3-я.

### 4.2 `class_name ProjectileManager extends Node3D`
Один на бой (`Game.battle.projectiles`). Пули рисуются через MultiMesh. Попадания по самолётам —
через `Aircraft.ray_hit()`, по наземным целям — сфера `GroundUnit.radius`, по земле — `World.height_at`.
```
func spawn_bullet(from: Vector3, velocity: Vector3, damage: float, caliber: float, owner_uid: int, team: int, tracer: bool) -> void
func spawn_rocket(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void
func spawn_bomb(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void
func spawn_missile(from: Vector3, velocity: Vector3, target, spec: Dictionary, owner_uid: int, team: int) -> void
func spawn_flak(from: Vector3, velocity: Vector3, fuse_time: float, damage: float, radius: float, owner_uid: int, team: int) -> void
func spawn_flare(from: Vector3, velocity: Vector3, team: int) -> void
func incoming_missiles(target) -> int  # сколько ракет летит в этот самолёт (для предупреждения)
func clear() -> void
```
Урон: по самолёту `aircraft.take_hit(local_point, damage, owner_uid)`; взрыв —
`aircraft.take_splash(world_pos, damage, radius, owner_uid)` и `unit.take_damage(dmg, owner_uid, explosive)`.
Своих не бить (`team`). Пули калибра < 12 мм наносят танкам и бункерам 10 % урона.

### 4.3 `class_name Effects extends Node3D`
Один на сцену (`Game.battle.fx`, в повторе — свой). Частицы — `CPUParticles3D`.
```
func explosion(pos: Vector3, size: float) -> void       # size 1 = бомба 100 кг
func hit_spark(pos: Vector3) -> void
func splash(pos: Vector3, size: float) -> void
func smoke_puff(pos: Vector3, size: float) -> void      # разрыв зенитного снаряда
func attach_fire(parent: Node3D, local_pos: Vector3) -> Node3D
func attach_smoke(parent: Node3D, local_pos: Vector3, dark: bool) -> Node3D
func attach_trail(parent: Node3D, local_pos: Vector3) -> Node3D  # инверсионный след законцовки
func debris(pos: Vector3, vel: Vector3, count: int) -> void
func tracer_line(from: Vector3, to: Vector3, color: Color) -> void  # короткая вспышка (для повтора)
```
Взрывы пишут событие в повтор: `Game.battle.recorder.event("explosion", {...})`, если `Game.battle` есть.

## 5. VISUAL

### 5.1 `class_name AircraftMeshBuilder extends RefCounted` (только static)
Процедурные низкополигональные модели по `def.shape`. Каждый самолёт должен узнаваться по силуэту
(винт в носу / два мотора на крыле / одиночный или двойной реактивный, прямое / стреловидное / дельта крыло,
один или два киля). Окраска — `camo` из `Data.camos_for(id)` (цвета + рисунок через шейдер или вершинные цвета).
```
static func build(def: Dictionary, camo: Dictionary) -> Node3D
```
Возвращаемый узел содержит дочерние узлы с такими именами:
`Body`, `LeftWing`, `RightWing`, `Tail` (MeshInstance3D или Node3D), `Gear` (Node3D, видимость = выпущено),
`Prop0..N` (Node3D, вращаются вокруг локальной Z; только у винтовых), `Canopy`,
маркеры `Marker3D`: `Muzzle0..N`, `Engine0..N` (выхлоп/пламя форсажа), `Cockpit` (место камеры),
`WingTipL`, `WingTipR`, `Pylon0..N` (откуда падают бомбы/идут ракеты).
У реактивных — узлы `Afterburner0..N` (MeshInstance3D, видимость при форсаже).
```
static func set_gear(model: Node3D, down: bool) -> void
static func set_afterburner(model: Node3D, on: bool) -> void
static func spin_props(model: Node3D, rpm01: float, dt: float) -> void
static func detach_part(model: Node3D, part: String) -> Node3D   # "LeftWing" | "RightWing" | "Tail"; возвращает узел в мировых координатах
```

### 5.2 `class_name Showroom extends Node3D`
3D-ангар для меню: здание (пол, стены, фермы, свет; текстуры `assets/textures/metal.webp`, `deck.webp`),
самолёт в центре, орбитальная камера (мышь/палец — поворот, колесо/щипок — зум).
```
func show_plane(plane_id: String, camo_id: String) -> void
func set_interactive(on: bool) -> void
func reset_view() -> void
```

## 6. WORLD

### 6.1 `class_name World extends Node3D`
```
var map: Dictionary            # из Data.MAPS
var time_of_day: String        # "dawn" | "day" | "dusk" | "night"
var weather: String            # "clear" | "cloudy" | "overcast" | "fog" | "storm"
var is_night: bool
var airfields: Array           # [{team, kind:"airfield"|"carrier", pos:Vector3, heading:float, length:float, width:float,
                               #   runway_start:Vector3, service_radius:float}]
var zones: Array               # [{id:"A", pos:Vector3, radius:float, max_alt:float}]
var bases: Array               # [{id:int, team:int, pos:Vector3, unit_uids:Array}]
var ground_units: Array        # все GroundUnit
func build(p_map: Dictionary, p_time: String, p_weather: String, seed: int, uid_start: int) -> int
     # строит всё; возвращает следующий свободный uid после наземных целей. Детерминированно по seed.
func height_at(x: float, z: float) -> float          # высота рельефа (может быть < 0 под водой)
func surface_at(x: float, z: float) -> Dictionary    # {height, kind:"ground"|"water"|"runway"|"deck", team:int, flat:bool}
func cloud_density_at(p: Vector3) -> float           # 0..1
func half_size() -> float                            # 5000
func air_spawn(team: int, index: int, altitude: float) -> Dictionary   # {pos, basis, speed}
func runway_spawn(team: int, index: int) -> Dictionary                 # {pos, basis, speed:0, on_ground:true}
func ambient_light_level() -> float   # 0..1 (ночь ~0.25)
```
Карты (`Data.MAPS`): `canyon` (пустыня, каньон с рекой), `fjord` (зима, фьорд), `reef` (океан, острова,
у синих авианосец). Рельеф — функция высоты, меш сеткой ~50 м, текстуры из `assets/textures`
(`sand`, `snow`, `island`, `waves`). Вода — плоскость y=0 с `waves.webp`.
На каждой стороне: аэродром (или авианосец), база (3–4 здания), 2 колонны техники
(3 танка + 1 зенитка), 2–3 зенитные позиции у аэродрома и базы; на `reef` ещё корабли.
В центре 3 зоны захвата `A`, `B`, `C` (радиус 450 м, высота до 500 м над землёй).
Небо, время суток, погода — `sky.gd`: `WorldEnvironment` + `DirectionalLight3D` + туман;
облака — скопления полупрозрачных billboard-спрайтов на высоте 900–1800 м; гроза — темно,
дождь у камеры, вспышки молний. Ночью ярче трассеры и огни ВПП.

### 6.2 `class_name GroundUnit extends Node3D`
```
signal destroyed(unit, killer_uid: int)
var uid: int
var kind: String     # "tank" | "aa" | "truck" | "ship" | "building" | "carrier"
var team: int
var hp: float
var max_hp: float
var alive: bool
var radius: float
var armored: bool    # пули < 12 мм почти не берут
var base_id: int     # -1, если не часть базы
var ticket_value: int
func setup(p_kind: String, p_team: int, p_pos: Vector3, p_heading: float, p_uid: int, world) -> void
func take_damage(amount: float, attacker_uid: int, explosive: bool) -> void
func set_path(points: Array) -> void    # для колонн: едут по точкам, по рельефу
```
Зенитки (`aa`) и корабли стреляют по ближайшему вражескому самолёту в радиусе 2200 м (корабли 3000 м):
упреждение + разброс, очереди трассерами через `Game.battle.projectiles.spawn_bullet`, а корабли и
крупные позиции — `spawn_flak`. Не видят цель в облаке. Танки и грузовики не стреляют.
Значения `ticket_value`: tank 15, truck 8, aa 12, ship 40, building 25, carrier 0 (неуязвим).

## 7. ENTITY

### 7.1 `class_name Aircraft extends Node3D`
```
signal destroyed(aircraft, killer_uid: int, reason: String)
signal serviced(aircraft)            # закончил ремонт и перезарядку на своём аэродроме
var uid: int
var team: int
var def_id: String
var def: Dictionary
var callsign: String
var camo_id: String
var is_player: bool
var alive: bool = true
var fm: FlightModel
var dmg: DamageModel
var weapons: WeaponSystem
var pilot                            # PlayerPilot или BotPilot (у него есть get_controls)
var model: Node3D
var controls: Dictionary             # последние управляющие команды
var in_cloud: bool
var servicing: bool                  # стоит на своей полосе, идёт ремонт/перезарядка
var service_progress: float          # 0..1
func setup(p_def_id: String, p_team: int, p_uid: int, p_callsign: String, p_camo: String,
           spawn: Dictionary, opts: Dictionary) -> void
     # spawn = {pos, basis, speed, on_ground}; opts = {assist:bool, hardcore:bool, is_player:bool}
func set_pilot(p) -> void
func take_hit(local_point: Vector3, damage: float, attacker_uid: int) -> void
func take_splash(world_pos: Vector3, damage: float, radius: float, attacker_uid: int) -> void
func ray_hit(from: Vector3, to: Vector3) -> Dictionary   # {hit:bool, local_point:Vector3, world_point:Vector3}
func hit_radius() -> float
func forward() -> Vector3
func velocity() -> Vector3
func speed() -> float
func altitude_agl() -> float
```
Каждый `_physics_process`: `controls = pilot.get_controls(self, dt)` → `fm.step` → `dmg.update` →
`weapons.update` → трансформ из `fm` → визуал (шасси, винты, форсаж, дым/огонь от повреждений,
отрыв крыла через `detach_part`) → звук двигателя → проверка гибели.
Гибель: `dmg.is_destroyed()` или `fm.crashed`. Сигнал `destroyed` один раз; `killer_uid` —
`dmg.last_attacker`, если попадание было не позже 20 с назад, иначе -1. После поражения обломки
падают до земли, потом взрыв и `queue_free()` через 3 с. Выход за границу карты (|x| или |z| > 5200)
10 с подряд — гибель с причиной "border".
Обслуживание: на своей полосе/палубе (`surface.team == team`, в `service_radius`), скорость < 8 м/с,
шасси выпущено → `servicing = true`, ремонт `dmg.repair_step`, затем `weapons.rearm_step`, сигнал `serviced`.

### 7.2 `class_name PlayerPilot extends Node`
Режимы: `mouse` (наведение мышью: камера смотрит по `aim_dir`, самолёт доворачивает нос на точку
прицела), `keyboard` (стрелки/WASD — прямое управление), `touch` (перетаскивание по экрану двигает
прицел, кнопки огня — `TouchControls`). Клавиши — действия из `project.godot`.
```
var aim_dir: Vector3          # мировое направление прицела (для мыши/тача)
var mode: String              # "mouse" | "keyboard" | "touch"
var touch_input: Dictionary   # пишет TouchControls: {stick:Vector2, guns, rocket, bomb, missile, flares, afterburner}
func get_controls(ac, dt: float) -> Dictionary
func reset_aim(ac) -> void
```

### 7.3 `class_name BotPilot extends Node`
```
var skill: float = 0.5          # 0..1: точность, реакция, допустимая перегрузка
var role: String                # "fighter" | "attacker" (из def.line)
var target                      # текущая цель (Aircraft или GroundUnit) или null
var state: String               # "patrol" | "engage" | "attack_ground" | "evade" | "capture" | "return"
func get_controls(ac, dt: float) -> Dictionary
```
Поведение: облёт рельефа (смотреть вперёд на 3 с по `World.height_at`), не сваливаться (держать скорость
выше `1.3 * stall_speed`), упреждение при стрельбе, разворот от границы карты, уход от ракет (ловушки),
штурмовики атакуют наземные цели и потом защищаются, часть ботов летит в зоны захвата низко.
Боты не видят цели в облаке дальше 300 м.

### 7.4 `class_name CameraRig extends Node3D`
```
enum Mode { CHASE, COCKPIT, FREE_LOOK, SPECTATE, FIXED }
var mode: int
var camera: Camera3D
var target                       # Aircraft
func follow(ac) -> void
func set_mode(m: int) -> void
func toggle_cockpit() -> void
func spectate(ac) -> void
func shake(amount: float) -> void
```
В `CHASE` камера сзади-сверху, смотрит по `pilot.aim_dir` (если мышь/тач). Поле зрения 70°, далёкая
плоскость 14 000 м.

## 8. MATCH

### 8.1 `class_name MatchManager extends Node3D` (корень `scenes/battle.tscn`)
Строит всё из `Game.match_config`. Ставит `Game.battle = self` в `_enter_tree`, `null` в `_exit_tree`.
```
signal kill_event(text: String, killer_team: int, victim_team: int)
signal message(text: String, seconds: float)
signal state_changed(state: String)
signal player_spawned(ac)
signal player_killed(info: Dictionary)   # {killer_name, killer_plane, killer_uid, reason}
signal match_ended(result: Dictionary)
var config: Dictionary
var mode: String                 # "arcade" | "realistic" | "training" | "test"
var world: World
var projectiles: ProjectileManager
var fx: Effects
var recorder: Recorder
var camera_rig: CameraRig
var hud                           # BattleHUD
var aircraft: Array               # живые и падающие Aircraft
var ground_units: Array
var player                        # Aircraft или null
var player_pilot: PlayerPilot     # один на бой, переиспользуется при респауне
var tickets: Array                # [синие, красные] (float)
var max_tickets: float
var time_left: float
var elapsed: float
var zones_state: Array            # [{id, owner:-1|0|1, progress:-1..1}]
var state: String                 # "spawn" | "flying" | "killcam" | "dead" | "ended"
var spawn_points: int
var lineup: Array                 # id самолётов игрока
var lineup_uses: Dictionary       # id -> сколько вылетов осталось
var markers_enabled: bool         # аркада
var paused: bool
func next_uid() -> int
func get_entity(uid: int)         # Aircraft или GroundUnit или null
func enemies_of(team: int) -> Array          # живые самолёты
func ground_targets_of(team: int) -> Array   # живые наземные цели этой команды
func spawn_cost(def_id: String) -> int
func can_spawn(def_id: String) -> bool
func request_spawn(def_id: String) -> bool
func get_scoreboard() -> Array    # [{uid, name, team, plane, kills, ground, deaths, score, is_player}]
func player_stats() -> Dictionary
func set_paused(on: bool) -> void
func quit_to_hangar() -> void     # засчитывается как "exit"
```
Правила:
- Размер боя 4×4 или 8×8 (режима на 25 самолётов больше нет). Остальные места — боты (`Matchmaker`).
- **Аркада**: старт в воздухе (истребители 1500 м, штурмовики 800 м), маркеры над всеми, автотриммер.
  Сетап до 4 самолётов, каждый можно взять 2 раза. Первый вылет бесплатно, дальше — за очки вылета
  (`Data.ECONOMY.spawn_cost_by_rank`). Очки: сбитый 150, наземная цель 40–100, захват 100, помощь 50.
  Боты возрождаются до 2 раз.
- **Реализм**: старт на своей полосе/палубе, одна жизнь, без маркеров (только союзник ближе 800 м),
  без автотриммера, повреждения сильнее (`hardcore`), затемнение от перегрузки. Боты тоже по 1 жизни
  (стартуют в воздухе над своим аэродромом, чтобы не толпиться на полосе).
- **Очки команды** (`tickets`): 4×4 — 700, 8×8 — 1000. Отнимаются: потерян самолёт −30, наземная цель —
  её `ticket_value`, база уничтожена целиком −150. Зоны: если у команды зон больше, у соперника уходит
  `3 × разница` очков в секунду. Захват: свои самолёты в зоне ниже `max_alt` над землёй, чужих нет —
  прогресс 8 с на захват.
- Победа: у соперника 0 очков, или у соперника не осталось самолётов и вылетов. Время боя 15 мин;
  по окончании больше очков — победа, поровну — ничья.
- **Training** (`training.gd`, `class_name TrainingDirector extends Node`): обучение по шагам
  (газ, повороты, стрельба по мишеням, бомба по цели, посадка и перезарядка). Подсказки через `message`.
- **Test**: тестовый полёт на любом самолёте (`config.test_plane`), даже не исследованном, без наград.
  Мишени-дроны и наземные цели, бесконечные вылеты.
- Смерть игрока → `state = "killcam"` → `Killcam.play` (6 с) → `state = "spawn"` (или конец в реализме).
- Конец → `recorder.finish()` → `Game.last_replay`, `Game.last_result` → через 4 с `Game.go_results()`.

### 8.2 `class_name Matchmaker extends RefCounted` (static)
```
static func lineup_level(lineup: Array) -> float     # максимальный уровень боя в сетапе
static func pick_bots(level: float, count: int, team: int, rng: RandomNumberGenerator) -> Array
     # [{def_id, skill, callsign}] — самолёты с уровнем в [level-1.0, level+0.7]; если таких нет — ближайшие
```

## 9. Данные боя

### 9.1 `Game.match_config`
`{mode, size:4|8, map_id, time_of_day:"random"|..., weather:"random"|..., lineup:Array, test_plane:String,
 seed:int, autopilot:bool}` — `autopilot` только для тестов: игроком управляет бот.

### 9.2 Тексты убийств
`"Стриж (Иней) сбил Кречет (Гром)"` — без украшений.

### 9.3 `Game.last_result`
`{mode, map_id, outcome:"win"|"loss"|"draw"|"exit", duration, planes_used:[ids], kills, ground_kills, assists,
 deaths, captures, landings, score, xp_by_plane:{id:int}, credits:int, scoreboard:Array, time_of_day, weather,
 cobra:bool}`. `credits` и `xp_by_plane` считает MatchManager по `Data.ECONOMY`.
В режиме test наград нет (`xp_by_plane = {}`, `credits = 0`).

### 9.4 `Profile.apply_battle_result(result)` возвращает
`{credits_earned, repair_cost, credits_delta, xp_total, research:[{id, name, have, need, done:bool}],
 achievements:[название], camos:[название], rank_up:String}`. Ремонт: `def.repair` за каждый потерянный
самолёт, итог за бой не уходит ниже 0.

### 9.5 Правила боя: очки команд, зоны, вылеты, боты
Эти правила главнее кратких строк в 8.1. Числа — в `Data.ECONOMY`.
- **Очки команды** (`ECONOMY.tickets`): 4×4 — 700, 8×8 — 1 300 (в 8×8 вдвое больше самолётов и потерь).
  Потерян самолёт −30, наземная цель — её `ticket_value`, база целиком −150.
- **Зоны.** Перевес в одну зону снимает всю полосу очков соперника за `zone_drain_seconds` (900 с):
  `потеря в секунду = max_tickets / zone_drain_seconds × (зон у нас − зон у них)`. 4×4: 700 / 900 ≈ 0,78 очка/с
  за зону, 8×8: 1 300 / 900 ≈ 1,44. `MatchManager.zone_drain_rate()` возвращает потерю за одну зону.
- **Захват:** свои в зоне ниже `max_alt` над землёй, чужих нет — 8 с от нейтральной, 16 с от чужой.
  Сообщения: «Зона A захвачена» (синие), «Зона A потеряна» (красные отбили нашу), «Красные заняли зону A» (была ничья).
- **Учёт потерь** для баланса: `MatchManager.ticket_log = {zones, aircraft, ground, bases}` — по `[синие, красные]`.
- **Аркада, вылеты игрока:** первый вылет на каждом самолёте сетапа бесплатный, повторный — за
  `spawn_cost_by_rank[ранг]`; каждый самолёт — не больше `arcade_uses_per_plane` (2) раз. `spawn_cost(id)` отдаёт
  настоящую цену (0 для первого вылета на этом самолёте, в реализме, обучении и тестовом полёте). Нет вылета из-за
  очков — «Не хватает очков вылета», вылеты кончились — «Вылетов не осталось».
- **Боты на захвате.** Раз в 2 с бой назначает около трети живых ботов команды (не меньше одного, считая
  автопилот игрока) на захват, пока у команды не все зоны или в своей зоне есть враг; остальные воюют как обычно.
  Поля `BotPilot.capture_duty` и `BotPilot.duty_zone` (id зоны); зоны разводятся, своя зона с врагом — первой.
  Бот на захвате отвлекается только на врага ближе 1 000 м, на того, кто сидит у него на хвосте, или на врага
  ближе 1 800 м, если по нему попали в последние 4 с. Штурмовики тоже захватывают.
- **Возврат ботов.** Нет патронов (и ракет, а у штурмовика ещё бомб) или тяжёлые повреждения (крыло или хвост ниже
  35 %, конструкция ниже 30 %, течь топлива; с разбитым двигателем и при пожаре бот воюет дальше — домой ему не
  долететь) → `state = "return"`, `BotPilot.return_reason` = `"ammo"` | `"damage"`, `BotPilot.land_phase`:
  `cruise → approach → final → rollout → (taxi) → service → (lineup) → takeoff → climb`. На земле бот ждёт сигнал
  `serviced` (ремонт и перезарядка самолёта), взлетает и снова воюет; бой считает посадку (`bot_log.landings`).
  Посадка по-настоящему — на аэродромы, куда есть прямой заход. На палубу авианосца, на аэродром в котловине
  (рельеф круче 7° на заходе, например фьорд) и после двух уходов на второй круг бот проходит низко над полосой
  (ниже 170–220 м над ней), и бой засчитывает посадку: `MatchManager.bot_fake_landing(ac)` убирает самолёт без
  потери жизни и очков и через 20 с выпускает того же бота заново (`bot_log.fake_landings`). Самолёт игрока так
  не убирается. Разбился на заходе — `bot_log.landing_crashes`.
- **Зенитки.** Бот не гонится за целью дальше 900 м в зону досягаемости вражеских зениток и кораблей
  (кроме того, кто его атакует), точки патруля выбирает вне её; штурмовик сначала бьёт зенитки, цель под прикрытием
  других зениток выбирает реже.
- **Взлёт бота с полосы** (реализм, автопилот игрока, после обслуживания): полный газ, крылья ровно, нос по оси;
  нос поднимается после 1,1 скорости сваливания, после отрыва — набор по углу траектории, шасси убираются выше 30 м.
  Если горы впереди ближе, чем самолёт наберёт высоту, — круги над аэродромом до высоты выше гор. Катапульта
  авианосца стреляет сама при газе ≥ 0,9 и выпущенных шасси; бот держит полный газ и не тянет ручку до отрыва.

## 10. REPLAY

### 10.1 `class_name Recorder extends Node`
```
func start(battle) -> void
func event(type: String, data: Dictionary) -> void     # "explosion" | "kill" | "tracer" | "ground_destroyed" | "spawn"
func current_time() -> float
func finish() -> Dictionary                              # данные повтора (см. ниже), кладёт в Game.last_replay
func window(t_from: float, t_to: float) -> Dictionary    # кусок для киллкама
```
Запись 20 раз в секунду: позиция, поворот, флаги (жив, горит, шасси, форсаж) каждого самолёта,
состояние наземных целей. Формат внутренний, но обязательно поля:
`{version, map_id, time_of_day, weather, seed, duration, planes:{uid:{def_id, team, camo, callsign}}, ...}`.
Последний повтор также сохраняется в `user://replays/last.json`.

### 10.2 `class_name Killcam extends Node3D`
```
signal finished
func play(battle, victim_uid: int, killer_uid: int, seconds := 6.0) -> void
```
Показывает последние секунды из записи: призрачные модели (`AircraftMeshBuilder`), камера за убийцей,
надпись «Вас сбил: Иней, Кречет». Пропуск — любая клавиша огня/Esc/тап.

### 10.3 `scenes/replay.tscn` (`replay_player.gd`)
Загружает `Game.last_replay` (или файл), строит тот же мир (`World.build` с тем же seed),
модели, эффекты по событиям. Управление: пауза, скорость 0.25/0.5/1/2/4, перемотка ползунком,
выбор самолёта, камеры: сзади, кабина, облёт, свободная. Кнопка «Назад».

### 10.4 Sfx (autoload)
```
func play(name: String, pos = null, volume_db := 0.0, pitch := 1.0) -> void
     # имена: gun_small, gun_large, cannon, rocket, bomb_drop, explosion_small, explosion_big, hit, flak,
     #        missile_launch, lock_tone, missile_warning, stall_warning, gear, click, splash, rearm_done, capture
func make_engine(kind: String) -> AudioStreamPlayer3D   # "prop" | "jet"; зацикленный, pitch меняет владелец
func set_engine(player: AudioStreamPlayer3D, rpm01: float, afterburner: bool) -> void
func make_wind() -> AudioStreamPlayer
```
Все звуки генерируются кодом при старте (AudioStreamWAV), никаких файлов. Громкость из настроек
`engine_volume`, `effects_volume`.

## 11. HUD и меню

### 11.1 `class_name BattleHUD extends CanvasLayer` (`hud.gd`)
```
func bind(battle) -> void
```
Показывает: прицел пушек (точка сведения), круг наведения мыши, упреждение (только аркада),
маркеры самолётов с дистанцией (аркада; в реализме только союзники ближе 800 м), скорость, высоту, газ,
форсаж, перегрузку, предупреждения «Сваливание», «Пожар: T», «Ракета!», боезапас, схему повреждений
модулей, очки команд полосой, таймер, состояние зон A/B/C, ленту сбитых, сообщения, миникарту,
затемнение от перегрузки (реализм), белую пелену в облаке, прогресс обслуживания на аэродроме.
В режиме кабины — приборная панель (`cockpit_panel.gd`). Внутри — меню вылета (`spawn_menu.gd`),
пауза (`pause_menu.gd`, Esc), таблица (`scoreboard.gd`, Tab), сенсорные кнопки (`touch_controls.gd`,
только если `Game.is_touch()` или настройка).

### 11.2 Меню (MENUS)
`scenes/hangar.tscn`: 3D `Showroom` + `HangarUI`. Вкладки: **Ангар**, **Исследование**, **Журнал**, **Настройки**.
- Ангар: самолёт (название, класс, ранг, уровень боя, скорость, ТТХ одной строкой, вооружение),
  камуфляжи, сетап из 4 слотов, режим (Аркада / Реализм), размер (4×4 / 8×8), карта (Случайная + 3),
  время (Случайное / Утро / День / Вечер / Ночь), погода (Случайная / Ясно / Облачно / Туман / Гроза),
  кнопки «В бой», «Обучение», «Тестовый полёт». Наверху: кредиты, звание, опыт.
- Исследование: дерево 2 линии × 3 ранга, у каждой карточки состояние и кнопка «Исследовать» /
  «Купить за N» / «В сетап» / «Тест».
- Журнал: последние 50 боёв, общая статистика, достижения, кнопка «Последний повтор».
- Настройки: графика (Низкая/Средняя/Высокая), управление (Мышь/Клавиатура), чувствительность, инверсия,
  сенсорные кнопки (Авто/Вкл/Выкл), размер кнопок, огонь слева, громкость двигателя и эффектов, поле зрения.
`scenes/results.tscn`: итог боя, таблица, награды (`Profile.apply_battle_result` один раз, флаг
`Game.result_applied`), прогресс исследования, новые достижения и камуфляжи, кнопки «Повтор» и «В ангар».

## 12. Тесты

`tests/test_runner.tscn` (+`tests/run_all.gd`) запускает все `tests/test_*.gd`.
Каждый тестовый файл: `extends RefCounted`, функция `func run(tree: SceneTree) -> Array` (может быть
корутиной с `await`), возвращает список строк-ошибок (пустой = всё хорошо).
Запуск:
```
godot --headless --path skybreak --import          # один раз, создаёт .godot/
godot --headless --path skybreak res://tests/test_runner.tscn
godot --headless --path skybreak res://tests/test_runner.tscn -- --only=flight
```
Скриншоты для проверки (нужен xvfb):
```
xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 --resolution 1280x720 <сцена>
```
