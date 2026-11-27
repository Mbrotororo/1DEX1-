extends Node
## Сквозной прогон игры по настоящим сценам: ангар → бой → итоги → повтор.
## Снимки экрана кладутся в --out. Профиль временный, настоящий не трогается.
## Запуск: xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3
##   --resolution 1280x720 res://tests/playtest.tscn -- --out=DIR --mode=arcade --map=canyon --secs=60

var out := "/tmp/skybreak-shots/playtest"
var cfg := {"mode": "arcade", "size": 4, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
	"lineup": ["strizh", "shmel"], "seed": 777, "autopilot": true, "test_plane": "flanker"}
var secs := 60.0
var speed := 1.0
var skip_hangar := false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.trim_prefix("--").split("=", true, 1)
		if kv.size() != 2:
			continue
		match kv[0]:
			"out": out = kv[1]
			"mode": cfg.mode = kv[1]
			"map": cfg.map_id = kv[1]
			"time": cfg.time_of_day = kv[1]
			"weather": cfg.weather = kv[1]
			"size": cfg.size = int(kv[1])
			"plane": cfg.test_plane = kv[1]
			"lineup": cfg.lineup = Array(kv[1].split(","))
			"secs": secs = float(kv[1])
			"speed": speed = float(kv[1])
			"skip_hangar": skip_hangar = kv[1] == "1"
	DirAccess.make_dir_recursive_absolute(out)
	Profile.save_path = "user://playtest_profile.json"
	if Profile.has_method("reset_progress"):
		Profile.reset_progress()
	# водитель живёт в корне, чтобы пережить смену сцен
	var drv := Node.new()
	drv.name = "PlaytestDriver"
	drv.process_mode = Node.PROCESS_MODE_ALWAYS
	drv.set_script(load("res://tests/playtest_driver.gd"))
	drv.set("owner_cfg", {"out": out, "cfg": cfg, "secs": secs, "speed": speed, "skip_hangar": skip_hangar})
	get_tree().root.add_child.call_deferred(drv)
