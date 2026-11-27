class_name World
extends Node3D
## Мир боя: рельеф, вода, небо, аэродромы, авианосец, наземные цели, зоны.
## Всё строится в build() детерминированно по seed. Узел World должен стоять в начале координат.

const TerrainScript = preload("res://scripts/world/terrain.gd")
const Layout = preload("res://scripts/world/world_layout.gd")
const SkyScript = preload("res://scripts/world/sky.gd")
const Mat = preload("res://scripts/world/world_materials.gd")
const Airfield = preload("res://scripts/world/world_airfield.gd")
const Carrier = preload("res://scripts/world/world_carrier.gd")
const Props = preload("res://scripts/world/world_props.gd")
const Units = preload("res://scripts/world/world_units.gd")

const HALF := 5000.0
const WATER_EXTENT := 40000.0
const DEPTH_EXTENT := 6500.0
const AIR_SPEED := 130.0

var map: Dictionary = {}
var time_of_day: String = "day"
var weather: String = "clear"
var is_night: bool = false
var airfields: Array = []
var zones: Array = []
var bases: Array = []
var ground_units: Array = []

# дополнительно (не из контракта)
var map_id: String = ""
var seed_value: int = 0
var graphics: String = ""          # "" — из настроек профиля
var terrain = null                 # terrain.gd
var sky = null                     # sky.gd
var layout: Dictionary = {}
var carrier: Dictionary = {}       # {team, center:Vector3, heading, deck_h, length, width, outline:PackedVector2Array, unit}
var build_ms: int = 0

var _surfaces: Array = []          # [{c:Vector2, f:Vector2, r:Vector2, half_len, half_wid, h, kind, team}]
var _visual_root: Node3D

func _init() -> void:
	name = "World"

# ---------------------------------------------------------------- сборка

func build(p_map: Dictionary, p_time: String, p_weather: String, seed: int, uid_start: int) -> int:
	var t0 := Time.get_ticks_msec()
	_clear()
	map = p_map
	map_id = String(p_map.get("id", "canyon"))
	if not map_id in ["canyon", "fjord", "reef"]:
		map_id = "canyon"
	time_of_day = p_time if p_time in ["dawn", "day", "dusk", "night"] else "day"
	weather = p_weather if p_weather in ["clear", "cloudy", "overcast", "fog", "storm"] else "clear"
	is_night = time_of_day == "night"
	seed_value = seed
	layout = Layout.design(map_id)
	terrain = TerrainScript.new()
	terrain.setup(map_id, layout)
	_make_airfields()
	_make_zones()

	var gq := _graphics()
	var quality := {"low": 0.5, "medium": 0.85, "high": 1.0}.get(gq, 0.85) as float
	_visual_root = Node3D.new()
	_visual_root.name = "Static"
	add_child(_visual_root)
	sky = SkyScript.new()
	sky.name = "Sky"
	add_child(sky)
	sky.setup(time_of_day, weather, seed, quality, gq != "low")
	_build_terrain_visual(gq)
	_build_water()
	for af in airfields:
		if af.kind == "airfield":
			var node: Node3D = Airfield.build(self, af, is_night)
			_visual_root.add_child(node)
	for bd in layout.get("bases", []):
		_visual_root.add_child(Airfield.build_base(self, bd))
	var prng := RandomNumberGenerator.new()
	prng.seed = seed * 7919 + 13
	_visual_root.add_child(Props.scatter(self, prng, quality))
	var urng := RandomNumberGenerator.new()
	urng.seed = seed * 104729 + 3
	var next_uid: int = Units.spawn_all(self, urng, uid_start)
	build_ms = Time.get_ticks_msec() - t0
	return next_uid

func _clear() -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	airfields.clear()
	zones.clear()
	bases.clear()
	ground_units.clear()
	carrier = {}
	_surfaces.clear()

func _graphics() -> String:
	if graphics != "":
		return graphics
	var g = "medium"
	var prof = Engine.get_main_loop().root.get_node_or_null("/root/Profile") if Engine.get_main_loop() is SceneTree else null
	if prof != null and prof.has_method("get_setting"):
		var v = prof.get_setting("graphics")
		if v != null:
			g = String(v)
	return g if g in ["low", "medium", "high"] else "medium"

func _make_airfields() -> void:
	for a in layout.get("airfields", []):
		var hd: float = a.heading
		var f2 := Vector2(sin(hd), -cos(hd))
		var r2 := Vector2(cos(hd), sin(hd))
		var c: Vector2 = a.center
		var fwd := Vector3(f2.x, 0.0, f2.y)
		if a.kind == "carrier":
			var deck_h := Carrier.DECK_HEIGHT
			carrier = {"team": int(a.team), "center": Vector3(c.x, deck_h, c.y), "heading": hd, "deck_h": deck_h,
				"length": Carrier.LENGTH, "width": Carrier.WIDTH, "outline": Carrier.deck_outline(),
				"island": Carrier.island_rect(), "unit": null}
			var start := Vector3(c.x, deck_h, c.y) - fwd * (Carrier.LENGTH * 0.5 - 30.0)
			airfields.append({"team": int(a.team), "kind": "carrier", "pos": Vector3(c.x, deck_h, c.y), "heading": hd,
				"length": Carrier.LENGTH, "width": Carrier.WIDTH, "runway_start": start, "service_radius": 200.0})
			continue
		var h := terrain.height_at(c.x, c.y) as float
		var len: float = a.length
		var wid: float = a.width
		var start := Vector3(c.x, h, c.y) - fwd * (len * 0.5 - 60.0)
		airfields.append({"team": int(a.team), "kind": "airfield", "pos": Vector3(c.x, h, c.y), "heading": hd,
			"length": len, "width": wid, "runway_start": start, "service_radius": 350.0})
		_surfaces.append({"c": c, "f": f2, "r": r2, "half_len": len * 0.5, "half_wid": wid * 0.5, "h": h,
			"kind": "runway", "team": int(a.team)})
		# рулёжка и стоянка: ровная земля своей команды
		_surfaces.append({"c": c + r2 * Airfield.TAXI_OFFSET, "f": f2, "r": r2, "half_len": len * 0.5 - 40.0,
			"half_wid": Airfield.TAXI_WIDTH * 0.5, "h": h, "kind": "ground", "team": int(a.team)})
		var ap: Vector2 = c + r2 * Airfield.APRON_OFFSET.x + f2 * Airfield.APRON_OFFSET.y
		_surfaces.append({"c": ap, "f": f2, "r": r2, "half_len": Airfield.APRON_SIZE.y * 0.5,
			"half_wid": Airfield.APRON_SIZE.x * 0.5, "h": h, "kind": "ground", "team": int(a.team)})
		for k in [-1.0, 1.0]:
			var lc: Vector2 = c + f2 * (k * (len * 0.5 - 40.0)) + r2 * (Airfield.TAXI_OFFSET * 0.5)
			_surfaces.append({"c": lc, "f": f2, "r": r2, "half_len": Airfield.TAXI_WIDTH * 0.5,
				"half_wid": Airfield.TAXI_OFFSET * 0.5, "h": h, "kind": "ground", "team": int(a.team)})

func _make_zones() -> void:
	for z in layout.get("zones", []):
		var c: Vector2 = z.center
		var h := maxf(terrain.height_at(c.x, c.y), 0.0)
		zones.append({"id": String(z.id), "pos": Vector3(c.x, h, c.y), "radius": 450.0, "max_alt": 500.0})

func _build_terrain_visual(gq: String) -> void:
	var stride := 2 if gq == "low" else 1
	var mesh: ArrayMesh = terrain.build_mesh(stride, -45.0 if map_id == "reef" else -1000.0)
	var mi := MeshInstance3D.new()
	mi.name = "Terrain"
	mi.mesh = mesh
	mi.material_override = Mat.terrain_material(String(map.get("texture", _default_texture())), terrain.biome)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_visual_root.add_child(mi)

func _default_texture() -> String:
	match map_id:
		"fjord":
			return "res://assets/textures/snow.webp"
		"reef":
			return "res://assets/textures/island.webp"
	return "res://assets/textures/sand.webp"

func _build_water() -> void:
	var img: Image = terrain.depth_image(256, DEPTH_EXTENT)
	var tex := ImageTexture.create_from_image(img)
	var mat: ShaderMaterial = Mat.water_material(tex, DEPTH_EXTENT)
	sky.register_water(mat, terrain.biome)
	var pm := PlaneMesh.new()
	pm.size = Vector2(WATER_EXTENT * 2.0, WATER_EXTENT * 2.0)
	pm.subdivide_width = 0
	pm.subdivide_depth = 0
	var mi := MeshInstance3D.new()
	mi.name = "Water"
	mi.mesh = pm
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_visual_root.add_child(mi)

# ---------------------------------------------------------------- запросы

func height_at(x: float, z: float) -> float:
	if terrain == null:
		return 0.0
	return terrain.height_at(x, z)

func surface_at(x: float, z: float) -> Dictionary:
	for s in _surfaces:
		var d := Vector2(x - s.c.x, z - s.c.y)
		if absf(d.dot(s.f)) <= s.half_len and absf(d.dot(s.r)) <= s.half_wid:
			return {"height": s.h, "kind": s.kind, "team": s.team, "flat": true}
	if not carrier.is_empty():
		var cs := _carrier_surface(x, z)
		if not cs.is_empty():
			return cs
	var h := height_at(x, z)
	if h < 0.0:
		return {"height": 0.0, "kind": "water", "team": -1, "flat": true}
	var flat := true
	if terrain != null:
		flat = terrain.normal_at(x, z).y > 0.985
	return {"height": h, "kind": "ground", "team": -1, "flat": flat}

func _carrier_surface(x: float, z: float) -> Dictionary:
	var c: Vector3 = carrier.center
	var dx := x - c.x
	var dz := z - c.z
	if dx * dx + dz * dz > 170.0 * 170.0:
		return {}
	var local := carrier_local(Vector3(x, 0.0, z))
	var p2 := Vector2(local.x, local.z)
	var isl: Rect2 = carrier.island
	# heading — курс палубы (на нос); bow_dist / stern_dist — сколько палубы до носа / до кормы по оси
	var hd: float = carrier.heading
	var bow := local.z + Carrier.BOW_Z
	var stern := Carrier.STERN_Z - local.z
	if isl.has_point(p2):
		return {"height": carrier.deck_h + Carrier.ISLAND_HEIGHT, "kind": "deck", "team": carrier.team, "flat": false,
			"heading": hd, "bow_dist": bow, "stern_dist": stern}
	if Geometry2D.is_point_in_polygon(p2, carrier.outline):
		return {"height": carrier.deck_h, "kind": "deck", "team": carrier.team, "flat": true,
			"heading": hd, "bow_dist": bow, "stern_dist": stern}
	return {}

## Высота твёрдой поверхности для снарядов: рельеф, палуба и надстройка авианосца.
## Под водой — как height_at (меньше 0), чтобы по знаку отличать всплеск от взрыва на земле.
func solid_height_at(x: float, z: float) -> float:
	var h := height_at(x, z)
	if not carrier.is_empty():
		var cs := _carrier_surface(x, z)
		if not cs.is_empty():
			h = maxf(h, float(cs.height))
	return h

## Перевод мировой точки в локальные координаты авианосца (нос на -Z).
func carrier_local(p: Vector3) -> Vector3:
	var c: Vector3 = carrier.center
	var b := Basis(Vector3.UP, -float(carrier.heading))
	return b.inverse() * (p - Vector3(c.x, 0.0, c.z))

func carrier_world(local: Vector3) -> Vector3:
	var c: Vector3 = carrier.center
	var b := Basis(Vector3.UP, -float(carrier.heading))
	return Vector3(c.x, 0.0, c.z) + b * local

func cloud_density_at(p: Vector3) -> float:
	if sky == null:
		return 0.0
	return sky.cloud_density_at(p)

func half_size() -> float:
	return HALF

func ambient_light_level() -> float:
	if sky == null:
		return 0.25 if is_night else 1.0
	return sky.level

func airfield_of(team: int) -> Dictionary:
	for a in airfields:
		if int(a.team) == team:
			return a
	return {}

func zone(id: String) -> Dictionary:
	for z in zones:
		if z.id == id:
			return z
	return {}

static func heading_basis(h: float) -> Basis:
	return Basis(Vector3.UP, -h)

static func heading_dir(h: float) -> Vector3:
	return Vector3(sin(h), 0.0, -cos(h))

func air_spawn(team: int, index: int, altitude: float) -> Dictionary:
	var af := airfield_of(team)
	var home := Vector2(0.0, 3600.0 if team == 0 else -3600.0)
	if not af.is_empty():
		home = Vector2(af.pos.x, af.pos.z)
	var to_c := (-home).normalized()
	if to_c.length() < 0.5:
		to_c = Vector2(0.0, -1.0 if team == 0 else 1.0)
	var h := atan2(to_c.x, -to_c.y)
	var fwd := heading_dir(h)
	var right := Vector3(cos(h), 0.0, sin(h))
	var lead := Vector3(home.x, 0.0, home.y) - fwd * 900.0
	var row := (index + 1) / 2
	var side := 0.0 if index == 0 else (1.0 if index % 2 == 1 else -1.0)
	var p := lead - fwd * (row * 70.0) + right * (side * row * 60.0)
	# не ниже рельефа впереди и вокруг
	var top := 0.0
	for k in range(-2, 9):
		for s in [-1.0, 0.0, 1.0]:
			var q: Vector3 = p + fwd * (k * 250.0) + right * (s * 300.0)
			top = maxf(top, height_at(q.x, q.z))
	p.y = maxf(altitude, top + 400.0) + (row % 2) * 15.0
	return {"pos": p, "basis": heading_basis(h), "speed": AIR_SPEED}

func runway_spawn(team: int, index: int) -> Dictionary:
	var af := airfield_of(team)
	if af.is_empty():
		var s := air_spawn(team, index, 1000.0)
		s["on_ground"] = false
		return s
	var h: float = af.heading
	var fwd := heading_dir(h)
	var right := Vector3(cos(h), 0.0, sin(h))
	var row := (index + 1) / 2
	var side := 0.0 if index == 0 else (1.0 if index % 2 == 1 else -1.0)
	var p: Vector3 = af.runway_start + fwd * (row * 55.0) + right * (side * 12.0)
	if af.kind == "carrier":
		# на палубе: первый — у кормы по оси носом к носу корабля (катапульта разгоняет вдоль оси),
		# дальше — три ряда по оси, потом левее, подальше от надстройки
		p = af.runway_start + fwd * ((index % 3) * 50.0) - right * (9.0 * float((index / 3) % 2))
	var s := surface_at(p.x, p.z)
	p.y = float(s.height) + 1.0
	var out := {"pos": p, "basis": heading_basis(h), "speed": 0.0, "on_ground": true}
	if af.kind == "carrier":
		out["deck"] = true
	return out

# ---------------------------------------------------------------- наземные цели

func set_units_active(on: bool) -> void:
	for u in ground_units:
		if is_instance_valid(u):
			u.active = on

func alive_units(team: int = -1) -> Array:
	var out: Array = []
	for u in ground_units:
		if is_instance_valid(u) and u.alive and (team < 0 or u.team == team):
			out.append(u)
	return out
