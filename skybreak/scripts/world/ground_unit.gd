class_name GroundUnit
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal destroyed(unit, killer_uid: int)

var uid: int = 0
var kind: String = "tank"
var team: int = 0
var hp: float = 100.0
var max_hp: float = 100.0
var alive: bool = true
var radius: float = 4.0
var armored: bool = false
var base_id: int = -1
var ticket_value: int = 10

func setup(p_kind: String, p_team: int, p_pos: Vector3, p_heading: float, p_uid: int, world) -> void:
	kind = p_kind
	team = p_team
	uid = p_uid
	position = p_pos

func take_damage(amount: float, attacker_uid: int, explosive: bool) -> void:
	pass

func set_path(points: Array) -> void:
	pass
