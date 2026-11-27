extends Node
## Снимки HUD на настоящем бою в облачную погоду: враг за облаком без маркера, тот же враг сбоку
## от облака с маркером, игрок внутри облака (пелена и плашка «В облаке»); в реализме — затемнение
## и покраснение от перегрузки поверх приборов.
## Запуск (нужен xvfb):
##   xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 \
##       --resolution 1280x720 res://tests/harness_hud_clouds.tscn -- --out=DIR [--touch] [--shots=clouds,g]
## Профиль временный, настоящий не трогается. Самолёты после расстановки замораживаются.

const TMP_PROFILE := "user://harness_hud_clouds_profile.json"

var out_dir := "/tmp/skybreak-shots/hud_clouds"
var touch := false
var want: Array = ["clouds", "g"]
var tag := ""
var mm = null


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a == "--touch":
			touch = true
		elif a.begins_with("--shots="):
			want = Array(a.substr(8).split(","))
	DirAccess.make_dir_recursive_absolute(out_dir)
	var ws := DisplayServer.window_get_size()
	tag = "%dx%d%s" % [ws.x, ws.y, "_touch" if touch else ""]
	Profile.save_path = TMP_PROFILE
	if FileAccess.file_exists(TMP_PROFILE):
		DirAccess.remove_absolute(TMP_PROFILE)
	Profile.load_profile()
	Profile.set_setting("touch", "on" if touch else "off")
	_run.call_deferred()


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func _shot(name: String) -> void:
	await _frames(3)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := out_dir.path_join("%s_%s.png" % [name, tag])
	img.save_png(path)
	print("shot ", path)


func _run() -> void:
	if "clouds" in want:
		await _clouds()
	if "g" in want:
		await _g_overlay()
	if FileAccess.file_exists(TMP_PROFILE):
		DirAccess.remove_absolute(TMP_PROFILE)
	get_tree().quit()


func _start(mode: String, weather: String) -> void:
	Game.match_config = {"mode": mode, "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": weather,
		"lineup": ["strizh", "shmel"], "test_plane": "", "seed": 4242, "autopilot": false}
	mm = load("res://scenes/battle.tscn").instantiate()
	mm.leave_scene = false
	get_tree().root.add_child(mm)
	await _frames(5)
	for i in 400:
		if mm.state == "spawn":
			mm.request_spawn("strizh")
		if mm.player != null and mm.state == "flying":
			break
		await _frames(1)
	await _frames(5)


func _stop() -> void:
	if mm != null and is_instance_valid(mm):
		mm.queue_free()
	mm = null
	await _frames(3)


## Ставит самолёт в точку (yaw = 0 — носом на -Z) и замораживает его.
func _place(ac, pos: Vector3, yaw: float = 0.0) -> void:
	var b := Basis(Vector3.UP, yaw)
	ac.fm.pos = pos
	ac.fm.basis = b
	ac.fm.vel = -b.z * 140.0
	ac.fm.on_ground = false
	ac._sync_transform()
	ac.process_mode = Node.PROCESS_MODE_DISABLED
	# замороженный самолёт сам флаг не обновит
	ac.in_cloud = float(mm.world.cloud_density_at(pos)) > 0.5
	if ac == mm.player and mm.player_pilot != null:
		mm.player_pilot.reset_aim(ac)


func _clear(p: Vector3) -> bool:
	for off in [Vector3.ZERO, Vector3(0, 10, 30), Vector3(0, -40, 0), Vector3(0, 40, 0)]:
		if float(mm.world.cloud_density_at(p + off)) > 0.0:
			return false
	return true


## Ищет облако и точку обзора: из неё враг за облаком не виден, а сбоку и над облаком — виден.
func _pick_setup() -> Dictionary:
	const HM = preload("res://scripts/ui/hud_markers.gd")
	var w = mm.world
	var list: Array = mm.world.sky.clouds.clusters.duplicate()
	list.sort_custom(func(a, b): return Vector2(a[0].x, a[0].z).length() < Vector2(b[0].x, b[0].z).length())
	for cl in list:
		var c: Vector3 = cl[0]
		var r: Vector3 = cl[4]
		if r.x < 500.0 or r.y < 180.0 or absf(c.x) > 3500.0 or absf(c.z) > 3500.0:
			continue
		for k in 8:
			var a := TAU * float(k) / 8.0
			var dir := Vector3(sin(a), 0, cos(a))
			var perp := Vector3(dir.z, 0, -dir.x)
			var rd := absf(dir.x) * r.x + absf(dir.z) * r.z
			var rp := absf(perp.x) * r.x + absf(perp.z) * r.z
			var y := c.y - r.y * 0.15
			var eye := Vector3(c.x, y, c.z) + dir * (rd + 1000.0)
			var behind := Vector3(c.x, y, c.z) - dir * (rd + 450.0)
			# «сбоку» и «выше» — перед облаком, в кадре
			var side := eye - dir * 700.0 + perp * 240.0 + Vector3(0, 30, 0)
			var above := eye - dir * 900.0 - perp * 200.0 + Vector3(0, r.y + 120.0, 0)
			if not (_clear(eye) and _clear(behind) and _clear(side) and _clear(above)):
				continue
			if HM.cloud_visibility(w, eye, behind, false) > 0.0:
				continue
			if HM.cloud_visibility(w, eye, side, false) < 1.0 or HM.cloud_visibility(w, eye, above, false) < 1.0:
				continue
			return {"c": c, "r": r, "yaw": a, "eye": eye, "behind": behind, "side": side, "above": above, "dir": dir, "perp": perp}
	return {}


func _clouds() -> void:
	await _start("arcade", "cloudy")
	var st := _pick_setup()
	if st.is_empty():
		print("[clouds] нет подходящего облака")
		await _stop()
		return
	var c: Vector3 = st.c
	var yaw: float = st.yaw
	print("[clouds] облако ", c, " радиусы ", st.r, " игрок ", st.eye)
	var pl = mm.player
	var enemies: Array = mm.enemies_of(0)
	var allies: Array = []
	for ac in mm.aircraft:
		if ac != pl and int(ac.team) == 0 and ac.alive:
			allies.append(ac)
	var dir: Vector3 = st.dir
	var perp: Vector3 = st.perp
	_place(pl, st.eye, yaw)
	# враг 0 прямо за облаком, враг 1 над облаком в чистом небе, союзник рядом
	_place(enemies[0], st.behind, yaw + PI)
	_place(enemies[1], st.above, yaw + PI)
	var far := Vector3(c.x, 4000, c.z) - dir * 6000.0
	for i in range(2, enemies.size()):
		_place(enemies[i], far + perp * (i * 300.0), yaw + PI)
	if allies.size() > 0:
		_place(allies[0], st.eye - dir * 420.0 - perp * 230.0 + Vector3(0, 35, 0), yaw)
	for i in range(1, allies.size()):
		_place(allies[i], far - perp * (i * 300.0) + dir * 12000.0, yaw)
	await _frames(40)
	_report(enemies, allies)
	await _shot("clouds_hidden")
	# тот же враг сбоку от облака — маркер есть
	_place(enemies[0], st.side, yaw + PI)
	await _frames(40)
	_report(enemies, allies)
	await _shot("clouds_visible")
	# игрок внутри облака: пелена, «В облаке», враги дальше 300 м не видны
	_place(pl, c, yaw)
	_place(enemies[0], c - dir * 900.0, yaw + PI)
	await _frames(50)
	_report(enemies, allies)
	print("[clouds] плашка «В облаке»: ", mm.hud.warnings.in_cloud, "  пелена: %.2f" % float(mm.hud.effects.haze))
	await _shot("clouds_inside")
	await _stop()


func _report(enemies: Array, allies: Array) -> void:
	var parts: Array = []
	for ac in enemies + allies:
		parts.append("%s(%s)=%.2f" % [ac.callsign, "враг" if int(ac.team) != 0 else "свой", float(mm.hud.markers.visibility_of(ac))])
	print("[clouds] видимость: ", ", ".join(parts), "  нарисовано: ", mm.hud.markers.debug_marks)


func _g_overlay() -> void:
	await _start("realistic", "clear")
	var pl = mm.player
	if pl == null:
		print("[g] нет самолёта игрока")
		await _stop()
		return
	_place(pl, Vector3(0, 1500, 0))
	# 6,8 g: только сужение поля зрения
	pl.fm.g_load = 6.8
	for i in 200:
		if float(mm.hud.effects.tunnel) > 0.8:
			break
		await _frames(1)
	print("[g] сужение %.2f, затемнение %.2f" % [float(mm.hud.effects.tunnel), float(mm.hud.effects.black)])
	await _shot("realistic_g_tunnel")
	pl.fm.g_load = 8.6
	for i in 400:
		if float(mm.hud.effects.black) > 0.7:
			break
		await _frames(1)
	print("[g] затемнение %.2f, сужение %.2f" % [float(mm.hud.effects.black), float(mm.hud.effects.tunnel)])
	await _shot("realistic_g_black")
	pl.fm.g_load = -3.6
	for i in 400:
		if float(mm.hud.effects.red) > 0.5:
			break
		await _frames(1)
	print("[g] покраснение %.2f" % float(mm.hud.effects.red))
	await _shot("realistic_g_red")
	await _stop()
