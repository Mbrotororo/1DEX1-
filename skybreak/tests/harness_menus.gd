extends Node
## Скриншоты меню для проверки глазами: все вкладки ангара, меню слота, окно сброса и экраны итогов.
## Запуск (нужен xvfb):
##   xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 \
##       --resolution 1280x720 res://tests/harness_menus.tscn -- --out=/tmp/skybreak-shots/menus [--touch]
## Профиль пишется во временный файл, настоящий не трогается.

const TMP_PROFILE := "user://harness_menus_profile.json"

var out_dir := "/tmp/skybreak-shots/menus"
var touch := false
var tag := ""


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a == "--touch":
			touch = true
	DirAccess.make_dir_recursive_absolute(out_dir)
	var ws := DisplayServer.window_get_size()
	tag = "%dx%d" % [ws.x, ws.y]
	Profile.save_path = TMP_PROFILE
	if FileAccess.file_exists(TMP_PROFILE):
		DirAccess.remove_absolute(TMP_PROFILE)
	Profile.load_profile()
	_fill_profile()
	Profile.set_setting("touch", "on" if touch else "off")
	_run.call_deferred()


func _fill_profile() -> void:
	var d: Dictionary = Profile.data
	d.credits = 12400
	d.total_xp = 3200
	d.researched = ["strizh", "krechet", "sokol", "shmel", "burevestnik"]
	d.owned = ["strizh", "krechet", "shmel"]
	d.research_xp = {"krechet": 2500, "sokol": 6000, "burevestnik": 3000, "mirage": 4200, "shtorm": 1200}
	d.research_focus = "mirage"
	d.lineup = ["krechet", "strizh", "shmel"]
	d.selected_plane = "krechet"
	d.plane_stats = {
		"strizh": {"battles": 12, "kills": 7, "wins": 6, "xp": 4100, "ground_kills": 2},
		"krechet": {"battles": 8, "kills": 3, "wins": 4, "xp": 3900, "ground_kills": 1},
		"shmel": {"battles": 5, "kills": 1, "wins": 2, "xp": 2300, "ground_kills": 15},
	}
	d.camo = {"strizh": "desert"}
	d.achievements = ["first_battle", "first_kill", "first_win", "landing", "battles_10", "ground_10"]
	d.stats = {"battles": 25, "wins": 12, "kills": 11, "ground_kills": 18, "deaths": 14, "landings": 5}
	var maps := ["canyon", "fjord", "reef"]
	var outs := ["win", "loss", "win", "draw", "exit", "win", "loss"]
	var book: Array = []
	for i in 14:
		var o: String = outs[i % outs.size()]
		book.append({"date": "2026-11-%02d %02d:%02d:00" % [27 - i / 3, 20 - i % 12, (i * 7) % 60],
			"mode": "realistic" if i % 4 == 1 else "arcade", "map_id": maps[i % 3], "outcome": o,
			"planes": ["krechet", "strizh"] if i % 3 == 0 else ["shmel"], "kills": (i * 3) % 5,
			"ground_kills": i % 4, "deaths": i % 3, "xp": 300 + i * 45, "credits": 0 if o == "exit" else 650 + i * 70})
	d.logbook = book
	Profile.save_profile()


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func shot(name: String) -> void:
	await _frames(4)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := out_dir.path_join("%s_%s%s.png" % [name, tag, "_touch" if touch else ""])
	img.save_png(path)
	print("shot ", path)


func _run() -> void:
	var hangar = load("res://scenes/hangar.tscn").instantiate()
	get_tree().root.add_child(hangar)
	await _frames(30)
	await shot("hangar")
	hangar.show_tab("research")
	await shot("research")
	hangar.show_tab("logbook")
	await shot("logbook")
	hangar.show_tab("settings")
	await shot("settings")
	hangar._settings._on_reset()
	await shot("confirm")
	hangar.queue_free()
	await _frames(2)
	hangar = load("res://scenes/hangar.tscn").instantiate()
	get_tree().root.add_child(hangar)
	await _frames(20)
	hangar._open_slot_menu(1)
	await shot("slotmenu")
	hangar._close_slot_menu()
	hangar.select_plane("burevestnik")
	await shot("hangar_buy")
	hangar.select_plane("shtorm")
	await shot("hangar_research")
	hangar.select_plane("groza")
	await shot("hangar_locked")
	hangar.queue_free()
	await _frames(2)

	Game.last_replay = {"version": 1}
	Game.last_result = _fake_result(8, "win", "arcade")
	Game.result_applied = false
	var res = load("res://scenes/results.tscn").instantiate()
	get_tree().root.add_child(res)
	await shot("results")
	res.queue_free()
	await _frames(2)
	Game.last_replay = {}
	Game.last_result = _fake_result(4, "loss", "realistic")
	Game.result_applied = false
	res = load("res://scenes/results.tscn").instantiate()
	get_tree().root.add_child(res)
	await shot("results_loss")
	res.queue_free()
	await _frames(2)
	Game.last_result = _fake_result(4, "exit", "test")
	Game.result_applied = false
	res = load("res://scenes/results.tscn").instantiate()
	get_tree().root.add_child(res)
	await shot("results_test")
	res.queue_free()
	await _frames(2)
	if FileAccess.file_exists(TMP_PROFILE):
		DirAccess.remove_absolute(TMP_PROFILE)
	get_tree().quit()


func _fake_result(size: int, outcome: String, mode: String) -> Dictionary:
	var names := Data.CALLSIGNS.duplicate()
	var planes := ["strizh", "krechet", "shmel", "burevestnik", "sokol", "shtorm"]
	var rows: Array = []
	var uid := 1
	for team in 2:
		for i in size:
			var is_p := team == 0 and i == 0
			var pid: String = "krechet" if is_p else planes[(i + team * 2) % planes.size()]
			rows.append({"uid": uid, "name": "1DEX1" if is_p else String(names[(uid * 7) % names.size()]), "team": team,
				"plane": Data.plane(pid).name, "plane_id": pid, "kills": (uid * 5) % 4 + (3 if is_p else 0),
				"ground": (uid * 3) % 3, "deaths": (uid * 2) % 3, "score": 900 - uid * 37 + (400 if is_p else 0),
				"assists": uid % 2, "captures": 0, "alive": true, "is_player": is_p})
			uid += 1
	var xp := {"krechet": 1240, "strizh": 380}
	if mode == "test":
		xp = {}
	return {"mode": mode, "map_id": "fjord", "outcome": outcome, "duration": 734.0,
		"planes_used": ["krechet", "strizh"], "kills": 5 if outcome == "win" else 1, "ground_kills": 2, "assists": 1,
		"deaths": 1 if outcome == "win" else 2, "captures": 1, "landings": 1, "score": 1420,
		"xp_by_plane": xp, "credits": 0 if mode == "test" else 2860, "scoreboard": rows, "time_of_day": "dusk",
		"weather": "cloudy", "cobra": false, "size": size, "tickets": [412.0, 0.0] if outcome == "win" else [0.0, 230.0],
		"winner": 0}
