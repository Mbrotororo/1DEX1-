extends Button
## Образец камуфляжа: рисунок тремя цветами, рамка выбора, замок у закрытого.

const C := preload("res://scripts/ui/ui_style.gd")

var colors: Array = [Color.GRAY, Color.DIM_GRAY, Color.LIGHT_GRAY]
var pattern := "solid"
var locked := false
var selected := false


func setup(camo: Dictionary, is_locked: bool, is_selected: bool) -> void:
	colors = camo.get("colors", colors)
	pattern = String(camo.get("pattern", "solid"))
	locked = is_locked
	selected = is_selected
	tooltip_text = String(camo.get("name", ""))
	queue_redraw()


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	toggle_mode = false
	custom_minimum_size = Vector2(52, 40)
	var e := StyleBoxEmpty.new()
	for st in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		add_theme_stylebox_override(st, e)
	mouse_entered.connect(queue_redraw)
	mouse_exited.connect(queue_redraw)


func _col(i: int) -> Color:
	if colors.is_empty():
		return Color.GRAY
	var c = colors[i % colors.size()]
	return c if c is Color else Color.GRAY


func _draw() -> void:
	var r := Rect2(Vector2(3, 3), size - Vector2(6, 6))
	var box := PackedVector2Array([r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)])
	draw_rect(r, _col(0))
	match pattern:
		"splinter":
			_poly(box, r, [Vector2(0, 0), Vector2(0.55, 0), Vector2(0.2, 0.6), Vector2(0, 0.45)], _col(1))
			_poly(box, r, [Vector2(0.45, 1), Vector2(0.75, 0.35), Vector2(1, 0.5), Vector2(1, 1)], _col(1))
			_poly(box, r, [Vector2(0.55, 0), Vector2(1, 0), Vector2(0.8, 0.3)], _col(2))
			_poly(box, r, [Vector2(0, 0.75), Vector2(0.3, 0.65), Vector2(0.2, 1), Vector2(0, 1)], _col(2))
		"blotch":
			_blob(box, r, Vector2(0.25, 0.3), 0.28, _col(1))
			_blob(box, r, Vector2(0.8, 0.75), 0.3, _col(1))
			_blob(box, r, Vector2(0.7, 0.15), 0.18, _col(2))
			_blob(box, r, Vector2(0.15, 0.9), 0.2, _col(2))
		"stripes":
			for i in range(-2, 5):
				var x := i * 0.38
				var c := _col(1) if i % 2 == 0 else _col(2)
				_poly(box, r, [Vector2(x, 1), Vector2(x + 0.5, 0), Vector2(x + 0.68, 0), Vector2(x + 0.18, 1)], c)
	if locked:
		draw_rect(r, Color(0.04, 0.05, 0.06, 0.62))
		_lock(r.get_center())
	var border := C.LINE
	var bw := 1.0
	if selected:
		border = C.ACCENT
		bw = 2.0
	elif is_hovered():
		border = Color(1, 1, 1, 0.5)
	draw_rect(r.grow(1.0), border, false, bw)


func _poly(box: PackedVector2Array, r: Rect2, pts: Array, col: Color) -> void:
	var p := PackedVector2Array()
	for v in pts:
		p.append(r.position + Vector2(v.x * r.size.x, v.y * r.size.y))
	for q in Geometry2D.intersect_polygons(p, box):
		if q.size() >= 3:
			draw_colored_polygon(q, col)


func _blob(box: PackedVector2Array, r: Rect2, c: Vector2, rad: float, col: Color) -> void:
	var p := PackedVector2Array()
	var center := r.position + Vector2(c.x * r.size.x, c.y * r.size.y)
	var rr := rad * r.size.y
	for i in 16:
		var a := TAU * i / 16.0
		var wob := 1.0 + 0.18 * sin(a * 3.0 + c.x * 7.0)
		p.append(center + Vector2(cos(a) * rr * 1.3, sin(a) * rr) * wob)
	for q in Geometry2D.intersect_polygons(p, box):
		if q.size() >= 3:
			draw_colored_polygon(q, col)


func _lock(c: Vector2) -> void:
	var body := Rect2(c + Vector2(-6, -1), Vector2(12, 9))
	draw_arc(c + Vector2(0, -2), 4.0, PI, TAU, 12, Color(1, 1, 1, 0.85), 2.0, true)
	draw_rect(body, Color(1, 1, 1, 0.85))
	draw_rect(Rect2(c + Vector2(-1, 2), Vector2(2, 3)), Color(0.1, 0.1, 0.1, 0.9))
