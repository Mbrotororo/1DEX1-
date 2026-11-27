extends Node
## Подписи самолётов в сцене повтора, когда много самолётов далеко и кучно.
## Запуск (нужен xvfb):
##   xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 \
##       --resolution 1280x720 res://tests/harness_hud_replay_tags.tscn -- --out=DIR

const Fake = preload("res://tests/harness_replay_fake.gd")

var out_dir := "/tmp/skybreak-shots/replay_tags"


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
	DirAccess.make_dir_recursive_absolute(out_dir)
	await get_tree().process_frame
	await _run()
	get_tree().quit()


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var ws := DisplayServer.window_get_size()
	var path := out_dir.path_join("%s_%dx%d.png" % [name, ws.x, ws.y])
	img.save_png(path)
	print("shot ", path)


## 14 самолётов: две плотные группы в 1,5–2,5 км от игрока и пара близких.
func _record() -> Dictionary:
	var b := Fake.make_battle(self, "canyon")
	var planes := ["strizh", "krechet", "shmel", "burevestnik", "sokol", "shtorm", "mirage"]
	var uid := 1001
	var objs: Dictionary = {}
	objs[uid] = Fake.add_plane(b, uid, "krechet", 0, "1DEX1", Fake.line_path(Vector3(0, 900, 1500), Vector3(0, 0, -1), 120.0))
	objs[uid].is_player = true
	uid += 1
	for i in 6:
		var p := Vector3(-260 + i * 70, 1000 + (i % 3) * 25, -900 + (i % 2) * 40)
		objs[uid] = Fake.add_plane(b, uid, planes[i % planes.size()], 1, String(Data.CALLSIGNS[i]), Fake.line_path(p, Vector3(0.2, 0, 1), 110.0))
		uid += 1
	for i in 5:
		var p := Vector3(300 + i * 60, 1150 + (i % 2) * 30, -400 - i * 30)
		objs[uid] = Fake.add_plane(b, uid, planes[(i + 3) % planes.size()], 0, String(Data.CALLSIGNS[10 + i]), Fake.line_path(p, Vector3(-0.3, 0, -1), 115.0))
		uid += 1
	objs[uid] = Fake.add_plane(b, uid, "fantom", 1, "Гром", Fake.line_path(Vector3(-120, 960, 1250), Vector3(0.1, 0, -1), 125.0))
	uid += 1
	objs[uid] = Fake.add_plane(b, uid, "strizh", 0, "Иней", Fake.line_path(Vector3(90, 930, 1300), Vector3(0, 0, -1), 120.0))
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	for i in 60 * 6:
		b.step(Fake.DT)
	var rep := rec.finish()
	b.queue_free()
	return rep


func _run() -> void:
	Game.last_replay = _record()
	await _frames(2)
	var scene: Node3D = load("res://scenes/replay.tscn").instantiate()
	add_child(scene)
	await _frames(5)
	scene.select_plane(1001)
	scene.seek(3.0)
	scene.set_speed(0.25)
	await _frames(30)
	print("[tags] chase: ", _tag_names(scene))
	await _shot("replay_tags_chase")
	scene.set_camera_mode("orbit")
	await _frames(30)
	print("[tags] orbit: ", _tag_names(scene))
	await _shot("replay_tags_orbit")
	scene.queue_free()
	await _frames(3)


func _tag_names(scene) -> Array:
	var out: Array = []
	if not ("tags" in scene.ui):
		return out
	for t in scene.ui.tags:
		out.append("%s %.0f м" % [t.text, float(t.dist)])
	return out
