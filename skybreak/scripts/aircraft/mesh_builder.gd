class_name AircraftMeshBuilder
extends RefCounted
## Процедурные низкополигональные модели самолётов по def.shape и камуфляжу.
## Меши кэшируются по (самолёт, камуфляж); каждый вызов build() собирает новые узлы.

const Gen = preload("res://scripts/aircraft/mesh_gen.gd")
const Kit = preload("res://scripts/aircraft/mesh_kit.gd")

const PROP_SPIN_MAX := 34.0      # рад/с при rpm01 = 1 (визуально, без стробоскопа)
const PROP_BLUR_FROM := 0.35     # с какого rpm01 виден диск
const PROP_HIDE_BLADES := 0.62   # с какого rpm01 вместо лопастей только диск

static var _cache: Dictionary = {}
static var _mats: Dictionary = {}
static var _flames: Dictionary = {}


static func build(def: Dictionary, camo: Dictionary) -> Node3D:
	var data := _data(def, camo)
	var meshes: Dictionary = data.meshes
	var pivots: Dictionary = data.pivots
	var root := Node3D.new()
	root.name = "Aircraft"
	root.set_meta("ground_pitch", data.ground_pitch)
	root.set_meta("tris", data.tris)
	root.set_meta("main_contact", data.main_contact)
	root.set_meta("wheels", (data.wheels as Array).duplicate(true))
	for part in ["Body", "LeftWing", "RightWing", "Tail"]:
		var mi := MeshInstance3D.new()
		mi.name = part
		mi.mesh = meshes.get(part)
		mi.position = pivots.get(part, Vector3.ZERO)
		root.add_child(mi)
	var gear := Node3D.new()
	gear.name = "Gear"
	var gm := MeshInstance3D.new()
	gm.name = "GearMesh"
	gm.mesh = meshes.get("Gear")
	gear.add_child(gm)
	root.add_child(gear)
	var canopy := MeshInstance3D.new()
	canopy.name = "Canopy"
	canopy.mesh = meshes.get("Canopy")
	canopy.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(canopy)
	var props: Array = data.props
	for i in props.size():
		var pd: Dictionary = props[i]
		var pn := Node3D.new()
		pn.name = "Prop%d" % i
		pn.position = pd.pos
		pn.set_meta("wing", pd.wing)
		var sp := MeshInstance3D.new()
		sp.name = "Spinner"
		sp.mesh = meshes.get("Spinner")
		pn.add_child(sp)
		var bl := MeshInstance3D.new()
		bl.name = "Blades"
		bl.mesh = meshes.get("Prop")
		pn.add_child(bl)
		var bd := MeshInstance3D.new()
		bd.name = "Blur"
		bd.mesh = meshes.get("PropBlur")
		bd.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		bd.visible = false
		pn.add_child(bd)
		pn.rotation.z = float(i) * 0.7
		root.add_child(pn)
	var flames: Array = data.flames
	for i in flames.size():
		var fd: Dictionary = flames[i]
		var ab := MeshInstance3D.new()
		ab.name = "Afterburner%d" % i
		ab.mesh = _flame_mesh(float(fd.r))
		ab.position = fd.pos
		if fd.flat:
			ab.scale = Vector3(1.0, 0.55, 1.0)
		ab.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		ab.visible = false
		root.add_child(ab)
	var mk: Dictionary = data.markers
	var names: Array = mk.keys()
	names.sort()
	for n in names:
		var m := Marker3D.new()
		m.name = n
		m.position = mk[n]
		root.add_child(m)
	return root


static func set_gear(model: Node3D, down: bool) -> void:
	if model == null:
		return
	var g := model.get_node_or_null("Gear") as Node3D
	if g:
		g.visible = down


static func set_afterburner(model: Node3D, on: bool) -> void:
	if model == null:
		return
	for c in model.get_children():
		if c is Node3D and String(c.name).begins_with("Afterburner"):
			(c as Node3D).visible = on


static func spin_props(model: Node3D, rpm01: float, dt: float) -> void:
	if model == null:
		return
	var r := clampf(rpm01, 0.0, 1.0)
	for c in model.get_children():
		if not (c is Node3D) or not String(c.name).begins_with("Prop"):
			continue
		var p := c as Node3D
		p.rotate_object_local(Vector3(0, 0, 1), -r * PROP_SPIN_MAX * dt)
		var blades := p.get_node_or_null("Blades") as Node3D
		var blur := p.get_node_or_null("Blur") as Node3D
		if blades:
			blades.visible = r < PROP_HIDE_BLADES
		if blur:
			blur.visible = r >= PROP_BLUR_FROM


static func detach_part(model: Node3D, part: String) -> Node3D:
	if model == null:
		return null
	var node := model.get_node_or_null(part) as Node3D
	if node == null:
		return null
	var in_tree := model.is_inside_tree()
	var gt: Transform3D = node.global_transform if in_tree else model.transform * node.transform
	# винты на этом крыле уходят вместе с ним
	if part == "LeftWing" or part == "RightWing":
		for c in model.get_children():
			if c is Node3D and String(c.name).begins_with("Prop") and String(c.get_meta("wing", "")) == part:
				var pn := c as Node3D
				var rel := node.transform.affine_inverse() * pn.transform
				model.remove_child(pn)
				node.add_child(pn)
				pn.transform = rel
	model.remove_child(node)
	if in_tree:
		var tree := model.get_tree()
		var target: Node = tree.current_scene if tree.current_scene != null else tree.root
		target.add_child(node)
		node.global_transform = gt
	else:
		node.transform = gt
	return node


## Угол, на который нужно поднять нос, чтобы самолёт с хвостовым колесом стоял на трёх точках
## (вращение вокруг точки касания основных колёс). У реактивных 0.
static func ground_pitch(def: Dictionary) -> float:
	var camo: Dictionary = Data.camo(String(def.get("id", "")), "factory")
	return float(_data(def, camo).ground_pitch)


## Сумма треугольников по всем MeshInstance3D модели.
static func triangle_count(model: Node) -> int:
	var total := 0
	var stack: Array = [model]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
			var m: Mesh = (n as MeshInstance3D).mesh
			for s in m.get_surface_count():
				var arr := m.surface_get_arrays(s)
				var idx = arr[Mesh.ARRAY_INDEX]
				if idx != null and (idx as PackedInt32Array).size() > 0:
					total += (idx as PackedInt32Array).size() / 3
				else:
					total += (arr[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
		for c in n.get_children():
			stack.append(c)
	return total


static func clear_cache() -> void:
	_cache.clear()


## Заранее строит меши (например, при загрузке боя), чтобы build() потом не тормозил.
static func prewarm(plane_ids: Array, camo_ids: Array = ["factory"]) -> void:
	for id in plane_ids:
		var def: Dictionary = Data.plane(String(id))
		if def.is_empty():
			continue
		for cid in camo_ids:
			_data(def, Data.camo(String(id), String(cid)))


static func material(name: String) -> Material:
	if _mats.has(name):
		return _mats[name]
	var m := StandardMaterial3D.new()
	match name:
		"skin":
			m.vertex_color_use_as_albedo = true
			m.vertex_color_is_srgb = true
			m.albedo_color = Color(1, 1, 1)
			m.roughness = 0.62
			m.metallic = 0.12
			m.metallic_specular = 0.45
		"glass":
			m.albedo_color = Color(0.07, 0.1, 0.13, 0.62)
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.roughness = 0.05
			m.metallic = 0.55
			m.metallic_specular = 0.9
			m.rim_enabled = true
			m.rim = 0.35
			m.rim_tint = 0.6
		"blur":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.vertex_color_use_as_albedo = true
			m.vertex_color_is_srgb = true
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.cull_mode = BaseMaterial3D.CULL_DISABLED
		"flame":
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.vertex_color_use_as_albedo = true
			m.vertex_color_is_srgb = true
			m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			m.cull_mode = BaseMaterial3D.CULL_DISABLED
			m.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_mats[name] = m
	return m


static func _key(def: Dictionary, camo: Dictionary) -> String:
	var id := String(def.get("id", ""))
	if id == "":
		id = str(def.get("shape", {}).hash())
	return "%s|%s|%s|%s" % [id, String(camo.get("id", "")), String(camo.get("pattern", "solid")), str(camo.get("colors", []))]


static func _data(def: Dictionary, camo: Dictionary) -> Dictionary:
	var key := _key(def, camo)
	if _cache.has(key):
		return _cache[key]
	var gen = Gen.new(def, camo)
	var data: Dictionary = gen.run()
	_cache[key] = data
	return data


static func _flame_mesh(r: float) -> ArrayMesh:
	var key := snappedf(r, 0.01)
	if _flames.has(key):
		return _flames[key]
	var kit = Kit.new()
	var ln := r * 7.0
	kit.lathe(Vector3.ZERO, Vector3(0, 0, 1), [Vector2(0.0, r * 0.94), Vector2(ln * 0.18, r * 0.86), Vector2(ln * 0.5, r * 0.5),
		Vector2(ln, 0.0)], 14, Kit.ACCENT, true)
	kit.lathe(Vector3.ZERO, Vector3(0, 0, 1), [Vector2(0.0, r * 0.66), Vector2(ln * 0.16, r * 0.58), Vector2(ln * 0.42, 0.0)],
		12, Kit.WHITE, true)
	# кольца скачков уплотнения
	for k in 3:
		var z := ln * (0.14 + 0.12 * float(k))
		kit.lathe(Vector3(0, 0, z), Vector3(0, 0, 1), [Vector2(-r * 0.12, 0.0), Vector2(0.0, r * 0.42 * (1.0 - 0.2 * float(k))),
			Vector2(r * 0.12, 0.0)], 8, Kit.LIGHT_RED, true)
	var mesh: ArrayMesh = kit.to_mesh(func(tag: int, _c: Vector3, _n: Vector3) -> Color:
		match tag:
			Kit.ACCENT:
				return Color(1.0, 0.5, 0.16, 0.5)
			Kit.WHITE:
				return Color(0.62, 0.78, 1.0, 0.85)
		return Color(1.0, 0.86, 0.55, 0.7), material("flame"))
	_flames[key] = mesh
	return mesh
