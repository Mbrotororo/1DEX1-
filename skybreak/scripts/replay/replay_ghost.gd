class_name ReplayGhost
extends Node3D
## Модель самолёта в повторе и киллкаме. Ставится по отсчётам трека (ReplayData.sample).
## Подпись (Label3D) — для киллкама: постоянного размера, с обводкой, поверх всего; размер шрифта
## подгоняется под экран, чтобы один пиксель шрифта был одним пикселем экрана (текст не мылится).
## В сцене повтора подписи рисует ReplayUI в 2D и выключает эти.

const PARTS := {"LeftWing": ReplayData.F_LWING, "RightWing": ReplayData.F_RWING, "Tail": ReplayData.F_TAIL}

var uid: int = -1
var info: Dictionary = {}
var def: Dictionary = {}
var model: Node3D
var tag: Label3D
var fx = null                     # Effects или null
var size: float = 10.0
var present: bool = false
var flags: int = -1
var show_tag: bool = true
var tag_range: float = 3000.0      # дальше подпись не показывается
var last_pos: Vector3 = Vector3.ZERO
var last_rot: Quaternion = Quaternion.IDENTITY

var _fire: Node3D = null
var _smoke: Node3D = null
var _tag_key: Vector2 = Vector2.ZERO


func setup(p_uid: int, p_info: Dictionary, p_fx = null) -> void:
	uid = p_uid
	info = p_info
	fx = p_fx
	name = "Ghost_%d" % uid
	var def_id := str(info.get("def_id", ""))
	def = Data.plane(def_id)
	if def.is_empty():
		def_id = str(Data.ORDER[0])
		def = Data.plane(def_id)
	var camo: Dictionary = Data.camo(def_id, str(info.get("camo", "factory")))
	model = AircraftMeshBuilder.build(def, camo)
	model.name = "Model"
	add_child(model)
	var sh: Dictionary = def.get("shape", {})
	size = maxf(float(sh.get("length", 10.0)), float(sh.get("span", 10.0)))
	tag = Label3D.new()
	tag.name = "Tag"
	tag.top_level = true
	tag.text = ReplayData.plane_title(info)
	tag.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	tag.fixed_size = true
	tag.no_depth_test = true
	tag.pixel_size = 0.0019
	tag.font_size = 15
	tag.outline_size = 5
	tag.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	tag.double_sided = true
	tag.modulate = UiStyle.team_color(int(info.get("team", 0))).lightened(0.25)
	tag.outline_modulate = Color(0, 0, 0, 0.8)
	tag.render_priority = 2
	tag.visible = false
	add_child(tag)
	visible = false


## s — результат ReplayData.sample().
func apply(s: Dictionary, dt: float) -> void:
	var f := int(s.flags)
	var show: bool = bool(s.present) and (f & ReplayData.F_GONE) == 0
	if show != present:
		present = show
		visible = show
		if not show:
			_clear_fx()
			flags = -1
	if not show:
		tag.visible = false
		return
	last_pos = s.pos
	last_rot = s.rot
	if is_inside_tree():
		global_transform = Transform3D(Basis(last_rot), last_pos)
	else:
		transform = Transform3D(Basis(last_rot), last_pos)
	if f != flags:
		_apply_flags(f)
	var alive := (f & ReplayData.F_ALIVE) != 0
	AircraftMeshBuilder.spin_props(model, float(s.throttle) if alive else 0.0, dt)
	var cam: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null
	var near := cam == null or cam.global_position.distance_to(last_pos) < tag_range
	tag.visible = show_tag and near
	if tag.visible:
		tag.global_position = last_pos + Vector3.UP * (size * 0.45 + 3.0)
		_fit_tag(cam)


## Шрифт под размер окна: 15 px при высоте 720, пиксель шрифта = пиксель экрана.
func _fit_tag(cam: Camera3D) -> void:
	if cam == null:
		return
	var h := float(get_window().size.y) if get_window() != null else 720.0
	h = maxf(h, 200.0)
	var key := Vector2(h, cam.fov)
	if key == _tag_key:
		return
	_tag_key = key
	var fs := int(round(15.0 * h / 720.0))
	tag.font_size = fs
	tag.outline_size = maxi(3, int(round(fs * 0.3)))
	tag.pixel_size = 2.0 * tan(deg_to_rad(cam.fov) * 0.5) / h


func basis_now() -> Basis:
	return Basis(last_rot)


## Точка в координатах модели по имени маркера (Cockpit, Engine0...).
func marker_local(marker: String, fallback: Vector3 = Vector3.ZERO) -> Vector3:
	var m := model.find_child(marker, true, false) as Node3D
	if m == null:
		return fallback
	var p := m.position
	var n := m.get_parent() as Node3D
	while n != null and n != model:
		p = n.transform * p
		n = n.get_parent() as Node3D
	return p


func hide_ghost() -> void:
	if present:
		present = false
		visible = false
		tag.visible = false
		_clear_fx()
		flags = -1


func _apply_flags(f: int) -> void:
	AircraftMeshBuilder.set_gear(model, (f & ReplayData.F_GEAR) != 0)
	AircraftMeshBuilder.set_afterburner(model, (f & ReplayData.F_AFTERBURNER) != 0)
	for part in PARTS:
		var n := model.find_child(part, true, false) as Node3D
		if n != null:
			n.visible = (f & int(PARTS[part])) == 0
	if fx != null and is_instance_valid(fx):
		var fire := (f & ReplayData.F_FIRE) != 0
		if fire and _fire == null:
			_fire = fx.attach_fire(model, marker_local("Engine0", Vector3(0, 0, size * 0.2)))
		elif not fire and _fire != null:
			_free(_fire)
			_fire = null
		var smoke := (f & ReplayData.F_SMOKE) != 0
		if smoke and _smoke == null:
			_smoke = fx.attach_smoke(model, marker_local("Engine0", Vector3(0, 0, size * 0.3)), true)
		elif not smoke and _smoke != null:
			_free(_smoke)
			_smoke = null
	flags = f


func _clear_fx() -> void:
	_free(_fire)
	_free(_smoke)
	_fire = null
	_smoke = null


static func _free(n) -> void:
	if n != null and is_instance_valid(n) and n is Node:
		(n as Node).queue_free()
