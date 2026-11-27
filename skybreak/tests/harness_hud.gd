extends Node3D
## Скриншоты HUD на поддельном бое.
## Запуск: xvfb-run ... godot --path skybreak --rendering-driver opengl3 --resolution 1280x720 \
##   res://tests/harness_hud.tscn -- --shot=all [--out=/tmp/skybreak-shots/hud] [--suffix=_phone]

const Fakes = preload("res://tests/harness_hud_fakes.gd")

const SHOTS := ["arcade", "realistic", "cockpit", "spawn", "pause", "settings", "scoreboard", "touch",
	"killcam", "dead", "ended", "test_mode", "touch_jet", "touch_left"]

var out_dir := "/tmp/skybreak-shots/hud"
var suffix := ""
var shots: Array = []
var env_root: Node3D


func _ready() -> void:
	var want := "all"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			want = a.substr(7)
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--suffix="):
			suffix = a.substr(9)
	shots = SHOTS.duplicate() if want == "all" else want.split(",")
	DirAccess.make_dir_recursive_absolute(out_dir)
	_build_env()
	_run.call_deferred()


func _run() -> void:
	for s in shots:
		await _shot(String(s))
	get_tree().quit()


func _build_env() -> void:
	env_root = Node3D.new()
	add_child(env_root)
	var we := WorldEnvironment.new()
	var env := Environment.new()
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color(0.30, 0.50, 0.78)
	mat.sky_horizon_color = Color(0.72, 0.80, 0.88)
	mat.ground_horizon_color = Color(0.72, 0.74, 0.74)
	mat.ground_bottom_color = Color(0.4, 0.38, 0.33)
	sky.sky_material = mat
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.fog_enabled = true
	env.fog_light_color = Color(0.72, 0.79, 0.86)
	env.fog_density = 0.00012
	we.environment = env
	env_root.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-48.0), deg_to_rad(30.0), 0.0)
	sun.light_energy = 1.1
	env_root.add_child(sun)
	env_root.add_child(_terrain())
	var water := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(30000, 30000)
	water.mesh = pm
	var wm := StandardMaterial3D.new()
	wm.albedo_color = Color(0.16, 0.34, 0.46)
	wm.roughness = 0.25
	water.material_override = wm
	env_root.add_child(water)


func _terrain() -> MeshInstance3D:
	var w = Fakes.FakeWorld.new()
	var n := 140
	var half := 7000.0
	var step := half * 2.0 / n
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var low := Color(0.50, 0.38, 0.25)
	var high := Color(0.82, 0.70, 0.52)
	for j in n:
		for i in n:
			var quad := [Vector2(i, j), Vector2(i + 1, j), Vector2(i + 1, j + 1), Vector2(i, j), Vector2(i + 1, j + 1), Vector2(i, j + 1)]
			for q in quad:
				var x: float = -half + q.x * step
				var z: float = -half + q.y * step
				var h: float = w.height_at(x, z)
				st.set_color(low.lerp(high, clampf(h / 500.0, 0.0, 1.0)))
				st.add_vertex(Vector3(x, h, z))
	st.generate_normals()
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.95
	mi.material_override = m
	w.free()
	return mi


func _plane_mesh(ac) -> Node3D:
	var root := Node3D.new()
	var shape: Dictionary = ac.def.shape
	var col := Color(0.42, 0.52, 0.62) if int(ac.team) == 0 else Color(0.62, 0.40, 0.36)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = col
	var parts := [
		[Vector3(float(shape.fuselage_radius) * 2.0, float(shape.fuselage_radius) * 2.0, float(shape.length)), Vector3.ZERO],
		[Vector3(float(shape.span), 0.25, float(shape.chord)), Vector3(0, 0, float(shape.wing_z))],
		[Vector3(float(shape.span) * 0.38, 0.2, float(shape.chord) * 0.5), Vector3(0, 0.2, float(shape.length) * 0.42)],
		[Vector3(0.2, 2.0, float(shape.chord) * 0.6), Vector3(0, 1.0, float(shape.length) * 0.42)],
	]
	for p in parts:
		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = p[0]
		mi.mesh = bm
		mi.position = p[1]
		mi.material_override = mat
		root.add_child(mi)
	return root


func _ground_mesh() -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(5, 3, 8)
	mi.mesh = bm
	var m := StandardMaterial3D.new()
	m.albedo_color = Color(0.32, 0.30, 0.24)
	mi.material_override = m
	mi.position.y = 1.5
	return mi


func _shot(name: String) -> void:
	var mode := "arcade"
	match name:
		"realistic", "cockpit":
			mode = "realistic"
		"test_mode":
			mode = "test"
	var b = Fakes.make_battle(mode, "flanker" if name == "touch_jet" else "shmel")
	add_child(b)
	for ac in b.aircraft:
		if ac != b.player or name != "cockpit":
			ac.add_child(_plane_mesh(ac))
	for g in b.ground_units:
		g.add_child(_ground_mesh())
	Fakes.chase_camera(b)
	var hud := BattleHUD.new()
	hud.set_touch_override(1 if name.begins_with("touch") else 0)
	b.add_child(hud)
	b.hud = hud
	b.pause_tree = false
	hud.bind(b)
	var pl = b.player
	b.state = "flying"
	match name:
		"arcade", "touch", "touch_jet", "touch_left", "test_mode":
			_damage(pl)
			b.kill_event.emit("Кречет (Иней) сбил Шмель (Коршун)", 0, 1)
			b.kill_event.emit("Кречет (Гром) сбил Стриж (Барс)", 1, 0)
			b.kill_event.emit("Шмель (1DEX1) сбил Стриж (Вихрь)", 0, 1)
			b.kill_event.emit("Буревестник (Клён) сбит зениткой", -1, 0)
			b.message.emit("Зона A захвачена", 8.0)
			pl.weapons.lock_target = b.aircraft[4]
			pl.weapons.lock_progress = 0.6
			if name == "touch_jet":
				pl.fm.afterburner = true
				pl.fm.throttle = 1.0
				pl.weapons.lock_progress = 1.0
		"realistic":
			pl.fm.gear_down = true
			pl.fm.g_load = 7.6
			pl.dmg.ratios["right_wing"] = 0.3
			pl.dmg.ratios["tail"] = 0.6
			pl.dmg.last_hit_time = 1.0
			b.message.emit("Дай полный газ: W. После взлёта убери шасси: G", 8.0)
		"cockpit":
			b.camera_rig.mode = 1
			pl.fm.throttle = 0.92
			pl.fm.g_load = 2.4
			pl.fm.vertical_speed = 12.0
			pl.place(pl.global_position, Basis(Vector3.UP, deg_to_rad(-62.0)) * Basis(Vector3.FORWARD, deg_to_rad(-25.0)) * Basis(Vector3.RIGHT, deg_to_rad(6.0)), 130.0)
			pl.fm.vertical_speed = 12.0
			pl.fm.gear_down = false
			pl.dmg.on_fire = true
			var cam: Camera3D = b.camera_rig.camera
			cam.global_transform = Transform3D(pl.global_transform.basis, pl.global_position + pl.global_transform.basis.y * 1.0)
			cam.make_current()
		"spawn":
			b.state = "spawn"
			b.spawned_once = true
			b.lineup_uses["burevestnik"] = 0
			b.spawn_points = 300
		"pause", "settings":
			b.paused = true
		"scoreboard":
			Input.action_press("scoreboard")
		"killcam":
			b.player_killed.emit({"killer_name": "Иней", "killer_plane": "Кречет", "killer_uid": 3, "reason": "structure"})
			b.state = "killcam"
		"dead":
			b.state = "dead"
			b.spectate_target = b.aircraft[1]
		"ended":
			b.state = "ended"
			b.match_ended.emit({"outcome": "win"})
	b.state_changed.emit(b.state)
	for i in 4:
		await get_tree().process_frame
	if name == "touch_left":
		hud.touch.left_handed = true
		hud.touch.layout()
	if name == "pause":
		hud.pause_menu.show_page("controls")
	elif name == "settings":
		hud.pause_menu.show_page("settings")
	for i in 10:
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := out_dir.path_join(name + suffix + ".png")
	img.save_png(path)
	print("saved ", path, " ", img.get_size())
	Input.action_release("scoreboard")
	b.queue_free()
	await get_tree().process_frame


func _damage(pl) -> void:
	pl.dmg.ratios["left_wing"] = 0.55
	pl.dmg.ratios["engine"] = 0.25
	pl.dmg.ratios["tail"] = 0.0
	pl.dmg.on_fire = true
	pl.fm.throttle = 0.86
	pl.fm.g_load = 3.4
	pl.weapons.ammo.guns[0] = 37
	pl.weapons.ammo.rockets = 2
	pl.weapons.ammo.bombs = 0
