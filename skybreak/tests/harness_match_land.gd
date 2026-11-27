extends Node
## Посадки и взлёты ботов без экрана: доля удачных посадок и взлётов.
## Бой в режиме "test" (мишени и игрок убираются, зенитки стоят), на каждый случай — свой бот.
##   --what=land     бот в воздухе с пустыми пушками: должен сесть, дождаться ремонта и снова взлететь;
##   --what=takeoff  бот на полосе (или палубе): разбег, отрыв, набор, шасси убраны.
## Запуск: godot --headless --fixed-fps 60 --path skybreak res://tests/harness_match_land.tscn --
##   --what=land --map=canyon --planes=strizh,shmel,sokol,flanker --teams=0,1 --reps=1
##   [--seed=5 --stagger=40 --dist=4500 --assist=1 --timeout=480 --verbose=1]
## Печатает «[case] …» на каждый случай и «[land_summary] …» в конце.

var _what := "land"
var _map := "canyon"
var _planes: Array = ["strizh", "shmel", "sokol", "flanker"]
var _teams: Array = [0, 1]
var _reps := 1
var _seed := 5
var _stagger := 40.0
var _dist := 4500.0
var _assist := true
var _timeout := 480.0
var _verbose := false

var _mm = null
var _cases: Array = []
var _next_spawn := 0
var _t := 0.0
var _done := false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"what": _what = kv[1]
			"map": _map = kv[1]
			"planes": _planes = Array(kv[1].split(","))
			"teams":
				_teams = []
				for s in kv[1].split(","):
					_teams.append(int(s))
			"reps": _reps = int(kv[1])
			"seed": _seed = int(kv[1])
			"stagger": _stagger = float(kv[1])
			"dist": _dist = float(kv[1])
			"assist": _assist = kv[1] == "1"
			"timeout": _timeout = float(kv[1])
			"verbose": _verbose = kv[1] == "1"
	var i := 0
	for r in _reps:
		for team in _teams:
			for p in _planes:
				_cases.append({"plane": String(p), "team": int(team), "rep": r, "idx": i, "ac": null, "result": "",
					"t0": 0.0, "landed_t": -1.0, "phase": "", "log": []})
				i += 1
	Game.match_config = {"mode": "test", "size": 4, "map_id": _map, "time_of_day": "day", "weather": "clear",
		"lineup": ["strizh"], "test_plane": "strizh", "seed": _seed, "autopilot": false}
	await get_tree().process_frame
	_mm = load("res://scenes/battle.tscn").instantiate()
	_mm.leave_scene = false
	get_tree().root.add_child(_mm)
	await get_tree().physics_frame
	await get_tree().physics_frame
	# убрать игрока и мишени
	if _mm.training != null:
		for d in _mm.training.drones.duplicate():
			if is_instance_valid(d):
				_mm._remove_aircraft_quietly(d)
		_mm.training.drones.clear()
	if _mm.player != null:
		_mm._remove_aircraft_quietly(_mm.player)
		_mm.player = null
	print("[land] %s %s: случаев %d" % [_what, _map, _cases.size()])
	if _what == "profile":
		_profile()
		get_tree().quit()

## Профиль рельефа вдоль оси каждой полосы (для подбора глиссады и набора после взлёта).
func _profile() -> void:
	var w = _mm.world
	for af in w.airfields:
		var c: Vector3 = af.pos
		var hd := float(af.heading)
		var ax := Vector3(sin(hd), 0.0, -cos(hd))
		var right := ax.cross(Vector3.UP)
		print("[profile] team=%d kind=%s center=%s heading=%.0f° rwy_h=%.0f" % [int(af.team), String(af.kind), str(c), rad_to_deg(hd), c.y])
		for side in [-1.0, 1.0]:
			var line := "  ось %+d:" % int(side)
			for d in range(0, 6001, 400):
				var p: Vector3 = c + ax * side * float(d)
				var hs: Array = []
				for l in [-600.0, 0.0, 600.0]:
					var q: Vector3 = p + right * l
					hs.append(int(w.height_at(q.x, q.z)))
				line += " %d:%s" % [d, str(hs)]
			print(line)
		print("  сетка 400 м (строки по z, столбцы по x):")
		for gz in range(-6, 7):
			var row := "  z=%5d:" % int(c.z + gz * 400.0)
			for gx in range(-6, 7):
				row += " %5d" % int(w.height_at(c.x + gx * 400.0, c.z + gz * 400.0))
			print(row)

func _physics_process(dt: float) -> void:
	if _mm == null or _done or not _mm.is_inside_tree():
		return
	_t += dt
	while _next_spawn < _cases.size() and (_what == "takeoff" or _t >= _stagger * _next_spawn):
		_spawn_case(_cases[_next_spawn])
		_next_spawn += 1
	var open := 0
	for c in _cases:
		if c.result == "":
			_watch(c)
			if c.result == "":
				open += 1
	if open == 0 and _next_spawn >= _cases.size():
		_done = true
		_summary()
		get_tree().quit()

func _spawn_case(c: Dictionary) -> void:
	var w = _mm.world
	var team := int(c.team)
	var sp: Dictionary
	if _what == "takeoff":
		sp = w.runway_spawn(team, int(c.idx) % 6)
	else:
		var af: Dictionary = w.airfield_of(team)
		var home: Vector3 = af.pos
		var to_c := Vector3(-home.x, 0.0, -home.z).normalized()
		var side := Vector3(to_c.z, 0.0, -to_c.x) * (1.0 if int(c.idx) % 2 == 0 else -1.0)
		var p: Vector3 = home + to_c * _dist + side * (800.0 + 300.0 * float(int(c.idx) % 3))
		p.x = clampf(p.x, -4000.0, 4000.0)
		p.z = clampf(p.z, -4000.0, 4000.0)
		p.y = maxf(900.0 + 60.0 * float(int(c.idx) % 4), w.height_at(p.x, p.z) + 500.0)
		# летит поперёк: заход надо построить самому
		var hd := atan2(side.x, -side.z)
		sp = {"pos": p, "basis": Basis(Vector3.UP, -hd), "speed": 110.0, "on_ground": false}
	var name := "%s-%d" % [String(c.plane), int(c.idx)]
	var ac = _mm.spawn_bot(String(c.plane), team, name, 0.6, sp)
	var rec: Dictionary = _mm.record_of(int(ac.uid))
	rec.external = false   # чтобы бой засчитывал проход над полосой
	rec.lives = 1
	c.rec = rec
	if not _assist:
		ac.fm.assist = false
	if _what == "land":
		var a: Dictionary = ac.weapons.ammo
		var guns: Array = a.get("guns", [])
		for i in guns.size():
			guns[i] = 0
		for k in ["rockets", "bombs", "missiles"]:
			a[k] = 0
	c.ac = ac
	c.t0 = _t
	c.uid = int(ac.uid)
	c.fake0 = int(_mm.bot_log.fake_landings[team])
	ac.destroyed.connect(func(_a, k: int, reason: String): _on_dead(c, reason, k))
	ac.serviced.connect(func(_a): _on_serviced(c))
	if _verbose:
		print("  [spawn] t=%.0f %s team=%d pos=%s" % [_t, name, team, str(sp.pos)])

func _on_dead(c: Dictionary, reason: String, killer: int = -1) -> void:
	if c.result != "":
		return
	if is_instance_valid(c.ac) and c.ac.dmg != null:
		var by = _mm.get_entity(int(c.ac.dmg.last_attacker))
		c.log.append("последнее попадание: uid=%d (%s) t=%.0f, засчитано: %d" % [int(c.ac.dmg.last_attacker),
			String(by.get("callsign")) if by != null and "callsign" in by else (String(by.get("kind")) if by != null else "-"),
			float(c.ac.dmg.last_hit_time), killer])
	var p = c.ac.pilot if is_instance_valid(c.ac) else null
	var phase: String = String(p.land_phase) if p != null and is_instance_valid(p) else "?"
	c.result = "crash:%s/%s" % [reason, phase]
	if c.has("last"):
		c.log.append("перед касанием: " + String(c.last))
	if is_instance_valid(c.ac):
		var f = c.ac.fm
		c.log.append("гибель t=%.0f spd=%.0f vy=%.1f pos=(%.0f,%.0f,%.0f) земля=%.0f крен=%.0f тангаж=%.0f шасси=%s" % [_t - float(c.t0),
			(f.vel as Vector3).length(), (f.vel as Vector3).y, f.pos.x, f.pos.y, f.pos.z, _mm.world.height_at(f.pos.x, f.pos.z),
			rad_to_deg(f.bank()), rad_to_deg(f.pitch_angle()), str(f.gear_down)])
	_print_case(c)

func _on_serviced(c: Dictionary) -> void:
	if c.landed_t < 0.0:
		c.landed_t = _t - float(c.t0)
		if _verbose:
			print("  [serviced] t=%.0f %s" % [_t, String(c.ac.callsign)])

func _watch(c: Dictionary) -> void:
	if not c.has("uid"):
		return   # ещё не выпущен
	var ac = c.ac
	if not is_instance_valid(ac) or not ac.is_inside_tree() or ac.is_queued_for_deletion():
		if c.result == "":
			var team := int(c.team)
			if int(_mm.bot_log.fake_landings[team]) > int(c.fake0):
				c.result = "fake"
				c.rec.respawn_t = -1.0   # новый самолёт с полным боезапасом мешал бы остальным случаям
			else:
				c.result = "removed"
			_print_case(c)
		return
	if not bool(ac.alive):
		return
	var p = ac.pilot
	var phase := String(p.land_phase)
	var fm = ac.fm
	if _verbose and phase in ["approach", "final", "takeoff", "climb", "rollout"]:
		c["tick"] = float(c.get("tick", 0.0)) + get_physics_process_delta_time()
		if float(c.tick) >= 1.0:
			c.tick = 0.0
			print("    [%s] %s t=%.0f agl=%.0f spd=%.0f vy=%.1f крен=%.0f тангаж=%.0f aoa=%.1f газ=%.2f pos=(%.0f,%.0f,%.0f) ctrl=%s" % [phase,
				String(ac.callsign), _t - float(c.t0), ac.altitude_agl(), (fm.vel as Vector3).length(), (fm.vel as Vector3).y,
				rad_to_deg(fm.bank()), rad_to_deg(fm.pitch_angle()), rad_to_deg(fm.aoa), fm.throttle, fm.pos.x, fm.pos.y, fm.pos.z,
				str([snappedf(ac.controls.pitch, 0.01), snappedf(ac.controls.roll, 0.01), snappedf(ac.controls.yaw, 0.01)])])
	if phase == "final" and ac.altitude_agl() < 40.0:
		c["last"] = "agl=%.1f spd=%.0f vy=%.1f крен=%.1f тангаж=%.1f aoa=%.1f газ=%.2f шасси=%s ctrl=%s" % [ac.altitude_agl(),
			(fm.vel as Vector3).length(), (fm.vel as Vector3).y, rad_to_deg(fm.bank()), rad_to_deg(fm.pitch_angle()),
			rad_to_deg(fm.aoa), fm.throttle, str(fm.gear_down), str([snappedf(ac.controls.pitch, 0.01), snappedf(ac.controls.roll, 0.01)])]
	if phase != c.phase:
		var f = ac.fm
		var line := "t=%.0f %s->%s spd=%.0f agl=%.0f pos=(%.0f,%.0f,%.0f) gear=%s" % [_t - float(c.t0), c.phase, phase,
			(f.vel as Vector3).length(), ac.altitude_agl(), f.pos.x, f.pos.y, f.pos.z, str(f.gear_down)]
		c.log.append(line)
		if _verbose:
			print("  [phase] %s %s" % [String(ac.callsign), line])
		if phase == "goaround":
			c["goarounds"] = int(c.get("goarounds", 0)) + 1
			c.log.append("    уход на второй круг: " + String(p.go_around_reason))
		c.phase = phase
	var el := _t - float(c.t0)
	if _what == "takeoff":
		if phase == "" and ac.altitude_agl() > 150.0:
			c.result = "ok"
			c["gear_up"] = not bool(ac.fm.gear_down)
			_print_case(c)
		elif el > 300.0:
			c.result = "timeout"
			_print_case(c)
		return
	if c.landed_t >= 0.0 and phase == "" and ac.altitude_agl() > 150.0:
		c.result = "ok"
		_print_case(c)
	elif el > _timeout:
		c.result = "timeout"
		_print_case(c)

func _print_case(c: Dictionary) -> void:
	# готовый бот снова с боезапасом: убрать, чтобы не стрелял по тем, кто ещё садится
	if c.result == "ok" and is_instance_valid(c.ac) and bool(c.ac.alive):
		_mm._remove_aircraft_quietly(c.ac)
	print("[case] %s %s team=%d %-8s result=%-24s landed=%s t=%.0f goarounds=%d" % [_what, _map, int(c.team),
		String(c.plane), String(c.result), ("%.0f" % float(c.landed_t)) if float(c.landed_t) >= 0.0 else "-",
		_t - float(c.t0), int(c.get("goarounds", 0))])
	if _verbose or String(c.result).begins_with("crash") or c.result == "timeout":
		for l in c.log:
			print("      ", l)

func _summary() -> void:
	var n := {"ok": 0, "fake": 0, "fail": 0}
	for c in _cases:
		if c.result == "ok":
			n.ok += 1
		elif c.result == "fake":
			n.fake += 1
		else:
			n.fail += 1
	print("[land_summary] %s %s: всего=%d удачно=%d над полосой=%d неудачно=%d" % [_what, _map, _cases.size(), n.ok, n.fake, n.fail])
