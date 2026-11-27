extends DamageModel
## Упрощённая модель повреждений для тестов ENTITY, пока настоящая DamageModel — заглушка.
## Поля с префиксом hx_, чтобы файл компилировался и поверх настоящей реализации.

const HX_MODULES := ["engine", "fuel", "left_wing", "right_wing", "tail", "pilot", "structure"]

var hx_fire_cd: float = 0.0


func setup(p_def: Dictionary, hardcore: bool) -> void:
	def = p_def
	var src: Dictionary = def.get("hp", {})
	var k := 0.8 if hardcore else 1.0
	max_hp = {"engine": float(src.get("engine", 50)) * k, "fuel": float(src.get("fuel", 40)) * k,
		"left_wing": float(src.get("wing", 60)) * k, "right_wing": float(src.get("wing", 60)) * k,
		"tail": float(src.get("tail", 45)) * k, "pilot": float(src.get("pilot", 30)) * k,
		"structure": float(src.get("structure", 100)) * k}
	hp = max_hp.duplicate()
	on_fire = false
	engine_dead = false
	left_wing_lost = false
	right_wing_lost = false
	tail_lost = false
	pilot_dead = false


func hx_zone(p: Vector3) -> String:
	var sh: Dictionary = def.get("shape", {})
	var length := float(sh.get("length", 10.0))
	var fr := float(sh.get("fuselage_radius", 0.8))
	if absf(p.x) > fr * 1.3:
		return "left_wing" if p.x < 0.0 else "right_wing"
	if p.z > 0.32 * length:
		return "tail"
	if absf(p.z - float(sh.get("cockpit_z", 0.0))) <= 1.2 and p.y > 0.0:
		return "pilot"
	return "structure"


func hx_damage(m: String, amount: float) -> void:
	var before := float(hp[m])
	if before <= 0.0:
		return
	hp[m] = maxf(0.0, before - amount)
	module_damaged.emit(m, module_ratio(m))
	if float(hp[m]) <= 0.0:
		match m:
			"pilot":
				pilot_dead = true
			"left_wing":
				left_wing_lost = true
			"right_wing":
				right_wing_lost = true
			"tail":
				tail_lost = true
			"engine":
				engine_dead = true
		module_destroyed.emit(m)


func apply_hit(local_point: Vector3, damage: float, attacker: int, time_now: float) -> String:
	var m := hx_zone(local_point)
	last_attacker = attacker
	last_hit_time = time_now
	hx_damage(m, damage)
	return m


func apply_splash(damage: float, attacker: int, time_now: float) -> void:
	last_attacker = attacker
	last_hit_time = time_now
	hx_damage("structure", damage * 0.4)


func update(dt: float, fm: FlightModel) -> void:
	hx_fire_cd = maxf(0.0, hx_fire_cd - dt)
	if fm != null:
		fm.lift_left = 0.0 if left_wing_lost else 1.0
		fm.lift_right = 0.0 if right_wing_lost else 1.0
		fm.thrust_factor = 0.0 if engine_dead else 1.0


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
		return "structure"
	return ""


func module_ratio(module: String) -> float:
	if not hp.has(module):
		return 1.0
	return clampf(float(hp[module]) / maxf(float(max_hp[module]), 0.001), 0.0, 1.0)


func try_extinguish() -> bool:
	if not on_fire or hx_fire_cd > 0.0:
		return false
	hx_fire_cd = 20.0
	on_fire = false
	fire_out.emit()
	return true


func repair_step(dt: float) -> bool:
	on_fire = false
	var done := true
	for m in HX_MODULES:
		var mx := float(max_hp[m])
		hp[m] = minf(mx, float(hp[m]) + mx * dt / 20.0)
		if float(hp[m]) < mx:
			done = false
	return done


func repair_full() -> void:
	hp = max_hp.duplicate()


func is_damaged() -> bool:
	for m in HX_MODULES:
		if float(hp[m]) < float(max_hp[m]) - 0.001:
			return true
	return on_fire
