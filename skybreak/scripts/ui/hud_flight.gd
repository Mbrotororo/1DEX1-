extends Control
## Полётные данные слева: скорость, высота, газ, перегрузка, угол атаки.
## Значения обновляет BattleHUD около 15 раз в секунду через refresh().

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

var hud = null
var u: float = 1.0
var rows: Array = []        # [{label, value, color}]
var afterburner: bool = false
var throttle: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func refresh(pl) -> void:
	rows.clear()
	if not D.alive_node(pl):
		queue_redraw()
		return
	var fm = D.prop(pl, "fm")
	var def: Dictionary = D.prop(pl, "def", {})
	var spd := float(D.prop(fm, "airspeed", 0.0))
	if spd <= 0.0 and pl.has_method("speed"):
		spd = float(pl.speed())
	var stall := 0.0
	if fm != null and fm.has_method("stall_speed"):
		stall = float(fm.stall_speed())
	var spd_col := UiStyle.TEXT
	if bool(D.prop(fm, "stalled", false)) or bool(D.prop(fm, "overspeed", false)):
		spd_col = UiStyle.DANGER
	elif stall > 0.0 and spd < stall * 1.2 and not bool(D.prop(fm, "on_ground", false)):
		spd_col = UiStyle.WARN
	rows.append({"label": "Скорость", "value": Game.fmt_speed(spd), "color": spd_col})
	var alt := 0.0
	if fm != null and "pos" in fm:
		alt = (fm.pos as Vector3).y
	else:
		alt = (pl.global_position as Vector3).y
	rows.append({"label": "Высота", "value": Game.fmt_alt(maxf(alt, 0.0)), "color": UiStyle.TEXT})
	throttle = clampf(float(D.prop(fm, "throttle", 0.0)), 0.0, 1.0)
	afterburner = bool(D.prop(fm, "afterburner", false))
	rows.append({"label": "Газ", "value": "%d %%" % int(round(throttle * 100.0)), "color": UiStyle.ACCENT if afterburner else UiStyle.TEXT})
	var g := float(D.prop(fm, "g_load", 1.0))
	var g_lim := float(def.get("g_limit", 9.0))
	var g_col := UiStyle.TEXT
	if g > g_lim or g < -3.0:
		g_col = UiStyle.DANGER
	elif g > g_lim * 0.8 or g < -1.5:
		g_col = UiStyle.WARN
	rows.append({"label": "Перегрузка", "value": D.fmt_dec(g) + " g", "color": g_col})
	if bool(def.get("high_aoa", false)):
		var aoa := rad_to_deg(float(D.prop(fm, "aoa", 0.0)))
		var a_col := UiStyle.WARN if absf(aoa) > float(def.get("alpha_crit_deg", 25.0)) else UiStyle.TEXT
		rows.append({"label": "Угол атаки", "value": "%d°" % int(round(aoa)), "color": a_col})
	queue_redraw()


func panel_rect() -> Rect2:
	var w := 212.0 * u
	var row_h := 27.0 * u
	var h := rows.size() * row_h + 14.0 * u
	var x := 16.0 * u
	var y := size.y * 0.56 - h * 0.5
	if hud != null and bool(hud.touch_on):
		y = 84.0 * u
	return Rect2(x, y, w, h)


func _draw() -> void:
	if rows.is_empty():
		return
	var r := panel_rect()
	D.panel(self, r, 0.55, int(6 * u))
	var row_h := 27.0 * u
	var fs_l := int(round(14.0 * u))
	var fs_v := int(round(19.0 * u))
	var y := r.position.y + 7.0 * u + row_h * 0.5
	for row in rows:
		D.text_mid(self, Vector2(r.position.x + 12.0 * u, y), String(row.label), fs_l, UiStyle.MUTED, -1, null, 0)
		D.text_mid(self, Vector2(r.end.x - 12.0 * u, y), String(row.value), fs_v, row.color, 1, D.bold(), 0)
		if String(row.label) == "Газ":
			# тонкая полоса газа под строкой
			var br := Rect2(r.position.x + 12.0 * u, y + 10.0 * u, r.size.x - 24.0 * u, 2.0 * u)
			D.bar(self, br, throttle, UiStyle.ACCENT if afterburner else Color(1, 1, 1, 0.55), Color(1, 1, 1, 0.10))
			if afterburner:
				var tag := "Форсаж"
				var fs_t := int(round(12.0 * u))
				var tw := D.text_width(tag, fs_t, D.bold())
				var tr := Rect2(r.position.x + 52.0 * u, y - 9.0 * u, tw + 12.0 * u, 18.0 * u)
				draw_style_box(D.box(UiStyle.ACCENT, int(4 * u), UiStyle.ACCENT, 0), tr)
				D.text_mid(self, tr.get_center(), tag, fs_t, Color("1a1208"), 0, D.bold(), 0)
		y += row_h
