extends Node3D
## Поддельный бой для тестов оружия: то, что ProjectileManager и WeaponSystem берут из Game.battle.

var aircraft: Array = []
var ground_units: Array = []
var world = null
var fx = null
var recorder = null
var projectiles = null
var paused: bool = false


func enemies_of(team: int) -> Array:
	var out: Array = []
	for a in aircraft:
		if is_instance_valid(a) and a.alive and a.team != team:
			out.append(a)
	return out


func ground_targets_of(team: int) -> Array:
	var out: Array = []
	for u in ground_units:
		if is_instance_valid(u) and u.alive and u.team == team:
			out.append(u)
	return out


func get_entity(uid: int):
	for a in aircraft:
		if is_instance_valid(a) and a.uid == uid:
			return a
	for u in ground_units:
		if is_instance_valid(u) and u.uid == uid:
			return u
	return null
