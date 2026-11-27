class_name CameraRig
extends Node3D
## Камера боя.
##  CHASE     — сзади-сверху; при мыши/таче смотрит по pilot.aim_dir, при клавиатуре — за самолётом;
##  COCKPIT   — из кабины (маркер Cockpit), голова чуть смещается от перегрузки;
##  FREE_LOOK — облёт вокруг цели мышью/стиком;
##  SPECTATE  — следит за другим самолётом (после гибели);
##  FIXED     — камерой управляет кто-то другой (киллкам, повтор).

enum Mode { CHASE, COCKPIT, FREE_LOOK, SPECTATE, FIXED }

const Steer = preload("res://scripts/aircraft/aircraft_steer.gd")

const ZOOM_FOV := 35.0
const FAR := 14000.0
const NEAR := 0.5
const NEAR_COCKPIT := 0.05
const ORBIT_RAD_PER_PX := 0.004
const SHAKE_DECAY := 4.0
const COCKPIT_FOV_ADD := 10.0

var mode: int = Mode.CHASE
var camera: Camera3D
var target = null                       # Aircraft

# дополнительно
var base_fov: float = 70.0
var zoomed: bool = false
var handle_input: bool = true           # сам ловит «Вид из кабины» (V) и зум (Z)

var _shake: float = 0.0
var _rng := RandomNumberGenerator.new()
var _view_dir: Vector3 = Vector3.FORWARD
var _view_up: Vector3 = Vector3.UP
var _snap: bool = true
var _orbit: Vector2 = Vector2(0.0, -0.25)   # рыскание, тангаж облёта
var _orbit_dist: float = 0.0
var _head: Vector3 = Vector3.ZERO
var _hidden: Array = []                  # узлы модели, скрытые в кабине
var _hidden_for = null
var _settings_timer: float = 0.0
var _last_toggle_frame: int = -1


func _init() -> void:
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.near = NEAR
	camera.far = FAR
	camera.fov = base_fov
	add_child(camera)


func _ready() -> void:
	_rng.randomize()
	# после самолётов: камера видит уже обновлённое положение
	process_physics_priority = 100
	_read_settings()
	camera.fov = base_fov
	camera.current = true


func _read_settings() -> void:
	var f = Profile.get_setting("fov")
	if f != null:
		base_fov = clampf(float(f), 40.0, 110.0)


func follow(ac) -> void:
	_restore_hidden()
	target = ac
	if mode != Mode.CHASE and mode != Mode.COCKPIT:
		mode = Mode.CHASE
	_snap = true
	if is_inside_tree():
		camera.current = true
	_update_now()


func set_mode(m: int) -> void:
	if m == mode:
		return
	_restore_hidden()
	mode = m
	_snap = true
	if mode == Mode.FREE_LOOK or mode == Mode.SPECTATE:
		_orbit_from_view()


func toggle_cockpit() -> void:
	# два вызова в одном кадре (например, и HUD, и камера поймали V) — одно переключение
	var frame := Engine.get_process_frames()
	if frame == _last_toggle_frame:
		return
	_last_toggle_frame = frame
	if mode == Mode.COCKPIT:
		set_mode(Mode.CHASE)
	elif mode == Mode.CHASE or mode == Mode.FREE_LOOK:
		set_mode(Mode.COCKPIT)


func spectate(ac) -> void:
	_restore_hidden()
	target = ac
	mode = Mode.SPECTATE
	_snap = true
	_orbit_from_view()
	if is_inside_tree():
		camera.current = true


func shake(amount: float) -> void:
	_shake = clampf(maxf(_shake, amount), 0.0, 1.5)


# ---------------------------------------------------------------- ввод

func _unhandled_input(event: InputEvent) -> void:
	if not handle_input:
		return
	if event.is_action_pressed("camera_toggle") and not event.is_echo():
		if _target_ok() and bool(target.get("is_player")) and bool(target.get("alive")):
			toggle_cockpit()
	if (mode == Mode.FREE_LOOK or mode == Mode.SPECTATE) and event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			_orbit.x -= mm.relative.x * ORBIT_RAD_PER_PX
			_orbit.y = clampf(_orbit.y - mm.relative.y * ORBIT_RAD_PER_PX, -1.4, 1.4)


# ---------------------------------------------------------------- кадр

func _physics_process(dt: float) -> void:
	_tick(dt)


func _update_now() -> void:
	_tick(0.0)


func _tick(dt: float) -> void:
	if camera == null:
		return
	_settings_timer -= dt
	if _settings_timer <= 0.0:
		_settings_timer = 0.5
		_read_settings()
	# FIXED: камерой (и углом обзора) управляет киллкам или повтор
	if mode == Mode.FIXED:
		zoomed = false
		return
	# угол обзора из настроек — по горизонтали на широком экране, по вертикали на узком (телефон стоя)
	if camera.is_inside_tree():
		var vs := camera.get_viewport().get_visible_rect().size
		camera.keep_aspect = Camera3D.KEEP_WIDTH if vs.x >= vs.y else Camera3D.KEEP_HEIGHT
	zoomed = handle_input and Input.is_action_pressed("zoom")
	var want_fov := ZOOM_FOV if zoomed else base_fov + (COCKPIT_FOV_ADD if mode == Mode.COCKPIT else 0.0)
	if dt <= 0.0:
		camera.fov = want_fov
	else:
		camera.fov = lerpf(camera.fov, want_fov, 1.0 - exp(-10.0 * dt))
	if not _target_ok():
		return
	if mode != Mode.COCKPIT:
		_restore_hidden()
	var xf: Transform3D = target.global_transform if (target as Node3D).is_inside_tree() else (target as Node3D).transform
	match mode:
		Mode.CHASE:
			_chase(xf, dt)
		Mode.COCKPIT:
			_cockpit(xf, dt)
		Mode.FREE_LOOK, Mode.SPECTATE:
			_orbit_cam(xf, dt)
	_snap = false


func _target_ok() -> bool:
	return target != null and is_instance_valid(target) and target is Node3D


func _length() -> float:
	var d = target.get("def")
	if d is Dictionary:
		return float(d.get("shape", {}).get("length", 10.0))
	return 10.0


func _pilot_aim() -> Dictionary:
	# {aim: Vector3, look: Vector2, use_aim: bool}
	var out := {"aim": Vector3.ZERO, "look": Vector2.ZERO, "use_aim": false}
	var p = target.get("pilot")
	if p == null or not is_instance_valid(p):
		return out
	if "look_offset" in p:
		var lo = p.get("look_offset")
		if lo is Vector2:
			out.look = lo
	if "aim_dir" in p and "mode" in p:
		var m := String(p.get("mode"))
		var a = p.get("aim_dir")
		if (m == "mouse" or m == "touch") and a is Vector3 and (a as Vector3).length_squared() > 0.5:
			out.aim = (a as Vector3).normalized()
			out.use_aim = true
	return out


static func _apply_look(dir: Vector3, up: Vector3, look: Vector2) -> Vector3:
	if look == Vector2.ZERO:
		return dir
	var d := dir.rotated(up.normalized(), -look.x)
	var right := d.cross(up)
	if right.length_squared() > 1e-6:
		d = d.rotated(right.normalized(), look.y)
	return d.normalized()


func _chase(xf: Transform3D, dt: float) -> void:
	camera.near = NEAR
	var length := _length()
	var dist := 2.2 * length + 6.0
	var height := 0.22 * dist + 1.0
	var pa := _pilot_aim()
	var dir: Vector3
	var up := Vector3.UP
	var fwd := -xf.basis.z
	if pa.use_aim:
		dir = pa.aim
	else:
		# клавиатура или бот: за самолётом, крен камеры наполовину
		dir = fwd
		up = Vector3.UP.lerp(xf.basis.y, 0.5).normalized()
	dir = _apply_look(dir, up, pa.look)
	# сглаживание: быстрое для прицела, мягкое за самолётом
	var tau := 0.03 if pa.use_aim else 0.12
	if _snap or dt <= 0.0:
		_view_dir = dir
		_view_up = up
	else:
		var k := 1.0 - exp(-dt / tau)
		_view_dir = Steer.slerp_dir(_view_dir, dir, k) if _view_dir.dot(dir) > -0.99 else dir
		_view_up = _view_up.lerp(up, 1.0 - exp(-dt / 0.2)).normalized()
	var vel := Vector3.ZERO
	if target.has_method("velocity"):
		vel = target.velocity()
	var side := _view_dir.cross(_view_up)
	var cam_up := _view_up
	if side.length_squared() > 1e-6:
		cam_up = side.normalized().cross(_view_dir).normalized()
	# опережение по скорости: камера чуть отстаёт по направлению движения (меньше при большой скорости)
	var lag := vel * 0.012
	var pos := xf.origin - _view_dir * dist + cam_up * height - lag
	pos = _above_ground(pos, 2.0)
	var look_at_pt := xf.origin + _view_dir * 80.0 + cam_up * (height * 0.6)
	_place(pos, look_at_pt, _view_up, dt)


func _cockpit(xf: Transform3D, dt: float) -> void:
	camera.near = NEAR_COCKPIT
	_hide_for_cockpit()
	var model = target.get("model")
	var eye := Vector3(0, 1.0, -_length() * 0.1)
	if target.has_method("marker_pos"):
		eye = target.marker_pos("Cockpit", eye)
	elif model != null and is_instance_valid(model):
		var mk := (model as Node3D).get_node_or_null("Cockpit") as Node3D
		if mk != null:
			eye = mk.position
	# голова уходит вниз при перегрузке и чуть запаздывает
	var g := 1.0
	var f = target.get("fm")
	if f != null:
		g = float(f.g_load)
	var want_head := Vector3(0.0, -clampf((g - 1.0) * 0.018, -0.06, 0.14), 0.0)
	if _snap or dt <= 0.0:
		_head = want_head
	else:
		_head = _head.lerp(want_head, 1.0 - exp(-dt / 0.15))
	var pos: Vector3 = xf * (eye + _head)
	var pa := _pilot_aim()
	var dir: Vector3 = -xf.basis.z
	var up: Vector3 = xf.basis.y
	if pa.use_aim:
		# мышь: смотрим вдоль прицела, но не дальше 100° от носа
		var a: Vector3 = pa.aim
		if a.dot(dir) > cos(deg_to_rad(100.0)):
			dir = Steer.slerp_dir(dir, a, 0.85)
	dir = _apply_look(dir, up, pa.look)
	if pos.is_finite():
		var b := Basis.looking_at(dir, up)
		camera.global_transform = Transform3D(b, pos) * _shake_offset(dt)


func _orbit_cam(xf: Transform3D, dt: float) -> void:
	camera.near = NEAR
	var length := _length()
	if _orbit_dist <= 0.0:
		_orbit_dist = 2.6 * length + 10.0
	if mode == Mode.SPECTATE and not handle_input:
		_orbit.x += 0.15 * dt
	var vel := Vector3.ZERO
	if target.has_method("velocity"):
		vel = target.velocity()
	# база облёта — курс цели (по скорости), чтобы камера держалась сзади при _orbit = 0
	var hdir := Vector3(vel.x, 0.0, vel.z)
	if hdir.length_squared() < 1.0:
		hdir = Vector3(-xf.basis.z.x, 0.0, -xf.basis.z.z)
	if hdir.length_squared() < 1e-6:
		hdir = Vector3.FORWARD
	hdir = hdir.normalized()
	var dir := hdir.rotated(Vector3.UP, _orbit.x)
	var right := dir.cross(Vector3.UP).normalized()
	dir = dir.rotated(right, _orbit.y).normalized()
	if _snap or dt <= 0.0:
		_view_dir = dir
	else:
		_view_dir = Steer.slerp_dir(_view_dir, dir, 1.0 - exp(-dt / 0.35))
	var pos := xf.origin - _view_dir * _orbit_dist
	pos = _above_ground(pos, 3.0)
	_place(pos, xf.origin, Vector3.UP, dt)


func _orbit_from_view() -> void:
	_orbit = Vector2(0.0, -0.25)
	_orbit_dist = 0.0


func _place(pos: Vector3, look_pt: Vector3, up: Vector3, dt: float) -> void:
	if not pos.is_finite() or not look_pt.is_finite():
		return
	var d := look_pt - pos
	if d.length_squared() < 1e-6:
		return
	var u := up
	if absf(d.normalized().dot(u.normalized())) > 0.995:
		u = Vector3.FORWARD
	var b := Basis.looking_at(d.normalized(), u)
	var t := Transform3D(b, pos) * _shake_offset(dt)
	if camera.is_inside_tree():
		camera.global_transform = t
	else:
		camera.transform = t


func _shake_offset(dt: float) -> Transform3D:
	if _shake <= 0.001:
		_shake = 0.0
		return Transform3D.IDENTITY
	var s := _shake * _shake
	var off := Vector3(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1), 0.0) * 0.35 * s
	var rot := Basis.from_euler(Vector3(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1), _rng.randf_range(-1, 1)) * 0.012 * s)
	if dt > 0.0:
		_shake *= exp(-SHAKE_DECAY * dt)
	return Transform3D(rot, off)


func _above_ground(pos: Vector3, margin: float) -> Vector3:
	var b = Game.battle
	if b == null or not is_instance_valid(b) or not ("world" in b):
		return pos
	var w = b.get("world")
	if w == null or not is_instance_valid(w) or not w.has_method("height_at"):
		return pos
	var h := maxf(float(w.height_at(pos.x, pos.z)), 0.0)
	if pos.y < h + margin:
		pos.y = h + margin
	return pos


## В кабине прячем стекло фонаря (тёмное, мешает обзору) и узлы с рамой фонаря, если есть.
func _hide_for_cockpit() -> void:
	if _hidden_for == target:
		return
	_restore_hidden()
	var model = target.get("model")
	if model == null or not is_instance_valid(model):
		return
	for n in ["Canopy", "CanopyFrame", "Frame"]:
		var node := (model as Node3D).get_node_or_null(n) as Node3D
		if node != null and node.visible:
			node.visible = false
			_hidden.append(node)
	_hidden_for = target


func _restore_hidden() -> void:
	for n in _hidden:
		if n != null and is_instance_valid(n):
			(n as Node3D).visible = true
	_hidden.clear()
	_hidden_for = null
