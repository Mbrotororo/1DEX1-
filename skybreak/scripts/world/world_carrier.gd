extends RefCounted
## Авианосец синих на карте «Дальний риф». Нос на -Z, начало координат — центр палубы.

const MeshB = preload("res://scripts/world/world_mesh.gd")
const Mat = preload("res://scripts/world/world_materials.gd")

const LENGTH := 300.0
const WIDTH := 38.0
const DECK_HEIGHT := 20.0
const ISLAND_HEIGHT := 24.0
const STERN_Z := 148.0

## Контур палубы (x, z) в локальных координатах.
static func deck_outline() -> PackedVector2Array:
	return PackedVector2Array([Vector2(-18, 148), Vector2(18, 148), Vector2(19, 100), Vector2(19, -90),
		Vector2(15, -130), Vector2(7, -150), Vector2(-7, -150), Vector2(-15, -130), Vector2(-19, -90), Vector2(-19, 100)])

## Надстройка («остров») по правому борту.
static func island_rect() -> Rect2:
	return Rect2(Vector2(12.5, -37.0), Vector2(6.5, 50.0))

## Места зениток на спонсонах (локально, y — от палубы).
static func gun_spots() -> Array:
	return [Vector3(-22.0, -1.6, 112.0), Vector3(-22.0, -1.6, -92.0), Vector3(22.5, -1.6, 62.0)]

static func build_model(night: bool) -> Dictionary:
	var hull := Color(0.38, 0.41, 0.43)
	var o := deck_outline()
	var b := MeshB.new()
	var mid := PackedVector2Array()
	var low := PackedVector2Array()
	for p in o:
		mid.append(Vector2(p.x * 0.86, p.y * 0.985))
		low.append(Vector2(p.x * 0.68, p.y * 0.95))
	for i in o.size():
		var j := (i + 1) % o.size()
		var out := Vector3((o[i].x + o[j].x) * 0.5, 0.0, (o[i].y + o[j].y) * 0.5)
		var a0 := Vector3(o[i].x, 0.0, o[i].y)
		var b0 := Vector3(o[j].x, 0.0, o[j].y)
		var a1 := Vector3(o[i].x, -1.4, o[i].y)
		var b1 := Vector3(o[j].x, -1.4, o[j].y)
		var a2 := Vector3(mid[i].x, -DECK_HEIGHT + 0.6, mid[i].y)
		var b2 := Vector3(mid[j].x, -DECK_HEIGHT + 0.6, mid[j].y)
		var a3 := Vector3(low[i].x, -DECK_HEIGHT - 7.0, low[i].y)
		var b3 := Vector3(low[j].x, -DECK_HEIGHT - 7.0, low[j].y)
		b.quad(a0, b0, b1, a1, hull.darkened(0.25), out)
		b.quad(a1, b1, b2, a2, hull, out)
		b.quad(a2, b2, b3, a3, Color(0.36, 0.15, 0.12), out)
	# остров
	var isl := island_rect()
	var ic := Vector3(isl.position.x + isl.size.x * 0.5, 0.0, isl.position.y + isl.size.y * 0.5)
	b.box(ic + Vector3(0, 7.0, 0), Vector3(isl.size.x, 14.0, isl.size.y), hull.lightened(0.06))
	b.box(ic + Vector3(0, 16.0, -8.0), Vector3(isl.size.x + 0.8, 4.0, 22.0), hull.lightened(0.1))
	b.box(ic + Vector3(0, 18.4, -8.0), Vector3(isl.size.x + 1.0, 0.8, 23.0), hull.darkened(0.1))
	b.box(ic + Vector3(0, 21.0, 8.0), Vector3(5.0, 6.0, 11.0), hull.darkened(0.05))
	b.box(ic + Vector3(0, 24.2, 8.0), Vector3(5.2, 0.6, 11.2), Color(0.12, 0.12, 0.12))
	b.box(ic + Vector3(0, 27.0, -10.0), Vector3(0.5, 16.0, 0.5), Color(0.2, 0.2, 0.2))
	b.box(ic + Vector3(0, 31.0, -10.0), Vector3(6.0, 0.4, 0.4), Color(0.2, 0.2, 0.2))
	b.box(ic + Vector3(0, 26.0, -10.0), Vector3(3.0, 1.6, 0.3), Color(0.25, 0.27, 0.28))
	b.box(ic + Vector3(-2.0, 29.2, -10.0), Vector3(0.08, 2.0, 0.08), Color(0.2, 0.2, 0.2))
	b.box(ic + Vector3(-3.2, 29.6, -10.0), Vector3(2.4, 1.5, 0.06), Color(0.16, 0.42, 0.95))
	# номер на острове
	b.box(ic + Vector3(-isl.size.x * 0.5 - 0.05, 9.0, 2.0), Vector3(0.1, 4.0, 2.2), Color(0.85, 0.85, 0.82))
	b.box(ic + Vector3(-isl.size.x * 0.5 - 0.05, 9.0, 5.5), Vector3(0.1, 4.0, 2.2), Color(0.85, 0.85, 0.82))
	# спонсоны
	for s in gun_spots():
		var sp: Vector3 = s
		b.box(Vector3(sp.x, -2.2, sp.z), Vector3(7.5, 1.2, 8.0), hull.darkened(0.1))
		b.frustum(Vector3(sp.x, -6.0, sp.z), Vector2(2.0, 4.0), Vector2(7.0, 8.0), 3.2, hull.darkened(0.15))
	# окна
	var glass := MeshB.new()
	glass.box(ic + Vector3(-isl.size.x * 0.5 - 0.45, 16.3, -8.0), Vector3(0.1, 1.4, 20.0), Color.WHITE)
	glass.box(ic + Vector3(isl.size.x * 0.5 + 0.45, 16.3, -8.0), Vector3(0.1, 1.4, 20.0), Color.WHITE)
	# палуба с разметкой (шейдер полосы, тип 1)
	var deck := MeshB.new()
	var kind := Color(1, 0, 0)
	for i in o.size():
		var j := (i + 1) % o.size()
		var pa := Vector3(o[i].x, 0.0, o[i].y)
		var pb := Vector3(o[j].x, 0.0, o[j].y)
		deck.tri_uv(Vector3(0, 0, 0), pa, pb, kind, Vector2(0, STERN_Z), Vector2(o[i].x, STERN_Z - o[i].y),
			Vector2(o[j].x, STERN_Z - o[j].y), Vector3.UP)
	return {"body": b.commit(Mat.vcolor(Color(1, 1, 1), 0.7)),
		"deck": deck.commit(),
		"glass": glass.commit(Mat.glow(Color(1.0, 0.85, 0.55), 2.0) if night else Mat.vcolor(Color(0.25, 0.33, 0.40), 0.2)),
		"lights": _lights(night)}

static func _lights(night: bool) -> MultiMeshInstance3D:
	var items: Array = []
	var z := 140.0
	while z > -125.0:
		var c := Color(1.0, 0.9, 0.7)
		if z > 120.0:
			c = Color(0.3, 1.0, 0.45)
		elif z < -100.0:
			c = Color(1.0, 0.3, 0.2)
		items.append([Vector3(-18.6, 0.3, z), c])
		if z > 15.0 or z < -40.0:
			items.append([Vector3(18.6, 0.3, z), c])
		z -= 20.0
	var x := -12.0
	while x <= 12.0:
		items.append([Vector3(x, 0.3, 146.0), Color(0.3, 1.0, 0.45)])
		x += 4.0
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var sm := SphereMesh.new()
	sm.radius = 0.35
	sm.height = 0.7
	sm.radial_segments = 6
	sm.rings = 3
	mm.mesh = sm
	mm.instance_count = items.size()
	for i in items.size():
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, items[i][0]))
		mm.set_instance_color(i, items[i][1])
	var mmi := MultiMeshInstance3D.new()
	mmi.name = "DeckLights"
	mmi.multimesh = mm
	var mat: ShaderMaterial = Mat.lights_material(4.0 if night else 1.2)
	mat.set_shader_parameter("grow", 0.004 if night else 0.0007)
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return mmi
