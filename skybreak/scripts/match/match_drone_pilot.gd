extends Node
## Пилот мишени: летит прямо, кружит на месте или по кругу вокруг точки. Не стреляет.

const G := 9.81

var mode: String = "straight"     # "straight" | "circle" | "orbit"
var target_alt: float = 1000.0
var target_speed: float = 70.0
var heading_target: float = 0.0   # рад, 0 = на -Z, по часовой (вид сверху)
var circle_dir: float = 1.0       # 1 — вправо (по часовой), -1 — влево
var circle_bank: float = 0.45     # рад, для "circle"
var orbit_center: Vector3 = Vector3.ZERO
var orbit_radius: float = 900.0
var max_bank: float = 0.7
var border: float = 4200.0

# поля как у BotPilot, чтобы чужой код мог их читать
var skill: float = 0.0
var role: String = "fighter"
var target = null
var state: String = "patrol"

var _vs_i: float = 0.0

## Радиус круга, который мишень держит на этой скорости с креном не больше max_bank (с запасом).
static func min_orbit_radius(speed: float, bank: float) -> float:
	return speed * speed / (G * tan(clampf(bank, 0.1, 1.2))) * 1.2

func get_controls(ac, dt: float) -> Dictionary:
	var c: Dictionary = Data.empty_controls()
	var fm = ac.get("fm") if ac != null else null
	if fm == null:
		return c
	var pos: Vector3 = fm.pos
	var vel: Vector3 = fm.vel
	var b: Basis = fm.basis
	var bank := atan2(-b.x.y, b.y.y)
	var fwd := -b.z
	var hdg := atan2(fwd.x, -fwd.z)
	var spd := maxf(vel.length(), 1.0)

	var desired_bank := 0.0
	match mode:
		"circle":
			desired_bank = circle_bank * signf(circle_dir)
		"orbit":
			var rv := Vector2(pos.x - orbit_center.x, pos.z - orbit_center.z)
			var d := maxf(rv.length(), 1.0)
			var rn := rv / d
			var dir := signf(circle_dir) if circle_dir != 0.0 else 1.0
			var tangent := Vector2(-rn.y, rn.x) * dir
			var want := tangent - rn * clampf((d - orbit_radius) / orbit_radius * 1.5, -1.0, 1.0)
			var want_h := atan2(want.x, -want.y)
			var ff := atan(spd * spd / (G * maxf(orbit_radius, 50.0))) * dir
			var err := wrapf(want_h - hdg, -PI, PI)
			desired_bank = clampf(ff + err * 1.2, -max_bank, max_bank)
		_:
			if absf(pos.x) > border or absf(pos.z) > border:
				heading_target = atan2(-pos.x, pos.z)   # к центру карты
			var err := wrapf(heading_target - hdg, -PI, PI)
			desired_bank = clampf(err * 1.5, -0.6, 0.6)

	# высота: не ниже рельефа впереди
	var alt_goal := target_alt
	var b_node = Game.battle
	if b_node != null and is_instance_valid(b_node) and b_node.get("world") != null:
		var w = b_node.world
		var ahead := pos + Vector3(vel.x, 0.0, vel.z) * 3.0
		var ground := maxf(maxf(w.height_at(ahead.x, ahead.z), w.height_at(pos.x, pos.z)), 0.0)
		alt_goal = maxf(alt_goal, ground + 250.0)
		if pos.y - ground < 120.0:
			desired_bank = 0.0
	c.roll = clampf((desired_bank - bank) * 2.0, -1.0, 1.0)
	var vs_target := clampf((alt_goal - pos.y) * 0.12, -10.0, 12.0)
	var err_vs := vs_target - vel.y
	_vs_i = clampf(_vs_i + err_vs * dt * 0.02, -0.3, 0.3)
	c.pitch = clampf(err_vs * 0.04 + _vs_i, -0.6, 0.6)
	c.yaw = 0.0
	c.throttle = clampf(0.55 + (target_speed - spd) * 0.03, 0.15, 1.0)
	return c
