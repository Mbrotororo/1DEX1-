class_name Aircraft
extends Node3D
## Самолёт в бою: связывает пилота, модель полёта, повреждения, оружие, визуал и звук.
## Порядок кадра: управление → fm.step → dmg.update → weapons.update → трансформ → визуал → звук → проверки.

const PartMover = preload("res://scripts/aircraft/aircraft_part.gd")

signal destroyed(aircraft, killer_uid: int, reason: String)
signal serviced(aircraft)            # закончил ремонт и перезарядку на своём аэродроме

const BORDER := 5200.0               # за этой координатой отсчитывается время до гибели
const BORDER_TIME := 10.0
const KILL_CREDIT_TIME := 20.0       # попадание не старше этого засчитывается как сбитие
const WRECK_MAX_TIME := 30.0         # обломки, которые так и не упали, взрываются в воздухе
const FREE_DELAY := 3.0              # после взрыва узел живёт ещё столько
const SERVICE_SPEED := 8.0
const ENGINE_SOUND_BOTS := 6         # звук двигателя только у ближайших к камере ботов
const TRAIL_G_ON := 4.0
const TRAIL_G_OFF := 3.6
const HIT_SOUND_GAP := 0.12
const SPARK_GAP := 0.05

var uid: int = 0
var team: int = 0
var def_id: String = ""
var def: Dictionary = {}
var callsign: String = ""
var camo_id: String = "factory"
var is_player: bool = false
var alive: bool = true
var fm: FlightModel
var dmg: DamageModel
var weapons: WeaponSystem
var pilot = null                     # PlayerPilot или BotPilot (у него есть get_controls)
var model: Node3D
var controls: Dictionary = {}        # последние управляющие команды
var in_cloud: bool = false
var servicing: bool = false          # стоит на своей полосе, идёт ремонт/перезарядка
var service_progress: float = 0.0    # 0..1

# дополнительно (только чтение снаружи)
var border_time: float = 0.0         # сколько секунд подряд за границей карты
var service_armed: bool = false      # обслуживание доступно (был в воздухе после спавна/прошлого обслуживания)
var death_reason: String = ""
var killer_uid: int = -1
var exploded: bool = false           # обломки упали и взорвались, узел скоро удалится
var engine_sound_on: bool = false

static var _registry: Array = []

var _clock: float = 0.0
var _gear_input_prev: bool = false
var _ext_input_prev: bool = false
var _air_time: float = 0.0
var _svc_phase: int = 0
var _svc_r0: float = 1.0
var _svc_a0: float = 1.0
var _wreck_time: float = 0.0
var _free_timer: float = -1.0
var _spin_sign: float = 1.0
var _fire_fx: Node3D = null
var _smoke_fx: Node3D = null
var _trail_fx: Array = []
var _lost: Dictionary = {}
var _engine_player: AudioStreamPlayer3D = null
var _snd_timer: float = 0.0
var _last_hit_snd: float = -10.0
var _last_spark: float = -10.0
var _ground_tilt: float = 0.0
var _tilt_max: float = 0.0
var _tilt_pivot: Vector3 = Vector3.ZERO
var _markers: Dictionary = {}


func _enter_tree() -> void:
	if not _registry.has(self):
		_registry.append(self)


func _exit_tree() -> void:
	_registry.erase(self)


# ---------------------------------------------------------------- настройка

func setup(p_def_id: String, p_team: int, p_uid: int, p_callsign: String, p_camo: String, spawn: Dictionary, opts: Dictionary) -> void:
	def_id = p_def_id
	team = p_team
	uid = p_uid
	callsign = p_callsign
	camo_id = p_camo if p_camo != "" else "factory"
	def = Data.plane(def_id)
	is_player = bool(opts.get("is_player", false))
	name = "Aircraft_%d" % uid
	var on_ground := bool(spawn.get("on_ground", false))
	var pos: Vector3 = spawn.get("pos", Vector3.ZERO)
	var bas: Basis = spawn.get("basis", Basis.IDENTITY)
	var spd: float = float(spawn.get("speed", 0.0))

	if model != null and is_instance_valid(model):
		model.queue_free()
	_clear_fx()
	_lost.clear()
	model = AircraftMeshBuilder.build(def, Data.camo(def_id, camo_id))
	model.name = "Model"
	add_child(model)
	_cache_markers()

	fm = FlightModel.new()
	fm.assist = bool(opts.get("assist", true))
	fm.setup(def, pos, bas, spd, on_ground)
	if on_ground:
		fm.gear_down = true
		fm.on_ground = true
	dmg = DamageModel.new()
	dmg.setup(def, bool(opts.get("hardcore", false)))
	dmg.module_damaged.connect(_on_module_damaged)
	weapons = WeaponSystem.new()
	weapons.setup(def)

	controls = Data.empty_controls()
	if on_ground:
		controls.throttle = 0.0
	alive = true
	exploded = false
	servicing = false
	service_progress = 0.0
	service_armed = not on_ground
	border_time = 0.0
	death_reason = ""
	killer_uid = -1
	_air_time = 0.0
	_wreck_time = 0.0
	_free_timer = -1.0
	_gear_input_prev = false
	_ext_input_prev = false
	_spin_sign = -1.0 if (uid % 2) == 0 else 1.0
	_tilt_max = float(model.get_meta("ground_pitch", 0.0)) if model.has_meta("ground_pitch") else 0.0
	var mc = model.get_meta("main_contact", Vector3.ZERO) if model.has_meta("main_contact") else Vector3.ZERO
	_tilt_pivot = mc if mc is Vector3 else Vector3.ZERO
	_ground_tilt = _tilt_max if on_ground else 0.0
	_sync_transform()
	_update_visuals(0.0)


func set_pilot(p) -> void:
	pilot = p
	# бота держим дочерним узлом, чтобы он удалился вместе с самолётом;
	# пилота игрока не трогаем — он один на бой и переживает респаун
	if p is Node and (p as Node).get_parent() == null and not (p is PlayerPilot):
		add_child(p)
	if p is PlayerPilot and alive:
		p.reset_aim(self)


func _cache_markers() -> void:
	_markers.clear()
	if model == null:
		return
	for n in ["Engine0", "Engine1", "Cockpit", "WingTipL", "WingTipR"]:
		var m := model.get_node_or_null(n) as Node3D
		if m != null:
			_markers[n] = m.position


func marker_pos(marker: String, fallback: Vector3 = Vector3.ZERO) -> Vector3:
	return _markers.get(marker, fallback)


# ---------------------------------------------------------------- кадр

func _physics_process(delta: float) -> void:
	if fm == null or delta <= 0.0:
		return
	var dt := minf(delta, 0.1)
	_clock += dt
	if exploded:
		_free_timer -= dt
		if _free_timer <= 0.0:
			queue_free()
		return

	var surface := _surface()
	# 1. управление
	if alive:
		var c = null
		if pilot != null and is_instance_valid(pilot) and pilot.has_method("get_controls"):
			c = pilot.get_controls(self, dt)
		controls = c if c is Dictionary else _idle_controls()
	else:
		controls = _wreck_controls()
	var ctrl: Dictionary = controls.duplicate()
	# шасси и тушение — по фронту нажатия
	var gear_in := bool(ctrl.get("gear_toggle", false))
	if alive and gear_in and not _gear_input_prev and not fm.on_ground:
		fm.gear_down = not fm.gear_down
		if is_player:
			Sfx.play("gear")
	_gear_input_prev = gear_in
	ctrl["gear_toggle"] = false   # модель полёта не должна переключать второй раз
	var ext_in := bool(ctrl.get("extinguish", false))
	if alive and ext_in and not _ext_input_prev:
		dmg.try_extinguish()
	_ext_input_prev = ext_in

	# 2-4. физика, повреждения, оружие
	fm.step(dt, ctrl, surface)
	dmg.update(dt, fm)
	if not alive:
		_wreck_modifiers()
	weapons.update(dt, self, ctrl if alive else Data.empty_controls())

	# 5-7. трансформ, визуал, звук
	_sync_transform()
	_update_visuals(dt)
	_update_engine_sound(dt)

	# 8. состояние
	in_cloud = _cloud_density() > 0.5
	if alive:
		_check_border(dt)
		_update_service(dt, surface)
		_check_death()
	else:
		_update_wreck(dt, surface)


func _idle_controls() -> Dictionary:
	var c := Data.empty_controls()
	if fm != null and fm.on_ground:
		c.throttle = 0.0
		c.brake = true
	return c


func _wreck_controls() -> Dictionary:
	var c := Data.empty_controls()
	c.throttle = 0.0
	c.pitch = -0.5
	c.roll = 0.7 * _spin_sign
	c.yaw = 0.3 * _spin_sign
	return c


## Обломки: без тяги, рули «болтаются» так, чтобы самолёт ушёл в спираль вниз.
func _wreck_modifiers() -> void:
	fm.thrust_factor = 0.0
	fm.afterburner = false
	if not dmg.tail_lost:
		fm.pitch_authority = maxf(fm.pitch_authority, 0.7)
		fm.yaw_authority = maxf(fm.yaw_authority, 0.5)
	fm.roll_authority = maxf(fm.roll_authority, 0.6)
	fm.extra_drag = maxf(fm.extra_drag, 0.03)


func _sync_transform() -> void:
	var t := Transform3D(fm.basis.orthonormalized(), fm.pos)
	if is_inside_tree():
		global_transform = t
	else:
		transform = t


func _xform() -> Transform3D:
	if fm != null:
		return Transform3D(fm.basis.orthonormalized(), fm.pos)
	return global_transform if is_inside_tree() else transform


# ---------------------------------------------------------------- окружение (через Game.battle)

func _battle():
	var b = Game.battle
	if b != null and is_instance_valid(b):
		return b
	return null


func _world():
	var b = _battle()
	if b == null or not ("world" in b):
		return null
	var w = b.get("world")
	if w != null and is_instance_valid(w):
		return w
	return null


func _fx():
	var b = _battle()
	if b == null or not ("fx" in b):
		return null
	var f = b.get("fx")
	if f != null and is_instance_valid(f):
		return f
	return null


func _now() -> float:
	var b = _battle()
	if b != null and "elapsed" in b:
		var e = b.get("elapsed")
		if e is float or e is int:
			return float(e)
	return _clock


func _surface() -> Dictionary:
	var w = _world()
	if w != null and w.has_method("surface_at"):
		var s = w.surface_at(fm.pos.x, fm.pos.z)
		if s is Dictionary:
			return s
	return {"height": 0.0, "kind": "ground", "team": -1, "flat": true}


func _cloud_density() -> float:
	var w = _world()
	if w != null and w.has_method("cloud_density_at"):
		return float(w.cloud_density_at(fm.pos))
	return 0.0


func _ground_height(x: float, z: float) -> float:
	var w = _world()
	if w != null and w.has_method("height_at"):
		return float(w.height_at(x, z))
	return 0.0


# ---------------------------------------------------------------- попадания

func take_hit(local_point: Vector3, damage: float, attacker_uid: int) -> void:
	if not alive or dmg == null:
		return
	dmg.apply_hit(local_point, damage, attacker_uid, _now())
	if _clock - _last_spark >= SPARK_GAP:
		_last_spark = _clock
		var f = _fx()
		if f != null:
			f.hit_spark(_xform() * local_point)


func take_splash(world_pos: Vector3, damage: float, radius: float, attacker_uid: int) -> void:
	if not alive or dmg == null or damage <= 0.0:
		return
	var d := world_pos.distance_to(_xform().origin)
	# центр самолёта — не точка: часть корпуса ближе к разрыву
	var eff_d := maxf(0.0, d - hit_radius() * 0.5)
	var k := clampf(1.0 - eff_d / maxf(radius, 0.1), 0.0, 1.0)
	if k <= 0.0:
		return
	dmg.apply_splash(damage * k, attacker_uid, _now())
	if is_player:
		_shake_camera(0.25 * k)


## Пересечение отрезка (мировые координаты) с упрощённой формой самолёта.
func ray_hit(from: Vector3, to: Vector3) -> Dictionary:
	var res := {"hit": false, "local_point": Vector3.ZERO, "world_point": Vector3.ZERO}
	if def.is_empty():
		return res
	var xf := _xform()
	var inv := xf.affine_inverse()
	var a: Vector3 = inv * from
	var b: Vector3 = inv * to
	var d := b - a
	var sh: Dictionary = def.get("shape", {})
	var length: float = float(sh.get("length", 10.0))
	var span: float = float(sh.get("span", 10.0))
	var fr: float = float(sh.get("fuselage_radius", 0.8))
	var best := INF
	# фюзеляж — капсула вдоль Z
	best = minf(best, _seg_capsule(a, d, -length * 0.5, length * 0.5, fr * 1.15))
	# крыло — тонкая плита в форме трапеции (стреловидность сдвигает законцовку назад)
	best = minf(best, _seg_wing(a, d, sh))
	# хвостовое оперение — коробка около z = 0.4 * length
	var tail_half := maxf(span * 0.2, fr * 2.0)
	var tail_h := maxf(length * 0.2, 1.5)
	var tmin := Vector3(-tail_half, -fr * 0.6, 0.3 * length)
	var tmax := Vector3(tail_half, fr + tail_h, 0.52 * length)
	best = minf(best, _seg_box(a, d, tmin, tmax))
	if best <= 1.0:
		var lp := a + d * best
		res.hit = true
		res.local_point = lp
		res.world_point = xf * lp
	return res


static func _seg_box(a: Vector3, d: Vector3, bmin: Vector3, bmax: Vector3) -> float:
	var t0 := 0.0
	var t1 := 1.0
	for i in 3:
		var ai := a[i]
		var di := d[i]
		if absf(di) < 1e-9:
			if ai < bmin[i] or ai > bmax[i]:
				return INF
			continue
		var u0 := (bmin[i] - ai) / di
		var u1 := (bmax[i] - ai) / di
		if u0 > u1:
			var tmp := u0
			u0 = u1
			u1 = tmp
		t0 = maxf(t0, u0)
		t1 = minf(t1, u1)
		if t0 > t1:
			return INF
	return t0


static func _seg_sphere(a: Vector3, d: Vector3, c: Vector3, r: float) -> float:
	var m := a - c
	var aa := d.dot(d)
	if aa < 1e-12:
		return 0.0 if m.length_squared() <= r * r else INF
	var bb := m.dot(d)
	var cc := m.dot(m) - r * r
	if cc <= 0.0:
		return 0.0
	var disc := bb * bb - aa * cc
	if disc < 0.0:
		return INF
	var t := (-bb - sqrt(disc)) / aa
	return t if t >= 0.0 and t <= 1.0 else INF


static func _seg_capsule(a: Vector3, d: Vector3, z0: float, z1: float, r: float) -> float:
	var best := INF
	# начало отрезка внутри капсулы
	if (a - Vector3(0, 0, clampf(a.z, z0, z1))).length_squared() <= r * r:
		return 0.0
	# боковая поверхность цилиндра
	var aa := d.x * d.x + d.y * d.y
	if aa > 1e-12:
		var bb := a.x * d.x + a.y * d.y
		var cc := a.x * a.x + a.y * a.y - r * r
		var disc := bb * bb - aa * cc
		if disc >= 0.0:
			var t := (-bb - sqrt(disc)) / aa
			if t >= 0.0 and t <= 1.0:
				var z := a.z + d.z * t
				if z >= z0 and z <= z1:
					best = t
	# полусферы на концах
	best = minf(best, _seg_sphere(a, d, Vector3(0, 0, z0), r))
	best = minf(best, _seg_sphere(a, d, Vector3(0, 0, z1), r))
	return best


## Плита крыла по толщине: |y| <= 0.5 плюс запас на высокое/низкое крыло и поперечное V.
static func _wing_y_range(sh: Dictionary) -> Vector2:
	var fr: float = float(sh.get("fuselage_radius", 0.8))
	var span: float = float(sh.get("span", 10.0))
	return Vector2(-0.5 - 0.4 * fr, 0.5 + 0.4 * fr + 0.04 * span)


## Точка внутри трапеции крыла в плане (корневая хорда больше средней chord).
static func _in_wing(p: Vector3, sh: Dictionary) -> bool:
	var half: float = float(sh.get("span", 10.0)) * 0.5
	var ax := absf(p.x)
	if ax > half:
		return false
	var chord: float = float(sh.get("chord", 2.0))
	var wing_z: float = float(sh.get("wing_z", 0.0))
	var sweep := deg_to_rad(float(sh.get("sweep_deg", 0.0)))
	var taper := 0.15 if String(sh.get("wing_type", "straight")) == "delta" else 0.5
	var cr := 2.0 * chord / (1.0 + taper)
	var c := lerpf(cr, cr * taper, ax / maxf(half, 0.01))
	var le := wing_z - cr * 0.5 + ax * tan(sweep)
	return p.z >= le - 0.4 and p.z <= le + c + 0.4


static func _seg_wing(a: Vector3, d: Vector3, sh: Dictionary) -> float:
	var span: float = float(sh.get("span", 10.0))
	var chord: float = float(sh.get("chord", 2.0))
	var wing_z: float = float(sh.get("wing_z", 0.0))
	var sweep := deg_to_rad(float(sh.get("sweep_deg", 0.0)))
	var half := span * 0.5
	var taper := 0.15 if String(sh.get("wing_type", "straight")) == "delta" else 0.5
	var cr := 2.0 * chord / (1.0 + taper)
	var yr := _wing_y_range(sh)
	var bmin := Vector3(-half, yr.x, wing_z - cr * 0.5 - 0.4)
	var bmax := Vector3(half, yr.y, wing_z + cr * 0.5 + half * tan(sweep) + 0.4)
	var t0 := _seg_box(a, d, bmin, bmax)
	if t0 == INF:
		return INF
	# в плите проверяем несколько точек: вход, пересечение с серединой толщины, середину участка
	var t1 := 1.0
	if absf(d.y) > 1e-6:
		t1 = clampf(maxf((yr.x - a.y) / d.y, (yr.y - a.y) / d.y), t0, 1.0)
	var cand: Array = [t0, (t0 + t1) * 0.5]
	if absf(d.y) > 1e-6:
		cand.append(clampf((0.5 * (yr.x + yr.y) - a.y) / d.y, t0, t1))
	for k in 6:
		cand.append(lerpf(t0, t1, float(k + 1) / 7.0))
	var best := INF
	for t in cand:
		var tt: float = t
		if tt < best and _in_wing(a + d * tt, sh):
			best = tt
	return best


func hit_radius() -> float:
	var sh: Dictionary = def.get("shape", {})
	return maxf(float(sh.get("length", 10.0)), float(sh.get("span", 10.0))) * 0.5 + 1.0


func forward() -> Vector3:
	return -_xform().basis.z


func velocity() -> Vector3:
	return fm.vel if fm != null else Vector3.ZERO


func speed() -> float:
	return velocity().length()


func altitude_agl() -> float:
	var p := _xform().origin
	return p.y - maxf(_ground_height(p.x, p.z), 0.0)


# ---------------------------------------------------------------- граница, гибель, обломки

func _check_border(dt: float) -> void:
	var lim := BORDER
	var w = _world()
	if w != null and w.has_method("half_size"):
		lim = float(w.half_size()) + 200.0
	if absf(fm.pos.x) > lim or absf(fm.pos.z) > lim:
		border_time += dt
	else:
		border_time = 0.0


func _check_death() -> void:
	var reason := ""
	if dmg.is_destroyed():
		reason = dmg.destroyed_reason()
		if reason == "":
			reason = "structure"
	elif fm.crashed:
		reason = fm.crash_reason if fm.crash_reason != "" else "ground"
	elif border_time >= BORDER_TIME:
		reason = "border"
	if reason != "":
		_die(reason)


func _die(reason: String) -> void:
	if not alive:
		return
	alive = false
	servicing = false
	death_reason = reason
	killer_uid = -1
	if dmg.last_attacker >= 0 and dmg.last_attacker != uid and _now() - dmg.last_hit_time <= KILL_CREDIT_TIME:
		killer_uid = dmg.last_attacker
	fm.assist = false
	controls = _wreck_controls()
	if _engine_player != null:
		_engine_player.stop()
	engine_sound_on = false
	destroyed.emit(self, killer_uid, reason)
	if fm.crashed:
		_explode()
	elif _smoke_fx == null and _fire_fx == null:
		var f = _fx()
		if f != null and model != null:
			_smoke_fx = f.attach_smoke(model, marker_pos("Engine0"), true)


func _update_wreck(dt: float, surface: Dictionary) -> void:
	_wreck_time += dt
	if fm.crashed or fm.on_ground or _wreck_time > WRECK_MAX_TIME:
		_explode()
		return
	# страховка: обломки ушли под землю (например, модель полёта без проверки контакта)
	if fm.pos.y < float(surface.get("height", 0.0)):
		_explode()


func _explode() -> void:
	if exploded:
		return
	exploded = true
	_free_timer = FREE_DELAY
	servicing = false
	var pos := _xform().origin
	var f = _fx()
	var surface := _surface()
	var on_water := fm.crash_reason == "water" or String(surface.get("kind", "")) == "water"
	var size := clampf(0.8 + float(def.get("mass", 5000.0)) / 15000.0, 0.8, 2.5)
	if f != null:
		f.explosion(pos, size)
		if on_water:
			f.splash(Vector3(pos.x, 0.0, pos.z), size * 1.5)
		f.debris(pos, fm.vel * 0.3 + Vector3(0, 8, 0), 14)
	Sfx.play("explosion_big", pos)
	_clear_fx()
	if _engine_player != null:
		_engine_player.stop()
	if model != null:
		model.visible = false
	if is_player:
		_shake_camera(1.0)


# ---------------------------------------------------------------- обслуживание

func _update_service(dt: float, surface: Dictionary) -> void:
	if not fm.on_ground:
		_air_time += dt
		if _air_time > 2.0:
			service_armed = true
		if servicing or service_progress > 0.0:
			servicing = false
			service_progress = 0.0
		return
	_air_time = 0.0
	var kind := String(surface.get("kind", ""))
	var ok := service_armed and fm.gear_down and speed() < SERVICE_SPEED
	ok = ok and int(surface.get("team", -1)) == team and (kind == "runway" or kind == "deck")
	ok = ok and _in_service_radius()
	if not ok:
		if servicing:
			servicing = false
		if speed() >= SERVICE_SPEED:
			service_progress = 0.0
		return
	if not servicing:
		servicing = true
		_svc_phase = 0
		_svc_r0 = _repair_frac()
		_svc_a0 = _ammo_frac()
		service_progress = 0.0
	if _svc_phase == 0:
		if dmg.repair_step(dt):
			_svc_phase = 1
	elif _svc_phase == 1:
		if weapons.rearm_step(dt):
			_svc_phase = 2
	var need := (1.0 - _svc_r0) + (1.0 - _svc_a0)
	if _svc_phase >= 2:
		service_progress = 1.0
	elif need > 0.001:
		var got := (_repair_frac() - _svc_r0) + (_ammo_frac() - _svc_a0)
		service_progress = clampf(got / need, 0.0, 0.99)
	if _svc_phase >= 2:
		servicing = false
		service_armed = false
		serviced.emit(self)
		if is_player:
			Sfx.play("rearm_done")


func _in_service_radius() -> bool:
	var w = _world()
	if w == null or not ("airfields" in w):
		return true
	var afs = w.get("airfields")
	if not (afs is Array) or (afs as Array).is_empty():
		return true
	for af in afs:
		if not (af is Dictionary) or int(af.get("team", -1)) != team:
			continue
		var p: Vector3 = af.get("pos", Vector3.ZERO)
		var r: float = float(af.get("service_radius", 400.0))
		if Vector2(fm.pos.x - p.x, fm.pos.z - p.z).length() <= r:
			return true
	return false


func _repair_frac() -> float:
	var s := 0.0
	var n := 0
	for m in ["engine", "fuel", "left_wing", "right_wing", "tail", "pilot", "structure"]:
		s += dmg.module_ratio(m)
		n += 1
	return s / float(n) if n > 0 else 1.0


func _ammo_frac() -> float:
	var cur := 0.0
	var mx := 0.0
	var a: Dictionary = weapons.ammo
	var m: Dictionary = weapons.max_ammo
	var ga = a.get("guns", [])
	var gm = m.get("guns", [])
	if ga is Array and gm is Array:
		for i in mini((ga as Array).size(), (gm as Array).size()):
			var top := float(gm[i])
			if top > 0.0:
				cur += clampf(float(ga[i]) / top, 0.0, 1.0)
				mx += 1.0
	for k in ["rockets", "bombs", "missiles", "flares"]:
		var top := float(m.get(k, 0))
		if top > 0.0:
			cur += clampf(float(a.get(k, 0)) / top, 0.0, 1.0)
			mx += 1.0
	return cur / mx if mx > 0.0 else 1.0


# ---------------------------------------------------------------- визуал

func _update_visuals(dt: float) -> void:
	if model == null or fm == null:
		return
	AircraftMeshBuilder.set_gear(model, fm.gear_down)
	AircraftMeshBuilder.spin_props(model, fm.engine_rpm, dt)
	AircraftMeshBuilder.set_afterburner(model, alive and fm.afterburner)
	_update_ground_tilt(dt)
	if exploded:
		return
	var f = _fx()
	# дым от двигателя
	var want_smoke := alive and (dmg.engine_dead or dmg.oil_leak or dmg.module_ratio("engine") < 0.4)
	if not alive and _smoke_fx != null:
		want_smoke = true   # сбитый продолжает дымить
	if want_smoke and _smoke_fx == null and f != null:
		_smoke_fx = f.attach_smoke(model, marker_pos("Engine0"), true)
	elif not want_smoke and _smoke_fx != null:
		_free_node(_smoke_fx)
		_smoke_fx = null
	# пожар
	if dmg.on_fire and _fire_fx == null and f != null:
		_fire_fx = f.attach_fire(model, _fire_pos())
	elif not dmg.on_fire and _fire_fx != null:
		_free_node(_fire_fx)
		_fire_fx = null
	# инверсионные следы с законцовок на большой перегрузке
	if alive and fm.g_load > TRAIL_G_ON and _trail_fx.is_empty() and f != null:
		var sh: Dictionary = def.get("shape", {})
		var half: float = float(sh.get("span", 10.0)) * 0.5
		_trail_fx.append(f.attach_trail(model, marker_pos("WingTipL", Vector3(-half, 0, 0))))
		_trail_fx.append(f.attach_trail(model, marker_pos("WingTipR", Vector3(half, 0, 0))))
	elif not _trail_fx.is_empty() and (not alive or fm.g_load < TRAIL_G_OFF):
		for t in _trail_fx:
			_free_node(t)
		_trail_fx.clear()
	# оторванные части
	if dmg.left_wing_lost and not _lost.has("LeftWing"):
		_detach("LeftWing")
	if dmg.right_wing_lost and not _lost.has("RightWing"):
		_detach("RightWing")
	if dmg.tail_lost and not _lost.has("Tail"):
		_detach("Tail")


func _fire_pos() -> Vector3:
	# пожар топлива — в центре, двигателя — у двигателя
	if dmg.module_ratio("fuel") < dmg.module_ratio("engine"):
		return Vector3(0.0, 0.0, float(def.get("shape", {}).get("wing_z", 0.0)))
	return marker_pos("Engine0")


## Хвостовое колесо: на стоянке нос задран, на разбеге хвост поднимается.
func _update_ground_tilt(dt: float) -> void:
	if absf(_tilt_max) < 1e-4:
		return
	var want := 0.0
	if fm.on_ground:
		var vs := maxf(fm.stall_speed(), 10.0)
		want = _tilt_max * clampf(1.0 - fm.airspeed / (0.6 * vs), 0.0, 1.0)
	if dt <= 0.0:
		_ground_tilt = want
	else:
		_ground_tilt = move_toward(_ground_tilt, want, dt * 0.25)
	var r := Basis(Vector3.RIGHT, _ground_tilt)
	model.transform = Transform3D(r, _tilt_pivot - r * _tilt_pivot)


func _detach(part: String) -> void:
	_lost[part] = true
	var node := AircraftMeshBuilder.detach_part(model, part)
	var f = _fx()
	var pos := _xform().origin
	if f != null:
		f.debris(pos, fm.vel, 10)
	if node == null:
		var n := model.get_node_or_null(part) as Node3D
		if n != null:
			n.visible = false
		return
	if node.is_inside_tree():
		var side := -1.0 if part == "LeftWing" else 1.0
		var right := fm.basis.x
		var v := fm.vel * 0.85 + right * side * 6.0 + Vector3(0, 4, 0)
		var spin := Vector3(randf_range(-3, 3), randf_range(-2, 2), randf_range(-4, 4))
		var mover = PartMover.new()
		if not mover.launch(node, v, spin):
			mover.free()
	else:
		node.queue_free()


func _clear_fx() -> void:
	for n in [_fire_fx, _smoke_fx]:
		_free_node(n)
	for t in _trail_fx:
		_free_node(t)
	_fire_fx = null
	_smoke_fx = null
	_trail_fx.clear()


static func _free_node(n) -> void:
	if n != null and is_instance_valid(n) and n is Node:
		(n as Node).queue_free()


func _on_module_damaged(_module: String, _ratio: float) -> void:
	if not is_player or not alive:
		return
	if _clock - _last_hit_snd >= HIT_SOUND_GAP:
		_last_hit_snd = _clock
		Sfx.play("hit")
		_shake_camera(0.12)


func _shake_camera(amount: float) -> void:
	var b = _battle()
	if b == null or not ("camera_rig" in b):
		return
	var rig = b.get("camera_rig")
	if rig != null and is_instance_valid(rig) and rig.has_method("shake") and rig.get("target") == self:
		rig.shake(amount)


# ---------------------------------------------------------------- звук двигателя

func _update_engine_sound(dt: float) -> void:
	_snd_timer -= dt
	if _snd_timer <= 0.0:
		_snd_timer = 0.5 + 0.05 * float(uid % 5)
		engine_sound_on = alive and not exploded and (is_player or _sound_rank() < ENGINE_SOUND_BOTS)
	if engine_sound_on and alive:
		if _engine_player == null:
			_engine_player = Sfx.make_engine(String(def.get("kind", "prop")))
			if _engine_player != null:
				_engine_player.name = "EngineSound"
				add_child(_engine_player)
		if _engine_player != null:
			if not _engine_player.playing and _engine_player.is_inside_tree():
				_engine_player.play()
			Sfx.set_engine(_engine_player, fm.engine_rpm, fm.afterburner)
	elif _engine_player != null and _engine_player.playing:
		_engine_player.stop()


## Сколько других ботов ближе к камере, чем этот.
func _sound_rank() -> int:
	if not is_inside_tree():
		return 999
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		return 999
	var cp := cam.global_position
	var my := cp.distance_squared_to(global_position)
	var rank := 0
	for a in _registry:
		if a == self or not is_instance_valid(a) or not a.alive or a.is_player:
			continue
		if cp.distance_squared_to(a.global_position) < my:
			rank += 1
	return rank
