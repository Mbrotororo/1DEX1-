extends Node3D
## Плоский мир для тестов ENTITY: земля на высоте ground_h, одна полоса синих, три зоны.

var map: Dictionary = {"id": "harness"}
var ground_h: float = 0.0
var hill_h: float = 0.0                       # > 0 — гора в точке hill_pos (для проверки облёта)
var hill_pos: Vector2 = Vector2.ZERO
var hill_r: float = 600.0
var runway_rect: Rect2 = Rect2(-30.0, 2400.0, 60.0, 1200.0)   # x, z, ширина, длина
var runway_team: int = 0
var airfields: Array = []
var zones: Array = []
var bases: Array = []
var ground_units: Array = []
var clouds: Array = []                        # [{pos, r}] — облака для проверки видимости


func _init() -> void:
	name = "HarnessWorld"
	airfields = [{"team": 0, "kind": "airfield", "pos": Vector3(0, 0, 3000), "heading": 0.0, "length": 1200.0,
		"width": 60.0, "runway_start": Vector3(0, 0, 3600), "service_radius": 500.0}]
	zones = [{"id": "A", "pos": Vector3(-1200, 0, 0), "radius": 450.0, "max_alt": 500.0},
		{"id": "B", "pos": Vector3(0, 0, 0), "radius": 450.0, "max_alt": 500.0},
		{"id": "C", "pos": Vector3(1200, 0, 0), "radius": 450.0, "max_alt": 500.0}]


func height_at(x: float, z: float) -> float:
	var h := ground_h
	if hill_h > 0.0:
		var d := Vector2(x, z).distance_to(hill_pos)
		if d < hill_r:
			h += hill_h * (0.5 + 0.5 * cos(PI * d / hill_r))
	return h


func surface_at(x: float, z: float) -> Dictionary:
	var h := height_at(x, z)
	if runway_rect.has_point(Vector2(x, z)):
		return {"height": h, "kind": "runway", "team": runway_team, "flat": true}
	return {"height": h, "kind": "ground", "team": -1, "flat": hill_h <= 0.0}


func cloud_density_at(p: Vector3) -> float:
	for c in clouds:
		if p.distance_to(c.pos) < float(c.r):
			return 1.0
	return 0.0


func half_size() -> float:
	return 5000.0
