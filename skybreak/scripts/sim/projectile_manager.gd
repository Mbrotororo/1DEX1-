class_name ProjectileManager
extends Node3D
## Пули, ракеты, бомбы, ракеты В-В, зенитные снаряды и ловушки. Один на бой.
## Пули хранятся в упакованных массивах, трассеры рисуются одним MultiMesh.

enum { ROCKET, BOMB, MISSILE, FLAK, FLARE }

const GRAVITY := 9.81
const BULLET_LIFE := 2.5
const MAX_BULLETS := 8000
const CELL := 64.0
const CELL_PAD := 40.0
const ROCKET_LIFE := 5.0
const ROCKET_GRAVITY := 0.35
const BOMB_DRAG := 0.00016
const BOMB_LIFE := 90.0
const MISSILE_LIFE := 12.0
const MISSILE_MOTOR := 3.0
const MISSILE_BOOST := 320.0
const MISSILE_DRAG := 0.00009
const MISSILE_N := 3.5
const MISSILE_GIMBAL_DEG := 45.0
const FLARE_LIFE := 3.0
const FLARE_CONE_DEG := 25.0
const TRACER_SECONDS := 0.016
const COLOR_TRACER := Color(1.0, 0.78, 0.3)
const COLOR_TRACER_AA := Color(1.0, 0.36, 0.2)

var flare_chance: float = 0.6
var rng := RandomNumberGenerator.new()

# пули
var _bp := PackedVector3Array()
var _bv := PackedVector3Array()
var _bage := PackedFloat32Array()
var _bdmg := PackedFloat32Array()
var _bcal := PackedFloat32Array()
var _bown := PackedInt32Array()
var _bteam := PackedInt32Array()
var _btr := PackedByteArray()      # 0 — без трассера, 1 — трассер, 2 — трассер зенитки
var _bn: int = 0
var _tracers: int = 0
var _tracer_seq: int = 0
var _owner_ground: Dictionary = {}  # uid -> стрелок наземный

# снаряды
var _shells: Array = []
var _shell_id: int = 0

# цели на кадр: [obj, center, radius, kind(0 самолёт / 1 наземная), team, uid, velocity, armored]
var _targets: Array = []
var _grid: Dictionary = {}

var _ground_world = null
var _step_world = null
var _ground_key: String = ""
var _ground_max: float = 0.5

var _fx_budget: int = 0
var _hit_snd_cd: float = 0.0
var _inited: bool = false

var _tracer_mm: MultiMesh
var _tracer_mmi: MultiMeshInstance3D
var _tracer_buf := PackedFloat32Array()
var _tracer_cap: int = 0

var _m_rocket: StandardMaterial3D
var _m_missile: StandardMaterial3D
var _m_bomb: StandardMaterial3D
var _m_glow: StandardMaterial3D
var _m_flare: StandardMaterial3D
var _mesh_rocket: CylinderMesh
var _mesh_missile: CylinderMesh
var _mesh_bomb: CylinderMesh
var _mesh_nose: SphereMesh
var _mesh_fin: BoxMesh
var _mesh_glow: SphereMesh
var _mesh_flare: QuadMesh


class Shell extends RefCounted:
	var id: int = 0
	var kind: int = 0
	var pos: Vector3
	var vel: Vector3
	var age: float = 0.0
	var life: float = 5.0
	var damage: float = 0.0
	var radius: float = 0.0
	var owner: int = -1
	var team: int = 0
	var node: Node3D = null
	var flame: Node3D = null
	var trail: Node3D = null
	var target = null
	var decoy = null
	var guiding: bool = false
	var spec: Dictionary = {}
	var tested: Dictionary = {}
	var dead: bool = false


func _init() -> void:
	# после самолётов: их позиции уже обновлены в этом кадре
	process_physics_priority = 50
	rng.randomize()


func _ready() -> void:
	_ensure()


func _physics_process(delta: float) -> void:
	step(delta)


func _process(_delta: float) -> void:
	_render_tracers()


# ---------------------------------------------------------------- создание

func spawn_bullet(from: Vector3, velocity: Vector3, damage: float, caliber: float, owner_uid: int, team: int, tracer: bool) -> void:
	_ensure()
	if _bn >= MAX_BULLETS:
		return
	var i := _bn
	_bp[i] = from
	_bv[i] = velocity
	_bage[i] = 0.0
	_bdmg[i] = damage
	_bcal[i] = caliber
	_bown[i] = owner_uid
	_bteam[i] = team
	var tr := 0
	if tracer:
		var aa := _is_ground_owner(owner_uid)
		tr = 2 if aa else 1
		_tracers += 1
		_tracer_seq += 1
		if _tracer_seq % 4 == 0:
			_record_tracer(from, velocity, aa)
	_btr[i] = tr
	_bn += 1


func spawn_rocket(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
	_ensure()
	var s := _new_shell(ROCKET, from, velocity, damage, radius, owner_uid, team)
	s.life = ROCKET_LIFE
	s.node = _make_rocket_node()
	s.flame = s.node.get_node("Flame")
	_place(s)
	s.trail = _attach_trail(s.node, Vector3(0, 0, 0.9), "rocket")


func spawn_bomb(from: Vector3, velocity: Vector3, damage: float, radius: float, owner_uid: int, team: int) -> void:
	_ensure()
	var s := _new_shell(BOMB, from, velocity, damage, radius, owner_uid, team)
	s.life = BOMB_LIFE
	s.node = _make_bomb_node(clampf(sqrt(radius / 22.0), 0.8, 1.6))
	_place(s)


func spawn_missile(from: Vector3, velocity: Vector3, target, spec: Dictionary, owner_uid: int, team: int) -> void:
	_ensure()
	var s := _new_shell(MISSILE, from, velocity, float(spec.get("damage", 100.0)), float(spec.get("radius", 12.0)), owner_uid, team)
	s.life = MISSILE_LIFE
	s.spec = spec
	s.target = target
	s.guiding = target != null and is_instance_valid(target)
	s.node = _make_missile_node()
	s.flame = s.node.get_node("Flame")
	_place(s)
	s.trail = _attach_trail(s.node, Vector3(0, 0, 1.6), "missile")
	Sfx.play("missile_launch", from)


func spawn_flak(from: Vector3, velocity: Vector3, fuse_time: float, damage: float, radius: float, owner_uid: int, team: int) -> void:
	_ensure()
	var s := _new_shell(FLAK, from, velocity, damage, radius, owner_uid, team)
	s.life = maxf(0.05, fuse_time)


func spawn_flare(from: Vector3, velocity: Vector3, team: int) -> void:
	_ensure()
	var s := _new_shell(FLARE, from, velocity, 0.0, 0.0, -1, team)
	s.life = FLARE_LIFE
	s.node = _make_flare_node()
	_place(s)
	s.trail = _attach_trail(s.node, Vector3.ZERO, "flare")


func incoming_missiles(target) -> int:
	if target == null:
		return 0
	var n := 0
	for s in _shells:
		if s.kind == MISSILE and not s.dead and s.guiding and s.decoy == null and s.target == target:
			n += 1
	return n


func clear() -> void:
	for s in _shells:
		_free_shell(s)
	_shells.clear()
	_bn = 0
	_tracers = 0
	_tracer_seq = 0
	_owner_ground.clear()
	if _tracer_mm != null:
		_tracer_mm.visible_instance_count = 0


# ---------------------------------------------------------------- для тестов и отладки

func bullet_count() -> int:
	return _bn


func tracer_count() -> int:
	return _tracers


func bullet_positions() -> PackedVector3Array:
	return _bp.slice(0, _bn)


func shell_count(kind: int = -1) -> int:
	var n := 0
	for s in _shells:
		if not s.dead and (kind < 0 or s.kind == kind):
			n += 1
	return n


func missile_positions() -> Array:
	var out: Array = []
	for s in _shells:
		if s.kind == MISSILE and not s.dead:
			out.append(s.pos)
	return out


## Сброс кэша высот рельефа (если мир перестроен).
func invalidate_ground() -> void:
	_ground_world = null
	_ground_key = ""


# ---------------------------------------------------------------- шаг симуляции

func step(dt: float) -> void:
	if dt <= 0.0:
		return
	_ensure()
	_fx_budget = 8
	_hit_snd_cd = maxf(0.0, _hit_snd_cd - dt)
	_step_world = _world()
	_build_targets(dt)
	if _bn > 0:
		_step_bullets(dt)
	if not _shells.is_empty():
		_step_shells(dt)


func _build_targets(_dt: float) -> void:
	_targets.clear()
	_grid.clear()
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return
	var acs = b.get("aircraft")
	if acs is Array:
		for ac in acs:
			if ac == null or not is_instance_valid(ac) or not _alive(ac):
				continue
			var v := Vector3.ZERO
			if ac.has_method("velocity"):
				v = ac.velocity()
			_targets.append([ac, ac.global_position, float(ac.hit_radius()), 0, int(ac.team), int(ac.uid), v, false])
	var units = b.get("ground_units")
	if units is Array:
		for u in units:
			if u == null or not is_instance_valid(u) or not _alive(u):
				continue
			_targets.append([u, u.global_position, float(u.radius), 1, int(u.team), int(u.get("uid") if "uid" in u else -1), Vector3.ZERO, bool(u.get("armored") if "armored" in u else false)])
	for idx in _targets.size():
		var e: Array = _targets[idx]
		var c: Vector3 = e[1]
		var r: float = float(e[2]) + CELL_PAD
		var x0 := _cell(c.x - r)
		var x1 := _cell(c.x + r)
		var z0 := _cell(c.z - r)
		var z1 := _cell(c.z + r)
		for ix in range(x0, x1 + 1):
			for iz in range(z0, z1 + 1):
				var key := (ix + 32768) * 65536 + (iz + 32768)
				var cellv = _grid.get(key)
				if cellv == null:
					_grid[key] = [idx]
				else:
					cellv.append(idx)


func _cell(v: float) -> int:
	return clampi(floori(v / CELL), -30000, 30000)


func _step_bullets(dt: float) -> void:
	var g := GRAVITY * dt
	var have_targets := not _grid.is_empty()
	var ground_lim := _ground_limit()
	var i := _bn - 1
	while i >= 0:
		var p: Vector3 = _bp[i]
		var v: Vector3 = _bv[i]
		v.y -= g
		var np := p + v * dt
		var age := _bage[i] + dt
		var removed := false
		if have_targets:
			var m := (p + np) * 0.5
			var key := (_cell(m.x) + 32768) * 65536 + (_cell(m.z) + 32768)
			var cellv = _grid.get(key)
			if cellv != null:
				removed = _bullet_vs_targets(i, p, np, dt, cellv)
		if not removed and np.y < ground_lim:
			var h := _height(np.x, np.z)
			var surf := maxf(h, 0.0)
			if np.y <= surf:
				var hit := np
				var dy := p.y - np.y
				if dy > 0.001 and p.y > surf:
					hit = p.lerp(np, clampf((p.y - surf) / dy, 0.0, 1.0))
				hit.y = surf
				_impact_fx(hit, h < 0.0, _btr[i] != 0)
				removed = true
		if not removed and age >= BULLET_LIFE:
			removed = true
		if removed:
			_remove_bullet(i)
		else:
			_bp[i] = np
			_bv[i] = v
			_bage[i] = age
		i -= 1


func _bullet_vs_targets(i: int, p: Vector3, np: Vector3, dt: float, cellv: Array) -> bool:
	var team := _bteam[i]
	var own := _bown[i]
	for ei in cellv:
		var e: Array = _targets[ei]
		if int(e[4]) == team:
			continue
		var c: Vector3 = e[1]
		if int(e[3]) == 0:
			if int(e[5]) == own:
				continue
			# в системе цели: начало отрезка сдвигаем на её перемещение за кадр
			var tv: Vector3 = e[6]
			var a := p + tv * dt
			if _seg_sphere(a, np, c, float(e[2])) < 0.0:
				continue
			var ac = e[0]
			if not is_instance_valid(ac) or not _alive(ac):
				continue
			var res: Dictionary = ac.ray_hit(a, np)
			if not bool(res.get("hit", false)):
				continue
			ac.take_hit(res.get("local_point", Vector3.ZERO), _bdmg[i], own)
			var wp: Vector3 = res.get("world_point", np)
			if _fx_budget > 0:
				_fx_budget -= 1
				var fx = _fx()
				if fx != null:
					fx.hit_spark(wp)
			if _hit_snd_cd <= 0.0:
				_hit_snd_cd = 0.05
				Sfx.play("hit", wp)
			return true
		else:
			var t := _seg_sphere(p, np, c, float(e[2]))
			if t < 0.0:
				continue
			var u = e[0]
			if not is_instance_valid(u) or not _alive(u):
				continue
			var dmg := _bdmg[i]
			if bool(e[7]) and _bcal[i] < 12.0:
				dmg *= 0.1
			u.take_damage(dmg, own, false)
			_impact_fx(p.lerp(np, t), false, true)
			return true
	return false


func _remove_bullet(i: int) -> void:
	if _btr[i] != 0:
		_tracers -= 1
	var last := _bn - 1
	if i != last:
		_bp[i] = _bp[last]
		_bv[i] = _bv[last]
		_bage[i] = _bage[last]
		_bdmg[i] = _bdmg[last]
		_bcal[i] = _bcal[last]
		_bown[i] = _bown[last]
		_bteam[i] = _bteam[last]
		_btr[i] = _btr[last]
	_bn -= 1


func _impact_fx(pos: Vector3, water: bool, important: bool) -> void:
	if _fx_budget <= 0:
		return
	if not important and rng.randf() > 0.35:
		return
	var fx = _fx()
	if fx == null:
		return
	_fx_budget -= 1
	if water:
		fx.splash(pos, 0.15)
	else:
		fx.hit_spark(pos)


func _step_shells(dt: float) -> void:
	for s in _shells:
		if s.dead:
			continue
		match s.kind:
			ROCKET:
				_step_rocket(s, dt)
			BOMB:
				_step_bomb(s, dt)
			MISSILE:
				_step_missile(s, dt)
			FLAK:
				_step_flak(s, dt)
			FLARE:
				_step_flare(s, dt)
	var i := _shells.size() - 1
	while i >= 0:
		var s: Shell = _shells[i]
		if s.dead:
			_free_shell(s)
			_shells.remove_at(i)
		i -= 1


func _step_rocket(s: Shell, dt: float) -> void:
	s.age += dt
	var v := s.vel
	v.y -= GRAVITY * ROCKET_GRAVITY * dt
	var np := s.pos + v * dt
	# самолёты
	for e in _targets:
		if int(e[3]) != 0 or int(e[4]) == s.team or int(e[5]) == s.owner:
			continue
		var tv: Vector3 = e[6]
		var a := s.pos + tv * dt
		if _seg_sphere(a, np, e[1], float(e[2])) < 0.0:
			continue
		var ac = e[0]
		if not is_instance_valid(ac) or not _alive(ac):
			continue
		var res: Dictionary = ac.ray_hit(a, np)
		if bool(res.get("hit", false)):
			ac.take_hit(res.get("local_point", Vector3.ZERO), s.damage, s.owner)
			_explode(res.get("world_point", np), s.damage, s.radius, s.owner, s.team, ac, s.radius / 22.0, false)
			s.dead = true
			return
	# наземные цели
	var hit_t := _units_hit(s, s.pos, np)
	if hit_t >= 0.0:
		_explode(s.pos.lerp(np, hit_t), s.damage, s.radius, s.owner, s.team, null, s.radius / 22.0, false)
		s.dead = true
		return
	if _ground_hit(s, np, s.radius / 22.0):
		return
	s.pos = np
	s.vel = v
	if s.age >= s.life:
		_explode(np, s.damage, s.radius, s.owner, s.team, null, s.radius / 22.0, false)
		s.dead = true
		return
	_orient(s)


func _step_bomb(s: Shell, dt: float) -> void:
	s.age += dt
	var v := s.vel
	v.y -= GRAVITY * dt
	v -= v * v.length() * BOMB_DRAG * dt
	var np := s.pos + v * dt
	var hit_t := _units_hit(s, s.pos, np)
	if hit_t >= 0.0:
		_explode(s.pos.lerp(np, hit_t), s.damage, s.radius, s.owner, s.team, null, s.radius / 22.0, false)
		s.dead = true
		return
	if _ground_hit(s, np, s.radius / 22.0):
		return
	s.pos = np
	s.vel = v
	if s.age >= s.life:
		s.dead = true
		return
	_orient(s)


func _step_missile(s: Shell, dt: float) -> void:
	s.age += dt
	var spec_speed := float(s.spec.get("speed", 600.0))
	var speed := s.vel.length()
	var dir := s.vel / speed if speed > 0.1 else Vector3.FORWARD
	if s.age < MISSILE_MOTOR:
		speed = move_toward(speed, spec_speed, MISSILE_BOOST * dt)
	else:
		speed = maxf(60.0, speed - (MISSILE_DRAG * speed * speed + 4.0) * dt)
		if s.trail != null:
			if is_instance_valid(s.trail):
				s.trail.queue_free()
			s.trail = null
		if s.flame != null and is_instance_valid(s.flame):
			s.flame.visible = false

	# головка самонаведения
	var seek_pos := Vector3.ZERO
	var seek_vel := Vector3.ZERO
	var has_seek := false
	if s.decoy != null:
		if s.decoy.dead:
			s.decoy = null
			s.guiding = false
			s.target = null
		else:
			seek_pos = s.decoy.pos
			seek_vel = s.decoy.vel
			has_seek = true
	elif s.guiding:
		if s.target != null and is_instance_valid(s.target) and _alive(s.target):
			seek_pos = s.target.global_position
			seek_vel = s.target.velocity() if s.target.has_method("velocity") else Vector3.ZERO
			has_seek = true
		else:
			s.guiding = false
			s.target = null
	if has_seek:
		var los := seek_pos - s.pos
		var dist := los.length()
		if dist > 0.5 and dir.dot(los / dist) < cos(deg_to_rad(MISSILE_GIMBAL_DEG)):
			s.guiding = false
			s.decoy = null
			s.target = null
			has_seek = false
		elif dist > 0.5:
			if s.decoy == null:
				_check_flares(s, los, dist)
				if s.decoy != null:
					seek_pos = s.decoy.pos
					seek_vel = s.decoy.vel
					los = seek_pos - s.pos
					dist = maxf(0.5, los.length())
			# пропорциональное наведение
			var rel_v := seek_vel - s.vel
			var omega := los.cross(rel_v) / maxf(dist * dist, 1.0)
			var acc := omega.cross(dir * speed) * MISSILE_N
			var want := dir * speed + acc * dt
			if want.length_squared() > 1e-6:
				var new_dir := want.normalized()
				var ang := dir.angle_to(new_dir)
				var turn := deg_to_rad(float(s.spec.get("turn_deg", 20.0))) * clampf(speed / (0.6 * spec_speed), 0.3, 1.0)
				var lim := turn * dt
				if ang > lim and ang > 1e-5:
					new_dir = dir.slerp(new_dir, lim / ang).normalized()
				dir = new_dir
	var v := dir * speed
	if s.age >= MISSILE_MOTOR:
		v.y -= GRAVITY * 0.5 * dt
	var np := s.pos + v * dt

	# неконтактный взрыватель
	var fuse := float(s.radius) * 0.6
	var fuse_obj_pos := Vector3.ZERO
	var fuse_obj_vel := Vector3.ZERO
	var fuse_on := false
	if s.decoy != null and not s.decoy.dead:
		fuse_obj_pos = s.decoy.pos
		fuse_obj_vel = s.decoy.vel
		fuse_on = true
	elif s.guiding and s.target != null and is_instance_valid(s.target):
		fuse_obj_pos = s.target.global_position
		fuse_obj_vel = s.target.velocity() if s.target.has_method("velocity") else Vector3.ZERO
		fuse_on = true
	if fuse_on:
		var ra := s.pos - (fuse_obj_pos - fuse_obj_vel * dt)
		var rb := np - fuse_obj_pos
		var u := _closest_t(ra, rb)
		var d := ra.lerp(rb, u).length()
		if d <= fuse:
			_explode(s.pos.lerp(np, u), s.damage, s.radius, s.owner, s.team, null, s.radius / 22.0, false)
			s.dead = true
			return
	if _ground_hit(s, np, s.radius / 22.0):
		return
	s.pos = np
	s.vel = v
	if s.age >= s.life:
		_explode(np, s.damage, s.radius, s.owner, s.team, null, s.radius / 30.0, false)
		s.dead = true
		return
	_orient(s)


func _check_flares(s: Shell, los: Vector3, dist: float) -> void:
	var cos_c := cos(deg_to_rad(FLARE_CONE_DEG))
	var ldir := los / dist
	for f in _shells:
		if f.kind != FLARE or f.dead or f.team == s.team:
			continue
		if s.tested.has(f.id):
			continue
		var to: Vector3 = f.pos - s.pos
		var fd := to.length()
		if fd >= dist or fd < 0.5:
			continue
		if ldir.dot(to / fd) < cos_c:
			continue
		s.tested[f.id] = true
		if rng.randf() < flare_chance:
			s.decoy = f
			return


func _step_flak(s: Shell, dt: float) -> void:
	s.age += dt
	var v := s.vel
	v.y -= GRAVITY * dt
	var np := s.pos + v * dt
	if np.y <= maxf(_height(np.x, np.z), 0.0):
		s.dead = true
		return
	s.pos = np
	s.vel = v
	if s.age >= s.life:
		for e in _targets:
			if int(e[3]) != 0 or int(e[4]) == s.team:
				continue
			var ac = e[0]
			if not is_instance_valid(ac) or not _alive(ac):
				continue
			if (ac.global_position as Vector3).distance_to(np) <= s.radius + float(e[2]):
				ac.take_splash(np, s.damage, s.radius, s.owner)
		var fx = _fx()
		if fx != null:
			fx.smoke_puff(np, clampf(s.radius / 14.0, 0.5, 3.0))
		Sfx.play("flak", np)
		s.dead = true


func _step_flare(s: Shell, dt: float) -> void:
	s.age += dt
	var v := s.vel
	v.y -= GRAVITY * dt
	v *= exp(-1.4 * dt)
	var np := s.pos + v * dt
	if np.y <= maxf(_height(np.x, np.z), 0.0) or s.age >= s.life:
		s.dead = true
		return
	s.pos = np
	s.vel = v
	if s.node != null:
		var k := (1.0 - s.age / s.life) * rng.randf_range(0.8, 1.15) + 0.25
		s.node.transform = Transform3D(Basis.IDENTITY.scaled(Vector3(k, k, k)), np)


func _units_hit(s: Shell, a: Vector3, b: Vector3) -> float:
	var best := -1.0
	for e in _targets:
		if int(e[3]) != 1 or int(e[4]) == s.team:
			continue
		var t := _seg_sphere(a, b, e[1], float(e[2]))
		if t >= 0.0 and (best < 0.0 or t < best):
			best = t
	return best


func _ground_hit(s: Shell, np: Vector3, size: float) -> bool:
	var h := _height(np.x, np.z)
	var surf := maxf(h, 0.0)
	if np.y > surf:
		return false
	var hit := np
	var dy := s.pos.y - np.y
	if dy > 0.001 and s.pos.y > surf:
		hit = s.pos.lerp(np, clampf((s.pos.y - surf) / dy, 0.0, 1.0))
	hit.y = surf
	_explode(hit, s.damage, s.radius, s.owner, s.team, null, size, h < 0.0)
	s.dead = true
	return true


func _explode(pos: Vector3, damage: float, radius: float, owner: int, team: int, skip, size: float, water: bool) -> void:
	for e in _targets:
		if int(e[4]) == team:
			continue
		var obj = e[0]
		if obj == skip or not is_instance_valid(obj) or not _alive(obj):
			continue
		var c: Vector3 = e[1]
		if int(e[3]) == 0:
			if (obj.global_position as Vector3).distance_to(pos) <= radius + float(e[2]):
				obj.take_splash(pos, damage, radius, owner)
		else:
			var d := maxf(0.0, c.distance_to(pos) - float(e[2]))
			if d <= radius:
				obj.take_damage(damage * (1.0 - 0.75 * d / maxf(radius, 0.1)), owner, true)
	var fx = _fx()
	if fx == null:
		return
	if water:
		fx.splash(pos, maxf(0.4, size * 1.4))
		fx.explosion(pos + Vector3(0, 0.5, 0), size * 0.4)
	else:
		fx.explosion(pos, size)


# ---------------------------------------------------------------- вспомогательное

func _new_shell(kind: int, from: Vector3, velocity: Vector3, damage: float, radius: float, owner: int, team: int) -> Shell:
	var s := Shell.new()
	_shell_id += 1
	s.id = _shell_id
	s.kind = kind
	s.pos = from
	s.vel = velocity
	s.damage = damage
	s.radius = radius
	s.owner = owner
	s.team = team
	_shells.append(s)
	return s


func _free_shell(s: Shell) -> void:
	s.dead = true
	if s.node != null and is_instance_valid(s.node):
		s.node.queue_free()
	s.node = null
	s.trail = null
	s.flame = null


func _place(s: Shell) -> void:
	if s.node == null:
		return
	add_child(s.node)
	_orient(s)


func _orient(s: Shell) -> void:
	if s.node == null:
		return
	var sp := s.vel.length()
	if sp < 0.1:
		s.node.transform = Transform3D(s.node.transform.basis, s.pos)
		return
	var d := s.vel / sp
	var b := Basis.looking_at(d, Vector3.UP if absf(d.y) < 0.98 else Vector3.RIGHT)
	s.node.transform = Transform3D(b, s.pos)


func _attach_trail(node: Node3D, local: Vector3, kind: String) -> Node3D:
	var fx = _fx()
	if fx == null:
		return null
	if fx.has_method("attach_exhaust_trail"):
		return fx.attach_exhaust_trail(node, local, kind)
	return fx.attach_smoke(node, local, false)


func _fx():
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return null
	var fx = b.get("fx")
	if fx == null or not is_instance_valid(fx):
		return null
	return fx


func _world():
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return null
	var w = b.get("world")
	if w == null or not is_instance_valid(w):
		return null
	return w


func _height(x: float, z: float) -> float:
	var w = _step_world
	if w == null or not is_instance_valid(w):
		return 0.0
	return float(w.height_at(x, z))


func _ground_limit() -> float:
	# выше этой высоты рельеф точно не достаёт: пули там не проверяют землю
	var w = _world()
	if w == null:
		return 0.5
	var key := ""
	var m = w.get("map")
	if m is Dictionary:
		key = str(m.get("id", ""))
	if w == _ground_world and key == _ground_key:
		return _ground_max
	_ground_world = w
	_ground_key = key
	var hs := 5200.0
	if w.has_method("half_size"):
		hs = float(w.half_size()) + 200.0
	var n := 64
	var mx := 0.0
	for ix in n + 1:
		for iz in n + 1:
			var x := -hs + 2.0 * hs * float(ix) / n
			var z := -hs + 2.0 * hs * float(iz) / n
			mx = maxf(mx, float(w.height_at(x, z)))
	_ground_max = mx + 120.0
	return _ground_max


func _alive(obj) -> bool:
	if "alive" in obj:
		return bool(obj.get("alive"))
	return true


func _is_ground_owner(uid: int) -> bool:
	if _owner_ground.has(uid):
		return _owner_ground[uid]
	var b = Game.battle
	if b == null or not is_instance_valid(b) or not b.has_method("get_entity"):
		return false
	var ent = b.get_entity(uid)
	if ent == null or not is_instance_valid(ent):
		return false
	var ground: bool = "armored" in ent
	_owner_ground[uid] = ground
	return ground


func _record_tracer(from: Vector3, velocity: Vector3, aa: bool) -> void:
	var b = Game.battle
	if b == null or not is_instance_valid(b):
		return
	var rec = b.get("recorder")
	if rec == null or not is_instance_valid(rec):
		return
	var to := from + velocity * 0.35
	var d := {"from": [snappedf(from.x, 0.1), snappedf(from.y, 0.1), snappedf(from.z, 0.1)],
		"to": [snappedf(to.x, 0.1), snappedf(to.y, 0.1), snappedf(to.z, 0.1)]}
	if aa:
		d["aa"] = true
	rec.event("tracer", d)


static func _seg_sphere(a: Vector3, b: Vector3, c: Vector3, r: float) -> float:
	# первая точка входа отрезка a-b в сферу (0..1) или -1
	var d := b - a
	var f := a - c
	var cc := f.dot(f) - r * r
	if cc <= 0.0:
		return 0.0
	var aa := d.dot(d)
	if aa < 1e-9:
		return -1.0
	var bb := 2.0 * f.dot(d)
	var disc := bb * bb - 4.0 * aa * cc
	if disc < 0.0:
		return -1.0
	var t := (-bb - sqrt(disc)) / (2.0 * aa)
	if t < 0.0 or t > 1.0:
		return -1.0
	return t


static func _closest_t(a: Vector3, b: Vector3) -> float:
	# параметр точки отрезка a-b, ближайшей к началу координат
	var d := b - a
	var dd := d.dot(d)
	if dd < 1e-9:
		return 0.0
	return clampf(-a.dot(d) / dd, 0.0, 1.0)


# ---------------------------------------------------------------- графика

func _ensure() -> void:
	if _inited:
		return
	_inited = true
	_bp.resize(MAX_BULLETS)
	_bv.resize(MAX_BULLETS)
	_bage.resize(MAX_BULLETS)
	_bdmg.resize(MAX_BULLETS)
	_bcal.resize(MAX_BULLETS)
	_bown.resize(MAX_BULLETS)
	_bteam.resize(MAX_BULLETS)
	_btr.resize(MAX_BULLETS)

	var tm := StandardMaterial3D.new()
	tm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	tm.vertex_color_use_as_albedo = true
	tm.disable_receive_shadows = true
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)
	_tracer_mm = MultiMesh.new()
	_tracer_mm.transform_format = MultiMesh.TRANSFORM_3D
	_tracer_mm.use_colors = true
	_tracer_mm.mesh = box
	_tracer_mmi = MultiMeshInstance3D.new()
	_tracer_mmi.name = "Tracers"
	_tracer_mmi.multimesh = _tracer_mm
	_tracer_mmi.material_override = tm
	_tracer_mmi.top_level = true
	_tracer_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_tracer_mmi.custom_aabb = AABB(Vector3(-60000, -2000, -60000), Vector3(120000, 40000, 120000))
	add_child(_tracer_mmi)
	_grow_tracers(512)

	_m_rocket = _solid(Color(0.55, 0.57, 0.55))
	_m_missile = _solid(Color(0.86, 0.87, 0.85))
	_m_bomb = _solid(Color(0.24, 0.27, 0.2))
	_m_glow = StandardMaterial3D.new()
	_m_glow.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_m_glow.albedo_color = Color(1.0, 0.75, 0.4)
	_m_flare = StandardMaterial3D.new()
	_m_flare.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_m_flare.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_m_flare.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_m_flare.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_m_flare.billboard_keep_scale = true
	_m_flare.albedo_color = Color(1.0, 0.92, 0.75)
	_m_flare.albedo_texture = _glow_texture()
	_mesh_rocket = _cyl(0.07, 1.6)
	_mesh_missile = _cyl(0.09, 2.9)
	_mesh_bomb = _cyl(0.17, 1.3)
	_mesh_nose = SphereMesh.new()
	_mesh_nose.radius = 0.17
	_mesh_nose.height = 0.5
	_mesh_nose.radial_segments = 8
	_mesh_nose.rings = 4
	_mesh_fin = BoxMesh.new()
	_mesh_fin.size = Vector3(1, 1, 1)
	_mesh_glow = SphereMesh.new()
	_mesh_glow.radius = 0.5
	_mesh_glow.height = 1.0
	_mesh_glow.radial_segments = 8
	_mesh_glow.rings = 4
	_mesh_flare = QuadMesh.new()
	_mesh_flare.size = Vector2(4.0, 4.0)


func _solid(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.6
	m.metallic = 0.2
	return m


func _cyl(r: float, h: float) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = r
	m.bottom_radius = r
	m.height = h
	m.radial_segments = 8
	m.rings = 1
	return m


func _glow_texture() -> Texture2D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.2, 0.5, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 0.95, 0.8, 0.9), Color(1, 0.7, 0.35, 0.3), Color(1, 0.5, 0.2, 0)])
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 64
	t.height = 64
	return t


func _mesh_child(parent: Node3D, mesh: Mesh, mat: Material, xf: Transform3D, node_name: String = "") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.transform = xf
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if node_name != "":
		mi.name = node_name
	parent.add_child(mi)
	return mi


func _along_z(len_scale: float = 1.0) -> Basis:
	# цилиндр по Y кладём вдоль Z
	return Basis(Vector3.RIGHT, PI * 0.5).scaled(Vector3(1, len_scale, 1))


func _make_rocket_node() -> Node3D:
	var n := Node3D.new()
	n.top_level = true
	_mesh_child(n, _mesh_rocket, _m_rocket, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO))
	_mesh_child(n, _mesh_glow, _m_glow, Transform3D(Basis.IDENTITY.scaled(Vector3(0.28, 0.28, 0.7)), Vector3(0, 0, 0.95)), "Flame")
	return n


func _make_missile_node() -> Node3D:
	var n := Node3D.new()
	n.top_level = true
	_mesh_child(n, _mesh_missile, _m_missile, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO))
	_mesh_child(n, _mesh_fin, _m_missile, Transform3D(Basis.IDENTITY.scaled(Vector3(0.75, 0.025, 0.35)), Vector3(0, 0, 1.25)))
	_mesh_child(n, _mesh_fin, _m_missile, Transform3D(Basis.IDENTITY.scaled(Vector3(0.025, 0.75, 0.35)), Vector3(0, 0, 1.25)))
	_mesh_child(n, _mesh_fin, _m_missile, Transform3D(Basis.IDENTITY.scaled(Vector3(0.4, 0.02, 0.18)), Vector3(0, 0, -1.0)))
	_mesh_child(n, _mesh_fin, _m_missile, Transform3D(Basis.IDENTITY.scaled(Vector3(0.02, 0.4, 0.18)), Vector3(0, 0, -1.0)))
	_mesh_child(n, _mesh_glow, _m_glow, Transform3D(Basis.IDENTITY.scaled(Vector3(0.35, 0.35, 0.9)), Vector3(0, 0, 1.75)), "Flame")
	return n


func _make_bomb_node(k: float) -> Node3D:
	var n := Node3D.new()
	n.top_level = true
	var body := Node3D.new()
	body.scale = Vector3(k, k, k)
	n.add_child(body)
	_mesh_child(body, _mesh_bomb, _m_bomb, Transform3D(Basis(Vector3.RIGHT, PI * 0.5), Vector3.ZERO))
	_mesh_child(body, _mesh_nose, _m_bomb, Transform3D(Basis.IDENTITY, Vector3(0, 0, -0.65)))
	_mesh_child(body, _mesh_nose, _m_bomb, Transform3D(Basis.IDENTITY.scaled(Vector3(0.8, 0.8, 1.6)), Vector3(0, 0, 0.75)))
	_mesh_child(body, _mesh_fin, _m_bomb, Transform3D(Basis.IDENTITY.scaled(Vector3(0.62, 0.03, 0.3)), Vector3(0, 0, 1.05)))
	_mesh_child(body, _mesh_fin, _m_bomb, Transform3D(Basis.IDENTITY.scaled(Vector3(0.03, 0.62, 0.3)), Vector3(0, 0, 1.05)))
	return n


func _make_flare_node() -> Node3D:
	var n := Node3D.new()
	n.top_level = true
	_mesh_child(n, _mesh_flare, _m_flare, Transform3D.IDENTITY)
	return n


func _grow_tracers(cap: int) -> void:
	_tracer_cap = cap
	_tracer_mm.instance_count = cap
	_tracer_mm.visible_instance_count = 0
	_tracer_buf.resize(cap * 16)


func _render_tracers() -> void:
	if _tracer_mm == null:
		return
	if _tracers <= 0 or _bn == 0:
		if _tracer_mm.visible_instance_count != 0:
			_tracer_mm.visible_instance_count = 0
		return
	if _tracers > _tracer_cap:
		var cap := _tracer_cap
		while cap < _tracers:
			cap *= 2
		_grow_tracers(mini(cap, MAX_BULLETS))
	var cam: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null
	var cam_pos := cam.global_position if cam != null else Vector3(0, 10000, 0)
	var ahead := Engine.get_physics_interpolation_fraction() / float(Engine.physics_ticks_per_second)
	var count := 0
	var buf := _tracer_buf
	for i in _bn:
		var tr := _btr[i]
		if tr == 0:
			continue
		if count >= _tracer_cap:
			break
		var v: Vector3 = _bv[i]
		var sp := v.length()
		if sp < 1.0:
			continue
		var dir := v / sp
		var head: Vector3 = _bp[i] + v * ahead
		var length := minf(sp * TRACER_SECONDS, (_bage[i] + ahead) * sp)
		var to_cam := cam_pos - head
		var dist := to_cam.length()
		var w := maxf(0.14, dist * 0.0017)
		length = maxf(length, w * 3.0)
		var x := dir.cross(to_cam)
		if x.length_squared() < 1e-6:
			x = dir.cross(Vector3.UP if absf(dir.y) < 0.98 else Vector3.RIGHT)
		x = x.normalized()
		var y := x.cross(dir)
		var o := count * 16
		var bx := x * w
		var by := y * w
		var bz := dir * length
		var c := head - dir * (length * 0.5)
		buf[o] = bx.x
		buf[o + 1] = by.x
		buf[o + 2] = bz.x
		buf[o + 3] = c.x
		buf[o + 4] = bx.y
		buf[o + 5] = by.y
		buf[o + 6] = bz.y
		buf[o + 7] = c.y
		buf[o + 8] = bx.z
		buf[o + 9] = by.z
		buf[o + 10] = bz.z
		buf[o + 11] = c.z
		var col := COLOR_TRACER if tr == 1 else COLOR_TRACER_AA
		buf[o + 12] = col.r
		buf[o + 13] = col.g
		buf[o + 14] = col.b
		buf[o + 15] = 1.0
		count += 1
	_tracer_buf = buf
	_tracer_mm.buffer = _tracer_buf
	_tracer_mm.visible_instance_count = count
