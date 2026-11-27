extends Node
## Прохождение обучения без экрана: «ученик» сам проходит все 7 шагов, как игрок.
## Шаги 1–3 — простые команды (газ, поворот, набор высоты), шаги 4–6 — бот-пилот:
## мишени, бомба по отмеченной цели, посадка на свой аэродром. В конце бой должен закончиться победой.
## Запуск: godot --headless --fixed-fps 60 --path skybreak res://tests/harness_match_training.tscn -- [--seed=7 --max=900]
## Печатает подсказки, смену шагов и «[training] итог: …».

class Student extends Node:
	var tr = null
	var bp: BotPilot = null
	var _step_seen := 0
	var _hold := 0.0

	func get_controls(ac, dt: float) -> Dictionary:
		var c := Data.empty_controls()
		if bp == null:
			bp = BotPilot.new()
			bp.skill = 0.8
			add_child(bp)
		var step: int = tr.step if tr != null else 0
		if step != _step_seen:
			_step_seen = step
			_hold = 0.0
			if step == TrainingDirector.STEP_LAND:
				bp._begin_return(ac)
		_hold += dt
		var f = ac.fm
		match step:
			TrainingDirector.STEP_THROTTLE:
				c = bp.get_controls(ac, dt)
				c.throttle = 1.0
			TrainingDirector.STEP_TURN:
				c = bp.get_controls(ac, dt)
				c.roll = clampf((0.6 - f.bank()) * 2.0, -1.0, 1.0)
				c.pitch = 0.25
				c.throttle = 1.0
			TrainingDirector.STEP_CLIMB:
				c = bp.get_controls(ac, dt)
				c.roll = clampf(-f.bank() * 2.0, -1.0, 1.0)
				var gam := asin(clampf(f.vel.y / maxf(f.vel.length(), 1.0), -1.0, 1.0))
				c.pitch = clampf((0.2 - gam) * 2.0, -0.5, 0.6)
				c.throttle = 1.0
				c.afterburner = true
			TrainingDirector.STEP_TARGETS:
				bp.role = "fighter"   # штурмовик-бот сначала полетел бы бомбить
				c = bp.get_controls(ac, dt)
			TrainingDirector.STEP_BOMB:
				bp.role = String(ac.def.get("line", "fighter"))
				# бомбить надо отмеченную цель, а не ближайшую
				if tr.objective != null and is_instance_valid(tr.objective):
					if bp.target != tr.objective:
						bp.target = tr.objective
						bp.attack_phase = "setup"
					bp.state = "attack_ground"
					bp._think_t = 10.0
				c = bp.get_controls(ac, dt)
			_:
				c = bp.get_controls(ac, dt)
		return c


var _mm = null
var _student: Student = null
var _seed := 7
var _max := 900.0
var _last_step := 0
var _t := 0.0
var _step_t: Dictionary = {}

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"seed": _seed = int(kv[1])
			"max": _max = float(kv[1])
	Game.match_config = {"mode": "training", "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
		"lineup": ["strizh"], "seed": _seed, "autopilot": false}
	await get_tree().process_frame
	_mm = load("res://scenes/battle.tscn").instantiate()
	_mm.leave_scene = false
	_mm.crash_view_seconds = 0.0
	_mm.message.connect(func(t: String, _s: float): print("[hint] t=%.0f %s" % [_mm.elapsed, t]))
	_mm.state_changed.connect(func(s: String): print("[state] t=%.0f %s" % [_mm.elapsed, s]))
	_mm.player_spawned.connect(_on_spawned)
	_mm.kill_event.connect(func(t: String, _a: int, _b: int): print("[kill] t=%.0f %s" % [_mm.elapsed, t]))
	get_tree().root.add_child(_mm)

func _on_spawned(ac) -> void:
	_student = Student.new()
	_student.name = "Student"
	_student.tr = _mm.training
	ac.set_pilot(_student)
	if _student.get_parent() == null:
		ac.add_child(_student)
	print("[spawn] t=%.0f %s на земле=%s" % [_mm.elapsed, String(ac.def_id), str(bool(ac.fm.on_ground))])

func _physics_process(dt: float) -> void:
	if _mm == null or not is_instance_valid(_mm) or _mm.training == null:
		return
	_t += dt
	var st: int = int(_mm.training.step)
	if st != _last_step:
		print("[step] t=%.0f шаг %d" % [_mm.elapsed, st])
		_step_t[st] = float(_mm.elapsed)
		_last_step = st
	# в меню вылета после гибели — сразу снова в бой
	if _mm.state == "spawn":
		_mm.request_spawn(String(_mm.lineup[0]))
	if _mm.state == "ended" or _t > _max:
		var ps: Dictionary = _mm.player_stats()
		print("[training] итог: outcome=%s шаг=%d время=%.0f с гибелей=%d шаги=%s" % [String(_mm.outcome), st,
			float(_mm.elapsed), int(ps.deaths), str(_step_t)])
		set_physics_process(false)
		get_tree().quit()
