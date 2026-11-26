class_name PlayerPilot
extends Node
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

var aim_dir: Vector3 = Vector3.FORWARD
var mode: String = "mouse"
var touch_input: Dictionary = {}

func get_controls(ac, dt: float) -> Dictionary:
	return Data.empty_controls()

func reset_aim(ac) -> void:
	pass
