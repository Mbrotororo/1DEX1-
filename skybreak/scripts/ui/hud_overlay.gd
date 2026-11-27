extends Control
## Верхний слой: надпись киллкама, баннер конца боя, «Наблюдение», счётчик FPS.

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")

const OUTCOMES := {"win": "Победа", "loss": "Поражение", "draw": "Ничья"}

var hud = null
var u: float = 1.0
var killcam_on: bool = false
var killcam_info: Dictionary = {}
var killcam_skippable: bool = false
var banner_text: String = ""
var banner_color: Color = UiStyle.TEXT
var banner_sub: String = ""
var spectate_text: String = ""
var fps_text: String = ""
var touch: bool = false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


static func killcam_text(info: Dictionary) -> String:
	var kn := String(info.get("killer_name", ""))
	var kp := String(info.get("killer_plane", ""))
	if kn != "" and kp != "":
		return "Вас сбил: %s, %s" % [kn, kp]
	if kn != "":
		return "Вас сбил: %s" % kn
	match String(info.get("reason", "")):
		"border":
			return "Вылет за границу карты"
		"ground", "water", "gear":
			return "Самолёт разбился"
		"fire":
			return "Самолёт сгорел"
	return "Самолёт потерян"


static func banner_for(result: Dictionary, mode: String) -> String:
	var o := String(result.get("outcome", ""))
	if mode == "training" and o == "win":
		return "Обучение пройдено"
	return String(OUTCOMES.get(o, ""))


func _draw() -> void:
	if killcam_on:
		_draw_killcam()
	if banner_text != "":
		_draw_banner()
	if spectate_text != "" and not killcam_on:
		D.text(self, Vector2(size.x * 0.5, size.y - 22.0 * u), spectate_text, int(round(15.0 * u)), Color(1, 1, 1, 0.85), 0, null, 4)
	if fps_text != "":
		var x := (84.0 if touch else 14.0) * u
		D.text(self, Vector2(x, 26.0 * u), fps_text, int(round(13.0 * u)), UiStyle.MUTED, -1, null, 3)


func _draw_killcam() -> void:
	var bar := size.y * 0.075
	draw_rect(Rect2(0, 0, size.x, bar), Color(0, 0, 0, 0.82))
	draw_rect(Rect2(0, size.y - bar, size.x, bar), Color(0, 0, 0, 0.82))
	D.text(self, Vector2(size.x * 0.5, size.y - bar - 26.0 * u), killcam_text(killcam_info), int(round(28.0 * u)), Color.WHITE, 0, D.bold(), 5)
	if killcam_skippable:
		var hint := "Пропустить: коснись экрана" if touch else "Пропустить: Пробел"
		D.text_mid(self, Vector2(size.x * 0.5, size.y - bar * 0.5), hint, int(round(15.0 * u)), Color(1, 1, 1, 0.75), 0, null, 0)


func _draw_banner() -> void:
	var h := 104.0 * u
	var y := size.y * 0.15
	var r := Rect2(0, y, size.x, h)
	draw_rect(r, Color(0.03, 0.04, 0.05, 0.78))
	draw_rect(Rect2(0, y, size.x, 2.0 * u), Color(banner_color, 0.9))
	draw_rect(Rect2(0, y + h - 2.0 * u, size.x, 2.0 * u), Color(banner_color, 0.9))
	var ty := y + h * 0.5 - (12.0 * u if banner_sub != "" else 0.0)
	D.text_mid(self, Vector2(size.x * 0.5, ty), banner_text, int(round(48.0 * u)), banner_color, 0, D.bold(), 5)
	if banner_sub != "":
		D.text_mid(self, Vector2(size.x * 0.5, y + h - 18.0 * u), banner_sub, int(round(16.0 * u)), UiStyle.TEXT, 0, null, 3)
