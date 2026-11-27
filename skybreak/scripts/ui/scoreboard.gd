extends Control
## Таблица по Tab: две колонки (синие и красные): игрок, самолёт, сбито, земля, смерти, очки.
## Строка игрока подсвечена.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const HEADERS := ["Игрок", "Самолёт", "Сбито", "Земля", "Смерти", "Очки"]
const KEYS := ["name", "plane", "kills", "ground", "deaths", "score"]
const COLS := [0.26, 0.24, 0.12, 0.12, 0.13, 0.13]

var hud = null
var battle = null
var u: float = 1.0
var rows: Array = []
var top_offset: float = 0.0      # сдвиг вниз (под баннер в конце боя)
var _refresh_t: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func tick(dt: float) -> void:
	_refresh_t -= dt
	if _refresh_t <= 0.0:
		_refresh_t = 0.25
		refresh()


func refresh() -> void:
	rows = []
	if battle != null and is_instance_valid(battle) and battle.has_method("get_scoreboard"):
		var r = battle.get_scoreboard()
		if r is Array:
			rows = r
	queue_redraw()


func team_rows(team: int) -> Array:
	var out: Array = []
	for r in rows:
		if r is Dictionary and int(r.get("team", 0)) == team:
			out.append(r)
	return out


func _draw() -> void:
	var blue := team_rows(0)
	var red := team_rows(1)
	var n := maxi(maxi(blue.size(), red.size()), 1)
	var row_h := 28.0 * u
	var pw := minf(size.x - 32.0 * u, 1060.0 * u)
	var ph := 92.0 * u + n * row_h + 14.0 * u
	var r := Rect2(size.x * 0.5 - pw * 0.5, maxf(size.y * 0.5 - ph * 0.5, 70.0 * u) + top_offset, pw, ph)
	draw_style_box(D.box(Color(0.06, 0.08, 0.10, 0.93), int(10 * u), Color(1, 1, 1, 0.12), 1), r)
	var gap := 20.0 * u
	var tw := (pw - 32.0 * u - gap) * 0.5
	var x0 := r.position.x + 16.0 * u
	var tickets = D.prop(battle, "tickets", [])
	var show_t := tickets is Array and (tickets as Array).size() >= 2 and _shows_score()
	_team(Rect2(x0, r.position.y + 14.0 * u, tw, ph - 28.0 * u), 0, blue, int(round(float(tickets[0]))) if show_t else -1, row_h)
	_team(Rect2(x0 + tw + gap, r.position.y + 14.0 * u, tw, ph - 28.0 * u), 1, red, int(round(float(tickets[1]))) if show_t else -1, row_h)
	draw_line(Vector2(r.get_center().x, r.position.y + 16.0 * u), Vector2(r.get_center().x, r.end.y - 16.0 * u), Color(1, 1, 1, 0.08), 1.0)
	if battle != null and is_instance_valid(battle) and String(battle.mode) == "arcade" and String(battle.state) != "ended":
		var pts := int(D.prop(battle, "spawn_points", 0))
		D.text(self, Vector2(r.get_center().x, r.end.y + 22.0 * u), "Очки вылета: " + Game.fmt_int(pts), int(round(15.0 * u)), UiStyle.TEXT, 0, null, 4)


func _shows_score() -> bool:
	if battle == null or not is_instance_valid(battle):
		return false
	if "show_score" in battle:
		return bool(battle.get("show_score"))
	return String(battle.mode) in ["arcade", "realistic"]


func _team(r: Rect2, team: int, list: Array, tickets: int, row_h: float) -> void:
	var col := UiStyle.team_color(team)
	var fs_h := int(round(20.0 * u))
	var team_name := String(Data.TEAM_NAMES[team])
	D.text(self, Vector2(r.position.x + 4.0 * u, r.position.y + 22.0 * u), team_name, fs_h, col, -1, D.bold(), 0)
	if tickets >= 0:
		D.text(self, Vector2(r.end.x - 4.0 * u, r.position.y + 22.0 * u), Game.fmt_int(tickets), fs_h, col, 1, D.bold(), 0)
	draw_rect(Rect2(r.position.x, r.position.y + 32.0 * u, r.size.x, 2.0 * u), Color(col, 0.7))
	var y := r.position.y + 52.0 * u
	var fs := int(round(14.0 * u))
	var xs: Array = []
	var x := r.position.x + 8.0 * u
	var inner := r.size.x - 16.0 * u
	for w in COLS:
		xs.append(x)
		x += inner * float(w)
	for i in HEADERS.size():
		var right := i >= 2
		var hx: float = xs[i] + (inner * float(COLS[i]) if right else 0.0)
		D.text(self, Vector2(hx, y), String(HEADERS[i]), int(round(12.0 * u)), UiStyle.MUTED, 1 if right else -1, null, 0)
	y += 10.0 * u
	for row in list:
		var rr := Rect2(r.position.x, y, r.size.x, row_h - 2.0 * u)
		var mine := bool(row.get("is_player", false))
		if mine:
			draw_style_box(D.box(Color(UiStyle.ACCENT, 0.22), int(4 * u), Color(UiStyle.ACCENT, 0.7), 1), rr)
		var alpha := 1.0 if bool(row.get("alive", true)) or mine else 0.6
		var cy := rr.get_center().y
		for i in KEYS.size():
			var v = row.get(KEYS[i], "")
			var s := String(v) if i < 2 else str(int(v))
			var right := i >= 2
			var cx: float = xs[i] + (inner * float(COLS[i]) if right else 0.0)
			var c := UiStyle.TEXT if i != 1 else UiStyle.MUTED
			if i == 0 and mine:
				c = UiStyle.ACCENT.lightened(0.25)
			c.a *= alpha
			var max_w := inner * float(COLS[i]) - 6.0 * u
			D.text_mid(self, Vector2(cx, cy), _fit(s, fs, max_w), fs, c, 1 if right else -1, D.bold() if i == 5 else null, 0)
		y += row_h


func _fit(s: String, fs: int, max_w: float) -> String:
	if D.text_width(s, fs) <= max_w:
		return s
	var t := s
	while t.length() > 1 and D.text_width(t + "…", fs) > max_w:
		t = t.substr(0, t.length() - 1)
	return t + "…"
