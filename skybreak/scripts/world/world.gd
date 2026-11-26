class_name World
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

var map: Dictionary = {}
var time_of_day: String = "day"
var weather: String = "clear"
var is_night: bool = false
var airfields: Array = []
var zones: Array = []
var bases: Array = []
var ground_units: Array = []

func build(p_map: Dictionary, p_time: String, p_weather: String, seed: int, uid_start: int) -> int:
	map = p_map
	time_of_day = p_time
	weather = p_weather
	return uid_start

func height_at(x: float, z: float) -> float:
	return 0.0

func surface_at(x: float, z: float) -> Dictionary:
	return {"height": 0.0, "kind": "ground", "team": -1, "flat": true}

func cloud_density_at(p: Vector3) -> float:
	return 0.0

func half_size() -> float:
	return 5000.0

func air_spawn(team: int, index: int, altitude: float) -> Dictionary:
	var z := 3500.0 if team == 0 else -3500.0
	var b := Basis.IDENTITY if team == 0 else Basis(Vector3.UP, PI)
	return {"pos": Vector3(index * 60.0, altitude, z), "basis": b, "speed": 120.0}

func runway_spawn(team: int, index: int) -> Dictionary:
	var s := air_spawn(team, index, 2.0)
	s.speed = 0.0
	s["on_ground"] = true
	return s

func ambient_light_level() -> float:
	return 1.0
