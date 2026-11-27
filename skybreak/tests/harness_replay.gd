extends Node
## Скриншоты модуля REPLAY. Запуск:
##   godot --path skybreak --rendering-driver opengl3 --resolution 1280x720 res://tests/harness_replay.tscn -- --out=/tmp/shots [--only=replay|killcam] [--map=canyon]
## Строит поддельный бой, записывает его и показывает сцену повтора и киллкам.

const Fake = preload("res://tests/harness_replay_fake.gd")

var out_dir := "/tmp/skybreak-shots/replay"
var only := ""
var map_id := "canyon"


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a.begins_with("--only="):
			only = a.substr(7)
		elif a.begins_with("--map="):
			map_id = a.substr(6)
	DirAccess.make_dir_recursive_absolute(out_dir)
	await get_tree().process_frame
	if only == "" or only == "replay":
		await _replay_shots()
	if only == "" or only == "killcam":
		await _killcam_shots()
	get_tree().quit()


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(out_dir.path_join(name + ".png"))
	print("shot ", name)


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func _ground_height(b) -> float:
	var w = b.world
	return float(w.height_at(0, 0)) if w != null and w.has_method("height_at") else 0.0


func _record_dogfight() -> Dictionary:
	var b := Fake.make_battle(self, map_id)
	var c := Vector3(0, 900, 0)
	var planes := [
		[1001, "krechet", 0, "1DEX1", Fake.circle_path(c, 520.0, 0.22, 0.0)],
		[1002, "strizh", 1, "Иней", Fake.circle_path(c, 520.0, 0.22, -0.35)],
		[1003, "mirage", 0, "Беркут", Fake.circle_path(c + Vector3(0, 250, 0), 900.0, -0.16, 1.0)],
		[1004, "fantom", 1, "Гром", Fake.circle_path(c + Vector3(0, 250, 0), 900.0, -0.16, 1.4)],
		[1005, "shmel", 0, "Тайга", Fake.line_path(Vector3(-2500, 450, 1800), Vector3(1, 0, -0.7), 110.0)],
		[1006, "burevestnik", 1, "Кедр", Fake.line_path(Vector3(2600, 600, -1500), Vector3(-1, 0, 0.6), 120.0)],
	]
	var objs: Dictionary = {}
	for p in planes:
		objs[p[0]] = Fake.add_plane(b, p[0], p[1], p[2], p[3], p[4])
	objs[1001].is_player = true
	objs[1003].fm.afterburner = true
	objs[1004].fm.afterburner = true
	var g1 := Fake.add_ground(b, 2001, "tank", 1, Vector3(200, 0, -300))
	var g2 := Fake.add_ground(b, 2002, "building", 1, Vector3(-400, 0, -600))
	g2.variant = "hangar"
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	var steps := 60 * 24
	for i in steps:
		var tt := float(i) / 60.0
		if i % 3 == 0 and tt > 4.0 and tt < 9.0:
			var a: Node3D = objs[1001]
			var f := -a.global_transform.basis.z
			rec.event("tracer", {"from": a.global_position + f * 8.0, "to": a.global_position + f * 220.0})
		if i == 60 * 8:
			objs[1002].dmg.on_fire = true
		if i == 60 * 9:
			objs[1002].alive = false
			rec.event("kill", {"killer_uid": 1001, "victim_uid": 1002, "text": "Кречет (1DEX1) сбил Стриж (Иней)",
				"reason": "pilot", "killer_team": 0, "victim_team": 1})
		if i == 60 * 11:
			rec.event("explosion", {"pos": objs[1002].global_position, "size": 1.2})
			b.aircraft.erase(objs[1002])
			objs[1002].visible = false
		if i == 60 * 14:
			rec.event("ground_destroyed", {"uid": 2002, "killer_uid": 1005, "kind": "building", "team": 1})
			g2.alive = false
		if i == 60 * 16:
			objs[1006].dmg.oil_leak = true
		if i == 60 * 18:
			objs[1006].alive = false
			rec.event("kill", {"killer_uid": 1003, "victim_uid": 1006, "text": "Мираж (Беркут) сбил Буревестник (Кедр)",
				"reason": "fire", "killer_team": 0, "victim_team": 1})
		g1.position.x += 0.1
		b.step(Fake.DT)
	var rep := rec.finish()
	b.queue_free()
	return rep


func _replay_shots() -> void:
	Game.last_replay = _record_dogfight()
	await _frames(2)
	var scene: Node3D = load("res://scenes/replay.tscn").instantiate()
	add_child(scene)
	await _frames(5)
	scene.seek(6.0)
	await _frames(20)
	await _shot("replay_chase")
	scene.set_camera_mode("cockpit")
	await _frames(10)
	await _shot("replay_cockpit")
	scene.set_camera_mode("orbit")
	scene.select_plane(1003)
	await _frames(30)
	await _shot("replay_orbit")
	scene.set_camera_mode("free")
	scene.seek(14.5)
	await _frames(20)
	await _shot("replay_free")
	scene.set_camera_mode("chase")
	scene.select_plane(1001)
	scene.seek(8.5)
	scene.set_speed(0.5)
	await _frames(40)
	await _shot("replay_kill")
	scene.queue_free()
	await _frames(3)
	Game.last_replay = {"version": 1}
	var empty: Node3D = load("res://scenes/replay.tscn").instantiate()
	add_child(empty)
	await _frames(5)
	await _shot("replay_empty")
	empty.queue_free()
	await _frames(3)


func _killcam_shots() -> void:
	var b := Fake.make_battle(self, map_id, true)
	var killer := Fake.add_plane(b, 1, "mirage", 1, "Иней", Fake.circle_path(Vector3(0, 900, 0), 700.0, 0.2, -0.25), true)
	var victim := Fake.add_plane(b, 2, "krechet", 0, "1DEX1", Fake.circle_path(Vector3(0, 900, 0), 700.0, 0.2, 0.0), true)
	victim.is_player = true
	Fake.add_plane(b, 3, "strizh", 0, "Беркут", Fake.circle_path(Vector3(0, 1000, 0), 1100.0, -0.15, 2.0), true)
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	for i in 60 * 7:
		if i % 4 == 0 and i > 200:
			var f := -killer.global_transform.basis.z
			rec.event("tracer", {"from": killer.global_position + f * 10.0, "to": killer.global_position + f * 200.0})
		b.step(Fake.DT)
	victim.alive = false
	var kc := Killcam.new()
	b.add_child(kc)
	kc.play(b, 2, 1, 6.0)
	while is_instance_valid(kc) and kc._elapsed < 3.5:
		await get_tree().process_frame
	await _shot("killcam")
	if is_instance_valid(kc):
		kc.skip()
	await _frames(3)
	# сбит зениткой: неподвижная камера
	var aa := Fake.add_ground(b, 9, "aa", 1, Vector3(500, 0, 0))
	victim.alive = false
	var kc2 := Killcam.new()
	b.add_child(kc2)
	kc2.play(b, 2, aa.uid, 6.0)
	for i in 30:
		b.step(Fake.DT)
		await get_tree().process_frame
	await _shot("killcam_fixed")
	if is_instance_valid(kc2):
		kc2.skip()
	rec.finish()
	b.queue_free()
	await _frames(3)
