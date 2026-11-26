extends RefCounted
## Набор треугольников с нормалями и меткой краски. Из него собирается ArrayMesh.
## Ориентация граней выставляется по нормалям, поэтому порядок вершин можно не соблюдать.

# метки краски
const SKIN := 0
const DARK := 1
const METAL := 2
const METAL_DARK := 3
const SOOT := 4
const TIRE := 5
const HUB := 6
const PROP := 7
const PROP_TIP := 8
const SPINNER := 9
const FRAME := 10
const PILOT := 11
const ACCENT := 12
const WHITE := 13
const NUMBER := 14
const RADOME := 15
const BELLY := 16
const PLAIN := 17
const LIGHT_RED := 18
const LIGHT_GREEN := 19
const ANTIGLARE := 20

# NACA 00xx, сэмплы по хорде: от задней кромки по верху к носку и по низу обратно
const AIRFOIL_X := [1.0, 0.66, 0.36, 0.14, 0.03, 0.0, 0.03, 0.14, 0.36, 0.66, 1.0]
const DIAMOND_X := [1.0, 0.55, 0.0, 0.55, 1.0]

var v := PackedVector3Array()
var n := PackedVector3Array()
var t := PackedInt32Array()


func tri_count() -> int:
	return t.size()


func tri(a: Vector3, b: Vector3, c: Vector3, na: Vector3, nb: Vector3, nc: Vector3, tag: int) -> void:
	var fn := (b - a).cross(c - a)
	if fn.length_squared() < 1e-14:
		return
	# в Godot лицевая сторона — обход по часовой стрелке
	if fn.dot(na + nb + nc) > 0.0:
		v.append(a); v.append(c); v.append(b)
		n.append(na); n.append(nc); n.append(nb)
	else:
		v.append(a); v.append(b); v.append(c)
		n.append(na); n.append(nb); n.append(nc)
	t.append(tag)


func tri_flat(a: Vector3, b: Vector3, c: Vector3, out_hint: Vector3, tag: int) -> void:
	var fn := (b - a).cross(c - a)
	if fn.length_squared() < 1e-14:
		return
	fn = fn.normalized()
	if fn.dot(out_hint) < 0.0:
		fn = -fn
	tri(a, b, c, fn, fn, fn, tag)


func quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, out_hint: Vector3, tag: int) -> void:
	tri_flat(a, b, c, out_hint, tag)
	tri_flat(a, c, d, out_hint, tag)


## Веер от центра по замкнутому контуру.
func cap(ring: PackedVector3Array, center: Vector3, nrm: Vector3, tag: int) -> void:
	var cnt := ring.size()
	for k in cnt:
		var a := ring[k]
		var b := ring[(k + 1) % cnt]
		tri(center, a, b, nrm, nrm, nrm, tag)


## Поверхность по сетке точек. rows — массив PackedVector3Array одинаковой длины.
## ref(i, j, p) -> Vector3 — примерное направление наружу.
func grid(rows: Array, wrap: bool, tag: int, flat: bool, ref: Callable) -> void:
	var nr := rows.size()
	if nr < 2:
		return
	var nc := (rows[0] as PackedVector3Array).size()
	var norms: Array = []
	if not flat:
		for i in nr:
			var row: PackedVector3Array = rows[i]
			var prev: PackedVector3Array = rows[maxi(i - 1, 0)]
			var next: PackedVector3Array = rows[mini(i + 1, nr - 1)]
			var rn := PackedVector3Array()
			rn.resize(nc)
			for j in nc:
				var jm := j - 1
				var jp := j + 1
				if wrap:
					jm = (j - 1 + nc) % nc
					jp = (j + 1) % nc
				else:
					jm = maxi(jm, 0)
					jp = mini(jp, nc - 1)
				var p := row[j]
				var du := next[j] - prev[j]
				var dv := row[jp] - row[jm]
				var nn := du.cross(dv)
				var r: Vector3 = ref.call(i, j, p)
				if nn.length_squared() < 1e-14:
					nn = r
				if nn.length_squared() < 1e-14:
					nn = Vector3.UP
				nn = nn.normalized()
				if nn.dot(r) < 0.0:
					nn = -nn
				rn[j] = nn
			norms.append(rn)
	var jmax := nc if wrap else nc - 1
	for i in nr - 1:
		var r0: PackedVector3Array = rows[i]
		var r1: PackedVector3Array = rows[i + 1]
		for j in jmax:
			var j2 := (j + 1) % nc
			var a := r0[j]
			var b := r0[j2]
			var c := r1[j2]
			var d := r1[j]
			if flat:
				var cen := (a + b + c + d) * 0.25
				var hint: Vector3 = ref.call(i, j, cen)
				tri_flat(a, b, c, hint, tag)
				tri_flat(a, c, d, hint, tag)
			else:
				var n0: PackedVector3Array = norms[i]
				var n1: PackedVector3Array = norms[i + 1]
				tri(a, b, c, n0[j], n0[j2], n1[j2], tag)
				tri(a, c, d, n0[j], n1[j2], n1[j], tag)


## Тело вращения. profile — массив Vector2(смещение вдоль оси, радиус).
func lathe(origin: Vector3, axis: Vector3, profile: Array, segs: int, tag: int, smooth: bool = true,
		cap0: bool = false, cap1: bool = false, a0: float = 0.0) -> void:
	var ax := axis.normalized()
	var u := ax.cross(Vector3.UP)
	if u.length_squared() < 0.01:
		u = ax.cross(Vector3.RIGHT)
	u = u.normalized()
	var w := ax.cross(u).normalized()
	var rows: Array = []
	var mid_t := 0.0
	for pr in profile:
		mid_t += (pr as Vector2).x
	mid_t /= maxf(1.0, float(profile.size()))
	for pr in profile:
		var p2: Vector2 = pr
		var ring := PackedVector3Array()
		for k in segs:
			var ang := a0 + TAU * float(k) / float(segs)
			ring.append(origin + ax * p2.x + (u * cos(ang) + w * sin(ang)) * p2.y)
		rows.append(ring)
	var mid := origin + ax * mid_t
	grid(rows, true, tag, not smooth, func(_i: int, _j: int, p: Vector3) -> Vector3:
		var rel := p - origin
		var radial := rel - ax * ax.dot(rel)
		if radial.length_squared() < 1e-8:
			return p - mid
		return radial)
	var first: Vector2 = profile[0]
	var last: Vector2 = profile[profile.size() - 1]
	var dir := 1.0 if last.x >= first.x else -1.0
	if cap0 and first.y > 1e-4:
		cap(rows[0], origin + ax * first.x, -ax * dir, tag)
	if cap1 and last.y > 1e-4:
		cap(rows[rows.size() - 1], origin + ax * last.x, ax * dir, tag)


## Цилиндр между двумя точками.
func rod(a: Vector3, b: Vector3, r: float, segs: int, tag: int, caps: bool = true) -> void:
	var d := b - a
	var l := d.length()
	if l < 1e-4:
		return
	lathe(a, d / l, [Vector2(0, r), Vector2(l, r)], segs, tag, true, caps, caps)


## Параллелепипед: центр, половинные размеры, базис.
func box(center: Vector3, half: Vector3, basis: Basis, tag: int) -> void:
	var bx := basis.x * half.x
	var by := basis.y * half.y
	var bz := basis.z * half.z
	var c := center
	var p := [c - bx - by - bz, c + bx - by - bz, c + bx + by - bz, c - bx + by - bz,
		c - bx - by + bz, c + bx - by + bz, c + bx + by + bz, c - bx + by + bz]
	quad(p[0], p[1], p[2], p[3], -basis.z, tag)
	quad(p[5], p[4], p[7], p[6], basis.z, tag)
	quad(p[4], p[0], p[3], p[7], -basis.x, tag)
	quad(p[1], p[5], p[6], p[2], basis.x, tag)
	quad(p[3], p[2], p[6], p[7], basis.y, tag)
	quad(p[4], p[5], p[1], p[0], -basis.y, tag)


## Брус между двумя точками сечением w×h.
func beam(a: Vector3, b: Vector3, w: float, h: float, tag: int, up_hint: Vector3 = Vector3.UP) -> void:
	var d := b - a
	var l := d.length()
	if l < 1e-4:
		return
	var z := d / l
	var x := up_hint.cross(z)
	if x.length_squared() < 1e-4:
		x = Vector3.RIGHT.cross(z)
	x = x.normalized()
	var y := z.cross(x).normalized()
	box((a + b) * 0.5, Vector3(w * 0.5, h * 0.5, l * 0.5), Basis(x, y, z), tag)


## Профиль крыла: точки сечения по хорде.
## sec = {le: Vector3, cv: Vector3 (вектор хорды к задней кромке), up: Vector3, th: толщина/хорда, cam: изгиб}
static func airfoil_y(x: float, th: float) -> float:
	var sx := sqrt(maxf(x, 0.0))
	return 5.0 * th * (0.2969 * sx - 0.1260 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x)


static func section_point(sec: Dictionary, x: float, top: bool, diamond: bool = false) -> Vector3:
	var cv: Vector3 = sec.cv
	var c := cv.length()
	var th: float = sec.th
	var yt := 0.0
	if diamond:
		yt = th * 0.5 * (1.0 - absf(x - 0.55) / (0.55 if x < 0.55 else 0.45))
	else:
		yt = airfoil_y(x, th)
	var cam: float = sec.get("cam", 0.0)
	var yc := cam * 4.0 * x * (1.0 - x)
	var y := yc + (yt if top else -yt)
	return (sec.le as Vector3) + cv * x + (sec.up as Vector3) * (y * c)


## Интерполяция сечений по дробному индексу.
static func section_at(sections: Array, s: float) -> Dictionary:
	var cnt := sections.size()
	var i0 := clampi(int(floor(s)), 0, cnt - 2)
	var f := clampf(s - float(i0), 0.0, 1.0)
	var a: Dictionary = sections[i0]
	var b: Dictionary = sections[i0 + 1]
	return {"le": (a.le as Vector3).lerp(b.le, f), "cv": (a.cv as Vector3).lerp(b.cv, f),
		"up": (a.up as Vector3).lerp(b.up, f).normalized(), "th": lerpf(a.th, b.th, f),
		"cam": lerpf(a.get("cam", 0.0), b.get("cam", 0.0), f)}


## Поверхность крыла/киля/лопасти через сечения.
func airfoil(sections: Array, tag: int, flat: bool = false, cap_root: bool = true, cap_tip: bool = true,
		diamond: bool = false) -> void:
	var xs: Array = DIAMOND_X if diamond else AIRFOIL_X
	var half := xs.size() / 2
	var rows: Array = []
	for sec in sections:
		var row := PackedVector3Array()
		for j in xs.size():
			row.append(section_point(sec, xs[j], j < half, diamond))
		rows.append(row)
	var secs := sections
	grid(rows, false, tag, flat, func(i: int, j: int, _p: Vector3) -> Vector3:
		var sc: Dictionary = secs[i]
		if j < half:
			return sc.up
		elif j > half:
			return -(sc.up as Vector3)
		return -(sc.cv as Vector3).normalized())
	var cnt := sections.size()
	if cnt >= 2:
		var s0: Dictionary = sections[0]
		var s1: Dictionary = sections[1]
		var sl: Dictionary = sections[cnt - 1]
		var sp: Dictionary = sections[cnt - 2]
		if cap_root:
			var dir0 := ((s0.le as Vector3) - (s1.le as Vector3)).normalized()
			_section_cap(rows[0], dir0, tag)
		if cap_tip:
			var dir1 := ((sl.le as Vector3) + (sl.cv as Vector3) * 0.5 - (sp.le as Vector3) - (sp.cv as Vector3) * 0.5).normalized()
			_section_cap(rows[cnt - 1], dir1, tag)


func _section_cap(row: PackedVector3Array, nrm: Vector3, tag: int) -> void:
	var ring := PackedVector3Array()
	for j in row.size() - 1:
		ring.append(row[j])
	var cen := Vector3.ZERO
	for p in ring:
		cen += p
	cen /= float(ring.size())
	var e1 := (ring[0] - cen)
	if e1.length_squared() < 1e-10:
		return
	cap(ring, cen, nrm, tag)


## Разрез треугольников SKIN по нулевой линии поля field(p, n) -> float.
## После разреза каждый треугольник целиком по одну сторону линии — цвет берётся в центре.
func split(field: Callable, mask: Callable = Callable()) -> void:
	var nv := PackedVector3Array()
	var nn := PackedVector3Array()
	var nt := PackedInt32Array()
	var use_mask := mask.is_valid()
	for k in t.size():
		var tag := t[k]
		var a := v[k * 3]
		var b := v[k * 3 + 1]
		var c := v[k * 3 + 2]
		var na := n[k * 3]
		var nb := n[k * 3 + 1]
		var nc := n[k * 3 + 2]
		var keep := tag != SKIN
		if not keep and use_mask:
			keep = not bool(mask.call((a + b + c) / 3.0, (na + nb + nc).normalized()))
		var fa := 0.0
		var fb := 0.0
		var fc := 0.0
		if not keep:
			fa = field.call(a, na)
			fb = field.call(b, nb)
			fc = field.call(c, nc)
			var sa := fa >= 0.0
			var sb := fb >= 0.0
			var sc := fc >= 0.0
			keep = sa == sb and sb == sc
			if not keep:
				# одинокая вершина первой, циклический порядок сохраняется
				if sb != sa and sb != sc:
					var tp := a; a = b; b = c; c = tp
					var tn := na; na = nb; nb = nc; nc = tn
					var tf := fa; fa = fb; fb = fc; fc = tf
				elif sc != sa and sc != sb:
					var tp2 := c; c = b; b = a; a = tp2
					var tn2 := nc; nc = nb; nb = na; na = tn2
					var tf2 := fc; fc = fb; fb = fa; fa = tf2
				var tab := clampf(fa / (fa - fb), 0.0, 1.0)
				var tac := clampf(fa / (fa - fc), 0.0, 1.0)
				var pab := a.lerp(b, tab)
				var pac := a.lerp(c, tac)
				var nab := na.lerp(nb, tab).normalized()
				var nac := na.lerp(nc, tac).normalized()
				_push(nv, nn, nt, a, pab, pac, na, nab, nac, tag)
				_push(nv, nn, nt, pab, b, c, nab, nb, nc, tag)
				_push(nv, nn, nt, pab, c, pac, nab, nc, nac, tag)
				continue
		nv.append(a); nv.append(b); nv.append(c)
		nn.append(na); nn.append(nb); nn.append(nc)
		nt.append(tag)
	v = nv
	n = nn
	t = nt


func _push(nv: PackedVector3Array, nn: PackedVector3Array, nt: PackedInt32Array, a: Vector3, b: Vector3, c: Vector3,
		na: Vector3, nb: Vector3, nc: Vector3, tag: int) -> void:
	if (b - a).cross(c - a).length_squared() < 1e-14:
		return
	nv.append(a); nv.append(b); nv.append(c)
	nn.append(na); nn.append(nb); nn.append(nc)
	nt.append(tag)


## Перенос всех вершин.
func shift(offset: Vector3) -> void:
	for k in v.size():
		v[k] += offset


func append_kit(other) -> void:
	v.append_array(other.v)
	n.append_array(other.n)
	t.append_array(other.t)


func bounds() -> AABB:
	if v.is_empty():
		return AABB()
	var box_ := AABB(v[0], Vector3.ZERO)
	for p in v:
		box_ = box_.expand(p)
	return box_


## Готовый меш. paint(tag, centroid, normal) -> Color.
func to_mesh(paint: Callable, material: Material) -> ArrayMesh:
	if t.is_empty():
		return null
	var cols := PackedColorArray()
	cols.resize(v.size())
	for k in t.size():
		var cen := (v[k * 3] + v[k * 3 + 1] + v[k * 3 + 2]) / 3.0
		var cn := (n[k * 3] + n[k * 3 + 1] + n[k * 3 + 2]).normalized()
		var col: Color = paint.call(t[k], cen, cn)
		cols[k * 3] = col
		cols[k * 3 + 1] = col
		cols[k * 3 + 2] = col
	var arr: Array = []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = n
	arr[Mesh.ARRAY_COLOR] = cols
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	if material:
		mesh.surface_set_material(0, material)
	return mesh
