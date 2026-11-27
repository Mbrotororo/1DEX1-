extends Control
## Прицел, круг наведения, упреждение, маркеры самолётов и наземных целей, рамка захвата ракеты.
## Всё рисуется одним _draw каждый кадр.
## Облака прячут врагов: маркер, стрелка у края, упреждение и рамка захвата гаснут, если цель
## в облаке или линия взгляда идёт через плотное облако. Союзники видны всегда.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const ENEMY_ARROW_RANGE := 4000.0
const GROUND_RANGE := 3000.0
const REALISTIC_ALLY_RANGE := 800.0
const LEAD_RANGE := 1600.0
const LEAD_CONE := 0.9          # cos ~25°
const GRAVITY := 9.81
# облака
const CLOUD_CLOSE := 300.0      # ближе этого цель видно даже в облаке (как у ботов)
const LOS_STEP := 110.0         # шаг проверки линии взгляда, м
const LOS_MAX_SAMPLES := 16
const LOS_FADE := 40.0          # метров плотного облака на линии — маркер начинает гаснуть
const LOS_HIDE := 130.0         # метров плотного облака на линии — маркер не виден
const VIS_REFRESH := 0.1        # как часто пересчитывать видимость, с
const VIS_SPEED := 4.0          # скорость появления и исчезновения маркера, 1/с

var hud = null
var battle = null
var u: float = 1.0

var _ground_cache: Array = []
var _ground_vis: Dictionary = {}   # instance_id -> 0..1
var _ground_t: float = 0.0
var _vis: Dictionary = {}          # instance_id -> сглаженная видимость 0..1
var _vis_goal: Dictionary = {}     # instance_id -> видимость по последней проверке
var _vis_t: float = 0.0
var debug_marks: Array = []        # что нарисовано в последнем кадре: [{uid, team, arrow:bool}] (для тестов)
var debug_lead: bool = false       # нарисовано ли упреждение


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func tick(dt: float) -> void:
	_ground_t -= dt
	var pl = D.prop(battle, "player")
	var world = D.prop(battle, "world")
	if _ground_t <= 0.0:
		_ground_t = 0.5
		_ground_cache = []
		_ground_vis = {}
		if battle != null and is_instance_valid(battle) and battle.has_method("ground_targets_of"):
			var team := int(D.prop(pl, "team", 0))
			_ground_cache = battle.ground_targets_of(1 - team)
			if D.alive_node(pl):
				var eye: Vector3 = pl.global_position
				for g in _ground_cache:
					if D.alive_node(g) and (g.global_position as Vector3).distance_to(eye) <= GROUND_RANGE:
						_ground_vis[g.get_instance_id()] = cloud_visibility(world, eye, g.global_position, false)
	_vis_t -= dt
	if _vis_t <= 0.0:
		_vis_t = VIS_REFRESH
		_refresh_visibility(pl, world)
	for id in _vis_goal:
		_vis[id] = move_toward(float(_vis.get(id, _vis_goal[id])), float(_vis_goal[id]), dt * VIS_SPEED)
	queue_redraw()


## Пересчёт видимости врагов через облака (союзники всегда 1).
func _refresh_visibility(pl, world) -> void:
	var goal: Dictionary = {}
	if D.alive_node(pl) and battle != null and is_instance_valid(battle):
		var eye: Vector3 = pl.global_position
		var my_team := int(pl.team)
		for ac in battle.aircraft:
			if ac == pl or not D.alive_node(ac) or int(ac.team) == my_team:
				continue
			goal[ac.get_instance_id()] = cloud_visibility(world, eye, ac.global_position, bool(D.prop(ac, "in_cloud", false)))
	_vis_goal = goal
	for id in _vis.keys():
		if not goal.has(id):
			_vis.erase(id)


## Видимость самолёта для игрока 0..1 (для миникарты и тестов). Союзники — всегда 1;
## враг, которого ещё не проверяли (появился меньше 0,1 с назад), — 0.
func visibility_of(ac) -> float:
	if ac == null or not is_instance_valid(ac):
		return 0.0
	var pl = D.prop(battle, "player")
	if D.alive_node(pl) and int(D.prop(ac, "team", -1)) == int(pl.team):
		return 1.0
	return float(_vis.get(ac.get_instance_id(), 0.0))


## Сколько метров плотного облака на отрезке (плотность × длина).
static func cloud_depth(world, from: Vector3, to: Vector3) -> float:
	if world == null or not world.has_method("cloud_density_at"):
		return 0.0
	var dist := from.distance_to(to)
	if dist < 1.0:
		return 0.0
	var n := clampi(int(ceil(dist / LOS_STEP)), 3, LOS_MAX_SAMPLES)
	var seg := dist / float(n)
	var sum := 0.0
	for i in n:
		var t := (float(i) + 0.5) / float(n)
		sum += clampf(float(world.cloud_density_at(from.lerp(to, t))), 0.0, 1.0) * seg
	return sum


## Видна ли цель из точки from: 1 — видна, 0 — спрятана облаком.
static func cloud_visibility(world, from: Vector3, to: Vector3, target_in_cloud: bool) -> float:
	if from.distance_to(to) < CLOUD_CLOSE:
		return 1.0
	if target_in_cloud:
		return 0.0
	var depth := cloud_depth(world, from, to)
	return 1.0 - clampf((depth - LOS_FADE) / (LOS_HIDE - LOS_FADE), 0.0, 1.0)


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
	debug_marks = []
	debug_lead = false
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
			var gv := float(_ground_vis.get(g.get_instance_id(), 1.0))
			if gv <= 0.02 or not _on_screen(cam, gp, 4.0):
				continue
			var gc := UiStyle.RED
			gc.a = gv
			_diamond(cam.unproject_position(gp) + Vector2(0, -6.0 * u), 5.0 * u, gc)

	# рамка захвата (под подписями маркеров); цель за облаком не показываем
	if lock_target != null and D.alive_node(lock_target) and visibility_of(lock_target) > 0.3:
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
		var vis := 1.0 if ally else visibility_of(ac)
		if not ally and vis > 0.6 and dist < LEAD_RANGE:
			var to := (p - my_pos) / maxf(dist, 0.001)
			var c := fwd.dot(to)
			if c > LEAD_CONE and dist < lead_best:
				lead_best = dist
				lead_target = ac
		if vis <= 0.02:
			continue
		var show := arcade or (ally and dist < REALISTIC_ALLY_RANGE)
		if not show:
			continue
		var col := UiStyle.team_color(int(ac.team))
		if _on_screen(cam, p, 6.0):
			marks.append({"sp": cam.unproject_position(p), "name": String(D.prop(ac, "callsign", "")), "dist": dist,
				"col": col, "locked": ac == lock_target, "a": vis})
			debug_marks.append({"uid": int(D.prop(ac, "uid", -1)), "team": int(ac.team), "arrow": false})
		elif arcade and not ally and dist < ENEMY_ARROW_RANGE:
			col.a = vis
			_edge_arrow(cam, p, dist, col)
			debug_marks.append({"uid": int(D.prop(ac, "uid", -1)), "team": int(ac.team), "arrow": true})
	# ближние рисуются первыми; подпись, которая налезла бы на уже нарисованную, не выводится
	marks.sort_custom(func(a, b): return float(a.dist) < float(b.dist))
	var taken: Array = _touch_button_rects()
	for m in marks:
		_aircraft_marker(m.sp, String(m.name), float(m.dist), m.col, bool(m.locked), taken, float(m.a))

	# упреждение (аркада)
	if arcade and weapons != null:
		var t = lead_target
		if D.alive_node(lock_target) and visibility_of(lock_target) > 0.6 and lock_target.global_position.distance_to(my_pos) < LEAD_RANGE:
			t = lock_target
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


## Сенсорные кнопки: подписи маркеров на них не пишутся.
func _touch_button_rects() -> Array:
	var out: Array = []
	if hud == null or not bool(hud.touch_on) or hud.touch == null or not hud.touch.visible:
		return out
	for b in hud.touch.buttons:
		if b is Dictionary and bool(b.get("shown", true)):
			var c: Vector2 = b.get("c", Vector2.ZERO)
			var r := float(b.get("r", 0.0))
			out.append(Rect2(c - Vector2(r, r), Vector2(r, r) * 2.0))
	return out


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
	draw_polyline(pts, Color(0, 0, 0, 0.6 * col.a), 3.2 * u, true)
	draw_polyline(pts, col, 1.6 * u, true)


func _aircraft_marker(sp: Vector2, callsign: String, dist: float, col: Color, locked: bool, taken: Array, alpha: float = 1.0) -> void:
	col.a *= alpha
	var tip := sp + Vector2(0, -14.0 * u)
	var w := 6.0 * u
	var h := 6.0 * u
	var tri := PackedVector2Array([tip, tip + Vector2(-w, -h), tip + Vector2(w, -h)])
	var outline := PackedVector2Array([tip, tip + Vector2(-w, -h), tip + Vector2(w, -h), tip])
	draw_polyline(outline, Color(0, 0, 0, 0.6 * alpha), 3.0 * u, true)
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
	D.text(self, Vector2(x0 + name_w + gap, base_y), dist_s, fs, Color(1, 1, 1, 0.85 * alpha), -1, null, 3)


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
	draw_polyline(ol, Color(0, 0, 0, 0.6 * col.a), 3.0 * u, true)
	draw_colored_polygon(tri, col)
	var fs := int(round(12.0 * u))
	var label := D.fmt_dist(dist)
	var tw := D.text_width(label, fs)
	# подпись внутрь экрана от стрелки, с учётом ширины текста
	var off := s * 0.6 + 6.0 * u + absf(dir.x) * tw * 0.5 + absf(dir.y) * fs * 0.6
	D.text_mid(self, pos - dir * off, label, fs, Color(1, 1, 1, 0.9 * col.a), 0, null, 3)


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
	var txt := "Захват" if locked else "Захват %d %%" % int(progress * 100.0)
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
	debug_lead = true
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
