extends Control
## Лента сбитых (справа под миникартой) и сообщения боя (по центру сверху).

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const KILL_TIME := 6.0
const KILL_MAX := 5
const MSG_MAX := 3
const FADE := 0.5

var hud = null
var u: float = 1.0
var kills: Array = []        # [{text, killer_team, victim_team, t}]
var messages: Array = []     # [{text, t}]
var player_name: String = ""
var kill_top: float = 230.0  # верх ленты (под миникартой), ставит BattleHUD
var kill_visible: int = KILL_MAX  # на сенсорном экране меньше, чтобы не залезать на кнопки


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func add_kill(text: String, killer_team: int, victim_team: int) -> void:
	kills.append({"text": text, "killer_team": killer_team, "victim_team": victim_team, "t": KILL_TIME})
	while kills.size() > KILL_MAX:
		kills.pop_front()
	queue_redraw()


func add_message(text: String, seconds: float) -> void:
	if text.strip_edges() == "":
		return
	var secs := maxf(seconds, 1.0)
	for m in messages:
		if String(m.text) == text:
			m.t = maxf(float(m.t), secs)
			queue_redraw()
			return
	messages.append({"text": text, "t": secs})
	while messages.size() > MSG_MAX:
		messages.pop_front()
	queue_redraw()


func clear_messages() -> void:
	messages.clear()
	queue_redraw()


func tick(dt: float) -> void:
	var changed := false
	for i in range(kills.size() - 1, -1, -1):
		kills[i].t = float(kills[i].t) - dt
		if float(kills[i].t) <= 0.0:
			kills.remove_at(i)
		changed = true
	for i in range(messages.size() - 1, -1, -1):
		messages[i].t = float(messages[i].t) - dt
		if float(messages[i].t) <= 0.0:
			messages.remove_at(i)
		changed = true
	if changed:
		queue_redraw()


func _draw() -> void:
	_draw_kills()
	_draw_messages()


func _draw_kills() -> void:
	if kills.is_empty():
		return
	var fs := int(round(14.0 * u))
	var row_h := 25.0 * u
	var right := size.x - 16.0 * u
	var y := kill_top
	var first := maxi(0, kills.size() - kill_visible)
	for idx in range(first, kills.size()):
		var k: Dictionary = kills[idx]
		var a := clampf(float(k.t) / FADE, 0.0, 1.0)
		var text := String(k.text)
		var parts := _split_kill(text)
		var total := 0.0
		for p in parts:
			total += D.text_width(String(p[0]), fs)
		var r := Rect2(right - total - 20.0 * u, y, total + 20.0 * u, row_h - 3.0 * u)
		var mine := player_name != "" and text.find(player_name) >= 0
		var border := UiStyle.ACCENT if mine else Color(1, 1, 1, 0.06)
		border.a *= a
		draw_style_box(D.box(Color(0.05, 0.07, 0.09, 0.62 * a), int(4 * u), border, 1), r)
		var x := r.position.x + 10.0 * u
		var cy := r.get_center().y
		for p in parts:
			var col: Color = _part_color(int(p[1]), k)
			col.a *= a
			D.text_mid(self, Vector2(x, cy), String(p[0]), fs, col, -1, null, 0)
			x += D.text_width(String(p[0]), fs)
		y += row_h


## Делит «Стриж (Иней) сбил Кречет (Гром)» на части: [текст, роль] (0 — убийца, 1 — глагол, 2 — жертва).
static func _split_kill(text: String) -> Array:
	var verb := " сбил "
	var i := text.find(verb)
	if i < 0:
		return [[text, 2]]
	return [[text.substr(0, i), 0], [verb, 1], [text.substr(i + verb.length()), 2]]


func _part_color(role: int, k: Dictionary) -> Color:
	match role:
		0:
			var kt := int(k.killer_team)
			return UiStyle.team_color(kt) if kt >= 0 else UiStyle.TEXT
		1:
			return UiStyle.MUTED
	var vt := int(k.victim_team)
	return UiStyle.team_color(vt) if vt >= 0 else UiStyle.TEXT


func _draw_messages() -> void:
	if messages.is_empty():
		return
	var fs := int(round(18.0 * u))
	var row_h := 34.0 * u
	var y := size.y * 0.155
	for m in messages:
		var a := clampf(float(m.t) / FADE, 0.0, 1.0)
		var text := String(m.text)
		var tw := D.text_width(text, fs)
		var r := Rect2(size.x * 0.5 - tw * 0.5 - 16.0 * u, y, tw + 32.0 * u, row_h - 4.0 * u)
		draw_style_box(D.box(Color(0.05, 0.07, 0.09, 0.66 * a), int(5 * u), Color(1, 1, 1, 0.08 * a), 1), r)
		D.text_mid(self, r.get_center(), text, fs, Color(1, 1, 1, a), 0, null, 0)
		y += row_h
