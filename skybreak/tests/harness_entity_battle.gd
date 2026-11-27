extends Node3D
## Поддельный MatchManager для тестов ENTITY: только то, что читают самолёты, боты и оружие.

const WorldScript = preload("res://tests/harness_entity_world.gd")
const PmScript = preload("res://tests/harness_entity_pm.gd")

var mode: String = "test"
var world
var fx
var projectiles
var recorder = null
var camera_rig = null
var hud = null
var aircraft: Array = []
var ground_units: Array = []
var player = null
var elapsed: float = 0.0
var zones_state: Array = []
var _uid: int = 1000


func _init() -> void:
	name = "EntityHarnessBattle"
	world = WorldScript.new()
	add_child(world)
	fx = Effects.new()
	fx.name = "Fx"
	add_child(fx)
	projectiles = PmScript.new()
	add_child(projectiles)


func next_uid() -> int:
	_uid += 1
	return _uid


func get_entity(uid: int):
	for a in aircraft:
		if is_instance_valid(a) and a.uid == uid:
			return a
	for u in ground_units:
		if is_instance_valid(u) and u.uid == uid:
			return u
	return null


func enemies_of(team: int) -> Array:
	var out: Array = []
	for a in aircraft:
		if is_instance_valid(a) and a.alive and a.team != team:
			out.append(a)
	return out


func ground_targets_of(team: int) -> Array:
	var out: Array = []
	for u in ground_units:
		if is_instance_valid(u) and u.alive and u.team == team:
			out.append(u)
	return out


func add_aircraft(ac) -> void:
	aircraft.append(ac)
	add_child(ac)
	ac.set_physics_process(false)   # тесты шагают вручную
