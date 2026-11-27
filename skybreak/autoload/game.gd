extends Node
## Переключение сцен, конфиг боя, результат и повтор. Ввод настраивается здесь.

const SCENE_HANGAR := "res://scenes/hangar.tscn"
const SCENE_BATTLE := "res://scenes/battle.tscn"
const SCENE_RESULTS := "res://scenes/results.tscn"
const SCENE_REPLAY := "res://scenes/replay.tscn"

var match_config: Dictionary = {}
var last_result: Dictionary = {}
var result_applied: bool = false
var last_replay: Dictionary = {}
var battle = null   # MatchManager во время боя

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	setup_input()

func default_config() -> Dictionary:
	return {"mode": "arcade", "size": 4, "map_id": "random", "time_of_day": "random", "weather": "random",
		"lineup": [], "test_plane": "", "seed": 0, "autopilot": false}

func start_battle(config: Dictionary) -> void:
	var c := default_config()
	c.merge(config, true)
	if int(c.seed) == 0:
		c.seed = randi() % 1000000 + 1
	match_config = c
	_change(SCENE_BATTLE)

func go_hangar() -> void:
	_change(SCENE_HANGAR)

func go_results() -> void:
	result_applied = false
	_change(SCENE_RESULTS)

func go_replay() -> void:
	_change(SCENE_REPLAY)

func _change(path: String) -> void:
	get_tree().paused = false
	Engine.time_scale = 1.0
	get_tree().call_deferred("change_scene_to_file", path)

func is_touch() -> bool:
	var pref = "auto"
	if has_node("/root/Profile") and get_node("/root/Profile").has_method("get_setting"):
		pref = get_node("/root/Profile").get_setting("touch")
	if pref == "on":
		return true
	if pref == "off":
		return false
	return DisplayServer.is_touchscreen_available()

# ---------------------------------------------------------------- форматирование
func fmt_int(n: int) -> String:
	var neg := n < 0
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = " " + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	out = s + out
	return ("-" if neg else "") + out

func fmt_speed(ms: float) -> String:
	return fmt_int(int(round(ms * 3.6))) + " км/ч"

func fmt_alt(m: float) -> String:
	return fmt_int(int(round(m))) + " м"

func fmt_time(sec: float) -> String:
	var s := int(max(0.0, sec))
	return "%d:%02d" % [s / 60, s % 60]

# ---------------------------------------------------------------- ввод
func _key(code: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.physical_keycode = code
	return e

func _mouse(b: MouseButton) -> InputEventMouseButton:
	var e := InputEventMouseButton.new()
	e.button_index = b
	return e

func _joy(b: JoyButton) -> InputEventJoypadButton:
	var e := InputEventJoypadButton.new()
	e.button_index = b
	return e

func _axis(a: JoyAxis, v: float) -> InputEventJoypadMotion:
	var e := InputEventJoypadMotion.new()
	e.axis = a
	e.axis_value = v
	return e

func setup_input() -> void:
	var map := {
		"pitch_up": [_key(KEY_UP), _axis(JOY_AXIS_LEFT_Y, 1.0)],
		"pitch_down": [_key(KEY_DOWN), _axis(JOY_AXIS_LEFT_Y, -1.0)],
		"roll_left": [_key(KEY_LEFT), _key(KEY_Q), _axis(JOY_AXIS_LEFT_X, -1.0)],
		"roll_right": [_key(KEY_RIGHT), _key(KEY_E), _axis(JOY_AXIS_LEFT_X, 1.0)],
		"yaw_left": [_key(KEY_A), _joy(JOY_BUTTON_LEFT_SHOULDER)],
		"yaw_right": [_key(KEY_D)],
		"throttle_up": [_key(KEY_W), _joy(JOY_BUTTON_DPAD_UP)],
		"throttle_down": [_key(KEY_S), _joy(JOY_BUTTON_DPAD_DOWN)],
		"afterburner": [_key(KEY_SHIFT), _joy(JOY_BUTTON_RIGHT_SHOULDER)],
		"fire_guns": [_key(KEY_SPACE), _mouse(MOUSE_BUTTON_LEFT), _axis(JOY_AXIS_TRIGGER_RIGHT, 1.0)],
		"fire_rocket": [_key(KEY_R), _mouse(MOUSE_BUTTON_MIDDLE), _joy(JOY_BUTTON_A)],
		"drop_bomb": [_key(KEY_B), _joy(JOY_BUTTON_B)],
		"fire_missile": [_key(KEY_F), _mouse(MOUSE_BUTTON_RIGHT), _axis(JOY_AXIS_TRIGGER_LEFT, 1.0)],
		"flares": [_key(KEY_X), _joy(JOY_BUTTON_X)],
		"gear": [_key(KEY_G)],
		"brake": [_key(KEY_H)],
		"extinguish": [_key(KEY_T)],
		"camera_toggle": [_key(KEY_V), _joy(JOY_BUTTON_Y)],
		"free_look": [_key(KEY_C)],
		"zoom": [_key(KEY_Z)],
		"pause": [_key(KEY_ESCAPE), _key(KEY_P), _joy(JOY_BUTTON_START)],
		"scoreboard": [_key(KEY_TAB), _joy(JOY_BUTTON_BACK)],
		"look_left": [_axis(JOY_AXIS_RIGHT_X, -1.0)],
		"look_right": [_axis(JOY_AXIS_RIGHT_X, 1.0)],
		"look_up": [_axis(JOY_AXIS_RIGHT_Y, -1.0)],
		"look_down": [_axis(JOY_AXIS_RIGHT_Y, 1.0)],
	}
	for action in map:
		if InputMap.has_action(action):
			InputMap.erase_action(action)
		InputMap.add_action(action, 0.25)
		for ev in map[action]:
			InputMap.action_add_event(action, ev)

## Подсказки по клавишам для экрана помощи и обучения.
const KEY_HELP := [
	["Наведение", "Мышь"],
	["Тангаж и крен", "Стрелки, Q / E"],
	["Рыскание", "A / D"],
	["Газ", "W / S"],
	["Форсаж", "Shift"],
	["Пушки", "ЛКМ или Пробел"],
	["Ракеты по земле", "R"],
	["Бомбы", "B"],
	["Ракеты по воздуху", "ПКМ или F"],
	["Ловушки", "X"],
	["Шасси", "G"],
	["Тормоз", "H"],
	["Тушить пожар", "T"],
	["Вид из кабины", "V"],
	["Обзор", "C"],
	["Приближение", "Z"],
	["Таблица", "Tab"],
	["Пауза", "Esc"],
]
