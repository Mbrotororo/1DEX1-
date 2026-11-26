extends Node3D
## Облака: скопления мягких спрайтов, всегда повёрнутых к камере (один MultiMesh).
## Спрайты сортируются от дальних к ближним, когда камера заметно сдвинулась.
## Те же данные дают плотность облака в точке (cloud_density_at).

const CELL := 1000.0
const FLOATS := 20   # transform 12 + color 4 + custom 4

const SHADER := """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, skip_vertex_transform;

uniform sampler2D puff_tex : filter_linear_mipmap, repeat_disable;
uniform vec3 lit_color : source_color = vec3(1.0);
uniform vec3 shade_color : source_color = vec3(0.6, 0.65, 0.72);
uniform vec3 sun_dir = vec3(0.3, 0.8, 0.4);
uniform float opacity = 0.9;
uniform float flash = 0.0;
uniform vec2 far_fade = vec2(6500.0, 12000.0);

varying float vfade;
varying float vh;
varying float vshape;

void vertex() {
	vec3 center = MODEL_MATRIX[3].xyz;
	float s = length(MODEL_MATRIX[0].xyz);
	vec3 right = INV_VIEW_MATRIX[0].xyz;
	vec3 up = INV_VIEW_MATRIX[1].xyz;
	vec3 wp = center + (right * VERTEX.x + up * VERTEX.y) * s;
	VERTEX = (VIEW_MATRIX * vec4(wp, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
	float d = length(INV_VIEW_MATRIX[3].xyz - center);
	vfade = smoothstep(s * 0.25, s * 0.9, d) * (1.0 - smoothstep(far_fade.x, far_fade.y, d));
	vh = INSTANCE_CUSTOM.x;
	vshape = INSTANCE_CUSTOM.y;
}

void fragment() {
	// поворот спрайта, чтобы соседние клубы не повторялись
	float ang = vshape * 6.2832;
	vec2 q = UV * 2.0 - 1.0;
	vec2 rq = vec2(q.x * cos(ang) - q.y * sin(ang), q.x * sin(ang) + q.y * cos(ang));
	vec4 tx = texture(puff_tex, rq * 0.5 + 0.5);
	float a = tx.a * smoothstep(1.0, 0.85, length(q));
	// освещение: сферическая нормаль + плотность из текстуры
	vec3 nv = normalize(vec3(q.x, -q.y, 0.65));
	vec3 nw = (INV_VIEW_MATRIX * vec4(nv, 0.0)).xyz;
	float lam = clamp(dot(nw, normalize(sun_dir)) * 0.5 + 0.5, 0.0, 1.0);
	float k = clamp(lam * 0.5 + vh * 0.5 + (tx.r - 0.5) * 0.35 - 0.05, 0.0, 1.0);
	vec3 c = mix(shade_color, lit_color, k) * COLOR.rgb;
	c += vec3(0.75, 0.8, 1.0) * flash * (0.5 + 0.5 * vh);
	ALBEDO = c;
	ALPHA = clamp(a * opacity * vfade * COLOR.a, 0.0, 1.0);
}
"""

var clusters: Array = []        # [center: Vector3, inv_radii: Vector3, density: float, bbox_r: float]
var layer: Dictionary = {}      # {bottom, top, density} — сплошной слой (пасмурно, гроза)
var y_min: float = 1e9
var y_max: float = -1e9

var _grid: Dictionary = {}
var _puff_data := PackedFloat32Array()
var _puff_pos := PackedVector3Array()
var _count: int = 0
var _mm: MultiMesh
var _mmi: MultiMeshInstance3D
var _mat: ShaderMaterial
var _last_sort_pos := Vector3(1e9, 0, 0)
var _sort_timer: float = 0.0
var _layer_noise := FastNoiseLite.new()

func generate(weather: String, rng: RandomNumberGenerator, quality: float) -> void:
	clusters.clear()
	_grid.clear()
	layer = {}
	var spec := {
		"clear": [14, 250.0, 520.0, 1150.0, 1550.0, 0.7],
		"cloudy": [75, 350.0, 950.0, 900.0, 1650.0, 0.85],
		"overcast": [60, 450.0, 1000.0, 1000.0, 1500.0, 0.95],
		"fog": [10, 300.0, 600.0, 1100.0, 1500.0, 0.8],
		"storm": [70, 500.0, 1150.0, 900.0, 1800.0, 1.0],
	}
	var sp: Array = spec.get(weather, spec["clear"])
	var count: int = sp[0]
	var area := 9500.0
	for i in count:
		var rx := rng.randf_range(sp[1], sp[2])
		var rz := rx * rng.randf_range(0.6, 1.1)
		var ry := rx * rng.randf_range(0.28, 0.45)
		var c := Vector3(rng.randf_range(-area, area), rng.randf_range(sp[3], sp[4]), rng.randf_range(-area, area))
		_add_cluster(c, Vector3(rx, ry, rz), float(sp[5]))
	if weather == "overcast" or weather == "storm":
		var bottom := 1100.0 if weather == "overcast" else 950.0
		layer = {"bottom": bottom, "top": bottom + 320.0, "density": 0.75 if weather == "overcast" else 0.9}
		_layer_noise.seed = rng.randi()
		_layer_noise.frequency = 0.00035
		y_min = minf(y_min, bottom)
		y_max = maxf(y_max, bottom + 320.0)
	_build_puffs(weather, rng, quality)

func _add_cluster(c: Vector3, r: Vector3, dens: float) -> void:
	var idx := clusters.size()
	var br := maxf(r.x, r.z)
	clusters.append([c, Vector3(1.0 / r.x, 1.0 / r.y, 1.0 / r.z), dens, br, r])
	y_min = minf(y_min, c.y - r.y)
	y_max = maxf(y_max, c.y + r.y)
	var x0 := floori((c.x - br) / CELL)
	var x1 := floori((c.x + br) / CELL)
	var z0 := floori((c.z - br) / CELL)
	var z1 := floori((c.z + br) / CELL)
	for ix in range(x0, x1 + 1):
		for iz in range(z0, z1 + 1):
			var key := Vector2i(ix, iz)
			if _grid.has(key):
				_grid[key].append(idx)
			else:
				_grid[key] = [idx]

func _layer_density(p: Vector3) -> float:
	if layer.is_empty():
		return 0.0
	var b: float = layer.bottom
	var t: float = layer.top
	if p.y < b - 60.0 or p.y > t + 60.0:
		return 0.0
	var mid := (b + t) * 0.5
	var half := (t - b) * 0.5 + 60.0
	var v := 1.0 - absf(p.y - mid) / half
	var holes := clampf(_layer_noise.get_noise_2d(p.x, p.z) * 2.0 + 0.9, 0.0, 1.0)
	return clampf(v * 2.0, 0.0, 1.0) * float(layer.density) * holes

func density_at(p: Vector3) -> float:
	if p.y < y_min - 50.0 or p.y > y_max + 50.0:
		return 0.0
	var dens := _layer_density(p)
	var key := Vector2i(floori(p.x / CELL), floori(p.z / CELL))
	var list = _grid.get(key)
	if list == null:
		return dens
	for idx in list:
		var cl: Array = clusters[idx]
		var c: Vector3 = cl[0]
		var inv: Vector3 = cl[1]
		var d := ((p - c) * inv).length()
		if d >= 1.0:
			continue
		var t := clampf((1.0 - d) / 0.55, 0.0, 1.0)
		dens = maxf(dens, t * t * (3.0 - 2.0 * t) * float(cl[2]))
	return clampf(dens, 0.0, 1.0)

func _build_puffs(weather: String, rng: RandomNumberGenerator, quality: float) -> void:
	_puff_data = PackedFloat32Array()
	_puff_pos = PackedVector3Array()
	var dark := weather == "storm"
	for cl in clusters:
		var c: Vector3 = cl[0]
		var r: Vector3 = cl[4]
		var n := clampi(int(r.x * r.z / 16000.0 * quality), 5, 46)
		for i in n:
			# точки в эллипсоиде, плоское дно
			var u := Vector3(rng.randf_range(-1, 1), rng.randf_range(-0.35, 1.0), rng.randf_range(-1, 1))
			if Vector3(u.x, u.y * 0.8, u.z).length() > 1.0:
				u = u.normalized() * rng.randf_range(0.3, 0.95)
			u.y = maxf(u.y, -0.35)
			var p := c + Vector3(u.x * r.x * 0.85, u.y * r.y, u.z * r.z * 0.85)
			var s := rng.randf_range(0.55, 1.0) * (r.y * 1.25 + 80.0) * (1.15 - 0.3 * absf(u.y))
			var hfrac := clampf((u.y + 0.35) / 1.35, 0.0, 1.0)
			var shade := rng.randf_range(0.9, 1.0)
			_push_puff(p, s, Color(shade, shade, shade, 1.0 if not dark else 1.0), hfrac, rng.randf())
	if not layer.is_empty():
		var b: float = layer.bottom
		var t: float = layer.top
		var stp := 650.0 / sqrt(maxf(quality, 0.3))
		var x := -9500.0
		while x <= 9500.0:
			var z := -9500.0
			while z <= 9500.0:
				var p := Vector3(x + rng.randf_range(-250, 250), lerpf(b, t, rng.randf_range(0.25, 0.7)), z + rng.randf_range(-250, 250))
				if _layer_density(Vector3(p.x, (b + t) * 0.5, p.z)) > 0.25:
					var s := rng.randf_range(420.0, 620.0)
					var shade := rng.randf_range(0.86, 1.0)
					_push_puff(p, s, Color(shade, shade, shade, 0.95), rng.randf_range(0.2, 0.7), rng.randf())
				z += stp
			x += stp
	_count = _puff_pos.size()

func _push_puff(p: Vector3, s: float, c: Color, hfrac: float, shape: float) -> void:
	_puff_pos.append(p)
	_puff_data.append_array([s, 0.0, 0.0, p.x, 0.0, s, 0.0, p.y, 0.0, 0.0, s, p.z, c.r, c.g, c.b, c.a, hfrac, shape, 0.0, 0.0])

func make_visual(colors: Dictionary) -> void:
	if _mmi != null:
		_mmi.queue_free()
	if _count == 0:
		return
	var q := QuadMesh.new()
	q.size = Vector2(2, 2)
	var sh := Shader.new()
	sh.code = SHADER
	_mat = ShaderMaterial.new()
	_mat.shader = sh
	_mat.set_shader_parameter("puff_tex", puff_texture())
	set_colors(colors)
	q.material = _mat
	_mm = MultiMesh.new()
	_mm.transform_format = MultiMesh.TRANSFORM_3D
	_mm.use_colors = true
	_mm.use_custom_data = true
	_mm.mesh = q
	_mm.instance_count = _count
	_mm.buffer = _puff_data
	_mm.custom_aabb = AABB(Vector3(-12000, y_min - 800, -12000), Vector3(24000, y_max - y_min + 1600, 24000))
	_mmi = MultiMeshInstance3D.new()
	_mmi.name = "Clouds"
	_mmi.multimesh = _mm
	_mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_mmi)

static var _puff_tex: ImageTexture

## Текстура клуба: несколько мягких кругов и шум по краю. r — «объём» (светлее в середине клубов).
static func puff_texture() -> ImageTexture:
	if _puff_tex != null:
		return _puff_tex
	var size := 128
	var rng := RandomNumberGenerator.new()
	rng.seed = 90210
	var blobs: Array = []
	blobs.append([Vector2(0.0, 0.05), 0.55])
	for i in 11:
		var a := rng.randf_range(0.0, TAU)
		var d := rng.randf_range(0.15, 0.45)
		blobs.append([Vector2(cos(a) * d, sin(a) * d * 0.8 - 0.05), rng.randf_range(0.22, 0.4)])
	var noise := FastNoiseLite.new()
	noise.seed = 77
	noise.frequency = 0.06
	noise.fractal_octaves = 3
	var img := Image.create(size, size, false, Image.FORMAT_LA8)
	for y in size:
		for x in size:
			var p := Vector2((x + 0.5) / size * 2.0 - 1.0, (y + 0.5) / size * 2.0 - 1.0)
			var dens := 0.0
			var shade := 0.0
			for b in blobs:
				var c: Vector2 = b[0]
				var r: float = b[1]
				var t := 1.0 - (p - c).length() / r
				if t > 0.0:
					dens = maxf(dens, t)
					shade = maxf(shade, t * (0.6 + 0.4 * (c.y * -1.0 + 0.5)))
			var n := noise.get_noise_2d(x, y) * 0.5 + 0.5
			var a := clampf((dens - 0.08 * n) * 3.2, 0.0, 1.0)
			a = a * a * (3.0 - 2.0 * a)
			var l := clampf(0.35 + shade * 0.9 + (n - 0.5) * 0.3, 0.0, 1.0)
			img.set_pixel(x, y, Color(l, l, l, a))
	img.generate_mipmaps()
	_puff_tex = ImageTexture.create_from_image(img)
	return _puff_tex

func set_colors(colors: Dictionary) -> void:
	if _mat == null:
		return
	_mat.set_shader_parameter("lit_color", colors.get("lit", Color.WHITE))
	_mat.set_shader_parameter("shade_color", colors.get("shade", Color(0.6, 0.65, 0.72)))
	_mat.set_shader_parameter("sun_dir", colors.get("sun_dir", Vector3(0.3, 0.8, 0.4)))
	_mat.set_shader_parameter("opacity", colors.get("opacity", 0.9))
	_mat.set_shader_parameter("far_fade", colors.get("far_fade", Vector2(6500.0, 12000.0)))

func set_flash(v: float) -> void:
	if _mat != null:
		_mat.set_shader_parameter("flash", v)

func puff_count() -> int:
	return _count

## Сортировка спрайтов от дальних к ближним.
func sort_for(cam_pos: Vector3) -> void:
	if _mm == null or _count == 0:
		return
	var keys := PackedInt64Array()
	keys.resize(_count)
	for i in _count:
		var d := _puff_pos[i].distance_squared_to(cam_pos)
		# дальние первыми: ключ по убыванию расстояния
		keys[i] = (int(4.0e8 - minf(d * 0.001, 4.0e8)) << 20) | i
	keys.sort()
	var buf := PackedFloat32Array()
	for k in keys:
		var src := int(k & 0xFFFFF) * FLOATS
		buf.append_array(_puff_data.slice(src, src + FLOATS))
	_mm.buffer = buf
	_last_sort_pos = cam_pos

func _process(delta: float) -> void:
	if _mm == null:
		return
	_sort_timer -= delta
	if _sort_timer > 0.0:
		return
	_sort_timer = 0.25
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	if cam == null:
		return
	var p := cam.global_position
	if p.distance_to(_last_sort_pos) > 120.0:
		sort_for(p)
