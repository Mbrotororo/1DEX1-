extends Control
## Миникарта справа сверху, север вверху (-Z). Рельеф снимается один раз с World.height_at.
## Показывает зоны, аэродромы, базы, игрока и союзников; врагов — только в аркаде.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const SAMPLES := 96
const BASE_SIZE := 200.0
const CLOUD_VISIBLE := 500.0

const PALETTES := {
	"desert": [Color(0.33, 0.25, 0.17), Color(0.80, 0.66, 0.47)],
	"winter": [Color(0.30, 0.34, 0.37), Color(0.92, 0.94, 0.96)],
	"ocean": [Color(0.22, 0.33, 0.20), Color(0.66, 0.63, 0.47)],
}
const WATER_SHALLOW := Color(0.24, 0.47, 0.60)
const WATER_DEEP := Color(0.09, 0.22, 0.36)

var hud = null
var battle = null
var u: float = 1.0
var texture: ImageTexture = null
var half: float = 5000.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func setup(p_battle) -> void:
	battle = p_battle
	texture = null
	var world = D.prop(battle, "world")
	if world != null:
		if world.has_method("half_size"):
			half = maxf(float(world.half_size()), 100.0)
		texture = build_texture(world, half)
	queue_redraw()


## Картинка рельефа SAMPLES×SAMPLES: вода синяя, низины тёмные, возвышенности светлее.
static func build_texture(world, p_half: float) -> ImageTexture:
	if world == null or not world.has_method("height_at"):
		return null
	var n := SAMPLES
	var step := p_half * 2.0 / float(n)
	var hs := PackedFloat32Array()
	hs.resize(n * n)
	var hmax := 1.0
	for j in n:
		var z := -p_half + (j + 0.5) * step
		for i in n:
			var x := -p_half + (i + 0.5) * step
			var h := float(world.height_at(x, z))
			hs[j * n + i] = h
			hmax = maxf(hmax, h)
	var biome := "desert"
	var m = D.prop(world, "map", {})
	if m is Dictionary:
		biome = String(m.get("biome", "desert"))
	var pal: Array = PALETTES.get(biome, PALETTES["desert"])
	var low: Color = pal[0]
	var high: Color = pal[1]
	var img := Image.create(n, n, false, Image.FORMAT_RGB8)
	var norm := maxf(hmax, 60.0)
	for j in n:
		for i in n:
			var h: float = hs[j * n + i]
			var col: Color
			if h < 0.0:
				col = WATER_SHALLOW.lerp(WATER_DEEP, clampf(-h / 60.0, 0.0, 1.0))
			else:
				var t := pow(clampf(h / norm, 0.0, 1.0), 0.75)
				col = low.lerp(high, t)
				# тень от склонов (свет с северо-запада)
				var hl: float = hs[j * n + maxi(i - 1, 0)]
				var hr: float = hs[j * n + mini(i + 1, n - 1)]
				var hu: float = hs[maxi(j - 1, 0) * n + i]
				var hd: float = hs[mini(j + 1, n - 1) * n + i]
				var shade := clampf(1.0 + ((hl - hr) + (hu - hd)) / step * 0.35, 0.72, 1.25)
				col = Color(col.r * shade, col.g * shade, col.b * shade)
			img.set_pixel(i, j, col)
	return ImageTexture.create_from_image(img)


func map_rect() -> Rect2:
	var s := BASE_SIZE * u
	return Rect2(size.x - 16.0 * u - s, 16.0 * u, s, s)


func to_map(r: Rect2, p: Vector3) -> Vector2:
	return r.position + Vector2((p.x + half) / (half * 2.0), (p.z + half) / (half * 2.0)) * r.size


func _draw() -> void:
	var r := map_rect()
	draw_style_box(D.box(Color(0.05, 0.07, 0.09, 0.8), int(6 * u), Color(1, 1, 1, 0.16), 1), r.grow(4.0 * u))
	if texture != null:
		draw_texture_rect(texture, r, false, Color(1, 1, 1, 0.92))
	else:
		draw_rect(r, Color(0.16, 0.19, 0.2))
	# сетка через 2,5 км
	for k in range(1, 4):
		var f := k / 4.0
		draw_line(r.position + Vector2(r.size.x * f, 0), r.position + Vector2(r.size.x * f, r.size.y), Color(0, 0, 0, 0.16), 1.0)
		draw_line(r.position + Vector2(0, r.size.y * f), r.position + Vector2(r.size.x, r.size.y * f), Color(0, 0, 0, 0.16), 1.0)
	if battle == null or not is_instance_valid(battle):
		return
	var world = D.prop(battle, "world")
	if world != null:
		_draw_airfields(r, world)
		_draw_bases(r, world)
		_draw_zones(r, world)
	_draw_aircraft(r)
	D.text(self, r.position + Vector2(6.0 * u, 15.0 * u), "С", int(round(12.0 * u)), Color(1, 1, 1, 0.7), -1, D.bold(), 3)


func _draw_airfields(r: Rect2, world) -> void:
	var afs = D.prop(world, "airfields", [])
	if not (afs is Array):
		return
	for af in afs:
		if not (af is Dictionary):
			continue
		var p: Vector3 = af.get("pos", Vector3.ZERO)
		var hd := float(af.get("heading", 0.0))
		var f := Vector3(sin(hd), 0.0, -cos(hd))
		var length := float(af.get("length", 1200.0))
		var a := to_map(r, p - f * length * 0.5)
		var b := to_map(r, p + f * length * 0.5)
		var col := UiStyle.team_color(int(af.get("team", 0)))
		var w := (5.0 if String(af.get("kind", "")) == "carrier" else 3.5) * u
		draw_line(a, b, Color(0, 0, 0, 0.7), w + 2.0 * u)
		draw_line(a, b, col.lightened(0.15), w)


func _draw_bases(r: Rect2, world) -> void:
	var bases = D.prop(world, "bases", [])
	if not (bases is Array):
		return
	for b in bases:
		if not (b is Dictionary):
			continue
		var c := to_map(r, b.get("pos", Vector3.ZERO))
		var s := 4.0 * u
		var rect := Rect2(c - Vector2(s, s), Vector2(s, s) * 2.0)
		draw_rect(rect.grow(1.2 * u), Color(0, 0, 0, 0.7))
		draw_rect(rect, UiStyle.team_color(int(b.get("team", 0))))


func _draw_zones(r: Rect2, world) -> void:
	var zs = D.prop(world, "zones", [])
	if not (zs is Array):
		return
	var states: Dictionary = {}
	var zst = D.prop(battle, "zones_state", [])
	if zst is Array:
		for s in zst:
			if s is Dictionary:
				states[String(s.get("id", ""))] = s
	for z in zs:
		if not (z is Dictionary):
			continue
		var c := to_map(r, z.get("pos", Vector3.ZERO))
		var rad := maxf(float(z.get("radius", 450.0)) / (half * 2.0) * r.size.x, 8.0 * u)
		var owner := -1
		var st: Dictionary = states.get(String(z.get("id", "")), {})
		if not st.is_empty():
			owner = int(st.get("owner", -1))
		var col := Color(0.85, 0.87, 0.9) if owner < 0 else UiStyle.team_color(owner)
		var fill := col
		fill.a = 0.35
		draw_circle(c, rad, fill)
		draw_arc(c, rad, 0.0, TAU, 28, col, 1.5 * u, true)
		D.text_mid(self, c, String(z.get("id", "")), int(round(11.0 * u)), Color.WHITE, 0, D.bold(), 3)


func _arrow(c: Vector2, dir: Vector2, s: float, col: Color) -> void:
	if dir.length_squared() < 0.0001:
		dir = Vector2(0, -1)
	dir = dir.normalized()
	var perp := Vector2(-dir.y, dir.x)
	var pts := PackedVector2Array([c + dir * s, c - dir * s * 0.7 + perp * s * 0.7, c - dir * s * 0.35, c - dir * s * 0.7 - perp * s * 0.7])
	var ol := pts.duplicate()
	ol.append(pts[0])
	draw_colored_polygon(pts, col)
	draw_polyline(ol, Color(0, 0, 0, 0.75), 1.2 * u, true)


func _draw_aircraft(r: Rect2) -> void:
	var pl = battle.player
	var arcade := bool(D.prop(battle, "markers_enabled", false))
	var ref_pos := Vector3.ZERO
	var has_ref := D.alive_node(pl)
	if has_ref:
		ref_pos = pl.global_position
	var my_team := int(D.prop(pl, "team", 0))
	var acs = D.prop(battle, "aircraft", [])
	if not (acs is Array):
		return
	for ac in acs:
		if ac == pl or not D.alive_node(ac):
			continue
		var ally := int(ac.team) == my_team
		if not ally:
			if not arcade:
				continue
			if has_ref and bool(D.prop(ac, "in_cloud", false)) and (ac.global_position as Vector3).distance_to(ref_pos) > CLOUD_VISIBLE:
				continue
		var p: Vector3 = ac.global_position
		var f: Vector3 = ac.forward() if ac.has_method("forward") else Vector3.FORWARD
		var c := to_map(r, p)
		if not r.grow(2.0).has_point(c):
			continue
		_arrow(c, Vector2(f.x, f.z), 5.0 * u, UiStyle.team_color(int(ac.team)))
	if has_ref:
		var f: Vector3 = pl.forward() if pl.has_method("forward") else Vector3.FORWARD
		var c := to_map(r, ref_pos)
		c = Vector2(clampf(c.x, r.position.x, r.end.x), clampf(c.y, r.position.y, r.end.y))
		_arrow(c, Vector2(f.x, f.z), 7.5 * u, Color.WHITE)
