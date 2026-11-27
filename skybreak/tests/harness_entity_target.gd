extends Node3D
## Наземная цель для тестов ботов-штурмовиков.

var uid: int = 900
var kind: String = "tank"
var team: int = 1
var hp: float = 100.0
var max_hp: float = 100.0
var alive: bool = true
var radius: float = 4.0
var armored: bool = true
var base_id: int = -1
var ticket_value: int = 15


func take_damage(amount: float, _attacker_uid: int, _explosive: bool) -> void:
	hp -= amount
	if hp <= 0.0:
		alive = false
