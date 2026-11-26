extends RefCounted
## Построитель низкополигональных мешей с цветом вершин (плоские нормали).
## Порядок обхода исправляется сам по подсказке «наружу», так что грани всегда смотрят наружу.

var v := PackedVector3Array()
var nrm := PackedVector3Array()
var col := PackedColorArray()
var uvs := PackedVector2Array()
var xform := Transform3D.IDENTITY   # применяется ко всем добавляемым точкам

func clear() -> void:
	v.clear()
	nrm.clear()
	col.clear()
	uvs.clear()

func is_empty() -> bool:
	return v.is_empty()

func tri(a: Vector3, b: Vector3, c: Vector3, color: Color, hint := Vector3.ZERO) -> void:
	a = xform * a
	b = xform * b
	c = xform * c
	var n := (c - a).cross(b - a)
	if hint != Vector3.ZERO and n.dot(xform.basis * hint) < 0.0:
		var t := b
		b = c
		c = t
		n = -n
	n = n.normalized()
	v.append(a)
	v.append(b)
	v.append(c)
	for i in 3:
		nrm.append(n)
		col.append(color)
		uvs.append(Vector2.ZERO)

## a, b, c, d — по кругу. hint — направление наружу (в локальных координатах).
func quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, hint := Vector3.ZERO) -> void:
	if hint == Vector3.ZERO:
		hint = (c - a).cross(b - a)
	tri(a, b, c, color, hint)
	tri(a, c, d, color, hint)

## Квад с UV (для полос, палубы): uv по углам a, b, c, d.
func quad_uv(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, ua: Vector2, ub: Vector2, uc: Vector2, ud: Vector2, hint: Vector3) -> void:
	var pa := xform * a
	var pb := xform * b
	var pc := xform * c
	var pd := xform * d
	var n := (pc - pa).cross(pb - pa)
	var order := [[pa, ua], [pb, ub], [pc, uc], [pa, ua], [pc, uc], [pd, ud]]
	if n.dot(xform.basis * hint) < 0.0:
		order = [[pa, ua], [pc, uc], [pb, ub], [pa, ua], [pd, ud], [pc, uc]]
		n = -n
	n = n.normalized()
	for e in order:
		v.append(e[0])
		nrm.append(n)
		col.append(color)
		uvs.append(e[1])

## Треугольник с UV, обход по подсказке.
func tri_uv(a: Vector3, b: Vector3, c: Vector3, color: Color, ua: Vector2, ub: Vector2, uc: Vector2, hint: Vector3) -> void:
	var pa := xform * a
	var pb := xform * b
	var pc := xform * c
	var n := (pc - pa).cross(pb - pa)
	var order := [[pa, ua], [pb, ub], [pc, uc]]
	if n.dot(xform.basis * hint) < 0.0:
		order = [[pa, ua], [pc, uc], [pb, ub]]
		n = -n
	n = n.normalized()
	for e in order:
		v.append(e[0])
		nrm.append(n)
		col.append(color)
		uvs.append(e[1])

func box(center: Vector3, size: Vector3, color: Color, b := Basis.IDENTITY, top := Color(0, 0, 0, 0)) -> void:
	var h := size * 0.5
	var p: Array = []
	for i in 8:
		var o := Vector3(h.x if i & 1 else -h.x, h.y if i & 2 else -h.y, h.z if i & 4 else -h.z)
		p.append(center + b * o)
	var tc := top if top.a > 0.0 else color
	quad(p[2], p[3], p[7], p[6], tc, b.y)
	quad(p[0], p[1], p[5], p[4], color.darkened(0.25), -b.y)
	quad(p[0], p[1], p[3], p[2], color.darkened(0.08), -b.z)
	quad(p[4], p[5], p[7], p[6], color.darkened(0.08), b.z)
	quad(p[1], p[3], p[7], p[5], color.darkened(0.15), b.x)
	quad(p[0], p[2], p[6], p[4], color.darkened(0.15), -b.x)

## Усечённая пирамида/клин: нижний прямоугольник size_bottom, верхний size_top (x, z), высота h.
func frustum(center: Vector3, bottom: Vector2, top: Vector2, h: float, color: Color, b := Basis.IDENTITY, top_offset := Vector2.ZERO) -> void:
	var lo: Array = []
	var hi: Array = []
	for i in 4:
		var sx := -1.0 if i == 0 or i == 3 else 1.0
		var sz := -1.0 if i < 2 else 1.0
		lo.append(center + b * Vector3(sx * bottom.x * 0.5, 0.0, sz * bottom.y * 0.5))
		hi.append(center + b * Vector3(sx * top.x * 0.5 + top_offset.x, h, sz * top.y * 0.5 + top_offset.y))
	var mid := center + b * Vector3(0, h * 0.5, 0)
	quad(hi[0], hi[1], hi[2], hi[3], color, b.y)
	quad(lo[0], lo[1], lo[2], lo[3], color.darkened(0.25), -b.y)
	for i in 4:
		var j := (i + 1) % 4
		var fc: Vector3 = (lo[i] + lo[j] + hi[i] + hi[j]) * 0.25
		quad(lo[i], lo[j], hi[j], hi[i], color.darkened(0.05 + 0.05 * i), fc - mid)

## Цилиндр вдоль оси b.y.
func cylinder(center: Vector3, radius: float, height: float, seg: int, color: Color, b := Basis.IDENTITY, caps := true, radius_top := -1.0) -> void:
	if radius_top < 0.0:
		radius_top = radius
	var top_c := center + b.y * height
	for i in seg:
		var a0 := TAU * i / seg
		var a1 := TAU * (i + 1) / seg
		var d0 := b.x * cos(a0) + b.z * sin(a0)
		var d1 := b.x * cos(a1) + b.z * sin(a1)
		var p0 := center + d0 * radius
		var p1 := center + d1 * radius
		var q0 := top_c + d0 * radius_top
		var q1 := top_c + d1 * radius_top
		var shade := 0.12 * (0.5 + 0.5 * sin(a0 + 0.8))
		quad(p0, p1, q1, q0, color.darkened(shade), (d0 + d1))
		if caps:
			if radius_top > 0.001:
				tri(top_c, q0, q1, color, b.y)
			tri(center, p0, p1, color.darkened(0.25), -b.y)

func cone(center: Vector3, radius: float, height: float, seg: int, color: Color, b := Basis.IDENTITY, bottom := true) -> void:
	cylinder(center, radius, height, seg, color, b, bottom, 0.0)

## Полуцилиндр (арочная крыша), ось вдоль b.z, длина len.
func arch(center: Vector3, radius: float, length: float, seg: int, color: Color, b := Basis.IDENTITY, end_color := Color(0, 0, 0, 0)) -> void:
	var ec := end_color if end_color.a > 0.0 else color.darkened(0.1)
	var hz := b.z * (length * 0.5)
	for i in seg:
		var a0 := PI * i / seg
		var a1 := PI * (i + 1) / seg
		var d0 := b.x * cos(a0) + b.y * sin(a0)
		var d1 := b.x * cos(a1) + b.y * sin(a1)
		var p0 := center + d0 * radius
		var p1 := center + d1 * radius
		quad(p0 - hz, p1 - hz, p1 + hz, p0 + hz, color.darkened(0.15 * absf(cos((a0 + a1) * 0.5)) + 0.05 * float(i % 2)), d0 + d1)
		tri(center - hz, p0 - hz, p1 - hz, ec, -b.z)
		tri(center + hz, p0 + hz, p1 + hz, ec, b.z)

## Выпуклый многоугольник (x, z), вытянутый от y0 до y1.
func prism(points: PackedVector2Array, y0: float, y1: float, color: Color, top := Color(0, 0, 0, 0)) -> void:
	var tc := top if top.a > 0.0 else color
	var cnt := points.size()
	var c := Vector2.ZERO
	for p in points:
		c += p
	c /= cnt
	var c0 := Vector3(c.x, y0, c.y)
	var c1 := Vector3(c.x, y1, c.y)
	for i in cnt:
		var a := points[i]
		var bb := points[(i + 1) % cnt]
		var pa0 := Vector3(a.x, y0, a.y)
		var pb0 := Vector3(bb.x, y0, bb.y)
		var pa1 := Vector3(a.x, y1, a.y)
		var pb1 := Vector3(bb.x, y1, bb.y)
		var out := Vector3((a.x + bb.x) * 0.5 - c.x, 0.0, (a.y + bb.y) * 0.5 - c.y)
		quad(pa0, pb0, pb1, pa1, color.darkened(0.06 + 0.06 * float(i % 3)), out)
		tri(c1, pa1, pb1, tc, Vector3.UP)

## Неровный камень: сплющенный октаэдр с шумом.
func rock(center: Vector3, size: Vector3, color: Color, rng: RandomNumberGenerator) -> void:
	var pts: Array = []
	var ring := 6
	for i in ring:
		var a := TAU * i / ring + rng.randf_range(-0.2, 0.2)
		pts.append(center + Vector3(cos(a) * size.x * rng.randf_range(0.75, 1.1), size.y * rng.randf_range(0.2, 0.45), sin(a) * size.z * rng.randf_range(0.75, 1.1)))
	var top := center + Vector3(rng.randf_range(-0.2, 0.2) * size.x, size.y, rng.randf_range(-0.2, 0.2) * size.z)
	var bottom := center + Vector3(0, -size.y * 0.4, 0)
	for i in ring:
		var a: Vector3 = pts[i]
		var bb: Vector3 = pts[(i + 1) % ring]
		var mid := (a + bb) * 0.5
		tri(top, a, bb, color, (mid + top) * 0.5 - center)
		tri(bottom, a, bb, color.darkened(0.3), (mid + bottom) * 0.5 - center)

## Добавить другой построитель целиком.
func append_from(o) -> void:
	v.append_array(o.v)
	nrm.append_array(o.nrm)
	col.append_array(o.col)
	uvs.append_array(o.uvs)

func arrays() -> Array:
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nrm
	arr[Mesh.ARRAY_COLOR] = col
	arr[Mesh.ARRAY_TEX_UV] = uvs
	return arr

func commit(mat: Material = null, mesh: ArrayMesh = null) -> ArrayMesh:
	if mesh == null:
		mesh = ArrayMesh.new()
	if v.is_empty():
		return mesh
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays())
	if mat != null:
		mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
	return mesh
