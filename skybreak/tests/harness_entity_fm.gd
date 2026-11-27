extends FlightModel
## Упрощённая модель полёта для тестов ENTITY, пока настоящая FlightModel — заглушка.
## Нос задаётся рулями, скорость — по энергии, без рулей в крене нос опускается, есть земля.
## Все свои поля с префиксом hx_, чтобы файл компилировался и поверх настоящей FlightModel.

var hx_vs: float = 50.0
var hx_g: float = 9.81


func setup(p_def: Dictionary, start_pos: Vector3, start_basis: Basis, start_speed: float, p_on_ground := false) -> void:
	def = p_def
	pos = start_pos
	basis = start_basis.orthonormalized()
	on_ground = p_on_ground
	crashed = false
	crash_reason = ""
	if on_ground:
		gear_down = true
	vel = -basis.z * start_speed
	airspeed = start_speed
	var m := float(def.get("mass", 3000.0))
	var s := float(def.get("wing_area", 16.0))
	hx_vs = sqrt(2.0 * m * hx_g / (1.225 * s * float(def.get("cl_max", 1.4))))
	engine_rpm = 0.2 + 0.8 * throttle


func hx_thrust(v: float) -> float:
	var t := float(def.get("thrust", 10000.0))
	if String(def.get("kind", "prop")) == "prop":
		t = minf(t, float(def.get("power_kw", 800.0)) * 800.0 / maxf(v, 10.0))
		if afterburner:
			t *= 1.0 + float(def.get("afterburner", 0.0))
		return t * throttle * thrust_factor
	var ab := float(def.get("afterburner", 0.0)) if afterburner else 0.0
	return (t * (1.0 if afterburner else throttle) + ab) * thrust_factor


func step(dt: float, ctrl: Dictionary, surface: Dictionary) -> void:
	if crashed or dt <= 0.0:
		return
	throttle = clampf(float(ctrl.get("throttle", throttle)), 0.0, 1.0)
	afterburner = bool(ctrl.get("afterburner", false))
	brake = bool(ctrl.get("brake", false))
	var pin := clampf(float(ctrl.get("pitch", 0.0)), -1.0, 1.0)
	var rin := clampf(float(ctrl.get("roll", 0.0)), -1.0, 1.0)
	var yin := clampf(float(ctrl.get("yaw", 0.0)), -1.0, 1.0)
	var m := float(def.get("mass", 3000.0))
	var s := float(def.get("wing_area", 16.0))
	var gear_h := float(def.get("shape", {}).get("gear_height", 1.5))
	var floor_y := float(surface.get("height", 0.0)) + gear_h
	var v := vel.length()
	engine_rpm = lerpf(engine_rpm, 0.2 + 0.8 * throttle, 1.0 - exp(-dt / 0.5))
	if on_ground:
		var hd := heading()
		var acc := hx_thrust(v) / m - 0.02 * hx_g - (6.0 if brake else 0.0) - 0.0005 * v * v
		v = maxf(0.0, v + acc * dt)
		hd += yin * 0.4 * clampf(v / 5.0, 0.0, 1.0) * dt
		basis = Basis(Vector3.UP, -hd)
		vel = Vector3(sin(hd), 0.0, -cos(hd)) * v
		pos += vel * dt
		pos.y = floor_y
		airspeed = v
		g_load = 1.0
		if v > 1.15 * hx_vs and pin > 0.2:
			on_ground = false
			vel.y = 2.0
		return
	var eff := clampf(v / maxf(float(def.get("v_ref", 100.0)), 10.0), 0.15, 1.0)
	var pr := pin * deg_to_rad(float(def.get("max_pitch_rate_deg", 35.0))) * eff * pitch_authority
	# подъёмная сила ограничивает темп разворота
	var n_max := clampf(pow(v / hx_vs, 2.0), 0.0, float(def.get("g_limit", 8.0)))
	var w_max := hx_g * maxf(n_max - 0.5, 0.05) / maxf(v, 10.0)
	pr = clampf(pr, -w_max * 0.5, w_max)
	var rr := rin * deg_to_rad(float(def.get("max_roll_rate_deg", 120.0))) * eff * roll_authority
	var yr := yin * deg_to_rad(float(def.get("max_yaw_rate_deg", 12.0))) * eff * yaw_authority
	var omega := basis.x * pr - basis.y * yr + (-basis.z) * rr
	var ang := omega.length()
	if ang > 1e-9:
		basis = Basis(omega / ang, ang * dt) * basis
	# без подъёмной силы по вертикали нос уходит вниз
	var fwd := -basis.z
	var gamma := asin(clampf(fwd.y, -1.0, 1.0))
	var cb := cos(bank())
	var droop := hx_g * cos(gamma) * (1.0 - clampf(cb, 0.0, 1.0)) / maxf(v, 20.0)
	if v < hx_vs:
		droop += (hx_vs - v) / hx_vs * 1.5
	var hz := fwd.cross(Vector3.UP)
	if droop > 0.0 and hz.length_squared() > 1e-6:
		basis = Basis(hz.normalized(), -droop * dt) * basis
	basis = basis.orthonormalized()
	fwd = -basis.z
	gamma = asin(clampf(fwd.y, -1.0, 1.0))
	# энергия
	var rho := 1.225 * exp(-pos.y / 9000.0)
	var q := 0.5 * rho * v * v
	g_load = 1.0 + v * pr / hx_g
	var cl := absf(g_load) * m * hx_g / maxf(q * s, 1.0)
	var drag := q * s * (float(def.get("cd0", 0.025)) + float(def.get("k_induced", 0.06)) * cl * cl + extra_drag)
	v += ((hx_thrust(v) - drag) / m - hx_g * sin(gamma)) * dt
	v = maxf(v, 5.0)
	vel = fwd * v
	pos += vel * dt
	airspeed = v
	vertical_speed = vel.y
	stalled = v < hx_vs
	aoa = 0.05
	if pos.y <= floor_y:
		var kind := String(surface.get("kind", "ground"))
		if gear_down and vel.y > -6.0 and absf(bank()) < 0.26 and kind != "water":
			on_ground = true
			pos.y = floor_y
		else:
			crashed = true
			crash_reason = "water" if kind == "water" else ("gear" if gear_down else "ground")
			vel = Vector3.ZERO


func bank() -> float:
	return atan2(-basis.x.y, basis.y.y)


func pitch_angle() -> float:
	return asin(clampf(-basis.z.y, -1.0, 1.0))


func heading() -> float:
	var f := -basis.z
	return fposmod(atan2(f.x, -f.z), TAU)


func stall_speed() -> float:
	return hx_vs
