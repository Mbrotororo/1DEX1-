extends Node
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal changed

var data: Dictionary = {}

func _ready() -> void:
	load_profile()

func load_profile() -> void:
	data = {"credits": Data.ECONOMY.start_credits, "owned": Data.STARTER_PLANES.duplicate(), "researched": Data.STARTER_PLANES.duplicate(),
		"lineup": Data.STARTER_PLANES.duplicate(), "settings": Data.DEFAULT_SETTINGS.duplicate()}

func save_profile() -> void:
	pass

func get_setting(key: String):
	return data.get("settings", {}).get(key, Data.DEFAULT_SETTINGS.get(key))

func set_setting(key: String, value) -> void:
	data.settings[key] = value
	changed.emit()

func plane_state(id: String) -> String:
	return "owned" if id in data.owned else "locked"

func is_owned(id) -> bool:
	return id in data.owned

func research_progress(id) -> int:
	return 0

func set_research_focus(id) -> void:
	pass

func buy(id) -> bool:
	return false

func get_lineup() -> Array:
	return data.lineup

func set_lineup_slot(slot: int, id: String) -> void:
	pass

func selected_camo(plane_id) -> String:
	return "factory"

func select_camo(plane_id, camo_id) -> void:
	pass

func is_camo_unlocked(plane_id, camo_id) -> bool:
	return camo_id == "factory"

func camo_unlock_text(plane_id, camo_id) -> String:
	return ""

func plane_stats(plane_id) -> Dictionary:
	return {"battles": 0, "kills": 0, "wins": 0, "xp": 0}

func player_rank() -> Dictionary:
	return {"name": "Кадет", "xp": 0, "next_xp": 2000}

func apply_battle_result(result: Dictionary) -> Dictionary:
	return {}

func grant_achievement(id: String) -> bool:
	return false
