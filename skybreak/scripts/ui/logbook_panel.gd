extends Control
## Журнал: общая статистика, достижения, последние 50 боёв, кнопка «Последний повтор».

const C := preload("res://scripts/ui/ui_style.gd")
const K := preload("res://scripts/ui/menu_kit.gd")
const REPLAY_FILE := "user://replays/last.json"
## [заголовок, ширина, растяжение]
const COLS := [["Дата", 84, 0.0], ["Карта", 118, 1.2], ["Режим", 74, 0.0], ["Самолёт", 100, 1.0],
	["Итог", 98, 0.0], ["Сбито", 50, 0.0], ["Кредиты", 76, 0.0]]

var _stats_grid: GridContainer
var _ach_title: Label
var _ach_grid: GridContainer
var _table: VBoxContainer
var _replay_btn: Button
var _left: PanelContainer
var _built := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_build()
	Profile.changed.connect(refresh)
	refresh()


func _build() -> void:
	var h := K.hbox(16)
	add_child(h)
	h.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	# слева: статистика и достижения
	_left = K.card(C.PANEL, 10, 18)
	_left.custom_minimum_size.x = 450 if not K.touch else 520
	h.add_child(_left)
	var lv := K.vbox(10)
	_left.add_child(lv)
	lv.add_child(K.title("Статистика"))
	_stats_grid = GridContainer.new()
	_stats_grid.columns = 3
	_stats_grid.add_theme_constant_override("h_separation", 8)
	_stats_grid.add_theme_constant_override("v_separation", 8)
	_stats_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lv.add_child(_stats_grid)
	lv.add_child(K.spacer(4))
	_ach_title = K.title("Достижения")
	lv.add_child(_ach_title)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	lv.add_child(scroll)
	_ach_grid = GridContainer.new()
	_ach_grid.columns = 1
	_ach_grid.add_theme_constant_override("v_separation", 4)
	_ach_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ach_grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scroll.add_child(_ach_grid)
	# справа: таблица боёв
	var right := K.card(C.PANEL, 10, 18)
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(right)
	var rv := K.vbox(10)
	right.add_child(rv)
	var head := K.hbox(10)
	head.add_child(K.title("Последние бои"))
	head.add_child(K.spacer(0, true))
	_replay_btn = K.button("Последний повтор")
	_replay_btn.custom_minimum_size.x = 180
	_replay_btn.pressed.connect(_on_replay)
	head.add_child(_replay_btn)
	rv.add_child(head)
	rv.add_child(_row_box(COLS.map(func(c): return c[0]), true))
	var tscroll := ScrollContainer.new()
	tscroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	tscroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	tscroll.mouse_filter = Control.MOUSE_FILTER_PASS
	rv.add_child(tscroll)
	_table = K.vbox(2)
	_table.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tscroll.add_child(_table)
	_built = true


func _row_box(cells: Array, header: bool, colors: Array = []) -> PanelContainer:
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0) if header else Color(1, 1, 1, 0.035)
	sb.set_corner_radius_all(4)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 5 if not K.touch else 9
	sb.content_margin_bottom = 5 if not K.touch else 9
	if header:
		sb.border_color = C.LINE
		sb.border_width_bottom = 1
	p.add_theme_stylebox_override("panel", sb)
	var h := K.hbox(10)
	p.add_child(h)
	for i in COLS.size():
		var text := String(cells[i]) if i < cells.size() else ""
		var col: Color = C.MUTED if header else (colors[i] if i < colors.size() else C.TEXT)
		var l := K.label(text, C.FS_SMALL if header else C.FS_SMALL + 1, col)
		l.custom_minimum_size.x = float(COLS[i][1])
		l.clip_text = true
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		if float(COLS[i][2]) > 0.0:
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			l.size_flags_stretch_ratio = float(COLS[i][2])
		if i >= 5:
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		h.add_child(l)
	return p


func refresh() -> void:
	if not _built:
		return
	_refresh_stats()
	_refresh_achievements()
	_refresh_table()
	_replay_btn.disabled = not has_replay()


static func has_replay() -> bool:
	return not Game.last_replay.is_empty() or FileAccess.file_exists(REPLAY_FILE)


func _refresh_stats() -> void:
	for c in _stats_grid.get_children():
		_stats_grid.remove_child(c)
		c.queue_free()
	var st: Dictionary = Profile.data.get("stats", {})
	var battles := int(st.get("battles", 0))
	var wins := int(st.get("wins", 0))
	var win_cap := "Побед"
	if battles > 0:
		win_cap = "Побед · %d %%" % int(round(100.0 * wins / battles))
	var tiles := [
		[battles, "Боёв"], [wins, win_cap], [int(st.get("kills", 0)), "Сбито"],
		[int(st.get("ground_kills", 0)), "Наземных целей"], [int(st.get("landings", 0)), "Посадок"],
		[int(st.get("deaths", 0)), "Потерь"],
	]
	for t in tiles:
		var p := K.card(C.PANEL_LIGHT, 8, 12)
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var v := K.vbox(0)
		p.add_child(v)
		v.add_child(K.bold(Game.fmt_int(int(t[0])), 24))
		v.add_child(K.muted(String(t[1]), C.FS_SMALL - 1))
		_stats_grid.add_child(p)


func _refresh_achievements() -> void:
	for c in _ach_grid.get_children():
		_ach_grid.remove_child(c)
		c.queue_free()
	var got := 0
	for id in Data.ACHIEVEMENTS:
		var a: Dictionary = Data.ACHIEVEMENTS[id]
		var have := Profile.has_achievement(String(id))
		if have:
			got += 1
		var p := PanelContainer.new()
		p.mouse_filter = Control.MOUSE_FILTER_IGNORE
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(C.ACCENT, 0.10) if have else Color(1, 1, 1, 0.03)
		sb.border_color = C.ACCENT if have else Color(1, 1, 1, 0.10)
		sb.border_width_left = 3
		sb.set_corner_radius_all(4)
		sb.content_margin_left = 10
		sb.content_margin_right = 8
		sb.content_margin_top = 4
		sb.content_margin_bottom = 5
		p.add_theme_stylebox_override("panel", sb)
		var h := K.hbox(10)
		p.add_child(h)
		var n := K.bold(String(a.name), C.FS_SMALL + 1, C.TEXT if have else C.MUTED)
		n.custom_minimum_size.x = 128
		h.add_child(n)
		var d := K.label(String(a.desc), C.FS_SMALL, C.MUTED if have else Color(C.MUTED, 0.65))
		d.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		d.clip_text = true
		d.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		d.tooltip_text = String(a.desc)
		h.add_child(d)
		_ach_grid.add_child(p)
	_ach_title.text = "Достижения  %d / %d" % [got, Data.ACHIEVEMENTS.size()]


func _refresh_table() -> void:
	for c in _table.get_children():
		_table.remove_child(c)
		c.queue_free()
	var book: Array = Profile.data.get("logbook", [])
	if book.is_empty():
		var l := K.muted("Боёв пока нет", C.FS_BODY - 1)
		l.custom_minimum_size.y = 40
		l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		_table.add_child(l)
		return
	for e in book:
		if not e is Dictionary:
			continue
		var outcome := String(e.get("outcome", "exit"))
		var mode := String(e.get("mode", ""))
		var cr := int(e.get("credits", 0))
		var res := K.outcome_short(outcome)
		if mode == "training":
			res = "Пройдено" if outcome == "win" else "Выход"
		var planes: Array = e.get("planes", []) if e.get("planes", []) is Array else []
		var cells := [K.short_date(String(e.get("date", ""))), K.map_name(String(e.get("map_id", ""))), K.mode_name(mode),
			K.plane_names(planes), res, Game.fmt_int(int(e.get("kills", 0))), ("+" if cr > 0 else "") + Game.fmt_int(cr)]
		var colors := [C.MUTED, C.TEXT, C.TEXT, C.TEXT, K.outcome_color(outcome), C.TEXT, C.GOOD if cr > 0 else C.MUTED]
		_table.add_child(_row_box(cells, false, colors))


func _on_replay() -> void:
	if not has_replay():
		return
	if Sfx.has_method("play"):
		Sfx.play("click")
	Profile.save_profile()
	Game.go_replay()
