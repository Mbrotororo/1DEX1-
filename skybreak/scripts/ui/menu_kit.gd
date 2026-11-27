extends RefCounted
## Общие элементы меню (ангар, результаты): тема, подписи, плашки, полосы прогресса,
## переключатели и факты о самолёте.

const C := preload("res://scripts/ui/ui_style.gd")

## Крупные элементы для сенсорного экрана. Выставляет HangarUI / ResultsScreen.
static var touch := false
static var _bold: FontVariation
static var _wide: FontVariation
static var _icons: Dictionary = {}


static func btn_h(base: int = 38) -> int:
	return int(round(base * (1.3 if touch else 1.0)))


static func bold_font() -> Font:
	if _bold == null:
		_bold = FontVariation.new()
		_bold.base_font = ThemeDB.fallback_font
		_bold.variation_embolden = 0.6
	return _bold


## Жирный шрифт с разрядкой для логотипа.
static func wide_font() -> Font:
	if _wide == null:
		_wide = FontVariation.new()
		_wide.base_font = ThemeDB.fallback_font
		_wide.variation_embolden = 0.9
		_wide.spacing_glyph = 3
	return _wide


# ---------------------------------------------------------------- тема

static func theme() -> Theme:
	var t: Theme = C.make_theme()
	var field := Color(0.06, 0.08, 0.09, 0.95)
	var pop := Color("1a2025")
	# кнопки: те же стили, что в UiStyle, плюс состояние hover_pressed для переключателей
	t.set_stylebox("hover_pressed", "Button", C.box(C.ACCENT_DARK.lightened(0.08), 6, C.ACCENT, 1))
	t.set_color("font_hover_pressed_color", "Button", Color.WHITE)
	t.set_stylebox("disabled", "OptionButton", C.box(Color(0.10, 0.12, 0.14, 0.7)))
	t.set_stylebox("focus", "OptionButton", StyleBoxEmpty.new())
	t.set_color("font_hover_color", "OptionButton", Color.WHITE)
	t.set_color("font_disabled_color", "OptionButton", C.MUTED)
	# поле ввода
	t.set_stylebox("normal", "LineEdit", C.box(field))
	t.set_stylebox("focus", "LineEdit", C.box(Color(0, 0, 0, 0), 6, C.ACCENT, 1))
	t.set_stylebox("read_only", "LineEdit", C.box(field))
	t.set_color("font_color", "LineEdit", C.TEXT)
	t.set_color("caret_color", "LineEdit", C.ACCENT)
	t.set_color("selection_color", "LineEdit", Color(C.ACCENT, 0.35))
	t.set_color("font_placeholder_color", "LineEdit", C.MUTED)
	# флажок
	var empty := StyleBoxEmpty.new()
	empty.content_margin_left = 2
	empty.content_margin_right = 2
	empty.content_margin_top = 4
	empty.content_margin_bottom = 4
	for st in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		t.set_stylebox(st, "CheckBox", empty)
	t.set_icon("checked", "CheckBox", check_icon(true))
	t.set_icon("unchecked", "CheckBox", check_icon(false))
	t.set_icon("checked_disabled", "CheckBox", check_icon(true))
	t.set_icon("unchecked_disabled", "CheckBox", check_icon(false))
	t.set_color("font_hover_color", "CheckBox", Color.WHITE)
	t.set_color("font_pressed_color", "CheckBox", C.TEXT)
	t.set_color("font_hover_pressed_color", "CheckBox", Color.WHITE)
	t.set_color("font_focus_color", "CheckBox", C.TEXT)
	t.set_constant("h_separation", "CheckBox", 10)
	# ползунок
	var track := StyleBoxFlat.new()
	track.bg_color = Color(1, 1, 1, 0.14)
	track.set_corner_radius_all(3)
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	var fill := track.duplicate() as StyleBoxFlat
	fill.bg_color = C.ACCENT
	t.set_stylebox("slider", "HSlider", track)
	t.set_stylebox("grabber_area", "HSlider", fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", fill)
	t.set_icon("grabber", "HSlider", dot_icon(Color("f4f6f7"), 18))
	t.set_icon("grabber_highlight", "HSlider", dot_icon(C.ACCENT.lightened(0.25), 18))
	t.set_icon("grabber_disabled", "HSlider", dot_icon(C.MUTED, 18))
	t.set_icon("tick", "HSlider", ImageTexture.new())
	# полоса прогресса
	var pb := StyleBoxFlat.new()
	pb.bg_color = Color(1, 1, 1, 0.10)
	pb.set_corner_radius_all(3)
	var pf := StyleBoxFlat.new()
	pf.bg_color = C.ACCENT
	pf.set_corner_radius_all(3)
	t.set_stylebox("background", "ProgressBar", pb)
	t.set_stylebox("fill", "ProgressBar", pf)
	t.set_color("font_color", "ProgressBar", C.TEXT)
	# полосы прокрутки
	for sb in ["VScrollBar", "HScrollBar"]:
		var bg := StyleBoxFlat.new()
		bg.bg_color = Color(1, 1, 1, 0.03)
		bg.set_corner_radius_all(4)
		bg.content_margin_left = 2
		bg.content_margin_right = 2
		bg.content_margin_top = 2
		bg.content_margin_bottom = 2
		var gr := StyleBoxFlat.new()
		gr.bg_color = Color(1, 1, 1, 0.22)
		gr.set_corner_radius_all(4)
		var grh := gr.duplicate() as StyleBoxFlat
		grh.bg_color = Color(1, 1, 1, 0.35)
		var grp := gr.duplicate() as StyleBoxFlat
		grp.bg_color = C.ACCENT
		t.set_stylebox("scroll", sb, bg)
		t.set_stylebox("scroll_focus", sb, bg)
		t.set_stylebox("grabber", sb, gr)
		t.set_stylebox("grabber_highlight", sb, grh)
		t.set_stylebox("grabber_pressed", sb, grp)
		for ic in ["increment", "decrement", "increment_highlight", "decrement_highlight", "increment_pressed", "decrement_pressed"]:
			t.set_icon(ic, sb, ImageTexture.new())
	# всплывающее меню
	var pp := C.box(pop, 6, Color(1, 1, 1, 0.16))
	pp.content_margin_top = 6
	pp.content_margin_bottom = 6
	pp.content_margin_left = 6
	pp.content_margin_right = 6
	t.set_stylebox("panel", "PopupMenu", pp)
	var ph := C.box(Color(C.ACCENT, 0.85), 4, Color(0, 0, 0, 0), 0)
	t.set_stylebox("hover", "PopupMenu", ph)
	var psep := StyleBoxLine.new()
	psep.color = Color(1, 1, 1, 0.12)
	psep.thickness = 1
	t.set_stylebox("separator", "PopupMenu", psep)
	t.set_color("font_color", "PopupMenu", C.TEXT)
	t.set_color("font_hover_color", "PopupMenu", Color("1a1208"))
	t.set_color("font_disabled_color", "PopupMenu", C.MUTED)
	t.set_color("font_accelerator_color", "PopupMenu", C.MUTED)
	t.set_constant("v_separation", "PopupMenu", 12)
	t.set_constant("item_start_padding", "PopupMenu", 10)
	t.set_constant("item_end_padding", "PopupMenu", 14)
	t.set_font_size("font_size", "PopupMenu", C.FS_BODY)
	t.set_icon("radio_checked", "PopupMenu", dot_icon(C.ACCENT, 12))
	t.set_icon("radio_unchecked", "PopupMenu", ImageTexture.new())
	t.set_icon("checked", "PopupMenu", dot_icon(C.ACCENT, 12))
	t.set_icon("unchecked", "PopupMenu", ImageTexture.new())
	# подсказка
	t.set_stylebox("panel", "TooltipPanel", C.box(pop, 4, Color(1, 1, 1, 0.16)))
	t.set_color("font_color", "TooltipLabel", C.TEXT)
	t.set_font_size("font_size", "TooltipLabel", C.FS_SMALL + 1)
	# окна (диалог подтверждения)
	var wb := C.box(pop, 8, Color(1, 1, 1, 0.16))
	wb.expand_margin_left = 10
	wb.expand_margin_right = 10
	wb.expand_margin_bottom = 10
	wb.expand_margin_top = 38
	t.set_stylebox("embedded_border", "Window", wb)
	t.set_stylebox("embedded_unfocused_border", "Window", wb)
	t.set_color("title_color", "Window", C.TEXT)
	t.set_font_size("title_font_size", "Window", C.FS_BODY)
	t.set_constant("title_height", "Window", 34)
	t.set_stylebox("panel", "AcceptDialog", StyleBoxEmpty.new())
	t.set_constant("buttons_separation", "AcceptDialog", 12)
	return t


## Иконка флажка: рамка или оранжевый квадрат с галочкой.
static func check_icon(on: bool) -> Texture2D:
	var key := "check_%s" % on
	if _icons.has(key):
		return _icons[key]
	var s := 22
	var img := Image.create(s, s, false, Image.FORMAT_RGBA8)
	var a := Vector2(5.5, 11.5)
	var b := Vector2(9.5, 15.5)
	var c := Vector2(16.5, 6.5)
	for y in s:
		for x in s:
			var p := Vector2(x + 0.5, y + 0.5)
			var d := _round_rect_sd(p, Vector2(s * 0.5, s * 0.5), Vector2(9.5, 9.5), 4.0)
			var col := Color(0, 0, 0, 0)
			if on:
				var inside := clampf(0.5 - d, 0.0, 1.0)
				col = Color(C.ACCENT, inside)
				var dl := minf(_seg_dist(p, a, b), _seg_dist(p, b, c))
				var m := clampf(1.9 - dl, 0.0, 1.0) * inside
				col = col.lerp(Color("1a1208"), m)
				col.a = inside
			else:
				var fill_a := clampf(0.5 - d, 0.0, 1.0)
				var ring := clampf(1.0 - absf(d + 0.75), 0.0, 1.0)
				col = Color(0.05, 0.07, 0.08, 0.9 * fill_a)
				col = col.lerp(Color(1, 1, 1, 0.5), ring)
				col.a = maxf(0.9 * fill_a, ring * 0.6)
			img.set_pixel(x, y, col)
	var tex := ImageTexture.create_from_image(img)
	_icons[key] = tex
	return tex


static func dot_icon(color: Color, size: int) -> Texture2D:
	var key := "dot_%s_%d" % [color.to_html(), size]
	if _icons.has(key):
		return _icons[key]
	var img := Image.create(size, size, false, Image.FORMAT_RGBA8)
	var r := size * 0.5 - 1.0
	for y in size:
		for x in size:
			var d := Vector2(x + 0.5, y + 0.5).distance_to(Vector2(size * 0.5, size * 0.5)) - r
			img.set_pixel(x, y, Color(color, clampf(0.5 - d, 0.0, 1.0)))
	var tex := ImageTexture.create_from_image(img)
	_icons[key] = tex
	return tex


static func _round_rect_sd(p: Vector2, center: Vector2, half: Vector2, r: float) -> float:
	var q := (p - center).abs() - half + Vector2(r, r)
	return Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - r


static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
	return p.distance_to(a + ab * t)


# ---------------------------------------------------------------- элементы

static func label(text: String, size: int = C.FS_BODY, color: Color = C.TEXT) -> Label:
	var l: Label = C.label(text, size, color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func bold(text: String, size: int = C.FS_BODY, color: Color = C.TEXT) -> Label:
	var l := label(text, size, color)
	l.add_theme_font_override("font", bold_font())
	return l


static func muted(text: String, size: int = C.FS_SMALL) -> Label:
	return label(text, size, C.MUTED)


static func para(text: String, size: int = C.FS_BODY, color: Color = C.TEXT) -> Label:
	var l := label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size.x = 40
	return l


static func title(text: String) -> Label:
	return bold(text, 21)


## Подпись над группой элементов: мелко и приглушённо.
static func caption(text: String) -> Label:
	var l := label(text, C.FS_SMALL, C.MUTED)
	return l


static func button(text: String, primary: bool = false, height: int = 38) -> Button:
	var b: Button = C.button(text, primary)
	b.custom_minimum_size.y = btn_h(height)
	b.mouse_filter = Control.MOUSE_FILTER_STOP
	if not primary:
		b.add_theme_font_size_override("font_size", C.FS_BODY - 1)
	return b


static func danger_button(text: String) -> Button:
	var b := button(text)
	b.add_theme_stylebox_override("normal", C.box(Color(C.DANGER, 0.14), 6, Color(C.DANGER, 0.6), 1))
	b.add_theme_stylebox_override("hover", C.box(Color(C.DANGER, 0.28), 6, C.DANGER, 1))
	b.add_theme_stylebox_override("pressed", C.box(Color(C.DANGER, 0.45), 6, C.DANGER, 1))
	b.add_theme_color_override("font_color", Color("ffd6d2"))
	return b


static func card(color: Color = C.PANEL, radius: int = 8, pad: int = 14) -> PanelContainer:
	var p := PanelContainer.new()
	var sb: StyleBoxFlat = C.box(color, radius, C.LINE, 1)
	sb.content_margin_left = pad
	sb.content_margin_right = pad
	sb.content_margin_top = pad - 2
	sb.content_margin_bottom = pad - 2
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p.mouse_force_pass_scroll_events = false
	return p


static func vbox(sep: int = 8) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", sep)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return v


static func hbox(sep: int = 8) -> HBoxContainer:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", sep)
	h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return h


static func spacer(h: float = 0.0, expand: bool = false) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if expand:
		c.size_flags_vertical = Control.SIZE_EXPAND_FILL
		c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return c


static func hline() -> ColorRect:
	var r := ColorRect.new()
	r.color = C.LINE
	r.custom_minimum_size = Vector2(0, 1)
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func progress(value: float, max_value: float, height: int = 6, color: Color = C.ACCENT) -> ProgressBar:
	var p := ProgressBar.new()
	p.show_percentage = false
	p.max_value = maxf(1.0, max_value)
	p.value = clampf(value, 0.0, p.max_value)
	p.custom_minimum_size = Vector2(0, height)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if color != C.ACCENT:
		var f := StyleBoxFlat.new()
		f.bg_color = color
		f.set_corner_radius_all(3)
		p.add_theme_stylebox_override("fill", f)
	return p


## Строка «название ...... значение».
static func stat_row(name_text: String, value_text: String, value_color: Color = C.TEXT) -> HBoxContainer:
	var h := hbox(10)
	var n := label(name_text, C.FS_SMALL + 1, C.MUTED)
	n.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(n)
	var v := label(value_text, C.FS_SMALL + 1, value_color)
	v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	h.add_child(v)
	return h


## Цветная плашка с текстом.
static func badge(text: String, color: Color) -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(color, 0.16)
	sb.border_color = Color(color, 0.55)
	sb.set_border_width_all(1)
	sb.set_corner_radius_all(4)
	sb.content_margin_left = 7
	sb.content_margin_right = 7
	sb.content_margin_top = 1
	sb.content_margin_bottom = 2
	p.add_theme_stylebox_override("panel", sb)
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	p.add_child(label(text, C.FS_SMALL, color.lightened(0.25)))
	return p


## Группа кнопок-переключателей. options: [[id, текст], ...]. on_pick(id) вызывается при выборе.
static func segmented(options: Array, current, on_pick: Callable, height: int = 38) -> HBoxContainer:
	var h := hbox(6)
	var group := ButtonGroup.new()
	for o in options:
		var b := button(String(o[1]), false, height)
		b.toggle_mode = true
		b.button_group = group
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.button_pressed = o[0] == current
		b.set_meta("value", o[0])
		var val = o[0]
		b.pressed.connect(func(): on_pick.call(val))
		h.add_child(b)
	return h


static func set_segmented(h: HBoxContainer, current) -> void:
	for b in h.get_children():
		if b is Button:
			b.set_pressed_no_signal(b.get_meta("value") == current)


static func option(items: Array, current, on_pick: Callable) -> OptionButton:
	var o := OptionButton.new()
	o.focus_mode = Control.FOCUS_NONE
	o.custom_minimum_size.y = btn_h(36)
	o.fit_to_longest_item = false
	for i in items.size():
		o.add_item(String(items[i][1]), i)
		o.set_item_metadata(i, items[i][0])
		if items[i][0] == current:
			o.select(i)
	o.item_selected.connect(func(idx: int): on_pick.call(o.get_item_metadata(idx)))
	return o


## Слой на весь экран поверх parent. Нажатие мимо содержимого закрывает его (если close_on_click).
static func overlay(parent: Control, dim: bool = true, close_on_click: bool = true) -> ColorRect:
	var o := ColorRect.new()
	o.color = Color(0, 0, 0, 0.5) if dim else Color(0, 0, 0, 0)
	o.mouse_filter = Control.MOUSE_FILTER_STOP
	o.mouse_force_pass_scroll_events = false
	parent.add_child(o)
	o.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if close_on_click:
		o.gui_input.connect(func(e: InputEvent):
			if e is InputEventMouseButton and e.pressed:
				o.queue_free())
	return o


## Самый верхний Control-предок (корень сцены меню): на него вешаются окна поверх всего экрана.
static func top_control(c: Control) -> Control:
	var top := c
	var p := c.get_parent()
	while p is Control:
		top = p
		p = p.get_parent()
	return top


## Окно подтверждения по центру экрана.
static func confirm(parent: Control, title_text: String, body: String, ok_text: String, on_ok: Callable) -> Control:
	var o := overlay(top_control(parent), true, true)
	var center := CenterContainer.new()
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	o.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var c := card(Color("161c20"), 10, 22)
	c.custom_minimum_size.x = 420
	center.add_child(c)
	var v := vbox(14)
	c.add_child(v)
	v.add_child(title(title_text))
	v.add_child(para(body, C.FS_BODY - 1, C.MUTED))
	var row := hbox(10)
	row.alignment = BoxContainer.ALIGNMENT_END
	var cancel := button("Отмена")
	cancel.custom_minimum_size.x = 120
	cancel.pressed.connect(o.queue_free)
	row.add_child(cancel)
	var ok := danger_button(ok_text)
	ok.custom_minimum_size.x = 140
	ok.pressed.connect(func():
		o.queue_free()
		on_ok.call())
	row.add_child(ok)
	v.add_child(row)
	return o


## Кнопка без фона для списков (всплывающее меню слота).
static func list_button(text: String, sub: String = "", marked: bool = false, text_color: Color = C.TEXT) -> Button:
	var b := Button.new()
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(250, btn_h(36))
	var n: StyleBoxFlat = C.box(Color(0, 0, 0, 0), 4, Color(0, 0, 0, 0), 0)
	var h: StyleBoxFlat = C.box(Color(1, 1, 1, 0.08), 4, Color(0, 0, 0, 0), 0)
	var pr: StyleBoxFlat = C.box(Color(C.ACCENT, 0.35), 4, Color(0, 0, 0, 0), 0)
	b.add_theme_stylebox_override("normal", n)
	b.add_theme_stylebox_override("hover", h)
	b.add_theme_stylebox_override("pressed", pr)
	b.add_theme_stylebox_override("disabled", n)
	# колонки: отметка, название, подпись
	var row := hbox(0)
	b.add_child(row)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 8
	row.offset_right = -10
	var dot := label("●" if marked else "", C.FS_SMALL - 2, C.ACCENT)
	dot.custom_minimum_size.x = 18
	dot.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(dot)
	var t := label(text, C.FS_BODY - 1, text_color)
	t.custom_minimum_size.x = 118
	t.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(t)
	var sl := label(sub, C.FS_SMALL, C.MUTED)
	sl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(sl)
	b.set_meta("text_label", t)
	b.custom_minimum_size.x = maxf(250.0, 18.0 + 118.0 + sl.get_minimum_size().x + 24.0)
	return b


# ---------------------------------------------------------------- самолёт: факты и тексты

static func plural(n: int, one: String, few: String, many: String) -> String:
	var a := absi(n) % 100
	if a >= 11 and a <= 14:
		return many
	match a % 10:
		1:
			return one
		2, 3, 4:
			return few
	return many


static func fmt_dec(v: float, digits: int = 1) -> String:
	return (("%." + str(digits) + "f") % v).replace(".", ",")


static func plane_title(def: Dictionary) -> String:
	return "%s · %s" % [def.get("name", ""), def.get("code", "")]


static func rank_level_text(def: Dictionary) -> String:
	return "Ранг %s · Уровень %s" % [Data.RANK_ROMAN[int(def.get("rank", 1))], Data.level_text(float(def.get("level", 1.0)))]


## Примерная максимальная скорость у земли, м/с: баланс тяги (мощности) и сопротивления.
static func top_speed_estimate(def: Dictionary) -> float:
	var rho := 1.225
	var s := float(def.wing_area)
	var cd0 := float(def.cd0)
	var v := 0.0
	if def.kind == "prop":
		var p := float(def.power_kw) * 1000.0 * (1.0 + float(def.afterburner)) * 0.8
		v = pow(2.0 * p / (rho * s * cd0), 1.0 / 3.0)
	else:
		var thrust := float(def.thrust) + float(def.afterburner)
		v = sqrt(2.0 * thrust / (rho * s * cd0))
		v = minf(v, float(def.mcrit) * 340.0 * 1.25)
	return minf(v, float(def.vne))


static func thrust_to_weight(def: Dictionary) -> float:
	var thrust := float(def.thrust)
	if def.kind == "jet":
		thrust += float(def.afterburner)
	return thrust / (float(def.mass) * 9.81)


## [[название, значение], ...] для карточки самолёта.
static func plane_facts(def: Dictionary) -> Array:
	var out: Array = []
	var v := int(round(top_speed_estimate(def) * 3.6 / 10.0)) * 10
	out.append(["Макс. скорость", "≈ " + Game.fmt_int(v) + " км/ч"])
	if def.kind == "prop":
		out.append(["Мощность", Game.fmt_int(int(def.power_kw)) + " кВт"])
	else:
		var dry := int(round(float(def.thrust) / 1000.0))
		var ab := float(def.afterburner)
		if ab > 0.0:
			out.append(["Тяга", "%s кН, форсаж %s кН" % [Game.fmt_int(dry), Game.fmt_int(int(round((float(def.thrust) + ab) / 1000.0)))]])
		else:
			out.append(["Тяга", Game.fmt_int(dry) + " кН"])
	out.append(["Масса", Game.fmt_int(int(def.mass)) + " кг"])
	out.append(["Тяговооружённость", fmt_dec(thrust_to_weight(def), 2)])
	out.append(["Перегрузка", "до " + fmt_dec(float(def.g_limit), 1).trim_suffix(",0") + " g"])
	out.append(["Ремонт", Game.fmt_int(int(def.repair)) + " кр."])
	return out


## Строки вооружения: «2 × 20 мм», «8 ракет», «4 бомбы по 100 кг».
static func weapon_lines(def: Dictionary) -> Array:
	var out: Array = []
	var w: Dictionary = def.get("weapons", {})
	for g in w.get("guns", []):
		out.append("%d × %s" % [int(g.count), String(g.label)])
	var r: Dictionary = w.get("rockets", {})
	if int(r.get("count", 0)) > 0:
		var n := int(r.count)
		out.append("%d %s" % [n, plural(n, "ракета", "ракеты", "ракет")])
	var b: Dictionary = w.get("bombs", {})
	if int(b.get("count", 0)) > 0:
		var n := int(b.count)
		out.append("%d %s по %d кг" % [n, plural(n, "бомба", "бомбы", "бомб"), int(b.mass)])
	var m: Dictionary = w.get("missiles", {})
	if int(m.get("count", 0)) > 0:
		var n := int(m.count)
		out.append("%d %s «воздух-воздух»" % [n, plural(n, "ракета", "ракеты", "ракет")])
	var f := int(w.get("flares", 0))
	if f > 0:
		out.append("%d %s" % [f, plural(f, "ловушка", "ловушки", "ловушек")])
	return out


static func map_name(map_id: String) -> String:
	if map_id == "" or map_id == "random":
		return "Случайная"
	for m in Data.MAPS:
		if m.id == map_id:
			return String(m.name)
	return map_id


static func mode_name(mode: String) -> String:
	return String(Data.MODE_NAMES.get(mode, mode))


static func outcome_text(outcome: String, mode: String = "arcade") -> String:
	if mode == "training":
		return "Обучение пройдено" if outcome == "win" else "Обучение прервано"
	if mode == "test":
		return "Тестовый полёт окончен"
	match outcome:
		"win":
			return "Победа"
		"loss":
			return "Поражение"
		"draw":
			return "Ничья"
	return "Бой покинут"


static func outcome_short(outcome: String) -> String:
	match outcome:
		"win":
			return "Победа"
		"loss":
			return "Поражение"
		"draw":
			return "Ничья"
	return "Выход"


static func outcome_color(outcome: String) -> Color:
	match outcome:
		"win":
			return C.GOOD
		"loss":
			return C.DANGER
		"draw":
			return C.WARN
	return C.MUTED


static func plane_names(ids: Array) -> String:
	var parts: PackedStringArray = []
	for id in ids:
		parts.append(String(Data.plane(String(id)).get("name", String(id))))
	return ", ".join(parts)


## "2026-11-27 14:05:33" -> "27.11 14:05"
static func short_date(s: String) -> String:
	if s.length() < 16:
		return s
	return "%s.%s %s" % [s.substr(8, 2), s.substr(5, 2), s.substr(11, 5)]


static func plane_color(def: Dictionary) -> Color:
	var sh: Dictionary = def.get("shape", {})
	return sh.get("base_color", Color(0.5, 0.5, 0.5))
