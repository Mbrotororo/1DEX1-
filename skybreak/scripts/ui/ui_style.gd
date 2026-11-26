class_name UiStyle
extends RefCounted
## Общие цвета, шрифты и готовые элементы интерфейса для HUD и меню.

const BG := Color("101519")
const PANEL := Color(0.08, 0.10, 0.12, 0.88)
const PANEL_LIGHT := Color(0.14, 0.17, 0.20, 0.92)
const LINE := Color(1, 1, 1, 0.12)
const TEXT := Color("eef1f2")
const MUTED := Color("97a3aa")
const ACCENT := Color("ff8a3d")
const ACCENT_DARK := Color("c8622a")
const GOOD := Color("6fd08c")
const WARN := Color("ffcc4d")
const DANGER := Color("ff5a4f")
const BLUE := Color("4aa3ff")
const RED := Color("ff5a4f")

const FS_SMALL := 14
const FS_BODY := 17
const FS_TITLE := 26
const FS_HUGE := 44

static func team_color(team: int) -> Color:
	return BLUE if team == 0 else RED

static func box(color: Color = PANEL, radius: int = 6, border: Color = LINE, border_w: int = 1) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(border_w)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 8
	s.content_margin_bottom = 8
	return s

static func make_theme() -> Theme:
	var t := Theme.new()
	t.default_font_size = FS_BODY
	t.set_color("font_color", "Label", TEXT)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", Color.WHITE)
	t.set_color("font_pressed_color", "Button", Color.WHITE)
	t.set_color("font_disabled_color", "Button", MUTED)
	t.set_stylebox("normal", "Button", box(PANEL_LIGHT))
	t.set_stylebox("hover", "Button", box(Color(0.20, 0.24, 0.27, 0.95), 6, ACCENT, 1))
	t.set_stylebox("pressed", "Button", box(ACCENT_DARK, 6, ACCENT, 1))
	t.set_stylebox("disabled", "Button", box(Color(0.10, 0.12, 0.14, 0.7)))
	t.set_stylebox("focus", "Button", box(Color(0, 0, 0, 0), 6, ACCENT, 2))
	t.set_stylebox("panel", "PanelContainer", box(PANEL))
	t.set_stylebox("panel", "Panel", box(PANEL))
	t.set_color("font_color", "CheckBox", TEXT)
	t.set_color("font_color", "OptionButton", TEXT)
	t.set_stylebox("normal", "OptionButton", box(PANEL_LIGHT))
	t.set_stylebox("hover", "OptionButton", box(Color(0.20, 0.24, 0.27, 0.95), 6, ACCENT, 1))
	t.set_stylebox("pressed", "OptionButton", box(ACCENT_DARK))
	return t

static func label(text: String, size: int = FS_BODY, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l

static func outlined_label(text: String, size: int = FS_BODY, color: Color = TEXT) -> Label:
	var l := label(text, size, color)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.85))
	l.add_theme_constant_override("outline_size", 4)
	return l

static func button(text: String, primary: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	if primary:
		b.add_theme_stylebox_override("normal", box(ACCENT, 6, ACCENT, 1))
		b.add_theme_stylebox_override("hover", box(ACCENT.lightened(0.1), 6, Color.WHITE, 1))
		b.add_theme_stylebox_override("pressed", box(ACCENT_DARK, 6, ACCENT, 1))
		b.add_theme_color_override("font_color", Color("1a1208"))
		b.add_theme_color_override("font_hover_color", Color("1a1208"))
		b.add_theme_font_size_override("font_size", 22)
	return b

static func panel() -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", box(PANEL))
	return p
