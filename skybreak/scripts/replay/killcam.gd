class_name Killcam
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal finished

func play(battle, victim_uid: int, killer_uid: int, seconds := 6.0) -> void:
	finished.emit.call_deferred()
