class_name FlightModel
extends RefCounted
## Модель полёта по энергии: подъёмная сила, сопротивление, тяга, сваливание, кобра, земля.
## Чистая логика без сцены и без случайности. Шаг внутри делится на подшаги по 1/120 с.
## Оси самолёта: вперёд = -Z, вверх = +Y, вправо = +X.

const G := 9.81
const RHO0 := 1.225
const SUB_DT := 1.0 / 120.0

# настройка поведения
const PITCH_STAB := 0.8          # возврат угла атаки к балансировочному, 1/с
const YAW_STAB := 2.0            # флюгерная устойчивость по рысканию, 1/с
const SIDE_CY := 0.5             # боковая сила от скольжения, на радиан
const POST_STALL_CD := 1.6       # сопротивление плоской пластины на закритике
const COBRA_RATE := 2.8          # во сколько раз быстрее тангаж в кобре
const COBRA_STAB := 0.12         # остаток устойчивости в кобре
const TRIM_REALISTIC := 0.9      # реализм: триммер держит 90 % нужной подъёмной силы
const G_LIMITER := 0.97          # аркада: ограничение перегрузки (доля g_limit)
const K_LIM := 5.0               # подход к пределу угла атаки, 1/с
const GAMMA_HOLD := 0.6          # аркада: возврат к запомненному углу траектории, 1/с
const AUTOROT := 2.0             # авторотация по крену на закритике (предел момента), рад/с²
const AUTOROT_YAW := 1.0         # то же по рысканию
const SPIN_BUILD := 1.5          # с до развитого штопора
const SPIN_DECAY := 1.2          # с до выхода после отдачи ручки
const SPIN_RATE := 2.0           # рад/с вращения в развитом штопоре
const SPIN_AOA := 1.7            # угол атаки в штопоре, доля критического
const GROUND_PITCH_MIN := -2.0   # град
const GROUND_PITCH_MAX := 15.0   # град
const BRAKE_DECEL := 6.0         # м/с²
const ROLL_FRICTION := 0.02

var def: Dictionary = {}
var pos: Vector3 = Vector3.ZERO
var vel: Vector3 = Vector3.ZERO
var basis: Basis = Basis.IDENTITY
var throttle: float = 0.8
var afterburner: bool = false
var gear_down: bool = false
var on_ground: bool = false
var brake: bool = false
var assist: bool = true
var crashed: bool = false
var crash_reason: String = ""
# выход (только чтение)
var airspeed: float = 0.0
var aoa: float = 0.0
var slip: float = 0.0
var g_load: float = 1.0
var stalled: bool = false
var overspeed: bool = false
var vertical_speed: float = 0.0
var mach: float = 0.0
var engine_rpm: float = 0.0
# модификаторы от повреждений (пишет DamageModel.update)
var thrust_factor: float = 1.0
var lift_left: float = 1.0
var lift_right: float = 1.0
var pitch_authority: float = 1.0
var roll_authority: float = 1.0
var yaw_authority: float = 1.0
var extra_drag: float = 0.0
var structural_stress: float = 0.0
# дополнительно
var tumble: float = 0.0            # 0..1, пишет DamageModel при потере хвоста: самолёт кувыркается
var thrust: float = 0.0            # текущая тяга, Н
var cobra_active: bool = false     # включён режим больших углов атаки
var pitch_rate: float = 0.0        # рад/с, + нос вверх
var roll_rate: float = 0.0         # рад/с, + крен вправо
var yaw_rate: float = 0.0          # рад/с, + нос вправо
var spin: float = 0.0              # 0..1, развитость штопора

# параметры самолёта (кэш из def)
var _mass: float = 3000.0
var _area: float = 16.0
var _cl_slope: float = 5.0
var _cl_max: float = 1.4
var _cl_max_neg: float = 1.05
var _a_crit: float = 0.28
var _a_crit_neg: float = 0.22
var _cl_peak: float = 1.4
var _cd0: float = 0.025
var _k_ind: float = 0.06
var _mcrit: float = 0.7
var _pitch_max: float = 0.7
var _roll_max: float = 2.6
var _yaw_max: float = 0.25
var _v_ref: float = 90.0
var _vne: float = 190.0
var _g_limit: float = 9.0
var _is_prop: bool = true
var _power_w: float = 800000.0
var _thrust_static: float = 9600.0
var _ab: float = 0.0
var _high_aoa: bool = false
var _gear_h: float = 1.5
var _arm: float = 2.0
var _i_roll: float = 10000.0
var _ground_pitch: float = 0.0
var _gear_prev: bool = false
var _aoa_limit: float = 1.0
var _gamma_ref: float = 0.0
var _gamma_valid: bool = false
var _spin_dir: float = 0.0

# ---------------------------------------------------------------- настройка

func setup(p_def: Dictionary, start_pos: Vector3, start_basis: Basis, start_speed: float, p_on_ground := false) -> void:
	def = p_def
	_cache_def()
	pos = start_pos
	basis = start_basis.orthonormalized()
	on_ground = p_on_ground
	crashed = false
	crash_reason = ""
	pitch_rate = 0.0
	roll_rate = 0.0
	yaw_rate = 0.0
	structural_stress = 0.0
	cobra_active = false
	_gamma_valid = false
	spin = 0.0
	_spin_dir = 0.0
	if on_ground:
		gear_down = true
		var hd := heading()
		_ground_pitch = clampf(pitch_angle(), deg_to_rad(GROUND_PITCH_MIN), deg_to_rad(GROUND_PITCH_MAX))
		basis = _ground_basis(hd, _ground_pitch)
		vel = _flat_forward(hd) * maxf(start_speed, 0.0)
	else:
		vel = forward() * start_speed
		# сразу выставить угол атаки для 1g, чтобы самолёт не проседал на старте
		# basis.y.y = cos(тангаж) * cos(крен): сколько веса нужно держать крылом
		var a0 := _level_trim_aoa(start_speed, pos.y, maxf(basis.y.y, 0.0))
		if a0 != 0.0:
			basis = (Basis(right(), a0) * basis).orthonormalized()
	_gear_prev = gear_down
	_update_outputs(0.0)
	engine_rpm = _rpm_target()

func _cache_def() -> void:
	_mass = maxf(float(def.get("mass", 3000.0)), 100.0)
	_area = maxf(float(def.get("wing_area", 16.0)), 1.0)
	_cl_slope = maxf(float(def.get("cl_slope", 5.0)), 0.5)
	_cl_max = maxf(float(def.get("cl_max", 1.4)), 0.2)
	_cl_max_neg = 0.75 * _cl_max
	_a_crit = deg_to_rad(float(def.get("alpha_crit_deg", 16.0)))
	_a_crit_neg = 0.8 * _a_crit
	_cl_peak = _soft_cap(_cl_slope * _a_crit, _cl_max)
	_cd0 = float(def.get("cd0", 0.025))
	_k_ind = float(def.get("k_induced", 0.06))
	_mcrit = float(def.get("mcrit", 0.7))
	_pitch_max = deg_to_rad(float(def.get("max_pitch_rate_deg", 40.0)))
	_roll_max = deg_to_rad(float(def.get("max_roll_rate_deg", 150.0)))
	_yaw_max = deg_to_rad(float(def.get("max_yaw_rate_deg", 12.0)))
	_v_ref = maxf(float(def.get("v_ref", 100.0)), 10.0)
	_vne = maxf(float(def.get("vne", 200.0)), 20.0)
	_g_limit = maxf(float(def.get("g_limit", 8.0)), 2.0)
	_is_prop = String(def.get("kind", "prop")) == "prop"
	_power_w = float(def.get("power_kw", 0.0)) * 1000.0
	_thrust_static = float(def.get("thrust", 10000.0))
	_ab = float(def.get("afterburner", 0.0))
	_high_aoa = bool(def.get("high_aoa", false))
	var sh: Dictionary = def.get("shape", {})
	_gear_h = float(sh.get("gear_height", 1.5))
	var span: float = float(sh.get("span", 10.0))
	_arm = 0.21 * span
	_i_roll = _mass * pow(0.19 * span, 2.0)
	_aoa_limit = 0.9 * _a_crit

# ---------------------------------------------------------------- аэродинамика

static func air_density_at(h: float) -> float:
	return RHO0 * exp(-clampf(h, -500.0, 30000.0) / 9000.0)

static func speed_of_sound_at(h: float) -> float:
	return maxf(340.0 - 0.004 * h, 290.0)

func _soft_cap(x: float, c: float) -> float:
	var w := 0.12 * c
	if x <= c - w:
		return x
	if x >= c + w:
		return c
	var d := x - c + w
	return x - d * d / (4.0 * w)

## Коэффициент подъёмной силы для угла атаки a (рад), всего крыла.
func lift_coefficient(a: float) -> float:
	var s := 1.0
	var x := a
	if x < 0.0:
		s = -1.0
		x = -x
	var back := false
	if x > PI * 0.5:
		x = PI - x
		back = true
	var ac := _a_crit if s > 0.0 else _a_crit_neg
	var cmax := _cl_max if s > 0.0 else _cl_max_neg
	var cl: float
	if x <= ac:
		cl = _soft_cap(_cl_slope * x, cmax)
	else:
		var peak := _soft_cap(_cl_slope * ac, cmax)
		var u := clampf((x - ac) / maxf(PI * 0.5 - ac, 0.1), 0.0, 1.0)
		var post := 0.6 * cmax * cos(u * PI * 0.5)
		var t := smoothstep(0.0, 1.0, (x - ac) / 0.14)
		cl = lerpf(peak, post, t)
	if back:
		cl = -0.5 * cl
	return s * cl

## Рост сопротивления после критического числа Маха (до x3 к M1.2).
func mach_drag_factor(m: float) -> float:
	if m <= _mcrit:
		return 1.0
	var t := clampf((m - _mcrit) / maxf(1.2 - _mcrit, 0.05), 0.0, 1.0)
	return 1.0 + 2.0 * sqrt(t)   # резкий рост сразу за mcrit

func drag_coefficient(a: float, cl: float, m: float, b: float) -> float:
	var x := absf(a)
	var ramp := 1.0
	if x > PI * 0.5:
		x = PI - x
	else:
		var ac := _a_crit if a >= 0.0 else _a_crit_neg
		ramp = clampf((x - 0.75 * ac) / (0.25 * ac), 0.0, 1.0)
	var sx := sin(x)
	var sb := sin(b)
	var cd := _cd0 * mach_drag_factor(m) + _k_ind * cl * cl + POST_STALL_CD * sx * sx * ramp + 0.5 * sb * sb
	if gear_down:
		cd += 0.02
	return cd + maxf(extra_drag, 0.0)

func _compute_thrust(v: float, alt: float, rho_ratio: float) -> float:
	if thrust_factor <= 0.0:
		return 0.0
	var t := 0.0
	if _is_prop:
		var boost := 1.0 + (_ab if afterburner else 0.0)
		var alt_k := clampf(1.0 - maxf(alt - 2500.0, 0.0) / 12000.0, 0.45, 1.0)
		t = minf(_thrust_static, _power_w * 0.8 / maxf(v, 10.0)) * boost * throttle * alt_k
	else:
		var dry := _thrust_static * (1.0 if afterburner else throttle)
		var wet := _ab if afterburner else 0.0
		t = (dry + wet) * (0.35 + 0.65 * rho_ratio)
	return t * thrust_factor

func _level_trim_aoa(v: float, alt: float, n: float) -> float:
	var q := 0.5 * air_density_at(alt) * v * v
	if q < 1.0:
		return 0.0
	var wf := maxf(0.5 * (lift_left + lift_right), 0.05)
	var a := n * _mass * G / (q * _area * wf) / _cl_slope
	return clampf(a, 0.0, 0.9 * _a_crit)

# ---------------------------------------------------------------- шаг

func step(dt: float, ctrl: Dictionary, surface: Dictionary) -> void:
	if crashed or def.is_empty() or dt <= 0.0:
		return
	dt = minf(dt, 0.1)
	throttle = clampf(float(ctrl.get("throttle", throttle)), 0.0, 1.0)
	afterburner = bool(ctrl.get("afterburner", false)) and _ab > 0.0
	brake = bool(ctrl.get("brake", false))
	# шасси: переключаем сами, если владелец не переключил его в этом кадре
	if gear_down == _gear_prev and bool(ctrl.get("gear_toggle", false)):
		if not (on_ground and gear_down):
			gear_down = not gear_down
	var n := maxi(1, ceili(dt / SUB_DT - 0.001))
	var h := dt / float(n)
	for i in n:
		if crashed:
			break
		if on_ground:
			_ground_substep(h, ctrl, surface)
		else:
			_air_substep(h, ctrl, surface)
	basis = basis.orthonormalized()
	_gear_prev = gear_down
	_update_outputs(dt)

func _air_substep(h: float, ctrl: Dictionary, surface: Dictionary) -> void:
	var fwd := -basis.z
	var upv := basis.y
	var rgt := basis.x
	var v := vel.length()
	var v_hat := fwd
	var a := 0.0
	var b := 0.0
	if v > 0.5:
		v_hat = vel / v
		var vb := basis.transposed() * vel
		a = atan2(-vb.y, -vb.z)
		b = asin(clampf(vb.x / v, -1.0, 1.0))
	var alt := pos.y
	var rho := air_density_at(alt)
	var q := 0.5 * rho * v * v
	var m := v / speed_of_sound_at(alt)
	var wf := 0.5 * (lift_left + lift_right)
	var cl := lift_coefficient(a)
	var lift := q * _area * cl * wf
	var lift_dir := rgt.cross(v_hat)
	if lift_dir.length_squared() < 1e-6:
		lift_dir = upv
	lift_dir = lift_dir.normalized()
	var side_dir := rgt - v_hat * rgt.dot(v_hat)
	if side_dir.length_squared() > 1e-6:
		side_dir = side_dir.normalized()
	else:
		side_dir = Vector3.ZERO
	var drag := q * _area * drag_coefficient(a, cl, m, b)
	var thr := _compute_thrust(v, alt, rho / RHO0)
	thrust = thr
	var force := lift_dir * lift - side_dir * (q * _area * SIDE_CY * sin(b)) - v_hat * drag + fwd * thr
	var acc := force / _mass + Vector3(0.0, -G, 0.0)
	g_load = force.dot(upv) / (_mass * G)
	# как быстро поворачивается вектор скорости в плоскости тангажа
	var path_p := 0.0
	if v > 1.0:
		path_p = clampf(vel.cross(acc).dot(rgt) / (v * v), -3.0, 3.0)

	var pin := clampf(float(ctrl.get("pitch", 0.0)), -1.0, 1.0)
	var rin := clampf(float(ctrl.get("roll", 0.0)), -1.0, 1.0)
	var yin := clampf(float(ctrl.get("yaw", 0.0)), -1.0, 1.0)
	var eff := clampf(v / _v_ref, 0.12, 1.0)
	var stiff := 1.0
	if _is_prop and v > 0.85 * _vne:
		stiff = 1.0 - clampf((v - 0.85 * _vne) / (0.25 * _vne), 0.0, 0.65)
	cobra_active = _high_aoa and pin > 0.95 and throttle < 0.5
	var stall_s := 0.0
	if a > _a_crit:
		stall_s = clampf((a - _a_crit) / 0.25, 0.0, 1.0)
	elif a < -_a_crit_neg:
		stall_s = clampf((-_a_crit_neg - a) / 0.25, 0.0, 1.0)
	# штопор: развивается на сваливании с ручкой на себя и педалью или креном, гаснет при отдаче
	var pro_spin := not cobra_active and stall_s > 0.2 and pin > 0.3 and (absf(yin) > 0.3 or absf(rin) > 0.5)
	if pro_spin:
		if _spin_dir == 0.0:
			_spin_dir = signf(yin) if absf(yin) > 0.3 else signf(rin)
		spin = minf(1.0, spin + h / SPIN_BUILD)
	elif spin > 0.0:
		var decay := h / SPIN_DECAY
		if yin * _spin_dir < -0.3:
			decay *= 2.0   # обратная педаль
		spin = maxf(0.0, spin - decay)
	if spin <= 0.0:
		_spin_dir = 0.0

	# балансировочный угол атаки
	var qsw := maxf(q * _area * maxf(wf, 0.05), 1.0)
	var cos_g := sqrt(maxf(0.0, 1.0 - v_hat.y * v_hat.y))
	var up_perp := Vector3.UP - v_hat * v_hat.y
	var cphi := 1.0
	if up_perp.length_squared() > 1e-6:
		cphi = lift_dir.dot(up_perp.normalized())
	var n_req: float
	if assist:
		# держит траекторию; в крене до 60° — горизонтальный вираж
		n_req = cos_g * cphi / maxf(cphi * cphi, 0.25)
		# запомненный угол траектории: пока ручка в нуле, возвращаемся к нему
		var gamma := asin(clampf(v_hat.y, -1.0, 1.0))
		if not _gamma_valid or absf(pin) > 0.02 or cobra_active or v < 15.0:
			_gamma_ref = gamma
			_gamma_valid = true
		else:
			_gamma_ref = clampf(_gamma_ref, gamma - 0.26, gamma + 0.26)
		n_req += GAMMA_HOLD * (_gamma_ref - gamma) * v / G * cphi
	else:
		# реализм: как неподвижный триммер — 90 % угла для 1g в горизонте, крен не учитывается
		n_req = TRIM_REALISTIC
	var l_req := n_req * _mass * G - thr * fwd.dot(lift_dir)
	var trim := l_req / qsw / _cl_slope
	var lim_hi := 1e9
	var lim_lo := -1e9
	var trim_hi := 0.85 * _a_crit
	var trim_lo := -0.85 * _a_crit_neg
	if assist:
		lim_hi = 0.9 * _a_crit
		lim_lo = -0.9 * _a_crit_neg
		var g_cap := G_LIMITER * _g_limit * _mass * G / (qsw * _cl_slope)
		lim_hi = minf(lim_hi, g_cap)
		lim_lo = maxf(lim_lo, -0.5 * g_cap)
		trim_hi = lim_hi
		trim_lo = lim_lo
		if cobra_active:
			lim_hi = deg_to_rad(90.0)
	_aoa_limit = lim_hi
	trim = clampf(trim, trim_lo, trim_hi)
	if spin > 0.0:
		trim = lerpf(trim, SPIN_AOA * _a_crit, spin)

	# тангаж
	var k_s := PITCH_STAB * eff * (1.0 - 1.6 * clampf(tumble, 0.0, 1.0))
	var cmd_p := pin * _pitch_max * eff * stiff * pitch_authority
	if cobra_active:
		k_s *= COBRA_STAB
		cmd_p *= COBRA_RATE
	cmd_p *= 1.0 - 0.7 * spin
	var tgt_p := cmd_p - k_s * (a - trim)
	var tum := clampf(tumble, 0.0, 1.0)
	if assist and not cobra_active and v > 15.0 and tum < 0.5:
		# аркада: нос сам поворачивается за траекторией, которую даёт балансировочный угол (вираж без просадки)
		var l_trim := qsw * lift_coefficient(trim) + thr * fwd.dot(lift_dir)
		tgt_p += clampf((l_trim / _mass - G * cos_g * cphi) / v, -1.0, 1.0)
	if not cobra_active and stall_s > 0.0:
		tgt_p -= 0.35 * stall_s * signf(a) * (1.0 - spin)
	if tum > 0.0:
		# без стабилизатора нос задирает и самолёт кувыркается
		tgt_p += 2.5 * tum * maxf(eff, 0.3)
	var tau_p := 0.12 / maxf(eff, 0.35)
	pitch_rate += (tgt_p - pitch_rate) * (1.0 - exp(-h / tau_p))
	if v > 15.0 and tum < 0.5:
		var corr := _pitch_max * maxf(eff, 0.3) * 1.5
		if lim_hi < 1e8:
			pitch_rate = minf(pitch_rate, path_p + maxf(K_LIM * (lim_hi - a), -corr))
		if lim_lo > -1e8:
			pitch_rate = maxf(pitch_rate, path_p + minf(K_LIM * (lim_lo - a), corr))
	pitch_rate = clampf(pitch_rate, -3.5, 3.5)

	# крен: элероны, несимметричная подъёмная сила, авторотация на закритике
	var ail := roll_authority * (0.5 + 0.5 * clampf(minf(lift_left, lift_right), 0.0, 1.0)) * (1.0 - 0.6 * stall_s)
	var cmd_r := rin * _roll_max * eff * stiff * ail
	if spin > 0.0:
		cmd_r = lerpf(cmd_r, _spin_dir * SPIN_RATE, spin)
	var g_r := (1.0 / 0.15) * maxf(eff, 0.25) * (0.35 + 0.65 * clampf(ail, 0.0, 1.0))
	roll_rate += (cmd_r - roll_rate) * (1.0 - exp(-h * g_r))
	var asym := lift_right - lift_left
	var acc_r := -(q * _area * cl * 0.5 * asym) * _arm / _i_roll
	acc_r -= asym * absf(asym) * q * _area * 0.12 * _arm / _i_roll
	acc_r += AUTOROT * stall_s * (1.0 - spin) * tanh((roll_rate + 0.6 * yaw_rate) / 0.5)
	roll_rate = clampf(roll_rate + acc_r * h, -6.0, 6.0)

	# рыскание
	var cmd_y := yin * _yaw_max * eff * yaw_authority
	if spin > 0.0:
		cmd_y = lerpf(cmd_y, _spin_dir * 0.5, spin)
	var k_y := YAW_STAB * eff * (1.0 - 1.6 * clampf(tumble, 0.0, 1.0))
	yaw_rate += (cmd_y + k_y * b - yaw_rate) * (1.0 - exp(-h / 0.25))
	yaw_rate += AUTOROT_YAW * stall_s * (1.0 - spin) * tanh((yaw_rate + 0.3 * roll_rate) / 0.5) * h
	yaw_rate = clampf(yaw_rate, -3.0, 3.0)

	# поворот: крен вокруг вектора скорости (до ~90° угла атаки), так держится и штопор
	var roll_axis := fwd
	if v > 5.0:
		var w_stab := 1.0 - smoothstep(1.6, 1.9, absf(a))
		if w_stab > 0.0:
			roll_axis = fwd.lerp(v_hat, w_stab).normalized()
	var omega := rgt * pitch_rate - upv * yaw_rate + roll_axis * roll_rate
	var ang := omega.length()
	if ang > 1e-9:
		basis = Basis(omega / ang, ang * h) * basis

	vel += acc * h
	pos += vel * h
	_check_contact(surface)

func _check_contact(surface: Dictionary) -> void:
	var s_h: float = float(surface.get("height", 0.0))
	var floor_y := s_h + _gear_h
	if pos.y > floor_y:
		return
	if vel.y > 0.0 and pos.y > floor_y - 0.6:
		pos.y = floor_y   # отрыв или касание на подъёме
		return
	_touchdown(surface)

func _touchdown(surface: Dictionary) -> void:
	var s_h: float = float(surface.get("height", 0.0))
	var kind: String = String(surface.get("kind", "ground"))
	var flat: bool = bool(surface.get("flat", true))
	var p := pitch_angle()
	var ok := gear_down and vel.y > -6.0 and absf(bank()) < deg_to_rad(15.0)
	ok = ok and p > deg_to_rad(-5.0) and p < deg_to_rad(20.0)
	ok = ok and flat and (kind == "runway" or kind == "deck" or kind == "ground")
	if not ok:
		var reason := "ground"
		if kind == "water":
			reason = "water"
		elif gear_down:
			reason = "gear"
		pos.y = maxf(pos.y, s_h)
		_crash(reason)
		return
	on_ground = true
	_gamma_valid = false
	spin = 0.0
	_spin_dir = 0.0
	var hd := heading()
	_ground_pitch = clampf(p, deg_to_rad(GROUND_PITCH_MIN), deg_to_rad(GROUND_PITCH_MAX))
	basis = _ground_basis(hd, _ground_pitch)
	var fwd_h := _flat_forward(hd)
	vel = fwd_h * maxf(vel.dot(fwd_h), 0.0)
	pos.y = s_h + _gear_h
	pitch_rate = 0.0
	roll_rate = 0.0
	yaw_rate = 0.0

func _crash(reason: String) -> void:
	crashed = true
	crash_reason = reason
	on_ground = false
	vel = Vector3.ZERO
	pitch_rate = 0.0
	roll_rate = 0.0
	yaw_rate = 0.0
	thrust = 0.0
	spin = 0.0

func _ground_substep(h: float, ctrl: Dictionary, surface: Dictionary) -> void:
	var s_h: float = float(surface.get("height", 0.0))
	var kind: String = String(surface.get("kind", "ground"))
	var flat: bool = bool(surface.get("flat", true))
	gear_down = true   # на земле шасси не убирается
	var hd := heading()
	var fwd_h := _flat_forward(hd)
	var u := maxf(vel.dot(fwd_h), 0.0)
	if pos.y - _gear_h > s_h + 0.5:
		# поверхность ушла вниз: край палубы или обрыв
		on_ground = false
		return
	if kind == "water":
		_crash("water")
		return
	if not flat and u > 15.0:
		_crash("gear")
		return
	var gp := _ground_pitch
	var alt := pos.y
	var rho := air_density_at(alt)
	var q := 0.5 * rho * u * u
	var a := gp if u > 1.0 else 0.0
	var cl := lift_coefficient(a)
	var lift := q * _area * cl * 0.5 * (lift_left + lift_right)
	var thr := _compute_thrust(u, alt, rho / RHO0)
	thrust = thr
	var weight := _mass * G
	var up_force := lift + thr * sin(gp)
	if up_force > weight and u > 5.0:
		# отрыв
		_gamma_valid = false
		on_ground = false
		vel = fwd_h * u + Vector3(0.0, 0.5, 0.0)
		pos.y = s_h + _gear_h + 0.05
		return
	var normal := weight - up_force
	var drag := q * _area * drag_coefficient(a, cl, u / speed_of_sound_at(alt), 0.0)
	var acc_u := (thr * cos(gp) - drag) / _mass
	var resist := ROLL_FRICTION * normal
	if brake:
		resist += BRAKE_DECEL * _mass * clampf(normal / weight, 0.25, 1.0)
	var net := acc_u - resist / _mass
	if u > 0.05 or net > 0.0:
		u = maxf(u + net * h, 0.0)
	else:
		u = 0.0   # трение покоя
	# руление рысканием: колесо на малой скорости, руль направления на большой
	var yin := clampf(float(ctrl.get("yaw", 0.0)), -1.0, 1.0)
	var steer := yin * 0.6 * clampf(u / 4.0, 0.0, 1.0) * clampf(20.0 / maxf(u, 1.0), 0.15, 1.0)
	steer += yin * _yaw_max * clampf(u / _v_ref, 0.0, 1.0) * yaw_authority * 0.5
	hd += steer * h
	# тангаж: рули высоты против веса на колёсах
	var pin := clampf(float(ctrl.get("pitch", 0.0)), -1.0, 1.0)
	var eff := clampf(u / _v_ref, 0.0, 1.0)
	var lift_frac := clampf(up_force / weight, 0.0, 1.0)
	var rate := pin * _pitch_max * eff * pitch_authority - gp * 2.5 * (1.0 - lift_frac)
	var gp_new := clampf(gp + rate * h, deg_to_rad(GROUND_PITCH_MIN), deg_to_rad(GROUND_PITCH_MAX))
	pitch_rate = (gp_new - gp) / h
	roll_rate = 0.0
	yaw_rate = steer
	_ground_pitch = gp_new
	basis = _ground_basis(hd, gp_new)
	fwd_h = _flat_forward(hd)
	vel = fwd_h * u
	pos += vel * h
	pos.y = s_h + _gear_h
	g_load = 1.0

func _ground_basis(hd: float, gp: float) -> Basis:
	return Basis(Vector3.UP, -hd) * Basis(Vector3.RIGHT, gp)

func _flat_forward(hd: float) -> Vector3:
	return Vector3(sin(hd), 0.0, -cos(hd))

func _update_outputs(dt: float) -> void:
	airspeed = vel.length()
	vertical_speed = vel.y
	mach = airspeed / speed_of_sound_at(pos.y)
	overspeed = airspeed > _vne
	if crashed:
		stalled = false
		structural_stress = 0.0
		engine_rpm = 0.0
		return
	if on_ground:
		aoa = _ground_pitch if airspeed > 1.0 else 0.0
		slip = 0.0
		g_load = 1.0
		stalled = false
	else:
		if airspeed > 0.5:
			var vb := basis.transposed() * vel
			aoa = atan2(-vb.y, -vb.z)
			slip = asin(clampf(vb.x / airspeed, -1.0, 1.0))
		var ac := _a_crit if aoa >= 0.0 else _a_crit_neg
		var vs := stall_speed() * sqrt(RHO0 / air_density_at(pos.y))
		stalled = absf(aoa) > ac or airspeed < 0.9 * vs
	var s1 := 0.0
	if g_load > _g_limit:
		s1 = (g_load - _g_limit) / (0.2 * _g_limit)
	elif g_load < -0.5 * _g_limit:
		s1 = (-0.5 * _g_limit - g_load) / (0.1 * _g_limit)
	var s2 := 0.0
	if airspeed > 1.08 * _vne:
		s2 = (airspeed - 1.08 * _vne) / (0.1 * _vne)
	structural_stress = s1 + s2
	if dt > 0.0:
		var tau := 0.5 if _is_prop else 1.2
		engine_rpm += (_rpm_target() - engine_rpm) * (1.0 - exp(-dt / tau))
		engine_rpm = clampf(engine_rpm, 0.0, 1.0)

func _rpm_target() -> float:
	if thrust_factor <= 0.0:
		return clampf(airspeed / 200.0, 0.0, 0.25) if _is_prop else 0.0
	if _is_prop:
		return minf(0.2 + 0.8 * throttle + (0.08 if afterburner else 0.0), 1.0)
	return 1.0 if afterburner else 0.25 + 0.7 * throttle

# ---------------------------------------------------------------- геттеры

func forward() -> Vector3:
	return -basis.z

func up() -> Vector3:
	return basis.y

func right() -> Vector3:
	return basis.x

## Крен, рад: + вправо (правое крыло вниз), ±PI — вверх ногами.
func bank() -> float:
	return atan2(-basis.x.y, basis.y.y)

## Угол носа к горизонту, рад.
func pitch_angle() -> float:
	return asin(clampf(-basis.z.y, -1.0, 1.0))

## Курс, рад: 0 = на -Z, по часовой стрелке (вид сверху), 0..TAU.
func heading() -> float:
	var f := -basis.z
	if absf(f.x) + absf(f.z) < 1e-5:
		# нос строго вверх или вниз: курс по «спине»
		f = basis.y * (-1.0 if f.y > 0.0 else 1.0)
	return fposmod(atan2(f.x, -f.z), TAU)

## Скорость сваливания при 1g у земли, м/с.
func stall_speed() -> float:
	return sqrt(2.0 * _mass * G / (RHO0 * _area * maxf(_cl_peak, 0.1)))

## Плотность воздуха на текущей высоте.
func air_density() -> float:
	return air_density_at(pos.y)

## Какую перегрузку крыло может дать на текущей скорости (по cl_max).
func available_g() -> float:
	var q := 0.5 * air_density_at(pos.y) * airspeed * airspeed
	return q * _area * _cl_peak * 0.5 * (lift_left + lift_right) / (_mass * G)

## Текущий предел угла атаки в аркаде (рад); без ассиста — очень большое число.
func aoa_limit() -> float:
	return _aoa_limit if assist else 1e9

func critical_aoa() -> float:
	return _a_crit

func mass() -> float:
	return _mass
