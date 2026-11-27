extends Node
## Водитель сквозного прогона (см. playtest.gd).

var owner_cfg: Dictionary = {}
var out := ""

func _ready() -> void:
	out = owner_cfg.out
	_run()

func shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img:
		img.save_png(out.path_join(name + ".png"))
	print("[shot] ", name)

func wait(sec: float) -> void:
	await get_tree().create_timer(sec, true, false, true).timeout

func _scene() -> Node:
	return get_tree().current_scene

func _run() -> void:
	var cfg: Dictionary = owner_cfg.cfg
	if not owner_cfg.skip_hangar:
		Game.go_hangar()
		await wait(2.5)
		print("[scene] ", _scene().name if _scene() else "null")
		await shot("01_hangar")
		var h = _scene()
		if h and h.has_method("show_tab"):
			for tab in ["research", "logbook", "settings"]:
				h.show_tab(tab)
				await wait(0.6)
				await shot("02_hangar_" + tab)
			h.show_tab("hangar")
			await wait(0.4)
	Game.start_battle(cfg)
	await wait(4.0)
	var mm = Game.battle
	print("[battle] ", mm != null, " state=", mm.state if mm else "-")
	if mm == null:
		get_tree().quit(1)
		return
	mm.message.connect(func(t: String, _s: float): print("[message] ", t))
	mm.kill_event.connect(func(t: String, _a: int, _b: int): print("[kill] ", t))
	mm.state_changed.connect(func(s: String): print("[state] ", s))
	if owner_cfg.speed != 1.0:
		Engine.time_scale = owner_cfg.speed
		Engine.max_physics_steps_per_frame = 32
	await shot("10_battle_start")
	var t := 0.0
	var n := 0
	var secs: float = owner_cfg.secs
	var cockpit_done := false
	while t < secs:
		await wait(1.0)
		t += 1.0 * Engine.time_scale
		if int(t) % 10 == 0 or t >= secs:
			n += 1
			var p = mm.player
			var info := "t=%d state=%s tickets=%s" % [int(t), mm.state, str(mm.tickets)]
			if p and is_instance_valid(p) and p.get("fm"):
				info += " alt=%d spd=%d" % [int(p.fm.pos.y), int(p.fm.vel.length() * 3.6)]
			print("[tick] ", info, " fps=", Engine.get_frames_per_second())
			await shot("11_battle_%02d" % n)
			if not cockpit_done and mm.state == "flying" and mm.camera_rig and mm.camera_rig.has_method("toggle_cockpit"):
				mm.camera_rig.toggle_cockpit()
				await wait(0.5)
				await shot("12_cockpit")
				mm.camera_rig.toggle_cockpit()
				cockpit_done = true
		if mm.state == "ended":
			break
	Engine.time_scale = 1.0
	if mm.hud and mm.hud.has_method("toggle_pause") and mm.state == "flying":
		mm.hud.toggle_pause()
		await wait(0.5)
		await shot("13_pause")
		mm.hud.toggle_pause()
	if mm.state != "ended":
		mm.finish_match("win")
	await wait(1.0)
	await shot("14_end_banner")
	await wait(5.0)
	print("[scene] ", _scene().name if _scene() else "null")
	await shot("20_results")
	Game.go_replay()
	await wait(4.0)
	print("[scene] ", _scene().name if _scene() else "null")
	await shot("30_replay")
	await wait(3.0)
	await shot("31_replay")
	Game.go_hangar()
	await wait(2.5)
	await shot("40_hangar_after")
	print("[profile] credits=", Profile.data.get("credits"), " battles=", Profile.data.get("stats", {}).get("battles"))
	print("PLAYTEST DONE")
	if Engine.has_singleton("Sfx") or has_node("/root/Sfx"):
		get_node("/root/Sfx").call("stop_all")
	await wait(0.3)
	get_tree().quit(0)
