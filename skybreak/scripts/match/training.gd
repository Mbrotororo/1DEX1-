class_name TrainingDirector
extends Node
## Обучение по шагам (режим "training") и мишени для тестового полёта (режим "test").
## Подсказки идут через battle.message. Текущая подсказка всегда лежит в hint.

const DronePilot = preload("res://scripts/match/match_drone_pilot.gd")

const STEP_THROTTLE := 1
const STEP_TURN := 2
const STEP_CLIMB := 3
const STEP_TARGETS := 4
const STEP_BOMB := 5
const STEP_LAND := 6
const STEP_DONE := 7

const HINT_REPEAT := 10.0
const TRAINING_DRONE := "burevestnik"
const DRONE_COUNT := 3
const TEST_DRONES := 4
const TEST_DRONE_RESPAWN := 8.0
const TRAINING_ORBIT := 1000.0      # радиус круга мишеней в обучении
const AA_RANGE := 2200.0            # дальность зениток (WORLD)
const SHIP_RANGE := 3000.0
const AA_MARGIN := 500.0
const BEACON_RADIUS := 7.0
const BEACON_HEIGHT := 900.0
const BOMB_REFILL_DELAY := 5.0      # шаг с бомбой: бомбы кончились, а цель цела — через столько пополнить

var battle = null
var step: int = 0                  # 1..7 в обучении; 0 — шагов нет
var hint: String = ""
var objective = null               # цель на шаге 5 (GroundUnit) или null
var drones: Array = []
var drone_kills: int = 0
var drones_needed: int = DRONE_COUNT

var _step_t: float = 0.0
var _throttle_t: float = 0.0
var _repeat_t: float = 0.0
var _start_heading: float = 0.0
var _target_alt: float = 1500.0
var _step_ready: bool = false
var _airborne: bool = false
var _landed: bool = false
var _takeoff_hint: bool = false
var _done_t: float = -1.0
var _refill_t: float = -1.0
var _beacon: MeshInstance3D = null
var _drone_queue: Array = []       # [{t, slot}] — мишени, которые надо вернуть
var _test_slots: Array = []
var _train_center: Vector3 = Vector3.ZERO
var _train_alt: float = 1000.0
var _units_frozen: bool = false
var _rng := RandomNumberGenerator.new()

func start(p_battle) -> void:
	battle = p_battle
	_rng.seed = int(battle.config.get("seed", 1)) * 31 + 7
	if not battle.is_connected("player_spawned", _on_player_spawned):
		battle.connect("player_spawned", _on_player_spawned)
	# наземные цели стоят и не стреляют: свои зенитки не сбивают мишени, чужие не мешают учиться
	var w = battle.world
	if w != null and w.has_method("set_units_active"):
		w.set_units_active(false)
		_units_frozen = true
	if battle.mode == "training":
		_enter(STEP_THROTTLE)
	elif battle.mode == "test":
		_spawn_test_drones()
		battle.message.emit("Тестовый полёт. Выход: Esc", 5.0)

## Обучение: при гибели на шаге посадки возрождаться на полосе.
func wants_runway_spawn() -> bool:
	return battle != null and battle.mode == "training" and step == STEP_LAND

func spawn_altitude() -> float:
	return 900.0

func _physics_process(dt: float) -> void:
	tick(dt)

## Один шаг логики (вызывается каждый физический кадр; тесты зовут напрямую).
func tick(dt: float) -> void:
	if battle == null or not is_instance_valid(battle) or battle.state == "ended":
		return
	_update_drone_queue(dt)
	if battle.mode != "training":
		return
	if _done_t >= 0.0:
		_done_t -= dt
		if _done_t <= 0.0:
			_done_t = -1.0
			battle.finish_match("win")
		return
	var ac = battle.player
	if ac == null or not is_instance_valid(ac) or not bool(ac.alive):
		return
	var fm = ac.get("fm")
	if fm == null:
		return
	if not _step_ready:
		_prepare_step(ac, fm)
	_scale_beacon(_pos(fm))
	_step_t += dt
	_repeat_t -= dt
	if _repeat_t <= 0.0 and step < STEP_DONE:
		_say(hint)
	match step:
		STEP_THROTTLE:
			if _throttle(ac, fm) > 0.9:
				_throttle_t += dt
			else:
				_throttle_t = 0.0
			if _throttle_t >= 3.0:
				_enter(STEP_TURN)
		STEP_TURN:
			var diff := absf(wrapf(_heading(fm) - _start_heading, -PI, PI))
			if diff >= deg_to_rad(90.0) - 0.001:
				_enter(STEP_CLIMB)
		STEP_CLIMB:
			if _pos(fm).y >= _target_alt:
				_enter(STEP_TARGETS)
		STEP_TARGETS:
			if drone_kills >= drones_needed:
				_enter(STEP_BOMB)
		STEP_BOMB:
			if objective == null or not is_instance_valid(objective) or not bool(objective.alive):
				_enter(STEP_LAND)
			else:
				_update_bomb_refill(ac, dt)
		STEP_LAND:
			_update_landing(ac, fm)

func _prepare_step(ac, fm) -> void:
	_step_ready = true
	match step:
		STEP_TURN:
			_start_heading = _heading(fm)
		STEP_CLIMB:
			var y := _pos(fm).y
			_target_alt = maxf(1500.0, ceilf((y + 400.0) / 100.0) * 100.0)
			_say("Набери высоту %s м" % Game.fmt_int(int(_target_alt)))
		STEP_TARGETS:
			if _alive_drones() == 0:
				_spawn_training_drones(ac, fm)
		STEP_BOMB:
			if objective == null or not is_instance_valid(objective) or not bool(objective.alive):
				objective = _pick_ground_target(_pos(fm))
			if objective == null:
				_enter(STEP_LAND)
				return
			if objective.has_signal("destroyed") and not objective.is_connected("destroyed", _on_objective_destroyed):
				objective.connect("destroyed", _on_objective_destroyed)
			_place_beacon(objective.global_position, Color(1.0, 0.55, 0.2, 0.5))
			_say(_bomb_text(ac))
		STEP_LAND:
			_airborne = not bool(fm.on_ground)
			_landed = false
			var af := _home_airfield()
			if not af.is_empty():
				_place_beacon(af.pos, Color(0.35, 0.85, 0.5, 0.45))

## Шаг с бомбой: если бомбы (ракеты) ушли мимо, через пару секунд даём новые.
## Самолёт без бомб и ракет добивает цель из пушек.
func _update_bomb_refill(ac, dt: float) -> void:
	var w = ac.get("weapons")
	if w == null or _bomb_weapon(ac) == "guns":
		return
	if bool(w.has_ordnance()):
		_refill_t = -1.0
		return
	if _refill_t < 0.0:
		_refill_t = BOMB_REFILL_DELAY
		return
	_refill_t -= dt
	if _refill_t <= 0.0:
		_refill_t = -1.0
		w.rearm_full()
		_say(("Бомбы пополнены. " if _bomb_weapon(ac) == "bombs" else "Ракеты пополнены. ") + _bomb_text(ac))

func _enter(n: int) -> void:
	step = n
	_step_t = 0.0
	_refill_t = -1.0
	_throttle_t = 0.0
	_step_ready = false
	_takeoff_hint = false
	if n != STEP_BOMB and n != STEP_LAND:
		_remove_beacon()
	match n:
		STEP_THROTTLE:
			_say(_key("Дай полный газ", "W"))
		STEP_TURN:
			_say(_turn_text())
		STEP_CLIMB:
			hint = "Набери высоту %s м" % Game.fmt_int(int(_target_alt))
			_repeat_t = 0.0
		STEP_TARGETS:
			drone_kills = 0
			_say("Сбей %d %s" % [drones_needed, _plural(drones_needed, "мишень", "мишени", "мишеней")])
		STEP_BOMB:
			_remove_beacon()
			hint = "Уничтожь цель бомбой: B"
			_repeat_t = 0.0
			var pl = battle.player
			if pl != null and is_instance_valid(pl):
				hint = _bomb_text(pl)
		STEP_LAND:
			_remove_beacon()
			objective = null
			_say("Сядь на свой аэродром. " + _key("Выпусти шасси", "G"))
		STEP_DONE:
			_remove_beacon()
			hint = "Обучение пройдено"
			battle.message.emit(hint, 6.0)
			_done_t = 4.0
	# у шагов, где нужен самолёт, подготовка — на первом кадре с живым игроком
	var ac = battle.player
	if ac != null and is_instance_valid(ac) and bool(ac.alive) and ac.get("fm") != null:
		_prepare_step(ac, ac.fm)

func _say(text: String) -> void:
	hint = text
	_repeat_t = HINT_REPEAT
	if text != "":
		battle.message.emit(text, HINT_REPEAT)

func _turn_text() -> String:
	var ctl = Profile.get_setting("control") if Profile.has_method("get_setting") else "mouse"
	if Game.is_touch():
		return "Поверни на 90°: веди пальцем по экрану"
	if String(ctl) == "keyboard":
		return "Поверни на 90°: стрелки влево и вправо"
	return "Поверни на 90°: веди мышью"

## «Выпусти шасси: G» на клавиатуре; на сенсорном экране клавиши нет, там своя кнопка.
func _key(text: String, key: String) -> String:
	if Game.is_touch():
		return text
	return "%s: %s" % [text, key]

static func _plural(n: int, one: String, few: String, many: String) -> String:
	var n10 := n % 10
	var n100 := n % 100
	if n10 == 1 and n100 != 11:
		return one
	if n10 >= 2 and n10 <= 4 and (n100 < 10 or n100 >= 20):
		return few
	return many

func _bomb_weapon(ac) -> String:
	var d = ac.get("def")
	if d is Dictionary and d.has("weapons"):
		if int(d.weapons.bombs.count) > 0:
			return "bombs"
		if int(d.weapons.rockets.count) > 0:
			return "rockets"
	return "guns"

func _bomb_text(ac) -> String:
	match _bomb_weapon(ac):
		"bombs":
			return _key("Уничтожь цель бомбой", "B")
		"rockets":
			return _key("Уничтожь цель ракетами", "R")
	return "Уничтожь цель из пушек"

func _update_landing(ac, fm) -> void:
	var on_ground := bool(fm.on_ground)
	var p := _pos(fm)
	if not on_ground and p.y - maxf(battle.world.height_at(p.x, p.z), 0.0) > 20.0:
		_airborne = true
	if not _airborne:
		if on_ground and not _takeoff_hint and _step_t > 0.5:
			_takeoff_hint = true
			_say(_key("Дай полный газ", "W") + ", на разбеге потяни на себя")
		return
	if _landed:
		_enter(STEP_DONE)
		return
	if on_ground:
		var s: Dictionary = battle.world.surface_at(p.x, p.z)
		if String(s.get("kind", "")) in ["runway", "deck"] and int(s.get("team", -1)) == int(ac.team):
			_enter(STEP_DONE)

func _on_player_spawned(ac) -> void:
	if ac.has_signal("serviced") and not ac.is_connected("serviced", _on_serviced):
		ac.connect("serviced", _on_serviced)
	if battle.mode == "training":
		_step_ready = false
		_repeat_t = 0.0

func _on_serviced(_ac) -> void:
	if step == STEP_LAND and _airborne:
		_landed = true

func _on_objective_destroyed(_unit, _killer: int) -> void:
	if step == STEP_BOMB:
		_enter(STEP_LAND)

# ---------------------------------------------------------------- мишени

func _spawn_training_drones(ac, fm) -> void:
	_clear_drones()
	var p := _pos(fm)
	var f: Vector3 = -fm.basis.z
	f.y = 0.0
	if f.length() < 0.1:
		f = Vector3(0, 0, -1) if int(ac.team) == 0 else Vector3(0, 0, 1)
	f = f.normalized()
	_train_center = _find_clear_spot(p + f * 2200.0, TRAINING_ORBIT, [])
	_train_alt = maxf(p.y, _ground(_train_center) + 400.0)
	for i in DRONE_COUNT:
		_spawn_training_slot(i)

func _spawn_training_slot(i: int) -> void:
	var ang := TAU * float(i) / float(DRONE_COUNT)
	var radial := Vector3(cos(ang), 0.0, sin(ang))
	var pos := _train_center + radial * TRAINING_ORBIT
	pos.y = maxf(_train_alt + 40.0 * (float(i) - 1.0), _ground(pos) + 350.0)
	# по часовой: касательная для поворота вправо
	var tangent := Vector3(-radial.z, 0.0, radial.x)
	_spawn_drone(TRAINING_DRONE, pos, atan2(tangent.x, -tangent.z), i, 1.0, _train_center, TRAINING_ORBIT)

func _spawn_test_drones() -> void:
	var level := float(Data.plane(String(battle.lineup[0])).get("level", 1.0))
	var picks: Array = Matchmaker.pick_bots(level, TEST_DRONES, 1, _rng)
	var home := _home_airfield()
	var prefer := Vector3.ZERO
	if not home.is_empty():
		var hp: Vector3 = home.pos
		prefer = Vector3(hp.x, 0.0, hp.z) * 0.35
	var alts := [700.0, 1000.0, 1300.0, 1600.0]
	_test_slots = []
	var taken: Array = []
	for i in TEST_DRONES:
		var def_id := String(picks[i].def_id)
		var r := DronePilot.min_orbit_radius(_drone_speed(def_id), 0.6)
		var c := _find_clear_spot(prefer, r, taken)
		taken.append(c)
		_test_slots.append({"pos": c, "alt": float(alts[i]), "def_id": def_id, "dir": 1.0 if i % 2 == 0 else -1.0, "radius": r})
	for i in TEST_DRONES:
		_spawn_test_slot(i)

func _spawn_test_slot(i: int) -> void:
	var slot: Dictionary = _test_slots[i]
	var c: Vector3 = slot.pos
	var r := float(slot.radius)
	var ang := _rng.randf_range(0.0, TAU)
	var radial := Vector3(cos(ang), 0.0, sin(ang))
	var pos := c + radial * r
	pos.y = maxf(float(slot.alt), _ground(pos) + 400.0)
	var dir := float(slot.dir)
	var tangent := Vector3(-radial.z, 0.0, radial.x) * dir
	_spawn_drone(String(slot.def_id), pos, atan2(tangent.x, -tangent.z), i, dir, c, r)

func _drone_speed(def_id: String) -> float:
	return maxf(70.0, _stall_speed(Data.plane(def_id)) * 1.5)

func _spawn_drone(def_id: String, pos: Vector3, heading: float, slot: int, dir: float, center: Vector3, radius: float):
	var pilot = DronePilot.new()
	pilot.mode = "orbit"
	pilot.circle_dir = dir
	pilot.orbit_center = center
	pilot.orbit_radius = radius
	pilot.heading_target = heading
	pilot.target_alt = pos.y
	var def: Dictionary = Data.plane(def_id)
	pilot.target_speed = _drone_speed(def_id)
	pilot.role = String(def.get("line", "fighter"))
	var spawn := {"pos": pos, "basis": Basis(Vector3.UP, -heading), "speed": pilot.target_speed, "on_ground": false}
	var name := "Мишень %d" % (slot + 1)
	var ac = battle.spawn_bot(def_id, 1, name, 0.0, spawn, pilot, true)
	if ac == null:
		return null
	drones.append(ac)
	ac.set_meta("drone_slot", slot)
	if ac.has_signal("destroyed"):
		ac.connect("destroyed", _on_drone_destroyed)
	return ac

func _on_drone_destroyed(ac, killer_uid: int, _reason: String) -> void:
	drones.erase(ac)
	var slot := int(ac.get_meta("drone_slot", 0)) if is_instance_valid(ac) else 0
	var by_player: bool = killer_uid >= 0 and bool(battle.is_player_uid(killer_uid))
	if battle.mode == "training":
		if step != STEP_TARGETS:
			return
		if by_player:
			drone_kills += 1
			if drone_kills < drones_needed:
				_say("Мишени: %d из %d" % [drone_kills, drones_needed])
		else:
			# мишень упала сама — вернуть замену
			_drone_queue.append({"t": 3.0, "slot": slot})
	elif battle.mode == "test":
		_drone_queue.append({"t": TEST_DRONE_RESPAWN, "slot": slot})

func _update_drone_queue(dt: float) -> void:
	for i in range(_drone_queue.size() - 1, -1, -1):
		var q: Dictionary = _drone_queue[i]
		q.t = float(q.t) - dt
		if float(q.t) > 0.0:
			continue
		_drone_queue.remove_at(i)
		if battle.mode == "test":
			_spawn_test_slot(int(q.slot))
		elif step == STEP_TARGETS:
			_spawn_training_slot(int(q.slot))

func _alive_drones() -> int:
	var n := 0
	for d in drones:
		if is_instance_valid(d) and bool(d.alive):
			n += 1
	return n

func _clear_drones() -> void:
	for d in drones:
		if is_instance_valid(d) and d.is_connected("destroyed", _on_drone_destroyed):
			d.disconnect("destroyed", _on_drone_destroyed)
	drones.clear()

## Точка для круга мишеней радиусом radius: ближайшая к prefer, где свои зенитки и корабли
## (и колонны с зенитками) не достают, и не ближе 1 500 м к уже занятым точкам из avoid.
## Свои зенитки стреляют по красным мишеням, поэтому держим мишени от них подальше.
func _find_clear_spot(prefer: Vector3, radius: float, avoid: Array) -> Vector3:
	var aa: Array = []
	for u in ([] if _units_frozen else battle.ground_units):
		if not is_instance_valid(u) or not bool(u.alive) or int(u.team) != 0:
			continue
		var k := String(u.kind)
		if k != "aa" and k != "ship":
			continue
		var up: Vector3 = u.global_position if u.is_inside_tree() else u.position
		aa.append([Vector2(up.x, up.z), (SHIP_RANGE if k == "ship" else AA_RANGE) + radius + AA_MARGIN])
	var best := Vector3(prefer.x, 0.0, prefer.z)
	var best_cost := INF
	var fallback := best
	var fallback_margin := -INF
	var lim: float = float(battle.world.half_size()) - 700.0 - radius * 0.5
	var step_m := 400.0
	var n := int(lim / step_m)
	for gx in range(-n, n + 1):
		for gz in range(-n, n + 1):
			var p := Vector2(gx * step_m, gz * step_m)
			var spaced := true
			for a in avoid:
				if Vector2(a.x, a.z).distance_to(p) < 1500.0:
					spaced = false
					break
			if not spaced:
				continue
			var margin := INF
			for e in aa:
				margin = minf(margin, (e[0] as Vector2).distance_to(p) - float(e[1]))
			var cost := p.distance_to(Vector2(prefer.x, prefer.z))
			if margin >= 0.0 and cost < best_cost:
				best_cost = cost
				best = Vector3(p.x, 0.0, p.y)
			if margin > fallback_margin:
				fallback_margin = margin
				fallback = Vector3(p.x, 0.0, p.y)
	return best if best_cost < INF else fallback

func _pick_ground_target(from: Vector3):
	var best = null
	var best_d := INF
	var targets: Array = battle.ground_targets_of(1)
	for pass_i in 2:
		for u in targets:
			if pass_i == 0 and String(u.kind) != "building":
				continue
			var up: Vector3 = u.global_position if u.is_inside_tree() else u.position
			var d := up.distance_to(from)
			if d < best_d:
				best_d = d
				best = u
		if best != null:
			break
	return best

# ---------------------------------------------------------------- помощники

func _throttle(ac, fm) -> float:
	var t = fm.get("throttle")
	if t != null:
		return float(t)
	var c = ac.get("controls")
	if c is Dictionary:
		return float(c.get("throttle", 0.0))
	return 0.0

func _heading(fm) -> float:
	var f: Vector3 = -fm.basis.z
	return atan2(f.x, -f.z)

func _pos(fm) -> Vector3:
	return fm.pos

func _ground(p: Vector3) -> float:
	return maxf(battle.world.height_at(p.x, p.z), 0.0)

func _stall_speed(def: Dictionary) -> float:
	var m := float(def.get("mass", 3000.0))
	var s := float(def.get("wing_area", 20.0))
	var cl := float(def.get("cl_max", 1.3))
	return sqrt(2.0 * m * 9.81 / (1.225 * s * cl))

func _home_airfield() -> Dictionary:
	for af in battle.world.airfields:
		if int(af.team) == 0:
			return af
	return {}

func _place_beacon(at: Vector3, color: Color) -> void:
	_remove_beacon()
	var cyl := CylinderMesh.new()
	cyl.top_radius = BEACON_RADIUS
	cyl.bottom_radius = BEACON_RADIUS
	cyl.height = BEACON_HEIGHT
	cyl.radial_segments = 12
	cyl.rings = 1
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = color
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.disable_fog = true
	_beacon = MeshInstance3D.new()
	_beacon.name = "TrainingBeacon"
	_beacon.mesh = cyl
	_beacon.material_override = mat
	_beacon.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	battle.add_child(_beacon)
	_beacon.global_position = at + Vector3(0.0, BEACON_HEIGHT * 0.5, 0.0)

## Издалека столб должен оставаться заметным: толщина растёт с расстоянием.
func _scale_beacon(from: Vector3) -> void:
	if _beacon == null or not is_instance_valid(_beacon):
		return
	var bp := _beacon.global_position
	var d := Vector2(bp.x - from.x, bp.z - from.z).length()
	var k := clampf(d / 1200.0, 1.0, 6.0)
	_beacon.scale = Vector3(k, 1.0, k)

func _remove_beacon() -> void:
	if _beacon != null and is_instance_valid(_beacon):
		_beacon.queue_free()
	_beacon = null
