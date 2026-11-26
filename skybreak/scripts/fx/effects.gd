class_name Effects
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

func explosion(pos: Vector3, size: float) -> void:
	pass

func hit_spark(pos: Vector3) -> void:
	pass

func splash(pos: Vector3, size: float) -> void:
	pass

func smoke_puff(pos: Vector3, size: float) -> void:
	pass

func attach_fire(parent: Node3D, local_pos: Vector3) -> Node3D:
	var n := Node3D.new()
	parent.add_child(n)
	n.position = local_pos
	return n

func attach_smoke(parent: Node3D, local_pos: Vector3, dark: bool) -> Node3D:
	var n := Node3D.new()
	parent.add_child(n)
	n.position = local_pos
	return n

func attach_trail(parent: Node3D, local_pos: Vector3) -> Node3D:
	var n := Node3D.new()
	parent.add_child(n)
	n.position = local_pos
	return n

func debris(pos: Vector3, vel: Vector3, count: int) -> void:
	pass

func tracer_line(from: Vector3, to: Vector3, color: Color) -> void:
	pass
