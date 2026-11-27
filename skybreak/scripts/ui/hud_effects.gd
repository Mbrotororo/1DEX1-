extends Control
## Эффекты поверх картинки: белая пелена в облаке и красная вспышка при попадании (под приборами).
## Здесь же считается затемнение и покраснение от перегрузки (реализм); рисует их hud_gforce.gd
## поверх приборов.

const D = preload("res://scripts/ui/hud_draw.gd")

const G_BLACK := 7.0
const G_RED := -2.5

var hud = null
var haze: float = 0.0
var black: float = 0.0       # 0..1 потемнение от положительной перегрузки
var red: float = 0.0         # 0..1 покраснение от отрицательной
var flash: float = 0.0
var tunnel: float = 0.0       # 0..1 сужение поля зрения перед затемнением
var _vignette: Texture2D = null
var _last_hit: float = -100.0
var _last_player = null
var _had_any: bool = false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_vignette = make_vignette()


static func make_vignette() -> Texture2D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.45, 0.8, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 0.05), Color(1, 1, 1, 0.65), Color(1, 1, 1, 1)])
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 1.0)
	t.width = 256
	t.height = 256
	return t


func reset() -> void:
	black = 0.0
	red = 0.0
	flash = 0.0
	tunnel = 0.0
	_last_hit = -100.0


func hit_flash(amount: float = 0.6) -> void:
	flash = maxf(flash, clampf(amount, 0.0, 1.0))


func update(dt: float, battle, pl, cam: Camera3D, realistic: bool) -> void:
	# облако: камера внутри облака
	var target_haze := 0.0
	var world = D.prop(battle, "world")
	if cam != null and world != null and world.has_method("cloud_density_at"):
		target_haze = clampf(float(world.cloud_density_at(cam.global_position)), 0.0, 1.0)
	haze = lerpf(haze, target_haze, 1.0 - exp(-5.0 * dt))
	if haze < 0.003:
		haze = 0.0
	# перегрузка
	var g := 1.0
	var flying := D.alive_node(pl)
	if flying:
		g = float(D.prop(D.prop(pl, "fm"), "g_load", 1.0))
	if realistic and flying:
		if g > G_BLACK:
			black = minf(1.0, black + (g - G_BLACK) * 0.22 * dt)
		else:
			black = maxf(0.0, black - 0.45 * dt)
		if g < G_RED:
			red = minf(1.0, red + (G_RED - g) * 0.35 * dt)
		else:
			red = maxf(0.0, red - 0.6 * dt)
		tunnel = lerpf(tunnel, clampf((g - 5.5) / 1.5, 0.0, 1.0), 1.0 - exp(-3.0 * dt))
	else:
		black = maxf(0.0, black - 1.5 * dt)
		red = maxf(0.0, red - 1.5 * dt)
		tunnel = maxf(0.0, tunnel - 2.0 * dt)
	# попадание по игроку
	if pl != _last_player:
		_last_player = pl
		_last_hit = float(D.prop(D.prop(pl, "dmg"), "last_hit_time", -100.0)) if flying else -100.0
	if flying:
		var lh := float(D.prop(D.prop(pl, "dmg"), "last_hit_time", -100.0))
		if lh > _last_hit + 0.001:
			_last_hit = lh
			hit_flash(0.55)
	flash = maxf(0.0, flash - dt * 2.2)
	var any := haze > 0.0 or flash > 0.0
	if any or _had_any:
		queue_redraw()
	_had_any = any


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	if haze > 0.0:
		draw_rect(r, Color(0.9, 0.93, 0.96, haze * 0.82))
	if flash > 0.0 and _vignette != null:
		draw_texture_rect(_vignette, r, false, Color(0.85, 0.05, 0.02, flash * 0.75))


## Есть ли сейчас затемнение или покраснение (для слоя hud_gforce.gd).
func g_active() -> bool:
	return black > 0.0 or red > 0.0 or tunnel > 0.001
