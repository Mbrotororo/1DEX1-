class_name ProjectileManager
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

func spawn_bullet(from: Vector3, velocity: Vector3, damage: float, caliber: float, owner_uid: int, team: int, tracer: bool) -> void:
	pass

func spawn_rocket(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
	pass

func spawn_bomb(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
	pass

func spawn_missile(from: Vector3, velocity: Vector3, target, spec: Dictionary, owner_uid: int, team: int) -> void:
	pass

func spawn_flak(from: Vector3, velocity: Vector3, fuse_time: float, damage: float, radius: float, owner_uid: int, team: int) -> void:
	pass

func spawn_flare(from: Vector3, velocity: Vector3, team: int) -> void:
	pass

func incoming_missiles(target) -> int:
	return 0

func clear() -> void:
	pass
