extends RefCounted
## Тесты модуля WEAPONS: WeaponSystem, ProjectileManager, Effects.

const BattleScript := preload("res://tests/harness_weapons_battle.gd")
const TargetScript := preload("res://tests/harness_weapons_target.gd")
const UnitScript := preload("res://tests/harness_weapons_unit.gd")
const WorldScript := preload("res://tests/harness_weapons_world.gd")
const RecScript := preload("res://tests/harness_weapons_recorder.gd")

const DT := 1.0 / 60.0

var errors: Array = []
var tree: SceneTree
var battle
var pm: ProjectileManager
var fx: Effects
var rec
var world
var _next_uid: int = 100


func check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


func run(p_tree: SceneTree) -> Array:
	tree = p_tree
	var prev_battle = Game.battle
	# раннер вызывает run() из _ready: корень занят, добавлять узлы можно со следующего кадра
	await tree.process_frame
	_setup()
	_test_bullet_hit()
	_test_bullet_moving_target()
	_test_guns_fire_and_tracers()
	_test_guns_hit_target()
	_test_ammo_runs_out()
	_test_muzzle_markers()
	_test_armored_and_ground()
	_test_bombs()
	_test_rockets()
	_test_lock()
	_test_missile_hits()
	_test_flares_decoy()
	_test_flares_drop()
	_test_flak()
	_test_rearm_and_summary()
	_test_no_battle()
	_test_performance()
	await _test_effects()
	_teardown()
	Game.battle = prev_battle
	await tree.process_frame
	return errors


# ---------------------------------------------------------------- окружение

func _setup() -> void:
	battle = BattleScript.new()
	battle.name = "WeaponsTestBattle"
	tree.root.add_child(battle)
	world = WorldScript.new()
	battle.add_child(world)
	battle.world = world
	rec = RecScript.new()
	battle.add_child(rec)
	battle.recorder = rec
	fx = Effects.new()
	battle.add_child(fx)
	fx.set_process(false)
	battle.fx = fx
	pm = ProjectileManager.new()
	battle.add_child(pm)
	pm.set_physics_process(false)
	pm.set_process(false)
	battle.projectiles = pm
	Game.battle = battle


func _teardown() -> void:
	_reset()
	fx.clear()
	if Game.battle == battle:
		Game.battle = null
	battle.queue_free()


func _reset() -> void:
	pm.clear()
	pm.flare_chance = 0.6
	for a in battle.aircraft:
		if is_instance_valid(a):
			a.queue_free()
	for u in battle.ground_units:
		if is_instance_valid(u):
			u.queue_free()
	battle.aircraft.clear()
	battle.ground_units.clear()
	rec.events.clear()
	world.ground = 0.0
	world.water_x = 100000.0


func _target(pos: Vector3, team: int) -> Node3D:
	var t = TargetScript.new()
	_next_uid += 1
	t.uid = _next_uid
	t.team = team
	battle.add_child(t)
	t.position = pos
	battle.aircraft.append(t)
	return t


func _unit(pos: Vector3, team: int, r: float = 5.0, armored: bool = false) -> Node3D:
	var u = UnitScript.new()
	_next_uid += 1
	u.uid = _next_uid
	u.team = team
	u.radius = r
	u.armored = armored
	battle.add_child(u)
	u.position = pos
	battle.ground_units.append(u)
	return u


func _sim(seconds: float, movers: Array = []) -> void:
	var n := int(round(seconds / DT))
	for k in n:
		for m in movers:
			m.move(DT)
		pm.step(DT)
		fx.step(DT)


func _sim_until_no_shells(max_seconds: float, movers: Array = []) -> float:
	var t := 0.0
	while t < max_seconds:
		for m in movers:
			m.move(DT)
		pm.step(DT)
		fx.step(DT)
		t += DT
		if pm.shell_count() == 0:
			break
	return t


func _ctrl(key: String = "", on: bool = true) -> Dictionary:
	var c := Data.empty_controls()
	if key != "":
		c[key] = on
	return c


# ---------------------------------------------------------------- пули

func _test_bullet_hit() -> void:
	_reset()
	var friend := _target(Vector3(0, 1000, -150), 0)
	var enemy := _target(Vector3(0, 1000, -300), 1)
	pm.spawn_bullet(Vector3(0, 1000, -2), Vector3(0, 0, -850), 12.0, 20.0, 1, 0, true)
	check(pm.bullet_count() == 1, "пуля не создалась")
	check(pm.tracer_count() == 1, "трассер не посчитан")
	_sim(0.6)
	check(friend.hits.is_empty(), "пуля попала в своего")
	check(enemy.hits.size() == 1, "пуля не попала в цель в 300 м (попаданий: %d)" % enemy.hits.size())
	if enemy.hits.size() == 1:
		check(is_equal_approx(float(enemy.hits[0].damage), 12.0), "неверный урон пули")
		check(int(enemy.hits[0].attacker) == 1, "неверный владелец пули")
		var lp: Vector3 = enemy.hits[0].local
		check(lp.z > 0.0 and lp.length() < 5.0, "точка попадания не на передней стороне: %s" % str(lp))
	check(pm.bullet_count() == 0, "пуля не удалилась после попадания")
	check(pm.tracer_count() == 0, "счётчик трассеров не уменьшился")
	# пуля живёт 2.5 с
	pm.spawn_bullet(Vector3(0, 3000, 0), Vector3(800, 0, 0), 5.0, 7.62, 1, 0, false)
	_sim(2.4)
	check(pm.bullet_count() == 1, "пуля исчезла раньше 2.5 с")
	_sim(0.2)
	check(pm.bullet_count() == 0, "пуля живёт дольше 2.5 с")


func _test_bullet_moving_target() -> void:
	_reset()
	# встречное сближение 1150 м/с: без учёта движения цели пуля проскочила бы сферу
	var enemy := _target(Vector3(0, 1000, -400), 1)
	enemy.vel = Vector3(0, 0, 300)
	enemy.body_radius = 1.5
	pm.spawn_bullet(Vector3(0, 1000, 0), Vector3(0, 0, -850), 5.0, 12.7, 1, 0, false)
	_sim(0.6, [enemy])
	check(enemy.hits.size() == 1, "не попали во встречную цель на большой скорости сближения")


func _test_guns_fire_and_tracers() -> void:
	_reset()
	var owner := _target(Vector3(0, 1500, 0), 0)
	owner.def = Data.plane("krechet")
	owner.vel = Vector3(0, 0, -150)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	check(ws.ammo.guns == [300, 600], "боезапас пушек: ожидалось [300, 600], есть %s" % str(ws.ammo.guns))
	check(is_equal_approx(ws.gun_convergence(), 400.0), "сведение не 400 м")
	check(is_equal_approx(ws.gun_speed(), 800.0), "скорость основной группы должна быть от 20 мм")
	var c := _ctrl("guns")
	for k in 60:
		ws.update(DT, owner, c)
		owner.move(DT)
	var f0: int = 300 - int(ws.ammo.guns[0])
	var f1: int = 600 - int(ws.ammo.guns[1])
	check(f0 >= 22 and f0 <= 24, "20 мм за 1 с: %d выстрелов, ожидалось ~23" % f0)
	check(f1 >= 25 and f1 <= 27, "12,7 мм за 1 с: %d выстрелов, ожидалось ~26" % f1)
	check(pm.bullet_count() == f0 + f1, "в менеджере %d пуль, выпущено %d" % [pm.bullet_count(), f0 + f1])
	var tracers := f0 / 3 + f1 / 3
	check(pm.tracer_count() == tracers, "трассеров %d, ожидалось %d (каждый 3-й)" % [pm.tracer_count(), tracers])
	check(rec.count("tracer") == tracers / 4, "событий tracer %d, ожидалось %d" % [rec.count("tracer"), tracers / 4])
	if rec.count("tracer") > 0:
		var ev: Dictionary = rec.last("tracer")
		check(ev.has("from") and ev.has("to") and (ev.from as Array).size() == 3, "в событии tracer нет from/to")
	# отпустили спуск — стрельба прекратилась
	var before := pm.bullet_count()
	ws.update(DT, owner, _ctrl())
	check(pm.bullet_count() == before, "стреляет без нажатия")


func _test_guns_hit_target() -> void:
	_reset()
	var owner := _target(Vector3(0, 1500, 0), 0)
	owner.def = Data.plane("krechet")
	owner.vel = Vector3(0, 0, -150)
	var enemy := _target(Vector3(0, 1500, -400), 1)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	var c := _ctrl("guns")
	for k in 30:
		ws.update(DT, owner, c)
		owner.move(DT)
		pm.step(DT)
	_sim(1.0, [owner])
	var fired: int = 300 - int(ws.ammo.guns[0]) + 600 - int(ws.ammo.guns[1])
	check(fired > 20, "мало выстрелов: %d" % fired)
	check(enemy.hits.size() >= int(fired * 0.8), "попаданий %d из %d по цели в точке сведения" % [enemy.hits.size(), fired])
	var big := 0
	for h in enemy.hits:
		if is_equal_approx(float(h.damage), 14.0):
			big += 1
	check(big > 0, "нет попаданий 20 мм")
	check(owner.hits.is_empty(), "стрелок попал в себя")


func _test_ammo_runs_out() -> void:
	_reset()
	var owner := _target(Vector3(0, 1500, 0), 0)
	owner.def = Data.plane("krechet")
	owner.vel = Vector3(0, 0, -150)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	ws.ammo.guns = [5, 0]
	check(not ws.is_empty(), "is_empty при остатке патронов")
	var c := _ctrl("guns")
	for k in 60:
		ws.update(DT, owner, c)
	check(int(ws.ammo.guns[0]) == 0 and int(ws.ammo.guns[1]) == 0, "патроны ушли в минус или не кончились: %s" % str(ws.ammo.guns))
	check(pm.bullet_count() == 5, "выпущено %d пуль при остатке 5" % pm.bullet_count())
	check(ws.is_empty(), "is_empty() = false без патронов")
	check(not ws.has_ordnance(), "has_ordnance у Кречета")
	var s: Array = ws.summary()
	check(s.size() == 2 and int(s[0].cur) == 0 and int(s[0].max) == 300, "summary после расхода: %s" % str(s))


func _test_muzzle_markers() -> void:
	_reset()
	var owner := _target(Vector3(0, 1500, 0), 0)
	owner.def = Data.plane("shtorm")
	owner.vel = Vector3.ZERO
	var model := Node3D.new()
	owner.add_child(model)
	for i in 2:
		var m := Marker3D.new()
		m.name = "Muzzle%d" % i
		m.position = Vector3(-3.0 if i == 0 else 3.0, -0.5, -6.0)
		model.add_child(m)
	owner.model = model
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	for k in 6:
		ws.update(DT, owner, _ctrl("guns"))
	var pts: PackedVector3Array = pm.bullet_positions()
	check(pts.size() > 0, "нет пуль при стрельбе с маркеров")
	var left := false
	var right := false
	for p in pts:
		if absf(p.x + 3.0) < 0.6 and absf(p.y - 1499.5) < 0.6:
			left = true
		if absf(p.x - 3.0) < 0.6 and absf(p.y - 1499.5) < 0.6:
			right = true
	check(left and right, "пули вылетают не из маркеров Muzzle: %s" % str(pts))


func _test_armored_and_ground() -> void:
	_reset()
	var tank := _unit(Vector3(0, 2, -100), 1, 4.0, true)
	var truck := _unit(Vector3(30, 2, -100), 1, 4.0, false)
	pm.spawn_bullet(Vector3(0, 3, 0), Vector3(0, 0, -800), 10.0, 7.62, 1, 0, false)
	pm.spawn_bullet(Vector3(0, 3, 0), Vector3(0, 0, -800), 10.0, 20.0, 1, 0, false)
	pm.spawn_bullet(Vector3(30, 3, 0), Vector3(0, 0, -800), 10.0, 7.62, 1, 0, false)
	_sim(0.3)
	check(tank.damage_log.size() == 2, "по танку попаданий %d из 2" % tank.damage_log.size())
	check(is_equal_approx(tank.total_damage(), 11.0), "броня: ожидалось 1 + 10 урона, есть %.2f" % tank.total_damage())
	check(is_equal_approx(truck.total_damage(), 10.0), "по грузовику урон %.2f вместо 10" % truck.total_damage())
	for d in tank.damage_log:
		check(not bool(d.explosive), "пуля помечена как фугасная")
	# пуля в землю и в воду
	pm.spawn_bullet(Vector3(0, 100, 0), Vector3(0, -800, 0), 5.0, 12.7, 1, 0, true)
	world.water_x = 500.0
	pm.spawn_bullet(Vector3(1000, 100, 0), Vector3(0, -800, 0), 5.0, 12.7, 1, 0, true)
	_sim(0.3)
	check(pm.bullet_count() == 0, "пули не остановились о землю/воду")
	# свои наземные цели пули не трогают
	var own := _unit(Vector3(0, 2, -60), 0, 4.0)
	pm.spawn_bullet(Vector3(0, 3, 0), Vector3(0, 0, -800), 10.0, 20.0, 1, 0, false)
	_sim(0.2)
	check(own.damage_log.is_empty(), "пуля задела свою наземную цель")


# ---------------------------------------------------------------- бомбы и ракеты

func _test_bombs() -> void:
	_reset()
	var owner := _target(Vector3(0, 300, 0), 0)
	owner.def = Data.plane("shmel")
	owner.vel = Vector3.ZERO
	var target := _unit(Vector3(0, 0, 0), 1, 5.0)
	var far := _unit(Vector3(250, 0, 0), 1, 5.0)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	check(ws.has_ordnance(), "has_ordnance = false у Шмеля")
	var c := _ctrl("bomb")
	for k in 60:
		ws.update(DT, owner, c)
	check(int(ws.ammo.bombs) == 1, "за 1 с должно уйти 3 бомбы (раз в 0.35 с), осталось %d" % int(ws.ammo.bombs))
	check(pm.shell_count(ProjectileManager.BOMB) == 3, "бомб в воздухе: %d" % pm.shell_count(ProjectileManager.BOMB))
	_sim(2.0)
	check(pm.shell_count(ProjectileManager.BOMB) == 3, "бомбы взорвались раньше времени")
	_sim_until_no_shells(15.0)
	check(pm.shell_count() == 0, "бомбы не долетели до земли")
	check(target.damage_log.size() >= 3, "цель под самолётом получила %d взрывов из 3" % target.damage_log.size())
	var expl := true
	for d in target.damage_log:
		expl = expl and bool(d.explosive)
	check(expl, "бомба нанесла не фугасный урон")
	check(target.total_damage() > 160.0, "мало урона от бомб: %.1f" % target.total_damage())
	check(far.damage_log.is_empty(), "цель в 250 м получила урон от бомб")
	check(rec.count("explosion") >= 3, "взрывы бомб не записаны в повтор")
	var e: Dictionary = rec.last("explosion")
	if e.has("pos"):
		check(float(e.pos[1]) > -0.5 and float(e.pos[1]) < 5.5, "бомба взорвалась не на земле/цели: %s" % str(e.pos))
		check(float(e.size) > 0.8, "размер взрыва 100 кг бомбы %.2f" % float(e.size))
	# с горизонтальной скоростью бомба летит вперёд
	_reset()
	owner = _target(Vector3(0, 300, 0), 0)
	owner.def = Data.plane("shmel")
	owner.vel = Vector3(0, 0, -100)
	ws = WeaponSystem.new()
	ws.setup(owner.def)
	ws.update(DT, owner, c)
	ws.update(DT, owner, _ctrl())
	_sim_until_no_shells(15.0)
	e = rec.last("explosion")
	check(e.has("pos") and float(e.pos[2]) < -450.0 and float(e.pos[2]) > -850.0,
		"бомба со скоростью 100 м/с с 300 м упала не там: %s" % str(e.get("pos")))


func _test_rockets() -> void:
	_reset()
	var owner := _target(Vector3(0, 200, 0), 0)
	owner.def = Data.plane("shmel")
	var dir := Vector3(0, -200, -400).normalized()
	owner.transform.basis = Basis.looking_at(dir)
	owner.vel = dir * 120.0
	var tank := _unit(Vector3(0, 0, -400), 1, 5.0, true)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	var c := _ctrl("rocket")
	for k in 18:
		ws.update(DT, owner, c)
	check(int(ws.ammo.rockets) == 4, "за 0.3 с должно уйти 2 пары ракет, осталось %d" % int(ws.ammo.rockets))
	check(pm.shell_count(ProjectileManager.ROCKET) == 4, "ракет в воздухе: %d" % pm.shell_count(ProjectileManager.ROCKET))
	_sim_until_no_shells(6.0)
	check(tank.damage_log.size() >= 3, "по танку попало %d ракет из 4" % tank.damage_log.size())
	for d in tank.damage_log:
		check(bool(d.explosive), "ракета нанесла не фугасный урон")
	# ракета без цели взрывается через 5 с
	_reset()
	pm.spawn_rocket(Vector3(0, 3000, 0), Vector3(0, 0, -500), 60.0, 10.0, 1, 0)
	_sim(4.9)
	check(pm.shell_count(ProjectileManager.ROCKET) == 1, "ракета исчезла раньше 5 с")
	_sim(0.2)
	check(pm.shell_count(ProjectileManager.ROCKET) == 0, "ракета живёт дольше 5 с")
	# прямое попадание в самолёт
	_reset()
	var enemy := _target(Vector3(0, 1000, -300), 1)
	var near := _target(Vector3(8, 1000, -300), 1)
	pm.spawn_rocket(Vector3(0, 1000, 0), Vector3(0, 0, -600), 60.0, 10.0, 1, 0)
	_sim(1.0)
	check(enemy.hits.size() == 1, "ракета не попала в самолёт")
	check(enemy.splashes.is_empty(), "по самолёту с прямым попаданием ещё и осколки")
	check(near.splashes.size() == 1, "соседний самолёт не задело взрывом ракеты")


# ---------------------------------------------------------------- ракеты В-В

func _missile_owner(pos: Vector3) -> Node3D:
	var owner := _target(pos, 0)
	owner.def = Data.plane("mirage")
	owner.vel = Vector3(0, 0, -250)
	owner.is_player = true
	return owner


func _test_lock() -> void:
	_reset()
	var owner := _missile_owner(Vector3(0, 1000, 0))
	var enemy := _target(Vector3(0, 1000, -1500), 1)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	var idle := _ctrl()
	for k in 36:
		ws.update(DT, owner, idle)
	check(ws.lock_target == enemy, "нет захвата цели в конусе и дальности")
	check(ws.lock_progress > 0.4 and ws.lock_progress < 0.6, "захват за 0.6 с: %.2f, ожидалось ~0.5" % ws.lock_progress)
	# пуск до полного захвата ничего не делает
	ws.update(DT, owner, _ctrl("missile"))
	check(int(ws.ammo.missiles) == 2, "ракета ушла без захвата")
	ws.update(DT, owner, idle)
	for k in 40:
		ws.update(DT, owner, idle)
	check(is_equal_approx(ws.lock_progress, 1.0), "захват не завершился за 1.2 с")
	# вне конуса — сброс
	enemy.position = Vector3(800, 1000, -1500)
	ws.update(DT, owner, idle)
	check(ws.lock_target == null and ws.lock_progress == 0.0, "захват не сбросился вне конуса")
	# дальше дальности
	enemy.position = Vector3(0, 1000, -3000)
	for k in 10:
		ws.update(DT, owner, idle)
	check(ws.lock_target == null, "захват дальше дальности ракеты")
	# малозаметность уменьшает дальность
	enemy.def = {"stealth": 0.6}
	enemy.position = Vector3(0, 1000, -2000)
	ws.update(DT, owner, idle)
	check(ws.lock_target == null, "захват малозаметной цели на 2000 м (предел 1500)")
	enemy.position = Vector3(0, 1000, -1400)
	ws.update(DT, owner, idle)
	check(ws.lock_target == enemy, "нет захвата малозаметной цели на 1400 м")
	# в облаке не видно
	enemy.in_cloud = true
	ws.update(DT, owner, idle)
	check(ws.lock_target == null, "захват цели в облаке")
	enemy.in_cloud = false
	# свои не захватываются, из двух врагов — ближний
	var friend := _target(Vector3(0, 1000, -600), 0)
	var near := _target(Vector3(50, 1000, -1000), 1)
	ws.update(DT, owner, idle)
	check(ws.lock_target == near, "захвачен не ближайший враг")
	check(ws.lock_target != friend, "захвачен свой")


func _test_missile_hits() -> void:
	_reset()
	var owner := _missile_owner(Vector3(0, 1000, 0))
	var enemy := _target(Vector3(0, 1000, -1500), 1)
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	for k in 80:
		ws.update(DT, owner, _ctrl())
	check(ws.lock_progress >= 1.0, "нет захвата перед пуском")
	var fire := _ctrl("missile")
	ws.update(DT, owner, fire)
	check(int(ws.ammo.missiles) == 1, "ракета не ушла при захвате")
	check(pm.shell_count(ProjectileManager.MISSILE) == 1, "в менеджере нет ракеты")
	check(pm.incoming_missiles(enemy) == 1, "incoming_missiles не видит ракету")
	check(pm.incoming_missiles(owner) == 0, "incoming_missiles считает чужую цель")
	for k in 10:
		ws.update(DT, owner, fire)
	check(int(ws.ammo.missiles) == 1, "удержание кнопки пускает ещё ракеты")
	# цель уходит вбок со скоростью 200 м/с
	enemy.vel = Vector3(200, 0, 0)
	var t := _sim_until_no_shells(12.0, [enemy])
	check(pm.shell_count(ProjectileManager.MISSILE) == 0, "ракета не взорвалась за 12 с")
	check(enemy.splashes.size() >= 1, "ракета не поразила манёвренную цель (время %.1f с, x цели %.0f)" % [t, enemy.position.x])
	if enemy.splashes.size() >= 1:
		var sp: Dictionary = enemy.splashes[0]
		check(int(sp.attacker) == owner.uid, "в осколках не тот владелец")
		check((sp.pos as Vector3).distance_to(enemy.position) <= 15.0 * 0.6 + 8.0, "взрыв далеко от цели: %.1f м" % (sp.pos as Vector3).distance_to(enemy.position))
	check(pm.incoming_missiles(enemy) == 0, "incoming_missiles после взрыва не 0")
	# ракета без цели самоликвидируется через 12 с
	_reset()
	pm.spawn_missile(Vector3(0, 3000, 0), Vector3(0, 0, -300), null, Data.plane("mirage").weapons.missiles, 1, 0)
	_sim(11.8)
	check(pm.shell_count(ProjectileManager.MISSILE) == 1, "ракета исчезла раньше 12 с")
	_sim(0.4)
	check(pm.shell_count(ProjectileManager.MISSILE) == 0, "ракета не самоликвидировалась")
	# головка теряет цель вне 45°
	_reset()
	var side := _target(Vector3(0, 3000, -800), 1)
	pm.spawn_missile(Vector3(0, 3000, 0), Vector3(0, 0, -400), side, Data.plane("mirage").weapons.missiles, 1, 0)
	side.position = Vector3(900, 3000, -300)
	pm.step(DT)
	check(pm.incoming_missiles(side) == 0, "головка не потеряла цель вне 45°")


func _missile_with_flare(chance: float, flare_pos: Vector3) -> Node3D:
	_reset()
	pm.flare_chance = chance
	var enemy := _target(Vector3(0, 1000, -1200), 1)
	var spec: Dictionary = Data.plane("fantom").weapons.missiles
	pm.spawn_missile(Vector3(0, 1000, 0), Vector3(0, 0, -500), enemy, spec, 5, 0)
	pm.spawn_flare(flare_pos, Vector3.ZERO, 1)
	pm.spawn_flare(flare_pos + Vector3(2, 0, 0), Vector3.ZERO, 1)
	return enemy


func _test_flares_decoy() -> void:
	var enemy := _missile_with_flare(1.0, Vector3(0, 1000, -1100))
	pm.step(DT)
	check(pm.incoming_missiles(enemy) == 0, "ловушка с шансом 100%% не увела ракету")
	_sim_until_no_shells(8.0)
	check(enemy.splashes.is_empty(), "уведённая ловушкой ракета всё равно поразила цель")
	enemy = _missile_with_flare(0.0, Vector3(0, 1000, -1100))
	_sim(0.2)
	check(pm.incoming_missiles(enemy) == 1, "ракета потеряла цель при шансе 0")
	_sim_until_no_shells(8.0)
	check(enemy.splashes.size() >= 1, "ракета не поразила цель при шансе ловушки 0")
	# ловушка вне конуса 25° не мешает
	enemy = _missile_with_flare(1.0, Vector3(300, 1000, -300))
	pm.step(DT)
	check(pm.incoming_missiles(enemy) == 1, "ловушка вне конуса увела ракету")
	# ловушка дальше цели не мешает
	enemy = _missile_with_flare(1.0, Vector3(0, 1000, -1400))
	pm.step(DT)
	check(pm.incoming_missiles(enemy) == 1, "ловушка за целью увела ракету")
	# статистика: шанс 60 %, каждая ловушка проверяется один раз
	pm.rng.seed = 12345
	var decoyed := 0
	var trials := 60
	for k in trials:
		_reset()
		pm.flare_chance = 0.6
		var e := _target(Vector3(0, 1000, -1200), 1)
		pm.spawn_missile(Vector3(0, 1000, 0), Vector3(0, 0, -500), e, Data.plane("fantom").weapons.missiles, 5, 0)
		pm.spawn_flare(Vector3(0, 1000, -1000), Vector3.ZERO, 1)
		for s in 5:
			pm.step(DT)
		if pm.incoming_missiles(e) == 0:
			decoyed += 1
	var rate := float(decoyed) / trials
	check(rate > 0.4 and rate < 0.8, "доля уведённых ракет %.2f, ожидалось ~0.6" % rate)


func _test_flares_drop() -> void:
	_reset()
	var owner := _missile_owner(Vector3(0, 1000, 0))
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	check(int(ws.ammo.flares) == 16, "у Миража должно быть 16 ловушек")
	var c := _ctrl("flares")
	for k in 20:
		ws.update(DT, owner, c)
	check(int(ws.ammo.flares) == 14, "одно нажатие должно сбросить 2 ловушки, осталось %d" % int(ws.ammo.flares))
	check(pm.shell_count(ProjectileManager.FLARE) == 2, "ловушек в воздухе: %d" % pm.shell_count(ProjectileManager.FLARE))
	ws.update(DT, owner, _ctrl())
	ws.update(DT, owner, c)
	check(int(ws.ammo.flares) == 12, "повторное нажатие не сбросило ловушки")
	var behind := true
	for s in pm._shells:
		if s.kind == ProjectileManager.FLARE:
			behind = behind and s.pos.z > 0.0
	check(behind, "ловушки появились не позади самолёта")
	_sim(3.2)
	check(pm.shell_count(ProjectileManager.FLARE) == 0, "ловушки горят дольше 3 с")
	ws.ammo.flares = 1
	ws.update(DT, owner, _ctrl())
	ws.update(DT, owner, c)
	check(int(ws.ammo.flares) == 0 and pm.shell_count(ProjectileManager.FLARE) == 1, "последняя ловушка: остаток не учтён")


func _test_flak() -> void:
	_reset()
	var enemy := _target(Vector3(0, 995, -500), 0)
	var friend := _target(Vector3(0, 995, -510), 1)
	var far := _target(Vector3(0, 1000, -700), 0)
	pm.spawn_flak(Vector3(0, 1000, 0), Vector3(0, 0, -500), 1.0, 40.0, 20.0, 77, 1)
	_sim(0.9)
	check(enemy.splashes.is_empty(), "зенитный снаряд разорвался раньше времени")
	_sim(0.2)
	check(enemy.splashes.size() == 1, "зенитный разрыв не задел цель рядом")
	if enemy.splashes.size() == 1:
		check(int(enemy.splashes[0].attacker) == 77 and is_equal_approx(float(enemy.splashes[0].radius), 20.0), "неверные параметры разрыва")
	check(friend.splashes.is_empty(), "зенитный разрыв задел своего")
	check(far.splashes.is_empty(), "зенитный разрыв задел цель в 200 м")
	check(pm.shell_count(ProjectileManager.FLAK) == 0, "снаряд не удалён после разрыва")


func _test_rearm_and_summary() -> void:
	var ws := WeaponSystem.new()
	ws.setup(Data.plane("mirage"))
	var labels: Array = []
	for s in ws.summary():
		labels.append(s.label)
	check(labels == ["30 мм", "Ракеты", "Ракеты В-В", "Ловушки"], "summary Миража: %s" % str(labels))
	var ws2 := WeaponSystem.new()
	ws2.setup(Data.plane("groza"))
	labels = []
	for s in ws2.summary():
		labels.append(s.label)
	check(labels == ["30 мм", "Ракеты", "Бомбы", "Ракеты В-В", "Ловушки"], "summary Грозы: %s" % str(labels))
	ws.ammo = {"guns": [0], "rockets": 0, "bombs": 0, "missiles": 0, "flares": 0}
	check(ws.is_empty(), "is_empty() при пустом боезапасе")
	var done := false
	for k in 7:
		done = ws.rearm_step(1.0)
	check(not done, "перезарядка закончилась за 7 с")
	var g := int(ws.ammo.guns[0])
	check(g >= 105 and g <= 125, "за 7 с из 15 пополнено %d патронов из 250" % g)
	check(int(ws.ammo.rockets) >= 4 and int(ws.ammo.rockets) <= 6, "за 7 с пополнено %d ракет из 12" % int(ws.ammo.rockets))
	for k in 7:
		done = ws.rearm_step(1.0)
	check(not done, "перезарядка закончилась за 14 с")
	done = ws.rearm_step(1.05)
	check(done, "перезарядка не закончилась за 15 с")
	check(ws.ammo.guns == ws.max_ammo.guns and int(ws.ammo.missiles) == 2 and int(ws.ammo.flares) == 16, "боезапас после перезарядки: %s" % str(ws.ammo))
	check(ws.rearm_step(0.1), "полный боезапас: rearm_step должен вернуть true")
	ws.ammo.missiles = 0
	ws.rearm_full()
	check(int(ws.ammo.missiles) == 2, "rearm_full не пополнил ракеты")
	# частичная перезарядка короче
	ws.ammo.guns = [200]
	var t := 0.0
	while not ws.rearm_step(0.1) and t < 20.0:
		t += 0.1
	check(t < 4.0, "50 патронов из 250 пополнялись %.1f с" % t)


func _test_no_battle() -> void:
	_reset()
	var owner := _missile_owner(Vector3(0, 1000, 0))
	var ws := WeaponSystem.new()
	ws.setup(owner.def)
	Game.battle = null
	var c := _ctrl("guns")
	c.missile = true
	c.flares = true
	for k in 5:
		ws.update(DT, owner, c)
	Game.battle = battle
	check(int(ws.ammo.guns[0]) == 250, "без боя оружие тратит патроны")
	owner.alive = false
	ws.update(DT, owner, _ctrl("guns"))
	check(pm.bullet_count() == 0, "сбитый самолёт стреляет")


func _test_performance() -> void:
	_reset()
	var r := RandomNumberGenerator.new()
	r.seed = 4
	for k in 16:
		var a := _target(Vector3(r.randf_range(-2000, 2000), r.randf_range(600, 2500), r.randf_range(-2000, 2000)), k % 2)
		a.vel = Vector3(r.randf_range(-200, 200), 0, r.randf_range(-200, 200))
	for k in 40:
		_unit(Vector3(r.randf_range(-4000, 4000), 0, r.randf_range(-4000, 4000)), k % 2, 6.0)
	for k in 2500:
		var from := Vector3(r.randf_range(-3000, 3000), r.randf_range(50, 2500), r.randf_range(-3000, 3000))
		var dir := Vector3(r.randf_range(-1, 1), r.randf_range(-0.6, 0.6), r.randf_range(-1, 1)).normalized()
		pm.spawn_bullet(from, dir * 850.0, 5.0, 12.7, 1000 + k % 16, k % 2, k % 3 == 0)
	check(pm.bullet_count() == 2500, "не все 2500 пуль созданы")
	var t0 := Time.get_ticks_usec()
	for k in 10:
		pm.step(DT)
	var ms := float(Time.get_ticks_usec() - t0) / 10000.0
	print("    weapons: шаг 2500 пуль = %.2f мс" % ms)
	check(ms < 25.0, "шаг 2500 пуль слишком медленный: %.1f мс" % ms)
	t0 = Time.get_ticks_usec()
	pm._render_tracers()
	var ms_r := float(Time.get_ticks_usec() - t0) / 1000.0
	print("    weapons: трассеры = %.2f мс" % ms_r)
	check(ms_r < 15.0, "отрисовка трассеров слишком медленная: %.1f мс" % ms_r)
	pm.clear()
	check(pm.bullet_count() == 0 and pm.tracer_count() == 0 and pm.shell_count() == 0, "clear() не очистил всё")


# ---------------------------------------------------------------- эффекты

func _test_effects() -> void:
	_reset()
	fx.clear()
	await tree.process_frame
	var base := fx.get_child_count()
	fx.explosion(Vector3(0, 500, 0), 1.0)
	check(rec.count("explosion") == 1, "взрыв не записан в повтор")
	var e: Dictionary = rec.last("explosion")
	check(e.get("pos") is Array and (e.pos as Array).size() == 3 and is_equal_approx(float(e.size), 1.0), "формат события explosion: %s" % str(e))
	fx.explosion(Vector3(0, 0, 0), 1.6)
	fx.hit_spark(Vector3(10, 500, 0))
	fx.splash(Vector3(0, 0, 50), 1.0)
	fx.splash(Vector3(0, 0, 60), 0.1)
	fx.smoke_puff(Vector3(0, 800, 0), 1.5)
	fx.debris(Vector3(0, 500, 0), Vector3(50, 0, 0), 12)
	fx.tracer_line(Vector3(0, 500, 0), Vector3(0, 500, -300), Color(1, 0.8, 0.3))
	check(fx.active_systems() > 0 and fx.active_systems() <= Effects.MAX_SYSTEMS, "счётчик систем частиц: %d" % fx.active_systems())
	var plane := Node3D.new()
	battle.add_child(plane)
	plane.position = Vector3(0, 1000, 0)
	var fire := fx.attach_fire(plane, Vector3(1, 0, 2))
	var smoke := fx.attach_smoke(plane, Vector3(0, 0, 3), true)
	var trail := fx.attach_trail(plane, Vector3(5, 0, 0))
	check(fire != null and fire.get_parent() == plane and fire.position == Vector3(1, 0, 2), "attach_fire вернул не дочерний узел")
	check(smoke != null and smoke.get_parent() == plane, "attach_smoke вернул не дочерний узел")
	check(trail != null and trail.get_parent() == plane, "attach_trail вернул не дочерний узел")
	for k in 30:
		plane.position += Vector3(0, 0, -3)
		fx.step(DT)
	# эффект следует за самолётом
	var holder_ok := false
	for a in fx._attached:
		if a.anchor == fire:
			holder_ok = a.holder.position.distance_to(fire.global_position) < 3.0
	check(holder_ok, "огонь не следует за самолётом")
	var with_attached := fx.active_systems()
	# лимит систем частиц
	for k in 40:
		fx.explosion(Vector3(k * 30.0, 600, 0), 0.5)
	check(fx.active_systems() <= Effects.MAX_SYSTEMS + 1, "превышен лимит систем частиц: %d" % fx.active_systems())
	check(fx._attached.size() == 2, "лимит вытеснил прикреплённые эффекты")
	# самолёт удалён — огонь и дым догорают и исчезают
	plane.queue_free()
	await tree.process_frame
	fx.step(DT)
	check(fx._attached.is_empty(), "прикреплённые эффекты не отпущены после удаления самолёта")
	fx.step(10.0)
	fx.step(DT)
	await tree.process_frame
	await tree.process_frame
	check(fx.get_child_count() == base, "эффекты не удалились сами: было %d узлов, стало %d" % [base, fx.get_child_count()])
	check(fx.active_systems() == 0, "после удаления счётчик систем %d" % fx.active_systems())
	check(fx._ribbons.is_empty(), "инверсионный след не удалён")
	check(with_attached > 0, "прикреплённые эффекты не учтены")
	# повтор/киллкам со своим Effects не пишут взрывы в бой
	var other := Effects.new()
	battle.add_child(other)
	rec.events.clear()
	other.explosion(Vector3.ZERO, 1.0)
	check(rec.count("explosion") == 0, "чужой Effects записал взрыв в повтор боя")
	other.queue_free()
	# снаряды со следом: след отпускается после взрыва
	pm.spawn_rocket(Vector3(0, 100, 0), Vector3(0, -300, 0), 60.0, 10.0, 1, 0)
	fx.step(DT)
	check(fx._attached.size() == 1, "у ракеты нет дымного следа")
	_sim(1.0)
	await tree.process_frame
	fx.step(DT)
	check(fx._attached.is_empty(), "след ракеты не отпущен после взрыва")
	fx.clear()
	await tree.process_frame
