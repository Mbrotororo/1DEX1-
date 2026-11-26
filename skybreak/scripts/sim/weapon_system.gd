class_name WeaponSystem
extends RefCounted
## Боезапас и стрельба одного самолёта. Снаряды создаёт Game.battle.projectiles.

const CONVERGENCE := 400.0
const SPREAD_DEG := 0.3
const TRACER_EVERY := 3
const ROCKET_INTERVAL := 0.25
const BOMB_INTERVAL := 0.35
const LOCK_TIME := 1.2
const REARM_TIME := 15.0
const FLARES_PER_PRESS := 2

var def: Dictionary = {}
var ammo: Dictionary = {}
var max_ammo: Dictionary = {}
var lock_target = null
var lock_progress: float = 0.0
var bomb_cooldown: float = 0.0

var rng := RandomNumberGenerator.new()

var _guns: Array = []
var _gun_accum: PackedFloat32Array = PackedFloat32Array()
var _gun_rounds: PackedInt32Array = PackedInt32Array()
var _gun_barrel: PackedInt32Array = PackedInt32Array()
var _gun_offset: PackedInt32Array = PackedInt32Array()   # индекс первого ствола группы
var _gun_sound_cd: PackedFloat32Array = PackedFloat32Array()
var _total_barrels: int = 0
var _rocket_cd: float = 0.0
var _rocket_idx: int = 0
var _bomb_idx: int = 0
var _missile_idx: int = 0
var _missile_prev: bool = false
var _flares_prev: bool = false
var _refill: Dictionary = {}
var _rearm_guns: PackedFloat32Array = PackedFloat32Array()

# кэш точек вылета в локальных координатах владельца
var _cache_model_id: int = -1
var _muzzles: Array = []
var _pylons: Array = []


func setup(p_def: Dictionary) -> void:
	def = p_def
	var w: Dictionary = def.get("weapons", {})
	_guns = w.get("guns", [])
	var guns_max: Array = []
	_gun_accum.resize(_guns.size())
	_gun_rounds.resize(_guns.size())
	_gun_barrel.resize(_guns.size())
	_gun_offset.resize(_guns.size())
	_gun_sound_cd.resize(_guns.size())
	_rearm_guns.resize(_guns.size())
	_total_barrels = 0
	for i in _guns.size():
		var g: Dictionary = _guns[i]
		guns_max.append(int(g.get("ammo", 0)) * int(g.get("count", 1)))
		_gun_accum[i] = 0.0
		_gun_rounds[i] = 0
		_gun_barrel[i] = 0
		_gun_offset[i] = _total_barrels
		_gun_sound_cd[i] = 0.0
		_rearm_guns[i] = 0.0
		_total_barrels += int(g.get("count", 1))
	max_ammo = {
		"guns": guns_max,
		"rockets": int(w.get("rockets", {}).get("count", 0)),
		"bombs": int(w.get("bombs", {}).get("count", 0)),
		"missiles": int(w.get("missiles", {}).get("count", 0)),
		"flares": int(w.get("flares", 0)),
	}
	rng.randomize()
	_cache_model_id = -1
	rearm_full()


func rearm_full() -> void:
	ammo = max_ammo.duplicate(true)
	_refill = {"rockets": 0.0, "bombs": 0.0, "missiles": 0.0, "flares": 0.0}
	for i in _rearm_guns.size():
		_rearm_guns[i] = 0.0
	lock_target = null
	lock_progress = 0.0
	bomb_cooldown = 0.0
	_rocket_cd = 0.0


func gun_convergence() -> float:
	return CONVERGENCE


func gun_speed() -> float:
	var best := -1
	var best_cal := -1.0
	# основная группа: самый крупный калибр, у которого ещё есть патроны
	for pass_i in 2:
		for i in _guns.size():
			if pass_i == 0 and int(ammo.get("guns", [])[i]) <= 0:
				continue
			var cal := float(_guns[i].get("caliber", 0.0))
			if cal > best_cal:
				best_cal = cal
				best = i
		if best >= 0:
			break
	if best < 0:
		return 800.0
	return float(_guns[best].get("speed", 800.0))


func is_empty() -> bool:
	for n in ammo.get("guns", []):
		if int(n) > 0:
			return false
	return int(ammo.get("rockets", 0)) <= 0 and int(ammo.get("bombs", 0)) <= 0 and int(ammo.get("missiles", 0)) <= 0


func has_ordnance() -> bool:
	return int(ammo.get("rockets", 0)) > 0 or int(ammo.get("bombs", 0)) > 0


func is_full() -> bool:
	var g: Array = ammo.get("guns", [])
	var gm: Array = max_ammo.get("guns", [])
	for i in gm.size():
		if int(g[i]) < int(gm[i]):
			return false
	for k in ["rockets", "bombs", "missiles", "flares"]:
		if int(ammo.get(k, 0)) < int(max_ammo.get(k, 0)):
			return false
	return true


func rearm_step(dt: float) -> bool:
	var frac := dt / REARM_TIME
	var g: Array = ammo.get("guns", [])
	var gm: Array = max_ammo.get("guns", [])
	for i in gm.size():
		var cur := int(g[i])
		var mx := int(gm[i])
		if cur >= mx:
			_rearm_guns[i] = 0.0
			continue
		_rearm_guns[i] += float(mx) * frac
		var add := int(_rearm_guns[i])
		if add > 0:
			_rearm_guns[i] -= float(add)
			g[i] = mini(mx, cur + add)
	for k in ["rockets", "bombs", "missiles", "flares"]:
		var cur := int(ammo.get(k, 0))
		var mx := int(max_ammo.get(k, 0))
		if cur >= mx:
			_refill[k] = 0.0
			continue
		_refill[k] = float(_refill.get(k, 0.0)) + float(mx) * frac
		var add := int(_refill[k])
		if add > 0:
			_refill[k] = float(_refill[k]) - float(add)
			ammo[k] = mini(mx, cur + add)
	return is_full()


func summary() -> Array:
	var out: Array = []
	var g: Array = ammo.get("guns", [])
	var gm: Array = max_ammo.get("guns", [])
	for i in _guns.size():
		out.append({"label": String(_guns[i].get("label", "")), "cur": int(g[i]), "max": int(gm[i])})
	var extra := [["rockets", "Ракеты"], ["bombs", "Бомбы"], ["missiles", "Ракеты В-В"], ["flares", "Ловушки"]]
	for e in extra:
		var mx := int(max_ammo.get(e[0], 0))
		if mx > 0:
			out.append({"label": e[1], "cur": int(ammo.get(e[0], 0)), "max": mx})
	return out


# ---------------------------------------------------------------- обновление

func update(dt: float, owner, ctrl: Dictionary) -> void:
	bomb_cooldown = maxf(0.0, bomb_cooldown - dt)
	_rocket_cd = maxf(0.0, _rocket_cd - dt)
	for i in _gun_sound_cd.size():
		_gun_sound_cd[i] = maxf(0.0, _gun_sound_cd[i] - dt)
	var missile_pressed := bool(ctrl.get("missile", false))
	var flares_pressed := bool(ctrl.get("flares", false))
	var missile_edge := missile_pressed and not _missile_prev
	var flares_edge := flares_pressed and not _flares_prev
	_missile_prev = missile_pressed
	_flares_prev = flares_pressed

	if owner == null or not is_instance_valid(owner) or not _bool_prop(owner, "alive", true):
		lock_target = null
		lock_progress = 0.0
		return
	var battle = Game.battle
	var pm = null
	if battle != null and is_instance_valid(battle):
		pm = battle.get("projectiles")
	_update_lock(dt, owner, battle)
	if pm == null or not is_instance_valid(pm):
		return
	var xf := _owner_xform(owner)
	var fwd := -xf.basis.z.normalized()
	var vel := _owner_velocity(owner, fwd)
	var team := int(owner.get("team"))
	var uid := int(owner.get("uid"))
	var player := _bool_prop(owner, "is_player", false)
	_refresh_points(owner)

	if bool(ctrl.get("guns", false)):
		_fire_guns(dt, pm, xf, fwd, vel, team, uid)
	else:
		for i in _gun_accum.size():
			_gun_accum[i] = 0.0

	if bool(ctrl.get("rocket", false)) and _rocket_cd <= 0.0 and int(ammo.rockets) > 0:
		_fire_rockets(pm, xf, fwd, vel, team, uid)

	if bool(ctrl.get("bomb", false)) and bomb_cooldown <= 0.0 and int(ammo.bombs) > 0:
		_drop_bomb(pm, xf, vel, team, uid)

	if missile_edge:
		if int(ammo.missiles) > 0 and lock_target != null and lock_progress >= 1.0 and is_instance_valid(lock_target):
			_launch_missile(pm, xf, fwd, vel, team, uid)
		elif player and int(max_ammo.missiles) > 0:
			Sfx.play("click")

	if flares_edge and int(ammo.flares) > 0:
		_drop_flares(pm, xf, fwd, vel, team)


func _fire_guns(dt: float, pm, xf: Transform3D, fwd: Vector3, vel: Vector3, team: int, uid: int) -> void:
	var aim := xf.origin + fwd * CONVERGENCE
	var g: Array = ammo.guns
	for i in _guns.size():
		var left := int(g[i])
		if left <= 0:
			_gun_accum[i] = 0.0
			continue
		var gun: Dictionary = _guns[i]
		var count := int(gun.get("count", 1))
		var rate := float(gun.get("rof", 600)) / 60.0 * float(count)
		var a0 := _gun_accum[i]
		var acc := a0 + rate * dt
		var shots := int(acc)
		if shots <= 0:
			_gun_accum[i] = acc
			continue
		shots = mini(shots, left)
		_gun_accum[i] = acc - float(int(acc)) if shots < left else 0.0
		var speed := float(gun.get("speed", 800.0))
		var dmg := float(gun.get("damage", 5.0))
		var cal := float(gun.get("caliber", 7.62))
		var center := Vector3.ZERO
		for s in shots:
			var barrel := _gun_barrel[i] % count
			_gun_barrel[i] = (barrel + 1) % count
			var local := _muzzle_local(_gun_offset[i] + barrel, i, barrel, count)
			var from := xf * local
			var dir := _spread((aim - from).normalized(), SPREAD_DEG)
			var bv := vel + dir * speed
			# выстрел в момент t внутри кадра: пуля появляется чуть позади, шаг менеджера догонит
			var t_shot := clampf((float(s + 1) - a0) / rate, 0.0, dt)
			from -= bv * t_shot
			_gun_rounds[i] += 1
			var tracer := _gun_rounds[i] % TRACER_EVERY == 0
			pm.spawn_bullet(from, bv, dmg, cal, uid, team, tracer)
			center += xf * local
		g[i] = left - shots
		if _gun_sound_cd[i] <= 0.0:
			var snd := "gun_small"
			if cal >= 20.0:
				snd = "cannon"
			elif cal >= 12.0:
				snd = "gun_large"
			Sfx.play(snd, center / float(shots))
			_gun_sound_cd[i] = maxf(0.075, 1.0 / rate)


func _fire_rockets(pm, xf: Transform3D, fwd: Vector3, vel: Vector3, team: int, uid: int) -> void:
	var spec: Dictionary = def.weapons.rockets
	var n := mini(2, int(ammo.rockets))
	var aim := xf.origin + fwd * CONVERGENCE * 1.5
	var pos := Vector3.ZERO
	for k in n:
		var from := xf * _pylon_local(_rocket_idx)
		_rocket_idx += 1
		var dir := _spread((aim - from).normalized(), 0.4)
		pm.spawn_rocket(from, vel + dir * float(spec.get("speed", 500.0)), float(spec.get("damage", 60.0)),
			float(spec.get("radius", 10.0)), uid, team)
		pos = from
	ammo.rockets = int(ammo.rockets) - n
	_rocket_cd = ROCKET_INTERVAL
	Sfx.play("rocket", pos)


func _drop_bomb(pm, xf: Transform3D, vel: Vector3, team: int, uid: int) -> void:
	var spec: Dictionary = def.weapons.bombs
	var from := xf * _pylon_local(_bomb_idx)
	_bomb_idx += 1
	from += xf.basis.y.normalized() * -0.4
	pm.spawn_bomb(from, vel + xf.basis.y.normalized() * -1.5, float(spec.get("damage", 150.0)), float(spec.get("radius", 20.0)), uid, team)
	ammo.bombs = int(ammo.bombs) - 1
	bomb_cooldown = BOMB_INTERVAL
	Sfx.play("bomb_drop", from)


func _launch_missile(pm, xf: Transform3D, fwd: Vector3, vel: Vector3, team: int, uid: int) -> void:
	var spec: Dictionary = def.weapons.missiles
	var from := xf * _pylon_local(_missile_idx)
	_missile_idx += 1
	from += xf.basis.y.normalized() * -0.5
	pm.spawn_missile(from, vel + fwd * 15.0 - xf.basis.y.normalized() * 3.0, lock_target, spec, uid, team)
	ammo.missiles = int(ammo.missiles) - 1


func _drop_flares(pm, xf: Transform3D, fwd: Vector3, vel: Vector3, team: int) -> void:
	var length := float(def.get("shape", {}).get("length", 10.0))
	var n := mini(FLARES_PER_PRESS, int(ammo.flares))
	var right := xf.basis.x.normalized()
	var up := xf.basis.y.normalized()
	for k in n:
		var side := -1.0 if k % 2 == 0 else 1.0
		var from := xf.origin - fwd * length * 0.45 - up * 0.6 + right * side * 1.0
		var v := vel * 0.7 - fwd * 10.0 - up * 12.0 + right * side * rng.randf_range(8.0, 16.0)
		pm.spawn_flare(from, v, team)
	ammo.flares = int(ammo.flares) - n


# ---------------------------------------------------------------- захват цели

func _update_lock(dt: float, owner, battle) -> void:
	var spec: Dictionary = def.get("weapons", {}).get("missiles", {})
	if int(max_ammo.get("missiles", 0)) <= 0 or int(ammo.get("missiles", 0)) <= 0 or battle == null or not battle.has_method("enemies_of"):
		lock_target = null
		lock_progress = 0.0
		return
	var xf := _owner_xform(owner)
	var my_pos := xf.origin
	var fwd := -xf.basis.z.normalized()
	var cos_cone := cos(deg_to_rad(float(spec.get("cone_deg", 12.0))))
	var rng_max := float(spec.get("range", 2000.0))
	var best = null
	var best_d := INF
	var enemies: Array = battle.enemies_of(int(owner.get("team")))
	for e in enemies:
		if e == null or not is_instance_valid(e) or e == owner:
			continue
		if not _bool_prop(e, "alive", true) or _bool_prop(e, "in_cloud", false):
			continue
		var to: Vector3 = (e.global_position as Vector3) - my_pos
		var d := to.length()
		if d < 1.0:
			continue
		var stealth := 1.0
		var edef = e.get("def")
		if edef is Dictionary:
			stealth = float(edef.get("stealth", 1.0))
		if d > rng_max * stealth:
			continue
		if fwd.dot(to / d) < cos_cone:
			continue
		if d < best_d:
			best_d = d
			best = e
	if best == null:
		lock_target = null
		lock_progress = 0.0
		return
	if best != lock_target:
		lock_target = best
		lock_progress = 0.0
	var was_locked := lock_progress >= 1.0
	lock_progress = minf(1.0, lock_progress + dt / LOCK_TIME)
	if lock_progress >= 1.0 and not was_locked and _bool_prop(owner, "is_player", false):
		Sfx.play("lock_tone")


# ---------------------------------------------------------------- геометрия

func _bool_prop(obj, prop: String, fallback: bool) -> bool:
	if obj == null or not (prop in obj):
		return fallback
	return bool(obj.get(prop))


func _owner_xform(owner) -> Transform3D:
	# FlightModel уже сделал шаг в этом кадре, а трансформ узла обновится позже — берём из fm
	var fm = owner.get("fm") if "fm" in owner else null
	if fm != null and "basis" in fm and "pos" in fm:
		return Transform3D(fm.basis, fm.pos)
	if owner is Node3D and (owner as Node3D).is_inside_tree():
		return (owner as Node3D).global_transform
	if owner is Node3D:
		return (owner as Node3D).transform
	return Transform3D.IDENTITY


func _owner_velocity(owner, fwd: Vector3) -> Vector3:
	if owner.has_method("velocity"):
		return owner.velocity()
	return fwd * 100.0


func _spread(dir: Vector3, deg: float) -> Vector3:
	var u := dir.cross(Vector3.UP)
	if u.length_squared() < 0.001:
		u = dir.cross(Vector3.RIGHT)
	u = u.normalized()
	var v := dir.cross(u)
	var r := tan(deg_to_rad(deg)) * sqrt(rng.randf())
	var a := rng.randf() * TAU
	return (dir + (u * cos(a) + v * sin(a)) * r).normalized()


func _refresh_points(owner) -> void:
	var model = owner.get("model") if "model" in owner else null
	var mid := -1
	if model != null and is_instance_valid(model):
		mid = model.get_instance_id()
	if mid == _cache_model_id:
		return
	_cache_model_id = mid
	_muzzles = []
	_pylons = []
	if mid != -1:
		_muzzles = _collect_markers(owner, model, "Muzzle")
		_pylons = _collect_markers(owner, model, "Pylon")


func _collect_markers(owner, model: Node3D, prefix: String) -> Array:
	var out: Array = []
	var i := 0
	while i < 32:
		var n := model.get_node_or_null(prefix + str(i)) as Node3D
		if n == null:
			n = model.find_child(prefix + str(i), true, false) as Node3D
		if n == null:
			break
		out.append(_local_to(owner, n))
		i += 1
	return out


func _local_to(owner, node: Node3D) -> Vector3:
	# позиция узла в локальных координатах владельца
	var t := node.transform
	var p := node.get_parent()
	while p != null and p != owner:
		if p is Node3D:
			t = (p as Node3D).transform * t
		p = p.get_parent()
	if p == owner:
		return t.origin
	if node.is_inside_tree() and owner is Node3D and (owner as Node3D).is_inside_tree():
		return (owner as Node3D).global_transform.affine_inverse() * node.global_position
	return t.origin


func _muzzle_local(global_barrel: int, group: int, barrel: int, count: int) -> Vector3:
	if _muzzles.size() > 0:
		return _muzzles[global_barrel % _muzzles.size()]
	var sh: Dictionary = def.get("shape", {})
	var length := float(sh.get("length", 10.0))
	var fr := float(sh.get("fuselage_radius", 0.8))
	var side := -1.0 if barrel % 2 == 0 else 1.0
	var row := float(barrel / 2)
	match String(sh.get("engines", "single_jet")):
		"nose_prop":
			# в крыле за диском винта
			var wz := float(sh.get("wing_z", 0.0)) - float(sh.get("chord", 2.0)) * 0.35
			return Vector3(side * (fr * 1.6 + 0.6 * row + 1.2 * group), -0.15, wz)
		"twin_prop":
			return Vector3(side * (0.22 + 0.2 * row), 0.15 - 0.25 * group, -length * 0.45)
		_:
			return Vector3(side * (fr * 0.55 + 0.25 * row), -fr * 0.3 - 0.2 * group, -length * 0.3)


func _pylon_local(idx: int) -> Vector3:
	if _pylons.size() > 0:
		return _pylons[idx % _pylons.size()]
	var sh: Dictionary = def.get("shape", {})
	var fr := float(sh.get("fuselage_radius", 0.8))
	var wz := float(sh.get("wing_z", 0.0))
	var side := -1.0 if idx % 2 == 0 else 1.0
	var row := float((idx / 2) % 2)
	return Vector3(side * (fr + 1.3 + 0.9 * row), -fr * 0.9, wz + 0.2)
