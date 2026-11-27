extends Control
## Итог боя: исход, личная статистика, таблица команд, награды, опыт и исследования.
## Profile.apply_battle_result вызывается ровно один раз (флаг Game.result_applied).

const C := preload("res://scripts/ui/ui_style.gd")
const K := preload("res://scripts/ui/menu_kit.gd")
## [заголовок, ширина, растяжение]
const SCORE_COLS := [["Пилот", 120, 1.0], ["Самолёт", 110, 0.0], ["Сбито", 54, 0.0], ["Цели", 50, 0.0],
	["Потери", 62, 0.0], ["Очки", 62, 0.0]]

var result: Dictionary = {}
var summary: Dictionary = {}

var _replay_btn: Button
var _hangar_btn: Button


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	K.touch = Game.is_touch()
	theme = K.theme()
	result = Game.last_result
	if not result.is_empty():
		if not Game.result_applied:
			summary = Profile.apply_battle_result(result)
			Game.result_applied = true
		else:
			var cached = Profile.data.get("last_summary", {})
			summary = cached if cached is Dictionary else {}
	_build()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
			get_viewport().set_input_as_handled()
			_go_hangar()


# ---------------------------------------------------------------- построение

func _build() -> void:
	var bg := ColorRect.new()
	bg.color = C.BG
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var outcome := String(result.get("outcome", "exit"))
	var mode := String(result.get("mode", "arcade"))
	var accent := K.outcome_color(outcome)
	if mode == "test":
		accent = C.MUTED
	elif mode == "training":
		accent = C.GOOD if outcome == "win" else C.MUTED
	# мягкое свечение цвета исхода сверху
	var glow := TextureRect.new()
	var gt := GradientTexture2D.new()
	var gr := Gradient.new()
	gr.set_color(0, Color(accent, 0.16))
	gr.set_color(1, Color(accent, 0.0))
	gt.gradient = gr
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.0)
	gt.fill_to = Vector2(0.5, 1.0)
	gt.width = 256
	gt.height = 128
	glow.texture = gt
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.stretch_mode = TextureRect.STRETCH_SCALE
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)
	glow.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	glow.offset_bottom = 300

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "right"]:
		margin.add_theme_constant_override("margin_" + side, 24)
	margin.add_theme_constant_override("margin_top", 18)
	margin.add_theme_constant_override("margin_bottom", 18)
	add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root := K.vbox(14)
	margin.add_child(root)

	if result.is_empty():
		var c := CenterContainer.new()
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		c.add_child(K.label("Нет данных о бое", C.FS_TITLE, C.MUTED))
		root.add_child(c)
		root.add_child(_build_buttons())
		return

	root.add_child(_build_banner(outcome, mode, accent))
	var cols := K.hbox(16)
	cols.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(cols)
	var left := _build_personal(mode)
	cols.add_child(left)
	var center := _build_scoreboard()
	center.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(center)
	cols.add_child(_build_progress(mode))
	root.add_child(_build_buttons())


func _build_banner(outcome: String, mode: String, accent: Color) -> Control:
	var h := K.hbox(16)
	var v := K.vbox(2)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var t := K.bold(K.outcome_text(outcome, mode), C.FS_HUGE, accent)
	v.add_child(t)
	var parts: PackedStringArray = []
	parts.append(K.map_name(String(result.get("map_id", ""))))
	if mode in ["arcade", "realistic"]:
		parts.append(K.mode_name(mode))
	if result.has("size") and mode in ["arcade", "realistic"]:
		parts.append("%d × %d" % [int(result.size), int(result.size)])
	parts.append(Game.fmt_time(float(result.get("duration", 0.0))))
	var tw: PackedStringArray = []
	var tod := String(result.get("time_of_day", ""))
	if Data.TIME_NAMES.has(tod) and tod != "random":
		tw.append(String(Data.TIME_NAMES[tod]))
	var wth := String(result.get("weather", ""))
	if Data.WEATHER_NAMES.has(wth) and wth != "random":
		tw.append(String(Data.WEATHER_NAMES[wth]).to_lower())
	if not tw.is_empty():
		parts.append(", ".join(tw))
	v.add_child(K.label("  ·  ".join(parts), C.FS_BODY, C.MUTED))
	h.add_child(v)
	# очки команд
	var tk = result.get("tickets", null)
	if tk is Array and tk.size() >= 2 and mode in ["arcade", "realistic"]:
		var box := K.hbox(14)
		box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for i in 2:
			var col := K.vbox(0)
			var n := K.bold(Game.fmt_int(int(round(float(tk[i])))), 30, C.team_color(i))
			n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			col.add_child(n)
			var cap := K.muted(String(Data.TEAM_NAMES[i]))
			cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			col.add_child(cap)
			box.add_child(col)
			if i == 0:
				var colon := K.label(":", 28, C.MUTED)
				colon.vertical_alignment = VERTICAL_ALIGNMENT_TOP
				box.add_child(colon)
		h.add_child(box)
	return h


func _build_personal(mode: String) -> Control:
	var card := K.card(C.PANEL, 10, 16)
	card.custom_minimum_size.x = 290 if not K.touch else 320
	var scroll := _scroll(card)
	var v := K.vbox(6)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	v.add_child(K.title("Твой бой"))
	var rows := [
		["Сбито", int(result.get("kills", 0))],
		["Наземных целей", int(result.get("ground_kills", 0))],
		["Помощь", int(result.get("assists", 0))],
		["Захваты", int(result.get("captures", 0))],
		["Посадки", int(result.get("landings", 0))],
		["Потери", int(result.get("deaths", 0))],
		["Очки", int(result.get("score", 0))],
	]
	for r in rows:
		v.add_child(K.stat_row(String(r[0]), Game.fmt_int(int(r[1]))))
	var planes: Array = result.get("planes_used", []) if result.get("planes_used", []) is Array else []
	if not planes.is_empty():
		v.add_child(K.stat_row("Самолёты", K.plane_names(planes)))
	v.add_child(K.spacer(6))
	v.add_child(K.title("Награды"))
	if mode == "test":
		v.add_child(K.para("В тестовом полёте наград нет", C.FS_SMALL + 1, C.MUTED))
		return card
	var earned := int(summary.get("credits_earned", result.get("credits", 0)))
	var repair := int(summary.get("repair_cost", 0))
	var repair_full := int(summary.get("repair_full", repair))
	var delta := int(summary.get("credits_delta", maxi(0, earned - repair)))
	v.add_child(K.stat_row("Кредиты", "+" + Game.fmt_int(earned) + " кр.", C.GOOD))
	if repair_full > 0:
		var txt := "−" + Game.fmt_int(repair) + " кр."
		if repair_full > repair:
			txt = "−%s из %s кр." % [Game.fmt_int(repair), Game.fmt_int(repair_full)]
		v.add_child(K.stat_row("Ремонт", txt, C.DANGER))
	v.add_child(K.hline())
	var total := K.stat_row("Итого", ("+" if delta > 0 else "") + Game.fmt_int(delta) + " кр.", C.GOOD if delta > 0 else C.TEXT)
	for c in total.get_children():
		(c as Label).add_theme_font_override("font", K.bold_font())
		(c as Label).add_theme_font_size_override("font_size", C.FS_BODY)
	v.add_child(total)
	v.add_child(K.stat_row("Опыт", "+" + Game.fmt_int(int(summary.get("xp_total", 0))) + " оп.", C.ACCENT))
	v.add_child(K.stat_row("Баланс", Game.fmt_int(int(Profile.data.get("credits", 0))) + " кр."))
	return card


func _build_scoreboard() -> Control:
	var card := K.card(C.PANEL, 10, 16)
	var outer := K.vbox(8)
	card.add_child(outer)
	outer.add_child(K.title("Таблица"))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	outer.add_child(scroll)
	var v := K.vbox(3)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	var rows: Array = result.get("scoreboard", []) if result.get("scoreboard", []) is Array else []
	if rows.is_empty():
		v.add_child(K.muted("Нет данных", C.FS_BODY - 1))
		return card
	for team in [0, 1]:
		var team_rows: Array = []
		for r in rows:
			if r is Dictionary and int(r.get("team", 0)) == team:
				team_rows.append(r)
		if team_rows.is_empty():
			continue
		team_rows.sort_custom(func(a, b): return int(a.get("score", 0)) > int(b.get("score", 0)))
		var head := K.hbox(8)
		var mark := ColorRect.new()
		mark.color = C.team_color(team)
		mark.custom_minimum_size = Vector2(4, 16)
		mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		head.add_child(mark)
		head.add_child(K.bold(String(Data.TEAM_NAMES[team]), C.FS_BODY, C.team_color(team).lightened(0.15)))
		if team == 1:
			v.add_child(K.spacer(6))
		v.add_child(head)
		v.add_child(_score_row(SCORE_COLS.map(func(c): return c[0]), true, false))
		for r in team_rows:
			var cells := [String(r.get("name", "")), _plane_label(r), Game.fmt_int(int(r.get("kills", 0))),
				Game.fmt_int(int(r.get("ground", r.get("ground_kills", 0)))), Game.fmt_int(int(r.get("deaths", 0))),
				Game.fmt_int(int(r.get("score", 0)))]
			v.add_child(_score_row(cells, false, bool(r.get("is_player", false))))
	return card


func _plane_label(r: Dictionary) -> String:
	var pid := String(r.get("plane_id", ""))
	if Data.has_plane(pid):
		return String(Data.plane(pid).name)
	var p := String(r.get("plane", ""))
	if Data.has_plane(p):
		return String(Data.plane(p).name)
	return p


func _score_row(cells: Array, header: bool, is_player: bool) -> PanelContainer:
	var p := PanelContainer.new()
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new()
	if header:
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = C.LINE
		sb.border_width_bottom = 1
	elif is_player:
		sb.bg_color = Color(C.ACCENT, 0.16)
		sb.border_color = Color(C.ACCENT, 0.6)
		sb.border_width_left = 2
	else:
		sb.bg_color = Color(1, 1, 1, 0.03)
	sb.set_corner_radius_all(4)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 3 if not K.touch else 6
	sb.content_margin_bottom = 3 if not K.touch else 6
	p.add_theme_stylebox_override("panel", sb)
	var h := K.hbox(8)
	p.add_child(h)
	for i in SCORE_COLS.size():
		var l: Label
		var text := String(cells[i]) if i < cells.size() else ""
		if header:
			l = K.label(text, C.FS_SMALL - 1, C.MUTED)
		elif is_player:
			l = K.bold(text, C.FS_SMALL + 1, Color.WHITE)
		else:
			l = K.label(text, C.FS_SMALL + 1, C.TEXT if i != 1 else C.MUTED)
		l.custom_minimum_size.x = float(SCORE_COLS[i][1])
		l.clip_text = true
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		if float(SCORE_COLS[i][2]) > 0.0:
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if i >= 2:
			l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		h.add_child(l)
	return p


func _build_progress(mode: String) -> Control:
	var card := K.card(C.PANEL, 10, 16)
	card.custom_minimum_size.x = 320 if not K.touch else 350
	var scroll := _scroll(card)
	var v := K.vbox(7)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	v.add_child(K.title("Опыт"))
	var xp_by = result.get("xp_by_plane", {})
	var any_xp := false
	if xp_by is Dictionary:
		for id in xp_by:
			if not Data.has_plane(String(id)) or int(xp_by[id]) <= 0:
				continue
			any_xp = true
			v.add_child(K.stat_row(String(Data.plane(String(id)).name), "+" + Game.fmt_int(int(xp_by[id])) + " оп.", C.ACCENT))
	if not any_xp:
		v.add_child(K.muted("Опыта нет" if mode != "test" else "В тестовом полёте опыта нет", C.FS_SMALL + 1))
	var research: Array = summary.get("research", []) if summary.get("research", []) is Array else []
	if not research.is_empty():
		v.add_child(K.spacer(6))
		v.add_child(K.title("Исследование"))
		for e in research:
			if not e is Dictionary:
				continue
			var have := int(e.get("have", 0))
			var need := int(e.get("need", 1))
			var done := bool(e.get("done", false))
			var row := K.hbox(8)
			var n := K.label(String(e.get("name", "")), C.FS_SMALL + 1)
			n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(n)
			row.add_child(K.label("%s / %s оп." % [Game.fmt_int(mini(have, need)), Game.fmt_int(need)], C.FS_SMALL + 1, C.MUTED))
			v.add_child(row)
			v.add_child(K.progress(have, need, 6, C.GOOD if done else C.ACCENT))
		for e in research:
			if e is Dictionary and bool(e.get("done", false)):
				v.add_child(K.bold("Исследован: " + String(e.get("name", "")), C.FS_SMALL + 1, C.GOOD))
	var news: Array = []
	var rank_up := String(summary.get("rank_up", ""))
	if rank_up != "":
		news.append(["Новое звание: " + rank_up, C.ACCENT])
	for a in summary.get("achievements", []):
		news.append(["Достижение: " + String(a), C.WARN])
	for cm in summary.get("camos", []):
		news.append(["Камуфляж: " + String(cm), C.BLUE.lightened(0.2)])
	if not news.is_empty():
		v.add_child(K.spacer(6))
		v.add_child(K.title("Новое"))
		for n in news:
			v.add_child(K.para(String(n[0]), C.FS_SMALL + 1, n[1]))
	return card


func _scroll(card: PanelContainer) -> ScrollContainer:
	var s := ScrollContainer.new()
	s.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	s.mouse_filter = Control.MOUSE_FILTER_PASS
	card.add_child(s)
	return s


func _build_buttons() -> Control:
	var h := K.hbox(10)
	h.add_child(K.spacer(0, true))
	_replay_btn = K.button("Смотреть повтор", false, 46)
	_replay_btn.custom_minimum_size.x = 200
	_replay_btn.visible = not Game.last_replay.is_empty()
	_replay_btn.pressed.connect(_go_replay)
	h.add_child(_replay_btn)
	_hangar_btn = K.button("В ангар", true, 46)
	_hangar_btn.custom_minimum_size.x = 200
	_hangar_btn.pressed.connect(_go_hangar)
	h.add_child(_hangar_btn)
	return h


func _click() -> void:
	if Sfx.has_method("play"):
		Sfx.play("click")


func _go_hangar() -> void:
	_click()
	Profile.save_profile()
	Game.go_hangar()


func _go_replay() -> void:
	if Game.last_replay.is_empty():
		return
	_click()
	Profile.save_profile()
	Game.go_replay()
