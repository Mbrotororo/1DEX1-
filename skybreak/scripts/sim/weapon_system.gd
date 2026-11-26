class_name WeaponSystem
extends RefCounted
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

var def: Dictionary = {}
var ammo: Dictionary = {}
var max_ammo: Dictionary = {}
var lock_target = null
var lock_progress: float = 0.0
var bomb_cooldown: float = 0.0

func setup(p_def: Dictionary) -> void:
	def = p_def

func update(dt: float, owner, ctrl: Dictionary) -> void:
	pass

func gun_convergence() -> float:
	return 400.0

func gun_speed() -> float:
	return 800.0

func rearm_full() -> void:
	pass

func rearm_step(dt: float) -> bool:
	return true

func is_empty() -> bool:
	return false

func has_ordnance() -> bool:
	return false

func summary() -> Array:
	return []
