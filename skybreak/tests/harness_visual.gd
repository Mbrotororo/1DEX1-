extends Node3D
## Скриншоты моделей и ангара для проверки глазами.
## Аргументы: --mode=planes|views|camos|showroom|props  --out=/tmp/skybreak-shots/visual  --only=id

var out_dir := "/tmp/skybreak-shots/visual"
var mode := "planes"
var only := ""
var zoom := 1.0
var hide := ""
var yaw := 0.0
var cam: Camera3D


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--mode="):
			mode = a.substr(7)
		elif a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--only="):
			only = a.substr(7)
		elif a.begins_with("--hide="):
			hide = a.substr(7)
		elif a.begins_with("--zoom="):
			zoom = float(a.substr(7))
		elif a.begins_with("--yaw="):
			yaw = float(a.substr(6))
	DirAccess.make_dir_recursive_absolute(out_dir)
	await get_tree().process_frame
	match mode:
		"showroom":
			await _showroom()
		_:
			await _studio()
	get_tree().quit()


func _shot(name: String) -> void:
	for i in 4:
		await get_tree().process_frame
	var img := get_viewport().get_texture().get_image()
	img.save_png(out_dir.path_join(name + ".png"))
	print("saved ", name)


func _ids() -> Array:
	if only != "":
		return only.split(",")
	return Data.ORDER


func _studio() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.93, 0.94, 0.95)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.85, 0.87, 0.9)
	env.ambient_light_energy = 0.35
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 0.9
	sun.shadow_enabled = true
	add_child(sun)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, 150, 0)
	fill.light_energy = 0.25
	add_child(fill)
	var floor_mi := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(200, 200)
	floor_mi.mesh = pm
	var fm := StandardMaterial3D.new()
	fm.albedo_color = Color(0.9, 0.91, 0.92)
	floor_mi.material_override = fm
	add_child(floor_mi)
	cam = Camera3D.new()
	cam.fov = 40
	add_child(cam)
	cam.current = true
	match mode:
		"camos":
			var picks := [["strizh", "desert"], ["shmel", "winter"], ["flanker", "night"], ["mirage", "desert"],
				["fantom", "winter"], ["krechet", "night"], ["groza", "desert"], ["sokol", "factory"]]
			for pk in picks:
				await _plane_shot(pk[0], pk[1], floor_mi, "camo_%s_%s" % [pk[0], pk[1]], 0)
		"views":
			for id in _ids():
				for v in [1, 2, 3, 4]:
					await _plane_shot(id, "factory", floor_mi, "view%d_%s" % [v, id], v)
		"props":
			for id in _ids():
				await _plane_shot(id, "factory", floor_mi, "fx_%s" % id, 5)
		_:
			for id in _ids():
				await _plane_shot(id, "factory", floor_mi, "plane_%s" % id, 0)


func _plane_shot(id: String, camo_id: String, floor_mi: MeshInstance3D, name: String, view: int) -> void:
	var def: Dictionary = Data.plane(id)
	var m: Node3D = AircraftMeshBuilder.build(def, Data.camo(id, camo_id))
	add_child(m)
	for hn in hide.split(",", false):
		var hnode := m.get_node_or_null(hn) as Node3D
		if hnode:
			hnode.visible = false
	var gh: float = def.shape.gear_height
	var L: float = def.shape.length
	var S: float = def.shape.span
	m.position = Vector3(0, gh, 0)
	floor_mi.visible = view == 0 or view == 5
	var d := (maxf(L, S) * 1.25 + 2.0) / zoom
	var target := Vector3(0, gh * 0.7, 0)
	match view:
		1:  # сбоку
			m.position.y = 0.0
			AircraftMeshBuilder.set_gear(m, true)
			cam.position = Vector3(d * 1.15, 0.3, 0)
			target = Vector3(0, 0.3, 0)
		2:  # сверху
			m.position.y = 0.0
			AircraftMeshBuilder.set_gear(m, false)
			cam.position = Vector3(0, d * 1.2, 0.01)
			target = Vector3.ZERO
		3:  # спереди
			m.position.y = 0.0
			cam.position = Vector3(0, 0.6, -d * 1.1)
			target = Vector3(0, 0.3, 0)
		4:  # сзади-сверху в полёте
			m.position.y = 0.0
			AircraftMeshBuilder.set_gear(m, false)
			AircraftMeshBuilder.set_afterburner(m, true)
			AircraftMeshBuilder.spin_props(m, 1.0, 0.016)
			cam.position = Vector3(d * 0.55, d * 0.42, d * 0.75)
			target = Vector3.ZERO
		5:
			AircraftMeshBuilder.set_afterburner(m, true)
			AircraftMeshBuilder.spin_props(m, 0.5, 0.016)
			cam.position = Vector3(-d * 0.6, gh + d * 0.25, d * 0.75)
		_:
			var gp: float = m.get_meta("ground_pitch", 0.0)
			if gp > 0.0:
				var mc: Vector3 = m.get_meta("main_contact", Vector3.ZERO)
				m.transform = Transform3D(Basis(Vector3.RIGHT, gp), Vector3.ZERO) * Transform3D(Basis.IDENTITY, -mc)
				m.position += Vector3(0, 0, mc.z)
			cam.position = Vector3(-d * 0.62, gh + d * 0.22, -d * 0.72)
			if yaw != 0.0:
				cam.position = Vector3(-d * 0.62, gh + d * 0.22, -d * 0.72).rotated(Vector3.UP, deg_to_rad(yaw))
	cam.look_at(target)
	await _shot(name)
	m.queue_free()
	await get_tree().process_frame


func _showroom() -> void:
	var sr := Showroom.new()
	add_child(sr)
	sr.auto_rotate = false
	# качество задаём напрямую, без записи в профиль игрока
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--quality="):
			sr._hall.apply_quality(a.substr(10))
	await get_tree().process_frame
	for id in _ids():
		sr.show_plane(id, "factory")
		sr.reset_view()
		if zoom != 1.0 or yaw != 0.0:
			await get_tree().process_frame
			sr._t_dist = sr._dist_default / zoom
			sr._t_yaw = Showroom.DEFAULT_YAW + deg_to_rad(yaw)
		for i in 40:
			await get_tree().process_frame
		await _shot("showroom_%s" % id)
	if zoom != 1.0 or yaw != 0.0:
		return
	# другие ракурсы
	sr.show_plane("flanker", "night")
	for i in 30:
		await get_tree().process_frame
	var views := [[0.55, 0.12, 1.0], [2.6, 0.35, 1.3], [-0.9, 0.06, 0.55]]
	for k in views.size():
		var v: Array = views[k]
		sr._t_yaw = v[0]
		sr._t_pitch = v[1]
		sr._t_dist = sr._dist_default * float(v[2])
		for i in 40:
			await get_tree().process_frame
		await _shot("showroom_view%d" % k)
