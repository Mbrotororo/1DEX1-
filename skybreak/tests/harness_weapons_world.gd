extends Node3D
## Плоский мир для тестов оружия: суша на высоте ground, вода при x > water_x.

var map: Dictionary = {"id": "test"}
var ground: float = 0.0
var water_x: float = 100000.0
var light: float = 1.0


func height_at(x: float, _z: float) -> float:
	if x > water_x:
		return -20.0
	return ground


func surface_at(x: float, z: float) -> Dictionary:
	var h := height_at(x, z)
	return {"height": h, "kind": "water" if h < 0.0 else "ground", "team": -1, "flat": true}


func half_size() -> float:
	return 5000.0


func ambient_light_level() -> float:
	return light
