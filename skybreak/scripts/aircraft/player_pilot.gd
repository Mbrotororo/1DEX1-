class_name PlayerPilot
extends Node
## Управление игрока. Режимы:
##  mouse    — мышь двигает точку прицела (aim_dir), самолёт сам доворачивает нос;
##  keyboard — стрелки/QE/AD напрямую на рули, камера за самолётом;
##  touch    — стик TouchControls на рули, перетаскивание по экрану двигает прицел.
## Клавиши — действия из Game.setup_input().

const Steer = preload("res://scripts/aircraft/aircraft_steer.gd")

const MOUSE_RAD_PER_PX := 0.0026     # при чувствительности 1.0
const TOUCH_RAD_PER_PX := 0.0045
const PAD_AIM_SPEED := 1.6           # рад/с правым стиком
const AIM_PITCH_LIMIT := 1.4835         # 85°
const THROTTLE_RATE := 0.6           # в секунду
const AB_HOLD := 0.4                 # с удержания W на 100 % до форсажа
const LOOK_RETURN := 6.0             # 1/с: обзор возвращается к центру после отпускания C
const KEY_DEADZONE := 0.15

var aim_dir: Vector3 = Vector3.FORWARD   # мировое направление прицела (для мыши/тача)
var mode: String = "mouse"               # "mouse" | "keyboard" | "touch"
var touch_input: Dictionary = {}         # пишет TouchControls: {stick:Vector2, guns, rocket, bomb, missile, flares, afterburner, aim_delta:Vector2, ...}

# дополнительно (камера и HUD читают)
var look_offset: Vector2 = Vector2.ZERO  # свободный обзор: x — рыскание, y — тангаж, рад
var free_look: bool = false              # зажат обзор (C)
var throttle: float = 0.8                # текущее положение газа 0..1
var afterburner: bool = false
var manual_override: bool = false        # сейчас рулят клавиши/стик, а не прицел
var enabled: bool = true                 # false — нулевое управление (например, во время киллкама)
var follow_settings: bool = true         # режим берётся из настроек (тесты могут выключить)
var steer_off: float = 0.0               # угол между носом и прицелом, рад (для HUD)

var _sens: float = 1.0
var _invert: bool = false
var _settings_timer: float = 0.0
var _mouse_delta: Vector2 = Vector2.ZERO
var _aim_yaw: float = 0.0                # курс прицела, рад (0 = -Z, по часовой)
var _aim_pitch: float = 0.0
var _w_full_time: float = 0.0
var _ab_latched: bool = false
var _prev_basis: Basis = Basis.IDENTITY
var _has_prev: bool = false
var _rates: Vector3 = Vector3.ZERO
var _edge_prev: Dictionary = {}
var _want_capture: bool = true
var _was_paused: bool = false


func _ready() -> void:
	# всегда: нужно заметить снятие паузы, чтобы снова захватить мышь
	process_mode = Node.PROCESS_MODE_ALWAYS
	_read_settings()


func _process(_dt: float) -> void:
	var paused := get_tree().paused
	if _was_paused and not paused:
		_want_capture = true
	_was_paused = paused


func _read_settings() -> void:
	if follow_settings:
		var m = Profile.get_setting("control")
		mode = String(m) if m != null and String(m) in ["mouse", "keyboard"] else "mouse"
		if Game.is_touch():
			mode = "touch"
	var s = Profile.get_setting("sensitivity")
	_sens = clampf(float(s), 0.1, 3.0) if s != null else 1.0
	var inv = Profile.get_setting("invert_y")
	_invert = bool(inv) if inv != null else false


func _input(event: InputEvent) -> void:
	if not (event is InputEventMouseMotion) or get_tree().paused:
		return
	var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if (mode == "mouse" and captured) or (mode == "keyboard" and Input.is_action_pressed("free_look")):
		_mouse_delta += (event as InputEventMouseMotion).relative


func _unhandled_input(event: InputEvent) -> void:
	# клик по игре возвращает захват мыши (меню его отпускают)
	if mode == "mouse" and event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not get_tree().paused:
			_want_capture = true


## Прицел — по носу самолёта, газ — как у самолёта сейчас.
func reset_aim(ac) -> void:
	var fwd := Vector3.FORWARD
	if ac != null and is_instance_valid(ac):
		if ac.has_method("forward"):
			fwd = ac.forward()
		var f = ac.get("fm")
		if f != null:
			throttle = clampf(float(f.throttle), 0.0, 1.0)
			_prev_basis = f.basis
			_has_prev = true
			if bool(f.on_ground):
				throttle = 0.0
	_set_aim(fwd)
	look_offset = Vector2.ZERO
	_mouse_delta = Vector2.ZERO
	_ab_latched = false
	_w_full_time = 0.0
	_edge_prev.clear()
	_want_capture = true
	_read_settings()


func _set_aim(dir: Vector3) -> void:
	if dir.length_squared() < 1e-8:
		return
	dir = dir.normalized()
	_aim_pitch = clampf(asin(clampf(dir.y, -1.0, 1.0)), -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT)
	if absf(dir.x) + absf(dir.z) > 1e-5:
		_aim_yaw = atan2(dir.x, -dir.z)
	aim_dir = _dir_from(_aim_yaw, _aim_pitch)


static func _dir_from(yaw: float, pitch: float) -> Vector3:
	return Vector3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch))


## Рысканием и тангажом по экрану: x — вправо, y — вверх (рад).
func _rotate_aim(dx: float, dy: float) -> void:
	_set_aim(aim_dir)   # aim_dir могли задать снаружи — берём углы из него
	_aim_yaw = wrapf(_aim_yaw + dx, -PI, PI)
	_aim_pitch = clampf(_aim_pitch + dy, -AIM_PITCH_LIMIT, AIM_PITCH_LIMIT)
	aim_dir = _dir_from(_aim_yaw, _aim_pitch)


func _rotate_look(dx: float, dy: float) -> void:
	look_offset.x = wrapf(look_offset.x + dx, -PI, PI)
	look_offset.y = clampf(look_offset.y + dy, -1.3, 1.3)


func get_controls(ac, dt: float) -> Dictionary:
	var c := Data.empty_controls()
	if ac == null or not is_instance_valid(ac) or ac.get("fm") == null:
		return c
	var f = ac.fm
	_settings_timer -= dt
	if _settings_timer <= 0.0:
		_settings_timer = 1.0
		_read_settings()
	# угловые скорости самолёта (для демпфирования инструктора)
	if _has_prev:
		_rates = _rates.lerp(Steer.body_rates(_prev_basis, f.basis, dt), 0.5)
	_prev_basis = f.basis
	_has_prev = true
	c.throttle = throttle
	if not enabled or not bool(ac.alive):
		c.throttle = 0.0
		return c
	_update_capture()

	# --- обзор и прицел
	free_look = Input.is_action_pressed("free_look")
	var pad := Vector2(Input.get_axis("look_left", "look_right"), Input.get_axis("look_down", "look_up"))
	var md := _mouse_delta * MOUSE_RAD_PER_PX * _sens
	_mouse_delta = Vector2.ZERO
	var td := Vector2.ZERO
	var tad = touch_input.get("aim_delta", Vector2.ZERO)
	if tad is Vector2:
		td = (tad as Vector2) * TOUCH_RAD_PER_PX * _sens
	touch_input["aim_delta"] = Vector2.ZERO
	var dx := md.x + td.x + pad.x * PAD_AIM_SPEED * dt
	var dy := -(md.y + td.y) + pad.y * PAD_AIM_SPEED * dt
	if _invert:
		dy = -dy
	if free_look or mode == "keyboard":
		if dx != 0.0 or dy != 0.0:
			_rotate_look(dx, dy)
	else:
		if dx != 0.0 or dy != 0.0:
			_rotate_aim(dx, dy)
	if not free_look:
		look_offset = look_offset.lerp(Vector2.ZERO, 1.0 - exp(-LOOK_RETURN * dt))
		if look_offset.length() < 0.002:
			look_offset = Vector2.ZERO

	# --- рули
	var kp := Input.get_axis("pitch_down", "pitch_up")
	var kr := Input.get_axis("roll_left", "roll_right")
	var ky := Input.get_axis("yaw_left", "yaw_right")
	var stick := Vector2.ZERO
	var st = touch_input.get("stick", Vector2.ZERO)
	if st is Vector2:
		stick = st
	if mode == "touch" and stick.length() > KEY_DEADZONE:
		kp = clampf(kp - stick.y, -1.0, 1.0)
		kr = clampf(kr + stick.x, -1.0, 1.0)
	var keys_active := absf(kp) > KEY_DEADZONE or absf(kr) > KEY_DEADZONE or absf(ky) > KEY_DEADZONE
	var speed: float = f.vel.length()
	if mode == "keyboard":
		manual_override = true
		c.pitch = kp
		c.roll = kr
		c.yaw = ky
		_set_aim(ac.forward())
		steer_off = 0.0
	elif keys_active:
		# клавиши перекрывают инструктора; прицел едет за носом и остаётся на нём после отпускания
		manual_override = true
		c.pitch = kp
		c.roll = kr
		c.yaw = ky
		if not free_look:
			_set_aim(ac.forward())
		steer_off = 0.0
	elif bool(f.on_ground):
		# на земле прицел поднимает нос и рулит, без крена
		manual_override = false
		var g := Steer.steer(f.basis, aim_dir, _rates, ac.def, maxf(speed, 30.0), 1.0)
		c.pitch = g.pitch if speed > 5.0 else 0.0
		c.yaw = clampf(g.yaw * 2.0, -1.0, 1.0)
		steer_off = g.off
	else:
		manual_override = false
		var s := Steer.steer(f.basis, aim_dir, _rates, ac.def, speed, 1.0)
		c.pitch = s.pitch
		# инструктор не включает кобру сам: она только с клавиш (ручка до упора при малом газе)
		if bool(ac.def.get("high_aoa", false)):
			c.pitch = minf(c.pitch, 0.92)
		c.roll = s.roll
		c.yaw = s.yaw
		steer_off = s.off

	# --- газ и форсаж
	var up := Input.is_action_pressed("throttle_up") or bool(touch_input.get("throttle_up", false))
	var down := Input.is_action_pressed("throttle_down") or bool(touch_input.get("throttle_down", false))
	if up:
		throttle = minf(1.0, throttle + THROTTLE_RATE * dt)
	if down:
		throttle = maxf(0.0, throttle - THROTTLE_RATE * dt)
		_ab_latched = false
	if touch_input.has("throttle"):
		var tt = touch_input.get("throttle")
		if tt is float or tt is int:
			throttle = clampf(float(tt), 0.0, 1.0)
	if up and throttle >= 0.999:
		_w_full_time += dt
		if _w_full_time >= AB_HOLD:
			_ab_latched = true
	else:
		_w_full_time = 0.0
	if throttle < 0.95:
		_ab_latched = false
	afterburner = _ab_latched or Input.is_action_pressed("afterburner") or bool(touch_input.get("afterburner", false))
	if afterburner:
		throttle = 1.0
	c.throttle = throttle
	c.afterburner = afterburner

	# --- оружие и системы
	c.guns = Input.is_action_pressed("fire_guns") or bool(touch_input.get("guns", false))
	c.rocket = Input.is_action_pressed("fire_rocket") or bool(touch_input.get("rocket", false))
	c.bomb = Input.is_action_pressed("drop_bomb") or bool(touch_input.get("bomb", false))
	c.missile = Input.is_action_pressed("fire_missile") or bool(touch_input.get("missile", false))
	c.flares = Input.is_action_pressed("flares") or bool(touch_input.get("flares", false))
	c.brake = Input.is_action_pressed("brake") or bool(touch_input.get("brake", false))
	c.gear_toggle = _edge("gear", Input.is_action_pressed("gear") or bool(touch_input.get("gear", false)))
	c.extinguish = _edge("extinguish", Input.is_action_pressed("extinguish") or bool(touch_input.get("extinguish", false)))
	return c


## true только в кадр нажатия.
func _edge(key: String, pressed: bool) -> bool:
	var was := bool(_edge_prev.get(key, false))
	_edge_prev[key] = pressed
	return pressed and not was


func _update_capture() -> void:
	if not is_inside_tree() or mode != "mouse" or get_tree().paused:
		return
	if _want_capture:
		_want_capture = false
		if DisplayServer.get_name() != "headless":
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
