extends RefCounted
## Проверки модуля WORLD: сборка карт, детерминизм, поверхности, точки появления, базы, зенитки.

const SEED := 4242
const UID0 := 100

class FakeProjectiles extends Node3D:
	var bullets: int = 0
	var flak: int = 0
	var last_bullet: Dictionary = {}
	func spawn_bullet(from: Vector3, velocity: Vector3, damage: float, caliber: float, owner_uid: int, team: int, tracer: bool) -> void:
		bullets += 1
		last_bullet = {"from": from, "vel": velocity, "damage": damage, "caliber": caliber, "owner": owner_uid, "team": team, "tracer": tracer}
	func spawn_flak(from: Vector3, velocity: Vector3, fuse_time: float, damage: float, radius: float, owner_uid: int, team: int) -> void:
		flak += 1
	func spawn_rocket(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
		pass
	func spawn_bomb(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
		pass

class FakeTarget extends Node3D:
	var team: int = 1
	var uid: int = 9999
	var alive: bool = true
	var in_cloud: bool = false
	var vel := Vector3(-110.0, 0.0, 40.0)
	func velocity() -> Vector3:
		return vel

class FakeBattle extends Node3D:
	var projectiles
	var fx = null
	var targets: Array = []
	var aircraft: Array = []
	var ground_units: Array = []
	func enemies_of(team: int) -> Array:
		var out: Array = []
		for t in targets:
			if t.team != team:
				out.append(t)
		return out
	func get_entity(_uid: int):
		return null

var errors: Array = []

func _check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)

func run(tree: SceneTree) -> Array:
	errors = []
	# корень дерева занят, пока запускатель тестов в _ready: ждём кадр
	await tree.process_frame
	var old_battle = Game.battle
	Game.battle = null
	for m in Data.MAPS:
		_check_map(tree, m)
	_check_weather(tree)
	await _check_aa(tree)
	await _check_units(tree)
	Game.battle = old_battle
	return errors

func _build(tree: SceneTree, m: Dictionary, time := "day", weather := "cloudy", seed_v := SEED) -> World:
	var w := World.new()
	w.graphics = "medium"
	tree.root.add_child(w)
	w.build(m, time, weather, seed_v, UID0)
	return w

func _check_map(tree: SceneTree, m: Dictionary) -> void:
	var id: String = m.id
	var w1 := World.new()
	w1.graphics = "medium"
	var next1 := w1.build(m, "day", "cloudy", SEED, UID0)
	_check(w1.build_ms < 3000, "%s: сборка %d мс (> 3 с)" % [id, w1.build_ms])
	var w2 := World.new()
	w2.graphics = "medium"
	var next2 := w2.build(m, "day", "cloudy", SEED, UID0)
	_check(next1 == next2, "%s: разный следующий uid" % id)
	_check(next1 == UID0 + w1.ground_units.size(), "%s: uid не подряд (%d, целей %d)" % [id, next1, w1.ground_units.size()])
	# uid подряд и уникальны
	var seen := {}
	for u in w1.ground_units:
		_check(not seen.has(u.uid), "%s: повтор uid %d" % [id, u.uid])
		seen[u.uid] = true
		_check(u.uid >= UID0 and u.uid < next1, "%s: uid вне диапазона" % id)
		_check(u.get_parent() == w1, "%s: цель не дочерняя для World" % id)
	# детерминизм
	_check(w1.airfields.size() == w2.airfields.size(), "%s: число аэродромов" % id)
	for i in mini(w1.airfields.size(), w2.airfields.size()):
		var a: Dictionary = w1.airfields[i]
		var b: Dictionary = w2.airfields[i]
		_check((a.pos as Vector3).distance_to(b.pos) < 0.01 and (a.runway_start as Vector3).distance_to(b.runway_start) < 0.01, "%s: аэродромы различаются" % id)
	for i in w1.zones.size():
		_check((w1.zones[i].pos as Vector3).distance_to(w2.zones[i].pos) < 0.01, "%s: зоны различаются" % id)
	_check(w1.ground_units.size() == w2.ground_units.size(), "%s: число целей различается" % id)
	for i in mini(w1.ground_units.size(), w2.ground_units.size()):
		var u1: GroundUnit = w1.ground_units[i]
		var u2: GroundUnit = w2.ground_units[i]
		if u1.kind != u2.kind or u1.team != u2.team or u1.position.distance_to(u2.position) > 0.01 or u1.uid != u2.uid:
			errors.append("%s: цель %d различается между сборками" % [id, i])
			break
	for i in w1.bases.size():
		_check(w1.bases[i].unit_uids == w2.bases[i].unit_uids, "%s: базы различаются" % id)

	# аэродромы и полосы
	var teams_with_field := {}
	for af in w1.airfields:
		teams_with_field[int(af.team)] = true
		_check(af.has("service_radius") and float(af.service_radius) > 100.0, "%s: нет service_radius" % id)
		var hd: float = af.heading
		var f := Vector3(sin(hd), 0, -cos(hd))
		var r := Vector3(cos(hd), 0, sin(hd))
		var c: Vector3 = af.pos
		if af.kind == "airfield":
			_check(absf(float(af.length) - 1400.0) < 1.0 and absf(float(af.width) - 50.0) < 1.0, "%s: размер полосы" % id)
			for u in [-650.0, -300.0, 0.0, 300.0, 650.0]:
				for v in [-20.0, 0.0, 20.0]:
					var p: Vector3 = c + f * u + r * v
					var s: Dictionary = w1.surface_at(p.x, p.z)
					if s.kind != "runway" or int(s.team) != int(af.team) or not bool(s.flat) or absf(float(s.height) - c.y) > 0.05:
						errors.append("%s: полоса команды %d, точка (%.0f, %.0f): %s" % [id, af.team, u, v, str(s)])
			# высота рельефа под полосой совпадает с полосой
			_check(absf(w1.height_at(c.x, c.z) - c.y) < 0.05, "%s: рельеф под полосой не плоский" % id)
			# сбоку от полосы — уже не полоса
			var side: Vector3 = c - r * 80.0
			_check(w1.surface_at(side.x, side.z).kind != "runway", "%s: полоса шире 50 м" % id)
		else:
			var s: Dictionary = w1.surface_at(c.x, c.z)
			_check(s.kind == "deck" and int(s.team) == 0 and bool(s.flat), "%s: палуба авианосца: %s" % [id, str(s)])
			_check(absf(float(s.height) - 20.0) < 3.0, "%s: высота палубы %.1f" % [id, float(s.height)])
			var off: Vector3 = c + f * 100.0
			var s2: Dictionary = w1.surface_at(off.x, off.z)
			_check(s2.kind == "deck", "%s: палуба в 100 м от центра не найдена" % id)
		# появление на полосе
		for i in 4:
			var sp: Dictionary = w1.runway_spawn(int(af.team), i)
			var pos: Vector3 = sp.pos
			var s: Dictionary = w1.surface_at(pos.x, pos.z)
			_check(s.kind == ("runway" if af.kind == "airfield" else "deck"), "%s: runway_spawn %d команды %d не на полосе: %s" % [id, i, af.team, str(s)])
			_check(int(s.team) == int(af.team), "%s: runway_spawn %d — чужая полоса" % [id, i])
			_check(pos.y >= float(s.height) and pos.y < float(s.height) + 3.0, "%s: runway_spawn %d по высоте %.1f / %.1f" % [id, i, pos.y, float(s.height)])
			_check(bool(sp.on_ground) and float(sp.speed) == 0.0 and sp.basis is Basis, "%s: runway_spawn поля" % id)
			if i == 0:
				_check(pos.distance_to(af.runway_start) < 2.0, "%s: index 0 не у начала полосы" % id)
	_check(teams_with_field.has(0) and teams_with_field.has(1), "%s: аэродромы не у обеих команд" % id)
	if id == "reef":
		var has_carrier := false
		for af in w1.airfields:
			if af.kind == "carrier" and int(af.team) == 0:
				has_carrier = true
		_check(has_carrier, "reef: у синих нет авианосца")
		var cu = w1.carrier.get("unit")
		_check(cu != null and cu.kind == "carrier" and cu.ticket_value == 0, "reef: нет цели-авианосца")
		if cu != null:
			cu.take_damage(5000.0, 1, true)
			_check(cu.alive, "reef: авианосец уязвим")
	# появление в воздухе
	for team in [0, 1]:
		var af := w1.airfield_of(team)
		for alt in [800.0, 1500.0]:
			for i in 6:
				var sp: Dictionary = w1.air_spawn(team, i, alt)
				var pos: Vector3 = sp.pos
				_check(pos.y - w1.height_at(pos.x, pos.z) > 300.0, "%s: air_spawn %d команды %d низко: %.0f над рельефом" % [id, i, team, pos.y - w1.height_at(pos.x, pos.z)])
				var fwd: Vector3 = -(sp.basis as Basis).z
				var to_c := Vector3(-pos.x, 0, -pos.z).normalized()
				_check(fwd.dot(to_c) > 0.8, "%s: air_spawn смотрит не в центр" % id)
				_check(absf(float(sp.speed) - 130.0) < 1.0, "%s: скорость air_spawn" % id)
				if not af.is_empty():
					var home := Vector3(af.pos.x, 0, af.pos.z)
					_check(home.length() < Vector3(pos.x, 0, pos.z).length(), "%s: air_spawn не позади аэродрома" % id)
	# зоны
	_check(w1.zones.size() == 3, "%s: зон %d" % [id, w1.zones.size()])
	var ids := []
	for z in w1.zones:
		ids.append(z.id)
		var p: Vector3 = z.pos
		_check(absf(p.x) <= 5000.0 and absf(p.z) <= 5000.0, "%s: зона %s вне карты" % [id, z.id])
		_check(absf(p.z) < 1500.0, "%s: зона %s далеко от центра" % [id, z.id])
		_check(float(z.radius) == 450.0 and float(z.max_alt) == 500.0, "%s: параметры зоны" % id)
	_check(ids == ["A", "B", "C"], "%s: имена зон %s" % [id, str(ids)])
	# базы и цели
	var per_team := [0, 0]
	for u in w1.ground_units:
		per_team[u.team] += 1
		var tv := {"tank": 15, "truck": 8, "aa": 12, "ship": 40, "building": 25, "carrier": 0}
		_check(u.ticket_value == int(tv[u.kind]), "%s: ticket_value %s = %d" % [id, u.kind, u.ticket_value])
		_check(u.alive and u.hp > 0.0 and u.radius > 0.0, "%s: цель %s без hp" % [id, u.kind])
		if u.kind in ["tank", "truck", "building"] or (u.kind == "aa" and u.variant != "deck"):
			_check(w1.height_at(u.position.x, u.position.z) > 0.5, "%s: %s стоит в воде" % [id, u.kind])
			_check(absf(u.position.y - w1.height_at(u.position.x, u.position.z)) < 1.0, "%s: %s не на земле" % [id, u.kind])
		if u.kind == "ship":
			for p in u.path:
				_check(w1.height_at(p.x, p.z) < -5.0, "%s: путь корабля на мели" % id)
		if u.kind in ["tank", "truck"] or u.variant == "mobile":
			for p in u.path:
				if w1.height_at(p.x, p.z) < 1.0:
					errors.append("%s: путь колонны в воде" % id)
					break
	for team in [0, 1]:
		_check(per_team[team] >= 8, "%s: у команды %d целей %d (< 8)" % [id, team, per_team[team]])
		var ok_base := false
		for b in w1.bases:
			if int(b.team) != team:
				continue
			var n := 0
			for uid in b.unit_uids:
				var u := _unit(w1, int(uid))
				if u != null and u.kind == "building" and u.team == team and u.base_id == int(b.id):
					n += 1
			if n >= 3:
				ok_base = true
		_check(ok_base, "%s: у команды %d нет базы с 3 зданиями" % [id, team])
	# колонны едут
	var movers := 0
	for u in w1.ground_units:
		if u.kind == "tank" and u.path.size() >= 3:
			movers += 1
	_check(movers >= 4, "%s: колонн с маршрутом мало (%d танков)" % [id, movers])
	# вода
	var water_pt := Vector2(0.0, 2000.0) if id == "reef" else (Vector2(0.0, w1.terrain.canyon_z(0.0)) if id == "canyon" else Vector2(0.0, w1.terrain.fjord_z(0.0)))
	var ws: Dictionary = w1.surface_at(water_pt.x, water_pt.y)
	_check(ws.kind == "water" and float(ws.height) == 0.0 and w1.height_at(water_pt.x, water_pt.y) < 0.0, "%s: вода не найдена: %s" % [id, str(ws)])
	_check(w1.half_size() == 5000.0, "half_size")
	w1.free()
	w2.free()

func _unit(w: World, uid: int) -> GroundUnit:
	for u in w.ground_units:
		if u.uid == uid:
			return u
	return null

func _check_weather(tree: SceneTree) -> void:
	var m: Dictionary = Data.map_def("canyon")
	var w := World.new()
	w.graphics = "low"
	w.build(m, "night", "storm", 11, 1)
	_check(w.is_night, "ночь: is_night")
	_check(absf(w.ambient_light_level() - 0.25) < 0.06, "ночь: уровень света %.2f" % w.ambient_light_level())
	_check(w.sky.rain != null, "гроза: нет дождя")
	_check(w.sky.lightning_enabled, "гроза: нет молний")
	# облака: в центре скопления плотность высокая, высоко — ноль
	var cl = w.sky.clouds
	_check(cl.clusters.size() > 20, "гроза: мало облаков")
	var c: Vector3 = cl.clusters[0][0]
	_check(w.cloud_density_at(c) > 0.5, "плотность в центре облака %.2f" % w.cloud_density_at(c))
	_check(w.cloud_density_at(Vector3(0, 6000, 0)) == 0.0, "плотность высоко над облаками")
	_check(w.cloud_density_at(Vector3(0, 50, 0)) == 0.0, "плотность у земли")
	w.free()
	var d := World.new()
	d.graphics = "low"
	d.build(m, "day", "clear", 11, 1)
	_check(not d.is_night and d.ambient_light_level() > 0.9, "день: уровень света")
	_check(d.sky.rain == null, "ясно: дождь")
	d.free()

func _check_aa(tree: SceneTree) -> void:
	var fb := FakeBattle.new()
	var pm := FakeProjectiles.new()
	fb.projectiles = pm
	fb.add_child(pm)
	tree.root.add_child(fb)
	Game.battle = fb
	var w := _build(tree, Data.map_def("canyon"), "day", "clear", 77)
	await tree.process_frame
	var aa: GroundUnit = null
	for u in w.ground_units:
		if u.kind == "aa" and u.variant == "heavy" and u.team == 0:
			aa = u
			break
	_check(aa != null, "нет тяжёлой зенитки")
	if aa != null:
		var t := FakeTarget.new()
		tree.root.add_child(t)
		t.global_position = aa.global_position + Vector3(500.0, 700.0, -600.0)
		fb.targets = [t]
		w.set_units_active(false)
		aa.active = true
		for i in 360:
			aa._physics_process(1.0 / 60.0)
		_check(pm.bullets > 0, "зенитка не стреляет пулями")
		_check(pm.flak > 0, "тяжёлая зенитка не стреляет зенитными снарядами")
		if not pm.last_bullet.is_empty():
			var lb: Dictionary = pm.last_bullet
			_check(int(lb.team) == 0 and int(lb.owner) == aa.uid and bool(lb.tracer), "поля пули зенитки")
			_check(absf(float(lb.caliber) - 20.0) < 0.1 and absf(float(lb.damage) - 10.0) < 0.1, "калибр и урон пули")
			_check(absf((lb.vel as Vector3).length() - 900.0) < 5.0, "скорость пули зенитки")
			var to_t: Vector3 = (t.global_position - (lb.from as Vector3)).normalized()
			_check((lb.vel as Vector3).normalized().dot(to_t) > 0.9, "зенитка стреляет не в сторону цели")
		# цель в облаке не видна
		t.in_cloud = true
		for i in 60:
			aa._physics_process(1.0 / 60.0)
		pm.bullets = 0
		pm.flak = 0
		for i in 240:
			aa._physics_process(1.0 / 60.0)
		_check(pm.bullets == 0 and pm.flak == 0, "зенитка стреляет по цели в облаке")
		# далеко — не стреляет
		t.in_cloud = false
		t.global_position = aa.global_position + Vector3(0, 900, 2600)
		for i in 60:
			aa._physics_process(1.0 / 60.0)
		pm.bullets = 0
		for i in 120:
			aa._physics_process(1.0 / 60.0)
		_check(pm.bullets == 0, "зенитка стреляет дальше 2200 м")
		fb.targets = []
		t.queue_free()
	# танк не стреляет, гибель — один сигнал
	var tank: GroundUnit = null
	for u in w.ground_units:
		if u.kind == "tank":
			tank = u
			break
	if tank != null:
		var got: Array = []
		tank.destroyed.connect(func(unit, killer): got.append([unit, killer]))
		tank.take_damage(10.0, 55, false)
		_check(tank.alive and tank.hp < tank.max_hp, "танк: урон не прошёл")
		tank.take_damage(1000.0, 55, true)
		tank.take_damage(1000.0, 56, true)
		_check(not tank.alive, "танк не уничтожен")
		_check(got.size() == 1 and got[0][1] == 55, "сигнал destroyed: %s" % str(got))
	w.queue_free()
	await tree.process_frame
	# корабль на рифе стреляет
	var r := _build(tree, Data.map_def("reef"), "day", "clear", 78)
	await tree.process_frame
	var ship: GroundUnit = null
	for u in r.ground_units:
		if u.kind == "ship" and u.team == 1:
			ship = u
			break
	_check(ship != null, "reef: нет корабля красных")
	if ship != null:
		pm.bullets = 0
		pm.flak = 0
		var t2 := FakeTarget.new()
		t2.team = 0
		tree.root.add_child(t2)
		t2.global_position = ship.global_position + Vector3(700.0, 900.0, 500.0)
		fb.targets = [t2]
		r.set_units_active(false)
		ship.active = true
		for i in 360:
			ship._physics_process(1.0 / 60.0)
		_check(pm.bullets > 0 and pm.flak > 0, "корабль не стреляет (пули %d, снаряды %d)" % [pm.bullets, pm.flak])
		fb.targets = []
		t2.queue_free()
	r.queue_free()
	Game.battle = null
	fb.queue_free()
	await tree.process_frame

func _check_units(tree: SceneTree) -> void:
	# колонна едет по рельефу
	var w := _build(tree, Data.map_def("fjord"), "dusk", "overcast", 91)
	await tree.process_frame
	var tank: GroundUnit = null
	for u in w.ground_units:
		if u.kind == "tank" and u.path.size() >= 3:
			tank = u
			break
	_check(tank != null, "fjord: нет едущего танка")
	if tank != null:
		var p0 := tank.global_position
		for i in 120:
			tank._physics_process(1.0 / 60.0)
		var p1 := tank.global_position
		var moved := Vector2(p1.x - p0.x, p1.z - p0.z).length()
		_check(moved > 5.0 and moved < 20.0, "танк проехал %.1f м за 2 с" % moved)
		_check(absf(p1.y - w.height_at(p1.x, p1.z)) < 0.5, "танк не на рельефе")
	w.queue_free()
	await tree.process_frame
