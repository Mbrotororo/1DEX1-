extends RefCounted
## Поддельный бой для тестов и скриншотов HUD: MatchManager, Aircraft, FlightModel, DamageModel,
## WeaponSystem, World, CameraRig, PlayerPilot с теми полями и методами, которые читает HUD.

const MODULES := ["engine", "fuel", "left_wing", "right_wing", "tail", "pilot", "structure"]


class FakeFM extends RefCounted:
	var def: Dictionary = {}
	var pos: Vector3 = Vector3.ZERO
	var vel: Vector3 = Vector3.ZERO
	var basis: Basis = Basis.IDENTITY
	var throttle: float = 0.8
	var afterburner: bool = false
	var gear_down: bool = false
	var on_ground: bool = false
	var airspeed: float = 0.0
	var aoa: float = 0.0
	var slip: float = 0.0
	var g_load: float = 1.0
	var stalled: bool = false
	var overspeed: bool = false
	var vertical_speed: float = 0.0
	var mach: float = 0.0
	var engine_rpm: float = 0.8

	func forward() -> Vector3:
		return -basis.z

	func up() -> Vector3:
		return basis.y

	func right() -> Vector3:
		return basis.x

	func bank() -> float:
		var f := forward()
		var r0 := f.cross(Vector3.UP)
		if r0.length_squared() < 0.0001:
			return 0.0
		r0 = r0.normalized()
		var u0 := r0.cross(f).normalized()
		return atan2(basis.y.dot(r0), basis.y.dot(u0))

	func pitch_angle() -> float:
		return asin(clampf(forward().y, -1.0, 1.0))

	func heading() -> float:
		var f := forward()
		return atan2(f.x, -f.z)

	func stall_speed() -> float:
		return 48.0


class FakeDmg extends RefCounted:
	var ratios: Dictionary = {}
	var on_fire: bool = false
	var engine_dead: bool = false
	var last_attacker: int = -1
	var last_hit_time: float = -100.0

	func _init() -> void:
		for m in ["engine", "fuel", "left_wing", "right_wing", "tail", "pilot", "structure"]:
			ratios[m] = 1.0

	func module_ratio(m: String) -> float:
		return float(ratios.get(m, 1.0))

	func is_damaged() -> bool:
		for m in ratios:
			if float(ratios[m]) < 0.999:
				return true
		return false

	func is_destroyed() -> bool:
		return false


class FakeWeapons extends RefCounted:
	var def: Dictionary = {}
	var ammo: Dictionary = {}
	var max_ammo: Dictionary = {}
	var lock_target = null
	var lock_progress: float = 0.0
	var bomb_cooldown: float = 0.0

	func setup(p_def: Dictionary) -> void:
		def = p_def
		var w: Dictionary = def.weapons
		var guns: Array = []
		for g in w.guns:
			guns.append(int(g.ammo))
		max_ammo = {"guns": guns, "rockets": int(w.rockets.count), "bombs": int(w.bombs.count),
			"missiles": int(w.missiles.count), "flares": int(w.flares)}
		ammo = max_ammo.duplicate(true)

	func gun_convergence() -> float:
		return 400.0

	func gun_speed() -> float:
		var guns: Array = def.weapons.guns
		return float(guns[0].speed) if guns.size() > 0 else 800.0

	func summary() -> Array:
		var out: Array = []
		var guns: Array = def.weapons.guns
		for i in guns.size():
			out.append({"label": String(guns[i].label), "cur": int(ammo.guns[i]), "max": int(max_ammo.guns[i])})
		for e in [["rockets", "Ракеты"], ["bombs", "Бомбы"], ["missiles", "Ракеты В-В"], ["flares", "Ловушки"]]:
			if int(max_ammo.get(e[0], 0)) > 0:
				out.append({"label": e[1], "cur": int(ammo[e[0]]), "max": int(max_ammo[e[0]])})
		return out

	func is_empty() -> bool:
		for g in ammo.guns:
			if int(g) > 0:
				return false
		for k in ["rockets", "bombs", "missiles"]:
			if int(ammo.get(k, 0)) > 0:
				return false
		return true

	func has_ordnance() -> bool:
		return int(ammo.get("rockets", 0)) > 0 or int(ammo.get("bombs", 0)) > 0


class FakePilot extends Node:
	var aim_dir: Vector3 = Vector3.FORWARD
	var mode: String = "mouse"
	var touch_input: Dictionary = {}

	func get_controls(_ac, _dt: float) -> Dictionary:
		return Data.empty_controls()

	func reset_aim(_ac) -> void:
		pass


class FakeAircraft extends Node3D:
	signal destroyed(aircraft, killer_uid: int, reason: String)
	signal serviced(aircraft)
	var uid: int = 0
	var team: int = 0
	var def_id: String = ""
	var def: Dictionary = {}
	var callsign: String = ""
	var camo_id: String = "factory"
	var is_player: bool = false
	var alive: bool = true
	var fm: FakeFM
	var dmg: FakeDmg
	var weapons: FakeWeapons
	var pilot = null
	var model: Node3D = null
	var controls: Dictionary = {}
	var in_cloud: bool = false
	var servicing: bool = false
	var service_progress: float = 0.0
	var border_time: float = 0.0
	var ground_height: float = 0.0

	func setup_fake(p_def_id: String, p_team: int, p_uid: int, p_callsign: String, p: Vector3, b: Basis, spd: float) -> void:
		def_id = p_def_id
		def = Data.plane(p_def_id)
		team = p_team
		uid = p_uid
		callsign = p_callsign
		fm = FakeFM.new()
		fm.def = def
		dmg = FakeDmg.new()
		weapons = FakeWeapons.new()
		weapons.setup(def)
		place(p, b, spd)

	func place(p: Vector3, b: Basis, spd: float) -> void:
		fm.pos = p
		fm.basis = b.orthonormalized()
		fm.vel = -fm.basis.z * spd
		fm.airspeed = spd
		fm.vertical_speed = fm.vel.y
		transform = Transform3D(fm.basis, p)

	func forward() -> Vector3:
		return -global_transform.basis.z

	func velocity() -> Vector3:
		return fm.vel

	func speed() -> float:
		return fm.vel.length()

	func altitude_agl() -> float:
		return global_position.y - maxf(ground_height, 0.0)

	func hit_radius() -> float:
		return 8.0


class FakeGround extends Node3D:
	signal destroyed(unit, killer_uid: int)
	var uid: int = 0
	var kind: String = "tank"
	var team: int = 1
	var hp: float = 100.0
	var max_hp: float = 100.0
	var alive: bool = true
	var radius: float = 5.0
	var armored: bool = true
	var base_id: int = -1
	var ticket_value: int = 15


class FakeCameraRig extends Node3D:
	enum Mode { CHASE, COCKPIT, FREE_LOOK, SPECTATE, FIXED }
	var mode: int = 0
	var camera: Camera3D
	var target = null
	var toggles: int = 0

	func _init() -> void:
		camera = Camera3D.new()
		camera.fov = 70.0
		camera.far = 14000.0
		add_child(camera)

	func follow(ac) -> void:
		target = ac

	func set_mode(m: int) -> void:
		mode = m

	func toggle_cockpit() -> void:
		toggles += 1
		mode = 1 if mode == 0 else 0

	func spectate(ac) -> void:
		target = ac
		mode = 3

	func shake(_amount: float) -> void:
		pass


class FakeWorld extends Node3D:
	var map: Dictionary = {"id": "canyon", "name": "Красный каньон", "biome": "desert"}
	var time_of_day: String = "day"
	var weather: String = "clear"
	var is_night: bool = false
	var airfields: Array = []
	var zones: Array = []
	var bases: Array = []
	var ground_units: Array = []
	var clouds: Array = []        # [{pos:Vector3, radius:float}]

	func _init() -> void:
		airfields = [
			{"team": 0, "kind": "airfield", "pos": Vector3(400, 40, 3700), "heading": 0.2, "length": 1400.0, "width": 45.0,
				"runway_start": Vector3(400, 40, 4300), "service_radius": 350.0},
			{"team": 1, "kind": "airfield", "pos": Vector3(-500, 60, -3700), "heading": PI + 0.1, "length": 1400.0, "width": 45.0,
				"runway_start": Vector3(-500, 60, -4300), "service_radius": 350.0},
		]
		zones = [
			{"id": "A", "pos": Vector3(-1800, 20, 200), "radius": 450.0, "max_alt": 500.0},
			{"id": "B", "pos": Vector3(0, 10, -100), "radius": 450.0, "max_alt": 500.0},
			{"id": "C", "pos": Vector3(1900, 30, 300), "radius": 450.0, "max_alt": 500.0},
		]
		bases = [
			{"id": 0, "team": 0, "pos": Vector3(-1600, 50, 2600), "unit_uids": []},
			{"id": 1, "team": 1, "pos": Vector3(1500, 70, -2500), "unit_uids": []},
		]

	func height_at(x: float, z: float) -> float:
		var h := 120.0 + 180.0 * sin(x * 0.0011) * cos(z * 0.0009) + 90.0 * sin(x * 0.0031 + 1.3) * sin(z * 0.0027)
		h += 260.0 * clampf((absf(x + z * 0.3) - 3000.0) / 2000.0, 0.0, 1.0)
		var river := absf(x - 600.0 * sin(z * 0.0008))
		if river < 260.0:
			h = lerpf(-40.0, h, river / 260.0)
		return h

	func surface_at(x: float, z: float) -> Dictionary:
		var h := height_at(x, z)
		return {"height": maxf(h, 0.0), "kind": "water" if h < 0.0 else "ground", "team": -1, "flat": true}

	func cloud_density_at(p: Vector3) -> float:
		var best := 0.0
		for c in clouds:
			var d := p.distance_to(c.pos)
			if d < float(c.radius):
				best = maxf(best, 1.0 - d / float(c.radius))
		return clampf(best * 1.6, 0.0, 1.0)

	func half_size() -> float:
		return 5000.0


class FakeProjectiles extends Node3D:
	var incoming: int = 0

	func incoming_missiles(_target) -> int:
		return incoming


class FakeBattle extends Node3D:
	signal kill_event(text: String, killer_team: int, victim_team: int)
	signal message(text: String, seconds: float)
	signal state_changed(state: String)
	signal player_spawned(ac)
	signal player_killed(info: Dictionary)
	signal match_ended(result: Dictionary)

	var config: Dictionary = {}
	var mode: String = "arcade"
	var world
	var projectiles
	var fx = null
	var recorder = null
	var camera_rig
	var hud = null
	var aircraft: Array = []
	var ground_units: Array = []
	var player = null
	var player_pilot
	var tickets: Array = [700.0, 700.0]
	var max_tickets: float = 700.0
	var time_left: float = 900.0
	var elapsed: float = 0.0
	var zones_state: Array = []
	var state: String = "spawn"
	var spawn_points: int = 0
	var lineup: Array = []
	var lineup_uses: Dictionary = {}
	var markers_enabled: bool = true
	var paused: bool = false
	var show_score: bool = true
	var spectate_target = null
	var pause_tree: bool = true

	var spawn_requests: Array = []
	var pause_calls: Array = []
	var quit_calls: int = 0
	var spawned_once: bool = false
	var player_score: Dictionary = {"kills": 2, "ground": 1, "deaths": 1, "score": 390}

	func spawn_cost(def_id: String) -> int:
		if not spawned_once or mode != "arcade":
			return 0
		var rank := int(Data.plane(def_id).get("rank", 1))
		return int(Data.ECONOMY.spawn_cost_by_rank[rank])

	func can_spawn(def_id: String) -> bool:
		if state != "spawn":
			return false
		if int(lineup_uses.get(def_id, 0)) <= 0:
			return false
		return spawn_points >= spawn_cost(def_id)

	func request_spawn(def_id: String) -> bool:
		spawn_requests.append(def_id)
		if not can_spawn(def_id):
			return false
		spawn_points -= spawn_cost(def_id)
		lineup_uses[def_id] = int(lineup_uses[def_id]) - 1
		spawned_once = true
		return true

	func get_scoreboard() -> Array:
		var rows: Array = []
		for ac in aircraft:
			if ac == player:
				continue
			var n := int(ac.uid)
			rows.append({"uid": n, "name": String(ac.callsign), "team": int(ac.team), "plane": String(ac.def.name),
				"kills": n % 3, "ground": n % 2, "deaths": (n + 1) % 2, "score": (n % 3) * 150 + (n % 2) * 60, "is_player": false,
				"alive": bool(ac.alive)})
		rows.append({"uid": 1, "name": "1DEX1", "team": 0, "plane": "Шмель", "kills": int(player_score.kills),
			"ground": int(player_score.ground), "deaths": int(player_score.deaths), "score": int(player_score.score),
			"is_player": true, "alive": true})
		rows.sort_custom(func(a, b): return int(a.score) > int(b.score))
		return rows

	func player_stats() -> Dictionary:
		return {}

	func set_paused(on: bool) -> void:
		paused = on
		pause_calls.append(on)
		if pause_tree and is_inside_tree():
			get_tree().paused = on

	func quit_to_hangar() -> void:
		quit_calls += 1

	func enemies_of(team: int) -> Array:
		var out: Array = []
		for ac in aircraft:
			if is_instance_valid(ac) and ac.alive and int(ac.team) != team:
				out.append(ac)
		return out

	func ground_targets_of(team: int) -> Array:
		var out: Array = []
		for g in ground_units:
			if is_instance_valid(g) and g.alive and int(g.team) == team:
				out.append(g)
		return out

	func get_entity(uid: int):
		for ac in aircraft:
			if int(ac.uid) == uid:
				return ac
		return null

	func next_uid() -> int:
		return 9999

	func set_state(s: String) -> void:
		state = s
		state_changed.emit(s)


## Собирает бой: игрок на Шмеле (или def_id) в воздухе, союзники и враги вокруг, наземные цели.
static func make_battle(p_mode: String = "arcade", player_def: String = "shmel") -> FakeBattle:
	var b := FakeBattle.new()
	b.name = "FakeBattle"
	b.mode = p_mode
	b.markers_enabled = p_mode in ["arcade", "test", "training"]
	b.show_score = p_mode in ["arcade", "realistic"]
	b.world = FakeWorld.new()
	b.world.name = "World"
	b.add_child(b.world)
	b.projectiles = FakeProjectiles.new()
	b.projectiles.name = "Projectiles"
	b.add_child(b.projectiles)
	b.camera_rig = FakeCameraRig.new()
	b.camera_rig.name = "CameraRig"
	b.add_child(b.camera_rig)
	b.player_pilot = FakePilot.new()
	b.player_pilot.name = "PlayerPilot"
	b.add_child(b.player_pilot)
	b.lineup = [player_def, "burevestnik", "shtorm", "fantom"] if p_mode != "test" else [player_def]
	for id in b.lineup:
		b.lineup_uses[id] = 2 if p_mode == "arcade" else (1 if p_mode == "realistic" else 99)
	b.spawn_points = 200
	b.tickets = [640.0, 455.0]
	b.time_left = 612.0
	b.zones_state = [{"id": "A", "owner": 0, "progress": 1.0}, {"id": "B", "owner": -1, "progress": -0.45},
		{"id": "C", "owner": 1, "progress": -1.0}]

	var heading := Basis(Vector3.UP, deg_to_rad(8.0))
	var pl := FakeAircraft.new()
	pl.name = "Player"
	pl.setup_fake(player_def, 0, 1, "1DEX1", Vector3(0, 900, 1200), heading * Basis(Vector3.RIGHT, deg_to_rad(4.0)), 128.0)
	pl.is_player = true
	pl.pilot = b.player_pilot
	b.add_child(pl)
	b.player = pl
	b.aircraft.append(pl)
	var others := [
		["krechet", 0, "Иней", Vector3(-160, 930, 1050)],
		["strizh", 0, "Барс", Vector3(260, 870, 980)],
		["burevestnik", 0, "Клён", Vector3(-900, 700, 1500)],
		["krechet", 1, "Гром", Vector3(120, 960, 520)],
		["strizh", 1, "Вихрь", Vector3(-420, 1010, 300)],
		["shmel", 1, "Коршун", Vector3(700, 820, -400)],
		["burevestnik", 1, "Буран", Vector3(-2200, 900, 2200)],
	]
	var uid := 2
	for o in others:
		var ac := FakeAircraft.new()
		ac.name = "AC%d" % uid
		var yaw := deg_to_rad(180.0 + uid * 23.0) if int(o[1]) == 1 else deg_to_rad(uid * 9.0)
		ac.setup_fake(String(o[0]), int(o[1]), uid, String(o[2]), o[3], Basis(Vector3.UP, yaw), 120.0)
		b.add_child(ac)
		b.aircraft.append(ac)
		uid += 1
	var gpos := [Vector3(300, 0, -900), Vector3(380, 0, -960), Vector3(-200, 0, -1300), Vector3(2600, 0, -2400)]
	for i in gpos.size():
		var g := FakeGround.new()
		g.uid = 1000 + i
		g.name = "Ground%d" % i
		var p: Vector3 = gpos[i]
		p.y = maxf(b.world.height_at(p.x, p.z), 0.0)
		g.position = p
		b.add_child(g)
		b.ground_units.append(g)
	return b


## Камера за самолётом игрока (сзади-сверху).
static func chase_camera(b: FakeBattle) -> void:
	var pl = b.player
	var cam: Camera3D = b.camera_rig.camera
	var f: Vector3 = pl.forward()
	var eye: Vector3 = pl.global_position - f * 28.0 + Vector3.UP * 7.0
	cam.look_at_from_position(eye, pl.global_position + f * 400.0, Vector3.UP)
	cam.make_current()
	b.player_pilot.aim_dir = (pl.global_position + f * 400.0 + Vector3(18, 10, 0) - eye).normalized()
