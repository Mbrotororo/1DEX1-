class_name ReplayUI
extends CanvasLayer
## Интерфейс сцены повтора: панель управления, список сбитых, подписи. Логики времени здесь нет.

signal play_toggled
signal speed_chosen(speed: float)
signal seek_requested(t: float)
signal plane_step(dir: int)
signal camera_chosen(mode: String)
signal kill_chosen(index: int)
signal back_pressed
signal slider_drag(active: bool)

const SPEEDS := [0.25, 0.5, 1.0, 2.0, 4.0]
const CAMERAS := [["chase", "Сзади"], ["cockpit", "Кабина"], ["orbit", "Облёт"], ["free", "Свободная"]]

var root: Control
var play_btn: Button
var slider: HSlider
var time_label: Label
var plane_label: Label
var status_label: Label
var info_label: Label
var hint_label: Label
var message_label: Label
var kill_panel: PanelContainer
var kill_box: VBoxContainer
var kill_buttons: Array = []
var kill_times: Array = []
var speed_buttons: Dictionary = {}     # speed -> Button
var cam_buttons: Dictionary = {}       # mode -> Button

var _updating: bool = false
var _msg_t: float = 0.0
var _kill_passed: int = -1


func _init() -> void:
	layer = 10
	root = Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiStyle.make_theme()
	add_child(root)


func _process(delta: float) -> void:
	if _msg_t > 0.0 and message_label != null:
		_msg_t -= delta
		message_label.modulate.a = clampf(_msg_t / 0.6, 0.0, 1.0)
		if _msg_t <= 0.0:
			message_label.visible = false


# ---------------------------------------------------------------- сборка

func build_empty() -> void:
	var bg := ColorRect.new()
	bg.color = UiStyle.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(center)
	var p := UiStyle.panel()
	center.add_child(p)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 18)
	p.add_child(v)
	var l := UiStyle.label("Повтора нет", UiStyle.FS_TITLE)
	l.name = "EmptyLabel"
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(l)
	var b := UiStyle.button("Назад")
	b.name = "BackButton"
	b.custom_minimum_size = Vector2(220, 44)
	b.pressed.connect(func(): back_pressed.emit())
	v.add_child(b)


func build(info_text: String, start: float, end: float, kills: Array) -> void:
	_build_top(info_text)
	_build_kills(kills, start)
	_build_bar(start, end)


func _build_top(info_text: String) -> void:
	var info_panel := UiStyle.panel()
	info_panel.name = "InfoPanel"
	info_panel.position = Vector2(12, 12)
	info_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(info_panel)
	var iv := VBoxContainer.new()
	iv.add_theme_constant_override("separation", 2)
	info_panel.add_child(iv)
	info_label = UiStyle.label(info_text, 15, UiStyle.TEXT)
	iv.add_child(info_label)
	hint_label = UiStyle.label("", 13, UiStyle.MUTED)
	iv.add_child(hint_label)

	var top := VBoxContainer.new()
	top.name = "Top"
	top.anchor_left = 0.5
	top.anchor_right = 0.5
	top.offset_left = -300
	top.offset_right = 300
	top.offset_top = 14
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_theme_constant_override("separation", 2)
	root.add_child(top)
	plane_label = UiStyle.outlined_label("", 24, UiStyle.TEXT)
	plane_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	plane_label.add_theme_constant_override("outline_size", 6)
	top.add_child(plane_label)
	status_label = UiStyle.outlined_label("", 15, UiStyle.MUTED)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(status_label)
	message_label = UiStyle.outlined_label("", 18, UiStyle.TEXT)
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.visible = false
	top.add_child(message_label)


func _build_kills(kills: Array, start: float) -> void:
	kill_panel = UiStyle.panel()
	kill_panel.name = "Kills"
	kill_panel.anchor_left = 1.0
	kill_panel.anchor_right = 1.0
	kill_panel.offset_left = -352
	kill_panel.offset_right = -12
	kill_panel.offset_top = 12
	kill_panel.offset_bottom = 12
	root.add_child(kill_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 6)
	kill_panel.add_child(v)
	var title := UiStyle.label("Сбитые", 16, UiStyle.TEXT)
	v.add_child(title)
	var scroll := ScrollContainer.new()
	# высота по содержимому, но не больше места до панели управления
	scroll.custom_minimum_size = Vector2(0, clampf(float(kills.size()) * 30.0, 22.0, 330.0))
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	kill_box = VBoxContainer.new()
	kill_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	kill_box.add_theme_constant_override("separation", 2)
	scroll.add_child(kill_box)
	kill_buttons.clear()
	kill_times.clear()
	if kills.is_empty():
		kill_box.add_child(UiStyle.label("Никого не сбили", 14, UiStyle.MUTED))
	for i in kills.size():
		var k: Dictionary = kills[i]
		var b := Button.new()
		b.focus_mode = Control.FOCUS_NONE
		b.flat = true
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		b.clip_text = true
		b.custom_minimum_size = Vector2(0, 28)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.text = "%s   %s" % [Game.fmt_time(float(k.t) - start), str(k.text)]
		b.tooltip_text = str(k.text)
		b.add_theme_font_size_override("font_size", 14)
		var col: Color = k.get("color", UiStyle.TEXT)
		b.add_theme_color_override("font_color", col)
		b.add_theme_color_override("font_hover_color", col.lightened(0.3))
		b.add_theme_stylebox_override("hover", UiStyle.box(Color(1, 1, 1, 0.06), 4, Color(0, 0, 0, 0), 0))
		b.add_theme_stylebox_override("pressed", UiStyle.box(Color(1, 1, 1, 0.1), 4, Color(0, 0, 0, 0), 0))
		var idx := i
		b.pressed.connect(func(): kill_chosen.emit(idx))
		kill_box.add_child(b)
		kill_buttons.append(b)
		kill_times.append(float(k.t))
	_fit_kills.call_deferred()


## Высота списка по содержимому, не больше 330 px (дальше прокрутка).
func _fit_kills() -> void:
	if kill_box == null or not is_instance_valid(kill_box):
		return
	var scroll := kill_box.get_parent() as Control
	scroll.custom_minimum_size.y = minf(kill_box.get_combined_minimum_size().y, 330.0)


func _build_bar(start: float, end: float) -> void:
	var bar := UiStyle.panel()
	bar.name = "Bar"
	bar.anchor_top = 1.0
	bar.anchor_bottom = 1.0
	bar.anchor_left = 0.0
	bar.anchor_right = 1.0
	bar.offset_left = 12
	bar.offset_right = -12
	bar.offset_top = -120
	bar.offset_bottom = -12
	root.add_child(bar)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	bar.add_child(v)

	var row1 := HBoxContainer.new()
	row1.add_theme_constant_override("separation", 12)
	v.add_child(row1)
	play_btn = _small_button("Пауза", 110)
	play_btn.pressed.connect(func(): play_toggled.emit())
	row1.add_child(play_btn)
	slider = HSlider.new()
	slider.name = "Timeline"
	slider.focus_mode = Control.FOCUS_NONE
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	slider.custom_minimum_size = Vector2(200, 24)
	slider.min_value = start
	slider.max_value = maxf(end, start + 0.05)
	slider.step = 0.05
	_style_slider(slider)
	slider.value_changed.connect(_on_slider)
	slider.drag_started.connect(func(): slider_drag.emit(true))
	slider.drag_ended.connect(func(_changed): slider_drag.emit(false))
	row1.add_child(slider)
	time_label = UiStyle.label("0:00 / 0:00", 16)
	time_label.custom_minimum_size = Vector2(118, 0)
	time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row1.add_child(time_label)

	var row2 := HBoxContainer.new()
	row2.add_theme_constant_override("separation", 6)
	v.add_child(row2)
	row2.add_child(UiStyle.label("Скорость", 14, UiStyle.MUTED))
	for s in SPEEDS:
		var sb := _small_button(_speed_text(s), 58)
		var sv: float = s
		sb.pressed.connect(func(): speed_chosen.emit(sv))
		row2.add_child(sb)
		speed_buttons[s] = sb
	row2.add_child(_gap(18))
	var prev := _small_button("<", 40)
	prev.tooltip_text = "Предыдущий самолёт"
	prev.pressed.connect(func(): plane_step.emit(-1))
	row2.add_child(prev)
	row2.add_child(UiStyle.label("Самолёт", 14, UiStyle.MUTED))
	var next := _small_button(">", 40)
	next.tooltip_text = "Следующий самолёт"
	next.pressed.connect(func(): plane_step.emit(1))
	row2.add_child(next)
	row2.add_child(_gap(18))
	row2.add_child(UiStyle.label("Камера", 14, UiStyle.MUTED))
	for c in CAMERAS:
		var cb := _small_button(str(c[1]), 0)
		var mode: String = c[0]
		cb.pressed.connect(func(): camera_chosen.emit(mode))
		row2.add_child(cb)
		cam_buttons[mode] = cb
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row2.add_child(spacer)
	var back := _small_button("Назад", 110)
	back.name = "BackButton"
	back.pressed.connect(func(): back_pressed.emit())
	row2.add_child(back)


func _small_button(text: String, min_w: float) -> Button:
	var b := UiStyle.button(text)
	b.add_theme_font_size_override("font_size", 15)
	b.custom_minimum_size = Vector2(min_w, 34)
	return b


func _gap(w: float) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(w, 0)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return c


func _style_slider(s: HSlider) -> void:
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
	s.add_theme_stylebox_override("slider", track)
	s.add_theme_stylebox_override("grabber_area", fill)
	s.add_theme_stylebox_override("grabber_area_highlight", fill)
	var img := Image.create(18, 18, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for y in 18:
		for x in 18:
			var d := Vector2(x - 8.5, y - 8.5).length()
			if d <= 8.0:
				var a := clampf(8.0 - d, 0.0, 1.0)
				img.set_pixel(x, y, Color(1, 1, 1, a) if d < 6.0 else Color(UiStyle.ACCENT, a))
	var tex := ImageTexture.create_from_image(img)
	s.add_theme_icon_override("grabber", tex)
	s.add_theme_icon_override("grabber_highlight", tex)


static func _speed_text(s: float) -> String:
	var txt := ("%.2f" % s).rstrip("0").rstrip(".")
	return txt.replace(".", ",") + "×"


# ---------------------------------------------------------------- обновление

func _on_slider(v: float) -> void:
	if _updating:
		return
	seek_requested.emit(v)


func set_time(t: float, start: float, end: float) -> void:
	if slider == null:
		return
	_updating = true
	slider.set_value_no_signal(t)
	_updating = false
	time_label.text = "%s / %s" % [Game.fmt_time(t - start), Game.fmt_time(end - start)]
	var passed := -1
	for i in kill_times.size():
		if float(kill_times[i]) <= t + 0.001:
			passed = i
	if passed != _kill_passed:
		_kill_passed = passed
		for i in kill_buttons.size():
			(kill_buttons[i] as Button).modulate.a = 1.0 if i <= passed else 0.5


func set_playing(on: bool) -> void:
	if play_btn != null:
		play_btn.text = "Пауза" if on else "Пуск"


func set_speed(s: float) -> void:
	for k in speed_buttons:
		_mark(speed_buttons[k], is_equal_approx(float(k), s))


func set_camera(mode: String) -> void:
	for k in cam_buttons:
		_mark(cam_buttons[k], k == mode)


func set_plane(text: String, color: Color, status: String) -> void:
	if plane_label == null:
		return
	plane_label.text = text
	plane_label.add_theme_color_override("font_color", color)
	status_label.text = status
	status_label.visible = status != ""


func set_hint(text: String) -> void:
	if hint_label != null:
		hint_label.text = text


func show_message(text: String, color: Color = UiStyle.TEXT) -> void:
	if message_label == null:
		return
	message_label.text = text
	message_label.add_theme_color_override("font_color", color)
	message_label.visible = true
	message_label.modulate.a = 1.0
	_msg_t = 3.0


static func _mark(b: Button, on: bool) -> void:
	if on:
		b.add_theme_stylebox_override("normal", UiStyle.box(UiStyle.ACCENT_DARK, 6, UiStyle.ACCENT, 1))
		b.add_theme_color_override("font_color", Color.WHITE)
	else:
		b.remove_theme_stylebox_override("normal")
		b.remove_theme_color_override("font_color")
