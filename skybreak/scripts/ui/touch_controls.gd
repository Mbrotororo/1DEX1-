extends Control
## Сенсорное управление: плавающий стик, кнопки оружия, газ, форсаж, шасси, вид, пауза.
## Мультитач: каждое касание запоминается по index. Пишет battle.player_pilot.touch_input:
## {stick, guns, rocket, bomb, missile, flares, afterburner, gear, camera, brake, extinguish,
##  throttle (только пока тянут ползунок газа), aim_delta (копится, PlayerPilot обнуляет)}.

signal pause_pressed

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const STICK_R := 74.0
const KNOB_R := 32.0
const FIRE_R := 62.0
const BTN_R := 36.0
const SMALL_R := 29.0
const ARC_R := 110.0
const ARC_ANGLES := [180.0, 222.0, 264.0, 306.0]
const HOLD_KEYS := ["guns", "rocket", "bomb", "missile", "flares", "gear", "camera", "brake", "extinguish"]

var hud = null
var battle = null
var u: float = 1.0
var button_scale: float = 1.0
var left_handed: bool = false

var buttons: Array = []          # [{id, label, kind:"hold"|"toggle"|"tap", c:Vector2, r:float, shown:bool, pressed:bool}]
var stick_vec: Vector2 = Vector2.ZERO
var stick_active: bool = false
var stick_base: Vector2 = Vector2.ZERO
var stick_knob: Vector2 = Vector2.ZERO
var throttle_drag: float = -1.0  # 0..1 пока тянут ползунок, иначе -1
var throttle_rect: Rect2 = Rect2()
var afterburner_on: bool = false
var aim_accum: Vector2 = Vector2.ZERO

var _touches: Dictionary = {}    # index -> {role:"stick"|"button"|"throttle"|"aim", id:String}
var _def_id: String = ""
var _layout_size: Vector2 = Vector2.ZERO
var _ammo: Dictionary = {}
var _locked: bool = false
var _throttle_now: float = 0.0
var _neutral_sent: bool = false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visibility_changed.connect(_on_visibility_changed)


func _on_visibility_changed() -> void:
	if not is_visible_in_tree():
		release_all()


func read_settings() -> void:
	var bs = D.setting("button_scale")
	button_scale = clampf(float(bs), 0.7, 1.5) if bs != null else 1.0
	var lh = D.setting("left_handed")
	left_handed = bool(lh) if lh != null else false
	_layout_size = Vector2.ZERO


## Набор кнопок под оружие самолёта.
func configure(pl) -> void:
	var def: Dictionary = D.prop(pl, "def", {})
	_def_id = String(D.prop(pl, "def_id", ""))
	afterburner_on = false
	buttons.clear()
	var w: Dictionary = def.get("weapons", {})
	_add("guns", "Огонь", "hold")
	if int(w.get("rockets", {}).get("count", 0)) > 0:
		_add("rocket", "Ракеты", "hold")
	if int(w.get("bombs", {}).get("count", 0)) > 0:
		_add("bomb", "Бомбы", "hold")
	if int(w.get("missiles", {}).get("count", 0)) > 0:
		_add("missile", "Ракета\nВ-В", "hold")
	if int(w.get("flares", 0)) > 0:
		_add("flares", "Ловушки", "hold")
	if float(def.get("afterburner", 0.0)) > 0.0:
		_add("afterburner", "Форсаж", "toggle")
	_add("gear", "Шасси", "hold")
	_add("camera", "Вид", "tap")
	_add("pause", "Пауза", "tap")
	_add("brake", "Тормоз", "hold")
	_add("extinguish", "Тушить", "hold")
	_layout_size = Vector2.ZERO
	release_all()


func _add(id: String, label: String, kind: String) -> void:
	buttons.append({"id": id, "label": label, "kind": kind, "c": Vector2.ZERO, "r": BTN_R, "shown": true, "pressed": false})


func button(id: String) -> Dictionary:
	for b in buttons:
		if b.id == id:
			return b
	return {}


func has_button(id: String) -> bool:
	return not button(id).is_empty()


func _mx(x: float) -> float:
	return size.x - x if left_handed else x


func layout() -> void:
	_layout_size = size
	var s := u * button_scale
	var W := size.x
	var H := size.y
	var fire := Vector2(_mx(W - 120.0 * s), H - 120.0 * s)
	var slot := 0
	for b in buttons:
		match String(b.id):
			"guns":
				b.c = fire
				b.r = FIRE_R * s
			"rocket", "bomb", "missile", "flares":
				var ang := deg_to_rad(float(ARC_ANGLES[mini(slot, ARC_ANGLES.size() - 1)]))
				var off := Vector2.from_angle(ang) * ARC_R * s
				if left_handed:
					off.x = -off.x
				b.c = fire + off
				b.r = BTN_R * s
				slot += 1
			"extinguish":
				b.c = Vector2(_mx(W - 52.0 * s), H - 300.0 * s)
				b.r = SMALL_R * s
			"brake":
				b.c = Vector2(_mx(W - 132.0 * s), H - 318.0 * s)
				b.r = SMALL_R * s
			"afterburner":
				b.c = Vector2(_mx(112.0 * s), H * 0.45 + 34.0 * s)
				b.r = 33.0 * s
			"pause":
				b.c = Vector2(16.0 * u + SMALL_R * s, 16.0 * u + SMALL_R * s)
				b.r = SMALL_R * s
			"camera":
				b.c = Vector2(W - 224.0 * u - 40.0 * s, 16.0 * u + SMALL_R * s)
				b.r = SMALL_R * s
			"gear":
				b.c = Vector2(W - 224.0 * u - 40.0 * s - 70.0 * s, 16.0 * u + SMALL_R * s)
				b.r = SMALL_R * s
	var tw := 44.0 * s
	var tx := _mx(20.0 * s + tw * 0.5) - tw * 0.5
	throttle_rect = Rect2(tx, H * 0.45, tw, 180.0 * s)
	stick_base = Vector2(_mx(220.0 * s), H - 130.0 * s)
	if not stick_active:
		stick_knob = stick_base


## Обновление каждый кадр: видимость ситуативных кнопок, запись в touch_input.
func tick(_dt: float) -> void:
	if battle == null or not is_instance_valid(battle):
		return
	var pl = battle.player
	if D.alive_node(pl) and String(D.prop(pl, "def_id", "")) != _def_id:
		configure(pl)
	if _layout_size != size:
		layout()
	var fm = D.prop(pl, "fm")
	var dmg = D.prop(pl, "dmg")
	var weapons = D.prop(pl, "weapons")
	_throttle_now = clampf(float(D.prop(fm, "throttle", 0.0)), 0.0, 1.0)
	_ammo = D.prop(weapons, "ammo", {})
	_locked = float(D.prop(weapons, "lock_progress", 0.0)) >= 0.999 and D.prop(weapons, "lock_target") != null
	for b in buttons:
		match String(b.id):
			"brake":
				b.shown = bool(D.prop(fm, "on_ground", false))
			"extinguish":
				b.shown = bool(D.prop(dmg, "on_fire", false))
		if not b.shown and b.pressed:
			b.pressed = false
	write_input()
	queue_redraw()


func _pilot():
	if battle == null or not is_instance_valid(battle):
		return null
	var p = D.prop(battle, "player_pilot")
	if p != null and "touch_input" in p:
		return p
	return null


func write_input() -> void:
	var p = _pilot()
	if p == null:
		return
	var ti: Dictionary = p.touch_input
	ti["stick"] = stick_vec
	for k in HOLD_KEYS:
		var b := button(k)
		ti[k] = not b.is_empty() and bool(b.shown) and bool(b.pressed)
	ti["afterburner"] = afterburner_on
	if throttle_drag >= 0.0:
		ti["throttle"] = throttle_drag
	else:
		ti.erase("throttle")
	if aim_accum != Vector2.ZERO:
		var prev = ti.get("aim_delta", Vector2.ZERO)
		ti["aim_delta"] = (prev if prev is Vector2 else Vector2.ZERO) + aim_accum
		aim_accum = Vector2.ZERO
	_neutral_sent = false


func release_all() -> void:
	_touches.clear()
	stick_active = false
	stick_vec = Vector2.ZERO
	stick_knob = stick_base
	throttle_drag = -1.0
	aim_accum = Vector2.ZERO
	for b in buttons:
		b.pressed = false
	if not _neutral_sent:
		var p = _pilot()
		if p != null:
			var ti: Dictionary = p.touch_input
			ti["stick"] = Vector2.ZERO
			for k in HOLD_KEYS:
				ti[k] = false
			ti["afterburner"] = afterburner_on
			ti.erase("throttle")
			_neutral_sent = true
	queue_redraw()


# ---------------------------------------------------------------- касания

func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not is_inside_tree() or get_tree().paused:
		return
	if event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			touch_down(st.index, st.position)
		else:
			touch_up(st.index)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		touch_move(sd.index, sd.position, sd.relative)
		get_viewport().set_input_as_handled()


func _button_at(p: Vector2) -> Dictionary:
	for b in buttons:
		if b.shown and p.distance_to(b.c) <= float(b.r) * 1.12:
			return b
	return {}


func _in_stick_zone(p: Vector2) -> bool:
	var x := size.x - p.x if left_handed else p.x
	return x < size.x * 0.42 and p.y > size.y * 0.42


func touch_down(index: int, p: Vector2) -> void:
	if _layout_size != size:
		layout()
	var b := _button_at(p)
	if not b.is_empty():
		_touches[index] = {"role": "button", "id": b.id}
		match String(b.kind):
			"hold":
				b.pressed = true
			"toggle":
				b.pressed = true
				if b.id == "afterburner":
					afterburner_on = not afterburner_on
			"tap":
				b.pressed = true
				_tap(String(b.id))
		queue_redraw()
		return
	if throttle_rect.grow(14.0 * u).has_point(p):
		_touches[index] = {"role": "throttle", "id": ""}
		_set_throttle(p)
		return
	if _in_stick_zone(p) and not stick_active:
		_touches[index] = {"role": "stick", "id": ""}
		stick_active = true
		stick_base = p
		stick_knob = p
		stick_vec = Vector2.ZERO
		queue_redraw()
		return
	_touches[index] = {"role": "aim", "id": ""}


func touch_move(index: int, p: Vector2, relative: Vector2) -> void:
	if not _touches.has(index):
		return
	var t: Dictionary = _touches[index]
	match String(t.role):
		"stick":
			var s := u * button_scale
			var d := p - stick_base
			var max_r := STICK_R * s
			if d.length() > max_r:
				d = d.normalized() * max_r
			stick_knob = stick_base + d
			stick_vec = d / max_r
			queue_redraw()
		"throttle":
			_set_throttle(p)
		"aim":
			aim_accum += relative
		"button":
			# палец ушёл с кнопки удержания — отпускаем
			var b := button(String(t.id))
			if not b.is_empty() and String(b.kind) == "hold":
				var inside := p.distance_to(b.c) <= float(b.r) * 1.5
				if b.pressed != inside:
					b.pressed = inside
					queue_redraw()


func touch_up(index: int) -> void:
	if not _touches.has(index):
		return
	var t: Dictionary = _touches[index]
	_touches.erase(index)
	match String(t.role):
		"stick":
			stick_active = false
			stick_vec = Vector2.ZERO
			if _layout_size != size:
				layout()
			stick_base = Vector2(_mx(220.0 * u * button_scale), size.y - 130.0 * u * button_scale)
			stick_knob = stick_base
		"throttle":
			throttle_drag = -1.0
		"button":
			var b := button(String(t.id))
			if not b.is_empty():
				b.pressed = afterburner_on if b.id == "afterburner" else false
	queue_redraw()


func _set_throttle(p: Vector2) -> void:
	var r := throttle_rect
	throttle_drag = clampf((r.end.y - p.y) / r.size.y, 0.0, 1.0)
	queue_redraw()


func _tap(id: String) -> void:
	match id:
		"pause":
			pause_pressed.emit()
		"camera":
			var rig = D.prop(battle, "camera_rig")
			if rig != null and rig.has_method("toggle_cockpit"):
				rig.toggle_cockpit()


# ---------------------------------------------------------------- рисование

func _draw() -> void:
	if buttons.is_empty():
		return
	var s := u * button_scale
	# стик
	var base_a := 0.55 if stick_active else 0.32
	draw_circle(stick_base, STICK_R * s, Color(0.05, 0.07, 0.09, base_a * 0.6))
	draw_arc(stick_base, STICK_R * s, 0.0, TAU, 48, Color(1, 1, 1, base_a), 2.0 * u, true)
	draw_circle(stick_knob, KNOB_R * s, Color(1, 1, 1, 0.28 if stick_active else 0.16))
	draw_arc(stick_knob, KNOB_R * s, 0.0, TAU, 32, Color(1, 1, 1, 0.6 if stick_active else 0.3), 2.0 * u, true)
	# газ
	var tr := throttle_rect
	draw_style_box(D.box(Color(0.05, 0.07, 0.09, 0.62), int(8 * u), Color(1, 1, 1, 0.45), int(2 * u)), tr)
	var val := throttle_drag if throttle_drag >= 0.0 else _throttle_now
	var inner := tr.grow(-5.0 * u)
	var fh := inner.size.y * val
	draw_rect(Rect2(inner.position.x, inner.end.y - fh, inner.size.x, fh), Color(UiStyle.ACCENT, 0.8) if afterburner_on else Color(1, 1, 1, 0.5))
	var hy := inner.end.y - fh
	draw_rect(Rect2(tr.position.x - 4.0 * u, hy - 3.0 * u, tr.size.x + 8.0 * u, 6.0 * u), Color(1, 1, 1, 0.9))
	var fs := int(round(13.0 * s))
	D.text(self, Vector2(tr.get_center().x, tr.position.y - 8.0 * u), "Газ", fs, UiStyle.TEXT, 0, null, 3)
	D.text(self, Vector2(tr.get_center().x, tr.end.y + 18.0 * u), "%d %%" % int(round(val * 100.0)), fs, UiStyle.TEXT, 0, D.bold(), 3)
	# кнопки
	for b in buttons:
		if not b.shown:
			continue
		_draw_button(b, s)


func _draw_button(b: Dictionary, s: float) -> void:
	var c: Vector2 = b.c
	var r := float(b.r)
	var id := String(b.id)
	var active := bool(b.pressed) or (id == "afterburner" and afterburner_on)
	var fill := Color(0.05, 0.07, 0.09, 0.42)
	var ring := Color(1, 1, 1, 0.55)
	if id == "guns":
		fill = Color(UiStyle.ACCENT, 0.30)
		ring = Color(UiStyle.ACCENT, 0.9)
	if id == "missile" and _locked:
		ring = UiStyle.DANGER
	if id == "extinguish":
		ring = UiStyle.DANGER
	if active:
		fill = Color(UiStyle.ACCENT, 0.75)
		ring = Color(1, 1, 1, 0.9)
	draw_circle(c, r, fill)
	draw_arc(c, r, 0.0, TAU, 48, ring, 2.2 * u, true)
	var label := String(b.label)
	var fs := int(round((18.0 if id == "guns" else 12.5) * s))
	var lines := label.split("\n")
	var count := _count_text(id)
	var lh := fs * 1.05
	var total := lh * lines.size() + (fs * 0.95 if count != "" else 0.0)
	var y := c.y - total * 0.5 + lh * 0.5
	var f: Font = D.bold() if id == "guns" else D.font()
	for line in lines:
		D.text_mid(self, Vector2(c.x, y), line, fs, Color.WHITE, 0, f, 3)
		y += lh
	if count != "":
		D.text_mid(self, Vector2(c.x, y - lh * 0.5 + fs * 0.55), count, int(round(fs * 0.85)), Color(1, 1, 1, 0.75), 0, null, 3)


func _count_text(id: String) -> String:
	var key := ""
	match id:
		"rocket":
			key = "rockets"
		"bomb":
			key = "bombs"
		"missile":
			key = "missiles"
		"flares":
			key = "flares"
		_:
			return ""
	if _ammo.has(key):
		return str(int(_ammo[key]))
	return ""
