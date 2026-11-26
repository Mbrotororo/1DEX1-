class_name DamageModel
extends RefCounted
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal module_damaged(module: String, ratio: float)
signal module_destroyed(module: String)
signal fire_started
signal fire_out

var def: Dictionary = {}
var hp: Dictionary = {}
var max_hp: Dictionary = {}
var on_fire: bool = false
var engine_dead: bool = false
var oil_leak: bool = false
var fuel_leak: bool = false
var left_wing_lost: bool = false
var right_wing_lost: bool = false
var tail_lost: bool = false
var pilot_dead: bool = false
var last_attacker: int = -1
var last_hit_time: float = -100.0

func setup(p_def: Dictionary, hardcore: bool) -> void:
	def = p_def

func apply_hit(local_point: Vector3, damage: float, attacker: int, time_now: float) -> String:
	return "structure"

func apply_splash(damage: float, attacker: int, time_now: float) -> void:
	pass

func update(dt: float, fm: FlightModel) -> void:
	pass

func is_destroyed() -> bool:
	return false

func destroyed_reason() -> String:
	return ""

func module_ratio(module: String) -> float:
	return 1.0

func try_extinguish() -> bool:
	return false

func repair_step(dt: float) -> bool:
	return true

func repair_full() -> void:
	pass

func is_damaged() -> bool:
	return false
