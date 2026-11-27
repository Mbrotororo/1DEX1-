extends Node3D
## Сцена повтора. Берёт Game.last_replay (или user://replays/last.json), строит тот же мир
## (World.build с тем же seed), призрачные модели, эффекты по событиям. Управление временем и камерами.

const SEEK_STEP := 5.0
const KILL_LEAD := 5.0
const FREE_SPEED := 70.0
const WRECK_SMOKE_SECONDS := 40.0
const HINT := "Пауза: Пробел   Перемотка: ← →   Самолёт: Tab"
const HINT_FREE := "Камера: WASD, Q / E, мышь   Быстрее: Shift"
const STATUS_GONE := "Нет в воздухе"

var data: Dictionary = {}
var t: float = 0.0
var speed: float = 1.0
var playing: bool = true
var cam_mode: String = "chase"
var selected_uid: int = -1
var loaded: bool = false
var world = null
var fx = null
var camera: Camera3D
var ui: ReplayUI
var ghosts: Dictionary = {}          # uid -> ReplayGhost
var ground_nodes: Dictionary = {}    # uid -> Node3D (GroundUnit)

var _order: Array = []               # uid самолётов по командам
var _ev_i: int = 0
var _tr_i: int = 0
var _gdead: Dictionary = {}          # uid -> bool (текущее состояние)
var _gbase: Dictionary = {}          # uid -> Transform3D исходная поза
var _gmats: Dictionary = {}          # uid -> [[MeshInstance3D, Material]]
var _gsmoke: Dictionary = {}         # uid -> Node3D
var _wreck_mat: StandardMaterial3D
var _cam_init: bool = false
var _cam_pos: Vector3 = Vector3.ZERO
var _look: Vector3 = Vector3.ZERO
var _orbit_yaw: float = 0.6
var _orbit_pitch: float = 0.25
var _orbit_dist: float = 40.0
var _free_yaw: float = 0.0
var _free_pitch: float = 0.0
var _dragging: bool = false
var _drag_moved: bool = false
var _resume_after_drag: bool = false
var _engine: AudioStreamPlayer3D = null
var _engine_uid: int = -1
var _gun_snd_t: float = 0.0
var _hidden_canopy: Node3D = null
var _plane_text_cache: String = ""


func _ready() -> void:
	var rep: Dictionary = Game.last_replay if Game.last_replay is Dictionary else {}
	if rep.is_empty():
		rep = load_saved()
	data = ReplayData.decode(rep)
	ui = ReplayUI.new()
	ui.name = "UI"
	add_child(ui)
	ui.back_pressed.connect(_on_back)
	if not data.valid:
		ui.build_empty()
		return
	_build_scene()
	_build_ui()
	selected_uid = _initial_plane()
	_orbit_dist = _ghost_size(selected_uid) * 2.2 + 20.0
	loaded = true
	seek(float(data.start))
	_update_ui_plane()


func _exit_tree() -> void:
	if _engine != null and is_instance_valid(_engine):
		_engine.stop()


static func load_saved() -> Dictionary:
	if not FileAccess.file_exists(Recorder.SAVE_PATH):
		return {}
	var txt := FileAccess.get_file_as_string(Recorder.SAVE_PATH)
	if txt == "":
		return {}
	var parsed = JSON.parse_string(txt)
	return parsed if parsed is Dictionary else {}


# ---------------------------------------------------------------- сборка

func _build_scene() -> void:
	world = World.new()
	world.name = "World"
	add_child(world)
	world.build(Data.map_def(str(data.map_id)), str(data.time_of_day), str(data.weather), int(data.seed), 1000)
	if world.has_method("set_units_active"):
		world.set_units_active(false)
	_ensure_environment()

	fx = Effects.new()
	fx.name = "Effects"
	if "record_events" in fx:
		fx.record_events = false
	if "light_level" in fx and world.has_method("ambient_light_level"):
		fx.light_level = float(world.ambient_light_level())
	add_child(fx)

	camera = Camera3D.new()
	camera.name = "Camera"
	camera.near = 0.2
	camera.far = 14000.0
	camera.fov = _setting("fov", 70.0)
	add_child(camera)
	camera.make_current()

	var planes_root := Node3D.new()
	planes_root.name = "Planes"
	add_child(planes_root)
	var tracks: Dictionary = data.tracks
	for uid in tracks:
		var g := ReplayGhost.new()
		g.setup(int(uid), data.planes.get(uid, {}), fx)
		planes_root.add_child(g)
		ghosts[int(uid)] = g
	_order = ghosts.keys()
	_order.sort_custom(func(a, b):
		var ta := int(data.planes.get(a, {}).get("team", 0))
		var tb := int(data.planes.get(b, {}).get("team", 0))
		return a < b if ta == tb else ta < tb)

	_wreck_mat = StandardMaterial3D.new()
	_wreck_mat.albedo_color = Color(0.13, 0.12, 0.11)
	_wreck_mat.roughness = 1.0
	var by_uid: Dictionary = {}
	var wl = world.get("ground_units")
	if wl is Array:
		for u in wl:
			if u != null and is_instance_valid(u) and "uid" in u:
				by_uid[int(u.uid)] = u
	var ground_root := Node3D.new()
	ground_root.name = "ExtraGround"
	add_child(ground_root)
	var ground: Dictionary = data.ground
	for uid in ground:
		var node = by_uid.get(int(uid))
		if node == null:
			node = _make_ground(int(uid), ground[uid], ground_root)
		if node == null:
			continue
		if "active" in node:
			node.active = false
		ground_nodes[int(uid)] = node
		_gbase[int(uid)] = node.global_transform if node.is_inside_tree() else node.transform


func _make_ground(uid: int, g: Dictionary, parent: Node3D) -> Node3D:
	var u := GroundUnit.new()
	if "variant" in u and str(g.get("variant", "")) != "":
		u.variant = str(g.variant)
	u.setup(str(g.kind), int(g.team), g.pos, float(g.heading), uid, world)
	if "active" in u:
		u.active = false
	parent.add_child(u)
	return u


## Если мир не поставил окружение и свет (например, заглушка), ставим простые.
func _ensure_environment() -> void:
	if find_children("*", "WorldEnvironment", true, false).is_empty():
		var we := WorldEnvironment.new()
		we.name = "FallbackEnvironment"
		var env := Environment.new()
		var sky := Sky.new()
		var mat := ProceduralSkyMaterial.new()
		mat.sky_top_color = Color(0.32, 0.5, 0.75)
		mat.sky_horizon_color = Color(0.72, 0.8, 0.88)
		mat.ground_bottom_color = Color(0.3, 0.32, 0.3)
		mat.ground_horizon_color = Color(0.62, 0.66, 0.66)
		sky.sky_material = mat
		env.background_mode = Environment.BG_SKY
		env.sky = sky
		env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
		env.ambient_light_energy = 0.8
		env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
		env.fog_enabled = true
		env.fog_density = 0.00008
		env.fog_light_color = Color(0.7, 0.78, 0.86)
		we.environment = env
		add_child(we)
	if find_children("*", "DirectionalLight3D", true, false).is_empty():
		var sun := DirectionalLight3D.new()
		sun.name = "FallbackSun"
		sun.rotation = Vector3(deg_to_rad(-50.0), deg_to_rad(35.0), 0.0)
		sun.light_energy = 1.1
		add_child(sun)


func _build_ui() -> void:
	var kills: Array = []
	for e in data.kills:
		var kt := int(e.get("killer_team", -1))
		var col := UiStyle.team_color(kt).lightened(0.2) if kt >= 0 else UiStyle.TEXT
		kills.append({"t": float(e.t), "text": ReplayData.kill_text(e, data.planes), "color": col})
	ui.build(_info_text(), float(data.start), float(data.end), kills)
	ui.play_toggled.connect(toggle_play)
	ui.speed_chosen.connect(set_speed)
	ui.seek_requested.connect(seek)
	ui.plane_step.connect(step_plane)
	ui.camera_chosen.connect(set_camera_mode)
	ui.kill_chosen.connect(jump_to_kill)
	ui.slider_drag.connect(_on_slider_drag)
	ui.set_playing(playing)
	ui.set_speed(speed)
	ui.set_camera(cam_mode)
	ui.set_hint(HINT)


func _info_text() -> String:
	var m: Dictionary = Data.map_def(str(data.map_id))
	var parts: Array = [str(m.get("name", ""))]
	parts.append(str(Data.TIME_NAMES.get(str(data.time_of_day), "")).to_lower())
	parts.append(str(Data.WEATHER_NAMES.get(str(data.weather), "")).to_lower())
	var txt := ", ".join(parts)
	var mode_name := str(Data.MODE_NAMES.get(str(data.mode), ""))
	if mode_name != "":
		txt = mode_name + ". " + txt
	return txt


func _initial_plane() -> int:
	for uid in _order:
		if bool(data.planes.get(uid, {}).get("player", false)):
			return int(uid)
	return int(_order[0]) if not _order.is_empty() else -1


# ---------------------------------------------------------------- управление

func toggle_play() -> void:
	if not loaded:
		return
	if not playing and t >= float(data.end) - 0.01:
		seek(float(data.start))
	playing = not playing
	ui.set_playing(playing)


func set_speed(s: float) -> void:
	speed = clampf(s, 0.25, 4.0)
	ui.set_speed(speed)


func seek(nt: float) -> void:
	if not loaded:
		return
	t = clampf(nt, float(data.start), float(data.end))
	var events: Array = data.events
	_ev_i = 0
	while _ev_i < events.size() and float(events[_ev_i].t) <= t:
		_ev_i += 1
	var tr: PackedFloat32Array = data.tracers
	var n := tr.size() / ReplayData.T_STRIDE
	_tr_i = ReplayData.find_index(tr, ReplayData.T_STRIDE, t) + 1
	_tr_i = clampi(_tr_i, 0, n)
	_cam_init = false
	_update_ground(true)
	_update_ghosts(0.0)
	_update_camera(0.0)
	ui.set_time(t, float(data.start), float(data.end))


func step_plane(dir: int) -> void:
	if _order.is_empty():
		return
	var pool: Array = []
	for uid in _order:
		if (ghosts[uid] as ReplayGhost).present or uid == selected_uid:
			pool.append(uid)
	if pool.size() <= 1:
		pool = _order
	var i := pool.find(selected_uid)
	i = 0 if i < 0 else (i + dir + pool.size()) % pool.size()
	select_plane(int(pool[i]))


func select_plane(uid: int) -> void:
	if not ghosts.has(uid):
		return
	_restore_canopy()
	selected_uid = uid
	_cam_init = false
	_orbit_dist = _ghost_size(uid) * 2.2 + 20.0
	_update_ui_plane()


func set_camera_mode(mode: String) -> void:
	if not mode in ["chase", "cockpit", "orbit", "free"]:
		return
	if mode == "free" and camera != null:
		var f := -camera.global_transform.basis.z
		_free_yaw = atan2(-f.x, -f.z)
		_free_pitch = asin(clampf(f.y, -1.0, 1.0))
	if mode == "orbit" and camera != null and ghosts.has(selected_uid):
		var off := camera.global_position - (ghosts[selected_uid] as ReplayGhost).last_pos
		if off.length() > 1.0:
			_orbit_yaw = atan2(off.x, off.z)
			_orbit_pitch = clampf(asin(clampf(off.normalized().y, -1.0, 1.0)), -1.2, 1.4)
	_restore_canopy()
	cam_mode = mode
	_cam_init = false
	ui.set_camera(mode)
	ui.set_hint(HINT + ("\n" + HINT_FREE if mode == "free" else ""))


func jump_to_kill(index: int) -> void:
	if index < 0 or index >= data.kills.size():
		return
	var e: Dictionary = data.kills[index]
	var killer := int(e.get("killer_uid", -1))
	var victim := int(e.get("victim_uid", -1))
	if ghosts.has(killer):
		select_plane(killer)
	elif ghosts.has(victim):
		select_plane(victim)
	seek(float(e.t) - KILL_LEAD)
	if not playing:
		toggle_play()


func _on_back() -> void:
	Game.go_hangar()


func _on_slider_drag(active: bool) -> void:
	if active:
		_resume_after_drag = playing
		playing = false
	else:
		playing = _resume_after_drag
	ui.set_playing(playing)


# ---------------------------------------------------------------- кадр

func _process(delta: float) -> void:
	if not loaded:
		return
	_gun_snd_t -= delta
	if playing:
		var nt := t + delta * speed
		if nt >= float(data.end):
			nt = float(data.end)
			playing = false
			ui.set_playing(false)
		_advance(nt)
	if cam_mode == "free":
		_free_move(delta)
	_update_ghosts(delta * speed if playing else 0.0)
	_update_camera(delta)
	_update_engine()
	ui.set_time(t, float(data.start), float(data.end))
	_update_ui_plane()


func _advance(nt: float) -> void:
	var events: Array = data.events
	while _ev_i < events.size() and float(events[_ev_i].t) <= nt:
		_on_event(events[_ev_i])
		_ev_i += 1
	var tr: PackedFloat32Array = data.tracers
	var st := ReplayData.T_STRIDE
	while (_tr_i + 1) * st <= tr.size() and tr[_tr_i * st] <= nt:
		var o := _tr_i * st
		_tr_i += 1
		var a := Vector3(tr[o + 1], tr[o + 2], tr[o + 3])
		var b := Vector3(tr[o + 4], tr[o + 5], tr[o + 6])
		var col := Color(1.0, 0.45, 0.3) if tr[o + 7] > 0.5 else Color(1.0, 0.85, 0.45)
		fx.tracer_line(a, b, col)
		if _gun_snd_t <= 0.0 and camera != null and camera.global_position.distance_to(a) < 700.0:
			_gun_snd_t = 0.09
			Sfx.play("gun_large", a, -3.0)
	t = nt
	_update_ground(false)


func _on_event(e: Dictionary) -> void:
	match str(e.type):
		"explosion":
			fx.explosion(ReplayData.vec(e.get("pos")), float(e.get("size", 1.0)))
		"kill":
			var kt := int(e.get("killer_team", -1))
			var col := UiStyle.team_color(kt).lightened(0.2) if kt >= 0 else UiStyle.TEXT
			ui.show_message(ReplayData.kill_text(e, data.planes), col)


func _update_ghosts(dt: float) -> void:
	var tracks: Dictionary = data.tracks
	for uid in ghosts:
		var g: ReplayGhost = ghosts[uid]
		g.apply(ReplayData.sample(tracks[uid], t), dt)
		if uid == selected_uid and (cam_mode == "cockpit" or cam_mode == "chase"):
			g.tag.visible = false


# ---------------------------------------------------------------- наземные цели

func _update_ground(force: bool) -> void:
	var tracks: Dictionary = data.ground_tracks
	var deaths: Dictionary = data.ground_deaths
	var dead_before: Dictionary = data.ground_dead
	for uid in ground_nodes:
		var node = ground_nodes[uid]
		if node == null or not is_instance_valid(node):
			continue
		var death_t := -INF if dead_before.has(uid) else float(deaths.get(uid, INF))
		var dead := t >= death_t
		var pose = null
		if tracks.has(uid):
			pose = ReplayData.ground_pose(tracks[uid], minf(t, death_t) if death_t > -INF else t)
		var base: Transform3D = pose if pose != null else _gbase[uid]
		if dead != bool(_gdead.get(uid, false)) or force:
			_set_ground_dead(uid, node, dead, death_t)
		if str(node.get("kind")) == "ship" and dead:
			var since := t - death_t if death_t > -INF else 60.0
			var sink := minf(since * 0.35, 20.0)
			var xf := base
			xf.origin.y -= sink
			xf.basis = xf.basis * Basis(Vector3(0, 0, 1), minf(since * 0.01, 0.35))
			node.global_transform = xf
			node.visible = sink < 19.5
		elif pose != null or force:
			node.global_transform = base


func _set_ground_dead(uid: int, node: Node3D, dead: bool, death_t: float) -> void:
	_gdead[uid] = dead
	if dead:
		if not _gmats.has(uid):
			var list: Array = []
			for mi in node.find_children("*", "MeshInstance3D", true, false):
				list.append([mi, (mi as MeshInstance3D).material_override])
			_gmats[uid] = list
		if str(node.get("kind")) != "carrier":
			for pair in _gmats[uid]:
				if is_instance_valid(pair[0]):
					(pair[0] as MeshInstance3D).material_override = _wreck_mat
		var since := t - death_t
		if not _gsmoke.has(uid) and since < WRECK_SMOKE_SECONDS and fx != null:
			_gsmoke[uid] = fx.attach_smoke(node, Vector3(0, 2.0, 0), true)
	else:
		if _gmats.has(uid):
			for pair in _gmats[uid]:
				if is_instance_valid(pair[0]):
					(pair[0] as MeshInstance3D).material_override = pair[1]
		if _gsmoke.has(uid):
			var s = _gsmoke[uid]
			if s != null and is_instance_valid(s):
				s.queue_free()
			_gsmoke.erase(uid)
		node.visible = true


## true, если цель на момент t уничтожена (для тестов и подписей).
func is_ground_dead(uid: int) -> bool:
	return bool(_gdead.get(uid, false))


# ---------------------------------------------------------------- камера

func _update_camera(dt: float) -> void:
	if camera == null:
		return
	var g: ReplayGhost = ghosts.get(selected_uid)
	if cam_mode == "free":
		camera.global_basis = Basis.from_euler(Vector3(_free_pitch, _free_yaw, 0.0))
		return
	if g == null or not g.present:
		return
	var p := g.last_pos
	var b := g.basis_now()
	var k := 1.0 if not _cam_init else 1.0 - exp(-dt * 6.0 * maxf(1.0, speed))
	match cam_mode:
		"chase":
			var up := b.y.lerp(Vector3.UP, 0.5).normalized()
			var desired := p + b.z * (g.size * 1.3 + 10.0) + up * (g.size * 0.28 + 2.5)
			desired = _above_ground(desired, 3.0)
			var look := p - b.z * 40.0
			_cam_pos = desired if not _cam_init else _cam_pos.lerp(desired, k)
			_look = look if not _cam_init else _look.lerp(look, minf(1.0, k * 1.5))
			camera.global_position = _cam_pos
			_safe_look(_look, up)
			camera.near = 0.2
		"cockpit":
			var c := g.marker_local("Cockpit", Vector3(0, 0.8, -g.size * 0.15)) + Vector3(0, 0.12, 0)
			camera.global_transform = Transform3D(b, p + b * c)
			camera.near = 0.05
			_hide_canopy(g)
		"orbit":
			if not _dragging:
				_orbit_yaw += dt * 0.3
			var off := Vector3(cos(_orbit_pitch) * sin(_orbit_yaw), sin(_orbit_pitch), cos(_orbit_pitch) * cos(_orbit_yaw))
			camera.global_position = _above_ground(p + off * _orbit_dist, 3.0)
			_safe_look(p, Vector3.UP)
			camera.near = 0.2
	_cam_init = true


func _free_move(delta: float) -> void:
	var dir := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		dir.z -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		dir.z += 1.0
	if Input.is_physical_key_pressed(KEY_A):
		dir.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		dir.x += 1.0
	if Input.is_physical_key_pressed(KEY_E):
		dir.y += 1.0
	if Input.is_physical_key_pressed(KEY_Q):
		dir.y -= 1.0
	if dir == Vector3.ZERO:
		return
	var v := FREE_SPEED * (4.0 if Input.is_physical_key_pressed(KEY_SHIFT) else 1.0)
	var bas := Basis.from_euler(Vector3(_free_pitch, _free_yaw, 0.0))
	var move := bas * Vector3(dir.x, 0.0, dir.z) + Vector3.UP * dir.y
	camera.global_position = _above_ground(camera.global_position + move.normalized() * v * delta, 2.0)
	camera.near = 0.2


func _hide_canopy(g: ReplayGhost) -> void:
	if _hidden_canopy != null:
		return
	var c := g.model.find_child("Canopy", true, false) as Node3D
	if c != null and c.visible:
		c.visible = false
		_hidden_canopy = c


func _restore_canopy() -> void:
	if _hidden_canopy != null and is_instance_valid(_hidden_canopy):
		_hidden_canopy.visible = true
	_hidden_canopy = null


func _safe_look(target: Vector3, up: Vector3) -> void:
	var d := target - camera.global_position
	if d.length() < 0.05:
		return
	var u := up
	if absf(d.normalized().dot(u.normalized())) > 0.995:
		u = Vector3.FORWARD
	camera.look_at(target, u)


func _above_ground(p: Vector3, margin: float) -> Vector3:
	if world != null and world.has_method("height_at"):
		var h := maxf(float(world.height_at(p.x, p.z)), 0.0)
		if p.y < h + margin:
			p.y = h + margin
	return p


func _ghost_size(uid: int) -> float:
	var g: ReplayGhost = ghosts.get(uid)
	return g.size if g != null else 10.0


# ---------------------------------------------------------------- звук и подписи

func _update_engine() -> void:
	var g: ReplayGhost = ghosts.get(selected_uid)
	if _engine_uid != selected_uid:
		if _engine != null and is_instance_valid(_engine):
			_engine.queue_free()
		_engine = null
		_engine_uid = selected_uid
		if g != null:
			_engine = Sfx.make_engine(str(g.def.get("kind", "prop")))
			if _engine != null:
				g.add_child(_engine)
	if _engine == null or not is_instance_valid(_engine) or g == null:
		return
	var alive := g.present and (g.flags & ReplayData.F_ALIVE) != 0
	if not playing or not alive:
		if _engine.playing:
			_engine.stop()
		return
	var s := ReplayData.sample(data.tracks[selected_uid], t)
	if not _engine.playing and _engine.is_inside_tree():
		_engine.play()
	Sfx.set_engine(_engine, float(s.throttle), (int(s.flags) & ReplayData.F_AFTERBURNER) != 0)
	_engine.pitch_scale *= clampf(speed, 0.5, 2.0)


func _update_ui_plane() -> void:
	var g: ReplayGhost = ghosts.get(selected_uid)
	if g == null:
		ui.set_plane("", UiStyle.TEXT, "")
		return
	var status := "" if g.present else STATUS_GONE
	var text := ReplayData.plane_title(g.info)
	var key := text + "|" + status
	if key == _plane_text_cache:
		return
	_plane_text_cache = key
	ui.set_plane(text, UiStyle.team_color(int(g.info.get("team", 0))).lightened(0.2), status)


func _setting(key: String, fallback: float) -> float:
	var prof = get_node_or_null("/root/Profile")
	if prof != null and prof.has_method("get_setting"):
		var v = prof.get_setting(key)
		if v != null:
			return float(v)
	return fallback


# ---------------------------------------------------------------- ввод

func _unhandled_input(event: InputEvent) -> void:
	if not loaded:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var code: int = event.physical_keycode if event.physical_keycode != 0 else event.keycode
		match code:
			KEY_SPACE:
				toggle_play()
			KEY_LEFT:
				seek(t - SEEK_STEP)
			KEY_RIGHT:
				seek(t + SEEK_STEP)
			KEY_TAB:
				step_plane(-1 if event.shift_pressed else 1)
			KEY_1:
				set_camera_mode("chase")
			KEY_2:
				set_camera_mode("cockpit")
			KEY_3:
				set_camera_mode("orbit")
			KEY_4:
				set_camera_mode("free")
			_:
				return
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT or event.button_index == MOUSE_BUTTON_RIGHT:
			_dragging = event.pressed
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_orbit_dist = maxf(_ghost_size(selected_uid) * 0.8 + 4.0, _orbit_dist * 0.9)
		elif event.pressed and event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_orbit_dist = minf(600.0, _orbit_dist * 1.1)
	elif event is InputEventMouseMotion and _dragging:
		_rotate_view(event.relative)
	elif event is InputEventScreenDrag:
		_rotate_view(event.relative)


func _rotate_view(rel: Vector2) -> void:
	var k := 0.005
	if cam_mode == "orbit":
		_orbit_yaw -= rel.x * k
		_orbit_pitch = clampf(_orbit_pitch + rel.y * k, -1.2, 1.4)
	elif cam_mode == "free":
		_free_yaw -= rel.x * k
		_free_pitch = clampf(_free_pitch - rel.y * k, -1.5, 1.5)
