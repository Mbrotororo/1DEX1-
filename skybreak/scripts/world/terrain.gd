extends RefCounted
## Рельеф карты: функция высоты, сетка высот и меш.
## Сетка неравномерная: внутри карты шаг 50 м, за краем шаг растёт до ~2 км (до 20 км от центра).
## height_at() интерполирует по тем же треугольникам, что и меш, поэтому физика совпадает с картинкой.

const INNER := 5000.0
const STEP := 50.0
const OUTER_LIMIT := 20000.0
const OUTER_GROWTH := 1.16

# Плоские площадки под аэродромы и базы: {c:Vector2, f:Vector2 (вдоль), r:Vector2 (поперёк),
#   half_len, half_wid, blend, h}
var pads: Array = []
var map_id: String = "canyon"
var biome: String = "desert"
var xs := PackedFloat32Array()     # координаты узлов сетки (одинаковы по X и Z)
var n: int = 0
var heights := PackedFloat32Array()
var min_h: float = 0.0
var max_h: float = 0.0

var _lo := FastNoiseLite.new()
var _hi := FastNoiseLite.new()
var _ridge := FastNoiseLite.new()
var _mesas: Array = []
var _islands: Array = []

static var _cache: Dictionary = {}

# ---------------------------------------------------------------- данные карт

# Столовые горы каньона: [x, z, rx, rz, высота, поворот]
const CANYON_MESAS := [
	[-2700.0, 1800.0, 650.0, 450.0, 180.0, 0.3],
	[2300.0, -1650.0, 750.0, 480.0, 200.0, -0.4],
	[3800.0, 1500.0, 520.0, 400.0, 160.0, 0.9],
	[-3700.0, -2250.0, 600.0, 480.0, 175.0, 0.1],
	[-700.0, 2000.0, 420.0, 320.0, 140.0, 0.6],
	[1300.0, 1650.0, 360.0, 280.0, 130.0, -0.2],
	[-250.0, -820.0, 480.0, 360.0, 150.0, 0.4],
	[700.0, -2600.0, 380.0, 320.0, 150.0, 0.0],
	[4300.0, -3600.0, 560.0, 440.0, 190.0, 0.5],
	[-4400.0, 3700.0, 520.0, 420.0, 170.0, -0.6],
	[-2000.0, -2850.0, 300.0, 250.0, 120.0, 0.2],
	[3400.0, 3700.0, 450.0, 340.0, 160.0, 1.2],
	[-4500.0, 900.0, 360.0, 450.0, 150.0, 0.0],
	[4500.0, -1100.0, 380.0, 480.0, 170.0, 0.7],
]

# Острова рифа: [x, z, rx, rz, поворот, высота пика, смещение пика x, z]
const REEF_ISLANDS := [
	[0.0, -3650.0, 1350.0, 1900.0, 0.0, 170.0, 650.0, 500.0],     # красный аэродром
	[-2350.0, 2900.0, 1150.0, 950.0, 0.4, 120.0, -350.0, 250.0],  # синяя база
	[-2900.0, 250.0, 680.0, 520.0, 0.2, 95.0, 120.0, -60.0],      # A
	[250.0, -250.0, 900.0, 600.0, -0.3, 230.0, 200.0, 50.0],      # B
	[2950.0, 450.0, 620.0, 560.0, 0.8, 75.0, -100.0, 80.0],       # C
	[1800.0, -1500.0, 260.0, 200.0, 0.0, 40.0, 0.0, 0.0],
	[-1200.0, -1700.0, 300.0, 220.0, 1.0, 55.0, 0.0, 0.0],
	[3900.0, 2400.0, 350.0, 260.0, 0.3, 60.0, 0.0, 0.0],
	[-4300.0, -1300.0, 400.0, 300.0, 0.6, 85.0, 0.0, 0.0],
	[1400.0, 1700.0, 220.0, 180.0, 0.0, 30.0, 0.0, 0.0],
	[4200.0, -2600.0, 300.0, 380.0, 0.2, 70.0, 0.0, 0.0],
]

# ---------------------------------------------------------------- общие формы

## Ось каньона: z реки в зависимости от x.
static func canyon_z(x: float) -> float:
	return 380.0 * sin(x / 1500.0 + 0.6) + 170.0 * sin(x / 640.0 + 1.9) - 50.0

## Ось фьорда.
static func fjord_z(x: float) -> float:
	return -150.0 + 320.0 * sin(x / 1400.0 + 0.4) + 90.0 * sin(x / 530.0 + 1.1)

const FJORD_END := 3700.0

static func fjord_half_width(x: float) -> float:
	var w := 430.0 + 110.0 * sin(x / 760.0 + 0.8)
	if x < -INNER:
		w += (-INNER - x) * 0.45
	return w

## Расстояние до оси фьорда (с закруглённым концом).
static func fjord_dist(x: float, z: float) -> float:
	if x <= FJORD_END:
		return absf(z - fjord_z(x))
	var ez := fjord_z(FJORD_END)
	return Vector2(x - FJORD_END, z - ez).length()

# ---------------------------------------------------------------- настройка

func setup(p_map_id: String, layout: Dictionary) -> void:
	map_id = p_map_id
	match map_id:
		"fjord":
			biome = "winter"
		"reef":
			biome = "ocean"
		_:
			map_id = "canyon"
			biome = "desert"
	var base_seed := {"canyon": 1301, "fjord": 2702, "reef": 3803}[map_id] as int
	_lo.seed = base_seed
	_lo.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_lo.frequency = 0.00042
	_lo.fractal_type = FastNoiseLite.FRACTAL_FBM
	_lo.fractal_octaves = 3
	_hi.seed = base_seed + 11
	_hi.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_hi.frequency = 0.0021
	_hi.fractal_type = FastNoiseLite.FRACTAL_FBM
	_hi.fractal_octaves = 2
	_ridge.seed = base_seed + 23
	_ridge.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_ridge.frequency = 0.00036
	_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	_ridge.fractal_octaves = 4
	_ridge.fractal_gain = 0.45
	_prepare_shapes()
	_prepare_pads(layout)
	_build_grid()

func _prepare_shapes() -> void:
	_mesas.clear()
	_islands.clear()
	var rng := RandomNumberGenerator.new()
	if map_id == "canyon":
		for m in CANYON_MESAS:
			_mesas.append(_mesa_entry(m))
		# столовые горы за краем карты, для горизонта
		rng.seed = 991
		var placed := 0
		while placed < 34:
			var x := rng.randf_range(-17000.0, 17000.0)
			var z := rng.randf_range(-17000.0, 17000.0)
			if absf(x) < INNER + 900.0 and absf(z) < INNER + 900.0:
				continue
			if absf(z - canyon_z(x)) < 1100.0:
				continue
			var rx := rng.randf_range(500.0, 1400.0)
			_mesas.append(_mesa_entry([x, z, rx, rx * rng.randf_range(0.5, 0.9), rng.randf_range(140.0, 300.0), rng.randf_range(-1.5, 1.5)]))
			placed += 1
	elif map_id == "reef":
		for d in REEF_ISLANDS:
			_islands.append(_island_entry(d))
		rng.seed = 4471
		var placed := 0
		while placed < 12:
			var x := rng.randf_range(-16000.0, 16000.0)
			var z := rng.randf_range(-16000.0, 16000.0)
			if absf(x) < INNER + 1500.0 and absf(z) < INNER + 1500.0:
				continue
			var r := rng.randf_range(500.0, 1600.0)
			_islands.append(_island_entry([x, z, r, r * rng.randf_range(0.5, 0.9), rng.randf_range(-1.5, 1.5), rng.randf_range(80.0, 420.0), r * 0.2, 0.0]))
			placed += 1

func _mesa_entry(m: Array) -> Array:
	var rot: float = m[5]
	var rx: float = m[2]
	var rz: float = m[3]
	return [m[0], m[1], 1.0 / rx, 1.0 / rz, m[4], cos(rot), sin(rot), maxf(rx, rz) * 1.4]

func _island_entry(d: Array) -> Array:
	var rot: float = d[4]
	var rx: float = d[2]
	var rz: float = d[3]
	# [x, z, 1/rx, 1/rz, cos, sin, пик, пик_x, пик_z, радиус отсечки, радиус пика]
	return [d[0], d[1], 1.0 / rx, 1.0 / rz, cos(rot), sin(rot), d[5], d[0] + d[6], d[1] + d[7], maxf(rx, rz) * 1.6, minf(rx, rz) * 0.8]

func _prepare_pads(layout: Dictionary) -> void:
	pads.clear()
	for a in layout.get("airfields", []):
		if String(a.get("kind", "airfield")) != "airfield":
			continue
		var hd: float = a.heading
		var f := Vector2(sin(hd), -cos(hd))
		var r := Vector2(cos(hd), sin(hd))
		var c: Vector2 = a.center
		# полоса по центру, рулёжка и стоянка справа
		var pc := c + r * 135.0
		pads.append({"c": pc, "f": f, "r": r, "half_len": 820.0, "half_wid": 235.0, "blend": 380.0, "h": 0.0,
			"probe": c, "kind": "airfield"})
	for b in layout.get("bases", []):
		var hd: float = b.heading
		pads.append({"c": b.center, "f": Vector2(sin(hd), -cos(hd)), "r": Vector2(cos(hd), sin(hd)),
			"half_len": 190.0, "half_wid": 190.0, "blend": 260.0, "h": 0.0, "probe": b.center, "kind": "base"})
	# высота площадки — по исходному рельефу в её районе
	for p in pads:
		var sum := 0.0
		var cnt := 0
		for i in range(-2, 3):
			for j in range(-2, 3):
				var q: Vector2 = p.c + p.f * (i * p.half_len * 0.4) + p.r * (j * p.half_wid * 0.4)
				sum += raw_height(q.x, q.y)
				cnt += 1
		var h := sum / cnt
		match map_id:
			"canyon":
				h = clampf(h, 90.0, 230.0)
			"fjord":
				h = clampf(h, 40.0, 420.0)
			"reef":
				h = clampf(h, 9.0, 40.0)
		p.h = roundf(h * 2.0) * 0.5

# ---------------------------------------------------------------- функция высоты

func raw_height(x: float, z: float) -> float:
	match map_id:
		"fjord":
			return _fjord(x, z)
		"reef":
			return _reef(x, z)
	return _canyon(x, z)

## Высота с учётом площадок (то, что идёт в сетку).
func height_fn(x: float, z: float) -> float:
	var h := raw_height(x, z)
	for p in pads:
		var d: Vector2 = Vector2(x, z) - p.c
		var u := absf(d.dot(p.f)) - float(p.half_len)
		var v := absf(d.dot(p.r)) - float(p.half_wid)
		var bl: float = p.blend
		if u > bl or v > bl:
			continue
		var dist := Vector2(maxf(u, 0.0), maxf(v, 0.0)).length()
		if dist >= bl:
			continue
		var w := 1.0 - dist / bl
		w = w * w * (3.0 - 2.0 * w)
		h = lerpf(h, float(p.h), w)
	return h

func _canyon(x: float, z: float) -> float:
	var n1 := _lo.get_noise_2d(x, z)
	var n2 := _hi.get_noise_2d(x, z)
	var base := 150.0 + 55.0 * n1
	var h := base + 9.0 * n2
	# дюны
	h += 5.0 * sin((x * 0.8 + z * 0.6) * 0.011 + n1 * 4.0) * (0.5 + 0.5 * n2)
	for m in _mesas:
		var dx: float = x - float(m[0])
		var dz: float = z - float(m[1])
		var lim: float = m[7]
		if dx > lim or dx < -lim or dz > lim or dz < -lim:
			continue
		var c: float = m[5]
		var s: float = m[6]
		var u := (dx * c - dz * s) * float(m[2])
		var v := (dx * s + dz * c) * float(m[3])
		var d := pow(pow(absf(u), 3.0) + pow(absf(v), 3.0), 0.3333) + 0.07 * n2
		if d >= 1.3:
			continue
		# осыпь у подножия, отвесный обрыв, плоская вершина, иногда второй ярус
		var t0 := clampf((1.3 - d) / 0.3, 0.0, 1.0)
		t0 = t0 * t0
		var t1 := clampf((1.0 - d) / 0.09, 0.0, 1.0)
		t1 = t1 * t1 * (3.0 - 2.0 * t1)
		var hm: float = m[4]
		var add := hm * (0.22 * t0 + 0.78 * t1)
		if hm > 165.0:
			var t2 := clampf((0.55 - d) / 0.07, 0.0, 1.0)
			add += hm * 0.3 * t2 * t2 * (3.0 - 2.0 * t2)
		h += add
	# каньон с рекой
	var dzc := absf(z - canyon_z(x))
	var half_top := 380.0 + 80.0 * sin(x / 900.0 + 0.3) + 30.0 * n2
	if dzc < half_top:
		var half_bed := 95.0 + 25.0 * sin(x / 500.0)
		var t := clampf((dzc - half_bed) / (half_top - half_bed), 0.0, 1.0)
		var ts := t * 3.0
		var f := floorf(ts)
		var fr := ts - f
		var st := clampf((fr - 0.45) / 0.4, 0.0, 1.0)
		st = st * st * (3.0 - 2.0 * st)
		var terr := minf((f + st) / 3.0, 1.0)
		var hc := lerpf(4.0, h, terr)
		if dzc < half_bed:
			hc = -16.0 + 20.0 * pow(dzc / half_bed, 3.0)
		h = minf(h, hc)
	return h

## Высота «столовых» мест в каньоне относительно равнины (для цвета).
func canyon_base(x: float, z: float) -> float:
	return 150.0 + 55.0 * _lo.get_noise_2d(x, z)

func _fjord(x: float, z: float) -> float:
	var n1 := _lo.get_noise_2d(x, z)
	var n2 := _hi.get_noise_2d(x, z)
	var r := _ridge.get_noise_2d(x, z) * 0.5 + 0.5
	var d := fjord_dist(x, z)
	var hw := fjord_half_width(x)
	var side := 1.0 if z > fjord_z(minf(x, FJORD_END)) else -1.0
	# хребты вдоль фьорда, долины за ними, внешние горы
	var dr := 1450.0 + 350.0 * sin(x / 1700.0 + side * 1.3)
	var big := 950.0 + 380.0 * _lo.get_noise_2d(x * 0.6 + side * 3100.0, side * 900.0)
	var ridge := big * exp(-pow((d - dr) / 900.0, 2.0))
	var outer := 1150.0 * smoothstep(3900.0, 6200.0, d) * (0.8 + 0.3 * n1)
	var mount := maxf(ridge, outer)
	var valley := 230.0 + 60.0 * n1
	var detail := pow(r, 1.6) * 420.0 * (0.12 + 0.88 * clampf(mount / 800.0, 0.0, 1.0))
	var land := valley + mount + detail + 18.0 * n2
	# долины под аэродромы и базы
	var mask := 1.0
	for p in pads:
		var pc: Vector2 = p.probe
		var dd := (x - pc.x) * (x - pc.x) + (z - pc.y) * (z - pc.y)
		var rad := 1400.0 if p.kind == "airfield" else 900.0
		mask = minf(mask, 1.0 - exp(-dd / (rad * rad)))
	land = lerpf(valley + detail * 0.15, land, mask)
	# снижение к морю на западе
	if x < -INNER:
		land = lerpf(land, 90.0 + 50.0 * n1, clampf((-INNER - x) / 6000.0, 0.0, 0.85))
	if d < hw:
		var k := d / hw
		return -75.0 * (1.0 - k * k) - 5.0 + 2.0 * n2
	# берег: пляж, полоса ровного берега (дорога), потом крутой склон
	var e := d - hw
	var terrace_w := 260.0 + 140.0 * n1
	if e < 60.0:
		return lerpf(-5.0, 6.0, e / 60.0)
	if e < 60.0 + terrace_w:
		return 6.0 + 10.0 * (e - 60.0) / terrace_w + 3.0 * n2
	var t := clampf((e - 60.0 - terrace_w) / 950.0, 0.0, 1.0)
	t = pow(t, 0.8)
	t = t * t * (3.0 - 2.0 * t)
	return lerpf(16.0 + 3.0 * n2, land, t)

func _reef(x: float, z: float) -> float:
	var n1 := _lo.get_noise_2d(x, z)
	var n2 := _hi.get_noise_2d(x, z)
	var h := -58.0 + 12.0 * n1
	for it in _islands:
		var dx: float = x - float(it[0])
		var dz: float = z - float(it[1])
		var lim: float = it[9]
		if dx > lim or dx < -lim or dz > lim or dz < -lim:
			continue
		var c: float = it[4]
		var s: float = it[5]
		var u := (dx * c - dz * s) * float(it[2])
		var v := (dx * s + dz * c) * float(it[3])
		var d := sqrt(u * u + v * v) + 0.16 * n2 + 0.06 * n1
		if d > 1.6:
			continue
		# риф вокруг, пляж, холмы
		var shelf := clampf((1.55 - d) / 0.45, 0.0, 1.0)
		shelf = shelf * shelf * (3.0 - 2.0 * shelf)
		var hi := lerpf(-58.0, -2.5, shelf)
		var beach := clampf((1.04 - d) / 0.16, 0.0, 1.0)
		beach = beach * beach * (3.0 - 2.0 * beach)
		hi = lerpf(hi, 4.0, beach)
		var px: float = x - float(it[7])
		var pz: float = z - float(it[8])
		var pr: float = it[10]
		var hill := exp(-(px * px + pz * pz) / (pr * pr))
		var inner := clampf((1.0 - d) / 0.5, 0.0, 1.0)
		hi += (float(it[6]) * hill + 22.0 * inner * (0.6 + 0.4 * n2)) * beach
		h = maxf(h, hi)
	return h

# ---------------------------------------------------------------- сетка

func _make_coords() -> PackedFloat32Array:
	var outer: Array = []
	var stp := STEP * 1.2
	var x := INNER
	while x < OUTER_LIMIT:
		x += stp
		outer.append(minf(x, OUTER_LIMIT))
		stp *= OUTER_GROWTH
	var out := PackedFloat32Array()
	for i in range(outer.size() - 1, -1, -1):
		out.append(-float(outer[i]))
	var cells := int(round(2.0 * INNER / STEP))
	for i in cells + 1:
		out.append(-INNER + i * STEP)
	for v in outer:
		out.append(float(v))
	return out

func _build_grid() -> void:
	var key := map_id
	if _cache.has(key):
		var c: Dictionary = _cache[key]
		xs = c.xs
		heights = c.heights
		n = xs.size()
		min_h = c.min_h
		max_h = c.max_h
		return
	xs = _make_coords()
	n = xs.size()
	heights = PackedFloat32Array()
	heights.resize(n * n)
	var mn := INF
	var mx := -INF
	var idx := 0
	for iz in n:
		var z := xs[iz]
		for ix in n:
			var h := height_fn(xs[ix], z)
			heights[idx] = h
			idx += 1
			if h < mn:
				mn = h
			if h > mx:
				mx = h
	min_h = mn
	max_h = mx
	_cache[key] = {"xs": xs, "heights": heights, "min_h": mn, "max_h": mx}

## Индекс ячейки по координате: i такое, что xs[i] <= v < xs[i+1].
func _cell(v: float) -> int:
	var i := xs.bsearch(v, true) - 1
	return clampi(i, 0, n - 2)

func height_at(x: float, z: float) -> float:
	if n < 2:
		return 0.0
	if x <= xs[0] or x >= xs[n - 1] or z <= xs[0] or z >= xs[n - 1]:
		return raw_height(x, z)
	var ix := _cell(x)
	var iz := _cell(z)
	var x0 := xs[ix]
	var z0 := xs[iz]
	var fx := (x - x0) / (xs[ix + 1] - x0)
	var fz := (z - z0) / (xs[iz + 1] - z0)
	var b := iz * n + ix
	var h00 := heights[b]
	var h11 := heights[b + n + 1]
	# диагональ 00-11, как в меше
	if fx >= fz:
		var h10 := heights[b + 1]
		return h00 + (h10 - h00) * fx + (h11 - h10) * fz
	var h01 := heights[b + n]
	return h00 + (h01 - h00) * fz + (h11 - h01) * fx

func normal_at(x: float, z: float) -> Vector3:
	var e := 8.0
	var dx := height_at(x + e, z) - height_at(x - e, z)
	var dz := height_at(x, z + e) - height_at(x, z - e)
	return Vector3(-dx, 2.0 * e, -dz).normalized()

## 0 — ровно, 1 — вертикально.
func slope_at(x: float, z: float) -> float:
	return 1.0 - normal_at(x, z).y

# ---------------------------------------------------------------- цвет

## Цвет вершины по высоте, уклону и биому. alpha — доля цвета текстуры.
func color_for(x: float, z: float, h: float, ny: float) -> Color:
	var slope := 1.0 - ny
	var nz := _hi.get_noise_2d(x * 1.7, z * 1.7)
	match biome:
		"winter":
			return _color_winter(x, z, h, slope, nz)
		"ocean":
			return _color_ocean(x, z, h, slope, nz)
	return _color_desert(x, z, h, slope, nz)

func _color_desert(x: float, z: float, h: float, slope: float, nz: float) -> Color:
	var sand := Color(0.80, 0.62, 0.44).lerp(Color(0.87, 0.71, 0.52), 0.5 + 0.5 * nz)
	var c := sand
	# слои породы на склонах
	var band := 0.5 + 0.5 * sin(h * 0.13 + nz * 1.5)
	var rock := Color(0.66, 0.34, 0.21).lerp(Color(0.80, 0.55, 0.38), band * 0.8)
	rock = rock.lerp(Color(0.50, 0.24, 0.14), clampf((slope - 0.45) * 2.0, 0.0, 0.6))
	var rw := clampf((slope - 0.10) / 0.22, 0.0, 1.0)
	c = c.lerp(rock, rw)
	# плоские вершины столовых гор — тёмный красный камень
	var above := h - canyon_base(x, z)
	if above > 80.0:
		var cap := Color(0.66, 0.40, 0.27).lerp(Color(0.58, 0.33, 0.22), 0.5 + 0.5 * nz)
		c = c.lerp(cap, clampf((above - 80.0) / 40.0, 0.0, 0.85) * (1.0 - rw * 0.5))
	# берег реки
	if h < 10.0:
		var wet := Color(0.55, 0.40, 0.27)
		var green := Color(0.38, 0.42, 0.20)
		var t := clampf((10.0 - h) / 10.0, 0.0, 1.0)
		c = c.lerp(green if nz > -0.1 else wet, t * (1.0 - rw * 0.6))
	c.a = 0.18
	return c

func _color_winter(x: float, z: float, h: float, slope: float, nz: float) -> Color:
	var snow := Color(0.86, 0.89, 0.94).lerp(Color(0.78, 0.83, 0.91), 0.5 + 0.5 * nz)
	var rock := Color(0.38, 0.36, 0.35).lerp(Color(0.26, 0.25, 0.25), clampf((slope - 0.4) * 2.0, 0.0, 1.0))
	var c := snow
	var rw := clampf((slope - 0.12 - 0.06 * nz) / 0.16, 0.0, 1.0)
	c = c.lerp(rock, rw)
	if h < 380.0 and h > 6.0:
		# хвойный лес в низинах (пятнами)
		var forest := Color(0.17, 0.24, 0.19)
		var f := clampf((0.15 + nz) * 2.5, 0.0, 1.0) * clampf((380.0 - h) / 120.0, 0.0, 1.0) * (1.0 - rw)
		c = c.lerp(forest, f * 0.55)
	if h < 8.0:
		c = c.lerp(Color(0.42, 0.41, 0.40), clampf((8.0 - h) / 8.0, 0.0, 1.0))
	c.a = 0.25
	return c

func _color_ocean(x: float, z: float, h: float, slope: float, nz: float) -> Color:
	var c: Color
	if h < 0.0:
		c = Color(0.78, 0.74, 0.56).lerp(Color(0.32, 0.42, 0.40), clampf(-h / 25.0, 0.0, 1.0))
		c.a = 0.0
		return c
	var grass := Color(0.30, 0.44, 0.20).lerp(Color(0.22, 0.36, 0.17), 0.5 + 0.5 * nz)
	var rock := Color(0.50, 0.47, 0.41)
	c = grass
	var rw := clampf((slope - 0.22) / 0.25, 0.0, 1.0)
	c = c.lerp(rock, rw)
	var tex_w := 0.65 * (1.0 - rw * 0.5)
	if h < 6.0:
		var t := clampf((6.0 - h) / 3.5, 0.0, 1.0)
		c = c.lerp(Color(0.91, 0.84, 0.64), t)
		tex_w *= 1.0 - t
	c.a = tex_w
	return c

# ---------------------------------------------------------------- меш

## Меш рельефа. stride: 1 — каждая точка сетки, 2 — через одну (низкая графика).
## Под водой глубже skip_below треугольники не строятся (их закрывает вода).
func build_mesh(stride: int, skip_below: float = -40.0) -> ArrayMesh:
	var ids := PackedInt32Array()
	# индексы узлов, которые используем (центральный узел -INNER всегда попадает в сетку)
	var center := n / 2
	var picked: Array = []
	var i := center
	while i >= 0:
		picked.push_front(i)
		i -= stride
	if picked[0] != 0:
		picked.push_front(0)
	i = center + stride
	while i < n:
		picked.append(i)
		i += stride
	if picked[picked.size() - 1] != n - 1:
		picked.append(n - 1)
	for v in picked:
		ids.append(int(v))
	var m := ids.size()
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var cols := PackedColorArray()
	verts.resize(m * m)
	norms.resize(m * m)
	cols.resize(m * m)
	var k := 0
	for a in m:
		var iz := ids[a]
		var z := xs[iz]
		var izm := ids[maxi(a - 1, 0)]
		var izp := ids[mini(a + 1, m - 1)]
		for b in m:
			var ix := ids[b]
			var x := xs[ix]
			var h := heights[iz * n + ix]
			verts[k] = Vector3(x, h, z)
			var ixm := ids[maxi(b - 1, 0)]
			var ixp := ids[mini(b + 1, m - 1)]
			var dx := (heights[iz * n + ixp] - heights[iz * n + ixm]) / maxf(xs[ixp] - xs[ixm], 1.0)
			var dz := (heights[izp * n + ix] - heights[izm * n + ix]) / maxf(xs[izp] - xs[izm], 1.0)
			var nrm := Vector3(-dx, 1.0, -dz).normalized()
			norms[k] = nrm
			cols[k] = color_for(x, z, h, nrm.y)
			k += 1
	var idx := PackedInt32Array()
	idx.resize((m - 1) * (m - 1) * 6)
	var t := 0
	for a in m - 1:
		for b in m - 1:
			var v00 := a * m + b
			var v10 := v00 + 1
			var v01 := v00 + m
			var v11 := v01 + 1
			if verts[v00].y < skip_below and verts[v10].y < skip_below and verts[v01].y < skip_below and verts[v11].y < skip_below:
				continue
			# диагональ 00-11; обход против часовой сверху
			idx[t] = v00
			idx[t + 1] = v10
			idx[t + 2] = v11
			idx[t + 3] = v00
			idx[t + 4] = v11
			idx[t + 5] = v01
			t += 6
	idx.resize(t)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh

## Карта глубин для воды: r = мелководье (1 у берега, 0 на глубине), g = суша.
func depth_image(size: int, extent: float) -> Image:
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	for py in size:
		var z := -extent + (py + 0.5) * 2.0 * extent / size
		for px in size:
			var x := -extent + (px + 0.5) * 2.0 * extent / size
			var h := height_at(x, z)
			var shallow := clampf(1.0 + h / 22.0, 0.0, 1.0)
			var land := 1.0 if h > 0.0 else 0.0
			img.set_pixel(px, py, Color(shallow, land, 0.0, 1.0))
	return img
