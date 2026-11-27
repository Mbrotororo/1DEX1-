extends RefCounted
## Общие функции рисования для HUD: шрифты, текст с обводкой, плашки, форматирование.

const UiStyle = preload("res://scripts/ui/ui_style.gd")

const OUTLINE := Color(0, 0, 0, 0.78)

static var _font: Font = null
static var _bold: Font = null
static var _boxes: Dictionary = {}


static func font() -> Font:
	if _font == null:
		_font = ThemeDB.fallback_font
	return _font


static func bold() -> Font:
	if _bold == null:
		var fv := FontVariation.new()
		fv.base_font = font()
		fv.variation_embolden = 0.65
		_bold = fv
	return _bold


static func text_width(s: String, size: int, f: Font = null) -> float:
	var fnt := f if f != null else font()
	return fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


## Текст по базовой линии. align: -1 — слева от точки, 0 — по центру, 1 — справа.
static func text(ci: CanvasItem, pos: Vector2, s: String, size: int, color: Color, align: int = -1,
		f: Font = null, outline: int = 4) -> void:
	if s == "":
		return
	var fnt := f if f != null else font()
	var x := pos.x
	if align != -1:
		var w := fnt.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		x -= w * (0.5 if align == 0 else 1.0)
	var p := Vector2(roundf(x), roundf(pos.y))
	if outline > 0:
		var oc := OUTLINE
		oc.a *= color.a
		ci.draw_string_outline(fnt, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, outline, oc)
	ci.draw_string(fnt, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)


## Текст, отцентрованный по вертикали относительно y.
static func text_mid(ci: CanvasItem, pos: Vector2, s: String, size: int, color: Color, align: int = -1,
		f: Font = null, outline: int = 4) -> void:
	var fnt := f if f != null else font()
	var base := pos.y + (fnt.get_ascent(size) - fnt.get_descent(size)) * 0.5
	text(ci, Vector2(pos.x, base), s, size, color, align, fnt, outline)


static func box(color: Color, radius: int = 6, border: Color = Color(1, 1, 1, 0.10), border_w: int = 1) -> StyleBoxFlat:
	var key := "%s|%d|%s|%d" % [color.to_html(), radius, border.to_html(), border_w]
	if _boxes.has(key):
		return _boxes[key]
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(border_w)
	s.anti_aliasing = true
	_boxes[key] = s
	return s


static func panel(ci: CanvasItem, r: Rect2, alpha: float = 0.62, radius: int = 6) -> void:
	ci.draw_style_box(box(Color(0.05, 0.07, 0.09, alpha), radius), r)


## Полоса прогресса.
static func bar(ci: CanvasItem, r: Rect2, frac: float, color: Color, back: Color = Color(1, 1, 1, 0.12)) -> void:
	ci.draw_rect(r, back)
	var f := clampf(frac, 0.0, 1.0)
	if f > 0.0:
		ci.draw_rect(Rect2(r.position, Vector2(r.size.x * f, r.size.y)), color)


static func plural(n: int, one: String, few: String, many: String) -> String:
	var a := absi(n) % 100
	if a >= 11 and a <= 14:
		return many
	match a % 10:
		1:
			return one
		2, 3, 4:
			return few
	return many


## 1,2 км выше километра, иначе метры.
static func fmt_dist(m: float) -> String:
	if m >= 1000.0:
		return ("%.1f км" % (m / 1000.0)).replace(".", ",")
	return "%d м" % int(roundf(m / 10.0) * 10.0)


static func fmt_dec(v: float, digits: int = 1) -> String:
	var fmt := "%." + str(digits) + "f"
	return (fmt % v).replace(".", ",")


static func autoload(n: String) -> Node:
	var ml := Engine.get_main_loop()
	if ml is SceneTree:
		return (ml as SceneTree).root.get_node_or_null(n)
	return null


## Значение настройки профиля (или значение по умолчанию из Data).
static func setting(key: String):
	var prof := autoload("Profile")
	if prof != null and prof.has_method("get_setting"):
		var v = prof.get_setting(key)
		if v != null:
			return v
	var data := autoload("Data")
	if data != null:
		return data.DEFAULT_SETTINGS.get(key)
	return null


static func set_setting(key: String, value) -> void:
	var prof := autoload("Profile")
	if prof != null and prof.has_method("set_setting"):
		prof.set_setting(key, value)


## Безопасное чтение свойства у объекта с неизвестным типом.
static func prop(obj, name: String, fallback = null):
	if obj == null or not is_instance_valid(obj):
		return fallback
	if name in obj:
		var v = obj.get(name)
		return fallback if v == null else v
	return fallback


static func alive_node(obj) -> bool:
	return obj != null and is_instance_valid(obj) and (not ("alive" in obj) or bool(obj.get("alive")))


## Цвет модуля на схеме повреждений.
static func module_color(ratio: float) -> Color:
	if ratio <= 0.001:
		return Color(0.08, 0.08, 0.09, 0.95)
	if ratio < 0.35:
		return UiStyle.DANGER
	if ratio < 0.7:
		return UiStyle.WARN
	return UiStyle.GOOD
