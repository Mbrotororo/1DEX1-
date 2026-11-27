extends Control
## Затемнение и покраснение от перегрузки (реализм). Рисуется поверх приборов, маркеров и миникарты,
## но под сенсорными кнопками и меню: при сильной перегрузке пилот теряет картинку, а не управление.
## Значения считает HudEffects (black, red, tunnel).

var hud = null
var u: float = 1.0
var _vignette: Texture2D = null


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_vignette = preload("res://scripts/ui/hud_effects.gd").make_vignette()


func _draw() -> void:
	if hud == null or hud.effects == null:
		return
	var fx = hud.effects
	var black := float(fx.black)
	var red := float(fx.red)
	var tunnel := float(fx.tunnel)
	var r := Rect2(Vector2.ZERO, size)
	# сужение поля зрения заметно уже до затемнения: края экрана серые
	var dark := maxf(black, tunnel * 0.55)
	if dark > 0.0:
		draw_texture_rect(_vignette, r, false, Color(0.04, 0.04, 0.05, clampf(dark * 1.8, 0.0, 1.0)))
		if black > 0.55:
			draw_rect(r, Color(0.12, 0.12, 0.13, clampf((black - 0.55) / 0.45, 0.0, 1.0) * 0.96))
	if red > 0.0:
		draw_texture_rect(_vignette, r, false, Color(0.6, 0.0, 0.02, clampf(red * 1.6, 0.0, 1.0)))
		if red > 0.55:
			draw_rect(r, Color(0.45, 0.0, 0.02, clampf((red - 0.55) / 0.45, 0.0, 1.0) * 0.85))
