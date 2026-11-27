class_name Killcam
extends Node3D
## Киллкам: последние секунды из записи. Призрачные модели, своя камера за сбившим,
## надпись «Вас сбил: Иней, Кречет». Бой под ним идёт дальше. Пропуск — огонь, Esc или касание.
## Если сбившего нет в записи (зенитка, разбился) — неподвижная камера смотрит на падающий самолёт.

signal finished

const NEAR_RADIUS := 2000.0
const SKIP_DELAY := 0.25
const UNIT_TEXT := {"aa": "Вас сбила зенитка", "ship": "Вас сбил корабль", "tank": "Вас сбил танк",
	"carrier": "Вас сбил авианосец"}

var battle = null
var victim_uid: int = -1
var killer_uid: int = -1
var seconds: float = 6.0
var mode: String = ""               # "chase" | "fixed"
var playing: bool = false
var title_text: String = ""
var hint_text: String = ""
var camera: Camera3D
var overlay: CanvasLayer = null
var force_overlay: bool = false     # рисовать свою надпись, даже если её рисует HUD

var _data: Dictionary = {}
var _ghosts: Dictionary = {}        # uid -> ReplayGhost
var _t0: float = 0.0
var _t1: float = 0.0
var _elapsed: float = 0.0
var _done: bool = false
var _hidden: Array = []
var _fx = null
var _ev_i: int = 0
var _tr_i: int = 0
var _real_victim = null
var _victim_gone_t: float = -1.0
var _fixed_from: Vector3 = Vector3.ZERO
var _look: Vector3 = Vector3.ZERO
var _cam_pos: Vector3 = Vector3.ZERO
var _cam_init: bool = false
var _engine: AudioStreamPlayer3D = null


func play(p_battle, p_victim: int, p_killer: int, p_seconds := 6.0) -> void:
	battle = p_battle
	victim_uid = p_victim
	killer_uid = p_killer
	seconds = maxf(float(p_seconds), 0.5)
	var rec = null
	if battle != null and is_instance_valid(battle):
		rec = battle.get("recorder")
	if rec == null or not is_instance_valid(rec):
		_finish_deferred()
		return
	var now := float(rec.current_time())
	_data = ReplayData.decode(rec.window(maxf(0.0, now - seconds), now))
	_t0 = float(_data.start)
	_t1 = float(_data.end)
	_fx = Effects.new()
	_fx.name = "KillcamFx"
	if "record_events" in _fx:
		_fx.record_events = false
	add_child(_fx)

	_real_victim = _entity(victim_uid)
	if _real_victim != null and not ("fm" in _real_victim or "model" in _real_victim):
		_real_victim = null
	title_text = _title()
	var tracks: Dictionary = _data.tracks
	if tracks.has(killer_uid) and _t1 - _t0 > 0.2:
		mode = "chase"
		_build_ghosts()
		_hide_real()
		_start_engine()
	elif _real_victim != null:
		mode = "fixed"
		var vp: Vector3 = _real_victim.global_position
		var vel := Vector3.ZERO
		if _real_victim.has_method("velocity"):
			vel = _real_victim.velocity()
		_fixed_from = _fixed_point(vp, vel)
	elif tracks.has(victim_uid):
		mode = "fixed"
		_add_ghost(victim_uid, true)
		var s0 := ReplayData.sample(tracks[victim_uid], _t0)
		var p0: Vector3 = s0.pos
		var v0: Vector3 = s0.vel
		_fixed_from = _fixed_point(p0, v0)
	else:
		_finish_deferred()
		return

	camera = Camera3D.new()
	camera.name = "KillcamCamera"
	camera.near = 0.3
	camera.far = 14000.0
	camera.fov = _setting_fov()
	add_child(camera)
	if camera.is_inside_tree():
		camera.make_current()
	else:
		camera.call_deferred("make_current")
	_build_overlay()
	playing = true
	_update(0.0)


func skip() -> void:
	_finish()


# ---------------------------------------------------------------- кадр

func _process(delta: float) -> void:
	if not playing or _done:
		return
	_elapsed += delta
	_update(delta)
	if mode == "fixed" and _real_victim != null:
		var gone: bool = not is_instance_valid(_real_victim) or ("exploded" in _real_victim and bool(_real_victim.exploded))
		if gone and _victim_gone_t < 0.0:
			_victim_gone_t = _elapsed
		if _elapsed >= seconds or (_victim_gone_t >= 0.0 and _elapsed - _victim_gone_t > 1.5):
			_finish()
	elif _elapsed >= (_t1 - _t0) + 0.4:
		_finish()


func _input(event: InputEvent) -> void:
	if not playing or _done or _elapsed < SKIP_DELAY:
		return
	var do_skip := false
	if event is InputEventScreenTouch and event.pressed:
		do_skip = true
	elif event is InputEventKey or event is InputEventMouseButton or event is InputEventJoypadButton or event is InputEventJoypadMotion or event is InputEventAction:
		for a in ["fire_guns", "pause"]:
			if InputMap.has_action(a) and event.is_action_pressed(a):
				do_skip = true
	if do_skip:
		get_viewport().set_input_as_handled()
		_finish()


func _update(dt: float) -> void:
	var t := minf(_t0 + _elapsed, _t1)
	var tracks: Dictionary = _data.tracks
	for uid in _ghosts:
		(_ghosts[uid] as ReplayGhost).apply(ReplayData.sample(tracks[uid], t), dt)
	_play_events(t)
	if _engine != null and _ghosts.has(killer_uid):
		var kg: ReplayGhost = _ghosts[killer_uid]
		var s := ReplayData.sample(tracks[killer_uid], t)
		Sfx.set_engine(_engine, float(s.throttle), (int(s.flags) & ReplayData.F_AFTERBURNER) != 0)
		if not kg.present and _engine.playing:
			_engine.stop()
	if camera == null:
		return
	if mode == "chase":
		_chase_camera(dt)
	else:
		_fixed_camera(dt)


func _play_events(t: float) -> void:
	var events: Array = _data.events
	while _ev_i < events.size() and float(events[_ev_i].t) <= t:
		var e: Dictionary = events[_ev_i]
		_ev_i += 1
		if e.type == "explosion" and _fx != null:
			_fx.explosion(ReplayData.vec(e.get("pos")), float(e.get("size", 1.0)))
	var tr: PackedFloat32Array = _data.tracers
	var st := ReplayData.T_STRIDE
	while (_tr_i + 1) * st <= tr.size() and tr[_tr_i * st] <= t:
		var o := _tr_i * st
		_tr_i += 1
		if _fx != null:
			var col := Color(1.0, 0.45, 0.3) if tr[o + 7] > 0.5 else Color(1.0, 0.85, 0.45)
			_fx.tracer_line(Vector3(tr[o + 1], tr[o + 2], tr[o + 3]), Vector3(tr[o + 4], tr[o + 5], tr[o + 6]), col)


func _chase_camera(dt: float) -> void:
	var k: ReplayGhost = _ghosts.get(killer_uid)
	if k == null or not k.present:
		return
	var kp := k.last_pos
	var kb := k.basis_now()
	var v: ReplayGhost = _ghosts.get(victim_uid)
	var target := kp - kb.z * 200.0
	if v != null and v.present:
		target = v.last_pos
	var dir := target - kp
	var dist := dir.length()
	dir = -kb.z if dist < 1.0 else dir / dist
	var up := kb.y.lerp(Vector3.UP, 0.6).normalized()
	var desired := kp - dir * (k.size * 1.2 + 9.0) + up * (k.size * 0.25 + 2.5)
	desired = _above_ground(desired, 4.0)
	if not _cam_init:
		_cam_pos = desired
		_look = target
		_cam_init = true
	else:
		var a := 1.0 - exp(-dt * 6.0)
		_cam_pos = _cam_pos.lerp(desired, a)
		_look = _look.lerp(target, 1.0 - exp(-dt * 8.0))
	camera.global_position = _cam_pos
	_safe_look(camera, _look, up)


func _fixed_camera(_dt: float) -> void:
	var target := _look
	if _real_victim != null and is_instance_valid(_real_victim):
		target = _real_victim.global_position
	elif _ghosts.has(victim_uid) and (_ghosts[victim_uid] as ReplayGhost).present:
		target = (_ghosts[victim_uid] as ReplayGhost).last_pos
	if not _cam_init:
		_cam_init = true
		_look = target
	_look = target
	camera.global_position = _fixed_from
	_safe_look(camera, _look, Vector3.UP)


func _fixed_point(p: Vector3, vel: Vector3) -> Vector3:
	var spd := vel.length()
	var fwd := vel / spd if spd > 1.0 else Vector3.FORWARD
	var side := fwd.cross(Vector3.UP)
	side = side.normalized() if side.length() > 0.1 else Vector3.RIGHT
	var at := p + fwd * clampf(spd * 1.2, 40.0, 260.0) + side * 90.0 + Vector3.UP * 20.0
	return _above_ground(at, 15.0)


func _above_ground(p: Vector3, margin: float) -> Vector3:
	var w = battle.get("world") if battle != null and is_instance_valid(battle) else null
	var h := 0.0
	if w != null and is_instance_valid(w) and w.has_method("height_at"):
		h = maxf(float(w.height_at(p.x, p.z)), 0.0)
	if p.y < h + margin:
		p.y = h + margin
	return p


static func _safe_look(cam: Camera3D, target: Vector3, up: Vector3) -> void:
	var d := target - cam.global_position
	if d.length() < 0.05:
		return
	var u := up
	if absf(d.normalized().dot(u.normalized())) > 0.995:
		u = Vector3.FORWARD
	cam.look_at(target, u)


# ---------------------------------------------------------------- призраки

func _build_ghosts() -> void:
	var tracks: Dictionary = _data.tracks
	# подпись только у жертвы: сбивший и так в кадре и назван в надписи
	_add_ghost(killer_uid, false)
	if tracks.has(victim_uid):
		_add_ghost(victim_uid, true)
	var center_track: PackedFloat32Array = tracks.get(victim_uid, tracks[killer_uid])
	for uid in tracks:
		if _ghosts.has(uid):
			continue
		var near := false
		for i in 5:
			var t := lerpf(_t0, _t1, float(i) / 4.0)
			var a := ReplayData.sample(tracks[uid], t)
			var c := ReplayData.sample(center_track, t)
			var ap: Vector3 = a.pos
			var cp: Vector3 = c.pos
			if a.present and c.present and ap.distance_to(cp) < NEAR_RADIUS:
				near = true
				break
		if near:
			_add_ghost(uid, false)


func _add_ghost(uid: int, tagged: bool) -> void:
	var g := ReplayGhost.new()
	g.setup(uid, _data.planes.get(uid, {}), _fx)
	g.show_tag = tagged
	add_child(g)
	_ghosts[uid] = g


func _start_engine() -> void:
	var g: ReplayGhost = _ghosts.get(killer_uid)
	if g == null:
		return
	_engine = Sfx.make_engine(str(g.def.get("kind", "prop")))
	if _engine == null:
		return
	g.add_child(_engine)
	if _engine.is_inside_tree():
		_engine.play()


func _hide_real() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	var list = battle.get("aircraft")
	if not (list is Array):
		return
	for ac in list:
		if ac == null or not is_instance_valid(ac):
			continue
		var m = ac.get("model")
		if m != null and is_instance_valid(m) and m.visible:
			m.visible = false
			_hidden.append(ac)


func _restore_real() -> void:
	for ac in _hidden:
		if ac == null or not is_instance_valid(ac):
			continue
		if "exploded" in ac and bool(ac.exploded):
			continue
		var m = ac.get("model")
		if m != null and is_instance_valid(m):
			m.visible = true
	_hidden.clear()


# ---------------------------------------------------------------- надпись

func _title() -> String:
	var info: Dictionary = _data.get("planes", {}).get(killer_uid, {})
	if not info.is_empty() and str(info.get("def_id", "")) != "":
		return "Вас сбил: " + ReplayData.plane_title(info)
	var ent = _entity(killer_uid)
	if ent != null:
		if "kind" in ent:
			return str(UNIT_TEXT.get(str(ent.kind), "Вас сбили с земли"))
		if "callsign" in ent and "def" in ent:
			return "Вас сбил: %s, %s" % [str(ent.callsign), str(ent.def.get("name", ""))]
	return "Самолёт сбит"


func _hud_draws_killcam() -> bool:
	if battle == null or not is_instance_valid(battle):
		return false
	var hud = battle.get("hud")
	return hud != null and is_instance_valid(hud) and "killcam_info" in hud


func _build_overlay() -> void:
	var touch := false
	var g = get_node_or_null("/root/Game")
	if g != null and g.has_method("is_touch"):
		touch = bool(g.is_touch())
	hint_text = "Пропустить: коснись экрана" if touch else "Пропустить: Пробел"
	if _hud_draws_killcam() and not force_overlay:
		return
	overlay = CanvasLayer.new()
	overlay.name = "KillcamOverlay"
	overlay.layer = 60
	add_child(overlay)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.add_child(root)
	for top in [true, false]:
		var bar := ColorRect.new()
		bar.color = Color(0, 0, 0, 0.82)
		bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
		bar.anchor_left = 0.0
		bar.anchor_right = 1.0
		bar.anchor_top = 0.0 if top else 0.925
		bar.anchor_bottom = 0.075 if top else 1.0
		root.add_child(bar)
	var title := UiStyle.outlined_label(title_text, 28, Color.WHITE)
	title.name = "Title"
	title.add_theme_constant_override("outline_size", 6)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.anchor_left = 0.0
	title.anchor_right = 1.0
	title.anchor_top = 0.925
	title.anchor_bottom = 0.925
	title.offset_top = -52.0
	title.offset_bottom = -10.0
	root.add_child(title)
	var hint := UiStyle.label(hint_text, 15, Color(1, 1, 1, 0.75))
	hint.name = "Hint"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	hint.anchor_left = 0.0
	hint.anchor_right = 1.0
	hint.anchor_top = 0.925
	hint.anchor_bottom = 1.0
	root.add_child(hint)


# ---------------------------------------------------------------- конец

func _finish_deferred() -> void:
	call_deferred("_finish")


func _finish() -> void:
	if _done:
		return
	_done = true
	playing = false
	_restore_real()
	_restore_camera()
	if _engine != null and is_instance_valid(_engine):
		_engine.stop()
	finished.emit()
	queue_free()


func _restore_camera() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	var rig = battle.get("camera_rig")
	if rig == null or not is_instance_valid(rig):
		return
	var cam = rig.get("camera")
	if cam != null and is_instance_valid(cam) and cam.is_inside_tree():
		cam.make_current()


func _exit_tree() -> void:
	if not _done:
		_restore_real()
		if camera != null and is_instance_valid(camera) and camera.current:
			_restore_camera()


func _entity(uid: int):
	if uid < 0 or battle == null or not is_instance_valid(battle) or not battle.has_method("get_entity"):
		return null
	var e = battle.get_entity(uid)
	if e == null or not is_instance_valid(e):
		return null
	return e


func _setting_fov() -> float:
	var prof = get_node_or_null("/root/Profile")
	if prof != null and prof.has_method("get_setting"):
		var v = prof.get_setting("fov")
		if v != null:
			return clampf(float(v), 50.0, 100.0)
	return 70.0
