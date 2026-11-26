extends RefCounted
## Материалы и шейдеры мира. Всё кэшируется (один экземпляр на игру).

static var _cache: Dictionary = {}

static func _tex(path: String) -> Texture2D:
	var key := "tex:" + path
	if not _cache.has(key):
		_cache[key] = load(path)
	return _cache[key]

## Средний цвет текстуры, чтобы детализация не меняла общий тон.
## В рендерере Compatibility цвета не переводятся в линейное пространство, поэтому берём как есть.
static func tex_mean(path: String) -> Color:
	var key := "mean:" + path
	if _cache.has(key):
		return _cache[key]
	var t := _tex(path)
	var c := Color(0.5, 0.5, 0.5)
	if t != null:
		var img := t.get_image()
		if img != null:
			img = img.duplicate()
			if img.is_compressed():
				img.decompress()
			img.resize(1, 1, Image.INTERPOLATE_LANCZOS)
			c = img.get_pixel(0, 0)
	_cache[key] = c
	return c

# ---------------------------------------------------------------- рельеф

const TERRAIN_SHADER := """
shader_type spatial;
render_mode diffuse_lambert;

uniform sampler2D detail_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec3 tex_mean = vec3(0.5);
uniform float scale_far = 0.0012;
uniform float scale_near = 0.0068;
uniform float detail_strength = 0.85;
uniform float spec = 0.2;

varying vec3 wpos;
varying vec3 wnrm;

vec3 mtex(sampler2D s, vec2 uv) {
	vec2 mm = abs(mod(uv + 1.0, 2.0) - 1.0);
	return textureGrad(s, mm, dFdx(uv), dFdy(uv)).rgb;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = (MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz;
}

vec3 tri(vec2 p) {
	vec3 a = mtex(detail_tex, p * scale_far);
	vec3 b = mtex(detail_tex, p * scale_near + vec2(0.37, 0.71));
	return a * 0.58 + b * 0.42;
}

void fragment() {
	vec3 nb = abs(normalize(wnrm));
	nb = pow(nb, vec3(4.0));
	nb /= (nb.x + nb.y + nb.z);
	vec3 t;
	vec3 c = mtex(detail_tex, wpos.zx * scale_far * 0.27 + vec2(0.13, 0.29));
	if (nb.y > 0.96) {
		t = tri(wpos.xz) * 0.78 + c * 0.22;
	} else {
		t = (tri(wpos.xz) * nb.y + tri(wpos.zy * vec2(1.0, 1.6)) * nb.x + tri(wpos.xy * vec2(1.0, 1.6)) * nb.z) * 0.78 + c * 0.22;
	}
	vec3 base = COLOR.rgb;
	float lum = dot(t, vec3(0.3333)) / max(dot(tex_mean, vec3(0.3333)), 0.02);
	vec3 detailed = base * mix(1.0, lum, detail_strength);
	vec3 texcol = t * (dot(base, vec3(0.3333)) / max(dot(tex_mean, vec3(0.3333)), 0.02));
	ALBEDO = mix(detailed, mix(texcol, t, 0.6), COLOR.a);
	ROUGHNESS = 0.94;
	SPECULAR = spec;
}
"""

static func terrain_material(tex_path: String, biome: String) -> ShaderMaterial:
	var key := "terrain:" + tex_path
	if _cache.has(key):
		return _cache[key]
	var sh := Shader.new()
	sh.code = TERRAIN_SHADER
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("detail_tex", _tex(tex_path))
	var mean := tex_mean(tex_path)
	m.set_shader_parameter("tex_mean", Vector3(mean.r, mean.g, mean.b))
	m.set_shader_parameter("detail_strength", 0.7 if biome == "winter" else 0.85)
	m.set_shader_parameter("spec", 0.35 if biome == "winter" else 0.15)
	_cache[key] = m
	return m

# ---------------------------------------------------------------- вода

const WATER_SHADER := """
shader_type spatial;
render_mode unshaded, cull_back, depth_draw_opaque;

uniform sampler2D waves_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D depth_tex : filter_linear, repeat_disable;
uniform vec4 depth_rect = vec4(-6000.0, -6000.0, 12000.0, 12000.0);
uniform vec3 tex_mean = vec3(0.1, 0.25, 0.3);
uniform vec3 deep_color : source_color = vec3(0.02, 0.09, 0.13);
uniform vec3 shallow_color : source_color = vec3(0.10, 0.42, 0.42);
uniform vec3 sky_horizon : source_color = vec3(0.7, 0.8, 0.9);
uniform vec3 sky_zenith : source_color = vec3(0.25, 0.45, 0.8);
uniform vec3 sun_dir = vec3(0.3, 0.8, 0.4);
uniform vec3 sun_color : source_color = vec3(1.0, 0.95, 0.9);
uniform vec3 ambient : source_color = vec3(0.5);
uniform float light = 1.0;
uniform float sun_spec = 1.0;
uniform float flash = 0.0;
uniform float choppy = 1.0;

varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float lum(vec3 c) { return dot(c, vec3(0.3333)); }

vec3 mtex(sampler2D s, vec2 uv) {
	vec2 mm = abs(mod(uv + 1.0, 2.0) - 1.0);
	return textureGrad(s, mm, dFdx(uv), dFdy(uv)).rgb;
}

void fragment() {
	float t = TIME;
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	float dist = length(cam - wpos);
	vec2 p = wpos.xz;
	vec2 uv1 = p * 0.0021 + vec2(t * 0.0030, t * 0.0020);
	vec2 uv2 = p * 0.0063 + vec2(-t * 0.0045, t * 0.0036);
	vec2 uv3 = p * 0.00042 + vec2(t * 0.0006, -t * 0.0004);
	vec3 w1 = mtex(waves_tex, uv1);
	vec3 w2 = mtex(waves_tex, uv2);
	vec3 w3 = mtex(waves_tex, uv3);
	float e = 0.004;
	float gx = lum(mtex(waves_tex, uv1 + vec2(e, 0.0))) - lum(w1) + 0.6 * (lum(mtex(waves_tex, uv2 + vec2(e, 0.0))) - lum(w2));
	float gz = lum(mtex(waves_tex, uv1 + vec2(0.0, e))) - lum(w1) + 0.6 * (lum(mtex(waves_tex, uv2 + vec2(0.0, e))) - lum(w2));
	vec3 v = normalize(cam - wpos);
	// у горизонта и вдали волны сглаживаются, иначе рябь превращается в шум
	float graze = smoothstep(0.02, 0.35, v.y);
	float fade = clamp(1.0 - dist / 4500.0, 0.05, 1.0) * mix(0.2, 1.0, graze);
	vec3 n = normalize(vec3(-gx * 9.0 * choppy * fade, 1.0, -gz * 9.0 * choppy * fade));
	float ndv = max(dot(n, v), 0.0);
	float fres = 0.08 + 0.8 * pow(1.0 - ndv, 4.0);
	vec3 r = reflect(-v, n);
	vec3 sky = mix(sky_horizon, sky_zenith, clamp(r.y * 1.6, 0.0, 1.0));
	vec2 duv = (p - depth_rect.xy) / depth_rect.zw;
	vec4 dm = texture(depth_tex, duv);
	float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
	float shallow = dm.r * inside;
	// фото воды как основа, подкрашенное под биом
	vec3 photo = w1 * 0.45 + w2 * 0.35 + w3 * 0.2;
	photo = mix(photo, tex_mean, clamp(dist / 7000.0, 0.0, 0.75));
	vec3 tint = deep_color / max(tex_mean, vec3(0.02));
	vec3 body = photo * tint;
	body = mix(body, shallow_color * (0.8 + 0.4 * lum(photo) / max(lum(tex_mean), 0.02)), shallow * shallow * 0.85);
	body *= ambient + sun_color * max(sun_dir.y, 0.0) * 0.6;
	vec3 col = mix(body, sky, fres);
	float sd = max(dot(r, normalize(sun_dir)), 0.0);
	float sp = pow(sd, 260.0) * 1.6 * fade + pow(sd, 24.0) * 0.10;
	col += sun_color * sp * sun_spec;
	// пена только у самой кромки берега
	float shore = clamp(1.0 - abs(dm.g * 2.0 - 1.0), 0.0, 1.0) * inside;
	float wob = 0.5 + 0.5 * sin(t * 1.1 + lum(w3) * 12.0);
	float foam = smoothstep(0.35, 0.9, shore) * smoothstep(0.25, 0.65, lum(w2) / max(lum(tex_mean), 0.02) * 0.5 + 0.2 * wob);
	col = mix(col, vec3(0.92, 0.95, 0.97) * (ambient + sun_color * 0.6), clamp(foam, 0.0, 0.75));
	col += vec3(0.7, 0.75, 0.9) * flash * 0.4;
	ALBEDO = col;
}
"""

static func water_material(depth_tex: Texture2D, extent: float) -> ShaderMaterial:
	var sh: Shader
	if _cache.has("water_shader"):
		sh = _cache["water_shader"]
	else:
		sh = Shader.new()
		sh.code = WATER_SHADER
		_cache["water_shader"] = sh
	var m := ShaderMaterial.new()
	m.shader = sh
	var path := "res://assets/textures/waves.webp"
	m.set_shader_parameter("waves_tex", _tex(path))
	var mean := tex_mean(path)
	m.set_shader_parameter("tex_mean", Vector3(mean.r, mean.g, mean.b))
	m.set_shader_parameter("depth_tex", depth_tex)
	m.set_shader_parameter("depth_rect", Vector4(-extent, -extent, 2.0 * extent, 2.0 * extent))
	return m

# ---------------------------------------------------------------- полоса и палуба

## Разметка считается в шейдере по UV: x — поперёк (метры от оси), y — вдоль (метры от начала).
## COLOR.r — тип: 0 полоса, 0.5 рулёжка/стоянка, 1 палуба.
## Вершины чуть сдвигаются к камере, чтобы не мерцать на рельефе.
const RUNWAY_SHADER := """
shader_type spatial;
render_mode diffuse_lambert, skip_vertex_transform;

uniform sampler2D detail_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform sampler2D deck_tex : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform float bias = 0.9985;
uniform float rlen = 1400.0;

varying vec2 m;
varying float kind;
varying vec3 wpos;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	VERTEX = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz * bias;
	NORMAL = normalize((MODELVIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
	m = UV;
	kind = COLOR.r;
}

vec3 mtex(sampler2D s, vec2 uv) {
	vec2 mm = abs(mod(uv + 1.0, 2.0) - 1.0);
	return textureGrad(s, mm, dFdx(uv), dFdy(uv)).rgb;
}

float band(float x, float a, float b) {
	float w = fwidth(x) * 0.75;
	return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}

void fragment() {
	float x = m.x;
	float y = m.y;
	float ax = abs(x);
	vec3 base;
	float mark = 0.0;
	vec3 mark_col = vec3(0.92, 0.92, 0.88);
	if (kind < 0.25) {
		vec3 t = mtex(detail_tex, wpos.xz * 0.02);
		base = vec3(0.25, 0.25, 0.26) * (0.75 + 0.45 * t.r);
		float ey = min(y, rlen - y);
		// осевая
		mark = max(mark, band(ax, -0.45, 0.45) * step(0.5, fract(y / 60.0)) * step(80.0, ey));
		// кромки
		mark = max(mark, band(ax, 22.5, 23.5));
		// торцы: полосы
		float stripes = band(ey, 8.0, 40.0) * step(3.0, ax) * step(ax, 21.0) * step(0.45, fract(ax / 2.4));
		mark = max(mark, stripes);
		// зона касания
		float tz = band(ey, 150.0, 172.0) + band(ey, 300.0, 345.0) + band(ey, 450.0, 468.0);
		mark = max(mark, tz * band(ax, 6.0, 9.0 + step(290.0, ey) * step(ey, 350.0) * 4.0));
		// следы шин
		float tyre = band(ey, 120.0, 520.0) * band(ax, 2.0, 7.0) * 0.35;
		base *= 1.0 - tyre * (0.5 + 0.5 * mtex(detail_tex, wpos.xz * 0.05).g);
	} else if (kind < 0.75) {
		vec3 t = mtex(detail_tex, wpos.xz * 0.03);
		base = vec3(0.36, 0.355, 0.34) * (0.75 + 0.4 * t.r);
		mark = band(ax, -0.3, 0.3) * 0.8;
		mark_col = vec3(0.85, 0.7, 0.15);
	} else {
		vec3 t = mtex(deck_tex, wpos.xz * 0.04);
		base = t * 0.8;
		float ey = y;
		mark = max(mark, band(ax, -0.4, 0.4) * step(0.5, fract(y / 24.0)));
		mark = max(mark, band(ax, 16.2, 16.8));
		mark = max(mark, band(ey, 6.0, 9.0) * step(ax, 14.0));
		mark_col = vec3(0.9, 0.88, 0.7);
	}
	ALBEDO = mix(base, mark_col, clamp(mark, 0.0, 1.0) * 0.9);
	ROUGHNESS = 0.9;
	SPECULAR = 0.25;
}
"""

static func runway_material() -> ShaderMaterial:
	if _cache.has("runway"):
		return _cache["runway"]
	var sh := Shader.new()
	sh.code = RUNWAY_SHADER
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("detail_tex", _tex("res://assets/textures/metal.webp"))
	m.set_shader_parameter("deck_tex", _tex("res://assets/textures/deck.webp"))
	_cache["runway"] = m
	return m

# ---------------------------------------------------------------- огни

## Огни: без освещения, размер на экране не падает с расстоянием.
const LIGHTS_SHADER := """
shader_type spatial;
render_mode unshaded, cull_back, fog_disabled;

uniform float energy = 1.0;
uniform float grow = 0.0015;
uniform float fog_amount = 0.3;

void vertex() {
	vec3 center = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
	float d = length(INV_VIEW_MATRIX[3].xyz - center);
	VERTEX *= max(1.0, d * grow);
}

void fragment() {
	ALBEDO = COLOR.rgb * energy;
}
"""

static func lights_material(energy: float) -> ShaderMaterial:
	var sh: Shader
	if _cache.has("lights_shader"):
		sh = _cache["lights_shader"]
	else:
		sh = Shader.new()
		sh.code = LIGHTS_SHADER
		_cache["lights_shader"] = sh
	var m := ShaderMaterial.new()
	m.shader = sh
	m.set_shader_parameter("energy", energy)
	return m

# ---------------------------------------------------------------- обычные

## Материал с цветом вершин. tint затемняет (обломки).
static func vcolor(tint := Color(1, 1, 1), rough := 0.85) -> StandardMaterial3D:
	var key := "vc:%s:%.2f" % [tint.to_html(), rough]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.albedo_color = tint
	m.roughness = rough
	m.metallic = 0.0
	m.metallic_specular = 0.3
	_cache[key] = m
	return m

## Светящиеся окна и лампы.
static func glow(color: Color, energy: float) -> StandardMaterial3D:
	var key := "glow:%s:%.2f" % [color.to_html(), energy]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(color.r * energy, color.g * energy, color.b * energy)
	_cache[key] = m
	return m

## Мягкий круглый спрайт (облака, пена, вспышки).
static func soft_texture() -> ImageTexture:
	if _cache.has("soft"):
		return _cache["soft"]
	var s := 64
	var img := Image.create(s, s, false, Image.FORMAT_LA8)
	for y in s:
		for x in s:
			var dx := (x + 0.5) / s * 2.0 - 1.0
			var dy := (y + 0.5) / s * 2.0 - 1.0
			var d := sqrt(dx * dx + dy * dy)
			var a := clampf(1.0 - d, 0.0, 1.0)
			a = a * a * (3.0 - 2.0 * a)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	_cache["soft"] = t
	return t

static func clear_cache() -> void:
	_cache.clear()
