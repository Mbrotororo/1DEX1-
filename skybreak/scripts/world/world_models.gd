extends RefCounted
## Низкополигональные модели наземных целей. Вперёд = -Z, вверх = +Y.
## Возвращают части: body, turret (поворот по курсу), gun (подъём), точки стволов и т. п.
## Меши кэшируются по виду, варианту и команде.

const MeshB = preload("res://scripts/world/world_mesh.gd")

const TEAM_COLORS := [Color(0.16, 0.42, 0.95), Color(0.92, 0.17, 0.13)]
const OLIVE := [Color(0.35, 0.40, 0.27), Color(0.47, 0.43, 0.30)]
const DARK := Color(0.15, 0.15, 0.14)

static var _cache: Dictionary = {}

static func parts(kind: String, variant: String, team: int) -> Dictionary:
	var key := "%s:%s:%d" % [kind, variant, team]
	if _cache.has(key):
		return _cache[key]
	var p: Dictionary
	match kind:
		"tank":
			p = _tank(team)
		"aa":
			p = _aa(variant, team)
		"truck":
			p = _truck(team)
		"ship":
			p = _ship(team)
		"building":
			p = _building(variant, team)
		_:
			p = {"body": MeshB.new().commit()}
	_cache[key] = p
	return p

static func _flag(b, base: Vector3, h: float, team: int, size := Vector2(1.6, 1.0)) -> void:
	b.box(base + Vector3(0, h * 0.5, 0), Vector3(0.08, h, 0.08), Color(0.2, 0.2, 0.2))
	b.box(base + Vector3(size.x * 0.5 + 0.04, h - size.y * 0.5, 0), Vector3(size.x, size.y, 0.06), TEAM_COLORS[team])

# ---------------------------------------------------------------- танк

static func _tank(team: int) -> Dictionary:
	var s := 1.25
	var body := MeshB.new()
	body.xform = Transform3D(Basis.IDENTITY.scaled(Vector3(s, s, s)), Vector3.ZERO)
	var c: Color = OLIVE[team]
	# гусеницы
	for x in [-1.75, 1.75]:
		body.box(Vector3(x, 0.55, 0), Vector3(0.75, 1.1, 7.2), DARK)
		for k in 6:
			body.cylinder(Vector3(x * 1.01 + (0.38 if x > 0 else -0.38), 0.45, -2.75 + k * 1.1), 0.42, 0.06, 8, Color(0.24, 0.24, 0.22), Basis(Vector3.FORWARD, PI * 0.5 * (1.0 if x > 0 else -1.0)), true)
	# корпус
	body.box(Vector3(0, 0.95, 0.2), Vector3(2.9, 0.9, 6.6), c)
	body.frustum(Vector3(0, 1.4, -0.2), Vector2(3.3, 6.0), Vector2(3.0, 5.0), 0.35, c.lightened(0.05))
	# полоса команды на корме
	body.box(Vector3(0, 1.55, 2.55), Vector3(3.0, 0.12, 0.4), TEAM_COLORS[team])
	var turret := MeshB.new()
	turret.xform = body.xform
	turret.frustum(Vector3(0, 0.0, 0.2), Vector2(2.8, 3.2), Vector2(2.2, 2.4), 0.85, c.lightened(0.08))
	# опознавательный квадрат на крыше — видно сверху
	turret.box(Vector3(0, 0.88, 0.55), Vector3(1.2, 0.05, 1.2), TEAM_COLORS[team])
	turret.cylinder(Vector3(0.55, 0.85, -0.35), 0.35, 0.3, 8, c.darkened(0.15))
	turret.box(Vector3(0, 0.45, -1.35), Vector3(1.0, 0.6, 0.5), c.darkened(0.1))
	_flag(turret, Vector3(-0.8, 0.85, 1.1), 2.2, team, Vector2(0.8, 0.5))
	var gun := MeshB.new()
	gun.xform = body.xform
	gun.cylinder(Vector3(0, 0, 0), 0.13, 4.4, 8, c.darkened(0.2), Basis(Vector3.RIGHT, -PI * 0.5))
	gun.cylinder(Vector3(0, 0, -4.2), 0.2, 0.45, 8, c.darkened(0.3), Basis(Vector3.RIGHT, -PI * 0.5))
	return {"body": body.commit(), "turret": turret.commit(), "gun": gun.commit(),
		"turret_pos": Vector3(0, 1.75 * s, 0.1 * s), "gun_pos": Vector3(0, 0.45 * s, -1.5 * s),
		"muzzles": [Vector3(0, 0, -4.6 * s)], "height": 2.6 * s}

# ---------------------------------------------------------------- зенитка

static func _aa(variant: String, team: int) -> Dictionary:
	var body := MeshB.new()
	var c: Color = OLIVE[team]
	var mount_y := 1.0
	if variant == "mobile":
		# грузовик с установкой в кузове
		_truck_chassis(body, team, false)
		body.box(Vector3(0, 1.55, 1.0), Vector3(2.4, 0.2, 4.2), c.darkened(0.1))
		mount_y = 1.65
	elif variant == "deck":
		body.cylinder(Vector3.ZERO, 3.2, 0.3, 10, Color(0.36, 0.39, 0.41))
		body.cylinder(Vector3(0, 0.3, 0), 3.0, 1.1, 10, Color(0.42, 0.45, 0.47), Basis.IDENTITY, false)
		mount_y = 0.3
	else:
		# окоп с мешками
		var sand := Color(0.62, 0.56, 0.40)
		for k in 10:
			var a := TAU * k / 10.0
			var p := Vector3(cos(a) * 3.8, 0.45, sin(a) * 3.8)
			body.box(p, Vector3(1.0, 0.9, 2.5), sand.darkened(0.06 * float(k % 3)), Basis(Vector3.UP, -a))
		body.cylinder(Vector3(0, 0, 0), 3.2, 0.25, 10, Color(0.42, 0.40, 0.34))
		body.box(Vector3(2.0, 0.4, 2.0), Vector3(1.0, 0.8, 0.7), Color(0.30, 0.32, 0.22))
		_flag(body, Vector3(-3.2, 0.9, -1.2), 3.2, team)
		mount_y = 0.25
	var heavy := variant == "heavy" or variant == "deck"
	var turret := MeshB.new()
	turret.cylinder(Vector3.ZERO, 0.9, 0.35, 8, c.darkened(0.15))
	turret.box(Vector3(0, 0.75, 0.2), Vector3(1.6, 0.8, 1.4), c)
	turret.box(Vector3(0, 0.45, 0.2), Vector3(0.12, 0.12, 0.12), TEAM_COLORS[team])
	turret.box(Vector3(0, 1.1, 0.95), Vector3(1.3, 0.06, 0.06), TEAM_COLORS[team])
	if heavy:
		turret.box(Vector3(0, 1.3, -0.3), Vector3(2.0, 1.6, 0.12), c.lightened(0.05))
	var gun := MeshB.new()
	var muzzles: Array = []
	if heavy:
		gun.box(Vector3(0, 0, 0.1), Vector3(0.8, 0.7, 1.4), c.darkened(0.1))
		gun.cylinder(Vector3(0, 0.05, -0.5), 0.17, 4.2, 8, c.darkened(0.25), Basis(Vector3.RIGHT, -PI * 0.5))
		gun.cylinder(Vector3(0, 0.05, -4.5), 0.24, 0.5, 8, c.darkened(0.35), Basis(Vector3.RIGHT, -PI * 0.5))
		muzzles.append(Vector3(0, 0.05, -5.0))
		# спаренные малые стволы по бокам
		for x in [-0.6, 0.6]:
			gun.cylinder(Vector3(x, -0.15, -0.3), 0.07, 2.3, 6, DARK, Basis(Vector3.RIGHT, -PI * 0.5))
			muzzles.append(Vector3(x, -0.15, -2.6))
	else:
		gun.box(Vector3(0, 0, 0.2), Vector3(1.0, 0.45, 1.0), c.darkened(0.1))
		for x in [-0.32, 0.32]:
			gun.cylinder(Vector3(x, 0.05, -0.3), 0.08, 2.6, 6, DARK, Basis(Vector3.RIGHT, -PI * 0.5))
			gun.cylinder(Vector3(x, 0.05, -2.75), 0.12, 0.25, 6, DARK, Basis(Vector3.RIGHT, -PI * 0.5))
			muzzles.append(Vector3(x, 0.05, -3.0))
		gun.box(Vector3(0.75, -0.1, 0.4), Vector3(0.4, 0.5, 0.6), Color(0.30, 0.32, 0.22))
	return {"body": body.commit(), "turret": turret.commit(), "gun": gun.commit(),
		"turret_pos": Vector3(0, mount_y, 0 if variant != "mobile" else 1.0), "gun_pos": Vector3(0, 1.2, 0.0),
		"muzzles": muzzles, "height": 3.2}

# ---------------------------------------------------------------- грузовик

static func _truck_chassis(b, team: int, canvas: bool) -> void:
	var c: Color = OLIVE[team]
	b.box(Vector3(0, 0.95, 0), Vector3(2.3, 0.35, 7.0), DARK)
	# кабина
	b.box(Vector3(0, 1.7, -2.4), Vector3(2.4, 1.5, 1.9), c)
	b.box(Vector3(0, 2.2, -3.36), Vector3(2.0, 0.55, 0.05), Color(0.2, 0.25, 0.3))
	b.box(Vector3(0, 1.15, -3.4), Vector3(2.4, 0.6, 0.4), c.darkened(0.1))
	b.box(Vector3(1.22, 1.6, -2.4), Vector3(0.05, 0.4, 0.9), TEAM_COLORS[team])
	b.box(Vector3(-1.22, 1.6, -2.4), Vector3(0.05, 0.4, 0.9), TEAM_COLORS[team])
	b.box(Vector3(0, 2.47, -2.4), Vector3(1.0, 0.04, 1.0), TEAM_COLORS[team])
	if canvas:
		b.box(Vector3(0, 1.55, 1.0), Vector3(2.4, 0.9, 4.4), c.darkened(0.05))
		b.arch(Vector3(0, 2.0, 1.0), 1.2, 4.4, 6, Color(0.46, 0.47, 0.33), Basis.IDENTITY, Color(0.40, 0.41, 0.29))
	for z in [-2.4, 0.2, 2.2]:
		for x in [-1.15, 1.15]:
			b.cylinder(Vector3(x, 0.55, z), 0.55, 0.4, 8, Color(0.1, 0.1, 0.1), Basis(Vector3.FORWARD, PI * 0.5 * (1.0 if x > 0 else -1.0)))

static func _truck(team: int) -> Dictionary:
	var body := MeshB.new()
	_truck_chassis(body, team, true)
	return {"body": body.commit(), "height": 3.2}

# ---------------------------------------------------------------- корабль

static func ship_outline() -> PackedVector2Array:
	return PackedVector2Array([Vector2(0, -38), Vector2(4.6, -26), Vector2(6.2, -8), Vector2(6.2, 22),
		Vector2(4.8, 33), Vector2(-4.8, 33), Vector2(-6.2, 22), Vector2(-6.2, -8), Vector2(-4.6, -26)])

static func _ship(team: int) -> Dictionary:
	var body := MeshB.new()
	var hull := Color(0.42, 0.46, 0.49) if team == 0 else Color(0.46, 0.46, 0.44)
	var deck := Color(0.30, 0.32, 0.33)
	var o := ship_outline()
	var lo := PackedVector2Array()
	for p in o:
		lo.append(Vector2(p.x * 0.78, p.y * 0.96))
	# борта: от днища (-3) до палубы (3.5)
	for i in o.size():
		var j := (i + 1) % o.size()
		var a0 := Vector3(lo[i].x, -3.0, lo[i].y)
		var b0 := Vector3(lo[j].x, -3.0, lo[j].y)
		var a1 := Vector3(o[i].x, 3.5, o[i].y)
		var b1 := Vector3(o[j].x, 3.5, o[j].y)
		var am := a0.lerp(a1, 0.5)
		var bm := b0.lerp(b1, 0.5)
		var out := Vector3((o[i].x + o[j].x) * 0.5, 0.0, (o[i].y + o[j].y) * 0.5 - 2.0)
		body.quad(a0, b0, bm, am, Color(0.35, 0.16, 0.13), out)
		body.quad(am, bm, b1, a1, hull, out)
	body.prism(o, 3.4, 3.5, deck)
	# надстройка
	body.box(Vector3(0, 5.5, -6.0), Vector3(7.0, 4.0, 11.0), hull.lightened(0.08))
	body.box(Vector3(0, 8.4, -8.0), Vector3(5.6, 1.8, 5.0), hull.lightened(0.12))
	body.box(Vector3(0, 8.7, -10.55), Vector3(5.0, 0.6, 0.1), Color(0.12, 0.16, 0.2))
	body.cylinder(Vector3(0, 7.5, 3.0), 1.5, 5.0, 10, hull.darkened(0.05))
	body.cylinder(Vector3(0, 11.6, 3.0), 1.55, 0.9, 10, TEAM_COLORS[team])
	body.box(Vector3(0, 4.8, 12.0), Vector3(5.0, 2.6, 8.0), hull.lightened(0.05))
	# мачта и флаг
	body.box(Vector3(0, 13.0, -6.0), Vector3(0.3, 10.0, 0.3), DARK)
	body.box(Vector3(0, 16.0, -6.0), Vector3(4.0, 0.25, 0.25), DARK)
	_flag(body, Vector3(0, 18.0, -6.0), 2.4, team, Vector2(2.2, 1.4))
	# опознавательная полоса на палубе
	body.box(Vector3(0, 3.6, 27.0), Vector3(6.0, 0.06, 2.0), TEAM_COLORS[team])
	# задняя башня (поворачивается вместе с передней — для вида)
	var aft := MeshB.new()
	aft.box(Vector3(0, 0.8, 0), Vector3(3.6, 1.6, 4.4), hull.lightened(0.04))
	aft.cylinder(Vector3(0, 1.1, -2.0), 0.22, 5.0, 8, DARK, Basis(Vector3.RIGHT, -PI * 0.5))
	var turret := MeshB.new()
	turret.cylinder(Vector3.ZERO, 2.0, 0.4, 10, hull.darkened(0.1))
	turret.frustum(Vector3(0, 0.4, 0.3), Vector2(3.8, 4.6), Vector2(3.0, 3.2), 1.6, hull.lightened(0.06))
	var gun := MeshB.new()
	gun.box(Vector3(0, 0, 0.3), Vector3(1.2, 0.8, 1.0), hull.darkened(0.15))
	gun.cylinder(Vector3(0, 0, 0), 0.22, 5.2, 8, DARK, Basis(Vector3.RIGHT, -PI * 0.5))
	# зенитные установки по бортам у надстройки
	for x in [-4.4, 4.4]:
		body.cylinder(Vector3(x, 3.5, 1.0), 1.1, 1.0, 8, hull.darkened(0.1))
		body.box(Vector3(x, 4.8, 0.6), Vector3(0.9, 0.7, 1.2), DARK)
		for dx in [-0.2, 0.2]:
			body.cylinder(Vector3(x + dx, 5.2, 0.2), 0.07, 2.0, 6, DARK, Basis(Vector3.RIGHT, -PI * 0.65))
	return {"body": body.commit(), "turret": turret.commit(), "gun": gun.commit(), "aft": aft.commit(),
		"turret_pos": Vector3(0, 3.5, -19.0), "gun_pos": Vector3(0, 1.4, -0.8), "aft_pos": Vector3(0, 3.5, 24.0),
		"muzzles": [Vector3(0, 0, -5.4)], "aa_muzzles": [Vector3(-4.4, 6.4, -1.5), Vector3(4.4, 6.4, -1.5)],
		"height": 14.0}

# ---------------------------------------------------------------- постройки

static func _building(variant: String, team: int) -> Dictionary:
	var b := MeshB.new()
	var roof := Color(0.40, 0.43, 0.40) if team == 0 else Color(0.47, 0.43, 0.36)
	var concrete := Color(0.62, 0.61, 0.57)
	var h := 10.0
	match variant:
		"hangar":
			b.box(Vector3(0, 1.0, 0), Vector3(30.4, 2.0, 32), concrete)
			b.arch(Vector3(0, 2.0, 0), 15.0, 32.0, 10, roof, Basis.IDENTITY, concrete.darkened(0.05))
			b.box(Vector3(0, 5.5, -16.15), Vector3(20, 11, 0.3), Color(0.22, 0.24, 0.25))
			b.box(Vector3(0, 17.06, 4), Vector3(6, 0.1, 6), TEAM_COLORS[team])
			_flag(b, Vector3(17.5, 0, -14), 9.0, team, Vector2(2.4, 1.5))
			h = 17.0
		"bunker":
			var c := Color(0.52, 0.51, 0.46)
			b.frustum(Vector3.ZERO, Vector2(15, 15), Vector2(10, 10), 4.5, c)
			b.box(Vector3(0, 3.0, -5.0), Vector3(6, 0.8, 0.6), Color(0.08, 0.08, 0.08))
			b.box(Vector3(0, 4.56, 0), Vector3(3.0, 0.1, 3.0), TEAM_COLORS[team])
			b.box(Vector3(0, 5.2, 2.5), Vector3(1.6, 1.4, 1.6), c.darkened(0.1))
			_flag(b, Vector3(4.5, 4.5, 3.5), 3.5, team)
			h = 6.0
		"fuel":
			var tank := Color(0.82, 0.82, 0.78)
			for p in [Vector3(-6, 0, -5), Vector3(6, 0, -5), Vector3(0, 0, 6)]:
				b.cylinder(p, 4.2, 8.0, 12, tank)
				b.cylinder(p + Vector3(0, 8.0, 0), 4.2, 0.9, 12, tank.darkened(0.1), Basis.IDENTITY, true, 2.5)
			b.box(Vector3(0, 0.6, -5), Vector3(8, 0.5, 0.5), DARK)
			b.box(Vector3(-3, 0.6, 0.5), Vector3(0.5, 0.5, 11), DARK)
			b.box(Vector3(0, 9.0, 6), Vector3(2.4, 0.12, 2.4), TEAM_COLORS[team])
			_flag(b, Vector3(10, 0, 5), 7.0, team)
			h = 9.5
		_:
			# склад: коробка с двускатной крышей
			b.box(Vector3(0, 3.5, 0), Vector3(28, 7, 14), Color(0.70, 0.66, 0.58))
			b.frustum(Vector3(0, 7.0, 0), Vector2(29, 15), Vector2(29, 0.6), 3.2, roof.darkened(0.05))
			b.box(Vector3(-6, 2.6, -7.05), Vector3(6, 5.2, 0.1), Color(0.28, 0.26, 0.24))
			b.box(Vector3(6, 2.6, -7.05), Vector3(6, 5.2, 0.1), Color(0.28, 0.26, 0.24))
			b.box(Vector3(0, 10.25, 0), Vector3(5, 0.1, 1.0), TEAM_COLORS[team])
			_flag(b, Vector3(15.5, 0, -6), 9.0, team, Vector2(2.2, 1.4))
			h = 10.5
	return {"body": b.commit(), "height": h}

static func clear_cache() -> void:
	_cache.clear()
