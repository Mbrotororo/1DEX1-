extends Control
## Предупреждения по центру: сваливание, пожар, ракета, земля, граница, шасси, обслуживание.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const BORDER_TIME := 10.0
const BORDER_WARN := 250.0      # за сколько метров до края карты предупреждать

var hud = null
var u: float = 1.0
var items: Array = []           # [{text, level:"danger"|"warn"|"info", progress:float}]
var _clock: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func tick(dt: float) -> void:
	_clock += dt


func refresh(pl, battle) -> void:
	items = collect(pl, battle, hud != null and bool(hud.touch_on))
	queue_redraw()


## Список активных предупреждений (отдельно, чтобы проверять в тестах).
static func collect(pl, battle, touch: bool) -> Array:
	var out: Array = []
	if not D.alive_node(pl):
		return out
	var fm = D.prop(pl, "fm")
	var dmg = D.prop(pl, "dmg")
	var weapons = D.prop(pl, "weapons")
	var on_ground := bool(D.prop(fm, "on_ground", false))
	if bool(D.prop(dmg, "on_fire", false)):
		out.append({"text": "Пожар" if touch else "Пожар: T", "level": "danger"})
	var pm = D.prop(battle, "projectiles")
	if pm != null and pm.has_method("incoming_missiles") and int(pm.incoming_missiles(pl)) > 0:
		out.append({"text": "Ракета!", "level": "danger"})
	if bool(D.prop(fm, "stalled", false)) and not on_ground:
		out.append({"text": "Сваливание", "level": "danger"})
	var agl := 9999.0
	if pl.has_method("altitude_agl"):
		agl = float(pl.altitude_agl())
	var vs := float(D.prop(fm, "vertical_speed", 0.0))
	if not on_ground and agl < 150.0 and vs < -8.0 and agl < -vs * 6.0:
		out.append({"text": "Земля!", "level": "danger"})
	var world = D.prop(battle, "world")
	var half := 5000.0
	if world != null and world.has_method("half_size"):
		half = float(world.half_size())
	var p: Vector3 = pl.global_position
	if absf(p.x) > half - BORDER_WARN or absf(p.z) > half - BORDER_WARN:
		var bt := float(D.prop(pl, "border_time", 0.0))
		var txt := "Вернись в зону боя"
		if bt > 0.0:
			txt += ": %d" % int(ceilf(maxf(BORDER_TIME - bt, 0.0)))
		out.append({"text": txt, "level": "danger"})
	if bool(D.prop(dmg, "engine_dead", false)):
		out.append({"text": "Двигатель отказал", "level": "warn"})
	if bool(D.prop(fm, "overspeed", false)):
		out.append({"text": "Большая скорость", "level": "warn"})
	if bool(D.prop(fm, "gear_down", false)) and not on_ground and agl > 40.0:
		out.append({"text": "Шасси выпущено", "level": "warn"})
	if weapons != null and weapons.has_method("is_empty") and bool(weapons.is_empty()):
		out.append({"text": "Боезапас пуст. Сядь на свой аэродром", "level": "warn"})
	if bool(D.prop(pl, "servicing", false)):
		var prog := clampf(float(D.prop(pl, "service_progress", 0.0)), 0.0, 1.0)
		var repairing: bool = dmg != null and dmg.has_method("is_damaged") and bool(dmg.is_damaged())
		var label := "Ремонт" if repairing else "Перезарядка"
		out.append({"text": "%s %d%%" % [label, int(prog * 100.0)], "level": "info", "progress": prog})
	return out


func _draw() -> void:
	if items.is_empty():
		return
	var y := size.y * 0.30
	var blink := 0.55 + 0.45 * (0.5 + 0.5 * cos(_clock * TAU * 2.2))
	for it in items:
		var lvl := String(it.level)
		var fs := int(round((20.0 if lvl == "danger" else 16.0) * u))
		var f: Font = D.bold()
		var tw := D.text_width(String(it.text), fs, f)
		var h := (34.0 if lvl == "danger" else 28.0) * u
		var r := Rect2(size.x * 0.5 - tw * 0.5 - 14.0 * u, y, tw + 28.0 * u, h)
		var txt_col := UiStyle.TEXT
		match lvl:
			"danger":
				var bg := UiStyle.DANGER
				bg.a = 0.88 * blink
				draw_style_box(D.box(bg, int(5 * u), Color(1, 1, 1, 0.25 * blink), 1), r)
				txt_col = Color(1, 1, 1, 0.55 + 0.45 * blink)
			"warn":
				D.panel(self, r, 0.62, int(5 * u))
				txt_col = UiStyle.WARN
			_:
				D.panel(self, r, 0.62, int(5 * u))
				var pr := Rect2(r.position.x + 6.0 * u, r.end.y - 4.0 * u, (r.size.x - 12.0 * u), 2.0 * u)
				D.bar(self, pr, float(it.get("progress", 0.0)), UiStyle.GOOD)
		D.text_mid(self, r.get_center(), String(it.text), fs, txt_col, 0, f, 0 if lvl == "danger" else 3)
		y += h + 6.0 * u
