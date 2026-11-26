class_name GroundUnit
extends Node3D
## Наземная цель: танк, зенитка, грузовик, корабль, здание, авианосец.
## Колонны едут по замкнутому пути по рельефу, корабли — по воде.
## Зенитки и корабли стреляют по ближайшему вражескому самолёту (очереди трассерами, корабли и тяжёлые
## установки ещё и зенитными снарядами). Танки и грузовики не стреляют.

signal destroyed(unit, killer_uid: int)

const Models = preload("res://scripts/world/world_models.gd")
const Mat = preload("res://scripts/world/world_materials.gd")
const CarrierModel = preload("res://scripts/world/world_carrier.gd")

# hp, радиус, броня, очки
const STATS := {
	"tank": [130.0, 5.0, true, 15],
	"aa": [60.0, 4.5, false, 12],
	"truck": [40.0, 4.5, false, 8],
	"ship": [450.0, 30.0, true, 40],
	"building": [220.0, 16.0, false, 25],
	"carrier": [100000.0, 60.0, true, 0],
}
const BUILDINGS := {"hangar": [240.0, 18.0, false], "bunker": [300.0, 10.0, true], "fuel": [120.0, 13.0, false], "depot": [200.0, 16.0, false]}
const SPEEDS := {"tank": 5.0, "truck": 6.5, "aa": 5.0, "ship": 7.0}

const AA_RANGE := 2200.0
const SHIP_RANGE := 3000.0
const BULLET_SPEED := 900.0
const BULLET_DAMAGE := 10.0
const BULLET_CALIBER := 20.0
const FLAK_SPEED := 760.0
const FLAK_DAMAGE := 35.0
const FLAK_RADIUS := 18.0
const GRAVITY := 9.81
const SHOT_INTERVAL := 0.1
const SMOKE_TIME := 20.0

const WAKE_SHADER := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, skip_vertex_transform;
uniform float bias = 0.998;
varying vec2 m;
void vertex() {
	VERTEX = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz * bias;
	m = UV;
}
void fragment() {
	float n = 0.5 + 0.5 * sin(m.y * 0.35 - TIME * 2.0 + sin(m.x * 3.0) * 2.0);
	float edge = 1.0 - abs(m.x);
	ALBEDO = vec3(0.92, 0.95, 0.97);
	ALPHA = COLOR.a * (0.55 + 0.45 * n) * smoothstep(0.0, 0.5, edge);
}
"""

var uid: int = 0
var kind: String = "tank"
var team: int = 0
var hp: float = 100.0
var max_hp: float = 100.0
var alive: bool = true
var radius: float = 4.0
var armored: bool = false
var base_id: int = -1
var ticket_value: int = 10

# дополнительно (не из контракта)
var variant: String = ""          # building: hangar|bunker|fuel|depot; aa: light|heavy|mobile|deck
var heavy: bool = false           # стреляет зенитными снарядами
var invulnerable: bool = false
var active: bool = true           # движение и стрельба (повтор выключает)
var speed: float = 0.0            # м/с по пути
var fire_range: float = 0.0
var skill: float = 0.5
var target = null
var world = null
var path := PackedVector3Array()
var path_s: float = 0.0
var shots_fired: int = 0
var flak_fired: int = 0
var model: Node3D
var turret: Node3D
var gun: Node3D

var _aft: Node3D
var _muzzles: Array = []
var _side_muzzles: Array = []
var _meshes: Array = []
var _flash_light: OmniLight3D
var _flash: MeshInstance3D
var _flash_t: float = 0.0
var _wake: MeshInstance3D
var _rng := RandomNumberGenerator.new()
var _scan_t: float = 0.0
var _burst: float = 0.0
var _pause: float = 0.5
var _shot_t: float = 0.0
var _flak_t: float = 1.0
var _muzzle_i: int = 0
var _err := Vector2.ZERO
var _yaw: float = 0.0
var _pitch: float = 0.15
var _cum := PackedFloat32Array()
var _path_len: float = 0.0
var _seg: int = 0
var _heading: float = 0.0
var _wreck_t: float = 0.0
var _smoke = null
var _fire = null
var _time: float = 0.0
var _height: float = 3.0
var _base_y: float = 0.0

# ---------------------------------------------------------------- настройка

func setup(p_kind: String, p_team: int, p_pos: Vector3, p_heading: float, p_uid: int, p_world) -> void:
	kind = p_kind if STATS.has(p_kind) else "tank"
	team = p_team
	uid = p_uid
	world = p_world
	name = "%s_%d" % [kind, uid]
	_heading = p_heading
	position = p_pos
	_base_y = p_pos.y
	rotation = Vector3(0.0, -p_heading, 0.0)
	var st: Array = STATS[kind]
	max_hp = st[0]
	radius = st[1]
	armored = st[2]
	ticket_value = st[3]
	match kind:
		"building":
			if not BUILDINGS.has(variant):
				variant = "depot"
			var bs: Array = BUILDINGS[variant]
			max_hp = bs[0]
			radius = bs[1]
			armored = bs[2]
		"aa":
			if not variant in ["light", "heavy", "mobile", "deck"]:
				variant = "light"
			heavy = variant == "heavy" or variant == "deck"
			fire_range = AA_RANGE
		"ship":
			heavy = true
			fire_range = SHIP_RANGE
		"carrier":
			invulnerable = true
	if speed <= 0.0:
		speed = float(SPEEDS.get(kind, 0.0))
	hp = max_hp
	alive = true
	_rng.seed = p_uid * 7919 + 17
	skill = _rng.randf_range(0.4, 0.75)
	_pause = _rng.randf_range(0.2, 1.5)
	_flak_t = _rng.randf_range(0.5, 2.0)
	_yaw = _rng.randf_range(-PI, PI)
	_build_model()

func _night() -> bool:
	return world != null and bool(world.get("is_night"))

func _add_mesh(parent: Node3D, mesh: Mesh, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	if mat != null:
		mi.material_override = mat
	parent.add_child(mi)
	_meshes.append(mi)
	return mi

func _build_model() -> void:
	if model != null:
		model.queue_free()
	_meshes.clear()
	_muzzles.clear()
	_side_muzzles.clear()
	model = Node3D.new()
	model.name = "Model"
	add_child(model)
	if kind == "carrier":
		var cp: Dictionary = CarrierModel.build_model(_night())
		_add_mesh(model, cp.body, null)
		var deck := _add_mesh(model, cp.deck, Mat.runway_material())
		deck.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var g := _add_mesh(model, cp.glass, null)
		g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		model.add_child(cp.lights)
		_height = 30.0
		return
	var p: Dictionary = Models.parts(kind, variant, team)
	var mat := Mat.vcolor()
	_add_mesh(model, p.body, mat)
	_height = float(p.get("height", 3.0))
	if p.has("turret"):
		turret = Node3D.new()
		turret.name = "Turret"
		turret.position = p.turret_pos
		model.add_child(turret)
		_add_mesh(turret, p.turret, mat)
		gun = Node3D.new()
		gun.name = "Gun"
		gun.position = p.gun_pos
		turret.add_child(gun)
		_add_mesh(gun, p.gun, mat)
		for mpos in p.get("muzzles", []):
			var mk := Marker3D.new()
			mk.position = mpos
			gun.add_child(mk)
			_muzzles.append(mk)
		turret.rotation.y = _yaw
		gun.rotation.x = _pitch
	if p.has("aft"):
		_aft = Node3D.new()
		_aft.position = p.aft_pos
		model.add_child(_aft)
		_add_mesh(_aft, p.aft, mat)
		_aft.rotation.y = PI
	for mpos in p.get("aa_muzzles", []):
		var mk := Marker3D.new()
		mk.position = mpos
		model.add_child(mk)
		_side_muzzles.append(mk)
	if kind == "aa" or kind == "ship":
		_make_flash()
	if kind == "ship":
		_make_wake()

func _make_flash() -> void:
	var parent: Node3D = gun if gun != null else model
	var at := Vector3.ZERO
	if not _muzzles.is_empty():
		at = (_muzzles[0] as Marker3D).position
	_flash_light = OmniLight3D.new()
	_flash_light.light_color = Color(1.0, 0.7, 0.35)
	_flash_light.omni_range = 16.0
	_flash_light.light_energy = 0.0
	_flash_light.shadow_enabled = false
	_flash_light.visible = false
	_flash_light.position = at
	parent.add_child(_flash_light)
	var q := QuadMesh.new()
	q.size = Vector2(1.6, 1.6)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	m.albedo_texture = Mat.soft_texture()
	m.albedo_color = Color(1.0, 0.75, 0.35)
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	q.material = m
	_flash = MeshInstance3D.new()
	_flash.mesh = q
	_flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_flash.visible = false
	_flash.position = at
	parent.add_child(_flash)

func _make_wake() -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	# полоса пены за кормой: ширина растёт, прозрачность падает
	var rows := 12
	var length := 150.0
	for i in rows:
		var t0 := float(i) / rows
		var t1 := float(i + 1) / rows
		var z0 := 30.0 + t0 * length
		var z1 := 30.0 + t1 * length
		var w0 := 6.0 + t0 * 30.0
		var w1 := 6.0 + t1 * 30.0
		var a0 := 0.85 * (1.0 - t0)
		var a1 := 0.85 * (1.0 - t1)
		_wake_quad(st, Vector3(-w0, 0.3, z0), Vector3(w0, 0.3, z0), Vector3(w1, 0.3, z1), Vector3(-w1, 0.3, z1), a0, a1, z0, z1)
	# волна у носа
	for s in [-1.0, 1.0]:
		var p0 := Vector3(0, 0.3, -38.0)
		var p1 := Vector3(s * 7.0, 0.3, -22.0)
		var p2 := Vector3(s * 16.0, 0.3, 10.0)
		var p3 := Vector3(s * 9.0, 0.3, 10.0)
		var p4 := Vector3(s * 4.0, 0.3, -22.0)
		_wake_quad(st, p0, p1, p4, p0, 0.8, 0.6, 0.0, 8.0)
		_wake_quad(st, p4, p1, p2, p3, 0.6, 0.0, 8.0, 30.0)
	var sh := Shader.new()
	sh.code = WAKE_SHADER
	var mat := ShaderMaterial.new()
	mat.shader = sh
	_wake = MeshInstance3D.new()
	_wake.name = "Wake"
	_wake.mesh = st.commit()
	_wake.material_override = mat
	_wake.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_wake)

func _wake_quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, al0: float, al1: float, v0: float, v1: float) -> void:
	var pts := [[a, al0, Vector2(-1, v0)], [b, al0, Vector2(1, v0)], [c, al1, Vector2(1, v1)],
		[a, al0, Vector2(-1, v0)], [c, al1, Vector2(1, v1)], [d, al1, Vector2(-1, v1)]]
	for e in pts:
		st.set_color(Color(1, 1, 1, e[1]))
		st.set_uv(e[2])
		st.set_normal(Vector3.UP)
		st.add_vertex(e[0])

# ---------------------------------------------------------------- путь

## Колонна или корабль едет по точкам (Vector3 или Vector2 x,z). Путь замыкается.
func set_path(points: Array) -> void:
	path = PackedVector3Array()
	for p in points:
		if p is Vector2:
			path.append(Vector3(p.x, 0.0, p.y))
		elif p is Vector3:
			path.append(p)
	if path.size() >= 2 and Vector2(path[0].x - path[path.size() - 1].x, path[0].z - path[path.size() - 1].z).length() > 1.0:
		path.append(path[0])
	_cum = PackedFloat32Array()
	_path_len = 0.0
	_cum.append(0.0)
	for i in range(1, path.size()):
		_path_len += Vector2(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z).length()
		_cum.append(_path_len)
	_seg = 0
	if speed <= 0.0:
		speed = float(SPEEDS.get(kind, 5.0))
	if path.size() >= 2 and _path_len > 1.0:
		path_s = fposmod(path_s, _path_len)
		_place_on_path(0.0, true)

## Сдвиг по пути (для строя колонны).
func set_path_offset(s: float) -> void:
	path_s = s
	if _path_len > 1.0:
		path_s = fposmod(s, _path_len)
		_place_on_path(0.0, true)

func path_length() -> float:
	return _path_len

func _point_at(s: float) -> Vector3:
	s = fposmod(s, _path_len)
	var n := path.size()
	if _seg >= n - 1 or _seg < 0:
		_seg = 0
	# ищем сегмент от последнего
	var guard := 0
	while guard < n:
		if s >= _cum[_seg] and s <= _cum[_seg + 1]:
			break
		_seg = (_seg + 1) % (n - 1)
		guard += 1
	var seg_len := _cum[_seg + 1] - _cum[_seg]
	var t := 0.0 if seg_len <= 0.001 else (s - _cum[_seg]) / seg_len
	return path[_seg].lerp(path[_seg + 1], t)

func _place_on_path(dt: float, snap: bool) -> void:
	var p := _point_at(path_s)
	var keep := _seg
	var ahead := _point_at(path_s + 9.0)
	_seg = keep
	var d := Vector2(ahead.x - p.x, ahead.z - p.z)
	if d.length() > 0.01:
		var want := atan2(d.x, -d.y)
		if snap:
			_heading = want
		else:
			_heading += clampf(wrapf(want - _heading, -PI, PI), -0.6 * dt, 0.6 * dt)
	var fwd := Vector3(sin(_heading), 0.0, -cos(_heading))
	var up := Vector3.UP
	var y := 0.0
	if kind == "ship":
		y = 0.0
		var roll := 0.012 * sin(_time * 0.7 + uid)
		var pitch := 0.006 * sin(_time * 0.9 + uid * 2.0)
		up = Vector3(roll, 1.0, pitch).normalized()
	elif world != null:
		y = world.height_at(p.x, p.z)
		var tr = world.get("terrain")
		if tr != null:
			up = (tr.normal_at(p.x, p.z) as Vector3).lerp(Vector3.UP, 0.25).normalized()
	var back := (-fwd - up * (-fwd).dot(up)).normalized()
	var right := up.cross(back).normalized()
	transform = Transform3D(Basis(right, up, back), Vector3(p.x, y, p.z))

func _move(dt: float) -> void:
	path_s = fposmod(path_s + speed * dt, _path_len)
	_place_on_path(dt, false)

# ---------------------------------------------------------------- кадр

func _physics_process(delta: float) -> void:
	_time += delta
	if not alive:
		_wreck_step(delta)
		return
	if _flash_t > 0.0:
		_flash_t -= delta
		if _flash_t <= 0.0:
			_flash.visible = false
			_flash_light.visible = false
	if not active:
		return
	if path.size() >= 2 and _path_len > 1.0 and speed > 0.0:
		_move(delta)
	if kind == "aa" or kind == "ship":
		_ai(delta)

func _battle():
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return null
	return b

func _ai(dt: float) -> void:
	var b = _battle()
	if b == null:
		return
	_scan_t -= dt
	if _scan_t <= 0.0:
		_scan_t = _rng.randf_range(0.35, 0.6)
		target = _find_target(b)
	if target != null and not _target_ok(target):
		target = null
	if target == null:
		_burst = 0.0
		_pause = maxf(_pause - dt, 0.0)
		return
	var origin := _aim_origin()
	var tp: Vector3 = target.global_position
	var tv := Vector3.ZERO
	if target.has_method("velocity"):
		tv = target.velocity()
	var dist := origin.distance_to(tp)
	var t := _intercept(origin, tp, tv, BULLET_SPEED)
	var aim := tp + tv * t + Vector3(0.0, 0.5 * GRAVITY * t * t, 0.0)
	var aligned := _turn_to(aim, dt)
	if _burst > 0.0:
		_burst -= dt
		_err *= exp(-0.9 * dt)
		if aligned and dist < AA_RANGE:
			_shot_t -= dt
			while _shot_t <= 0.0:
				_shot_t += SHOT_INTERVAL
				_fire_bullet(aim)
		if _burst <= 0.0:
			_pause = _rng.randf_range(0.9, 2.2)
			_new_error(dist, tv.length())
	else:
		_pause -= dt
		if _pause <= 0.0 and aligned and dist < AA_RANGE:
			_burst = _rng.randf_range(0.6, 1.2)
			_shot_t = 0.0
			if _err == Vector2.ZERO:
				_new_error(dist, tv.length())
	if heavy:
		_flak_t -= dt
		if _flak_t <= 0.0 and aligned and dist > 250.0 and dist < fire_range:
			_flak_t = _rng.randf_range(1.5, 2.6)
			_fire_flak(tp, tv)

func _target_ok(t) -> bool:
	if not is_instance_valid(t):
		return false
	if "alive" in t and not bool(t.alive):
		return false
	if "in_cloud" in t and bool(t.in_cloud):
		return false
	return global_position.distance_to(t.global_position) <= fire_range * 1.05

func _find_target(b):
	var list = b.enemies_of(team) if b.has_method("enemies_of") else []
	var best = null
	var best_d := fire_range
	var me := global_position + Vector3(0, _height, 0)
	for ac in list:
		if ac == null or not is_instance_valid(ac):
			continue
		if "alive" in ac and not bool(ac.alive):
			continue
		if "in_cloud" in ac and bool(ac.in_cloud):
			continue
		var d := me.distance_to(ac.global_position)
		if d < best_d and _line_of_sight(me, ac.global_position):
			best = ac
			best_d = d
	return best

func _line_of_sight(a: Vector3, b: Vector3) -> bool:
	if world == null:
		return true
	for i in range(1, 8):
		var p := a.lerp(b, i / 8.0)
		if world.height_at(p.x, p.z) > p.y + 3.0:
			return false
	return true

## Время встречи снаряда и цели (без учёта тяжести).
static func _intercept(from: Vector3, tp: Vector3, tv: Vector3, s: float) -> float:
	var d := tp - from
	var a := tv.dot(tv) - s * s
	var bq := 2.0 * d.dot(tv)
	var c := d.dot(d)
	if absf(a) < 0.001:
		return d.length() / s
	var disc := bq * bq - 4.0 * a * c
	if disc < 0.0:
		return d.length() / s
	var sq := sqrt(disc)
	var t1 := (-bq - sq) / (2.0 * a)
	var t2 := (-bq + sq) / (2.0 * a)
	var t := INF
	if t1 > 0.0:
		t = t1
	if t2 > 0.0 and t2 < t:
		t = t2
	if t == INF:
		return d.length() / s
	return t

func _aim_origin() -> Vector3:
	if gun != null and gun.is_inside_tree():
		return gun.global_position
	return global_position + Vector3(0, _height * 0.6, 0)

## Поворачивает башню к точке; true, если ствол наведён (с точностью ~3°).
func _turn_to(aim: Vector3, dt: float) -> bool:
	if turret == null:
		return true
	var local := global_transform.basis.inverse() * (aim - turret.global_position)
	var want_yaw := atan2(-local.x, -local.z)
	var flat := Vector2(local.x, local.z).length()
	var want_pitch := clampf(atan2(local.y, flat), -0.05, 1.45)
	var yaw_rate := deg_to_rad(28.0 if kind == "ship" else 85.0)
	var pitch_rate := deg_to_rad(60.0)
	var dy := wrapf(want_yaw - _yaw, -PI, PI)
	_yaw += clampf(dy, -yaw_rate * dt, yaw_rate * dt)
	var dp := want_pitch - _pitch
	_pitch += clampf(dp, -pitch_rate * dt, pitch_rate * dt)
	turret.rotation.y = _yaw
	gun.rotation.x = _pitch
	if _aft != null:
		_aft.rotation.y = _yaw
	if kind == "ship":
		return true   # бортовые автоматы наводятся сами
	return absf(wrapf(want_yaw - _yaw, -PI, PI)) < 0.05 and absf(want_pitch - _pitch) < 0.05

func _new_error(dist: float, tspeed: float) -> void:
	var sigma := deg_to_rad(lerpf(1.1, 0.35, skill)) * (1.0 + tspeed / 250.0) * clampf(dist / 1200.0, 0.6, 1.4)
	_err = Vector2(_rng.randfn(0.0, sigma), _rng.randfn(0.0, sigma))

func _spread_dir(dir: Vector3, extra: float) -> Vector3:
	var right := dir.cross(Vector3.UP)
	if right.length() < 0.01:
		right = Vector3.RIGHT
	right = right.normalized()
	var up := right.cross(dir).normalized()
	var ex := _err.x + _rng.randfn(0.0, extra)
	var ey := _err.y + _rng.randfn(0.0, extra)
	return (dir + right * ex + up * ey).normalized()

func _fire_bullet(aim: Vector3) -> void:
	var b = _battle()
	if b == null:
		return
	var pm = b.get("projectiles")
	if pm == null:
		return
	var from := _next_muzzle()
	var dir := (aim - from).normalized()
	dir = _spread_dir(dir, deg_to_rad(0.25))
	pm.spawn_bullet(from, dir * BULLET_SPEED, BULLET_DAMAGE, BULLET_CALIBER, uid, team, true)
	shots_fired += 1
	_show_flash(from)
	if shots_fired % 4 == 0:
		Sfx.play("cannon", from, -10.0, _rng.randf_range(0.9, 1.1))

func _fire_flak(tp: Vector3, tv: Vector3) -> void:
	var b = _battle()
	if b == null:
		return
	var pm = b.get("projectiles")
	if pm == null:
		return
	var from: Vector3
	if not _muzzles.is_empty() and (_muzzles[0] as Node3D).is_inside_tree():
		from = (_muzzles[0] as Node3D).global_position
	else:
		from = global_position + Vector3(0, _height, 0)
	var t := _intercept(from, tp, tv, FLAK_SPEED)
	var aim := tp + tv * t + Vector3(0.0, 0.5 * GRAVITY * t * t, 0.0)
	var dir := (aim - from).normalized()
	var sigma := deg_to_rad(lerpf(1.6, 0.7, skill))
	dir = (dir + Vector3(_rng.randfn(0.0, sigma), _rng.randfn(0.0, sigma), _rng.randfn(0.0, sigma))).normalized()
	var fuse := t * _rng.randf_range(0.93, 1.07)
	pm.spawn_flak(from, dir * FLAK_SPEED, fuse, FLAK_DAMAGE, FLAK_RADIUS, uid, team)
	flak_fired += 1
	_show_flash(from)
	Sfx.play("flak", from, -6.0, _rng.randf_range(0.9, 1.05))

func _next_muzzle() -> Vector3:
	var list: Array = _side_muzzles if not _side_muzzles.is_empty() else _muzzles
	if list.is_empty() or not (list[0] as Node3D).is_inside_tree():
		return global_position + Vector3(0, _height, 0)
	_muzzle_i = (_muzzle_i + 1) % list.size()
	return (list[_muzzle_i] as Node3D).global_position

func _show_flash(at: Vector3) -> void:
	if _flash == null:
		return
	_flash_t = 0.045
	_flash.visible = true
	_flash.global_position = at
	var s := _rng.randf_range(0.7, 1.3) * (1.6 if heavy else 1.0)
	_flash.scale = Vector3(s, s, s)
	_flash_light.visible = true
	_flash_light.global_position = at
	_flash_light.light_energy = _rng.randf_range(2.0, 3.5) * (2.0 if _night() else 1.0)

# ---------------------------------------------------------------- урон

func take_damage(amount: float, attacker_uid: int, explosive: bool) -> void:
	if not alive or invulnerable or amount <= 0.0:
		return
	hp -= amount
	if hp <= 0.0:
		kill(attacker_uid)

## Уничтожить. emit=false и with_fx=false — для повтора.
func kill(attacker_uid: int = -1, emit := true, with_fx := true) -> void:
	if not alive or invulnerable:
		return
	alive = false
	hp = 0.0
	target = null
	_burst = 0.0
	if _flash != null:
		_flash.visible = false
		_flash_light.visible = false
	if _wake != null:
		_wake.visible = false
	var fx = null
	var b = _battle()
	if b != null and with_fx:
		fx = b.get("fx")
	var center := global_position + Vector3(0, _height * 0.4, 0) if is_inside_tree() else position
	if fx != null and is_instance_valid(fx):
		var size := 1.2
		match kind:
			"truck", "aa":
				size = 0.9
			"ship":
				size = 2.6
			"building":
				size = 3.0 if variant == "fuel" else 2.0
		fx.explosion(center, size)
		if fx.has_method("debris"):
			fx.debris(center, Vector3(0, 10, 0), 10 if kind == "building" else 6)
		if is_inside_tree():
			_smoke = fx.attach_smoke(self, Vector3(0, _height * 0.6, 0), true)
			if variant == "fuel" or kind == "ship" or kind == "tank":
				_fire = fx.attach_fire(self, Vector3(0, _height * 0.4, 0))
	_make_wreck()
	_wreck_t = 0.0
	if emit:
		destroyed.emit(self, attacker_uid)

func _make_wreck() -> void:
	var black := Mat.vcolor(Color(0.33, 0.30, 0.28), 1.0)
	for mi in _meshes:
		if is_instance_valid(mi) and (mi as MeshInstance3D).material_override is StandardMaterial3D:
			(mi as MeshInstance3D).material_override = black
	match kind:
		"tank":
			if turret != null:
				turret.position += Vector3(_rng.randf_range(-0.6, 0.6), 0.5, _rng.randf_range(-0.8, 0.8))
				turret.rotation = Vector3(_rng.randf_range(-0.35, 0.35), turret.rotation.y + _rng.randf_range(-0.8, 0.8), _rng.randf_range(-0.35, 0.35))
			if gun != null:
				gun.rotation.x = -0.12
		"aa":
			if gun != null:
				gun.rotation.x = -0.1
			if turret != null:
				turret.rotation.z = _rng.randf_range(-0.3, 0.3)
		"truck":
			model.rotation.z = _rng.randf_range(-0.15, 0.15)
		"building":
			model.scale = Vector3(1.0, 0.4 if variant != "bunker" else 0.75, 1.0)
			model.rotation = Vector3(_rng.randf_range(-0.05, 0.05), 0.0, _rng.randf_range(-0.05, 0.05))

func _wreck_step(dt: float) -> void:
	_wreck_t += dt
	if _wreck_t > SMOKE_TIME:
		if _smoke != null and is_instance_valid(_smoke):
			_smoke.queue_free()
		_smoke = null
		if _fire != null and is_instance_valid(_fire):
			_fire.queue_free()
		_fire = null
	if kind == "ship" and model.visible:
		# тонет: крен и погружение
		position.y -= dt * 0.35
		model.rotation.z = minf(model.rotation.z + dt * 0.01, 0.35)
		model.rotation.x = minf(model.rotation.x + dt * 0.004, 0.12)
		if position.y < -18.0:
			model.visible = false

## Для отладки и тестов: сколько стволов и есть ли башня.
func muzzle_count() -> int:
	return _muzzles.size() + _side_muzzles.size()
