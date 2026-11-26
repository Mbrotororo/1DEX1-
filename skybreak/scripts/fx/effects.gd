class_name Effects
extends Node3D
## Взрывы, искры, брызги, дым, огонь, инверсионные следы. Частицы — CPUParticles3D.
## Одноразовые эффекты удаляются сами. Число одновременных систем частиц ограничено.

const MAX_SYSTEMS := 60
const MAX_LIGHTS := 8
const SPARK_POOL := 20
const SPLASH_POOL := 10
const MAX_LINES := 512
const RIBBON_LIFE := 1.4
const RIBBON_STEP := 1.0 / 30.0
const BOOST_SPEED := 110.0

var record_events: bool = true   # писать взрывы в повтор (выключают повтор и киллкам)
var light_level: float = -1.0    # < 0: берётся из Game.battle.world.ambient_light_level()

var _time: float = 0.0
var _dt: float = 1.0 / 60.0
var _quality: float = 1.0
var _inited: bool = false
var _rng := RandomNumberGenerator.new()

var _tex_soft: Texture2D
var _tex_puff: Texture2D
var _quad: QuadMesh
var _chunk_mesh: BoxMesh
var _line_mesh: BoxMesh
var _m_add: StandardMaterial3D      # огонь, искры, вспышки
var _m_smoke: StandardMaterial3D    # дым, вода
var _m_chunk: StandardMaterial3D
var _m_line: StandardMaterial3D
var _m_ribbon: StandardMaterial3D
var _ramps: Dictionary = {}
var _curves: Dictionary = {}

var _oneshots: Array = []    # [holder: Node3D, expire: float, systems: int]
var _active_systems: int = 0
var _lights: Array = []      # [OmniLight3D, t0, dur, energy]
var _light_count: int = 0
var _movers: Array = []      # [Node3D, vel: Vector3, t_end: float]
var _attached: Array = []    # Attached
var _ribbons: Array = []     # Ribbon
var _spark_pool: Array = []
var _spark_next: int = 0
var _splash_pool: Array = []
var _splash_next: int = 0
var _lines: Array = []       # [from, to, color, t0, dur]
var _line_mm: MultiMesh
var _line_mmi: MultiMeshInstance3D
var _line_buf := PackedFloat32Array()


class Attached extends RefCounted:
	var anchor: Node3D
	var holder: Node3D
	var systems: Array = []
	var light: OmniLight3D = null
	var light_energy: float = 0.0
	var last: Vector3
	var width: float = 0.5
	var max_life: float = 3.0
	var emitting: bool = true
	var boost: Array = []          # доп. дым: включается на большой скорости, чтобы след не рвался
	var boost_on: bool = true


class Ribbon extends RefCounted:
	var anchor: Node3D
	var mi: MeshInstance3D
	var mesh: ImmediateMesh
	var points := PackedVector3Array()
	var times := PackedFloat32Array()
	var last_push: float = -1.0
	var width: float = 0.35


func _ready() -> void:
	_init_res()


func _process(delta: float) -> void:
	step(delta)


# ---------------------------------------------------------------- публичное API

func explosion(pos: Vector3, size: float) -> void:
	_init_res()
	size = clampf(size, 0.1, 6.0)
	_record_explosion(pos, size)
	Sfx.play("explosion_big" if size >= 0.9 else "explosion_small", pos)
	if _far(pos, 9000.0):
		return
	var k := pow(size, 0.7)
	var ground := _near_ground(pos, 6.0 * k)
	var n_sys := 5 if ground else 4
	_reserve(n_sys)
	var h := _holder(pos)
	var light := light_level_now()

	var flash := _ps(_m_add, 2, 0.2)
	flash.explosiveness = 1.0
	flash.gravity = Vector3.ZERO
	flash.initial_velocity_min = 0.0
	flash.initial_velocity_max = 0.0
	flash.scale_amount_min = 18.0 * k
	flash.scale_amount_max = 22.0 * k
	flash.color_ramp = _ramp("flash")
	_one_shot(h, flash)

	var fire := _ps(_m_add, 18, 0.9)
	fire.explosiveness = 0.95
	fire.lifetime_randomness = 0.4
	fire.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	fire.emission_sphere_radius = 2.0 * k
	fire.direction = Vector3.UP
	fire.spread = 180.0
	fire.initial_velocity_min = 6.0 * k
	fire.initial_velocity_max = 16.0 * k
	fire.damping_min = 10.0 * k
	fire.damping_max = 18.0 * k
	fire.gravity = Vector3(0, 3.0, 0)
	fire.scale_amount_min = 8.0 * k
	fire.scale_amount_max = 14.0 * k
	fire.scale_amount_curve = _curve("fireball")
	fire.color_ramp = _ramp("fireball")
	_one_shot(h, fire)

	var smoke := _ps(_m_smoke, 18, 4.5)
	smoke.explosiveness = 0.8
	smoke.lifetime_randomness = 0.35
	smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	smoke.emission_sphere_radius = 2.5 * k
	smoke.direction = Vector3.UP
	smoke.spread = 70.0
	smoke.initial_velocity_min = 3.0 * k
	smoke.initial_velocity_max = 8.0 * k
	smoke.damping_min = 2.0 * k
	smoke.damping_max = 3.0 * k
	smoke.gravity = Vector3(0, 2.5, 0)
	smoke.scale_amount_min = 9.0 * k
	smoke.scale_amount_max = 16.0 * k
	smoke.scale_amount_curve = _curve("grow")
	smoke.color_ramp = _smoke_ramp("blast", light)
	smoke.angle_min = 0.0
	smoke.angle_max = 360.0
	_one_shot(h, smoke)

	var sparks := _ps(_m_add, 28, 1.4)
	sparks.explosiveness = 1.0
	sparks.lifetime_randomness = 0.5
	sparks.direction = Vector3.UP
	sparks.spread = 180.0
	sparks.initial_velocity_min = 25.0 * k
	sparks.initial_velocity_max = 60.0 * k
	sparks.damping_min = 4.0
	sparks.damping_max = 8.0
	sparks.gravity = Vector3(0, -9.8, 0)
	sparks.scale_amount_min = 0.6 * sqrt(k)
	sparks.scale_amount_max = 1.2 * sqrt(k)
	sparks.color_ramp = _ramp("spark")
	_one_shot(h, sparks)

	if ground:
		var dirt := _ps(_m_smoke, 16, 2.4)
		dirt.explosiveness = 0.95
		dirt.lifetime_randomness = 0.3
		dirt.direction = Vector3.UP
		dirt.spread = 25.0
		dirt.initial_velocity_min = 14.0 * k
		dirt.initial_velocity_max = 34.0 * k
		dirt.gravity = Vector3(0, -9.8, 0)
		dirt.scale_amount_min = 3.0 * k
		dirt.scale_amount_max = 6.0 * k
		dirt.scale_amount_curve = _curve("grow")
		dirt.color_ramp = _smoke_ramp("dirt", light)
		_one_shot(h, dirt)

	_add_light(h, Vector3.ZERO, Color(1.0, 0.62, 0.3), 8.0, 25.0 * k + 15.0, 0.5)
	_track(h, 5.5, n_sys)


func hit_spark(pos: Vector3) -> void:
	_init_res()
	if _far(pos, 2500.0):
		return
	var p: CPUParticles3D = _spark_pool[_spark_next]
	_spark_next = (_spark_next + 1) % _spark_pool.size()
	p.position = pos
	p.visible = true
	p.restart()


func splash(pos: Vector3, size: float) -> void:
	_init_res()
	size = clampf(size, 0.05, 6.0)
	if _far(pos, 6000.0):
		return
	var at := Vector3(pos.x, maxf(pos.y, 0.0) if pos.y > -3.0 else pos.y, pos.z)
	if size < 0.35:
		var p: CPUParticles3D = _splash_pool[_splash_next]
		_splash_next = (_splash_next + 1) % _splash_pool.size()
		p.position = at
		p.visible = true
		p.restart()
		return
	Sfx.play("splash", at)
	var k := pow(size, 0.7)
	_reserve(2)
	var h := _holder(at)
	var light := light_level_now()
	var col := _ps(_m_smoke, 28, 2.6)
	col.explosiveness = 0.85
	col.lifetime_randomness = 0.3
	col.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	col.emission_sphere_radius = 1.5 * k
	col.direction = Vector3.UP
	col.spread = 10.0
	col.initial_velocity_min = 10.0 * k
	col.initial_velocity_max = 26.0 * k
	col.gravity = Vector3(0, -9.8, 0)
	col.scale_amount_min = 2.0 * k
	col.scale_amount_max = 4.5 * k
	col.scale_amount_curve = _curve("grow")
	col.color_ramp = _smoke_ramp("water", light)
	_one_shot(h, col)
	var mist := _ps(_m_smoke, 14, 3.5)
	mist.explosiveness = 0.9
	mist.direction = Vector3(1, 0, 0)
	mist.spread = 180.0
	mist.flatness = 1.0
	mist.initial_velocity_min = 3.0 * k
	mist.initial_velocity_max = 9.0 * k
	mist.damping_min = 2.0
	mist.damping_max = 3.0
	mist.gravity = Vector3(0, 0.6, 0)
	mist.scale_amount_min = 4.0 * k
	mist.scale_amount_max = 7.0 * k
	mist.scale_amount_curve = _curve("grow")
	mist.color_ramp = _smoke_ramp("mist", light)
	_one_shot(h, mist)
	_track(h, 4.0, 2)


func smoke_puff(pos: Vector3, size: float) -> void:
	_init_res()
	size = clampf(size, 0.1, 6.0)
	if _far(pos, 7000.0):
		return
	var k := size
	_reserve(2)
	var h := _holder(pos)
	var puff := _ps(_m_smoke, 10, 4.5)
	puff.explosiveness = 1.0
	puff.lifetime_randomness = 0.3
	puff.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	puff.emission_sphere_radius = 1.6 * k
	puff.direction = Vector3.UP
	puff.spread = 180.0
	puff.initial_velocity_min = 1.0 * k
	puff.initial_velocity_max = 4.0 * k
	puff.damping_min = 1.5
	puff.damping_max = 2.5
	puff.gravity = Vector3(0, 0.3, 0)
	puff.scale_amount_min = 4.0 * k
	puff.scale_amount_max = 7.0 * k
	puff.scale_amount_curve = _curve("grow")
	puff.angle_max = 360.0
	puff.color_ramp = _smoke_ramp("flak", light_level_now())
	_one_shot(h, puff)
	var flash := _ps(_m_add, 1, 0.14)
	flash.explosiveness = 1.0
	flash.gravity = Vector3.ZERO
	flash.initial_velocity_max = 0.0
	flash.scale_amount_min = 6.0 * k
	flash.scale_amount_max = 6.0 * k
	flash.color_ramp = _ramp("flash")
	_one_shot(h, flash)
	_track(h, 5.0, 2)


func attach_fire(parent: Node3D, local_pos: Vector3) -> Node3D:
	_init_res()
	var a := _new_attached(parent, local_pos, "FxFire")
	var light := light_level_now()
	var fire := _ps(_m_add, 90, 0.7)
	fire.lifetime_randomness = 0.3
	fire.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	fire.direction = Vector3.UP
	fire.spread = 180.0
	fire.initial_velocity_min = 1.0
	fire.initial_velocity_max = 4.0
	fire.gravity = Vector3(0, 4.0, 0)
	fire.scale_amount_min = 1.4
	fire.scale_amount_max = 2.6
	fire.scale_amount_curve = _curve("shrink")
	fire.color_ramp = _ramp("fire")
	fire.sorting_offset = 1.0
	var smoke := _trail_smoke(80, 2.6, 3.0, 5.0, 3.0, _smoke_ramp("fire_smoke", light))
	var boost := _trail_smoke(80, 2.6, 3.0, 5.0, 3.0, _smoke_ramp("fire_smoke", light))
	a.width = 0.7
	a.max_life = 2.8
	a.boost = [boost]
	_finish_attached(a, [smoke, boost, fire])
	if _light_count < MAX_LIGHTS:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.55, 0.2)
		l.omni_range = 18.0
		l.light_energy = 2.5
		l.shadow_enabled = false
		a.holder.add_child(l)
		a.light = l
		a.light_energy = 2.5
		_light_count += 1
	return a.anchor


func attach_smoke(parent: Node3D, local_pos: Vector3, dark: bool) -> Node3D:
	_init_res()
	var a := _new_attached(parent, local_pos, "FxSmoke")
	var ramp := _smoke_ramp("dark" if dark else "light", light_level_now())
	var amount := 150 if dark else 110
	var life := 3.2 if dark else 2.2
	var smin := 4.0 if dark else 3.0
	var smax := 7.0 if dark else 5.0
	var smoke := _trail_smoke(amount, life, smin, smax, 1.5, ramp)
	var boost := _trail_smoke(amount, life, smin, smax, 1.5, ramp)
	a.width = 0.5
	a.max_life = life
	a.boost = [boost]
	_finish_attached(a, [smoke, boost])
	return a.anchor


func _trail_smoke(amount: int, life: float, smin: float, smax: float, rise: float, ramp: Gradient) -> CPUParticles3D:
	var smoke := _ps(_m_smoke, amount, life)
	smoke.lifetime_randomness = 0.3
	smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	smoke.direction = Vector3.UP
	smoke.spread = 180.0
	smoke.initial_velocity_min = 0.5
	smoke.initial_velocity_max = 2.0
	smoke.gravity = Vector3(0, rise, 0)
	smoke.scale_amount_min = smin
	smoke.scale_amount_max = smax
	smoke.scale_amount_curve = _curve("grow")
	smoke.angle_max = 360.0
	smoke.color_ramp = ramp
	return smoke


## Дымный след ракеты, ракеты В-В или ловушки. kind: "rocket" | "missile" | "flare".
func attach_exhaust_trail(parent: Node3D, local_pos: Vector3, kind: String) -> Node3D:
	_init_res()
	var a := _new_attached(parent, local_pos, "FxExhaust")
	var light := light_level_now()
	var systems: Array = []
	var smoke: CPUParticles3D
	match kind:
		"missile":
			smoke = _ps(_m_smoke, 800, 2.6)
			smoke.scale_amount_min = 2.0
			smoke.scale_amount_max = 3.6
		"flare":
			smoke = _ps(_m_smoke, 140, 1.8)
			smoke.scale_amount_min = 1.4
			smoke.scale_amount_max = 3.0
		_:
			smoke = _ps(_m_smoke, 420, 1.4)
			smoke.scale_amount_min = 1.4
			smoke.scale_amount_max = 2.6
	smoke.lifetime_randomness = 0.25
	smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	smoke.direction = Vector3.UP
	smoke.spread = 180.0
	smoke.initial_velocity_min = 0.2
	smoke.initial_velocity_max = 1.2
	smoke.damping_min = 0.5
	smoke.damping_max = 1.0
	smoke.gravity = Vector3(0, 0.6, 0)
	smoke.scale_amount_curve = _curve("trail")
	smoke.angle_max = 360.0
	smoke.color_ramp = _smoke_ramp("exhaust", light)
	systems.append(smoke)
	if kind == "flare":
		var sp := _ps(_m_add, 40, 0.5)
		sp.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		sp.direction = Vector3.UP
		sp.spread = 180.0
		sp.initial_velocity_min = 2.0
		sp.initial_velocity_max = 6.0
		sp.gravity = Vector3(0, -6.0, 0)
		sp.scale_amount_min = 0.4
		sp.scale_amount_max = 0.8
		sp.color_ramp = _ramp("spark")
		systems.append(sp)
	a.width = 0.25
	a.max_life = smoke.lifetime
	_finish_attached(a, systems)
	return a.anchor


func attach_trail(parent: Node3D, local_pos: Vector3) -> Node3D:
	_init_res()
	var anchor := Node3D.new()
	anchor.name = "FxTrail"
	parent.add_child(anchor)
	anchor.position = local_pos
	var r := Ribbon.new()
	r.anchor = anchor
	r.mesh = ImmediateMesh.new()
	r.mi = MeshInstance3D.new()
	r.mi.mesh = r.mesh
	r.mi.top_level = true
	r.mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	r.mi.material_override = _m_ribbon
	r.mi.transform = Transform3D.IDENTITY
	add_child(r.mi)
	_ribbons.append(r)
	return anchor


func debris(pos: Vector3, vel: Vector3, count: int) -> void:
	_init_res()
	count = clampi(count, 1, 40)
	if _far(pos, 6000.0):
		return
	_reserve(2)
	var h := _holder(pos)
	var chunks := CPUParticles3D.new()
	chunks.mesh = _chunk_mesh
	chunks.material_override = _m_chunk
	chunks.amount = count
	chunks.lifetime = 3.0
	chunks.one_shot = true
	chunks.explosiveness = 1.0
	chunks.local_coords = true
	chunks.direction = Vector3.UP
	chunks.spread = 180.0
	chunks.initial_velocity_min = 6.0
	chunks.initial_velocity_max = 22.0
	chunks.gravity = Vector3(0, -9.8, 0)
	chunks.particle_flag_rotate_y = true
	chunks.angular_velocity_min = -420.0
	chunks.angular_velocity_max = 420.0
	chunks.angle_max = 360.0
	chunks.scale_amount_min = 0.6
	chunks.scale_amount_max = 1.7
	chunks.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	h.add_child(chunks)
	chunks.emitting = true
	var sparks := _ps(_m_add, maxi(6, count), 1.6)
	sparks.local_coords = true
	sparks.explosiveness = 1.0
	sparks.lifetime_randomness = 0.5
	sparks.direction = Vector3.UP
	sparks.spread = 180.0
	sparks.initial_velocity_min = 4.0
	sparks.initial_velocity_max = 18.0
	sparks.gravity = Vector3(0, -9.8, 0)
	sparks.scale_amount_min = 0.5
	sparks.scale_amount_max = 1.1
	sparks.color_ramp = _ramp("spark")
	_one_shot(h, sparks)
	_movers.append([h, vel, _time + 3.0])
	_track(h, 3.2, 2)


func tracer_line(from: Vector3, to: Vector3, color: Color) -> void:
	_init_res()
	if _lines.size() >= MAX_LINES:
		_lines.pop_front()
	_lines.append([from, to, color, _time, 0.14])


## Тикает анимации, следы и чистит законченные эффекты. Вызывается из _process.
func step(dt: float) -> void:
	_init_res()
	_time += dt
	_dt = dt
	_step_attached()
	_step_ribbons()
	_step_lights()
	_step_movers(dt)
	_step_lines()
	var i := _oneshots.size() - 1
	while i >= 0:
		var e: Array = _oneshots[i]
		if _time >= float(e[1]):
			_free_entry(e)
			_oneshots.remove_at(i)
		i -= 1


func active_systems() -> int:
	return _active_systems


func light_level_now() -> float:
	if light_level >= 0.0:
		return clampf(light_level, 0.2, 1.0)
	var b = Game.battle
	if b != null and is_instance_valid(b):
		var w = b.get("world")
		if w != null and is_instance_valid(w) and w.has_method("ambient_light_level"):
			return clampf(float(w.ambient_light_level()), 0.25, 1.0)
	return 1.0


func clear() -> void:
	for e in _oneshots:
		_free_entry(e)
	_oneshots.clear()
	for a in _attached:
		if is_instance_valid(a.holder):
			a.holder.queue_free()
		_active_systems -= a.systems.size()
		if a.light != null:
			_light_count -= 1
	_attached.clear()
	for r in _ribbons:
		if is_instance_valid(r.mi):
			r.mi.queue_free()
	_ribbons.clear()
	_lines.clear()
	_movers.clear()
	_lights.clear()
	_active_systems = 0
	_light_count = 0
	if _line_mm != null:
		_line_mm.visible_instance_count = 0


# ---------------------------------------------------------------- внутреннее

func _init_res() -> void:
	if _inited:
		return
	_inited = true
	_rng.randomize()
	if has_node("/root/Profile"):
		var prof = get_node("/root/Profile")
		if prof.has_method("get_setting"):
			match str(prof.get_setting("graphics")):
				"low":
					_quality = 0.5
				"high":
					_quality = 1.25
	_tex_soft = _make_soft_texture()
	_tex_puff = _make_puff_texture()
	_quad = QuadMesh.new()
	_quad.size = Vector2(1, 1)
	_chunk_mesh = BoxMesh.new()
	_chunk_mesh.size = Vector3(0.7, 0.25, 1.0)
	_line_mesh = BoxMesh.new()
	_line_mesh.size = Vector3(1, 1, 1)
	_m_add = _particle_mat(true, _tex_soft)
	_m_smoke = _particle_mat(false, _tex_puff)
	_m_chunk = StandardMaterial3D.new()
	_m_chunk.albedo_color = Color(0.16, 0.16, 0.15)
	_m_chunk.roughness = 0.9
	_m_line = StandardMaterial3D.new()
	_m_line.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_m_line.vertex_color_use_as_albedo = true
	_m_line.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_m_line.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_m_ribbon = StandardMaterial3D.new()
	_m_ribbon.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_m_ribbon.vertex_color_use_as_albedo = true
	_m_ribbon.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_m_ribbon.cull_mode = BaseMaterial3D.CULL_DISABLED
	_m_ribbon.disable_receive_shadows = true
	for i in SPARK_POOL:
		var p := _ps(_m_add, 10, 0.35)
		p.one_shot = true
		p.emitting = false
		p.explosiveness = 1.0
		p.lifetime_randomness = 0.4
		p.direction = Vector3.UP
		p.spread = 180.0
		p.initial_velocity_min = 8.0
		p.initial_velocity_max = 26.0
		p.gravity = Vector3(0, -9.8, 0)
		p.scale_amount_min = 0.25
		p.scale_amount_max = 0.55
		p.color_ramp = _ramp("spark")
		p.visible = false
		p.top_level = true
		add_child(p)
		_spark_pool.append(p)
	for i in SPLASH_POOL:
		var s := _ps(_m_smoke, 10, 1.3)
		s.one_shot = true
		s.emitting = false
		s.explosiveness = 0.9
		s.direction = Vector3.UP
		s.spread = 12.0
		s.initial_velocity_min = 4.0
		s.initial_velocity_max = 9.0
		s.gravity = Vector3(0, -9.8, 0)
		s.scale_amount_min = 0.8
		s.scale_amount_max = 1.6
		s.scale_amount_curve = _curve("grow")
		s.color_ramp = _smoke_ramp("water", 1.0)
		s.visible = false
		s.top_level = true
		add_child(s)
		_splash_pool.append(s)
	_line_mm = MultiMesh.new()
	_line_mm.transform_format = MultiMesh.TRANSFORM_3D
	_line_mm.use_colors = true
	_line_mm.mesh = _line_mesh
	_line_mm.instance_count = MAX_LINES
	_line_mm.visible_instance_count = 0
	_line_buf.resize(MAX_LINES * 16)
	_line_mmi = MultiMeshInstance3D.new()
	_line_mmi.multimesh = _line_mm
	_line_mmi.material_override = _m_line
	_line_mmi.top_level = true
	_line_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_line_mmi.custom_aabb = AABB(Vector3(-60000, -2000, -60000), Vector3(120000, 40000, 120000))
	add_child(_line_mmi)


func _particle_mat(additive: bool, tex: Texture2D) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	if additive:
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.vertex_color_use_as_albedo = true
	m.albedo_texture = tex
	m.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	m.billboard_keep_scale = true
	m.disable_receive_shadows = true
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m


func _make_soft_texture() -> Texture2D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.55), Color(1, 1, 1, 0)])
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 64
	t.height = 64
	return t


func _make_puff_texture() -> Texture2D:
	var size := 64
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var noise := FastNoiseLite.new()
	noise.seed = 7
	noise.frequency = 0.09
	noise.fractal_octaves = 3
	for y in size:
		for x in size:
			var dx := (float(x) + 0.5) / size * 2.0 - 1.0
			var dy := (float(y) + 0.5) / size * 2.0 - 1.0
			var r := sqrt(dx * dx + dy * dy)
			var n := noise.get_noise_2d(x, y) * 0.5 + 0.5
			var edge := clampf(1.0 - r, 0.0, 1.0)
			var a := smoothstep(0.0, 0.45, edge) * (0.6 + 0.4 * n)
			var shade := 0.82 + 0.18 * n
			img.set_pixel(x, y, Color(shade, shade, shade, clampf(a, 0.0, 1.0)))
	return ImageTexture.create_from_image(img)


func _gradient(points: Array) -> Gradient:
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	var cols := PackedColorArray()
	for p in points:
		offs.append(float(p[0]))
		cols.append(p[1])
	g.offsets = offs
	g.colors = cols
	return g


func _ramp(kind: String) -> Gradient:
	if _ramps.has(kind):
		return _ramps[kind]
	var g: Gradient
	match kind:
		"flash":
			g = _gradient([[0.0, Color(1.0, 0.97, 0.85, 1.0)], [0.5, Color(1.0, 0.8, 0.45, 0.7)], [1.0, Color(1.0, 0.5, 0.2, 0.0)]])
		"fireball":
			g = _gradient([[0.0, Color(1.0, 0.95, 0.7, 1.0)], [0.25, Color(1.0, 0.62, 0.18, 0.95)],
				[0.6, Color(0.8, 0.25, 0.06, 0.6)], [1.0, Color(0.25, 0.07, 0.02, 0.0)]])
		"spark":
			g = _gradient([[0.0, Color(1.0, 0.95, 0.7, 1.0)], [0.5, Color(1.0, 0.65, 0.2, 0.9)], [1.0, Color(0.9, 0.3, 0.05, 0.0)]])
		"fire":
			g = _gradient([[0.0, Color(1.0, 0.9, 0.55, 0.9)], [0.35, Color(1.0, 0.5, 0.12, 0.85)],
				[0.75, Color(0.7, 0.18, 0.04, 0.45)], [1.0, Color(0.2, 0.05, 0.02, 0.0)]])
		_:
			g = _gradient([[0.0, Color.WHITE], [1.0, Color(1, 1, 1, 0)]])
	_ramps[kind] = g
	return g


func _smoke_ramp(kind: String, light: float) -> Gradient:
	# ночью дым темнее, но не пропадает совсем
	var lk := snappedf(0.35 + 0.65 * clampf(light, 0.0, 1.0), 0.05)
	var key := kind + str(lk)
	if _ramps.has(key):
		return _ramps[key]
	var pts: Array
	match kind:
		"blast":
			pts = [[0.0, Color(0.2, 0.17, 0.15, 0.0)], [0.12, Color(0.17, 0.15, 0.14, 0.8)], [0.6, Color(0.3, 0.29, 0.28, 0.45)], [1.0, Color(0.38, 0.37, 0.36, 0.0)]]
		"dirt":
			pts = [[0.0, Color(0.42, 0.34, 0.24, 0.9)], [0.6, Color(0.46, 0.4, 0.32, 0.5)], [1.0, Color(0.5, 0.45, 0.38, 0.0)]]
		"water":
			pts = [[0.0, Color(0.95, 0.97, 1.0, 0.9)], [0.6, Color(0.9, 0.93, 0.96, 0.55)], [1.0, Color(0.9, 0.93, 0.96, 0.0)]]
		"mist":
			pts = [[0.0, Color(0.92, 0.95, 0.98, 0.0)], [0.15, Color(0.92, 0.95, 0.98, 0.5)], [1.0, Color(0.92, 0.95, 0.98, 0.0)]]
		"flak":
			pts = [[0.0, Color(0.06, 0.06, 0.06, 0.95)], [0.25, Color(0.1, 0.1, 0.1, 0.8)], [0.7, Color(0.22, 0.22, 0.22, 0.4)], [1.0, Color(0.3, 0.3, 0.3, 0.0)]]
		"fire_smoke":
			pts = [[0.0, Color(0.1, 0.08, 0.07, 0.0)], [0.15, Color(0.1, 0.09, 0.08, 0.75)], [0.6, Color(0.2, 0.19, 0.18, 0.45)], [1.0, Color(0.3, 0.3, 0.3, 0.0)]]
		"dark":
			pts = [[0.0, Color(0.1, 0.1, 0.1, 0.0)], [0.08, Color(0.11, 0.11, 0.11, 0.75)], [0.6, Color(0.2, 0.2, 0.2, 0.4)], [1.0, Color(0.28, 0.28, 0.28, 0.0)]]
		"light":
			pts = [[0.0, Color(0.85, 0.85, 0.85, 0.0)], [0.08, Color(0.82, 0.82, 0.82, 0.55)], [0.6, Color(0.8, 0.8, 0.8, 0.3)], [1.0, Color(0.8, 0.8, 0.8, 0.0)]]
		"exhaust":
			pts = [[0.0, Color(1.0, 0.85, 0.6, 0.9)], [0.04, Color(0.92, 0.92, 0.92, 0.75)], [0.5, Color(0.86, 0.86, 0.86, 0.4)], [1.0, Color(0.85, 0.85, 0.85, 0.0)]]
		_:
			pts = [[0.0, Color(0.5, 0.5, 0.5, 0.7)], [1.0, Color(0.5, 0.5, 0.5, 0.0)]]
	for p in pts:
		var c: Color = p[1]
		# огненная голова следа не темнеет ночью
		if not (kind == "exhaust" and float(p[0]) == 0.0):
			c = Color(c.r * lk, c.g * lk, c.b * lk, c.a)
		p[1] = c
	var g := _gradient(pts)
	_ramps[key] = g
	return g


func _curve(kind: String) -> Curve:
	if _curves.has(kind):
		return _curves[kind]
	var c := Curve.new()
	match kind:
		"fireball":
			c.add_point(Vector2(0.0, 0.5))
			c.add_point(Vector2(0.15, 1.0))
			c.add_point(Vector2(1.0, 0.75))
		"grow":
			c.add_point(Vector2(0.0, 0.45))
			c.add_point(Vector2(0.3, 0.8))
			c.add_point(Vector2(1.0, 1.0))
		"shrink":
			c.add_point(Vector2(0.0, 1.0))
			c.add_point(Vector2(1.0, 0.3))
		"trail":
			c.add_point(Vector2(0.0, 0.45))
			c.add_point(Vector2(0.2, 0.6))
			c.add_point(Vector2(1.0, 1.0))
		_:
			c.add_point(Vector2(0.0, 1.0))
			c.add_point(Vector2(1.0, 1.0))
	_curves[kind] = c
	return c


func _ps(mat: Material, amount: int, lifetime: float) -> CPUParticles3D:
	var p := CPUParticles3D.new()
	p.mesh = _quad
	p.material_override = mat
	p.amount = maxi(1, int(round(float(amount) * _quality)))
	p.lifetime = lifetime
	p.local_coords = false
	p.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return p


func _holder(pos: Vector3) -> Node3D:
	var h := Node3D.new()
	h.top_level = true
	h.transform = Transform3D(Basis.IDENTITY, pos)
	add_child(h)
	return h


func _one_shot(h: Node3D, p: CPUParticles3D) -> void:
	p.one_shot = true
	h.add_child(p)
	p.emitting = true


func _track(h: Node3D, seconds: float, systems: int) -> void:
	_oneshots.append([h, _time + seconds, systems])
	_active_systems += systems


func _reserve(n: int) -> void:
	# вытесняем самые старые одноразовые эффекты, если систем слишком много
	while _active_systems + n > MAX_SYSTEMS and not _oneshots.is_empty():
		var e: Array = _oneshots.pop_front()
		_free_entry(e)


func _free_entry(e: Array) -> void:
	_active_systems -= int(e[2])
	var h = e[0]
	if is_instance_valid(h):
		for c in h.get_children():
			if c is OmniLight3D:
				_forget_light(c)
		h.queue_free()


func _add_light(parent: Node3D, local: Vector3, color: Color, energy: float, rng_m: float, dur: float) -> void:
	if _light_count >= MAX_LIGHTS:
		return
	var l := OmniLight3D.new()
	l.light_color = color
	l.light_energy = energy
	l.omni_range = rng_m
	l.shadow_enabled = false
	l.position = local
	parent.add_child(l)
	_light_count += 1
	_lights.append([l, _time, dur, energy])


func _forget_light(l: OmniLight3D) -> void:
	for i in _lights.size():
		if _lights[i][0] == l:
			_lights.remove_at(i)
			_light_count -= 1
			return


func _step_lights() -> void:
	var i := _lights.size() - 1
	while i >= 0:
		var e: Array = _lights[i]
		var l = e[0]
		if not is_instance_valid(l):
			_lights.remove_at(i)
			_light_count -= 1
		else:
			var t := (_time - float(e[1])) / float(e[2])
			if t >= 1.0:
				l.visible = false
				_lights.remove_at(i)
				_light_count -= 1
				l.queue_free()
			else:
				l.light_energy = float(e[3]) * (1.0 - t) * (1.0 - t)
		i -= 1


func _step_movers(dt: float) -> void:
	var i := _movers.size() - 1
	while i >= 0:
		var m: Array = _movers[i]
		var h = m[0]
		if not is_instance_valid(h) or _time > float(m[2]):
			_movers.remove_at(i)
		else:
			var v: Vector3 = m[1]
			h.position += v * dt
			m[1] = v * exp(-0.8 * dt)
		i -= 1


func _new_attached(parent: Node3D, local_pos: Vector3, name_hint: String) -> Attached:
	var a := Attached.new()
	var anchor := Node3D.new()
	anchor.name = name_hint
	parent.add_child(anchor)
	anchor.position = local_pos
	a.anchor = anchor
	a.holder = Node3D.new()
	a.holder.top_level = true
	add_child(a.holder)
	a.last = anchor.global_position if anchor.is_inside_tree() else local_pos
	a.holder.transform = Transform3D(Basis.IDENTITY, a.last)
	return a


func _finish_attached(a: Attached, systems: Array) -> void:
	_reserve(systems.size())
	for p in systems:
		var ps: CPUParticles3D = p
		ps.emission_box_extents = Vector3(a.width, a.width, a.width)
		a.holder.add_child(ps)
		ps.emitting = true
	a.systems = systems
	_active_systems += systems.size()
	_attached.append(a)


func _step_attached() -> void:
	var i := _attached.size() - 1
	while i >= 0:
		var a: Attached = _attached[i]
		var ok := is_instance_valid(a.anchor) and a.anchor.is_inside_tree() and not a.anchor.is_queued_for_deletion()
		if not ok or not is_instance_valid(a.holder):
			_release_attached(a)
			_attached.remove_at(i)
			i -= 1
			continue
		var cur: Vector3 = a.anchor.global_position
		var seg := cur - a.last
		var seg_len := seg.length()
		if seg_len > 400.0:
			seg = Vector3.ZERO
			seg_len = 0.0
			a.last = cur
		var mid := (cur + a.last) * 0.5
		var b := Basis.IDENTITY
		if seg_len > 0.05:
			var d := seg / seg_len
			b = Basis.looking_at(d, Vector3.UP if absf(d.y) < 0.98 else Vector3.RIGHT)
		a.holder.transform = Transform3D(b, mid)
		var ext := Vector3(a.width, a.width, maxf(a.width, seg_len * 0.5))
		for p in a.systems:
			(p as CPUParticles3D).emission_box_extents = ext
		var vis := a.anchor.is_visible_in_tree()
		var fast := seg_len / maxf(_dt, 0.001) > BOOST_SPEED
		if vis != a.emitting or (vis and fast != a.boost_on):
			a.emitting = vis
			a.boost_on = fast
			for p in a.systems:
				(p as CPUParticles3D).emitting = vis and (fast or not a.boost.has(p))
		if a.light != null:
			a.light.visible = vis
			a.light.light_energy = a.light_energy * _rng.randf_range(0.7, 1.25)
		a.last = cur
		i -= 1


func _release_attached(a: Attached) -> void:
	# частицы догорают на месте, потом узел удаляется
	if not is_instance_valid(a.holder):
		_active_systems -= a.systems.size()
		if a.light != null:
			_light_count -= 1
		return
	for p in a.systems:
		if is_instance_valid(p):
			(p as CPUParticles3D).emitting = false
	if a.light != null and is_instance_valid(a.light):
		a.light.queue_free()
		_light_count -= 1
	a.light = null
	_oneshots.append([a.holder, _time + a.max_life + 0.3, a.systems.size()])


func _step_ribbons() -> void:
	var cam := _camera()
	var i := _ribbons.size() - 1
	while i >= 0:
		var r: Ribbon = _ribbons[i]
		var alive := is_instance_valid(r.anchor) and r.anchor.is_inside_tree() and not r.anchor.is_queued_for_deletion()
		if alive and r.anchor.is_visible_in_tree():
			var p := r.anchor.global_position
			var n := r.points.size()
			if n > 0 and p.distance_to(r.points[n - 1]) > 400.0:
				r.points.clear()
				r.times.clear()
				n = 0
			if n < 2 or _time - r.last_push >= RIBBON_STEP:
				r.points.append(p)
				r.times.append(_time)
				r.last_push = _time
			else:
				r.points[n - 1] = p
				r.times[n - 1] = _time
		var drop := 0
		while drop < r.times.size() and _time - r.times[drop] > RIBBON_LIFE:
			drop += 1
		if drop > 0:
			r.points = r.points.slice(drop)
			r.times = r.times.slice(drop)
		if not alive and r.points.size() < 2:
			if is_instance_valid(r.mi):
				r.mi.queue_free()
			_ribbons.remove_at(i)
		else:
			_build_ribbon(r, cam)
		i -= 1


func _build_ribbon(r: Ribbon, cam: Camera3D) -> void:
	r.mesh.clear_surfaces()
	var n := r.points.size()
	if n < 2:
		return
	var cam_pos := cam.global_position if cam != null else r.points[n - 1] + Vector3(0, 200, 0)
	var light := 0.35 + 0.65 * light_level_now()
	r.mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLE_STRIP)
	for k in n:
		var p := r.points[k]
		var t := r.points[mini(k + 1, n - 1)] - r.points[maxi(k - 1, 0)]
		var age := clampf((_time - r.times[k]) / RIBBON_LIFE, 0.0, 1.0)
		var w := r.width * (1.0 + age * 2.0)
		w = maxf(w, p.distance_to(cam_pos) * 0.0012)
		var side := t.cross(cam_pos - p)
		if side.length_squared() > 1e-8:
			side = side.normalized() * (w * 0.5)
		var alpha := 0.55 * pow(1.0 - age, 1.5)
		if k == n - 1:
			alpha *= 0.3
		var c := Color(0.95 * light, 0.96 * light, 1.0 * light, alpha)
		r.mesh.surface_set_color(c)
		r.mesh.surface_add_vertex(p - side)
		r.mesh.surface_set_color(c)
		r.mesh.surface_add_vertex(p + side)
	r.mesh.surface_end()


func _step_lines() -> void:
	if _line_mm == null:
		return
	var cam := _camera()
	var cam_pos := cam.global_position if cam != null else Vector3(0, 10000, 0)
	var count := 0
	var i := _lines.size() - 1
	while i >= 0:
		var e: Array = _lines[i]
		var t := (_time - float(e[3])) / float(e[4])
		if t >= 1.0:
			_lines.remove_at(i)
			i -= 1
			continue
		var a: Vector3 = e[0]
		var b: Vector3 = e[1]
		var seg := b - a
		var length := seg.length()
		if length < 0.01:
			i -= 1
			continue
		var dir := seg / length
		var mid := (a + b) * 0.5
		var w := maxf(0.15, mid.distance_to(cam_pos) * 0.0016)
		var x := dir.cross(cam_pos - mid)
		if x.length_squared() < 1e-8:
			x = dir.cross(Vector3.UP if absf(dir.y) < 0.98 else Vector3.RIGHT)
		x = x.normalized()
		var y := x.cross(dir)
		var col: Color = e[2]
		_write_xf(_line_buf, count * 16, x * w, y * w, dir * length, mid)
		var o := count * 16 + 12
		_line_buf[o] = col.r
		_line_buf[o + 1] = col.g
		_line_buf[o + 2] = col.b
		_line_buf[o + 3] = col.a * (1.0 - t)
		count += 1
		i -= 1
	if count > 0 or _line_mm.visible_instance_count != 0:
		_line_mm.buffer = _line_buf
		_line_mm.visible_instance_count = count


static func _write_xf(buf: PackedFloat32Array, o: int, bx: Vector3, by: Vector3, bz: Vector3, origin: Vector3) -> void:
	buf[o] = bx.x
	buf[o + 1] = by.x
	buf[o + 2] = bz.x
	buf[o + 3] = origin.x
	buf[o + 4] = bx.y
	buf[o + 5] = by.y
	buf[o + 6] = bz.y
	buf[o + 7] = origin.y
	buf[o + 8] = bx.z
	buf[o + 9] = by.z
	buf[o + 10] = bz.z
	buf[o + 11] = origin.z


func _camera() -> Camera3D:
	if not is_inside_tree():
		return null
	return get_viewport().get_camera_3d()


func _far(pos: Vector3, dist: float) -> bool:
	var cam := _camera()
	if cam == null:
		return false
	return cam.global_position.distance_squared_to(pos) > dist * dist


func _near_ground(pos: Vector3, margin: float) -> bool:
	var h := 0.0
	var b = Game.battle
	if b != null and is_instance_valid(b):
		var w = b.get("world")
		if w != null and is_instance_valid(w) and w.has_method("height_at"):
			h = float(w.height_at(pos.x, pos.z))
	return pos.y - maxf(h, 0.0) < margin and h >= 0.0


func _record_explosion(pos: Vector3, size: float) -> void:
	if not record_events:
		return
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return
	var fx = b.get("fx")
	if fx != null and fx != self:
		return
	var rec = b.get("recorder")
	if rec == null or not is_instance_valid(rec):
		return
	rec.event("explosion", {"pos": [snappedf(pos.x, 0.1), snappedf(pos.y, 0.1), snappedf(pos.z, 0.1)], "size": snappedf(size, 0.01)})
