class_name DamageModel
extends RefCounted
## Повреждения по модулям: попадания, пожар, утечки, перегрузка.
## Каждый update() пишет модификаторы во FlightModel. Случайность — свой RNG с сидом (детерминированно).

signal module_damaged(module: String, ratio: float)
signal module_destroyed(module: String)
signal fire_started
signal fire_out

const MODULES := ["engine", "fuel", "left_wing", "right_wing", "tail", "pilot", "structure"]
const REPAIR_TIME := 20.0          # с на полный ремонт модуля с нуля
const EXTINGUISH_COOLDOWN := 20.0
const EXTINGUISH_CHANCE := 0.7
const FIRE_FUEL_DPS := 3.0
const FIRE_STRUCT_DPS := 2.0
const FIRE_BURNOUT_TIME := 25.0    # после этого пожар может погаснуть сам
const FIRE_BURNOUT_RATE := 0.3     # шанс в секунду после FIRE_BURNOUT_TIME
const STRESS_DPS := 30.0           # урон крыльям в секунду при structural_stress = 1
const SPLASH_SHARE := {"structure": 0.35, "left_wing": 0.15, "right_wing": 0.15, "engine": 0.12,
	"tail": 0.1, "fuel": 0.1, "pilot": 0.03}

var def: Dictionary = {}
var hp: Dictionary = {}
var max_hp: Dictionary = {}
var on_fire: bool = false
var engine_dead: bool = false
var oil_leak: bool = false
var fuel_leak: bool = false
var left_wing_lost: bool = false
var right_wing_lost: bool = false
var tail_lost: bool = false
var pilot_dead: bool = false
var last_attacker: int = -1
var last_hit_time: float = -100.0
# дополнительно
var is_hardcore: bool = false
var fire_time: float = 0.0             # сколько уже горит
var extinguish_cooldown: float = 0.0   # до следующей попытки тушения
var oil_timer: float = 0.0             # сколько осталось до остановки двигателя при утечке масла
var rng := RandomNumberGenerator.new()

var _oil_total: float = 1.0
var _killed_by_fire: bool = false
var _fuel_destroyed: bool = false
var _structure_destroyed: bool = false
var _emit_ratio: Dictionary = {}

func setup(p_def: Dictionary, hardcore: bool) -> void:
	def = p_def
	is_hardcore = hardcore
	var src: Dictionary = def.get("hp", {})
	var k := 0.8 if hardcore else 1.0
	var wing: float = float(src.get("wing", 60.0))
	max_hp = {
		"engine": float(src.get("engine", 50.0)) * k,
		"fuel": float(src.get("fuel", 40.0)) * k,
		"left_wing": wing * k,
		"right_wing": wing * k,
		"tail": float(src.get("tail", 45.0)) * k,
		"pilot": float(src.get("pilot", 30.0)) * k,
		"structure": float(src.get("structure", 100.0)) * k,
	}
	rng.seed = hash(String(def.get("id", "plane")))
	_reset_state()

func set_seed(s: int) -> void:
	rng.seed = s

func _reset_state() -> void:
	hp = max_hp.duplicate()
	on_fire = false
	engine_dead = false
	oil_leak = false
	fuel_leak = false
	left_wing_lost = false
	right_wing_lost = false
	tail_lost = false
	pilot_dead = false
	fire_time = 0.0
	extinguish_cooldown = 0.0
	oil_timer = 0.0
	_killed_by_fire = false
	_fuel_destroyed = false
	_structure_destroyed = false
	_emit_ratio.clear()

# ---------------------------------------------------------------- попадания

## Модуль по точке попадания в локальных координатах модели (вперёд = -Z).
func hit_zone(p: Vector3) -> String:
	var sh: Dictionary = def.get("shape", {})
	var length: float = float(sh.get("length", 10.0))
	var fr: float = float(sh.get("fuselage_radius", 0.8))
	var span: float = float(sh.get("span", 10.0))
	var wing_z: float = float(sh.get("wing_z", 0.0))
	var chord: float = float(sh.get("chord", 2.0))
	var cockpit_z: float = float(sh.get("cockpit_z", 0.0))
	var engines: String = String(sh.get("engines", "nose_prop"))
	var is_prop := String(def.get("kind", "prop")) == "prop"
	if absf(p.x) > fr * 1.3:
		# мотогондолы двухмоторного винтового — перед крылом
		if engines == "twin_prop" and absf(p.x) < span * 0.3 and p.z < wing_z - chord * 0.2:
			return "engine"
		return "left_wing" if p.x < 0.0 else "right_wing"
	if p.z > 0.32 * length:
		return "tail"
	if is_prop:
		if p.z < -0.3 * length:
			return "engine"
	elif p.z > 0.05 * length and p.z < 0.35 * length:
		return "engine"
	if absf(p.z - cockpit_z) <= 1.2 and p.y > 0.0:
		return "pilot"
	if absf(p.z) < 0.18 * length:
		return "fuel"
	return "structure"

func apply_hit(local_point: Vector3, damage: float, attacker: int, time_now: float) -> String:
	var mod := hit_zone(local_point)
	if damage <= 0.0:
		return mod
	last_attacker = attacker
	last_hit_time = time_now
	if _is_gone(mod):
		# по оторванной части или убитому модулю — достаётся планеру
		_damage("structure", damage * 0.5, false)
		return "structure"
	_damage(mod, damage, false)
	if mod != "structure":
		_damage("structure", damage * 0.1, false)
	var fire_k := 1.25 if is_hardcore else 1.0
	match mod:
		"fuel":
			if not fuel_leak and rng.randf() < 0.4:
				fuel_leak = true
			if rng.randf() < (0.3 if fuel_leak else 0.15) * fire_k:
				start_fire()
		"engine":
			var e := module_ratio("engine")
			if rng.randf() < (0.15 if e < 0.4 else 0.08) * fire_k:
				start_fire()
	return mod

func apply_splash(damage: float, attacker: int, time_now: float) -> void:
	if damage <= 0.0:
		return
	last_attacker = attacker
	last_hit_time = time_now
	for m in SPLASH_SHARE:
		if not _is_gone(m):
			_damage(m, damage * float(SPLASH_SHARE[m]), false)
	var fuel_max: float = maxf(float(max_hp.get("fuel", 40.0)), 1.0)
	if rng.randf() < clampf(damage / fuel_max * 0.3, 0.0, 0.35):
		start_fire()

func _is_gone(m: String) -> bool:
	match m:
		"left_wing":
			return left_wing_lost
		"right_wing":
			return right_wing_lost
		"tail":
			return tail_lost
		"pilot":
			return pilot_dead
		"engine":
			return engine_dead
		"fuel":
			return _fuel_destroyed
		"structure":
			return _structure_destroyed
	return false

## quiet = непрерывный урон (пожар, перегрузка): сигнал не чаще, чем раз в 5 % HP.
func _damage(m: String, amount: float, quiet: bool) -> void:
	if not hp.has(m) or amount <= 0.0:
		return
	var before: float = hp[m]
	if before <= 0.0:
		return
	var after := maxf(before - amount, 0.0)
	hp[m] = after
	var r := after / maxf(float(max_hp[m]), 0.001)
	var last: float = float(_emit_ratio.get(m, 1.0))
	if not quiet or after <= 0.0 or last - r >= 0.05:
		_emit_ratio[m] = r
		module_damaged.emit(m, r)
	_check_module(m)

func _check_module(m: String) -> void:
	var r := module_ratio(m)
	match m:
		"engine":
			if r <= 0.0:
				if not engine_dead:
					engine_dead = true
					oil_leak = false
					module_destroyed.emit("engine")
			elif r < 0.15 and not oil_leak and not engine_dead:
				oil_leak = true
				_oil_total = rng.randf_range(25.0, 40.0)
				oil_timer = _oil_total
		"left_wing":
			if r <= 0.0 and not left_wing_lost:
				left_wing_lost = true
				module_destroyed.emit("left_wing")
		"right_wing":
			if r <= 0.0 and not right_wing_lost:
				right_wing_lost = true
				module_destroyed.emit("right_wing")
		"tail":
			if r <= 0.0 and not tail_lost:
				tail_lost = true
				module_destroyed.emit("tail")
		"pilot":
			if r <= 0.0 and not pilot_dead:
				pilot_dead = true
				module_destroyed.emit("pilot")
		"fuel":
			if r <= 0.0 and not _fuel_destroyed:
				_fuel_destroyed = true
				fuel_leak = true
				module_destroyed.emit("fuel")
				if rng.randf() < 0.5:
					start_fire()
		"structure":
			if r <= 0.0 and not _structure_destroyed:
				_structure_destroyed = true
				module_destroyed.emit("structure")

func start_fire() -> void:
	if on_fire:
		return
	on_fire = true
	fire_time = 0.0
	fire_started.emit()

func _stop_fire() -> void:
	if not on_fire:
		return
	on_fire = false
	fire_time = 0.0
	fire_out.emit()

# ---------------------------------------------------------------- время

func update(dt: float, fm: FlightModel) -> void:
	if dt > 0.0:
		extinguish_cooldown = maxf(extinguish_cooldown - dt, 0.0)
		if on_fire:
			fire_time += dt
			_damage("fuel", FIRE_FUEL_DPS * dt, true)
			var s_before: float = hp.structure
			_damage("structure", FIRE_STRUCT_DPS * dt, true)
			if s_before > 0.0 and float(hp.structure) <= 0.0:
				_killed_by_fire = true
			if fire_time > FIRE_BURNOUT_TIME and rng.randf() < FIRE_BURNOUT_RATE * dt:
				_stop_fire()
		elif fuel_leak and rng.randf() < 0.015 * dt:
			start_fire()
		if oil_leak and not engine_dead:
			oil_timer -= dt
			if oil_timer <= 0.0:
				oil_timer = 0.0
				hp.engine = 0.0
				_emit_ratio["engine"] = 0.0
				module_damaged.emit("engine", 0.0)
				_check_module("engine")
		if fm != null and fm.structural_stress > 0.0:
			var d := fm.structural_stress * STRESS_DPS * dt
			# нагруженнее крыло, которое идёт вверх при вращении
			var bias := 0.15 * clampf(fm.roll_rate, -1.0, 1.0)
			_damage("left_wing", d * (1.0 + bias), true)
			_damage("right_wing", d * (1.0 - bias), true)
			_damage("structure", d * 0.3, true)
	if fm != null:
		_write_modifiers(fm)

func _write_modifiers(fm: FlightModel) -> void:
	var tf := 1.0
	if engine_dead:
		tf = 0.0
	else:
		var e := module_ratio("engine")
		if e < 0.4:
			tf = 0.35 + 0.65 * e / 0.4
		if oil_leak:
			tf *= lerpf(0.7, 1.0, clampf(oil_timer / maxf(_oil_total, 0.1), 0.0, 1.0))
	fm.thrust_factor = tf
	var lw := module_ratio("left_wing")
	var rw := module_ratio("right_wing")
	fm.lift_left = 0.0 if left_wing_lost else 0.8 + 0.2 * lw
	fm.lift_right = 0.0 if right_wing_lost else 0.8 + 0.2 * rw
	fm.roll_authority = 0.15 if (left_wing_lost or right_wing_lost) else 0.45 + 0.55 * minf(lw, rw)
	var t := module_ratio("tail")
	var ta := 1.0
	if tail_lost:
		ta = 0.0
	elif t < 0.5:
		ta = 0.3 + 1.4 * t
	fm.pitch_authority = ta
	fm.yaw_authority = ta
	fm.tumble = 1.0 if tail_lost else 0.0
	if pilot_dead:
		fm.pitch_authority = 0.0
		fm.roll_authority = 0.0
		fm.yaw_authority = 0.0
	var drag := 0.012 * (1.0 - lw) + 0.012 * (1.0 - rw) + 0.006 * (1.0 - t)
	drag += 0.01 * (1.0 - module_ratio("structure"))
	if left_wing_lost or right_wing_lost:
		drag += 0.03
	fm.extra_drag = drag

# ---------------------------------------------------------------- состояние

func is_destroyed() -> bool:
	return pilot_dead or left_wing_lost or right_wing_lost or tail_lost or float(hp.get("structure", 1.0)) <= 0.0

func destroyed_reason() -> String:
	if pilot_dead:
		return "pilot"
	if left_wing_lost or right_wing_lost:
		return "wing"
	if tail_lost:
		return "tail"
	if float(hp.get("structure", 1.0)) <= 0.0:
		return "fire" if _killed_by_fire else "structure"
	return ""

func module_ratio(module: String) -> float:
	if module == "wing":
		return minf(module_ratio("left_wing"), module_ratio("right_wing"))
	if not hp.has(module) or not max_hp.has(module):
		return 1.0
	return clampf(float(hp[module]) / maxf(float(max_hp[module]), 0.001), 0.0, 1.0)

func try_extinguish() -> bool:
	if not on_fire or extinguish_cooldown > 0.0:
		return false
	extinguish_cooldown = EXTINGUISH_COOLDOWN
	if rng.randf() < EXTINGUISH_CHANCE:
		_stop_fire()
		return true
	return false

## Ремонт на аэродроме. Пожар и утечки гасятся сразу, HP растёт до полного за REPAIR_TIME.
## Оторванные крыло и хвост не чинятся (самолёт всё равно уничтожен).
func repair_step(dt: float) -> bool:
	_stop_fire()
	oil_leak = false
	fuel_leak = false
	oil_timer = 0.0
	var done := true
	for m in MODULES:
		if m == "left_wing" and left_wing_lost or m == "right_wing" and right_wing_lost:
			continue
		if m == "tail" and tail_lost or m == "pilot" and pilot_dead:
			continue
		var mx: float = max_hp[m]
		var cur: float = hp[m]
		if cur < mx:
			cur = minf(mx, cur + mx * maxf(dt, 0.0) / REPAIR_TIME)
			hp[m] = cur
			if cur < mx:
				done = false
	if engine_dead and module_ratio("engine") >= 0.15:
		engine_dead = false
	if _fuel_destroyed and module_ratio("fuel") > 0.0:
		_fuel_destroyed = false
	if _structure_destroyed and module_ratio("structure") > 0.0:
		_structure_destroyed = false
	_killed_by_fire = false
	if done:
		_emit_ratio.clear()
	return done

func repair_full() -> void:
	var lw := left_wing_lost
	var rw := right_wing_lost
	var tl := tail_lost
	_stop_fire()
	_reset_state()
	# оторванное не возвращается
	if lw:
		hp.left_wing = 0.0
		left_wing_lost = true
	if rw:
		hp.right_wing = 0.0
		right_wing_lost = true
	if tl:
		hp.tail = 0.0
		tail_lost = true

func is_damaged() -> bool:
	if on_fire or oil_leak or fuel_leak or engine_dead:
		return true
	for m in MODULES:
		if float(hp.get(m, 0.0)) < float(max_hp.get(m, 0.0)) - 0.001:
			return true
	return false
