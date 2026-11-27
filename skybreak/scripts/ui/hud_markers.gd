extends Control
## Прицел, круг наведения, упреждение, маркеры самолётов и наземных целей, рамка захвата ракеты.
## Всё рисуется одним _draw каждый кадр.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const ENEMY_ARROW_RANGE := 4000.0
const GROUND_RANGE := 3000.0
const REALISTIC_ALLY_RANGE := 800.0
const CLOUD_VISIBLE := 500.0
const LEAD_RANGE := 1600.0
const LEAD_CONE := 0.9          # cos ~25°
const GRAVITY := 9.81

var hud = null
var battle = null
var u: float = 1.0

var _ground_cache: Array = []
var _ground_t: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func tick(dt: float) -> void:
	_ground_t -= dt
	if _ground_t <= 0.0:
		_ground_t = 0.5
		_ground_cache = []
		if battle != null and is_instance_valid(battle) and battle.has_method("ground_targets_of"):
			var pl = battle.player
			var team := int(D.prop(pl, "team", 0))
			_ground_cache = battle.ground_targets_of(1 - team)
	queue_redraw()


func _camera() -> Camera3D:
	var cam := get_viewport().get_camera_3d()
	if cam != null:
		return cam
	var rig = D.prop(battle, "camera_rig")
	var c = D.prop(rig, "camera")
	return c as Camera3D


func _on_screen(cam: Camera3D, p: Vector3, margin: float) -> bool:
	if cam.is_position_behind(p):
		return false
	var sp := cam.unproject_position(p)
	return Rect2(Vector2(margin, margin), size - Vector2(margin, margin) * 2.0).has_point(sp)


func _draw() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	var pl = battle.player
	if not D.alive_node(pl):
		return
	var cam := _camera()
	if cam == null or not cam.is_inside_tree():
		return
	var my_pos: Vector3 = pl.global_position
	var my_team := int(pl.team)
	var arcade := bool(D.prop(battle, "markers_enabled", false))
	var weapons = D.prop(pl, "weapons")
	var lock_target = D.prop(weapons, "lock_target")
	if lock_target != null and not is_instance_valid(lock_target):
		lock_target = null

	# маркеры наземных целей (аркада)
	if arcade:
		for g in _ground_cache:
			if not D.alive_node(g):
				continue
			var gp: Vector3 = g.global_position
			if gp.distance_to(my_pos) > GROUND_RANGE:
				continue
			if not _on_screen(cam, gp, 4.0):
				continue
			_diamond(cam.unproject_position(gp) + Vector2(0, -6.0 * u), 5.0 * u, UiStyle.RED)

	# рамка захвата (под подписями маркеров)
	if lock_target != null and D.alive_node(lock_target):
		var lp: Vector3 = lock_target.global_position
		if not cam.is_position_behind(lp):
			_lock_box(cam.unproject_position(lp), float(D.prop(weapons, "lock_progress", 0.0)))

	# маркеры самолётов
	var lead_target = null
	var lead_best := INF
	var fwd: Vector3 = pl.forward()
	var marks: Array = []
	for ac in battle.aircraft:
		if ac == pl or not D.alive_node(ac):
			continue
		var p: Vector3 = ac.global_position
		var dist := p.distance_to(my_pos)
		var ally := int(ac.team) == my_team
		var in_cloud := bool(D.prop(ac, "in_cloud", false))
		var hidden_by_cloud := in_cloud and dist > CLOUD_VISIBLE
		if not ally and not hidden_by_cloud and dist < LEAD_RANGE:
			var to := (p - my_pos) / maxf(dist, 0.001)
			var c := fwd.dot(to)
			if c > LEAD_CONE and dist < lead_best:
				lead_best = dist
				lead_target = ac
		if hidden_by_cloud:
			continue
		var show := arcade or (ally and dist < REALISTIC_ALLY_RANGE)
		if not show:
			continue
		var col := UiStyle.team_color(int(ac.team))
		if _on_screen(cam, p, 6.0):
			marks.append({"sp": cam.unproject_position(p), "name": String(D.prop(ac, "callsign", "")), "dist": dist,
				"col": col, "locked": ac == lock_target})
		elif arcade and not ally and dist < ENEMY_ARROW_RANGE:
			_edge_arrow(cam, p, dist, col)
	# ближние рисуются первыми; подпись, которая налезла бы на уже нарисованную, не выводится
	marks.sort_custom(func(a, b): return float(a.dist) < float(b.dist))
	var taken: Array = []
	for m in marks:
		_aircraft_marker(m.sp, String(m.name), float(m.dist), m.col, bool(m.locked), taken)

	# упреждение (аркада)
	if arcade and weapons != null:
		var t = lock_target if D.alive_node(lock_target) and lock_target.global_position.distance_to(my_pos) < LEAD_RANGE else lead_target
		if t != null:
			_lead(cam, pl, t, weapons)

	# прицел пушек и круг наведения
	if weapons != null and weapons.has_method("gun_convergence"):
		var conv := float(weapons.gun_convergence())
		var rp := my_pos + fwd * conv
		if not cam.is_position_behind(rp):
			_reticle(cam.unproject_position(rp))
	var pilot = D.prop(pl, "pilot")
	if pilot != null and "aim_dir" in pilot and "mode" in pilot:
		var m := String(pilot.mode)
		if m == "mouse" or m == "touch":
			var ad: Vector3 = pilot.aim_dir
			if ad.length_squared() > 0.0001:
				var ap := cam.global_position + ad.normalized() * 3000.0
				if not cam.is_position_behind(ap):
					_aim_circle(cam.unproject_position(ap))


# ---------------------------------------------------------------- элементы

func _reticle(c: Vector2) -> void:
	var r := 9.0 * u
	var shadow := Color(0, 0, 0, 0.55)
	var col := Color(1, 1, 1, 0.95)
	draw_arc(c, r, 0.0, TAU, 32, shadow, 3.4 * u, true)
	draw_arc(c, r, 0.0, TAU, 32, col, 1.6 * u, true)
	for k in 4:
		var d := Vector2.from_angle(k * PI * 0.5)
		draw_line(c + d * (r + 3.0 * u), c + d * (r + 9.0 * u), shadow, 3.4 * u, true)
		draw_line(c + d * (r + 3.0 * u), c + d * (r + 9.0 * u), col, 1.6 * u, true)
	draw_circle(c, 2.4 * u, shadow)
	draw_circle(c, 1.5 * u, col)


func _aim_circle(c: Vector2) -> void:
	var r := 17.0 * u
	draw_arc(c, r, 0.0, TAU, 40, Color(0, 0, 0, 0.35), 3.0 * u, true)
	draw_arc(c, r, 0.0, TAU, 40, Color(1, 1, 1, 0.75), 1.4 * u, true)


func _diamond(c: Vector2, r: float, col: Color) -> void:
	var pts := PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0), c + Vector2(0, -r)])
	draw_polyline(pts, Color(0, 0, 0, 0.6), 3.2 * u, true)
	draw_polyline(pts, col, 1.6 * u, true)


func _aircraft_marker(sp: Vector2, callsign: String, dist: float, col: Color, locked: bool, taken: Array) -> void:
	var tip := sp + Vector2(0, -14.0 * u)
	var w := 6.0 * u
	var h := 6.0 * u
	var tri := PackedVector2Array([tip, tip + Vector2(-w, -h), tip + Vector2(w, -h)])
	var outline := PackedVector2Array([tip, tip + Vector2(-w, -h), tip + Vector2(w, -h), tip])
	draw_polyline(outline, Color(0, 0, 0, 0.6), 3.0 * u, true)
	draw_colored_polygon(tri, col)
	if locked:
		draw_arc(sp, 4.0 * u, 0.0, TAU, 16, col, 1.5 * u, true)
	var fs := int(round(13.0 * u))
	var base_y := tip.y - h - 5.0 * u
	var dist_s := D.fmt_dist(dist)
	var name_w := D.text_width(callsign, fs)
	var gap := 6.0 * u
	var dist_w := D.text_width(dist_s, fs)
	var x0 := sp.x - (name_w + gap + dist_w) * 0.5
	var rect := Rect2(x0 - 2.0 * u, base_y - fs, name_w + gap + dist_w + 4.0 * u, fs + 4.0 * u)
	for r in taken:
		var other: Rect2 = r
		if other.intersects(rect):
			return
	taken.append(rect)
	D.text(self, Vector2(x0, base_y), callsign, fs, col, -1, null, 3)
	D.text(self, Vector2(x0 + name_w + gap, base_y), dist_s, fs, Color(1, 1, 1, 0.85), -1, null, 3)


func _edge_arrow(cam: Camera3D, p: Vector3, dist: float, col: Color) -> void:
	var local: Vector3 = cam.global_transform.affine_inverse() * p
	var dir := Vector2(local.x, -local.y)
	if dir.length_squared() < 0.0001:
		dir = Vector2(0, 1)
	dir = dir.normalized()
	# стрелки стоят на эллипсе вокруг прицела, чтобы не залезать на панели по краям
	var center := size * 0.5
	var a := maxf(size.x * 0.5 - 290.0 * u, size.x * 0.22)
	var b := maxf(size.y * 0.5 - 115.0 * u, size.y * 0.25)
	var t := 1.0 / sqrt((dir.x / a) * (dir.x / a) + (dir.y / b) * (dir.y / b))
	var pos := center + dir * t
	var s := 9.0 * u
	var perp := Vector2(-dir.y, dir.x)
	var tip := pos + dir * s
	var tri := PackedVector2Array([tip, pos - dir * s * 0.6 + perp * s, pos - dir * s * 0.6 - perp * s])
	var ol := PackedVector2Array([tri[0], tri[1], tri[2], tri[0]])
	draw_polyline(ol, Color(0, 0, 0, 0.6), 3.0 * u, true)
	draw_colored_polygon(tri, col)
	var fs := int(round(12.0 * u))
	var label := D.fmt_dist(dist)
	var tw := D.text_width(label, fs)
	# подпись внутрь экрана от стрелки, с учётом ширины текста
	var off := s * 0.6 + 6.0 * u + absf(dir.x) * tw * 0.5 + absf(dir.y) * fs * 0.6
	D.text_mid(self, pos - dir * off, label, fs, Color(1, 1, 1, 0.9), 0, null, 3)


func _lock_box(c: Vector2, progress: float) -> void:
	var locked := progress >= 0.999
	var half := lerpf(40.0, 18.0, clampf(progress, 0.0, 1.0)) * u
	var col := UiStyle.DANGER if locked else UiStyle.WARN
	var arm := half * 0.45
	var th := 2.0 * u
	for sx in [-1.0, 1.0]:
		for sy in [-1.0, 1.0]:
			var corner := c + Vector2(sx * half, sy * half)
			draw_line(corner, corner - Vector2(sx * arm, 0), Color(0, 0, 0, 0.5), th + 2.0 * u)
			draw_line(corner, corner - Vector2(0, sy * arm), Color(0, 0, 0, 0.5), th + 2.0 * u)
			draw_line(corner, corner - Vector2(sx * arm, 0), col, th)
			draw_line(corner, corner - Vector2(0, sy * arm), col, th)
	var fs := int(round(13.0 * u))
	var txt := "Захват" if locked else "Захват %d%%" % int(progress * 100.0)
	D.text(self, c + Vector2(0, half + 16.0 * u), txt, fs, col, 0, D.bold(), 3)


## Точка упреждения: куда навести прицел, чтобы пули встретили цель.
func _lead(cam: Camera3D, pl, target, weapons) -> void:
	var s := float(weapons.gun_speed()) if weapons.has_method("gun_speed") else 800.0
	if s <= 1.0:
		return
	var sp: Vector3 = pl.global_position
	var tp: Vector3 = target.global_position
	var my_v: Vector3 = pl.velocity() if pl.has_method("velocity") else Vector3.ZERO
	var tv: Vector3 = target.velocity() if target.has_method("velocity") else Vector3.ZERO
	var t := lead_time(tp - sp, tv - my_v, s)
	if t <= 0.0:
		return
	var lp := tp + (tv - my_v) * t + Vector3(0.0, 0.5 * GRAVITY * t * t, 0.0)
	if cam.is_position_behind(lp) or cam.is_position_behind(tp):
		return
	var a := cam.unproject_position(tp)
	var b := cam.unproject_position(lp)
	var col := UiStyle.RED
	col.a = 0.9
	if a.distance_to(b) > 10.0 * u:
		draw_dashed_line(a, b, Color(1, 1, 1, 0.35), 1.2 * u, 5.0 * u)
	var r := 6.0 * u
	draw_arc(b, r, 0.0, TAU, 20, Color(0, 0, 0, 0.55), 3.4 * u, true)
	draw_arc(b, r, 0.0, TAU, 20, col, 1.8 * u, true)
	draw_circle(b, 1.6 * u, col)


## Время встречи пули со скоростью s с целью (r — относительное положение, v — относительная скорость).
static func lead_time(r: Vector3, v: Vector3, s: float) -> float:
	var a := v.dot(v) - s * s
	var b := 2.0 * r.dot(v)
	var c := r.dot(r)
	if absf(a) < 0.0001:
		if absf(b) < 0.0001:
			return -1.0
		var t0 := -c / b
		return t0 if t0 > 0.0 else -1.0
	var disc := b * b - 4.0 * a * c
	if disc < 0.0:
		return -1.0
	var sq := sqrt(disc)
	var t1 := (-b - sq) / (2.0 * a)
	var t2 := (-b + sq) / (2.0 * a)
	var t := INF
	if t1 > 0.0:
		t = t1
	if t2 > 0.0 and t2 < t:
		t = t2
	return t if t < 30.0 else -1.0
