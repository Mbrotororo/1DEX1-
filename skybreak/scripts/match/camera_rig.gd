class_name CameraRig
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

enum Mode { CHASE, COCKPIT, FREE_LOOK, SPECTATE, FIXED }

var mode: int = Mode.CHASE
var camera: Camera3D
var target = null

func _init() -> void:
	camera = Camera3D.new()
	add_child(camera)

func follow(ac) -> void:
	target = ac

func set_mode(m: int) -> void:
	mode = m

func toggle_cockpit() -> void:
	pass

func spectate(ac) -> void:
	target = ac

func shake(amount: float) -> void:
	pass
