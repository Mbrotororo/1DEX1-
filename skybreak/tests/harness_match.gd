extends Node
## Скриншоты боя для проверки глазами.
## Аргументы: --mode=arcade|realistic|training|test --map=canyon --time=day --weather=clear
##            --size=4 --autopilot=1 --shots=2,5 --out=/tmp/skybreak-shots/match --tag=arcade --speed=1
## Без экрана (--headless) снимки не сохраняются, печатается только состояние боя.

var _out := "/tmp/skybreak-shots/match"
var _tag := ""
var _shots: Array = [2.0, 5.0]
var _mm = null
var _t := 0.0
var _next := 0
var _step := 0        # обучение: перейти к шагу N после появления игрока

func _ready() -> void:
	var cfg := {"mode": "arcade", "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
		"lineup": ["strizh", "shmel"], "test_plane": "flanker", "seed": 4242, "autopilot": true}
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"mode":
				cfg.mode = kv[1]
			"map":
				cfg.map_id = kv[1]
			"time":
				cfg.time_of_day = kv[1]
			"weather":
				cfg.weather = kv[1]
			"size":
				cfg.size = int(kv[1])
			"autopilot":
				cfg.autopilot = kv[1] == "1"
			"plane":
				cfg.test_plane = kv[1]
			"step":
				_step = int(kv[1])
			"out":
				_out = kv[1]
			"tag":
				_tag = kv[1]
			"speed":
				Engine.time_scale = float(kv[1])
				Engine.max_physics_steps_per_frame = 64
			"shots":
				_shots = []
				for s in kv[1].split(","):
					_shots.append(float(s))
	if _tag == "":
		_tag = String(cfg.mode)
	DirAccess.make_dir_recursive_absolute(_out)
	await get_tree().process_frame
	Game.match_config = cfg
	_mm = load("res://scenes/battle.tscn").instantiate()
	_mm.leave_scene = false
	_mm.message.connect(func(t: String, _s: float): print("[message] ", t))
	_mm.kill_event.connect(func(t: String, _a: int, _b: int): print("[kill] t=%.0f " % _mm.elapsed, t))
	_mm.state_changed.connect(func(s: String): print("[state] ", s))
	get_tree().root.add_child(_mm)

func _process(delta: float) -> void:
	if _mm == null:
		return
	_t = float(_mm.elapsed) if _mm.state != "ended" else _t + delta
	if _step > 0 and _mm.training != null and _mm.player != null:
		print("[harness] шаг обучения ", _step)
		_mm.training._enter(_step)
		_step = 0
	if _next < _shots.size() and _t >= float(_shots[_next]):
		var path := "%s/%s_%d.png" % [_out, _tag, _next]
		if DisplayServer.get_name() != "headless":
			var img := get_viewport().get_texture().get_image()
			img.save_png(path)
		print("[shot] ", path, "  t=%.0f state=%s aircraft=%d tickets=%s player=%s" % [_mm.elapsed, _mm.state,
			_mm.aircraft.size(), str(_mm.tickets), str(_mm.player != null)])
		print("       zones=", _mm.zones_state, " stats=", _mm.player_stats())
		_next += 1
		if _next >= _shots.size():
			for row in _mm.get_scoreboard():
				print("       ", row)
			get_tree().quit()
