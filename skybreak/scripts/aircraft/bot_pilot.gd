class_name BotPilot
extends Node
## Бот-пилот. Каждые 0.5 с выбирает цель и состояние, каждый кадр строит желаемое направление,
## накладывает ограничения безопасности (рельеф, скорость, граница) и рулит через aircraft_steer.
## skill 0..1: ошибка прицеливания 4..0.8°, реакция 0.8..0.2 с, перегрузка 0.6..0.95 от доступной,
## дистанция стрельбы 700..450 м.

const Steer = preload("res://scripts/aircraft/aircraft_steer.gd")

const G := 9.81
const RHO0 := 1.225
const THINK_INTERVAL := 0.5
const VISUAL_RANGE := 3000.0
const CLOUD_SIGHT := 300.0
const TAIL_RANGE := 600.0
const LOOKAHEAD := 3.0
const BOMB_ALT := 350.0
const CAPTURE_CHANCE := 0.3
const PITCH_CAP_HIGH_AOA := 0.92

var skill: float = 0.5          # 0..1: точность, реакция, допустимая перегрузка
var role: String = "fighter"    # "fighter" | "attacker" (из def.line)
var target = null               # текущая цель (Aircraft или GroundUnit) или null
var state: String = "patrol"    # "patrol" | "engage" | "attack_ground" | "evade" | "capture" | "return"

# дополнительно (для отладки и HUD)
var aim_error_deg: float = 2.4
var reaction: float = 0.5
var g_use: float = 0.78
var gun_range: float = 575.0
var capture_mind: bool = false  # этот бот любит зоны захвата
var attack_phase: String = ""   # "setup" | "extend" | "dive" | "bomb_run" | "egress"
var threat = null               # кто сидит на хвосте
var incoming: int = 0           # ракет летит в нас
var zone_id: String = ""
var shot_error: float = 0.0     # угол между носом и точкой упреждения, рад (последний расчёт)
var shot_tolerance: float = 0.0
var tactic: String = ""         # "" | "zoom" | "reverse" | "extend" — выход из затяжного виража

var _rng := RandomNumberGenerator.new()
var _inited: bool = false
var _think_t: float = 0.0
var _prev_basis: Basis = Basis.IDENTITY
var _has_prev: bool = false
var _rates: Vector3 = Vector3.ZERO
var _ctrl: Vector3 = Vector3.ZERO       # сглаженные pitch, roll, yaw
var _thr: float = 0.9
var _err: Vector2 = Vector2.ZERO
var _err_goal: Vector2 = Vector2.ZERO
var _err_t: float = 0.0
var _tv_est: Vector3 = Vector3.ZERO
var _tv_for = null
var _threat_age: float = 0.0
var _evade_t: float = 0.0
var _break_side: float = 1.0
var _break_flip_t: float = 3.0
var _flare_t: float = 0.0
var _missile_cd: float = 3.0
var _burst_t: float = 0.0
var _pause_t: float = 0.0
var _on_target_t: float = 0.0
var _phase_t: float = 0.0
var _rockets_at_dive: int = 0
var _bomb_hold: float = 0.0
var _patrol_point: Vector3 = Vector3.ZERO
var _zone: Dictionary = {}
var _gear_t: float = 0.0
var _gear_pulse: bool = false
var _orbit_side: float = 1.0
var _terrain_t: float = 0.0
var _g_terrain: float = -2.0
var _ttc: float = INF
var _h_near: float = 0.0
var _avoid_dir: Vector3 = Vector3.ZERO
var _recover_t: float = 0.0
var _patrol_t: float = 0.0
var _tactic_t: float = 0.0
var _stale_t: float = 0.0
var _stale_limit: float = 8.0
var _prev_aim: Vector3 = Vector3.FORWARD
var _has_aim: bool = false
var _aim_rate: Vector3 = Vector3.ZERO
var _shot_prev_err: float = 0.0
var _shot_prev_for = null
var _shot_dt: float = 0.0


func _init_for(ac) -> void:
	_inited = true
	skill = clampf(skill, 0.0, 1.0)
	_rng.seed = hash(int(ac.uid) * 7919 + 17)
	var d: Dictionary = ac.def
	role = "attacker" if String(d.get("line", "fighter")) == "attacker" else "fighter"
	aim_error_deg = lerpf(4.0, 0.8, skill)
	reaction = lerpf(0.8, 0.2, skill)
	g_use = lerpf(0.6, 0.95, skill)
	gun_range = lerpf(700.0, 450.0, skill)
	capture_mind = role == "fighter" and _rng.randf() < CAPTURE_CHANCE
	_think_t = _rng.randf_range(0.0, THINK_INTERVAL)
	_orbit_side = -1.0 if _rng.randf() < 0.5 else 1.0
	_break_side = _orbit_side
	_thr = float(ac.fm.throttle)
	_new_patrol_point(ac)


func get_controls(ac, dt: float) -> Dictionary:
	var c := Data.empty_controls()
	if ac == null or not is_instance_valid(ac) or ac.get("fm") == null:
		return c
	var f = ac.fm
	if not _inited:
		_init_for(ac)
	if _has_prev:
		_rates = _rates.lerp(Steer.body_rates(_prev_basis, f.basis, dt), 0.5)
	_prev_basis = f.basis
	_has_prev = true
	if not bool(ac.alive):
		c.throttle = 0.0
		return c
	_shot_dt = dt
	_tick(ac, dt)

	var plan := {"dir": f.forward(), "pull": g_use, "throttle": 1.0, "ab": false, "guns": false,
		"rocket": false, "bomb": false, "missile": false, "flares": false, "shot": false}
	if bool(f.on_ground):
		_plan_takeoff(ac, plan)
	elif _evade_t > 0.0:
		state = "evade"
		_plan_evade(ac, plan, dt)
	else:
		if state == "evade":
			state = "engage" if _valid_alive(target) and target.has_method("velocity") else "patrol"
		match state:
			"engage":
				_plan_engage(ac, plan, dt)
			"attack_ground":
				_plan_ground(ac, plan, dt)
			"capture":
				_plan_capture(ac, plan)
			"return":
				_plan_return(ac, plan)
			_:
				_plan_patrol(ac, plan)
	if not bool(f.on_ground):
		_apply_safety(ac, plan, dt)
		_check_gear(ac, dt)

	var spd: float = f.vel.length()
	# крен не глубже, чем позволяет допустимая перегрузка (иначе в вираже теряется высота)
	var n_ach := minf(0.95 * float(ac.def.get("g_limit", 8.0)), 0.9 * pow(spd / maxf(_stall_tas(ac), 1.0), 2.0))
	n_ach = 1.0 + (n_ach - 1.0) * clampf(float(plan.pull) / maxf(g_use, 0.1), 0.3, 1.0)
	var max_bank := acos(clampf(1.2 / maxf(n_ach, 1.25), 0.0, 1.0))
	if _recover_t > 0.0:
		max_bank = PI
	elif state == "evade":
		max_bank += 0.4
	# скорость поворота линии визирования (для упреждения в вираже)
	var aim_now: Vector3 = (plan.dir as Vector3).normalized()
	if _has_aim and dt > 0.0 and _prev_aim.dot(aim_now) > 0.985:
		var w_raw := _prev_aim.cross(aim_now) / dt
		_aim_rate = _aim_rate.lerp(w_raw, 1.0 - exp(-dt / 0.15))
	else:
		_aim_rate = Vector3.ZERO
	if _aim_rate.length() > 1.0:
		_aim_rate = _aim_rate.normalized()
	_prev_aim = aim_now
	_has_aim = true
	var s := Steer.steer(f.basis, aim_now, _rates, ac.def, spd, float(plan.pull), max_bank, _aim_rate)
	var pitch_cmd: float = s.pitch
	# не висим на ограничителе угла атаки: там самолёт быстрее всего теряет скорость
	var a_crit := deg_to_rad(float(ac.def.get("alpha_crit_deg", 16.0)))
	var aoa_frac := float(f.aoa) / maxf(a_crit, 0.05)
	if pitch_cmd > 0.0 and _recover_t <= 0.0 and aoa_frac > 0.75 and not bool(plan.shot):
		pitch_cmd *= clampf(1.0 - (aoa_frac - 0.75) * 2.5, 0.45, 1.0)
	var k := 1.0 - exp(-dt / lerpf(0.12, 0.05, skill))
	_ctrl = _ctrl.lerp(Vector3(pitch_cmd, s.roll, s.yaw), k)
	if bool(f.on_ground):
		_ctrl = Vector3(s.pitch, 0.0, s.yaw)
	_thr = lerpf(_thr, float(plan.throttle), 1.0 - exp(-dt / 0.4))
	# ручка до упора при малом газе включает кобру (high_aoa) — боту она не нужна, на скорости это перегрузка
	c.pitch = minf(_ctrl.x, PITCH_CAP_HIGH_AOA) if bool(ac.def.get("high_aoa", false)) else _ctrl.x
	c.roll = _ctrl.y
	c.yaw = _ctrl.z
	c.throttle = clampf(_thr, 0.0, 1.0)
	c.afterburner = bool(plan.ab)
	c.guns = bool(plan.guns)
	c.rocket = bool(plan.rocket)
	c.bomb = bool(plan.bomb)
	c.missile = bool(plan.missile)
	c.flares = bool(plan.flares)
	c.gear_toggle = _gear_pulse
	_gear_pulse = false
	return c


# ---------------------------------------------------------------- таймеры и решения

func _tick(ac, dt: float) -> void:
	_missile_cd = maxf(0.0, _missile_cd - dt)
	_pause_t = maxf(0.0, _pause_t - dt)
	_flare_t = maxf(0.0, _flare_t - dt)
	_evade_t = maxf(0.0, _evade_t - dt)
	_phase_t += dt
	# ошибка прицеливания медленно блуждает
	_err_t -= dt
	if _err_t <= 0.0:
		_err_t = _rng.randf_range(1.0, 2.0)
		var e := deg_to_rad(aim_error_deg) * 0.7
		_err_goal = Vector2(_rng.randfn(0.0, e), _rng.randfn(0.0, e))
	_err = _err.lerp(_err_goal, 1.0 - exp(-dt / 0.6))
	# угроза замечается не сразу
	if threat != null or incoming > 0:
		_threat_age += dt
		if _threat_age >= reaction and _evade_t <= 0.0:
			_start_evade(ac)
	else:
		_threat_age = 0.0
	_think_t -= dt
	if _think_t <= 0.0:
		_think_t = THINK_INTERVAL
		_think(ac)


func _start_evade(ac) -> void:
	_evade_t = _rng.randf_range(2.5, 4.0)
	_break_flip_t = _rng.randf_range(2.0, 3.5)
	if threat != null and is_instance_valid(threat):
		var to: Vector3 = (threat.global_position as Vector3) - (ac.fm.pos as Vector3)
		var side := signf(to.dot(ac.fm.right()))
		_break_side = side if side != 0.0 else _break_side
	else:
		_break_side = -1.0 if _rng.randf() < 0.5 else 1.0


func _battle():
	var b = Game.battle
	if b != null and is_instance_valid(b):
		return b
	return null


func _world():
	var b = _battle()
	if b == null or not ("world" in b):
		return null
	var w = b.get("world")
	return w if w != null and is_instance_valid(w) else null


func _height(x: float, z: float) -> float:
	var w = _world()
	if w != null and w.has_method("height_at"):
		return maxf(float(w.height_at(x, z)), 0.0)
	return 0.0


func _half_size() -> float:
	var w = _world()
	if w != null and w.has_method("half_size"):
		return float(w.half_size())
	return 5000.0


func _think(ac) -> void:
	var b = _battle()
	_update_threats(ac, b)
	if b == null:
		state = "patrol"
		target = null
		return
	var air = _pick_air_target(ac, b)
	if role == "attacker" and ac.weapons.has_ordnance():
		var gt = _pick_ground_target(ac, b)
		if gt != null:
			if gt != target or state != "attack_ground":
				attack_phase = "setup"
				_phase_t = 0.0
			target = gt
			state = "attack_ground"
			return
	if ac.weapons.is_empty():
		state = "return"
		target = null
		return
	var air_d := INF
	if air != null:
		air_d = (air.global_position as Vector3).distance_to(ac.fm.pos)
	if air != null and (air_d < 2000.0 or not capture_mind):
		target = air
		state = "engage"
		return
	if capture_mind and _pick_zone(ac, b):
		state = "capture"
		target = null
		return
	if air != null:
		target = air
		state = "engage"
		return
	state = "patrol"
	target = null


func _update_threats(ac, b) -> void:
	threat = null
	incoming = 0
	if b == null:
		return
	if "projectiles" in b:
		var pm = b.get("projectiles")
		if pm != null and is_instance_valid(pm) and pm.has_method("incoming_missiles"):
			incoming = int(pm.incoming_missiles(ac))
	if not b.has_method("enemies_of"):
		return
	var mp: Vector3 = ac.fm.pos
	var fwd: Vector3 = ac.fm.forward()
	var best_d := TAIL_RANGE
	for e in b.enemies_of(int(ac.team)):
		if not _valid_alive(e):
			continue
		var ep: Vector3 = e.global_position
		var to := ep - mp
		var d := to.length()
		if d > best_d or d < 1.0 or not _can_see(ac, e, d):
			continue
		var dirn := to / d
		var efwd: Vector3 = e.forward() if e.has_method("forward") else Vector3.ZERO
		# сзади (вне переднего конуса) и смотрит на нас
		if fwd.dot(dirn) < 0.2 and efwd.dot(-dirn) > 0.9:
			threat = e
			best_d = d


func _valid_alive(e) -> bool:
	if e == null or not is_instance_valid(e):
		return false
	if "alive" in e and not bool(e.get("alive")):
		return false
	return e is Node3D and (e as Node3D).is_inside_tree()


func _can_see(ac, e, d: float) -> bool:
	var st := 1.0
	var ed = e.get("def")
	if ed is Dictionary:
		st = float(ed.get("stealth", 1.0))
	if d > VISUAL_RANGE * st:
		return false
	var hidden: bool = ("in_cloud" in e and bool(e.get("in_cloud"))) or bool(ac.in_cloud)
	return not (hidden and d > CLOUD_SIGHT)


func _pick_air_target(ac, b):
	if not b.has_method("enemies_of"):
		return null
	var best = null
	var best_s := INF
	var mp: Vector3 = ac.fm.pos
	var fwd: Vector3 = ac.fm.forward()
	for e in b.enemies_of(int(ac.team)):
		if not _valid_alive(e):
			continue
		var ep: Vector3 = e.global_position
		var to := ep - mp
		var d := to.length()
		if d < 1.0 or not _can_see(ac, e, d):
			continue
		var dirn := to / d
		var s := d + (1.0 - fwd.dot(dirn)) * 350.0
		if e == target:
			s -= 400.0
		if e == threat:
			s -= 600.0
		var efwd: Vector3 = e.forward() if e.has_method("forward") else Vector3.ZERO
		if efwd.dot(-dirn) > 0.9 and d < 1500.0:
			s -= 300.0   # летит на нас
		if s < best_s:
			best_s = s
			best = e
	return best


func _pick_ground_target(ac, b):
	if not b.has_method("ground_targets_of"):
		return null
	var best = null
	var best_s := INF
	var mp: Vector3 = ac.fm.pos
	for u in b.ground_targets_of(1 - int(ac.team)):
		if not _valid_alive(u):
			continue
		if "kind" in u and String(u.get("kind")) == "carrier":
			continue
		var up: Vector3 = u.global_position
		var s := Vector2(up.x - mp.x, up.z - mp.z).length()
		if u == target:
			s -= 600.0
		if s < best_s:
			best_s = s
			best = u
	return best


func _pick_zone(ac, b) -> bool:
	var w = _world()
	if w == null or not ("zones" in w):
		return false
	var zones = w.get("zones")
	if not (zones is Array) or (zones as Array).is_empty():
		return false
	var owners := {}
	if "zones_state" in b:
		var zs = b.get("zones_state")
		if zs is Array:
			for z in zs:
				if z is Dictionary:
					owners[String(z.get("id", ""))] = int(z.get("owner", -1))
	var mp: Vector3 = ac.fm.pos
	var best: Dictionary = {}
	var best_d := INF
	for z in zones:
		if not (z is Dictionary):
			continue
		var zid := String(z.get("id", ""))
		if int(owners.get(zid, -1)) == int(ac.team):
			continue
		var zp: Vector3 = z.get("pos", Vector3.ZERO)
		var d := Vector2(zp.x - mp.x, zp.z - mp.z).length()
		if zid == zone_id:
			d -= 500.0
		if d < best_d:
			best_d = d
			best = z
	if best.is_empty():
		return false
	_zone = best
	zone_id = String(best.get("id", ""))
	return true


## Новая точка патруля — впереди по курсу (чтобы не кружить вокруг близкой точки), в середине карты.
func _new_patrol_point(ac) -> void:
	var alt := 1600.0 if role == "fighter" else 1000.0
	var f = ac.fm
	var fwd: Vector3 = f.forward()
	var h := Vector3(fwd.x, 0.0, fwd.z)
	h = h.normalized() if h.length_squared() > 1e-4 else Vector3.FORWARD
	var p: Vector3 = (f.pos as Vector3) + h.rotated(Vector3.UP, _rng.randf_range(-1.0, 1.0)) * _rng.randf_range(1800.0, 3200.0)
	var front := 400.0 if int(ac.team) == 0 else -400.0
	p.x = clampf(p.x, -2800.0, 2800.0)
	p.z = clampf(p.z, front - 2200.0, front + 2200.0)
	_patrol_point = Vector3(p.x, alt + _rng.randf_range(-200.0, 300.0), p.z)
	_patrol_t = 0.0


# ---------------------------------------------------------------- планы

## Направление по горизонтали hdir с углом траектории к нужной высоте.
func _toward_alt(hdir: Vector3, cur_y: float, goal_y: float, dist: float, max_up: float = 0.35, max_down: float = 0.3) -> Vector3:
	var h := Vector3(hdir.x, 0.0, hdir.z)
	if h.length_squared() < 1e-6:
		h = Vector3.FORWARD
	h = h.normalized()
	var gamma := clampf(atan2(goal_y - cur_y, maxf(dist, 600.0)), -max_down, max_up)
	return (h * cos(gamma) + Vector3.UP * sin(gamma)).normalized()


func _apply_error(dir: Vector3) -> Vector3:
	var d := dir.rotated(Vector3.UP, _err.x)
	var r := d.cross(Vector3.UP)
	if r.length_squared() > 1e-6:
		d = d.rotated(r.normalized(), _err.y)
	return d.normalized()


static func _intercept(rel: Vector3, rv: Vector3, s: float) -> float:
	var a := rv.dot(rv) - s * s
	var b := 2.0 * rel.dot(rv)
	var c := rel.dot(rel)
	var t := rel.length() / maxf(s, 1.0)
	if absf(a) < 1e-6:
		if b < -1e-6:
			t = -c / b
	else:
		var disc := b * b - 4.0 * a * c
		if disc >= 0.0:
			var sq := sqrt(disc)
			var t1 := (-b - sq) / (2.0 * a)
			var t2 := (-b + sq) / (2.0 * a)
			var tt := INF
			if t1 > 0.0:
				tt = t1
			if t2 > 0.0 and t2 < tt:
				tt = t2
			if tt < INF:
				t = tt
	return clampf(t, 0.0, 3.0)


func _plan_takeoff(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var fwd: Vector3 = f.forward()
	var h := Vector3(fwd.x, 0.0, fwd.z).normalized()
	plan.throttle = 1.0
	plan.ab = true
	var vs: float = f.stall_speed()
	var up := 0.17 if f.vel.length() > vs * 1.1 else 0.0
	plan.dir = (h * cos(up) + Vector3.UP * sin(up)).normalized()
	plan.pull = 0.6
	_gear_t = 0.0


func _check_gear(ac, dt: float) -> void:
	var f = ac.fm
	if bool(f.gear_down) and not bool(f.on_ground) and ac.altitude_agl() > 40.0:
		_gear_t += dt
		if _gear_t > 1.0:
			_gear_t = -3.0
			_gear_pulse = true


func _gun_solution(ac, tgt) -> Dictionary:
	var f = ac.fm
	var tp: Vector3 = tgt.global_position
	var tv := Vector3.ZERO
	if tgt.has_method("velocity"):
		tv = tgt.velocity()
	if _tv_for != tgt:
		_tv_for = tgt
		_tv_est = tv
	var mp: Vector3 = f.pos
	var mv: Vector3 = f.vel
	var rel := tp - mp
	var d := rel.length()
	var bs: float = ac.weapons.gun_speed()
	var t := _intercept(rel, _tv_est - mv, bs)
	var aim := rel + (_tv_est - mv) * t + Vector3(0.0, 0.5 * G * t * t, 0.0)
	var dir: Vector3 = _apply_error(aim.normalized()) if aim.length_squared() > 1e-4 else f.forward()
	var ang: float = (f.forward() as Vector3).angle_to(dir)
	var tr := 6.0
	if tgt.has_method("hit_radius"):
		tr = float(tgt.hit_radius())
	elif "radius" in tgt:
		tr = float(tgt.get("radius"))
	# слабые боты стреляют и при худшем прицеле
	var tol := maxf(deg_to_rad(1.2), atan2(tr, maxf(d, 1.0))) + deg_to_rad(0.5 + aim_error_deg * 0.3)
	# прогноз ошибки через 0.25 с: если точка упреждения быстро наезжает на нос — открываем огонь заранее
	var pred := ang
	if _shot_prev_for == tgt and _shot_dt > 0.0:
		var rate := (ang - _shot_prev_err) / _shot_dt
		if rate < 0.0:
			pred = maxf(0.0, ang + rate * 0.25)
	_shot_prev_err = ang
	_shot_prev_for = tgt
	shot_error = ang
	shot_tolerance = tol
	return {"dir": dir, "ang": minf(ang, pred + 0.3 * (ang - pred)), "d": d, "tol": tol, "rel": rel, "tv": tv}


func _fire_guns(plan: Dictionary, want: bool, dt: float) -> void:
	if want:
		_on_target_t += dt
	else:
		_on_target_t = 0.0
		_burst_t = maxf(0.0, _burst_t - dt)
		return
	if _on_target_t < reaction * 0.5 or _pause_t > 0.0:
		return
	plan.guns = true
	_burst_t += dt
	if _burst_t > lerpf(1.0, 2.0, skill):
		_burst_t = 0.0
		_pause_t = _rng.randf_range(0.3, 0.7)


func _plan_engage(ac, plan: Dictionary, dt: float) -> void:
	if not _valid_alive(target) or not target.has_method("velocity"):
		state = "patrol"
		_plan_patrol(ac, plan)
		return
	var f = ac.fm
	var sol := _gun_solution(ac, target)
	_tv_est = _tv_est.lerp(sol.tv, 1.0 - exp(-dt / maxf(0.05, reaction * 0.5)))
	var rel: Vector3 = sol.rel
	var d: float = sol.d
	var spd: float = f.vel.length()
	# издалека — погоня с небольшим упреждением, вблизи — упреждение для пушек
	var pp: Vector3 = rel + _tv_est * clampf(d / maxf(spd, 50.0), 0.0, 3.0) * 0.5
	var dir: Vector3 = pp.normalized()
	if d < 1100.0:
		dir = Steer.slerp_dir(dir, sol.dir, clampf((1100.0 - d) / 400.0, 0.0, 1.0))
	var closing := -(rel / maxf(d, 1.0)).dot(_tv_est - (f.vel as Vector3))
	plan.throttle = 1.0
	plan.ab = spd < 0.8 * float(ac.def.get("vne", 200.0))
	# в вираже быстрее угловой скорости разворот только хуже — сбрасываем газ
	var corner := _stall_tas(ac) * sqrt(minf(float(ac.def.get("g_limit", 8.0)), 9.0)) * 0.95
	if spd > 1.2 * corner and float(sol.ang) > 0.5 and d < 2500.0:
		plan.throttle = 0.3
		plan.ab = false
	if d < 350.0 and closing > 35.0:
		plan.throttle = 0.35   # не проскочить цель
		plan.ab = false
	if d < 120.0 and closing > 10.0:
		# слишком близко — уходим вверх и в сторону
		dir = ((rel / maxf(d, 1.0)) + (f.up() as Vector3) * 1.2 + (f.right() as Vector3) * 0.5 * _orbit_side).normalized()
		plan.throttle = 0.2
	# низко и не на линии огня — тянемся вверх, пока есть скорость
	if ac.altitude_agl() < 500.0 and float(sol.ang) > 0.5 and spd > 1.6 * _stall_tas(ac):
		dir = (dir + Vector3(0.0, 0.2, 0.0)).normalized()
	dir = _engage_tactic(ac, dir, sol, plan, dt)
	plan.shot = tactic == "" and d < gun_range * 1.6 and float(sol.ang) < 0.35
	plan.dir = dir
	plan.pull = g_use
	_fire_guns(plan, d < gun_range and float(sol.ang) < float(sol.tol), dt)
	# ракета, если захват готов
	var w = ac.weapons
	if _missile_cd <= 0.0 and int(w.ammo.get("missiles", 0)) > 0 and w.lock_target == target and float(w.lock_progress) >= 1.0 and d > 400.0:
		plan.missile = true
		_missile_cd = lerpf(9.0, 4.0, skill)


## Затяжной вираж без шанса на выстрел: через несколько секунд пробуем другое —
## горку, перекладку в другую сторону или разгон с возвратом на встречный курс.
func _engage_tactic(ac, dir: Vector3, sol: Dictionary, plan: Dictionary, dt: float) -> Vector3:
	var f = ac.fm
	var d: float = sol.d
	var ang: float = sol.ang
	var fwd: Vector3 = f.forward()
	var fh := Vector3(fwd.x, 0.0, fwd.z)
	fh = fh.normalized() if fh.length_squared() > 1e-4 else Vector3.FORWARD
	if tactic == "":
		if ang > 0.6 and d < 1500.0:
			_stale_t += dt
		else:
			_stale_t = maxf(0.0, _stale_t - 2.0 * dt)
		if _stale_t < _stale_limit:
			return dir
		_stale_t = 0.0
		_stale_limit = _rng.randf_range(6.0, 12.0)
		var ratio: float = (f.vel as Vector3).length() / maxf(_stall_tas(ac), 1.0)
		var r := _rng.randf()
		if ratio > 1.9 and r < 0.4:
			tactic = "zoom"
		elif r < 0.7:
			tactic = "reverse"
			_break_side = -signf(f.bank()) if absf(f.bank()) > 0.2 else -_break_side
		else:
			tactic = "extend"
		_tactic_t = _rng.randf_range(4.0, 7.0)
	_tactic_t -= dt
	if _tactic_t <= 0.0 or (d < gun_range and ang < 0.25):
		tactic = ""
		return dir
	var right := fh.cross(Vector3.UP).normalized()
	match tactic:
		"zoom":
			var to_h := Vector3((sol.rel as Vector3).x, 0.0, (sol.rel as Vector3).z)
			to_h = to_h.normalized() if to_h.length_squared() > 1.0 else fh
			return (to_h * 0.6 + Vector3.UP).normalized()
		"reverse":
			return (fh * 0.3 + right * _break_side).normalized()
		_:
			plan.throttle = 1.0
			plan.ab = true
			return (fh + Vector3(0.0, -0.12, 0.0)).normalized()


func _plan_evade(ac, plan: Dictionary, dt: float) -> void:
	var f = ac.fm
	var fwd: Vector3 = f.forward()
	var h := Vector3(fwd.x, 0.0, fwd.z)
	if h.length_squared() < 1e-4:
		var v: Vector3 = f.vel
		h = Vector3(v.x, 0.0, v.z)
	h = h.normalized() if h.length_squared() > 1e-6 else Vector3.FORWARD
	var right := h.cross(Vector3.UP).normalized()
	_break_flip_t -= dt
	if _break_flip_t <= 0.0:
		_break_flip_t = _rng.randf_range(2.0, 3.5)
		if threat != null:
			_break_side = -_break_side   # ножницы
	# мало скорости — ломаем вираж со снижением, чтобы не свалиться
	var ratio: float = (f.vel as Vector3).length() / maxf(_stall_tas(ac), 1.0)
	var down := -0.12 if ratio > 1.8 else -0.4
	if ac.altitude_agl() < 700.0:
		down = 0.0
	plan.dir = (h * 0.25 + right * _break_side + Vector3(0.0, down, 0.0)).normalized()
	plan.pull = minf(1.0, g_use + 0.1)
	plan.throttle = 1.0
	plan.ab = true
	if incoming > 0 and int(ac.weapons.ammo.get("flares", 0)) > 0 and _flare_t <= 0.0:
		plan.flares = true
		_flare_t = 0.8
	# если враг проскочил вперёд — стреляем навскидку
	if _valid_alive(target) and target.has_method("velocity"):
		var sol := _gun_solution(ac, target)
		_fire_guns(plan, float(sol.d) < gun_range and float(sol.ang) < float(sol.tol), dt)
	if _evade_t <= dt and threat != null and is_instance_valid(threat):
		target = threat   # после манёвра — бой с тем, кто атаковал
		state = "engage"


func _plan_ground(ac, plan: Dictionary, dt: float) -> void:
	if not _valid_alive(target) or not ac.weapons.has_ordnance():
		state = "patrol"
		target = null
		_plan_patrol(ac, plan)
		return
	var f = ac.fm
	var w = ac.weapons
	var tp: Vector3 = target.global_position
	var mp: Vector3 = f.pos
	var to := tp - mp
	var hd := Vector2(to.x, to.z).length()
	var hdir := Vector3(to.x, 0.0, to.z).normalized() if hd > 1.0 else (f.forward() as Vector3)
	var h := mp.y - tp.y
	var rockets := int(w.ammo.get("rockets", 0))
	var bombs := int(w.ammo.get("bombs", 0))
	var use_bombs := rockets <= 0 and bombs > 0
	var spd: float = f.vel.length()
	var vne := float(ac.def.get("vne", 200.0))
	var dive_alt := 750.0 if String(ac.def.get("kind", "prop")) == "prop" else 950.0
	plan.pull = g_use
	plan.throttle = 1.0
	match attack_phase:
		"extend":
			var goal := tp.y + (BOMB_ALT if use_bombs else dive_alt)
			var away := -hdir
			var fh := Vector3((f.forward() as Vector3).x, 0.0, (f.forward() as Vector3).z).normalized()
			if fh.dot(away) > 0.3:
				away = fh   # уже летим прочь — не дёргаемся
			plan.dir = _toward_alt(away, mp.y, goal, 1500.0)
			if hd > (2900.0 if use_bombs else 2200.0) or _phase_t > 20.0:
				_set_phase("setup")
		"dive":
			var d := to.length()
			var rs := float(ac.def.get("weapons", {}).get("rockets", {}).get("speed", 500.0))
			var tof := d / maxf(rs + spd, 100.0)
			var aim := to + Vector3(0.0, 0.5 * G * tof * tof, 0.0)
			var dir := _apply_error(aim.normalized())
			plan.dir = dir
			plan.pull = minf(1.0, g_use + 0.05)
			plan.throttle = 0.5 if spd < 0.8 * vne else 0.0
			var ang := (f.forward() as Vector3).angle_to(dir)
			var tol := deg_to_rad(1.6) + atan2(6.0, maxf(d, 1.0))
			if rockets > 0 and d < 1500.0 and ang < tol and _rockets_at_dive - rockets < 6:
				plan.rocket = true
			_fire_guns(plan, d < 900.0 and ang < tol * 1.3, dt)
			if h - 0.0 < 300.0 or d < 450.0 or ac.altitude_agl() < 280.0:
				_set_phase("egress")
		"bomb_run":
			var goal := tp.y + BOMB_ALT
			var vel: Vector3 = f.vel
			var vy := vel.y
			var t_fall := (vy + sqrt(maxf(vy * vy + 2.0 * G * maxf(h, 1.0), 0.0))) / G
			var impact := Vector3(mp.x + vel.x * t_fall * 0.95, tp.y, mp.z + vel.z * t_fall * 0.95)
			var vh := Vector3(vel.x, 0.0, vel.z)
			var vdir := vh.normalized() if vh.length_squared() > 1.0 else hdir
			var miss := tp - impact
			miss.y = 0.0
			var along := miss.dot(vdir)
			var cross := (miss - vdir * along).length()
			var rad := float(ac.def.get("weapons", {}).get("bombs", {}).get("radius", 20.0))
			# держим высоту и летим прямо на цель
			plan.dir = _toward_alt(hdir, mp.y, goal, maxf(hd, 800.0), 0.2, 0.2)
			plan.throttle = 0.9
			if _bomb_hold > 0.0:
				_bomb_hold -= dt
				plan.bomb = true
				if _bomb_hold <= 0.0:
					_set_phase("egress")
			elif along <= rad * 0.3 and cross < rad * 1.5 + 15.0:
				_bomb_hold = 0.45   # две бомбы с интервалом 0.35 с
				plan.bomb = true
			elif hdir.dot(vdir) < 0.0 or (along < -rad * 2.0):
				_set_phase("extend")   # проскочили — заход заново
		"egress":
			var fh := Vector3((f.forward() as Vector3).x, 0.0, (f.forward() as Vector3).z)
			plan.dir = _toward_alt(fh, mp.y, mp.y + 400.0, 600.0, 0.35, 0.0)
			plan.ab = true
			if _phase_t > 5.0:
				_set_phase("setup")
		_:
			attack_phase = "setup"
			if use_bombs:
				var goal_b := tp.y + BOMB_ALT
				plan.dir = _toward_alt(hdir, mp.y, goal_b, maxf(hd - 2500.0, 800.0))
				if hd < 1300.0 and absf(h - BOMB_ALT) > 150.0:
					_set_phase("extend")
				elif hd < 2600.0 and absf(h - BOMB_ALT) < 200.0:
					_set_phase("bomb_run")
			else:
				var goal_d := tp.y + dive_alt
				plan.dir = _toward_alt(hdir, mp.y, goal_d, maxf(hd - 1500.0, 700.0))
				var dep := atan2(h, maxf(hd, 1.0))
				if dep > deg_to_rad(22.0) and h > 380.0:
					_set_phase("dive")
					_rockets_at_dive = rockets
				elif hd < 1300.0:
					_set_phase("extend")
	if attack_phase != "dive" and attack_phase != "bomb_run":
		plan.ab = plan.ab or spd < 1.5 * _stall_tas(ac)


func _set_phase(p: String) -> void:
	attack_phase = p
	_phase_t = 0.0
	if p != "bomb_run":
		_bomb_hold = 0.0


func _plan_capture(ac, plan: Dictionary) -> void:
	if _zone.is_empty():
		_plan_patrol(ac, plan)
		return
	var f = ac.fm
	var mp: Vector3 = f.pos
	var zp: Vector3 = _zone.get("pos", Vector3.ZERO)
	var r: float = float(_zone.get("radius", 450.0))
	var max_alt: float = float(_zone.get("max_alt", 500.0))
	var ground := _height(zp.x, zp.z)
	var goal := ground + clampf(max_alt * 0.5, 150.0, 320.0)
	var to := Vector3(zp.x - mp.x, 0.0, zp.z - mp.z)
	var hd := to.length()
	var dir_h: Vector3
	if hd > r:
		dir_h = to / maxf(hd, 1.0)
	else:
		# круг над зоной
		var inward := to / maxf(hd, 1.0)
		var tangent := Vector3.UP.cross(inward) * _orbit_side
		dir_h = (tangent + inward * clampf((hd - r * 0.55) / (r * 0.3), -1.0, 1.0)).normalized()
	plan.dir = _toward_alt(dir_h, mp.y, goal, maxf(hd - r, 700.0), 0.3, 0.25)
	plan.throttle = 0.85
	plan.pull = g_use * 0.8


func _plan_patrol(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var mp: Vector3 = f.pos
	var to := Vector3(_patrol_point.x - mp.x, 0.0, _patrol_point.z - mp.z)
	_patrol_t += 1.0 / 60.0
	if to.length() < 700.0 or _patrol_t > 40.0:
		_new_patrol_point(ac)
		to = Vector3(_patrol_point.x - mp.x, 0.0, _patrol_point.z - mp.z)
	plan.dir = _toward_alt(to, mp.y, _patrol_point.y, to.length(), 0.3, 0.2)
	plan.throttle = 0.9
	plan.pull = g_use * 0.7
	var spd: float = f.vel.length()
	plan.ab = mp.y < _patrol_point.y - 300.0 and spd < 1.8 * _stall_tas(ac)


func _plan_return(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var mp: Vector3 = f.pos
	var home := Vector3(0.0, 900.0, 3500.0 if int(ac.team) == 0 else -3500.0)
	var w = _world()
	if w != null and "airfields" in w:
		var afs = w.get("airfields")
		if afs is Array:
			for af in afs:
				if af is Dictionary and int(af.get("team", -1)) == int(ac.team):
					var p: Vector3 = af.get("pos", home)
					home = Vector3(p.x, p.y + 900.0, p.z)
					break
	var to := Vector3(home.x - mp.x, 0.0, home.z - mp.z)
	var hd := to.length()
	var dir_h := to / maxf(hd, 1.0)
	if hd < 1500.0:
		var tangent := Vector3.UP.cross(dir_h) * _orbit_side
		dir_h = (tangent + dir_h * clampf((hd - 1000.0) / 500.0, -1.0, 1.0)).normalized()
	plan.dir = _toward_alt(dir_h, mp.y, home.y, maxf(hd, 800.0), 0.25, 0.2)
	plan.throttle = 0.8
	plan.pull = g_use * 0.7


# ---------------------------------------------------------------- безопасность

## Скорость сваливания на текущей высоте (истинная).
func _stall_tas(ac) -> float:
	var f = ac.fm
	var vs: float = f.stall_speed()
	var rho := RHO0 * exp(-clampf(float(f.pos.y), -500.0, 30000.0) / 9000.0)
	return vs * sqrt(RHO0 / rho)


func _apply_safety(ac, plan: Dictionary, dt: float) -> void:
	var f = ac.fm
	var pos: Vector3 = f.pos
	var vel: Vector3 = f.vel
	var spd := vel.length()
	var fwd: Vector3 = f.forward()
	var dir: Vector3 = plan.dir
	if dir.length_squared() < 1e-6:
		dir = fwd
	dir = dir.normalized()
	var gamma := asin(clampf(dir.y, -1.0, 1.0))
	var hdir := Vector3(dir.x, 0.0, dir.z)
	if hdir.length_squared() < 0.0025:
		hdir = Vector3(fwd.x, 0.0, fwd.z)
		if hdir.length_squared() < 0.0025:
			hdir = Vector3(vel.x, 0.0, vel.z)
	hdir = hdir.normalized() if hdir.length_squared() > 1e-8 else Vector3.FORWARD
	var g_min := -1.3
	var g_max := 1.3

	# энергия: чем медленнее, тем положе разрешённый набор высоты
	var vs := _stall_tas(ac)
	var ratio := spd / maxf(vs, 1.0)
	g_max = minf(g_max, lerpf(deg_to_rad(-25.0), deg_to_rad(70.0), clampf((ratio - 1.15) / 1.1, 0.0, 1.0)))
	# близкий выстрел — тянем упреждение, пока скорость позволяет
	if ratio < 1.8 and not (bool(plan.shot) and ratio > 1.3):
		var k := clampf((ratio - 1.15) / 0.65, 0.0, 1.0)
		plan.pull = minf(float(plan.pull), lerpf(0.35, float(plan.pull), k))
	if ratio < 1.5:
		plan.throttle = 1.0
		plan.ab = true
	# цель сзади и мало энергии — разворачиваемся в горизонте, а не петлёй
	var vh := Vector3(vel.x, 0.0, vel.z)
	if vh.length_squared() > 1.0 and ratio < 2.6:
		vh = vh.normalized()
		var ang_h := vh.signed_angle_to(hdir, Vector3.UP)
		if absf(ang_h) > deg_to_rad(100.0):
			hdir = vh.rotated(Vector3.UP, signf(ang_h) * deg_to_rad(95.0))
			gamma = minf(gamma, 0.1)
	var vne := float(ac.def.get("vne", 200.0))
	if spd > 0.88 * vne:
		plan.throttle = minf(float(plan.throttle), 0.25)
		plan.ab = false
		g_min = maxf(g_min, deg_to_rad(-10.0) if spd < 0.96 * vne else deg_to_rad(5.0))
	if pos.y > 4500.0:
		g_max = minf(g_max, 0.0)

	# рельеф: прогноз по скорости на 6 с (считается 10 раз в секунду)
	var clearance := 70.0 + spd * 0.35
	_terrain_t -= dt
	if _terrain_t <= 0.0:
		_terrain_t = 0.1
		_scan_terrain(ac, clearance, hdir)
	g_min = maxf(g_min, _g_terrain)
	var path_now := asin(clampf(vel.y / maxf(spd, 1.0), -1.0, 1.0))
	if _g_terrain > path_now + 0.05:
		plan.pull = 1.0   # рельеф важнее экономии энергии
	if _avoid_dir != Vector3.ZERO:
		hdir = _avoid_dir   # стену не перелететь — отворачиваем
	var h0 := _height(pos.x, pos.z)
	var agl := pos.y - maxf(h0, _h_near)
	if agl < clearance:
		g_min = maxf(g_min, atan2(clearance - agl, 200.0) + 0.04)
	# чем ниже, тем положе разрешено пикировать
	g_min = maxf(g_min, -(agl - clearance) / 500.0)
	# вывод из пикирования: хватит ли высоты на радиус разворота
	var emergency := _ttc <= 2.0 or (agl < 40.0 and vel.y < 0.0)
	var path := asin(clampf(vel.y / maxf(spd, 1.0), -1.0, 1.0))
	if path < -0.08:
		var g_lim := float(ac.def.get("g_limit", 8.0))
		var n_av := clampf(minf(g_lim * 0.8, ratio * ratio * 0.85), 1.6, 9.0)
		var r := spd * spd / (G * (n_av - 1.0))
		var need := r * (1.0 - cos(path)) + (-vel.y) * 0.7 + clearance * 0.5
		if agl < need:
			emergency = true
		elif agl < need * 1.6:
			g_min = maxf(g_min, 0.0)
	if emergency:
		_recover_t = 1.2
	_recover_t = maxf(0.0, _recover_t - dt)

	# граница карты
	var lim := _half_size() - 700.0
	var over := maxf(absf(pos.x), absf(pos.z)) - lim
	if over > 0.0:
		var to_c := Vector3(-pos.x, 0.0, -pos.z).normalized()
		var wgt := clampf(over / 500.0, 0.0, 1.0)
		if hdir.dot(to_c) < 0.6:
			hdir = (hdir * (1.0 - wgt) + to_c * (wgt * 1.5 + 0.1)).normalized()

	# столкновения: прогноз сближения на 1.5 с
	var b = _battle()
	if b != null and "aircraft" in b:
		var list = b.get("aircraft")
		if list is Array:
			for o in list:
				if o == ac or not _valid_alive(o):
					continue
				var rel: Vector3 = (o.global_position as Vector3) - pos
				if rel.length_squared() > 640000.0:
					continue
				var rv: Vector3 = (o.velocity() if o.has_method("velocity") else Vector3.ZERO) - vel
				var rv2 := rv.length_squared()
				var tc := 0.0
				if rv2 > 1.0:
					tc = clampf(-rel.dot(rv) / rv2, 0.0, 1.5)
				var miss := rel + rv * tc
				var md := miss.length()
				if md < 50.0 and (tc > 0.0 or rel.length() < 60.0):
					var away := -miss / maxf(md, 0.1)
					if md < 0.5:
						away = (f.up() as Vector3)
					var wgt := clampf(1.0 - md / 50.0, 0.3, 1.0) * clampf(1.5 - tc / 1.5, 0.4, 1.0)
					hdir = (hdir + Vector3(away.x, 0.0, away.z) * 2.0 * wgt).normalized()
					gamma += clampf(away.y, -0.5, 0.5) * wgt

	gamma = clampf(gamma, g_min, maxf(g_max, g_min))
	dir = (hdir * cos(gamma) + Vector3.UP * sin(gamma)).normalized()
	if _recover_t > 0.0:
		var fh := Vector3(fwd.x, 0.0, fwd.z)
		if fh.length_squared() < 1e-4:
			fh = hdir
		fh = fh.normalized()
		if _avoid_dir != Vector3.ZERO:
			fh = (fh + _avoid_dir).normalized()
		dir = (fh * cos(0.6) + Vector3.UP * sin(0.6)).normalized()
		plan.pull = 1.0
		plan.throttle = 1.0
		plan.ab = true
		if attack_phase == "dive" or attack_phase == "bomb_run":
			_set_phase("egress")
	plan.dir = dir


## Прогноз рельефа: угол набора, нужный чтобы пройти над всем впереди, время до удара,
## и направление отворота, если гора слишком крутая.
func _scan_terrain(ac, clearance: float, want_h: Vector3) -> void:
	var f = ac.fm
	var pos: Vector3 = f.pos
	var vel: Vector3 = f.vel
	var spd := vel.length()
	_g_terrain = -2.0
	_ttc = INF
	_h_near = 0.0
	var steep := false
	# по скорости и по желаемому курсу (куда сейчас довернём)
	var want := Vector3(want_h.x, 0.0, want_h.z)
	var want_v := want.normalized() * Vector2(vel.x, vel.z).length() if want.length_squared() > 1e-6 else Vector3.ZERO
	for t in [0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0]:
		var tt: float = t
		var p := pos + vel * tt
		var hh := _height(p.x, p.z)
		if tt <= 1.0:
			_h_near = maxf(_h_near, hh)
		if want_v != Vector3.ZERO and tt >= 1.0:
			var q := pos + want_v * tt
			hh = maxf(hh, _height(q.x, q.z) - 0.25 * clearance)
		var dh := maxf(Vector2(p.x - pos.x, p.z - pos.z).length(), 40.0)
		var req := atan2(hh + clearance - pos.y, dh)
		# дальние точки важны меньше: до них ещё можно отвернуть
		if tt > 3.0:
			req -= 0.05 * (tt - 3.0)
		_g_terrain = maxf(_g_terrain, req)
		if tt >= 2.0 and req > 0.6:
			steep = true
		if p.y < hh + 20.0:
			_ttc = minf(_ttc, tt)
	if not steep:
		_avoid_dir = Vector3.ZERO
		return
	# стена: ищем направление, где рельеф ниже
	var hv := Vector3(vel.x, 0.0, vel.z)
	if hv.length_squared() < 1.0:
		hv = Vector3((f.forward() as Vector3).x, 0.0, (f.forward() as Vector3).z)
	hv = hv.normalized()
	var best := hv
	var best_h := INF
	for a in [0.0, 0.9, -0.9, 1.75, -1.75, PI]:
		var d := hv.rotated(Vector3.UP, a)
		var top := 0.0
		for k in [1.0, 2.5, 4.0]:
			var p2 := pos + d * spd * float(k)
			top = maxf(top, _height(p2.x, p2.z))
		top += absf(a) * 40.0   # при равенстве — меньший разворот
		if top < best_h:
			best_h = top
			best = d
	_avoid_dir = best if best.dot(hv) < 0.99 else Vector3.ZERO
