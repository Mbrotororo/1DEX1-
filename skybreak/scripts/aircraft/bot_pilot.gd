class_name BotPilot
extends Node
## Бот-пилот. Каждые 0.5 с выбирает цель и состояние, каждый кадр строит желаемое направление,
## накладывает ограничения безопасности (рельеф, скорость, граница) и рулит через aircraft_steer.
## skill 0..1: ошибка прицеливания 4..0.8°, реакция 0.8..0.2 с, перегрузка 0.6..0.95 от доступной,
## дистанция стрельбы 700..450 м.
## Захват зон: MatchManager ставит capture_duty и duty_zone; такой бот отвлекается только на врага
## ближе DUTY_BREAK_RANGE или на того, кто его атакует.
## Возврат: без боеприпасов или с тяжёлыми повреждениями бот летит на свой аэродром, садится
## (land_phase: cruise → approach → final → rollout → taxi → service → takeoff → climb), ждёт ремонта
## и перезарядки и снова взлетает. На палубу авианосца и после двух уходов на второй круг бот
## проходит низко над полосой (flyover), и бой засчитывает посадку без настоящего касания.

const Steer = preload("res://scripts/aircraft/aircraft_steer.gd")

const G := 9.81
const RHO0 := 1.225
const THINK_INTERVAL := 0.5
const VISUAL_RANGE := 3000.0
const CLOUD_SIGHT := 300.0
const TAIL_RANGE := 600.0
const LOOKAHEAD := 3.0
const BOMB_ALT := 350.0
const PITCH_CAP_HIGH_AOA := 0.92
const DUTY_BREAK_RANGE := 1000.0    # бот на захвате бросает зону только ради такого близкого врага
const HIT_MEMORY := 4.0             # столько секунд бот помнит, что по нему попали
const GLIDE_DEG := 3.5              # глиссада
const GLIDE_MAX_DEG := 7.0
const FINAL_LEN := 1700.0           # длина прямой перед касанием
const ENTRY_EXTRA := 1500.0         # точка входа ещё дальше от полосы (не глубже середины карты)
const MAX_GO_AROUNDS := 1           # после стольких уходов на второй круг — проход над полосой
const SERVICE_TIMEOUT := 90.0

var skill: float = 0.5          # 0..1: точность, реакция, допустимая перегрузка
var role: String = "fighter"    # "fighter" | "attacker" (из def.line)
var target = null               # текущая цель (Aircraft или GroundUnit) или null
var state: String = "patrol"    # "patrol" | "engage" | "attack_ground" | "evade" | "capture" | "return"

# дополнительно (для отладки и HUD)
var aim_error_deg: float = 2.4
var reaction: float = 0.5
var g_use: float = 0.78
var gun_range: float = 575.0
var capture_duty: bool = false  # MatchManager: этот бот держит зоны
var duty_zone: String = ""      # id зоны, куда его послали
var land_phase: String = ""     # "" | "cruise" | "approach" | "final" | "goaround" | "flyover" | "rollout" | "taxi" | "service" | "takeoff" | "climb"
var return_reason: String = ""  # "ammo" | "damage" | "" (взлёт с полосы в начале боя)
var go_arounds: int = 0
var go_around_reason: String = ""   # для отладки и пакетного прогона
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
# посадка
var _af: Dictionary = {}
var _land_dir: Vector3 = Vector3.FORWARD   # направление пробега после касания (горизонт)
var _aim_pt: Vector3 = Vector3.ZERO        # точка касания на оси полосы
var _rwy_h: float = 0.0
var _glide: float = deg_to_rad(GLIDE_DEG)
var _entry: Vector3 = Vector3.ZERO
var _to_dir: Vector3 = Vector3.FORWARD     # курс разбега
var _land_t: float = 0.0                   # время в текущей фазе
var _serviced: bool = false
var _gear_want: bool = false
var _phase_prev: String = ""
var _real_landing: bool = true             # прямой заход возможен (рельеф не мешает)
var _orbit_land: bool = false              # проход над полосой по кругу снижения (котловина)
var _safe_alt: float = 0.0                 # выше всего рельефа вокруг аэродрома
var _climb_orbit: bool = false             # после взлёта набирать высоту кругами над аэродромом
var _orbit_dir: float = 0.0
var _orbit_c: Vector3 = Vector3.ZERO       # центр кругов набора (там, где горы дальше всего)
var _ap_i: float = 0.0                     # интегратор угла траектории (реализм: без автотриммера)
var _lineup_pt: Vector3 = Vector3.ZERO     # куда отрулить перед разбегом (конец полосы)
var _aa: Array = []                        # вражеские зенитки и корабли: [[позиция, дальность]]
var _aa_t: float = 0.0


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
	_think_t = _rng.randf_range(0.0, THINK_INTERVAL)
	_orbit_side = -1.0 if _rng.randf() < 0.5 else 1.0
	_break_side = _orbit_side
	_thr = float(ac.fm.throttle)
	_new_patrol_point(ac)
	if ac.has_signal("serviced") and not ac.is_connected("serviced", _on_serviced):
		ac.connect("serviced", _on_serviced)
	if bool(ac.fm.on_ground):
		# старт с полосы или палубы: сразу разбег по курсу самолёта
		_begin_takeoff(ac, true)


func _on_serviced(_ac) -> void:
	_serviced = true


## MatchManager: можно ли послать бота на захват зоны.
func can_take_duty(ac) -> bool:
	if land_phase != "" or ac == null or not is_instance_valid(ac) or not bool(ac.alive):
		return false
	return not _should_return(ac)


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
	if land_phase != _phase_prev:
		_phase_prev = land_phase
		_land_t = 0.0
	_land_t += dt
	if bool(f.on_ground):
		var gc := _ground_controls(ac, dt)
		_ctrl = Vector3(float(gc.pitch), 0.0, float(gc.yaw))
		_thr = float(gc.throttle)
		return gc
	if land_phase in ["rollout", "taxi", "service", "takeoff", "lineup"]:
		if land_phase == "rollout":
			# подпрыгнули при касании: снова на прямую, сядем дальше по полосе
			_set_land_phase("final")
		else:
			# оторвались от полосы (или скатились с палубы)
			if land_phase != "takeoff":
				var fw: Vector3 = f.forward()
				_to_dir = Vector3(fw.x, 0.0, fw.z).normalized()
			_set_land_phase("climb")
	if land_phase in ["approach", "final", "goaround", "flyover", "climb"]:
		_plan_landing(ac, plan, dt)
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
	if not bool(plan.get("no_safety", false)):
		_apply_safety(ac, plan, dt)
	_check_gear(ac, dt)

	var spd: float = f.vel.length()
	# крен не глубже, чем позволяет допустимая перегрузка (иначе в вираже теряется высота)
	var n_ach := minf(0.95 * float(ac.def.get("g_limit", 8.0)), 0.9 * pow(spd / maxf(_stall_tas(ac), 1.0), 2.0))
	n_ach = 1.0 + (n_ach - 1.0) * clampf(float(plan.pull) / maxf(g_use, 0.1), 0.3, 1.0)
	var max_bank := acos(clampf(1.2 / maxf(n_ach, 1.25), 0.0, 1.0))
	if plan.has("max_bank"):
		max_bank = minf(max_bank, float(plan.max_bank))
	elif _recover_t > 0.0:
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
	var s: Dictionary
	if plan.has("ap"):
		s = _autopilot(ac, plan.ap, dt)
	else:
		_ap_i = 0.0
		s = Steer.steer(f.basis, aim_now, _rates, ac.def, spd, float(plan.pull), max_bank, _aim_rate)
	var pitch_cmd: float = s.pitch
	# не висим на ограничителе угла атаки: там самолёт быстрее всего теряет скорость
	var a_crit := deg_to_rad(float(ac.def.get("alpha_crit_deg", 16.0)))
	var aoa_frac := float(f.aoa) / maxf(a_crit, 0.05)
	if pitch_cmd > 0.0 and _recover_t <= 0.0 and aoa_frac > 0.75 and not bool(plan.shot):
		pitch_cmd *= clampf(1.0 - (aoa_frac - 0.75) * 2.5, 0.45, 1.0)
	var k := 1.0 - exp(-dt / lerpf(0.12, 0.05, skill))
	_ctrl = _ctrl.lerp(Vector3(pitch_cmd, s.roll, s.yaw), k)
	_thr = lerpf(_thr, float(plan.throttle), 1.0 - exp(-dt / (0.15 if plan.has("thr_fast") else 0.4)))
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
	_aa_t -= THINK_INTERVAL
	if _aa_t <= 0.0:
		_aa_t = 3.0
		_refresh_aa(ac, b)
	if b == null:
		state = "patrol"
		target = null
		return
	if land_phase != "":
		state = "return"
		target = null
		return
	if _should_return(ac):
		_begin_return(ac)
		return
	var air = _pick_air_target(ac, b)
	var air_d := INF
	if air != null:
		air_d = (air.global_position as Vector3).distance_to(ac.fm.pos)
	if capture_duty:
		# на захвате: только враг вплотную или тот, кто по нам стреляет
		var hit := _recently_hit(ac, b)
		if air != null and (air_d < DUTY_BREAK_RANGE or air == threat or (hit and air_d < 1800.0)):
			target = air
			state = "engage"
			return
		if _pick_zone(ac, b):
			state = "capture"
			target = null
			return
	if role == "attacker" and ac.weapons.has_ordnance():
		var gt = _pick_ground_target(ac, b)
		if gt != null:
			if gt != target or state != "attack_ground":
				attack_phase = "setup"
				_phase_t = 0.0
			target = gt
			state = "attack_ground"
			return
	if air != null:
		# в зону вражеских зениток за целью не лезем, если она не рядом и не атакует нас
		if air_d > 900.0 and air != threat and air != target and _aa_exposure(air.global_position) > 0:
			state = "patrol"
			target = null
			return
		target = air
		state = "engage"
		return
	state = "patrol"
	target = null


## Вражеские зенитки и корабли (обновляется раз в 3 с).
func _refresh_aa(ac, b) -> void:
	_aa.clear()
	if b == null or not b.has_method("ground_targets_of"):
		return
	for u in b.ground_targets_of(1 - int(ac.team)):
		if not _valid_alive(u) or not ("kind" in u):
			continue
		var k := String(u.get("kind"))
		if k == "aa":
			_aa.append([(u as Node3D).global_position, 2200.0])
		elif k == "ship":
			_aa.append([(u as Node3D).global_position, 3000.0])


## Сколько вражеских зениток достаёт до точки p (с запасом margin).
func _aa_exposure(p: Vector3, margin: float = 200.0) -> int:
	var n := 0
	for a in _aa:
		if (a[0] as Vector3).distance_to(p) < float(a[1]) + margin:
			n += 1
	return n


func _recently_hit(ac, b) -> bool:
	var d = ac.get("dmg")
	if d == null or b == null or not ("elapsed" in b):
		return false
	return float(b.get("elapsed")) - float(d.last_hit_time) < HIT_MEMORY


## Пора домой: стрелять нечем или самолёт сильно повреждён (но ещё летит).
func _should_return(ac) -> bool:
	return _return_reason(ac) != ""


func _return_reason(ac) -> String:
	var w = ac.get("weapons")
	if w != null:
		var guns := false
		for n in w.ammo.get("guns", []):
			if int(n) > 0:
				guns = true
				break
		var missiles := int(w.ammo.get("missiles", 0)) > 0
		var ord := bool(w.has_ordnance()) and role == "attacker"
		if not guns and not missiles and not ord:
			return "ammo"
	var d = ac.get("dmg")
	if d != null and not bool(d.on_fire):
		# с разбитым двигателем домой не долететь (в горах тем более) — такой бот воюет до конца
		if bool(d.fuel_leak):
			return "damage"
		var limits := {"left_wing": 0.35, "right_wing": 0.35, "tail": 0.35, "structure": 0.3}
		for m in limits:
			if float(d.module_ratio(m)) < float(limits[m]):
				return "damage"
	return ""

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
		# сначала зенитки; цель под прикрытием других зениток — хуже
		var cover := _aa_exposure(up, 0.0)
		if "kind" in u and String(u.get("kind")) == "aa":
			cover -= 1
			s -= 700.0
		s += 900.0 * maxf(float(cover), 0.0)
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
	if duty_zone != "":
		for z in zones:
			if z is Dictionary and String(z.get("id", "")) == duty_zone:
				_zone = z
				zone_id = duty_zone
				return true
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
	var front := 400.0 if int(ac.team) == 0 else -400.0
	# несколько попыток: точка вне досягаемости вражеских зениток
	for attempt in 6:
		var p: Vector3 = (f.pos as Vector3) + h.rotated(Vector3.UP, _rng.randf_range(-1.0, 1.0) * (1.0 + attempt * 0.4)) * _rng.randf_range(1800.0, 3200.0)
		p.x = clampf(p.x, -2800.0, 2800.0)
		p.z = clampf(p.z, front - 2200.0, front + 2200.0)
		_patrol_point = Vector3(p.x, alt + _rng.randf_range(-200.0, 300.0), p.z)
		if _aa_exposure(_patrol_point, 300.0) == 0:
			break
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


## Автопилот захода и набора: крен — по ошибке путевого угла (не больше mb), тангаж — по ошибке
## угла траектории (а не носа: на малой скорости нос выше траектории на угол атаки).
## ap = {"dir": горизонтальное направление, "gam": угол траектории, рад, "mb": предел крена, рад}.
func _autopilot(ac, ap: Dictionary, dt: float) -> Dictionary:
	var f = ac.fm
	var vel: Vector3 = f.vel
	var spd := maxf(vel.length(), 1.0)
	var want: Vector3 = ap.get("dir", f.forward())
	want.y = 0.0
	var track := Vector3(vel.x, 0.0, vel.z)
	if track.length_squared() < 1.0:
		track = Vector3((f.forward() as Vector3).x, 0.0, (f.forward() as Vector3).z)
	var herr := 0.0
	if want.length_squared() > 1e-6 and track.length_squared() > 1e-6:
		herr = track.normalized().signed_angle_to(want.normalized(), Vector3.UP)
	var mb := float(ap.get("mb", 0.5))
	var bank_d := clampf(-herr * 2.2, -mb, mb)
	var bank: float = f.bank()
	var v_ref := maxf(float(ac.def.get("v_ref", 100.0)), 10.0)
	var eff := clampf(spd / v_ref, 0.12, 1.0)
	var roll_max := deg_to_rad(float(ac.def.get("max_roll_rate_deg", 120.0))) * eff
	var pitch_max := deg_to_rad(float(ac.def.get("max_pitch_rate_deg", 35.0))) * eff
	var roll_rate_des := clampf((bank_d - bank) * 2.5, -roll_max, roll_max)
	var roll := clampf((roll_rate_des - _rates.z * 0.3) / maxf(roll_max, 0.05), -1.0, 1.0)
	var gam := asin(clampf(vel.y / spd, -1.0, 1.0))
	var gam_d := float(ap.get("gam", 0.0))
	var ab := minf(absf(bank), 1.2)
	# в крене часть подъёмной силы уходит на разворот: нос надо вращать быстрее
	# (в аркаде это делает сама модель полёта — она держит траекторию в вираже)
	var q_turn := 0.0 if bool(f.assist) else G / spd * sin(ab) * tan(ab)
	var q := (gam_d - gam) * float(ap.get("kq", 1.6)) + q_turn
	# без автотриммера ручка задаёт добавку угла атаки, а не скорость тангажа: нужен интегратор,
	# иначе в вираже самолёт проседает
	if bool(f.assist):
		_ap_i = 0.0
	else:
		_ap_i = clampf(_ap_i + (gam_d - gam) * dt * 1.2, -0.6, 0.6)
	var pitch := clampf(q / maxf(pitch_max, 0.05) + _ap_i, -1.0, 1.0)
	var yaw := clampf(-herr * 0.5, -0.3, 0.3) * clampf(1.0 - absf(bank) / 0.3, 0.0, 1.0)
	return {"pitch": pitch, "roll": roll, "yaw": yaw, "off": absf(herr)}


## Шасси: выпустить на заходе, убрать после взлёта (выше 30 м).
func _check_gear(ac, dt: float) -> void:
	var f = ac.fm
	if bool(f.on_ground):
		_gear_t = 0.0
		return
	_gear_t += dt
	if _gear_t < 0.0:
		return
	if _gear_want:
		if not bool(f.gear_down):
			_gear_t = -2.0
			_gear_pulse = true
	elif bool(f.gear_down) and ac.altitude_agl() > 30.0 and _gear_t > 0.5:
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
	var goal := ground + clampf(max_alt * 0.5, 150.0, 300.0)
	var to := Vector3(zp.x - mp.x, 0.0, zp.z - mp.z)
	var hd := to.length()
	var spd: float = (f.vel as Vector3).length()
	var vs := _stall_tas(ac)
	var dir_h: Vector3
	if hd > r * 1.6:
		dir_h = to / maxf(hd, 1.0)
		plan.throttle = 1.0
		plan.ab = spd < 1.6 * vs
	else:
		# круг над зоной: медленнее, чтобы вираж помещался внутри
		var inward := to / maxf(hd, 1.0)
		var tangent := Vector3.UP.cross(inward) * _orbit_side
		dir_h = (tangent + inward * clampf((hd - r * 0.45) / (r * 0.3), -1.0, 1.4)).normalized()
		plan.throttle = clampf(0.5 + (1.45 * vs - spd) * 0.05, 0.15, 1.0)
	plan.dir = _toward_alt(dir_h, mp.y, goal, maxf(hd - r, 700.0), 0.3, 0.25)
	plan.pull = g_use


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


## Возврат: полёт к точке входа на продолжении оси полосы, дальше — заход (_plan_landing).
func _plan_return(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var mp: Vector3 = f.pos
	if land_phase == "":
		_begin_return(ac)
	if _af.is_empty():
		# своего аэродрома нет: кружим над своей половиной карты
		var home := Vector3(0.0, 900.0, 3000.0 if int(ac.team) == 0 else -3000.0)
		var toh := Vector3(home.x - mp.x, 0.0, home.z - mp.z)
		plan.dir = _toward_alt(toh, mp.y, home.y, maxf(toh.length(), 800.0), 0.25, 0.2)
		plan.throttle = 0.8
		return
	var rel := mp - _aim_pt
	var s := rel.dot(_land_dir)
	var e := rel.dot(_land_dir.cross(Vector3.UP))
	var fwd: Vector3 = f.forward()
	var fh := Vector3(fwd.x, 0.0, fwd.z).normalized()
	var spd0: float = (f.vel as Vector3).length()
	var r_turn := clampf(spd0 * spd0 / (G * tan(deg_to_rad(40.0))), 400.0, 1300.0)
	var goal := _entry
	var right := _land_dir.cross(Vector3.UP)
	var inbound := fh.dot(_land_dir)
	if not _orbit_land and inbound < -0.3 and s > -(FINAL_LEN + ENTRY_EXTRA):
		# летим от точки входа к полосе навстречу заходу: уходим параллельно оси со смещением,
		# чтобы разворот на 180° закончился на оси
		var side := signf(e) if absf(e) > 1.0 else 1.0
		goal = _entry + right * side * r_turn
	var to := Vector3(goal.x - mp.x, 0.0, goal.z - mp.z)
	var hd := to.length()
	var near_entry := hd < 900.0 if goal == _entry else hd < 500.0
	if near_entry or (not _orbit_land and s < -(FINAL_LEN + 300.0) and inbound > -0.2 and (hd < 2500.0 or absf(e) < 900.0)):
		_set_land_phase("flyover" if _orbit_land else "approach")
		_plan_landing(ac, plan, 0.0)
		return
	# гряда на пути: набрать высоту над ней заранее, а не в последний момент (фьорд)
	var to_n := to / maxf(hd, 1.0)
	var path_top := 0.0
	var top_d := hd
	for i in range(1, 13):
		var dd := minf(hd, float(i) * 400.0)
		var hq := _height(mp.x + to_n.x * dd, mp.z + to_n.z * dd)
		if hq > path_top:
			path_top = hq
			top_d = dd
	var goal_y := maxf(_entry.y, path_top + 300.0)
	var climb_d := minf(hd, maxf(top_d - 300.0, 500.0))
	if atan2(goal_y - mp.y, climb_d) > 0.22 and top_d < 3000.0:
		# так круто не набрать: отворачиваем от гряды и набираем высоту, потом снова к аэродрому
		var away := (-to_n).rotated(Vector3.UP, 0.8 * _orbit_side)
		plan.dir = (away * cos(0.3) + Vector3.UP * sin(0.3)).normalized()
	else:
		plan.dir = _toward_alt(to, mp.y, goal_y, climb_d, 0.35, 0.25)
	# скорость гасим заранее: на заход нужно около 1,5 скорости сваливания
	var spd: float = (f.vel as Vector3).length()
	var vs: float = f.stall_speed()
	# (к котловине — без торможения: там сначала круги снижения, а вокруг горы)
	var near := hd < 4000.0 and not _orbit_land
	var v_t := vs * (1.5 if near else 2.1)
	if _orbit_land and hd < 3000.0:
		v_t = vs * 1.6   # над котловиной (высота уже безопасная) — медленно, чтобы круг был тесным
	plan.throttle = clampf(0.5 + (v_t - spd) * 0.05, 0.0, 1.0)
	plan.pull = g_use * 0.7
	plan.ab = spd < 1.3 * _stall_tas(ac)
	if (mp.y < goal_y - 100.0 or _g_terrain > 0.05) and spd < 1.9 * vs:
		plan.throttle = 1.0   # сначала высота: впереди горы
	# перед заходом быстро — шасси как тормоз (не у самой земли)
	_gear_want = near and spd > 1.8 * vs and ac.altitude_agl() > 150.0


# ---------------------------------------------------------------- посадка и взлёт

func _home_airfield(ac) -> Dictionary:
	var w = _world()
	if w == null or not ("airfields" in w):
		return {}
	var afs = w.get("airfields")
	if not (afs is Array):
		return {}
	for af in afs:
		if af is Dictionary and int(af.get("team", -1)) == int(ac.team):
			return af
	return {}


func _is_carrier() -> bool:
	return String(_af.get("kind", "airfield")) == "carrier"


func _set_land_phase(p: String) -> void:
	land_phase = p
	if not p in ["approach", "final", "flyover", "rollout", "taxi", "service"]:
		_gear_want = false


func _begin_return(ac) -> void:
	return_reason = _return_reason(ac)
	state = "return"
	target = null
	capture_duty = false
	duty_zone = ""
	go_arounds = 0
	_serviced = false
	_setup_landing(ac)
	_set_land_phase("cruise")


## Геометрия захода: садимся в сторону от центра карты (заход со стороны центра), точка касания
## недалеко за торцом, чтобы остановиться в радиусе обслуживания; глиссада выше рельефа на заходе.
func _setup_landing(ac) -> void:
	_af = _home_airfield(ac)
	if _af.is_empty():
		return
	var c: Vector3 = _af.get("pos", Vector3.ZERO)
	var hd := float(_af.get("heading", 0.0))
	var fwd := Vector3(sin(hd), 0.0, -cos(hd))
	_land_dir = fwd
	if Vector2(c.x, c.z).dot(Vector2(fwd.x, fwd.z)) < 0.0:
		_land_dir = -fwd
	var half := float(_af.get("length", 1400.0)) * 0.5
	_rwy_h = c.y
	var aim := half
	if not _is_carrier():
		aim = 230.0 if String(ac.def.get("kind", "prop")) == "jet" else 170.0
	_aim_pt = Vector3(c.x, _rwy_h, c.z) - _land_dir * (half - aim)
	var g := deg_to_rad(GLIDE_DEG)
	for i in range(4, 36):
		var d := float(i) * 100.0
		var q := _aim_pt - _land_dir * d
		var need := _height(q.x, q.z) + 35.0 + d * 0.01 - _rwy_h
		if need > d * tan(g):
			g = atan2(need, d)
	_real_landing = not _is_carrier() and g <= deg_to_rad(GLIDE_MAX_DEG)
	_orbit_land = not _is_carrier() and not _real_landing
	_glide = minf(g, deg_to_rad(GLIDE_MAX_DEG))
	_safe_alt = _area_top(c, 3000.0) + 250.0
	var ep := _aim_pt - _land_dir * (FINAL_LEN + ENTRY_EXTRA)
	_entry = Vector3(ep.x, maxf(_rwy_h + FINAL_LEN * tan(_glide) + 40.0, _height(ep.x, ep.z) + 220.0), ep.z)
	if _orbit_land:
		# котловина: прямой заход упирается в горы — снижаемся кругами над самим аэродромом
		_entry = Vector3(c.x, _safe_alt, c.z)


## Центр круга радиуса r не дальше 700 м от c, где рельеф на круге ниже всего.
func _best_orbit_center(c: Vector3, r: float) -> Vector3:
	var best := c
	var best_top := INF
	for gx in range(-4, 5):
		for gz in range(-4, 5):
			var q := c + Vector3(gx * 175.0, 0.0, gz * 175.0)
			if Vector2(q.x - c.x, q.z - c.z).length() > 700.0:
				continue
			var top := -INF
			for i in 16:
				var a := TAU * float(i) / 16.0
				for k in [0.6, 1.0, 1.3]:
					top = maxf(top, _height(q.x + cos(a) * r * k, q.z + sin(a) * r * k))
			if top < best_top - 1.0:
				best_top = top
				best = q
	return best


## Самая высокая точка рельефа в круге радиуса r (грубо, по кольцам).
func _area_top(c: Vector3, r: float) -> float:
	var top := _height(c.x, c.z)
	for k in range(1, 7):
		var rr := r * float(k) / 6.0
		for i in 16:
			var a := TAU * float(i) / 16.0
			top = maxf(top, _height(c.x + cos(a) * rr, c.z + sin(a) * rr))
	return top


## Угол траектории, чтобы прийти на высоту goal_y примерно за seconds секунд.
func _gam_to_alt(ac, goal_y: float, seconds: float, lo: float, hi: float) -> float:
	var f = ac.fm
	var spd := maxf((f.vel as Vector3).length(), 30.0)
	return clampf(asin(clampf((goal_y - float(f.pos.y)) / (spd * seconds), -1.0, 1.0)), lo, hi)


## Не ниже рельефа впереди (для захода и набора без общей «безопасности»).
func _terrain_floor(ac, gam: float, dir_h: Vector3) -> float:
	var f = ac.fm
	var spd: float = (f.vel as Vector3).length()
	_terrain_t -= 1.0 / 60.0
	if _terrain_t <= 0.0:
		_terrain_t = 0.1
		_scan_terrain(ac, 40.0 + spd * 0.25, dir_h)
	if _g_terrain > gam:
		return minf(_g_terrain, 0.3)
	return gam


## Проход над полосой кругами снижения радиусом 600 м вокруг центра аэродрома.
func _plan_orbit_flyover(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var mp: Vector3 = f.pos
	var c: Vector3 = _af.get("pos", mp)
	var spd: float = (f.vel as Vector3).length()
	var vs: float = f.stall_speed()
	# пока быстро — круг шире, и центр круга сдвинут к середине карты, чтобы не вылететь за границу
	var r_orb := clampf(spd * spd / (G * tan(deg_to_rad(45.0))) * 1.1, 600.0, 2200.0)
	var oc := c
	if r_orb > 650.0:
		oc = c + Vector3(-c.x, 0.0, -c.z).normalized() * (r_orb - 600.0)
	var to := Vector3(oc.x - mp.x, 0.0, oc.z - mp.z)
	var hd := to.length()
	var inward := to / maxf(hd, 1.0)
	if _orbit_dir == 0.0:
		var fwd: Vector3 = f.forward()
		_orbit_dir = 1.0 if Vector3.UP.cross(inward).dot(fwd) >= 0.0 else -1.0
	var tangent := Vector3.UP.cross(inward) * _orbit_dir
	var dir_h := (tangent + inward * clampf((hd - r_orb) / 250.0, -1.0, 1.6)).normalized()
	if hd > r_orb + 1000.0:
		dir_h = inward
	var mp_lim := _half_size() - 1000.0
	if maxf(absf(mp.x), absf(mp.z)) > mp_lim:
		dir_h = Vector3(-mp.x, 0.0, -mp.z).normalized()   # не за границу карты
	# снижаемся кругами; быстро — не пикируем, а гасим скорость
	var gam := _gam_to_alt(ac, _rwy_h + 110.0, 10.0, -0.22 if hd < 900.0 else -0.12, 0.15)
	if spd > 1.7 * vs:
		gam = maxf(gam, -0.04)
	gam = _terrain_floor(ac, gam, dir_h)
	if spd < 1.2 * vs:
		gam = minf(gam, 0.0)
	plan.ap = {"dir": dir_h, "gam": gam, "mb": deg_to_rad(50.0)}
	plan.throttle = clampf(0.45 + (1.45 * vs - spd) * 0.06, 0.0, 1.0)
	plan.ab = spd < 1.2 * vs
	plan.no_safety = true
	var axis := _land_dir
	var half := float(_af.get("length", 1400.0)) * 0.5
	var rel := mp - c
	var sc := rel.dot(axis)
	var e := rel.dot(axis.cross(Vector3.UP))
	if absf(sc) < half + 100.0 and absf(e) < 200.0 and mp.y - _rwy_h < 220.0:
		var b = _battle()
		if b != null and b.has_method("bot_fake_landing") and bool(b.bot_fake_landing(ac)):
			return
		_finish_landing_cycle()


func _go_around(_ac, why: String = "") -> void:
	go_arounds += 1
	go_around_reason = why
	_set_land_phase("goaround")


func _finish_landing_cycle() -> void:
	land_phase = ""
	_orbit_dir = 0.0
	_climb_orbit = false
	_phase_prev = ""
	return_reason = ""
	go_arounds = 0
	_gear_want = false
	state = "patrol"
	target = null


## Воздушные фазы посадки и набор высоты после взлёта. Управление — через _autopilot.
func _plan_landing(ac, plan: Dictionary, _dt: float) -> void:
	var f = ac.fm
	var mp: Vector3 = f.pos
	var vel: Vector3 = f.vel
	var spd := vel.length()
	var vs: float = f.stall_speed()
	var fwd: Vector3 = f.forward()
	var fh := Vector3(fwd.x, 0.0, fwd.z)
	fh = fh.normalized() if fh.length_squared() > 1e-4 else _land_dir
	var right := _land_dir.cross(Vector3.UP)
	var rel := mp - _aim_pt
	var s := rel.dot(_land_dir)
	var e := rel.dot(right)
	var h := mp.y - _rwy_h
	plan.thr_fast = true
	plan.no_safety = true
	match land_phase:
		"climb":
			_plan_climb(ac, plan)
			return
		"goaround":
			var agl: float = ac.altitude_agl()
			var gam := 0.03 if spd < 1.3 * vs else 0.14
			var gdir := fh
			var gmb := 0.3
			var v_go := 1.6 * vs
			# у края карты сразу поворачиваем к центру: круто и не разгоняясь, иначе не успеть до границы
			if agl > 50.0 and maxf(absf(mp.x), absf(mp.z)) > _half_size() - 1500.0:
				var to_c := Vector3(-mp.x, 0.0, -mp.z).normalized()
				if fh.dot(to_c) < 0.7:
					gdir = to_c
					gmb = 0.55 if agl < 100.0 else 1.0
					gam = minf(gam, 0.06)
					v_go = 1.45 * vs
			gam = _terrain_floor(ac, gam, gdir)
			plan.ap = {"dir": gdir, "gam": gam, "mb": gmb}
			plan.throttle = clampf(0.6 + (v_go - spd) * 0.05, 0.2, 1.0)
			plan.ab = spd < 1.3 * vs
			_gear_want = false
			if (agl > 200.0 and spd > 1.45 * vs) or _land_t > 25.0:
				_set_land_phase("cruise")
				state = "return"
			return
		"approach", "flyover":
			if _orbit_land:
				_set_land_phase("flyover")
				_plan_orbit_flyover(ac, plan)
				return
			var flyover := land_phase == "flyover" or _is_carrier() or go_arounds > MAX_GO_AROUNDS or not _real_landing
			# выход на ось: угол подхода до 60°, плавнее для широкого разворота
			var r_turn := clampf(spd * spd / (G * tan(deg_to_rad(40.0))), 450.0, 1100.0)
			var e_dot := vel.dot(right)
			var lat := clampf((e + 4.0 * e_dot) / r_turn, -1.7, 1.7)
			var dh := (_land_dir - right * lat).normalized()
			var alt_t := _rwy_h + maxf(FINAL_LEN, -s) * tan(_glide)
			if flyover:
				alt_t = _rwy_h + 60.0 + maxf(-s - 600.0, 0.0) * tan(_glide)
			var gam := _gam_to_alt(ac, alt_t, 8.0, -0.12, 0.1)
			gam = _terrain_floor(ac, gam, dh)
			if spd < 1.2 * vs:
				gam = minf(gam, -0.02)
			var track := Vector3(vel.x, 0.0, vel.z).normalized()
			if absf(e) > 500.0 or track.dot(_land_dir) < 0.3:
				# далеко от оси: обычное наведение с защитой от рельефа, автопилот — уже на оси
				plan.dir = _toward_alt(dh, mp.y, alt_t, 900.0, 0.2, 0.15)
				plan.no_safety = false
				plan.landing = true
			else:
				plan.ap = {"dir": dh, "gam": gam, "mb": deg_to_rad(50.0 if ac.altitude_agl() > 150.0 else 30.0)}
			plan.throttle = clampf(0.35 + (1.4 * vs - spd) * 0.06, 0.0, 1.0)
			plan.ab = spd < 1.2 * vs
			# шасси — и как воздушный тормоз, если подходим быстро
			_gear_want = not flyover and (s > -(FINAL_LEN + 900.0) or spd > 1.6 * vs)
			if flyover:
				var half := float(_af.get("length", 1400.0)) * 0.5
				var c: Vector3 = _af.get("pos", _aim_pt)
				var sc := (mp - c).dot(_land_dir)
				if absf(sc) < half + 60.0 and absf(e) < 140.0 and h < 170.0:
					var b = _battle()
					if b != null and b.has_method("bot_fake_landing") and bool(b.bot_fake_landing(ac)):
						return
					# бой не засчитал (самолёт игрока): кружим дальше без боеприпасов
					_finish_landing_cycle()
					return
				if sc > half + 400.0:
					_go_around(ac, "проскочил полосу")
				return
			if s > -FINAL_LEN - 50.0:
				# на прямую — только выйдя на ось; не вышли — доворачиваем на высоте круга, пока есть место
				var vh := Vector3(vel.x, 0.0, vel.z).normalized()
				var hdg_ok := vh.dot(_land_dir) > cos(deg_to_rad(20.0))
				if absf(e) < 120.0 and hdg_ok:
					_set_land_phase("final")
				elif s > -800.0:
					_go_around(ac, "не вышел на ось e=%.0f" % e)
			return
		"final":
			_plan_final(ac, plan, s, e, h, spd, vs, fh, right)
			return
	_set_land_phase("cruise")


func _plan_final(ac, plan: Dictionary, s: float, e: float, h: float, spd: float, vs: float, fh: Vector3, right: Vector3) -> void:
	var f = ac.fm
	_gear_want = true
	var e_dot := (f.vel as Vector3).dot(right)
	var lat := clampf((e + 3.0 * e_dot) / 220.0, -0.4, 0.4)
	var dh := (_land_dir - right * lat).normalized()
	var glide_alt := _rwy_h + maxf(-s, 0.0) * tan(_glide)
	var mp: Vector3 = f.pos
	var err := glide_alt - mp.y
	var gam := -_glide + clampf(err / 80.0, -0.14, 0.1)
	var gear_h := float(ac.def.get("shape", {}).get("gear_height", 1.5))
	var hh := h - gear_h
	var jet := String(ac.def.get("kind", "prop")) == "jet"
	var v_t := vs * (1.28 if jet else 1.3)
	var thr := clampf(0.35 + (v_t - spd) * 0.08, 0.0, 1.0)
	# вертикальная скорость не круче графика: у земли плавно гасим снижение (выравнивание)
	var sink_max := clampf(1.5 + hh * 0.35, 1.5, 9.0)
	gam = maxf(gam, -asin(clampf(sink_max / maxf(spd, 1.0), 0.0, 0.5)))
	if hh < 10.0:
		thr = 0.0
	if s < -500.0 and ac.altitude_agl() < 30.0:
		gam = maxf(gam, 0.0)   # рельеф до торца — не ниже
	var mb := lerpf(deg_to_rad(3.0), deg_to_rad(25.0), clampf((hh - 8.0) / 40.0, 0.0, 1.0))
	plan.ap = {"dir": dh, "gam": gam, "mb": mb, "kq": 2.6}
	plan.throttle = thr
	plan.ab = false
	# уход на второй круг
	var half := float(_af.get("length", 1400.0)) * 0.5
	var bad := ""
	if spd < 1.07 * vs and hh > 4.0:
		bad = "мала скорость"
	elif spd > v_t + 32.0 and hh < 60.0:
		bad = "велика скорость"   # не остановимся на полосе
	elif hh < 60.0 and absf(e) > 45.0:
		bad = "сбоку от оси e=%.0f" % e
	elif hh < 30.0 and fh.dot(_land_dir) < cos(deg_to_rad(12.0)):
		bad = "не по курсу"
	elif err > 60.0 and hh > 15.0:
		bad = "ниже глиссады"
	elif s > half:
		bad = "не коснулся"
	elif s > -500.0 and err < -70.0:
		bad = "выше глиссады"
	if bad != "":
		_go_around(ac, bad)


## Набор высоты после отрыва: сначала скорость, потом угол; в котловине — круги над аэродромом.
func _plan_climb(ac, plan: Dictionary) -> void:
	var f = ac.fm
	var vel: Vector3 = f.vel
	var spd := vel.length()
	var vs: float = f.stall_speed()
	var ratio := spd / maxf(vs, 1.0)
	var agl: float = ac.altitude_agl()
	var mp: Vector3 = f.pos
	var gam := 0.02
	if ratio > 1.55:
		gam = 0.16
	elif ratio > 1.3:
		gam = 0.09
	var dh := _to_dir
	var mb := 0.1 if agl < 25.0 else 0.45
	plan.throttle = 1.0
	plan.ab = true
	plan.no_safety = true
	_gear_want = false
	if _climb_orbit and not _af.is_empty():
		# котловина: круги над аэродромом, пока не выше гор вокруг (наведение носом, как в обычном полёте;
		# проверено на фьорде: 32 взлёта из 32)
		if mp.y >= _safe_alt or _land_t > 240.0:
			_finish_landing_cycle()
			return
		var c: Vector3 = _orbit_c
		var to := Vector3(c.x - mp.x, 0.0, c.z - mp.z)
		var dist := to.length()
		var inward := to / maxf(dist, 1.0)
		if _orbit_dir == 0.0:
			_orbit_dir = 1.0 if Vector3.UP.cross(inward).dot(_to_dir) >= 0.0 else -1.0
		var tangent := Vector3.UP.cross(inward) * _orbit_dir
		# разворот — когда есть высота и запас скорости (медленный Шмель иначе проседает на полосу)
		if (agl > 12.0 and ratio > 1.3) or agl > 40.0:
			dh = (tangent + inward * clampf((dist - 750.0) / 250.0, -1.0, 1.6)).normalized()
			mb = 0.35 if agl < 40.0 else (0.6 if agl < 100.0 else 0.75)
		if ratio > 1.75:
			gam = minf(0.18 + (ratio - 1.75) * 0.4, 0.35)
		if agl < 15.0 and vel.y < 0.0:
			gam = maxf(gam, 0.06)
		# нос держим выше траектории на угол атаки, иначе сразу после отрыва самолёт снова касается полосы
		var nose := gam + clampf(float(f.aoa), 0.0, 0.25)
		plan.dir = (dh * cos(nose) + Vector3.UP * sin(nose)).normalized()
		plan.pull = 0.7
		plan.max_bank = mb
		return
	if ratio > 1.35:
		gam = _terrain_floor(ac, gam, _to_dir)
	# аэродромы у края карты: после отрыва разворачиваемся к центру, чтобы не уйти за границу
	var lim := _half_size() - 1500.0
	if agl > 20.0 and maxf(absf(mp.x), absf(mp.z)) > lim:
		var to_c := Vector3(-mp.x, 0.0, -mp.z).normalized()
		if dh.dot(to_c) < 0.7:
			dh = to_c
			mb = 0.35 if agl < 40.0 else 0.6
			gam = minf(gam, 0.08)
	if _avoid_dir != Vector3.ZERO and agl > 30.0:
		dh = _avoid_dir
	if agl < 15.0 and vel.y < 0.0:
		gam = maxf(gam, 0.06)
	plan.ap = {"dir": dh, "gam": gam, "mb": mb}
	if (agl > 250.0 and ratio > 1.6) or _land_t > 45.0:
		_finish_landing_cycle()


func _begin_takeoff(ac, at_spawn: bool) -> void:
	var f = ac.fm
	var fwd: Vector3 = f.forward()
	var fh := Vector3(fwd.x, 0.0, fwd.z)
	fh = fh.normalized() if fh.length_squared() > 1e-4 else Vector3.FORWARD
	_serviced = false
	_to_dir = fh
	_orbit_dir = 0.0
	if _af.is_empty():
		_af = _home_airfield(ac)
	var lineup := false
	if not at_spawn and not _af.is_empty() and not _is_carrier():
		var c: Vector3 = _af.get("pos", f.pos)
		var hd := float(_af.get("heading", 0.0))
		var axis := Vector3(sin(hd), 0.0, -cos(hd))
		var half := float(_af.get("length", 1400.0)) * 0.5
		# лучше взлетать к центру карты; если до конца полосы мало — сначала отрулить в дальний конец
		var inner := axis if Vector2(c.x, c.z).dot(Vector2(axis.x, axis.z)) < 0.0 else -axis
		var sc := ((f.pos as Vector3) - c).dot(inner)
		# к краю карты не взлетаем: там не успеть развернуться до границы
		var need := _takeoff_run(ac)
		_to_dir = inner
		if half - sc - 30.0 < need:
			_lineup_pt = c - inner * (half - 60.0)
			lineup = true
	# горы впереди ближе, чем самолёт успеет набрать высоту: круги над аэродромом
	_climb_orbit = false
	if not _af.is_empty():
		var c0: Vector3 = _af.get("pos", f.pos)
		_safe_alt = _area_top(c0, 3000.0) + 250.0
		var p0: Vector3 = f.pos
		var side := _to_dir.cross(Vector3.UP)
		for i in range(4, 16):
			var d := float(i) * 200.0
			for l in [-300.0, 0.0, 300.0]:
				var q: Vector3 = p0 + _to_dir * d + side * float(l)
				if _height(q.x, q.z) > p0.y + (d - 900.0) * tan(deg_to_rad(8.0)) + 60.0:
					_climb_orbit = true
		if _climb_orbit:
			_orbit_c = _best_orbit_center(c0, 750.0)
	state = "patrol"
	_set_land_phase("lineup" if lineup else "takeoff")


## Грубая оценка разбега до отрыва (с запасом), м.
func _takeoff_run(ac) -> float:
	var d: Dictionary = ac.def
	var m := float(d.get("mass", 5000.0))
	var v := 1.2 * float(ac.fm.stall_speed())
	var t := float(d.get("thrust", 10000.0))
	if String(d.get("kind", "prop")) == "jet":
		t += float(d.get("afterburner", 0.0))
	else:
		t = minf(t, float(d.get("power_kw", 1000.0)) * 800.0 / maxf(0.6 * v, 10.0))
	var a := maxf(t / maxf(m, 1.0) * 0.75 - 0.2, 0.5)
	return v * v / (2.0 * a) + 80.0


## Управление на земле: пробег после посадки, руление, обслуживание, разбег.
func _ground_controls(ac, _dt: float) -> Dictionary:
	var c := Data.empty_controls()
	var f = ac.fm
	var spd: float = (f.vel as Vector3).length()
	var fwd: Vector3 = f.forward()
	var fh := Vector3(fwd.x, 0.0, fwd.z)
	fh = fh.normalized() if fh.length_squared() > 1e-4 else _to_dir
	if land_phase in ["", "cruise", "approach", "final", "flyover", "goaround"]:
		if land_phase == "":
			_begin_takeoff(ac, true)
		else:
			_set_land_phase("rollout")
	elif land_phase == "climb":
		_set_land_phase("takeoff")
	if _af.is_empty():
		_af = _home_airfield(ac)
	var center: Vector3 = _af.get("pos", f.pos)
	var radius := float(_af.get("service_radius", 350.0))
	var dc := Vector2(center.x - f.pos.x, center.z - f.pos.z).length()
	_gear_pulse = false
	match land_phase:
		"rollout":
			c.throttle = 0.0
			c.brake = true
			c.pitch = -0.8   # нос на полосу, чтобы не подпрыгнуть
			c.yaw = _steer_axis(ac, fh, _land_dir, 1.0)
			if spd < 1.0 and _land_t > 1.0:
				_set_land_phase("taxi" if dc > radius - 30.0 and not bool(ac.servicing) else "service")
		"taxi":
			var to := Vector3(center.x - f.pos.x, 0.0, center.z - f.pos.z)
			var want := to.normalized() if to.length_squared() > 1.0 else fh
			var err := fh.signed_angle_to(want, Vector3.UP)
			c.yaw = clampf(-err * 2.5, -1.0, 1.0)
			var v_t := 6.0 if absf(err) < 0.5 else 3.5
			c.throttle = clampf(0.15 + (v_t - spd) * 0.12, 0.0, 0.6)
			if dc < radius - 80.0:
				c.throttle = 0.0
				c.brake = true
			if bool(ac.servicing):
				_set_land_phase("service")
			elif _land_t > 80.0:
				_begin_takeoff(ac, false)
		"service":
			c.throttle = 0.0
			c.brake = true
			if _serviced or _land_t > SERVICE_TIMEOUT:
				_begin_takeoff(ac, false)
			elif _land_t > 3.0 and not bool(ac.servicing) and dc > radius - 10.0:
				_set_land_phase("taxi")   # встали за кругом обслуживания — подрулить ближе
		"lineup":
			# рулим в конец полосы, там разворот на курс взлёта
			var to := Vector3(_lineup_pt.x - f.pos.x, 0.0, _lineup_pt.z - f.pos.z)
			var dist := to.length()
			if dist < 25.0 or _land_t > 120.0:
				_set_land_phase("takeoff")
			else:
				var want := to / maxf(dist, 1.0)
				var err := fh.signed_angle_to(want, Vector3.UP)
				c.yaw = clampf(-err * 2.5, -1.0, 1.0)
				var v_t := 14.0 if absf(err) < 0.3 else 4.0
				if dist < 80.0:
					v_t = minf(v_t, 6.0)
				c.throttle = clampf(0.2 + (v_t - spd) * 0.1, 0.0, 0.7)
				c.brake = spd > v_t + 3.0
		"takeoff":
			var err := fh.signed_angle_to(_to_dir, Vector3.UP)
			c.brake = false
			if absf(err) > 0.35 and spd < 12.0:
				# сначала развернуться по оси полосы
				c.yaw = -signf(err)
				c.throttle = clampf(0.2 + (4.0 - spd) * 0.1, 0.0, 0.5)
				return c
			c.throttle = 1.0
			c.afterburner = true
			c.yaw = _steer_axis(ac, fh, _to_dir, 0.0 if _is_carrier() else 1.0)
			var vs: float = f.stall_speed()
			# до скорости подъёма носа держим его опущенным, потом плавно до 11°;
			# с палубы бросает катапульта — там ручку не трогаем вовсе
			if _is_carrier():
				c.pitch = 0.0
			elif spd > 1.1 * vs:
				var gp := float(f.pitch_angle())
				c.pitch = clampf((deg_to_rad(11.0) - gp) * 6.0, -0.3, 1.0)
			else:
				c.pitch = -0.1
		_:
			c.throttle = 0.0
			c.brake = true
	return c


## Руление по оси: курс на направление axis_dir; lat_gain > 0 — ещё и к осевой линии полосы.
func _steer_axis(ac, fh: Vector3, axis_dir: Vector3, lat_gain: float) -> float:
	var want := axis_dir
	if lat_gain > 0.0 and not _af.is_empty():
		var c: Vector3 = _af.get("pos", ac.fm.pos)
		var right := axis_dir.cross(Vector3.UP)
		var e := ((ac.fm.pos as Vector3) - c).dot(right)
		want = (axis_dir - right * clampf(e / 60.0, -0.3, 0.3) * lat_gain).normalized()
	var err := fh.signed_angle_to(want, Vector3.UP)
	return clampf(-err * 3.0, -1.0, 1.0)


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
	if ratio < 1.5 and not bool(plan.get("landing", false)):
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
