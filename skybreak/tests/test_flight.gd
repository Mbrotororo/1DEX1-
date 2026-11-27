extends RefCounted
## Тесты модели полёта и повреждений на реальных данных из Data.

const DT := 1.0 / 60.0
const FLAT := {"height": 0.0, "kind": "ground", "team": -1, "flat": true}
const WATER := {"height": 0.0, "kind": "water", "team": -1, "flat": true}

var errors: Array = []

func run(_tree: SceneTree) -> Array:
	errors = []
	_test_basics()
	_test_level_hold()
	_test_dive()
	_test_full_pull()
	_test_low_speed_stall()
	_test_top_speed()
	_test_cobra()
	_test_wing_lost()
	_test_takeoff()
	_test_landing()
	_test_crash()
	_test_spin()
	_test_g_limiter()
	_test_trim_feel()
	_test_tail_lost()
	_test_ground_misc()
	_test_runway_takeoff_all()
	_test_top_speed_all()
	_test_catapult_all()
	_test_arrest()
	_test_determinism()
	_test_damage()
	return errors

func _fail(msg: String) -> void:
	errors.append(msg)

func _mk(id: String, alt: float, speed: float, assist: bool, pitch_deg := 0.0, ground := false) -> FlightModel:
	var fm := FlightModel.new()
	var b := Basis(Vector3.RIGHT, deg_to_rad(pitch_deg))
	fm.setup(Data.plane(id), Vector3(0.0, alt, 0.0), b, speed, ground)
	fm.assist = assist
	return fm

func _ctrl(pitch := 0.0, roll := 0.0, yaw := 0.0, thr := 0.8, ab := false) -> Dictionary:
	var c: Dictionary = Data.empty_controls()
	c.pitch = pitch
	c.roll = roll
	c.yaw = yaw
	c.throttle = thr
	c.afterburner = ab
	return c

func _kmh(v: float) -> float:
	return v * 3.6

# ---------------------------------------------------------------- 0. соглашения

func _test_basics() -> void:
	var fm := _mk("strizh", 1000.0, 120.0, true)
	var vs := fm.stall_speed()
	if vs < 35.0 or vs > 55.0:
		_fail("stall_speed Стрижа вне 35..55 м/с: %.1f" % vs)
	if absf(fm.heading()) > 0.001 or absf(fm.bank()) > 0.001:
		_fail("стартовый курс/крен не 0: %.3f / %.3f" % [fm.heading(), fm.bank()])
	# крен вправо → bank > 0, нос вправо → курс растёт
	for i in 30:
		fm.step(DT, _ctrl(0.0, 1.0, 0.0), FLAT)
	if fm.bank() <= 0.2:
		_fail("roll > 0 не даёт крен вправо: bank=%.2f" % fm.bank())
	fm = _mk("strizh", 1000.0, 120.0, true)
	for i in 120:
		fm.step(DT, _ctrl(0.0, 0.0, 1.0), FLAT)
	var hd := fm.heading()
	if hd < 0.02 or hd > PI:
		_fail("yaw > 0 не поворачивает нос вправо: heading=%.3f" % hd)
	fm = _mk("strizh", 1000.0, 120.0, true)
	var p0 := fm.pitch_angle()
	for i in 30:
		fm.step(DT, _ctrl(0.6), FLAT)
	if fm.pitch_angle() <= p0 + 0.05:
		_fail("pitch > 0 не поднимает нос: %.3f -> %.3f" % [p0, fm.pitch_angle()])

# ---------------------------------------------------------------- 1. горизонт с ассистом

func _test_level_hold() -> void:
	var fm := _mk("strizh", 1000.0, 120.0, true)
	var any_stall := false
	var max_dev := 0.0
	for i in 30 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 0.8), FLAT)
		any_stall = any_stall or fm.stalled
		max_dev = maxf(max_dev, absf(fm.pos.y - 1000.0))
	if max_dev >= 150.0 or any_stall or fm.crashed:
		_fail("1. горизонт: отклонение высоты %.1f м (нужно < 150), сваливание=%s, скорость %.1f м/с, aoa %.1f°" %
			[max_dev, any_stall, fm.airspeed, rad_to_deg(fm.aoa)])

# ---------------------------------------------------------------- 2. пикирование

func _test_dive() -> void:
	var fm := _mk("strizh", 1500.0, 100.0, true, -45.0)
	for i in 6 * 60:
		fm.step(DT, _ctrl(), FLAT)
	var gain := fm.airspeed - 100.0
	if gain <= 30.0 or fm.crashed:
		_fail("2. пикирование 45°: прирост скорости %.1f м/с (нужно > 30), угол траектории %.1f°" %
			[gain, rad_to_deg(asin(clampf(fm.vel.normalized().y, -1.0, 1.0)))])

# ---------------------------------------------------------------- 3. полное взятие ручки без ассиста

func _test_full_pull() -> void:
	var d := Data.plane("strizh")
	var fm := _mk("strizh", 2000.0, 150.0, false)
	var peak_g := -100.0
	var min_v := 1000.0
	for i in 8 * 60:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 1.0), FLAT)
		peak_g = maxf(peak_g, fm.g_load)
		min_v = minf(min_v, fm.airspeed)
	var drop := 1.0 - min_v / 150.0
	if drop <= 0.25:
		_fail("3. вираж: потеря скорости %.0f %% (нужно > 25 %%), мин. скорость %.1f" % [drop * 100.0, min_v])
	if peak_g < 4.0 or peak_g > float(d.g_limit) + 1.0:
		_fail("3. вираж: пиковая перегрузка %.2f (нужно 4..%.1f)" % [peak_g, float(d.g_limit) + 1.0])

# ---------------------------------------------------------------- 4. малая скорость

func _test_low_speed_stall() -> void:
	var probe := _mk("strizh", 1000.0, 100.0, false)
	var v0 := 0.75 * probe.stall_speed()
	var fm := _mk("strizh", 1000.0, v0, false)
	var stall_t := -1.0
	for i in 3 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 0.8), FLAT)
		if fm.stalled and stall_t < 0.0:
			stall_t = (i + 1) * DT
	if stall_t < 0.0 or stall_t > 2.0:
		_fail("4. малая скорость %.1f м/с: сваливание через %.2f с (нужно ≤ 2)" % [v0, stall_t])
	if fm.pos.y >= 1000.0 - 1.0:
		_fail("4. малая скорость: не теряет высоту, высота %.1f" % fm.pos.y)

# ---------------------------------------------------------------- 5. максимальная скорость

func _test_top_speed() -> void:
	var fm := _mk("strizh", 500.0, 120.0, true)
	for i in 120 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 1.0), FLAT)
	var kmh := _kmh(fm.airspeed)
	if kmh < 470.0 or kmh > 570.0:
		_fail("5. Стриж: максимальная скорость %.0f км/ч (нужно 470..570), высота %.0f" % [kmh, fm.pos.y])
	fm = _mk("flanker", 1000.0, 220.0, true)
	for i in 120 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 1.0, true), FLAT)
	kmh = _kmh(fm.airspeed)
	if kmh < 1150.0 or kmh > 1600.0:
		_fail("5. Фланкер с форсажем: %.0f км/ч (нужно 1150..1600), M%.2f, высота %.0f" % [kmh, fm.mach, fm.pos.y])

# ---------------------------------------------------------------- 6. кобра

func _test_cobra() -> void:
	var fm := _mk("flanker", 1500.0, 140.0, true)
	var max_aoa := 0.0
	var min_v := 1000.0
	for i in 90:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 0.3), FLAT)
		max_aoa = maxf(max_aoa, fm.aoa)
		min_v = minf(min_v, fm.airspeed)
	var v_end := fm.airspeed
	var back_t := -1.0
	for i in 5 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 1.0), FLAT)
		min_v = minf(min_v, fm.airspeed)
		if back_t < 0.0 and fm.aoa < deg_to_rad(20.0):
			back_t = (i + 1) * DT
	var loss := 1.0 - min_v / 140.0
	if max_aoa <= deg_to_rad(60.0):
		_fail("6. кобра: макс. угол атаки %.1f° (нужно > 60)" % rad_to_deg(max_aoa))
	if loss <= 0.25:
		_fail("6. кобра: потеря скорости %.0f %% (нужно > 25 %%), в конце рывка %.1f м/с, мин. %.1f" %
			[loss * 100.0, v_end, min_v])
	if back_t < 0.0:
		_fail("6. кобра: не вернулся к углу атаки < 20° за 5 с, aoa %.1f°" % rad_to_deg(fm.aoa))
	if fm.crashed:
		_fail("6. кобра: разбился")
	# Сокол не умеет: ограничитель держит угол
	var crit := deg_to_rad(float(Data.plane("sokol").alpha_crit_deg))
	fm = _mk("sokol", 1500.0, 140.0, true)
	max_aoa = 0.0
	for i in 90:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 0.3), FLAT)
		max_aoa = maxf(max_aoa, fm.aoa)
	for i in 3 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 1.0), FLAT)
		max_aoa = maxf(max_aoa, fm.aoa)
	if max_aoa > crit:
		_fail("6. Сокол с ассистом: угол атаки %.1f° выше критического %.1f°" % [rad_to_deg(max_aoa), rad_to_deg(crit)])
	# на малой скорости держит именно ограничитель угла атаки
	fm = _mk("strizh", 1000.0, 70.0, true)
	max_aoa = 0.0
	for i in 10 * 60:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 0.6), FLAT)
		max_aoa = maxf(max_aoa, fm.aoa)
	crit = deg_to_rad(float(Data.plane("strizh").alpha_crit_deg))
	if max_aoa > crit:
		_fail("ассист: Стриж на малой скорости с ручкой на себя, угол атаки %.1f° > %.1f°" % [rad_to_deg(max_aoa), rad_to_deg(crit)])

# ---------------------------------------------------------------- 7. потеря крыла

func _test_wing_lost() -> void:
	var fm := _mk("krechet", 1500.0, 150.0, true)
	fm.lift_left = 0.0
	var max_bank := 0.0
	for i in 3 * 60:
		fm.step(DT, _ctrl(), FLAT)
		max_bank = maxf(max_bank, absf(fm.bank()))
	if max_bank <= deg_to_rad(90.0):
		_fail("7. без левого крыла: макс. крен %.1f° за 3 с (нужно > 90)" % rad_to_deg(max_bank))

# ---------------------------------------------------------------- 8. взлёт

func _test_takeoff() -> void:
	var fm := FlightModel.new()
	fm.setup(Data.plane("krechet"), Vector3(0.0, 1.5, 0.0), Basis.IDENTITY, 0.0, true)
	fm.assist = true
	if not fm.gear_down or not fm.on_ground:
		_fail("8. взлёт: старт на земле без шасси или не на земле")
	var vs := fm.stall_speed()
	var t_air := -1.0
	var done := false
	for i in 40 * 60:
		var p := 0.0
		if fm.on_ground and fm.airspeed > 1.2 * vs:
			p = 0.6
		elif not fm.on_ground:
			p = 0.1
		fm.step(DT, _ctrl(p, 0.0, 0.0, 1.0), FLAT)
		if fm.crashed:
			break
		if not fm.on_ground and t_air < 0.0:
			t_air = (i + 1) * DT
		if not fm.on_ground and fm.pos.y > 20.0:
			done = true
			break
	if not done or fm.crashed:
		_fail("8. взлёт: не взлетел за 40 с (в воздухе с %.1f с, высота %.1f, скорость %.1f, разбился=%s %s)" %
			[t_air, fm.pos.y, fm.airspeed, fm.crashed, fm.crash_reason])

# ---------------------------------------------------------------- 9. посадка

func _test_landing() -> void:
	var probe := _mk("krechet", 0.0, 100.0, true)
	var v0 := 1.3 * probe.stall_speed()
	var fm := _mk("krechet", 30.0, v0, true)
	fm.gear_down = true
	var landed_t := -1.0
	var stop_t := -1.0
	var touch_vs := 0.0
	for i in 60 * 60:
		var c := _ctrl(0.0, 0.0, 0.0, 0.3)
		if fm.on_ground:
			c.throttle = 0.0
			c.brake = true
		else:
			# плавное снижение около -2 м/с
			c.pitch = clampf((-2.0 - fm.vertical_speed) * 0.12, -0.3, 0.3)
		var was_air := not fm.on_ground
		var vs_before := fm.vertical_speed
		fm.step(DT, c, FLAT)
		if fm.crashed:
			break
		if was_air and fm.on_ground and landed_t < 0.0:
			landed_t = (i + 1) * DT
			touch_vs = vs_before
		if fm.on_ground and fm.airspeed < 5.0 and stop_t < 0.0:
			stop_t = (i + 1) * DT
			break
	if fm.crashed:
		_fail("9. посадка: разбился (%s), вертикальная %.1f м/с" % [fm.crash_reason, fm.vertical_speed])
	elif landed_t < 0.0:
		_fail("9. посадка: не сел, высота %.1f, скорость %.1f" % [fm.pos.y, fm.airspeed])
	elif stop_t < 0.0 or stop_t - landed_t > 40.0:
		_fail("9. посадка: не затормозил до 5 м/с за 40 с, скорость %.1f" % fm.airspeed)
	if touch_vs < -6.0:
		_fail("9. посадка: касание %.1f м/с" % touch_vs)

# ---------------------------------------------------------------- 10. удар о землю и воду

func _test_crash() -> void:
	for surf in [FLAT, WATER]:
		var fm := _mk("strizh", 40.0, 100.0, true)
		fm.vel = Vector3(0.0, -25.0, -60.0)
		for i in 5 * 60:
			fm.step(DT, _ctrl(), surf)
			if fm.crashed:
				break
		var want := "water" if surf.kind == "water" else "ground"
		if not fm.crashed or fm.crash_reason != want:
			_fail("10. удар (%s): crashed=%s reason=%s" % [surf.kind, fm.crashed, fm.crash_reason])
	# жёсткая посадка с шасси
	var fm2 := _mk("strizh", 6.0, 60.0, false)
	fm2.gear_down = true
	fm2.vel = Vector3(0.0, -14.0, -55.0)
	for i in 3 * 60:
		fm2.step(DT, _ctrl(), FLAT)
		if fm2.crashed:
			break
	if fm2.crash_reason != "gear":
		_fail("10. жёсткая посадка: reason=%s (нужно gear)" % fm2.crash_reason)

# ---------------------------------------------------------------- штопор (реализм)

func _test_spin() -> void:
	var fm := _mk("strizh", 2500.0, 60.0, false)
	var max_rr := 0.0
	var alt0 := fm.pos.y
	for i in 6 * 60:
		fm.step(DT, _ctrl(1.0, 0.0, 1.0, 0.3), FLAT)
		max_rr = maxf(max_rr, absf(fm.roll_rate))
	if max_rr < deg_to_rad(60.0):
		_fail("штопор: при сваливании с педалью скорость вращения %.0f°/с (ожидалось > 60)" % rad_to_deg(max_rr))
	if fm.pos.y > alt0 - 50.0:
		_fail("штопор: не теряет высоту (%.0f -> %.0f)" % [alt0, fm.pos.y])
	# вывод: ручка от себя, педали нейтрально
	var rec := false
	for i in 12 * 60:
		fm.step(DT, _ctrl(-0.5, 0.0, 0.0, 0.8), FLAT)
		if absf(fm.roll_rate) < deg_to_rad(20.0) and not fm.stalled:
			rec = true
			break
	if not rec:
		_fail("штопор: не выходит после отдачи ручки, крен %.0f°/с, aoa %.1f°" % [rad_to_deg(fm.roll_rate), rad_to_deg(fm.aoa)])

# ---------------------------------------------------------------- ограничитель перегрузки

func _test_g_limiter() -> void:
	var d := Data.plane("sokol")
	var fm := _mk("sokol", 1000.0, 270.0, true)
	var peak := 0.0
	var stress := 0.0
	for i in 4 * 60:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 1.0), FLAT)
		peak = maxf(peak, fm.g_load)
		stress = maxf(stress, fm.structural_stress)
	if peak > float(d.g_limit) + 0.2 or stress > 0.0:
		_fail("ассист: перегрузка %.2f при пределе %.1f (stress %.2f)" % [peak, float(d.g_limit), stress])
	fm = _mk("sokol", 1000.0, 270.0, false)
	stress = 0.0
	peak = 0.0
	for i in 4 * 60:
		fm.step(DT, _ctrl(1.0, 0.0, 0.0, 1.0), FLAT)
		stress = maxf(stress, fm.structural_stress)
		peak = maxf(peak, fm.g_load)
	if stress <= 0.0:
		_fail("реализм: Сокол на 270 м/с, полное взятие ручки: перегрузка %.2f не выше предела" % peak)

func _test_trim_feel() -> void:
	# аркада: накренил на ~25° и отпустил — вираж без просадки
	var fm := _mk("strizh", 1000.0, 120.0, true)
	for i in 600:
		fm.step(DT, _ctrl(0.0, 0.5 if i < 20 else 0.0), FLAT)
	if absf(fm.pos.y - 1000.0) > 30.0 or absf(fm.bank()) < deg_to_rad(10.0):
		_fail("ассист: вираж без ручки, высота %.0f, крен %.0f°" % [fm.pos.y, rad_to_deg(fm.bank())])
	# перевёрнутый полёт держится
	fm = _mk("krechet", 1500.0, 150.0, true)
	for i in 600:
		var r := 1.0 if i < 120 and fm.bank() < PI * 0.9 and fm.bank() > -0.1 else 0.0
		fm.step(DT, _ctrl(0.0, r), FLAT)
	if absf(fm.pos.y - 1500.0) > 40.0 or absf(fm.bank()) < deg_to_rad(150.0):
		_fail("ассист: перевёрнутый полёт, высота %.0f, крен %.0f°" % [fm.pos.y, rad_to_deg(fm.bank())])
	# реализм: отпустил ручку — медленно снижается
	fm = _mk("strizh", 1000.0, 120.0, false)
	for i in 20 * 60:
		fm.step(DT, _ctrl(), FLAT)
	var lost := 1000.0 - fm.pos.y
	if lost < 5.0 or lost > 200.0:
		_fail("реализм: без ручки за 20 с потеря высоты %.0f м (ожидалось 5..200)" % lost)

func _test_tail_lost() -> void:
	var fm := _mk("sokol", 2000.0, 200.0, true)
	fm.tumble = 1.0
	fm.pitch_authority = 0.0
	fm.yaw_authority = 0.0
	var max_pr := 0.0
	for i in 2 * 60:
		fm.step(DT, _ctrl(), FLAT)
		max_pr = maxf(max_pr, absf(fm.pitch_rate))
	if max_pr < deg_to_rad(60.0):
		_fail("без хвоста: самолёт не кувыркается, макс. тангаж %.0f°/с" % rad_to_deg(max_pr))

func _test_ground_misc() -> void:
	# руление в воду
	var fm := FlightModel.new()
	fm.setup(Data.plane("strizh"), Vector3(0.0, 1.4, 0.0), Basis.IDENTITY, 15.0, true)
	for i in 600:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 0.3), FLAT if fm.pos.z > -60.0 else WATER)
		if fm.crashed:
			break
	if fm.crash_reason != "water":
		_fail("руление в воду: crashed=%s reason=%s" % [fm.crashed, fm.crash_reason])
	# поворот на рулении
	fm = FlightModel.new()
	fm.setup(Data.plane("strizh"), Vector3(0.0, 1.4, 0.0), Basis.IDENTITY, 10.0, true)
	for i in 120:
		fm.step(DT, _ctrl(0.0, 0.0, 1.0, 0.2), FLAT)
	if fm.heading() < deg_to_rad(20.0) or fm.heading() > PI or not fm.on_ground:
		_fail("руление: курс %.0f° после 2 с педали вправо" % rad_to_deg(fm.heading()))
	# сход с палубы: не разбивается о палубу, летит дальше
	var deck := {"height": 18.0, "kind": "deck", "team": 0, "flat": true}
	fm = FlightModel.new()
	fm.setup(Data.plane("krechet"), Vector3(0.0, 19.5, 0.0), Basis.IDENTITY, 0.0, true)
	var left_deck := false
	for i in 30 * 60:
		var s: Dictionary = deck if fm.pos.z > -420.0 else WATER
		var p := 0.0
		if not fm.on_ground:
			p = clampf((2.0 - fm.vertical_speed) * 0.1, -0.5, 0.5)
		fm.step(DT, _ctrl(p, 0.0, 0.0, 1.0, true), s)
		if fm.crashed:
			break
		left_deck = left_deck or not fm.on_ground
	if fm.crashed or not left_deck or fm.pos.y < 18.0:
		_fail("палуба: crashed=%s (%s), высота %.0f" % [fm.crashed, fm.crash_reason, fm.pos.y])
	# шасси: переключает сам, но не второй раз, если владелец уже переключил
	fm = _mk("strizh", 1000.0, 120.0, true)
	var c := _ctrl()
	c.gear_toggle = true
	fm.step(DT, c, FLAT)
	var g1 := fm.gear_down
	fm.gear_down = false
	fm.step(DT, c, FLAT)
	if not g1 or fm.gear_down:
		_fail("шасси: переключение %s, после внешнего %s" % [g1, fm.gear_down])

# ---------------------------------------------------------------- разбег всех самолётов

## Полоса 1400 м: полный газ (у реактивных форсаж), ручка нейтрально, с 1.1 скорости сваливания — на себя.
func _test_runway_takeoff_all() -> void:
	var runway := {"height": 0.0, "kind": "runway", "team": 0, "flat": true}
	print("  разбег по полосе (газ 100 %, форсаж у реактивных, ручка на себя с 1.1 Vs):")
	print("    %-12s %8s %8s %8s %8s" % ["самолёт", "Vs, м/с", "отрыв, м", "время, с", "V, км/ч"])
	for id in Data.ORDER:
		var d := Data.plane(id)
		var jet := String(d.kind) == "jet"
		var fm := FlightModel.new()
		fm.setup(d, Vector3(0.0, float(d.shape.gear_height), 0.0), Basis.IDENTITY, 0.0, true)
		fm.assist = true
		var vs := fm.stall_speed()
		var t_lo := -1.0
		var x_lo := -1.0
		var v_lo := 0.0
		for i in 60 * 60:
			var p := 1.0 if fm.airspeed > 1.1 * vs else 0.0
			fm.step(DT, _ctrl(p, 0.0, 0.0, 1.0, jet), runway)
			if fm.crashed or -fm.pos.z > 1400.0:
				break
			if not fm.on_ground:
				t_lo = (i + 1) * DT
				x_lo = -fm.pos.z
				v_lo = fm.airspeed
				break
		print("    %-12s %8.1f %8.0f %8.1f %8.0f" % [d.name, vs, x_lo, t_lo, _kmh(v_lo)])
		if fm.crashed or t_lo < 0.0 or x_lo > 1000.0:
			_fail("разбег %s: отрыв через %.0f м (нужно ≤ 1000 на полосе 1400 м), разбился=%s %s" % [id, x_lo, fm.crashed, fm.crash_reason])

# ---------------------------------------------------------------- максимальная скорость и vne

## Горизонт на 1000 м, полный газ (и форсаж): установившаяся скорость ниже vne с запасом 5 %.
func _test_top_speed_all() -> void:
	print("  максимальная скорость на 1000 м (газ 100 %, форсаж у реактивных):")
	print("    %-12s %9s %9s %6s" % ["самолёт", "V, км/ч", "vne, км/ч", "V/vne"])
	for id in Data.ORDER:
		var d := Data.plane(id)
		var jet := String(d.kind) == "jet"
		var vne := float(d.vne)
		var fm := _mk(id, 1000.0, 0.85 * vne, true)
		for i in 150 * 60:
			fm.step(DT, _ctrl(0.0, 0.0, 0.0, 1.0, jet), FLAT)
		var v := fm.airspeed
		print("    %-12s %9.0f %9.0f %6.2f" % [d.name, _kmh(v), _kmh(vne), v / vne])
		if v > 0.95 * vne or absf(fm.pos.y - 1000.0) > 60.0:
			_fail("макс. скорость %s: %.0f км/ч при vne %.0f км/ч (нужно ≤ 95 %%), высота %.0f" % [id, _kmh(v), _kmh(vne), fm.pos.y])

# ---------------------------------------------------------------- авианосец

## Палуба как у авианосца на рифе: нос на -Z, корма на z = +148, нос на z = -150, ширина 38 м.
func _deck_at(p: Vector3, team := 0) -> Dictionary:
	if absf(p.x) <= 19.0 and p.z <= 148.0 and p.z >= -150.0:
		return {"height": 20.0, "kind": "deck", "team": team, "flat": true, "heading": 0.0,
			"bow_dist": p.z + 150.0, "stern_dist": 148.0 - p.z}
	return WATER

## Катапульта: все самолёты, аркада и реализм. С кормы, газ 100 % (форсаж), ручка нейтрально;
## в воздухе — мягко на себя (держит +3 м/с). Сход до носа, не ниже палубы, через 5 с набор высоты.
func _test_catapult_all() -> void:
	print("  катапульта (палуба 300 м, старт в 28 м от кормы):")
	print("    %-12s %-7s %8s %8s %8s %9s %9s" % ["самолёт", "режим", "Vs, м/с", "сход, м/с", "время, с", "разбег, м", "Vy+5с, м/с"])
	for id in Data.ORDER:
		var d := Data.plane(id)
		var jet := String(d.kind) == "jet"
		var gh := float(d.shape.gear_height)
		for assist in [true, false]:
			var fm := FlightModel.new()
			fm.team = 0
			fm.assist = assist
			fm.setup(d, Vector3(0.0, 20.0 + gh, 120.0), Basis.IDENTITY, 0.0, true)
			var vs := fm.stall_speed()
			var t := 0.0
			var t_rel := -1.0
			var z_rel := 0.0
			var v_rel := 0.0
			var min_y := 1e9
			var vy5 := -99.0
			var saw_cat := false
			for i in 20 * 60:
				var p := 0.0
				if not fm.on_ground:
					p = clampf((3.0 - fm.vertical_speed) * 0.08, 0.0, 0.35)
				fm.step(DT, _ctrl(p, 0.0, 0.0, 1.0, jet), _deck_at(fm.pos))
				t += DT
				saw_cat = saw_cat or fm.catapult
				if fm.crashed:
					break
				if not fm.on_ground and t_rel < 0.0:
					t_rel = t
					z_rel = fm.pos.z
					v_rel = fm.airspeed
				if t_rel >= 0.0:
					min_y = minf(min_y, fm.pos.y - gh)
					if t - t_rel >= 5.0:
						vy5 = fm.vertical_speed
						break
			var mode := "аркада" if assist else "реализм"
			print("    %-12s %-7s %8.1f %8.1f %8.2f %9.0f %9.1f" % [d.name, mode, vs, v_rel, t_rel, 120.0 - z_rel, vy5])
			var who := "катапульта %s (%s)" % [id, mode]
			if fm.crashed:
				_fail("%s: разбился (%s)" % [who, fm.crash_reason])
				continue
			if not saw_cat or t_rel < 0.0:
				_fail("%s: катапульта не сработала, в воздухе с %.1f с" % [who, t_rel])
				continue
			if t_rel < 1.5 or t_rel > 3.0:
				_fail("%s: разгон %.2f с (нужно 1.5..3)" % [who, t_rel])
			if v_rel < 1.2 * vs or v_rel > 1.4 * vs:
				_fail("%s: скорость схода %.1f м/с при Vs %.1f (нужно около 1.25 Vs)" % [who, v_rel, vs])
			if z_rel < -150.0:
				_fail("%s: сошёл не с палубы (z %.0f)" % [who, z_rel])
			if min_y < 18.0:
				_fail("%s: просел до %.1f м над водой (палуба 20 м)" % [who, min_y])
			if vy5 <= 0.0:
				_fail("%s: через 5 с после схода не набирает высоту, Vy %.1f" % [who, vy5])
	# чужая палуба, газ меньше 0.9 или тормоз — катапульта не срабатывает
	for kind in ["enemy", "throttle", "brake"]:
		var fm := FlightModel.new()
		fm.team = 0
		fm.setup(Data.plane("strizh"), Vector3(0.0, 21.4, 120.0), Basis.IDENTITY, 0.0, true)
		var c := _ctrl(0.0, 0.0, 0.0, 0.8 if kind == "throttle" else 1.0)
		c.brake = kind == "brake"
		for i in 60:
			fm.step(DT, c, _deck_at(fm.pos, 1 if kind == "enemy" else 0))
		if fm.catapult or fm.airspeed > 15.0:
			_fail("катапульта (%s): сработала, скорость %.1f м/с" % [kind, fm.airspeed])

## Посадка на палубу: заход с кормы на 1.3 Vs, касание — трос, остановка до 100 м и до носа.
## Слишком быстро (1.8 Vs) — трос не цепляет; на чужой палубе — тоже; ниже палубы — удар о борт.
func _test_arrest() -> void:
	for id in ["strizh", "shmel", "sokol", "flanker", "groza"]:
		var r := _deck_landing(id, 1.3, 0)
		print("  посадка на палубу %s: касание z=%.0f при %.0f км/ч, остановка через %.0f м (z=%.0f), трос=%s" %
			[id, r.touch_z, _kmh(r.touch_v), r.run, r.stop_z, r.arrested])
		if r.crashed or not r.landed:
			_fail("трос %s: не сел (%s)" % [id, r.reason])
			continue
		if not r.arrested:
			_fail("трос %s: не зацепился, касание на %.0f км/ч" % [id, _kmh(r.touch_v)])
		if r.run > 100.0 or r.stop_z < -150.0 or not r.stopped:
			_fail("трос %s: пробег %.0f м, остановка z=%.0f (нос на -150), стоит=%s" % [id, r.run, r.stop_z, r.stopped])
	var fast := _deck_landing("strizh", 1.8, 0)
	if fast.arrested:
		_fail("трос: зацепил на %.0f км/ч (выше 1.6 Vs)" % _kmh(fast.touch_v))
	var enemy := _deck_landing("strizh", 1.3, 1)
	if enemy.arrested:
		_fail("трос: зацепил на чужой палубе")
	# подлёт ниже уровня палубы — удар о корму
	var fm := FlightModel.new()
	fm.team = 0
	fm.setup(Data.plane("strizh"), Vector3(0.0, 12.0, 200.0), Basis.IDENTITY, 60.0, false)
	fm.gear_down = true
	for i in 3 * 60:
		fm.step(DT, _ctrl(0.0, 0.0, 0.0, 0.6), _deck_at(fm.pos))
		if fm.crashed or fm.on_ground:
			break
	if not fm.crashed:
		_fail("ниже палубы: не разбился о корму (на земле=%s, высота %.1f)" % [fm.on_ground, fm.pos.y])

## Заход на палубу с кормы и посадка; на палубе газ 0 без тормоза (останавливает трос).
func _deck_landing(id: String, speed_k: float, deck_team: int) -> Dictionary:
	var d := Data.plane(id)
	var gh := float(d.shape.gear_height)
	var probe := _mk(id, 0.0, 100.0, true)
	var v0 := speed_k * probe.stall_speed()
	var aim_z := 100.0
	var start_z := 148.0 + 420.0
	var t_fly := (start_z - aim_z) / v0
	var fm := FlightModel.new()
	fm.team = 0
	fm.assist = true
	var y0 := 20.0 + gh + 2.5 * t_fly
	fm.setup(d, Vector3(0.0, y0, start_z), Basis(Vector3.RIGHT, -atan(2.5 / v0)), v0, false)
	fm.gear_down = true
	var r := {"landed": false, "arrested": false, "crashed": false, "reason": "", "touch_z": 0.0, "touch_v": 0.0,
		"run": 0.0, "stop_z": 0.0, "stopped": false}
	for i in 60 * 60:
		var c := _ctrl(0.0, 0.0, 0.0, 0.5)
		if fm.on_ground:
			c.throttle = 0.0
		else:
			var h := fm.pos.y - (20.0 + gh)
			var tt := maxf((fm.pos.z - aim_z) / maxf(fm.airspeed, 10.0), 0.4)
			var vs_t := clampf(-h / tt, -4.0, -0.8)
			c.pitch = clampf((vs_t - fm.vertical_speed) * 0.12, -0.3, 0.3)
			c.throttle = clampf(0.45 + (v0 - fm.airspeed) * 0.08, 0.0, 1.0)
		var was_air := not fm.on_ground
		var v_before := fm.airspeed
		fm.step(DT, c, _deck_at(fm.pos, deck_team))
		if fm.crashed:
			r.crashed = true
			r.reason = fm.crash_reason
			break
		if was_air and fm.on_ground and not r.landed:
			r.landed = true
			r.touch_z = fm.pos.z
			r.touch_v = v_before
			r.arrested = fm.arrested
		if r.landed and not fm.on_ground:
			r.reason = "ушёл с палубы"
			break
		if r.landed and fm.airspeed < 0.3:
			r.stopped = true
			break
	r.stop_z = fm.pos.z
	if r.landed:
		r.run = r.touch_z - fm.pos.z
	return r

func _test_determinism() -> void:
	var a := _mk("mirage", 1200.0, 180.0, true)
	var b := _mk("mirage", 1200.0, 180.0, true)
	for i in 600:
		var c := _ctrl(sin(i * 0.05), cos(i * 0.03) * 0.5, 0.2, 0.9)
		a.step(DT, c, FLAT)
		b.step(DT, c, FLAT)
	if a.pos != b.pos or a.vel != b.vel:
		_fail("недетерминированно: %s vs %s" % [a.pos, b.pos])

# ---------------------------------------------------------------- 11. повреждения

func _test_damage() -> void:
	var d := Data.plane("strizh")
	var dm := DamageModel.new()
	dm.setup(d, false)
	var hz := dm.apply_hit(Vector3(-4.5, 0.0, -0.5), 1.0, 3, 1.0)
	if hz != "left_wing":
		_fail("11. попадание в левую законцовку: %s" % hz)
	hz = dm.apply_hit(Vector3(4.5, 0.0, -0.5), 1.0, 3, 1.0)
	if hz != "right_wing":
		_fail("11. попадание в правую законцовку: %s" % hz)
	hz = dm.apply_hit(Vector3(0.0, 0.6, float(d.shape.cockpit_z)), 1.0, 3, 1.0)
	if hz != "pilot":
		_fail("11. попадание у кабины: %s" % hz)
	if dm.hit_zone(Vector3(0.0, 0.0, 4.0)) != "tail":
		_fail("11. зона хвоста: %s" % dm.hit_zone(Vector3(0.0, 0.0, 4.0)))
	if dm.hit_zone(Vector3(0.0, 0.0, -4.0)) != "engine":
		_fail("11. зона мотора (винт в носу): %s" % dm.hit_zone(Vector3(0.0, 0.0, -4.0)))
	var jet := DamageModel.new()
	jet.setup(Data.plane("sokol"), false)
	if jet.hit_zone(Vector3(0.0, 0.0, 2.0)) != "engine":
		_fail("11. зона двигателя реактивного: %s" % jet.hit_zone(Vector3(0.0, 0.0, 2.0)))
	if dm.last_attacker != 3 or dm.last_hit_time != 1.0:
		_fail("11. last_attacker/last_hit_time не записаны")
	# отрыв крыла
	var events := {"destroyed": [], "damaged": 0}
	dm.module_destroyed.connect(func(m): events.destroyed.append(m))
	dm.module_damaged.connect(func(_m, _r): events.damaged += 1)
	dm.apply_hit(Vector3(-4.0, 0.0, -0.5), 200.0, 5, 2.0)
	if not dm.left_wing_lost or not dm.is_destroyed() or dm.destroyed_reason() != "wing":
		_fail("11. крыло: lost=%s destroyed=%s reason=%s" % [dm.left_wing_lost, dm.is_destroyed(), dm.destroyed_reason()])
	if not events.destroyed.has("left_wing") or events.damaged == 0:
		_fail("11. сигналы при отрыве крыла не пришли: %s" % [events])
	var fm := _mk("strizh", 1000.0, 120.0, true)
	dm.update(DT, fm)
	if fm.lift_left != 0.0:
		_fail("11. после отрыва крыла lift_left = %.2f" % fm.lift_left)
	# двигатель
	dm = DamageModel.new()
	dm.setup(d, false)
	dm.apply_hit(Vector3(0.0, 0.0, -4.0), 500.0, 2, 1.0)
	fm = _mk("strizh", 1000.0, 120.0, true)
	dm.update(DT, fm)
	if not dm.engine_dead or fm.thrust_factor != 0.0:
		_fail("11. двигатель 0 HP: engine_dead=%s thrust_factor=%.2f" % [dm.engine_dead, fm.thrust_factor])
	# пилот
	dm = DamageModel.new()
	dm.setup(d, false)
	dm.apply_hit(Vector3(0.0, 0.5, float(d.shape.cockpit_z)), 500.0, 2, 1.0)
	if dm.destroyed_reason() != "pilot":
		_fail("11. пилот: reason=%s" % dm.destroyed_reason())
	# реализм: меньше HP
	var hc := DamageModel.new()
	hc.setup(d, true)
	if absf(float(hc.max_hp.structure) - 0.8 * float(d.hp.structure)) > 0.01:
		_fail("11. hardcore: max_hp.structure=%.1f" % float(hc.max_hp.structure))
	# пожар и тушение
	dm = DamageModel.new()
	dm.setup(d, false)
	var fire := {"on": 0, "off": 0}
	dm.fire_started.connect(func(): fire.on += 1)
	dm.fire_out.connect(func(): fire.off += 1)
	dm.start_fire()
	var f0 := dm.module_ratio("fuel")
	dm.update(1.0, fm)
	if not dm.on_fire or fire.on != 1 or dm.module_ratio("fuel") >= f0:
		_fail("11. пожар не горит или не отнимает топливо")
	var first := dm.try_extinguish()
	if dm.on_fire:
		if dm.try_extinguish():
			_fail("11. тушение без перезарядки 20 с")
	elif not first or fire.off != 1:
		_fail("11. тушение: on_fire=%s off=%d" % [dm.on_fire, fire.off])
	# перегрузка ломает крылья
	dm = DamageModel.new()
	dm.setup(d, false)
	fm.structural_stress = 1.0
	for i in 60:
		dm.update(DT, fm)
	if dm.module_ratio("left_wing") >= 1.0 or dm.module_ratio("right_wing") >= 1.0:
		_fail("11. перегрузка не повреждает крылья")
	fm.structural_stress = 0.0
	# ремонт
	dm = DamageModel.new()
	dm.setup(d, false)
	dm.apply_hit(Vector3(-4.0, 0.0, -0.5), 40.0, 1, 0.0)
	dm.apply_hit(Vector3(0.0, 0.0, -4.0), 40.0, 1, 0.0)
	dm.apply_hit(Vector3(0.0, 0.0, 4.0), 30.0, 1, 0.0)
	dm.apply_hit(Vector3(0.0, -0.5, 1.0), 30.0, 1, 0.0)
	dm.start_fire()
	if not dm.is_damaged():
		_fail("11. is_damaged() = false после попаданий")
	var t := 0.0
	var ok := false
	while t < 30.0:
		t += 0.1
		if dm.repair_step(0.1):
			ok = true
			break
	if not ok or t > 21.0:
		_fail("11. ремонт: готово=%s за %.1f с" % [ok, t])
	for m in DamageModel.MODULES:
		if dm.module_ratio(m) < 1.0:
			_fail("11. после ремонта %s = %.2f" % [m, dm.module_ratio(m)])
	if dm.on_fire or dm.oil_leak or dm.fuel_leak or dm.engine_dead or dm.is_damaged():
		_fail("11. после ремонта остались пожар/утечки")
	dm.update(DT, fm)
	if fm.thrust_factor != 1.0 or fm.lift_left != 1.0 or fm.lift_right != 1.0 or fm.pitch_authority != 1.0:
		_fail("11. после ремонта модификаторы не 1: %.2f %.2f %.2f %.2f" % [fm.thrust_factor, fm.lift_left, fm.lift_right, fm.pitch_authority])
