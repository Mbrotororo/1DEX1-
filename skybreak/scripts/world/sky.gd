extends Node3D
## Небо, солнце или луна, туман, облака, дождь и молнии.
## Создаётся World. Время суток: dawn | day | dusk | night. Погода: clear | cloudy | overcast | fog | storm.

const Clouds = preload("res://scripts/world/world_clouds.gd")

const SKY_SHADER := """
shader_type sky;

uniform vec3 zenith : source_color = vec3(0.23, 0.45, 0.77);
uniform vec3 horizon : source_color = vec3(0.72, 0.82, 0.91);
uniform vec3 ground : source_color = vec3(0.55, 0.6, 0.65);
uniform vec3 sun_color : source_color = vec3(1.0, 0.95, 0.85);
uniform vec3 sun_dir = vec3(0.3, 0.8, 0.4);
uniform float sun_disk = 1.0;
uniform float sun_size = 0.99955;
uniform float glow = 0.35;
uniform float warm = 0.0;
uniform float stars = 0.0;
uniform float moon = 0.0;
uniform float flash = 0.0;
uniform float curve = 0.55;

float hash3(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.x + p.y) * p.z);
}

void sky() {
	vec3 d = normalize(EYEDIR);
	float y = d.y;
	float up = clamp(y, 0.0, 1.0);
	vec3 col = mix(horizon, zenith, clamp(pow(up, curve), 0.0, 1.0));
	vec3 sd3 = normalize(sun_dir);
	float sd = max(dot(d, sd3), 0.0);
	// свечение вокруг солнца и тёплая полоса у горизонта
	col += sun_color * glow * (pow(sd, 6.0) * 0.45 + pow(sd, 48.0) * 0.6) * (1.0 - moon * 0.7);
	col += sun_color * warm * pow(sd, 2.5) * exp(-abs(y) * 9.0) * 0.8;
	if (y < 0.0) {
		col = mix(col, ground, smoothstep(0.0, -0.25, y));
	}
	// диск
	float disk = smoothstep(sun_size - 0.00025, sun_size, dot(d, sd3)) * sun_disk;
	col = mix(col, sun_color * (moon > 0.5 ? 1.6 : 10.0), disk * step(-0.01, y));
	if (moon > 0.5) {
		col += sun_color * pow(sd, 200.0) * 0.25 * sun_disk;
	}
	// звёзды
	if (stars > 0.0 && y > 0.0) {
		vec3 q = d * 420.0;
		vec3 cell = floor(q);
		float h = hash3(cell);
		if (h > 0.9965) {
			vec3 f = fract(q) - 0.5;
			float s = smoothstep(0.32, 0.0, length(f));
			float tw = 0.65 + 0.35 * sin(TIME * (1.5 + h * 30.0) + h * 100.0);
			col += vec3(0.85, 0.9, 1.0) * s * tw * stars * smoothstep(0.0, 0.25, y) * (h - 0.9965) * 300.0;
		}
	}
	col += vec3(0.75, 0.8, 1.0) * flash;
	COLOR = col;
}
"""

# Цвета в sRGB. elev/az — градусы (az 0 = -Z, 90 = +X).
const TIMES := {
	"dawn": {"zenith": Color("4a6597"), "horizon": Color("efb39a"), "ground": Color("8c7f86"),
		"sun": Color("ffb47c"), "sun_energy": 0.95, "elev": 8.0, "az": 78.0,
		"ambient": Color("8f8aa3"), "amb_energy": 0.45, "fog": Color("d9ab9c"),
		"cloud_lit": Color("ffd2b8"), "cloud_shade": Color("6f6c88"), "glow": 0.55, "warm": 0.6, "level": 0.65},
	"day": {"zenith": Color("3a72c2"), "horizon": Color("b8d0e6"), "ground": Color("8a9aa6"),
		"sun": Color("fff3df"), "sun_energy": 0.92, "elev": 52.0, "az": 140.0,
		"ambient": Color("a3b6cc"), "amb_energy": 0.4, "fog": Color("bcd2e6"),
		"cloud_lit": Color("ffffff"), "cloud_shade": Color("9aa6b8"), "glow": 0.3, "warm": 0.0, "level": 1.0},
	"dusk": {"zenith": Color("34426b"), "horizon": Color("f0965a"), "ground": Color("7a6466"),
		"sun": Color("ff9a52"), "sun_energy": 0.92, "elev": 6.0, "az": 285.0,
		"ambient": Color("8a7480"), "amb_energy": 0.42, "fog": Color("d68f68"),
		"cloud_lit": Color("ffbd8c"), "cloud_shade": Color("5f5470"), "glow": 0.6, "warm": 0.8, "level": 0.6},
	"night": {"zenith": Color("060b18"), "horizon": Color("17223a"), "ground": Color("0d1424"),
		"sun": Color("9eb8f2"), "sun_energy": 0.3, "elev": 38.0, "az": 210.0,
		"ambient": Color("34436e"), "amb_energy": 0.38, "fog": Color("141d31"),
		"cloud_lit": Color("2e3850"), "cloud_shade": Color("12161f"), "glow": 0.12, "warm": 0.0, "level": 0.25},
}

# fog_begin, fog_end, затемнение неба, солнце, видимость диска
const WEATHERS := {
	"clear": {"fog_begin": 2800.0, "fog_end": 13500.0, "grey": 0.0, "dark": 0.0, "sun": 1.0, "disk": 1.0, "level": 1.0},
	"cloudy": {"fog_begin": 2400.0, "fog_end": 13000.0, "grey": 0.12, "dark": 0.03, "sun": 0.92, "disk": 1.0, "level": 0.95},
	"overcast": {"fog_begin": 1500.0, "fog_end": 11500.0, "grey": 0.6, "dark": 0.18, "sun": 0.45, "disk": 0.0, "level": 0.82},
	"fog": {"fog_begin": 60.0, "fog_end": 3200.0, "grey": 0.55, "dark": 0.08, "sun": 0.6, "disk": 0.25, "level": 0.8},
	"storm": {"fog_begin": 500.0, "fog_end": 7500.0, "grey": 0.75, "dark": 0.55, "sun": 0.25, "disk": 0.0, "level": 0.6},
}

var time_of_day: String = "day"
var weather: String = "clear"
var is_night: bool = false
var sun_dir: Vector3 = Vector3(0.3, 0.8, 0.4)
var sun_color: Color = Color.WHITE
var horizon_color: Color = Color.WHITE
var zenith_color: Color = Color.WHITE
var ambient_color: Color = Color.WHITE
var level: float = 1.0
var clouds: Node3D
var env: Environment
var world_env: WorldEnvironment
var light: DirectionalLight3D
var rain: CPUParticles3D
var lightning_enabled: bool = false

var _sky_mat: ShaderMaterial
var _rng := RandomNumberGenerator.new()
var _base_light_energy: float = 1.0
var _base_amb_energy: float = 0.5
var _flash: float = 0.0
var _flash_t: float = 0.0
var _next_strike: float = 6.0
var _thunder: Array = []   # [время до грома, громкость]
var _water_mats: Array = []
var _time: float = 0.0
var _last_cam := Vector3.ZERO

func setup(p_time: String, p_weather: String, seed_value: int, quality: float, shadows: bool) -> void:
	time_of_day = p_time if TIMES.has(p_time) else "day"
	weather = p_weather if WEATHERS.has(p_weather) else "clear"
	is_night = time_of_day == "night"
	_rng.seed = seed_value
	var t: Dictionary = TIMES[time_of_day]
	var w: Dictionary = WEATHERS[weather]
	var grey: float = w.grey
	var dark: float = w.dark
	# цвета с учётом погоды
	var grey_c := Color(0.62, 0.65, 0.69) if not is_night else Color(0.09, 0.1, 0.13)
	zenith_color = _mix_dark((t.zenith as Color).lerp(grey_c.darkened(0.15), grey), dark)
	horizon_color = _mix_dark((t.horizon as Color).lerp(grey_c, grey), dark)
	var fog_c := _mix_dark((t.fog as Color).lerp(grey_c, grey), dark)
	horizon_color = horizon_color.lerp(fog_c, 0.5)
	var ground_c := _mix_dark((t.ground as Color).lerp(grey_c.darkened(0.2), grey), dark)
	sun_color = t.sun
	ambient_color = (t.ambient as Color).lerp(grey_c, grey * 0.5)
	level = clampf(float(t.level) * float(w.level), 0.2, 1.0)
	if is_night:
		level = clampf(0.25 * float(w.level) / 0.8 if weather != "clear" else 0.25, 0.2, 0.25)
	var elev := deg_to_rad(float(t.elev))
	var az := deg_to_rad(float(t.az) + _rng.randf_range(-12.0, 12.0))
	sun_dir = Vector3(sin(az) * cos(elev), sin(elev), -cos(az) * cos(elev)).normalized()

	# небо
	var sh := Shader.new()
	sh.code = SKY_SHADER
	_sky_mat = ShaderMaterial.new()
	_sky_mat.shader = sh
	_sky_mat.set_shader_parameter("zenith", zenith_color)
	_sky_mat.set_shader_parameter("horizon", fog_c)
	_sky_mat.set_shader_parameter("ground", ground_c)
	_sky_mat.set_shader_parameter("sun_color", sun_color.lerp(grey_c, grey * 0.5))
	_sky_mat.set_shader_parameter("sun_dir", sun_dir)
	_sky_mat.set_shader_parameter("sun_disk", float(w.disk))
	_sky_mat.set_shader_parameter("sun_size", 0.9997 if is_night else 0.99955)
	_sky_mat.set_shader_parameter("glow", float(t.glow) * (1.0 - grey * 0.8))
	_sky_mat.set_shader_parameter("warm", float(t.warm) * (1.0 - grey))
	_sky_mat.set_shader_parameter("stars", 1.0 if is_night and weather in ["clear", "cloudy"] else 0.0)
	_sky_mat.set_shader_parameter("moon", 1.0 if is_night else 0.0)
	var sky := Sky.new()
	sky.sky_material = _sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_32

	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = ambient_color
	_base_amb_energy = float(t.amb_energy) * (1.0 + grey * 0.35)
	env.ambient_light_energy = _base_amb_energy
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0 if not is_night else 1.15
	env.tonemap_white = 6.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = fog_c
	env.fog_light_energy = 1.0
	env.fog_density = 1.0
	env.fog_depth_begin = float(w.fog_begin)
	env.fog_depth_end = float(w.fog_end)
	env.fog_depth_curve = 1.6 if weather != "fog" else 0.8
	env.fog_sky_affect = 0.0
	env.fog_sun_scatter = 0.0
	if is_night:
		env.glow_enabled = true
		env.glow_intensity = 0.9
		env.glow_bloom = 0.0
		env.glow_hdr_threshold = 1.2
	world_env = WorldEnvironment.new()
	world_env.name = "Environment"
	world_env.environment = env
	add_child(world_env)

	# солнце / луна
	light = DirectionalLight3D.new()
	light.name = "Moon" if is_night else "Sun"
	light.light_color = sun_color
	_base_light_energy = float(t.sun_energy) * float(w.sun)
	light.light_energy = _base_light_energy
	var upv := Vector3.UP if absf(sun_dir.y) < 0.98 else Vector3.FORWARD
	light.transform = Transform3D(Basis.looking_at(-sun_dir, upv), Vector3.ZERO)
	light.shadow_enabled = shadows and not is_night
	light.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	light.directional_shadow_max_distance = 1400.0
	light.shadow_blur = 1.0
	light.sky_mode = DirectionalLight3D.SKY_MODE_LIGHT_ONLY
	add_child(light)

	# облака
	clouds = Clouds.new()
	clouds.name = "Clouds"
	add_child(clouds)
	var crng := RandomNumberGenerator.new()
	crng.seed = seed_value * 31 + 7
	clouds.generate(weather, crng, quality)
	clouds.make_visual(cloud_colors())

	# дождь и молнии
	lightning_enabled = weather == "storm"
	if weather == "storm":
		_make_rain(quality)
		_next_strike = _rng.randf_range(3.0, 8.0)

static func _mix_dark(c: Color, dark: float) -> Color:
	return c.darkened(dark)

func cloud_colors() -> Dictionary:
	var t: Dictionary = TIMES[time_of_day]
	var w: Dictionary = WEATHERS[weather]
	var grey: float = w.grey
	var dark: float = w.dark
	var lit: Color = (t.cloud_lit as Color)
	var shade: Color = (t.cloud_shade as Color)
	if not is_night:
		lit = lit.lerp(Color(0.80, 0.82, 0.85), grey * 0.6).darkened(dark * 0.9)
		shade = shade.lerp(Color(0.48, 0.5, 0.54), grey * 0.6).darkened(dark * 0.8)
	var fe: float = w.fog_end
	return {"lit": lit, "shade": shade, "sun_dir": sun_dir, "opacity": 0.92 if weather != "clear" else 0.85,
		"far_fade": Vector2(fe * 0.5, fe * 0.92)}

## Плотность облаков в точке, 0..1.
func cloud_density_at(p: Vector3) -> float:
	if clouds == null:
		return 0.0
	return clouds.density_at(p)

## Параметры для шейдера воды.
func water_params() -> Dictionary:
	var lin_amb := ambient_color * float(env.ambient_light_energy if env else 0.5)
	return {"sky_horizon": horizon_color, "sky_zenith": zenith_color, "sun_dir": sun_dir,
		"sun_color": sun_color * light.light_energy if light else sun_color, "ambient": lin_amb,
		"light": level, "sun_spec": float(WEATHERS[weather].disk) * (0.35 if is_night else 1.0)}

func register_water(m: ShaderMaterial, biome := "ocean") -> void:
	_water_mats.append(m)
	var p := water_params()
	m.set_shader_parameter("sky_horizon", p.sky_horizon)
	m.set_shader_parameter("sky_zenith", p.sky_zenith)
	m.set_shader_parameter("sun_dir", p.sun_dir)
	m.set_shader_parameter("sun_color", p.sun_color)
	m.set_shader_parameter("ambient", p.ambient)
	m.set_shader_parameter("light", p.light)
	m.set_shader_parameter("sun_spec", p.sun_spec)
	# deep — цвет открытой воды (фото волн подкрашивается к нему), shallow — мелководье
	var deep := Color(0.05, 0.24, 0.32)
	var shallow := Color(0.16, 0.58, 0.58)
	match biome:
		"desert":
			deep = Color(0.16, 0.30, 0.28)
			shallow = Color(0.32, 0.44, 0.36)
		"winter":
			deep = Color(0.07, 0.19, 0.23)
			shallow = Color(0.14, 0.30, 0.32)
	if is_night:
		deep = deep.darkened(0.55)
		shallow = shallow.darkened(0.6)
	elif weather == "storm" or weather == "overcast":
		deep = deep.darkened(0.3)
		shallow = shallow.lerp(Color(0.2, 0.3, 0.32), 0.5)
	m.set_shader_parameter("deep_color", deep)
	m.set_shader_parameter("shallow_color", shallow)
	m.set_shader_parameter("choppy", 1.6 if weather == "storm" else 1.0)

# ---------------------------------------------------------------- дождь

func _make_rain(quality: float) -> void:
	rain = CPUParticles3D.new()
	rain.name = "Rain"
	rain.top_level = true
	rain.amount = int(2400 * clampf(quality, 0.4, 1.2))
	rain.lifetime = 1.3
	rain.preprocess = 1.0
	rain.local_coords = false
	rain.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	rain.emission_box_extents = Vector3(110, 10, 110)
	rain.direction = Vector3(0.15, -1, 0.05)
	rain.spread = 3.0
	rain.gravity = Vector3(0, -9.8, 0)
	rain.initial_velocity_min = 26.0
	rain.initial_velocity_max = 32.0
	var q := QuadMesh.new()
	q.size = Vector2(0.06, 2.6)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.albedo_color = Color(0.72, 0.76, 0.82, 0.32)
	m.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	q.material = m
	rain.mesh = q
	rain.visibility_aabb = AABB(Vector3(-150, -120, -150), Vector3(300, 200, 300))
	add_child(rain)

# ---------------------------------------------------------------- кадр

func _process(delta: float) -> void:
	_time += delta
	var cam: Camera3D = get_viewport().get_camera_3d() if is_inside_tree() else null
	if rain != null and cam != null:
		var cp := cam.global_position
		var vel := (cp - _last_cam) / maxf(delta, 0.001)
		if vel.length() > 400.0:
			vel = Vector3.ZERO
		_last_cam = cp
		var below := cp.y < 1050.0
		rain.emitting = below
		rain.global_position = cp + Vector3(vel.x, 0.0, vel.z) * 0.6 + Vector3(0, 45, 0)
	if lightning_enabled:
		_step_lightning(delta)

func _step_lightning(delta: float) -> void:
	delta = minf(delta, 0.05)
	_next_strike -= delta
	if _next_strike <= 0.0:
		_next_strike = _rng.randf_range(4.0, 13.0)
		_flash_t = 0.0
		_flash = 1.0
		var dist := _rng.randf_range(1.0, 4.0)
		_thunder.append([dist, -14.0 - dist * 2.0])
	if _flash > 0.0:
		_flash_t += delta
		# двойная вспышка
		var f := 0.0
		if _flash_t < 0.07:
			f = 1.0
		elif _flash_t < 0.14:
			f = 0.25
		elif _flash_t < 0.24:
			f = 0.8
		else:
			f = maxf(0.0, 0.8 - (_flash_t - 0.24) * 5.0)
		if _flash_t > 0.5:
			f = 0.0
			_flash = 0.0
		_apply_flash(f)
	var i := _thunder.size() - 1
	while i >= 0:
		_thunder[i][0] -= delta
		if _thunder[i][0] <= 0.0:
			Sfx.play("explosion_big", null, float(_thunder[i][1]), 0.5)
			_thunder.remove_at(i)
		i -= 1

func _apply_flash(f: float) -> void:
	if light != null:
		light.light_energy = _base_light_energy + f * 2.2
	if env != null:
		env.ambient_light_energy = _base_amb_energy + f * 1.5
	if _sky_mat != null:
		_sky_mat.set_shader_parameter("flash", f * 0.55)
	if clouds != null:
		clouds.set_flash(f * 0.6)
	for m in _water_mats:
		(m as ShaderMaterial).set_shader_parameter("flash", f)

## Принудительная вспышка (для проверки).
func strike_now() -> void:
	_next_strike = 0.0

## Показать вспышку заданной силы (0..1) без грома — для снимков.
func show_flash(f: float) -> void:
	_apply_flash(f)
