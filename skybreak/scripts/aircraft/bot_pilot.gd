class_name BotPilot
extends Node
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

var skill: float = 0.5
var role: String = "fighter"
var target = null
var state: String = "patrol"

func get_controls(ac, dt: float) -> Dictionary:
	return Data.empty_controls()
