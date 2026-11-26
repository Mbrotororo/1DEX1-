extends RefCounted
## Мелочь на рельефе: камни, деревья, кусты. MultiMesh по участкам 2,5 км с дальностью видимости.

const MeshB = preload("res://scripts/world/world_mesh.gd")
const Mat = preload("res://scripts/world/world_materials.gd")

const CHUNK := 2500.0
const VIEW_RANGE := 4200.0

static var _mesh_cache: Dictionary = {}

static func scatter(w, rng: RandomNumberGenerator, quality: float) -> Node3D:
	var root := Node3D.new()
	root.name = "Props"
	var kinds: Array = []
	match w.map_id:
		"canyon":
			kinds = [["rock_red", 2600, 0.0], ["shrub", 5200, 0.0]]
		"fjord":
			kinds = [["pine", 16000, 0.0], ["rock_grey", 2200, 0.0]]
		"reef":
			kinds = [["palm", 5200, 0.0], ["bush", 5200, 0.0], ["rock_grey", 900, 0.0]]
	var noise := FastNoiseLite.new()
	noise.seed = rng.randi()
	noise.frequency = 0.0011
	for k in kinds:
		var kind: String = k[0]
		var tries := int(float(k[1]) * quality)
		var chunks: Dictionary = {}
		for i in tries:
			var x := rng.randf_range(-5000.0, 5000.0)
			var z := rng.randf_range(-5000.0, 5000.0)
			var s := rng.randf_range(0.7, 1.35)
			var yaw := rng.randf_range(0.0, TAU)
			var keep := rng.randf()
			if not _accept(w, kind, x, z, keep, noise):
				continue
			var h: float = w.height_at(x, z)
			var key := Vector2i(floori((x + 5000.0) / CHUNK), floori((z + 5000.0) / CHUNK))
			if not chunks.has(key):
				chunks[key] = []
			var b := Basis(Vector3.UP, yaw).scaled(Vector3(s, s * rng.randf_range(0.85, 1.2), s))
			if kind.begins_with("rock"):
				var n: Vector3 = w.terrain.normal_at(x, z)
				b = Basis(Quaternion(Vector3.UP, n)) * b
				h -= 0.6 * s
			chunks[key].append(Transform3D(b, Vector3(x, h, z)))
		var mesh := _mesh(kind)
		for key in chunks:
			var list: Array = chunks[key]
			var mm := MultiMesh.new()
			mm.transform_format = MultiMesh.TRANSFORM_3D
			mm.mesh = mesh
			mm.instance_count = list.size()
			for i in list.size():
				mm.set_instance_transform(i, list[i])
			var mmi := MultiMeshInstance3D.new()
			mmi.name = "%s_%d_%d" % [kind, key.x, key.y]
			mmi.multimesh = mm
			mmi.visibility_range_end = VIEW_RANGE
			mmi.visibility_range_end_margin = 400.0
			mmi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
			mmi.material_override = Mat.vcolor(Color(1, 1, 1), 0.9)
			if kind == "shrub" or kind == "bush":
				mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			root.add_child(mmi)
	return root

static func _accept(w, kind: String, x: float, z: float, keep: float, noise: FastNoiseLite) -> bool:
	var h: float = w.height_at(x, z)
	if h < 2.0:
		return false
	# не на аэродромах и базах
	var s: Dictionary = w.surface_at(x, z)
	if int(s.team) >= 0:
		return false
	for af in w.airfields:
		if Vector2(af.pos.x, af.pos.z).distance_to(Vector2(x, z)) < 950.0:
			return false
	for b in w.bases:
		if Vector2(b.pos.x, b.pos.z).distance_to(Vector2(x, z)) < 260.0:
			return false
	var ny: float = w.terrain.normal_at(x, z).y
	var nv := noise.get_noise_2d(x, z)
	match kind:
		"pine":
			# лес пятнами в низинах
			return h < 420.0 and ny > 0.82 and nv > -0.15 and keep < clampf((nv + 0.15) * 2.0, 0.0, 1.0) * clampf((440.0 - h) / 120.0, 0.0, 1.0)
		"palm":
			return h < 60.0 and ny > 0.85 and (h < 14.0 or nv > 0.1)
		"bush":
			return h > 5.0 and ny > 0.75 and nv > -0.3
		"shrub":
			return ny > 0.9 and (h < 25.0 or nv > 0.2) and keep < 0.8
		"rock_red":
			return ny < 0.95 or keep < 0.15
		"rock_grey":
			return ny < 0.93 or keep < 0.1
	return true

static func _mesh(kind: String) -> ArrayMesh:
	if _mesh_cache.has(kind):
		return _mesh_cache[kind]
	var b := MeshB.new()
	var rng := RandomNumberGenerator.new()
	rng.seed = kind.hash()
	match kind:
		"pine":
			b.cylinder(Vector3.ZERO, 0.35, 3.0, 5, Color(0.30, 0.22, 0.16))
			var g := Color(0.12, 0.22, 0.15)
			b.cone(Vector3(0, 2.0, 0), 3.4, 6.0, 7, g, Basis.IDENTITY, false)
			b.cone(Vector3(0, 5.0, 0), 2.7, 5.0, 7, g.lightened(0.05), Basis.IDENTITY, false)
			b.cone(Vector3(0, 7.8, 0), 1.9, 4.2, 7, g.lightened(0.1), Basis.IDENTITY, false)
			b.cone(Vector3(0, 10.6, 0), 1.0, 2.6, 6, Color(0.85, 0.88, 0.9), Basis.IDENTITY, false)
		"palm":
			b.cylinder(Vector3.ZERO, 0.32, 9.0, 5, Color(0.45, 0.36, 0.25), Basis(Vector3.FORWARD, 0.12), false, 0.22)
			var top := Vector3(1.05, 8.9, 0)
			for i in 6:
				var a := TAU * i / 6.0
				var d := Vector3(cos(a), -0.25, sin(a))
				var side := d.cross(Vector3.UP).normalized() * 0.9
				var tip := top + d * 4.5 + Vector3(0, -1.2, 0)
				b.tri(top, top + d * 2.2 + side + Vector3(0, 0.5, 0), tip, Color(0.22, 0.42, 0.16), Vector3.UP)
				b.tri(top, tip, top + d * 2.2 - side + Vector3(0, 0.5, 0), Color(0.18, 0.36, 0.13), Vector3.UP)
		"bush":
			b.rock(Vector3(0, 0.8, 0), Vector3(2.4, 1.8, 2.2), Color(0.20, 0.34, 0.14), rng)
			b.rock(Vector3(1.4, 0.6, 0.8), Vector3(1.6, 1.3, 1.6), Color(0.24, 0.38, 0.16), rng)
		"shrub":
			b.rock(Vector3(0, 0.4, 0), Vector3(1.4, 0.9, 1.3), Color(0.42, 0.40, 0.22), rng)
			b.rock(Vector3(0.9, 0.3, 0.5), Vector3(0.9, 0.7, 0.9), Color(0.36, 0.36, 0.20), rng)
		"rock_red":
			b.rock(Vector3(0, 1.5, 0), Vector3(5.5, 4.0, 4.5), Color(0.62, 0.32, 0.19), rng)
			b.rock(Vector3(4.0, 0.8, 2.0), Vector3(2.5, 2.0, 2.4), Color(0.70, 0.40, 0.24), rng)
		_:
			b.rock(Vector3(0, 1.4, 0), Vector3(5.0, 3.5, 4.2), Color(0.42, 0.41, 0.40), rng)
			b.rock(Vector3(3.2, 0.7, -1.8), Vector3(2.2, 1.6, 2.0), Color(0.36, 0.35, 0.34), rng)
	var m := b.commit()
	_mesh_cache[kind] = m
	return m
