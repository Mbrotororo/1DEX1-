class_name Aircraft
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal destroyed(aircraft, killer_uid: int, reason: String)
signal serviced(aircraft)

var uid: int = 0
var team: int = 0
var def_id: String = ""
var def: Dictionary = {}
var callsign: String = ""
var camo_id: String = "factory"
var is_player: bool = false
var alive: bool = true
var fm: FlightModel
var dmg: DamageModel
var weapons: WeaponSystem
var pilot = null
var model: Node3D
var controls: Dictionary = {}
var in_cloud: bool = false
var servicing: bool = false
var service_progress: float = 0.0

func setup(p_def_id: String, p_team: int, p_uid: int, p_callsign: String, p_camo: String, spawn: Dictionary, opts: Dictionary) -> void:
	def_id = p_def_id
	team = p_team
	uid = p_uid
	callsign = p_callsign
	camo_id = p_camo
	def = Data.plane(p_def_id)
	fm = FlightModel.new()
	dmg = DamageModel.new()
	weapons = WeaponSystem.new()

func set_pilot(p) -> void:
	pilot = p

func take_hit(local_point: Vector3, damage: float, attacker_uid: int) -> void:
	pass

func take_splash(world_pos: Vector3, damage: float, radius: float, attacker_uid: int) -> void:
	pass

func ray_hit(from: Vector3, to: Vector3) -> Dictionary:
	return {"hit": false, "local_point": Vector3.ZERO, "world_point": Vector3.ZERO}

func hit_radius() -> float:
	return 8.0

func forward() -> Vector3:
	return -global_transform.basis.z

func velocity() -> Vector3:
	return fm.vel if fm else Vector3.ZERO

func speed() -> float:
	return velocity().length()

func altitude_agl() -> float:
	return global_position.y
