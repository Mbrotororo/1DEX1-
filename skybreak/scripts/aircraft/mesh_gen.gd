extends RefCounted
## Строит геометрию одного самолёта: фюзеляж, крылья, хвост, шасси, фонарь, винты, маркеры.
## Всё в координатах модели: нос к -Z, верх +Y, право +X, начало координат около центра масс.

const Kit = preload("res://scripts/aircraft/mesh_kit.gd")
const Specs = preload("res://scripts/aircraft/mesh_specs.gd")
const Paint = preload("res://scripts/aircraft/mesh_paint.gd")

var def: Dictionary
var sh: Dictionary
var sp: Dictionary
var paint
var L: float
var R: float
var span: float
var semi: float
var chord: float
var gh: float
var nose_z: float
var tail_z: float
var cockpit_z: float
var is_jet: bool
var engines: String

var body = Kit.new()
var lwing = Kit.new()
var rwing = Kit.new()
var tail = Kit.new()
var gear = Kit.new()
var glass = Kit.new()
var prop_kit = Kit.new()
var spinner_kit = Kit.new()
var blur_kit = Kit.new()

var rings: Array = []          # станции фюзеляжа {z, x, y, w, ht, hb, nt, nb}
var angles: Array = []         # углы сечения фюзеляжа
var markers: Dictionary = {}
var props: Array = []          # [{pos, wing}]
var nozzles: Array = []        # [{pos, r, flat}]
var nacelle_lofts: Array = []  # станции мотогондол (правая сторона)
var wing_secs_r: Array = []
var wing_secs_l: Array = []
var fin_secs: Array = []       # [[sections, side]]
var canopy_z0: float
var canopy_z1: float
var canopy_h: float
var eye_y: float
var prop_r: float = 0.0
var spinner_len: float = 0.0
var spinner_r: float = 0.0
var ground_pitch: float = 0.0
var main_contact: Vector3
var wing_root_x: float
var wheels: Array = []         # [{pos (точка касания), r, main}]


func _init(p_def: Dictionary, p_camo: Dictionary) -> void:
	def = p_def
	sh = def.get("shape", {})
	sp = Specs.spec_for(def)
	L = float(sh.get("length", 10.0))
	R = float(sh.get("fuselage_radius", 0.8))
	span = float(sh.get("span", 10.0))
	semi = span * 0.5
	chord = float(sh.get("chord", 2.5))
	gh = float(sh.get("gear_height", 1.6))
	cockpit_z = float(sh.get("cockpit_z", -L * 0.2))
	engines = String(sh.get("engines", "single_jet"))
	is_jet = engines == "single_jet" or engines == "twin_jet"
	nose_z = -L * float(sp.nose_frac)
	tail_z = nose_z + L
	paint = Paint.new(def, p_camo, L, span)


func run() -> Dictionary:
	_sample_body()
	_build_body()
	_build_canopy()
	_build_engines()
	_build_wings()
	_build_tail()
	_build_gear()
	_build_guns()
	_build_markers()
	_build_decals()
	return _finish()


# ------------------------------------------------------------------ фюзеляж

func _st(z: float, x: float, y: float, w: float, ht: float, hb: float, nt: float = 2.0, nb: float = 2.0) -> Dictionary:
	return {"z": z, "x": x, "y": y, "w": maxf(w, 0.004), "ht": maxf(ht, 0.004), "hb": maxf(hb, 0.004), "nt": nt, "nb": nb}


static func ring_point(st: Dictionary, a: float) -> Vector3:
	var c := cos(a)
	var s := sin(a)
	var top := s >= 0.0
	var ex: float = 2.0 / float(st.nt if top else st.nb)
	var x: float = float(st.x) + float(st.w) * signf(c) * pow(absf(c), ex)
	var y: float = float(st.y) + float(st.ht if top else st.hb) * signf(s) * pow(absf(s), ex)
	return Vector3(x, y, float(st.z))


func _cr(p0: float, p1: float, p2: float, p3: float, f: float) -> float:
	var f2 := f * f
	var f3 := f2 * f
	return 0.5 * ((2.0 * p1) + (-p0 + p2) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f3)


func _sample_body() -> void:
	var cps: Array = sp.body
	var cnt := cps.size()
	var sub := 2
	var out: Array = []
	for i in cnt - 1:
		var a: Array = cps[maxi(i - 1, 0)]
		var b: Array = cps[i]
		var c: Array = cps[i + 1]
		var d: Array = cps[mini(i + 2, cnt - 1)]
		for s in sub:
			var f := float(s) / float(sub)
			var vals: Array = []
			for k in 7:
				vals.append(_cr(float(a[k]), float(b[k]), float(c[k]), float(d[k]), f))
			# t интерполируем линейно, чтобы станции шли по порядку
			vals[0] = lerpf(float(b[0]), float(c[0]), f)
			out.append(vals)
	out.append(cps[cnt - 1])
	rings.clear()
	for vals in out:
		rings.append(_st(nose_z + float(vals[0]) * L, 0.0, float(vals[4]) * R, float(vals[1]) * R, float(vals[2]) * R,
			float(vals[3]) * R, maxf(1.2, float(vals[5])), maxf(1.2, float(vals[6]))))
	angles.clear()
	var custom: Array = sp.get("angles", [])
	if custom.size() > 0:
		for a in custom:
			angles.append(deg_to_rad(float(a)))
	else:
		var segs: int = sp.segs
		for k in segs:
			angles.append(TAU * float(k) / float(segs))


## Станция фюзеляжа на произвольном z (линейно между станциями).
func station_at(stations: Array, z: float) -> Dictionary:
	var cnt := stations.size()
	var first: Dictionary = stations[0]
	var last: Dictionary = stations[cnt - 1]
	if z <= float(first.z):
		return first
	if z >= float(last.z):
		return last
	for i in cnt - 1:
		var a: Dictionary = stations[i]
		var b: Dictionary = stations[i + 1]
		if z >= float(a.z) and z <= float(b.z):
			var f := (z - float(a.z)) / maxf(1e-5, float(b.z) - float(a.z))
			var out := {}
			for k in a:
				out[k] = lerpf(float(a[k]), float(b[k]), f)
			return out
	return last


func body_at(z: float) -> Dictionary:
	return station_at(rings, z)


func body_top(z: float) -> float:
	var st := body_at(z)
	return float(st.y) + float(st.ht)


func body_bottom(z: float) -> float:
	var st := body_at(z)
	return float(st.y) - float(st.hb)


## Высота верхней поверхности фюзеляжа на расстоянии x от оси.
func body_top_at_x(z: float, x: float) -> float:
	var st := body_at(z)
	var w: float = st.w
	var q := clampf(absf(x) / w, 0.0, 1.0)
	var n: float = st.nt
	return float(st.y) + float(st.ht) * pow(maxf(0.0, 1.0 - pow(q, n)), 1.0 / n)


func _loft(kit, stations: Array, angs: Array, tag: int, flat: bool, inward: bool = false, fixed_ref: Vector3 = Vector3.ZERO) -> Array:
	var rows: Array = []
	for st in stations:
		var ring := PackedVector3Array()
		for a in angs:
			ring.append(ring_point(st, a))
		rows.append(ring)
	var sts := stations
	kit.grid(rows, true, tag, flat, func(i: int, _j: int, p: Vector3) -> Vector3:
		if fixed_ref != Vector3.ZERO:
			return fixed_ref
		var s: Dictionary = sts[i]
		var r := p - Vector3(float(s.x), float(s.y), float(s.z))
		if r.length_squared() < 1e-10:
			r = Vector3(0, 0, -1)
		return -r if inward else r)
	return rows


func _uniform_angles(segs: int, a0: float = 0.0) -> Array:
	var out: Array = []
	for k in segs:
		out.append(a0 + TAU * float(k) / float(segs))
	return out


func _scaled(st: Dictionary, k: float, dz: float = 0.0) -> Dictionary:
	var o := st.duplicate()
	o.w = float(st.w) * k
	o.ht = float(st.ht) * k
	o.hb = float(st.hb) * k
	o.z = float(st.z) + dz
	return o


## Открытый воздухозаборник: кромка, тёмный канал и заглушка.
func _open_front(kit, st: Dictionary, angs: Array, depth: float, lip: float = 0.86) -> void:
	var inner := _scaled(st, lip)
	_loft(kit, [st, inner], angs, Kit.METAL_DARK, false, false, Vector3(0, 0, -1))
	var deep := _scaled(st, lip * 0.82, depth)
	_loft(kit, [inner, deep], angs, Kit.DARK, false, true)
	var ring := PackedVector3Array()
	for a in angs:
		ring.append(ring_point(deep, a))
	kit.cap(ring, Vector3(float(deep.x), float(deep.y), float(deep.z)), Vector3(0, 0, -1), Kit.DARK)


## Сопло: металлический стакан, кромка и тёмная глубина. st — станция на срезе.
func _nozzle(kit, st: Dictionary, angs: Array, length: float) -> void:
	var front := _scaled(st, 1.05, -length)
	_loft(kit, [front, _scaled(st, 1.02, -length * 0.4), st], angs, Kit.METAL, false)
	var inner := _scaled(st, 0.84)
	_loft(kit, [st, inner], angs, Kit.METAL_DARK, false, false, Vector3(0, 0, 1))
	var deep := _scaled(st, 0.66, -length * 0.6)
	_loft(kit, [inner, deep], angs, Kit.METAL_DARK, false, true)
	var ring := PackedVector3Array()
	for a in angs:
		ring.append(ring_point(deep, a))
	kit.cap(ring, Vector3(float(deep.x), float(deep.y), float(deep.z)), Vector3(0, 0, 1), Kit.DARK)


func _build_body() -> void:
	var flat: bool = sp.faceted
	var rows := _loft(body, rings, angles, Kit.SKIN, flat)
	var first: Dictionary = rings[0]
	var last: Dictionary = rings[rings.size() - 1]
	var nose: String = sp.nose
	match nose:
		"intake":
			_open_front(body, first, angles, L * 0.08, 0.84)
			# перегородка в канале
			body.box(Vector3(0, float(first.y), float(first.z) + 0.35), Vector3(0.025, float(first.ht) * 0.7, 0.35),
				Basis.IDENTITY, Kit.METAL_DARK)
		"spinner":
			var cowl: String = sp.prop.get("cowl", "inline")
			var inset := _scaled(first, 0.97, 0.02)
			body.cap(rows[0], Vector3(0, float(first.y), float(first.z) + 0.03), Vector3(0, 0, -1), Kit.DARK)
			if cowl == "radial":
				# цилиндры звездообразного мотора за коком
				var cr: float = float(first.w) * 0.62
				for k in 9:
					var a := TAU * float(k) / 9.0
					var c := Vector3(cos(a) * cr, float(first.y) + sin(a) * cr, float(first.z) + 0.08)
					body.lathe(c, Vector3(cos(a), sin(a), 0), [Vector2(-0.12, 0.09), Vector2(0.14, 0.07)], 6,
						Kit.METAL_DARK, true, false, true)
			else:
				_loft(body, [first, inset], angles, Kit.SKIN, flat)
		_:
			body.cap(rows[0], Vector3(0, float(first.y), float(first.z)), Vector3(0, 0, -1), Kit.SKIN)
	var tail_end: String = sp.tail_end
	match tail_end:
		"nozzle":
			var nz := _scaled(last, float(sp.nozzle_r) / maxf(0.01, float(last.w) / R), 0.0)
			nz.nt = 2.0
			nz.nb = 2.0
			nz.ht = nz.w
			nz.hb = nz.w
			nz.z = float(last.z) + 0.12
			var segs := _uniform_angles(18)
			_nozzle(body, nz, segs, L * 0.06)
			body.cap(rows[rows.size() - 1], Vector3(0, float(last.y), float(last.z)), Vector3(0, 0, 1), Kit.METAL_DARK)
			nozzles.append({"pos": Vector3(0, float(nz.y), float(nz.z)), "r": float(nz.w), "flat": false})
		"flat2":
			body.cap(rows[rows.size() - 1], Vector3(0, float(last.y), float(last.z)), Vector3(0, 0, 1), Kit.SKIN)
			for side: float in [-1.0, 1.0]:
				var nw := R * 0.5
				var nh := R * 0.24
				var nzs := _st(float(last.z) + 0.1, side * R * 0.62, float(last.y), nw, nh, nh, 5.0, 5.0)
				_nozzle(body, nzs, _uniform_angles(16, PI / 16.0), L * 0.05)
				nozzles.append({"pos": Vector3(float(nzs.x), float(nzs.y), float(nzs.z)), "r": nw, "flat": true})
		_:
			body.cap(rows[rows.size() - 1], Vector3(0, float(last.y), float(last.z)), Vector3(0, 0, 1), Kit.SKIN)
	if nose == "gun":
		# ствол пушки в носу
		var nzp := Vector3(0, float(first.y) - float(first.hb) * 0.3, float(first.z))
		body.rod(nzp + Vector3(0, 0, 0.3), nzp + Vector3(0, 0, -0.75), R * 0.07, 8, Kit.METAL_DARK)
		body.rod(nzp + Vector3(0, 0, 0.05), nzp + Vector3(0, 0, -0.2), R * 0.14, 10, Kit.METAL_DARK)
	if sp.spine:
		_build_spine()
	var rad: Dictionary = sp.radiator
	if not rad.is_empty():
		_build_radiator(rad)
	var ex: int = sp.exhausts
	if ex > 0 and engines == "nose_prop":
		_build_exhausts(ex)
	var strake: Dictionary = sp.strake
	if not strake.is_empty():
		_build_strakes(strake)
	for it in sp.intakes:
		_build_side_intake(it)


func _build_spine() -> void:
	# гаргрот от фонаря к килю
	var c: Dictionary = sp.canopy
	var z0 := cockpit_z + float(c.z1) * L - 0.05
	var fin: Dictionary = sp.fin
	var z1 := nose_z + float(fin.get("t", 0.8)) * L + 0.3
	if z1 <= z0 + 0.5:
		return
	var h0 := R * float(c.h) * 0.45
	var sts: Array = []
	var n := 6
	for k in n + 1:
		var f := float(k) / float(n)
		var z := lerpf(z0, z1, f)
		var top := body_top(z)
		var hh := h0 * (1.0 - f) * (1.0 - f * 0.3)
		var w := R * float(c.w) * (0.75 - 0.35 * f)
		var base := body_top_at_x(z, w) - R * 0.03
		sts.append(_st(z, 0.0, base, w, top - base + hh, R * 0.05, 2.2, 2.0))
	_loft(body, sts, _uniform_angles(12), Kit.SKIN, false)


func _build_radiator(rad: Dictionary) -> void:
	var z0 := nose_z + float(rad.t0) * L
	var z1 := nose_z + float(rad.t1) * L
	var w := R * float(rad.w)
	var h := R * float(rad.h)
	var sts: Array = []
	var fr := [0.0, 0.12, 0.6, 1.0]
	var hk := [0.8, 1.0, 0.85, 0.15]
	var wk := [0.85, 1.0, 0.95, 0.6]
	for k in fr.size():
		var z := lerpf(z0, z1, fr[k])
		var bot := body_bottom(z)
		var hh: float = h * float(hk[k])
		sts.append(_st(z, 0.0, bot + h * 0.15 - hh * 0.5, w * float(wk[k]), hh * 0.5 + R * 0.12, hh * 0.5, 3.0, 3.0))
	var angs := _uniform_angles(12)
	_loft(body, sts, angs, Kit.SKIN, false)
	_open_front(body, sts[0], angs, 0.25, 0.8)
	var last: Dictionary = sts[sts.size() - 1]
	var ring := PackedVector3Array()
	for a in angs:
		ring.append(ring_point(last, a))
	body.cap(ring, Vector3(0, float(last.y), float(last.z)), Vector3(0, 0, 1), Kit.SKIN)


func _build_exhausts(count: int) -> void:
	var p: Dictionary = sp.prop
	var z0 := nose_z + float(p.spinner_len) * L + L * 0.05
	var step := L * 0.028
	for side: float in [-1.0, 1.0]:
		for k in count:
			var z := z0 + step * float(k)
			var st := body_at(z)
			var y: float = float(st.y) + float(st.ht) * 0.25
			var x: float = side * (float(st.w) * 0.93)
			var b := Basis(Vector3(1, 0, 0), Vector3(0, 1, 0), Vector3(0, 0, 1)).rotated(Vector3.UP, side * 0.25)
			body.box(Vector3(x, y, z), Vector3(0.05, 0.035, 0.075), b, Kit.SOOT)


func _build_strakes(st: Dictionary) -> void:
	# наплыв крыла (Фланкер): тонкая панель от кабины до корня крыла
	for side: float in [-1.0, 1.0]:
		var z_front := nose_z + float(st.t0) * L
		var z_root_le := _wing_le_z(0.0)
		var x_out := float(st.x)
		var x_in := R * 0.55
		var c_root := _wing_le_z(0.0) + _wing_chord(0.0) * 0.5 - z_front
		var y := _wing_y(0.0) + R * 0.12
		var secs: Array = []
		secs.append({"le": Vector3(side * x_in, y, z_front), "cv": Vector3(0, 0, c_root), "up": Vector3.UP, "th": 0.03, "cam": 0.0})
		var le_out := _wing_le_z(x_out)
		secs.append({"le": Vector3(side * x_out, _wing_y(x_out), le_out), "cv": Vector3(0, 0, maxf(0.3, z_root_le + _wing_chord(0.0) * 0.5 - le_out)),
			"up": Vector3.UP, "th": 0.03, "cam": 0.0})
		body.airfoil(secs, Kit.SKIN, false, false, false)


func _build_side_intake(it: Dictionary) -> void:
	var kind: String = it.kind
	var z0 := nose_z + float(it.t0) * L
	var z1 := nose_z + float(it.t1) * L
	var w := R * float(it.w)
	var h := R * float(it.h)
	for side: float in [-1.0, 1.0]:
		var x: float = side * R * float(it.x)
		var y: float = R * float(it.y)
		var sts: Array = []
		var angs: Array
		match kind:
			"half":
				angs = _uniform_angles(14)
				var fr := [0.0, 0.1, 0.55, 1.0]
				var kk := [0.94, 1.0, 0.95, 0.5]
				for k in fr.size():
					var z := lerpf(z0, z1, fr[k])
					var bw := float(body_at(z).w)
					var cx := side * maxf(absf(x), bw - w * 0.45)
					sts.append(_st(z, cx, y, w * float(kk[k]), h * float(kk[k]), h * float(kk[k]), 2.0, 2.0))
			"caret":
				angs = [0.0, deg_to_rad(70.0), deg_to_rad(110.0), PI, deg_to_rad(250.0), deg_to_rad(290.0)]
				var fr2 := [0.0, 0.12, 0.6, 1.0]
				var kk2 := [1.0, 1.0, 0.92, 0.45]
				for k in fr2.size():
					var z := lerpf(z0, z1, fr2[k])
					var bw2 := float(body_at(z).w)
					var cx2 := side * maxf(absf(x), bw2 - w * 0.4)
					sts.append(_st(z, cx2, y, w * float(kk2[k]), h * float(kk2[k]), h * float(kk2[k]) * 0.9, 1.3, 1.3))
			_:
				angs = _uniform_angles(12)
				for k in 3:
					var f := float(k) / 2.0
					sts.append(_st(lerpf(z0, z1, f), x, y, w * (1.0 - 0.4 * f), h, h, 4.0, 4.0))
		_loft(body, sts, angs, Kit.SKIN, kind == "caret")
		_open_front(body, sts[0], angs, 0.6, 0.82)
		if kind == "half":
			# полуконус в воздухозаборнике
			var f0: Dictionary = sts[0]
			var cpos := Vector3(float(f0.x) - side * w * 0.35, float(f0.y), float(f0.z))
			body.lathe(cpos + Vector3(0, 0, 0.5), Vector3(0, 0, -1), [Vector2(0.0, w * 0.42), Vector2(0.55, w * 0.32),
				Vector2(0.95, 0.02)], 10, Kit.SKIN, true)


# ------------------------------------------------------------------ фонарь

func _canopy_profile(style: String, u: float) -> float:
	var peak := 0.32
	var back := 0.62
	if style == "long":
		peak = 0.14
		back = 0.86
	if u < peak:
		return pow(u / peak, 0.75)
	if u <= back:
		return 1.0
	var f := (u - back) / (1.0 - back)
	if style == "razor":
		return lerpf(1.0, 0.42, f)
	return pow(maxf(0.0, cos(f * PI * 0.5)), 0.8)


func _canopy_station(z: float, u: float, style: String, k: float) -> Dictionary:
	var c: Dictionary = sp.canopy
	var cw := R * float(c.w)
	var f := _canopy_profile(style, u)
	var w := cw * (0.62 + 0.38 * pow(f, 0.5)) * k
	var top := body_top(z)
	var base := body_top_at_x(z, w) - R * 0.04
	var ht := (top - base) * 0.9 + canopy_h * f
	return _st(z, 0.0, base, w, ht * k + (top - base) * (1.0 - k) * 0.0, R * 0.08, 2.3, 2.0)


func _build_canopy() -> void:
	var c: Dictionary = sp.canopy
	var style: String = c.style
	canopy_z0 = cockpit_z + float(c.z0) * L
	canopy_z1 = cockpit_z + float(c.z1) * L
	canopy_h = R * float(c.h)
	var n := 10
	var sts: Array = []
	for k in n + 1:
		var u := float(k) / float(n)
		sts.append(_canopy_station(lerpf(canopy_z0, canopy_z1, u), u, style, 1.0))
	var angs: Array = []
	for d in [0.0, 22.0, 45.0, 68.0, 90.0, 112.0, 135.0, 158.0, 180.0, 240.0, 300.0]:
		angs.append(deg_to_rad(d))
	_loft(glass, sts, angs, Kit.PLAIN, false)
	# рамы
	for fu in c.get("frames", []):
		var u2: float = fu
		var z := lerpf(canopy_z0, canopy_z1, u2)
		var a := _canopy_station(z - 0.03, u2, style, 1.035)
		var b := _canopy_station(z + 0.03, u2, style, 1.035)
		a.hb = R * 0.02
		b.hb = R * 0.02
		_loft(body, [a, b], angs, Kit.FRAME, false)
	# пилот
	var sill := body_top(cockpit_z)
	eye_y = sill + canopy_h * 0.55
	var hr := clampf(R * 0.18, 0.11, 0.15)
	var hc := Vector3(0, eye_y - hr * 0.2, cockpit_z + hr * 0.5)
	body.lathe(hc + Vector3(0, -hr, 0), Vector3.UP, [Vector2(0, 0.0), Vector2(hr * 0.3, hr * 0.85), Vector2(hr, hr),
		Vector2(hr * 1.6, hr * 0.8), Vector2(hr * 2.0, 0.0)], 7, Kit.PILOT, true)
	body.lathe(hc + Vector3(0, -hr * 2.2, hr * 0.2), Vector3.UP, [Vector2(0, hr * 1.9), Vector2(hr * 1.3, hr * 1.4)], 7, Kit.PILOT,
		true, false, true)


# ------------------------------------------------------------------ двигатели

func _build_engines() -> void:
	if engines == "nose_prop":
		var p: Dictionary = sp.prop
		spinner_len = float(p.spinner_len) * L
		var first: Dictionary = rings[0]
		spinner_r = minf(R * float(p.spinner_r), float(first.w) * 0.98)
		prop_r = minf(float(p.r), gh - 0.12)
		props.append({"pos": Vector3(0, float(first.y), float(first.z)), "wing": ""})
		_build_prop_mesh(int(p.blades))
		markers["Engine0"] = Vector3(0, float(first.y) + R * 0.2, float(first.z) + L * 0.1)
	for nd in sp.nacelles:
		var nac: Dictionary = nd
		var kind: String = nac.kind
		for side: float in [-1.0, 1.0]:
			_build_nacelle(nac, side)
	if engines == "twin_prop":
		var p2: Dictionary = sp.prop
		prop_r = float(p2.r)
		_build_prop_mesh(int(p2.blades))
	if is_jet:
		var i := 0
		for nzd in nozzles:
			var nz: Dictionary = nzd
			markers["Engine%d" % i] = nz.pos
			i += 1


func _nacelle_x(nac: Dictionary) -> float:
	if nac.has("xs"):
		return semi * float(nac.xs)
	return R * float(nac.x)


func _build_nacelle(nac: Dictionary, side: float) -> void:
	var kind: String = nac.kind
	var x := side * _nacelle_x(nac)
	var w := R * float(nac.w)
	var h := R * float(nac.h)
	var n0: float = nac.get("n0", 2.0)
	var z0 := nose_z + float(nac.t0) * L
	var z1 := nose_z + float(nac.t1) * L
	var y := R * float(nac.y)
	var kit = body
	if kind == "prop":
		kit = rwing if side > 0 else lwing
		y = _wing_y(absf(x)) + R * float(nac.y)
	var sts: Array = []
	var angs := _uniform_angles(12)
	match kind:
		"prop":
			var fr := [0.0, 0.05, 0.16, 0.42, 0.62, 0.82, 1.0]
			var kk := [0.72, 0.86, 1.0, 1.0, 0.82, 0.48, 0.08]
			var yy := [0.0, 0.0, 0.0, -0.05, -0.08, -0.04, 0.0]
			for k in fr.size():
				var s: float = kk[k]
				sts.append(_st(lerpf(z0, z1, fr[k]), x, y + float(yy[k]) * h, w * s, h * s, h * s * 1.05, 2.0, 2.2))
			_loft(kit, sts, angs, Kit.SKIN, false)
			var f0: Dictionary = sts[0]
			var ring0 := PackedVector3Array()
			for a in angs:
				ring0.append(ring_point(f0, a))
			kit.cap(ring0, Vector3(x, float(f0.y), float(f0.z) + 0.02), Vector3(0, 0, -1), Kit.DARK)
			var lst: Dictionary = sts[sts.size() - 1]
			var ring1 := PackedVector3Array()
			for a in angs:
				ring1.append(ring_point(lst, a))
			kit.cap(ring1, Vector3(x, float(lst.y), float(lst.z)), Vector3(0, 0, 1), Kit.SKIN)
			# выхлопные патрубки по бокам
			for k in 2:
				var z := z0 + L * (0.045 + 0.03 * float(k))
				for s2: float in [-1.0, 1.0]:
					kit.box(Vector3(x + s2 * w * 0.95, y + h * 0.15, z), Vector3(0.06, 0.045, 0.08),
						Basis.IDENTITY.rotated(Vector3.UP, s2 * 0.3), Kit.SOOT)
			spinner_len = float(sp.prop.spinner_len) * L
			spinner_r = float(f0.w) * 0.97
			props.append({"pos": Vector3(x, float(f0.y), float(f0.z)), "wing": "RightWing" if side > 0 else "LeftWing"})
			var idx := 0 if side < 0 else 1
			markers["Engine%d" % idx] = Vector3(x, float(f0.y) + h * 0.3, float(f0.z) + L * 0.06)
		"pod":
			var fr2 := [0.0, 0.06, 0.25, 0.7, 0.92, 1.0]
			var kk2 := [0.92, 1.0, 1.02, 0.98, 0.88, 0.82]
			for k in fr2.size():
				var s3: float = kk2[k]
				sts.append(_st(lerpf(z0, z1, fr2[k]), x, y, w * s3, h * s3, h * s3, 2.0, 2.0))
			_loft(kit, sts, angs, Kit.SKIN, false)
			_open_front(kit, sts[0], angs, 0.5, 0.8)
			# пилон к фюзеляжу
			var zm := lerpf(z0, z1, 0.45)
			var bx := float(body_at(zm).w) * 0.5
			var by := body_top_at_x(zm, bx)
			var plen := (z1 - z0) * 0.5
			var pa := Vector3(side * bx, by - 0.1, zm)
			var pb := Vector3(x - side * w * 0.6, y - h * 0.3, zm)
			kit.beam(pa, pb, 0.12, plen, Kit.SKIN, Vector3(0, 0, 1))
			var nst := _st(z1 + 0.05, x, y, R * float(nac.noz), R * float(nac.noz), R * float(nac.noz))
			_nozzle(kit, nst, _uniform_angles(12), 0.5)
			nozzles.append({"pos": Vector3(x, y, z1 + 0.05), "r": R * float(nac.noz), "flat": false})
		_:
			# реактивная гондола, слитая с фюзеляжем
			var fr3 := [0.0, 0.04, 0.12, 0.45, 0.75, 0.92, 1.0]
			var kk3 := [0.95, 1.0, 1.0, 1.0, 0.95, 0.82, 0.74]
			for k in fr3.size():
				var s4: float = kk3[k]
				var f := float(fr3[k])
				var n := lerpf(n0, 2.0, clampf((f - 0.1) / 0.5, 0.0, 1.0))
				sts.append(_st(lerpf(z0, z1, f), x, y, w * s4, h * s4, h * s4, n, n))
			# к соплу сечение круглое по радиусу сопла
			var nr := R * float(nac.noz)
			var last: Dictionary = sts[sts.size() - 1]
			last.w = maxf(float(last.w), nr * 1.04)
			last.ht = maxf(nr * 1.04, float(last.w))
			last.hb = last.ht
			last.ht = float(last.w)
			last.hb = float(last.w)
			_loft(kit, sts, angs, Kit.SKIN, false)
			_open_front(kit, sts[0], angs, 0.7, 0.84)
			if nac.get("splitter", false):
				var f0b: Dictionary = sts[0]
				var zs := float(f0b.z)
				var xs := x - side * (w + 0.1)
				kit.box(Vector3(xs, y, zs + 0.35), Vector3(0.03, h * 1.05, 0.55), Basis.IDENTITY, Kit.SKIN)
			var nst2 := _st(z1 + 0.15, x, y, nr, nr, nr)
			_nozzle(kit, nst2, _uniform_angles(12), 0.6)
			nozzles.append({"pos": Vector3(x, y, z1 + 0.15), "r": nr, "flat": false})
	if side > 0:
		nacelle_lofts.append(sts)


func _build_prop_mesh(blades: int) -> void:
	# кок и лопасти в локальных координатах винта (ось -Z вперёд)
	var sl := spinner_len
	var sr := spinner_r
	spinner_kit.lathe(Vector3.ZERO, Vector3(0, 0, -1), [Vector2(0.0, sr), Vector2(sl * 0.4, sr * 0.9), Vector2(sl * 0.78, sr * 0.5),
		Vector2(sl, 0.0)], 12, Kit.SPINNER, true, true, false)
	var hub_z := -sl * 0.3
	var rp := prop_r
	var rs := [sr * 0.6, rp * 0.35, rp * 0.68, rp * 0.9]
	var cs := [0.11, 0.17, 0.16, 0.12]
	var bs := [52.0, 36.0, 24.0, 18.0]
	var rt := [rp * 0.9, rp]
	var ct := [0.12, 0.06]
	var bt := [18.0, 16.0]
	for b in blades:
		var phi := TAU * float(b) / float(blades) + PI * 0.5
		var rad := Vector3(cos(phi), sin(phi), 0.0)
		var tan := Vector3(-sin(phi), cos(phi), 0.0)
		var main: Array = []
		for k in rs.size():
			main.append(_blade_sec(rad, tan, hub_z, rs[k], float(cs[k]) * rp, deg_to_rad(bs[k])))
		var tip: Array = []
		for k in rt.size():
			tip.append(_blade_sec(rad, tan, hub_z, rt[k], float(ct[k]) * rp, deg_to_rad(bt[k])))
		prop_kit.airfoil(main, Kit.PROP, false, false, false, true)
		prop_kit.airfoil(tip, Kit.PROP_TIP, false, false, true, true)
	# диск размытия
	var segs := 22
	for k in segs:
		var a0 := TAU * float(k) / float(segs)
		var a1 := TAU * float(k + 1) / float(segs)
		var d0 := Vector3(cos(a0), sin(a0), 0)
		var d1 := Vector3(cos(a1), sin(a1), 0)
		var zz := hub_z
		for face: float in [1.0]:
			var nn := Vector3(0, 0, face)
			var r_in := sr * 0.9
			var r_mid := rp * 0.86
			blur_kit.tri(d0 * r_in + Vector3(0, 0, zz), d1 * r_in + Vector3(0, 0, zz), d1 * r_mid + Vector3(0, 0, zz), nn, nn, nn, Kit.PROP)
			blur_kit.tri(d0 * r_in + Vector3(0, 0, zz), d1 * r_mid + Vector3(0, 0, zz), d0 * r_mid + Vector3(0, 0, zz), nn, nn, nn, Kit.PROP)
			blur_kit.tri(d0 * r_mid + Vector3(0, 0, zz), d1 * r_mid + Vector3(0, 0, zz), d1 * rp + Vector3(0, 0, zz), nn, nn, nn, Kit.PROP_TIP)
			blur_kit.tri(d0 * r_mid + Vector3(0, 0, zz), d1 * rp + Vector3(0, 0, zz), d0 * rp + Vector3(0, 0, zz), nn, nn, nn, Kit.PROP_TIP)


func _blade_sec(rad: Vector3, tan: Vector3, hub_z: float, r: float, c: float, beta: float) -> Dictionary:
	var cdir := (-tan * cos(beta) + Vector3(0, 0, 1) * sin(beta)).normalized()
	var le := rad * r + Vector3(0, 0, hub_z) - cdir * c * 0.4
	var up := rad.cross(cdir).normalized()
	return {"le": le, "cv": cdir * c, "up": up, "th": 0.12, "cam": 0.0}


# ------------------------------------------------------------------ крылья

func _wing_root_chord() -> float:
	var w: Dictionary = sp.wing
	var plan: String = w.plan
	var taper: float = w.taper
	if plan == "delta" or plan == "diamond":
		return chord * float(w.root_mult)
	return 2.0 * chord / (1.0 + taper) * float(w.root_mult)


func _wing_chord(x: float) -> float:
	var cr := _wing_root_chord()
	var taper: float = sp.wing.taper
	return lerpf(cr, cr * taper, clampf(absf(x) / semi, 0.0, 1.0))


func _wing_le_z(x: float) -> float:
	var w: Dictionary = sp.wing
	var plan: String = w.plan
	var sweep := deg_to_rad(float(sh.get("sweep_deg", 0.0)))
	var wz := float(sh.get("wing_z", 0.0))
	var cr := _wing_root_chord()
	var ax := absf(x)
	var wtype := String(sh.get("wing_type", "straight"))
	if wtype == "straight" and plan == "trap":
		var z30 := wz - cr * 0.5 + cr * 0.3 + ax * tan(sweep)
		return z30 - 0.3 * _wing_chord(ax)
	return wz - cr * 0.5 + ax * tan(sweep)


func _wing_y(x: float) -> float:
	var w: Dictionary = sp.wing
	var ax := absf(x)
	var y0 := R * float(w.y)
	var kink: float = w.kink
	var d1 := deg_to_rad(float(w.dihedral))
	if kink > 0.0 and ax > kink * semi:
		var xk := kink * semi
		return y0 + xk * tan(d1) + (ax - xk) * tan(deg_to_rad(float(w.kink_dihedral)))
	return y0 + ax * tan(d1)


func _wing_dihedral_at(x: float) -> float:
	var w: Dictionary = sp.wing
	var kink: float = w.kink
	if kink > 0.0 and absf(x) > kink * semi:
		return deg_to_rad(float(w.kink_dihedral))
	return deg_to_rad(float(w.dihedral))


func _wing_th(x: float) -> float:
	var w: Dictionary = sp.wing
	return lerpf(float(w.th_root), float(w.th_tip), clampf(absf(x) / semi, 0.0, 1.0))


func _wing_bottom(x: float, xc: float = 0.35) -> float:
	return _wing_y(x) - Kit.airfoil_y(xc, _wing_th(x)) * _wing_chord(x)


func _wing_sec(side: float, x: float, chord_k: float = 1.0, le_shift: float = 0.0) -> Dictionary:
	var d := _wing_dihedral_at(x + 0.001)
	var c := _wing_chord(x)
	var c2 := c * chord_k
	var le := Vector3(side * x, _wing_y(x), _wing_le_z(x) + (c - c2) * 0.42 + le_shift)
	var up := Vector3(-side * sin(d), cos(d), 0.0)
	var w: Dictionary = sp.wing
	return {"le": le, "cv": Vector3(0, 0, c2 - le_shift), "up": up, "th": _wing_th(x), "cam": float(w.cam)}


func _build_wings() -> void:
	var w: Dictionary = sp.wing
	var wz := float(sh.get("wing_z", 0.0))
	var bw := float(body_at(wz).w)
	wing_root_x = bw * 0.4
	var tip_round: float = w.tip_round
	var c_tip := _wing_chord(semi)
	var rl := minf(tip_round * c_tip * 0.9, semi * 0.2)
	var xs: Array = []
	var x_end := semi - rl
	var nseg := 4
	for k in nseg + 1:
		xs.append(lerpf(wing_root_x, x_end, float(k) / float(nseg)))
	var kink: float = w.kink
	if kink > 0.0:
		var xk := kink * semi
		var best := 1
		for k in range(1, xs.size() - 1):
			if absf(float(xs[k]) - xk) < absf(float(xs[best]) - xk):
				best = k
		xs[best] = xk
	var flat: bool = w.flat
	var dog: float = w.dogtooth
	for side: float in [-1.0, 1.0]:
		var secs: Array = []
		for k in xs.size():
			var x: float = xs[k]
			if dog > 0.0 and kink > 0.0 and absf(x - kink * semi) < 0.001:
				secs.append(_wing_sec(side, x))
				secs.append(_wing_sec(side, x + 0.02, 1.0, -dog * _wing_chord(x)))
			else:
				secs.append(_wing_sec(side, x))
		if rl > 0.01:
			for f in [0.55, 0.88, 1.0]:
				var x2 := x_end + rl * float(f)
				var ck := sqrt(maxf(0.0, 1.0 - float(f) * float(f)))
				secs.append(_wing_sec(side, x2, maxf(0.14, ck)))
		var kit = rwing if side > 0 else lwing
		kit.airfoil(secs, Kit.SKIN, flat, true, true, flat)
		if side > 0:
			wing_secs_r = secs
		else:
			wing_secs_l = secs
		_wing_extras(kit, side)


func _wing_extras(kit, side: float) -> void:
	var w: Dictionary = sp.wing
	var fences: int = w.fences
	for k in fences:
		var x := lerpf(semi * 0.32, semi * 0.66, float(k) / maxf(1.0, float(fences - 1)))
		var c := _wing_chord(x)
		var le := _wing_le_z(x)
		var pts: Array = []
		for f in [0.0, 0.25, 0.55, 0.85]:
			var p := Vector3(side * x, _wing_y(x) + Kit.airfoil_y(f, _wing_th(x)) * c, le + c * float(f))
			pts.append(p)
		var hgt := 0.13
		for i in pts.size() - 1:
			var a: Vector3 = pts[i]
			var b: Vector3 = pts[i + 1]
			kit.quad(a, b, b + Vector3(0, hgt * (1.0 - float(i) * 0.2), 0), a + Vector3(0, hgt, 0), Vector3(1, 0, 0), Kit.SKIN)
			kit.quad(a, b, b + Vector3(0, hgt * (1.0 - float(i) * 0.2), 0), a + Vector3(0, hgt, 0), Vector3(-1, 0, 0), Kit.SKIN)
	var tip: String = w.tip
	var xt := semi
	var ct := _wing_chord(xt)
	var lt := _wing_le_z(xt)
	var yt := _wing_y(xt)
	if tip == "rail":
		var x0 := side * (xt + 0.04)
		kit.box(Vector3(x0, yt, lt + ct * 0.35), Vector3(0.05, 0.07, ct * 0.62), Basis.IDENTITY, Kit.SKIN)
		markers_tip_offset = 0.08
	elif tip == "pod":
		var pr := clampf(R * 0.2, 0.14, 0.24)
		var z0 := lt - ct * 0.35
		var z1 := lt + ct * 1.25
		var ps: Array = []
		var fr := [0.0, 0.15, 0.5, 0.85, 1.0]
		var kk := [0.1, 0.8, 1.0, 0.9, 0.55]
		for i in fr.size():
			ps.append(_st(lerpf(z0, z1, fr[i]), side * (xt + pr * 0.4), yt, pr * float(kk[i]), pr * float(kk[i]), pr * float(kk[i])))
		_loft(kit, ps, _uniform_angles(10), Kit.SKIN, false)
		var lp: Dictionary = ps[ps.size() - 1]
		var rr := PackedVector3Array()
		for a in _uniform_angles(10):
			rr.append(ring_point(lp, a))
		kit.cap(rr, Vector3(float(lp.x), float(lp.y), float(lp.z)), Vector3(0, 0, 1), Kit.SKIN)
		markers_tip_offset = pr * 1.2
	if w.pods:
		# обтекатели основных стоек
		var g: Dictionary = sp.gear
		var xg := semi * float(g.xs)
		var c2 := _wing_chord(xg)
		var le2 := _wing_le_z(xg)
		var yb := _wing_bottom(xg)
		var pw := clampf(R * 0.32, 0.22, 0.36)
		var ph := pw * 1.15
		var z0b := le2 - c2 * 0.25
		var z1b := le2 + c2 * 1.05
		var gs: Array = []
		var frb := [0.0, 0.12, 0.45, 0.8, 1.0]
		var kkb := [0.15, 0.8, 1.0, 0.75, 0.15]
		for i in frb.size():
			var s: float = kkb[i]
			gs.append(_st(lerpf(z0b, z1b, frb[i]), side * xg, yb - ph * 0.35, pw * s, ph * maxf(s, 0.6), ph * s, 2.0, 2.0))
		_loft(kit, gs, _uniform_angles(12), Kit.SKIN, false)
	var pyl_vis: bool = sp.pylons_visible
	if pyl_vis:
		for pos in _pylon_positions():
			var pv: Vector3 = pos
			if signf(pv.x) != side:
				continue
			var xp := absf(pv.x)
			var cp := _wing_chord(xp)
			var top := _wing_bottom(xp, 0.4) + 0.05
			var hgt2 := top - pv.y
			kit.box(Vector3(pv.x, pv.y + hgt2 * 0.5, pv.z), Vector3(0.05, hgt2 * 0.5, cp * 0.2), Basis.IDENTITY, Kit.BELLY)


var markers_tip_offset := 0.0


func _pylon_count() -> int:
	var wp: Dictionary = def.get("weapons", {})
	var bombs := int(wp.get("bombs", {}).get("count", 0))
	var rockets := int(wp.get("rockets", {}).get("count", 0))
	var missiles := int(wp.get("missiles", {}).get("count", 0))
	if bombs == 0 and rockets == 0 and missiles == 0:
		return 2
	var n := maxi(maxi(bombs, missiles), int(ceil(float(rockets) / 4.0)))
	n = clampi(n, 2, 8)
	if n % 2 == 1:
		n += 1
	return n


func _pylon_positions() -> Array:
	var n := _pylon_count()
	var pairs := n / 2
	var out: Array = []
	var x_min := maxf(wing_root_x + R * 1.1, semi * 0.24)
	var x_max := semi * (0.74 if pairs > 2 else 0.62)
	if engines == "twin_prop":
		x_min = semi * 0.12 + R
		x_max = maxf(x_min + 0.1, semi * 0.22)
	for k in pairs:
		var f := 0.5 if pairs == 1 else float(k) / float(pairs - 1)
		var x := lerpf(x_min, x_max, f)
		if engines == "twin_prop" and pairs == 1:
			x = R * 0.9
		for side: float in [-1.0, 1.0]:
			var c := _wing_chord(x)
			var y := _wing_bottom(x, 0.4) - 0.28
			var z := _wing_le_z(x) + c * 0.42
			if engines == "twin_prop" and pairs == 1:
				z = float(sh.get("wing_z", 0.0))
				y = body_bottom(z) - 0.15
			out.append(Vector3(side * x, y, z))
	return out


# ------------------------------------------------------------------ хвост

## Панель (стабилизатор/киль) по корневой точке, направлению размаха и нормали.
func _panel(root_le: Vector3, span_dir: Vector3, up: Vector3, length: float, c_root: float, c_tip: float, sweep_deg: float,
		th: float, tip_round: float, root_round: float = 0.0, nseg: int = 3) -> Array:
	var secs: Array = []
	var sw := tan(deg_to_rad(sweep_deg))
	var rl := minf(tip_round * c_tip * 0.9, length * 0.35)
	var rr := minf(root_round * c_root * 0.9, length * 0.35)
	var ds: Array = []
	if rr > 0.01:
		for f in [0.0, 0.35]:
			ds.append([rr * float(f), sqrt(maxf(0.0, 1.0 - pow(1.0 - float(f), 2.0)))])
	for k in nseg + 1:
		ds.append([lerpf(rr, length - rl, float(k) / float(nseg)), 1.0])
	if rl > 0.01:
		for f in [0.6, 1.0]:
			ds.append([length - rl + rl * float(f), sqrt(maxf(0.0, 1.0 - float(f) * float(f)))])
	for e in ds:
		var d: float = e[0]
		var ck: float = maxf(0.14, float(e[1]))
		var c := lerpf(c_root, c_tip, d / length)
		var c2 := c * ck
		var le := root_le + span_dir * d + Vector3(0, 0, d * sw + (c - c2) * 0.42)
		secs.append({"le": le, "cv": Vector3(0, 0, c2), "up": up, "th": th, "cam": 0.0})
	return secs


func _build_tail() -> void:
	var fin: Dictionary = sp.fin
	var stab: Dictionary = sp.stab
	var fh := float(fin.h) * L
	var fc := float(fin.chord) * L
	var fcount: int = fin.count
	var fflat: bool = fin.get("flat", false)
	var stab_le_root := Vector3.ZERO
	var stab_tip := Vector3.ZERO
	var stab_semi := 0.0
	var stab_c := 0.0
	# стабилизатор
	if not stab.is_empty():
		stab_semi = span * float(stab.span) * 0.5
		stab_c = float(stab.chord) * chord
		var st_tc := stab_c * float(stab.taper)
		var on_fin: float = stab.get("on_fin", -1.0)
		var zr := nose_z + float(stab.get("t", 0.84)) * L
		var yr := float(body_at(zr).y) + R * float(stab.get("y", 0.0))
		var x0 := R * float(stab.get("x0", 0.2))
		if on_fin >= 0.0:
			var fz := nose_z + float(fin.t) * L
			var fy := body_top(fz + fc * 0.5) - R * 0.1
			var hh := fh * on_fin
			var cfin := lerpf(fc, fc * float(fin.taper), on_fin)
			zr = fz + hh * tan(deg_to_rad(float(fin.sweep))) + cfin * 0.15
			yr = fy + hh
			x0 = 0.0
			stab_c = cfin * 0.85
			st_tc = stab_c * float(stab.taper)
		var dih := deg_to_rad(float(stab.get("dihedral", 0.0)))
		var sflat: bool = stab.get("flat", false)
		for side: float in [-1.0, 1.0]:
			var sd := Vector3(side * cos(dih), sin(dih), 0)
			var up := Vector3(-side * sin(dih), cos(dih), 0)
			var root := Vector3(side * x0, yr, zr)
			var secs := _panel(root, sd, up, stab_semi - x0, stab_c, st_tc, float(stab.sweep), float(stab.get("th", 0.08)),
				float(stab.get("tip_round", 0.0)), 0.0, 3)
			tail.airfoil(secs, Kit.SKIN, sflat, true, true, sflat)
			if side > 0:
				stab_le_root = root
				var ls: Dictionary = secs[secs.size() - 1]
				stab_tip = ls.le
	# кили
	var cant := deg_to_rad(float(fin.get("cant", 0.0)))
	var at_tips: bool = fin.get("at_stab_tips", false)
	for i in fcount:
		var side := 0.0
		if fcount > 1:
			side = -1.0 if i == 0 else 1.0
		var z0 := nose_z + float(fin.t) * L
		var x := side * R * float(fin.x)
		var y0: float
		var yv = fin.get("y", "top")
		if yv is String:
			y0 = body_top_at_x(z0 + fc * 0.5, x) - R * 0.12
		else:
			y0 = float(body_at(z0 + fc * 0.5).y) + R * float(yv)
		var below := float(fin.get("below", 0.0)) * L
		if at_tips and not stab.is_empty():
			x = side * (stab_semi + 0.02)
			var tipc := stab_c * float(stab.taper)
			z0 = float(stab_tip.z) + tipc * 0.5 - fc * 0.55
			y0 = float(stab_tip.y) - below
		var sd2 := Vector3(signf(side) * sin(cant), cos(cant), 0)
		var up2 := Vector3(1, 0, 0) if side == 0.0 else Vector3(side * cos(cant), -sin(cant), 0)
		var root2 := Vector3(x, y0, z0)
		var secs2 := _panel(root2, sd2, up2, fh + below, fc, fc * float(fin.taper), float(fin.sweep), float(fin.th),
			float(fin.tip_round), float(fin.tip_round) if below > 0.0 else 0.0, 3)
		tail.airfoil(secs2, Kit.SKIN, fflat, true, true, fflat)
		fin_secs.append([secs2, side])


# ------------------------------------------------------------------ шасси

func _wheel(center: Vector3, r: float, width: float, tag_hub: int = Kit.HUB) -> void:
	var hw := width * 0.5
	gear.lathe(center, Vector3(1, 0, 0), [Vector2(-hw, r * 0.6), Vector2(-hw * 0.75, r * 0.97), Vector2(hw * 0.75, r * 0.97),
		Vector2(hw, r * 0.6)], 12, Kit.TIRE, true)
	for s: float in [-1.0, 1.0]:
		var ring := PackedVector3Array()
		for k in 10:
			var a := TAU * float(k) / 10.0
			ring.append(center + Vector3(s * hw * 0.92, cos(a) * r * 0.6, sin(a) * r * 0.6))
		gear.cap(ring, center + Vector3(s * hw * 0.7, 0, 0), Vector3(s, 0, 0), tag_hub)


func _build_gear() -> void:
	var g: Dictionary = sp.gear
	var r: float = g.r
	var zm := nose_z + float(g.t) * L
	var xm := semi * float(g.xs)
	var on_nacelle := engines == "twin_prop"
	var sr := clampf(gh * 0.035, 0.05, 0.1)
	for side: float in [-1.0, 1.0]:
		var x := side * xm
		var attach_y := _wing_bottom(xm, 0.3) + 0.05
		if on_nacelle and nacelle_lofts.size() > 0:
			var st := station_at(nacelle_lofts[0], zm)
			attach_y = float(st.y) - float(st.hb) * 0.6
		if sp.wing.pods:
			attach_y -= 0.2
		var splay := side * (0.0 if is_jet else 0.08)
		var axle := Vector3(x + splay, -gh + r, zm)
		var top := Vector3(x, attach_y, zm + (0.0 if is_jet else -0.05))
		gear.rod(top, axle + Vector3(-side * r * 0.0, r * 0.15, 0), sr * 1.25, 8, Kit.HUB)
		gear.rod(axle + Vector3(0, r * 0.15, 0), axle, sr * 0.8, 6, Kit.HUB, false)
		# подкос
		var brace_top := Vector3(x - side * (0.45 if not on_nacelle else 0.0), attach_y, zm + (0.5 if not is_jet else 0.6))
		gear.rod(top.lerp(axle, 0.55), brace_top, sr * 0.55, 6, Kit.HUB)
		var ww := r * (0.55 if is_jet else 0.45)
		wheels.append({"pos": Vector3(axle.x, axle.y - r, axle.z), "r": r, "main": true})
		_wheel(axle + Vector3(side * (ww * 0.5 + sr * 0.9) * 0.0, 0, 0), r, ww)
		# створка
		var dmid := top.lerp(axle, 0.45) + Vector3(side * (sr + 0.06), 0, 0)
		var dlen := (top - axle).length() * 0.42
		gear.box(dmid, Vector3(0.015, dlen, r * 0.75), Basis.IDENTITY, Kit.BELLY)
		if side > 0:
			main_contact = Vector3(0, -gh, zm)
	var za := nose_z + float(g.aux_t) * L
	var ra: float = g.aux_r
	if g.tail:
		var yb := body_bottom(za)
		var leg := clampf(gh * 0.25, 0.25, 0.45)
		var axle2 := Vector3(0, yb - leg, za + leg * 0.35)
		gear.rod(Vector3(0, yb + 0.05, za - 0.05), axle2 + Vector3(0, ra * 0.3, 0), sr * 0.8, 6, Kit.HUB)
		_wheel(axle2, ra, ra * 0.6)
		wheels.append({"pos": Vector3(axle2.x, axle2.y - ra, axle2.z), "r": ra, "main": false})
		var ty := axle2.y - ra
		ground_pitch = atan2(ty - (-gh), axle2.z - zm)
	else:
		var yb2 := body_bottom(za)
		var axle3 := Vector3(0, -gh + ra, za)
		gear.rod(Vector3(0, yb2 + 0.08, za - 0.08), axle3 + Vector3(0, ra * 0.4, 0), sr * 1.1, 8, Kit.HUB)
		gear.rod(axle3 + Vector3(-ra * 0.35, ra * 0.4, 0), axle3 + Vector3(ra * 0.35, ra * 0.4, 0), sr * 0.6, 6, Kit.HUB)
		_wheel(axle3, ra, ra * 0.55)
		wheels.append({"pos": Vector3(axle3.x, axle3.y - ra, axle3.z), "r": ra, "main": false})
		gear.box(Vector3(0.0, (yb2 + axle3.y) * 0.5 + 0.1, za - ra * 0.9), Vector3(ra * 0.5, (yb2 - axle3.y) * 0.25, 0.012),
			Basis.IDENTITY, Kit.BELLY)
		ground_pitch = 0.0


# ------------------------------------------------------------------ пушки и маркеры

func _build_guns() -> void:
	var wp: Dictionary = def.get("weapons", {})
	var guns: Array = wp.get("guns", [])
	var places: Array = sp.guns
	var gb := 0
	var idx := 0
	for g in guns.size():
		var gun: Dictionary = guns[g]
		var cnt := int(gun.get("count", 1))
		var cal := float(gun.get("caliber", 12.7))
		var place: String = places[mini(g, places.size() - 1)] if places.size() > 0 else "chin"
		var br := clampf(cal * 0.0018, 0.022, 0.07)
		for k in cnt:
			var side := -1.0 if gb % 2 == 0 else 1.0
			var row := float(k / 2)
			var p := Vector3.ZERO
			var back := 0.5
			var kit = body
			match place:
				"cowl":
					var z := nose_z + spinner_len + L * 0.07
					var xx := side * (R * 0.2 + R * 0.14 * row)
					p = Vector3(xx, body_top_at_x(z, xx) - 0.02, z)
					back = 0.45
				"wing", "wing_out":
					var x := R * 1.4 + 0.55 + 0.38 * row + (1.25 if place == "wing_out" else 0.0)
					x = minf(x, semi * 0.7)
					p = Vector3(side * x, _wing_y(x) - 0.02, _wing_le_z(x) - 0.3)
					back = 0.7
					kit = rwing if side > 0 else lwing
				"nose":
					var zn := nose_z + L * 0.035
					var st := body_at(zn)
					var cnt_f := float(cnt)
					var a := PI * 0.25 + TAU * float(k) / maxf(1.0, cnt_f)
					var rr := minf(float(st.w), float(st.ht)) * 0.45
					if cnt == 1:
						rr = 0.0
					p = Vector3(cos(a) * rr * (1.0 if cnt > 1 else 0.0), float(st.y) + sin(a) * rr, zn - 0.25)
					if nose_z + 0.05 > p.z and sp.nose == "gun":
						p.z = nose_z - 0.6
					back = 0.8
				"side":
					var zs := nose_z + L * 0.3
					var st2 := body_at(zs)
					p = Vector3(side * float(st2.w) * 0.9, float(st2.y) - float(st2.hb) * 0.5, zs)
					back = 0.4
				"root":
					var zr := _wing_le_z(wing_root_x) - L * 0.04
					var st3 := body_at(zr)
					p = Vector3(side * float(st3.w) * 1.0, _wing_y(0.0) + R * 0.2, zr)
					back = 0.4
				_:
					var zc := nose_z + L * 0.22
					var st4 := body_at(zc)
					p = Vector3(side * (R * 0.3 + R * 0.18 * row), float(st4.y) - float(st4.hb) * 0.75, zc)
					back = 0.4
			markers["Muzzle%d" % idx] = p
			if place != "nose" or sp.nose != "gun" or k == 0:
				kit.rod(p, p + Vector3(0, 0, back), br, 6, Kit.METAL_DARK)
			idx += 1
			gb += 1
	if idx == 0:
		markers["Muzzle0"] = Vector3(0, 0, nose_z)


func _build_markers() -> void:
	markers["Cockpit"] = Vector3(0, eye_y, cockpit_z)
	var xt := semi
	var ct := _wing_chord(xt)
	markers["WingTipL"] = Vector3(-xt - markers_tip_offset, _wing_y(xt), _wing_le_z(xt) + ct * 0.6)
	markers["WingTipR"] = Vector3(xt + markers_tip_offset, _wing_y(xt), _wing_le_z(xt) + ct * 0.6)
	var i := 0
	for p in _pylon_positions():
		markers["Pylon%d" % i] = p
		i += 1
	if not markers.has("Engine0"):
		markers["Engine0"] = Vector3(0, 0, tail_z)


# ------------------------------------------------------------------ знаки и номер

## Положение на поверхности панели: d — расстояние по размаху от корня, z — по хорде.
func _sec_axis(secs: Array) -> Vector3:
	var a: Dictionary = secs[0]
	var b: Dictionary = secs[secs.size() - 1]
	var d: Vector3 = (b.le as Vector3) - (a.le as Vector3)
	d.z = 0.0
	return d.normalized()


func _surf(secs: Array, d: float, z: float, top: bool, diamond: bool) -> Array:
	var ax := _sec_axis(secs)
	var base: Vector3 = (secs[0] as Dictionary).le
	var s := 0.0
	var found := false
	for i in secs.size() - 1:
		var da := ((secs[i] as Dictionary).le as Vector3 - base).dot(ax)
		var db := ((secs[i + 1] as Dictionary).le as Vector3 - base).dot(ax)
		if d >= da and d <= db:
			s = float(i) + (d - da) / maxf(1e-5, db - da)
			found = true
			break
	if not found:
		s = float(secs.size() - 1) - 0.001
	var sec := Kit.section_at(secs, s)
	var c := (sec.cv as Vector3).length()
	var xf := clampf((z - (sec.le as Vector3).z) / c, 0.0, 1.0)
	var p := Kit.section_point(sec, xf, top, diamond)
	var nrm: Vector3 = (sec.up as Vector3) * (1.0 if top else -1.0)
	return [p, nrm]


func _decal_disc(secs: Array, dc: float, zc: float, r: float, top: bool, diamond: bool, kit) -> void:
	var segs := 16
	var off := 0.012
	var cen: Array = _surf(secs, dc, zc, top, diamond)
	var cpos: Vector3 = cen[0] + (cen[1] as Vector3) * off
	var nrm: Vector3 = cen[1]
	var outer := PackedVector3Array()
	var inner := PackedVector3Array()
	for k in segs:
		var a := TAU * float(k) / float(segs)
		var po: Array = _surf(secs, dc + cos(a) * r, zc + sin(a) * r, top, diamond)
		var pi_: Array = _surf(secs, dc + cos(a) * r * 0.58, zc + sin(a) * r * 0.58, top, diamond)
		outer.append(po[0] + (po[1] as Vector3) * off)
		inner.append(pi_[0] + (pi_[1] as Vector3) * off)
	for k in segs:
		var k2 := (k + 1) % segs
		kit.tri(outer[k], outer[k2], inner[k2], nrm, nrm, nrm, Kit.ACCENT)
		kit.tri(outer[k], inner[k2], inner[k], nrm, nrm, nrm, Kit.ACCENT)
	kit.cap(inner, cpos, nrm, Kit.WHITE)


func _body_decal(stations: Array, zc: float, side: float, r: float, kit) -> void:
	var segs := 12
	var st := station_at(stations, zc)
	var a_c := 0.0 if side > 0 else PI
	var a_up := 0.12
	var rad: float = maxf(0.2, (float(st.w) + float(st.ht)) * 0.5)
	var off := 0.014
	var cen := ring_point(st, a_c + a_up * side)
	var center3 := Vector3(float(st.x), float(st.y), zc)
	var nrm := (cen - center3)
	nrm.z = 0.0
	nrm = nrm.normalized()
	var outer := PackedVector3Array()
	var inner := PackedVector3Array()
	for k in segs:
		var t := TAU * float(k) / float(segs)
		for pass_i in 2:
			var rr := r if pass_i == 0 else r * 0.58
			var z := zc + cos(t) * rr
			var s2 := station_at(stations, z)
			var ang := a_c + side * (a_up + sin(t) * rr / rad)
			var p := ring_point(s2, ang)
			var c3 := Vector3(float(s2.x), float(s2.y), z)
			var nn := (p - c3)
			nn.z = 0.0
			p += nn.normalized() * off
			if pass_i == 0:
				outer.append(p)
			else:
				inner.append(p)
	for k in segs:
		var k2 := (k + 1) % segs
		kit.tri(outer[k], outer[k2], inner[k2], nrm, nrm, nrm, Kit.ACCENT)
		kit.tri(outer[k], inner[k2], inner[k], nrm, nrm, nrm, Kit.ACCENT)
	kit.cap(inner, cen + nrm * off, nrm, Kit.WHITE)


const DIGITS := {0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abfgcd"}


func _digit_rects(ch: int, dw: float, dh: float, s: float) -> Array:
	var segs: String = DIGITS.get(ch, "")
	var out: Array = []
	var m := dh * 0.5
	for c in segs:
		match c:
			"a": out.append([0.0, dh - s, dw, dh])
			"b": out.append([dw - s, m, dw, dh])
			"c": out.append([dw - s, 0.0, dw, m])
			"d": out.append([0.0, 0.0, dw, s])
			"e": out.append([0.0, 0.0, s, m])
			"f": out.append([0.0, m, s, dh])
			"g": out.append([0.0, m - s * 0.5, dw, m + s * 0.5])
	return out


func _number_on(secs: Array, top: bool, d_c: float, diamond: bool, kit, number: int, height: float) -> void:
	var dh := height
	var dw := dh * 0.56
	var s := dh * 0.16
	var gap := dw * 0.3
	var total := dw * 2.0 + gap
	var mid := Kit.section_at(secs, float(secs.size() - 1) * 0.4)
	var zc := (mid.le as Vector3).z + (mid.cv as Vector3).length() * 0.5
	# слева направо для смотрящего: с правого борта это к носу (-z)
	var rdir := -1.0 if top else 1.0
	if (secs[0] as Dictionary).up is Vector3 and ((secs[0] as Dictionary).up as Vector3).x < 0.0:
		rdir = -rdir
	var digits := [number / 10, number % 10]
	for di in 2:
		var x0 := -total * 0.5 + float(di) * (dw + gap)
		for rc in _digit_rects(digits[di], dw, dh, s):
			var corners := [[rc[0], rc[1]], [rc[2], rc[1]], [rc[2], rc[3]], [rc[0], rc[3]]]
			var pts: Array = []
			var nrm := Vector3.ZERO
			for cc in corners:
				var u: float = x0 + float(cc[0])
				var vv: float = float(cc[1]) - dh * 0.5
				var res: Array = _surf(secs, d_c + vv, zc + u * rdir, top, diamond)
				nrm = res[1]
				pts.append(res[0] + nrm * 0.014)
			kit.quad(pts[0], pts[1], pts[2], pts[3], nrm, Kit.NUMBER)


func _build_decals() -> void:
	var w: Dictionary = sp.wing
	var diamond: bool = w.flat
	var plan: String = w.plan
	var xe := semi * (0.55 if plan == "delta" else 0.66)
	for side: float in [-1.0, 1.0]:
		var secs: Array = wing_secs_r if side > 0 else wing_secs_l
		var kit = rwing if side > 0 else lwing
		var c := _wing_chord(xe)
		var r := minf(c * 0.3, 0.9)
		if plan == "delta":
			r = minf(c * 0.24, 0.8)
		var zc := _wing_le_z(xe) + c * 0.5
		var dc := xe - wing_root_x
		_decal_disc(secs, dc, zc, r, true, diamond, kit)
		_decal_disc(secs, dc, zc, r, false, diamond, kit)
	var em: Dictionary = sp.emblem
	var on: String = em.on
	var number := 10 + (absi(String(def.get("id", "x")).hash()) % 90)
	var fin: Dictionary = sp.fin
	var fh := float(fin.h) * L
	match on:
		"body":
			var ze := nose_z + float(em.t) * L
			var st := body_at(ze)
			var r2 := minf(float(st.w), float(st.ht)) * 0.62
			for side: float in [-1.0, 1.0]:
				_body_decal(rings, ze, side, r2, body)
		"nacelle":
			if nacelle_lofts.size() > 0:
				var sts: Array = nacelle_lofts[0]
				var nz0 := float((sts[0] as Dictionary).z)
				var nz1 := float((sts[sts.size() - 1] as Dictionary).z)
				var ze2 := lerpf(nz0, nz1, float(em.t))
				var st2 := station_at(sts, ze2)
				var r3 := minf(float(st2.w), float(st2.ht)) * 0.6
				_body_decal(sts, ze2, 1.0, r3, body)
				var mirrored: Array = []
				for s in sts:
					var m: Dictionary = (s as Dictionary).duplicate()
					m.x = -float(s.x)
					mirrored.append(m)
				_body_decal(mirrored, ze2, -1.0, r3, body)
	var fflat: bool = fin.get("flat", false)
	for fs in fin_secs:
		var secs2: Array = fs[0]
		var side2: float = fs[1]
		var ln := fh + float(fin.get("below", 0.0)) * L
		var below := float(fin.get("below", 0.0)) * L
		var nh := clampf(fh * 0.2, 0.25, 0.6)
		var sides: Array = [true, false] if side2 == 0.0 else [true]
		for top in sides:
			if on == "fin":
				var mid := Kit.section_at(secs2, float(secs2.size() - 1) * 0.6)
				var zc2 := (mid.le as Vector3).z + (mid.cv as Vector3).length() * 0.5
				var rr := clampf(fh * 0.14, 0.25, 0.55)
				_decal_disc(secs2, below + fh * 0.62, zc2, rr, top, fflat, tail)
				_number_on(secs2, top, below + fh * 0.3, fflat, tail, number, nh)
			else:
				var hpos := 0.42
				var stab: Dictionary = sp.stab
				if not stab.is_empty() and float(stab.get("on_fin", -1.0)) >= 0.0:
					hpos = 0.18
					nh = minf(nh, fh * 0.16)
				_number_on(secs2, top, below + ln * hpos, fflat, tail, number, nh)


# ------------------------------------------------------------------ сборка

func _finish() -> Dictionary:
	var meshes := {}
	var pivots := {}
	var skin: Material = AircraftMeshBuilder.material("skin")
	var parts := {"Body": body, "LeftWing": lwing, "RightWing": rwing, "Tail": tail, "Gear": gear}
	var piv := {"Body": Vector3.ZERO, "Gear": Vector3.ZERO}
	var wz := float(sh.get("wing_z", 0.0))
	piv["LeftWing"] = Vector3(-wing_root_x, _wing_y(0.0), wz)
	piv["RightWing"] = Vector3(wing_root_x, _wing_y(0.0), wz)
	var tb: AABB = tail.bounds()
	piv["Tail"] = tb.get_center()
	var tris := 0
	for name in parts:
		var kit = parts[name]
		var pv: Vector3 = piv[name]
		paint.prepare(kit, name, self)
		var mesh: ArrayMesh = kit.to_mesh(paint.painter(name), skin)
		if mesh != null and pv != Vector3.ZERO:
			mesh = _shifted(mesh, -pv)
		meshes[name] = mesh
		pivots[name] = pv
		tris += kit.tri_count()
	meshes["Canopy"] = glass.to_mesh(func(_t: int, _c: Vector3, _n: Vector3) -> Color: return Color(1, 1, 1),
		AircraftMeshBuilder.material("glass"))
	tris += glass.tri_count()
	if prop_kit.tri_count() > 0:
		meshes["Prop"] = prop_kit.to_mesh(paint.painter("Prop"), skin)
		meshes["Spinner"] = spinner_kit.to_mesh(paint.painter("Prop"), skin)
		tris += spinner_kit.tri_count() * props.size()
		meshes["PropBlur"] = blur_kit.to_mesh(func(tag: int, _c: Vector3, _n: Vector3) -> Color:
			return Color(0.9, 0.78, 0.25, 0.22) if tag == Kit.PROP_TIP else Color(0.08, 0.08, 0.08, 0.16),
			AircraftMeshBuilder.material("blur"))
		tris += prop_kit.tri_count() * props.size()
	var flames: Array = []
	for nzd in nozzles:
		var nz: Dictionary = nzd
		flames.append({"pos": nz.pos, "r": float(nz.r), "flat": bool(nz.flat)})
	return {"meshes": meshes, "pivots": pivots, "markers": markers, "props": props, "flames": flames,
		"ground_pitch": ground_pitch, "tris": tris, "main_contact": main_contact, "wheels": wheels}


func _shifted(mesh: ArrayMesh, off: Vector3) -> ArrayMesh:
	var arr := mesh.surface_get_arrays(0)
	var vs: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	for k in vs.size():
		vs[k] += off
	arr[Mesh.ARRAY_VERTEX] = vs
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	m.surface_set_material(0, mesh.surface_get_material(0))
	return m
