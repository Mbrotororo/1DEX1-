extends Node
## Все игровые определения. Только данные и чистые функции.
## Единицы: кг, м², Н, кВт, м/с, градусы (поля *_deg), секунды.

# ---------------------------------------------------------------- самолёты
# Поля самолёта:
#   id, name, code, rank (1..3), line ("fighter"|"attacker"), kind ("prop"|"jet"), level (уровень боя),
#   role, desc (одна строка фактов), parent (что нужно исследовать до него), research_xp, price, repair,
#   mass, wing_area, power_kw (только винтовые), thrust (Н: статическая у винтовых, бесфорсажная у реактивных),
#   afterburner (Н сверху у реактивных; у винтовых — доля прибавки мощности на форсаже двигателя),
#   cd0, k_induced, cl_slope (на радиан), cl_max, alpha_crit_deg, mcrit (после него резко растёт сопротивление),
#   max_pitch_rate_deg, max_roll_rate_deg, max_yaw_rate_deg, v_ref (скорость полной эффективности рулей, м/с),
#   vne (предельная скорость, м/с), g_limit, high_aoa (может выходить на закритические углы — кобра),
#   stealth (1 = обычный, меньше — хуже видно ботам и ракетам), fuel_min,
#   hp {engine, fuel, wing, tail, pilot, structure},
#   weapons {guns:[{label, caliber, count, rof, ammo, speed, damage}], rockets:{count, damage, radius, speed},
#            bombs:{count, mass, damage, radius}, missiles:{count, range, speed, turn_deg, cone_deg, damage, radius},
#            flares:int}
#   shape {length, span, fuselage_radius, wing_type ("straight"|"swept"|"delta"), sweep_deg, wing_z, chord,
#          tail ("single"|"twin"), engines ("nose_prop"|"twin_prop"|"single_jet"|"twin_jet"), cockpit_z,
#          gear_height, base_color:Color}
var AIRCRAFT: Dictionary = {}
var ORDER: Array = []          # порядок в дереве исследований
var STARTER_PLANES: Array = ["strizh", "shmel"]

func _gun(label: String, caliber: float, count: int, rof: int, ammo: int, speed: float, damage: float) -> Dictionary:
	return {"label": label, "caliber": caliber, "count": count, "rof": rof, "ammo": ammo, "speed": speed, "damage": damage}

func _add(p: Dictionary) -> void:
	var w: Dictionary = p.get("weapons", {})
	for k in ["guns"]:
		if not w.has(k):
			w[k] = []
	if not w.has("rockets"):
		w["rockets"] = {"count": 0, "damage": 0, "radius": 0, "speed": 0}
	if not w.has("bombs"):
		w["bombs"] = {"count": 0, "mass": 0, "damage": 0, "radius": 0}
	if not w.has("missiles"):
		w["missiles"] = {"count": 0, "range": 0, "speed": 0, "turn_deg": 0, "cone_deg": 0, "damage": 0, "radius": 0}
	if not w.has("flares"):
		w["flares"] = 0
	p["weapons"] = w
	if not p.has("stealth"):
		p["stealth"] = 1.0
	if not p.has("high_aoa"):
		p["high_aoa"] = false
	AIRCRAFT[p.id] = p
	ORDER.append(p.id)

func _init() -> void:
	# ---------------- линия истребителей
	_add({"id": "strizh", "name": "Стриж", "code": "П-1", "rank": 1, "line": "fighter", "kind": "prop", "level": 1.0,
		"role": "Истребитель", "desc": "Лёгкий и вёрткий. Слабое вооружение.", "parent": "", "research_xp": 0, "price": 0, "repair": 150,
		"mass": 2600.0, "wing_area": 16.0, "power_kw": 800.0, "thrust": 9600.0, "afterburner": 0.12,
		"cd0": 0.025, "k_induced": 0.06, "cl_slope": 5.0, "cl_max": 1.4, "alpha_crit_deg": 16.0, "mcrit": 0.68,
		"max_pitch_rate_deg": 42.0, "max_roll_rate_deg": 150.0, "max_yaw_rate_deg": 14.0, "v_ref": 90.0, "vne": 190.0, "g_limit": 9.0,
		"fuel_min": 20,
		"hp": {"engine": 45, "fuel": 35, "wing": 55, "tail": 40, "pilot": 25, "structure": 90},
		"weapons": {"guns": [_gun("7,62 мм", 7.62, 2, 1200, 600, 820, 3.0), _gun("12,7 мм", 12.7, 2, 800, 250, 860, 6.0)]},
		"shape": {"length": 8.5, "span": 10.0, "fuselage_radius": 0.7, "wing_type": "straight", "sweep_deg": 0.0, "wing_z": -0.5,
			"chord": 1.8, "tail": "single", "engines": "nose_prop", "cockpit_z": 0.3, "gear_height": 1.4, "base_color": Color(0.42, 0.48, 0.36)}})
	_add({"id": "krechet", "name": "Кречет", "code": "П-3", "rank": 1, "line": "fighter", "kind": "prop", "level": 1.7,
		"role": "Истребитель", "desc": "Быстрее Стрижа, две пушки 20 мм.", "parent": "strizh", "research_xp": 2500, "price": 3000, "repair": 300,
		"mass": 3300.0, "wing_area": 17.0, "power_kw": 1300.0, "thrust": 14000.0, "afterburner": 0.12,
		"cd0": 0.022, "k_induced": 0.058, "cl_slope": 5.0, "cl_max": 1.4, "alpha_crit_deg": 16.0, "mcrit": 0.7,
		"max_pitch_rate_deg": 38.0, "max_roll_rate_deg": 130.0, "max_yaw_rate_deg": 13.0, "v_ref": 100.0, "vne": 215.0, "g_limit": 9.0,
		"fuel_min": 22,
		"hp": {"engine": 55, "fuel": 40, "wing": 60, "tail": 45, "pilot": 28, "structure": 100},
		"weapons": {"guns": [_gun("20 мм", 20.0, 2, 700, 150, 800, 14.0), _gun("12,7 мм", 12.7, 2, 800, 300, 860, 6.0)]},
		"shape": {"length": 9.2, "span": 10.5, "fuselage_radius": 0.7, "wing_type": "straight", "sweep_deg": 0.0, "wing_z": -0.6,
			"chord": 1.9, "tail": "single", "engines": "nose_prop", "cockpit_z": 0.6, "gear_height": 1.5, "base_color": Color(0.36, 0.43, 0.47)}})
	_add({"id": "sokol", "name": "Сокол", "code": "F-19", "rank": 2, "line": "fighter", "kind": "jet", "level": 3.3,
		"role": "Реактивный истребитель", "desc": "Первый реактивный. Пушки 37 и 23 мм.", "parent": "krechet", "research_xp": 6000, "price": 9000, "repair": 700,
		"mass": 5500.0, "wing_area": 28.0, "power_kw": 0.0, "thrust": 26000.0, "afterburner": 0.0,
		"cd0": 0.02, "k_induced": 0.07, "cl_slope": 4.6, "cl_max": 1.2, "alpha_crit_deg": 18.0, "mcrit": 0.86,
		"max_pitch_rate_deg": 30.0, "max_roll_rate_deg": 120.0, "max_yaw_rate_deg": 10.0, "v_ref": 140.0, "vne": 300.0, "g_limit": 8.0,
		"fuel_min": 18,
		"hp": {"engine": 60, "fuel": 50, "wing": 70, "tail": 50, "pilot": 30, "structure": 120},
		"weapons": {"guns": [_gun("37 мм", 37.0, 1, 400, 40, 690, 45.0), _gun("23 мм", 23.0, 2, 850, 80, 700, 18.0)],
			"bombs": {"count": 2, "mass": 100, "damage": 160.0, "radius": 22.0}},
		"shape": {"length": 10.1, "span": 10.1, "fuselage_radius": 0.75, "wing_type": "swept", "sweep_deg": 35.0, "wing_z": 0.3,
			"chord": 2.6, "tail": "single", "engines": "single_jet", "cockpit_z": -2.2, "gear_height": 1.6, "base_color": Color(0.62, 0.65, 0.66)}})
	_add({"id": "mirage", "name": "Мираж", "code": "Д-4", "rank": 2, "line": "fighter", "kind": "jet", "level": 4.3,
		"role": "Истребитель с треугольным крылом", "desc": "Форсаж, ракеты с ИК-головкой, теряет скорость в виражах.", "parent": "sokol", "research_xp": 11000, "price": 16000, "repair": 1100,
		"mass": 7000.0, "wing_area": 35.0, "power_kw": 0.0, "thrust": 40000.0, "afterburner": 22000.0,
		"cd0": 0.017, "k_induced": 0.12, "cl_slope": 3.4, "cl_max": 1.3, "alpha_crit_deg": 24.0, "mcrit": 0.92,
		"max_pitch_rate_deg": 32.0, "max_roll_rate_deg": 160.0, "max_yaw_rate_deg": 10.0, "v_ref": 160.0, "vne": 420.0, "g_limit": 8.5,
		"fuel_min": 14,
		"hp": {"engine": 70, "fuel": 55, "wing": 85, "tail": 55, "pilot": 30, "structure": 130},
		"weapons": {"guns": [_gun("30 мм", 30.0, 2, 1200, 125, 800, 28.0)],
			"rockets": {"count": 12, "damage": 70.0, "radius": 12.0, "speed": 600.0},
			"missiles": {"count": 2, "range": 2500.0, "speed": 500.0, "turn_deg": 18.0, "cone_deg": 12.0, "damage": 90.0, "radius": 12.0},
			"flares": 16},
		"shape": {"length": 15.0, "span": 8.2, "fuselage_radius": 0.85, "wing_type": "delta", "sweep_deg": 60.0, "wing_z": 1.2,
			"chord": 6.5, "tail": "single", "engines": "single_jet", "cockpit_z": -4.0, "gear_height": 1.9, "base_color": Color(0.55, 0.53, 0.47)}})
	_add({"id": "flanker", "name": "Фланкер", "code": "Су-27", "rank": 3, "line": "fighter", "kind": "jet", "level": 6.0,
		"role": "Манёвренный истребитель", "desc": "Два двигателя, 6 ракет, выходит на большие углы атаки (кобра).", "parent": "mirage", "research_xp": 20000, "price": 30000, "repair": 1800,
		"mass": 23000.0, "wing_area": 62.0, "power_kw": 0.0, "thrust": 150000.0, "afterburner": 95000.0,
		"cd0": 0.021, "k_induced": 0.09, "cl_slope": 4.2, "cl_max": 1.6, "alpha_crit_deg": 30.0, "mcrit": 0.95,
		"max_pitch_rate_deg": 34.0, "max_roll_rate_deg": 200.0, "max_yaw_rate_deg": 14.0, "v_ref": 150.0, "vne": 450.0, "g_limit": 9.5,
		"high_aoa": true, "fuel_min": 16,
		"hp": {"engine": 90, "fuel": 70, "wing": 110, "tail": 70, "pilot": 35, "structure": 170},
		"weapons": {"guns": [_gun("30 мм", 30.0, 1, 1500, 150, 860, 30.0)],
			"missiles": {"count": 6, "range": 4500.0, "speed": 750.0, "turn_deg": 30.0, "cone_deg": 20.0, "damage": 110.0, "radius": 15.0},
			"flares": 60},
		"shape": {"length": 21.9, "span": 14.7, "fuselage_radius": 1.0, "wing_type": "swept", "sweep_deg": 42.0, "wing_z": 1.5,
			"chord": 5.0, "tail": "twin", "engines": "twin_jet", "cockpit_z": -6.5, "gear_height": 2.4, "base_color": Color(0.43, 0.60, 0.70)}})
	_add({"id": "prizrak", "name": "Призрак", "code": "С-5", "rank": 3, "line": "fighter", "kind": "jet", "level": 6.7,
		"role": "Малозаметный истребитель", "desc": "Боты и ракеты замечают его позже. 6 ракет.", "parent": "flanker", "research_xp": 28000, "price": 42000, "repair": 2400,
		"mass": 25000.0, "wing_area": 78.0, "power_kw": 0.0, "thrust": 160000.0, "afterburner": 100000.0,
		"cd0": 0.019, "k_induced": 0.09, "cl_slope": 4.0, "cl_max": 1.5, "alpha_crit_deg": 28.0, "mcrit": 0.97,
		"max_pitch_rate_deg": 32.0, "max_roll_rate_deg": 190.0, "max_yaw_rate_deg": 13.0, "v_ref": 160.0, "vne": 470.0, "g_limit": 9.0,
		"high_aoa": true, "stealth": 0.6, "fuel_min": 18,
		"hp": {"engine": 95, "fuel": 75, "wing": 115, "tail": 75, "pilot": 35, "structure": 180},
		"weapons": {"guns": [_gun("20 мм", 20.0, 1, 6000, 480, 1030, 14.0)],
			"missiles": {"count": 6, "range": 5000.0, "speed": 800.0, "turn_deg": 32.0, "cone_deg": 20.0, "damage": 110.0, "radius": 15.0},
			"flares": 40},
		"shape": {"length": 18.9, "span": 13.6, "fuselage_radius": 1.1, "wing_type": "delta", "sweep_deg": 42.0, "wing_z": 1.5,
			"chord": 6.0, "tail": "twin", "engines": "twin_jet", "cockpit_z": -5.5, "gear_height": 2.3, "base_color": Color(0.27, 0.30, 0.34)}})
	# ---------------- линия штурмовиков
	_add({"id": "shmel", "name": "Шмель", "code": "Ш-2", "rank": 1, "line": "attacker", "kind": "prop", "level": 1.3,
		"role": "Штурмовик", "desc": "Бронированный. 4 бомбы по 100 кг и 8 ракет.", "parent": "", "research_xp": 0, "price": 0, "repair": 200,
		"mass": 5500.0, "wing_area": 38.0, "power_kw": 1200.0, "thrust": 13000.0, "afterburner": 0.1,
		"cd0": 0.03, "k_induced": 0.055, "cl_slope": 5.0, "cl_max": 1.45, "alpha_crit_deg": 16.0, "mcrit": 0.62,
		"max_pitch_rate_deg": 28.0, "max_roll_rate_deg": 80.0, "max_yaw_rate_deg": 10.0, "v_ref": 80.0, "vne": 170.0, "g_limit": 7.0,
		"fuel_min": 25,
		"hp": {"engine": 90, "fuel": 60, "wing": 70, "tail": 50, "pilot": 50, "structure": 140},
		"weapons": {"guns": [_gun("20 мм", 20.0, 2, 600, 160, 800, 14.0), _gun("7,62 мм", 7.62, 2, 1200, 750, 820, 3.0)],
			"rockets": {"count": 8, "damage": 60.0, "radius": 10.0, "speed": 450.0},
			"bombs": {"count": 4, "mass": 100, "damage": 160.0, "radius": 22.0}},
		"shape": {"length": 11.6, "span": 14.6, "fuselage_radius": 0.9, "wing_type": "straight", "sweep_deg": 5.0, "wing_z": -0.4,
			"chord": 2.6, "tail": "single", "engines": "nose_prop", "cockpit_z": -0.8, "gear_height": 1.6, "base_color": Color(0.38, 0.42, 0.30)}})
	_add({"id": "burevestnik", "name": "Буревестник", "code": "Б-2", "rank": 1, "line": "attacker", "kind": "prop", "level": 2.3,
		"role": "Тяжёлый истребитель", "desc": "Два мотора, 4 пушки в носу, 2 бомбы по 250 кг.", "parent": "shmel", "research_xp": 3000, "price": 3500, "repair": 350,
		"mass": 7000.0, "wing_area": 40.0, "power_kw": 2200.0, "thrust": 24000.0, "afterburner": 0.1,
		"cd0": 0.026, "k_induced": 0.055, "cl_slope": 5.0, "cl_max": 1.4, "alpha_crit_deg": 15.0, "mcrit": 0.68,
		"max_pitch_rate_deg": 26.0, "max_roll_rate_deg": 75.0, "max_yaw_rate_deg": 9.0, "v_ref": 95.0, "vne": 200.0, "g_limit": 7.0,
		"fuel_min": 28,
		"hp": {"engine": 70, "fuel": 60, "wing": 80, "tail": 55, "pilot": 35, "structure": 150},
		"weapons": {"guns": [_gun("20 мм", 20.0, 4, 700, 200, 820, 14.0)],
			"bombs": {"count": 2, "mass": 250, "damage": 300.0, "radius": 35.0}},
		"shape": {"length": 12.5, "span": 17.0, "fuselage_radius": 0.8, "wing_type": "straight", "sweep_deg": 0.0, "wing_z": -0.6,
			"chord": 2.8, "tail": "twin", "engines": "twin_prop", "cockpit_z": -3.0, "gear_height": 1.8, "base_color": Color(0.47, 0.49, 0.43)}})
	_add({"id": "shtorm", "name": "Шторм", "code": "Ш-7", "rank": 2, "line": "attacker", "kind": "jet", "level": 3.7,
		"role": "Реактивный штурмовик", "desc": "16 ракет, 4 бомбы по 250 кг, две пушки 30 мм.", "parent": "burevestnik", "research_xp": 6500, "price": 9500, "repair": 750,
		"mass": 9000.0, "wing_area": 30.0, "power_kw": 0.0, "thrust": 30000.0, "afterburner": 0.0,
		"cd0": 0.022, "k_induced": 0.07, "cl_slope": 4.6, "cl_max": 1.25, "alpha_crit_deg": 17.0, "mcrit": 0.84,
		"max_pitch_rate_deg": 24.0, "max_roll_rate_deg": 100.0, "max_yaw_rate_deg": 9.0, "v_ref": 140.0, "vne": 290.0, "g_limit": 7.5,
		"fuel_min": 18,
		"hp": {"engine": 90, "fuel": 70, "wing": 90, "tail": 60, "pilot": 50, "structure": 170},
		"weapons": {"guns": [_gun("30 мм", 30.0, 2, 900, 150, 780, 28.0)],
			"rockets": {"count": 16, "damage": 70.0, "radius": 12.0, "speed": 600.0},
			"bombs": {"count": 4, "mass": 250, "damage": 300.0, "radius": 35.0}},
		"shape": {"length": 15.5, "span": 14.0, "fuselage_radius": 0.95, "wing_type": "swept", "sweep_deg": 25.0, "wing_z": 0.5,
			"chord": 3.2, "tail": "single", "engines": "twin_jet", "cockpit_z": -4.5, "gear_height": 1.9, "base_color": Color(0.44, 0.45, 0.37)}})
	_add({"id": "fantom", "name": "Фантом", "code": "F-4", "rank": 2, "line": "attacker", "kind": "jet", "level": 4.7,
		"role": "Перехватчик", "desc": "Самый быстрый на втором ранге. 4 ракеты, пушка 20 мм.", "parent": "shtorm", "research_xp": 12000, "price": 18000, "repair": 1200,
		"mass": 13000.0, "wing_area": 49.0, "power_kw": 0.0, "thrust": 54000.0, "afterburner": 32000.0,
		"cd0": 0.02, "k_induced": 0.09, "cl_slope": 4.2, "cl_max": 1.3, "alpha_crit_deg": 20.0, "mcrit": 0.93,
		"max_pitch_rate_deg": 26.0, "max_roll_rate_deg": 130.0, "max_yaw_rate_deg": 10.0, "v_ref": 160.0, "vne": 440.0, "g_limit": 8.0,
		"fuel_min": 15,
		"hp": {"engine": 80, "fuel": 70, "wing": 95, "tail": 60, "pilot": 32, "structure": 150},
		"weapons": {"guns": [_gun("20 мм", 20.0, 1, 6000, 640, 1030, 14.0)],
			"missiles": {"count": 4, "range": 3500.0, "speed": 650.0, "turn_deg": 22.0, "cone_deg": 15.0, "damage": 100.0, "radius": 14.0},
			"flares": 30},
		"shape": {"length": 17.8, "span": 11.7, "fuselage_radius": 1.0, "wing_type": "swept", "sweep_deg": 45.0, "wing_z": 1.0,
			"chord": 4.5, "tail": "single", "engines": "twin_jet", "cockpit_z": -5.0, "gear_height": 2.2, "base_color": Color(0.35, 0.40, 0.46)}})
	_add({"id": "groza", "name": "Гроза", "code": "Ш-25", "rank": 3, "line": "attacker", "kind": "jet", "level": 6.0,
		"role": "Штурмовик", "desc": "Броня, 40 ракет, 8 бомб, 2 ракеты для самообороны.", "parent": "fantom", "research_xp": 20000, "price": 30000, "repair": 1800,
		"mass": 15000.0, "wing_area": 33.7, "power_kw": 0.0, "thrust": 88000.0, "afterburner": 0.0,
		"cd0": 0.03, "k_induced": 0.07, "cl_slope": 4.6, "cl_max": 1.35, "alpha_crit_deg": 18.0, "mcrit": 0.8,
		"max_pitch_rate_deg": 26.0, "max_roll_rate_deg": 110.0, "max_yaw_rate_deg": 10.0, "v_ref": 130.0, "vne": 270.0, "g_limit": 7.0,
		"fuel_min": 20,
		"hp": {"engine": 110, "fuel": 90, "wing": 110, "tail": 75, "pilot": 70, "structure": 220},
		"weapons": {"guns": [_gun("30 мм", 30.0, 1, 3000, 250, 870, 30.0)],
			"rockets": {"count": 40, "damage": 80.0, "radius": 13.0, "speed": 650.0},
			"bombs": {"count": 8, "mass": 250, "damage": 300.0, "radius": 35.0},
			"missiles": {"count": 2, "range": 3000.0, "speed": 650.0, "turn_deg": 24.0, "cone_deg": 15.0, "damage": 100.0, "radius": 14.0},
			"flares": 64},
		"shape": {"length": 15.4, "span": 14.4, "fuselage_radius": 1.0, "wing_type": "swept", "sweep_deg": 20.0, "wing_z": 0.8,
			"chord": 3.3, "tail": "single", "engines": "twin_jet", "cockpit_z": -4.8, "gear_height": 2.0, "base_color": Color(0.40, 0.44, 0.36)}})
	# порядок в дереве: сначала линия истребителей, потом штурмовиков
	ORDER = ["strizh", "krechet", "sokol", "mirage", "flanker", "prizrak", "shmel", "burevestnik", "shtorm", "fantom", "groza"]

func plane(id: String) -> Dictionary:
	return AIRCRAFT.get(id, {})

func has_plane(id: String) -> bool:
	return AIRCRAFT.has(id)

func children_of(id: String) -> Array:
	var out: Array = []
	for pid in ORDER:
		if AIRCRAFT[pid].parent == id:
			out.append(pid)
	return out

func planes_in(line: String, rank: int = 0) -> Array:
	var out: Array = []
	for pid in ORDER:
		var p: Dictionary = AIRCRAFT[pid]
		if p.line == line and (rank == 0 or p.rank == rank):
			out.append(pid)
	return out

func level_text(level: float) -> String:
	return "%.1f" % level

const RANK_ROMAN := ["", "I", "II", "III"]
const RANK_NAMES := {1: "Поршневые", 2: "Первые реактивные", 3: "Современные"}
const LINE_NAMES := {"fighter": "Истребители", "attacker": "Штурмовики"}

# ---------------------------------------------------------------- камуфляжи
# pattern: "solid" | "splinter" | "blotch" | "stripes"
# unlock: {type: "default"|"kills"|"wins"|"battles", value:int} — считается по этому самолёту
var CAMO_TEMPLATES: Array = [
	{"id": "factory", "name": "Заводская", "pattern": "solid", "unlock": {"type": "default", "value": 0}},
	{"id": "desert", "name": "Пустыня", "pattern": "splinter", "colors": [Color(0.74, 0.62, 0.42), Color(0.52, 0.38, 0.24), Color(0.80, 0.76, 0.64)], "unlock": {"type": "kills", "value": 5}},
	{"id": "winter", "name": "Зима", "pattern": "blotch", "colors": [Color(0.88, 0.89, 0.88), Color(0.52, 0.55, 0.56), Color(0.92, 0.93, 0.93)], "unlock": {"type": "battles", "value": 10}},
	{"id": "night", "name": "Ночь", "pattern": "stripes", "colors": [Color(0.16, 0.19, 0.24), Color(0.10, 0.12, 0.15), Color(0.22, 0.25, 0.30)], "unlock": {"type": "wins", "value": 5}},
]

func camos_for(plane_id: String) -> Array:
	var p := plane(plane_id)
	var out: Array = []
	for t in CAMO_TEMPLATES:
		var c: Dictionary = t.duplicate(true)
		if not c.has("colors"):
			var b: Color = p.shape.base_color if p.size() > 0 else Color(0.5, 0.5, 0.5)
			c["colors"] = [b, b.darkened(0.25), b.lightened(0.2)]
		out.append(c)
	return out

func camo(plane_id: String, camo_id: String) -> Dictionary:
	for c in camos_for(plane_id):
		if c.id == camo_id:
			return c
	return camos_for(plane_id)[0]

# ---------------------------------------------------------------- карты
var MAPS: Array = [
	{"id": "canyon", "name": "Красный каньон", "biome": "desert", "desc": "Пустыня, каньон и река.",
		"preview": "res://assets/previews/map0.webp", "texture": "res://assets/textures/sand.webp", "carrier_team": -1},
	{"id": "fjord", "name": "Полярный фьорд", "biome": "winter", "desc": "Горы, снег и залив.",
		"preview": "res://assets/previews/map1.webp", "texture": "res://assets/textures/snow.webp", "carrier_team": -1},
	{"id": "reef", "name": "Дальний риф", "biome": "ocean", "desc": "Острова в океане. У синих авианосец.",
		"preview": "res://assets/previews/map2.webp", "texture": "res://assets/textures/island.webp", "carrier_team": 0},
]

func map_def(id: String) -> Dictionary:
	for m in MAPS:
		if m.id == id:
			return m
	return MAPS[0]

const TIME_NAMES := {"random": "Случайное", "dawn": "Утро", "day": "День", "dusk": "Вечер", "night": "Ночь"}
const WEATHER_NAMES := {"random": "Случайная", "clear": "Ясно", "cloudy": "Облачно", "overcast": "Пасмурно", "fog": "Туман", "storm": "Гроза"}
const MODE_NAMES := {"arcade": "Аркада", "realistic": "Реализм", "training": "Обучение", "test": "Тестовый полёт"}
const TEAM_NAMES := ["Синие", "Красные"]

func resolve_time(t: String, rng: RandomNumberGenerator) -> String:
	if t != "random" and TIME_NAMES.has(t):
		return t
	var opts := ["dawn", "day", "day", "day", "dusk", "night"]
	return opts[rng.randi() % opts.size()]

func resolve_weather(w: String, rng: RandomNumberGenerator) -> String:
	if w != "random" and WEATHER_NAMES.has(w):
		return w
	var opts := ["clear", "clear", "cloudy", "cloudy", "overcast", "fog", "storm"]
	return opts[rng.randi() % opts.size()]

func resolve_map(id: String, rng: RandomNumberGenerator) -> String:
	for m in MAPS:
		if m.id == id:
			return id
	return MAPS[rng.randi() % MAPS.size()].id

# ---------------------------------------------------------------- экономика и прогресс
var ECONOMY: Dictionary = {
	"start_credits": 5000,
	"kill": {"credits": 300, "xp": 180},
	"assist": {"credits": 100, "xp": 60},
	"ground_per_ticket": {"credits": 8, "xp": 6},   # умножается на ticket_value цели
	"capture": {"credits": 200, "xp": 120},
	"landing": {"credits": 100, "xp": 50},
	"participation": {"credits": 200, "xp": 100},
	"win_mult": 1.3,
	"rank_mult": [1.0, 1.0, 1.4, 1.8],              # по рангу самолёта
	"spawn_cost_by_rank": [0, 150, 250, 400],
	"spawn_points": {"kill": 150, "assist": 50, "ground_min": 40, "ground_max": 100, "capture": 100},
	"tickets": {4: 700, 8: 1000},
	"ticket_loss_aircraft": 30,
	"ticket_loss_base": 150,
	"zone_drain_per_sec": 3.0,
	"match_seconds": 900,
	"arcade_uses_per_plane": 2,
	"bot_lives_arcade": 3,
}

var PLAYER_RANKS: Array = [
	{"name": "Кадет", "xp": 0},
	{"name": "Пилот", "xp": 2000},
	{"name": "Лейтенант", "xp": 8000},
	{"name": "Капитан", "xp": 20000},
	{"name": "Майор", "xp": 45000},
	{"name": "Полковник", "xp": 90000},
]

var ACHIEVEMENTS: Dictionary = {
	"first_battle": {"name": "Первый бой", "desc": "Проведи один бой"},
	"first_kill": {"name": "Первый сбитый", "desc": "Сбей самолёт"},
	"first_win": {"name": "Победа", "desc": "Выиграй бой"},
	"ace": {"name": "Ас", "desc": "Сбей 5 самолётов за один бой"},
	"ground_10": {"name": "Штурмовик", "desc": "Уничтожь 10 наземных целей"},
	"landing": {"name": "Посадка", "desc": "Сядь на свой аэродром и пополни боезапас"},
	"cobra": {"name": "Кобра", "desc": "Сделай кобру и вернись в горизонт"},
	"battles_10": {"name": "10 боёв", "desc": "Проведи 10 боёв"},
	"rank3": {"name": "Третий ранг", "desc": "Исследуй самолёт третьего ранга"},
	"realistic_win": {"name": "Реализм", "desc": "Выиграй бой в режиме «Реализм»"},
}

var CALLSIGNS: Array = ["Барс", "Коршун", "Ворон", "Сапсан", "Зенит", "Туман", "Иней", "Беркут", "Клён", "Риф",
	"Север", "Рысь", "Гром", "Вихрь", "Тень", "Буран", "Шквал", "Искра", "Пик", "Метеор", "Кедр", "Орион",
	"Дельта", "Пурга", "Лис", "Волк", "Комета", "Байкал", "Алмаз", "Тайга"]

var DEFAULT_SETTINGS: Dictionary = {
	"graphics": "medium",        # "low" | "medium" | "high"
	"control": "mouse",          # "mouse" | "keyboard"
	"sensitivity": 1.0,          # 0.3 .. 2.0
	"invert_y": false,
	"touch": "auto",             # "auto" | "on" | "off"
	"button_scale": 1.0,         # 0.7 .. 1.5
	"left_handed": false,
	"engine_volume": 0.8,
	"effects_volume": 0.9,
	"fov": 70.0,
	"player_name": "1DEX1",
	"show_fps": false,
}

# ---------------------------------------------------------------- управление
func empty_controls() -> Dictionary:
	return {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": 0.8, "afterburner": false,
		"guns": false, "rocket": false, "bomb": false, "missile": false, "flares": false,
		"gear_toggle": false, "brake": false, "extinguish": false}

func tickets_for(size: int) -> float:
	return float(ECONOMY.tickets.get(size, 1000))
