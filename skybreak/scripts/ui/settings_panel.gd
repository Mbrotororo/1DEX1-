extends Control
## Настройки: графика, звук, управление, позывной, клавиши, сброс прогресса.

const C := preload("res://scripts/ui/ui_style.gd")
const K := preload("res://scripts/ui/menu_kit.gd")

var _controls: Dictionary = {}     # ключ настройки -> элемент
var _values: Dictionary = {}       # ключ -> подпись со значением
var _name_edit: LineEdit
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

	var g := _column(h, "Графика и звук")
	_option_row(g, "graphics", "Графика", [["low", "Низкая"], ["medium", "Средняя"], ["high", "Высокая"]])
	_slider_row(g, "fov", "Поле зрения", 55.0, 90.0, 1.0)
	_check_row(g, "show_fps", "Показывать FPS")
	g.add_child(K.hline())
	_slider_row(g, "engine_volume", "Громкость двигателя", 0.0, 1.0, 0.05)
	_slider_row(g, "effects_volume", "Громкость эффектов", 0.0, 1.0, 0.05)

	var c := _column(h, "Управление")
	_option_row(c, "control", "Управление", [["mouse", "Мышь"], ["keyboard", "Клавиатура"]])
	_slider_row(c, "sensitivity", "Чувствительность мыши", 0.3, 2.0, 0.05)
	_check_row(c, "invert_y", "Инверсия по вертикали")
	c.add_child(K.hline())
	_option_row(c, "touch", "Сенсорные кнопки", [["auto", "Авто"], ["on", "Вкл"], ["off", "Выкл"]])
	_slider_row(c, "button_scale", "Размер кнопок", 0.7, 1.5, 0.05)
	_check_row(c, "left_handed", "Кнопки огня слева")

	g.add_child(K.spacer(8))
	g.add_child(K.title("Пилот"))
	var name_row := K.hbox(10)
	var nl := K.label("Позывной", C.FS_BODY - 1, C.TEXT)
	nl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_row.add_child(nl)
	_name_edit = LineEdit.new()
	_name_edit.max_length = 16
	_name_edit.placeholder_text = String(Data.DEFAULT_SETTINGS.player_name)
	_name_edit.custom_minimum_size = Vector2(190, K.btn_h(38))
	_name_edit.text_changed.connect(_on_name_changed)
	_name_edit.text_submitted.connect(func(_t: String): _commit_name())
	_name_edit.focus_exited.connect(_commit_name)
	name_row.add_child(_name_edit)
	g.add_child(name_row)

	var p := _column(h, "Клавиши")
	var keys := GridContainer.new()
	keys.columns = 2
	keys.add_theme_constant_override("h_separation", 16)
	keys.add_theme_constant_override("v_separation", 3)
	keys.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for pair in Game.KEY_HELP:
		var a := K.label(String(pair[0]), C.FS_SMALL, C.MUTED)
		a.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		keys.add_child(a)
		keys.add_child(K.label(String(pair[1]), C.FS_SMALL, C.TEXT))
	p.add_child(keys)
	p.add_child(K.spacer(4))
	p.add_child(K.hline())
	var reset := K.danger_button("Сбросить прогресс")
	reset.pressed.connect(_on_reset)
	p.add_child(reset)
	_built = true


func _column(parent: Control, title_text: String) -> VBoxContainer:
	var card := K.card(C.PANEL, 10, 18)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(card)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.mouse_filter = Control.MOUSE_FILTER_PASS
	card.add_child(scroll)
	var v := K.vbox(10)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(v)
	v.add_child(K.title(title_text))
	return v


func _option_row(parent: Control, key: String, text: String, items: Array) -> void:
	var row := K.hbox(10)
	var l := K.label(text, C.FS_BODY - 1, C.TEXT)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(l)
	var o := K.option(items, Profile.get_setting(key), func(v): Profile.set_setting(key, v))
	o.custom_minimum_size.x = 150
	row.add_child(o)
	parent.add_child(row)
	_controls[key] = o


func _slider_row(parent: Control, key: String, text: String, lo: float, hi: float, step: float) -> void:
	var v := K.vbox(4)
	var top := K.hbox(10)
	var l := K.label(text, C.FS_BODY - 1, C.TEXT)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(l)
	var val := K.label("", C.FS_BODY - 1, C.ACCENT)
	top.add_child(val)
	v.add_child(top)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.focus_mode = Control.FOCUS_NONE
	s.custom_minimum_size.y = K.btn_h(22)
	s.value = float(Profile.get_setting(key))
	s.value_changed.connect(func(x: float):
		val.text = format_value(key, x)
		Profile.set_setting(key, x))
	v.add_child(s)
	parent.add_child(v)
	_controls[key] = s
	_values[key] = val
	val.text = format_value(key, s.value)


func _check_row(parent: Control, key: String, text: String) -> void:
	var cb := CheckBox.new()
	cb.text = text
	cb.focus_mode = Control.FOCUS_NONE
	cb.add_theme_font_size_override("font_size", C.FS_BODY - 1)
	cb.custom_minimum_size.y = K.btn_h(30)
	cb.button_pressed = bool(Profile.get_setting(key))
	cb.toggled.connect(func(on: bool): Profile.set_setting(key, on))
	parent.add_child(cb)
	_controls[key] = cb


static func format_value(key: String, v: float) -> String:
	match key:
		"fov":
			return "%d°" % int(round(v))
		"sensitivity":
			return K.fmt_dec(v, 2)
	return "%d %%" % int(round(v * 100.0))


func refresh() -> void:
	if not _built:
		return
	for key in _controls:
		var ctl = _controls[key]
		var v = Profile.get_setting(key)
		if ctl is OptionButton:
			var o: OptionButton = ctl
			for i in o.item_count:
				if String(o.get_item_metadata(i)) == String(v) and o.selected != i:
					o.select(i)
		elif ctl is HSlider:
			(ctl as HSlider).set_value_no_signal(float(v))
			(_values[key] as Label).text = format_value(key, float(v))
		elif ctl is CheckBox:
			(ctl as CheckBox).set_pressed_no_signal(bool(v))
	if not _name_edit.has_focus():
		_name_edit.text = String(Profile.get_setting("player_name"))


func _on_name_changed(t: String) -> void:
	if t.strip_edges() != "":
		Profile.set_setting("player_name", t)


func _commit_name() -> void:
	Profile.set_setting("player_name", _name_edit.text)
	_name_edit.text = String(Profile.get_setting("player_name"))


func _on_reset() -> void:
	K.confirm(self, "Сбросить прогресс?",
		"Кредиты, самолёты, опыт, журнал и достижения вернутся к началу. Настройки останутся.",
		"Сбросить", Profile.reset_progress)
