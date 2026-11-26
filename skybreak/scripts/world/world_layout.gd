extends RefCounted
## Расстановка на картах: аэродромы, авианосец, базы, зоны, районы для колонн и кораблей.
## Координаты — (x, z) в метрах; курс в радианах, 0 = на -Z, по часовой.

const T = preload("res://scripts/world/terrain.gd")

static func design(map_id: String) -> Dictionary:
	match map_id:
		"fjord":
			return _fjord()
		"reef":
			return _reef()
	return _canyon()

static func _af(team: int, x: float, z: float, heading_deg: float) -> Dictionary:
	return {"team": team, "kind": "airfield", "center": Vector2(x, z), "heading": deg_to_rad(heading_deg),
		"length": 1400.0, "width": 50.0}

static func _base(team: int, x: float, z: float, heading_deg: float) -> Dictionary:
	return {"team": team, "center": Vector2(x, z), "heading": deg_to_rad(heading_deg)}

static func _canyon() -> Dictionary:
	return {
		"airfields": [_af(0, 700.0, 3650.0, 8.0), _af(1, -800.0, -3650.0, 188.0)],
		"bases": [_base(0, -2500.0, 3250.0, 30.0), _base(1, 2600.0, -3300.0, 200.0)],
		"zones": [
			{"id": "A", "center": Vector2(-3000.0, T.canyon_z(-3000.0))},
			{"id": "B", "center": Vector2(-250.0, -750.0)},
			{"id": "C", "center": Vector2(3000.0, T.canyon_z(3000.0))},
		],
		"column_band": [[700.0, 2700.0], [-2700.0, -700.0]],
		"ship_band": [],
		"carrier": {},
	}

static func _fjord() -> Dictionary:
	return {
		"airfields": [_af(0, 1500.0, 3550.0, 352.0), _af(1, -1300.0, -3600.0, 174.0)],
		"bases": [_base(0, -2100.0, 2950.0, 20.0), _base(1, 2300.0, -2900.0, 190.0)],
		"zones": [
			{"id": "A", "center": Vector2(-3100.0, T.fjord_z(-3100.0))},
			{"id": "B", "center": Vector2(0.0, T.fjord_z(0.0))},
			{"id": "C", "center": Vector2(2900.0, T.fjord_z(2900.0))},
		],
		"column_band": [[600.0, 2900.0], [-2900.0, -600.0]],
		"ship_band": [],
		"carrier": {},
	}

static func _reef() -> Dictionary:
	return {
		"airfields": [
			{"team": 0, "kind": "carrier", "center": Vector2(1700.0, 3400.0), "heading": 0.0, "length": 300.0, "width": 38.0},
			_af(1, -350.0, -3700.0, 180.0),
		],
		"bases": [_base(0, -2450.0, 2950.0, 0.0), _base(1, 650.0, -4400.0, 180.0)],
		"zones": [
			{"id": "A", "center": Vector2(-2900.0, 250.0)},
			{"id": "B", "center": Vector2(250.0, -250.0)},
			{"id": "C", "center": Vector2(2950.0, 450.0)},
		],
		"column_band": [[-600.0, 3800.0], [-4800.0, 600.0]],
		"ship_band": [[1300.0, 2700.0], [-2700.0, -1300.0]],
		"carrier": {"team": 0, "center": Vector2(1700.0, 3400.0), "heading": 0.0},
	}
