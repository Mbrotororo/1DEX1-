extends "res://tests/qa_battle.gd"
## QA-аудит: снимки экрана боя (не коммитить). Нужен xvfb:
## xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 --resolution 1280x720
##   res://tests/qa_visual.tscn -- --case=arcade_vis --out=DIR

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() == 2:
			match kv[0]:
				"case": cases = Array(kv[1].split(","))
				"out": out_dir = kv[1]
	DirAccess.make_dir_recursive_absolute(out_dir)
	Profile.save_path = "user://qa_profile.json"
	if Profile.has_method("reset_progress"):
		Profile.reset_progress()
	await get_tree().process_frame
	for c in cases:
		print("[qa] ===== vis case ", c)
		var tc := Time.get_ticks_msec()
		match String(c):
			"arcade_vis": await vis_arcade()
			"real_vis": await vis_realistic()
			"env_vis": await vis_env()
			"touch_vis": await vis_touch()
			"perf_vis": await vis_perf()
			"cloud_vis": await vis_cloud()
			_: print("[qa] unknown vis case ", c)
		await free_mm()
		_release_all()
		print("[qa] vis case %s took %d ms" % [c, Time.get_ticks_msec() - tc])
	Sfx.stop_all()
	get_tree().quit()

func shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var path := out_dir.path_join(name + ".png")
	img.save_png(path)
	q("shot %s draw_calls=%d primitives=%d objects=%d fps=%d" % [path, Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME), Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
		Engine.get_frames_per_second()])

func frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame

func vis_arcade() -> void:
	await make({"mode": "arcade", "lineup": ["strizh", "shmel", "krechet", "burevestnik"]})
	await frames(3)
	await shot("a01_spawn_menu")
	mm.request_spawn("strizh")
	await frames(2)
	var pl = mm.player
	var p = pilot_mouse()
	# враг и союзник в поле зрения
	var r = reds()[0]
	var b = blues()[0]
	place(pl, Vector3(0, 1600, 1500), 0.0, 110.0)
	place(r, Vector3(60, 1630, 900), 0.0, 100.0)
	place(b, Vector3(-120, 1600, 1250), 0.0, 105.0)
	await frames(6)
	await shot("a02_arcade_markers")
	# мышь: настоящее событие движения при захваченном курсоре
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	await frames(2)
	var a0: Vector3 = p.aim_dir
	var f0: Vector3 = pl.forward()
	var ev := InputEventMouseMotion.new()
	ev.relative = Vector2(160, -40)
	Input.parse_input_event(ev)
	await frames(2)
	var a1: Vector3 = p.aim_dir
	await wait_s(1.5)
	q("mouse motion (160,-40) px with mouse_mode=%d: aim moved %.1f deg, nose moved %.1f deg in 1.5 s, steer_off now %.1f deg" % [Input.mouse_mode,
		rad_to_deg(a0.angle_to(a1)), rad_to_deg(f0.angle_to(pl.forward())), rad_to_deg(p.steer_off)])
	await shot("a03_after_mouse_turn")
	# огонь по врагу
	place(pl, Vector3(0, 1600, 1500), 0.0, 115.0)
	place(r, Vector3(20, 1600, 1150), 0.0, 100.0)
	for i in 40:
		p.aim_dir = lead_dir(pl, r)
		if i > 15:
			Input.action_press("fire_guns")
		await get_tree().physics_frame
	await shot("a04_firing")
	Input.action_release("fire_guns")
	# повреждения: пожар, крыло, двигатель
	pl.take_hit(Vector3(0, 0, 0.5), 3.0, r.uid)
	pl.take_hit(Vector3(0, 0, 0.5), 3.0, r.uid)
	pl.dmg.start_fire()
	pl.take_hit(Vector3(-3.0, 0, 0), 30.0, r.uid)
	pl.take_hit(Vector3(0, 0, -3.6), 30.0, r.uid)
	await frames(8)
	await shot("a05_damage_fire")
	# таблица
	Input.action_press("scoreboard")
	await frames(4)
	await shot("a06_scoreboard")
	Input.action_release("scoreboard")
	# пауза
	mm.hud.toggle_pause()
	await frames(4)
	await shot("a07_pause")
	mm.hud.toggle_pause()
	await frames(2)
	# сбит ботом: киллкам
	pl.dmg.repair_full()
	place(pl, Vector3(0, 1700, 1500), 0.0, 110.0)
	place(r, Vector3(30, 1720, 1950), 0.0, 125.0)
	var t: float = await wait_until(func(): return mm.player == null, 60.0)
	q("player shot down after %.1f s" % t)
	if mm.state == "killcam":
		await wait_s(2.0)
		await shot("a08_killcam")
	await wait_until(func(): return mm.state != "killcam", 12.0)
	await frames(6)
	await shot("a09_after_death_" + mm.state)

func vis_realistic() -> void:
	await make({"mode": "realistic", "lineup": ["strizh", "shmel"]})
	await frames(3)
	await shot("r01_spawn_menu")
	mm.request_spawn("strizh")
	await wait_s(1.0)
	await shot("r02_runway_start")
	var pl = mm.player
	var p = pilot_mouse()
	mm.camera_rig.toggle_cockpit()
	await frames(6)
	await shot("r03_cockpit_runway")
	# в воздухе, кабина, союзник рядом и враг
	place(pl, Vector3(0, 1600, 1500), 0.0, 120.0)
	var r = reds()[0]
	var b = blues()[0]
	place(r, Vector3(40, 1620, 900), 0.0, 100.0)
	place(b, Vector3(-80, 1600, 1350), 0.0, 115.0)
	await frames(6)
	await shot("r04_cockpit_air")
	mm.camera_rig.toggle_cockpit()
	await frames(4)
	await shot("r05_chase_no_enemy_markers")
	# перегрузка
	place(pl, Vector3(0, 2500, 2000), 0.0, 175.0)
	p.mode = "keyboard"
	p.throttle = 1.0
	Input.action_press("pitch_up")
	await wait_s(3.0)
	q("blackout: g=%.1f black=%.2f" % [pl.fm.g_load, mm.hud.effects.black])
	await shot("r06_blackout")
	Input.action_release("pitch_up")

func vis_env() -> void:
	var combos := [["day", "clear"], ["dusk", "clear"], ["night", "clear"], ["dawn", "clear"], ["day", "cloudy"], ["day", "storm"], ["day", "fog"], ["night", "storm"]]
	for cmb in combos:
		await make({"mode": "arcade", "lineup": ["strizh"], "time_of_day": cmb[0], "weather": cmb[1]})
		mm.request_spawn("strizh")
		await frames(2)
		var pl = mm.player
		pilot_mouse()
		var r = reds()[0]
		# смотрим на зону B (рельеф) с 1200 м, враг впереди
		place(pl, Vector3(-250, 1300, 400), 0.0, 110.0)
		place(r, Vector3(-200, 1320, -150), 0.0, 100.0)
		await wait_s(0.8)
		q("env %s/%s ambient=%.2f" % [cmb[0], cmb[1], mm.world.ambient_light_level()])
		await shot("e_%s_%s" % [cmb[0], cmb[1]])
		await free_mm()

func vis_cloud() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"], "weather": "cloudy"})
	mm.request_spawn("strizh")
	await frames(2)
	var pl = mm.player
	pilot_mouse()
	var best := Vector3.ZERO
	var bd := 0.0
	for x in range(-3000, 3001, 150):
		for z in range(-3000, 3001, 150):
			for y in [1000.0, 1200.0, 1400.0]:
				var v := Vector3(x, y, z)
				var d: float = mm.world.cloud_density_at(v)
				if d > bd:
					bd = d
					best = v
	var r = reds()[0]
	# враг в облаке, игрок снаружи
	place(r, best, 0.0, 60.0)
	place(pl, best + Vector3(0, 0, 1300), 0.0, 60.0)
	await wait_s(0.6)
	q("enemy in_cloud=%s at %.0f m" % [str(r.in_cloud), r.fm.pos.distance_to(pl.fm.pos)])
	await shot("c01_enemy_in_cloud")
	place(pl, best, 0.0, 60.0)
	await wait_s(1.0)
	await shot("c02_player_in_cloud")

func vis_touch() -> void:
	await make({"mode": "arcade", "lineup": ["shmel"]})
	mm.request_spawn("shmel")
	await frames(2)
	mm.hud.set_touch_override(1)
	await frames(6)
	await shot("t01_touch_hud")

func vis_perf() -> void:
	await make({"mode": "arcade", "size": 8, "map_id": "fjord", "autopilot": true, "seed": 99})
	await wait_s(3.0)
	var dc: Array = []
	var pr: Array = []
	var ob: Array = []
	var ft: Array = []
	var t_prev := Time.get_ticks_usec()
	for i in 60:
		await RenderingServer.frame_post_draw
		var now := Time.get_ticks_usec()
		ft.append(float(now - t_prev) / 1000.0)
		t_prev = now
		dc.append(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
		pr.append(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME))
		ob.append(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME))
	dc.sort()
	pr.sort()
	ob.sort()
	ft.sort()
	q("render 8x8 fjord 1280x720 (60 frames, chase cam on autopilot player, state=%s): draw calls p50=%d max=%d; primitives p50=%d max=%d; objects p50=%d max=%d; frame ms p50=%.0f (llvmpipe); video mem=%.0f MB" % [mm.state,
		dc[30], dc.back(), pr[30], pr.back(), ob[30], ob.back(), ft[30], Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0])
	await shot("p01_8x8_fjord")
