extends RefCounted
## Тесты ENTITY: Aircraft, PlayerPilot, BotPilot. Бой подменяется tests/harness_entity_battle.gd.
## Если FLIGHT/WEAPONS ещё заглушки, вместо них подставляются упрощённые модели из tests/harness_entity_*.gd,
## с настоящими модулями тесты идут на них.

const BattleScript = preload("res://tests/harness_entity_battle.gd")
const TargetScript = preload("res://tests/harness_entity_target.gd")
const SimpleFM = preload("res://tests/harness_entity_fm.gd")
const SimpleDmg = preload("res://tests/harness_entity_dmg.gd")
const SimpleWS = preload("res://tests/harness_entity_ws.gd")

const DT := 1.0 / 60.0

var errors: Array = []
var stub_fm := false
var stub_dmg := false
var stub_ws := false
var battle = null


class HoldPilot:
	extends RefCounted
	## Стоит на месте: газ 0, тормоз.
	func get_controls(_ac, _dt: float) -> Dictionary:
		var c := Data.empty_controls()
		c.throttle = 0.0
		c.brake = true
		return c


func run(tree: SceneTree) -> Array:
	stub_fm = _is_stub("res://scripts/sim/flight_model.gd")
	stub_dmg = _is_stub("res://scripts/sim/damage_model.gd")
	stub_ws = _is_stub("res://scripts/sim/weapon_system.gd")
	print("  test_aircraft: модель полёта ", "упрощённая" if stub_fm else "настоящая",
		", повреждения ", "упрощённые" if stub_dmg else "настоящие", ", оружие ", "упрощённое" if stub_ws else "настоящее")
	var tests := ["_t_setup_all", "_t_ray_hit", "_t_destroyed_once", "_t_border_kill", "_t_bots_duel",
		"_t_attacker", "_t_mouse_instructor", "_t_servicing", "_t_terrain_avoid"]
	for t in tests:
		await _new_battle(tree)
		await call(t, tree)
		_end_battle()
		await tree.process_frame
	return errors


func _check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


func _is_stub(path: String) -> bool:
	var s = load(path)
	return s is GDScript and (s as GDScript).source_code.find("ЗАГЛУШКА") >= 0


func _new_battle(tree: SceneTree) -> void:
	battle = BattleScript.new()
	tree.root.add_child.call_deferred(battle)   # корень может быть занят (_ready раннера)
	await tree.process_frame
	Game.battle = battle


func _end_battle() -> void:
	if Game.battle == battle:
		Game.battle = null
	if battle != null and is_instance_valid(battle):
		battle.queue_free()
	battle = null


func _spawn(id: String, team: int, uid: int, pos: Vector3, bas: Basis, speed: float, on_ground: bool = false, is_player: bool = false) -> Aircraft:
	var ac := Aircraft.new()
	battle.add_aircraft(ac)
	var spawn := {"pos": pos, "basis": bas, "speed": speed, "on_ground": on_ground}
	ac.setup(id, team, uid, "Тест%d" % uid, "factory", spawn, {"assist": true, "hardcore": false, "is_player": is_player})
	# заглушки FLIGHT/WEAPONS подменяем упрощёнными моделями
	if stub_fm:
		ac.fm = SimpleFM.new()
		ac.fm.assist = true
		ac.fm.setup(ac.def, pos, bas, speed, on_ground)
	if stub_dmg:
		ac.dmg = SimpleDmg.new()
		ac.dmg.setup(ac.def, false)
		ac.dmg.module_damaged.connect(ac._on_module_damaged)
	if stub_ws:
		ac.weapons = SimpleWS.new()
		ac.weapons.setup(ac.def)
	return ac


func _step(list: Array, seconds: float, each: Callable = Callable()) -> void:
	var n := int(round(seconds / DT))
	for i in n:
		battle.elapsed += DT
		for ac in list:
			if is_instance_valid(ac) and not ac.is_queued_for_deletion():
				ac._physics_process(DT)
		if each.is_valid():
			if each.call(i) == true:
				return


static func _yaw_basis(deg: float) -> Basis:
	# поворот курса: 0 — на -Z, + — вправо (по часовой сверху)
	return Basis(Vector3.UP, -deg_to_rad(deg))


# ---------------------------------------------------------------- 1. сборка всех самолётов

func _t_setup_all(_tree: SceneTree) -> void:
	var uid := 1
	for id in Data.ORDER:
		var pos := Vector3(100.0 * uid, 1200.0, -50.0 * uid)
		var ac := Aircraft.new()
		battle.add_aircraft(ac)
		ac.setup(id, uid % 2, uid, "Тест", "factory", {"pos": pos, "basis": _yaw_basis(30.0), "speed": 150.0, "on_ground": false},
			{"assist": true, "hardcore": uid % 3 == 0, "is_player": false})
		_check(ac.model != null and ac.model.get_parent() == ac, "%s: нет модели" % id)
		_check(ac.model != null and ac.model.get_node_or_null("Body") != null, "%s: у модели нет Body" % id)
		_check(ac.fm != null and String(ac.fm.def.get("id", "")) == id, "%s: модель полёта не настроена" % id)
		_check(ac.dmg != null and ac.weapons != null, "%s: нет повреждений или оружия" % id)
		_check(ac.def_id == id and ac.uid == uid and ac.alive, "%s: поля не заполнены" % id)
		_check(ac.global_position.distance_to(pos) < 0.01, "%s: позиция %s вместо %s" % [id, ac.global_position, pos])
		_check(ac.forward().dot(_yaw_basis(30.0) * Vector3.FORWARD) > 0.99, "%s: неверное направление носа" % id)
		_check(ac.hit_radius() >= float(ac.def.shape.length) * 0.5, "%s: hit_radius меньше половины длины" % id)
		# несколько кадров без пилота — не падает и не ломается
		_step([ac], 0.5)
		_check(ac.alive, "%s: погиб без причины" % id)
		_check(ac.controls.has("throttle"), "%s: controls не заполнены" % id)
		uid += 1
	# на земле — шасси выпущено
	var g := Aircraft.new()
	battle.add_aircraft(g)
	g.setup("shmel", 0, 99, "Земля", "factory", {"pos": Vector3(0, 1.6, 3000), "basis": Basis.IDENTITY, "speed": 0.0, "on_ground": true},
		{"assist": false, "hardcore": true, "is_player": false})
	_check(g.fm.gear_down, "на земле шасси должно быть выпущено")
	_check(not g.fm.assist, "assist из opts не применён")
	var gear := g.model.get_node_or_null("Gear") as Node3D
	_check(gear == null or gear.visible, "шасси на земле не видно")


# ---------------------------------------------------------------- 2. попадания по форме

func _t_ray_hit(_tree: SceneTree) -> void:
	var b := _yaw_basis(35.0) * Basis(Vector3.RIGHT, 0.2)
	var p := Vector3(320.0, 900.0, -150.0)
	var ac := _spawn("strizh", 1, 5, p, b, 120.0)
	var xf := Transform3D(ac.fm.basis.orthonormalized(), ac.fm.pos)
	var sh: Dictionary = ac.def.shape
	var half := float(sh.span) * 0.5
	var fr := float(sh.fuselage_radius)
	# через ось фюзеляжа поперёк (за крылом, перед хвостом)
	var zc := 0.22 * float(sh.length)
	var r1 := ac.ray_hit(xf * Vector3(12, 0, zc), xf * Vector3(-12, 0, zc))
	_check(r1.hit, "отрезок через фюзеляж не попал")
	if r1.hit:
		var lp: Vector3 = r1.local_point
		_check(absf(lp.x - fr * 1.15) < 0.15 and absf(lp.y) < 0.15 and absf(lp.z - zc) < 0.15, "точка входа в фюзеляж неверная: %s" % lp)
		_check((r1.world_point as Vector3).distance_to(xf * lp) < 0.01, "world_point не совпадает с local_point")
	var r1c := ac.ray_hit(xf * Vector3(0, 10, 0), xf * Vector3(0, -10, 0))
	_check(r1c.hit and absf((r1c.local_point as Vector3).x) < 0.01, "отрезок сверху через центр не попал")
	# вдоль оси спереди назад
	var r1b := ac.ray_hit(xf * Vector3(0, 0, -30), xf * Vector3(0, 0, 30))
	_check(r1b.hit and (r1b.local_point as Vector3).z < -float(sh.length) * 0.5 + 0.1, "отрезок вдоль оси должен входить в нос")
	# в 30 м сбоку
	var r2 := ac.ray_hit(xf * Vector3(30, 0, -20), xf * Vector3(30, 0, 20))
	_check(not r2.hit, "отрезок в 30 м сбоку попал")
	var r2b := ac.ray_hit(xf * Vector3(0, 30, -20), xf * Vector3(0, 30, 20))
	_check(not r2b.hit, "отрезок в 30 м сверху попал")
	# законцовка крыла сверху вниз
	var tx := half - 0.3
	var wz := float(sh.wing_z)
	var r3 := ac.ray_hit(xf * Vector3(tx, 6, wz), xf * Vector3(tx, -6, wz))
	_check(r3.hit, "отрезок через законцовку крыла не попал")
	if r3.hit:
		var lx := float((r3.local_point as Vector3).x)
		_check(lx > half - 1.0 and lx <= half + 0.01, "попадание в законцовку не у края крыла: x = %.2f" % lx)
	var r3l := ac.ray_hit(xf * Vector3(-tx, 6, wz), xf * Vector3(-tx, -6, wz))
	_check(r3l.hit and float((r3l.local_point as Vector3).x) < 0.0, "левая законцовка не попала")
	# за законцовкой — мимо
	var r4 := ac.ray_hit(xf * Vector3(half + 1.0, 6, wz), xf * Vector3(half + 1.0, -6, wz))
	_check(not r4.hit, "отрезок за законцовкой попал")
	# хвост сверху
	var r5 := ac.ray_hit(xf * Vector3(0.5, 8, 0.42 * float(sh.length)), xf * Vector3(0.5, -8, 0.42 * float(sh.length)))
	_check(r5.hit, "хвост не попадается")
	# короткий отрезок, не дотягивающий до самолёта
	var r6 := ac.ray_hit(xf * Vector3(20, 0, 0), xf * Vector3(5, 0, 0))
	_check(not r6.hit, "короткий отрезок до самолёта не должен попадать")
	# стреловидное крыло: законцовка сдвинута назад
	var fl := _spawn("flanker", 0, 6, Vector3(0, 1500, 0), Basis.IDENTITY, 200.0)
	var fsh: Dictionary = fl.def.shape
	var fx := Transform3D(fl.fm.basis.orthonormalized(), fl.fm.pos)
	var fh := float(fsh.span) * 0.5 - 0.4
	var tip_z := float(fsh.wing_z) + fh * tan(deg_to_rad(float(fsh.sweep_deg)))
	var r7 := fl.ray_hit(fx * Vector3(fh, 6, tip_z), fx * Vector3(fh, -6, tip_z))
	_check(r7.hit, "законцовка стреловидного крыла не попадается")


# ---------------------------------------------------------------- 3. гибель один раз

func _t_destroyed_once(_tree: SceneTree) -> void:
	var ac := _spawn("strizh", 1, 7, Vector3(0, 1500, 0), Basis.IDENTITY, 130.0)
	var events: Array = []
	ac.destroyed.connect(func(a, killer: int, reason: String) -> void: events.append([a, killer, reason]))
	var sh: Dictionary = ac.def.shape
	var cockpit := Vector3(0.0, float(sh.fuselage_radius) * 0.6, float(sh.cockpit_z))
	ac.take_hit(Vector3(3.0, 0.0, float(sh.wing_z)), 5.0, 41)   # первый стрелок
	ac.take_hit(cockpit, 9999.0, 42)                               # добил второй
	_step([ac], DT)
	_check(events.size() == 1, "destroyed после смертельного попадания: %d раз" % events.size())
	_check(not ac.alive, "после гибели alive = true")
	if events.size() > 0:
		_check(events[0][0] == ac, "destroyed: первый аргумент не самолёт")
		_check(int(events[0][1]) == 42, "убийца %d вместо последнего стрелявшего 42" % int(events[0][1]))
		_check(String(events[0][2]) == "pilot", "причина %s вместо pilot" % String(events[0][2]))
	ac.take_hit(cockpit, 9999.0, 55)
	ac.take_splash(ac.global_position, 500.0, 20.0, 56)
	# обломки падают и взрываются
	var start_y := ac.fm.pos.y
	_step([ac], 40.0, func(_i: int) -> bool: return ac.exploded)
	_check(events.size() == 1, "destroyed пришёл %d раз (нужен 1)" % events.size())
	_check(ac.exploded, "обломки не взорвались за 40 с")
	_check(ac.fm.pos.y < start_y, "обломки не падали")
	_check(ac.model == null or not ac.model.visible, "модель видна после взрыва")
	_step([ac], 3.2)
	_check(ac.is_queued_for_deletion(), "узел не удаляется через 3 с после взрыва")
	# удар о землю — сразу взрыв
	var low := _spawn("krechet", 0, 8, Vector3(0, 30, 500), Basis(Vector3.RIGHT, -0.6), 150.0)
	var events2: Array = []
	low.destroyed.connect(func(_a, killer: int, reason: String) -> void: events2.append([killer, reason]))
	_step([low], 3.0, func(_i: int) -> bool: return not low.alive)
	_check(events2.size() == 1, "удар о землю: destroyed %d раз" % events2.size())
	if events2.size() == 1:
		_check(String(events2[0][1]) in ["ground", "gear"], "удар о землю: причина %s" % String(events2[0][1]))
		_check(int(events2[0][0]) == -1, "удар о землю без попаданий: убийца должен быть -1")
	_check(low.exploded, "удар о землю: нет взрыва сразу")


func _t_border_kill(_tree: SceneTree) -> void:
	var ac := _spawn("strizh", 0, 9, Vector3(5150, 1500, 0), _yaw_basis(90.0), 110.0)
	var events: Array = []
	ac.destroyed.connect(func(_a, killer: int, reason: String) -> void: events.append([killer, reason]))
	ac.take_hit(Vector3(3.0, 0.0, float(ac.def.shape.wing_z)), 1.0, 33)
	_step([ac], 9.0)
	_check(ac.alive, "граница: погиб раньше 10 с")
	_check(ac.border_time > 7.0, "граница: border_time не растёт (%.1f)" % ac.border_time)
	_step([ac], 2.5, func(_i: int) -> bool: return not ac.alive)
	_check(events.size() == 1 and String(events[0][1]) == "border", "граница: нет гибели с причиной border (%s)" % str(events))
	if events.size() == 1:
		_check(int(events[0][0]) == 33, "граница: попадание 11 с назад должно засчитаться (убийца %d)" % int(events[0][0]))


# ---------------------------------------------------------------- 4. дуэль ботов

func _t_bots_duel(_tree: SceneTree) -> void:
	var a := _spawn("strizh", 0, 11, Vector3(0, 1500, 750), Basis.IDENTITY, 120.0)
	var b := _spawn("strizh", 1, 12, Vector3(40, 1500, -750), _yaw_basis(180.0), 120.0)
	var pa := BotPilot.new()
	pa.skill = 0.8
	var pb := BotPilot.new()
	pb.skill = 0.8
	a.set_pilot(pa)
	b.set_pilot(pb)
	var m := {"samples": 0, "fast": [0, 0], "close_fire": false, "min_agl": INF, "min_d": INF, "states": {}, "close_t": 0.0}
	_step([a, b], 120.0, func(_i: int) -> bool:
		m.samples += 1
		var pair := [a, b]
		for k in 2:
			var ac: Aircraft = pair[k]
			if ac.speed() > 1.1 * ac.fm.stall_speed():
				m.fast[k] += 1
			m.min_agl = minf(m.min_agl, ac.altitude_agl())
		var d := a.global_position.distance_to(b.global_position)
		m.min_d = minf(m.min_d, d)
		if d < 800.0:
			m.close_t += DT
			if bool(a.controls.guns) or bool(b.controls.guns):
				m.close_fire = true
		m.states[pa.state] = true
		m.states[pb.state] = true
		return false)
	print("  дуэль: мин. дистанция %.0f м, ближе 800 м %.1f с, мин. высота %.0f м, состояния %s" % [m.min_d, m.close_t, m.min_agl, str(m.states.keys())])
	_check(a.alive and b.alive, "дуэль: бот разбился сам (a %s %s, b %s %s)" % [a.alive, a.death_reason, b.alive, b.death_reason])
	_check(m.min_agl > 40.0, "дуэль: опасно низко, %.0f м" % m.min_agl)
	for k in 2:
		var frac := float(m.fast[k]) / float(maxi(m.samples, 1))
		_check(frac > 0.85, "дуэль: бот %d выше 1.1 скорости сваливания только %.0f %% времени" % [k, frac * 100.0])
	_check(m.min_d < 800.0, "дуэль: боты не сблизились до 800 м (минимум %.0f)" % m.min_d)
	_check(m.close_fire, "дуэль: никто не стрелял ближе 800 м")
	_check(m.states.has("engage"), "дуэль: не было состояния engage (%s)" % str(m.states.keys()))
	if not stub_ws:
		_check(int(battle.projectiles.counts.bullet) > 0, "дуэль: пули не вылетели")


# ---------------------------------------------------------------- 5. штурмовик

func _t_attacker(tree: SceneTree) -> void:
	var t: Node3D = TargetScript.new()
	t.uid = 901
	battle.add_child(t)
	t.global_position = Vector3(0, 0, -400)
	battle.ground_units.append(t)
	var ac := _spawn("shmel", 0, 21, Vector3(0, 800, 2600), Basis.IDENTITY, 110.0)
	var bot := BotPilot.new()
	bot.skill = 0.7
	ac.set_pilot(bot)
	var m := {"released": false, "dist": INF, "min_pitch": 0.0, "phases": {}, "t": 0.0}
	_step([ac], 100.0, func(_i: int) -> bool:
		m.t += DT
		m.phases[bot.attack_phase] = true
		m.min_pitch = minf(m.min_pitch, ac.fm.pitch_angle())
		if bool(ac.controls.rocket) or bool(ac.controls.bomb):
			if not m.released:
				m.released = true
				m.dist = ac.global_position.distance_to(t.global_position)
				print("  штурмовик: сброс через %.1f с на дистанции %.0f м, тангаж %.0f°" % [m.t, m.dist, rad_to_deg(ac.fm.pitch_angle())])
		return m.released and ac.fm.pitch_angle() > 0.1)
	_check(ac.alive, "штурмовик разбился (%s)" % ac.death_reason)
	_check(bot.role == "attacker", "у Шмеля роль %s" % bot.role)
	_check(bot.target == t or m.released, "штурмовик не выбрал наземную цель")
	_check(m.released, "штурмовик не выпустил ни ракет, ни бомб (фазы %s)" % str(m.phases.keys()))
	_check(m.dist < 2000.0, "сброс слишком далеко от цели: %.0f м" % m.dist)
	_check(m.min_pitch < deg_to_rad(-12.0) or m.phases.has("bomb_run"), "штурмовик не пикировал (мин. тангаж %.1f°)" % rad_to_deg(m.min_pitch))
	var pm = battle.projectiles
	_check(int(pm.counts.rocket) + int(pm.counts.bomb) > 0, "ракеты или бомбы не появились в ProjectileManager")


# ---------------------------------------------------------------- 6. инструктор мыши

func _t_mouse_instructor(_tree: SceneTree) -> void:
	var ac := _spawn("strizh", 0, 31, Vector3(0, 1500, 0), Basis.IDENTITY, 130.0, false, true)
	var pp := PlayerPilot.new()
	pp.follow_settings = false
	pp.mode = "mouse"
	battle.add_child(pp)
	ac.set_pilot(pp)
	var aim := Vector3(sin(deg_to_rad(60.0)), 0.0, -cos(deg_to_rad(60.0)))
	pp.aim_dir = aim
	var m := {"reached": -1.0, "cross": 0, "sign": 0.0, "t": 0.0, "after": 0.0}
	var start_y := ac.fm.pos.y
	_step([ac], 9.0, func(_i: int) -> bool:
		m.t += DT
		var off := ac.forward().angle_to(aim)
		var local: Vector3 = ac.fm.basis.transposed() * aim
		if m.reached < 0.0 and off < deg_to_rad(5.0):
			m.reached = m.t
		if off < deg_to_rad(12.0):
			var sgn := signf(local.x) if absf(local.x) > 0.004 else 0.0
			if sgn != 0.0:
				if m.sign != 0.0 and sgn != m.sign:
					m.cross += 1
				m.sign = sgn
		if m.reached > 0.0 and m.t > m.reached + 1.0:
			m.after = maxf(m.after, off)
		return false)
	print("  инструктор: доворот на 60° за %.2f с, переходов %d, потом до %.1f°" % [m.reached, m.cross, rad_to_deg(m.after)])
	_check(m.reached > 0.0 and m.reached <= 6.0, "инструктор: нос не дошёл до прицела за 6 с (%.2f с)" % m.reached)
	_check(m.cross <= 2, "инструктор: раскачка, %d переходов через прицел" % m.cross)
	_check(m.after < deg_to_rad(6.0), "инструктор: после доворота нос уходит на %.1f°" % rad_to_deg(m.after))
	_check(absf(ac.fm.pos.y - start_y) < 300.0, "инструктор: высота ушла на %.0f м" % (ac.fm.pos.y - start_y))
	_check(ac.alive, "инструктор: самолёт погиб")
	# прицел вниз-влево тоже отрабатывается
	var aim2 := Vector3(-0.5, -0.35, -0.8).normalized()
	pp.aim_dir = aim2
	var m2 := {"best": PI}
	_step([ac], 6.0, func(_i: int) -> bool:
		m2.best = minf(m2.best, ac.forward().angle_to(aim2))
		return false)
	_check(m2.best < deg_to_rad(5.0), "инструктор: прицел вниз-влево не достигнут (%.1f°)" % rad_to_deg(m2.best))
	pp.queue_free()


# ---------------------------------------------------------------- 7. обслуживание

func _t_servicing(_tree: SceneTree) -> void:
	var gh := float(Data.plane("strizh").shape.gear_height)
	var ac := _spawn("strizh", 0, 41, Vector3(0, gh, 3000), Basis.IDENTITY, 0.0, true, true)
	ac.set_pilot(HoldPilot.new())
	var done: Array = []
	ac.serviced.connect(func(a) -> void: done.append(a))
	_check(not ac.service_armed, "обслуживание сразу после спавна на полосе не должно быть доступно")
	_step([ac], 2.0)
	_check(not ac.servicing and done.is_empty(), "обслуживание началось без вылета")
	# как будто вернулся из полёта: повреждён, часть боезапаса потрачена
	var length := float(ac.def.shape.length)
	ac.take_hit(Vector3(0.0, -0.3, 0.25 * length), 25.0, 77)
	var g: Array = ac.weapons.ammo.get("guns", [])
	if g.size() > 0:
		g[0] = 0
	_check(ac.dmg.is_damaged(), "попадание не повредило самолёт")
	ac.service_armed = true
	var m := {"saw": false, "prog": 0.0, "t": 0.0}
	_step([ac], 60.0, func(_i: int) -> bool:
		m.t += DT
		if ac.servicing:
			m.saw = true
		m.prog = maxf(m.prog, ac.service_progress)
		return not done.is_empty())
	print("  обслуживание: %.1f с" % m.t)
	_check(ac.alive, "обслуживание: самолёт погиб")
	_check(m.saw, "обслуживание не началось на своей полосе")
	_check(done.size() == 1 and done[0] == ac, "serviced не пришёл (или пришёл %d раз)" % done.size())
	_check(m.prog >= 0.999, "service_progress не дошёл до 1 (%.2f)" % m.prog)
	_check(not ac.dmg.is_damaged(), "после обслуживания остались повреждения")
	_check(not ac.servicing and not ac.service_armed, "после обслуживания флаги не сброшены")
	_check(ac.speed() < 1.0, "самолёт уехал с места при газе 0 и тормозе")
	_step([ac], 3.0)
	_check(done.size() == 1, "serviced пришёл повторно без нового вылета")
	# чужая полоса не обслуживает
	battle.world.runway_team = 1
	var en := _spawn("strizh", 0, 42, Vector3(10, gh, 2900), Basis.IDENTITY, 0.0, true)
	en.set_pilot(HoldPilot.new())
	en.service_armed = true
	en.take_hit(Vector3(0.0, -0.3, 0.25 * length), 25.0, 77)
	_step([en], 2.0)
	_check(not en.servicing, "обслуживание на чужой полосе")


# ---------------------------------------------------------------- облёт горы

func _t_terrain_avoid(_tree: SceneTree) -> void:
	var w = battle.world
	w.hill_h = 1100.0
	w.hill_pos = Vector2(0, -1200)
	w.hill_r = 900.0
	var ac := _spawn("shtorm", 0, 51, Vector3(0, 650, 1500), Basis.IDENTITY, 170.0)
	var bot := BotPilot.new()
	bot.skill = 0.3
	ac.set_pilot(bot)
	var m := {"min_agl": INF}
	_step([ac], 40.0, func(_i: int) -> bool:
		m.min_agl = minf(m.min_agl, ac.altitude_agl())
		return false)
	print("  облёт горы: минимум %.0f м над рельефом" % m.min_agl)
	_check(ac.alive, "облёт горы: бот разбился (%s)" % ac.death_reason)
	_check(m.min_agl > 25.0, "облёт горы: прошёл в %.0f м над склоном" % m.min_agl)
