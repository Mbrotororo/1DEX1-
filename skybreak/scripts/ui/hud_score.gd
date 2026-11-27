extends Control
## Сверху по центру: очки команд полосами, время боя, зоны A B C с прогрессом захвата.
## В обучении и тестовом полёте вместо счёта — название режима.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const NEUTRAL := Color(0.62, 0.66, 0.70)

var hud = null
var battle = null
var u: float = 1.0
var show_score: bool = true
var tickets: Array = [0.0, 0.0]
var max_tickets: float = 1.0
var time_left: float = 0.0
var zones: Array = []
var mode_title: String = ""


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


static func battle_shows_score(b) -> bool:
	if b == null or not is_instance_valid(b):
		return false
	if "show_score" in b:
		return bool(b.get("show_score"))
	return String(b.mode) in ["arcade", "realistic"]


func refresh() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	show_score = battle_shows_score(battle)
	var t = battle.tickets
	if t is Array and (t as Array).size() >= 2:
		tickets = [float(t[0]), float(t[1])]
	max_tickets = maxf(float(battle.max_tickets), 1.0)
	time_left = float(battle.time_left)
	zones = battle.zones_state if battle.zones_state is Array else []
	var m := String(battle.mode)
	mode_title = String(Data.MODE_NAMES.get(m, "")) if not show_score else ""
	queue_redraw()


func _draw() -> void:
	var cx := size.x * 0.5
	var top := 12.0 * u
	if not show_score:
		if mode_title != "":
			var fs := int(round(16.0 * u))
			var tw := D.text_width(mode_title, fs, D.bold())
			var r := Rect2(cx - tw * 0.5 - 14.0 * u, top, tw + 28.0 * u, 30.0 * u)
			D.panel(self, r, 0.6, int(6 * u))
			D.text_mid(self, r.get_center(), mode_title, fs, UiStyle.TEXT, 0, D.bold(), 0)
		return
	var timer_w := 78.0 * u
	var bar_w := 150.0 * u
	var num_w := 56.0 * u
	var h := 32.0 * u
	var total := timer_w + (bar_w + num_w + 16.0 * u) * 2.0
	var bg := Rect2(cx - total * 0.5, top, total, h)
	D.panel(self, bg, 0.6, int(6 * u))
	var mid_y := top + h * 0.5
	# таймер
	var tr := Rect2(cx - timer_w * 0.5, top + 3.0 * u, timer_w, h - 6.0 * u)
	draw_style_box(D.box(Color(1, 1, 1, 0.07), int(4 * u), Color(0, 0, 0, 0), 0), tr)
	var t_col := UiStyle.TEXT if time_left > 60.0 else UiStyle.WARN
	D.text_mid(self, tr.get_center(), Game.fmt_time(time_left), int(round(19.0 * u)), t_col, 0, D.bold(), 0)
	# полосы
	var bh := 8.0 * u
	var fb := clampf(float(tickets[0]) / max_tickets, 0.0, 1.0)
	var fr := clampf(float(tickets[1]) / max_tickets, 0.0, 1.0)
	var bl := Rect2(cx - timer_w * 0.5 - 8.0 * u - bar_w, mid_y - bh * 0.5, bar_w, bh)
	var rr := Rect2(cx + timer_w * 0.5 + 8.0 * u, mid_y - bh * 0.5, bar_w, bh)
	draw_rect(bl, Color(1, 1, 1, 0.10))
	draw_rect(rr, Color(1, 1, 1, 0.10))
	draw_rect(Rect2(bl.end.x - bar_w * fb, bl.position.y, bar_w * fb, bh), UiStyle.BLUE)
	draw_rect(Rect2(rr.position.x, rr.position.y, bar_w * fr, bh), UiStyle.RED)
	var fs_n := int(round(18.0 * u))
	D.text_mid(self, Vector2(bl.position.x - 8.0 * u, mid_y), Game.fmt_int(int(round(float(tickets[0])))), fs_n, UiStyle.BLUE.lightened(0.15), 1, D.bold(), 0)
	D.text_mid(self, Vector2(rr.end.x + 8.0 * u, mid_y), Game.fmt_int(int(round(float(tickets[1])))), fs_n, UiStyle.RED.lightened(0.1), -1, D.bold(), 0)
	# зоны
	if zones.is_empty():
		return
	var zr := 14.0 * u
	var gap := 38.0 * u
	var zy := top + h + 8.0 * u + zr
	var x := cx - gap * (zones.size() - 1) * 0.5
	for z in zones:
		_zone_badge(Vector2(x, zy), zr, z)
		x += gap


func _zone_badge(c: Vector2, r: float, z: Dictionary) -> void:
	var owner := int(z.get("owner", -1))
	var prog := clampf(float(z.get("progress", 0.0)), -1.0, 1.0)
	var fill := NEUTRAL
	if owner == 0:
		fill = UiStyle.BLUE
	elif owner == 1:
		fill = UiStyle.RED
	var bgc := Color(0.05, 0.07, 0.09, 0.72)
	draw_circle(c, r + 3.0 * u, bgc)
	var inner := fill
	inner.a = 0.85 if owner >= 0 else 0.35
	draw_circle(c, r - 1.5 * u, inner)
	# кольцо захвата: синее растёт по часовой, красное — против
	if absf(prog) > 0.01:
		var ring_col := UiStyle.BLUE if prog > 0.0 else UiStyle.RED
		var a0 := -PI * 0.5
		var a1 := a0 + TAU * prog
		draw_arc(c, r + 1.0 * u, a0, a1, 40, ring_col.lightened(0.2), 3.0 * u, true)
	D.text_mid(self, c, String(z.get("id", "?")), int(round(15.0 * u)), Color.WHITE, 0, D.bold(), 3)
