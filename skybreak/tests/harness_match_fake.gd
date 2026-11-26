extends Node3D
## Заменитель самолёта для тестов MATCH: стоит на месте, поля как у Aircraft.

signal destroyed(aircraft, killer_uid: int, reason: String)
signal serviced(aircraft)

var uid: int = 0
var team: int = 0
var def_id: String = "strizh"
var def: Dictionary = {}
var callsign: String = "Тест"
var camo_id: String = "factory"
var is_player: bool = false
var alive: bool = true
var fm = null
var dmg = null
var weapons = null
var pilot = null
var model: Node3D = null
var controls: Dictionary = {}
var in_cloud: bool = false
var servicing: bool = false
var service_progress: float = 0.0

func setup_fake(p_uid: int, p_team: int, p_def_id: String, p_callsign: String, p_pos: Vector3) -> void:
	uid = p_uid
	team = p_team
	def_id = p_def_id
	def = Data.plane(p_def_id)
	callsign = p_callsign
	position = p_pos

func set_pilot(p) -> void:
	pilot = p

func take_hit(_local_point: Vector3, _damage: float, _attacker_uid: int) -> void:
	pass

func take_splash(_world_pos: Vector3, _damage: float, _radius: float, _attacker_uid: int) -> void:
	pass

func ray_hit(_from: Vector3, _to: Vector3) -> Dictionary:
	return {"hit": false, "local_point": Vector3.ZERO, "world_point": Vector3.ZERO}

func hit_radius() -> float:
	return 6.0

func forward() -> Vector3:
	return -global_transform.basis.z

func velocity() -> Vector3:
	return Vector3.ZERO

func speed() -> float:
	return 0.0

func altitude_agl() -> float:
	return position.y
