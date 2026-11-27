extends Node
## QA-аудит боя (не коммитить). Логика без экрана:
## godot --headless --fixed-fps 60 --path skybreak res://tests/qa_battle.tscn -- --case=arcade,respawn
## Каждая строка результата начинается с [qa].

var mm = null
var cases: Array = []
var out_dir := "/tmp/qa"
var kills: Array = []
var msgs: Array = []
var states: Array = []
var hits: int = 0

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
	var t0 := Time.get_ticks_msec()
	for c in cases:
		print("[qa] ===== case ", c)
		var tc := Time.get_ticks_msec()
		match String(c):
			"arcade": await case_arcade()
			"respawn": await case_respawn()
			"end": await case_end()
			"timer": await case_timer()
			"realistic": await case_realistic()
			"guns": await case_guns()
			"guns_bot": await case_guns_bot()
			"ground": await case_ground()
			"bomb2": await case_bomb2()
			"missiles": await case_missiles()
			"flares": await case_flares()
			"service": await case_service()
			"landing": await case_landing()
			"glide": await case_glide()
			"damage": await case_damage()
			"flight": await case_flight()
			"cobra": await case_cobra()
			"cobra2": await case_cobra2()
			"aa": await case_aa()
			"cloud": await case_cloud()
			"testflight": await case_testflight()
			"training": await case_training()
			"training2": await case_training2()
			"touch": await case_touch()
			"pause": await case_pause()
			"perf": await case_perf()
			"full": await case_full()
			"reef": await case_reef()
			"rwy": await case_rwy()
			_: print("[qa] unknown case ", c)
		await free_mm()
		_release_all()
		print("[qa] case %s took %d ms" % [c, Time.get_ticks_msec() - tc])
	print("[qa] done in %d ms" % (Time.get_ticks_msec() - t0))
	Sfx.stop_all()
	get_tree().quit()

# ---------------------------------------------------------------- помощники

func q(s: String) -> void:
	print("[qa] ", s)

func make(cfg: Dictionary):
	var c: Dictionary = Game.default_config()
	c.merge({"seed": 4242, "size": 4, "lineup": ["strizh", "shmel"], "map_id": "canyon", "time_of_day": "day",
		"weather": "clear", "autopilot": false, "test_plane": "flanker"}, true)
	c.merge(cfg, true)
	Game.match_config = c
	kills.clear()
	msgs.clear()
	states.clear()
	mm = load("res://scenes/battle.tscn").instantiate()
	mm.leave_scene = false
	mm.kill_event.connect(_on_kill)
	mm.message.connect(_on_msg)
	mm.state_changed.connect(_on_state)
	var t0 := Time.get_ticks_msec()
	get_tree().root.add_child(mm)
	await get_tree().process_frame
	await get_tree().physics_frame
	await get_tree().process_frame
	q("built %s %dx%d %s/%s/%s in %d ms: aircraft=%d units=%d" % [mm.mode, mm.size, mm.size, mm.map_id, mm.time_of_day,
		mm.weather, Time.get_ticks_msec() - t0, mm.aircraft.size(), mm.ground_units.size()])
	return mm

func _on_kill(t: String, a: int, b: int) -> void:
	kills.append(t)
	q("  kill t=%.1f [%d->%d] %s" % [mm.elapsed, a, b, t])

func _on_msg(t: String, _s: float) -> void:
	msgs.append(t)
	q("  msg t=%.1f %s" % [mm.elapsed, t])

func _on_state(s: String) -> void:
	states.append(s)
	q("  state t=%.1f %s" % [mm.elapsed, s])

func _on_hit(_m: String, _r: float) -> void:
	hits += 1

func free_mm() -> void:
	if mm != null and is_instance_valid(mm):
		mm.queue_free()
	mm = null
	Engine.time_scale = 1.0
	get_tree().paused = false
	await get_tree().process_frame
	await get_tree().process_frame

func _release_all() -> void:
	for a in ["pitch_up", "pitch_down", "roll_left", "roll_right", "yaw_left", "yaw_right", "throttle_up", "throttle_down",
			"afterburner", "fire_guns", "fire_rocket", "drop_bomb", "fire_missile", "flares", "gear", "brake", "extinguish",
			"scoreboard", "free_look"]:
		Input.action_release(a)

func wait_s(sec: float) -> void:
	var n := int(ceil(sec * 60.0))
	for i in n:
		await get_tree().physics_frame

## Ждёт, пока cond не станет true; возвращает игровые секунды или -1.
func wait_until(cond: Callable, max_sec: float) -> float:
	var n := int(max_sec * 60.0)
	for i in n:
		if cond.call():
			return i / 60.0
		await get_tree().physics_frame
	return -1.0

func place(ac, pos: Vector3, heading: float, speed: float, on_ground := false) -> void:
	var b := Basis(Vector3.UP, -heading)
	ac.fm.setup(ac.def, pos, b, speed, on_ground)
	ac.fm.gear_down = on_ground
	ac._sync_transform()
	if ac.pilot is PlayerPilot:
		ac.pilot.reset_aim(ac)
		ac.pilot.throttle = 0.8 if not on_ground else 0.0

func pilot_mouse():
	var p = mm.player_pilot
	p.follow_settings = false
	p.mode = "mouse"
	return p

func reds(alive := true) -> Array:
	var out: Array = []
	for ac in mm.aircraft:
		if is_instance_valid(ac) and int(ac.team) == 1 and (not alive or bool(ac.alive)):
			out.append(ac)
	return out

func blues() -> Array:
	var out: Array = []
	for ac in mm.aircraft:
		if is_instance_valid(ac) and int(ac.team) == 0 and bool(ac.alive) and ac != mm.player:
			out.append(ac)
	return out

func gh(p: Vector3) -> float:
	return maxf(mm.world.height_at(p.x, p.z), 0.0)

func cockpit_point(ac) -> Vector3:
	return Vector3(0.0, 0.5, float(ac.def.shape.get("cockpit_z", 0.0)))

func kill_ac(ac, attacker_uid: int) -> void:
	ac.take_hit(cockpit_point(ac), 10000.0, attacker_uid)

func remove_bots(keep: Array) -> void:
	for ac in mm.aircraft.duplicate():
		if is_instance_valid(ac) and ac != mm.player and not ac in keep:
			mm._remove_aircraft_quietly(ac)

func lead_dir(pl, tgt) -> Vector3:
	var s: float = pl.weapons.gun_speed()
	var sp: Vector3 = pl.fm.pos
	var tp: Vector3 = tgt.fm.pos
	var t: float = BattleHUD.HudMarkers.lead_time(tp - sp, tgt.velocity() - pl.velocity(), s)
	if t <= 0.0:
		t = sp.distance_to(tp) / s
	var lp: Vector3 = tp + (tgt.velocity() - pl.velocity()) * t + Vector3(0, 0.5 * 9.81 * t * t, 0)
	return (lp - sp).normalized()

var shell_last: Dictionary = {}

func track_shells() -> void:
	for sh in mm.projectiles._shells:
		if not sh.dead:
			shell_last[sh.id] = [sh.kind, sh.pos]

func impacts(kind: int, at: Vector3) -> String:
	var out: Array = []
	for k in shell_last:
		if int(shell_last[k][0]) == kind:
			var pos: Vector3 = shell_last[k][1]
			out.append("%.0f m (dx=%.0f dz=%.0f dy=%.0f)" % [pos.distance_to(at), pos.x - at.x, pos.z - at.z, pos.y - at.y])
	return ", ".join(PackedStringArray(out))

func warnings_of(pl) -> Array:
	var out: Array = []
	for it in BattleHUD.HudWarnings.collect(pl, mm, false):
		out.append(String(it.text))
	return out

func sfx_seen(name: String) -> bool:
	var s = Sfx.streams.get(name)
	for p in Sfx._pool2d:
		if is_instance_valid(p) and p.stream == s:
			return true
	return false

# ---------------------------------------------------------------- аркада: состав, вылет, гибель от бота

func case_arcade() -> void:
	await make({"mode": "arcade", "lineup": ["strizh", "shmel", "krechet", "burevestnik", "sokol"]})
	await wait_s(0.2)
	q("lineup=%s uses=%s" % [str(mm.lineup), str(mm.lineup_uses)])
	var sm = mm.hud.spawn_menu
	q("state=%s spawn_menu visible=%s mode=%s cards=%s points=%d" % [mm.state, sm.visible, sm.mode, str(sm.cards.keys()), mm.spawn_points])
	for id in mm.lineup:
		q("  card %s cost=%d can=%s" % [id, mm.spawn_cost(id), str(mm.can_spawn(id))])
	var ok: bool = mm.request_spawn("strizh")
	await wait_s(0.5)
	var pl = mm.player
	q("spawn ok=%s agl=%.0f y=%.0f speed=%.0f on_ground=%s gear=%s markers=%s assist=%s pilot=%s" % [str(ok), pl.altitude_agl(),
		pl.fm.pos.y, pl.speed(), str(pl.fm.on_ground), str(pl.fm.gear_down), str(mm.markers_enabled), str(pl.fm.assist), pl.pilot.get_script().resource_path.get_file()])
	q("after spawn: uses=%s costs strizh=%d shmel=%d sokol=%d points=%d" % [str(mm.lineup_uses), mm.spawn_cost("strizh"), mm.spawn_cost("shmel"), mm.spawn_cost("sokol"), mm.spawn_points])
	var info := ""
	for ac in mm.aircraft:
		info += "%s(%s,t%d,%.0fm) " % [ac.callsign, ac.def_id, ac.team, ac.fm.pos.y]
	q("aircraft: " + info)
	# бот сзади
	var e = null
	for ac in reds():
		if String(ac.def.line) == "fighter":
			e = ac
			break
	var p = pilot_mouse()
	place(pl, Vector3(0, 1700, 1500), 0.0, 110.0)
	place(e, Vector3(30, 1720, 1950), 0.0, 125.0)
	q("bot %s (%s) skill=%.2f placed 450 m behind player" % [e.callsign, e.def_id, e.pilot.skill])
	var hp0: float = pl.dmg.hp.structure
	var t: float = await wait_until(func(): return mm.player == null, 120.0)
	q("player down after %.1f s, killcam node=%s state=%s" % [t, str(mm._killcam != null), mm.state])
	if mm._killcam != null:
		q("  killcam mode=%s title='%s' hint='%s' killer=%d" % [mm._killcam.mode, mm._killcam.title_text, mm._killcam.hint_text, mm._killcam.killer_uid])
	q("  hud killcam_info=%s overlay.killcam_on=%s" % [str(mm.hud.killcam_info), str(mm.hud.overlay.killcam_on)])
	var tk: float = await wait_until(func(): return mm.state != "killcam", 15.0)
	q("killcam lasted %.1f s, then state=%s menu visible=%s mode=%s title='%s'" % [tk, mm.state, str(sm.visible), sm.mode, sm._title.text])
	q("after death: points=%d uses=%s cost strizh=%d can strizh=%s can shmel=%s" % [mm.spawn_points, str(mm.lineup_uses), mm.spawn_cost("strizh"), str(mm.can_spawn("strizh")), str(mm.can_spawn("shmel"))])
	var feed_txt: Array = []
	for k in mm.hud.feed.kills:
		feed_txt.append(String(k.text))
	q("hud feed kills=%s" % str(feed_txt))
	q("hud feed msgs=%s" % str(mm.hud.feed.messages))
	q("tickets=%s" % str(mm.tickets))
	q("player stats=%s" % str(mm.player_stats()))

## Вылет за очки: смерть с очками, повторный вылет, лимит 2 вылета.
func case_respawn() -> void:
	await make({"mode": "arcade", "lineup": ["strizh", "shmel"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	mm.spawn_points = 400
	var r = reds()[0]
	kill_ac(mm.player, r.uid)
	await wait_s(0.1)
	q("state=%s killcam=%s" % [mm.state, str(mm._killcam != null)])
	var tk: float = await wait_until(func(): return mm.state != "killcam", 15.0)
	q("killcam %.1f s -> state=%s menu=%s/%s" % [tk, mm.state, str(mm.hud.spawn_menu.visible), mm.hud.spawn_menu.mode])
	q("uses=%s points=%d cost strizh=%d" % [str(mm.lineup_uses), mm.spawn_points, mm.spawn_cost("strizh")])
	var ok: bool = mm.request_spawn("strizh")
	await wait_s(0.3)
	q("second strizh spawn ok=%s points=%d uses=%s y=%.0f" % [str(ok), mm.spawn_points, str(mm.lineup_uses), mm.player.fm.pos.y if mm.player else -1.0])
	# разбиться без убийцы
	mm.player.fm.crashed = true
	mm.player.fm.crash_reason = "ground"
	await wait_s(0.2)
	q("crash: state=%s" % mm.state)
	var tc: float = await wait_until(func(): return mm.state != "killcam", 10.0)
	q("crash view %.1f s -> state=%s" % [tc, mm.state])
	q("can strizh=%s (uses %d) can shmel=%s cost shmel=%d points=%d" % [str(mm.can_spawn("strizh")), mm.lineup_uses.strizh, str(mm.can_spawn("shmel")), mm.spawn_cost("shmel"), mm.spawn_points])
	ok = mm.request_spawn("strizh")
	q("third strizh request=%s (expect false)" % str(ok))
	ok = mm.request_spawn("shmel")
	await wait_s(0.3)
	q("shmel spawn ok=%s agl=%.0f points=%d uses=%s" % [str(ok), mm.player.altitude_agl() if mm.player else -1.0, mm.spawn_points, str(mm.lineup_uses)])
	# без очков после гибели
	kill_ac(mm.player, r.uid if is_instance_valid(r) else -1)
	await wait_until(func(): return mm.state != "killcam" and mm.state != "flying", 15.0)
	await wait_s(0.2)
	q("no points left: state=%s menu mode=%s title='%s' points=%d uses=%s" % [mm.state, mm.hud.spawn_menu.mode, mm.hud.spawn_menu._title.text, mm.spawn_points, str(mm.lineup_uses)])
	mm.spawn_points = 1000
	await wait_s(0.5)
	q("dead + points later: can_spawn shmel=%s state=%s" % [str(mm.can_spawn("shmel")), mm.state])

# ---------------------------------------------------------------- очки, зоны, база, конец боя

func case_end() -> void:
	await make({"mode": "arcade"})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	for z in mm.world.zones:
		q("zone %s pos=(%.0f,%.0f,%.0f) r=%.0f max_alt=%.0f ground=%.0f" % [z.id, z.pos.x, z.pos.y, z.pos.z, z.radius, z.max_alt, gh(z.pos)])
	q("tickets=%s max=%.0f time_left=%.0f zones=%s score panel visible=%s" % [str(mm.tickets), mm.max_tickets, mm.time_left, str(mm.zones_state), str(mm.hud.score.visible)])
	# захват зоны A игроком по кругу
	var z: Dictionary = mm.world.zones[0]
	var c: Vector3 = z.pos
	var alt := gh(c) + 220.0
	var p = pilot_mouse()
	place(pl, Vector3(c.x + 280, alt, c.z), 0.0, 85.0)
	pl.pilot.throttle = 0.5
	var pts0: int = mm.spawn_points
	var t_cap := -1.0
	var inside_frames := 0
	var frames := 0
	for i in 60 * 40:
		if not is_instance_valid(pl) or not pl.alive:
			break
		var pos: Vector3 = pl.fm.pos
		var ang := atan2(pos.z - c.z, pos.x - c.x) - 0.6
		var tgt := Vector3(c.x + cos(ang) * 260.0, alt, c.z + sin(ang) * 260.0)
		p.aim_dir = (tgt - pos).normalized()
		frames += 1
		if mm._in_zone(pl, z):
			inside_frames += 1
		if int(mm.zones_state[0].owner) == 0:
			t_cap = i / 60.0
			break
		await get_tree().physics_frame
	q("zone A capture by player: t=%.1f s inside=%.0f%% progress=%.2f owner=%d points %d->%d red in zone? speed=%.0f" % [t_cap,
		100.0 * inside_frames / maxf(frames, 1), float(mm.zones_state[0].progress), int(mm.zones_state[0].owner), pts0, mm.spawn_points, pl.speed() if is_instance_valid(pl) else 0.0])
	var t1: Array = mm.tickets.duplicate()
	await wait_s(5.0)
	q("drain 5 s: zones=%s owned blue=%d red=%d tickets %s -> %s" % [str(mm.zones_state), mm.zone_owned_count(0), mm.zone_owned_count(1), str(t1), str(mm.tickets)])
	# база
	var base = null
	for b in mm.world.bases:
		if int(b.team) == 1:
			base = b
	var tb: float = mm.tickets[1]
	var sum := 0
	var gk0: int = mm.player_stats().ground_kills
	for uid in base.unit_uids:
		var u = mm.get_entity(int(uid))
		if u != null and u.alive:
			sum += int(u.ticket_value)
			u.take_damage(1e6, pl.uid, true)
	await wait_s(0.1)
	q("red base %d units=%d sum ticket_value=%d tickets %.0f -> %.0f (drop %.0f, expect %d + 150 + drain) ground_kills %d->%d" % [base.id,
		base.unit_uids.size(), sum, tb, mm.tickets[1], tb - mm.tickets[1], sum, gk0, mm.player_stats().ground_kills])
	# конец по очкам
	mm.tickets[1] = 25.0
	var r = reds()[0]
	kill_ac(r, pl.uid)
	await wait_s(0.5)
	q("ticket end: state=%s outcome=%s winner=%d banner='%s' sub='%s' credits=%d kills=%d" % [mm.state, mm.outcome, mm.winner,
		mm.hud.overlay.banner_text, mm.hud.overlay.banner_sub, int(mm.result.get("credits", -1)), int(mm.result.get("kills", -1))])
	q("scoreboard visible=%s rows=%d" % [str(mm.hud.scoreboard.visible), mm.get_scoreboard().size()])

func case_timer() -> void:
	await make({"mode": "arcade"})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	mm.tickets = [650.0, 700.0]
	mm.time_left = 61.0
	await wait_s(1.5)
	q("1-min warning seen=%s" % str("Осталась 1 минута" in msgs))
	mm.time_left = 1.0
	var t: float = await wait_until(func(): return mm.state == "ended", 5.0)
	q("timer end after %.1f s: outcome=%s winner=%d tickets=%s duration=%.0f banner='%s'" % [t, mm.outcome, mm.winner, str(mm.tickets),
		float(mm.result.get("duration", 0)), mm.hud.overlay.banner_text])
	await free_mm()
	await make({"mode": "arcade"})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	mm.tickets = [700.0, 700.0]
	for zs in mm.zones_state:
		zs.owner = -1
		zs.progress = 0.0
	mm.time_left = 0.5
	await wait_until(func(): return mm.state == "ended", 3.0)
	q("timer end, equal tickets %s: outcome=%s" % [str(mm.tickets), mm.outcome])

# ---------------------------------------------------------------- реализм

func case_realistic() -> void:
	await make({"mode": "realistic", "lineup": ["strizh", "shmel"]})
	await wait_s(0.2)
	var sm = mm.hud.spawn_menu
	q("state=%s menu=%s hint='%s' visible=%s points visible=%s" % [mm.state, sm.mode, sm._hint.text, str(sm._hint.visible), str(sm._points.visible)])
	var ok: bool = mm.request_spawn("strizh")
	await wait_s(0.5)
	var pl = mm.player
	var s: Dictionary = mm.world.surface_at(pl.fm.pos.x, pl.fm.pos.z)
	q("spawn ok=%s on_ground=%s speed=%.1f surface=%s team=%d gear=%s assist=%s markers=%s uses=%s" % [str(ok), str(pl.fm.on_ground), pl.speed(),
		s.kind, int(s.team), str(pl.fm.gear_down), str(pl.fm.assist), str(mm.markers_enabled), str(mm.lineup_uses)])
	q("hardcore max_hp=%s data hp=%s" % [str(pl.dmg.max_hp), str(pl.def.hp)])
	var on_g := 0
	for ac in mm.aircraft:
		if ac != pl and ac.fm.on_ground:
			on_g += 1
	q("bots on ground=%d of %d" % [on_g, mm.aircraft.size() - 1])
	# взлёт мышью
	var p = pilot_mouse()
	var start: Vector3 = pl.fm.pos
	Input.action_press("throttle_up")
	var t_air := -1.0
	var vr := 0.0
	for i in 60 * 60:
		var f: Vector3 = pl.forward()
		var flat := Vector3(f.x, 0, f.z).normalized()
		p.aim_dir = (flat + Vector3(0, 0.14, 0)).normalized()
		if pl.fm.on_ground:
			vr = pl.speed()
		if not pl.alive:
			break
		if pl.altitude_agl() > 30.0:
			t_air = i / 60.0
			break
		await get_tree().physics_frame
	Input.action_release("throttle_up")
	q("takeoff: airborne(30 m) after %.1f s, run=%.0f m, rotate speed=%.0f km/h, alive=%s crashed=%s" % [t_air,
		Vector2(pl.fm.pos.x - start.x, pl.fm.pos.z - start.z).length(), vr * 3.6, str(pl.alive), str(pl.fm.crashed)])
	Input.action_press("gear")
	await wait_s(0.1)
	Input.action_release("gear")
	await wait_s(0.1)
	q("gear after G: %s" % str(pl.fm.gear_down))
	# затемнение
	place(pl, Vector3(0, 2500, 2000), 0.0, 175.0)
	p.mode = "keyboard"
	p.throttle = 1.0
	await wait_s(0.2)
	Input.action_press("pitch_up")
	var gmax := 0.0
	var bmax := 0.0
	var t_black := -1.0
	for i in 60 * 6:
		if not pl.alive:
			break
		gmax = maxf(gmax, pl.fm.g_load)
		bmax = maxf(bmax, mm.hud.effects.black)
		if t_black < 0.0 and mm.hud.effects.black > 0.55:
			t_black = i / 60.0
		await get_tree().physics_frame
	Input.action_release("pitch_up")
	q("pull 6 s at 630 km/h: max g=%.1f black max=%.2f full-dark(>0.55) at %.1f s wings=%.2f/%.2f alive=%s" % [gmax, bmax, t_black,
		pl.dmg.module_ratio("left_wing"), pl.dmg.module_ratio("right_wing"), str(pl.alive)])
	await wait_s(2.0)
	q("after release 2 s: black=%.2f" % mm.hud.effects.black)
	# кабина
	mm.camera_rig.toggle_cockpit()
	await wait_s(0.2)
	q("cockpit: rig mode=%d (COCKPIT=%d) hud.cockpit_on=%s cockpit.visible=%s flight.visible=%s" % [mm.camera_rig.mode, CameraRig.Mode.COCKPIT,
		str(mm.hud.cockpit_on), str(mm.hud.cockpit.visible), str(mm.hud.flight.visible)])
	mm.camera_rig.toggle_cockpit()
	# урон по сравнению с аркадой
	var r = reds()[0]
	kill_ac(pl, r.uid)
	await wait_until(func(): return mm.state != "killcam" and mm.state != "flying", 15.0)
	await wait_s(0.3)
	q("after death in realistic: state=%s menu=%s title='%s'" % [mm.state, sm.mode, sm._title.text])
	# маркеры: союзник ближе 800 м
	q("markers_enabled=%s REALISTIC_ALLY_RANGE=%.0f" % [str(mm.markers_enabled), BattleHUD.HudMarkers.REALISTIC_ALLY_RANGE])

# ---------------------------------------------------------------- пушки игрока

func case_guns() -> void:
	# мишень летит прямо, игрок наводит мышью (aim_dir) и стреляет ЛКМ
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var r = null
	for ac in reds():
		if ac.def_id == "strizh" or ac.def_id == "krechet":
			r = ac
			break
	if r == null:
		r = reds()[0]
	var dp = load("res://scripts/match/match_drone_pilot.gd").new()
	dp.mode = "straight"
	dp.target_alt = 1600.0
	dp.target_speed = 100.0
	dp.heading_target = 0.0
	r.set_pilot(dp)
	if dp.get_parent() == null:
		r.add_child(dp)
	remove_bots([r])
	place(r, Vector3(0, 1600, 1000), 0.0, 100.0)
	place(pl, Vector3(40, 1620, 1700), 0.0, 115.0)
	var p = pilot_mouse()
	hits = 0
	r.dmg.module_damaged.connect(_on_hit)
	var ammo0: int = pl.weapons.ammo.guns[0]
	var fired_frames := 0
	var t_kill := -1.0
	var min_d := 1e9
	for i in 60 * 40:
		if not is_instance_valid(r) or not r.alive:
			t_kill = i / 60.0
			break
		var d: float = pl.fm.pos.distance_to(r.fm.pos)
		min_d = minf(min_d, d)
		var ad := lead_dir(pl, r)
		p.aim_dir = ad
		var nose_err := rad_to_deg(pl.forward().angle_to(ad))
		if d < 500.0 and nose_err < 2.0:
			Input.action_press("fire_guns")
			fired_frames += 1
		else:
			Input.action_release("fire_guns")
		await get_tree().physics_frame
	Input.action_release("fire_guns")
	q("guns vs straight bot: kill=%s t=%.1f s firing=%.1f s rounds=%d hits(module events)=%d min_d=%.0f kills=%d spawn_points=%d" % [str(t_kill >= 0.0), t_kill,
		fired_frames / 60.0, ammo0 - int(pl.weapons.ammo.guns[0]), hits, min_d, mm.player_stats().kills, mm.spawn_points])
	q("kill feed: %s" % str(kills))
	q("pilot mode=%s manual_override=%s steer_off=%.3f" % [p.mode, str(p.manual_override), p.steer_off])

func case_guns_bot() -> void:
	# настоящий BotPilot (уклоняется и отстреливается), игрок — наведение мышью
	var wins := 0
	var deaths := 0
	for trial in 3:
		await make({"mode": "arcade", "lineup": ["strizh"], "seed": 500 + trial})
		mm.request_spawn("strizh")
		await wait_s(0.3)
		var pl = mm.player
		var r = null
		for ac in reds():
			if String(ac.def.line) == "fighter":
				r = ac
				break
		remove_bots([r])
		place(r, Vector3(0, 1600, 900), 0.0, 110.0)
		place(pl, Vector3(40, 1620, 1500), 0.0, 120.0)
		var p = pilot_mouse()
		hits = 0
		r.dmg.module_damaged.connect(_on_hit)
		var res := "timeout"
		var fired := 0
		var t := 0.0
		for i in 60 * 90:
			t = i / 60.0
			if not is_instance_valid(r) or not r.alive:
				res = "kill"
				break
			if mm.player == null:
				res = "player_down"
				break
			var d: float = pl.fm.pos.distance_to(r.fm.pos)
			var ad := lead_dir(pl, r)
			p.aim_dir = ad
			var nose_err := rad_to_deg(pl.forward().angle_to(ad))
			if d < 600.0 and nose_err < 2.5:
				Input.action_press("fire_guns")
				fired += 1
			else:
				Input.action_release("fire_guns")
			await get_tree().physics_frame
		Input.action_release("fire_guns")
		if res == "kill":
			wins += 1
		if res == "player_down":
			deaths += 1
		q("trial %d vs %s skill %.2f: %s at %.1f s, hits=%d firing %.1f s, kills=%d feed=%s" % [trial, r.def_id if is_instance_valid(r) else "?", r.pilot.skill if is_instance_valid(r) else 0.0,
			res, t, hits, fired / 60.0, mm.player_stats().kills, str(kills)])
		await free_mm()
	q("guns vs BotPilot: %d kills, %d player deaths of 3" % [wins, deaths])

# ---------------------------------------------------------------- ракеты и бомбы Шмеля

func _find_unit(kind: String, team: int):
	for u in mm.ground_units:
		if is_instance_valid(u) and u.alive and u.kind == kind and int(u.team) == team:
			return u
	return null

func case_ground() -> void:
	await make({"mode": "test", "test_plane": "shmel", "lineup": ["shmel"]})
	await wait_s(0.3)
	var pl = mm.player
	q("test plane=%s ammo=%s" % [pl.def_id, str(pl.weapons.ammo)])
	var p = pilot_mouse()
	# ракеты по танку
	var tank = _find_unit("tank", 1)
	var tp: Vector3 = tank.global_position
	var hdg := 0.0
	var start := tp + Vector3(0, 420, 1300)
	place(pl, start, hdg, 105.0)
	p.throttle = 0.7
	var hp0: float = tank.hp
	var fired := 0
	var phase := "dive"
	for i in 60 * 25:
		var pos: Vector3 = pl.fm.pos
		var to := tp + Vector3(0, 1.5, 0) - pos
		var d := to.length()
		if phase == "dive":
			p.aim_dir = to.normalized()
			var err := rad_to_deg(pl.forward().angle_to(to.normalized()))
			if d < 750.0 and err < 1.5 and fired < 4:
				Input.action_press("fire_rocket")
			else:
				Input.action_release("fire_rocket")
			if d < 330.0:
				phase = "pull"
				Input.action_release("fire_rocket")
		else:
			p.aim_dir = (pl.forward() + Vector3(0, 0.8, 0)).normalized()
		fired = 8 - int(pl.weapons.ammo.rockets)
		track_shells()
		if not tank.alive and phase == "pull":
			break
		if not pl.alive:
			break
		await get_tree().physics_frame
	for i in 120:
		track_shells()
		await get_tree().physics_frame
	q("rocket last positions vs tank: %s" % impacts(0, tp))
	shell_last.clear()
	q("rockets vs tank: fired=%d tank hp %.0f -> %.0f alive=%s player alive=%s agl=%.0f ground_kills=%d" % [fired, hp0, tank.hp, str(tank.alive),
		str(pl.alive), pl.altitude_agl() if pl.alive else -1.0, mm.player_stats().ground_kills])
	# бомба по зданию/танку: горизонтальный полёт, сброс по расчёту
	var tgt = _find_unit("building", 1)
	if tgt == null:
		tgt = _find_unit("aa", 1)
	var bp: Vector3 = tgt.global_position
	var h := 300.0
	var v := 100.0
	place(pl, bp + Vector3(0, h, 2000), 0.0, v)
	if not pl.alive:
		q("player dead, respawn needed")
	p.throttle = 0.65
	var hpb: float = tgt.hp
	var dropped := false
	var drop_info := ""
	for i in 60 * 40:
		var pos: Vector3 = pl.fm.pos
		var flat := Vector3(bp.x - pos.x, 0, bp.z - pos.z)
		p.aim_dir = (flat.normalized() * 1.0 + Vector3(0, (bp.y + h - pos.y) * 0.004, 0)).normalized()
		var hh: float = pos.y - bp.y
		var vv: Vector3 = pl.velocity()
		var tf := (vv.y + sqrt(maxf(vv.y * vv.y + 2.0 * 9.81 * hh, 0.0))) / 9.81
		var reach := Vector2(vv.x, vv.z).length() * tf
		if not dropped and flat.length() <= reach:
			Input.action_press("drop_bomb")
			dropped = true
			drop_info = "dropped at dist %.0f h=%.0f v=%.0f tf=%.1f" % [flat.length(), hh, vv.length(), tf]
		elif dropped:
			Input.action_release("drop_bomb")
		track_shells()
		if dropped and i % 60 == 0 and not tgt.alive:
			break
		await get_tree().physics_frame
	Input.action_release("drop_bomb")
	for i in 60:
		track_shells()
		await get_tree().physics_frame
	q("bomb last position vs target: %s (target radius %.0f)" % [impacts(1, bp), tgt.radius])
	q("bomb vs %s(%s): %s bombs left=%d hp %.0f -> %.0f alive=%s ground_kills=%d" % [tgt.kind, tgt.variant, drop_info, int(pl.weapons.ammo.bombs),
		hpb, tgt.hp, str(tgt.alive), mm.player_stats().ground_kills])
	q("kills feed: %s" % str(kills))

# ---------------------------------------------------------------- ракеты В-В и ловушки

func case_missiles() -> void:
	await make({"mode": "test", "test_plane": "flanker", "lineup": ["flanker"]})
	await wait_s(0.5)
	var pl = mm.player
	var p = pilot_mouse()
	var drones: Array = []
	for ac in mm.aircraft:
		if ac != pl and ac.alive:
			drones.append(ac)
	var tgt = drones[0]
	q("drones=%d target=%s at %.0f m" % [drones.size(), tgt.def_id, tgt.fm.pos.distance_to(pl.fm.pos)])
	var tpos: Vector3 = tgt.fm.pos
	var hdg: float = tgt.fm.heading()
	var back := Vector3(sin(hdg), 0, -cos(hdg))
	place(pl, tpos - back * 1800.0 + Vector3(0, 30, 0), hdg, 170.0)
	var t_lock := -1.0
	var tone := false
	for i in 60 * 8:
		p.aim_dir = (tgt.fm.pos - pl.fm.pos).normalized()
		if pl.weapons.lock_target == tgt and pl.weapons.lock_progress >= 1.0:
			t_lock = i / 60.0
			await get_tree().physics_frame
			tone = sfx_seen("lock_tone")
			break
		await get_tree().physics_frame
	q("lock on drone: t=%.2f s progress=%.2f tone in Sfx pool=%s hud lock box (markers draws when lock_target)=%s" % [t_lock, pl.weapons.lock_progress, str(tone), str(pl.weapons.lock_target != null)])
	var m0: int = pl.weapons.ammo.missiles
	Input.action_press("fire_missile")
	await wait_s(0.05)
	Input.action_release("fire_missile")
	q("missiles %d -> %d, in flight=%d" % [m0, int(pl.weapons.ammo.missiles), mm.projectiles.shell_count()])
	var hp0: Dictionary = tgt.dmg.hp.duplicate()
	var t: float = -1.0
	for i in 60 * 12:
		track_shells()
		if not tgt.alive:
			t = i / 60.0
			break
		await get_tree().physics_frame
	q("missile last pos vs target: %s; target hp %s -> %s" % [impacts(2, tgt.fm.pos), str(hp0), str(tgt.dmg.hp)])
	q("missile result: target destroyed=%s after %.1f s, kills=%d feed=%s" % [str(not tgt.alive), t, mm.player_stats().kills, str(kills)])
	# серия: пускать, пока цель жива
	var used := 1
	while is_instance_valid(tgt) and tgt.alive and int(pl.weapons.ammo.missiles) > 0 and used < 6:
		var tp2: Vector3 = tgt.fm.pos
		var h2: float = tgt.fm.heading()
		var bk := Vector3(sin(h2), 0, -cos(h2))
		place(pl, tp2 - bk * 1500.0 + Vector3(0, 20, 0), h2, 170.0)
		var lt: float = -1.0
		for i in 60 * 6:
			p.aim_dir = (tgt.fm.pos - pl.fm.pos).normalized()
			if pl.weapons.lock_target == tgt and pl.weapons.lock_progress >= 1.0:
				lt = i / 60.0
				break
			await get_tree().physics_frame
		if lt < 0.0:
			q("  no relock")
			break
		var s0: float = tgt.dmg.hp.structure
		Input.action_press("fire_missile")
		await wait_s(0.05)
		Input.action_release("fire_missile")
		used += 1
		await wait_until(func(): return mm.projectiles.shell_count() == 0 or not tgt.alive, 12.0)
		q("  missile %d: structure %.0f -> %.0f alive=%s" % [used, s0, tgt.dmg.hp.structure, str(tgt.alive)])
	q("target %s needed %d missiles, alive=%s kills=%d feed=%s" % [tgt.def_id, used, str(tgt.alive), mm.player_stats().kills, str(kills)])
	# пуск без захвата
	var m1: int = pl.weapons.ammo.missiles
	p.aim_dir = Vector3.UP
	await wait_s(1.0)
	Input.action_press("fire_missile")
	await wait_s(0.05)
	Input.action_release("fire_missile")
	q("fire without lock: missiles %d -> %d, click seen=%s" % [m1, int(pl.weapons.ammo.missiles), str(sfx_seen("click"))])

func bomb_predict(from: Vector3, vel: Vector3, ground_y: float) -> Vector3:
	var pos := from
	var v := vel + Vector3(0, -1.5, 0)
	var dt := 1.0 / 60.0
	for i in 60 * 30:
		v.y -= 9.81 * dt
		v -= v * v.length() * 0.00016 * dt
		pos += v * dt
		if pos.y <= ground_y:
			return pos
	return pos

func case_bomb2() -> void:
	await make({"mode": "test", "test_plane": "shmel", "lineup": ["shmel"]})
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	for kind in ["building", "tank"]:
		var tgt = _find_unit(kind, 1)
		var bp: Vector3 = tgt.global_position
		place(pl, bp + Vector3(0, 300, 2000), 0.0, 100.0)
		p.throttle = 0.65
		var hp0: float = tgt.hp
		var dropped := false
		var info := ""
		shell_last.clear()
		for i in 60 * 40:
			var pos: Vector3 = pl.fm.pos
			var flat := Vector3(bp.x - pos.x, 0, bp.z - pos.z)
			p.aim_dir = (flat.normalized() + Vector3(0, (bp.y + 300.0 - pos.y) * 0.004, 0)).normalized()
			var imp := bomb_predict(pos, pl.velocity(), bp.y)
			var past := (imp - bp).dot(pl.velocity().normalized() * Vector3(1, 0, 1))
			if not dropped and past >= 0.0:
				Input.action_press("drop_bomb")
				dropped = true
				info = "released %.0f m before target, predicted miss %.0f m" % [flat.length(), Vector2(imp.x - bp.x, imp.z - bp.z).length()]
			elif dropped:
				Input.action_release("drop_bomb")
			track_shells()
			if dropped and i % 60 == 0 and not tgt.alive:
				break
			await get_tree().physics_frame
		Input.action_release("drop_bomb")
		for i in 90:
			track_shells()
			await get_tree().physics_frame
		q("bomb (drag-aware release) vs %s(%s): %s; impact %s; hp %.0f -> %.0f alive=%s" % [kind, tgt.variant, info, impacts(1, bp), hp0, tgt.hp, str(tgt.alive)])
	q("ground_kills=%d feed=%s" % [mm.player_stats().ground_kills, str(kills)])

func case_flares() -> void:
	await make({"mode": "test", "test_plane": "flanker", "lineup": ["flanker"]})
	await wait_s(0.5)
	var pl = mm.player
	var p = pilot_mouse()
	var spec: Dictionary = Data.plane("fantom").weapons.missiles
	var shooter = null
	for ac in mm.aircraft:
		if ac != pl:
			shooter = ac
	for use_flares in [false, true]:
		var hit_n := 0
		var warn_n := 0
		var dmg_sum := 0.0
		for trial in 8:
			if not pl.alive:
				break
			pl.dmg.repair_full()
			place(pl, Vector3(0, 2000, 0), 0.0, 180.0)
			pl.weapons.rearm_full()
			await wait_s(0.1)
			var lh: float = pl.dmg.last_hit_time
			var s0: float = pl.dmg.hp.structure
			var from: Vector3 = pl.fm.pos + Vector3(0, 0, 1600)
			mm.projectiles.spawn_missile(from, Vector3(0, 0, -250), pl, spec, shooter.uid, 1)
			var dropped := false
			var warned := false
			var hit := false
			for i in 60 * 10:
				p.aim_dir = Vector3(0, 0, -1)
				if mm.projectiles.incoming_missiles(pl) > 0:
					warned = true
				var mp: Array = mm.projectiles.missile_positions()
				if use_flares and not dropped and not mp.is_empty() and (mp[0] as Vector3).distance_to(pl.fm.pos) < 900.0:
					Input.action_press("flares")
					dropped = true
				elif dropped:
					Input.action_release("flares")
				if pl.dmg.last_hit_time != lh:
					hit = true
					await wait_s(0.05)
					break
				if mp.is_empty() and i > 30:
					break
				await get_tree().physics_frame
			Input.action_release("flares")
			if hit:
				hit_n += 1
				dmg_sum += s0 - pl.dmg.hp.structure
			if warned:
				warn_n += 1
			mm.projectiles.clear()
			await wait_s(0.2)
		q("flares=%s: missile hits %d/8 (avg structure dmg %.0f of %.0f), 'Ракета!' warning raised %d/8, flares left=%d, player alive=%s" % [str(use_flares), hit_n,
			dmg_sum / maxf(hit_n, 1), pl.dmg.max_hp.structure, warn_n, int(pl.weapons.ammo.flares), str(pl.alive)])
	q("missile_warning sound used by code: %s" % str(sfx_seen("missile_warning")))

# ---------------------------------------------------------------- боезапас и обслуживание

func case_service() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	q("ammo max=%s" % str(pl.weapons.max_ammo))
	Input.action_press("fire_guns")
	var t: float = await wait_until(func(): return pl.weapons.is_empty() or not pl.alive, 120.0)
	Input.action_release("fire_guns")
	q("guns empty after %.1f s of fire, ammo=%s is_empty=%s warnings=%s" % [t, str(pl.weapons.ammo), str(pl.weapons.is_empty()), str(warnings_of(pl))])
	pl.dmg.apply_hit(Vector3(-3.0, 0.0, 0.0), 20.0, -1, mm.elapsed)
	pl.dmg.apply_hit(Vector3(0.0, 0.0, -3.5), 25.0, -1, mm.elapsed)
	q("damaged: wing L %.2f engine %.2f" % [pl.dmg.module_ratio("left_wing"), pl.dmg.module_ratio("engine")])
	var af: Dictionary = mm.world.airfield_of(0)
	var sp: Dictionary = mm.world.runway_spawn(0, 0)
	var hdg: float = af.heading
	place(pl, sp.pos + Vector3(sin(hdg), 0, -cos(hdg)) * 300.0, hdg, 0.0, true)
	q("on runway: kind=%s armed=%s mm._airborne=%s" % [mm.world.surface_at(pl.fm.pos.x, pl.fm.pos.z).kind, str(pl.service_armed), str(mm._airborne)])
	var landings0: int = mm.player_stats().landings
	var trace := ""
	var t_done := -1.0
	var served := [false]
	pl.serviced.connect(func(_a): served[0] = true)
	var labels := {}
	for i in 60 * 50:
		if i % 120 == 0:
			trace += "%.0fs:%s/%.0f%% " % [i / 60.0, str(pl.servicing), pl.service_progress * 100.0]
		for w in warnings_of(pl):
			if w.begins_with("Ремонт") or w.begins_with("Перезарядка"):
				labels[w.split(" ")[0]] = true
		if served[0]:
			t_done = i / 60.0
			break
		await get_tree().physics_frame
	await wait_s(0.1)
	q("service: done=%s t=%.1f s log=%s" % [str(served[0]), t_done, trace])
	q("hud labels seen=%s ammo=%s wing=%.2f engine=%.2f landings %d->%d rewards=%s" % [str(labels.keys()), str(pl.weapons.ammo), pl.dmg.module_ratio("left_wing"),
		pl.dmg.module_ratio("engine"), landings0, mm.player_stats().landings, str(mm._rewards)])

func case_landing() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	var af: Dictionary = mm.world.airfield_of(0)
	var hdg: float = af.heading
	var fwd := Vector3(sin(hdg), 0, -cos(hdg))
	var rs: Vector3 = af.runway_start
	var rh: float = mm.world.surface_at(rs.x, rs.z).height
	q("airfield kind=%s heading=%.0f deg length=%.0f width=%.0f service_r=%.0f runway h=%.1f" % [af.kind, rad_to_deg(hdg), af.length, af.width, af.service_radius, rh])
	q("runway_start=%s pos=%s; behind start 1500 m = %s (border 5200)" % [str(rs), str(af.pos), str(rs - fwd * 1500.0)])
	# заход с обратного курса (от центра карты), чтобы не вылететь за границу
	var thr: Vector3 = rs + fwd * float(af.length)
	fwd = -fwd
	hdg = hdg + PI
	rs = thr
	var prof := ""
	var hmax := 0.0
	for k in range(0, 17):
		var pp: Vector3 = rs - fwd * (k * 100.0)
		var hh := gh(pp)
		hmax = maxf(hmax, hh)
		prof += "%d:%.0f " % [k * 100, hh - rh]
	q("terrain before threshold (m before: height above runway) %s" % prof)
	var start_d := 900.0
	var aim_pitch := 0.05
	var vs_prev := 0.0
	place(pl, rs - fwd * start_d, hdg, 68.0)
	pl.fm.pos.y = rh + 22.0
	pl.fm.gear_down = true
	pl.fm.gear_down = true
	p.throttle = 0.35
	var touch := -1.0
	var touch_vs := 0.0
	var trace := ""
	for i in 60 * 80:
		var pos: Vector3 = pl.fm.pos
		var aimp := rs + fwd * 250.0
		aimp.y = rh
		var along := (pos - rs).dot(fwd)
		var to := aimp - pos
		if pl.fm.on_ground:
			p.aim_dir = fwd
			p.throttle = 0.0
			Input.action_press("brake")
			if touch < 0.0:
				touch = i / 60.0
		else:
			var agl: float = pos.y - rh
			var lateral: Vector3 = (pos - rs) - fwd * along
			lateral.y = 0.0
			var hdir: Vector3 = (fwd * 300.0 - lateral).normalized()
			var spd: float = pl.speed()
			if agl < 2.5:
				p.aim_dir = (hdir + Vector3(0, tan(aim_pitch + 0.03), 0)).normalized()
				p.throttle = 0.0
			else:
				aim_pitch = 0.055
				p.aim_dir = (hdir + Vector3(0, tan(aim_pitch), 0)).normalized()
				p.throttle = 0.3
			touch_vs = pl.fm.vertical_speed
		if i % 60 == 0:
			trace += "[%.0fs along=%.0f agl=%.0f v=%.0f vs=%.1f] " % [i / 60.0, along, pos.y - rh, pl.speed(), pl.fm.vertical_speed]
		if not pl.alive or pl.fm.crashed:
			break
		if pl.servicing or (pl.fm.on_ground and pl.speed() < 1.0 and i / 60.0 - touch > 5.0):
			break
		await get_tree().physics_frame
	Input.action_release("brake")
	q("landing: touch=%.1f s vs=%.1f alive=%s crashed=%s(%s) on_ground=%s speed=%.1f servicing=%s" % [touch, touch_vs, str(pl.alive), str(pl.fm.crashed),
		pl.fm.crash_reason, str(pl.fm.on_ground), pl.speed(), str(pl.servicing)])
	q("  trace " + trace)
	if pl.alive:
		var sf: Dictionary = mm.world.surface_at(pl.fm.pos.x, pl.fm.pos.z)
		q("  stopped on %s team=%d, %.0f m from airfield center (service_radius %.0f), gear=%s armed=%s servicing=%s" % [sf.kind, int(sf.team),
			Vector2(pl.fm.pos.x - af.pos.x, pl.fm.pos.z - af.pos.z).length(), af.service_radius, str(pl.fm.gear_down), str(pl.service_armed), str(pl.servicing)])
	if pl.alive and pl.fm.on_ground:
		var t: float = await wait_until(func(): return mm.player_stats().landings > 0, 8.0)
		q("  waited 8 s: servicing=%s landings=%d warnings=%s" % [str(pl.servicing), mm.player_stats().landings, str(warnings_of(pl))])
		# сдвинуть на 300 м к центру (как будто дорулил)
		var c2: Vector3 = Vector3(af.pos.x, pl.fm.pos.y, af.pos.z)
		var dir2: Vector3 = (c2 - pl.fm.pos).normalized()
		place(pl, pl.fm.pos + dir2 * (Vector2(pl.fm.pos.x - af.pos.x, pl.fm.pos.z - af.pos.z).length() - 300.0), hdg, 0.0, true)
		t = await wait_until(func(): return mm.player_stats().landings > 0, 40.0)
		q("  after moving to 300 m from center: serviced after %.1f s, landings=%d msgs=%s" % [t, mm.player_stats().landings, str(msgs)])

# ---------------------------------------------------------------- повреждения

func case_damage() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	var r = reds()[0]
	var fired := [0, 0]
	pl.dmg.fire_started.connect(func(): fired[0] += 1)
	pl.dmg.fire_out.connect(func(): fired[1] += 1)
	var n := 0
	while not pl.dmg.on_fire and n < 60:
		pl.take_hit(Vector3(0, 0, 0.5), 1.5, r.uid)
		n += 1
	await wait_s(0.2)
	q("fire after %d fuel hits: on_fire=%s fuel_leak=%s fuel=%.2f fire fx=%s warnings=%s" % [n, str(pl.dmg.on_fire), str(pl.dmg.fuel_leak), pl.dmg.module_ratio("fuel"),
		str(pl._fire_fx != null), str(warnings_of(pl))])
	var tries := 0
	var t_out := -1.0
	for i in 60 * 70:
		if not pl.dmg.on_fire:
			t_out = i / 60.0
			break
		if i % 30 == 0:
			Input.action_press("extinguish")
			tries += 1
		elif i % 30 == 5:
			Input.action_release("extinguish")
		await get_tree().physics_frame
	Input.action_release("extinguish")
	q("extinguish: out=%s after %.1f s (T pressed %d times, 20 s cooldown) fire_out=%d structure=%.2f fuel=%.2f alive=%s" % [str(not pl.dmg.on_fire),
		t_out, tries, fired[1], pl.dmg.module_ratio("structure"), pl.dmg.module_ratio("fuel"), str(pl.alive)])
	q("fuel leak after: %s, HUD warnings=%s" % [str(pl.dmg.fuel_leak), str(warnings_of(pl))])
	pl.dmg.repair_full()
	for i in 6:
		pl.take_hit(Vector3(0, 0, -3.6), 8.0, r.uid)
	await wait_s(0.5)
	q("engine hits: engine=%.2f oil_leak=%s engine_dead=%s thrust_factor=%.2f smoke=%s warnings=%s" % [pl.dmg.module_ratio("engine"), str(pl.dmg.oil_leak),
		str(pl.dmg.engine_dead), pl.fm.thrust_factor, str(pl._smoke_fx != null), str(warnings_of(pl))])
	await free_mm()
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	pl = mm.player
	r = reds()[0]
	var half: float = float(pl.def.shape.span) * 0.5
	var k := 0
	while not pl.dmg.left_wing_lost and k < 40:
		pl.take_hit(Vector3(-half * 0.6, 0, float(pl.def.shape.get("wing_z", 0.0))), 10.0, r.uid)
		k += 1
	await wait_s(0.1)
	q("wing: lost after %d hits, alive=%s reason=%s state=%s feed=%s detached=%s" % [k, str(pl.alive), pl.death_reason, mm.state, str(kills), str(pl._lost.has("LeftWing"))])
	var y0: float = pl.fm.pos.y
	await wait_s(3.0)
	q("  wreck: dy in 3 s=%.0f roll rate=%.2f exploded=%s" % [pl.fm.pos.y - y0, pl.fm.roll_rate, str(pl.exploded)])
	await free_mm()
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	pl = mm.player
	r = reds()[0]
	pl.take_hit(cockpit_point(pl), 15.0, r.uid)
	await wait_s(0.2)
	q("pilot hit 15: pilot=%.2f (module=%s)" % [pl.dmg.module_ratio("pilot"), pl.dmg.hit_zone(cockpit_point(pl))])
	pl.take_hit(cockpit_point(pl), 30.0, r.uid)
	await wait_s(0.1)
	q("pilot hit +30: pilot_dead=%s alive=%s reason=%s feed last=%s" % [str(pl.dmg.pilot_dead), str(pl.alive), pl.death_reason, kills.back() if not kills.is_empty() else ""])

# ---------------------------------------------------------------- энергия

func case_flight() -> void:
	await make({"mode": "realistic", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	p.mode = "keyboard"
	place(pl, Vector3(0, 2500, 1500), 0.0, 80.0)
	p.throttle = 0.0
	Input.action_press("pitch_up")
	var t_st := -1.0
	var v_st := 0.0
	var warned := false
	for i in 60 * 20:
		if pl.fm.stalled and t_st < 0.0:
			t_st = i / 60.0
			v_st = pl.fm.airspeed
		if "Сваливание" in warnings_of(pl):
			warned = true
		if t_st >= 0.0 and i / 60.0 > t_st + 1.0:
			break
		await get_tree().physics_frame
	q("stall (realistic strizh): stalled at %.1f s, %.0f km/h (stall_speed %.0f km/h), HUD 'Сваливание'=%s stall sound used=%s" % [t_st, v_st * 3.6,
		pl.fm.stall_speed() * 3.6, str(warned), str(sfx_seen("stall_warning"))])
	Input.action_press("yaw_left")
	var spin_max := 0.0
	var yaw_rate_max := 0.0
	for i in 60 * 6:
		spin_max = maxf(spin_max, pl.fm.spin)
		yaw_rate_max = maxf(yaw_rate_max, absf(pl.fm.yaw_rate))
		await get_tree().physics_frame
	var alt_spin: float = pl.fm.pos.y
	q("spin: max spin=%.2f yaw rate max=%.0f deg/s alt=%.0f" % [spin_max, rad_to_deg(yaw_rate_max), alt_spin])
	Input.action_release("pitch_up")
	Input.action_release("yaw_left")
	Input.action_press("yaw_right")
	Input.action_press("pitch_down")
	p.throttle = 0.6
	var t_rec := -1.0
	for i in 60 * 15:
		if pl.fm.spin <= 0.0 and not pl.fm.stalled and t_rec < 0.0:
			t_rec = i / 60.0
			break
		await get_tree().physics_frame
	Input.action_release("yaw_right")
	Input.action_release("pitch_down")
	q("recovery: spin=0 & not stalled after %.1f s, alt loss=%.0f m alive=%s" % [t_rec, alt_spin - pl.fm.pos.y, str(pl.alive)])
	await free_mm()
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	pl = mm.player
	p = pilot_mouse()
	p.mode = "keyboard"
	place(pl, Vector3(0, 2500, 1500), 0.0, 80.0)
	p.throttle = 0.0
	Input.action_press("pitch_up")
	Input.action_press("yaw_left")
	var st_a := 0
	var spin_a := 0.0
	for i in 60 * 10:
		if pl.fm.stalled:
			st_a += 1
		spin_a = maxf(spin_a, pl.fm.spin)
		await get_tree().physics_frame
	Input.action_release("pitch_up")
	Input.action_release("yaw_left")
	q("arcade (assist) idle + full pull + rudder 10 s: stalled frames=%d/600 max spin=%.2f speed=%.0f km/h" % [st_a, spin_a, pl.fm.airspeed * 3.6])
	for id in ["strizh", "sokol"]:
		await free_mm()
		await make({"mode": "arcade", "lineup": [id]})
		mm.request_spawn(id)
		await wait_s(0.3)
		pl = mm.player
		p = pilot_mouse()
		p.mode = "keyboard"
		var b := Basis(Vector3.RIGHT, deg_to_rad(-60.0))
		pl.fm.setup(pl.def, Vector3(0, 4500, 1000), b, 150.0, false)
		pl.fm.gear_down = false
		p.throttle = 1.0
		var vmax := 0.0
		var over_t := 0.0
		var warn_over := false
		var wing0: float = pl.dmg.module_ratio("left_wing")
		var smax := 0.0
		for i in 60 * 30:
			vmax = maxf(vmax, pl.fm.airspeed)
			smax = maxf(smax, pl.fm.structural_stress)
			if pl.fm.overspeed:
				over_t += 1.0 / 60.0
			if "Большая скорость" in warnings_of(pl):
				warn_over = true
			if pl.altitude_agl() < 900.0 or not pl.alive:
				break
			await get_tree().physics_frame
		q("dive %s 60 deg from 4500 m full throttle (vne %.0f km/h): max %.0f km/h, overspeed %.1f s, HUD warn=%s, wings %.2f->%.2f max stress=%.2f alive=%s" % [id,
			float(pl.def.vne) * 3.6, vmax * 3.6, over_t, str(warn_over), wing0, pl.dmg.module_ratio("left_wing"), smax, str(pl.alive)])
		if not pl.alive:
			continue
		place(pl, Vector3(0, 2500, 1000), 0.0, 160.0)
		p.throttle = 1.0
		Input.action_press("roll_right")
		await wait_s(0.6)
		Input.action_release("roll_right")
		Input.action_press("pitch_up")
		var v0: float = pl.fm.airspeed
		await wait_s(8.0)
		Input.action_release("pitch_up")
		q("  sustained pull 8 s at full throttle: speed %.0f -> %.0f km/h, g=%.1f stalled=%s" % [v0 * 3.6, pl.fm.airspeed * 3.6, pl.fm.g_load, str(pl.fm.stalled)])

# ---------------------------------------------------------------- кобра

func case_cobra() -> void:
	await make({"mode": "test", "test_plane": "flanker", "lineup": ["flanker"]})
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	for speed in [140.0, 170.0, 220.0]:
		place(pl, Vector3(0, 2500, 1000), 0.0, speed)
		p.mode = "keyboard"
		p.throttle = 0.3
		await wait_s(0.5)
		Input.action_press("pitch_up")
		var amax := 0.0
		var cob := false
		for i in 60 * 3:
			amax = maxf(amax, rad_to_deg(pl.fm.aoa))
			if pl.fm.cobra_active:
				cob = true
			await get_tree().physics_frame
		Input.action_release("pitch_up")
		var v_end: float = pl.fm.airspeed
		for i in 60 * 4:
			await get_tree().physics_frame
		q("cobra at %.0f km/h (keyboard Up, throttle 30%%): max AoA=%.0f deg cobra_active=%s speed after=%.0f km/h done=%s" % [speed * 3.6, amax, str(cob),
			v_end * 3.6, str(mm.cobra_done)])
		if mm.cobra_done:
			break
	q("msgs=%s" % str(msgs))
	mm.finish_match("exit")
	await wait_s(0.1)
	q("result cobra=%s mode=%s outcome=%s credits=%d" % [str(mm.result.get("cobra")), mm.result.mode, mm.result.outcome, int(mm.result.credits)])
	var before: Array = Profile.data.achievements.duplicate()
	var summary: Dictionary = Profile.apply_battle_result(mm.result)
	q("profile achievements before=%s new=%s has cobra=%s" % [str(before), str(summary.get("achievements")), str(Profile.has_achievement("cobra"))])

# ---------------------------------------------------------------- зенитки и облака

func case_aa() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	var aa_list: Array = []
	for u in mm.ground_units:
		if u.alive and u.team == 1 and (u.kind == "aa" or u.kind == "ship"):
			aa_list.append(u)
	var aa = aa_list[0]
	var ap: Vector3 = aa.global_position
	q("red AA units: %d; first variant=%s heavy=%s range=%.0f" % [aa_list.size(), aa.variant, str(aa.heavy), aa.fire_range])
	var c := ap
	var alt: float = ap.y + 500.0
	place(pl, Vector3(c.x + 1200, alt, c.z), 0.0, 110.0)
	var s0 := 0
	var f0 := 0
	for u in aa_list:
		s0 += u.shots_fired
		f0 += u.flak_fired
	hits = 0
	pl.dmg.module_damaged.connect(_on_hit)
	var t_dead := -1.0
	for i in 60 * 30:
		if not pl.alive:
			t_dead = i / 60.0
			break
		var pos: Vector3 = pl.fm.pos
		var ang := atan2(pos.z - c.z, pos.x - c.x) + 0.35
		var tgt := Vector3(c.x + cos(ang) * 1200.0, alt, c.z + sin(ang) * 1200.0)
		p.aim_dir = (tgt - pos).normalized()
		await get_tree().physics_frame
	var s1 := 0
	var f1 := 0
	var shooters := 0
	for u in aa_list:
		s1 += u.shots_fired
		f1 += u.flak_fired
		if u.shots_fired > 0 or u.flak_fired > 0:
			shooters += 1
	q("AA vs player orbiting 1200 m radius / 500 m above for 30 s: AA shooting=%d shots=%d flak=%d hits on player=%d alive=%s (died at %.1f) feed=%s" % [shooters, s1 - s0, f1 - f0, hits,
		str(pl.alive), t_dead, str(kills)])

func case_cloud() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"], "weather": "cloudy"})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	var best := Vector3.ZERO
	var bd := 0.0
	for x in range(-3000, 3001, 150):
		for z in range(-3000, 3001, 150):
			for y in [1000.0, 1200.0, 1400.0, 1600.0]:
				var v := Vector3(x, y, z)
				var d: float = mm.world.cloud_density_at(v)
				if d > bd:
					bd = d
					best = v
	q("densest cloud point %s density=%.2f" % [str(best), bd])
	var e = null
	for ac in reds():
		if String(ac.def.line) == "fighter":
			e = ac
	remove_bots([e])
	place(pl, best, 0.0, 60.0)
	pl.pilot.throttle = 0.3
	place(e, best + Vector3(0, 0, 650), 0.0, 90.0)
	var hidden_frames := 0
	var target_frames := 0
	var fire_frames := 0
	for i in 60 * 6:
		p.aim_dir = Vector3(0, 0, -1)
		if pl.in_cloud:
			hidden_frames += 1
			if e.pilot.target == pl:
				target_frames += 1
			if bool(e.controls.get("guns", false)):
				fire_frames += 1
		await get_tree().physics_frame
	q("bot 650 m behind, player in cloud: in_cloud %d/360 frames, bot targets player while hidden %d frames, fires %d frames, bot state=%s d=%.0f" % [hidden_frames, target_frames,
		fire_frames, e.pilot.state, e.fm.pos.distance_to(pl.fm.pos)])
	place(pl, Vector3(best.x, 2600, best.z), 0.0, 60.0)
	place(e, Vector3(best.x, 2600, best.z + 650), 0.0, 90.0)
	var tf := 0
	for i in 60 * 4:
		p.aim_dir = Vector3(0, 0, -1)
		if e.pilot.target == pl:
			tf += 1
		await get_tree().physics_frame
	q("control (clear air 2600 m, in_cloud=%s): bot targets player %d/240 frames" % [str(pl.in_cloud), tf])
	place(pl, best, 0.0, 60.0)
	q("cloud haze: effects.haze=%.2f camera density=%.2f" % [mm.hud.effects.haze, mm.world.cloud_density_at(mm.camera_rig.camera.global_position)])
	await wait_s(1.0)
	q("cloud haze after 1 s: effects.haze=%.2f camera density=%.2f player density=%.2f in_cloud=%s" % [mm.hud.effects.haze, mm.world.cloud_density_at(mm.camera_rig.camera.global_position),
		mm.world.cloud_density_at(pl.fm.pos), str(pl.in_cloud)])

# ---------------------------------------------------------------- тестовый полёт, обучение

func case_testflight() -> void:
	for id in ["prizrak", "groza"]:
		await make({"mode": "test", "test_plane": id, "lineup": ["strizh"]})
		await wait_s(0.5)
		var pl = mm.player
		q("test %s: state=%s plane=%s lineup=%s uses=%s show_score=%s drones=%d agl=%.0f" % [id, mm.state, pl.def_id if pl else "-", str(mm.lineup),
			str(mm.lineup_uses), str(mm.show_score), mm.aircraft.size() - 1, pl.altitude_agl() if pl else 0.0])
		var p = pilot_mouse()
		await wait_s(10.0)
		q("  after 10 s: alive=%s speed=%.0f km/h y=%.0f state=%s" % [str(pl.alive), pl.speed() * 3.6, pl.fm.pos.y, mm.state])
		var ok: bool = mm.return_to_spawn_menu()
		await wait_s(0.2)
		q("  change plane: %s state=%s menu=%s" % [str(ok), mm.state, mm.hud.spawn_menu.mode])
		ok = mm.request_spawn(id)
		await wait_s(0.2)
		kill_ac(mm.player, -1)
		await wait_until(func(): return mm.state == "spawn" or mm.state == "dead", 12.0)
		q("  death in test -> state=%s, can respawn=%s" % [mm.state, str(mm.can_spawn(id))])
		mm.finish_match("exit")
		q("  result credits=%d xp=%s" % [int(mm.result.credits), str(mm.result.xp_by_plane)])
		await free_mm()

func case_training() -> void:
	await make({"mode": "training", "autopilot": true})
	await wait_s(0.5)
	var tr = mm.training
	q("training plane=%s step=%d hint='%s'" % [mm.player.def_id if mm.player else "-", tr.step, tr.hint])
	var seen := {}
	seen[tr.step] = tr.hint
	var t0: float = mm.elapsed
	var last_step: int = tr.step
	var stuck := 0.0
	while mm.state != "ended" and mm.elapsed - t0 < 600.0:
		await wait_s(1.0)
		if tr.step != last_step:
			q("  t=%.0f step %d -> %d hint='%s'" % [mm.elapsed, last_step, tr.step, tr.hint])
			last_step = tr.step
			stuck = 0.0
			seen[tr.step] = tr.hint
		else:
			stuck += 1.0
		if stuck > 90.0 and tr.step < 7:
			q("  step %d stuck 90 s with autopilot, forcing next" % tr.step)
			tr._enter(tr.step + 1)
			stuck = 0.0
	q("training ended=%s outcome=%s steps seen=%s" % [str(mm.state == "ended"), mm.outcome, str(seen.keys())])

# ---------------------------------------------------------------- сенсор

func case_touch() -> void:
	await make({"mode": "arcade", "lineup": ["shmel"]})
	mm.request_spawn("shmel")
	await wait_s(0.3)
	var hud = mm.hud
	hud.set_touch_override(1)
	await wait_s(0.3)
	var tc = hud.touch
	var p = mm.player_pilot
	q("touch_on=%s touch.visible=%s pilot.mode=%s buttons=%s size=%s" % [str(hud.touch_on), str(tc.visible), p.mode, str(tc.buttons.map(func(b): return b.id)), str(tc.size)])
	var base: Vector2 = tc.stick_base
	tc.touch_down(0, base + Vector2(0, -2))
	tc.touch_move(0, base + Vector2(60, -60), Vector2(60, -60))
	await wait_s(0.1)
	var ctl: Dictionary = mm.player.controls
	q("stick drag up-right: stick_vec=%s touch_input.stick=%s controls pitch=%.2f roll=%.2f (pilot mode %s)" % [str(tc.stick_vec), str(p.touch_input.get("stick")), ctl.pitch, ctl.roll, p.mode])
	tc.touch_up(0)
	var g: Dictionary = tc.button("guns")
	tc.touch_down(1, g.c)
	await wait_s(0.1)
	q("fire button: touch_input.guns=%s controls.guns=%s" % [str(p.touch_input.get("guns")), str(mm.player.controls.guns)])
	tc.touch_up(1)
	var rb: Dictionary = tc.button("rocket")
	var r0: int = mm.player.weapons.ammo.rockets
	tc.touch_down(2, rb.c)
	await wait_s(0.1)
	q("rocket button: controls.rocket=%s rockets %d -> %d" % [str(mm.player.controls.rocket), r0, int(mm.player.weapons.ammo.rockets)])
	tc.touch_up(2)
	var tr: Rect2 = tc.throttle_rect
	tc.touch_down(3, Vector2(tr.get_center().x, tr.end.y - tr.size.y * 0.2))
	await wait_s(0.2)
	q("throttle slider at 20%%: touch throttle=%s controls.throttle=%.2f fm.throttle=%.2f" % [str(p.touch_input.get("throttle")), mm.player.controls.throttle, mm.player.fm.throttle])
	tc.touch_up(3)
	await wait_s(0.2)
	q("after release slider: controls.throttle=%.2f" % mm.player.controls.throttle)
	var a0: Vector3 = p.aim_dir
	tc.touch_down(4, Vector2(tc.size.x * 0.6, tc.size.y * 0.3))
	tc.touch_move(4, Vector2(tc.size.x * 0.6 + 80, tc.size.y * 0.3), Vector2(80, 0))
	await wait_s(0.1)
	tc.touch_up(4)
	q("aim drag 80 px: aim change=%.1f deg" % rad_to_deg(a0.angle_to(p.aim_dir)))
	p.follow_settings = false
	p.mode = "touch"
	tc.touch_down(5, base + Vector2(0, -2))
	tc.touch_move(5, base + Vector2(60, -60), Vector2(60, -60))
	await wait_s(0.1)
	ctl = mm.player.controls
	q("pilot.mode forced to touch: controls pitch=%.2f roll=%.2f" % [ctl.pitch, ctl.roll])
	tc.touch_up(5)
	Profile.set_setting("touch", "on")
	p.follow_settings = true
	p._read_settings()
	q("with Profile touch=on: Game.is_touch=%s pilot.mode=%s" % [str(Game.is_touch()), p.mode])
	Profile.set_setting("touch", "auto")

# ---------------------------------------------------------------- пауза, таблица, выход

func case_pause() -> void:
	await make({"mode": "arcade", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var hud = mm.hud
	hud.toggle_pause()
	await get_tree().process_frame
	var e0: float = mm.elapsed
	await get_tree().process_frame
	await get_tree().process_frame
	await get_tree().physics_frame
	q("pause: tree.paused=%s battle.paused=%s menu visible=%s elapsed frozen=%s" % [str(get_tree().paused), str(mm.paused), str(hud.pause_menu.visible), str(mm.elapsed == e0)])
	var labels: Array = []
	for b in hud.pause_menu.find_children("*", "Button", true, false):
		labels.append((b as Button).text)
	q("pause buttons=%s" % str(labels))
	hud.toggle_pause()
	await get_tree().process_frame
	q("resume: paused=%s" % str(get_tree().paused))
	Input.action_press("scoreboard")
	await get_tree().process_frame
	await get_tree().process_frame
	q("Tab held: scoreboard visible=%s rows=%d" % [str(hud.scoreboard.visible), mm.get_scoreboard().size()])
	Input.action_release("scoreboard")
	await get_tree().process_frame
	await get_tree().process_frame
	q("Tab released: scoreboard visible=%s" % str(hud.scoreboard.visible))
	var r = reds()[0]
	kill_ac(r, mm.player.uid)
	await wait_s(0.3)
	var credits0: int = Profile.data.credits
	hud.toggle_pause()
	await get_tree().process_frame
	hud._quit_to_hangar()
	await get_tree().process_frame
	q("exit: state=%s outcome=%s result credits=%d xp=%s kills=%d paused=%s" % [mm.state, mm.outcome, int(mm.result.credits), str(mm.result.xp_by_plane),
		int(mm.result.kills), str(get_tree().paused)])
	var s: Dictionary = Profile.apply_battle_result(Game.last_result)
	q("profile apply: earned=%d repair=%d delta=%d credits %d -> %d" % [int(s.credits_earned), int(s.repair_cost), int(s.credits_delta), credits0, int(Profile.data.credits)])

# ---------------------------------------------------------------- производительность

func case_perf() -> void:
	await make({"mode": "arcade", "size": 8, "map_id": "fjord", "autopilot": true, "seed": 99})
	await wait_s(1.0)
	q("8x8 fjord: aircraft=%d units=%d" % [mm.aircraft.size(), mm.ground_units.size()])
	var samples: Array = []
	var proc: Array = []
	var t0 := Time.get_ticks_usec()
	var frames := 0
	var t_prev := Time.get_ticks_usec()
	var frame_ms: Array = []
	while mm.elapsed < 121.0 and mm.state != "ended":
		await get_tree().physics_frame
		var now := Time.get_ticks_usec()
		frame_ms.append(float(now - t_prev) / 1000.0)
		t_prev = now
		samples.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0)
		proc.append(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
		frames += 1
	var wall := float(Time.get_ticks_usec() - t0) / 1000.0
	frame_ms.sort()
	samples.sort()
	var avg := 0.0
	for s in samples:
		avg += float(s)
	avg /= maxf(samples.size(), 1)
	var pavg := 0.0
	for s in proc:
		pavg += float(s)
	pavg /= maxf(proc.size(), 1)
	q("perf headless 8x8 fjord, %.0f s game: %d physics frames in %.0f ms wall => %.2f ms per frame; physics monitor avg=%.2f p50=%.2f p95=%.2f max=%.2f ms; process avg=%.2f ms" % [mm.elapsed,
		frames, wall, wall / maxf(frames, 1), avg, samples[samples.size() / 2], samples[int(samples.size() * 0.95)], samples.back(), pavg])
	q("frame wall p50=%.2f p95=%.2f p99=%.2f max=%.2f ms; bullets now=%d aircraft=%d kills so far=%d" % [frame_ms[frame_ms.size() / 2], frame_ms[int(frame_ms.size() * 0.95)],
		frame_ms[int(frame_ms.size() * 0.99)], frame_ms.back(), mm.projectiles.bullet_count(), mm.aircraft.size(), kills.size()])

func case_cobra2() -> void:
	await make({"mode": "test", "test_plane": "flanker", "lineup": ["flanker"]})
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	for hold in [0.8, 1.2, 1.8]:
		for speed in [140.0, 170.0]:
			mm.cobra_done = false
			mm._cobra_t = -1.0
			place(pl, Vector3(0, 2500, 1000), 0.0, speed)
			p.mode = "keyboard"
			p.throttle = 0.3
			await wait_s(0.5)
			Input.action_press("pitch_up")
			var trace := ""
			var n := int(hold * 60.0)
			for i in 60 * 8:
				if i == n:
					Input.action_release("pitch_up")
				if i % 30 == 0:
					trace += "%.1f:%.0f/%.0f " % [i / 60.0, rad_to_deg(pl.fm.aoa), rad_to_deg(pl.fm.pitch_angle())]
				if mm.cobra_done:
					break
				await get_tree().physics_frame
			Input.action_release("pitch_up")
			q("hold %.1f s at %.0f km/h: done=%s  t:aoa/pitch %s" % [hold, speed * 3.6, str(mm.cobra_done), trace])
	# мышью: инструктор
	mm.cobra_done = false
	mm._cobra_t = -1.0
	place(pl, Vector3(0, 2500, 1000), 0.0, 150.0)
	p.mode = "mouse"
	p.throttle = 0.3
	var amax := 0.0
	for i in 60 * 3:
		p.aim_dir = Vector3(0, 1, -0.05).normalized()
		amax = maxf(amax, rad_to_deg(pl.fm.aoa))
		await get_tree().physics_frame
	q("mouse aim straight up at 540 km/h throttle 30%%: max AoA=%.0f cobra_active seen? done=%s" % [amax, str(mm.cobra_done)])

func case_glide() -> void:
	await make({"mode": "arcade", "lineup": ["strizh", "sokol"]})
	for id in ["strizh", "sokol"]:
		if mm.player == null:
			mm.spawn_points = 1000
			mm._set_state("spawn")
		mm.request_spawn(id)
		await wait_s(0.3)
		var pl = mm.player
		var p = pilot_mouse()
		for cfg in [[68.0, true, 0.05], [90.0, false, 0.0], [68.0, true, 0.10]]:
			place(pl, Vector3(0, 1500, 1000), 0.0, cfg[0])
			pl.fm.gear_down = cfg[1]
			p.throttle = 0.4
			var trace := ""
			var vmin := 0.0
			var vmax := 0.0
			for i in 60 * 15:
				p.aim_dir = Vector3(0, tan(cfg[2]), -1).normalized()
				if i > 120:
					vmin = minf(vmin, pl.fm.vertical_speed)
					vmax = maxf(vmax, pl.fm.vertical_speed)
				if i % 60 == 0:
					trace += "%.1f " % pl.fm.vertical_speed
				await get_tree().physics_frame
			q("%s const aim %.0f deg, v0=%.0f gear=%s throttle 40%%: vs range after 2 s [%.1f, %.1f] m/s, end speed %.0f; vs per s: %s" % [id, rad_to_deg(cfg[2]), cfg[0], str(cfg[1]),
				vmin, vmax, pl.speed(), trace])
		mm.player.fm.crashed = true
		await wait_until(func(): return mm.state != "flying" and mm.state != "killcam", 10.0)

func _tr_wait_step(tr, n: int, max_s: float) -> float:
	return await wait_until(func(): return tr.step >= n or mm.state == "ended", max_s)

func case_training2() -> void:
	await make({"mode": "training", "autopilot": false})
	await wait_s(0.5)
	var tr = mm.training
	var pl = mm.player
	var p = pilot_mouse()
	q("training (real PlayerPilot) plane=%s step=%d hint='%s' y=%.0f" % [pl.def_id, tr.step, tr.hint, pl.fm.pos.y])
	# 1 газ
	Input.action_press("throttle_up")
	var t: float = await _tr_wait_step(tr, 2, 30.0)
	Input.action_release("throttle_up")
	q("step1 throttle done in %.1f s -> step %d '%s'" % [t, tr.step, tr.hint])
	# 2 поворот мышью
	var yaw0: float = pl.fm.heading()
	var k := 0
	t = -1.0
	for i in 60 * 40:
		if tr.step >= 3:
			t = i / 60.0
			break
		var a: float = yaw0 + minf(i / 60.0 * 0.5, 2.0)
		p.aim_dir = Vector3(sin(a), 0.02, -cos(a)).normalized()
		await get_tree().physics_frame
	q("step2 turn done in %.1f s -> step %d '%s'" % [t, tr.step, tr.hint])
	# 3 набор высоты
	t = -1.0
	for i in 60 * 90:
		if tr.step >= 4:
			t = i / 60.0
			break
		var f: Vector3 = pl.forward()
		p.aim_dir = (Vector3(f.x, 0, f.z).normalized() + Vector3(0, 0.3, 0)).normalized()
		await get_tree().physics_frame
	q("step3 climb done in %.1f s (y=%.0f) -> step %d '%s'" % [t, pl.fm.pos.y, tr.step, tr.hint])
	# 4 мишени
	t = -1.0
	var fired := 0
	for i in 60 * 240:
		if tr.step >= 5 or not pl.alive:
			t = i / 60.0
			break
		var best = null
		var bd := 1e9
		for d in tr.drones:
			if is_instance_valid(d) and d.alive:
				var dd: float = d.fm.pos.distance_to(pl.fm.pos)
				if dd < bd:
					bd = dd
					best = d
		if best == null:
			Input.action_release("fire_guns")
			await get_tree().physics_frame
			continue
		var ad := lead_dir(pl, best)
		p.aim_dir = ad
		if bd < 500.0 and rad_to_deg(pl.forward().angle_to(ad)) < 2.5:
			Input.action_press("fire_guns")
			fired += 1
		else:
			Input.action_release("fire_guns")
		await get_tree().physics_frame
	Input.action_release("fire_guns")
	q("step4 drones done in %.1f s, kills=%d firing %.1f s alive=%s -> step %d '%s'" % [t, tr.drone_kills, fired / 60.0, str(pl.alive), tr.step, tr.hint])
	if not pl.alive:
		return
	# 5 бомба по цели
	await wait_s(0.2)
	var obj = tr.objective
	q("step5 objective=%s(%s) at %.0f m, ammo=%s" % [obj.kind if obj else "-", obj.variant if obj else "", obj.global_position.distance_to(pl.fm.pos) if obj else 0.0, str(pl.weapons.ammo)])
	var passes := 0
	t = -1.0
	var bp: Vector3 = obj.global_position
	var drop_cd := 0.0
	var tstart: float = mm.elapsed
	for i in 60 * 240:
		if tr.step >= 6 or not pl.alive:
			t = i / 60.0
			break
		var pos: Vector3 = pl.fm.pos
		var flat := Vector3(bp.x - pos.x, 0, bp.z - pos.z)
		var want_y: float = bp.y + 300.0
		if flat.length() < 250.0 or (flat.normalized().dot(Vector3(pl.velocity().x, 0, pl.velocity().z).normalized()) < 0.0 and flat.length() < 1500.0):
			# прошли цель: отлететь и развернуться
			p.aim_dir = (Vector3(pl.forward().x, 0, pl.forward().z).normalized() + Vector3(0, (want_y - pos.y) * 0.003, 0)).normalized()
		else:
			p.aim_dir = (flat.normalized() + Vector3(0, (want_y - pos.y) * 0.004, 0)).normalized()
		drop_cd -= 1.0 / 60.0
		var imp := bomb_predict(pos, pl.velocity(), bp.y)
		var past := (imp - bp).dot(pl.velocity().normalized() * Vector3(1, 0, 1))
		var miss := Vector2(imp.x - bp.x, imp.z - bp.z).length()
		if drop_cd <= 0.0 and past >= 0.0 and miss < 40.0 and int(pl.weapons.ammo.bombs) > 0:
			Input.action_press("drop_bomb")
			passes += 1
			drop_cd = 12.0
		else:
			Input.action_release("drop_bomb")
		if i % 600 == 0 and i > 0 and flat.length() > 2600.0:
			pass
		await get_tree().physics_frame
	Input.action_release("drop_bomb")
	q("step5 bomb done in %.1f s, bombs dropped=%d obj alive=%s -> step %d '%s'" % [t, passes, str(obj.alive) if is_instance_valid(obj) else "freed", tr.step, tr.hint])
	if tr.step < 6:
		tr._enter(6)
		q("  forced step 6")
	# 6 посадка: короткая прямая (телепорт на 900 м до торца встречного курса)
	var af: Dictionary = mm.world.airfield_of(0)
	var hdg: float = af.heading + PI
	var fwd := Vector3(sin(hdg), 0, -cos(hdg))
	var thr: Vector3 = af.runway_start - fwd * float(af.length)
	var rh: float = mm.world.surface_at(thr.x, thr.z).height
	place(pl, thr - fwd * 250.0, hdg, 68.0)
	pl.fm.pos.y = rh + 22.0
	pl.fm.gear_down = true
	t = -1.0
	for i in 60 * 60:
		if tr.step >= 7 or mm.state == "ended":
			t = i / 60.0
			break
		var pos: Vector3 = pl.fm.pos
		var along := (pos - thr).dot(fwd)
		var lateral: Vector3 = (pos - thr) - fwd * along
		lateral.y = 0.0
		var hdir: Vector3 = (fwd * 300.0 - lateral).normalized()
		if pl.fm.on_ground:
			p.aim_dir = fwd
			p.throttle = 0.0
			Input.action_press("brake")
		elif pos.y - rh < 2.5:
			p.aim_dir = (hdir + Vector3(0, tan(0.085), 0)).normalized()
			p.throttle = 0.0
		else:
			p.aim_dir = (hdir + Vector3(0, tan(0.055), 0)).normalized()
			p.throttle = 0.3
		if not pl.alive:
			break
		await get_tree().physics_frame
	Input.action_release("brake")
	var sf: Dictionary = mm.world.surface_at(pl.fm.pos.x, pl.fm.pos.z)
	q("step6 landing: step %d after %.1f s alive=%s on_ground=%s surface=%s hint='%s'" % [tr.step, t, str(pl.alive), str(pl.fm.on_ground), sf.kind, tr.hint])
	t = await wait_until(func(): return mm.state == "ended", 10.0)
	q("training end: state=%s outcome=%s after %.1f s, result credits=%d xp=%s" % [mm.state, mm.outcome, t, int(mm.result.get("credits", -1)), str(mm.result.get("xp_by_plane"))])

func case_full() -> void:
	await make({"mode": "arcade", "size": 4, "map_id": "reef", "autopilot": true, "seed": 31})
	var t0 := Time.get_ticks_msec()
	var next := 60.0
	while mm.state != "ended" and mm.elapsed < 960.0:
		await wait_s(5.0)
		if mm.elapsed >= next:
			next += 120.0
			q("  t=%.0f tickets=%s zones=%s player=%s state=%s" % [mm.elapsed, str(mm.tickets), str(mm.zones_state.map(func(z): return z.owner)), str(mm.player != null), mm.state])
	q("full match: ended=%s outcome=%s winner=%d elapsed=%.0f time_left=%.0f tickets=%s kills=%d wall=%d ms" % [str(mm.state == "ended"), mm.outcome, mm.winner,
		mm.elapsed, mm.time_left, str(mm.tickets), kills.size(), Time.get_ticks_msec() - t0])
	q("player stats=%s" % str(mm.player_stats()))

func case_reef() -> void:
	await make({"mode": "arcade", "map_id": "reef", "lineup": ["strizh"]})
	mm.request_spawn("strizh")
	await wait_s(0.3)
	var pl = mm.player
	var p = pilot_mouse()
	var kinds := {}
	for u in mm.ground_units:
		var k := "%s/t%d" % [u.kind, u.team]
		kinds[k] = int(kinds.get(k, 0)) + 1
	q("reef units: %s; blue airfield kind=%s" % [str(kinds), mm.world.airfield_of(0).kind])
	var ship = _find_unit("ship", 1)
	if ship == null:
		q("no red ship")
		return
	var sp: Vector3 = ship.global_position
	place(pl, sp + Vector3(2000, 700, 0), -PI / 2.0, 110.0)
	var s0: int = ship.shots_fired + ship.flak_fired
	hits = 0
	pl.dmg.module_damaged.connect(_on_hit)
	for i in 60 * 15:
		var pos: Vector3 = pl.fm.pos
		var ang := atan2(pos.z - sp.z, pos.x - sp.x) + 0.3
		p.aim_dir = (Vector3(sp.x + cos(ang) * 2000.0, sp.y + 700.0, sp.z + sin(ang) * 2000.0) - pos).normalized()
		if not pl.alive:
			break
		await get_tree().physics_frame
	q("ship (range %.0f, heavy=%s) vs player at 2000 m for 15 s: shots+flak=%d hits on player=%d alive=%s" % [ship.fire_range, str(ship.heavy), ship.shots_fired + ship.flak_fired - s0, hits, str(pl.alive)])
	var t1: float = mm.tickets[1]
	ship.take_damage(1e6, pl.uid if pl.alive else -1, true)
	await wait_s(0.1)
	q("ship destroyed: tickets %.0f -> %.0f, feed=%s" % [t1, mm.tickets[1], str(kills.back() if not kills.is_empty() else "")])
	var car = _find_unit("carrier", 0)
	if car != null:
		var hp0: float = car.hp
		car.take_damage(1e6, -1, true)
		q("carrier invulnerable: alive=%s hp %.0f -> %.0f" % [str(car.alive), hp0, car.hp])

func case_rwy() -> void:
	for m in ["canyon", "fjord", "reef"]:
		await make({"mode": "arcade", "map_id": m, "lineup": ["strizh"]})
		var af: Dictionary = mm.world.airfield_of(0)
		var hdg: float = af.heading
		var fwd := Vector3(sin(hdg), 0, -cos(hdg))
		var rs: Vector3 = af.runway_start
		var line := ""
		for d in range(-100, int(af.length) + 101, 100):
			var pp: Vector3 = rs + fwd * float(d)
			var sf: Dictionary = mm.world.surface_at(pp.x, pp.z)
			var dc := Vector2(pp.x - af.pos.x, pp.z - af.pos.z).length()
			line += "%d:%s/%s%s " % [d, String(sf.kind).substr(0, 3), Game.fmt_int(int(dc)), "*" if dc <= float(af.service_radius) else ""]
		q("%s %s len=%.0f service_r=%.0f; along runway (m from start: surface/dist to center, * = service ok): %s" % [m, af.kind, af.length, af.service_radius, line])
		await free_mm()
