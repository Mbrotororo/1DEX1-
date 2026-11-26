extends Node3D
## Поддельный самолёт: сфера радиуса body_radius. Записывает попадания.

var uid: int = 0
var team: int = 1
var alive: bool = true
var def: Dictionary = {"stealth": 1.0}
var in_cloud: bool = false
var is_player: bool = false
var model: Node3D = null
var fm = null
var vel: Vector3 = Vector3.ZERO
var body_radius: float = 4.0
var hits: Array = []      # [{local, damage, attacker}]
var splashes: Array = []  # [{pos, damage, radius, attacker}]


func move(dt: float) -> void:
	position += vel * dt


func ray_hit(from: Vector3, to: Vector3) -> Dictionary:
	var c := global_position
	var d := to - from
	var f := from - c
	var a := d.dot(d)
	var b := 2.0 * f.dot(d)
	var cc := f.dot(f) - body_radius * body_radius
	var t := -1.0
	if cc <= 0.0:
		t = 0.0
	elif a > 1e-9:
		var disc := b * b - 4.0 * a * cc
		if disc >= 0.0:
			t = (-b - sqrt(disc)) / (2.0 * a)
	if t < 0.0 or t > 1.0:
		return {"hit": false, "local_point": Vector3.ZERO, "world_point": Vector3.ZERO}
	var wp := from + d * t
	return {"hit": true, "local_point": global_transform.affine_inverse() * wp, "world_point": wp}


func take_hit(local_point: Vector3, damage: float, attacker_uid: int) -> void:
	hits.append({"local": local_point, "damage": damage, "attacker": attacker_uid})


func take_splash(world_pos: Vector3, damage: float, radius: float, attacker_uid: int) -> void:
	splashes.append({"pos": world_pos, "damage": damage, "radius": radius, "attacker": attacker_uid})


func hit_radius() -> float:
	return body_radius + 3.0


func forward() -> Vector3:
	return -global_transform.basis.z


func velocity() -> Vector3:
	return vel


func speed() -> float:
	return vel.length()
