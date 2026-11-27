extends Control
## Дерево исследований: 2 линии (истребители, штурмовики) × 3 ранга.
## Карточка: название, код, уровень, состояние, опыт, кнопка действия и «Тест».

signal plane_selected(id: String)
signal test_requested(id: String)

const C := preload("res://scripts/ui/ui_style.gd")
const K := preload("res://scripts/ui/menu_kit.gd")
const LINES := ["fighter", "attacker"]
const GAP := 22

var selected := ""

var _cards: Dictionary = {}
var _groups: Dictionary = {1: [], 2: [], 3: []}   # ранг -> группы карточек (для подложек)
var _rows: VBoxContainer
var _header_row: HBoxContainer
var _focus_label: Label
var _detail: VBoxContainer
var _built := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	Profile.changed.connect(refresh)
	refresh()


func _build() -> void:
	var panel := K.card(C.PANEL, 10, 18)
	add_child(panel)
	panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var v := K.vbox(12)
	panel.add_child(v)
	var head := K.hbox(14)
	head.add_child(K.title("Исследование"))
	var hint := K.muted("Выбери самолёт для исследования. Опыт за бой идёт в него.")
	hint.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.clip_text = true
	head.add_child(hint)
	_focus_label = K.label("", C.FS_SMALL + 1, C.ACCENT)
	_focus_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(_focus_label)
	v.add_child(head)

	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	v.add_child(scroll)
	var body := K.vbox(8)
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(body)

	var pad := MarginContainer.new()
	pad.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pad.add_theme_constant_override("margin_left", 12)
	pad.add_theme_constant_override("margin_right", 12)
	body.add_child(pad)
	_rows = K.vbox(8)
	_rows.draw.connect(_draw_links)
	_rows.sort_children.connect(_rows.queue_redraw)
	pad.add_child(_rows)
	_header_row = K.hbox(GAP)
	for r in [1, 2, 3]:
		var t := K.bold("%s  %s" % [Data.RANK_ROMAN[r], Data.RANK_NAMES[r]], C.FS_SMALL + 1, C.TEXT)
		t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_header_row.add_child(t)
	_rows.add_child(_header_row)
	# в каждом ранге одинаковое число мест во всех линиях, чтобы колонки совпадали
	var slots := {}
	for r in [1, 2, 3]:
		var m := 1
		for line in LINES:
			m = maxi(m, Data.planes_in(line, r).size())
		slots[r] = m
	for line in LINES:
		_rows.add_child(K.caption(String(Data.LINE_NAMES[line])))
		var row := K.hbox(GAP)
		row.sort_children.connect(_rows.queue_redraw)
		for r in [1, 2, 3]:
			var g := K.hbox(GAP)
			g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			g.sort_children.connect(_rows.queue_redraw)
			var ids: Array = Data.planes_in(line, r)
			for i in int(slots[r]):
				if i < ids.size():
					g.add_child(_make_card(String(ids[i])))
				else:
					var hole := K.spacer()
					hole.size_flags_horizontal = Control.SIZE_EXPAND_FILL
					g.add_child(hole)
			row.add_child(g)
			_groups[r].append(g)
		_rows.add_child(row)
	body.add_child(K.hline())
	_detail = K.vbox(4)
	body.add_child(_detail)
	_built = true


func _make_card(id: String) -> PanelContainer:
	var def := Data.plane(id)
	var card := PanelContainer.new()
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.custom_minimum_size = Vector2(110, 0)
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	card.gui_input.connect(_on_card_input.bind(id))
	var v := K.vbox(4)
	card.add_child(v)
	var top := K.hbox(5)
	var chip := ColorRect.new()
	chip.color = K.plane_color(def)
	chip.custom_minimum_size = Vector2(4, 18)
	chip.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(chip)
	var name_l := K.bold(String(def.name), C.FS_BODY - 1)
	name_l.clip_text = true
	name_l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_l.tooltip_text = String(def.name)
	name_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(name_l)
	var test := Button.new()
	test.text = "Тест"
	test.focus_mode = Control.FOCUS_NONE
	test.tooltip_text = "Тестовый полёт без наград"
	test.add_theme_font_size_override("font_size", C.FS_SMALL - 1)
	test.custom_minimum_size = Vector2(0, K.btn_h(24))
	var ts: StyleBoxFlat = C.box(Color(1, 1, 1, 0.04), 4, C.LINE, 1)
	ts.content_margin_left = 6
	ts.content_margin_right = 6
	ts.content_margin_top = 0
	ts.content_margin_bottom = 1
	var th: StyleBoxFlat = ts.duplicate()
	th.border_color = C.ACCENT
	test.add_theme_stylebox_override("normal", ts)
	test.add_theme_stylebox_override("hover", th)
	test.add_theme_stylebox_override("pressed", th)
	test.add_theme_color_override("font_color", C.MUTED)
	test.pressed.connect(func(): test_requested.emit(id))
	top.add_child(test)
	v.add_child(top)
	v.add_child(K.muted("%s · ур. %s" % [def.code, Data.level_text(float(def.level))], C.FS_SMALL - 1))
	var state := K.label("", C.FS_SMALL)
	state.clip_text = true
	v.add_child(state)
	var bar := K.progress(0, 1, 5)
	v.add_child(bar)
	var xp := K.muted("", C.FS_SMALL - 1)
	xp.clip_text = true
	v.add_child(xp)
	v.add_child(K.spacer(2))
	var main := K.button("", false, 32)
	main.clip_text = true
	main.add_theme_font_size_override("font_size", C.FS_SMALL + 1)
	main.pressed.connect(_on_main.bind(id))
	v.add_child(main)
	_cards[id] = {"card": card, "name": name_l, "state": state, "bar": bar, "xp": xp, "main": main, "test": test}
	return card


# ---------------------------------------------------------------- обновление

func refresh() -> void:
	if not _built:
		return
	if not Data.has_plane(selected):
		selected = Profile.get_selected_plane() if Profile.has_method("get_selected_plane") else String(Data.ORDER[0])
	for id in _cards:
		_refresh_card(String(id))
	var focus := String(Profile.data.get("research_focus", ""))
	if focus != "" and Profile.plane_state(focus) == "available":
		var def := Data.plane(focus)
		_focus_label.text = "Исследуется: %s · %s / %s оп." % [def.name, Game.fmt_int(Profile.research_progress(focus)),
			Game.fmt_int(int(def.research_xp))]
		_focus_label.add_theme_color_override("font_color", C.ACCENT)
	else:
		var any := false
		for id in Data.ORDER:
			if Profile.plane_state(id) == "available":
				any = true
				break
		_focus_label.text = "Цель не выбрана" if any else "Всё исследовано"
		_focus_label.add_theme_color_override("font_color", C.MUTED)
	_refresh_detail()
	_rows.queue_redraw()


func _refresh_card(id: String) -> void:
	var w: Dictionary = _cards[id]
	var def := Data.plane(id)
	var st := Profile.plane_state(id)
	var need := int(def.research_xp)
	var have := Profile.research_progress(id)
	var focus := String(Profile.data.get("research_focus", "")) == id
	var state: Label = w.state
	var bar: ProgressBar = w.bar
	var xp: Label = w.xp
	var main: Button = w.main
	var name_l: Label = w.name
	main.disabled = false
	main.remove_theme_stylebox_override("normal")
	main.remove_theme_color_override("font_color")
	name_l.add_theme_color_override("font_color", C.TEXT)
	var bar_color := C.ACCENT
	match st:
		"owned":
			state.text = "Куплен"
			state.add_theme_color_override("font_color", C.GOOD)
			bar.max_value = 1
			bar.value = 1
			bar_color = C.GOOD
			xp.text = "Ремонт %s кр." % Game.fmt_int(int(def.repair))
			var lu := Profile.get_lineup()
			if id in lu:
				main.text = "В сетапе"
				main.disabled = true
			elif lu.size() >= Profile.LINEUP_MAX:
				main.text = "Сетап полон"
				main.disabled = true
			else:
				main.text = "В сетап"
		"researched":
			state.text = "Исследован"
			state.add_theme_color_override("font_color", C.BLUE)
			bar.max_value = 1
			bar.value = 1
			bar_color = C.BLUE
			var price := int(def.price)
			xp.text = "Цена %s кр." % Game.fmt_int(price)
			main.text = "Купить за " + Game.fmt_int(price)
			main.disabled = int(Profile.data.credits) < price
			if not main.disabled:
				main.add_theme_stylebox_override("normal", C.box(C.ACCENT, 6, C.ACCENT, 1))
				main.add_theme_color_override("font_color", Color("1a1208"))
		"available":
			state.text = "Исследуется" if focus else "Можно исследовать"
			state.add_theme_color_override("font_color", C.ACCENT if focus else C.TEXT)
			bar.max_value = maxf(1.0, need)
			bar.value = have
			xp.text = "%s / %s оп." % [Game.fmt_int(have), Game.fmt_int(need)]
			main.text = "Исследуется" if focus else "Исследовать"
			main.disabled = focus
		_:
			state.text = "Закрыт"
			state.add_theme_color_override("font_color", C.MUTED)
			name_l.add_theme_color_override("font_color", C.MUTED)
			bar.max_value = maxf(1.0, need)
			bar.value = have
			bar_color = C.MUTED
			xp.text = "%s / %s оп." % [Game.fmt_int(have), Game.fmt_int(need)]
			main.text = "Закрыт"
			main.disabled = true
	var fill := StyleBoxFlat.new()
	fill.bg_color = bar_color
	fill.set_corner_radius_all(3)
	bar.add_theme_stylebox_override("fill", fill)
	var sel := id == selected
	var bg := Color(0.13, 0.16, 0.19, 0.96) if st != "locked" else Color(0.09, 0.11, 0.13, 0.9)
	var sb: StyleBoxFlat = C.box(bg, 8, C.ACCENT if sel else (Color(C.ACCENT, 0.45) if focus else C.LINE), 2 if sel else 1)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	(w.card as PanelContainer).add_theme_stylebox_override("panel", sb)


func _refresh_detail() -> void:
	for c in _detail.get_children():
		_detail.remove_child(c)
		c.queue_free()
	var def := Data.plane(selected)
	if def.is_empty():
		return
	var head := K.hbox(10)
	head.add_child(K.bold(K.plane_title(def), C.FS_BODY + 1))
	var role := K.muted(String(def.role) + " · " + K.rank_level_text(def), C.FS_SMALL + 1)
	role.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	head.add_child(role)
	_detail.add_child(head)
	_detail.add_child(K.para(String(def.desc), C.FS_SMALL + 1))
	var facts: PackedStringArray = []
	for f in K.plane_facts(def):
		facts.append("%s: %s" % [f[0], f[1]])
	_detail.add_child(K.para("  ·  ".join(facts), C.FS_SMALL, C.MUTED))
	_detail.add_child(K.para("Вооружение: " + ", ".join(PackedStringArray(K.weapon_lines(def))), C.FS_SMALL, C.MUTED))


func _draw_links() -> void:
	if _rows == null:
		return
	var origin := _rows.get_global_rect().position
	# подложки рангов: от заголовка колонки до последней строки
	for r in [1, 2, 3]:
		var head := _header_row.get_child(r - 1) as Control
		var rect := head.get_global_rect()
		for g in _groups[r]:
			rect = rect.merge((g as Control).get_global_rect())
		rect.position -= origin
		rect = rect.grow_individual(GAP * 0.4, 6, GAP * 0.4, 6)
		var band := StyleBoxFlat.new()
		band.bg_color = Color(1, 1, 1, 0.025)
		band.set_corner_radius_all(8)
		_rows.draw_style_box(band, rect)
	# связи «родитель → потомок»
	for id in _cards:
		var parent := String(Data.plane(id).parent)
		if parent == "" or not _cards.has(parent):
			continue
		var a: Rect2 = (_cards[parent].card as Control).get_global_rect()
		var b: Rect2 = (_cards[id].card as Control).get_global_rect()
		var p0 := Vector2(a.end.x, a.get_center().y) - origin
		var p1 := Vector2(b.position.x, b.get_center().y) - origin
		var open := Profile.is_researched(parent)
		var col := C.ACCENT if open else Color(1, 1, 1, 0.18)
		if Profile.is_researched(id):
			col = C.GOOD
		_rows.draw_line(p0, p1, col, 2.0, true)
		var tip := p1
		_rows.draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-7, -5), tip + Vector2(-7, 5)]), col)


# ---------------------------------------------------------------- действия

func _click() -> void:
	if Sfx.has_method("play"):
		Sfx.play("click")


func select(id: String) -> void:
	if not Data.has_plane(id):
		return
	selected = id
	plane_selected.emit(id)
	refresh()


func _on_card_input(event: InputEvent, id: String) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_click()
		select(id)


func _on_main(id: String) -> void:
	_click()
	select(id)
	match Profile.plane_state(id):
		"available":
			Profile.set_research_focus(id)
		"researched":
			Profile.buy(id)
		"owned":
			Profile.add_to_lineup(id)
