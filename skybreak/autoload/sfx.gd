extends Node
## Процедурные звуки. Всё синтезируется при запуске в AudioStreamWAV (16 бит, моно, 22 050 Гц).
## play() с позицией — пул из 24 AudioStreamPlayer3D в текущей сцене, без позиции — пул AudioStreamPlayer.

const RATE := 22050
const NOISE_N := 32768
const NOISE_MASK := NOISE_N - 1
const MAX_3D := 24
const MAX_2D := 12
const MAX_DISTANCE := 3000.0
const ENGINE_DB := -4.0
const WIND_DB := -12.0

const NAMES := ["gun_small", "gun_large", "cannon", "rocket", "bomb_drop", "explosion_small", "explosion_big",
	"hit", "flak", "missile_launch", "lock_tone", "missile_warning", "stall_warning", "gear", "click", "splash",
	"rearm_done", "capture"]

## Громкость (дБ) и unit_size для 3D.
const PLAY := {
	"gun_small": [-7.0, 30.0], "gun_large": [-5.0, 36.0], "cannon": [-3.0, 45.0], "rocket": [-4.0, 50.0],
	"bomb_drop": [-6.0, 25.0], "explosion_small": [0.0, 90.0], "explosion_big": [2.0, 160.0], "hit": [-5.0, 25.0],
	"flak": [-2.0, 90.0], "missile_launch": [-3.0, 60.0], "lock_tone": [-10.0, 20.0], "missile_warning": [-8.0, 20.0],
	"stall_warning": [-9.0, 20.0], "gear": [-8.0, 15.0], "click": [-8.0, 10.0], "splash": [-3.0, 70.0],
	"rearm_done": [-6.0, 20.0], "capture": [-5.0, 20.0],
}

var streams: Dictionary = {}          # имя -> AudioStreamWAV
var engine_streams: Dictionary = {}   # "prop", "jet", "rumble"
var wind_stream: AudioStreamWAV
var gen_ms: int = 0                   # сколько заняла генерация

var _rng := RandomNumberGenerator.new()
var _noise := PackedFloat32Array()
var _pool2d: Array = []
var _pool3d: Array = []
var _box3d: Node3D = null
var _box_pending: bool = false
var _seq: int = 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var t0 := Time.get_ticks_msec()
	_generate_all()
	gen_ms = Time.get_ticks_msec() - t0
	for i in MAX_2D:
		var p := AudioStreamPlayer.new()
		p.name = "Voice2D_%d" % i
		add_child(p)
		_pool2d.append(p)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_PREDELETE:
		stop_all()


## Останавливает все голоса (выход из игры, смена сцены).
func stop_all() -> void:
	for p in _pool2d:
		if is_instance_valid(p):
			p.stop()
	for p in _pool3d:
		if is_instance_valid(p):
			p.stop()


# ---------------------------------------------------------------- API

func play(name: String, pos = null, volume_db := 0.0, pitch := 1.0) -> void:
	var s: AudioStreamWAV = streams.get(name)
	if s == null:
		return
	var vol := _setting("effects_volume", 0.9)
	if vol <= 0.001:
		return
	var spec: Array = PLAY.get(name, [0.0, 40.0])
	var db := float(spec[0]) + volume_db + linear_to_db(vol)
	var pitch_v := clampf(pitch, 0.1, 4.0)
	if pos is Vector3:
		var p3 := _voice3d(pos)
		if p3 == null:
			return
		p3.stream = s
		p3.volume_db = db
		p3.pitch_scale = pitch_v
		p3.unit_size = float(spec[1])
		p3.global_position = pos
		p3.set_meta("t0", _next_seq())
		p3.play()
	else:
		var p2 := _voice2d()
		if p2 == null:
			return
		p2.stream = s
		p2.volume_db = db
		p2.pitch_scale = pitch_v
		p2.set_meta("t0", _next_seq())
		p2.play()


func make_engine(kind: String) -> AudioStreamPlayer3D:
	var jet := kind == "jet"
	var p := _make_3d_loop(engine_streams.jet if jet else engine_streams.prop, 32.0)
	p.name = "Engine"
	p.set_meta("sfx_kind", "jet" if jet else "prop")
	p.volume_db = ENGINE_DB + linear_to_db(maxf(_setting("engine_volume", 0.8), 0.0001))
	var r := _make_3d_loop(engine_streams.rumble, 40.0)
	r.name = "Rumble"
	r.volume_db = -80.0
	p.add_child(r)
	return p


func set_engine(player: AudioStreamPlayer3D, rpm01: float, afterburner: bool) -> void:
	if player == null or not is_instance_valid(player):
		return
	var rpm := clampf(rpm01, 0.0, 1.0)
	var vol := _setting("engine_volume", 0.8)
	var jet := str(player.get_meta("sfx_kind", "prop")) == "jet"
	player.pitch_scale = lerpf(0.6, 1.6, rpm)
	var lin := vol * (0.45 + 0.55 * rpm) * (1.2 if afterburner else 1.0)
	player.volume_db = ENGINE_DB + linear_to_db(maxf(lin, 0.0001)) if lin > 0.001 else -80.0
	var r := player.get_node_or_null("Rumble") as AudioStreamPlayer3D
	if r == null:
		return
	if afterburner and player.playing and vol > 0.001:
		r.pitch_scale = lerpf(0.85, 1.1, rpm)
		r.volume_db = ENGINE_DB + linear_to_db(vol * (1.15 if jet else 0.7))
		if not r.playing and r.is_inside_tree():
			r.play()
	elif r.playing:
		r.stop()


func make_wind() -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.name = "Wind"
	p.stream = wind_stream
	p.volume_db = WIND_DB + linear_to_db(maxf(_setting("effects_volume", 0.9), 0.0001))
	return p


func stream(name: String) -> AudioStream:
	return streams.get(name)


func sound_names() -> Array:
	return NAMES.duplicate()


# ---------------------------------------------------------------- голоса

func _setting(key: String, fallback: float) -> float:
	var prof = get_node_or_null("/root/Profile")
	if prof != null and prof.has_method("get_setting"):
		var v = prof.get_setting(key)
		if v != null:
			return clampf(float(v), 0.0, 2.0)
	return fallback


func _next_seq() -> int:
	_seq += 1
	return _seq


func _make_3d_loop(s: AudioStream, unit: float) -> AudioStreamPlayer3D:
	var p := AudioStreamPlayer3D.new()
	p.stream = s
	p.unit_size = unit
	p.max_distance = MAX_DISTANCE
	p.max_db = 3.0
	p.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
	p.attenuation_filter_cutoff_hz = 6000.0
	p.attenuation_filter_db = -18.0
	return p


func _voice2d() -> AudioStreamPlayer:
	var best: AudioStreamPlayer = null
	var best_t := 1 << 62
	for p in _pool2d:
		if not is_instance_valid(p):
			continue
		if not p.playing:
			return p
		var t := int(p.get_meta("t0", 0))
		if t < best_t:
			best_t = t
			best = p
	return best


func _voice3d(pos: Vector3) -> AudioStreamPlayer3D:
	if not is_inside_tree():
		return null
	var vp := get_viewport()
	var cam := vp.get_camera_3d() if vp != null else null
	if cam != null and cam.global_position.distance_to(pos) > MAX_DISTANCE:
		return null
	var box := _voice_box()
	if box == null:
		return null
	var best: AudioStreamPlayer3D = null
	var best_t := 1 << 62
	var i := _pool3d.size() - 1
	while i >= 0:
		var p = _pool3d[i]
		if not is_instance_valid(p) or p.get_parent() != box:
			_pool3d.remove_at(i)
		i -= 1
	for p in _pool3d:
		if not p.playing:
			return p
		var t := int(p.get_meta("t0", 0))
		if t < best_t:
			best_t = t
			best = p
	if _pool3d.size() < MAX_3D:
		var np := _make_3d_loop(null, 40.0)
		np.name = "Voice3D_%d" % _pool3d.size()
		box.add_child(np)
		_pool3d.append(np)
		return np
	if best != null:
		best.stop()
	return best


## Узел для 3D-голосов внутри текущей сцены (чтобы пауза и смена сцены работали сами).
func _voice_box() -> Node3D:
	var tree := get_tree()
	var scene := tree.current_scene if tree != null else null
	if scene == null:
		return null
	if _box3d != null and is_instance_valid(_box3d) and _box3d.get_parent() == scene and _box3d.is_inside_tree():
		return _box3d
	if _box_pending and _box3d != null and is_instance_valid(_box3d) and not _box3d.is_inside_tree():
		return null
	_box3d = Node3D.new()
	_box3d.name = "SfxVoices"
	_pool3d.clear()
	if scene.is_node_ready() and not scene.is_queued_for_deletion():
		scene.add_child(_box3d)
		_box_pending = false
		return _box3d
	scene.add_child.call_deferred(_box3d)
	_box_pending = true
	return null


# ---------------------------------------------------------------- синтез

func _generate_all() -> void:
	_rng.seed = 90210
	_noise.resize(NOISE_N)
	for i in NOISE_N:
		_noise[i] = _rng.randf_range(-1.0, 1.0)

	streams["gun_small"] = _wav(_burst(0.11, {"attack": 0.001, "tau": 0.022, "lp0": 6000.0, "lp1": 1800.0, "ctau": 0.03,
		"hp": 350.0, "tone": 170.0, "tone_end": 110.0, "tone_amp": 0.35, "tone_tau": 0.025}), false)
	streams["gun_large"] = _wav(_burst(0.17, {"attack": 0.001, "tau": 0.04, "lp0": 4200.0, "lp1": 900.0, "ctau": 0.04,
		"hp": 140.0, "tone": 120.0, "tone_end": 70.0, "tone_amp": 0.5, "tone_tau": 0.045}), false)
	streams["cannon"] = _wav(_burst(0.32, {"attack": 0.001, "tau": 0.07, "lp0": 2600.0, "lp1": 420.0, "ctau": 0.06,
		"hp": 50.0, "tone": 85.0, "tone_end": 45.0, "tone_amp": 0.7, "tone_tau": 0.08}), false)
	streams["rocket"] = _wav(_burst(0.85, {"attack": 0.02, "tau": 0.3, "lp0": 1200.0, "lp1": 3200.0, "ctau": 0.25,
		"hp": 180.0, "crackle": 0.35, "tone": 140.0, "tone_end": 60.0, "tone_amp": 0.25, "tone_tau": 0.06}), false)
	streams["explosion_small"] = _wav(_burst(1.1, {"attack": 0.003, "tau": 0.22, "lp0": 4500.0, "lp1": 260.0,
		"ctau": 0.14, "hp": 25.0, "crackle": 0.3, "tone": 60.0, "tone_end": 32.0, "tone_amp": 0.6, "tone_tau": 0.18}), false)
	streams["explosion_big"] = _wav(_burst(2.2, {"attack": 0.005, "tau": 0.55, "lp0": 2800.0, "lp1": 120.0,
		"ctau": 0.32, "hp": 18.0, "crackle": 0.15, "tone": 44.0, "tone_end": 24.0, "tone_amp": 0.8, "tone_tau": 0.4}), false)
	streams["flak"] = _wav(_burst(0.8, {"attack": 0.0008, "tau": 0.12, "lp0": 7000.0, "lp1": 550.0, "ctau": 0.035,
		"hp": 70.0, "crackle": 0.15, "tone": 95.0, "tone_end": 50.0, "tone_amp": 0.45, "tone_tau": 0.1}), false)
	streams["missile_launch"] = _wav(_burst(1.3, {"attack": 0.12, "tau": 0.6, "lp0": 350.0, "lp1": 5200.0,
		"ctau": 0.45, "hp": 150.0, "crackle": 0.2, "tone": 130.0, "tone_end": 70.0, "tone_amp": 0.3, "tone_tau": 0.05}), false)
	streams["splash"] = _wav(_splash(1.0), false)
	streams["hit"] = _wav(_hit(0.16), false)
	streams["bomb_drop"] = _wav(_bomb_drop(0.36), false)
	streams["click"] = _wav(_click(0.045), false)
	streams["gear"] = _wav(_gear(1.3), false)
	streams["lock_tone"] = _wav(_beeps(0.45, [[0.0, 0.45, 1100.0]], 0.15), false)
	streams["missile_warning"] = _wav(_beeps(0.7, [[0.0, 0.12, 950.0], [0.175, 0.12, 750.0], [0.35, 0.12, 950.0],
		[0.525, 0.12, 750.0]], 0.6), false)
	streams["stall_warning"] = _wav(_beeps(0.56, [[0.0, 0.22, 400.0], [0.3, 0.22, 400.0]], 1.0), false)
	streams["rearm_done"] = _wav(_chime(0.95, [[0.0, 784.0], [0.14, 1046.5]], 0.32), false)
	streams["capture"] = _wav(_chime(1.25, [[0.0, 523.25], [0.12, 659.25], [0.24, 783.99]], 0.42), false)

	engine_streams["prop"] = _wav(_loop(_prop_engine, 1.0, 0.08, false), true)
	engine_streams["jet"] = _wav(_loop(_jet_engine, 1.0, 0.12, true), true)
	engine_streams["rumble"] = _wav(_loop(_rumble, 1.0, 0.12, true), true)
	wind_stream = _wav(_loop(_wind, 2.0, 0.25, true), true)


## Шумовой удар: огибающая, фильтр НЧ с уходящей частотой среза, ФВЧ, низкий тон, треск.
func _burst(dur: float, o: Dictionary) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var attack: float = o.get("attack", 0.002)
	var tau: float = o.get("tau", 0.05)
	var lp0: float = o.get("lp0", 4000.0)
	var lp1: float = o.get("lp1", 1000.0)
	var ctau: float = o.get("ctau", tau)
	var hp: float = o.get("hp", 100.0)
	var tf: float = o.get("tone", 0.0)
	var tf_end: float = o.get("tone_end", tf)
	var ta: float = o.get("tone_amp", 0.0)
	var ttau: float = o.get("tone_tau", tau)
	var crackle: float = o.get("crackle", 0.0)
	var k := TAU / RATE
	var env_d := exp(-1.0 / (tau * RATE))
	var cenv_d := exp(-1.0 / (ctau * RATE))
	var tenv_d := exp(-1.0 / (ttau * RATE))
	var fdrop := pow(tf_end / tf, 1.0 / float(n)) if tf > 0.0 else 1.0
	var ahp := hp * k / (1.0 + hp * k)
	var att_n := maxi(1, int(attack * RATE))
	var env := 1.0
	var cenv := 1.0
	var tenv := 1.0
	var s1 := 0.0
	var s2 := 0.0
	var sh := 0.0
	var ph := 0.0
	var f := tf
	var off := _rng.randi() & NOISE_MASK
	var pop := 0.0
	for i in n:
		var w := _noise[(off + i) & NOISE_MASK]
		var fc := lp1 + (lp0 - lp1) * cenv
		var a := fc * k / (1.0 + fc * k)
		s1 += a * (w - s1)
		s2 += a * (s1 - s2)
		sh += ahp * (s2 - sh)
		var x := (s2 - sh) * sqrt(6000.0 / fc)
		if crackle > 0.0:
			if w > 0.994:
				pop = crackle * 2.5
			x += pop * w
			pop *= 0.93
		var ramp := 1.0
		if i < att_n:
			ramp = float(i) / float(att_n)
		else:
			env *= env_d
		var y := x * env * ramp
		if tf > 0.0:
			ph += f * k
			f *= fdrop
			y += sin(ph) * ta * tenv * ramp
			tenv *= tenv_d
		buf[i] = y
		cenv *= cenv_d
	return _normalize(buf, 0.92)


func _splash(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var k := TAU / RATE
	var off := _rng.randi() & NOISE_MASK
	var s1 := 0.0
	var s2 := 0.0
	var sh := 0.0
	var am := 0.0
	var env := 1.0
	var env_d := exp(-1.0 / (0.3 * RATE))
	var att_n := int(0.012 * RATE)
	var ahp := 450.0 * k / (1.0 + 450.0 * k)
	for i in n:
		var w := _noise[(off + i) & NOISE_MASK]
		var fc := 900.0 + 2600.0 * env
		var a := fc * k / (1.0 + fc * k)
		s1 += a * (w - s1)
		s2 += a * (s1 - s2)
		sh += ahp * (s2 - sh)
		# медленные «бульки»: случайная модуляция амплитуды
		am += 0.004 * (_noise[(off * 7 + i * 3) & NOISE_MASK] - am)
		var ramp := float(i) / float(att_n) if i < att_n else 1.0
		if i >= att_n:
			env *= env_d
		buf[i] = (s2 - sh) * env * ramp * (0.65 + 4.0 * absf(am))
	return _normalize(buf, 0.9)


func _hit(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var k := TAU / RATE
	var off := _rng.randi() & NOISE_MASK
	var nd := exp(-1.0 / (0.01 * RATE))
	var md := exp(-1.0 / (0.045 * RATE))
	var ne := 1.0
	var me := 1.0
	var sh := 0.0
	var ahp := 900.0 * k / (1.0 + 900.0 * k)
	for i in n:
		var w := _noise[(off + i) & NOISE_MASK]
		sh += ahp * (w - sh)
		var t := float(i) / RATE
		var ring := sin(TAU * 1250.0 * t) * 0.6 + sin(TAU * 2930.0 * t) * 0.35 + sin(TAU * 4410.0 * t) * 0.2
		buf[i] = (w - sh) * ne * 0.9 + ring * me * 0.5
		ne *= nd
		me *= md
	return _normalize(buf, 0.9)


func _bomb_drop(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	var d1 := exp(-1.0 / (0.06 * RATE))
	var d2 := exp(-1.0 / (0.025 * RATE))
	var dn := exp(-1.0 / (0.006 * RATE))
	var e1 := 1.0
	var e2 := 1.0
	var en := 1.0
	var lp := 0.0
	for i in n:
		var t := float(i) / RATE
		var w := _noise[(off + i) & NOISE_MASK]
		lp += 0.35 * (w - lp)
		var thud := sin(TAU * 150.0 * t) * e1 + sin(TAU * 410.0 * t) * e2 * 0.5
		# второй щелчок замка через 70 мс
		var t2 := t - 0.07
		var latch := 0.0
		if t2 > 0.0:
			latch = sin(TAU * 820.0 * t2) * exp(-t2 / 0.012) * 0.35
		buf[i] = thud + lp * en * 0.8 + latch
		e1 *= d1
		e2 *= d2
		en *= dn
	return _normalize(buf, 0.9)


func _click(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	for i in n:
		var t := float(i) / RATE
		buf[i] = sin(TAU * 2200.0 * t) * exp(-t / 0.006) + _noise[(off + i) & NOISE_MASK] * exp(-t / 0.002) * 0.5
	return _normalize(buf, 0.8)


## Привод шасси: жужжание мотора с зубцами, в конце — стук замка.
func _gear(dur: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	var ph := 0.0
	var lp := 0.0
	var lp2 := 0.0
	var run_end := 1.02
	for i in n:
		var t := float(i) / RATE
		var x := 0.0
		if t < run_end:
			var u := t / run_end
			var f := 75.0 + 45.0 * u
			ph += f / RATE
			var saw := 2.0 * (ph - floorf(ph)) - 1.0
			var teeth := 0.75 + 0.25 * sin(TAU * 21.0 * t)
			var fade := minf(1.0, t / 0.05) * minf(1.0, (run_end - t) / 0.06)
			x = (saw * 0.7 + _noise[(off + i) & NOISE_MASK] * 0.25) * teeth * fade
		var tc := t - run_end
		if tc > 0.0:
			x += (sin(TAU * 95.0 * tc) * 0.9 + _noise[(off + i * 3) & NOISE_MASK] * 0.6) * exp(-tc / 0.035)
		lp += 0.18 * (x - lp)
		lp2 += 0.18 * (lp - lp2)
		buf[i] = lp2
	return _normalize(buf, 0.85)


## Сигналы: список [начало, длительность, частота]; square — сколько нечётных гармоник добавить (0..1).
func _beeps(dur: float, parts: Array, square: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for p in parts:
		var s0 := int(float(p[0]) * RATE)
		var ln := int(float(p[1]) * RATE)
		var f: float = p[2]
		var edge := int(0.008 * RATE)
		for j in ln:
			var i := s0 + j
			if i >= n:
				break
			var ph := TAU * f * float(j) / RATE
			var v := sin(ph) + square * (sin(3.0 * ph) / 3.0 + sin(5.0 * ph) / 5.0 * 0.6)
			var g := minf(1.0, minf(float(j) / edge, float(ln - j) / edge))
			buf[i] += v * g
	return _normalize(buf, 0.8)


## Колокольчик: ноты [начало, частота], гармоники 1, 2, 3, экспоненциальное затухание.
func _chime(dur: float, notes: Array, tau: float) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var buf := PackedFloat32Array()
	buf.resize(n)
	for note in notes:
		var s0 := int(float(note[0]) * RATE)
		var f: float = note[1]
		var att := int(0.004 * RATE)
		for i in range(s0, n):
			var t := float(i - s0) / RATE
			var e := exp(-t / tau) * (minf(1.0, float(i - s0) / att))
			var ph := TAU * f * t
			buf[i] += (sin(ph) + 0.32 * sin(2.0 * ph) * exp(-t / (tau * 0.5)) + 0.12 * sin(3.0 * ph)) * e
	return _normalize(buf, 0.8)


## Зацикленный звук: генерирует dur + xfade и сводит хвост с началом.
func _loop(gen: Callable, dur: float, xfade: float, equal_power: bool) -> PackedFloat32Array:
	var n := int(dur * RATE)
	var x := int(xfade * RATE)
	var src: PackedFloat32Array = gen.call(n + x)
	var out := src.slice(0, n)
	for i in x:
		var u := float(i) / float(x)
		var wa := sqrt(u) if equal_power else u
		var wb := sqrt(1.0 - u) if equal_power else 1.0 - u
		out[i] = src[i] * wa + src[n + i] * wb
	# убираем постоянную составляющую (шум после фильтра даёт небольшой сдвиг)
	var mean := 0.0
	for v in out:
		mean += v
	mean /= float(n)
	for i in n:
		out[i] -= mean
	return _normalize(out, 0.85, false)


## Поршневой мотор: гармоники 50 Гц и пульсация лопастей 25 Гц (целое число периодов в секунде).
func _prop_engine(n: int) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(n)
	var phases := PackedFloat32Array()
	for h in 8:
		phases.append(_rng.randf() * TAU)
	var off := _rng.randi() & NOISE_MASK
	var lp := 0.0
	var lp2 := 0.0
	for i in n:
		var t := float(i) / RATE
		var b := TAU * 50.0 * t
		var v := sin(b + phases[0]) + 0.75 * sin(2.0 * b + phases[1]) + 0.55 * sin(3.0 * b + phases[2]) \
			+ 0.42 * sin(4.0 * b + phases[3]) + 0.3 * sin(5.0 * b + phases[4]) + 0.22 * sin(6.0 * b + phases[5]) \
			+ 0.15 * sin(7.0 * b + phases[6]) + 0.1 * sin(8.0 * b + phases[7])
		var blade := 0.5 + 0.5 * sin(TAU * 25.0 * t)
		var w := _noise[(off + i) & NOISE_MASK]
		lp += 0.12 * (w - lp)
		lp2 += 0.12 * (lp - lp2)
		var firing := 0.6 + 0.4 * sin(b)
		buf[i] = (v * 0.32 + lp2 * 1.6 * firing) * (0.62 + 0.38 * blade * blade)
	return buf


## Реактивный: шумовой гул + свист турбины (3000 и 4500 Гц).
func _jet_engine(n: int) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	var s1 := 0.0
	var s2 := 0.0
	var h1 := 0.0
	var h2 := 0.0
	for i in n:
		var t := float(i) / RATE
		var w := _noise[(off + i) & NOISE_MASK]
		s1 += 0.14 * (w - s1)
		s2 += 0.14 * (s1 - s2)
		h1 += 0.55 * (w - h1)
		h2 += 0.25 * (h1 - h2)
		var hiss := h1 - h2
		var whine := sin(TAU * 3000.0 * t) * 0.07 + sin(TAU * 4500.0 * t) * 0.035
		buf[i] = s2 * 2.4 + hiss * 0.35 + whine
	return buf


## Форсаж: низкий рокот с хлопками.
func _rumble(n: int) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	var s1 := 0.0
	var s2 := 0.0
	var m1 := 0.0
	var pop := 0.0
	for i in n:
		var w := _noise[(off + i) & NOISE_MASK]
		s1 += 0.04 * (w - s1)
		s2 += 0.04 * (s1 - s2)
		m1 += 0.2 * (w - m1)
		if w > 0.997:
			pop = 1.0
		pop *= 0.995
		buf[i] = s2 * 5.0 + m1 * 0.3 * (0.4 + pop)
	return buf


## Ветер: полосовой шум с медленной модуляцией (0,5 и 1,5 Гц — целое число периодов в 2 с).
func _wind(n: int) -> PackedFloat32Array:
	var buf := PackedFloat32Array()
	buf.resize(n)
	var off := _rng.randi() & NOISE_MASK
	var s1 := 0.0
	var s2 := 0.0
	var h := 0.0
	for i in n:
		var t := float(i) / RATE
		var w := _noise[(off + i) & NOISE_MASK]
		var gust := 0.7 + 0.2 * sin(TAU * 0.5 * t) + 0.1 * sin(TAU * 1.5 * t + 1.3)
		var a := 0.08 + 0.05 * gust
		s1 += a * (w - s1)
		s2 += a * (s1 - s2)
		h += 0.02 * (s2 - h)
		buf[i] = (s2 - h) * gust
	return buf


func _normalize(buf: PackedFloat32Array, peak: float, fade_end: bool = true) -> PackedFloat32Array:
	var m := 0.0
	for v in buf:
		var a := absf(v)
		if a > m:
			m = a
	if m < 0.000001:
		return buf
	var g := peak / m
	var n := buf.size()
	var fade := mini(int(0.004 * RATE), n / 4) if fade_end else 0
	var fade_in := mini(int(0.001 * RATE), n / 8) if fade_end else 0
	for i in n:
		buf[i] *= g
	# короткие нарастание и затухание по краям, чтобы не щёлкало
	for j in fade_in:
		buf[j] *= float(j) / float(fade_in)
	for j in fade:
		buf[n - 1 - j] *= float(j) / float(fade)
	return buf


func _wav(buf: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var n := buf.size()
	var bytes := PackedByteArray()
	bytes.resize(n * 2)
	for i in n:
		bytes.encode_s16(i * 2, int(clampf(buf[i], -1.0, 1.0) * 32767.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = bytes
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = n
	return w
