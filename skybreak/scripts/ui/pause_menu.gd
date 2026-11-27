extends Control
## Пауза: «Продолжить», «Управление», «Настройки», «Выйти в ангар».
## Работает при остановленном дереве (process_mode наследуется от HUD — ALWAYS).

signal resume_requested
signal hangar_requested
signal change_plane_requested

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const SETTINGS := [
	# ключ, подпись, мин, макс, шаг, формат
	["sensitivity", "Чувствительность мыши", 0.3, 2.0, 0.05, "dec"],
	["fov", "Поле зрения", 55.0, 90.0, 1.0, "deg"],
	["engine_volume", "Громкость двигателя", 0.0, 1.0, 0.05, "pct"],
	["effects_volume", "Громкость эффектов", 0.0, 1.0, 0.05, "pct"],
]

var hud = null
var battle = null
var page: String = "main"        # "main" | "controls" | "settings"
var sliders: Dictionary = {}     # key -> HSlider
var checks: Dictionary = {}      # key -> Button (переключатель Вкл/Выкл)

var _panel: PanelContainer
var _title: Label
var _pages: Dictionary = {}
var _change_btn: Button
var _controls_btn: Button
var _sens_label: Label
var _pending: Dictionary = {}
var _pending_t: float = 0.0
var _value_labels: Dictionary = {}


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	if _panel == null:
		_build()


func _build() -> void:
	var dim := ColorRect.new()
	dim.color = Color(0.01, 0.02, 0.03, 0.62)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	_panel = PanelContainer.new()
	var sb := UiStyle.box(Color(0.07, 0.09, 0.11, 0.96), 10, Color(1, 1, 1, 0.12), 1)
	sb.content_margin_left = 28
	sb.content_margin_right = 28
	sb.content_margin_top = 22
	sb.content_margin_bottom = 22
	_panel.add_theme_stylebox_override("panel", sb)
	center.add_child(_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	_panel.add_child(v)
	_title = UiStyle.label("Пауза", UiStyle.FS_TITLE)
	_title.add_theme_font_override("font", D.bold())
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(_title)
	_pages["main"] = _build_main()
	_pages["controls"] = _build_controls()
	_pages["settings"] = _build_settings()
	for k in _pages:
		v.add_child(_pages[k])
	show_page("main")


func _menu_button(text: String, primary: bool, cb: Callable) -> Button:
	var b := UiStyle.button(text, primary)
	b.custom_minimum_size = Vector2(300, 52)
	b.add_theme_font_size_override("font_size", 19)
	b.pressed.connect(cb)
	return b


func _build_main() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.add_child(_menu_button("Продолжить", true, func(): resume_requested.emit()))
	_change_btn = _menu_button("Сменить самолёт", false, func(): change_plane_requested.emit())
	v.add_child(_change_btn)
	_controls_btn = _menu_button("Управление", false, func(): show_page("controls"))
	v.add_child(_controls_btn)
	v.add_child(_menu_button("Настройки", false, func(): show_page("settings")))
	v.add_child(_menu_button("Выйти в ангар", false, func(): hangar_requested.emit()))
	return v


func _build_controls() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 36)
	v.add_child(cols)
	var help: Array = Game.KEY_HELP
	var half := int(ceil(help.size() / 2.0))
	for col in 2:
		var g := GridContainer.new()
		g.columns = 2
		g.add_theme_constant_override("h_separation", 18)
		g.add_theme_constant_override("v_separation", 7)
		cols.add_child(g)
		for i in range(col * half, mini((col + 1) * half, help.size())):
			var row: Array = help[i]
			var a := UiStyle.label(String(row[0]), 16, UiStyle.MUTED)
			a.custom_minimum_size = Vector2(150, 0)
			g.add_child(a)
			var k := UiStyle.label(String(row[1]), 16, UiStyle.TEXT)
			k.add_theme_font_override("font", D.bold())
			g.add_child(k)
	var back := _menu_button("Назад", false, func(): show_page("main"))
	back.custom_minimum_size = Vector2(200, 48)
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_child(back)
	v.add_child(hb)
	return v


func _build_settings() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	var g := GridContainer.new()
	g.columns = 3
	g.add_theme_constant_override("h_separation", 16)
	g.add_theme_constant_override("v_separation", 12)
	v.add_child(g)
	for s in SETTINGS:
		var key := String(s[0])
		var l := UiStyle.label(String(s[1]), 16, UiStyle.TEXT)
		l.custom_minimum_size = Vector2(210, 0)
		g.add_child(l)
		if key == "sensitivity":
			_sens_label = l
		var sl := HSlider.new()
		sl.min_value = float(s[2])
		sl.max_value = float(s[3])
		sl.step = float(s[4])
		sl.custom_minimum_size = Vector2(240, 32)
		sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sl.focus_mode = Control.FOCUS_NONE
		_style_slider(sl)
		sl.value_changed.connect(_on_slider.bind(key, String(s[5])))
		g.add_child(sl)
		sliders[key] = sl
		var vl := UiStyle.label("", 16, UiStyle.TEXT)
		vl.custom_minimum_size = Vector2(60, 0)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		g.add_child(vl)
		_value_labels[key] = vl
	for c in [["invert_y", "Инверсия по вертикали"], ["show_fps", "Показывать частоту кадров"]]:
		var l := UiStyle.label(String(c[1]), 16, UiStyle.TEXT)
		g.add_child(l)
		var tb := Button.new()
		tb.toggle_mode = true
		tb.focus_mode = Control.FOCUS_NONE
		tb.custom_minimum_size = Vector2(110, 38)
		tb.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		tb.add_theme_font_size_override("font_size", 16)
		tb.add_theme_stylebox_override("pressed", UiStyle.box(UiStyle.ACCENT_DARK, 6, UiStyle.ACCENT, 1))
		tb.add_theme_stylebox_override("hover_pressed", UiStyle.box(UiStyle.ACCENT_DARK.lightened(0.1), 6, UiStyle.ACCENT, 1))
		tb.toggled.connect(_on_check.bind(String(c[0]), tb))
		g.add_child(tb)
		g.add_child(Control.new())
		checks[String(c[0])] = tb
	var back := _menu_button("Назад", false, func(): show_page("main"))
	back.custom_minimum_size = Vector2(200, 48)
	var hb := HBoxContainer.new()
	hb.alignment = BoxContainer.ALIGNMENT_CENTER
	hb.add_child(back)
	v.add_child(hb)
	return v


func _style_slider(sl: HSlider) -> void:
	var track := StyleBoxFlat.new()
	track.bg_color = Color(1, 1, 1, 0.14)
	track.set_corner_radius_all(3)
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	var fill := StyleBoxFlat.new()
	fill.bg_color = UiStyle.ACCENT
	fill.set_corner_radius_all(3)
	fill.content_margin_top = 3
	fill.content_margin_bottom = 3
	sl.add_theme_stylebox_override("slider", track)
	sl.add_theme_stylebox_override("grabber_area", fill)
	sl.add_theme_stylebox_override("grabber_area_highlight", fill)


func show_page(p: String) -> void:
	if _panel == null:
		_build()
	if p == "settings":
		_load_settings()
	if page == "settings" and p != "settings":
		flush_settings()
	page = p
	for k in _pages:
		(_pages[k] as Control).visible = k == p
	match p:
		"controls":
			_title.text = "Управление"
		"settings":
			_title.text = "Настройки"
		_:
			_title.text = "Пауза"


func open() -> void:
	if _panel == null:
		_build()
	var can_change: bool = battle != null and is_instance_valid(battle) and String(battle.mode) == "test" \
		and battle.has_method("return_to_spawn_menu") and String(battle.state) == "flying"
	_change_btn.visible = can_change
	# на сенсорном экране список клавиш не нужен
	var touch: bool = hud != null and bool(hud.touch_on)
	_controls_btn.visible = not touch
	if _sens_label != null:
		_sens_label.text = "Чувствительность" if touch else "Чувствительность мыши"
	show_page("main")
	visible = true


func close() -> void:
	flush_settings()
	visible = false


## Esc: из подстраницы — назад, с главной — продолжить. Возвращает true, если меню закрылось.
func back() -> bool:
	if page != "main":
		show_page("main")
		return false
	return true


func _get_setting(key: String):
	return D.setting(key)


func _load_settings() -> void:
	for key in sliders:
		var sl: HSlider = sliders[key]
		sl.set_value_no_signal(float(_get_setting(key)))
		_update_value_label(String(key))
	for key in checks:
		var tb: Button = checks[key]
		tb.set_pressed_no_signal(bool(_get_setting(key)))
		tb.text = "Вкл" if tb.button_pressed else "Выкл"


func _update_value_label(key: String) -> void:
	var sl: HSlider = sliders.get(key)
	var vl: Label = _value_labels.get(key)
	if sl == null or vl == null:
		return
	var fmt := ""
	for s in SETTINGS:
		if s[0] == key:
			fmt = String(s[5])
	match fmt:
		"pct":
			vl.text = "%d %%" % int(round(sl.value * 100.0))
		"deg":
			vl.text = "%d°" % int(round(sl.value))
		_:
			vl.text = D.fmt_dec(sl.value)


func _on_slider(value: float, key: String, _fmt: String) -> void:
	_pending[key] = value
	_pending_t = 0.3
	_update_value_label(key)


func _on_check(on: bool, key: String, tb: Button) -> void:
	tb.text = "Вкл" if on else "Выкл"
	_pending[key] = on
	flush_settings()


func flush_settings() -> void:
	if _pending.is_empty():
		return
	for k in _pending:
		D.set_setting(String(k), _pending[k])
	_pending.clear()


func _process(dt: float) -> void:
	if _pending.is_empty():
		return
	_pending_t -= dt
	if _pending_t <= 0.0:
		flush_settings()
