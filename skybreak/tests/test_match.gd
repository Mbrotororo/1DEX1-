extends RefCounted
## Тесты MATCH: сборка боя, учёт сбитых и наземных целей, зоны, конец боя и награды,
## подбор ботов, правила вылетов, выход в ангар, обучение и тестовый полёт.
## Другие модули могут быть заглушками, поэтому гибель самолётов имитируется сигналами.

const Fake = preload("res://tests/harness_match_fake.gd")
const BattleScene = preload("res://scenes/battle.tscn")

var errors: Array = []
var _kills: Array = []
var _messages: Array = []

func run(tree: SceneTree) -> Array:
	var saved_config: Dictionary = Game.match_config.duplicate(true)
	var saved_result: Dictionary = Game.last_result
	var saved_replay: Dictionary = Game.last_replay
	await tree.process_frame   # раннер вызывает run() из _ready, корень ещё занят
	await _test_build(tree)
	await _test_build_realistic_8(tree)
	await _test_kills(tree)
	await _test_zones(tree)
	await _test_duty(tree)
	await _test_bot_landing(tree)
	await _test_end(tree)
	_test_matchmaker()
	await _test_spawn_rules(tree)
	await _test_quit(tree)
	await _test_training(tree)
	await _test_test_flight(tree)
	Game.match_config = saved_config
	Game.last_result = saved_result
	Game.last_replay = saved_replay
	tree.paused = false
	return errors

# ---------------------------------------------------------------- помощники

func _check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)

func _make(tree: SceneTree, cfg: Dictionary):
	var c: Dictionary = Game.default_config()
	c.merge({"seed": 777, "lineup": ["strizh", "shmel"], "map_id": "canyon", "time_of_day": "day", "weather": "clear"}, true)
	c.merge(cfg, true)
	Game.match_config = c
	var mm = BattleScene.instantiate()
	mm.leave_scene = false
	mm.crash_view_seconds = 0.0
	_kills.clear()
	_messages.clear()
	mm.kill_event.connect(func(t: String, _a: int, _b: int): _kills.append(t))
	mm.message.connect(func(t: String, _s: float): _messages.append(t))
	tree.root.add_child(mm)
	await tree.process_frame
	await tree.physics_frame
	return mm

func _free(tree: SceneTree, mm) -> void:
	if mm != null and is_instance_valid(mm):
		mm.queue_free()
	await tree.process_frame
	await tree.process_frame

func _team(mm, team: int, alive_only := true) -> Array:
	var out: Array = []
	for ac in mm.aircraft:
		if is_instance_valid(ac) and int(ac.team) == team and (not alive_only or bool(ac.alive)) and ac != mm.player:
			out.append(ac)
	return out

## Имитация гибели: настоящий Aircraft ставит alive = false и шлёт сигнал.
func _kill(ac, killer_uid: int, reason := "pilot") -> void:
	ac.alive = false
	ac.destroyed.emit(ac, killer_uid, reason)

func _wait_state_not(tree: SceneTree, mm, s: String, seconds: float) -> void:
	var t0 := Time.get_ticks_msec()
	while mm.state == s and Time.get_ticks_msec() - t0 < int(seconds * 1000.0):
		await tree.process_frame

func _fake_unit(kind: String, team: int, uid: int, tv: int, base_id := -1) -> GroundUnit:
	var u := GroundUnit.new()
	u.kind = kind
	u.team = team
	u.uid = uid
	u.ticket_value = tv
	u.base_id = base_id
	u.alive = false
	return u

# ---------------------------------------------------------------- 1. сборка боя

func _test_build(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade", "size": 4, "autopilot": true})
	_check(Game.battle == mm, "build: Game.battle не указывает на бой")
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < 3000:
		await tree.physics_frame
	_check(mm.aircraft.size() == 8, "build: самолётов %d, ждали 8" % mm.aircraft.size())
	var per_team := [0, 0]
	for ac in mm.aircraft:
		per_team[int(ac.team)] += 1
	_check(per_team[0] == 4 and per_team[1] == 4, "build: по командам %s" % str(per_team))
	_check(mm.player != null and is_instance_valid(mm.player) and bool(mm.player.is_player), "build: нет самолёта игрока (автопилот)")
	_check(mm.state == "flying", "build: состояние %s, ждали flying" % mm.state)
	for f in ["world", "projectiles", "fx", "recorder", "camera_rig", "hud", "player_pilot"]:
		var n = mm.get(f)
		_check(n != null and is_instance_valid(n) and n.is_inside_tree(), "build: нет узла " + f)
	_check(mm.hud.process_mode == Node.PROCESS_MODE_ALWAYS, "build: HUD должен работать на паузе")
	_check(mm.elapsed > 2.0, "build: время боя не идёт")
	_check(mm.time_left < float(Data.ECONOMY.match_seconds) - 2.0, "build: таймер не идёт")
	_check(is_equal_approx(mm.max_tickets, 700.0), "build: очков команды не 700")
	_check(mm.markers_enabled, "build: в аркаде нужны маркеры")
	_check(mm.zones_state.size() == mm.world.zones.size(), "build: зоны не совпадают с миром")
	var names := {}
	for ac in mm.aircraft:
		_check(not names.has(ac.callsign), "build: повтор позывного " + ac.callsign)
		names[ac.callsign] = true
	var uids := {}
	for ac in mm.aircraft:
		_check(not uids.has(ac.uid) and mm.get_entity(ac.uid) == ac, "build: uid не уникален или не находится")
		uids[ac.uid] = true
	var sb: Array = mm.get_scoreboard()
	_check(sb.size() == 8, "build: в таблице %d строк" % sb.size())
	for i in range(1, sb.size()):
		_check(sb[i - 1].score >= sb[i].score, "build: таблица не отсортирована")
	for row in sb:
		for k in ["uid", "name", "team", "plane", "kills", "ground", "deaths", "score", "is_player"]:
			_check(row.has(k), "build: в строке таблицы нет " + k)
	_check(mm.enemies_of(0).size() == 4 and mm.enemies_of(1).size() == 4, "build: enemies_of")
	for u in mm.ground_targets_of(1):
		_check(int(u.team) == 1 and String(u.kind) != "carrier", "build: ground_targets_of")
	mm.set_paused(true)
	_check(tree.paused and mm.paused, "build: пауза не включилась")
	mm.set_paused(false)
	_check(not tree.paused, "build: пауза не выключилась")
	await _free(tree, mm)
	_check(Game.battle == null, "build: Game.battle не очищен после выхода")

func _test_build_realistic_8(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "realistic", "size": 8})
	_check(mm.aircraft.size() == 15, "realistic 8x8: ботов %d, ждали 15" % mm.aircraft.size())
	_check(not mm.markers_enabled, "realistic: маркеров быть не должно")
	_check(is_equal_approx(mm.max_tickets, float(Data.ECONOMY.tickets[8])), "realistic 8x8: очков команды не %d" % int(Data.ECONOMY.tickets[8]))
	_check(mm.state == "spawn", "realistic: ждали меню вылета")
	_check(mm.request_spawn("strizh"), "realistic: вылет не удался")
	_check(mm.aircraft.size() == 16, "realistic 8x8: с игроком не 16")
	await _free(tree, mm)

# ---------------------------------------------------------------- 2. сбитые и наземные цели

func _test_kills(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade"})
	_check(mm.state == "spawn", "kills: ждали меню вылета")
	_check(mm.request_spawn("strizh"), "kills: вылет не удался")
	var pl = mm.player
	var pname: String = mm.player_stats().name
	_check(pl.callsign == pname, "kills: позывной игрока не совпадает с именем")
	var enemies := _team(mm, 1)
	_check(enemies.size() == 4, "kills: врагов не 4")
	if enemies.size() < 4:
		await _free(tree, mm)
		return
	var e1 = enemies[0]
	var t1 := float(mm.tickets[1])
	var sp: int = mm.spawn_points
	_kill(e1, pl.uid)
	_check(mm.player_stats().kills == 1, "kills: сбитый не засчитан")
	_check(is_equal_approx(float(mm.tickets[1]), t1 - 30.0), "kills: очки команды не уменьшились на 30")
	_check(mm.spawn_points == sp + 150, "kills: очки вылета не +150")
	var expect := "Стриж (%s) сбил %s (%s)" % [pname, Data.plane(e1.def_id).name, e1.callsign]
	_check(_kills.size() == 1 and _kills[0] == expect, "kills: текст «%s», ждали «%s»" % [str(_kills), expect])
	e1.destroyed.emit(e1, pl.uid, "pilot")
	_check(mm.player_stats().kills == 1 and _kills.size() == 1, "kills: повторный сигнал засчитан")

	var e2 = enemies[1]
	_kill(e2, -1, "ground")
	_check(_kills.back() == "%s (%s) разбился" % [Data.plane(e2.def_id).name, e2.callsign], "kills: текст падения: " + str(_kills.back()))

	var e3 = enemies[2]
	var friends := _team(mm, 0)
	var friend = friends[0]
	mm.note_damage(e3.uid, pl.uid)
	_kill(e3, friend.uid, "wing")
	_check(mm.player_stats().assists == 1, "kills: помощь не засчитана")
	_check(mm.spawn_points == sp + 200, "kills: очки вылета за помощь")
	_check(int(mm.record_of(friend.uid).kills) == 1, "kills: сбитый союзника не засчитан")
	_check(_kills.back() == "%s (%s) сбил %s (%s)" % [Data.plane(friend.def_id).name, friend.callsign, Data.plane(e3.def_id).name, e3.callsign], "kills: текст союзника")

	# боты возрождаются через 5 с тем же самолётом
	_check(_team(mm, 1).size() == 1, "kills: живых врагов не 1")
	_check(int(mm.record_of(e1.uid).lives) == int(Data.ECONOMY.bot_lives_arcade) - 1, "kills: жизни бота")
	mm._step(5.1)
	var revived := _team(mm, 1)
	_check(revived.size() == 4, "kills: боты не возродились (%d)" % revived.size())
	var found := false
	for ac in revived:
		if ac.callsign == e1.callsign:
			found = true
			_check(ac.def_id == e1.def_id and ac.uid != e1.uid, "kills: возрождение с другим самолётом или тем же uid")
	_check(found, "kills: бот не вернулся под своим позывным")

	# наземные цели и база
	var tg := float(mm.tickets[1])
	var tank := _fake_unit("tank", 1, 90001, 15)
	mm._on_ground_destroyed(tank, pl.uid)
	_check(mm.player_stats().ground_kills == 1, "ground: цель не засчитана")
	_check(is_equal_approx(float(mm.tickets[1]), tg - 15.0), "ground: очки команды не -15")
	_check(mm.spawn_points == sp + 200 + MatchManager.ground_points(15), "ground: очки вылета")
	_check(_kills.back() == "Стриж (%s) уничтожил танк" % pname, "ground: текст " + str(_kills.back()))
	_check(MatchManager.ground_points(8) == 40 and MatchManager.ground_points(40) == 100, "ground: очки 40-100")
	var b1 := _fake_unit("building", 1, 90002, 25, 5)
	var b2 := _fake_unit("building", 1, 90003, 25, 5)
	b2.alive = true
	mm.ground_units.append(b1)
	mm.ground_units.append(b2)
	mm.world.bases.append({"id": 5, "team": 1, "pos": Vector3.ZERO, "unit_uids": [90002, 90003]})
	var tb := float(mm.tickets[1])
	mm._on_ground_destroyed(b1, pl.uid)
	_check(not "База красных уничтожена" in _messages, "base: база уничтожена раньше времени")
	b2.alive = false
	mm._on_ground_destroyed(b2, pl.uid)
	_check("База красных уничтожена" in _messages, "base: нет сообщения о базе")
	_check(is_equal_approx(float(mm.tickets[1]), tb - 50.0 - 150.0), "base: очки за базу")
	mm.ground_units.erase(b1)
	mm.ground_units.erase(b2)
	tank.free()
	b1.free()
	b2.free()

	# гибель игрока: киллкам, потом меню вылета
	var killer = enemies[3]
	var infos: Array = []
	mm.player_killed.connect(func(i: Dictionary): infos.append(i))
	var t0 := float(mm.tickets[0])
	_kill(pl, killer.uid, "pilot")
	_check(mm.state == "killcam", "death: ждали killcam, а не " + mm.state)
	_check(mm.player == null, "death: player не сброшен")
	_check(infos.size() == 1 and infos[0].killer_name == killer.callsign and infos[0].killer_plane == Data.plane(killer.def_id).name and int(infos[0].killer_uid) == killer.uid, "death: player_killed " + str(infos))
	_check(mm.player_stats().deaths == 1, "death: смерть не засчитана")
	_check(is_equal_approx(float(mm.tickets[0]), t0 - 30.0), "death: очки синих не уменьшились")
	await _wait_state_not(tree, mm, "killcam", 9.0)
	_check(mm.state == "spawn", "death: после киллкама ждали spawn, а не " + mm.state)
	await _free(tree, mm)

# ---------------------------------------------------------------- 3. зоны

func _test_zones(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade"})
	mm.world.zones = [{"id": "A", "pos": Vector3(0, 0, 0), "radius": 450.0, "max_alt": 500.0},
		{"id": "B", "pos": Vector3(2000, 0, 0), "radius": 450.0, "max_alt": 500.0}]
	mm._init_zones()
	_check(mm.zones_state.size() == 2, "zones: не 2 зоны")
	# боты из состава — подальше от зон (у заглушки Aircraft они стоят в начале координат)
	for ac in mm.aircraft:
		var far := Vector3(4000.0 * (1.0 if int(ac.team) == 0 else -1.0), 2500.0, 4000.0)
		ac.global_position = far
		if ac.get("fm") != null:
			ac.fm.pos = far
	var ha: float = maxf(mm.world.height_at(50, 30), 0.0)
	var f0 = Fake.new()
	f0.setup_fake(mm.next_uid(), 0, "strizh", "Сокол-1", Vector3(50, ha + 200.0, 30))
	mm.register_aircraft(f0)
	var high = Fake.new()
	high.setup_fake(mm.next_uid(), 1, "strizh", "Высокий", Vector3(0, maxf(mm.world.height_at(0, 0), 0.0) + 800.0, 0))
	mm.register_aircraft(high)
	var t1 := float(mm.tickets[1])
	for i in 31:
		mm._zone_tick(0.25)
	_check(int(mm.zones_state[0].owner) == -1, "zones: захват раньше 8 с")
	mm._zone_tick(0.25)
	_check(int(mm.zones_state[0].owner) == 0, "zones: за 8 с не захвачена (progress %.3f)" % float(mm.zones_state[0].progress))
	_check("Зона A захвачена" in _messages, "zones: нет сообщения о захвате")
	_check(int(mm.record_of(f0.uid).captures) == 1, "zones: захват не засчитан самолёту")
	_check(int(mm.zones_state[1].owner) == -1, "zones: чужая зона изменилась")
	var tb := float(mm.tickets[1])
	var ta := float(mm.tickets[0])
	for i in 4:
		mm._zone_tick(0.25)
	# перевес в одну зону снимает всю полосу за ECONOMY.zone_drain_seconds: 700 / 600 очка в секунду
	var rate: float = mm.max_tickets / float(Data.ECONOMY.zone_drain_seconds)
	_check(is_equal_approx(mm.zone_drain_rate(), rate), "zones: zone_drain_rate %.3f, ждали %.3f" % [mm.zone_drain_rate(), rate])
	_check(is_equal_approx(float(mm.tickets[1]), tb - rate), "zones: стекание очков красных %.2f -> %.2f" % [tb, float(mm.tickets[1])])
	_check(is_equal_approx(float(mm.ticket_log.zones[1]), tb - float(mm.tickets[1]) + (t1 - tb)), "zones: учёт потерь от зон")
	_check(is_equal_approx(float(mm.tickets[0]), ta), "zones: очки синих не должны стекать")
	_check(float(mm.tickets[1]) < t1, "zones: очки красных не уменьшились")

	# оба в зоне — прогресс стоит
	var f1 = Fake.new()
	f1.setup_fake(mm.next_uid(), 1, "strizh", "Вражина", Vector3(-40, maxf(mm.world.height_at(-40, 0), 0.0) + 150.0, 0))
	mm.register_aircraft(f1)
	var pr := float(mm.zones_state[0].progress)
	for i in 8:
		mm._zone_tick(0.25)
	_check(is_equal_approx(float(mm.zones_state[0].progress), pr) and int(mm.zones_state[0].owner) == 0, "zones: спорная зона сдвинулась")

	# красные отбивают: 8 с до нейтральной, ещё 8 с до своей
	f0.alive = false
	for i in 32:
		mm._zone_tick(0.25)
	_check(int(mm.zones_state[0].owner) == -1, "zones: через 8 с ждали нейтральную, а владелец %d" % int(mm.zones_state[0].owner))
	_check(not "Зона A потеряна" in _messages, "zones: потеряна слишком рано")
	for i in 32:
		mm._zone_tick(0.25)
	_check(int(mm.zones_state[0].owner) == 1, "zones: красные не захватили за 16 с")
	_check("Зона A потеряна" in _messages, "zones: нет сообщения о потере")
	var t0b := float(mm.tickets[0])
	mm._zone_tick(1.0)
	_check(float(mm.tickets[0]) < t0b, "zones: очки синих не стекают")

	# захват игроком: очки вылета и счётчик
	_check(mm.request_spawn("strizh"), "zones: вылет не удался")
	var pb := Vector3(2000, maxf(mm.world.height_at(2000, 0), 0.0) + 200.0, 0)
	mm.player.global_position = pb
	if mm.player.get("fm") != null:
		mm.player.fm.pos = pb
	var sp: int = mm.spawn_points
	for i in 32:
		mm._zone_tick(0.25)
	_check(int(mm.zones_state[1].owner) == 0, "zones: игрок не захватил зону B")
	_check(mm.player_stats().captures == 1, "zones: захват игрока не засчитан")
	_check(mm.spawn_points == sp + 100, "zones: очки вылета за захват")
	await _free(tree, mm)

# ---------------------------------------------------------------- 3а. боты на захвате зон

func _duty_count(mm, team: int) -> Array:
	var n := 0
	var duty := 0
	for ac in mm.aircraft:
		if not is_instance_valid(ac) or not bool(ac.alive) or int(ac.team) != team:
			continue
		var p = ac.get("pilot")
		if p == null or not ("capture_duty" in p):
			continue
		n += 1
		if bool(p.capture_duty):
			duty += 1
			_check(String(p.duty_zone) != "", "duty: бот на захвате без зоны")
	return [duty, n]

func _test_duty(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade", "size": 8})
	mm._duty_t = 0.0
	mm._update_duties(0.1)
	for team in 2:
		var dc: Array = _duty_count(mm, team)
		_check(int(dc[1]) > 0, "duty: нет ботов в команде %d" % team)
		var want := maxi(1, int(round(float(dc[1]) / 3.0)))
		_check(int(dc[0]) == want, "duty: команда %d — на захвате %d из %d, ждали %d" % [team, int(dc[0]), int(dc[1]), want])
	# у синих все зоны и в них нет красных — синим захват не нужен, красным нужен
	for zs in mm.zones_state:
		zs.owner = 0
	for i in mm._zone_inside.size():
		mm._zone_inside[i] = [0, 0]
	mm._duty_t = 0.0
	mm._update_duties(0.1)
	_check(int(_duty_count(mm, 0)[0]) == 0, "duty: синие держат захват при всех своих зонах")
	_check(int(_duty_count(mm, 1)[0]) >= 1, "duty: у красных никого на захвате")
	# в свою зону зашёл враг — снова нужен захват
	mm._zone_inside[0] = [0, 1]
	mm._duty_t = 0.0
	mm._update_duties(0.1)
	_check(int(_duty_count(mm, 0)[0]) >= 1, "duty: свою зону с врагом никто не отбивает")
	# бот на захвате бросает зону только ради близкого врага
	var red = null
	for ac in _team(mm, 1):
		if bool(ac.pilot.capture_duty):
			red = ac
			break
	var blue = _team(mm, 0)[0]
	if red != null and blue != null:
		var p = red.pilot
		var fwd: Vector3 = red.fm.forward()
		for d in [1500.0, 600.0]:
			var bp: Vector3 = red.fm.pos + fwd * d
			blue.fm.pos = bp
			blue.global_position = bp
			blue.in_cloud = false
			red.in_cloud = false
			p._think(red)
			if d > 1000.0:
				_check(p.state == "capture", "duty: бросил зону ради врага в %d м (%s)" % [int(d), p.state])
			else:
				_check(p.state == "engage" and p.target == blue, "duty: не атаковал врага в %d м (%s)" % [int(d), p.state])
	await _free(tree, mm)

# ---------------------------------------------------------------- 3б. посадки ботов

func _test_bot_landing(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade"})
	var reds := _team(mm, 1)
	var red = reds[0]
	var rec: Dictionary = mm.record_of(red.uid)
	var lives := int(rec.lives)
	var t1 := float(mm.tickets[1])
	# посадка по-настоящему: бой считает её по сигналу serviced
	var red2 = reds[1]
	red2.serviced.emit(red2)
	_check(int(mm.record_of(red2.uid).landings) == 1 and int(mm.bot_log.landings[1]) == 1, "landing: посадка бота не засчитана")
	# проход над полосой засчитывается посадкой: самолёт убран без потери жизни и очков, потом новый
	_check(mm.bot_fake_landing(red), "landing: проход над полосой не принят")
	_check(not red in mm.aircraft and not bool(rec.alive), "landing: самолёт не убран")
	_check(int(rec.lives) == lives and is_equal_approx(float(mm.tickets[1]), t1), "landing: потеряна жизнь или очки")
	_check(int(rec.deaths) == 0 and _kills.is_empty(), "landing: посадка засчитана как гибель")
	_check(int(mm.bot_log.fake_landings[1]) == 1 and int(rec.landings) == 1, "landing: счётчик посадок")
	mm._step(MatchManager.BOT_SERVICE_DELAY + 0.1)
	var back := false
	for ac in _team(mm, 1):
		if ac.callsign == red.callsign and ac.uid != red.uid:
			back = true
	_check(back, "landing: бот не вернулся после обслуживания")
	# самолёт игрока так не убирается
	_check(mm.request_spawn("strizh"), "landing: вылет игрока")
	_check(not mm.bot_fake_landing(mm.player), "landing: самолёт игрока убран проходом над полосой")
	await _free(tree, mm)

# ---------------------------------------------------------------- 4. конец боя и награды

func _test_end(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade"})
	var ended: Array = []
	mm.match_ended.connect(func(r: Dictionary): ended.append(r))
	mm.request_spawn("strizh")
	var enemies := _team(mm, 1)
	_kill(enemies[0], mm.player.uid)
	mm.tickets[1] = 0.0
	mm._check_end()
	_check(mm.state == "ended", "end: бой не закончился при 0 очков")
	_check(mm.outcome == "win", "end: ждали победу, а " + mm.outcome)
	_check(ended.size() == 1, "end: match_ended не отправлен")
	_check("Победа" in _messages, "end: нет сообщения «Победа»")
	var r: Dictionary = Game.last_result
	for k in MatchManager.RESULT_KEYS:
		_check(r.has(k), "end: в результате нет " + k)
	_check(r.get("outcome") == "win" and int(r.get("kills", 0)) == 1, "end: итог или сбитые в результате")
	# 300 за сбитый + 200 за участие, ×1.3 за победу
	_check(int(r.get("credits", 0)) == 650, "end: кредиты %d, ждали 650" % int(r.get("credits", 0)))
	_check(int(r.get("xp_by_plane", {}).get("strizh", 0)) == 364, "end: опыт Стрижа %s" % str(r.get("xp_by_plane")))
	_check(r.get("planes_used") == ["strizh"], "end: planes_used")
	_check(r.get("scoreboard", []).size() == 8, "end: таблица в результате")
	_check(Game.last_replay is Dictionary, "end: last_replay не записан")
	_kill(enemies[1], mm.player.uid)
	_check(mm.player_stats().kills == 1, "end: сбитый после конца засчитан")
	await _free(tree, mm)

	mm = await _make(tree, {"mode": "arcade"})
	mm.tickets = [500.0, 500.0]
	mm.time_left = 0.0
	mm._check_end()
	_check(mm.state == "ended" and mm.outcome == "draw", "end: по времени при равных очках ждали ничью, а " + mm.outcome)
	_check("Ничья" in _messages, "end: нет сообщения «Ничья»")
	_check(int(Game.last_result.get("credits", -1)) == 0, "end: без вылета награды быть не должно")
	await _free(tree, mm)

	mm = await _make(tree, {"mode": "arcade"})
	mm.tickets = [400.0, 500.0]
	mm._step(float(Data.ECONOMY.match_seconds) + 1.0)
	_check(mm.state == "ended" and mm.outcome == "loss", "end: по времени при меньших очках ждали поражение, а " + mm.outcome)
	_check("Поражение" in _messages, "end: нет сообщения «Поражение»")
	await _free(tree, mm)

	# у красных не осталось самолётов и жизней
	mm = await _make(tree, {"mode": "arcade"})
	var reds := _team(mm, 1)
	for i in reds.size():
		mm.record_of(reds[i].uid).lives = 1
	for i in reds.size():
		_check(mm.state != "ended", "end: бой закончился раньше последнего врага")
		_kill(reds[i], -1, "ground")
	_check(mm.state == "ended" and mm.outcome == "win", "end: все враги выбыли, ждали победу, а " + mm.outcome)
	await _free(tree, mm)

# ---------------------------------------------------------------- 5. подбор ботов

func _test_matchmaker() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	_check(is_equal_approx(Matchmaker.lineup_level(["strizh", "sokol"]), 3.3), "mm: lineup_level")
	_check(is_equal_approx(Matchmaker.lineup_level([]), 1.0), "mm: lineup_level пустого")
	for attempt in 20:
		var low: Array = Matchmaker.pick_bots(1.0, 8, 1, rng)
		_check(low.size() == 8, "mm: количество для уровня 1.0")
		var names := {}
		for b in low:
			var p: Dictionary = Data.plane(b.def_id)
			_check(float(p.level) <= 1.7 + 0.001, "mm: уровень 1.0 получил " + b.def_id)
			_check(float(b.skill) >= 0.3 and float(b.skill) <= 0.8, "mm: навык вне 0.3-0.8")
			_check(String(b.callsign) != "" and not names.has(b.callsign), "mm: позывной пустой или повтор")
			names[b.callsign] = true
		var high: Array = Matchmaker.pick_bots(6.0, 7, 0, rng)
		_check(high.size() == 7, "mm: количество для уровня 6.0")
		for b in high:
			var r := int(Data.plane(b.def_id).rank)
			_check(r >= 2 and r <= 3, "mm: уровень 6.0 получил ранг %d (%s)" % [r, b.def_id])
	var far: Array = Matchmaker.pick_bots(10.0, 3, 1, rng)
	for b in far:
		_check(b.def_id == "prizrak", "mm: ближайший уровень к 10.0 — Призрак, а не " + b.def_id)
	_check(Matchmaker.pick_bots(3.0, 0, 0, rng).is_empty(), "mm: count 0")
	# позывные двух команд не пересекаются
	var a: Array = Matchmaker.pick_bots(2.0, 8, 0, rng)
	var b2: Array = Matchmaker.pick_bots(2.0, 8, 1, rng)
	var all := {}
	for x in a + b2:
		_check(not all.has(x.callsign), "mm: позывной в обеих командах: " + x.callsign)
		all[x.callsign] = true
	# в команде от трёх ботов есть обе линии, если уровень позволяет
	for attempt in 10:
		var t: Array = Matchmaker.pick_bots(1.3, 4, 1, rng)
		var lines := {}
		for x in t:
			lines[Data.plane(x.def_id).line] = true
		_check(lines.size() == 2, "mm: в команде одна линия")
	# баланс команд
	for lv in [1.0, 3.3, 4.3, 6.0]:
		var teams: Array = Matchmaker.make_teams(lv, 8, rng, lv)
		_check(teams[0].size() == 7 and teams[1].size() == 8, "mm: размеры команд")
		var d := absf(Matchmaker.team_level(teams[0]) + lv - Matchmaker.team_level(teams[1]))
		_check(d <= 1.5, "mm: команды не сбалансированы на %.1f (разница %.2f)" % [lv, d])

# ---------------------------------------------------------------- 6. правила вылетов

func _test_spawn_rules(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "realistic"})
	_check(mm.lineup_uses == {"strizh": 1, "shmel": 1}, "realistic: вылеты " + str(mm.lineup_uses))
	_check(mm.spawn_cost("strizh") == 0, "realistic: первый вылет не бесплатный")
	_check(mm.can_spawn("strizh") and mm.can_spawn("shmel"), "realistic: вылет недоступен")
	_check(not mm.can_spawn("sokol"), "realistic: вылет на самолёте не из сетапа")
	_check(not mm.request_spawn("sokol"), "realistic: request_spawn не из сетапа")
	_check(mm.request_spawn("strizh"), "realistic: вылет не удался")
	_check(int(mm.lineup_uses.strizh) == 0 and int(mm.lineup_uses.shmel) == 0, "realistic: после вылета остались вылеты")
	var pl = mm.player
	_kill(pl, -1, "ground")
	mm._step(0.05)
	_check(mm.state == "dead", "realistic: после гибели ждали dead, а " + mm.state)
	_check(not mm.request_spawn("shmel") and not mm.request_spawn("strizh"), "realistic: второй вылет удался")
	_check(mm.player == null, "realistic: player после гибели")
	await _free(tree, mm)

	mm = await _make(tree, {"mode": "arcade"})
	_check(mm.lineup_uses == {"strizh": 2, "shmel": 2}, "arcade: вылеты " + str(mm.lineup_uses))
	_check(mm.spawn_cost("strizh") == 0 and mm.spawn_cost("shmel") == 0, "arcade: первые вылеты не бесплатные")
	_check(mm.request_spawn("strizh"), "arcade: первый вылет")
	_check(int(mm.lineup_uses.strizh) == 1 and mm.spawn_points == 0, "arcade: после первого вылета")
	_check(not mm.can_spawn("shmel"), "arcade: второй вылет в полёте")
	var cost: int = int(Data.ECONOMY.spawn_cost_by_rank[1])
	_check(mm.spawn_cost("strizh") == cost, "arcade: повторный вылет на Стриже бесплатный")
	_check(mm.spawn_cost("shmel") == 0, "arcade: первый вылет на Шмеле не бесплатный")
	# новичок разбился без очков: второй самолёт сетапа всё равно доступен
	_kill(mm.player, -1, "ground")
	mm._step(0.05)
	_check(mm.state == "spawn", "arcade: после первой гибели ждали spawn, а " + mm.state)
	_check(mm.can_spawn("shmel") and not mm.can_spawn("strizh"), "arcade: без очков доступен только Шмель")
	_check(mm.request_spawn("shmel"), "arcade: вылет на Шмеле")
	_check(mm.spawn_points == 0 and int(mm.lineup_uses.shmel) == 1, "arcade: вылет на Шмеле не бесплатный")
	mm.spawn_points = 1000
	_kill(mm.player, -1, "ground")
	mm._step(0.05)
	_check(mm.state == "spawn", "arcade: с очками ждали spawn, а " + mm.state)
	_check(mm.request_spawn("strizh"), "arcade: повторный вылет на Стриже")
	_check(int(mm.lineup_uses.strizh) == 0 and mm.spawn_points == 1000 - cost, "arcade: повторный вылет не списан")
	_kill(mm.player, -1, "ground")
	mm._step(0.05)
	_check(not mm.can_spawn("strizh"), "arcade: третий вылет на Стриже")
	_check(mm.can_spawn("shmel"), "arcade: Шмель недоступен")
	await _free(tree, mm)

	mm = await _make(tree, {"mode": "arcade"})
	mm.request_spawn("strizh")
	_kill(mm.player, -1, "ground")
	mm._step(0.05)
	mm.request_spawn("shmel")
	_kill(mm.player, -1, "ground")
	mm._step(0.05)
	_check(mm.state == "dead", "arcade: без очков вылета ждали dead, а " + mm.state)
	_check("Не хватает очков вылета" in _messages, "arcade: нет сообщения об очках вылета " + str(_messages))
	await _free(tree, mm)

# ---------------------------------------------------------------- 7. выход в ангар

func _test_quit(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "arcade"})
	mm.request_spawn("strizh")
	_kill(_team(mm, 1)[0], mm.player.uid)
	mm.quit_to_hangar()
	var r: Dictionary = Game.last_result
	_check(r.get("outcome") == "exit", "quit: ждали exit, а " + str(r.get("outcome")))
	_check(int(r.get("credits", 0)) == 500, "quit: кредиты %d, ждали 500 без бонуса победы" % int(r.get("credits", 0)))
	_check(mm.state == "ended", "quit: бой не закрыт")
	await _free(tree, mm)

# ---------------------------------------------------------------- обучение

func _test_training(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "training"})
	await tree.process_frame
	_check(mm.player != null, "training: игрок не появился сам")
	_check(mm.lineup.size() == 1 and Data.plane(mm.lineup[0]).weapons.bombs.count > 0, "training: самолёт без бомб")
	_check(not mm.show_score and mm.zones_state.is_empty(), "training: счёт и зоны не нужны")
	var tr = mm.training
	_check(tr != null and tr.step == 1, "training: не начался шаг 1")
	if mm.player == null or tr == null:
		await _free(tree, mm)
		return
	_check("Дай полный газ: W" in _messages, "training: нет подсказки газа " + str(_messages))
	var pl = mm.player
	pl.fm.throttle = 1.0
	for i in 31:
		tr.tick(0.1)
	_check(tr.step == 2, "training: газ 3 с не засчитан (шаг %d)" % tr.step)
	tr.tick(0.1)
	pl.fm.basis = pl.fm.basis.rotated(Vector3.UP, deg_to_rad(95.0))
	tr.tick(0.1)
	_check(tr.step == 3, "training: поворот не засчитан (шаг %d)" % tr.step)
	tr.tick(0.1)
	var target_alt: float = tr._target_alt
	_check(target_alt >= 1500.0, "training: высота меньше 1 500")
	pl.fm.pos = Vector3(pl.fm.pos.x, target_alt + 10.0, pl.fm.pos.z)
	tr.tick(0.1)
	_check(tr.step == 4, "training: высота не засчитана (шаг %d)" % tr.step)
	tr.tick(0.1)
	_check(tr.drones.size() == 3, "training: мишеней %d" % tr.drones.size())
	_check(mm.enemies_of(0).size() == 3 and mm.enemies_of(1).is_empty(), "training: мишени не должны атаковать")
	for d in tr.drones.duplicate():
		_check(int(d.team) == 1, "training: мишень не красная")
		_kill(d, pl.uid)
	_check(tr.drone_kills == 3, "training: сбито %d" % tr.drone_kills)
	tr.tick(0.1)
	if tr.step == 5:
		var obj = tr.objective
		_check(obj != null and int(obj.team) == 1, "training: нет цели для бомбы")
		if obj != null:
			obj.take_damage(1.0e6, pl.uid, true)
			if tr.step == 5:
				obj.alive = false
		tr.tick(0.1)
	_check(tr.step == 6, "training: шаг посадки не начался (шаг %d)" % tr.step)
	tr.tick(0.1)
	pl.serviced.emit(pl)
	tr.tick(0.1)
	_check(tr.step == 7, "training: посадка не засчитана (шаг %d)" % tr.step)
	for i in 45:
		tr.tick(0.1)
	_check(mm.state == "ended" and mm.outcome == "win", "training: не закончилось победой")
	var r: Dictionary = Game.last_result
	_check(int(r.get("credits", 0)) == int(Data.ECONOMY.participation.credits), "training: награда не только за участие")
	_check(r.get("xp_by_plane", {}).size() == 1, "training: опыт " + str(r.get("xp_by_plane")))
	await _free(tree, mm)

# ---------------------------------------------------------------- тестовый полёт

func _test_test_flight(tree: SceneTree) -> void:
	var mm = await _make(tree, {"mode": "test", "test_plane": "flanker", "lineup": ["strizh"]})
	await tree.process_frame
	_check(mm.lineup == ["flanker"], "test: сетап " + str(mm.lineup))
	_check(mm.player != null and mm.player.def_id == "flanker", "test: нет Фланкера")
	_check(mm.spawn_cost("flanker") == 0 and mm.infinite_uses, "test: вылеты не бесконечные")
	var tr = mm.training
	_check(tr != null and tr.drones.size() == 4, "test: мишеней не 4")
	if mm.player == null or tr == null:
		await _free(tree, mm)
		return
	var old = mm.player
	_check(mm.request_spawn("flanker"), "test: повторный вылет в полёте")
	_check(mm.player != old and mm.player != null, "test: самолёт не заменён")
	_check(mm.return_to_spawn_menu() and mm.state == "spawn", "test: меню вылета")
	_check(mm.request_spawn("flanker"), "test: вылет из меню")
	var d = tr.drones[0]
	_kill(d, mm.player.uid)
	_check(tr.drones.size() == 3, "test: мишень не убрана")
	tr.tick(TrainingDirector.TEST_DRONE_RESPAWN + 0.1)
	_check(tr.drones.size() == 4, "test: мишень не вернулась")
	var tl: float = mm.time_left
	mm._step(2000.0)
	_check(mm.state != "ended" and is_equal_approx(mm.time_left, tl), "test: время боя не должно кончаться")
	mm.quit_to_hangar()
	var r: Dictionary = Game.last_result
	_check(r.get("outcome") == "exit" and int(r.get("credits", -1)) == 0 and r.get("xp_by_plane", {"x": 1}).is_empty(), "test: награды в тестовом полёте")
	await _free(tree, mm)
