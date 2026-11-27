class_name Recorder
extends Node
## Запись боя для повтора и киллкама. 20 отсчётов в секунду на самолёт:
## время, позиция, поворот (кватернион), флаги, газ — в PackedFloat32Array на каждый uid.
## Формат описан в replay_data.gd.

const RATE := 20.0
const SAMPLE_DT := 1.0 / RATE
const GROUND_DT := 0.5
const KEEP_SECONDS := 1500.0       # дольше (тестовый полёт) — старое обрезается
const MAX_FLOATS := 9000000        # ~36 МБ на треки
const MAX_EVENTS := 150000
const MAX_TRACERS_PER_TICK := 8    # трассеров на отсчёт (0,05 с)
const SAVE_DIR := "user://replays"
const SAVE_PATH := "user://replays/last.json"

const STRIDE := ReplayData.STRIDE
const G_STRIDE := ReplayData.G_STRIDE
const T_STRIDE := ReplayData.T_STRIDE

## Буфер одного трека. Добавление идёт через метод объекта, чтобы массив менялся на месте.
class Buf extends RefCounted:
	var data := PackedFloat32Array()

	func push(values: Array) -> void:
		for v in values:
			data.append(float(v))

	func count(stride: int) -> int:
		return data.size() / stride

	## Удаляет отсчёты раньше cut. Возвращает, сколько float удалено.
	func trim_before(cut: float, stride: int) -> int:
		var i := ReplayData.find_index(data, stride, cut)   # последний с t <= cut
		if i < 0:
			return 0
		var first := i if data[i * stride] >= cut else i + 1
		if first <= 0:
			return 0
		var removed := mini(first * stride, data.size())
		data = data.slice(removed)
		return removed

var battle = null
var recording: bool = false
var save_to_disk: bool = true      # тесты могут выключить запись файла
var last_save_path: String = ""

var _time: float = 0.0
var _accum: float = 0.0
var _gaccum: float = 0.0
var _t_start: float = 0.0
var _done: bool = false
var _finished: Dictionary = {}
var _floats: int = 0
var _trim_check: float = 0.0
var _tick_tracers: int = 0

var _planes: Dictionary = {}       # uid -> {def_id, team, camo, callsign, player}
var _tracks: Dictionary = {}       # uid -> Buf
var _events: Array = []            # [{t, type, ...}]
var _tracers: Buf = Buf.new()
var _ground: Dictionary = {}       # uid -> {kind, team, pos:[..], heading, variant}
var _gtracks: Dictionary = {}      # uid -> Buf
var _glast: Dictionary = {}        # uid -> Transform3D последнего отсчёта
var _gnode: Dictionary = {}        # uid -> GroundUnit (слабо: проверяем is_instance_valid)
var _gprev_tick: float = 0.0
var _ground_dead_trimmed: Dictionary = {}


func start(p_battle) -> void:
	battle = p_battle
	recording = battle != null
	_done = false
	_finished = {}
	_time = 0.0
	_accum = 0.0
	_gaccum = 0.0
	_t_start = 0.0
	_gprev_tick = 0.0
	if not recording:
		return
	_meta()
	_scan_ground()
	_sample_planes()


func event(type: String, data: Dictionary) -> void:
	if _done:
		return
	var t := current_time()
	if type == "tracer":
		_add_tracer(t, data)
		return
	if _events.size() >= MAX_EVENTS and type != "kill" and type != "ground_destroyed" and type != "spawn":
		return
	var e: Dictionary = {}
	for k in data:
		e[str(k)] = _clean(data[k])
	e["t"] = snappedf(t, 0.001)
	e["type"] = type
	_events.append(e)
	if type == "spawn" and e.has("uid"):
		var uid := int(e.uid)
		if not _planes.has(uid):
			_planes[uid] = {"def_id": str(e.get("def_id", "")), "team": int(e.get("team", 0)),
				"camo": str(e.get("camo", "factory")), "callsign": str(e.get("callsign", "")),
				"player": bool(e.get("is_player", false))}


func current_time() -> float:
	return _time


func finish() -> Dictionary:
	if _done:
		return _finished
	if recording and battle != null and is_instance_valid(battle):
		_sample_planes()
	recording = false
	_done = true
	_finished = _export(_t_start, _time, false)
	Game.last_replay = _finished
	if save_to_disk:
		_save(_finished)
	return _finished


func window(t_from: float, t_to: float) -> Dictionary:
	var a := maxf(t_from, _t_start)
	var b := minf(t_to, _time)
	if b < a:
		b = a
	return _export(a, b, true)


## Примерный объём записи в байтах (треки, трассеры, события).
func memory_bytes() -> int:
	return _floats * 4 + _events.size() * 320 + _planes.size() * 400 + _ground.size() * 300


func sample_count(uid: int) -> int:
	var b: Buf = _tracks.get(uid)
	return b.count(STRIDE) if b != null else 0


func event_count(type: String = "") -> int:
	if type == "tracer":
		return _tracers.count(T_STRIDE)
	if type == "":
		return _events.size()
	var n := 0
	for e in _events:
		if e.type == type:
			n += 1
	return n


# ---------------------------------------------------------------- кадр

func _physics_process(delta: float) -> void:
	if not recording or _done:
		return
	if battle == null or not is_instance_valid(battle):
		recording = false
		return
	if "paused" in battle and bool(battle.paused):
		return
	if delta <= 0.0:
		return
	_time += delta
	_accum += delta
	if _accum + 0.0001 >= SAMPLE_DT:
		_accum -= SAMPLE_DT
		if _accum > SAMPLE_DT:
			_accum = 0.0
		_tick_tracers = 0
		_sample_planes()
	_gaccum += delta
	if _gaccum + 0.0001 >= GROUND_DT:
		_gaccum = 0.0
		_sample_ground()
	_trim_check += delta
	if _trim_check >= 10.0:
		_trim_check = 0.0
		_trim_if_needed()


func _sample_planes() -> void:
	var list = battle.get("aircraft") if battle != null else null
	if not (list is Array):
		return
	for ac in list:
		if ac == null or not is_instance_valid(ac):
			continue
		var uid := int(ac.uid)
		if not _planes.has(uid):
			_register_plane(ac)
		var xf: Transform3D = ac.global_transform if ac.is_inside_tree() else ac.transform
		var q := xf.basis.orthonormalized().get_rotation_quaternion()
		var buf: Buf = _tracks.get(uid)
		if buf == null:
			buf = Buf.new()
			_tracks[uid] = buf
		buf.push([_time, xf.origin.x, xf.origin.y, xf.origin.z, q.x, q.y, q.z, q.w, _flags(ac), _throttle(ac)])
		_floats += STRIDE


func _register_plane(ac) -> void:
	_planes[int(ac.uid)] = {"def_id": str(ac.def_id), "team": int(ac.team), "camo": str(ac.camo_id),
		"callsign": str(ac.callsign), "player": bool(ac.is_player)}


static func _flags(ac) -> int:
	var f := 0
	var alive := bool(ac.alive)
	if alive:
		f |= ReplayData.F_ALIVE
	var fm = ac.get("fm")
	if fm != null:
		if bool(fm.gear_down):
			f |= ReplayData.F_GEAR
		if bool(fm.afterburner):
			f |= ReplayData.F_AFTERBURNER
	var dmg = ac.get("dmg")
	var smoke := not alive
	if dmg != null:
		if bool(dmg.on_fire):
			f |= ReplayData.F_FIRE
		if bool(dmg.engine_dead) or bool(dmg.oil_leak):
			smoke = true
		elif dmg.has_method("module_ratio") and float(dmg.module_ratio("engine")) < 0.4:
			smoke = true
		if bool(dmg.left_wing_lost):
			f |= ReplayData.F_LWING
		if bool(dmg.right_wing_lost):
			f |= ReplayData.F_RWING
		if bool(dmg.tail_lost):
			f |= ReplayData.F_TAIL
	if smoke:
		f |= ReplayData.F_SMOKE
	if "exploded" in ac and bool(ac.exploded):
		f |= ReplayData.F_GONE
	elif not alive and ac.get("model") != null and is_instance_valid(ac.model) and not ac.model.visible:
		f |= ReplayData.F_GONE
	return f


static func _throttle(ac) -> float:
	var fm = ac.get("fm")
	if fm == null:
		return 0.0
	return clampf(float(fm.throttle), 0.0, 1.0)


func _add_tracer(t: float, data: Dictionary) -> void:
	if _tick_tracers >= MAX_TRACERS_PER_TICK:
		return
	_tick_tracers += 1
	var a := ReplayData.vec(data.get("from"), Vector3.INF)
	var b := ReplayData.vec(data.get("to"), Vector3.INF)
	if a == Vector3.INF or b == Vector3.INF:
		return
	_tracers.push([t, a.x, a.y, a.z, b.x, b.y, b.z, 1.0 if bool(data.get("aa", false)) else 0.0])
	_floats += T_STRIDE


# ---------------------------------------------------------------- наземные цели

func _ground_list() -> Array:
	if battle == null:
		return []
	var l = battle.get("ground_units")
	if l is Array and not l.is_empty():
		return l
	var w = battle.get("world")
	if w != null and is_instance_valid(w):
		var wl = w.get("ground_units")
		if wl is Array:
			return wl
	return l if l is Array else []


func _scan_ground() -> void:
	for u in _ground_list():
		if u == null or not is_instance_valid(u):
			continue
		var uid := int(u.uid)
		if _ground.has(uid):
			continue
		var xf: Transform3D = u.global_transform if u.is_inside_tree() else u.transform
		var fwd := -xf.basis.z
		var g := {"kind": str(u.kind), "team": int(u.team),
			"pos": [xf.origin.x, xf.origin.y, xf.origin.z], "heading": atan2(fwd.x, -fwd.z)}
		if "variant" in u:
			g["variant"] = str(u.variant)
		_ground[uid] = g
		_glast[uid] = xf
		_gnode[uid] = u


func _sample_ground() -> void:
	_scan_ground()
	for uid in _gnode:
		var u = _gnode[uid]
		if u == null or not is_instance_valid(u) or not bool(u.alive):
			continue
		var xf: Transform3D = u.global_transform if u.is_inside_tree() else u.transform
		var last: Transform3D = _glast[uid]
		var moved := xf.origin.distance_squared_to(last.origin) > 0.0025
		if not moved:
			var qa := last.basis.orthonormalized().get_rotation_quaternion()
			var qb := xf.basis.orthonormalized().get_rotation_quaternion()
			moved = absf(qa.dot(qb)) < 0.99999
		if not moved:
			continue
		var buf: Buf = _gtracks.get(uid)
		if buf == null:
			buf = Buf.new()
			_gtracks[uid] = buf
		var lt := ReplayData.last_time(buf.data, G_STRIDE)
		if lt < _gprev_tick - 0.001:
			# стоял: фиксируем позу на прошлом тике, чтобы интерполяция не размазала стоянку
			_push_ground(buf, _gprev_tick, last)
		_push_ground(buf, _time, xf)
		_glast[uid] = xf
	_gprev_tick = _time


func _push_ground(buf: Buf, t: float, xf: Transform3D) -> void:
	var q := xf.basis.orthonormalized().get_rotation_quaternion()
	buf.push([t, xf.origin.x, xf.origin.y, xf.origin.z, q.x, q.y, q.z, q.w])
	_floats += G_STRIDE


# ---------------------------------------------------------------- обрезка

func _trim_if_needed() -> void:
	var cut := -1.0
	if _time - _t_start > KEEP_SECONDS + 60.0:
		cut = _time - KEEP_SECONDS
	elif _floats > MAX_FLOATS:
		cut = _t_start + maxf(60.0, (_time - _t_start) * 0.1)
	if cut > _t_start:
		trim_before(cut)


## Удаляет всё записанное раньше cut (для очень длинных тестовых полётов).
func trim_before(cut: float) -> void:
	if cut <= _t_start:
		return
	for uid in _tracks.keys():
		var b: Buf = _tracks[uid]
		_floats -= b.trim_before(cut, STRIDE)
		if b.data.is_empty():
			_tracks.erase(uid)
	_floats -= _tracers.trim_before(cut, T_STRIDE)
	for uid in _gtracks.keys():
		var gb: Buf = _gtracks[uid]
		var pose = ReplayData.ground_pose(gb.data, cut)
		if pose != null:
			var xf: Transform3D = pose
			var fwd := -xf.basis.z
			_ground[uid]["pos"] = [xf.origin.x, xf.origin.y, xf.origin.z]
			_ground[uid]["heading"] = atan2(fwd.x, -fwd.z)
		# последний отсчёт до cut оставляем как начальную точку
		var i := ReplayData.find_index(gb.data, G_STRIDE, cut)
		if i > 0:
			var removed := i * G_STRIDE
			gb.data = gb.data.slice(removed)
			_floats -= removed
	var kept: Array = []
	for e in _events:
		if float(e.t) >= cut:
			kept.append(e)
		elif e.type == "ground_destroyed" and e.has("uid"):
			_ground_dead_trimmed[int(e.uid)] = true
	_events = kept
	_t_start = cut


# ---------------------------------------------------------------- выгрузка

func _info_value(key: String, fallback):
	if battle == null or not is_instance_valid(battle):
		return fallback
	var w = battle.get("world")
	if w != null and is_instance_valid(w):
		match key:
			"map_id":
				var m = w.get("map")
				if m is Dictionary and m.has("id"):
					return str(m.id)
			"time_of_day", "weather":
				var v = w.get(key)
				if v != null and str(v) != "":
					return str(v)
	var direct = battle.get(key)
	if direct != null and str(direct) != "":
		return direct
	var cfg = battle.get("config")
	if cfg is Dictionary and cfg.has(key):
		return cfg[key]
	return fallback


var _meta_cache: Dictionary = {}

## Карта, время, погода, seed. Пока бой жив — читаются из него, потом берутся из кэша.
func _meta() -> Dictionary:
	if battle == null or not is_instance_valid(battle):
		if _meta_cache.is_empty():
			_meta_cache = {"version": ReplayData.VERSION, "rate": RATE, "map_id": "canyon", "time_of_day": "day",
				"weather": "clear", "seed": 1, "mode": ""}
		return _meta_cache.duplicate()
	var seed_v := 1
	var cfg = battle.get("config")
	if cfg is Dictionary and cfg.has("seed"):
		seed_v = int(cfg.seed)
	var mode_v = battle.get("mode")
	_meta_cache = {"version": ReplayData.VERSION, "rate": RATE,
		"map_id": str(_info_value("map_id", "canyon")),
		"time_of_day": str(_info_value("time_of_day", "day")),
		"weather": str(_info_value("weather", "clear")),
		"seed": seed_v,
		"mode": str(mode_v) if mode_v != null else ""}
	return _meta_cache.duplicate()


func _export(a: float, b: float, is_window: bool) -> Dictionary:
	var out := _meta()
	out["start"] = a
	out["end"] = b
	out["duration"] = b - a
	out["window"] = is_window

	var tracks: Dictionary = {}
	var used: Dictionary = {}
	for uid in _tracks:
		var buf: Buf = _tracks[uid]
		var arr := _slice(buf.data, STRIDE, a, b)
		if arr.is_empty():
			continue
		tracks[str(uid)] = ReplayData.pack(arr)
		used[uid] = true
	out["tracks"] = tracks

	var events: Array = []
	for e in _events:
		var t := float(e.t)
		if t >= a - 0.0001 and t <= b + 0.0001:
			events.append(e.duplicate(true))
			for key in ["uid", "victim_uid", "killer_uid"]:
				if e.has(key) and _planes.has(int(e[key])):
					used[int(e[key])] = true
	out["events"] = events
	out["tracers"] = ReplayData.pack(_slice(_tracers.data, T_STRIDE, a, b))

	var planes: Dictionary = {}
	for uid in _planes:
		if not is_window or used.has(uid):
			planes[str(uid)] = (_planes[uid] as Dictionary).duplicate()
	out["planes"] = planes

	var ground: Dictionary = {}
	var gtracks: Dictionary = {}
	for uid in _ground:
		var g: Dictionary = (_ground[uid] as Dictionary).duplicate(true)
		var gb: Buf = _gtracks.get(uid)
		if gb != null and not gb.data.is_empty():
			var pose = ReplayData.ground_pose(gb.data, a)
			if pose != null:
				var xf: Transform3D = pose
				var fwd := -xf.basis.z
				g["pos"] = [xf.origin.x, xf.origin.y, xf.origin.z]
				g["heading"] = atan2(fwd.x, -fwd.z)
			var sl := _slice_ground(gb.data, a, b)
			if not sl.is_empty():
				gtracks[str(uid)] = ReplayData.pack(sl)
		ground[str(uid)] = g
	out["ground"] = ground
	out["ground_tracks"] = gtracks
	var dead: Array = []
	for uid in _ground_dead_trimmed:
		dead.append(uid)
	for e in _events:
		if e.type == "ground_destroyed" and e.has("uid") and float(e.t) < a - 0.0001:
			if not int(e.uid) in dead:
				dead.append(int(e.uid))
	out["ground_dead"] = dead
	return out


## Отсчёты с t в [a, b].
static func _slice(data: PackedFloat32Array, stride: int, a: float, b: float) -> PackedFloat32Array:
	var n := data.size() / stride
	if n == 0:
		return PackedFloat32Array()
	if data[0] >= a - 0.0001 and data[(n - 1) * stride] <= b + 0.0001:
		return data.slice(0, n * stride)
	var i0 := ReplayData.find_index(data, stride, a - 0.0001)
	if i0 < 0:
		i0 = 0
	elif data[i0 * stride] < a - 0.0001:
		i0 += 1
	var i1 := ReplayData.find_index(data, stride, b + 0.0001)
	if i1 < i0:
		return PackedFloat32Array()
	return data.slice(i0 * stride, (i1 + 1) * stride)


## Как _slice, но с последним отсчётом до a — чтобы поза в начале окна была известна.
static func _slice_ground(data: PackedFloat32Array, a: float, b: float) -> PackedFloat32Array:
	var n := data.size() / G_STRIDE
	if n == 0:
		return PackedFloat32Array()
	var i0 := maxi(ReplayData.find_index(data, G_STRIDE, a), 0)
	var i1 := ReplayData.find_index(data, G_STRIDE, b + 0.0001)
	if i1 < i0:
		return PackedFloat32Array()
	return data.slice(i0 * G_STRIDE, (i1 + 1) * G_STRIDE)


func _save(rep: Dictionary) -> void:
	var err := DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	if err != OK and not DirAccess.dir_exists_absolute(SAVE_DIR):
		push_warning("Recorder: нет папки для повтора")
		return
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("Recorder: не удалось записать повтор")
		return
	f.store_string(JSON.stringify(rep))
	f.close()
	last_save_path = SAVE_PATH


## Приводит значение к виду, который понимает JSON.
static func _clean(v):
	match typeof(v):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_STRING:
			return v
		TYPE_FLOAT:
			var f: float = v
			if is_nan(f) or is_inf(f):
				return 0.0
			return f
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(v)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return [_clean(float(v.x)), _clean(float(v.y))]
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return [_clean(float(v.x)), _clean(float(v.y)), _clean(float(v.z))]
		TYPE_QUATERNION:
			return [v.x, v.y, v.z, v.w]
		TYPE_COLOR:
			return [v.r, v.g, v.b, v.a]
		TYPE_DICTIONARY:
			var d: Dictionary = {}
			for k in v:
				d[str(k)] = _clean(v[k])
			return d
		TYPE_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_INT32_ARRAY, \
				TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_VECTOR3_ARRAY, TYPE_PACKED_BYTE_ARRAY:
			var arr: Array = []
			for x in v:
				arr.append(_clean(x))
			return arr
		TYPE_OBJECT:
			if v != null and is_instance_valid(v) and "uid" in v:
				return int(v.uid)
			return null
	return str(v)
