extends RefCounted
## Окраска: камуфляж вершинными цветами. Поверхность режется по линиям рисунка,
## поэтому края пятен чёткие при низкой плотности сетки.

const Kit = preload("res://scripts/aircraft/mesh_kit.gd")

const DARK := Color(0.035, 0.04, 0.045)
const METAL := Color(0.44, 0.43, 0.41)
const METAL_DARK := Color(0.17, 0.165, 0.16)
const SOOT := Color(0.13, 0.11, 0.1)
const TIRE := Color(0.075, 0.075, 0.075)
const HUB := Color(0.58, 0.59, 0.58)
const PROP := Color(0.09, 0.09, 0.09)
const PROP_TIP := Color(0.95, 0.78, 0.12)
const PILOT := Color(0.2, 0.2, 0.19)
const ACCENT := Color(0.93, 0.43, 0.13)
const WHITE := Color(0.95, 0.95, 0.93)
const ANTIGLARE := Color(0.12, 0.13, 0.14)

var base: Color
var second: Color
var belly: Color
var pattern: String
var number_col: Color
var frame_col: Color
var radome_col: Color
var antiglare: Color
var cell: float
var salt: float
var waves: Array = []
var stripe_dir: Vector3
var stripe_dir2: Vector3
var stripe_p: float

# только для фюзеляжа
var z_radome := -1.0e9
var ag_z0 := 1.0e9
var ag_z1 := -1.0e9


func _init(def: Dictionary, camo: Dictionary, length: float, span: float) -> void:
	var cols: Array = camo.get("colors", [])
	var bc: Color = def.get("shape", {}).get("base_color", Color(0.5, 0.5, 0.5))
	base = cols[0] if cols.size() > 0 else bc
	second = cols[1] if cols.size() > 1 else base.darkened(0.25)
	belly = cols[2] if cols.size() > 2 else base.lightened(0.2)
	pattern = String(camo.get("pattern", "solid"))
	number_col = Color(0.93, 0.93, 0.9) if base.get_luminance() < 0.5 else Color(0.12, 0.12, 0.13)
	frame_col = base.darkened(0.35)
	radome_col = base.lerp(Color(0.3, 0.31, 0.31), 0.55)
	antiglare = base.darkened(0.5).lerp(ANTIGLARE, 0.3)
	var rng := RandomNumberGenerator.new()
	rng.seed = absi(String(def.get("id", "plane")).hash()) + absi(String(camo.get("id", "c")).hash()) * 7
	salt = rng.randf() * 100.0
	cell = clampf(length / 5.5, 1.3, 3.6)
	var wl := clampf(length / 3.2, 2.2, 6.0)
	for k in 3:
		var d := Vector3(rng.randf_range(-1, 1), rng.randf_range(-1, 1), rng.randf_range(-1, 1)).normalized()
		waves.append([d * TAU / (wl * (1.0 + 0.35 * float(k))), rng.randf() * TAU, 1.0 - 0.25 * float(k)])
	stripe_dir = Vector3(0.62, 0.3, 0.72).normalized()
	stripe_dir2 = Vector3(-0.4, 0.8, 0.45).normalized()
	stripe_p = clampf(length / 4.5, 1.4, 4.0)


static func _hash(i: int, j: int, s: float) -> float:
	var v := sin(float(i) * 127.1 + float(j) * 311.7 + s * 17.3) * 43758.5453
	return v - floor(v)


func belly_field(_p: Vector3, n: Vector3) -> float:
	return -(n.y + 0.3)


## > 0 — второй цвет.
func pattern_field(p: Vector3, _n: Vector3) -> float:
	match pattern:
		"splinter":
			var u := p.z / cell
			var v := (p.x + p.y * 0.9) / cell
			var ci := int(floor(u))
			var cj := int(floor(v))
			var db := 1.0e9
			var ds := 1.0e9
			for di in range(-1, 2):
				for dj in range(-1, 2):
					var i := ci + di
					var j := cj + dj
					var su := float(i) + 0.5 + (_hash(i, j, salt) - 0.5) * 0.8
					var sv := float(j) + 0.5 + (_hash(i, j, salt + 3.1) - 0.5) * 0.8
					var d := (u - su) * (u - su) + (v - sv) * (v - sv)
					if _hash(i, j, salt + 7.7) < 0.46:
						ds = minf(ds, d)
					else:
						db = minf(db, d)
			return clampf(db - ds, -4.0, 4.0)
		"blotch":
			var f := -0.3
			for w in waves:
				var kv: Vector3 = w[0]
				f += float(w[2]) * sin(kv.dot(p) + float(w[1]))
			return f
		"stripes":
			var ph := TAU * p.dot(stripe_dir) / stripe_p + 0.9 * sin(TAU * p.dot(stripe_dir2) / (stripe_p * 2.7) + salt)
			return sin(ph) - 0.3
	return -1.0


func radome_field(p: Vector3, _n: Vector3) -> float:
	return z_radome - p.z


func antiglare_field(p: Vector3, n: Vector3) -> float:
	return minf(minf(n.y - 0.82, p.z - ag_z0), ag_z1 - p.z)


func _not_belly(c: Vector3, n: Vector3) -> bool:
	return belly_field(c, n) < 0.0


## Режет поверхность детали по всем линиям окраски.
func prepare(kit, part: String, gen) -> void:
	if part == "Body":
		var rd: float = gen.sp.get("radome", 0.0)
		if rd > 0.0:
			z_radome = gen.nose_z + rd * gen.L
		ag_z1 = gen.canopy_z0 + 0.05
		if gen.engines == "nose_prop":
			ag_z0 = gen.nose_z + gen.spinner_len + 0.15
		else:
			ag_z0 = ag_z1 - gen.L * 0.09
			if rd > 0.0:
				ag_z0 = maxf(ag_z0, z_radome + 0.1)
	if part == "Gear":
		return
	kit.split(Callable(self, "belly_field"))
	if part == "Body":
		if z_radome > -1.0e8:
			kit.split(Callable(self, "radome_field"))
		# три прямые границы по очереди — так углы панели остаются чёткими
		var near := func(c: Vector3, n: Vector3) -> bool:
			return _not_belly(c, n) and n.y > 0.5 and c.z > ag_z0 - 1.0 and c.z < ag_z1 + 1.0
		kit.split(func(_p: Vector3, n: Vector3) -> float: return n.y - 0.82, near)
		kit.split(func(p: Vector3, _n: Vector3) -> float: return p.z - ag_z0, near)
		kit.split(func(p: Vector3, _n: Vector3) -> float: return ag_z1 - p.z, near)
	if pattern != "solid":
		var is_body := part == "Body"
		kit.split(Callable(self, "pattern_field"), func(c: Vector3, n: Vector3) -> bool:
			if not _not_belly(c, n):
				return false
			if is_body and (c.z < z_radome or antiglare_field(c, n) > 0.0):
				return false
			return true)


func painter(part: String) -> Callable:
	return func(tag: int, c: Vector3, n: Vector3) -> Color:
		return color_for(tag, c, n, part)


func color_for(tag: int, c: Vector3, n: Vector3, part: String) -> Color:
	match tag:
		Kit.SKIN:
			if part == "Body" and c.z < z_radome:
				return radome_col
			if belly_field(c, n) > 0.0:
				return belly
			if part == "Body" and antiglare_field(c, n) > 0.0:
				return antiglare
			if pattern != "solid" and pattern_field(c, n) > 0.0:
				return second
			return base
		Kit.DARK:
			return DARK
		Kit.METAL:
			return METAL
		Kit.METAL_DARK:
			return METAL_DARK
		Kit.SOOT:
			return SOOT
		Kit.TIRE:
			return TIRE
		Kit.HUB:
			return HUB
		Kit.PROP:
			return PROP
		Kit.PROP_TIP:
			return PROP_TIP
		Kit.SPINNER:
			return second
		Kit.FRAME:
			return frame_col
		Kit.PILOT:
			return PILOT
		Kit.ACCENT:
			return ACCENT
		Kit.WHITE:
			return WHITE
		Kit.NUMBER:
			return number_col
		Kit.RADOME:
			return radome_col
		Kit.BELLY:
			return belly
		Kit.ANTIGLARE:
			return ANTIGLARE
	return Color(1, 1, 1)
