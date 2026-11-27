class_name BattleHUD
extends CanvasLayer
## Интерфейс боя. bind(battle) подключает сигналы MatchManager, дальше HUD каждый кадр читает
## состояние боя, самолёта игрока и камеры. Работает и на паузе (process_mode = ALWAYS).

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")
const HudEffects = preload("res://scripts/ui/hud_effects.gd")
const HudMarkers = preload("res://scripts/ui/hud_markers.gd")
const HudFlight = preload("res://scripts/ui/hud_flight.gd")
const HudWarnings = preload("res://scripts/ui/hud_warnings.gd")
const HudWeapons = preload("res://scripts/ui/hud_weapons.gd")
const HudScore = preload("res://scripts/ui/hud_score.gd")
const HudFeed = preload("res://scripts/ui/hud_feed.gd")
const HudOverlay = preload("res://scripts/ui/hud_overlay.gd")
const Minimap = preload("res://scripts/ui/minimap.gd")
const CockpitPanel = preload("res://scripts/ui/cockpit_panel.gd")
const TouchControls = preload("res://scripts/ui/touch_controls.gd")
const SpawnMenu = preload("res://scripts/ui/spawn_menu.gd")
const PauseMenu = preload("res://scripts/ui/pause_menu.gd")
const Scoreboard = preload("res://scripts/ui/scoreboard.gd")

const REFRESH := 1.0 / 15.0      # подписи обновляются не чаще 15 раз в секунду
const MAP_REFRESH := 0.1
const MINIMAP_SIZE := 200.0
const OUTCOME_WORDS := ["Победа", "Поражение", "Ничья"]

var battle = null
var root: Control = null
var u: float = 1.0
var touch_on: bool = false
var touch_override: int = -1     # -1 — по настройке, 0 — выкл, 1 — вкл (тесты, отладка)
var cockpit_on: bool = false
var flying: bool = false
var show_fps: bool = false
var frames: int = 0              # сколько раз отработал _process (для тестов)

var effects
var markers
var flight
var warnings
var weapons
var score
var minimap
var feed
var cockpit
var touch
var overlay
var scoreboard
var spawn_menu
var pause_menu

var end_result: Dictionary = {}
var killcam_info: Dictionary = {}

var _refresh_t: float = 0.0
var _map_t: float = 0.0
var _menu_was_open: bool = true
var _last_state: String = ""
var _vp_size: Vector2 = Vector2.ZERO


func _init() -> void:
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	name = "HUD"


func _ready() -> void:
	_ensure_built()
	var prof := D.autoload("Profile")
	if prof != null and prof.has_signal("changed") and not prof.is_connected("changed", _on_settings_changed):
		prof.connect("changed", _on_settings_changed)
	_on_settings_changed()


func _ensure_built() -> void:
	if root != null:
		return
	root = Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiStyle.make_theme()
	add_child(root)
	effects = _part(HudEffects, "Effects")
	markers = _part(HudMarkers, "Markers")
	cockpit = _part(CockpitPanel, "Cockpit")
	flight = _part(HudFlight, "Flight")
	weapons = _part(HudWeapons, "Weapons")
	warnings = _part(HudWarnings, "Warnings")
	score = _part(HudScore, "Score")
	minimap = _part(Minimap, "Minimap")
	feed = _part(HudFeed, "Feed")
	touch = _part(TouchControls, "Touch")
	overlay = _part(HudOverlay, "Overlay")
	scoreboard = _part(Scoreboard, "Scoreboard")
	spawn_menu = _part(SpawnMenu, "SpawnMenu")
	pause_menu = _part(PauseMenu, "PauseMenu")
	cockpit.visible = false
	touch.visible = false
	scoreboard.visible = false
	spawn_menu.visible = false
	pause_menu.visible = false
	touch.pause_pressed.connect(toggle_pause)
	spawn_menu.hangar_requested.connect(_quit_to_hangar)
	pause_menu.resume_requested.connect(resume)
	pause_menu.hangar_requested.connect(_quit_to_hangar)
	pause_menu.change_plane_requested.connect(_change_plane)


func _part(script: GDScript, n: String) -> Control:
	var c: Control = script.new()
	c.name = n
	c.set("hud", self)
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(c)
	return c


# ---------------------------------------------------------------- привязка к бою

func bind(p_battle) -> void:
	_ensure_built()
	if battle != null and is_instance_valid(battle) and battle != p_battle:
		_disconnect(battle)
	battle = p_battle
	end_result = {}
	killcam_info = {}
	for c in [markers, score, minimap, touch, spawn_menu, pause_menu, scoreboard]:
		c.battle = battle
	if battle == null or not is_instance_valid(battle):
		return
	_connect("kill_event", _on_kill_event)
	_connect("message", _on_message)
	_connect("state_changed", _on_state_changed)
	_connect("player_spawned", _on_player_spawned)
	_connect("player_killed", _on_player_killed)
	_connect("match_ended", _on_match_ended)
	minimap.setup(battle)
	_on_settings_changed()
	feed.player_name = _player_name()
	if D.alive_node(battle.player):
		touch.configure(battle.player)
	_last_state = ""
	_vp_size = Vector2.ZERO
	_apply_state(String(battle.state))
	_refresh_t = 0.0


func _connect(sig: String, cb: Callable) -> void:
	if battle.has_signal(sig) and not battle.is_connected(sig, cb):
		battle.connect(sig, cb)


func _disconnect(b) -> void:
	for pair in [["kill_event", _on_kill_event], ["message", _on_message], ["state_changed", _on_state_changed],
			["player_spawned", _on_player_spawned], ["player_killed", _on_player_killed], ["match_ended", _on_match_ended]]:
		if b.has_signal(pair[0]) and b.is_connected(pair[0], pair[1]):
			b.disconnect(pair[0], pair[1])


func _player_name() -> String:
	var n = D.setting("player_name")
	if n != null and String(n).strip_edges() != "":
		return String(n).strip_edges()
	return "1DEX1"


func _on_settings_changed() -> void:
	var want_touch := Game.is_touch()
	if touch_override >= 0:
		want_touch = touch_override == 1
	if want_touch != touch_on:
		touch_on = want_touch
		_vp_size = Vector2.ZERO
	var f = D.setting("show_fps")
	show_fps = bool(f) if f != null else false
	if touch != null:
		touch.read_settings()


## Включить/выключить сенсорные кнопки в обход настроек (для тестов и отладки).
func set_touch_override(v: int) -> void:
	touch_override = v
	_on_settings_changed()


# ---------------------------------------------------------------- сигналы боя

func _on_kill_event(text: String, killer_team: int, victim_team: int) -> void:
	feed.add_kill(text, killer_team, victim_team)


func _on_message(text: String, seconds: float) -> void:
	# итог боя показывает баннер
	if text in OUTCOME_WORDS:
		return
	# о конце вылетов говорит панель «Самолётов не осталось»
	if text == "Вылетов не осталось" and String(D.prop(battle, "state", "")) == "dead":
		return
	feed.add_message(text, seconds)


func _on_state_changed(state: String) -> void:
	_apply_state(state)


func _on_player_spawned(ac) -> void:
	effects.reset()
	killcam_info = {}
	overlay.killcam_on = false
	if D.alive_node(ac):
		touch.configure(ac)
		var cs := String(D.prop(ac, "callsign", ""))
		if cs != "":
			feed.player_name = cs
	_menu_was_open = true
	_refresh_t = 0.0


func _on_player_killed(info: Dictionary) -> void:
	killcam_info = info.duplicate()
	overlay.killcam_info = killcam_info
	overlay.killcam_skippable = int(info.get("killer_uid", -1)) >= 0
	effects.hit_flash(0.9)
	overlay.queue_redraw()


func _on_match_ended(result: Dictionary) -> void:
	end_result = result.duplicate()
	var mode := String(D.prop(battle, "mode", "arcade"))
	var text := HudOverlay.banner_for(end_result, mode)
	overlay.banner_text = text
	match String(end_result.get("outcome", "")):
		"win":
			overlay.banner_color = UiStyle.GOOD
		"loss":
			overlay.banner_color = UiStyle.DANGER
		_:
			overlay.banner_color = UiStyle.TEXT
	overlay.banner_sub = ""
	if HudScore.battle_shows_score(battle) and text != "":
		var t = battle.tickets
		if t is Array and (t as Array).size() >= 2:
			overlay.banner_sub = "Синие %s : %s Красные" % [Game.fmt_int(int(round(float(t[0])))), Game.fmt_int(int(round(float(t[1]))))]
	if pause_menu.visible:
		pause_menu.close()
	spawn_menu.visible = false
	overlay.queue_redraw()


func _apply_state(state: String) -> void:
	_last_state = state
	_refresh_t = 0.0
	match state:
		"spawn":
			spawn_menu.show_spawn()
		"dead":
			spawn_menu.show_dead()
		_:
			spawn_menu.visible = false
	if state != "killcam":
		overlay.killcam_on = false
	if state == "flying":
		touch.release_all()


# ---------------------------------------------------------------- пауза и выход

func toggle_pause() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	if bool(D.prop(battle, "paused", false)) or pause_menu.visible:
		if pause_menu.visible and not pause_menu.back():
			return
		resume()
		return
	var st := String(battle.state)
	if st == "ended" or st == "killcam":
		return
	battle.set_paused(true)
	pause_menu.open()


func resume() -> void:
	pause_menu.close()
	if battle != null and is_instance_valid(battle) and bool(D.prop(battle, "paused", false)):
		battle.set_paused(false)


func _quit_to_hangar() -> void:
	if battle == null or not is_instance_valid(battle):
		return
	pause_menu.close()
	battle.quit_to_hangar()


func _change_plane() -> void:
	resume()
	if battle != null and is_instance_valid(battle) and battle.has_method("return_to_spawn_menu"):
		battle.return_to_spawn_menu()


func _input(event: InputEvent) -> void:
	if battle == null or not is_instance_valid(battle):
		return
	if event.is_echo():
		return
	if InputMap.has_action("pause") and event.is_action_pressed("pause"):
		var st := String(battle.state)
		if st == "ended" or st == "killcam":
			return
		toggle_pause()
		get_viewport().set_input_as_handled()


# ---------------------------------------------------------------- кадр

func _layout() -> void:
	var vs := root.get_viewport_rect().size if root.is_inside_tree() else Vector2(1280, 720)
	if vs == _vp_size:
		return
	_vp_size = vs
	u = clampf(minf(vs.x / 1280.0, vs.y / 720.0), 0.75, 3.0)
	for c in [effects, markers, cockpit, flight, weapons, warnings, score, minimap, feed, touch, overlay, scoreboard]:
		if "u" in c:
			c.u = u
	feed.kill_top = 16.0 * u + MINIMAP_SIZE * u + 14.0 * u
	feed.kill_visible = 3 if touch_on else HudFeed.KILL_MAX
	overlay.touch = touch_on
	spawn_menu.set_ui_scale(u, touch_on)
	touch.read_settings()
	for c in [effects, markers, cockpit, flight, weapons, warnings, score, minimap, feed, touch, overlay, scoreboard]:
		c.queue_redraw()


func _process(dt: float) -> void:
	frames += 1
	if root == null:
		return
	if battle == null or not is_instance_valid(battle):
		root.visible = false
		return
	root.visible = true
	_layout()
	var st := String(battle.state)
	if st != _last_state:
		_apply_state(st)
	var pl = battle.player
	if not D.alive_node(pl):
		pl = null
	flying = st == "flying" and pl != null
	var rig = D.prop(battle, "camera_rig")
	cockpit_on = flying and rig != null and int(D.prop(rig, "mode", 0)) == CameraRig.Mode.COCKPIT
	var paused := bool(D.prop(battle, "paused", false))
	if paused and not pause_menu.visible:
		pause_menu.open()
	elif not paused and pause_menu.visible:
		pause_menu.close()

	markers.visible = flying
	flight.visible = flying and not cockpit_on
	warnings.visible = flying
	weapons.visible = flying
	cockpit.visible = cockpit_on
	weapons.bottom_offset = cockpit.panel_height() + 8.0 * u if cockpit_on else 0.0
	minimap.visible = st != "ended" and st != "killcam"
	score.visible = st != "killcam"
	feed.visible = st != "killcam"
	touch.visible = touch_on and flying and not paused
	spawn_menu.visible = (st == "spawn" or st == "dead") and end_result.is_empty()
	overlay.killcam_on = st == "killcam"
	var sb_held := InputMap.has_action("scoreboard") and Input.is_action_pressed("scoreboard") and not paused
	var want_sb := st == "ended" or sb_held
	if want_sb and not scoreboard.visible:
		scoreboard.refresh()
	scoreboard.visible = want_sb
	scoreboard.top_offset = 70.0 * u if overlay.banner_text != "" else 0.0

	var cam: Camera3D = null
	if root.is_inside_tree():
		cam = root.get_viewport().get_camera_3d()
	effects.update(dt, battle, pl if flying else null, cam, String(battle.mode) == "realistic")
	if flying:
		markers.tick(dt)
	feed.tick(dt)
	warnings.tick(dt)
	weapons.tick(dt)
	if cockpit_on:
		cockpit.refresh(pl, dt)
	if touch.visible:
		touch.tick(dt)
	if spawn_menu.visible:
		spawn_menu.tick(dt)
	if scoreboard.visible:
		scoreboard.tick(dt)
	_refresh_t -= dt
	if _refresh_t <= 0.0:
		_refresh_t = REFRESH
		_refresh_labels(pl, st)
	_map_t -= dt
	if _map_t <= 0.0:
		_map_t = MAP_REFRESH
		if minimap.visible:
			minimap.queue_redraw()
	_update_mouse(st, paused)


func _refresh_labels(pl, st: String) -> void:
	if flying:
		flight.refresh(pl)
		warnings.refresh(pl, battle)
		weapons.refresh(pl)
	score.refresh()
	var spec := ""
	if st == "spawn" or st == "dead":
		var t = D.prop(battle, "spectate_target")
		if not D.alive_node(t):
			t = D.prop(D.prop(battle, "camera_rig"), "target")
		if D.alive_node(t) and t != battle.player:
			var plane := String(Data.plane(String(D.prop(t, "def_id", ""))).get("name", ""))
			spec = "Наблюдение: " + String(D.prop(t, "callsign", ""))
			if plane != "":
				spec += ", " + plane
	overlay.spectate_text = spec
	overlay.fps_text = ("%d FPS" % Engine.get_frames_per_second()) if show_fps else ""
	overlay.queue_redraw()


func _pilot_mode() -> String:
	var pl = D.prop(battle, "player")
	var p = D.prop(pl, "pilot")
	if p != null and "mode" in p:
		return String(p.mode)
	var pp = D.prop(battle, "player_pilot")
	if pp != null and "mode" in pp:
		return String(pp.mode)
	return ""


## Мышь видна, пока открыто меню; при возврате в полёт с наведением мышью — снова захвачена.
func _update_mouse(st: String, paused: bool) -> void:
	var menu_open := paused or st == "spawn" or st == "dead" or st == "ended"
	if DisplayServer.get_name() != "headless":
		if menu_open:
			if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif _menu_was_open and flying and _pilot_mode() == "mouse" and not touch_on:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	_menu_was_open = menu_open
