extends Node3D
## Скриншоты мира для проверки глазами.
## Запуск: xvfb-run ... godot --path skybreak --rendering-driver opengl3 res://tests/harness_world.tscn -- --set=maps
## Наборы: maps (обзор карт), close (аэродромы, авианосец, техника), sky (время суток × погода),
## night, fire (вспышки зенитки), gallery (все цели, целые и уничтоженные), clouds, low (графика «низкая»), storm.
## --out=папка (по умолчанию /tmp/skybreak-shots/world).

var out_dir := "/tmp/skybreak-shots/world"
var cam: Camera3D
var world: World
var gallery_center := Vector3.ZERO

func _ready() -> void:
	var set_name := "maps"
	var only := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--set="):
			set_name = a.substr(6)
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--only="):
			only = a.substr(7)
	DirAccess.make_dir_recursive_absolute(out_dir)
	cam = Camera3D.new()
	cam.fov = 70.0
	cam.near = 0.5
	cam.far = 14000.0
	add_child(cam)
	cam.current = true
	var jobs: Array = _jobs(set_name)
	for j in jobs:
		if only != "" and not String(j.name).contains(only):
			continue
		await _run_job(j)
	get_tree().quit()

func _jobs(set_name: String) -> Array:
	var out: Array = []
	match set_name:
		"maps":
			for m in ["canyon", "fjord", "reef"]:
				out.append({"name": "map_" + m, "map": m, "time": "day", "weather": "cloudy", "shots": ["overview", "overview2", "low"]})
		"close":
			out.append({"name": "close_canyon", "map": "canyon", "time": "day", "weather": "clear", "shots": ["airfield", "airfield_low", "base", "column", "aa"]})
			out.append({"name": "close_fjord", "map": "fjord", "time": "day", "weather": "clear", "shots": ["airfield", "column"]})
			out.append({"name": "close_reef", "map": "reef", "time": "day", "weather": "clear", "shots": ["carrier", "carrier_deck", "ship", "airfield", "column"]})
		"sky":
			for t in ["dawn", "day", "dusk", "night"]:
				for w in ["clear", "cloudy", "overcast", "fog", "storm"]:
					out.append({"name": "sky_%s_%s" % [t, w], "map": "canyon", "time": t, "weather": w, "shots": ["sky"]})
		"night":
			out.append({"name": "night_af", "map": "canyon", "time": "night", "weather": "clear", "shots": ["airfield", "airfield_far"]})
			out.append({"name": "night_carrier", "map": "reef", "time": "night", "weather": "clear", "shots": ["carrier"]})
		"fire":
			out.append({"name": "fire_aa", "map": "canyon", "time": "night", "weather": "clear", "shots": ["aa_fire"], "fire": true})
		"low":
			out.append({"name": "low_fjord", "map": "fjord", "time": "day", "weather": "clear", "shots": ["overview", "low"], "graphics": "low"})
			out.append({"name": "low_reef", "map": "reef", "time": "day", "weather": "cloudy", "shots": ["overview2"], "graphics": "low"})
		"storm":
			out.append({"name": "storm_flash", "map": "fjord", "time": "dusk", "weather": "storm", "shots": ["low", "flash"]})
		"gallery":
			out.append({"name": "gallery", "map": "canyon", "time": "day", "weather": "clear", "shots": ["gallery", "gallery_top", "gallery_far"], "gallery": true})
		"clouds":
			out.append({"name": "clouds_cloudy", "map": "reef", "time": "day", "weather": "cloudy", "shots": ["cloud_level", "cloud_above"]})
			out.append({"name": "clouds_overcast", "map": "fjord", "time": "day", "weather": "overcast", "shots": ["cloud_level", "cloud_above"]})
			out.append({"name": "clouds_dusk", "map": "canyon", "time": "dusk", "weather": "cloudy", "shots": ["cloud_level"]})
	return out

## Все виды целей в ряд на стоянке аэродрома (и уничтоженные).
func _make_gallery() -> void:
	var af: Dictionary = world.airfield_of(0)
	var c: Vector3 = af.pos
	var hd: float = af.heading
	var f := World.heading_dir(hd)
	var r := Vector3(cos(hd), 0, sin(hd))
	var base: Vector3 = c + r * 220.0 - f * 120.0
	var items := [["tank", ""], ["truck", ""], ["aa", "light"], ["aa", "heavy"], ["aa", "mobile"],
		["building", "hangar"], ["building", "bunker"], ["building", "fuel"], ["building", "depot"]]
	var x := 0.0
	var uid := 5000
	for dead in [false, true]:
		x = 0.0
		for it in items:
			var u := GroundUnit.new()
			u.variant = it[1]
			var w := 40.0 if it[0] == "building" else 14.0
			x += w * 0.5
			var p: Vector3 = base + f * x + r * (0.0 if not dead else 60.0)
			p.y = world.height_at(p.x, p.z)
			u.setup(it[0], 0 if not dead else 1, p, hd + PI * 0.5, uid, world)
			uid += 1
			world.add_child(u)
			u.active = false
			if dead:
				u.kill(-1, false, false)
			x += w * 0.5 + 6.0
	gallery_center = base + f * (x * 0.5) + r * 30.0

class FireBattle extends Node3D:
	var projectiles
	var fx = null
	var targets: Array = []
	func enemies_of(team: int) -> Array:
		return targets
	func get_entity(_uid: int):
		return null

class FireProj extends Node3D:
	func spawn_bullet(from: Vector3, velocity: Vector3, damage: float, caliber: float, owner_uid: int, team: int, tracer: bool) -> void:
		pass
	func spawn_flak(from: Vector3, velocity: Vector3, fuse_time: float, damage: float, radius: float, owner_uid: int, team: int) -> void:
		pass

class FireTarget extends Node3D:
	var team := 1
	var alive := true
	var in_cloud := false
	func velocity() -> Vector3:
		return Vector3(-100, 0, 0)

func _run_job(j: Dictionary) -> void:
	if world != null:
		world.queue_free()
		await get_tree().process_frame
	world = World.new()
	world.graphics = String(j.get("graphics", "high"))
	add_child(world)
	var t0 := Time.get_ticks_msec()
	world.build(Data.map_def(j.map), j.time, j.weather, 7, 100)
	print(j.name, ": build ", Time.get_ticks_msec() - t0, " ms")
	if j.get("gallery", false):
		_make_gallery()
	if j.get("fire", false):
		var fb := FireBattle.new()
		fb.projectiles = FireProj.new()
		fb.add_child(fb.projectiles)
		add_child(fb)
		Game.battle = fb
		var aa := _unit_of("aa", "heavy", 0)
		var t := FireTarget.new()
		add_child(t)
		t.global_position = aa.global_position + Vector3(400, 500, -500)
		fb.targets = [t]
		for i in 200:
			aa._physics_process(1.0 / 60.0)
			if aa._flash != null and aa._flash.visible:
				break
	for s in j.shots:
		_place_camera(String(s))
		if s == "flash":
			_place_camera("low")
			world.sky.lightning_enabled = false
			world.sky.show_flash(1.0)
		if world.sky != null and world.sky.clouds != null:
			world.sky.clouds.sort_for(cam.global_position)
		for i in (1 if s == "flash" else 6):
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		print("  draw calls ", Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			", objects ", Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
			", primitives ", Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		var img := get_viewport().get_texture().get_image()
		var path: String = out_dir.path_join("%s_%s.png" % [j.name, s])
		img.save_png(path)
		print("  saved ", path)

func _look(from: Vector3, at: Vector3) -> void:
	from.y = maxf(from.y, world.height_at(from.x, from.z) + 25.0)
	cam.global_position = from
	cam.look_at(at, Vector3.UP)

func _unit_of(kind: String, variant := "", team := -1) -> GroundUnit:
	for u in world.ground_units:
		if u.kind == kind and (variant == "" or u.variant == variant) and (team < 0 or u.team == team):
			return u
	return null

func _place_camera(s: String) -> void:
	var af: Dictionary = world.airfield_of(0)
	if af.is_empty() or af.kind != "airfield":
		af = world.airfield_of(1)
	match s:
		"overview":
			_look(Vector3(-2600, 1500, 4600), Vector3(0, 0, 0))
		"overview2":
			_look(Vector3(3800, 1500, -3800), Vector3(0, 100, 600))
		"low":
			var z: Dictionary = world.zones[1]
			var p: Vector3 = z.pos
			_look(p + Vector3(-900, 260, 700), p + Vector3(0, 40, 0))
		"airfield":
			var c: Vector3 = af.pos
			var f := World.heading_dir(af.heading)
			var r := Vector3(cos(af.heading), 0, sin(af.heading))
			_look(c - f * 500.0 + r * 500.0 + Vector3(0, 220, 0), c + r * 120.0)
		"airfield_low":
			var c: Vector3 = af.runway_start
			var f := World.heading_dir(af.heading)
			_look(c - f * 60.0 + Vector3(0, 6, 0), c + f * 600.0)
		"airfield_far":
			var c: Vector3 = af.pos
			var f := World.heading_dir(af.heading)
			_look(c - f * 3500.0 + Vector3(0, 300, 0), c)
		"base":
			var b: Dictionary = world.bases[0]
			var p: Vector3 = b.pos
			_look(p + Vector3(220, 140, 220), p)
		"column":
			var u := _unit_of("tank", "", 0)
			var p := u.global_position
			_look(p + Vector3(35, 22, 35), p)
		"aa":
			var u := _unit_of("aa", "heavy", 0)
			var p := u.global_position
			_look(p + Vector3(14, 8, 14), p + Vector3(0, 1.5, 0))
		"carrier":
			var c: Vector3 = world.carrier.center
			_look(c + Vector3(-260, 120, -240), c)
		"carrier_deck":
			var c: Vector3 = world.carrier.center
			_look(c + Vector3(-10, 14, 175), c + Vector3(0, 0, -100))
		"ship":
			var u := _unit_of("ship", "", 0)
			var p := u.global_position
			_look(p + Vector3(90, 50, 110), p)
		"sky":
			_look(Vector3(-1500, 700, 3000), Vector3(0, 450, 0))
		"aa_fire":
			var u := _unit_of("aa", "heavy", 0)
			var p := u.global_position
			_look(p + Vector3(-14, 6, 16), p + Vector3(0, 4, 0))
		"gallery":
			_look(gallery_center + Vector3(-70, 28, 90), gallery_center)
		"gallery_top":
			_look(gallery_center + Vector3(-20, 160, 60), gallery_center)
		"gallery_far":
			_look(gallery_center + Vector3(-300, 500, 400), gallery_center)
		"cloud_level":
			_look(Vector3(-2000, 1250, 2500), Vector3(0, 1300, 0))
		"cloud_above":
			_look(Vector3(-2500, 2600, 3500), Vector3(0, 800, 0))
