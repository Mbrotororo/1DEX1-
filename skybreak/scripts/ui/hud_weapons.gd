extends Control
## Боезапас и схема повреждений (справа внизу; на сенсорном экране — по центру внизу).

const D = preload("res://scripts/ui/hud_draw.gd")
const UiStyle = preload("res://scripts/ui/ui_style.gd")
const Damage = preload("res://scripts/ui/hud_damage.gd")

const KEYS := {"Ракеты": "R", "Бомбы": "B", "Ракеты В-В": "ПКМ", "Ловушки": "X"}

var hud = null
var u: float = 1.0
var rows: Array = []        # summary() самолёта игрока
var def: Dictionary = {}
var dmg = null
var bottom_offset: float = 0.0   # подъём над приборной панелью в режиме кабины
var _clock: float = 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)


func tick(dt: float) -> void:
	_clock += dt
	if dmg != null and bool(D.prop(dmg, "on_fire", false)):
		queue_redraw()


func refresh(pl) -> void:
	rows = []
	def = {}
	dmg = null
	if D.alive_node(pl):
		def = D.prop(pl, "def", {})
		dmg = D.prop(pl, "dmg")
		var w = D.prop(pl, "weapons")
		if w != null and w.has_method("summary"):
			rows = w.summary()
	queue_redraw()


func panel_rect() -> Rect2:
	var row_h := 24.0 * u
	var diag := 104.0 * u
	var list_w := 236.0 * u
	var w := diag + list_w + 30.0 * u
	var h := maxf(diag + 16.0 * u, rows.size() * row_h + 18.0 * u)
	var touch := hud != null and bool(hud.touch_on)
	if touch:
		return Rect2(size.x * 0.5 - w * 0.5, size.y - 10.0 * u - h - bottom_offset, w, h)
	return Rect2(size.x - 16.0 * u - w, size.y - 16.0 * u - h - bottom_offset, w, h)


func _draw() -> void:
	if def.is_empty():
		return
	var r := panel_rect()
	D.panel(self, r, 0.55, int(6 * u))
	var diag := 104.0 * u
	var dr := Rect2(r.position.x + 8.0 * u, r.get_center().y - diag * 0.5, diag, diag)
	Damage.draw(self, dr, def, dmg, _clock, u)
	var touch := hud != null and bool(hud.touch_on)
	var x0 := dr.end.x + 14.0 * u
	var x1 := r.end.x - 12.0 * u
	var row_h := 24.0 * u
	var y := r.get_center().y - rows.size() * row_h * 0.5 + row_h * 0.5
	var fs := int(round(15.0 * u))
	var fs_s := int(round(12.0 * u))
	var first_gun := true
	for row in rows:
		var label := String(row.get("label", ""))
		var cur := int(row.get("cur", 0))
		var mx := maxi(int(row.get("max", 0)), 1)
		var key := ""
		if KEYS.has(label):
			key = KEYS[label]
		elif first_gun:
			key = "ЛКМ"
			first_gun = false
		var lx := x0
		if not touch:
			var kw := 30.0 * u
			if key != "":
				var kr := Rect2(lx, y - 9.0 * u, kw, 18.0 * u)
				draw_style_box(D.box(Color(1, 1, 1, 0.08), int(3 * u), Color(1, 1, 1, 0.18), 1), kr)
				D.text_mid(self, kr.get_center(), key, fs_s, UiStyle.MUTED, 0, null, 0)
			lx += kw + 8.0 * u
		var col := UiStyle.TEXT
		if cur <= 0:
			col = UiStyle.DANGER
		elif float(cur) / float(mx) < 0.25:
			col = UiStyle.WARN
		D.text_mid(self, Vector2(lx, y), label, fs, UiStyle.TEXT if cur > 0 else UiStyle.MUTED, -1, null, 0)
		var max_s := " / " + Game.fmt_int(mx)
		var mw := D.text_width(max_s, fs_s)
		D.text_mid(self, Vector2(x1, y + 1.0 * u), max_s, fs_s, UiStyle.MUTED, 1, null, 0)
		D.text_mid(self, Vector2(x1 - mw, y), Game.fmt_int(cur), fs + 1, col, 1, D.bold(), 0)
		y += row_h
