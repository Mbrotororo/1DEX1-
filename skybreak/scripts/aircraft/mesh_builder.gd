class_name AircraftMeshBuilder
extends RefCounted
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

static func build(def: Dictionary, camo: Dictionary) -> Node3D:
	var root := Node3D.new()
	root.name = "Aircraft"
	var body := MeshInstance3D.new()
	body.name = "Body"
	var m := BoxMesh.new()
	m.size = Vector3(1.5, 1.5, def.get("shape", {}).get("length", 10.0))
	body.mesh = m
	root.add_child(body)
	for n in ["LeftWing", "RightWing", "Tail", "Gear", "Canopy"]:
		var x := Node3D.new()
		x.name = n
		root.add_child(x)
	for n in ["Muzzle0", "Engine0", "Cockpit", "WingTipL", "WingTipR", "Pylon0"]:
		var mk := Marker3D.new()
		mk.name = n
		root.add_child(mk)
	return root

static func set_gear(model: Node3D, down: bool) -> void:
	pass

static func set_afterburner(model: Node3D, on: bool) -> void:
	pass

static func spin_props(model: Node3D, rpm01: float, dt: float) -> void:
	pass

static func detach_part(model: Node3D, part: String) -> Node3D:
	return null
