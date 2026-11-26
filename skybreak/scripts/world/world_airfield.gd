extends RefCounted
## Аэродром: полоса с разметкой, рулёжка, стоянка, ангары, вышка, огни.
## Локальные оси: u — вдоль полосы (вперёд от начала), v — вправо.

const MeshB = preload("res://scripts/world/world_mesh.gd")
const Mat = preload("res://scripts/world/world_materials.gd")

const TAXI_OFFSET := 150.0
const TAXI_WIDTH := 22.0
const APRON_OFFSET := Vector2(220.0, 0.0)   # x — поперёк, y — вдоль
const APRON_SIZE := Vector2(110.0, 380.0)   # x — поперёк, y — вдоль

const TEAM_COLORS := [Color(0.18, 0.42, 0.92), Color(0.88, 0.18, 0.14)]

static func build(world, af: Dictionary, night: bool) -> Node3D:
	var root := Node3D.new()
	root.name = "Airfield%d" % int(af.team)
	var hd: float = af.heading
	var c: Vector3 = af.pos
	var h: float = c.y
	var basis := Basis(Vector3.UP, -hd)
	# локальная система: x = v (вправо), z = -u (вперёд = -Z)
	root.transform = Transform3D(basis, Vector3(c.x, h, c.z))
	var length: float = af.length
	var width: float = af.width

	# ---- покрытие (шейдер разметки)
	var pave := MeshB.new()
	var hl := length * 0.5
	var hw := width * 0.5
	# полоса: UV.x — метры поперёк, UV.y — метры от начала
	_strip(pave, -hl, hl, -hw, hw, 0.06, Color(0, 0, 0), Vector2(-hw, 0.0), Vector2(hw, length))
	# рулёжка вдоль
	var tw := TAXI_WIDTH * 0.5
	_strip(pave, -hl + 40.0 - tw, hl - 40.0 + tw, TAXI_OFFSET - tw, TAXI_OFFSET + tw, 0.04, Color(0.5, 0, 0),
		Vector2(-tw, 0.0), Vector2(tw, length - 80.0 + TAXI_WIDTH))
	# соединения с полосой
	for k in [-1.0, 1.0]:
		var u0: float = k * (hl - 40.0)
		_strip_across(pave, u0, hw, TAXI_OFFSET - tw, tw, 0.04)
	# стоянка
	var ah := APRON_SIZE * 0.5
	_strip(pave, APRON_OFFSET.y - ah.y, APRON_OFFSET.y + ah.y, APRON_OFFSET.x - ah.x, APRON_OFFSET.x + ah.x, 0.035,
		Color(0.5, 0, 0), Vector2(20.0, 0.0), Vector2(20.0, APRON_SIZE.y))
	var pave_mi := MeshInstance3D.new()
	pave_mi.name = "Runway"
	pave_mi.mesh = pave.commit()
	pave_mi.material_override = Mat.runway_material()
	pave_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(pave_mi)

	# ---- постройки
	var b := MeshB.new()
	var glass := MeshB.new()
	var team: int = af.team
	var roof := Color(0.42, 0.45, 0.42) if team == 0 else Color(0.48, 0.44, 0.38)
	for i in 3:
		var u := -140.0 + i * 140.0
		var vpos := APRON_OFFSET.x + ah.x + 26.0
		_hangar(b, Vector3(vpos, 0.0, -u), roof)
	# вышка
	var tower := Vector3(APRON_OFFSET.x - 10.0, 0.0, -(APRON_OFFSET.y + ah.y + 60.0))
	b.box(tower + Vector3(0, 8, 0), Vector3(7, 16, 7), Color(0.78, 0.76, 0.70))
	b.box(tower + Vector3(0, 16.3, 0), Vector3(11, 0.6, 11), Color(0.55, 0.55, 0.52))
	glass.box(tower + Vector3(0, 18.4, 0), Vector3(9.5, 3.6, 9.5), Color(0.9, 0.9, 0.9))
	b.box(tower + Vector3(0, 20.5, 0), Vector3(11, 0.7, 11), Color(0.35, 0.35, 0.34))
	b.box(tower + Vector3(0, 23.5, 0), Vector3(0.3, 6, 0.3), Color(0.25, 0.25, 0.25))
	# флаг команды
	b.box(tower + Vector3(1.6, 25.6, 0), Vector3(3.0, 1.8, 0.1), TEAM_COLORS[team])
	# домики у вышки
	b.box(tower + Vector3(-22, 3, 4), Vector3(18, 6, 10), Color(0.70, 0.68, 0.62), Basis.IDENTITY, Color(0.45, 0.30, 0.25))
	glass.box(tower + Vector3(-22, 3.4, -1.05), Vector3(14, 1.4, 0.1), Color(0.9, 0.9, 0.9))
	b.box(tower + Vector3(22, 2.5, 6), Vector3(12, 5, 12), Color(0.66, 0.66, 0.62), Basis.IDENTITY, Color(0.40, 0.40, 0.38))
	# цистерны
	for k in 2:
		b.cylinder(tower + Vector3(34 + k * 9, 0, -20), 3.6, 7.0, 10, Color(0.80, 0.80, 0.76))
	# ветроуказатель
	var ws := Vector3(-hw - 40.0, 0.0, -(-hl + 300.0))
	b.box(ws + Vector3(0, 4, 0), Vector3(0.25, 8, 0.25), Color(0.85, 0.85, 0.85))
	b.cone(ws + Vector3(0, 7.6, 0), 0.7, 4.0, 8, Color(1.0, 0.45, 0.1), Basis(Vector3.FORWARD, -PI * 0.5))
	var bmi := MeshInstance3D.new()
	bmi.name = "Buildings"
	bmi.mesh = b.commit(Mat.vcolor())
	root.add_child(bmi)
	var gmi := MeshInstance3D.new()
	gmi.name = "Windows"
	gmi.mesh = glass.commit(Mat.glow(Color(1.0, 0.82, 0.5), 2.2) if night else Mat.vcolor(Color(0.28, 0.38, 0.45), 0.2))
	gmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(gmi)

	# ---- огни
	root.add_child(_lights(world, af, length, width, night))
	return root

## Прямоугольник покрытия: u0..u1 вдоль, v0..v1 поперёк.
static func _strip(m, u0: float, u1: float, v0: float, v1: float, y: float, kind: Color, uv0: Vector2, uv1: Vector2) -> void:
	var a := Vector3(v0, y, -u0)
	var b := Vector3(v1, y, -u0)
	var c := Vector3(v1, y, -u1)
	var d := Vector3(v0, y, -u1)
	m.quad_uv(a, b, c, d, kind, Vector2(uv0.x, uv0.y), Vector2(uv1.x, uv0.y), Vector2(uv1.x, uv1.y), Vector2(uv0.x, uv1.y), Vector3.UP)

## Поперечная рулёжка от края полосы до продольной рулёжки.
static func _strip_across(m, u0: float, v0: float, v1: float, tw: float, y: float) -> void:
	var a := Vector3(v0, y, -(u0 - tw))
	var b := Vector3(v1, y, -(u0 - tw))
	var c := Vector3(v1, y, -(u0 + tw))
	var d := Vector3(v0, y, -(u0 + tw))
	# осевая идёт поперёк: UV.x — метры от оси соединения
	m.quad_uv(a, b, c, d, Color(0.5, 0, 0), Vector2(-tw, 0.0), Vector2(-tw, v1 - v0), Vector2(tw, v1 - v0), Vector2(tw, 0.0), Vector3.UP)

static func _hangar(b, p: Vector3, roof: Color) -> void:
	# арочный ангар, ворота смотрят на стоянку (-x)
	var r := 18.0
	var depth := 46.0
	var basis := Basis(Vector3.UP, PI * 0.5)
	b.box(p + Vector3(0, 1.5, 0), Vector3(depth, 3.0, r * 2.0 + 0.4), Color(0.58, 0.58, 0.55))
	b.arch(p + Vector3(0, 3.0, 0), r, depth, 12, roof, basis, Color(0.64, 0.64, 0.60))
	# ворота
	b.box(p + Vector3(-depth * 0.5 - 0.15, 7.0, 0), Vector3(0.3, 14.0, r * 1.45), Color(0.24, 0.26, 0.27))
	b.box(p + Vector3(-depth * 0.5 - 0.3, 7.0, 0), Vector3(0.1, 14.0, 0.3), Color(0.5, 0.5, 0.48))

## Основание базы: бетонная площадка, ограда с воротами, ящики.
static func build_base(world, bd: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "Base%d" % int(bd.team)
	var c: Vector2 = bd.center
	var hd: float = bd.heading
	var h: float = world.height_at(c.x, c.y)
	root.transform = Transform3D(Basis(Vector3.UP, -hd), Vector3(c.x, h, c.y))
	var pave := MeshB.new()
	var hs := 92.0
	pave.quad_uv(Vector3(-hs, 0.04, -hs), Vector3(hs, 0.04, -hs), Vector3(hs, 0.04, hs), Vector3(-hs, 0.04, hs),
		Color(0.5, 0, 0), Vector2(20, 0), Vector2(20, 0), Vector2(20, 0), Vector2(20, 0), Vector3.UP)
	# дорога от ворот
	pave.quad_uv(Vector3(-5, 0.03, -hs), Vector3(5, 0.03, -hs), Vector3(5, 0.03, -hs - 160.0), Vector3(-5, 0.03, -hs - 160.0),
		Color(0.5, 0, 0), Vector2(-5, 0), Vector2(5, 0), Vector2(5, 160), Vector2(-5, 160), Vector3.UP)
	var pmi := MeshInstance3D.new()
	pmi.mesh = pave.commit()
	pmi.material_override = Mat.runway_material()
	pmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(pmi)
	var b := MeshB.new()
	var wall := Color(0.60, 0.58, 0.52)
	var post := Color(0.35, 0.35, 0.33)
	var e := hs + 4.0
	for side in 4:
		var bs := Basis(Vector3.UP, side * PI * 0.5)
		var x := -e
		while x < e - 1.0:
			# ворота в середине передней стороны (-z)
			if side == 2 and absf(x + 6.0) < 12.0:
				x += 12.0
				continue
			b.box(bs * Vector3(x + 6.0, 1.1, e), Vector3(11.6, 2.2, 0.6), wall, bs)
			b.box(bs * Vector3(x + 12.0, 1.4, e), Vector3(0.7, 2.8, 0.8), post, bs)
			x += 12.0
	var rng := RandomNumberGenerator.new()
	rng.seed = int(c.x * 7.0 + c.y * 13.0)
	for i in 10:
		var p := Vector3(rng.randf_range(-80, 80), 0.0, rng.randf_range(-80, 80))
		if absf(p.x) < 70.0 and absf(p.z) < 80.0:
			continue
		b.box(p + Vector3(0, 0.8, 0), Vector3(2.4, 1.6, 2.4), Color(0.42, 0.36, 0.26), Basis(Vector3.UP, rng.randf()))
		b.box(p + Vector3(2.6, 0.8, 0.3), Vector3(2.4, 1.6, 2.4), Color(0.38, 0.40, 0.30), Basis(Vector3.UP, rng.randf()))
	var bmi := MeshInstance3D.new()
	bmi.mesh = b.commit(Mat.vcolor())
	root.add_child(bmi)
	return root

static func _lights(world, af: Dictionary, length: float, width: float, night: bool) -> MultiMeshInstance3D:
	var hl := length * 0.5
	var hw := width * 0.5 + 1.5
	var items: Array = []   # [local pos, color]
	var white := Color(1.0, 0.92, 0.75)
	var green := Color(0.3, 1.0, 0.45)
	var red := Color(1.0, 0.25, 0.2)
	var blue := Color(0.35, 0.55, 1.0)
	var u := -hl
	while u <= hl + 0.1:
		items.append([Vector3(-hw, 0.4, -u), white])
		items.append([Vector3(hw, 0.4, -u), white])
		u += 60.0
	var v := -hw
	while v <= hw + 0.1:
		items.append([Vector3(v, 0.4, hl + 2.0), green])
		items.append([Vector3(v, 0.4, -hl - 2.0), red])
		v += 5.0
	# огни подхода перед началом полосы
	var hd: float = af.heading
	var basis := Basis(Vector3.UP, -hd)
	var c: Vector3 = af.pos
	for i in 10:
		var lu := -hl - 30.0 - i * 30.0
		for s in [-1.0, 0.0, 1.0]:
			var lp := Vector3(s * 3.0, 0.0, -lu)
			var wp: Vector3 = c + basis * lp
			lp.y = world.height_at(wp.x, wp.z) - c.y + 1.2
			items.append([lp, white])
	# рулёжка
	u = -hl + 40.0
	while u <= hl - 40.0:
		items.append([Vector3(TAXI_OFFSET - TAXI_WIDTH * 0.5 - 1.0, 0.3, -u), blue])
		items.append([Vector3(TAXI_OFFSET + TAXI_WIDTH * 0.5 + 1.0, 0.3, -u), blue])
		u += 60.0
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var sm := SphereMesh.new()
	sm.radius = 0.6
	sm.height = 1.2
	sm.radial_segments = 6
	sm.rings = 3
	mm.mesh = sm
	mm.instance_count = items.size()
	for i in items.size():
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, items[i][0]))
		mm.set_instance_color(i, items[i][1])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Lights"
	mmi.multimesh = mm
	var mat: ShaderMaterial = Mat.lights_material(4.0 if night else 1.3)
	mat.set_shader_parameter("grow", 0.003 if night else 0.0009)
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi
