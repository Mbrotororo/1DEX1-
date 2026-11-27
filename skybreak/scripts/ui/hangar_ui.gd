extends Control
## Ангар: 3D-витрина самолёта, вкладки (Ангар, Исследование, Журнал, Настройки), сетап и выбор боя.

const C := preload("res://scripts/ui/ui_style.gd")
const K := preload("res://scripts/ui/menu_kit.gd")
const Swatch := preload("res://scripts/ui/menu_camo_swatch.gd")
const ResearchTree := preload("res://scripts/ui/research_tree.gd")
const LogbookPanel := preload("res://scripts/ui/logbook_panel.gd")
const SettingsPanel := preload("res://scripts/ui/settings_panel.gd")

const TABS := [["hangar", "Ангар"], ["research", "Исследование"], ["logbook", "Журнал"], ["settings", "Настройки"]]
const MODE_HINT := {
	"arcade": "Старт в воздухе, метки над целями, до 4 самолётов",
	"realistic": "Взлёт с аэродрома, одна жизнь, без меток",
}
const TIME_ORDER := ["random", "dawn", "day", "dusk", "night"]
const WEATHER_ORDER := ["random", "clear", "cloudy", "overcast", "fog", "storm"]

var showroom = null   # Showroom (утиная типизация: у настоящего есть set_screen_offset)
var current_tab := "hangar"
var selected_plane := ""
var setup: Dictionary = {}

var _touch := false
var _ui: Control
var _shade: ColorRect
var _top_bar: PanelContainer
var _credits: Label
var _rank_label: Label
var _rank_bar: ProgressBar
var _tab_buttons: Dictionary = {}
var _pages: Dictionary = {}
# вкладка «Ангар»
var _page_hangar: HBoxContainer
var _left: PanelContainer
var _right: PanelContainer
var _lineup_card: PanelContainer
var _info_box: VBoxContainer
var _state_box: VBoxContainer
var _camo_row: HBoxContainer
var _camo_note: Label
var _lineup_title: Label
var _lineup_row: HBoxContainer
var _slot_menu: Control
var _mode_seg: HBoxContainer
var _size_seg: HBoxContainer
var _mode_hint: Label
var _map_cards: Dictionary = {}
var _time_opt: OptionButton
var _weather_opt: OptionButton
var _battle_btn: Button
var _battle_reason: Label
# другие вкладки
var _research: ResearchTree
var _logbook: LogbookPanel
var _settings: SettingsPanel

var _refresh_queued := false
var _rebuild_queued := false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = K.theme()
	selected_plane = Profile.get_selected_plane()
	setup = Profile.get_last_setup()
	showroom = Showroom.new()
	showroom.name = "Showroom"
	add_child(showroom)
	_build_ui()
	Profile.changed.connect(_on_profile_changed)
	get_viewport().size_changed.connect(_on_viewport_resized)
	showroom.show_plane(selected_plane, Profile.selected_camo(selected_plane))
	show_tab(current_tab)


# ---------------------------------------------------------------- построение

func _build_ui() -> void:
	_touch = Game.is_touch()
	K.touch = _touch
	if _ui != null:
		remove_child(_ui)
		_ui.queue_free()
	_tab_buttons.clear()
	_pages.clear()
	_map_cards.clear()
	_slot_menu = null
	_ui = Control.new()
	_ui.name = "UI"
	_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_ui)
	_ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	_shade = ColorRect.new()
	_shade.color = Color(C.BG, 0.97)
	_shade.mouse_filter = Control.MOUSE_FILTER_STOP
	_ui.add_child(_shade)
	_shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var root := K.vbox(0)
	_ui.add_child(root)
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_child(_build_top_bar())

	var content := MarginContainer.new()
	content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	for side in ["left", "right"]:
		content.add_theme_constant_override("margin_" + side, 16)
	content.add_theme_constant_override("margin_top", 12)
	content.add_theme_constant_override("margin_bottom", 14)
	root.add_child(content)
	var stack := Control.new()
	stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(stack)

	_page_hangar = _build_hangar_page()
	_research = ResearchTree.new()
	_research.plane_selected.connect(_on_tree_select)
	_research.test_requested.connect(_start_test)
	_logbook = LogbookPanel.new()
	_settings = SettingsPanel.new()
	_pages = {"hangar": _page_hangar, "research": _research, "logbook": _logbook, "settings": _settings}
	for k in _pages:
		var p: Control = _pages[k]
		stack.add_child(p)
		p.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_research.selected = selected_plane
	_on_viewport_resized()


func _build_top_bar() -> Control:
	_top_bar = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0.045, 0.06, 0.07, 0.94)
	sb.border_color = C.LINE
	sb.border_width_bottom = 1
	sb.content_margin_left = 20
	sb.content_margin_right = 20
	sb.content_margin_top = 0
	sb.content_margin_bottom = 0
	_top_bar.add_theme_stylebox_override("panel", sb)
	_top_bar.mouse_filter = Control.MOUSE_FILTER_STOP
	_top_bar.mouse_force_pass_scroll_events = false
	_top_bar.custom_minimum_size.y = 60 if _touch else 52
	var h := K.hbox(4)
	_top_bar.add_child(h)
	var logo := K.label("SKYBREAK", 21, C.ACCENT)
	logo.add_theme_font_override("font", K.wide_font())
	logo.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(logo)
	var gap := K.spacer()
	gap.custom_minimum_size.x = 26
	h.add_child(gap)
	var group := ButtonGroup.new()
	for t in TABS:
		var b := _tab_button(String(t[1]))
		b.button_group = group
		b.pressed.connect(_on_tab_pressed.bind(String(t[0])))
		_tab_buttons[t[0]] = b
		h.add_child(b)
	h.add_child(K.spacer(0, true))
	_credits = K.bold("", 18)
	_credits.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	h.add_child(_credits)
	var sep := ColorRect.new()
	sep.color = C.LINE
	sep.custom_minimum_size = Vector2(1, 24)
	sep.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	sep.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sep_box := K.hbox(14)
	sep_box.add_child(K.spacer())
	sep_box.add_child(sep)
	sep_box.add_child(K.spacer())
	h.add_child(sep_box)
	var rank := K.vbox(4)
	rank.alignment = BoxContainer.ALIGNMENT_CENTER
	_rank_label = K.label("", C.FS_SMALL + 1, C.TEXT)
	rank.add_child(_rank_label)
	_rank_bar = K.progress(0, 1, 4)
	_rank_bar.custom_minimum_size.x = 190
	rank.add_child(_rank_bar)
	h.add_child(rank)
	return _top_bar


func _tab_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_filter = Control.MOUSE_FILTER_STOP
	b.add_theme_font_size_override("font_size", C.FS_BODY)
	var base := StyleBoxFlat.new()
	base.bg_color = Color(0, 0, 0, 0)
	base.content_margin_left = 14
	base.content_margin_right = 14
	base.border_color = Color(0, 0, 0, 0)
	base.border_width_bottom = 3
	var hov := base.duplicate() as StyleBoxFlat
	hov.bg_color = Color(1, 1, 1, 0.04)
	var act := base.duplicate() as StyleBoxFlat
	act.border_color = C.ACCENT
	b.add_theme_stylebox_override("normal", base)
	b.add_theme_stylebox_override("hover", hov)
	b.add_theme_stylebox_override("pressed", act)
	b.add_theme_stylebox_override("hover_pressed", act)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.add_theme_color_override("font_color", C.MUTED)
	b.add_theme_color_override("font_hover_color", C.TEXT)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_color_override("font_hover_pressed_color", Color.WHITE)
	return b


func _build_hangar_page() -> HBoxContainer:
	var page := K.hbox(16)
	# слева — карточка самолёта
	_left = K.card(C.PANEL, 10, 16)
	var lv := K.vbox(10)
	_left.add_child(lv)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	lv.add_child(scroll)
	_info_box = K.vbox(6)
	_info_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_info_box)
	lv.add_child(K.hline())
	_state_box = K.vbox(8)
	lv.add_child(_state_box)
	page.add_child(_left)
	# по центру — пусто (виден самолёт), снизу сетап
	var center := K.vbox(10)
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	center.add_child(K.spacer(0, true))
	_lineup_card = _build_lineup_bar()
	center.add_child(_lineup_card)
	page.add_child(center)
	# справа — выбор боя
	_right = K.card(C.PANEL, 10, 16)
	_right.add_child(_build_battle_panel())
	page.add_child(_right)
	return page


func _build_lineup_bar() -> PanelContainer:
	var card := K.card(C.PANEL, 10, 12)
	var v := K.vbox(8)
	card.add_child(v)
	var head := K.hbox(8)
	_lineup_title = K.bold("Сетап", C.FS_BODY)
	head.add_child(_lineup_title)
	head.add_child(K.spacer(0, true))
	head.add_child(K.muted("Нажми на слот, чтобы сменить самолёт"))
	v.add_child(head)
	_lineup_row = K.hbox(8)
	v.add_child(_lineup_row)
	for i in Profile.LINEUP_MAX:
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(96, K.btn_h(60))
		b.clip_text = true
		b.pressed.connect(_on_slot_pressed.bind(i))
		var inner := K.vbox(0)
		inner.alignment = BoxContainer.ALIGNMENT_CENTER
		b.add_child(inner)
		inner.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		var n := K.bold("", C.FS_BODY)
		n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		n.clip_text = true
		inner.add_child(n)
		var s := K.muted("")
		s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		inner.add_child(s)
		b.set_meta("name_label", n)
		b.set_meta("sub_label", s)
		_lineup_row.add_child(b)
	return card


func _build_battle_panel() -> Control:
	var v := K.vbox(10)
	v.add_child(K.title("Бой"))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	v.add_child(scroll)
	var body := K.vbox(6 if _touch else 7)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(body)
	body.add_child(K.caption("Режим"))
	_mode_seg = K.segmented([["arcade", "Аркада"], ["realistic", "Реализм"]], String(setup.mode), _on_mode)
	body.add_child(_mode_seg)
	_mode_hint = K.para("", C.FS_SMALL, C.MUTED)
	body.add_child(_mode_hint)
	body.add_child(K.caption("Размер боя"))
	_size_seg = K.segmented([[4, "4 × 4"], [8, "8 × 8"]], int(setup.size), _on_size)
	body.add_child(_size_seg)
	body.add_child(K.caption("Карта"))
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	grid.add_child(_map_card("random", "Случайная", ""))
	for m in Data.MAPS:
		grid.add_child(_map_card(String(m.id), String(m.name), String(m.preview)))
	body.add_child(grid)
	var row := K.hbox(8)
	var tcol := K.vbox(4)
	tcol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tcol.add_child(K.caption("Время"))
	var t_items: Array = []
	for t in TIME_ORDER:
		t_items.append([t, Data.TIME_NAMES[t]])
	_time_opt = K.option(t_items, String(setup.time_of_day), _on_time)
	tcol.add_child(_time_opt)
	row.add_child(tcol)
	var wcol := K.vbox(4)
	wcol.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	wcol.add_child(K.caption("Погода"))
	var w_items: Array = []
	for w in WEATHER_ORDER:
		w_items.append([w, Data.WEATHER_NAMES[w]])
	_weather_opt = K.option(w_items, String(setup.weather), _on_weather)
	wcol.add_child(_weather_opt)
	row.add_child(wcol)
	body.add_child(row)

	_battle_btn = K.button("В бой", true, 54)
	_battle_btn.custom_minimum_size.y = 62 if _touch else 54
	_battle_btn.add_theme_font_size_override("font_size", 24)
	_battle_btn.add_theme_font_override("font", K.bold_font())
	_battle_btn.pressed.connect(_start_battle)
	v.add_child(_battle_btn)
	_battle_reason = K.label("", C.FS_SMALL, C.WARN)
	_battle_reason.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_battle_reason)
	var row2 := K.hbox(8)
	var train := K.button("Обучение")
	train.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	train.pressed.connect(_start_training)
	row2.add_child(train)
	var test := K.button("Тестовый полёт")
	test.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	test.tooltip_text = "Полёт на выбранном самолёте без наград"
	test.pressed.connect(func(): _start_test(selected_plane))
	row2.add_child(test)
	v.add_child(row2)
	return v


func _map_card(id: String, title: String, preview: String) -> Button:
	var b := Button.new()
	b.toggle_mode = true
	b.focus_mode = Control.FOCUS_NONE
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size = Vector2(0, 64)
	b.clip_contents = true
	var base: StyleBoxFlat = C.box(Color(0.12, 0.15, 0.17, 1.0), 6, C.LINE, 1)
	for st in ["normal", "hover", "pressed", "hover_pressed", "disabled"]:
		b.add_theme_stylebox_override(st, base)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	if preview != "" and ResourceLoader.exists(preview):
		var tr := TextureRect.new()
		tr.texture = load(preview)
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(tr)
		tr.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		tr.offset_left = 1
		tr.offset_top = 1
		tr.offset_right = -1
		tr.offset_bottom = -1
	else:
		var q := K.bold("?", 30, Color(1, 1, 1, 0.25))
		q.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		q.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		b.add_child(q)
		q.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		q.offset_bottom = -14
	# подпись на тёмной полосе снизу
	var strip := ColorRect.new()
	strip.color = Color(0, 0, 0, 0.55)
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(strip)
	strip.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	strip.offset_top = -22
	strip.offset_left = 1
	strip.offset_right = -1
	strip.offset_bottom = -1
	var l := K.label(title, C.FS_SMALL, C.TEXT)
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.clip_text = true
	strip.add_child(l)
	l.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	l.offset_left = 8
	# рамка выбора
	var ring := Panel.new()
	ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rs := StyleBoxFlat.new()
	rs.bg_color = Color(0, 0, 0, 0)
	rs.border_color = C.ACCENT
	rs.set_border_width_all(2)
	rs.set_corner_radius_all(6)
	ring.add_theme_stylebox_override("panel", rs)
	b.add_child(ring)
	ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	b.set_meta("ring", ring)
	b.pressed.connect(_on_map.bind(id))
	_map_cards[id] = b
	return b


# ---------------------------------------------------------------- вкладки

func show_tab(id: String) -> void:
	if not _pages.has(id):
		return
	current_tab = id
	for k in _pages:
		_pages[k].visible = k == id
	for k in _tab_buttons:
		_tab_buttons[k].set_pressed_no_signal(k == id)
	var hangar := id == "hangar"
	_shade.visible = not hangar
	if showroom != null:
		showroom.set_interactive(hangar)
	_close_slot_menu()
	_refresh_all()
	if hangar:
		_update_showroom_offset.call_deferred()


func _on_tab_pressed(id: String) -> void:
	_click()
	show_tab(id)


# ---------------------------------------------------------------- обновление

func _on_profile_changed() -> void:
	if Game.is_touch() != _touch:
		if not _rebuild_queued:
			_rebuild_queued = true
			_rebuild.call_deferred()
		return
	if not _refresh_queued:
		_refresh_queued = true
		_refresh_all.call_deferred()


func _rebuild() -> void:
	_rebuild_queued = false
	_build_ui()
	show_tab(current_tab)


func _refresh_all() -> void:
	_refresh_queued = false
	if not Data.has_plane(selected_plane):
		selected_plane = Profile.get_selected_plane()
	_refresh_top()
	match current_tab:
		"hangar":
			_refresh_hangar()
		"research":
			_research.selected = selected_plane
			_research.refresh()
		"logbook":
			_logbook.refresh()
		"settings":
			_settings.refresh()


func _refresh_top() -> void:
	_credits.text = Game.fmt_int(int(Profile.data.credits)) + " кр."
	var r := Profile.player_rank()
	var xp := int(r.xp)
	var next := int(r.next_xp)
	if next > 0:
		_rank_label.text = "%s · %s / %s оп." % [r.name, Game.fmt_int(xp), Game.fmt_int(next)]
		_rank_bar.min_value = float(r.rank_xp)
		_rank_bar.max_value = float(next)
		_rank_bar.value = float(xp)
	else:
		_rank_label.text = "%s · %s оп." % [r.name, Game.fmt_int(xp)]
		_rank_bar.min_value = 0
		_rank_bar.max_value = 1
		_rank_bar.value = 1


func _refresh_hangar() -> void:
	_refresh_info()
	_refresh_state()
	_refresh_lineup()
	_refresh_setup()


func _refresh_info() -> void:
	for c in _info_box.get_children():
		_info_box.remove_child(c)
		c.queue_free()
	var id := selected_plane
	var def := Data.plane(id)
	if def.is_empty():
		return
	var head := K.hbox(10)
	var chip := ColorRect.new()
	chip.color = K.plane_color(def)
	chip.custom_minimum_size = Vector2(5, 26)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	head.add_child(chip)
	head.add_child(K.bold(String(def.name), 26))
	var code := K.label(String(def.code), C.FS_BODY, C.MUTED)
	code.size_flags_vertical = Control.SIZE_SHRINK_END
	head.add_child(code)
	_info_box.add_child(head)
	_info_box.add_child(K.label(String(def.role), C.FS_SMALL + 1, C.MUTED))
	_info_box.add_child(K.label(K.rank_level_text(def), C.FS_SMALL + 1, C.ACCENT))
	_info_box.add_child(K.para(String(def.desc), C.FS_BODY - 1))
	_info_box.add_child(K.spacer(2))
	_info_box.add_child(K.hline())
	for f in K.plane_facts(def):
		_info_box.add_child(K.stat_row(String(f[0]), String(f[1])))
	_info_box.add_child(K.hline())
	_info_box.add_child(K.caption("Вооружение"))
	_info_box.add_child(K.para(", ".join(PackedStringArray(K.weapon_lines(def))), C.FS_SMALL + 1))
	_info_box.add_child(K.hline())
	_info_box.add_child(K.caption("Камуфляж"))
	_camo_row = K.hbox(8)
	var cur := Profile.selected_camo(id)
	for camo in Data.camos_for(id):
		var sw := Swatch.new()
		var cid := String(camo.id)
		var open := bool(Profile.is_camo_unlocked(id, cid))
		sw.setup(camo, not open, cid == cur)
		sw.custom_minimum_size = Vector2(K.btn_h(50), K.btn_h(38))
		sw.tooltip_text = _camo_line(id, cid)
		sw.pressed.connect(_on_camo.bind(cid))
		sw.mouse_entered.connect(_show_camo_note.bind(cid))
		sw.mouse_exited.connect(_show_camo_note.bind(""))
		_camo_row.add_child(sw)
	_info_box.add_child(_camo_row)
	_camo_note = K.para("", C.FS_SMALL, C.MUTED)
	_info_box.add_child(_camo_note)
	_show_camo_note("")


func _camo_line(plane_id: String, camo_id: String) -> String:
	var camo := Data.camo(plane_id, camo_id)
	if Profile.is_camo_unlocked(plane_id, camo_id):
		return String(camo.name)
	var p: Array = Profile.camo_unlock_progress(plane_id, camo_id)
	return "%s. %s (%s / %s)" % [camo.name, Profile.camo_unlock_text(plane_id, camo_id), Game.fmt_int(int(p[0])), Game.fmt_int(int(p[1]))]


func _show_camo_note(camo_id: String) -> void:
	if _camo_note == null or not is_instance_valid(_camo_note):
		return
	var cid := camo_id if camo_id != "" else Profile.selected_camo(selected_plane)
	_camo_note.text = _camo_line(selected_plane, cid)
	_camo_note.add_theme_color_override("font_color", C.TEXT if Profile.is_camo_unlocked(selected_plane, cid) else C.MUTED)


func _refresh_state() -> void:
	for c in _state_box.get_children():
		_state_box.remove_child(c)
		c.queue_free()
	var id := selected_plane
	var def := Data.plane(id)
	if def.is_empty():
		return
	var st := Profile.plane_state(id)
	match st:
		"owned":
			var row := K.hbox(8)
			var bd := K.badge("Куплен", C.GOOD)
			bd.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(bd)
			row.add_child(K.spacer(0, true))
			var lu := Profile.get_lineup()
			var b := K.button("В сетап")
			b.custom_minimum_size.x = 130
			if id in lu:
				b.text = "В сетапе"
				b.disabled = true
			elif lu.size() >= Profile.LINEUP_MAX:
				b.text = "Сетап полон"
				b.disabled = true
			b.pressed.connect(func():
				_click()
				Profile.add_to_lineup(id))
			row.add_child(b)
			_state_box.add_child(row)
		"researched":
			var price := int(def.price)
			var b := K.button("Купить за " + Game.fmt_int(price), true, 44)
			b.add_theme_font_size_override("font_size", C.FS_BODY + 1)
			var lack := price - int(Profile.data.credits)
			b.disabled = lack > 0
			b.pressed.connect(func():
				if Profile.buy(id):
					_click())
			_state_box.add_child(b)
			if lack > 0:
				_state_box.add_child(K.label("Не хватает " + Game.fmt_int(lack) + " кр.", C.FS_SMALL, C.WARN))
		"available":
			var need := int(def.research_xp)
			var have := Profile.research_progress(id)
			var row := K.hbox(8)
			row.add_child(K.label("Исследование", C.FS_SMALL + 1, C.MUTED))
			row.add_child(K.spacer(0, true))
			row.add_child(K.label("%s / %s оп." % [Game.fmt_int(have), Game.fmt_int(need)], C.FS_SMALL + 1))
			_state_box.add_child(row)
			_state_box.add_child(K.progress(have, need, 6))
			var focus := String(Profile.data.research_focus) == id
			var b := K.button("Исследуется" if focus else "Исследовать", not focus, 44)
			b.add_theme_font_size_override("font_size", C.FS_BODY + 1)
			b.disabled = focus
			b.pressed.connect(func():
				_click()
				Profile.set_research_focus(id))
			_state_box.add_child(b)
		_:
			var row := K.hbox(8)
			var bd := K.badge("Закрыт", C.MUTED)
			bd.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			row.add_child(bd)
			var parent_name := String(Data.plane(String(def.parent)).get("name", ""))
			row.add_child(K.label("Сначала исследуй " + _accusative(parent_name), C.FS_SMALL + 1, C.MUTED))
			_state_box.add_child(row)


func _accusative(word: String) -> String:
	if word.ends_with("а"):
		return word.left(word.length() - 1) + "у"
	if word.ends_with("я"):
		return word.left(word.length() - 1) + "ю"
	return word


func _refresh_lineup() -> void:
	var lu := Profile.get_lineup()
	_lineup_title.text = "Сетап  %d / %d" % [lu.size(), Profile.LINEUP_MAX]
	for i in _lineup_row.get_child_count():
		var b := _lineup_row.get_child(i) as Button
		var n: Label = b.get_meta("name_label")
		var s: Label = b.get_meta("sub_label")
		var sel := false
		if i < lu.size():
			var def := Data.plane(String(lu[i]))
			n.text = String(def.name)
			n.add_theme_color_override("font_color", C.TEXT)
			s.text = "%s · %s" % [def.code, Data.level_text(float(def.level))]
			sel = String(lu[i]) == selected_plane
		else:
			n.text = "+"
			n.add_theme_color_override("font_color", C.MUTED)
			s.text = "Пусто"
		var bg := Color(0.13, 0.16, 0.19, 0.95) if i < lu.size() else Color(0.08, 0.10, 0.12, 0.7)
		var border := C.ACCENT if sel else C.LINE
		var bw := 2 if sel else 1
		b.add_theme_stylebox_override("normal", C.box(bg, 6, border, bw))
		b.add_theme_stylebox_override("hover", C.box(bg.lightened(0.06), 6, C.ACCENT if sel else Color(1, 1, 1, 0.35), bw))
		b.add_theme_stylebox_override("pressed", C.box(bg.lightened(0.1), 6, C.ACCENT, 2))
		b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())


func _refresh_setup() -> void:
	K.set_segmented(_mode_seg, String(setup.mode))
	K.set_segmented(_size_seg, int(setup.size))
	_mode_hint.text = String(MODE_HINT.get(String(setup.mode), ""))
	for id in _map_cards:
		var b: Button = _map_cards[id]
		b.set_pressed_no_signal(id == String(setup.map_id))
		(b.get_meta("ring") as Control).visible = id == String(setup.map_id)
	if not _map_cards.has(String(setup.map_id)):
		(_map_cards["random"].get_meta("ring") as Control).visible = true
	_select_option(_time_opt, String(setup.time_of_day))
	_select_option(_weather_opt, String(setup.weather))
	var lu := Profile.get_lineup()
	_battle_btn.disabled = lu.is_empty()
	_battle_reason.text = "Добавь самолёт в сетап" if lu.is_empty() else ""
	_battle_reason.visible = lu.is_empty()


func _select_option(o: OptionButton, value: String) -> void:
	for i in o.item_count:
		if String(o.get_item_metadata(i)) == value:
			if o.selected != i:
				o.select(i)
			return


func _on_viewport_resized() -> void:
	if _left == null:
		return
	var w := get_viewport_rect().size.x
	var side := clampf(w * 0.255, 310.0, 400.0)
	if _touch:
		side = clampf(w * 0.27, 330.0, 430.0)
	_left.custom_minimum_size.x = side
	_right.custom_minimum_size.x = side
	_update_showroom_offset.call_deferred()


func _update_showroom_offset() -> void:
	if showroom == null or not showroom.has_method("set_screen_offset") or _left == null:
		return
	var vp := get_viewport_rect().size
	if vp.x < 1.0 or vp.y < 1.0:
		return
	var left_edge := _left.get_global_rect().end.x
	var right_edge := _right.get_global_rect().position.x
	var top := _top_bar.get_global_rect().end.y
	var bottom := _lineup_card.get_global_rect().position.y
	var cx := (left_edge + right_edge) * 0.5
	var cy := (top + bottom) * 0.5
	showroom.set_screen_offset(Vector2((cx - vp.x * 0.5) / vp.x, (cy - vp.y * 0.5) / vp.y))


# ---------------------------------------------------------------- действия

func _click() -> void:
	if Sfx.has_method("play"):
		Sfx.play("click")


func select_plane(id: String) -> void:
	if not Data.has_plane(id):
		return
	selected_plane = id
	showroom.show_plane(id, Profile.selected_camo(id))
	Profile.set_selected_plane(id)
	_on_profile_changed()


func _on_tree_select(id: String) -> void:
	select_plane(id)


func _on_camo(camo_id: String) -> void:
	_click()
	if Profile.is_camo_unlocked(selected_plane, camo_id):
		Profile.select_camo(selected_plane, camo_id)
		showroom.show_plane(selected_plane, Profile.selected_camo(selected_plane))
	else:
		_show_camo_note(camo_id)


func _on_slot_pressed(slot: int) -> void:
	_click()
	var lu := Profile.get_lineup()
	if slot < lu.size():
		select_plane(String(lu[slot]))
	_open_slot_menu(slot)


func _open_slot_menu(slot: int) -> void:
	_close_slot_menu()
	var btn := _lineup_row.get_child(slot) as Control
	var lu := Profile.get_lineup()
	var cur := String(lu[slot]) if slot < lu.size() else ""
	_slot_menu = K.overlay(_ui, false, true)
	var menu := K.card(Color("1a2025"), 8, 8)
	_slot_menu.add_child(menu)
	var v := K.vbox(2)
	menu.add_child(v)
	var cap := K.caption("Слот %d" % (slot + 1))
	cap.custom_minimum_size.y = 22
	var cap_box := MarginContainer.new()
	cap_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cap_box.add_theme_constant_override("margin_left", 8)
	cap_box.add_child(cap)
	v.add_child(cap_box)
	var any := false
	for id in Data.ORDER:
		if not Profile.is_owned(id):
			continue
		any = true
		var def := Data.plane(id)
		var sub := "%s · %s" % [def.code, Data.level_text(float(def.level))]
		if id in lu and id != cur:
			sub += " · в сетапе"
		var b := K.list_button(String(def.name), sub, id == cur)
		b.pressed.connect(_on_slot_pick.bind(slot, id))
		v.add_child(b)
	if not any:
		v.add_child(K.muted("Нет купленных самолётов"))
	v.add_child(K.hline())
	var rm := K.list_button("Убрать", "", false, C.DANGER.lightened(0.2) if cur != "" else C.MUTED)
	rm.disabled = cur == ""
	rm.pressed.connect(_on_slot_pick.bind(slot, ""))
	v.add_child(rm)
	menu.reset_size()
	var ms := menu.get_combined_minimum_size()
	# над карточкой сетапа, по левому краю слота
	var r := btn.get_global_rect()
	var top := _lineup_card.get_global_rect().position.y
	var origin := _ui.get_global_rect().position
	var pos := Vector2(r.position.x, top - ms.y - 6) - origin
	var vp := _ui.size
	pos.x = clampf(pos.x, 8.0, maxf(8.0, vp.x - ms.x - 8.0))
	pos.y = clampf(pos.y, 8.0, maxf(8.0, vp.y - ms.y - 8.0))
	menu.position = pos
	menu.size = ms


func _close_slot_menu() -> void:
	if _slot_menu != null and is_instance_valid(_slot_menu):
		_slot_menu.queue_free()
	_slot_menu = null


func _on_slot_pick(slot: int, id: String) -> void:
	_click()
	_close_slot_menu()
	Profile.set_lineup_slot(slot, id)
	if id != "":
		select_plane(id)


func _on_mode(mode) -> void:
	_click()
	setup.mode = String(mode)
	Profile.set_last_setup(setup)
	_refresh_setup()


func _on_size(n) -> void:
	_click()
	setup.size = int(n)
	Profile.set_last_setup(setup)
	_refresh_setup()


func _on_map(id: String) -> void:
	_click()
	setup.map_id = id
	Profile.set_last_setup(setup)
	_refresh_setup()


func _on_time(t) -> void:
	setup.time_of_day = String(t)
	Profile.set_last_setup(setup)


func _on_weather(w) -> void:
	setup.weather = String(w)
	Profile.set_last_setup(setup)


func battle_config() -> Dictionary:
	return {"mode": String(setup.mode), "size": int(setup.size), "map_id": String(setup.map_id),
		"time_of_day": String(setup.time_of_day), "weather": String(setup.weather), "lineup": Profile.get_lineup()}


func _start_battle() -> void:
	if Profile.get_lineup().is_empty():
		return
	_click()
	Profile.set_last_setup(setup)
	Profile.save_profile()
	Game.start_battle(battle_config())


func _start_training() -> void:
	_click()
	Profile.save_profile()
	Game.start_battle({"mode": "training", "size": 4, "map_id": "canyon", "lineup": ["strizh"]})


func _start_test(id: String) -> void:
	if not Data.has_plane(id):
		return
	_click()
	Profile.save_profile()
	Game.start_battle({"mode": "test", "test_plane": id, "map_id": String(setup.map_id),
		"time_of_day": String(setup.time_of_day), "weather": String(setup.weather), "lineup": [id]})
