extends Node
## Пакетный прогон целых боёв без экрана: баланс и поведение ботов.
## Игроком управляет бот (autopilot), бой идёт до конца, потом следующий.
## Запуск (быстрее всего с --fixed-fps 60, тогда время боя идёт без привязки к часам):
##   godot --headless --fixed-fps 60 --path skybreak res://tests/harness_match_batch.tscn --
##     --maps=canyon,fjord,reef --sizes=4,8 --modes=arcade --seeds=1,2 --lineup=strizh,shmel
##     [--time=day --weather=clear --max=960 --verbose=1]
## На каждый бой печатается строка «[match] …», в конце — «[summary] …».
## Колонки: карта, размер, режим, seed, длительность, исход (blue/red/draw), очки команд,
## захваты синих/красных, сбитые в воздухе синими/красными, наземные цели, уничтоженные синими/красными,
## гибели синих/красных, из них разбились сами, посадки ботов (настоящие/зачтённые над полосой/неудачные),
## доля очков, потерянных проигравшим из-за зон.

const CRASH_REASONS := ["ground", "water", "gear", "border"]

var _maps: Array = ["canyon"]
var _sizes: Array = [4]
var _modes: Array = ["arcade"]
var _seeds: Array = [1]
var _lineup: Array = ["strizh", "shmel"]
var _time := "day"
var _weather := "clear"
var _max_secs := 960.0
var _verbose := false

var _queue: Array = []
var _mm = null
var _cfg: Dictionary = {}
var _st: Dictionary = {}
var _rows: Array = []
var _watched: Dictionary = {}
var _poll_t := 0.0
var _units0: Array = [0, 0]
var _wall0 := 0

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"maps":
				_maps = Array(kv[1].split(","))
			"sizes":
				_sizes = []
				for s in kv[1].split(","):
					_sizes.append(int(s))
			"modes":
				_modes = Array(kv[1].split(","))
			"seeds":
				_seeds = []
				for s in kv[1].split(","):
					_seeds.append(int(s))
			"lineup":
				_lineup = Array(kv[1].split(","))
			"time":
				_time = kv[1]
			"weather":
				_weather = kv[1]
			"max":
				_max_secs = float(kv[1])
			"verbose":
				_verbose = kv[1] == "1"
	for mode in _modes:
		for size in _sizes:
			for map_id in _maps:
				for seed in _seeds:
					_queue.append({"mode": mode, "size": size, "map_id": map_id, "seed": seed})
	print("[batch] боёв: %d" % _queue.size())
	await get_tree().process_frame
	_next_match()

func _next_match() -> void:
	if _queue.is_empty():
		_summary()
		get_tree().quit()
		return
	var q: Dictionary = _queue.pop_front()
	_cfg = {"mode": q.mode, "size": q.size, "map_id": q.map_id, "time_of_day": _time, "weather": _weather,
		"lineup": _lineup.duplicate(), "test_plane": "flanker", "seed": q.seed, "autopilot": true}
	Game.match_config = _cfg
	_st = {"kills": [0, 0], "aa": [0, 0], "deaths": [0, 0], "crash": [0, 0], "other": [0, 0], "caps": [0, 0],
		"land_ok": [0, 0], "land_fake": [0, 0], "land_fail": [0, 0], "returns": [0, 0], "ret_shot": [0, 0], "zone_loss": [0.0, 0.0],
		"reasons": {}, "owners": {}, "returning": {}}
	_watched.clear()
	_wall0 = Time.get_ticks_msec()
	_mm = load("res://scenes/battle.tscn").instantiate()
	_mm.leave_scene = false
	_mm.crash_view_seconds = 0.0
	if _verbose:
		_mm.kill_event.connect(func(t: String, _a: int, _b: int): print("  [kill] t=%.0f %s" % [_mm.elapsed, t]))
		_mm.message.connect(func(t: String, _s: float): print("  [message] t=%.0f %s" % [_mm.elapsed, t]))
	get_tree().root.add_child(_mm)
	_units0 = _alive_units()

func _alive_units() -> Array:
	var n := [0, 0]
	if _mm == null or _mm.world == null:
		return n
	for u in _mm.world.ground_units:
		if is_instance_valid(u) and bool(u.alive) and String(u.kind) != "carrier":
			n[clampi(int(u.team), 0, 1)] += 1
	return n

func _physics_process(dt: float) -> void:
	if _mm == null or not is_instance_valid(_mm) or not _mm.is_inside_tree():
		return
	for ac in _mm.aircraft:
		if is_instance_valid(ac) and not _watched.has(ac.get_instance_id()):
			_watched[ac.get_instance_id()] = true
			ac.destroyed.connect(_on_destroyed)
			ac.serviced.connect(_on_serviced)
	if _mm.state != "ended":
		_track_zones(dt)
		_poll_t -= dt
		if _poll_t <= 0.0:
			_poll_t = 0.5
			_poll_bots()
	if _mm.state == "ended" or float(_mm.elapsed) > _max_secs:
		_finish_match()

func _track_zones(dt: float) -> void:
	var owned := [0, 0]
	for zs in _mm.zones_state:
		var zid := String(zs.id)
		var o := int(zs.owner)
		if o >= 0:
			owned[o] += 1
		var prev := int(_st.owners.get(zid, -1))
		if o >= 0 and o != prev:
			_st.caps[o] += 1
		_st.owners[zid] = o
	var diff: int = owned[0] - owned[1]
	if diff == 0:
		return
	var rate := 0.0
	var eco: Dictionary = Data.ECONOMY
	if eco.has("zone_drain_seconds"):
		rate = float(_mm.max_tickets) / maxf(float(eco.zone_drain_seconds), 1.0)
	else:
		rate = float(eco.get("zone_drain_per_sec", 0.0))
	var loser := 1 if diff > 0 else 0
	_st.zone_loss[loser] += rate * absi(diff) * dt

func _poll_bots() -> void:
	for ac in _mm.aircraft:
		if not is_instance_valid(ac) or not bool(ac.alive):
			continue
		var p = ac.get("pilot")
		if p == null or not is_instance_valid(p) or not ("state" in p):
			continue
		var key: int = ac.get_instance_id()
		var returning: bool = "return_reason" in p and String(p.get("return_reason")) != ""
		if returning and not _st.returning.has(key):
			_st.returning[key] = true
			_st.returns[clampi(int(ac.team), 0, 1)] += 1
			if _verbose:
				print("  [return] t=%.0f %s (%s)" % [_mm.elapsed, String(ac.callsign), String(p.get("return_reason")) if "return_reason" in p else "?"])
		elif not returning and _st.returning.has(key):
			_st.returning.erase(key)

func _on_destroyed(ac, killer_uid: int, reason: String) -> void:
	if _mm == null or _mm.state == "ended":
		return
	var vt := clampi(int(ac.team), 0, 1)
	_st.deaths[vt] += 1
	var info: Dictionary = _mm._ac_info
	if killer_uid >= 0 and info.has(killer_uid) and int(info[killer_uid].team) != vt:
		_st.kills[clampi(int(info[killer_uid].team), 0, 1)] += 1
	elif killer_uid >= 0 and not info.has(killer_uid):
		_st.aa[1 - vt] += 1
	elif reason in CRASH_REASONS:
		_st.crash[vt] += 1
		_st.reasons[reason] = int(_st.reasons.get(reason, 0)) + 1
		var pc = ac.get("pilot")
		var pst := String(pc.get("state")) if pc != null and is_instance_valid(pc) and "state" in pc else "?"
		var lph := String(pc.get("land_phase")) if pc != null and is_instance_valid(pc) and "land_phase" in pc else ""
		print("  [crash] t=%.0f %s %s %s state=%s фаза=%s pos=(%.0f,%.0f,%.0f)" % [_mm.elapsed, String(_cfg.map_id),
			String(ac.callsign), reason, pst, lph, ac.fm.pos.x, ac.fm.pos.y, ac.fm.pos.z])
	else:
		_st.other[vt] += 1
	var p = ac.get("pilot")
	if p != null and is_instance_valid(p) and "state" in p and String(p.get("state")) == "return":
		var phase := String(p.get("land_phase")) if "land_phase" in p else ""
		if phase != "" and reason in CRASH_REASONS and killer_uid < 0:
			# неудачная посадка или взлёт: разбился сам
			_st.land_fail[vt] += 1
			print("  [land_fail] t=%.0f %s %s фаза=%s причина=%s" % [_mm.elapsed, String(_cfg.map_id), String(ac.callsign), phase, reason])
		else:
			_st.ret_shot[vt] += 1

func _on_serviced(ac) -> void:
	if _mm == null or _mm.state == "ended" or bool(ac.is_player):
		return
	_st.land_ok[clampi(int(ac.team), 0, 1)] += 1
	if _verbose:
		print("  [landed] t=%.0f %s" % [_mm.elapsed, String(ac.callsign)])

func _finish_match() -> void:
	var mm = _mm
	_mm = null
	var units := _alive_units_of(mm)
	var log = mm.get("bot_log")
	if log is Dictionary and log.has("fake_landings"):
		_st.land_fake = log.fake_landings.duplicate()
	var winner := int(mm.winner)
	var outcome := "blue" if winner == 0 else ("red" if winner == 1 else ("draw" if winner == -1 else "timeout"))
	var lost := [float(mm.max_tickets) - float(mm.tickets[0]), float(mm.max_tickets) - float(mm.tickets[1])]
	var loser := 1 if winner == 0 else (0 if winner == 1 else -1)
	var tl = mm.get("ticket_log")
	if tl is Dictionary and tl.has("zones"):
		_st.zone_loss = [float(tl.zones[0]), float(tl.zones[1])]
	var zone_share := 0.0
	var zflip := false
	if loser >= 0 and lost[loser] > 1.0:
		zone_share = clampf(float(_st.zone_loss[loser]) / lost[loser], 0.0, 1.0)
		# зоны перевернули исход: без них победитель потерял бы больше очков, чем проигравший
		var other := [lost[0] - float(_st.zone_loss[0]), lost[1] - float(_st.zone_loss[1])]
		zflip = other[1 - loser] > other[loser] + 0.5
	var row := {"map": _cfg.map_id, "size": _cfg.size, "mode": _cfg.mode, "seed": _cfg.seed, "dur": float(mm.elapsed),
		"outcome": outcome, "tickets": [int(round(float(mm.tickets[0]))), int(round(float(mm.tickets[1])))],
		"caps": _st.caps.duplicate(), "kills": _st.kills.duplicate(), "aa": _st.aa.duplicate(),
		"ground": [_units0[1] - units[1], _units0[0] - units[0]], "deaths": _st.deaths.duplicate(),
		"crash": _st.crash.duplicate(), "other": _st.other.duplicate(), "land_ok": _st.land_ok.duplicate(),
		"land_fake": _st.land_fake.duplicate(), "land_fail": _st.land_fail.duplicate(),
		"returns": _st.returns.duplicate(), "ret_shot": _st.ret_shot.duplicate(), "zone_share": zone_share, "zflip": zflip, "reasons": _st.reasons.duplicate(),
		"wall": (Time.get_ticks_msec() - _wall0) / 1000.0}
	_rows.append(row)
	print(_fmt_row(row))
	mm.queue_free()
	await get_tree().process_frame
	await get_tree().process_frame
	_next_match()

func _alive_units_of(mm) -> Array:
	var n := [0, 0]
	for u in mm.world.ground_units:
		if is_instance_valid(u) and bool(u.alive) and String(u.kind) != "carrier":
			n[clampi(int(u.team), 0, 1)] += 1
	return n

static func _pair(a: Array) -> String:
	return "%d/%d" % [int(a[0]), int(a[1])]

func _fmt_row(r: Dictionary) -> String:
	return ("[match] %-6s %dx%d %-9s seed=%-3d dur=%5.0fs %-5s tickets=%4d/%-4d caps=%-5s air=%-5s aa=%-5s ground=%-5s"
		+ " deaths=%-5s crash=%-5s other=%-5s land=%s fake=%s fail=%s ret=%s shot_ret=%s zone%%=%3.0f zflip=%d wall=%.0fs %s") % [
		r.map, r.size, r.size, r.mode, r.seed, r.dur, r.outcome, r.tickets[0], r.tickets[1], _pair(r.caps),
		_pair(r.kills), _pair(r.aa), _pair(r.ground), _pair(r.deaths), _pair(r.crash), _pair(r.other),
		_pair(r.land_ok), _pair(r.land_fake), _pair(r.land_fail), _pair(r.returns), _pair(r.ret_shot), r.zone_share * 100.0, int(r.zflip), r.wall,
		str(r.reasons)]

func _summary() -> void:
	if _rows.is_empty():
		return
	var wins := {"blue": 0, "red": 0, "draw": 0, "timeout": 0}
	var deaths := 0
	var crashes := 0
	var zone_decided := 0
	var caps := [0, 0]
	var land := [0, 0, 0]
	var dur := 0.0
	for r in _rows:
		wins[r.outcome] = int(wins.get(r.outcome, 0)) + 1
		deaths += int(r.deaths[0]) + int(r.deaths[1])
		crashes += int(r.crash[0]) + int(r.crash[1])
		caps[0] += int(r.caps[0])
		caps[1] += int(r.caps[1])
		land[0] += int(r.land_ok[0]) + int(r.land_ok[1])
		land[1] += int(r.land_fake[0]) + int(r.land_fake[1])
		land[2] += int(r.land_fail[0]) + int(r.land_fail[1])
		dur += float(r.dur)
		if bool(r.zflip):
			zone_decided += 1
	print("[summary] боёв=%d синие=%d красные=%d ничьи=%d средняя длительность=%.0f с захваты=%s разбились=%d из %d гибелей (%.0f%%) зоны решили=%d посадки=%d зачтено над полосой=%d неудачных=%d" % [
		_rows.size(), wins.blue, wins.red, wins.draw + wins.timeout, dur / _rows.size(), _pair(caps), crashes, deaths,
		100.0 * crashes / maxf(deaths, 1.0), zone_decided, land[0], land[1], land[2]])
