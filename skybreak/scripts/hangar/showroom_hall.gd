extends RefCounted
## Здание ангара: пол, гофрированные стены, арочная крыша с фермами, ворота, лампы, реквизит.
## Всё строится кодом; текстуры только из assets/textures.

const Kit = preload("res://scripts/aircraft/mesh_kit.gd")

const W2 := 28.0        # половина ширины (X)
const D2 := 32.0        # половина глубины (Z)
const H := 11.0         # высота стен
const RISE := 6.0       # подъём арки крыши
const DOOR_W2 := 20.0   # половина ширины ворот (стена +Z)
const DOOR_H := 10.0

var root: Node3D
var lamps: Array = []        # SpotLight3D
var sun: DirectionalLight3D
var fill: OmniLight3D
var _mats: Dictionary = {}


func build(parent: Node3D) -> Node3D:
	root = Node3D.new()
	root.name = "Hall"
	parent.add_child(root)
	_floor()
	_walls()
	_roof()
	_trusses()
	_door_frame()
	_lamps()
	_windows()
	_outside()
	_props()
	_markings()
	return root


# ------------------------------------------------------------------ материалы

func _texture(path: String, bright: float = 1.0, contrast: float = 1.0, sat: float = 1.0) -> Texture2D:
	var key := "%s|%.2f|%.2f|%.2f" % [path, bright, contrast, sat]
	if _mats.has(key):
		return _mats[key]
	var tex := load(path) as Texture2D
	if tex == null:
		return null
	var img := tex.get_image()
	if img == null:
		return tex
	img = img.duplicate()
	if img.is_compressed():
		img.decompress()
	if bright != 1.0 or contrast != 1.0 or sat != 1.0:
		img.adjust_bcs(bright, contrast, sat)
	if not img.has_mipmaps():
		img.generate_mipmaps()
	var it := ImageTexture.create_from_image(img)
	_mats[key] = it
	return it


func _mat(name: String) -> StandardMaterial3D:
	if _mats.has(name):
		return _mats[name]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	match name:
		"floor":
			m.albedo_texture = _texture("res://assets/textures/deck.webp", 1.45, 0.85, 0.35)
			m.uv1_triplanar = true
			m.uv1_world_triplanar = true
			m.uv1_scale = Vector3(0.16, 0.16, 0.16)
			m.roughness = 0.62
			m.metallic_specular = 0.6
		"apron":
			m.albedo_texture = _texture("res://assets/textures/deck.webp", 1.3, 0.7, 0.3)
			m.uv1_triplanar = true
			m.uv1_world_triplanar = true
			m.uv1_scale = Vector3(0.08, 0.08, 0.08)
			m.roughness = 0.85
		"wall":
			m.albedo_texture = _texture("res://assets/textures/metal.webp")
			m.uv1_triplanar = true
			m.uv1_world_triplanar = true
			m.uv1_scale = Vector3(0.22, 0.22, 0.22)
			m.roughness = 0.5
			m.metallic = 0.45
		"roof":
			m.albedo_texture = _texture("res://assets/textures/metal.webp", 0.8)
			m.uv1_triplanar = true
			m.uv1_world_triplanar = true
			m.uv1_scale = Vector3(0.18, 0.18, 0.18)
			m.roughness = 0.6
			m.metallic = 0.35
		"steel":
			m.roughness = 0.55
			m.metallic = 0.4
		"paint":
			m.roughness = 0.65
			m.metallic = 0.05
		"glow":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		"pano":
			m.vertex_color_use_as_albedo = false
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.albedo_texture = _texture("res://assets/textures/horizon.webp", 1.05)
			m.disable_fog = true
		"shadow":
			m.vertex_color_use_as_albedo = false
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			var gt := GradientTexture2D.new()
			var g := Gradient.new()
			g.set_color(0, Color(0, 0, 0, 0.5))
			g.set_color(1, Color(0, 0, 0, 0.0))
			g.add_point(0.6, Color(0, 0, 0, 0.3))
			g.add_point(0.85, Color(0, 0, 0, 0.1))
			gt.gradient = g
			gt.fill = GradientTexture2D.FILL_RADIAL
			gt.fill_from = Vector2(0.5, 0.5)
			gt.fill_to = Vector2(1.0, 0.5)
			gt.width = 128
			gt.height = 128
			m.albedo_texture = gt
			m.albedo_color = Color(1, 1, 1, 1)
	_mats[name] = m
	return m


func _add(kit, mat_name: String, color: Color, node_name: String, shadows: bool = true) -> MeshInstance3D:
	var mesh: ArrayMesh = kit.to_mesh(func(_t: int, _c: Vector3, _n: Vector3) -> Color: return color, _mat(mat_name))
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	return mi


func _add_painted(kit, mat_name: String, paint: Callable, node_name: String, shadows: bool = true) -> MeshInstance3D:
	var mesh: ArrayMesh = kit.to_mesh(paint, _mat(mat_name))
	var mi := MeshInstance3D.new()
	mi.name = node_name
	mi.mesh = mesh
	if not shadows:
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	return mi


static func roof_y(x: float) -> float:
	var f := clampf(x / W2, -1.0, 1.0)
	return H + RISE * (1.0 - f * f)


# ------------------------------------------------------------------ здание

func _floor() -> void:
	var kit = Kit.new()
	kit.quad(Vector3(-W2, 0, -D2), Vector3(W2, 0, -D2), Vector3(W2, 0, D2), Vector3(-W2, 0, D2), Vector3.UP, Kit.PLAIN)
	# цоколь вдоль стен
	for side: float in [-1.0, 1.0]:
		kit.box(Vector3(side * (W2 - 0.2), 0.6, 0), Vector3(0.2, 0.6, D2), Basis.IDENTITY, Kit.PLAIN)
	kit.box(Vector3(0, 0.6, -D2 + 0.2), Vector3(W2, 0.6, 0.2), Basis.IDENTITY, Kit.PLAIN)
	_add(kit, "floor", Color(1, 1, 1), "Floor")


## Гофрированная поверхность: ряд вертикальных полос вдоль направления along.
func _corrugated(kit, origin: Vector3, along: Vector3, inward: Vector3, length: float, bottom: Callable, top: Callable) -> void:
	var period := 0.75
	var amp := 0.07
	var steps := int(length / (period / 4.0))
	var prev_b := Vector3.ZERO
	var prev_t := Vector3.ZERO
	var prev_n := Vector3.ZERO
	for k in steps + 1:
		var s := float(k) / float(steps) * length
		var ph := TAU * s / period
		var off := inward * (sin(ph) * amp)
		var p := origin + along * s + off
		var y0: float = bottom.call(s)
		var y1: float = top.call(s)
		var pb := Vector3(p.x, y0, p.z)
		var pt := Vector3(p.x, y1, p.z)
		var nn := (inward - along * (cos(ph) * amp * TAU / period)).normalized()
		if k > 0 and y1 > y0 + 0.01:
			kit.tri(prev_b, pb, pt, prev_n, nn, nn, Kit.PLAIN)
			kit.tri(prev_b, pt, prev_t, prev_n, nn, prev_n, Kit.PLAIN)
		prev_b = pb
		prev_t = pt
		prev_n = nn


func _walls() -> void:
	var kit = Kit.new()
	var base := func(_s: float) -> float: return 1.2
	var top_h := func(_s: float) -> float: return H
	# боковые стены
	_corrugated(kit, Vector3(-W2, 0, -D2), Vector3(0, 0, 1), Vector3(1, 0, 0), D2 * 2.0, base, top_h)
	_corrugated(kit, Vector3(W2, 0, -D2), Vector3(0, 0, 1), Vector3(-1, 0, 0), D2 * 2.0, base, top_h)
	# торцы с фронтоном
	var gable := func(s: float) -> float: return roof_y(s - W2)
	_corrugated(kit, Vector3(-W2, 0, -D2), Vector3(1, 0, 0), Vector3(0, 0, 1), W2 * 2.0, base, gable)
	var door_bottom := func(s: float) -> float:
		return DOOR_H if absf(s - W2) < DOOR_W2 else 1.2
	_corrugated(kit, Vector3(-W2, 0, D2), Vector3(1, 0, 0), Vector3(0, 0, -1), W2 * 2.0, door_bottom, gable)
	var wm := _add(kit, "wall", Color(0.78, 0.82, 0.86), "Walls")
	wm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_DOUBLE_SIDED
	# цоколь у ворот
	var kb = Kit.new()
	for side: float in [-1.0, 1.0]:
		var cx := side * (DOOR_W2 + (W2 - DOOR_W2) * 0.5)
		kb.box(Vector3(cx, 0.6, D2 - 0.2), Vector3((W2 - DOOR_W2) * 0.5, 0.6, 0.2), Basis.IDENTITY, Kit.PLAIN)
	_add(kb, "floor", Color(0.8, 0.8, 0.8), "Plinth")


func _roof() -> void:
	var kit = Kit.new()
	var nx := 28
	var rows: Array = []
	for zi in 2:
		var z := -D2 if zi == 0 else D2
		var row := PackedVector3Array()
		for i in nx + 1:
			var x := lerpf(-W2, W2, float(i) / float(nx))
			row.append(Vector3(x, roof_y(x), z))
		rows.append(row)
	kit.grid(rows, false, Kit.PLAIN, false, func(_i: int, _j: int, p: Vector3) -> Vector3:
		return Vector3(-p.x / W2 * 0.6, -1.0, 0.0))
	var rm := _add(kit, "roof", Color(0.55, 0.58, 0.62), "Roof")
	rm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_DOUBLE_SIDED
	# световые фонари в крыше
	var sky = Kit.new()
	for side: float in [-1.0, 1.0]:
		var x0 := side * 7.0
		var x1 := side * 10.0
		for zi in 4:
			var z0 := -D2 + 4.0 + float(zi) * 15.0
			var z1 := z0 + 10.0
			var a := Vector3(x0, roof_y(x0) - 0.05, z0)
			var b := Vector3(x1, roof_y(x1) - 0.05, z0)
			var c := Vector3(x1, roof_y(x1) - 0.05, z1)
			var d := Vector3(x0, roof_y(x0) - 0.05, z1)
			sky.quad(a, b, c, d, Vector3.DOWN, Kit.PLAIN)
	_add(sky, "glow", Color(0.86, 0.92, 1.0), "Skylights", false)


func _trusses() -> void:
	var kit = Kit.new()
	var seg := 14
	var b := 0.16
	var zs: Array = []
	var z := -D2 + 4.0
	while z < D2 - 1.0:
		zs.append(z)
		z += 8.0
	for zt in zs:
		var tz: float = zt
		var top: Array = []
		var bot: Array = []
		for i in seg + 1:
			var x := lerpf(-W2 + 0.3, W2 - 0.3, float(i) / float(seg))
			top.append(Vector3(x, roof_y(x) - 0.25, tz))
			var f := x / W2
			bot.append(Vector3(x, H - 0.4 + RISE * 0.42 * (1.0 - f * f), tz))
		for i in seg:
			kit.beam(top[i], top[i + 1], b, b * 1.4, Kit.PLAIN, Vector3(0, 0, 1))
			kit.beam(bot[i], bot[i + 1], b, b * 1.2, Kit.PLAIN, Vector3(0, 0, 1))
			var d0: Vector3 = bot[i] if i % 2 == 0 else top[i]
			var d1: Vector3 = top[i + 1] if i % 2 == 0 else bot[i + 1]
			kit.beam(d0, d1, b * 0.7, b * 0.7, Kit.PLAIN, Vector3(0, 0, 1))
		for i in range(1, seg):
			kit.beam(bot[i], top[i], b * 0.6, b * 0.6, Kit.PLAIN, Vector3(0, 0, 1))
		# колонны у стен
		for side: float in [-1.0, 1.0]:
			var cx := side * (W2 - 0.35)
			kit.box(Vector3(cx, H * 0.5, tz), Vector3(0.28, H * 0.5, 0.2), Basis.IDENTITY, Kit.PLAIN)
			kit.box(Vector3(cx, 0.15, tz), Vector3(0.4, 0.15, 0.32), Basis.IDENTITY, Kit.PLAIN)
	# прогоны вдоль ангара
	for xi in [-20.0, -12.0, -4.0, 4.0, 12.0, 20.0]:
		var xx: float = xi
		kit.beam(Vector3(xx, roof_y(xx) - 0.45, -D2), Vector3(xx, roof_y(xx) - 0.45, D2), 0.14, 0.24, Kit.PLAIN)
	_add(kit, "steel", Color(0.24, 0.28, 0.32), "Trusses")


func _door_frame() -> void:
	var kit = Kit.new()
	var z := D2 - 0.35
	for side: float in [-1.0, 1.0]:
		kit.box(Vector3(side * (DOOR_W2 + 0.35), DOOR_H * 0.5, z), Vector3(0.35, DOOR_H * 0.5, 0.35), Basis.IDENTITY, Kit.PLAIN)
	kit.box(Vector3(0, DOOR_H + 0.4, z), Vector3(DOOR_W2 + 0.7, 0.4, 0.4), Basis.IDENTITY, Kit.PLAIN)
	# направляющая ворот в полу
	kit.box(Vector3(0, 0.01, D2 - 0.1), Vector3(W2, 0.012, 0.12), Basis.IDENTITY, Kit.PLAIN)
	_add(kit, "steel", Color(0.2, 0.22, 0.24), "DoorFrame")
	# жёлто-чёрная разметка на стойках
	var hz = Kit.new()
	for side: float in [-1.0, 1.0]:
		var x := side * (DOOR_W2 + 0.35)
		for k in 6:
			var y0 := float(k) * 0.4
			var face_x := x - side * 0.36
			hz.quad(Vector3(face_x, y0, z - 0.36), Vector3(face_x, y0 + 0.4, z - 0.36), Vector3(face_x, y0 + 0.4, z + 0.36),
				Vector3(face_x, y0, z + 0.36), Vector3(-side, 0, 0), Kit.ACCENT if k % 2 == 0 else Kit.DARK)
			var fz := z - 0.36
			hz.quad(Vector3(x - 0.36, y0, fz - 0.002), Vector3(x + 0.36, y0, fz - 0.002), Vector3(x + 0.36, y0 + 0.4, fz - 0.002),
				Vector3(x - 0.36, y0 + 0.4, fz - 0.002), Vector3(0, 0, -1), Kit.ACCENT if k % 2 == 0 else Kit.DARK)
	_add_painted(hz, "paint", func(t: int, _c: Vector3, _n: Vector3) -> Color:
		return Color(0.95, 0.75, 0.1) if t == Kit.ACCENT else Color(0.08, 0.08, 0.08), "Hazard")


func _lamps() -> void:
	var shades = Kit.new()
	var bulbs = Kit.new()
	var spots := [Vector3(-9, 0, -12), Vector3(9, 0, -12), Vector3(-9, 0, 4), Vector3(9, 0, 4), Vector3(-9, 0, 20), Vector3(9, 0, 20)]
	for sp in spots:
		var p: Vector3 = sp
		var y_top := H - 0.4 + RISE * 0.42 * (1.0 - pow(p.x / W2, 2.0))
		var y := 9.6
		shades.rod(Vector3(p.x, y + 0.5, p.z), Vector3(p.x, y_top, p.z), 0.02, 4, Kit.PLAIN)
		shades.lathe(Vector3(p.x, y, p.z), Vector3.UP, [Vector2(-0.05, 0.62), Vector2(0.15, 0.55), Vector2(0.38, 0.28),
			Vector2(0.55, 0.12), Vector2(0.62, 0.0)], 12, Kit.PLAIN, true)
		bulbs.lathe(Vector3(p.x, y, p.z), Vector3.UP, [Vector2(0.0, 0.0), Vector2(0.0, 0.5)], 12, Kit.PLAIN, true, false, false)
		var ring := PackedVector3Array()
		for k in 12:
			var a := TAU * float(k) / 12.0
			ring.append(Vector3(p.x + cos(a) * 0.5, y + 0.02, p.z + sin(a) * 0.5))
		bulbs.cap(ring, Vector3(p.x, y + 0.02, p.z), Vector3.DOWN, Kit.PLAIN)
		var l := SpotLight3D.new()
		l.name = "Lamp%d" % lamps.size()
		l.position = Vector3(p.x, y - 0.1, p.z)
		l.rotation = Vector3(-PI * 0.5, 0, 0)
		l.light_color = Color(1.0, 0.92, 0.8)
		l.light_energy = 3.2
		l.spot_range = 24.0
		l.spot_angle = 58.0
		l.spot_angle_attenuation = 0.8
		l.spot_attenuation = 0.6
		l.shadow_blur = 2.0
		l.shadow_bias = 0.6
		l.shadow_normal_bias = 4.0
		root.add_child(l)
		lamps.append(l)
	var sm := _add(shades, "paint", Color(0.2, 0.3, 0.26), "LampShades")
	sm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_add(bulbs, "glow", Color(1.0, 0.95, 0.85), "LampBulbs", false)
	fill = OmniLight3D.new()
	fill.name = "Fill"
	fill.position = Vector3(0, 6.0, -6.0)
	fill.omni_range = 40.0
	fill.light_energy = 0.55
	fill.light_color = Color(0.85, 0.9, 1.0)
	root.add_child(fill)
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.rotation_degrees = Vector3(-34, 24, 0)
	sun.light_energy = 1.0
	sun.light_color = Color(1.0, 0.95, 0.86)
	sun.directional_shadow_max_distance = 70.0
	sun.shadow_blur = 1.5
	sun.shadow_bias = 0.12
	sun.shadow_normal_bias = 2.5
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	root.add_child(sun)


func _windows() -> void:
	var kit = Kit.new()
	for side: float in [-1.0, 1.0]:
		var x := side * (W2 - 0.12)
		var z := -D2 + 5.0
		while z < D2 - 4.0:
			kit.quad(Vector3(x, 8.4, z), Vector3(x, 10.2, z), Vector3(x, 10.2, z + 4.0), Vector3(x, 8.4, z + 4.0), Vector3(-side, 0, 0),
				Kit.PLAIN)
			z += 6.0
	_add(kit, "glow", Color(0.8, 0.88, 0.98), "Windows", false)


func _outside() -> void:
	# перрон за воротами
	var kit = Kit.new()
	kit.quad(Vector3(-90, -0.02, D2), Vector3(90, -0.02, D2), Vector3(90, -0.02, D2 + 60), Vector3(-90, -0.02, D2 + 60), Vector3.UP, Kit.PLAIN)
	_add(kit, "apron", Color(0.64, 0.64, 0.63), "Apron")
	# панорама: дуга цилиндра с картинкой горизонта
	var r := 170.0
	var seg := 24
	var a0 := deg_to_rad(-80.0)
	var a1 := deg_to_rad(80.0)
	var arc := r * (a1 - a0)
	var hgt := arc / 3.0
	var y_bot := 1.0 - hgt * 0.32
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var norms := PackedVector3Array()
	for k in seg:
		var t0 := float(k) / float(seg)
		var t1 := float(k + 1) / float(seg)
		var ang0 := lerpf(a0, a1, t0)
		var ang1 := lerpf(a0, a1, t1)
		var p0 := Vector3(sin(ang0) * r, 0, cos(ang0) * r)
		var p1 := Vector3(sin(ang1) * r, 0, cos(ang1) * r)
		var b0 := p0 + Vector3(0, y_bot, 0)
		var b1 := p1 + Vector3(0, y_bot, 0)
		var u0 := p0 + Vector3(0, y_bot + hgt, 0)
		var u1 := p1 + Vector3(0, y_bot + hgt, 0)
		# лицом к центру: обход по часовой, если смотреть изнутри
		verts.append_array([b0, u1, b1, b0, u0, u1])
		uvs.append_array([Vector2(1.0 - t0, 1), Vector2(1.0 - t1, 0), Vector2(1.0 - t1, 1), Vector2(1.0 - t0, 1),
			Vector2(1.0 - t0, 0), Vector2(1.0 - t1, 0)])
		for i in 6:
			norms.append(-p0.normalized())
	var arr: Array = []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_TEX_UV] = uvs
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var pm := _mat("pano").duplicate() as StandardMaterial3D
	pm.cull_mode = BaseMaterial3D.CULL_DISABLED
	mesh.surface_set_material(0, pm)
	var mi := MeshInstance3D.new()
	mi.name = "Panorama"
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)


# ------------------------------------------------------------------ реквизит

func _props() -> void:
	var paint = Kit.new()
	# верстак у левой стены
	var bx := -W2 + 1.2
	for k in 2:
		var bz := -18.0 + float(k) * 3.2
		paint.box(Vector3(bx, 0.92, bz), Vector3(0.6, 0.04, 1.5), Basis.IDENTITY, Kit.FRAME)
		for lx: float in [-0.5, 0.5]:
			for lz: float in [-1.35, 1.35]:
				paint.box(Vector3(bx + lx, 0.45, bz + lz), Vector3(0.04, 0.45, 0.04), Basis.IDENTITY, Kit.METAL_DARK)
		paint.box(Vector3(bx, 0.25, bz), Vector3(0.55, 0.02, 1.4), Basis.IDENTITY, Kit.METAL_DARK)
		# ящик с инструментом
		paint.box(Vector3(bx + 0.1, 1.1, bz - 0.6), Vector3(0.25, 0.14, 0.4), Basis.IDENTITY, Kit.ACCENT)
	# перфопанель на стене
	paint.box(Vector3(-W2 + 0.3, 2.1, -16.4), Vector3(0.04, 0.8, 3.0), Basis.IDENTITY, Kit.FRAME)
	# бочки
	var drums := [Vector3(W2 - 1.6, 0, -24.0), Vector3(W2 - 2.5, 0, -24.4), Vector3(W2 - 1.8, 0, -23.0), Vector3(W2 - 1.5, 0, 14.0),
		Vector3(W2 - 2.4, 0, 14.5)]
	for i in drums.size():
		var d: Vector3 = drums[i]
		var tag := Kit.ACCENT if i % 3 == 0 else (Kit.BELLY if i % 3 == 1 else Kit.SKIN)
		paint.lathe(d, Vector3.UP, [Vector2(0.0, 0.3), Vector2(0.02, 0.3), Vector2(0.86, 0.3), Vector2(0.88, 0.0)], 12, tag, false, false, false)
		for hy: float in [0.3, 0.58]:
			paint.lathe(d + Vector3(0, hy, 0), Vector3.UP, [Vector2(-0.02, 0.31), Vector2(0.02, 0.31)], 12, Kit.METAL_DARK, true)
	# ящики
	var crates := [[Vector3(-W2 + 1.6, 0, 22.0), 1.1], [Vector3(-W2 + 1.5, 0, 23.4), 0.9], [Vector3(-W2 + 1.5, 1.1, 22.1), 0.8],
		[Vector3(-W2 + 3.0, 0, 22.6), 0.7]]
	for c in crates:
		var p: Vector3 = c[0]
		var s: float = c[1]
		paint.box(p + Vector3(0, s * 0.5, 0), Vector3(s * 0.5, s * 0.5, s * 0.5), Basis.IDENTITY.rotated(Vector3.UP, s), Kit.PROP_TIP)
	# огнетушители у колонн
	for fz: float in [-12.0, 12.0]:
		var p2 := Vector3(-W2 + 0.75, 0, fz + 0.9)
		paint.lathe(p2, Vector3.UP, [Vector2(0.0, 0.11), Vector2(0.55, 0.11), Vector2(0.62, 0.06), Vector2(0.66, 0.0)], 8, Kit.LIGHT_RED, true)
	# конусы у ворот
	for cx: float in [-15.0, -11.0, 11.0, 15.0]:
		var p3 := Vector3(cx, 0, D2 - 3.0)
		paint.box(p3 + Vector3(0, 0.02, 0), Vector3(0.22, 0.02, 0.22), Basis.IDENTITY, Kit.ACCENT)
		paint.lathe(p3, Vector3.UP, [Vector2(0.02, 0.16), Vector2(0.3, 0.1), Vector2(0.38, 0.08), Vector2(0.5, 0.05), Vector2(0.62, 0.02)],
			8, Kit.ACCENT, true)
		paint.lathe(p3, Vector3.UP, [Vector2(0.3, 0.104), Vector2(0.38, 0.084)], 8, Kit.WHITE, true)
	# генератор на колёсах
	var gp := Vector3(17.0, 0, -20.0)
	paint.box(gp + Vector3(0, 0.75, 0), Vector3(0.7, 0.45, 1.1), Basis.IDENTITY, Kit.SKIN)
	paint.box(gp + Vector3(0, 1.24, 0.2), Vector3(0.5, 0.05, 0.6), Basis.IDENTITY, Kit.METAL_DARK)
	for wx: float in [-0.72, 0.72]:
		for wz: float in [-0.75, 0.75]:
			paint.lathe(gp + Vector3(wx, 0.28, wz), Vector3(1, 0, 0), [Vector2(-0.08, 0.28), Vector2(0.08, 0.28)], 10, Kit.TIRE, true, true, true)
	paint.beam(gp + Vector3(0, 0.4, -1.1), gp + Vector3(0, 0.35, -2.2), 0.06, 0.06, Kit.METAL_DARK)
	# стопка колёс
	for k in 3:
		paint.lathe(Vector3(W2 - 2.0, 0.14 + float(k) * 0.25, 4.0), Vector3.UP, [Vector2(-0.12, 0.42), Vector2(0.12, 0.42)], 12, Kit.TIRE,
			true, true, true)
	_add_painted(paint, "paint", Callable(self, "_prop_color"), "Props")


func _prop_color(tag: int, _c: Vector3, _n: Vector3) -> Color:
	match tag:
		Kit.FRAME:
			return Color(0.32, 0.27, 0.2)
		Kit.METAL_DARK:
			return Color(0.18, 0.19, 0.2)
		Kit.ACCENT:
			return Color(0.92, 0.42, 0.12)
		Kit.BELLY:
			return Color(0.18, 0.32, 0.5)
		Kit.SKIN:
			return Color(0.36, 0.4, 0.28)
		Kit.PROP_TIP:
			return Color(0.6, 0.47, 0.3)
		Kit.LIGHT_RED:
			return Color(0.75, 0.08, 0.06)
		Kit.WHITE:
			return Color(0.92, 0.92, 0.9)
		Kit.TIRE:
			return Color(0.07, 0.07, 0.07)
	return Color(0.5, 0.5, 0.5)


func _markings() -> void:
	var kit = Kit.new()
	var y := 0.012
	# жёлтые линии проходов
	for side: float in [-1.0, 1.0]:
		var x := side * (W2 - 4.5)
		kit.quad(Vector3(x - 0.1, y, -D2 + 1.0), Vector3(x + 0.1, y, -D2 + 1.0), Vector3(x + 0.1, y, D2 - 0.6), Vector3(x - 0.1, y, D2 - 0.6),
			Vector3.UP, Kit.ACCENT)
	# осевая к воротам
	var z := 15.0
	while z < D2 - 1.0:
		kit.quad(Vector3(-0.12, y, z), Vector3(0.12, y, z), Vector3(0.12, y, z + 1.6), Vector3(-0.12, y, z + 1.6), Vector3.UP, Kit.ACCENT)
		z += 2.6
	# круг стоянки
	var segs := 64
	for k in segs:
		var a0 := TAU * float(k) / float(segs)
		var a1 := TAU * float(k + 1) / float(segs)
		for ring in [[13.0, 13.25, Kit.ACCENT], [12.6, 12.68, Kit.WHITE]]:
			var r0: float = ring[0]
			var r1: float = ring[1]
			kit.quad(Vector3(cos(a0) * r0, y, sin(a0) * r0), Vector3(cos(a1) * r0, y, sin(a1) * r0), Vector3(cos(a1) * r1, y, sin(a1) * r1),
				Vector3(cos(a0) * r1, y, sin(a0) * r1), Vector3.UP, int(ring[2]))
	var mi := _add_painted(kit, "paint", func(t: int, _c: Vector3, _n: Vector3) -> Color:
		return Color(0.93, 0.74, 0.18) if t == Kit.ACCENT else Color(0.88, 0.88, 0.86), "Markings", false)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## Колодки под колёса и стремянка у самолёта. Пересобирается при смене модели.
func plane_props(model: Node3D, def: Dictionary) -> Node3D:
	var holder := Node3D.new()
	holder.name = "PlaneProps"
	var kit = Kit.new()
	var wheels: Array = model.get_meta("wheels", [])
	for wd in wheels:
		var w: Dictionary = wd
		if not w.get("main", false):
			continue
		var p: Vector3 = model.transform * (w.pos as Vector3)
		var r: float = w.r
		for dz: float in [-1.0, 1.0]:
			var c := Vector3(p.x, 0.0, p.z + dz * (r * 0.95 + 0.12))
			var hw := r * 0.55 + 0.12
			var h := r * 0.55
			var l := 0.24
			var a := c + Vector3(-hw, 0, -dz * l * 0.5)
			var b := c + Vector3(hw, 0, -dz * l * 0.5)
			var e := c + Vector3(hw, 0, dz * l * 0.5)
			var f := c + Vector3(-hw, 0, dz * l * 0.5)
			var ta := a + Vector3(0, h, 0)
			var tb := b + Vector3(0, h, 0)
			kit.quad(a, b, tb, ta, Vector3(0, 0, -dz), Kit.ACCENT)
			kit.quad(ta, tb, e, f, Vector3(0, 1, dz).normalized(), Kit.ACCENT)
			kit.tri_flat(a, ta, f, Vector3(-1, 0, 0), Kit.ACCENT)
			kit.tri_flat(b, tb, e, Vector3(1, 0, 0), Kit.ACCENT)
	# стремянка у кабины справа
	var sh: Dictionary = def.get("shape", {})
	var ck := model.get_node_or_null("Cockpit") as Node3D
	if ck:
		var cp := model.transform * ck.position
		var R := float(sh.get("fuselage_radius", 0.8))
		var top_y := clampf(cp.y - 0.55, 1.0, 4.0)
		var lx := R + 0.75
		var lz := cp.z
		var wz := float(sh.get("wing_z", 0.0))
		var wing_front := wz - float(sh.get("chord", 2.0)) * 1.1
		if lz > wing_front:
			# кабина над крылом: стремянка к корню крыла за задней кромкой
			lx = R * 1.6 + 0.9
			lz = wz + float(sh.get("chord", 2.0)) * 0.95
			top_y = clampf(model.transform.origin.y + 0.1, 0.8, 2.5)
		var foot := 0.55 + top_y * 0.35
		for sx: float in [-0.28, 0.28]:
			kit.beam(Vector3(lx + foot, 0.0, lz + sx), Vector3(lx, top_y, lz + sx), 0.05, 0.08, Kit.PROP_TIP)
		var steps := int(top_y / 0.32)
		for k in range(1, steps + 1):
			var f2 := float(k) / float(steps + 1)
			var px := lerpf(lx + foot, lx, f2)
			kit.box(Vector3(px, top_y * f2, lz), Vector3(0.09, 0.02, 0.28), Basis.IDENTITY, Kit.METAL_DARK)
		kit.box(Vector3(lx + 0.1, top_y, lz), Vector3(0.2, 0.03, 0.32), Basis.IDENTITY, Kit.METAL_DARK)
		for sx2: float in [-0.28, 0.28]:
			kit.beam(Vector3(lx + foot * 0.35, 0.0, lz + sx2), Vector3(lx + foot * 0.05, top_y * 0.85, lz + sx2), 0.04, 0.04, Kit.PROP_TIP)
	# тележка с инструментом за левым крылом
	var semi := float(sh.get("span", 10.0)) * 0.5
	var L := float(sh.get("length", 10.0))
	var tc := Vector3(-minf(semi + 1.4, 12.0), 0, L * 0.3)
	kit.box(tc + Vector3(0, 0.62, 0), Vector3(0.45, 0.42, 0.32), Basis.IDENTITY, Kit.LIGHT_RED)
	for k in 4:
		kit.box(tc + Vector3(0, 0.35 + float(k) * 0.19, -0.325), Vector3(0.4, 0.008, 0.01), Basis.IDENTITY, Kit.METAL_DARK)
	kit.box(tc + Vector3(0, 1.07, 0), Vector3(0.47, 0.03, 0.34), Basis.IDENTITY, Kit.METAL_DARK)
	kit.beam(tc + Vector3(0.47, 0.9, -0.25), tc + Vector3(0.6, 0.95, -0.25), 0.03, 0.03, Kit.METAL_DARK)
	kit.beam(tc + Vector3(0.47, 0.9, 0.25), tc + Vector3(0.6, 0.95, 0.25), 0.03, 0.03, Kit.METAL_DARK)
	kit.beam(tc + Vector3(0.6, 0.95, -0.25), tc + Vector3(0.6, 0.95, 0.25), 0.03, 0.03, Kit.METAL_DARK)
	for cx: float in [-0.38, 0.38]:
		for cz: float in [-0.25, 0.25]:
			kit.lathe(tc + Vector3(cx, 0.09, cz), Vector3(1, 0, 0), [Vector2(-0.03, 0.09), Vector2(0.03, 0.09)], 8, Kit.TIRE, true, true, true)
	var mesh: ArrayMesh = kit.to_mesh(Callable(self, "_plane_prop_color"), _mat("paint"))
	var mi := MeshInstance3D.new()
	mi.name = "Mesh"
	mi.mesh = mesh
	holder.add_child(mi)
	# мягкая тень под самолётом: вдоль фюзеляжа и вдоль крыла
	var R2 := float(sh.get("fuselage_radius", 0.8))
	var wz2 := float(sh.get("wing_z", 0.0))
	var blobs := [[Vector2(R2 * 5.0, L * 1.1), Vector3(0, 0.02, 0)],
		[Vector2(semi * 2.1, float(sh.get("chord", 2.0)) * 2.2), Vector3(0, 0.025, wz2)]]
	for i in blobs.size():
		var bd: Array = blobs[i]
		var sh_mi := MeshInstance3D.new()
		sh_mi.name = "BlobShadow%d" % i
		var pm := PlaneMesh.new()
		pm.size = bd[0]
		sh_mi.mesh = pm
		sh_mi.material_override = _mat("shadow")
		sh_mi.position = bd[1]
		sh_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		holder.add_child(sh_mi)
	return holder


func _plane_prop_color(tag: int, _c: Vector3, _n: Vector3) -> Color:
	match tag:
		Kit.ACCENT:
			return Color(0.95, 0.76, 0.12)
		Kit.PROP_TIP:
			return Color(0.92, 0.74, 0.14)
		Kit.METAL_DARK:
			return Color(0.2, 0.21, 0.22)
		Kit.LIGHT_RED:
			return Color(0.72, 0.1, 0.08)
		Kit.TIRE:
			return Color(0.06, 0.06, 0.06)
	return Color(0.5, 0.5, 0.5)


## Качество: тени только на «Высокой», на «Низкой» меньше ламп.
func apply_quality(q: String) -> void:
	var high := q == "high"
	var low := q == "low"
	for i in lamps.size():
		var l: SpotLight3D = lamps[i]
		l.visible = not low or i == 2 or i == 3
		l.shadow_enabled = high and (i == 2 or i == 3)
	sun.shadow_enabled = high
	fill.light_energy = 0.9 if low else 0.55
