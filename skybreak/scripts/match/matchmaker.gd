class_name Matchmaker
extends RefCounted
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

static func lineup_level(lineup: Array) -> float:
	return 1.0

static func pick_bots(level: float, count: int, team: int, rng: RandomNumberGenerator) -> Array:
	return []
