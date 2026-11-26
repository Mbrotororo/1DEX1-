extends RefCounted
## Расстановка наземных целей: базы, зенитки, колонны, корабли, авианосец.
## Всё детерминированно по rng.

const Carrier = preload("res://scripts/world/world_carrier.gd")
const T = preload("res://scripts/world/terrain.gd")

const BUILDING_SPOTS := [
	["hangar", Vector2(0.0, 52.0), 0.0],
	["depot", Vector2(-52.0, -18.0), PI * 0.5],
	["fuel", Vector2(52.0, -22.0), 0.0],
	["bunker", Vector2(0.0, -62.0), 0.0],
]
const COLUMN_ORDER := [["tank", ""], ["tank", ""], ["aa", "mobile"], ["tank", ""], ["truck", ""]]
const COLUMN_GAP := 30.0

static func spawn_all(w, rng: RandomNumberGenerator, uid_start: int) -> int:
	var uid := uid_start
	var layout: Dictionary = w.layout
	if not w.carrier.is_empty():
		var c: Vector3 = w.carrier.center
		var cu := _unit(w, "carrier", "", int(w.carrier.team), c, float(w.carrier.heading), uid)
		uid += 1
		w.carrier["unit"] = cu
		for s in Carrier.gun_spots():
			var sp: Vector3 = s
			var p: Vector3 = w.carrier_world(Vector3(sp.x, 0.0, sp.z))
			p.y = float(w.carrier.deck_h) + sp.y
			_unit(w, "aa", "deck", int(w.carrier.team), p, float(w.carrier.heading) + rng.randf_range(-1.0, 1.0), uid)
			uid += 1
	var loops_taken: Array = []
	for team in [0, 1]:
		uid = _spawn_base(w, team, layout, rng, uid)
		uid = _spawn_airfield_aa(w, team, rng, uid)
	for team in [0, 1]:
		uid = _spawn_columns(w, team, layout, rng, uid, loops_taken)
		uid = _spawn_ships(w, team, layout, rng, uid, loops_taken)
	return uid

static func _unit(w, kind: String, variant: String, team: int, pos: Vector3, heading: float, uid: int) -> GroundUnit:
	var u := GroundUnit.new()
	u.variant = variant
	u.setup(kind, team, pos, heading, uid, w)
	w.add_child(u)
	w.ground_units.append(u)
	return u

static func _basis2(heading: float) -> Array:
	return [Vector2(sin(heading), -cos(heading)), Vector2(cos(heading), sin(heading))]

static func _spawn_base(w, team: int, layout: Dictionary, rng: RandomNumberGenerator, uid: int) -> int:
	for bd in layout.get("bases", []):
		if int(bd.team) != team:
			continue
		var c: Vector2 = bd.center
		var hd: float = bd.heading
		var fr := _basis2(hd)
		var f: Vector2 = fr[0]
		var r: Vector2 = fr[1]
		var h: float = w.height_at(c.x, c.y)
		var base := {"id": w.bases.size(), "team": team, "pos": Vector3(c.x, h, c.y), "unit_uids": []}
		for spot in BUILDING_SPOTS:
			var off: Vector2 = spot[1]
			var p2: Vector2 = c + r * off.x - f * off.y
			var u := _unit(w, "building", String(spot[0]), team, Vector3(p2.x, w.height_at(p2.x, p2.y), p2.y), hd + float(spot[2]), uid)
			u.base_id = int(base.id)
			base.unit_uids.append(uid)
			uid += 1
		w.bases.append(base)
		# зенитка у базы
		var ap: Vector2 = c + r * (-125.0) - f * (-125.0)
		_unit(w, "aa", "heavy", team, Vector3(ap.x, w.height_at(ap.x, ap.y), ap.y), hd + rng.randf_range(-PI, PI), uid)
		uid += 1
	return uid

static func _spawn_airfield_aa(w, team: int, rng: RandomNumberGenerator, uid: int) -> int:
	for af in w.airfields:
		if int(af.team) != team or af.kind != "airfield":
			continue
		var hd: float = af.heading
		var fr := _basis2(hd)
		var f: Vector2 = fr[0]
		var r: Vector2 = fr[1]
		var c := Vector2(af.pos.x, af.pos.z)
		for k in [-1.0, 1.0]:
			var p2: Vector2 = c + f * (k * 560.0) + r * (-85.0)
			_unit(w, "aa", "heavy" if k > 0.0 else "light", team, Vector3(p2.x, w.height_at(p2.x, p2.y), p2.y), hd + rng.randf_range(-PI, PI), uid)
			uid += 1
	return uid

# ---------------------------------------------------------------- колонны

static func _spawn_columns(w, team: int, layout: Dictionary, rng: RandomNumberGenerator, uid: int, taken: Array) -> int:
	var bands: Array = layout.get("column_band", [])
	if bands.size() <= team:
		return uid
	var band: Array = bands[team]
	var radius := {"canyon": 400.0, "fjord": 330.0, "reef": 230.0}.get(w.map_id, 350.0) as float
	var loops: Array = []
	if w.map_id == "fjord":
		loops = _fjord_shore_loops(w, team, 2, rng, taken)
	for attempt in 3:
		if loops.size() >= 2:
			break
		var r := radius * (1.0 - 0.25 * attempt)
		loops.append_array(find_loops(w, band, 2 - loops.size(), r, false, rng, taken))
	for loop in loops:
		var pts: Array = loop
		var start := rng.randf_range(0.0, 1000.0)
		for k in COLUMN_ORDER.size():
			var e: Array = COLUMN_ORDER[k]
			var u := _unit(w, String(e[0]), String(e[1]), team, Vector3(pts[0].x, 0.0, pts[0].y), 0.0, uid)
			u.set_path(pts)
			u.set_path_offset(start - k * COLUMN_GAP)
			uid += 1
	# если места не нашлось — техника стоит у базы
	for i in range(loops.size(), 2):
		var bd := _team_base(layout, team)
		if bd.is_empty():
			continue
		var c: Vector2 = bd.center
		for k in COLUMN_ORDER.size():
			var e: Array = COLUMN_ORDER[k]
			var p := c + Vector2(-60.0 + k * 30.0, (150.0 + i * 40.0) * (1.0 if team == 1 else -1.0))
			_unit(w, String(e[0]), String(e[1]), team, Vector3(p.x, w.height_at(p.x, p.y), p.y), float(bd.heading), uid)
			uid += 1
	return uid

## Фьорд: колонны ездят по береговой полосе своей стороны (туда по одной кромке, обратно по другой).
static func _fjord_shore_loops(w, team: int, count: int, rng: RandomNumberGenerator, taken: Array) -> Array:
	var side := 1.0 if team == 0 else -1.0
	var ranges: Array = [[-3900.0, -2500.0], [-2100.0, -700.0], [-300.0, 1100.0], [1500.0, 2900.0]]
	# порядок зависит от seed, но команды берут разные участки
	var order: Array = [0, 1, 2, 3]
	for i in range(order.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var t = order[i]
		order[i] = order[j]
		order[j] = t
	var out: Array = []
	for idx in order:
		if out.size() >= count:
			break
		var rg: Array = ranges[idx]
		var x0: float = rg[0]
		var x1: float = rg[1]
		var mid := Vector2((x0 + x1) * 0.5, T.fjord_z((x0 + x1) * 0.5) + side * 600.0)
		var busy := false
		for t in taken:
			if (t as Vector2).distance_to(mid) < 900.0:
				busy = true
		if busy:
			continue
		for off in [150.0, 190.0, 120.0, 230.0, 270.0]:
			var loop: Array = []
			var x := x0
			while x <= x1:
				loop.append(Vector2(x, T.fjord_z(x) + side * (T.fjord_half_width(x) + off)))
				x += 110.0
			x = x1
			while x >= x0:
				loop.append(Vector2(x, T.fjord_z(x) + side * (T.fjord_half_width(x) + off + 22.0)))
				x -= 110.0
			loop.append(loop[0])
			if _loop_ok(w, loop, false):
				out.append(loop)
				taken.append(mid)
				break
	return out

static func _team_base(layout: Dictionary, team: int) -> Dictionary:
	for bd in layout.get("bases", []):
		if int(bd.team) == team:
			return bd
	return {}

static func _spawn_ships(w, team: int, layout: Dictionary, rng: RandomNumberGenerator, uid: int, taken: Array) -> int:
	var bands: Array = layout.get("ship_band", [])
	if bands.size() <= team:
		return uid
	var loops := find_loops(w, bands[team], 2, 520.0, true, rng, taken)
	if loops.size() < 2:
		loops.append_array(find_loops(w, bands[team], 2 - loops.size(), 360.0, true, rng, taken))
	for loop in loops:
		var pts: Array = loop
		var u := _unit(w, "ship", "", team, Vector3(pts[0].x, 0.0, pts[0].y), 0.0, uid)
		u.set_path(pts)
		u.set_path_offset(rng.randf_range(0.0, 3000.0))
		uid += 1
	return uid

## Поиск замкнутых маршрутов в полосе z (band = [zmin, zmax]). water = true — для кораблей.
## Ближе к центру карты — раньше. Возвращает массив массивов Vector2.
static func find_loops(w, band: Array, count: int, radius: float, water: bool, rng: RandomNumberGenerator, taken: Array) -> Array:
	var out: Array = []
	if count <= 0:
		return out
	var cands: Array = []
	var x := -4300.0
	while x <= 4300.0:
		var z := float(band[0])
		while z <= float(band[1]):
			cands.append([absf(z) + rng.randf_range(0.0, 900.0), Vector2(x + rng.randf_range(-80, 80), z + rng.randf_range(-80, 80))])
			z += 300.0
		x += 300.0
	cands.sort_custom(func(a, b): return a[0] < b[0])
	var min_gap := radius * 2.0 + (1400.0 if not water else 900.0)
	for cnd in cands:
		if out.size() >= count:
			break
		var c: Vector2 = cnd[1]
		var near := false
		for t in taken:
			if (t as Vector2).distance_to(c) < min_gap:
				near = true
				break
		if near or not _site_ok(w, c, radius, water):
			continue
		for attempt in 3:
			var loop := _make_loop(c, radius, rng)
			if _loop_ok(w, loop, water):
				out.append(loop)
				taken.append(c)
				break
	return out

static func _site_ok(w, c: Vector2, radius: float, water: bool) -> bool:
	for af in w.airfields:
		var d := Vector2(af.pos.x, af.pos.z).distance_to(c)
		if d < radius + (1100.0 if af.kind == "airfield" else 700.0):
			return false
	for bd in w.layout.get("bases", []):
		if (bd.center as Vector2).distance_to(c) < radius + 420.0:
			return false
	var h: float = w.height_at(c.x, c.y)
	return h < -14.0 if water else h > 4.0

static func _make_loop(c: Vector2, radius: float, rng: RandomNumberGenerator) -> Array:
	var pts: Array = []
	var n := 7
	var rot := rng.randf_range(0.0, TAU)
	var sx := rng.randf_range(0.85, 1.35)
	var sz := rng.randf_range(0.65, 1.0)
	for i in n:
		var a := rot + TAU * i / n
		var rr := radius * rng.randf_range(0.8, 1.1)
		pts.append(c + Vector2(cos(a) * rr * sx, sin(a) * rr * sz).rotated(rot * 0.5))
	pts.append(pts[0])
	return pts

static func _loop_ok(w, loop: Array, water: bool) -> bool:
	var tr = w.terrain
	for i in loop.size() - 1:
		var a: Vector2 = loop[i]
		var b: Vector2 = loop[i + 1]
		var len := a.distance_to(b)
		var steps := maxi(2, int(len / 25.0))
		var side := (b - a).normalized().orthogonal() * 45.0
		for k in steps:
			var p := a.lerp(b, float(k) / steps)
			var h: float = w.height_at(p.x, p.y)
			if water:
				if h > -12.0:
					return false
				var q1 := p + side
				var q2 := p - side
				if w.height_at(q1.x, q1.y) > -6.0 or w.height_at(q2.x, q2.y) > -6.0:
					return false
				if not w.carrier.is_empty():
					var cc: Vector3 = w.carrier.center
					if Vector2(cc.x, cc.z).distance_to(p) < 450.0:
						return false
			else:
				if h < 3.0:
					return false
				if tr != null and (tr.normal_at(p.x, p.y) as Vector3).y < 0.93:
					return false
				var surf: Dictionary = w.surface_at(p.x, p.y)
				if int(surf.team) >= 0:
					return false
	return true
