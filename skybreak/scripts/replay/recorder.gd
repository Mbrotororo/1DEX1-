class_name Recorder
extends Node
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

func start(battle) -> void:
	pass

func event(type: String, data: Dictionary) -> void:
	pass

func current_time() -> float:
	return 0.0

func finish() -> Dictionary:
	return {}

func window(t_from: float, t_to: float) -> Dictionary:
	return {}
