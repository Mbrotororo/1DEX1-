extends RefCounted
## Наведение носа на заданное мировое направление: крен в плоскость симметрии, тангаж, немного рыскания.
## Общий код для мыши/тача игрока и для ботов. Рули в FlightModel задают угловую скорость,
## поэтому регулятор — P по углу с ограничением скорости (без интегратора, без раскачки).

const K_ROLL := 4.0           # 1/с: желаемая скорость крена на радиан ошибки
const K_PITCH := 2.6          # 1/с
const K_YAW := 1.6            # 1/с
const D_ROLL := 0.10          # демпфирование по измеренной скорости крена
const D_PITCH := 0.06
const PUSH_ANGLE := 0.21      # рад (~12°): цель ниже носа ближе этого — отдаём ручку, а не переворачиваемся
const LEVEL_FROM := 0.026     # рад (~1.5°): ближе к носу — крылья в горизонт
const LEVEL_TO := 0.17        # рад (~10°): дальше — крен на цель


## Угловые скорости в связанных осях по двум последовательным базисам.
## Возвращает Vector3(тангаж, рыскание, крен), рад/с; знаки как у рулей (+ нос вверх, + вправо, + крен вправо).
static func body_rates(prev: Basis, cur: Basis, dt: float) -> Vector3:
	if dt <= 0.0:
		return Vector3.ZERO
	var d: Basis = (cur * prev.transposed()).orthonormalized()
	var q := d.get_rotation_quaternion()
	var ang := q.get_angle()
	if ang < 1e-7:
		return Vector3.ZERO
	if ang > PI:
		ang -= TAU
	var w: Vector3 = q.get_axis() * (ang / dt)
	return Vector3(w.dot(cur.x), -w.dot(cur.y), w.dot(-cur.z))


## Сферическая интерполяция направлений без ошибки «axis must be normalized»:
## у почти параллельных векторов Vector3.slerp теряет точность оси вращения.
static func slerp_dir(a: Vector3, b: Vector3, t: float) -> Vector3:
	var an := a.normalized()
	var bn := b.normalized()
	var c := an.dot(bn)
	if c > 0.9995 or c < -0.9995:
		var l := an.lerp(bn, t)
		return l.normalized() if l.length_squared() > 1e-10 else bn
	return an.slerp(bn, t).normalized()


## Крен (рад, + вправо) по базису.
static func bank_of(b: Basis) -> float:
	return atan2(-b.x.y, b.y.y)


## Основная функция. aim — мировое направление (нормализуется). rates — из body_rates.
## max_pull — ограничение |pitch| (0..1), чтобы не тянуть больше нужного.
## Возвращает {pitch, roll, yaw, off} (off — угол между носом и целью, рад).
## max_bank — предел крена (рад) для целей не ниже -20° к горизонту: при ограниченной перегрузке
## глубокий крен только роняет нос.
## aim_rate — угловая скорость направления прицела в мире (рад/с): упреждение по вращению линии визирования,
## без него регулятор отстаёт от поворачивающей цели на rate / K.
static func steer(b: Basis, aim: Vector3, rates: Vector3, def: Dictionary, speed: float, max_pull: float = 1.0, max_bank: float = PI, aim_rate: Vector3 = Vector3.ZERO) -> Dictionary:
	var out := {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "off": 0.0}
	if aim.length_squared() < 1e-8:
		return out
	aim = aim.normalized()
	var l: Vector3 = b.transposed() * aim
	var lx := l.x
	var ly := l.y
	var lz := -l.z
	var lat := Vector2(lx, ly).length()
	var off := atan2(lat, lz)
	out.off = off

	var v_ref := maxf(float(def.get("v_ref", 100.0)), 10.0)
	var eff := clampf(speed / v_ref, 0.12, 1.0)
	var roll_max := deg_to_rad(float(def.get("max_roll_rate_deg", 120.0))) * eff
	var pitch_max := deg_to_rad(float(def.get("max_pitch_rate_deg", 35.0))) * eff
	var yaw_max := deg_to_rad(float(def.get("max_yaw_rate_deg", 12.0))) * eff

	# --- крен
	# отдаём ручку, только если цель в основном под носом (а не сбоку)
	var push := ly < 0.0 and lz > 0.0 and off < PUSH_ANGLE and absf(lx) < -ly * 1.2
	var roll_to_aim := 0.0
	if lat > 1e-4:
		if push:
			roll_to_aim = atan2(-lx, -ly)   # цель прямо под носом
		else:
			roll_to_aim = atan2(lx, ly)     # цель над головой
	var level := -bank_of(b)   # крен до горизонта, кратчайший путь
	var w := smoothstep(LEVEL_FROM, LEVEL_TO, off)
	var roll_err := lerpf(level * 0.7, roll_to_aim, w)
	# предел крена — только если цель не ниже носа (иначе нос не опустить)
	if max_bank < PI and aim.y > -0.35 and aim.y > -b.z.y - 0.15:
		var bank := bank_of(b)
		var want := wrapf(bank + roll_err, -PI, PI)
		roll_err = wrapf(clampf(want, -max_bank, max_bank) - bank, -PI, PI)
	var roll_rate_des := clampf(K_ROLL * roll_err, -roll_max, roll_max)
	var roll := (roll_rate_des + D_ROLL * (roll_rate_des - rates.z)) / maxf(roll_max, 0.05)

	# --- тангаж: угол цели над носом в плоскости симметрии
	var pe := atan2(ly, lz)
	if lz < 0.0:
		pe = PI * 0.5 if ly >= -0.15 * lat else 0.0
	elif not push:
		pe = maxf(pe, -0.04)
	# пока крен не довёрнут, тянем меньше (иначе нос уходит в сторону)
	var align := 1.0 if push else clampf(cos(roll_to_aim), 0.0, 1.0)
	if w > 0.0 and lz > 0.0:
		pe *= lerpf(1.0, 0.35 + 0.65 * align, w)
	var ff_pitch := 0.0
	var ff_yaw := 0.0
	if aim_rate != Vector3.ZERO and off < 0.5:
		var fw := 1.0 - smoothstep(0.25, 0.5, off)   # только когда цель почти на носу
		ff_pitch = aim_rate.dot(b.x) * fw
		ff_yaw = -aim_rate.dot(b.y) * fw
	var pitch_rate_des := clampf(K_PITCH * pe + ff_pitch, -pitch_max, pitch_max)
	var pitch := (pitch_rate_des + D_PITCH * (pitch_rate_des - rates.x)) / maxf(pitch_max, 0.05)

	# --- рыскание: мелкая доводка около носа
	var ye := atan2(lx, maxf(lz, 0.05))
	var yaw_rate_des := clampf(K_YAW * ye + ff_yaw, -yaw_max, yaw_max)
	var yaw := yaw_rate_des / maxf(yaw_max, 0.02) * (1.0 - w)

	out.pitch = clampf(pitch, -maxf(max_pull, 0.0), maxf(max_pull, 0.0))
	out.roll = clampf(roll, -1.0, 1.0)
	out.yaw = clampf(yaw, -1.0, 1.0)
	return out
