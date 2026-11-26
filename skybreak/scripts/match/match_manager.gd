class_name MatchManager
extends Node3D
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

signal kill_event(text: String, killer_team: int, victim_team: int)
signal message(text: String, seconds: float)
signal state_changed(state: String)
signal player_spawned(ac)
signal player_killed(info: Dictionary)
signal match_ended(result: Dictionary)

var config: Dictionary = {}
var mode: String = "arcade"
var world: World
var projectiles: ProjectileManager
var fx: Effects
var recorder: Recorder
var camera_rig: CameraRig
var hud = null
var aircraft: Array = []
var ground_units: Array = []
var player = null
var player_pilot: PlayerPilot
var tickets: Array = [1000.0, 1000.0]
var max_tickets: float = 1000.0
var time_left: float = 900.0
var elapsed: float = 0.0
var zones_state: Array = []
var state: String = "spawn"
var spawn_points: int = 0
var lineup: Array = []
var lineup_uses: Dictionary = {}
var markers_enabled: bool = true
var paused: bool = false
var _uid: int = 0

func _enter_tree() -> void:
	Game.battle = self

func _exit_tree() -> void:
	if Game.battle == self:
		Game.battle = null

func next_uid() -> int:
	_uid += 1
	return _uid

func get_entity(uid: int):
	return null

func enemies_of(team: int) -> Array:
	return []

func ground_targets_of(team: int) -> Array:
	return []

func spawn_cost(def_id: String) -> int:
	return 0

func can_spawn(def_id: String) -> bool:
	return true

func request_spawn(def_id: String) -> bool:
	return false

func get_scoreboard() -> Array:
	return []

func player_stats() -> Dictionary:
	return {}

func set_paused(on: bool) -> void:
	paused = on

func quit_to_hangar() -> void:
	Game.go_hangar()
