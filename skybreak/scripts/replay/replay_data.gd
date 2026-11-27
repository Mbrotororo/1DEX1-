class_name ReplayData
extends RefCounted
## Формат повтора и чтение треков. Общий код для Recorder, Killcam и сцены повтора.
##
## Повтор (результат Recorder.finish / window) — Dictionary, который можно отдать в JSON:
##   version, map_id, time_of_day, weather, seed, mode, rate,
##   start, end (абсолютное время записи, с), duration = end - start,
##   planes:  {"uid": {def_id, team, camo, callsign, player}}
##   tracks:  {"uid": base64 PackedFloat32Array, шаг STRIDE: t, px, py, pz, qx, qy, qz, qw, flags, throttle}
##   events:  [{t, type, ...}]  — explosion, kill, spawn, ground_destroyed и прочие
##   tracers: base64, шаг T_STRIDE: t, fx, fy, fz, tx, ty, tz, aa
##   ground:  {"uid": {kind, team, pos:[x,y,z], heading, variant}}  — положение на момент start
##   ground_tracks: {"uid": base64, шаг G_STRIDE: t, x, y, z, qx, qy, qz, qw} — только движущиеся
##   ground_dead: [uid] — уничтожены до start

const VERSION := 1
const RATE := 20.0
const STRIDE := 10
const G_STRIDE := 8
const T_STRIDE := 8
const GAP := 0.35          # больше — разрыв в треке, между отсчётами не интерполируем

const F_ALIVE := 1
const F_FIRE := 2
const F_GEAR := 4
const F_AFTERBURNER := 8
const F_SMOKE := 16
const F_LWING := 32
const F_RWING := 64
const F_TAIL := 128
const F_GONE := 256        # обломки взорвались, модели нет


static func pack(arr: PackedFloat32Array) -> String:
	if arr.is_empty():
		return ""
	return Marshalls.raw_to_base64(arr.to_byte_array())


static func unpack(v) -> PackedFloat32Array:
	if v is PackedFloat32Array:
		return v
	if v is String or v is StringName:
		var s := str(v)
		if s == "":
			return PackedFloat32Array()
		return Marshalls.base64_to_raw(s).to_float32_array()
	if v is Array:
		var out := PackedFloat32Array()
		out.resize(v.size())
		for i in v.size():
			out[i] = float(v[i])
		return out
	return PackedFloat32Array()


static func vec(v, fallback: Vector3 = Vector3.ZERO) -> Vector3:
	if v is Vector3:
		return v
	if v is Array and v.size() >= 3:
		return Vector3(float(v[0]), float(v[1]), float(v[2]))
	if v is Dictionary and v.has("x"):
		return Vector3(float(v.x), float(v.get("y", 0.0)), float(v.get("z", 0.0)))
	return fallback


## Разбирает повтор (как из finish(), так и после JSON) в удобный вид:
## ключи-uid становятся int, треки — PackedFloat32Array, события сортируются по времени.
static func decode(rep: Dictionary) -> Dictionary:
	var out := {"valid": false, "version": VERSION, "map_id": "canyon", "time_of_day": "day", "weather": "clear",
		"seed": 1, "mode": "", "start": 0.0, "end": 0.0,
		"planes": {}, "tracks": {}, "events": [], "kills": [], "tracers": PackedFloat32Array(),
		"ground": {}, "ground_tracks": {}, "ground_dead": {}, "ground_deaths": {}}
	if rep.is_empty():
		return out
	out.version = int(rep.get("version", VERSION))
	out.map_id = str(rep.get("map_id", "canyon"))
	out.time_of_day = str(rep.get("time_of_day", "day"))
	out.weather = str(rep.get("weather", "clear"))
	out.seed = int(rep.get("seed", 1))
	out.mode = str(rep.get("mode", ""))
	var start := float(rep.get("start", 0.0))
	var end := float(rep.get("end", start + float(rep.get("duration", 0.0))))
	out.start = start
	out.end = maxf(end, start)

	var planes: Dictionary = {}
	var src_planes = rep.get("planes", {})
	if src_planes is Dictionary:
		for k in src_planes:
			var p = src_planes[k]
			if not (p is Dictionary):
				continue
			planes[int(k)] = {"def_id": str(p.get("def_id", "")), "team": int(p.get("team", 0)),
				"camo": str(p.get("camo", "factory")), "callsign": str(p.get("callsign", "")),
				"player": bool(p.get("player", false))}
	out.planes = planes

	var tracks: Dictionary = {}
	var src_tracks = rep.get("tracks", {})
	if src_tracks is Dictionary:
		for k in src_tracks:
			var arr := unpack(src_tracks[k])
			var n := arr.size() / STRIDE
			if n <= 0:
				continue
			if arr.size() != n * STRIDE:
				arr = arr.slice(0, n * STRIDE)
			tracks[int(k)] = arr
			if not planes.has(int(k)):
				planes[int(k)] = {"def_id": "", "team": 0, "camo": "factory", "callsign": "", "player": false}
	out.tracks = tracks

	var events: Array = []
	var src_events = rep.get("events", [])
	if src_events is Array:
		for e in src_events:
			if e is Dictionary and e.has("type"):
				var c: Dictionary = e.duplicate()
				c["t"] = float(e.get("t", 0.0))
				c["type"] = str(e.type)
				events.append(c)
	events.sort_custom(func(a, b): return float(a.t) < float(b.t))
	out.events = events
	var kills: Array = []
	var deaths: Dictionary = {}
	for e in events:
		if e.type == "kill":
			kills.append(e)
		elif e.type == "ground_destroyed" and e.has("uid"):
			var gu := int(e.uid)
			if not deaths.has(gu):
				deaths[gu] = float(e.t)
	out.kills = kills
	out.ground_deaths = deaths

	var tr := unpack(rep.get("tracers", ""))
	var tn := tr.size() / T_STRIDE
	if tr.size() != tn * T_STRIDE:
		tr = tr.slice(0, tn * T_STRIDE)
	out.tracers = tr

	var ground: Dictionary = {}
	var src_ground = rep.get("ground", {})
	if src_ground is Dictionary:
		for k in src_ground:
			var g = src_ground[k]
			if not (g is Dictionary):
				continue
			ground[int(k)] = {"kind": str(g.get("kind", "tank")), "team": int(g.get("team", 0)),
				"pos": vec(g.get("pos", [0, 0, 0])), "heading": float(g.get("heading", 0.0)),
				"variant": str(g.get("variant", ""))}
	out.ground = ground
	var gtracks: Dictionary = {}
	var src_gt = rep.get("ground_tracks", {})
	if src_gt is Dictionary:
		for k in src_gt:
			var arr := unpack(src_gt[k])
			var n := arr.size() / G_STRIDE
			if n > 0:
				gtracks[int(k)] = arr.slice(0, n * G_STRIDE)
	out.ground_tracks = gtracks
	var dead: Dictionary = {}
	var src_dead = rep.get("ground_dead", [])
	if src_dead is Array:
		for u in src_dead:
			dead[int(u)] = true
	out.ground_dead = dead

	out.valid = not tracks.is_empty() and out.end > out.start
	return out


## Индекс последнего отсчёта со временем <= t, или -1.
static func find_index(track: PackedFloat32Array, stride: int, t: float) -> int:
	var n := track.size() / stride
	if n == 0 or t < track[0]:
		return -1
	var hi := n - 1
	if t >= track[hi * stride]:
		return hi
	var lo := 0
	while hi - lo > 1:
		var mid := (lo + hi) >> 1
		if track[mid * stride] <= t:
			lo = mid
		else:
			hi = mid
	return lo


static func first_time(track: PackedFloat32Array) -> float:
	return track[0] if track.size() > 0 else INF


static func last_time(track: PackedFloat32Array, stride: int = STRIDE) -> float:
	var n := track.size() / stride
	return track[(n - 1) * stride] if n > 0 else -INF


## Положение самолёта в момент t.
## {present, pos, rot:Quaternion, flags, throttle, vel}
static func sample(track: PackedFloat32Array, t: float) -> Dictionary:
	var res := {"present": false, "pos": Vector3.ZERO, "rot": Quaternion.IDENTITY, "flags": 0, "throttle": 0.0,
		"vel": Vector3.ZERO}
	var n := track.size() / STRIDE
	if n == 0:
		return res
	var half := 0.5 / RATE
	var i := find_index(track, STRIDE, t)
	if i < 0:
		if track[0] - t > half:
			return res
		i = 0
	var a := i * STRIDE
	var ta := track[a]
	var pa := Vector3(track[a + 1], track[a + 2], track[a + 3])
	var qa := _quat(track, a + 4)
	res.flags = int(track[a + 8])
	res.throttle = track[a + 9]
	res.pos = pa
	res.rot = qa
	if i + 1 < n:
		var b := a + STRIDE
		var tb := track[b]
		if tb > ta and tb - ta <= GAP:
			var k := clampf((t - ta) / (tb - ta), 0.0, 1.0)
			var pb := Vector3(track[b + 1], track[b + 2], track[b + 3])
			res.pos = pa.lerp(pb, k)
			res.rot = qa.slerp(_quat(track, b + 4), k)
			res.throttle = lerpf(track[a + 9], track[b + 9], k)
			res.vel = (pb - pa) / (tb - ta)
		elif t - ta > half:
			return res
	else:
		if t - ta > half:
			return res
		if i > 0:
			var p := a - STRIDE
			var dtp := ta - track[p]
			if dtp > 0.0 and dtp <= GAP:
				res.vel = (pa - Vector3(track[p + 1], track[p + 2], track[p + 3])) / dtp
	res.present = true
	return res


static func _quat(track: PackedFloat32Array, o: int) -> Quaternion:
	var q := Quaternion(track[o], track[o + 1], track[o + 2], track[o + 3])
	var l := q.length()
	if l < 0.0001:
		return Quaternion.IDENTITY
	return q / l


## Положение наземной цели в момент t (трек или исходная точка). null — трека нет.
static func ground_pose(gtrack: PackedFloat32Array, t: float):
	var n := gtrack.size() / G_STRIDE
	if n == 0:
		return null
	var i := find_index(gtrack, G_STRIDE, t)
	if i < 0:
		i = 0
	var a := i * G_STRIDE
	var p := Vector3(gtrack[a + 1], gtrack[a + 2], gtrack[a + 3])
	var q := _quat(gtrack, a + 4)
	if i + 1 < n and t > gtrack[a]:
		var b := a + G_STRIDE
		var span := gtrack[b] - gtrack[a]
		if span > 0.0:
			var k := clampf((t - gtrack[a]) / span, 0.0, 1.0)
			p = p.lerp(Vector3(gtrack[b + 1], gtrack[b + 2], gtrack[b + 3]), k)
			q = q.slerp(_quat(gtrack, b + 4), k)
	return Transform3D(Basis(q), p)


## «Иней, Кречет»
static func plane_title(info: Dictionary) -> String:
	var pname := str(Data.plane(str(info.get("def_id", ""))).get("name", ""))
	var cs := str(info.get("callsign", ""))
	if cs != "" and pname != "":
		return "%s, %s" % [cs, pname]
	return cs if cs != "" else pname


static func kill_text(e: Dictionary, planes: Dictionary) -> String:
	var txt := str(e.get("text", ""))
	if txt != "":
		return txt
	var v: Dictionary = planes.get(int(e.get("victim_uid", -1)), {})
	var k: Dictionary = planes.get(int(e.get("killer_uid", -1)), {})
	var vn := _short(v)
	if not k.is_empty():
		return "%s сбил %s" % [_short(k), vn]
	return "%s сбит" % vn


static func _short(info: Dictionary) -> String:
	var pname := str(Data.plane(str(info.get("def_id", ""))).get("name", "Самолёт"))
	var cs := str(info.get("callsign", ""))
	return "%s (%s)" % [pname, cs] if cs != "" else pname
