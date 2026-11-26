class_name MatchManager
extends Node3D
## Бой: строит мир и участников из Game.match_config, ведёт вылеты, счёт команд, зоны,
## сбитых и помощь, конец боя и награды.

signal kill_event(text: String, killer_team: int, victim_team: int)
signal message(text: String, seconds: float)
signal state_changed(state: String)
signal player_spawned(ac)
signal player_killed(info: Dictionary)   # {killer_name, killer_plane, killer_uid, reason}
signal match_ended(result: Dictionary)

const ZONE_TICK := 0.25
const ZONE_CAPTURE_TIME := 8.0
const ASSIST_WINDOW := 30.0
const BOT_RESPAWN_DELAY := 5.0
const FIGHTER_ALT := 1500.0
const ATTACKER_ALT := 800.0
const RESULTS_DELAY := 4.0
const INFINITE_USES := 99

# винительный падеж для «… уничтожил танк»
const UNIT_ACC := {"tank": "танк", "truck": "грузовик", "aa": "зенитку", "ship": "корабль",
	"building": "здание", "carrier": "авианосец"}
const UNIT_DESTROYED := {"tank": "Танк уничтожен", "truck": "Грузовик уничтожен", "aa": "Зенитка уничтожена",
	"ship": "Корабль уничтожен", "building": "Здание уничтожено", "carrier": "Авианосец уничтожен"}
# творительный падеж для «… сбит зениткой»
const UNIT_BY := {"aa": "зениткой", "ship": "кораблём", "tank": "танком", "building": "огнём с земли",
	"truck": "огнём с земли", "carrier": "авианосцем"}
const UNIT_NAME := {"tank": "Танк", "truck": "Грузовик", "aa": "Зенитка", "ship": "Корабль",
	"building": "Здание", "carrier": "Авианосец"}
const OUTCOME_TEXT := {"win": "Победа", "loss": "Поражение", "draw": "Ничья"}
const RESULT_KEYS := ["mode", "map_id", "outcome", "duration", "planes_used", "kills", "ground_kills", "assists",
	"deaths", "captures", "landings", "score", "xp_by_plane", "credits", "scoreboard", "time_of_day", "weather", "cobra"]

var config: Dictionary = {}
var mode: String = "arcade"
var world: World
var projectiles: ProjectileManager
var fx: Effects
var recorder: Recorder
var camera_rig: CameraRig
var hud = null
var aircraft: Array = []
var ground_units: Array = []
var player = null
var player_pilot: PlayerPilot
var tickets: Array = [1000.0, 1000.0]
var max_tickets: float = 1000.0
var time_left: float = 900.0
var elapsed: float = 0.0
var zones_state: Array = []
var state: String = "spawn"
var spawn_points: int = 0
var lineup: Array = []
var lineup_uses: Dictionary = {}
var markers_enabled: bool = true
var paused: bool = false

# --- дополнительно (не из контракта)
var rng := RandomNumberGenerator.new()
var size: int = 4
var map_id: String = "canyon"
var time_of_day: String = "day"
var weather: String = "clear"
var training: TrainingDirector = null
var show_score: bool = true          # очки команд, зоны и таймер (нет в обучении и тестовом полёте)
var infinite_uses: bool = false      # тестовый полёт и обучение
var autopilot: bool = false
var leave_scene: bool = true         # false — не уходить на экран итогов (для тестов)
var crash_view_seconds: float = 2.0  # сколько смотреть на падение, если сбившего нет
var outcome: String = ""
var winner: int = -2                 # 0/1 — победившая команда, -1 — ничья, -2 — бой идёт
var result: Dictionary = {}
var cobra_done: bool = false
var spectate_target = null

var _uid: int = 1
var _pilots: Array = []              # записи участников (боты и игрок)
var _player_rec: Dictionary = {}
var _ac_rec: Dictionary = {}         # uid самолёта -> запись участника
var _ac_info: Dictionary = {}        # uid -> {def_id, callsign, team} (живёт и после удаления самолёта)
var _entities: Dictionary = {}       # uid -> узел
var _handled_dead: Dictionary = {}
var _damage_log: Dictionary = {}     # uid жертвы -> {uid атакующего: время}
var _last_hit_seen: Dictionary = {}  # uid -> last_hit_time из DamageModel
var _rewards: Dictionary = {}        # id самолёта -> {credits, xp}
var _planes_used: Array = []
var _spawn_count: int = 0
var _zone_t: float = 0.0
var _bases_dead: Dictionary = {}
var _post_death_t: float = -1.0
var _killcam = null
var _autospawn_t: float = -1.0
var _spectate_t: float = 0.0
var _cobra_t: float = -1.0
var _airborne: bool = false
var _minute_warned: bool = false
var _ready_done: bool = false
var _rec_started: bool = false

func _enter_tree() -> void:
	Game.battle = self

func _exit_tree() -> void:
	if paused and is_inside_tree():
		get_tree().paused = false
	if Game.battle == self:
		Game.battle = null

func _ready() -> void:
	_read_config()
	rng.seed = int(config.seed)
	map_id = Data.resolve_map(String(config.map_id), rng)
	time_of_day = Data.resolve_time(String(config.time_of_day), rng)
	weather = Data.resolve_weather(String(config.weather), rng)
	_setup_mode()

	world = World.new()
	world.name = "World"
	add_child(world)
	_uid = world.build(Data.map_def(map_id), time_of_day, weather, int(config.seed), 1000)
	ground_units = world.ground_units
	for u in ground_units:
		_register_ground(u)

	projectiles = ProjectileManager.new()
	projectiles.name = "Projectiles"
	add_child(projectiles)
	fx = Effects.new()
	fx.name = "Effects"
	add_child(fx)
	recorder = Recorder.new()
	recorder.name = "Recorder"
	add_child(recorder)
	camera_rig = CameraRig.new()
	camera_rig.name = "CameraRig"
	add_child(camera_rig)
	player_pilot = PlayerPilot.new()
	player_pilot.name = "PlayerPilot"
	add_child(player_pilot)

	_init_zones()
	_make_player_record()
	_spawn_initial_bots()
	recorder.start(self)
	_rec_started = true

	if mode == "training" or mode == "test":
		training = TrainingDirector.new()
		training.name = "Training"
		add_child(training)

	hud = BattleHUD.new()
	hud.name = "HUD"
	add_child(hud)
	hud.process_mode = Node.PROCESS_MODE_ALWAYS
	hud.bind(self)

	# подсказки обучения идут после bind, чтобы HUD их получил
	if training != null:
		training.start(self)

	_spectate_teammate()
	_ready_done = true
	call_deferred("_after_ready")

func _after_ready() -> void:
	if not is_inside_tree():
		return
	state_changed.emit(state)
	if state != "spawn":
		return
	if mode == "training" or mode == "test":
		request_spawn(String(lineup[0]))
	elif autopilot:
		_autospawn_t = 0.5

# ---------------------------------------------------------------- настройка

func _read_config() -> void:
	var c: Dictionary = Game.default_config()
	var src: Dictionary = Game.match_config
	if not src.is_empty():
		c.merge(src, true)
	if int(c.seed) == 0:
		c.seed = randi() % 1000000 + 1
	config = c
	mode = String(c.mode) if Data.MODE_NAMES.has(String(c.mode)) else "arcade"
	size = 8 if int(c.size) == 8 else 4
	autopilot = bool(c.get("autopilot", false))
	var src_lineup: Array = c.lineup if c.lineup is Array else []
	if src_lineup.is_empty():
		src_lineup = Profile.get_lineup()
	lineup = []
	for id in src_lineup:
		var sid := String(id)
		if Data.has_plane(sid) and not sid in lineup and lineup.size() < 4:
			lineup.append(sid)
	if lineup.is_empty():
		lineup = Data.STARTER_PLANES.duplicate()

func _setup_mode() -> void:
	markers_enabled = mode in ["arcade", "test", "training"]
	show_score = mode in ["arcade", "realistic"]
	infinite_uses = mode in ["test", "training"]
	max_tickets = Data.tickets_for(size)
	tickets = [max_tickets, max_tickets]
	time_left = float(Data.ECONOMY.match_seconds)
	match mode:
		"test":
			var tp := String(config.get("test_plane", ""))
			if not Data.has_plane(tp):
				tp = String(lineup[0])
			lineup = [tp]
		"training":
			lineup = [_training_plane()]
	lineup_uses = {}
	for id in lineup:
		match mode:
			"arcade":
				lineup_uses[id] = int(Data.ECONOMY.arcade_uses_per_plane)
			"realistic":
				lineup_uses[id] = 1
			_:
				lineup_uses[id] = INFINITE_USES

## В обучении есть шаг с бомбой, поэтому нужен свой поршневой самолёт с бомбами (Шмель — стартовый).
func _training_plane() -> String:
	var order: Array = ["shmel"]
	order.append_array(Data.ORDER)
	for id in order:
		var p: Dictionary = Data.plane(id)
		if p.kind == "prop" and int(p.weapons.bombs.count) > 0 and _owns(id):
			return id
	for id in Data.ORDER:
		var p: Dictionary = Data.plane(id)
		if p.kind == "prop" and p.line == "fighter" and _owns(id):
			return id
	return "strizh"

func _owns(id: String) -> bool:
	if Profile.has_method("is_owned"):
		return bool(Profile.is_owned(id))
	return id in Data.STARTER_PLANES

func _player_name() -> String:
	var n = Profile.get_setting("player_name") if Profile.has_method("get_setting") else null
	if n == null or String(n).strip_edges() == "":
		return "1DEX1"
	return String(n).strip_edges()

func _new_rec(p_name: String, team: int, is_player: bool, def_id: String, skill: float, lives: int) -> Dictionary:
	return {"id": _pilots.size(), "name": p_name, "team": team, "is_player": is_player, "def_id": def_id,
		"skill": skill, "lives": lives, "respawn_t": -1.0, "uid": -1, "alive": false, "index": 0,
		"external": false, "hidden": false, "camo": "factory",
		"kills": 0, "ground": 0, "deaths": 0, "assists": 0, "captures": 0, "landings": 0, "score": 0}

func _make_player_record() -> void:
	_player_rec = _new_rec(_player_name(), 0, true, String(lineup[0]), 0.0, 0)
	_pilots.append(_player_rec)

func _spawn_initial_bots() -> void:
	if not show_score:
		return
	var level := Matchmaker.lineup_level(lineup)
	var teams: Array = Matchmaker.make_teams(level, size, rng, level)
	var used := {_player_rec.name: true}
	var lives := 1 if mode == "realistic" else int(Data.ECONOMY.bot_lives_arcade)
	for team in 2:
		var idx := 1 if team == 0 else 0
		for b in teams[team]:
			var rec := _new_rec(_unique_name(String(b.callsign), used), team, false, String(b.def_id), float(b.skill), lives)
			rec.index = idx
			idx += 1
			var camos: Array = Data.camos_for(rec.def_id)
			rec.camo = String(camos[rng.randi() % camos.size()].id)
			_pilots.append(rec)
			_spawn_bot(rec)

func _unique_name(n: String, used: Dictionary) -> String:
	var out := n
	var k := 2
	while used.has(out):
		out = "%s %d" % [n, k]
		k += 1
	used[out] = true
	return out

func _register_ground(u) -> void:
	if u == null or not is_instance_valid(u):
		return
	_entities[int(u.uid)] = u
	if u.has_signal("destroyed") and not u.is_connected("destroyed", _on_ground_destroyed):
		u.connect("destroyed", _on_ground_destroyed)

func _init_zones() -> void:
	zones_state = []
	if not show_score:
		return
	for z in world.zones:
		zones_state.append({"id": String(z.id), "owner": -1, "progress": 0.0})

# ---------------------------------------------------------------- API

func next_uid() -> int:
	var u := _uid
	_uid += 1
	return u

func get_entity(uid: int):
	if uid < 0:
		return null
	var e = _entities.get(uid)
	if e != null and is_instance_valid(e):
		return e
	for u in ground_units:
		if is_instance_valid(u) and int(u.uid) == uid:
			return u
	for ac in aircraft:
		if is_instance_valid(ac) and int(ac.uid) == uid:
			return ac
	return null

func enemies_of(team: int) -> Array:
	var out: Array = []
	# в обучении и тестовом полёте красные никого не атакуют
	if not show_score and team == 1:
		return out
	for ac in aircraft:
		if _is_alive(ac) and int(ac.team) != team:
			out.append(ac)
	return out

func ground_targets_of(team: int) -> Array:
	var out: Array = []
	for u in ground_units:
		if not is_instance_valid(u) or not bool(u.alive) or int(u.team) != team:
			continue
		if String(u.kind) == "carrier" or ("invulnerable" in u and bool(u.invulnerable)):
			continue
		out.append(u)
	return out

func spawn_cost(def_id: String) -> int:
	if infinite_uses or _spawn_count == 0:
		return 0
	var rank := int(Data.plane(def_id).get("rank", 1))
	var costs: Array = Data.ECONOMY.spawn_cost_by_rank
	return int(costs[clampi(rank, 0, costs.size() - 1)])

func can_spawn(def_id: String) -> bool:
	if not (state == "spawn" or (mode == "test" and state == "flying")):
		return false
	return _plane_available(def_id)

func request_spawn(def_id: String) -> bool:
	if not can_spawn(def_id):
		return false
	if player != null and is_instance_valid(player):
		_remove_aircraft_quietly(player)
	player = null
	spawn_points -= spawn_cost(def_id)
	if not infinite_uses:
		if mode == "realistic":
			for k in lineup_uses:
				lineup_uses[k] = 0
		else:
			lineup_uses[def_id] = int(lineup_uses.get(def_id, 0)) - 1
	_spawn_count += 1
	var def: Dictionary = Data.plane(def_id)
	var sp := _player_spawn_point(def)
	var ac := Aircraft.new()
	var uid := next_uid()
	var opts := {"assist": mode != "realistic", "hardcore": mode == "realistic", "is_player": true}
	ac.setup(def_id, 0, uid, String(_player_rec.name), _player_camo(def_id), sp, opts)
	ac.is_player = true
	var bp = null
	if autopilot:
		bp = BotPilot.new()
		bp.skill = 0.6
		bp.role = String(def.line)
		ac.set_pilot(bp)
		if bp.get_parent() == null:
			ac.add_child(bp)
	else:
		_ensure_player_pilot()
		ac.set_pilot(player_pilot)
	add_child(ac)
	_player_rec.def_id = def_id
	_attach(ac, _player_rec)
	player = ac
	if bp == null:
		player_pilot.reset_aim(ac)
	if not def_id in _planes_used:
		_planes_used.append(def_id)
	_airborne = not bool(sp.get("on_ground", false))
	_cobra_t = -1.0
	_post_death_t = -1.0
	camera_rig.follow(ac)
	_set_state("flying")
	player_spawned.emit(ac)
	_record_spawn(ac)
	if bool(sp.get("on_ground", false)) and mode != "training":
		message.emit("Дай полный газ: W. После взлёта убери шасси: G", 6.0)
	return true

func get_scoreboard() -> Array:
	var rows: Array = []
	for rec in _pilots:
		if bool(rec.hidden):
			continue
		rows.append({"uid": int(rec.uid), "name": String(rec.name), "team": int(rec.team),
			"plane": String(Data.plane(String(rec.def_id)).get("name", rec.def_id)), "plane_id": String(rec.def_id),
			"kills": int(rec.kills), "ground": int(rec.ground), "deaths": int(rec.deaths), "score": int(rec.score),
			"assists": int(rec.assists), "captures": int(rec.captures), "alive": bool(rec.alive),
			"is_player": bool(rec.is_player)})
	rows.sort_custom(_score_sort)
	return rows

func _score_sort(a: Dictionary, b: Dictionary) -> bool:
	if a.score != b.score:
		return a.score > b.score
	if a.kills != b.kills:
		return a.kills > b.kills
	return a.team < b.team

func player_stats() -> Dictionary:
	var r := _player_rec
	return {"kills": int(r.kills), "ground_kills": int(r.ground), "assists": int(r.assists), "deaths": int(r.deaths),
		"captures": int(r.captures), "landings": int(r.landings), "score": int(r.score), "spawn_points": spawn_points,
		"planes_used": _planes_used.duplicate(), "name": String(r.name)}

func set_paused(on: bool) -> void:
	if on and state == "ended":
		return
	paused = on
	if is_inside_tree():
		get_tree().paused = on
	if hud != null and is_instance_valid(hud):
		hud.process_mode = Node.PROCESS_MODE_ALWAYS

func quit_to_hangar() -> void:
	if paused:
		set_paused(false)
	if state != "ended":
		outcome = "exit"
		_set_state("ended")
		result = _build_result("exit")
		Game.last_result = result
		Game.last_replay = recorder.finish() if recorder != null else {}
	if leave_scene:
		Game.go_results()

# ---------------------------------------------------------------- дополнительные методы

## Закончить бой с заданным итогом (обучение заканчивается так с "win").
func finish_match(p_outcome: String) -> void:
	if state == "ended":
		return
	_finish(p_outcome)

## Тестовый полёт: убрать текущий самолёт и открыть меню вылета.
func return_to_spawn_menu() -> bool:
	if mode != "test" or state != "flying":
		return false
	if player != null and is_instance_valid(player):
		_remove_aircraft_quietly(player)
	player = null
	_set_state("spawn")
	_spectate_teammate()
	return true

## Принадлежит ли самолёт с этим uid игроку (в том числе прошлые вылеты).
func is_player_uid(uid: int) -> bool:
	var rec: Dictionary = _ac_rec.get(uid, {})
	return not rec.is_empty() and bool(rec.is_player)

## Бот вне обычного состава (мишени обучения и тестового полёта). Не возрождается сам.
func spawn_bot(def_id: String, team: int, callsign: String, skill: float, spawn: Dictionary, pilot = null, hidden := false):
	var rec := _new_rec(callsign, team, false, def_id, skill, 1)
	rec.external = true
	rec.hidden = hidden
	_pilots.append(rec)
	return _create_bot_aircraft(rec, spawn, pilot)

## Подключить уже созданный самолёт (или его заменитель в тестах) к учёту боя.
func register_aircraft(ac, as_player := false) -> void:
	var rec: Dictionary
	if as_player:
		rec = _player_rec
	else:
		rec = _new_rec(String(ac.callsign), int(ac.team), false, String(ac.def_id), 0.5, 1)
		rec.external = true
		_pilots.append(rec)
	if ac.get_parent() == null:
		add_child(ac)
	_attach(ac, rec)
	if as_player:
		player = ac

func record_of(uid: int) -> Dictionary:
	return _ac_rec.get(uid, {})

func zone_owned_count(team: int) -> int:
	var n := 0
	for zs in zones_state:
		if int(zs.owner) == team:
			n += 1
	return n

# ---------------------------------------------------------------- самолёты

func _spawn_bot(rec: Dictionary):
	var def: Dictionary = Data.plane(String(rec.def_id))
	var alt := FIGHTER_ALT if def.line == "fighter" else ATTACKER_ALT
	var sp: Dictionary = world.air_spawn(int(rec.team), int(rec.index), alt)
	return _create_bot_aircraft(rec, sp, null)

func _create_bot_aircraft(rec: Dictionary, sp: Dictionary, pilot):
	var def: Dictionary = Data.plane(String(rec.def_id))
	var spawn := sp.duplicate()
	if not spawn.has("on_ground"):
		spawn["on_ground"] = false
	var ac := Aircraft.new()
	var uid := next_uid()
	ac.setup(String(rec.def_id), int(rec.team), uid, String(rec.name), String(rec.camo), spawn,
		{"assist": true, "hardcore": mode == "realistic", "is_player": false})
	var p = pilot
	if p == null:
		p = BotPilot.new()
		p.skill = float(rec.skill)
		p.role = String(def.get("line", "fighter"))
	ac.set_pilot(p)
	if p is Node and p.get_parent() == null:
		ac.add_child(p)
	add_child(ac)
	_attach(ac, rec)
	_record_spawn(ac)
	return ac

func _attach(ac, rec: Dictionary) -> void:
	var uid := int(ac.uid)
	if not ac in aircraft:
		aircraft.append(ac)
	_entities[uid] = ac
	_ac_rec[uid] = rec
	_ac_info[uid] = {"def_id": String(ac.def_id), "callsign": String(ac.callsign), "team": int(ac.team)}
	rec.uid = uid
	rec.alive = true
	rec.def_id = String(ac.def_id)
	if ac.has_signal("destroyed") and not ac.is_connected("destroyed", _on_aircraft_destroyed):
		ac.connect("destroyed", _on_aircraft_destroyed)
	if ac.has_signal("serviced") and not ac.is_connected("serviced", _on_aircraft_serviced):
		ac.connect("serviced", _on_aircraft_serviced)
	var d = ac.get("dmg")
	if d != null and d is Object and d.has_signal("module_damaged"):
		d.connect("module_damaged", _on_module_damaged.bind(uid))

func _record_spawn(ac) -> void:
	if not _rec_started or recorder == null or not is_instance_valid(recorder):
		return
	recorder.event("spawn", {"uid": int(ac.uid), "def_id": String(ac.def_id), "team": int(ac.team),
		"callsign": String(ac.callsign), "camo": String(ac.camo_id), "is_player": bool(ac.is_player)})

func _remove_aircraft_quietly(ac) -> void:
	if not is_instance_valid(ac):
		return
	_handled_dead[int(ac.uid)] = true
	var rec: Dictionary = _ac_rec.get(int(ac.uid), {})
	if not rec.is_empty():
		rec.alive = false
	if ac.is_connected("destroyed", _on_aircraft_destroyed):
		ac.disconnect("destroyed", _on_aircraft_destroyed)
	_reclaim_player_pilot(ac)
	aircraft.erase(ac)
	ac.queue_free()

func _ensure_player_pilot() -> void:
	if player_pilot == null or not is_instance_valid(player_pilot) or player_pilot.is_queued_for_deletion():
		player_pilot = PlayerPilot.new()
		player_pilot.name = "PlayerPilot"
		add_child(player_pilot)

## Пилот игрока один на бой: если самолёт забрал его к себе, вернуть, пока самолёт не удалён.
func _reclaim_player_pilot(ac) -> void:
	if player_pilot == null or not is_instance_valid(player_pilot):
		return
	var par := player_pilot.get_parent()
	if par != self and par != null and (par == ac or ac.is_ancestor_of(player_pilot)):
		player_pilot.reparent(self, false)

func _player_spawn_point(def: Dictionary) -> Dictionary:
	var on_runway := mode == "realistic"
	if mode == "training" and training != null and training.wants_runway_spawn():
		on_runway = true
	var sp: Dictionary
	if on_runway:
		sp = world.runway_spawn(0, 0)
	else:
		var alt := FIGHTER_ALT if def.line == "fighter" else ATTACKER_ALT
		if mode == "training" and training != null:
			alt = training.spawn_altitude()
		sp = world.air_spawn(0, 0, alt)
	sp = sp.duplicate()
	if not sp.has("on_ground"):
		sp["on_ground"] = false
	return sp

func _player_camo(def_id: String) -> String:
	if Profile.has_method("selected_camo"):
		var c = Profile.selected_camo(def_id)
		if c != null and String(c) != "":
			return String(c)
	return "factory"

func _plane_available(def_id: String) -> bool:
	if not def_id in lineup:
		return false
	if int(lineup_uses.get(def_id, 0)) <= 0:
		return false
	return spawn_points >= spawn_cost(def_id)

func _player_can_spawn_any() -> bool:
	for id in lineup:
		if _plane_available(String(id)):
			return true
	return false

func _is_alive(ac) -> bool:
	return ac != null and is_instance_valid(ac) and bool(ac.alive)

func _plane_name(def_id: String) -> String:
	return String(Data.plane(def_id).get("name", def_id))

# ---------------------------------------------------------------- кадр

func _physics_process(delta: float) -> void:
	_step(delta)

func _step(dt: float) -> void:
	_prune()
	if state == "ended":
		return
	elapsed += dt
	_track_damage()
	if show_score:
		time_left = maxf(0.0, time_left - dt)
		_zone_t += dt
		while _zone_t >= ZONE_TICK:
			_zone_t -= ZONE_TICK
			_zone_tick(ZONE_TICK)
		if not _minute_warned and time_left <= 60.0:
			_minute_warned = true
			message.emit("Осталась 1 минута", 4.0)
	_update_bots(dt)
	_update_player(dt)
	_update_post_death(dt)
	_update_autospawn(dt)
	_update_spectate(dt)
	_check_end()

func _prune() -> void:
	for i in range(aircraft.size() - 1, -1, -1):
		if not is_instance_valid(aircraft[i]):
			aircraft.remove_at(i)
	if player != null and not is_instance_valid(player):
		player = null

func _update_bots(dt: float) -> void:
	for rec in _pilots:
		if bool(rec.is_player) or float(rec.respawn_t) < 0.0:
			continue
		rec.respawn_t = float(rec.respawn_t) - dt
		if float(rec.respawn_t) <= 0.0:
			rec.respawn_t = -1.0
			_spawn_bot(rec)

func _update_player(_dt: float) -> void:
	if not _is_alive(player):
		return
	var fm = player.get("fm")
	if fm == null:
		return
	if not _airborne and not bool(fm.on_ground):
		var p: Vector3 = fm.pos
		if p.y - maxf(world.height_at(p.x, p.z), 0.0) > 30.0:
			_airborne = true
	var def = player.get("def")
	if def is Dictionary and bool(def.get("high_aoa", false)) and not cobra_done:
		var aoa := rad_to_deg(float(fm.aoa))
		if aoa > 60.0:
			if _cobra_t < 0.0:
				_cobra_t = elapsed
		elif _cobra_t >= 0.0:
			if elapsed - _cobra_t > 6.0:
				_cobra_t = -1.0
			elif aoa < 15.0:
				cobra_done = true
				_cobra_t = -1.0
				message.emit("Кобра", 2.0)

func _update_post_death(dt: float) -> void:
	if _post_death_t < 0.0:
		return
	_post_death_t -= dt
	if _post_death_t <= 0.0:
		_post_death_t = -1.0
		_after_death()

func _update_autospawn(dt: float) -> void:
	if not autopilot or state != "spawn" or _autospawn_t < 0.0:
		return
	_autospawn_t -= dt
	if _autospawn_t > 0.0:
		return
	_autospawn_t = -1.0
	for id in lineup:
		if request_spawn(String(id)):
			return

func _update_spectate(dt: float) -> void:
	if state != "spawn" and state != "dead":
		return
	_spectate_t -= dt
	if _spectate_t > 0.0:
		return
	_spectate_t = 0.5
	if not _is_alive(spectate_target):
		_spectate_teammate()

func _spectate_teammate() -> void:
	if state == "flying" or state == "killcam" or camera_rig == null:
		return
	var best = null
	for ac in aircraft:
		if _is_alive(ac) and int(ac.team) == 0 and ac != player:
			best = ac
			break
	if best == null:
		for ac in aircraft:
			if _is_alive(ac):
				best = ac
				break
	spectate_target = best
	if best != null:
		camera_rig.spectate(best)
	else:
		_fixed_view()

## Вид над своим аэродромом на центр карты, когда смотреть не на кого.
func _fixed_view() -> void:
	var home := Vector3(0.0, 0.0, 3600.0)
	for af in world.airfields:
		if int(af.team) == 0:
			home = af.pos
			break
	var eye := home + Vector3(0.0, 220.0, 0.0) + (home - Vector3(0.0, home.y, 0.0)).normalized() * 400.0
	camera_rig.set_mode(CameraRig.Mode.FIXED)
	var cam: Camera3D = camera_rig.camera
	if cam != null and is_instance_valid(cam) and cam.is_inside_tree():
		cam.look_at_from_position(eye, Vector3(0.0, home.y + 150.0, 0.0), Vector3.UP)
		cam.make_current()

func _set_state(s: String) -> void:
	if state == s:
		return
	state = s
	if s == "spawn" and autopilot:
		_autospawn_t = 0.5
	state_changed.emit(s)

# ---------------------------------------------------------------- урон и помощь

func _track_damage() -> void:
	for ac in aircraft:
		if _is_alive(ac):
			_poll_damage(ac)

func _poll_damage(ac) -> void:
	var d = ac.get("dmg")
	if d == null:
		return
	var a := int(d.last_attacker)
	var t := float(d.last_hit_time)
	var uid := int(ac.uid)
	if a >= 0 and t != float(_last_hit_seen.get(uid, -100.0)):
		_last_hit_seen[uid] = t
		note_damage(uid, a)

func _on_module_damaged(_module: String, _ratio: float, victim_uid: int) -> void:
	var ac = _entities.get(victim_uid)
	if ac == null or not is_instance_valid(ac):
		return
	var d = ac.get("dmg")
	if d != null and int(d.last_attacker) >= 0:
		note_damage(victim_uid, int(d.last_attacker))

## Отметить, что attacker повредил victim сейчас (для помощи в уничтожении).
func note_damage(victim_uid: int, attacker_uid: int) -> void:
	if attacker_uid < 0 or attacker_uid == victim_uid:
		return
	if not _damage_log.has(victim_uid):
		_damage_log[victim_uid] = {}
	_damage_log[victim_uid][attacker_uid] = elapsed

# ---------------------------------------------------------------- гибель самолёта

func _on_aircraft_destroyed(ac, killer_uid: int, reason: String) -> void:
	if ac == null or not is_instance_valid(ac):
		return
	var vuid := int(ac.uid)
	if _handled_dead.has(vuid):
		return
	_handled_dead[vuid] = true
	var vrec: Dictionary = _ac_rec.get(vuid, {})
	if vrec.is_empty():
		return
	_poll_damage(ac)
	vrec.alive = false
	if state == "ended":
		return
	vrec.deaths = int(vrec.deaths) + 1
	var vteam := int(ac.team)
	var vinfo: Dictionary = _ac_info.get(vuid, {"def_id": String(ac.def_id), "callsign": String(ac.callsign), "team": vteam})
	var victim_txt := "%s (%s)" % [_plane_name(String(vinfo.def_id)), String(vinfo.callsign)]

	var krec: Dictionary = _ac_rec.get(killer_uid, {}) if killer_uid >= 0 else {}
	var kunit = null
	if krec.is_empty() and killer_uid >= 0:
		var e = get_entity(killer_uid)
		if e != null and e is GroundUnit and int(e.team) != vteam:
			kunit = e
	if not krec.is_empty() and (int(krec.team) == vteam or int(krec.id) == int(vrec.id)):
		krec = {}
	var text := ""
	var kteam := -1
	var killer_name := ""
	var killer_plane := ""
	var killer_ref := -1
	if not krec.is_empty():
		var kinfo: Dictionary = _ac_info.get(killer_uid, {"def_id": String(krec.def_id), "callsign": String(krec.name)})
		killer_name = String(kinfo.callsign)
		killer_plane = _plane_name(String(kinfo.def_id))
		killer_ref = killer_uid
		text = "%s (%s) сбил %s" % [killer_plane, killer_name, victim_txt]
		kteam = int(krec.team)
		var pts := int(Data.ECONOMY.spawn_points.kill)
		krec.kills = int(krec.kills) + 1
		krec.score = int(krec.score) + pts
		if bool(krec.is_player):
			spawn_points += pts
			_reward("kill", String(kinfo.def_id))
			Sfx.play("hit", null, -2.0, 1.5)
	elif kunit != null:
		var kind := String(kunit.kind)
		text = "%s сбит %s" % [victim_txt, UNIT_BY.get(kind, "огнём с земли")]
		kteam = int(kunit.team)
		killer_name = String(UNIT_NAME.get(kind, "Цель"))
		killer_ref = killer_uid
	elif reason == "border":
		text = "%s вылетел за границу" % victim_txt
	else:
		text = "%s разбился" % victim_txt

	_count_assists(vuid, vteam, krec, killer_uid)
	if show_score:
		tickets[vteam] = maxf(0.0, float(tickets[vteam]) - float(Data.ECONOMY.ticket_loss_aircraft))
	kill_event.emit(text, kteam, vteam)
	recorder.event("kill", {"killer_uid": killer_ref, "victim_uid": vuid, "text": text, "reason": reason,
		"killer_team": kteam, "victim_team": vteam})

	if bool(vrec.is_player):
		_on_player_down(ac, killer_ref, reason, killer_name, killer_plane)
	else:
		vrec.lives = int(vrec.lives) - 1
		if int(vrec.lives) > 0 and not bool(vrec.external):
			vrec.respawn_t = BOT_RESPAWN_DELAY
		if ac == spectate_target:
			_spectate_t = 1.5
	_check_end()

func _count_assists(vuid: int, vteam: int, krec: Dictionary, killer_uid: int) -> void:
	var log: Dictionary = _damage_log.get(vuid, {})
	var counted := {}
	if not krec.is_empty():
		counted[int(krec.id)] = true
	for a in log:
		var auid := int(a)
		if auid == killer_uid or elapsed - float(log[a]) > ASSIST_WINDOW:
			continue
		var arec: Dictionary = _ac_rec.get(auid, {})
		if arec.is_empty() or int(arec.team) == vteam or counted.has(int(arec.id)):
			continue
		counted[int(arec.id)] = true
		var pts := int(Data.ECONOMY.spawn_points.assist)
		arec.assists = int(arec.assists) + 1
		arec.score = int(arec.score) + pts
		if bool(arec.is_player):
			spawn_points += pts
			_reward("assist", String(_ac_info.get(auid, {"def_id": arec.def_id}).def_id))
	_damage_log.erase(vuid)

func _on_player_down(ac, killer_uid: int, reason: String, killer_name: String, killer_plane: String) -> void:
	player = null
	_reclaim_player_pilot(ac)
	_cobra_t = -1.0
	player_killed.emit({"killer_name": killer_name, "killer_plane": killer_plane, "killer_uid": killer_uid, "reason": reason})
	if state == "ended":
		return
	if autopilot:
		_after_death()
		return
	_set_state("killcam")
	if killer_uid >= 0:
		_killcam = Killcam.new()
		_killcam.name = "Killcam"
		add_child(_killcam)
		_killcam.finished.connect(_on_killcam_finished, CONNECT_ONE_SHOT)
		_killcam.play(self, int(ac.uid), killer_uid)
	else:
		_post_death_t = maxf(crash_view_seconds, 0.0)
		if _post_death_t <= 0.0:
			_post_death_t = 0.0001

func _on_killcam_finished() -> void:
	if _killcam != null and is_instance_valid(_killcam):
		_killcam.queue_free()
	_killcam = null
	if camera_rig != null and camera_rig.camera != null and is_instance_valid(camera_rig.camera):
		camera_rig.camera.make_current()
	if state == "killcam":
		_after_death()

func _after_death() -> void:
	if state == "ended":
		return
	if mode == "realistic" or not _player_can_spawn_any():
		_set_state("dead")
		if mode == "arcade":
			message.emit("Вылетов не осталось", 4.0)
	else:
		_set_state("spawn")
	spectate_target = null
	_spectate_teammate()
	_check_end()

func _on_aircraft_serviced(ac) -> void:
	if ac == null or not is_instance_valid(ac) or state == "ended":
		return
	var rec: Dictionary = _ac_rec.get(int(ac.uid), {})
	if rec.is_empty() or not bool(rec.is_player):
		return
	# обслуживание сразу после старта с полосы — не посадка
	if not _airborne:
		return
	_airborne = false
	rec.landings = int(rec.landings) + 1
	_reward("landing", String(ac.def_id))
	message.emit("Ремонт и перезарядка закончены", 3.0)

# ---------------------------------------------------------------- наземные цели

func _on_ground_destroyed(unit, killer_uid: int) -> void:
	if unit == null or not is_instance_valid(unit):
		return
	var uid := int(unit.uid)
	if _handled_dead.has(uid):
		return
	_handled_dead[uid] = true
	if state == "ended":
		return
	var team := int(unit.team)
	var tv := int(unit.ticket_value)
	var kind := String(unit.kind)
	if show_score:
		tickets[team] = maxf(0.0, float(tickets[team]) - float(tv))
	var krec: Dictionary = _ac_rec.get(killer_uid, {}) if killer_uid >= 0 else {}
	if not krec.is_empty() and int(krec.team) == team:
		krec = {}
	var text := ""
	var kteam := -1
	if not krec.is_empty():
		var kinfo: Dictionary = _ac_info.get(killer_uid, {"def_id": String(krec.def_id), "callsign": String(krec.name)})
		var pts := ground_points(tv)
		krec.ground = int(krec.ground) + 1
		krec.score = int(krec.score) + pts
		kteam = int(krec.team)
		text = "%s (%s) уничтожил %s" % [_plane_name(String(kinfo.def_id)), String(kinfo.callsign), UNIT_ACC.get(kind, "цель")]
		if bool(krec.is_player):
			spawn_points += pts
			_reward("ground_per_ticket", String(kinfo.def_id), float(tv))
	else:
		text = String(UNIT_DESTROYED.get(kind, "Цель уничтожена"))
	kill_event.emit(text, kteam, team)
	recorder.event("ground_destroyed", {"uid": uid, "killer_uid": killer_uid, "kind": kind, "team": team})
	if "base_id" in unit and int(unit.base_id) >= 0:
		_check_base(int(unit.base_id))
	_check_end()

## Очки вылета и счёта за наземную цель: 40–100 по ценности цели.
static func ground_points(ticket_value: int) -> int:
	var sp: Dictionary = Data.ECONOMY.spawn_points
	var lo := float(sp.ground_min)
	var hi := float(sp.ground_max)
	var t := clampf((float(ticket_value) - 8.0) / 32.0, 0.0, 1.0)
	return int(round(lerpf(lo, hi, t)))

func _check_base(base_id: int) -> void:
	if _bases_dead.has(base_id):
		return
	for b in world.bases:
		if int(b.id) != base_id:
			continue
		for u in b.unit_uids:
			var e = get_entity(int(u))
			if e != null and bool(e.alive):
				return
		_bases_dead[base_id] = true
		var team := int(b.team)
		if show_score:
			tickets[team] = maxf(0.0, float(tickets[team]) - float(Data.ECONOMY.ticket_loss_base))
		message.emit("База синих уничтожена" if team == 0 else "База красных уничтожена", 4.0)
		return

# ---------------------------------------------------------------- зоны

func _zone_tick(dt: float) -> void:
	if zones_state.is_empty():
		return
	for i in mini(zones_state.size(), world.zones.size()):
		var z: Dictionary = world.zones[i]
		var inside: Array = [[], []]
		for ac in aircraft:
			if _is_alive(ac) and _in_zone(ac, z):
				inside[clampi(int(ac.team), 0, 1)].append(ac)
		_advance_zone(zones_state[i], inside, dt)
	var owned := [zone_owned_count(0), zone_owned_count(1)]
	var diff: int = owned[0] - owned[1]
	if diff != 0:
		var loser := 1 if diff > 0 else 0
		var drain := float(Data.ECONOMY.zone_drain_per_sec) * absi(diff) * dt
		tickets[loser] = maxf(0.0, float(tickets[loser]) - drain)

func _in_zone(ac, z: Dictionary) -> bool:
	var p: Vector3 = ac.global_position
	var c: Vector3 = z.pos
	var dx := p.x - c.x
	var dz := p.z - c.z
	var r := float(z.radius)
	if dx * dx + dz * dz > r * r:
		return false
	var ground := maxf(world.height_at(p.x, p.z), 0.0)
	return p.y - ground <= float(z.max_alt)

## progress: +1 — зона синих, -1 — красных. 8 с от нейтральной, 16 с от чужой.
func _advance_zone(zs: Dictionary, inside: Array, dt: float) -> void:
	var n0: int = inside[0].size()
	var n1: int = inside[1].size()
	var p := float(zs.progress)
	var owner := int(zs.owner)
	var rate := dt / ZONE_CAPTURE_TIME
	if n0 > 0 and n1 == 0:
		p = minf(1.0, p + rate)
	elif n1 > 0 and n0 == 0:
		p = maxf(-1.0, p - rate)
	elif n0 == 0 and n1 == 0:
		var rest := 0.0
		if owner == 0:
			rest = 1.0
		elif owner == 1:
			rest = -1.0
		p = move_toward(p, rest, rate * 0.5)
	if owner == 1 and p >= 0.0:
		owner = -1
	elif owner == 0 and p <= 0.0:
		owner = -1
	var captured_by := -1
	if p >= 1.0 - 1e-6 and owner != 0:
		p = 1.0
		owner = 0
		captured_by = 0
	elif p <= -1.0 + 1e-6 and owner != 1:
		p = -1.0
		owner = 1
		captured_by = 1
	zs.progress = p
	zs.owner = owner
	if captured_by >= 0:
		_on_zone_captured(zs, captured_by, inside[captured_by])

func _on_zone_captured(zs: Dictionary, team: int, members: Array) -> void:
	var zid := String(zs.id)
	message.emit(("Зона %s захвачена" if team == 0 else "Зона %s потеряна") % zid, 3.0)
	if team == 0:
		Sfx.play("capture")
	var pts := int(Data.ECONOMY.spawn_points.capture)
	for ac in members:
		var rec: Dictionary = _ac_rec.get(int(ac.uid), {})
		if rec.is_empty():
			continue
		rec.captures = int(rec.captures) + 1
		rec.score = int(rec.score) + pts
		if bool(rec.is_player):
			spawn_points += pts
			_reward("capture", String(ac.def_id))

# ---------------------------------------------------------------- конец боя

func _check_end() -> void:
	if state == "ended" or not show_score or not _ready_done:
		return
	var w := -2
	if float(tickets[0]) <= 0.0 or float(tickets[1]) <= 0.0:
		w = _ticket_leader()
	else:
		var out0 := _team_out(0)
		var out1 := _team_out(1)
		if out0 and out1:
			w = -1
		elif out1:
			w = 0
		elif out0:
			w = 1
		elif time_left <= 0.0:
			w = _ticket_leader()
	if w == -2:
		return
	winner = w
	if w == -1:
		_finish("draw")
	else:
		_finish("win" if w == 0 else "loss")

func _ticket_leader() -> int:
	var a := int(round(float(tickets[0])))
	var b := int(round(float(tickets[1])))
	if a == b:
		return -1
	return 0 if a > b else 1

## Команда выбыла: живых самолётов нет и никто больше не может взлететь.
func _team_out(team: int) -> bool:
	for ac in aircraft:
		if _is_alive(ac) and int(ac.team) == team:
			return false
	for rec in _pilots:
		if int(rec.team) != team:
			continue
		if bool(rec.is_player):
			if state != "dead" and _player_can_spawn_any():
				return false
		elif float(rec.respawn_t) >= 0.0 or bool(rec.alive):
			return false
	return true

func _finish(p_outcome: String) -> void:
	if paused:
		set_paused(false)
	outcome = p_outcome
	if winner == -2:
		winner = {"win": 0, "loss": 1, "draw": -1}.get(p_outcome, -2)
	_set_state("ended")
	if show_score:
		message.emit(String(OUTCOME_TEXT.get(p_outcome, "")), RESULTS_DELAY)
	result = _build_result(p_outcome)
	Game.last_result = result
	Game.last_replay = recorder.finish() if recorder != null else {}
	match_ended.emit(result)
	if leave_scene and is_inside_tree():
		get_tree().create_timer(RESULTS_DELAY, true).timeout.connect(_leave_to_results)

func _leave_to_results() -> void:
	if leave_scene:
		Game.go_results()

# ---------------------------------------------------------------- награды

func _rank_mult(def_id: String) -> float:
	var rm: Array = Data.ECONOMY.rank_mult
	var rank := int(Data.plane(def_id).get("rank", 1))
	return float(rm[clampi(rank, 0, rm.size() - 1)])

## Начислить награду за действие тому самолёту, на котором оно сделано.
func _reward(action: String, def_id: String, amount := 1.0) -> void:
	if not Data.ECONOMY.has(action):
		return
	var e: Dictionary = Data.ECONOMY[action]
	var m := amount * _rank_mult(def_id)
	if not _rewards.has(def_id):
		_rewards[def_id] = {"credits": 0.0, "xp": 0.0}
	_rewards[def_id].credits = float(_rewards[def_id].credits) + float(e.credits) * m
	_rewards[def_id].xp = float(_rewards[def_id].xp) + float(e.xp) * m

func _build_result(p_outcome: String) -> Dictionary:
	var r := _player_rec
	var credits := 0.0
	var xp: Dictionary = {}
	var part: Dictionary = Data.ECONOMY.participation
	if mode == "training":
		if not _planes_used.is_empty():
			credits = float(part.credits)
			xp[String(_planes_used[0])] = float(part.xp)
	elif mode != "test":
		for pid in _rewards:
			credits += float(_rewards[pid].credits)
			xp[pid] = float(xp.get(pid, 0.0)) + float(_rewards[pid].xp)
		var n := _planes_used.size()
		for pid in _planes_used:
			var rm := _rank_mult(String(pid))
			credits += float(part.credits) * rm / n
			xp[pid] = float(xp.get(pid, 0.0)) + float(part.xp) * rm / n
		if p_outcome == "win":
			var wm := float(Data.ECONOMY.win_mult)
			credits *= wm
			for k in xp:
				xp[k] = float(xp[k]) * wm
	var xp_int: Dictionary = {}
	for k in xp:
		xp_int[k] = int(round(float(xp[k])))
	return {
		"mode": mode, "map_id": map_id, "outcome": p_outcome, "duration": elapsed,
		"planes_used": _planes_used.duplicate(), "kills": int(r.kills), "ground_kills": int(r.ground),
		"assists": int(r.assists), "deaths": int(r.deaths), "captures": int(r.captures), "landings": int(r.landings),
		"score": int(r.score), "xp_by_plane": xp_int, "credits": int(round(credits)), "scoreboard": get_scoreboard(),
		"time_of_day": time_of_day, "weather": weather, "cobra": cobra_done,
		"size": size, "tickets": [float(tickets[0]), float(tickets[1])], "winner": winner,
		"player_name": String(r.name),
	}
