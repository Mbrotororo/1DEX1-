extends Node3D
## Оторванная часть самолёта (крыло, хвост): падает с вращением и исчезает у земли.
## Узел-часть уже в мировых координатах (AircraftMeshBuilder.detach_part), здесь только движение.

const LIFE := 9.0
const G := 9.81

var part: Node3D
var vel: Vector3 = Vector3.ZERO
var spin: Vector3 = Vector3.ZERO
var age: float = 0.0


## Запускает падение части. part должен быть в дереве; этот узел добавляется рядом с ним.
func launch(p_part: Node3D, p_vel: Vector3, p_spin: Vector3) -> bool:
	if p_part == null or not is_instance_valid(p_part) or not p_part.is_inside_tree():
		return false
	name = "FallingPart"
	part = p_part
	vel = p_vel
	spin = p_spin
	p_part.get_parent().add_child(self)
	return true


func _physics_process(dt: float) -> void:
	if part == null or not is_instance_valid(part):
		queue_free()
		return
	age += dt
	# сильное сопротивление: плоская часть быстро теряет скорость
	vel += Vector3(0.0, -G, 0.0) * dt
	vel *= exp(-0.35 * dt)
	var t := part.global_transform
	t.origin += vel * dt
	var w := spin.length()
	if w > 1e-4:
		t.basis = (Basis(spin / w, w * dt) * t.basis).orthonormalized()
	part.global_transform = t
	var ground := 0.0
	var b = Game.battle
	if b != null and is_instance_valid(b) and "world" in b:
		var world = b.get("world")
		if world != null and is_instance_valid(world) and world.has_method("height_at"):
			ground = maxf(float(world.height_at(t.origin.x, t.origin.z)), 0.0)
	if age > LIFE or t.origin.y < ground - 2.0:
		part.queue_free()
		queue_free()
