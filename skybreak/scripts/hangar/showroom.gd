class_name Showroom
extends Node3D
## 3D-ангар для меню: здание, свет, самолёт на полу и орбитальная камера.
## Мышь или палец — вращение, колесо или щипок — приближение. Через 6 с без ввода камера медленно облетает самолёт.
## set_view_rect(rect) — свободная часть экрана между панелями: самолёт ставится в её центр,
## а дистанция (и при нужде угол обзора) подбирается по вершинам модели так, чтобы самолёт
## при облёте под любым углом помещался в эту часть экрана.

const Hall = preload("res://scripts/hangar/showroom_hall.gd")

const IDLE_DELAY := 6.0
const IDLE_SPEED := 0.12        # рад/с
const DAMP := 7.0
const PITCH_MIN := 0.04
const PITCH_MAX := 1.15
const DEFAULT_YAW := -2.35
const DEFAULT_PITCH := 0.2
const FADE_OUT := 0.12
const FADE_IN := 0.25
const CAM_MAX_Y := 8.6
const BASE_FOV := 46.0
const MAX_FOV := 72.0
const FIT_FILL := 0.96          # доля свободной области, которую может занять самолёт
const FIT_MAX_DIST := 25.0      # дальше камера упирается в стены — тогда шире угол обзора
const FIT_MIN_DIST := 7.0
const FIT_YAWS := 16            # сколько направлений облёта проверять
const FIT_POINTS := 1500        # сколько вершин модели брать для расчёта

var camera: Camera3D
var interactive := true
var auto_rotate := true
var plane_id := ""
var camo_id := ""
var model: Node3D

var _hall
var _env: Environment
var _holder: Node3D
var _props: Node3D
var _fade_layer: CanvasLayer
var _fade: ColorRect
var _tween: Tween
var _pending := []

var _yaw := DEFAULT_YAW
var _pitch := DEFAULT_PITCH
var _dist := 16.0
var _t_yaw := DEFAULT_YAW
var _t_pitch := DEFAULT_PITCH
var _t_dist := 16.0
var _dist_default := 16.0
var _dist_min := 6.0
var _dist_max := 30.0
var _target := Vector3(0, 1.2, 0)
var _t_target := Vector3(0, 1.2, 0)
var _idle := 0.0
var _dragging := false
var _touches: Dictionary = {}
var _pinch_start := 0.0
var _pinch_dist := 0.0
var _screen_offset := Vector2.ZERO
var _view_rect := Rect2()             # свободная область экрана (координаты вьюпорта), пусто — весь экран
var _fit_points := PackedVector3Array()   # вершины модели относительно точки, вокруг которой летает камера


func _ready() -> void:
	_build_environment()
	_hall = Hall.new()
	_hall.build(self)
	_holder = Node3D.new()
	_holder.name = "PlaneSpot"
	add_child(_holder)
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.fov = BASE_FOV
	camera.near = 0.1
	camera.far = 600.0
	add_child(camera)
	camera.current = true
	_fade_layer = CanvasLayer.new()
	_fade_layer.layer = -1
	add_child(_fade_layer)
	_fade = ColorRect.new()
	_fade.color = Color(0.05, 0.06, 0.07, 0.0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade_layer.add_child(_fade)
	_apply_quality()
	var prof := get_node_or_null("/root/Profile")
	if prof and prof.has_signal("changed"):
		prof.connect("changed", _apply_quality)
	_update_camera(0.0, true)
	if _pending.size() == 2:
		var p: Array = _pending
		_pending = []
		show_plane(p[0], p[1])


func _build_environment() -> void:
	_env = Environment.new()
	_env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.32, 0.52, 0.8)
	sm.sky_horizon_color = Color(0.72, 0.8, 0.88)
	sm.ground_horizon_color = Color(0.6, 0.66, 0.7)
	sm.ground_bottom_color = Color(0.3, 0.33, 0.35)
	sky.sky_material = sm
	_env.sky = sky
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.ambient_light_color = Color(0.62, 0.66, 0.72)
	_env.ambient_light_energy = 0.55
	_env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	_env.tonemap_exposure = 1.0
	_env.glow_enabled = true
	_env.glow_intensity = 0.5
	_env.glow_bloom = 0.05
	_env.glow_hdr_threshold = 1.0
	_env.fog_enabled = true
	_env.fog_light_color = Color(0.7, 0.74, 0.8)
	_env.fog_density = 0.002
	_env.fog_sky_affect = 0.0
	var we := WorldEnvironment.new()
	we.name = "Environment"
	we.environment = _env
	add_child(we)


func _apply_quality() -> void:
	var q := "medium"
	var prof := get_node_or_null("/root/Profile")
	if prof and prof.has_method("get_setting"):
		var v = prof.get_setting("graphics")
		if v is String:
			q = v
	if _hall:
		_hall.apply_quality(q)
	if _env:
		_env.glow_enabled = q != "low"
		_env.fog_enabled = q != "low"


# ------------------------------------------------------------------ API

func show_plane(p_plane_id: String, p_camo_id: String) -> void:
	if not is_inside_tree() or _holder == null:
		_pending = [p_plane_id, p_camo_id]
		return
	if p_plane_id == plane_id and p_camo_id == camo_id and model != null:
		return
	plane_id = p_plane_id
	camo_id = p_camo_id
	if _tween and _tween.is_valid():
		_tween.kill()
	if model == null:
		_swap_model()
		_fade.color.a = 1.0
		_tween = create_tween()
		_tween.tween_property(_fade, "color:a", 0.0, FADE_IN)
		return
	_tween = create_tween()
	_tween.tween_property(_fade, "color:a", 1.0, FADE_OUT * (1.0 - _fade.color.a))
	_tween.tween_callback(_swap_model)
	_tween.tween_property(_fade, "color:a", 0.0, FADE_IN)


func set_interactive(on: bool) -> void:
	interactive = on
	if not on:
		_dragging = false
		_touches.clear()


func reset_view() -> void:
	_t_yaw = DEFAULT_YAW
	_t_pitch = DEFAULT_PITCH
	_t_dist = _dist_default
	_idle = 0.0


## Сдвиг самолёта на экране в долях ширины/высоты (например, 0.15 — правее, если слева панель).
func set_screen_offset(offset: Vector2) -> void:
	_screen_offset = offset


## Свободная часть экрана (в координатах вьюпорта, как get_global_rect у Control).
## Самолёт встаёт в её центр и целиком в неё помещается. Пустой Rect2 — весь экран.
func set_view_rect(r: Rect2) -> void:
	_view_rect = r
	var vp := _viewport_size()
	if r.size.x > 1.0 and r.size.y > 1.0:
		var c := r.get_center()
		_screen_offset = Vector2((c.x - vp.x * 0.5) / vp.x, (c.y - vp.y * 0.5) / vp.y)
	else:
		_screen_offset = Vector2.ZERO
	_refit()


func get_view_rect() -> Rect2:
	return _view_rect


## Расстояние камеры по умолчанию (после подгонки под свободную область).
func default_distance() -> float:
	return _dist_default


func get_camera() -> Camera3D:
	return camera


## Можно передавать события ввода вручную, если интерфейс сверху перехватывает их.
func handle_input(event: InputEvent) -> bool:
	if not interactive:
		return false
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT or mb.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = mb.pressed
			_idle = 0.0
			return true
		if mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom(0.9)
			return true
		if mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom(1.0 / 0.9)
			return true
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		if _dragging and _touches.is_empty():
			_rotate(mm.relative)
			return true
	elif event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_touches[st.index] = st.position
		else:
			_touches.erase(st.index)
		if _touches.size() == 2:
			_pinch_start = _touch_spread()
			_pinch_dist = _t_dist
		_idle = 0.0
		return true
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		_touches[sd.index] = sd.position
		if _touches.size() == 1:
			_rotate(sd.relative)
		elif _touches.size() >= 2 and _pinch_start > 1.0:
			var k := _pinch_start / maxf(1.0, _touch_spread())
			_t_dist = clampf(_pinch_dist * k, _dist_min, _dist_max)
			_idle = 0.0
		return true
	elif event is InputEventMagnifyGesture:
		var mg := event as InputEventMagnifyGesture
		_zoom(1.0 / maxf(0.1, mg.factor))
		return true
	elif event is InputEventPanGesture:
		var pg := event as InputEventPanGesture
		_rotate(pg.delta * 8.0)
		return true
	return false


# ------------------------------------------------------------------ внутреннее

func _unhandled_input(event: InputEvent) -> void:
	if handle_input(event):
		get_viewport().set_input_as_handled()


func _touch_spread() -> float:
	var pts: Array = _touches.values()
	if pts.size() < 2:
		return 0.0
	return (pts[0] as Vector2).distance_to(pts[1] as Vector2)


func _rotate(rel: Vector2) -> void:
	var h := maxf(1.0, get_viewport().get_visible_rect().size.y)
	var k := 2.6 / h
	_t_yaw -= rel.x * k
	_t_pitch = clampf(_t_pitch + rel.y * k * 0.8, PITCH_MIN, PITCH_MAX)
	_idle = 0.0


func _zoom(factor: float) -> void:
	_t_dist = clampf(_t_dist * factor, _dist_min, _dist_max)
	_idle = 0.0


func _swap_model() -> void:
	if model:
		_holder.remove_child(model)
		model.queue_free()
		model = null
	if _props:
		_holder.remove_child(_props)
		_props.queue_free()
		_props = null
	var def: Dictionary = Data.plane(plane_id)
	if def.is_empty():
		return
	var camo: Dictionary = Data.camo(plane_id, camo_id)
	model = AircraftMeshBuilder.build(def, camo)
	_holder.add_child(model)
	AircraftMeshBuilder.set_gear(model, true)
	AircraftMeshBuilder.set_afterburner(model, false)
	var sh: Dictionary = def.shape
	var gh := float(sh.gear_height)
	var gp: float = model.get_meta("ground_pitch", 0.0)
	var mc: Vector3 = model.get_meta("main_contact", Vector3(0, -gh, 0))
	# хвостовое колесо на полу: поворот вокруг точки касания основных колёс
	var xf := Transform3D(Basis(Vector3.RIGHT, gp), Vector3.ZERO) * Transform3D(Basis.IDENTITY, -mc)
	xf.origin += Vector3(0, 0, mc.z)
	model.transform = xf
	_props = _hall.plane_props(model, def)
	_holder.add_child(_props)
	var size := maxf(float(sh.length), float(sh.span))
	_dist_default = clampf(size * 0.82 + 2.4, 8.0, 24.0)
	_dist_min = maxf(4.0, size * 0.45)
	_dist_max = minf(30.0, size * 1.8 + 6.0)
	_t_target = Vector3(0, gh * 0.75 + 0.3, 0)
	_collect_fit_points()
	_t_dist = _dist_default
	_refit(true)


func _process(dt: float) -> void:
	_idle += dt
	if auto_rotate and _idle > IDLE_DELAY and not _dragging and _touches.is_empty():
		_t_yaw -= IDLE_SPEED * dt
	_update_camera(dt, false)


func _update_camera(dt: float, snap: bool) -> void:
	if camera == null:
		return
	# не поднимать камеру выше ламп: ограничение угла по текущей дистанции
	var max_pitch := asin(clampf((CAM_MAX_Y - _t_target.y) / maxf(1.0, _t_dist), 0.05, 1.0))
	_t_pitch = clampf(_t_pitch, PITCH_MIN, minf(PITCH_MAX, max_pitch))
	var k := 1.0 if snap else 1.0 - exp(-DAMP * dt)
	_yaw = lerpf(_yaw, _t_yaw, k)
	_pitch = lerpf(_pitch, _t_pitch, k)
	_dist = lerpf(_dist, _t_dist, k)
	_target = _target.lerp(_t_target, k)
	var dir := Vector3(sin(_yaw) * cos(_pitch), sin(_pitch), cos(_yaw) * cos(_pitch))
	var pos := _target + dir * _dist
	var look := _target
	if _screen_offset != Vector2.ZERO:
		var vp := get_viewport().get_visible_rect().size
		var aspect := vp.x / maxf(1.0, vp.y)
		var half_h := tan(deg_to_rad(camera.fov * 0.5)) * _dist
		var right := Vector3.UP.cross(-dir).normalized()
		var up := (-dir).cross(right).normalized()
		var shift := right * (-_screen_offset.x * 2.0 * half_h * aspect) + up * (_screen_offset.y * 2.0 * half_h)
		pos += shift
		look += shift
	# камера не выходит за стены и под пол
	pos.x = clampf(pos.x, -Hall.W2 + 1.0, Hall.W2 - 1.0)
	pos.z = clampf(pos.z, -Hall.D2 + 1.0, Hall.D2 + 6.0)
	pos.y = clampf(pos.y, 0.35, CAM_MAX_Y + 0.4)
	camera.position = pos
	if not pos.is_equal_approx(look):
		camera.look_at(look, Vector3.UP)



# ------------------------------------------------------------------ подгонка под свободную область

func _viewport_size() -> Vector2:
	if is_inside_tree():
		var vs := get_viewport().get_visible_rect().size
		if vs.x > 1.0 and vs.y > 1.0:
			return vs
	return Vector2(1280, 720)


## Вершины модели (с прореживанием) в координатах ангара; центр облёта — середина габаритов.
func _collect_fit_points() -> void:
	_fit_points = PackedVector3Array()
	if model == null or not model.is_inside_tree():
		return
	var all := PackedVector3Array()
	for n in model.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null or not mi.is_visible_in_tree():
			continue
		var xf := _holder.global_transform.affine_inverse() * mi.global_transform
		var faces := mi.mesh.get_faces()
		for v in faces:
			all.append(xf * v)
	if all.is_empty():
		return
	var lo := all[0]
	var hi := all[0]
	for v in all:
		lo = lo.min(v)
		hi = hi.max(v)
	var c := (lo + hi) * 0.5
	_t_target = Vector3(c.x, maxf(c.y, 0.8), c.z)
	var stride := maxi(1, all.size() / FIT_POINTS)
	for i in range(0, all.size(), stride):
		_fit_points.append(all[i] - _t_target)


## Дистанция камеры и угол обзора, при которых самолёт помещается в свободную область
## при облёте под любым курсом (наклон камеры — по умолчанию).
static func fit_view(points: PackedVector3Array, frac: Vector2, aspect: float, pitch: float) -> Vector2:
	if points.is_empty():
		return Vector2(FIT_MIN_DIST, BASE_FOV)
	var th_unit := aspect * frac.x * FIT_FILL     # tan(половины угла по горизонтали) на единицу tan(fov/2)
	var tv_unit := frac.y * FIT_FILL
	var t0 := tan(deg_to_rad(BASE_FOV) * 0.5)
	var need := 0.0
	var dirs: Array = []
	for k in FIT_YAWS:
		var yaw := DEFAULT_YAW + TAU * float(k) / float(FIT_YAWS)
		var dir := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
		var right := Vector3.UP.cross(-dir).normalized()
		var up := (-dir).cross(right).normalized()
		dirs.append([dir, right, up])
		for q in points:
			var d := q.dot(dir) + maxf(absf(q.dot(right)) / (t0 * th_unit), absf(q.dot(up)) / (t0 * tv_unit))
			need = maxf(need, d)
	if need <= FIT_MAX_DIST:
		return Vector2(maxf(need, FIT_MIN_DIST), BASE_FOV)
	# не помещается с базовым углом — камера у стены, угол обзора шире
	var k_need := 0.0
	for b in dirs:
		var dir: Vector3 = b[0]
		var right: Vector3 = b[1]
		var up: Vector3 = b[2]
		for q in points:
			var depth := maxf(FIT_MAX_DIST - q.dot(dir), 0.5)
			k_need = maxf(k_need, maxf(absf(q.dot(right)) / (depth * th_unit), absf(q.dot(up)) / (depth * tv_unit)))
	var fov := clampf(rad_to_deg(2.0 * atan(k_need)), BASE_FOV, MAX_FOV)
	return Vector2(FIT_MAX_DIST, fov)


func _refit(force: bool = false) -> void:
	if _fit_points.is_empty():
		return
	var vp := _viewport_size()
	var frac := Vector2.ONE
	if _view_rect.size.x > 1.0 and _view_rect.size.y > 1.0:
		frac = Vector2(clampf(_view_rect.size.x / vp.x, 0.1, 1.0), clampf(_view_rect.size.y / vp.y, 0.1, 1.0))
	var fit := fit_view(_fit_points, frac, vp.x / vp.y, DEFAULT_PITCH)
	var was_default := absf(_t_dist - _dist_default) < 0.01
	_dist_default = fit.x
	_dist_max = clampf(maxf(_dist_max, _dist_default + 3.0), _dist_default, 30.0)
	_dist_min = minf(_dist_min, _dist_default)
	if camera != null:
		camera.fov = fit.y
	if force or was_default:
		_t_dist = _dist_default
