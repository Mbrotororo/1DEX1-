extends Node
## QA (не коммитить): ангар с новым профилем, камуфляж, графика, журнал → повтор, бой с камуфляжем.
## xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 --resolution 1280x720
##   res://tests/qa_meta_ui.tscn -- --out=DIR [--touch] [--case=hangar|replay|battle]

const TMP := "user://qa_meta_ui.json"

var out_dir := "/tmp/qa_meta_ui"
var touch := false
var case_name := "hangar"
var tag := ""


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--out="):
			out_dir = a.substr(6)
		elif a == "--touch":
			touch = true
		elif a.begins_with("--case="):
			case_name = a.substr(7)
	DirAccess.make_dir_recursive_absolute(out_dir)
	var ws := DisplayServer.window_get_size()
	tag = "%dx%d%s" % [ws.x, ws.y, "_touch" if touch else ""]
	Profile.save_path = TMP
	if FileAccess.file_exists(TMP):
		DirAccess.remove_absolute(TMP)
	Profile.load_profile()
	Profile.set_setting("touch", "on" if touch else "off")
	match case_name:
		"hangar":
			_hangar.call_deferred()
		"replay":
			_replay.call_deferred()
		"battle":
			_battle.call_deferred()
		"planes":
			_planes.call_deferred()


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func shot(name: String) -> void:
	await _frames(4)
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := out_dir.path_join("%s_%s.png" % [name, tag])
	img.save_png(path)
	print("[qa] shot ", path)


func _texts(n: Node, out: Array) -> void:
	if n is CanvasItem and not (n as CanvasItem).is_visible_in_tree():
		return
	if n is Label and (n as Label).text != "":
		out.append((n as Label).text)
	elif n is Button and (n as Button).text != "":
		out.append("[" + (n as Button).text + "]")
	for c in n.get_children():
		_texts(c, out)


## Кнопки, которые выходят за экран или обрезаны соседями.
func _offscreen(n: Node, vp: Rect2, out: Array) -> void:
	if n is CanvasItem and not (n as CanvasItem).is_visible_in_tree():
		return
	if n is BaseButton:
		var r := (n as Control).get_global_rect()
		if not vp.encloses(r.grow(-1)):
			out.append("%s '%s' %s" % [n.get_class(), (n as Button).text if n is Button else n.name, r])
	for c in n.get_children():
		_offscreen(c, vp, out)


func _report(hangar: Node, label: String) -> void:
	var t: Array = []
	_texts(hangar, t)
	print("[qa] TEXTS %s: %s" % [label, " | ".join(PackedStringArray(t))])
	var off: Array = []
	_offscreen(hangar, get_viewport().get_visible_rect(), off)
	print("[qa] OFFSCREEN %s: %d %s" % [label, off.size(), off])


func _hangar() -> void:
	var hangar = load("res://scenes/hangar.tscn").instantiate()
	get_tree().root.add_child(hangar)
	await _frames(30)
	await shot("new_hangar")
	_report(hangar, "new_hangar")
	hangar.show_tab("research")
	await shot("new_research")
	_report(hangar, "new_research")
	hangar.show_tab("logbook")
	await shot("new_logbook")
	_report(hangar, "new_logbook")
	hangar.show_tab("settings")
	await shot("new_settings")
	_report(hangar, "new_settings")
	hangar.show_tab("hangar")
	# камуфляж: 5 сбитых на Стриже
	Profile.data.plane_stats["strizh"] = {"battles": 3, "kills": 5, "wins": 1, "xp": 900, "ground_kills": 0}
	Profile.data.plane_stats["shmel"] = {"battles": 7, "kills": 1, "wins": 2, "xp": 900, "ground_kills": 4}
	Profile.save_profile()
	hangar.select_plane("strizh")
	hangar._on_camo("desert")
	await _frames(20)
	print("[qa] showroom plane=%s camo=%s selected_camo=%s" % [hangar.showroom.plane_id, hangar.showroom.camo_id,
		Profile.selected_camo("strizh")])
	await shot("camo_desert")
	hangar._show_camo_note("winter")
	await shot("camo_winter_note")
	_report(hangar, "camo")
	hangar.select_plane("shmel")
	await _frames(15)
	await shot("camo_shmel_progress")
	# графика
	for q in ["low", "medium", "high"]:
		Profile.set_setting("graphics", q)
		hangar.select_plane("strizh")
		await _frames(20)
		var hall = hangar.showroom.get("_hall")
		var lamps_on := 0
		var shadows := 0
		if hall != null:
			for l in hall.lamps:
				if l.visible:
					lamps_on += 1
				if l.shadow_enabled:
					shadows += 1
		var env = hangar.showroom.get("_env")
		print("[qa] graphics=%s lamps_on=%d lamp_shadows=%d sun_shadow=%s glow=%s fog=%s" % [q, lamps_on, shadows,
			hall.sun.shadow_enabled if hall != null else "?", env.glow_enabled if env != null else "?", env.fog_enabled if env != null else "?"])
		await shot("gfx_" + q)
	Profile.set_setting("graphics", "medium")
	# сетап полон, слот-меню
	Profile.data.owned.append_array(["krechet", "burevestnik", "sokol"])
	Profile.data.researched.append_array(["krechet", "burevestnik", "sokol"])
	Profile.data.lineup = ["strizh", "shmel", "krechet", "burevestnik"]
	Profile.data.credits = 1234567
	Profile.data.total_xp = 95000
	Profile.save_profile()
	Profile.changed.emit()
	hangar.select_plane("sokol")
	await _frames(10)
	await shot("lineup_full")
	_report(hangar, "lineup_full")
	hangar._open_slot_menu(3)
	await shot("slot_menu_full")
	hangar._close_slot_menu()
	hangar.show_tab("research")
	await shot("research_rich")
	_report(hangar, "research_rich")
	get_tree().quit()


func _replay() -> void:
	# повтор с прошлых боёв: Game.last_replay пуст, есть только файл
	Game.last_replay = {}
	Profile.data.logbook = [{"date": "2026-11-27 10:00:00", "mode": "arcade", "map_id": "canyon", "outcome": "win",
		"planes": ["strizh"], "kills": 1, "ground_kills": 0, "deaths": 0, "xp": 800, "credits": 1400}]
	Profile.save_profile()
	var hangar = load("res://scenes/hangar.tscn").instantiate()
	get_tree().root.add_child(hangar)
	get_tree().current_scene = hangar
	await _frames(20)
	hangar.show_tab("logbook")
	await shot("logbook_replay_btn")
	var btn: Button = hangar._logbook._replay_btn
	print("[qa] replay file exists=%s button disabled=%s" % [FileAccess.file_exists("user://replays/last.json"), btn.disabled])
	btn.pressed.emit()
	for i in 200:
		await get_tree().process_frame
		var cs = get_tree().current_scene
		if cs != null and cs != hangar and cs.scene_file_path.ends_with("replay.tscn"):
			break
	await _frames(40)
	var cs2 = get_tree().current_scene
	print("[qa] current scene after replay button: %s loaded=%s" % [cs2.scene_file_path if cs2 else "null",
		cs2.get("loaded") if cs2 else "?"])
	await shot("replay_from_logbook")
	get_tree().quit()


func _battle() -> void:
	Profile.data.plane_stats["strizh"] = {"battles": 3, "kills": 5, "wins": 1, "xp": 900, "ground_kills": 0}
	Profile.data.camo = {"strizh": "desert"}
	Profile.data.lineup = ["strizh"]
	Profile.save_profile()
	var dummy := Node.new()
	get_tree().root.add_child(dummy)
	get_tree().current_scene = dummy
	Game.start_battle({"mode": "arcade", "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
		"lineup": ["strizh"], "seed": 4242, "autopilot": true})
	for i in 600:
		await get_tree().process_frame
		if Game.battle != null and Game.battle.player != null:
			break
	await _frames(30)
	var p = Game.battle.player if Game.battle != null else null
	print("[qa] battle player=%s camo_id=%s" % [p.def_id if p else "null", p.camo_id if p else "?"])
	# скрыть HUD, чтобы был виден самолёт
	await shot("battle_camo")
	var rec = Game.battle.recorder
	print("[qa] recorder planes=", rec.get("_planes") if rec else "?")
	get_tree().quit()


func _small(n: Node, out: Array) -> void:
	if n is CanvasItem and not (n as CanvasItem).is_visible_in_tree():
		return
	if n is BaseButton or n is OptionButton or n is HSlider or n is LineEdit:
		var r := (n as Control).get_global_rect()
		if r.size.y < 40.0 or r.size.x < 40.0:
			out.append("%s'%s' %dx%d" % [n.get_class(), (n as Button).text if n is Button else "", int(r.size.x), int(r.size.y)])
	for c in n.get_children():
		_small(c, out)


func _planes() -> void:
	for id in Data.ORDER:
		if not id in Profile.data.owned:
			Profile.data.owned.append(id)
		if not id in Profile.data.researched:
			Profile.data.researched.append(id)
	Profile.save_profile()
	var hangar = load("res://scenes/hangar.tscn").instantiate()
	get_tree().root.add_child(hangar)
	await _frames(20)
	for tab in ["hangar", "research", "logbook", "settings"]:
		hangar.show_tab(tab)
		await _frames(5)
		var sm: Array = []
		_small(hangar, sm)
		print("[qa] SMALL targets (<40 logical px) on %s: %d %s" % [tab, sm.size(), sm])
	hangar.show_tab("hangar")
	for id in Data.ORDER:
		hangar.select_plane(id)
		await _frames(45)
		var sr = hangar.showroom
		var cam = sr.camera
		print("[qa] plane %s showroom plane_id=%s cam=%s dist=%.1f t_dist=%.1f def=%.1f" % [id, sr.plane_id, str(cam.global_position), sr.get("_dist"), sr.get("_t_dist"), sr.get("_dist_default")])
		await shot("plane_" + id)
	# повторно Сокол после долгого ожидания
	hangar.select_plane("strizh")
	await _frames(45)
	hangar.select_plane("sokol")
	await _frames(120)
	await shot("plane_sokol_late")
	get_tree().quit()
