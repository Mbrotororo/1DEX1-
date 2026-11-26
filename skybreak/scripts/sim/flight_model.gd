class_name FlightModel
extends RefCounted
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

var def: Dictionary = {}
var pos: Vector3 = Vector3.ZERO
var vel: Vector3 = Vector3.ZERO
var basis: Basis = Basis.IDENTITY
var throttle: float = 0.8
var afterburner: bool = false
var gear_down: bool = false
var on_ground: bool = false
var brake: bool = false
var assist: bool = true
var crashed: bool = false
var crash_reason: String = ""
var airspeed: float = 0.0
var aoa: float = 0.0
var slip: float = 0.0
var g_load: float = 1.0
var stalled: bool = false
var overspeed: bool = false
var vertical_speed: float = 0.0
var mach: float = 0.0
var engine_rpm: float = 0.0
var thrust_factor: float = 1.0
var lift_left: float = 1.0
var lift_right: float = 1.0
var pitch_authority: float = 1.0
var roll_authority: float = 1.0
var yaw_authority: float = 1.0
var extra_drag: float = 0.0
var structural_stress: float = 0.0

func setup(p_def: Dictionary, start_pos: Vector3, start_basis: Basis, start_speed: float, p_on_ground := false) -> void:
	def = p_def
	pos = start_pos
	basis = start_basis
	vel = -start_basis.z * start_speed
	on_ground = p_on_ground

func step(dt: float, ctrl: Dictionary, surface: Dictionary) -> void:
	pos += vel * dt
	airspeed = vel.length()

func forward() -> Vector3:
	return -basis.z

func up() -> Vector3:
	return basis.y

func right() -> Vector3:
	return basis.x

func bank() -> float:
	return 0.0

func pitch_angle() -> float:
	return 0.0

func heading() -> float:
	return 0.0

func stall_speed() -> float:
	return 50.0
