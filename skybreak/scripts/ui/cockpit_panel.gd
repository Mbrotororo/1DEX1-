extends Control
## Приборная панель в режиме кабины: скорость, высота, авиагоризонт, вариометр, перегрузка,
## газ, курсовая лента и лампы (двигатель, пожар, шасси, форсаж, сваливание). Рисуется в _draw.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const BASE_HEIGHT := 224.0
const FACE := Color(0.06, 0.07, 0.075)
const BEZEL := Color(0.20, 0.22, 0.24)
const TICK := Color(0.92, 0.93, 0.9)
const NEEDLE := Color(1.0, 0.62, 0.25)
const SKY := Color(0.24, 0.50, 0.78)
const GROUND := Color(0.45, 0.30, 0.16)
const LAMP_OFF := Color(0.18, 0.19, 0.2)
const COMPASS := ["С", "", "", "В", "", "", "Ю", "", "", "З", "", ""]

var hud = null
var u: float = 1.0
var def: Dictionary = {}
var speed_kmh: float = 0.0
var alt: float = 0.0
var bank: float = 0.0
var pitch: float = 0.0
var vs: float = 0.0
var g: float = 1.0
var throttle: float = 0.0
var heading_deg: float = 0.0
var afterburner: bool = false
var gear_down: bool = false
var engine_dead: bool = false
var engine_low: bool = false
var on_fire: bool = false
var stalled: bool = false
var _clock: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func panel_height() -> float:
	return BASE_HEIGHT * u


func refresh(pl, dt: float) -> void:
	_clock += dt
	if not D.alive_node(pl):
		return
	def = D.prop(pl, "def", {})
	var fm = D.prop(pl, "fm")
	var dmg = D.prop(pl, "dmg")
	var spd := float(D.prop(fm, "airspeed", 0.0))
	if spd <= 0.0 and pl.has_method("speed"):
		spd = float(pl.speed())
	speed_kmh = lerpf(speed_kmh, spd * 3.6, 1.0 - exp(-12.0 * dt))
	var p: Vector3 = fm.pos if fm != null and "pos" in fm else pl.global_position
	alt = maxf(p.y, 0.0)
	if fm != null and fm.has_method("bank"):
		bank = float(fm.bank())
		pitch = float(fm.pitch_angle())
		heading_deg = fposmod(rad_to_deg(float(fm.heading())), 360.0)
	else:
		var f: Vector3 = pl.forward()
		pitch = asin(clampf(f.y, -1.0, 1.0))
		heading_deg = fposmod(rad_to_deg(atan2(f.x, -f.z)), 360.0)
	vs = lerpf(vs, float(D.prop(fm, "vertical_speed", 0.0)), 1.0 - exp(-6.0 * dt))
	g = lerpf(g, float(D.prop(fm, "g_load", 1.0)), 1.0 - exp(-10.0 * dt))
	throttle = clampf(float(D.prop(fm, "throttle", 0.0)), 0.0, 1.0)
	afterburner = bool(D.prop(fm, "afterburner", false))
	gear_down = bool(D.prop(fm, "gear_down", false))
	stalled = bool(D.prop(fm, "stalled", false))
	engine_dead = bool(D.prop(dmg, "engine_dead", false))
	on_fire = bool(D.prop(dmg, "on_fire", false))
	engine_low = false
	if dmg != null and dmg.has_method("module_ratio"):
		engine_low = float(dmg.module_ratio("engine")) < 0.4
	queue_redraw()


func panel_rect() -> Rect2:
	var ph := panel_height()
	var pw := minf(size.x - 16.0 * u, 990.0 * u)
	return Rect2(size.x * 0.5 - pw * 0.5, size.y - ph, pw, ph)


func _draw() -> void:
	var r := panel_rect()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.10, 0.11, 0.12, 0.96)
	sb.border_color = Color(0.30, 0.32, 0.34)
	sb.border_width_top = int(2 * u)
	sb.border_width_left = int(2 * u)
	sb.border_width_right = int(2 * u)
	sb.corner_radius_top_left = int(18 * u)
	sb.corner_radius_top_right = int(18 * u)
	sb.anti_aliasing = true
	draw_style_box(sb, r.grow_side(SIDE_BOTTOM, 4.0))
	_compass(Rect2(r.get_center().x - 200.0 * u, r.position.y + 10.0 * u, 400.0 * u, 28.0 * u))
	var R := 60.0 * u
	var cy := r.position.y + 50.0 * u + R + 6.0 * u
	var pitch_x := 2.0 * R + 22.0 * u
	var cx := r.get_center().x - 72.0 * u
	var max_kmh := ceilf(float(def.get("vne", 200.0)) * 3.6 / 200.0) * 200.0
	var step := 100.0 if max_kmh <= 900.0 else 200.0
	_dial(Vector2(cx - pitch_x * 2.0, cy), R, "км/ч", 0.0, max_kmh, speed_kmh, step, 2, Game.fmt_int(int(round(speed_kmh))))
	_altimeter(Vector2(cx - pitch_x, cy), R)
	_horizon(Vector2(cx, cy), R * 1.08)
	_vsi(Vector2(cx + pitch_x, cy), R)
	_gmeter(Vector2(cx + pitch_x * 2.0, cy), R)
	_throttle(Rect2(cx + pitch_x * 2.0 + R + 26.0 * u, cy - R, 26.0 * u, R * 2.0))
	_lamps(Vector2(cx + pitch_x * 2.0 + R + 78.0 * u, cy - R + 6.0 * u))


# ---------------------------------------------------------------- приборы

func _face(c: Vector2, R: float) -> void:
	draw_circle(c, R + 5.0 * u, BEZEL)
	draw_arc(c, R + 5.0 * u, 0.0, TAU, 48, Color(0, 0, 0, 0.6), 1.5 * u, true)
	draw_circle(c, R, FACE)


func _needle(c: Vector2, angle: float, length: float, width: float, col: Color) -> void:
	var d := Vector2.from_angle(angle)
	var p := Vector2(-d.y, d.x)
	var pts := PackedVector2Array([c + d * length, c + p * width, c - d * length * 0.16, c - p * width])
	draw_colored_polygon(pts, col)


func _cap(c: Vector2) -> void:
	draw_circle(c, 5.0 * u, Color(0.25, 0.26, 0.27))
	draw_circle(c, 2.5 * u, Color(0.08, 0.08, 0.08))


## Круглая шкала 270°: от левого низа по часовой до правого низа.
func _dial(c: Vector2, R: float, unit: String, vmin: float, vmax: float, value: float, step: float, minor: int, readout: String) -> void:
	_face(c, R)
	var a0 := PI * 0.75
	var sweep := PI * 1.5
	var fs := int(round(11.0 * u))
	var n := int(round((vmax - vmin) / step))
	for i in n + 1:
		var v := vmin + i * step
		var a := a0 + (v - vmin) / (vmax - vmin) * sweep
		var d := Vector2.from_angle(a)
		draw_line(c + d * (R - 10.0 * u), c + d * (R - 2.0 * u), TICK, 2.0 * u, true)
		var lbl := str(int(v)) if vmax < 1000.0 else str(int(v / 100.0))
		D.text_mid(self, c + d * (R - 20.0 * u), lbl, fs, TICK, 0, null, 0)
		if i < n:
			for m in range(1, minor):
				var am := a + float(m) / minor * (step / (vmax - vmin) * sweep)
				var dm := Vector2.from_angle(am)
				draw_line(c + dm * (R - 6.0 * u), c + dm * (R - 2.0 * u), TICK, 1.0 * u, true)
	var unit_s := unit if vmax < 1000.0 else unit + " ×100"
	D.text_mid(self, c + Vector2(0, -R * 0.34), unit_s, int(round(10.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text_mid(self, c + Vector2(0, R * 0.48), readout, int(round(13.0 * u)), TICK, 0, D.bold(), 0)
	var t := clampf((value - vmin) / (vmax - vmin), 0.0, 1.04)
	_needle(c, a0 + t * sweep, R - 9.0 * u, 3.0 * u, NEEDLE)
	_cap(c)


func _altimeter(c: Vector2, R: float) -> void:
	_face(c, R)
	var fs := int(round(12.0 * u))
	for i in 10:
		var a := -PI * 0.5 + i / 10.0 * TAU
		var d := Vector2.from_angle(a)
		draw_line(c + d * (R - 10.0 * u), c + d * (R - 2.0 * u), TICK, 2.0 * u, true)
		D.text_mid(self, c + d * (R - 20.0 * u), str(i), fs, TICK, 0, null, 0)
		for m in range(1, 5):
			var dm := Vector2.from_angle(a + m / 5.0 * TAU / 10.0)
			draw_line(c + dm * (R - 6.0 * u), c + dm * (R - 2.0 * u), TICK, 1.0 * u, true)
	D.text_mid(self, c + Vector2(0, -R * 0.34), "м ×100", int(round(10.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text_mid(self, c + Vector2(0, R * 0.48), Game.fmt_int(int(round(alt))), int(round(13.0 * u)), TICK, 0, D.bold(), 0)
	_needle(c, -PI * 0.5 + fposmod(alt, 10000.0) / 10000.0 * TAU, R * 0.5, 4.0 * u, TICK)
	_needle(c, -PI * 0.5 + fposmod(alt, 1000.0) / 1000.0 * TAU, R - 9.0 * u, 2.6 * u, NEEDLE)
	_cap(c)


func _horizon(c: Vector2, R: float) -> void:
	draw_circle(c, R + 5.0 * u, BEZEL)
	var circle := PackedVector2Array()
	for i in 48:
		circle.append(c + Vector2.from_angle(i / 48.0 * TAU) * R)
	draw_colored_polygon(circle, SKY)
	var rot := -bank
	var k := R / deg_to_rad(45.0)
	var down := Vector2(0, 1).rotated(rot)
	var along := Vector2(1, 0).rotated(rot)
	var h0 := c + down * clampf(pitch, -1.4, 1.4) * k
	var big := R * 4.0
	var ground := PackedVector2Array([h0 - along * big, h0 + along * big, h0 + along * big + down * big, h0 - along * big + down * big])
	for poly in Geometry2D.intersect_polygons(circle, ground):
		draw_colored_polygon(poly, GROUND)
	# линия горизонта и шкала тангажа
	var hl := Geometry2D.intersect_polyline_with_polygon(PackedVector2Array([h0 - along * big, h0 + along * big]), circle)
	for seg in hl:
		draw_polyline(seg, Color.WHITE, 2.0 * u, true)
	for deg in [-20, -10, 10, 20]:
		var off := c + down * (clampf(pitch, -1.4, 1.4) - deg_to_rad(deg)) * k
		var w := (R * 0.28) if absi(deg) == 10 else (R * 0.42)
		if off.distance_to(c) < R * 0.78:
			draw_line(off - along * w * 0.5, off + along * w * 0.5, Color(1, 1, 1, 0.8), 1.2 * u, true)
	# шкала крена
	for deg in [-60, -30, -20, -10, 0, 10, 20, 30, 60]:
		var a := -PI * 0.5 + deg_to_rad(deg)
		var d := Vector2.from_angle(a)
		var l := 9.0 * u if deg % 30 == 0 else 5.0 * u
		draw_line(c + d * (R - l), c + d * R, Color.WHITE, 1.5 * u, true)
	var bd := Vector2.from_angle(-PI * 0.5 + rot)
	var bp := Vector2(-bd.y, bd.x)
	var tip := c + bd * (R - 11.0 * u)
	draw_colored_polygon(PackedVector2Array([tip, tip - bd * 8.0 * u + bp * 5.0 * u, tip - bd * 8.0 * u - bp * 5.0 * u]), NEEDLE)
	# силуэт самолёта
	var wy := c.y
	draw_line(Vector2(c.x - R * 0.55, wy), Vector2(c.x - R * 0.18, wy), NEEDLE, 3.0 * u)
	draw_line(Vector2(c.x + R * 0.18, wy), Vector2(c.x + R * 0.55, wy), NEEDLE, 3.0 * u)
	draw_polyline(PackedVector2Array([Vector2(c.x - R * 0.18, wy), Vector2(c.x, wy + R * 0.12), Vector2(c.x + R * 0.18, wy)]), NEEDLE, 3.0 * u, true)
	draw_circle(c, 2.5 * u, NEEDLE)
	draw_arc(c, R, 0.0, TAU, 48, Color(0, 0, 0, 0.7), 2.0 * u, true)


func _vsi(c: Vector2, R: float) -> void:
	_face(c, R)
	var fs := int(round(11.0 * u))
	var span := PI * 0.85
	for v in [-30, -20, -10, 0, 10, 20, 30]:
		var a := PI + float(v) / 30.0 * span
		var d := Vector2.from_angle(a)
		draw_line(c + d * (R - 10.0 * u), c + d * (R - 2.0 * u), TICK, 2.0 * u, true)
		D.text_mid(self, c + d * (R - 20.0 * u), str(absi(v)), fs, TICK, 0, null, 0)
	for v in range(-30, 31, 5):
		if v % 10 == 0:
			continue
		var dm := Vector2.from_angle(PI + float(v) / 30.0 * span)
		draw_line(c + dm * (R - 6.0 * u), c + dm * (R - 2.0 * u), TICK, 1.0 * u, true)
	D.text_mid(self, c + Vector2(R * 0.18, -R * 0.36), "вверх", int(round(9.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text_mid(self, c + Vector2(R * 0.18, R * 0.36), "вниз", int(round(9.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text_mid(self, c + Vector2(R * 0.28, 0), "м/с", int(round(10.0 * u)), UiStyle.MUTED, 0, null, 0)
	_needle(c, PI + clampf(vs / 30.0, -1.05, 1.05) * span, R - 9.0 * u, 3.0 * u, NEEDLE)
	_cap(c)


func _gmeter(c: Vector2, R: float) -> void:
	_face(c, R)
	var vmin := -4.0
	var vmax := 10.0
	var a0 := PI * 0.75
	var sweep := PI * 1.5
	var lim := float(def.get("g_limit", 9.0))
	var la := a0 + (lim - vmin) / (vmax - vmin) * sweep
	draw_arc(c, R - 4.0 * u, la, a0 + sweep, 16, UiStyle.DANGER, 4.0 * u, true)
	draw_arc(c, R - 4.0 * u, a0, a0 + (-2.0 - vmin) / (vmax - vmin) * sweep, 12, UiStyle.DANGER, 4.0 * u, true)
	var fs := int(round(11.0 * u))
	for v in range(-4, 11):
		var a := a0 + (v - vmin) / (vmax - vmin) * sweep
		var d := Vector2.from_angle(a)
		var major := v % 2 == 0
		draw_line(c + d * (R - (10.0 if major else 6.0) * u), c + d * (R - 2.0 * u), TICK, (2.0 if major else 1.0) * u, true)
		if major:
			D.text_mid(self, c + d * (R - 20.0 * u), str(v), fs, TICK, 0, null, 0)
	D.text_mid(self, c + Vector2(0, -R * 0.34), "G", int(round(11.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text_mid(self, c + Vector2(0, R * 0.48), D.fmt_dec(g), int(round(13.0 * u)), TICK, 0, D.bold(), 0)
	var t := clampf((g - vmin) / (vmax - vmin), -0.03, 1.03)
	_needle(c, a0 + t * sweep, R - 9.0 * u, 3.0 * u, NEEDLE)
	_cap(c)


func _throttle(r: Rect2) -> void:
	draw_style_box(D.box(FACE, int(4 * u), BEZEL, int(2 * u)), r)
	var inner := r.grow(-4.0 * u)
	var h := inner.size.y * throttle
	var col := UiStyle.ACCENT if afterburner else Color(0.85, 0.87, 0.85)
	draw_rect(Rect2(inner.position.x, inner.end.y - h, inner.size.x, h), col)
	for i in range(1, 4):
		var y := inner.end.y - inner.size.y * i / 4.0
		draw_line(Vector2(inner.position.x, y), Vector2(inner.end.x, y), Color(0, 0, 0, 0.6), 1.0)
	D.text(self, Vector2(r.get_center().x, r.position.y - 6.0 * u), "Газ", int(round(11.0 * u)), UiStyle.MUTED, 0, null, 0)
	D.text(self, Vector2(r.get_center().x, r.end.y + 15.0 * u), "%d" % int(round(throttle * 100.0)), int(round(12.0 * u)), TICK, 0, D.bold(), 0)


func _lamps(p: Vector2) -> void:
	var blink := fmod(_clock, 0.6) < 0.35
	var eng_col := LAMP_OFF
	if engine_dead:
		eng_col = UiStyle.DANGER
	elif engine_low:
		eng_col = UiStyle.WARN
	var lamps := [
		["Двигатель", eng_col],
		["Пожар", UiStyle.DANGER if on_fire and blink else LAMP_OFF],
		["Шасси", UiStyle.GOOD if gear_down else LAMP_OFF],
		["Форсаж", UiStyle.ACCENT if afterburner else LAMP_OFF],
		["Сваливание", UiStyle.DANGER if stalled and blink else LAMP_OFF],
	]
	var fs := int(round(12.0 * u))
	var y := p.y
	for l in lamps:
		var col: Color = l[1]
		var on := col != LAMP_OFF
		draw_circle(Vector2(p.x, y), 7.0 * u, Color(0, 0, 0, 0.8))
		draw_circle(Vector2(p.x, y), 5.5 * u, col)
		if on:
			var glow := col
			glow.a = 0.25
			draw_circle(Vector2(p.x, y), 10.0 * u, glow)
		D.text_mid(self, Vector2(p.x + 14.0 * u, y), String(l[0]), fs, UiStyle.TEXT if on else UiStyle.MUTED, -1, null, 0)
		y += 24.0 * u


func _compass(r: Rect2) -> void:
	draw_style_box(D.box(FACE, int(4 * u), BEZEL, int(2 * u)), r)
	var cx := r.get_center().x
	var px_per_deg := r.size.x / 90.0
	var fs := int(round(12.0 * u))
	var start := int(floor((heading_deg - 45.0) / 5.0)) * 5
	for d in range(start, int(heading_deg + 46.0), 5):
		var x := cx + (d - heading_deg) * px_per_deg
		if x < r.position.x + 4.0 * u or x > r.end.x - 4.0 * u:
			continue
		var dd := posmod(d, 360)
		var major := dd % 10 == 0
		draw_line(Vector2(x, r.end.y - (8.0 if major else 4.0) * u), Vector2(x, r.end.y - 2.0 * u), TICK, 1.0 * u)
		if dd % 30 == 0:
			var lbl: String = COMPASS[dd / 30]
			if lbl == "":
				lbl = str(dd / 10)
			D.text(self, Vector2(x, r.position.y + 14.0 * u), lbl, fs, NEEDLE if lbl in ["С", "В", "Ю", "З"] else TICK, 0, D.bold(), 0)
	draw_colored_polygon(PackedVector2Array([Vector2(cx, r.end.y - 9.0 * u), Vector2(cx - 5.0 * u, r.end.y + 1.0 * u), Vector2(cx + 5.0 * u, r.end.y + 1.0 * u)]), NEEDLE)
	var hs := "%03d°" % (int(round(heading_deg)) % 360)
	var hr := Rect2(r.end.x + 8.0 * u, r.position.y, 58.0 * u, r.size.y)
	draw_style_box(D.box(FACE, int(4 * u), BEZEL, int(2 * u)), hr)
	D.text_mid(self, hr.get_center(), hs, int(round(13.0 * u)), TICK, 0, D.bold(), 0)
