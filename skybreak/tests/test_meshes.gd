extends RefCounted
## VISUAL: модели всех самолётов во всех камуфляжах.

const REQUIRED := ["Body", "LeftWing", "RightWing", "Tail", "Gear", "Canopy", "Cockpit", "WingTipL", "WingTipR",
	"Muzzle0", "Engine0", "Pylon0"]


func _barrels(def: Dictionary) -> int:
	var n := 0
	for g in def.weapons.guns:
		n += int(g.count)
	return n


## AABB видимых мешей в координатах модели (без пламени форсажа).
func _visible_aabb(model: Node3D) -> AABB:
	var box := AABB()
	var first := true
	var stack: Array = [[model, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var e: Array = stack.pop_back()
		var n: Node = e[0]
		var xf: Transform3D = e[1]
		for c in n.get_children():
			if not (c is Node3D):
				continue
			var c3 := c as Node3D
			if String(c3.name).begins_with("Afterburner") or String(c3.name) == "Blur":
				continue
			var cx := xf * c3.transform
			if c3 is MeshInstance3D and (c3 as MeshInstance3D).mesh != null:
				var b := cx * (c3 as MeshInstance3D).mesh.get_aabb()
				if first:
					box = b
					first = false
				else:
					box = box.merge(b)
			stack.append([c3, cx])
	return box


func _gear_bottom(model: Node3D) -> float:
	var g := model.get_node("Gear") as Node3D
	var gm := g.get_node("GearMesh") as MeshInstance3D
	var b := gm.mesh.get_aabb()
	return (g.transform * gm.transform * b).position.y


func run(tree: SceneTree) -> Array:
	var errors: Array = []
	var t0 := Time.get_ticks_msec()
	for id in Data.ORDER:
		var def: Dictionary = Data.plane(id)
		var sh: Dictionary = def.shape
		var is_prop: bool = def.kind == "prop"
		var max_tris := 0
		for camo in Data.camos_for(id):
			var tag := "%s/%s" % [id, camo.id]
			var m: Node3D = AircraftMeshBuilder.build(def, camo)
			if m == null:
				errors.append(tag + ": build вернул null")
				continue
			for n in REQUIRED:
				if m.get_node_or_null(n) == null:
					errors.append(tag + ": нет узла " + n)
			for n in ["Body", "LeftWing", "RightWing", "Tail", "Canopy"]:
				var mi := m.get_node_or_null(n) as MeshInstance3D
				if mi == null or mi.mesh == null:
					errors.append(tag + ": пустой меш " + n)
			var props := 0
			while m.get_node_or_null("Prop%d" % props) != null:
				props += 1
			var expected_props := 0
			if sh.engines == "nose_prop":
				expected_props = 1
			elif sh.engines == "twin_prop":
				expected_props = 2
			if props != expected_props:
				errors.append("%s: винтов %d, нужно %d" % [tag, props, expected_props])
			var abs_count := 0
			while m.get_node_or_null("Afterburner%d" % abs_count) != null:
				abs_count += 1
			if is_prop and abs_count > 0:
				errors.append(tag + ": у винтового есть форсаж")
			if not is_prop:
				var need := 2 if sh.engines == "twin_jet" else 1
				if abs_count != need:
					errors.append("%s: форсажей %d, нужно %d" % [tag, abs_count, need])
				var engines := 0
				while m.get_node_or_null("Engine%d" % engines) != null:
					engines += 1
				if engines != need:
					errors.append("%s: маркеров Engine %d, нужно %d" % [tag, engines, need])
			var muzzles := 0
			while m.get_node_or_null("Muzzle%d" % muzzles) != null:
				muzzles += 1
			if muzzles != _barrels(def):
				errors.append("%s: стволов %d, нужно %d" % [tag, muzzles, _barrels(def)])
			var pylons := 0
			while m.get_node_or_null("Pylon%d" % pylons) != null:
				pylons += 1
			if pylons < 2 or pylons % 2 == 1:
				errors.append("%s: пилонов %d" % [tag, pylons])
			else:
				var p0 := (m.get_node("Pylon0") as Node3D).position
				var p1 := (m.get_node("Pylon1") as Node3D).position
				if p0.x > 0.0 or p1.x < 0.0:
					errors.append(tag + ": Pylon0 должен быть слева, Pylon1 справа")
			var box := _visible_aabb(m)
			var len_ratio: float = box.size.z / float(sh.length)
			var span_ratio: float = box.size.x / float(sh.span)
			if absf(len_ratio - 1.0) > 0.15:
				errors.append("%s: длина %.2f м при %.2f" % [tag, box.size.z, sh.length])
			if absf(span_ratio - 1.0) > 0.15:
				errors.append("%s: размах %.2f м при %.2f" % [tag, box.size.x, sh.span])
			if box.get_center().z < -float(sh.length) * 0.2 or box.get_center().z > float(sh.length) * 0.2:
				errors.append("%s: центр модели далеко от начала координат (%.2f)" % [tag, box.get_center().z])
			var tris := AircraftMeshBuilder.triangle_count(m)
			max_tris = maxi(max_tris, tris)
			if tris >= 6000:
				errors.append("%s: треугольников %d" % [tag, tris])
			if tris < 800:
				errors.append("%s: слишком мало треугольников (%d)" % [tag, tris])
			var gb := _gear_bottom(m)
			if absf(gb + float(sh.gear_height)) > 0.08:
				errors.append("%s: низ шасси %.2f, нужно %.2f" % [tag, gb, -float(sh.gear_height)])
			var lw := (m.get_node("LeftWing") as Node3D)
			var rw := (m.get_node("RightWing") as Node3D)
			if lw.position.x >= 0.0 or rw.position.x <= 0.0:
				errors.append(tag + ": крылья перепутаны")
			var tl := (m.get_node("WingTipL") as Node3D).position
			var tr := (m.get_node("WingTipR") as Node3D).position
			if tl.x > -float(sh.span) * 0.4 or tr.x < float(sh.span) * 0.4:
				errors.append(tag + ": законцовки не на концах крыла")
			var ck := (m.get_node("Cockpit") as Node3D).position
			if absf(ck.z - float(sh.cockpit_z)) > 0.05 or ck.y < 0.0:
				errors.append(tag + ": неверный маркер кабины")
			m.free()
		print("  ", id, ": до ", max_tris, " треугольников")
	# поведение на одной модели (в дереве сцены)
	await tree.process_frame
	for id in ["strizh", "burevestnik", "flanker"]:
		var def2: Dictionary = Data.plane(id)
		var m2: Node3D = AircraftMeshBuilder.build(def2, Data.camo(id, "factory"))
		tree.root.add_child(m2)
		m2.global_position = Vector3(10, 20, 30)
		m2.rotation = Vector3(0.2, 0.5, 0.1)
		AircraftMeshBuilder.set_gear(m2, false)
		if (m2.get_node("Gear") as Node3D).visible:
			errors.append(id + ": set_gear(false) не убрал шасси")
		AircraftMeshBuilder.set_gear(m2, true)
		if not (m2.get_node("Gear") as Node3D).visible:
			errors.append(id + ": set_gear(true) не выпустил шасси")
		if def2.kind == "jet":
			var ab := m2.get_node("Afterburner0") as Node3D
			if ab.visible:
				errors.append(id + ": форсаж виден по умолчанию")
			AircraftMeshBuilder.set_afterburner(m2, true)
			if not ab.visible:
				errors.append(id + ": set_afterburner(true) не включил форсаж")
			AircraftMeshBuilder.set_afterburner(m2, false)
		else:
			var p := m2.get_node("Prop0") as Node3D
			var before := p.transform.basis
			AircraftMeshBuilder.spin_props(m2, 0.9, 0.05)
			if p.transform.basis.is_equal_approx(before):
				errors.append(id + ": spin_props не вращает винт")
			var ax_before := before.z
			if not p.transform.basis.z.is_equal_approx(ax_before):
				errors.append(id + ": винт вращается не вокруг своей оси Z")
		var wing := m2.get_node("LeftWing") as Node3D
		var gt := wing.global_transform
		var det := AircraftMeshBuilder.detach_part(m2, "LeftWing")
		if det == null:
			errors.append(id + ": detach_part вернул null")
		else:
			if det.get_parent() == m2:
				errors.append(id + ": крыло осталось в модели")
			if not det.global_transform.is_equal_approx(gt):
				errors.append(id + ": при отрыве крыло сдвинулось")
			if m2.get_node_or_null("LeftWing") != null:
				errors.append(id + ": LeftWing всё ещё в модели")
			if id == "burevestnik" and m2.get_node_or_null("Prop0") != null:
				errors.append(id + ": винт левого мотора не ушёл с крылом")
			det.queue_free()
		var tail := AircraftMeshBuilder.detach_part(m2, "Tail")
		if tail == null or tail.get_parent() == m2:
			errors.append(id + ": хвост не отделился")
		elif tail:
			tail.queue_free()
		if AircraftMeshBuilder.detach_part(m2, "Nothing") != null:
			errors.append(id + ": detach_part неизвестной части не null")
		m2.queue_free()
	var pitch := AircraftMeshBuilder.ground_pitch(Data.plane("strizh"))
	if pitch <= 0.02 or pitch > 0.35:
		errors.append("угол стоянки Стрижа %.3f" % pitch)
	if absf(AircraftMeshBuilder.ground_pitch(Data.plane("sokol"))) > 0.001:
		errors.append("у реактивного угол стоянки не 0")
	_check_markers(errors)
	_check_custom_defs(errors)
	await _check_prop_detach(tree, errors)
	await _check_showroom(tree, errors)
	print("  всего: ", Time.get_ticks_msec() - t0, " мс")
	return errors


## Маркеры стоят там, где нужно оружию и эффектам.
func _check_markers(errors: Array) -> void:
	for id in Data.ORDER:
		var def: Dictionary = Data.plane(id)
		var sh: Dictionary = def.shape
		var m: Node3D = AircraftMeshBuilder.build(def, Data.camo(id, "factory"))
		var semi: float = float(sh.span) * 0.5
		var i := 0
		while m.get_node_or_null("Muzzle%d" % i) != null:
			var p := (m.get_node("Muzzle%d" % i) as Node3D).position
			if p.z > float(sh.length) * 0.15 or absf(p.x) > semi:
				errors.append("%s: Muzzle%d в странном месте %s" % [id, i, p])
			i += 1
		i = 0
		while m.get_node_or_null("Pylon%d" % i) != null:
			var p2 := (m.get_node("Pylon%d" % i) as Node3D).position
			if p2.y > 0.0 or absf(p2.x) > semi:
				errors.append("%s: Pylon%d не под крылом %s" % [id, i, p2])
			i += 1
		if def.kind == "jet":
			var e := (m.get_node("Engine0") as Node3D).position
			if e.z < 0.0:
				errors.append("%s: Engine0 у реактивного не у сопла" % id)
			var ab := m.get_node("Afterburner0") as Node3D
			if ab.position.distance_to(e) > 0.01:
				errors.append("%s: форсаж не у маркера Engine0" % id)
		else:
			var e2 := (m.get_node("Engine0") as Node3D).position
			if e2.z > 0.0:
				errors.append("%s: Engine0 у винтового не спереди" % id)
		var wheels: Array = m.get_meta("wheels", [])
		if wheels.size() != 3:
			errors.append("%s: колёс %d" % [id, wheels.size()])
		m.free()


## Модель строится из любых данных shape, а не только для известных id.
func _check_custom_defs(errors: Array) -> void:
	var base_ids := {"nose_prop": "strizh", "twin_prop": "burevestnik", "single_jet": "mirage", "twin_jet": "fantom"}
	for eng in base_ids:
		var def: Dictionary = Data.plane(base_ids[eng]).duplicate(true)
		def.id = "test_" + eng
		def.shape.length = float(def.shape.length) * 1.2
		def.shape.span = float(def.shape.span) * 0.9
		var m: Node3D = AircraftMeshBuilder.build(def, Data.camo(base_ids[eng], "desert"))
		for n in REQUIRED:
			if m.get_node_or_null(n) == null:
				errors.append("%s: нет узла %s" % [def.id, n])
		var box := _visible_aabb(m)
		if absf(box.size.z / float(def.shape.length) - 1.0) > 0.15:
			errors.append("%s: длина %.2f при %.2f" % [def.id, box.size.z, def.shape.length])
		if absf(box.size.x / float(def.shape.span) - 1.0) > 0.15:
			errors.append("%s: размах %.2f при %.2f" % [def.id, box.size.x, def.shape.span])
		if AircraftMeshBuilder.triangle_count(m) >= 6000:
			errors.append("%s: слишком много треугольников" % def.id)
		m.free()


## Винт отрывается вместе с крылом и не прыгает.
func _check_prop_detach(tree: SceneTree, errors: Array) -> void:
	var m: Node3D = AircraftMeshBuilder.build(Data.plane("burevestnik"), Data.camo("burevestnik", "factory"))
	tree.root.add_child(m)
	m.global_transform = Transform3D(Basis.from_euler(Vector3(0.3, 1.0, -0.4)), Vector3(5, 100, -20))
	var prop := m.get_node("Prop1") as Node3D
	var gt := prop.global_transform
	var wing := AircraftMeshBuilder.detach_part(m, "RightWing")
	if prop.get_parent() != wing:
		errors.append("правый винт не перешёл к оторванному крылу")
	elif not prop.global_transform.is_equal_approx(gt):
		errors.append("винт сдвинулся при отрыве крыла")
	if m.get_node_or_null("Prop0") == null:
		errors.append("левый винт пропал при отрыве правого крыла")
	await tree.process_frame
	if wing:
		wing.queue_free()
	m.queue_free()


func _check_showroom(tree: SceneTree, errors: Array) -> void:
	var sr := Showroom.new()
	sr.show_plane("strizh", "factory")
	tree.root.add_child(sr)
	await tree.process_frame
	if sr.model == null:
		errors.append("ангар: самолёт не появился")
	if sr.camera == null or not sr.camera.current:
		errors.append("ангар: нет своей камеры")
	if sr.get_node_or_null("Environment") == null:
		errors.append("ангар: нет WorldEnvironment")
	var lights := sr.find_children("*", "Light3D", true, false)
	if lights.size() < 3:
		errors.append("ангар: мало света (%d)" % lights.size())
	if sr.model and not (sr.model.get_node("Gear") as Node3D).visible:
		errors.append("ангар: шасси убрано")
	sr.show_plane("flanker", "desert")
	await tree.create_timer(0.7).timeout
	if sr.model == null or sr.model.get_node_or_null("Afterburner1") == null:
		errors.append("ангар: модель не сменилась на Фланкер")
	var models := sr._holder.get_children().filter(func(n: Node) -> bool: return n.has_meta("tris"))
	if models.size() != 1 or String(models[0].name) != "Aircraft":
		errors.append("ангар: старая модель не удалена (%d)" % models.size())
	# ввод: перетаскивание, колесо, щипок
	var yaw0: float = sr._t_yaw
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.pressed = true
	sr.handle_input(press)
	var move := InputEventMouseMotion.new()
	move.relative = Vector2(120, 30)
	sr.handle_input(move)
	press.pressed = false
	sr.handle_input(press)
	if is_equal_approx(sr._t_yaw, yaw0):
		errors.append("ангар: мышь не вращает камеру")
	var d0: float = sr._t_dist
	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel.pressed = true
	sr.handle_input(wheel)
	if sr._t_dist >= d0:
		errors.append("ангар: колесо не приближает")
	var t1 := InputEventScreenTouch.new()
	t1.index = 0
	t1.position = Vector2(400, 300)
	t1.pressed = true
	sr.handle_input(t1)
	var t2 := InputEventScreenTouch.new()
	t2.index = 1
	t2.position = Vector2(600, 300)
	t2.pressed = true
	sr.handle_input(t2)
	var d1: float = sr._t_dist
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(800, 300)
	drag.relative = Vector2(200, 0)
	sr.handle_input(drag)
	if sr._t_dist >= d1 and d1 > sr._dist_min + 0.01:
		errors.append("ангар: щипок не приближает")
	t1.pressed = false
	t2.pressed = false
	sr.handle_input(t1)
	sr.handle_input(t2)
	sr.set_interactive(false)
	if sr.handle_input(move):
		errors.append("ангар: ввод работает при set_interactive(false)")
	sr.set_interactive(true)
	sr.reset_view()
	if not is_equal_approx(sr._t_yaw, Showroom.DEFAULT_YAW) or not is_equal_approx(sr._t_dist, sr._dist_default):
		errors.append("ангар: reset_view не вернул камеру")
	# камера остаётся внутри здания при любом зуме
	sr._t_dist = 999.0
	sr._t_pitch = 1.5
	sr._update_camera(1.0, true)
	var cp := sr.camera.position
	if cp.y > Showroom.CAM_MAX_Y + 0.5 or absf(cp.x) > 28.0 or cp.y < 0.3:
		errors.append("ангар: камера вышла за пределы (%s)" % cp)
	sr.queue_free()
	await tree.process_frame
