extends Node3D
## Поддельный ProjectileManager: ничего не летит, только считает выстрелы.

var counts: Dictionary = {"bullet": 0, "rocket": 0, "bomb": 0, "missile": 0, "flak": 0, "flare": 0}
var bomb_points: Array = []
var rocket_points: Array = []
var incoming: Dictionary = {}     # самолёт -> сколько ракет в него летит


func _init() -> void:
	name = "HarnessProjectiles"


func spawn_bullet(_from: Vector3, _velocity: Vector3, _damage: float, _caliber: float, _owner_uid: int, _team: int, _tracer: bool) -> void:
	counts.bullet += 1


func spawn_rocket(from: Vector3, _velocity: Vector3, _damage: float, _radius: float, _owner_uid: int, _team: int) -> void:
	counts.rocket += 1
	rocket_points.append(from)


func spawn_bomb(from: Vector3, _velocity: Vector3, _damage: float, _radius: float, _owner_uid: int, _team: int) -> void:
	counts.bomb += 1
	bomb_points.append(from)


func spawn_missile(_from: Vector3, _velocity: Vector3, _target, _spec: Dictionary, _owner_uid: int, _team: int) -> void:
	counts.missile += 1


func spawn_flak(_from: Vector3, _velocity: Vector3, _fuse_time: float, _damage: float, _radius: float, _owner_uid: int, _team: int) -> void:
	counts.flak += 1


func spawn_flare(_from: Vector3, _velocity: Vector3, _team: int) -> void:
	counts.flare += 1


func incoming_missiles(target) -> int:
	return int(incoming.get(target, 0))


func clear() -> void:
	for k in counts:
		counts[k] = 0
