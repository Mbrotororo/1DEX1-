extends RefCounted
## Поддельный бой для тестов и скриншотов модуля REPLAY: самолёты летят по заданным траекториям,
## у мира и боя есть только те поля, которые читают Recorder и Killcam.

const DT := 1.0 / 60.0


class FakeFM extends RefCounted:
	var gear_down: bool = false
	var afterburner: bool = false
	var throttle: float = 0.8
	var vel: Vector3 = Vector3.ZERO


class FakeDmg extends RefCounted:
	var on_fire: bool = false
	var engine_dead: bool = false
	var oil_leak: bool = false
	var left_wing_lost: bool = false
	var right_wing_lost: bool = false
	var tail_lost: bool = false

	func module_ratio(_m: String) -> float:
		return 1.0


class FakePlane extends Node3D:
	var uid: int = 0
	var team: int = 0
	var def_id: String = "strizh"
	var callsign: String = ""
	var camo_id: String = "factory"
	var is_player: bool = false
	var alive: bool = true
	var exploded: bool = false
	var fm: FakeFM = FakeFM.new()
	var dmg: FakeDmg = FakeDmg.new()
	var model: Node3D
	var path: Callable

	func velocity() -> Vector3:
		return fm.vel

	func place(t: float) -> void:
		var a: Transform3D = path.call(t)
		var b: Transform3D = path.call(t + 0.05)
		transform = a
		fm.vel = (b.origin - a.origin) / 0.05


class FakeGround extends Node3D:
	var uid: int = 0
	var kind: String = "tank"
	var team: int = 1
	var alive: bool = true
	var variant: String = ""
	var active: bool = true


class FakeWorld extends Node3D:
	var map: Dictionary = {"id": "fjord"}
	var time_of_day: String = "dusk"
	var weather: String = "cloudy"
	var ground_units: Array = []

	func height_at(_x: float, _z: float) -> float:
		return 0.0


class FakeBattle extends Node3D:
	var world
	var config: Dictionary = {"seed": 4242}
	var mode: String = "arcade"
	var aircraft: Array = []
	var ground_units: Array = []
	var recorder
	var camera_rig
	var fx
	var hud = null
	var paused: bool = false
	var t: float = 0.0

	func get_entity(uid: int):
		for a in aircraft:
			if is_instance_valid(a) and a.uid == uid:
				return a
		for g in ground_units:
			if is_instance_valid(g) and g.uid == uid:
				return g
		return null

	func planes() -> Array:
		return aircraft

	## Шаг симуляции: самолёты на траектории, запись.
	func step(dt: float) -> void:
		t += dt
		for a in aircraft:
			if is_instance_valid(a) and a.path.is_valid():
				a.place(t)
		if recorder != null:
			recorder._physics_process(dt)


## Прямая: старт, направление, скорость. Нос по направлению движения.
static func line_path(start: Vector3, dir: Vector3, speed: float) -> Callable:
	var d := dir.normalized()
	var b := Basis.looking_at(d, Vector3.UP)
	return func(t: float) -> Transform3D:
		return Transform3D(b, start + d * speed * t)


## Круг в горизонтальной плоскости с креном внутрь, плюс небольшая волна по высоте.
static func circle_path(center: Vector3, radius: float, omega: float, phase: float, wave: float = 30.0) -> Callable:
	return func(t: float) -> Transform3D:
		var a := phase + omega * t
		var p := center + Vector3(cos(a) * radius, sin(a * 2.0) * wave, sin(a) * radius)
		var tangent := Vector3(-sin(a), cos(a * 2.0) * 2.0 * wave / maxf(radius, 1.0), cos(a)) * signf(omega)
		var b := Basis.looking_at(tangent.normalized(), Vector3.UP)
		var bank := atan2(radius * omega * omega, 9.81) * signf(omega)
		b = b.rotated(tangent.normalized(), -bank)
		return Transform3D(b, p)


## real_world: настоящий World.build (для скриншотов), иначе пустой мир с плоской землёй.
static func make_battle(parent: Node, map_id: String = "fjord", real_world: bool = false) -> FakeBattle:
	var b := FakeBattle.new()
	b.name = "FakeBattle"
	if real_world:
		var rw := World.new()
		rw.name = "World"
		b.world = rw
		b.add_child(rw)
		parent.add_child(b)
		rw.build(Data.map_def(map_id), "day", "clear", 7, 1000)
		parent.remove_child(b)
	else:
		var w := FakeWorld.new()
		w.name = "World"
		w.map = {"id": map_id}
		b.world = w
		b.add_child(w)
	var rig := CameraRig.new()
	rig.name = "CameraRig"
	b.camera_rig = rig
	b.add_child(rig)
	parent.add_child(b)
	rig.camera.make_current()
	return b


static func add_plane(b: FakeBattle, uid: int, def_id: String, team: int, callsign: String, path: Callable,
		with_model: bool = false) -> FakePlane:
	var p := FakePlane.new()
	p.name = "Plane_%d" % uid
	p.uid = uid
	p.def_id = def_id
	p.team = team
	p.callsign = callsign
	p.path = path
	if with_model:
		p.model = AircraftMeshBuilder.build(Data.plane(def_id), Data.camo(def_id, "factory"))
	else:
		p.model = Node3D.new()
	p.add_child(p.model)
	b.add_child(p)
	p.place(b.t)
	b.aircraft.append(p)
	return p


static func add_ground(b: FakeBattle, uid: int, kind: String, team: int, pos: Vector3) -> FakeGround:
	var g := FakeGround.new()
	g.name = "Ground_%d" % uid
	g.uid = uid
	g.kind = kind
	g.team = team
	g.position = pos
	b.world.add_child(g)
	b.ground_units.append(g)
	b.world.ground_units.append(g)
	return g


static func add_recorder(b: FakeBattle, manual: bool = true) -> Recorder:
	var r := Recorder.new()
	r.name = "Recorder"
	b.recorder = r
	b.add_child(r)
	if manual:
		r.set_physics_process(false)
	r.start(b)
	return r
