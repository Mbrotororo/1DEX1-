extends Node3D
## Поддельная наземная цель для тестов оружия.

var uid: int = 0
var kind: String = "tank"
var team: int = 1
var alive: bool = true
var radius: float = 5.0
var armored: bool = false
var hp: float = 1000.0
var damage_log: Array = []   # [{amount, attacker, explosive}]


func take_damage(amount: float, attacker_uid: int, explosive: bool) -> void:
	damage_log.append({"amount": amount, "attacker": attacker_uid, "explosive": explosive})
	hp -= amount


func total_damage() -> float:
	var s := 0.0
	for d in damage_log:
		s += float(d.amount)
	return s
