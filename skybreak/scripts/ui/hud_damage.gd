extends RefCounted
## Схема повреждений: самолёт сверху из простых многоугольников по def.shape.
## Цвет модуля: зелёный > 70 %, жёлтый > 35 %, красный, чёрный — уничтожен.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const FIRE := Color(1.0, 0.55, 0.15)


static func _ratio(dmg, module: String) -> float:
	if dmg == null or not dmg.has_method("module_ratio"):
		return 1.0
	return clampf(float(dmg.module_ratio(module)), 0.0, 1.0)


static func _poly(ci: CanvasItem, pts: PackedVector2Array, ratio: float, u: float, fire: bool = false, blink: float = 0.0) -> void:
	var col := D.module_color(ratio)
	col.a = 0.92
	if fire:
		col = col.lerp(FIRE, 0.4 + 0.5 * blink)
	ci.draw_colored_polygon(pts, col)
	var ol := pts.duplicate()
	ol.append(pts[0])
	var line := Color(0, 0, 0, 0.7)
	if ratio <= 0.001:
		line = UiStyle.DANGER
	ci.draw_polyline(ol, line, 1.2 * u, true)


static func _rect_pts(x0: float, z0: float, x1: float, z1: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(x0, z0), Vector2(x1, z0), Vector2(x1, z1), Vector2(x0, z1)])


## Рисует схему в прямоугольнике r. clock — время для мигания пожара.
static func draw(ci: CanvasItem, r: Rect2, def: Dictionary, dmg, clock: float, u: float) -> void:
	var shape: Dictionary = def.get("shape", {})
	var L := float(shape.get("length", 10.0))
	var S := float(shape.get("span", 10.0))
	var fr := float(shape.get("fuselage_radius", 0.8))
	var wing_type := String(shape.get("wing_type", "straight"))
	var sweep := deg_to_rad(float(shape.get("sweep_deg", 0.0)))
	var wing_z := float(shape.get("wing_z", 0.0))
	var chord := float(shape.get("chord", 2.0))
	var tail_kind := String(shape.get("tail", "single"))
	var engines := String(shape.get("engines", "nose_prop"))
	var cockpit_z := float(shape.get("cockpit_z", 0.0))
	var k := minf((r.size.x - 6.0 * u) / S, (r.size.y - 6.0 * u) / L)
	var c := r.get_center()
	var xf := Transform2D(0.0, Vector2(k, k), 0.0, c)
	var on_fire := bool(D.prop(dmg, "on_fire", false))
	var blink := 0.5 + 0.5 * sin(clock * TAU * 2.5)
	var fr_draw := maxf(fr, L * 0.055)

	# крылья
	var semi := S * 0.5 - fr_draw
	var le_root := wing_z - chord * 0.5
	var te_root := wing_z + chord * 0.5
	var le_tip: float
	var te_tip: float
	match wing_type:
		"delta":
			te_tip = te_root
			le_tip = te_tip - chord * 0.12
		"swept":
			le_tip = le_root + tan(sweep) * semi
			te_tip = le_tip + chord * 0.45
		_:
			le_tip = le_root + chord * 0.15 + tan(sweep) * semi
			te_tip = le_tip + chord * 0.6
	for side in [-1.0, 1.0]:
		var pts := PackedVector2Array([
			Vector2(side * fr_draw * 0.9, le_root), Vector2(side * (fr_draw + semi), le_tip),
			Vector2(side * (fr_draw + semi), te_tip), Vector2(side * fr_draw * 0.9, te_root)])
		_poly(ci, xf * pts, _ratio(dmg, "left_wing" if side < 0.0 else "right_wing"), u)

	# хвост: стабилизатор и кили
	var tail_r := _ratio(dmg, "tail")
	var zt := L * 0.36
	var tc := maxf(chord * 0.45, L * 0.08)
	var ts := S * (0.2 if wing_type == "delta" else 0.19)
	if wing_type != "delta":
		for side in [-1.0, 1.0]:
			var pts := PackedVector2Array([
				Vector2(side * fr_draw * 0.5, zt - tc * 0.4), Vector2(side * (fr_draw * 0.5 + ts), zt + tc * 0.05),
				Vector2(side * (fr_draw * 0.5 + ts), zt + tc * 0.45), Vector2(side * fr_draw * 0.5, zt + tc * 0.6)])
			_poly(ci, xf * pts, tail_r, u)
	var fins: Array = [0.0] if tail_kind != "twin" else [-fr_draw * 0.9, fr_draw * 0.9]
	for fx in fins:
		var w := maxf(fr_draw * 0.22, 0.25)
		var pts := _rect_pts(float(fx) - w, zt - tc * 0.9, float(fx) + w, L * 0.5)
		_poly(ci, xf * pts, tail_r, u)

	# фюзеляж (конструкция)
	var nose := -L * 0.5
	var tail_end := L * 0.5
	var body := PackedVector2Array([
		Vector2(0, nose), Vector2(fr_draw * 0.7, nose + L * 0.06), Vector2(fr_draw, nose + L * 0.18),
		Vector2(fr_draw, tail_end - L * 0.22), Vector2(fr_draw * 0.55, tail_end),
		Vector2(-fr_draw * 0.55, tail_end), Vector2(-fr_draw, tail_end - L * 0.22),
		Vector2(-fr_draw, nose + L * 0.18), Vector2(-fr_draw * 0.7, nose + L * 0.06)])
	_poly(ci, xf * body, _ratio(dmg, "structure"), u)

	# топливо
	var fz0 := wing_z - chord * 0.3
	var fz1 := wing_z + chord * 0.3
	if fz1 - fz0 < L * 0.16:
		fz0 = wing_z - L * 0.08
		fz1 = wing_z + L * 0.08
	_poly(ci, xf * _rect_pts(-fr_draw * 0.55, fz0, fr_draw * 0.55, fz1), _ratio(dmg, "fuel"), u, on_fire, blink)

	# двигатели
	var eng_r := _ratio(dmg, "engine")
	match engines:
		"nose_prop":
			_poly(ci, xf * _rect_pts(-fr_draw * 0.62, nose + L * 0.07, fr_draw * 0.62, nose + L * 0.22), eng_r, u, on_fire, blink)
			var a := xf * Vector2(-S * 0.14, nose + L * 0.03)
			var b := xf * Vector2(S * 0.14, nose + L * 0.03)
			ci.draw_line(a, b, Color(1, 1, 1, 0.55), 1.6 * u, true)
		"twin_prop":
			for side in [-1.0, 1.0]:
				var x: float = side * S * 0.24
				_poly(ci, xf * _rect_pts(x - fr_draw * 0.55, le_root - chord * 0.55, x + fr_draw * 0.55, te_root + chord * 0.2), eng_r, u, on_fire, blink)
				var a := xf * Vector2(x - S * 0.09, le_root - chord * 0.6)
				var b := xf * Vector2(x + S * 0.09, le_root - chord * 0.6)
				ci.draw_line(a, b, Color(1, 1, 1, 0.55), 1.4 * u, true)
		"twin_jet":
			for side in [-1.0, 1.0]:
				var x: float = side * fr_draw * 0.45
				_poly(ci, xf * _rect_pts(x - fr_draw * 0.4, L * 0.2, x + fr_draw * 0.4, L * 0.47), eng_r, u, on_fire, blink)
		_:
			_poly(ci, xf * _rect_pts(-fr_draw * 0.6, L * 0.2, fr_draw * 0.6, L * 0.47), eng_r, u, on_fire, blink)

	# пилот
	var pr := _ratio(dmg, "pilot")
	var pc := xf * Vector2(0, cockpit_z)
	var rad := maxf(fr_draw * 0.5 * k, 3.5 * u)
	var pcol := D.module_color(pr)
	ci.draw_circle(pc, rad + 1.2 * u, Color(0, 0, 0, 0.75) if pr > 0.001 else UiStyle.DANGER)
	ci.draw_circle(pc, rad, pcol)
