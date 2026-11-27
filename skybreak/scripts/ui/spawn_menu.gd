extends Control
## Меню вылета (состояние "spawn") и экран «Самолётов не осталось» (состояние "dead").
## Клик по карточке — battle.request_spawn(id). Клавиши 1–4 выбирают карточку.

signal hangar_requested

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const INFINITE_USES := 99

var hud = null
var battle = null
var u: float = 1.0
var mode: String = ""            # "spawn" | "dead"
var cards: Dictionary = {}       # id -> Button

var _dim: ColorRect
var _center: CenterContainer
var _panel: PanelContainer
var _title: Label
var _sub: HBoxContainer
var _points: Label
var _hint: Label
var _cards_box: HBoxContainer
var _hangar_btn: Button
var _refresh_t: float = 0.0
var _sig: String = ""


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _panel == null:
		_build()


func _build() -> void:
	_dim = ColorRect.new()
	_dim.color = Color(0.02, 0.03, 0.04, 0.35)
	_dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_dim)
	_center = CenterContainer.new()
	_center.set_anchors_preset(Control.PRESET_FULL_RECT)
	_center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_center)
	_panel = PanelContainer.new()
	_panel.add_theme_stylebox_override("panel", _panel_box())
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_center.add_child(_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	_panel.add_child(v)
	_title = UiStyle.label("Выбери самолёт", UiStyle.FS_TITLE)
	_title.add_theme_font_override("font", D.bold())
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_title)
	_sub = HBoxContainer.new()
	_sub.alignment = BoxContainer.ALIGNMENT_CENTER
	_sub.add_theme_constant_override("separation", 24)
	v.add_child(_sub)
	_points = UiStyle.label("", UiStyle.FS_BODY, UiStyle.MUTED)
	_sub.add_child(_points)
	_hint = UiStyle.label("", UiStyle.FS_BODY, UiStyle.WARN)
	_sub.add_child(_hint)
	_cards_box = HBoxContainer.new()
	_cards_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_cards_box.add_theme_constant_override("separation", 12)
	v.add_child(_cards_box)
	var bottom := HBoxContainer.new()
	bottom.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(bottom)
	_hangar_btn = UiStyle.button("В ангар")
	_hangar_btn.custom_minimum_size = Vector2(180, 48)
	_hangar_btn.pressed.connect(func(): hangar_requested.emit())
	bottom.add_child(_hangar_btn)


func _panel_box() -> StyleBoxFlat:
	var s := UiStyle.box(Color(0.07, 0.09, 0.11, 0.94), 10, Color(1, 1, 1, 0.12), 1)
	s.content_margin_left = 24
	s.content_margin_right = 24
	s.content_margin_top = 20
	s.content_margin_bottom = 20
	return s


func set_ui_scale(p_u: float, touch: bool) -> void:
	u = p_u
	if _panel == null:
		_build()
	var k := u * (1.15 if touch else 1.0)
	_panel.scale = Vector2.ONE
	_hangar_btn.custom_minimum_size = Vector2(180, maxf(48.0, 56.0 * (1.15 if touch else 1.0)))
	_title.add_theme_font_size_override("font_size", int(round(UiStyle.FS_TITLE * k)))
	_sig = ""


func show_spawn() -> void:
	mode = "spawn"
	visible = true
	_sig = ""
	refresh()


func show_dead() -> void:
	mode = "dead"
	visible = true
	_sig = ""
	refresh()


func tick(dt: float) -> void:
	_refresh_t -= dt
	if _refresh_t <= 0.0:
		_refresh_t = 0.25
		refresh()


## Перестраивает карточки, только если что-то поменялось.
func refresh() -> void:
	if battle == null or not is_instance_valid(battle) or _panel == null:
		return
	var sig := _signature()
	if sig == _sig:
		return
	_sig = sig
	var bmode := String(battle.mode)
	var pts := int(D.prop(battle, "spawn_points", 0))
	if mode == "dead":
		_title.text = "Самолётов не осталось"
		_points.text = "Можно смотреть бой до конца"
		_points.visible = true
		_hint.visible = false
		_cards_box.visible = false
		_dim.color = Color(0.02, 0.03, 0.04, 0.0)
		# панель внизу, чтобы не закрывать бой
		_center.anchor_top = 0.62
		_center.anchor_bottom = 0.94
		return
	_center.anchor_top = 0.0
	_center.anchor_bottom = 1.0
	_dim.color = Color(0.02, 0.03, 0.04, 0.35)
	_title.text = "Выбери самолёт"
	_cards_box.visible = true
	_points.visible = bmode == "arcade"
	_points.text = "Очки вылета: " + Game.fmt_int(pts)
	_hint.visible = bmode == "realistic"
	_hint.text = "Одна жизнь"
	for c in _cards_box.get_children():
		_cards_box.remove_child(c)
		c.queue_free()
	cards.clear()
	var lineup = D.prop(battle, "lineup", [])
	var i := 0
	for id in lineup:
		i += 1
		var card := _make_card(String(id), i)
		_cards_box.add_child(card)
		cards[String(id)] = card


func _signature() -> String:
	var parts: Array = [mode, String(battle.mode), str(D.prop(battle, "spawn_points", 0)), str(u)]
	var uses: Dictionary = D.prop(battle, "lineup_uses", {})
	for id in D.prop(battle, "lineup", []):
		var sid := String(id)
		parts.append("%s:%s:%s:%s" % [sid, str(uses.get(sid, 0)), str(battle.spawn_cost(sid)), str(battle.can_spawn(sid))])
	return "|".join(parts)


func _make_card(id: String, index: int) -> Button:
	var def: Dictionary = Data.plane(id)
	var ok := bool(battle.can_spawn(id))
	var cost := int(battle.spawn_cost(id))
	var uses_d: Dictionary = D.prop(battle, "lineup_uses", {})
	var uses := int(uses_d.get(id, 0))
	var pts := int(D.prop(battle, "spawn_points", 0))
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(212, 178)
	b.disabled = not ok
	b.add_theme_stylebox_override("normal", UiStyle.box(Color(0.12, 0.15, 0.18, 0.95), 8, Color(1, 1, 1, 0.12), 1))
	b.add_theme_stylebox_override("hover", UiStyle.box(Color(0.16, 0.20, 0.24, 0.98), 8, UiStyle.ACCENT, 2))
	b.add_theme_stylebox_override("pressed", UiStyle.box(Color(0.20, 0.16, 0.12, 0.98), 8, UiStyle.ACCENT, 2))
	b.add_theme_stylebox_override("disabled", UiStyle.box(Color(0.09, 0.10, 0.12, 0.85), 8, Color(1, 1, 1, 0.05), 1))
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.pressed.connect(_on_card.bind(id))
	var m := MarginContainer.new()
	m.set_anchors_preset(Control.PRESET_FULL_RECT)
	m.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right", "top", "bottom"]:
		m.add_theme_constant_override("margin_" + side, 14 if side in ["left", "right"] else 12)
	b.add_child(m)
	var v := VBoxContainer.new()
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 3)
	m.add_child(v)
	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(top)
	var name_l := UiStyle.label(String(def.get("name", id)), 22, UiStyle.TEXT if ok else UiStyle.MUTED)
	name_l.add_theme_font_override("font", D.bold())
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(name_l)
	var num := UiStyle.label(str(index), 14, UiStyle.MUTED)
	top.add_child(num)
	v.add_child(UiStyle.label(String(def.get("role", "")), 14, UiStyle.MUTED))
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 4)
	v.add_child(spacer)
	for line in weapons_lines(def):
		var wl := UiStyle.label(line, 14, UiStyle.TEXT if ok else UiStyle.MUTED)
		wl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		wl.custom_minimum_size = Vector2(184, 0)
		v.add_child(wl)
	var fill := Control.new()
	fill.size_flags_vertical = Control.SIZE_EXPAND_FILL
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(fill)
	var bottom := HBoxContainer.new()
	bottom.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(bottom)
	if uses < INFINITE_USES:
		var ul := UiStyle.label("Вылетов: %d" % uses, 14, UiStyle.TEXT if uses > 0 else UiStyle.DANGER)
		ul.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bottom.add_child(ul)
	else:
		var sp := Control.new()
		sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bottom.add_child(sp)
	var cost_l: Label
	if cost <= 0:
		cost_l = UiStyle.label("Бесплатно", 15, UiStyle.GOOD if ok else UiStyle.MUTED)
	else:
		var enough := pts >= cost
		cost_l = UiStyle.label("%s %s" % [Game.fmt_int(cost), D.plural(cost, "очко", "очка", "очков")], 15,
			UiStyle.ACCENT if enough else UiStyle.DANGER)
	cost_l.add_theme_font_override("font", D.bold())
	bottom.add_child(cost_l)
	for c in [name_l, num, cost_l]:
		(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for c in v.get_children():
		if c is Control:
			(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	for c in bottom.get_children():
		(c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	return b


## Вооружение коротко: «2 × 20 мм, 2 × 12,7 мм» и «8 ракет, 4 бомбы».
static func weapons_lines(def: Dictionary) -> Array:
	var w: Dictionary = def.get("weapons", {})
	var guns: Array = []
	for g in w.get("guns", []):
		guns.append("%d × %s" % [int(g.get("count", 1)), String(g.get("label", ""))])
	var extra: Array = []
	var rk := int(w.get("rockets", {}).get("count", 0))
	if rk > 0:
		extra.append("%d %s" % [rk, D.plural(rk, "ракета", "ракеты", "ракет")])
	var bm := int(w.get("bombs", {}).get("count", 0))
	if bm > 0:
		extra.append("%d %s" % [bm, D.plural(bm, "бомба", "бомбы", "бомб")])
	var ms := int(w.get("missiles", {}).get("count", 0))
	if ms > 0:
		extra.append("%d %s В-В" % [ms, D.plural(ms, "ракета", "ракеты", "ракет")])
	var out: Array = []
	if not guns.is_empty():
		out.append(", ".join(PackedStringArray(guns)))
	if not extra.is_empty():
		out.append(", ".join(PackedStringArray(extra)))
	return out


func _on_card(id: String) -> void:
	if battle == null or not is_instance_valid(battle):
		return
	if battle.can_spawn(id):
		battle.request_spawn(id)
		_sig = ""


func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or mode != "spawn":
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var k := (event as InputEventKey).physical_keycode
		var idx := -1
		match k:
			KEY_1:
				idx = 0
			KEY_2:
				idx = 1
			KEY_3:
				idx = 2
			KEY_4:
				idx = 3
		var lineup = D.prop(battle, "lineup", [])
		if idx >= 0 and idx < lineup.size():
			_on_card(String(lineup[idx]))
			get_viewport().set_input_as_handled()
