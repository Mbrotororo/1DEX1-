extends Node
## QA (не коммитить): настоящий MatchManager → Game.last_result → экран итогов → профиль.
## godot --headless --path skybreak res://tests/qa_meta_battle.tscn -- --mode=arcade --lineup=strizh,shmel
##   --secs=240 --speed=8 --end=natural|quit|win|loss --size=4 --seed=4242 --map=canyon --keep=1

const TMP := "user://qa_meta_battle.json"

var cfg := {"mode": "arcade", "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
	"lineup": ["strizh", "shmel"], "test_plane": "flanker", "seed": 4242, "autopilot": true}
var secs := 240.0
var end_kind := "natural"
var keep := false
var _mm = null
var _done := false
var _kills_by_plane := {}
var _spawn_order: Array = []
var _lost_order: Array = []
var _cur_plane := ""
var _pname := ""
var _wall0 := 0
var _kill_at: Array = []


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"mode": cfg.mode = kv[1]
			"lineup": cfg.lineup = Array(kv[1].split(","))
			"secs": secs = float(kv[1])
			"speed":
				Engine.time_scale = float(kv[1])
				Engine.max_physics_steps_per_frame = 64
			"end": end_kind = kv[1]
			"size": cfg.size = int(kv[1])
			"seed": cfg.seed = int(kv[1])
			"map": cfg.map_id = kv[1]
			"keep": keep = kv[1] == "1"
			"kill_at":
				for x in kv[1].split(","):
					_kill_at.append(float(x))
	Profile.save_path = TMP
	if not keep and FileAccess.file_exists(TMP):
		DirAccess.remove_absolute(TMP)
	Profile.load_profile()
	for id in cfg.lineup:
		if not id in Profile.data.owned:
			Profile.data.owned.append(id)
		if not id in Profile.data.researched:
			Profile.data.researched.append(id)
	Profile.data.lineup = cfg.lineup.duplicate()
	Profile.save_profile()
	_pname = String(Profile.get_setting("player_name"))
	await get_tree().process_frame
	Game.match_config = cfg
	Game.last_result = {}
	_mm = load("res://scenes/battle.tscn").instantiate()
	_mm.leave_scene = false
	_mm.kill_event.connect(_on_kill)
	_mm.player_spawned.connect(func(ac): _cur_plane = String(ac.def_id); _spawn_order.append(_cur_plane))
	_mm.player_killed.connect(func(info): _lost_order.append(_cur_plane); print("[qa] player killed in %s t=%.0f info=%s" % [_cur_plane, _mm.elapsed, info]))
	_mm.match_ended.connect(func(_r): print("[qa] match_ended t=%.0f" % _mm.elapsed))
	_wall0 = Time.get_ticks_msec()
	get_tree().root.add_child(_mm)
	print("[qa] cfg=", cfg, " secs=", secs, " end=", end_kind)


func _on_kill(text: String, kt: int, vt: int) -> void:
	print("[qa][kill] t=%.0f %s" % [_mm.elapsed, text])
	var mark := "(" + _pname + ") сбил"
	var i := text.find(mark)
	if i > 0:
		var plane_name := text.substr(0, i).strip_edges()
		_kills_by_plane[plane_name] = int(_kills_by_plane.get(plane_name, 0)) + 1


func _process(_dt: float) -> void:
	if _mm == null or _done:
		return
	if not _kill_at.is_empty() and float(_mm.elapsed) >= float(_kill_at[0]):
		if _mm.player != null and is_instance_valid(_mm.player) and _mm.player.alive:
			print("[qa] forcing crash of player %s at t=%.0f" % [_mm.player.def_id, _mm.elapsed])
			_mm.spawn_points += 1000
			_mm.player.fm.crashed = true
			_mm.player.fm.crash_reason = "ground"
			_kill_at.pop_front()
	if _mm.state == "ended":
		_done = true
		_after.call_deferred()
		return
	if float(_mm.elapsed) >= secs and end_kind != "natural":
		_done = true
		match end_kind:
			"quit":
				_mm.quit_to_hangar()
			_:
				_mm.finish_match(end_kind)
		_after.call_deferred()
	elif float(_mm.elapsed) >= 900.0 + 30.0:
		_done = true
		_after.call_deferred()


func _after() -> void:
	Engine.time_scale = 1.0
	print("[qa] wall=%.1f s elapsed=%.0f state=%s" % [(Time.get_ticks_msec() - _wall0) / 1000.0, _mm.elapsed, _mm.state])
	var r: Dictionary = Game.last_result.duplicate(true)
	var sb = r.get("scoreboard", [])
	r.erase("scoreboard")
	print("[qa] RESULT=", r)
	for row in sb:
		print("[qa]   sb ", row)
	print("[qa] spawn order=", _spawn_order, " lost order=", _lost_order, " kills by plane (kill feed)=", _kills_by_plane)
	print("[qa] _rewards per plane=", _mm.get("_rewards"))
	# пересчёт награды по Data.ECONOMY
	var rw: Dictionary = _mm.get("_rewards")
	var used: Array = r.get("planes_used", [])
	var cr := 0.0
	var xp := {}
	if String(r.mode) in ["arcade", "realistic"]:
		for pid in rw:
			cr += float(rw[pid].credits)
			xp[pid] = float(xp.get(pid, 0.0)) + float(rw[pid].xp)
		for pid in used:
			var rk := int(Data.plane(pid).rank)
			var rm := float(Data.ECONOMY.rank_mult[rk])
			cr += 200.0 * rm / used.size()
			xp[pid] = float(xp.get(pid, 0.0)) + 100.0 * rm / used.size()
		if String(r.outcome) == "win":
			cr *= 1.3
			for k in xp:
				xp[k] *= 1.3
	print("[qa] recomputed credits=%.1f xp=%s  (result credits=%s xp=%s)" % [cr, xp, r.get("credits"), r.get("xp_by_plane")])
	var repair_true := 0
	for id in _lost_order:
		repair_true += int(Data.plane(id).repair)
	print("[qa] true repair by lost order=%d" % repair_true)
	# снимок профиля до
	var before := {"credits": int(Profile.data.credits), "total_xp": int(Profile.data.total_xp),
		"research_xp": Profile.data.research_xp.duplicate(), "stats": Profile.data.stats.duplicate(),
		"logbook": Profile.data.logbook.size(), "plane_stats": Profile.data.plane_stats.duplicate(true)}
	# экран итогов (как Game.go_results)
	_mm.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	Game.result_applied = false
	var rs = load("res://scenes/results.tscn").instantiate()
	get_tree().root.add_child(rs)
	await get_tree().process_frame
	var summary: Dictionary = rs.summary
	print("[qa] SUMMARY=", summary)
	print("[qa] profile credits %d -> %d (delta %d)  total_xp %d -> %d (delta %d)" % [before.credits, Profile.data.credits,
		int(Profile.data.credits) - before.credits, before.total_xp, Profile.data.total_xp, int(Profile.data.total_xp) - before.total_xp])
	print("[qa] research_xp ", before.research_xp, " -> ", Profile.data.research_xp)
	print("[qa] stats ", before.stats, " -> ", Profile.data.stats)
	print("[qa] plane_stats -> ", Profile.data.plane_stats)
	print("[qa] logbook %d -> %d, top=%s" % [before.logbook, Profile.data.logbook.size(), Profile.data.logbook[0] if Profile.data.logbook.size() > 0 else {}])
	print("[qa] achievements=", Profile.data.achievements, " rank=", Profile.player_rank())
	# все тексты экрана итогов
	var texts: Array = []
	_collect(rs, texts)
	print("[qa] RESULTS TEXTS: ", " | ".join(PackedStringArray(texts)))
	print("[qa] replay button visible=", rs.get("_replay_btn").visible, " last_replay empty=", Game.last_replay.is_empty())
	# повторный заход на экран итогов не должен начислять ещё раз
	var c1 := int(Profile.data.credits)
	rs.queue_free()
	await get_tree().process_frame
	var rs2 = load("res://scenes/results.tscn").instantiate()
	get_tree().root.add_child(rs2)
	await get_tree().process_frame
	print("[qa] second results screen: credits %d -> %d summary same=%s" % [c1, Profile.data.credits, str(rs2.summary == summary)])
	rs2.queue_free()
	await get_tree().process_frame
	get_tree().quit()


func _collect(n: Node, out: Array) -> void:
	if n is Label and (n as Label).visible and (n as Label).text != "":
		out.append((n as Label).text)
	elif n is Button and (n as Button).text != "":
		out.append("[" + (n as Button).text + "]")
	for c in n.get_children():
		_collect(c, out)
