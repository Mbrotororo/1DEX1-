extends Node
## QA (не коммитить): логика профиля, экономики, исследований, камуфляжей, достижений, званий, подбора.
## godot --headless --path skybreak res://tests/qa_meta_logic.tscn

const TMP := "user://qa_meta_logic.json"

var fails: Array = []


func _ok(cond: bool, what: String) -> void:
	print(("[qa] OK   " if cond else "[qa] FAIL ") + what)
	if not cond:
		fails.append(what)


func _fresh() -> void:
	Profile.save_path = TMP
	if FileAccess.file_exists(TMP):
		DirAccess.remove_absolute(TMP)
	Profile.autosave = true
	Profile.load_profile()


func _res(over: Dictionary) -> Dictionary:
	var r := {"mode": "arcade", "map_id": "canyon", "outcome": "loss", "duration": randf() * 900.0,
		"planes_used": ["strizh"], "kills": 0, "ground_kills": 0, "assists": 0, "deaths": 0, "captures": 0,
		"landings": 0, "score": 0, "xp_by_plane": {"strizh": 100}, "credits": 200, "scoreboard": [],
		"time_of_day": "day", "weather": "clear", "cobra": false, "nonce": randi()}
	r.merge(over, true)
	return r


func _ready() -> void:
	await get_tree().process_frame
	_new_profile()
	_research_and_buy()
	_repair()
	_camos()
	_achievements()
	_ranks()
	_matchmaking()
	_settings_persist()
	_corrupted()
	_idempotency()
	print("[qa] FAILS: ", fails.size())
	for f in fails:
		print("[qa]   - ", f)
	if FileAccess.file_exists(TMP):
		DirAccess.remove_absolute(TMP)
	get_tree().quit()


func _new_profile() -> void:
	print("\n[qa] ===== новый профиль")
	_fresh()
	var d: Dictionary = Profile.data
	print("[qa] credits=%d owned=%s researched=%s lineup=%s rank=%s total_xp=%d" % [d.credits, d.owned, d.researched,
		Profile.get_lineup(), Profile.player_rank().name, d.total_xp])
	_ok(int(d.credits) == 5000, "старт 5000 кредитов")
	_ok(d.owned == ["strizh", "shmel"], "куплены Стриж и Шмель")
	_ok(Profile.get_lineup() == ["strizh", "shmel"], "сетап = стартовые")
	_ok(String(Profile.player_rank().name) == "Кадет", "звание Кадет")
	for id in Data.ORDER:
		print("[qa]   state %-12s %s" % [id, Profile.plane_state(id)])


func _research_and_buy() -> void:
	print("\n[qa] ===== исследование и покупка")
	_fresh()
	for line in ["fighter", "attacker"]:
		for r in [1, 2, 3]:
			print("[qa]   %s ранг %d (%s): %s" % [line, r, Data.RANK_NAMES[r], Data.planes_in(line, r)])
	_ok(Data.RANK_NAMES == {1: "Поршневые", 2: "Первые реактивные", 3: "Современные"}, "названия рангов")
	# нельзя купить без исследования
	_ok(not Profile.buy("krechet"), "нельзя купить неисследованный Кречет")
	_ok(int(Profile.data.credits) == 5000, "кредиты не списаны")
	# нельзя выбрать закрытый
	Profile.set_research_focus("sokol")
	_ok(String(Profile.data.research_focus) == "", "нельзя выбрать закрытый Сокол целью")
	Profile.set_research_focus("burevestnik")
	_ok(String(Profile.data.research_focus) == "burevestnik", "цель Буревестник выбрана")
	# опыт на Стриже идёт в выбранную цель (Буревестник), а не в Кречет
	var s := Profile.apply_battle_result(_res({"xp_by_plane": {"strizh": 1000}}))
	print("[qa] summary=", s)
	print("[qa] research_xp=", Profile.data.research_xp, " plane_stats.strizh=", Profile.plane_stats("strizh"))
	_ok(int(Profile.data.research_xp.get("burevestnik", 0)) == 1000, "1000 оп. ушли в Буревестник")
	_ok(int(Profile.plane_stats("strizh").xp) == 1000, "опыт записан Стрижу")
	# доисследовать: 2500 оп. → 2000 в Буревестник (done) + 500 дальше
	s = Profile.apply_battle_result(_res({"xp_by_plane": {"strizh": 2500}}))
	print("[qa] summary.research=", s.research, " research_xp=", Profile.data.research_xp, " focus=", Profile.data.research_focus)
	_ok(Profile.plane_state("burevestnik") == "researched", "Буревестник исследован")
	_ok(int(Profile.data.research_xp.get("krechet", 0)) == 500, "остаток 500 ушёл в Кречет (ребёнок Стрижа)")
	# купить: цена 3500, кредитов хватает
	var before := int(Profile.data.credits)
	var okb := Profile.buy("burevestnik")
	print("[qa] buy burevestnik ok=%s credits %d -> %d lineup=%s" % [okb, before, Profile.data.credits, Profile.get_lineup()])
	_ok(okb and int(Profile.data.credits) == before - 3500, "покупка списала 3500")
	_ok("burevestnik" in Profile.get_lineup(), "купленный добавлен в сетап")
	_ok(not Profile.buy("burevestnik"), "повторная покупка невозможна")
	# нет денег
	Profile.data.credits = 100
	Profile.data.researched.append("krechet")
	_ok(not Profile.buy("krechet"), "нельзя купить без денег")
	_ok(int(Profile.data.credits) == 100, "кредиты не ушли в минус")
	Profile.data.credits = 100000
	_ok(Profile.buy("krechet"), "Кречет куплен при достатке")
	print("[qa] lineup after 4 planes=", Profile.get_lineup())
	# 5-й самолёт не влезает
	Profile.data.researched.append("sokol")
	_ok(Profile.buy("sokol"), "Сокол куплен")
	print("[qa] lineup after sokol=", Profile.get_lineup(), " add_to_lineup=", Profile.add_to_lineup("sokol"))
	Profile.set_lineup_slot(0, "sokol")
	print("[qa] after set slot0=sokol: ", Profile.get_lineup())
	_ok(Profile.get_lineup()[0] == "sokol" and Profile.get_lineup().size() == 4, "замена слота работает")
	Profile.set_lineup_slot(0, "")
	Profile.set_lineup_slot(0, "")
	Profile.set_lineup_slot(0, "")
	Profile.set_lineup_slot(0, "")
	print("[qa] lineup cleared=", Profile.get_lineup())
	_ok(Profile.get_lineup().is_empty(), "сетап можно очистить полностью")
	# без цели: опыт с Шмеля идёт в его ветку
	_fresh()
	s = Profile.apply_battle_result(_res({"planes_used": ["shmel"], "xp_by_plane": {"shmel": 700}}))
	print("[qa] no focus, shmel xp -> ", Profile.data.research_xp)
	_ok(int(Profile.data.research_xp.get("burevestnik", 0)) == 700, "без цели опыт Шмеля идёт в Буревестник")
	# exp test mode
	_fresh()
	s = Profile.apply_battle_result(_res({"mode": "test", "xp_by_plane": {"strizh": 5000}, "credits": 9999}))
	_ok(int(Profile.data.credits) == 5000 and int(Profile.data.total_xp) == 0, "тестовый полёт без наград")
	# training: гарантированные награды
	s = Profile.apply_battle_result(_res({"mode": "training", "outcome": "exit", "xp_by_plane": {"strizh": 100}, "credits": 200}))
	print("[qa] training exit summary credits_delta=%d xp=%d stats.battles=%d" % [s.credits_delta, s.xp_total, Profile.data.stats.battles])


func _repair() -> void:
	print("\n[qa] ===== ремонт")
	_fresh()
	var s := Profile.apply_battle_result(_res({"planes_used": ["strizh", "shmel"], "deaths": 2, "credits": 1000,
		"xp_by_plane": {"strizh": 100, "shmel": 100}}))
	print("[qa] 2 deaths strizh+shmel credits 1000: ", s)
	_ok(int(s.repair_cost) == 350 and int(s.credits_delta) == 650, "ремонт 150+200=350, итог 650")
	var c0 := int(Profile.data.credits)
	s = Profile.apply_battle_result(_res({"planes_used": ["strizh", "shmel"], "deaths": 4, "credits": 120,
		"xp_by_plane": {"strizh": 10, "shmel": 10}}))
	print("[qa] 4 deaths credits 120: ", s, " balance ", c0, " -> ", Profile.data.credits)
	_ok(int(Profile.data.credits) == c0, "итог за бой не ниже 0, баланс не уменьшился")
	_ok(int(Profile.data.credits) >= 0, "баланс не отрицательный")
	# перепутанный порядок: Стриж, Шмель, снова Стриж (planes_used без повторов)
	s = Profile.apply_battle_result(_res({"planes_used": ["strizh", "shmel"], "deaths": 3, "credits": 5000,
		"xp_by_plane": {"strizh": 10, "shmel": 10}}))
	print("[qa] 3 deaths (реально Стриж, Шмель, Стриж = 500) repair_full=", s.repair_full)
	# реализм ранга 3
	_fresh()
	Profile.data.owned.append("flanker")
	Profile.data.researched.append("flanker")
	s = Profile.apply_battle_result(_res({"mode": "realistic", "planes_used": ["flanker"], "deaths": 1, "credits": 900,
		"xp_by_plane": {"flanker": 500}}))
	print("[qa] realistic flanker lost, earned 900: ", s)
	_ok(int(s.credits_delta) == 0 and int(s.repair_full) == 1800, "Фланкер: ремонт 1800 > заработка 900, итог 0")


func _camos() -> void:
	print("\n[qa] ===== камуфляжи")
	_fresh()
	for c in Data.CAMO_TEMPLATES:
		print("[qa]   %s %s unlock=%s text='%s' open=%s" % [c.id, c.name, c.unlock, Profile.camo_unlock_text("strizh", c.id),
			Profile.is_camo_unlocked("strizh", c.id)])
	_ok(not Profile.is_camo_unlocked("strizh", "desert"), "Пустыня закрыта у нового игрока")
	Profile.select_camo("strizh", "desert")
	_ok(Profile.selected_camo("strizh") == "factory", "закрытый камуфляж нельзя выбрать")
	# 5 сбитых на Стриже
	var s := Profile.apply_battle_result(_res({"kills": 5, "xp_by_plane": {"strizh": 1000}}))
	print("[qa] after 5 kills: camos=", s.camos, " stats=", Profile.plane_stats("strizh"))
	_ok(Profile.is_camo_unlocked("strizh", "desert"), "Пустыня открыта после 5 сбитых на Стриже")
	_ok(s.camos.size() == 1, "сводка показывает новый камуфляж")
	Profile.select_camo("strizh", "desert")
	_ok(Profile.selected_camo("strizh") == "desert", "Пустыня выбрана")
	# деление сбитых между самолётами по опыту, а не по факту
	_fresh()
	s = Profile.apply_battle_result(_res({"planes_used": ["strizh", "shmel"], "kills": 3, "ground_kills": 6,
		"xp_by_plane": {"strizh": 200, "shmel": 1100}}))
	print("[qa] kills=3 (все на Стриже по сценарию), xp strizh=200 shmel=1100 -> strizh=%s shmel=%s" % [
		Profile.plane_stats("strizh"), Profile.plane_stats("shmel")])
	for id in Data.ORDER:
		for c in ["desert", "winter", "night"]:
			var t := Profile.camo_unlock_text(id, c)
			if id == "strizh" or id == "groza" or id == "shmel" or id == "prizrak":
				print("[qa]   text %s/%s: %s" % [id, c, t])


func _achievements() -> void:
	print("\n[qa] ===== достижения")
	_fresh()
	var s := Profile.apply_battle_result(_res({"outcome": "loss"}))
	print("[qa] 1st battle: ", s.achievements)
	_ok("Первый бой" in s.achievements, "first_battle")
	s = Profile.apply_battle_result(_res({"kills": 1}))
	_ok("Первый сбитый" in s.achievements, "first_kill")
	s = Profile.apply_battle_result(_res({"outcome": "win"}))
	_ok("Победа" in s.achievements, "first_win")
	s = Profile.apply_battle_result(_res({"kills": 5}))
	_ok("Ас" in s.achievements, "ace")
	s = Profile.apply_battle_result(_res({"ground_kills": 6}))
	_ok(not "Штурмовик" in s.achievements, "ground_10 ещё нет при 6")
	s = Profile.apply_battle_result(_res({"ground_kills": 4}))
	_ok("Штурмовик" in s.achievements, "ground_10 по сумме за бои")
	s = Profile.apply_battle_result(_res({"landings": 1}))
	_ok("Посадка" in s.achievements, "landing")
	s = Profile.apply_battle_result(_res({"cobra": true}))
	_ok("Кобра" in s.achievements, "cobra")
	for i in 3:
		s = Profile.apply_battle_result(_res({}))
	print("[qa] battles=", Profile.data.stats.battles, " ach=", s.achievements)
	_ok(Profile.has_achievement("battles_10"), "battles_10 на 10-м бою")
	s = Profile.apply_battle_result(_res({"mode": "realistic", "outcome": "win"}))
	_ok("Реализм" in s.achievements, "realistic_win")
	Profile.data.research_xp["mirage"] = 0
	Profile.data.researched.append_array(["krechet", "sokol", "mirage"])
	s = Profile.apply_battle_result(_res({"xp_by_plane": {"strizh": 20000}}))
	print("[qa] research=", s.research, " ach=", s.achievements)
	_ok("Третий ранг" in s.achievements, "rank3")
	print("[qa] all achievements: ", Profile.data.achievements.size(), "/", Data.ACHIEVEMENTS.size())
	# в обучении/тесте
	_fresh()
	s = Profile.apply_battle_result(_res({"mode": "training", "outcome": "win", "landings": 1}))
	print("[qa] training win+landing ach=", s.achievements, " stats.battles=", Profile.data.stats.battles, " wins=", Profile.data.stats.wins)
	s = Profile.apply_battle_result(_res({"mode": "test", "kills": 5, "cobra": true}))
	print("[qa] test ach=", s.achievements)


func _ranks() -> void:
	print("\n[qa] ===== звания")
	_fresh()
	for xp in [0, 1999, 2000, 7999, 8000, 20000, 44999, 45000, 90000, 500000]:
		Profile.data.total_xp = xp
		var r := Profile.player_rank()
		print("[qa]   xp=%d -> %s next=%d" % [xp, r.name, r.next_xp])
	Profile.data.total_xp = 1900
	var s := Profile.apply_battle_result(_res({"xp_by_plane": {"strizh": 200}}))
	print("[qa] rank_up=", s.rank_up)
	_ok(String(s.rank_up) == "Пилот", "повышение до Пилота в сводке")


func _matchmaking() -> void:
	print("\n[qa] ===== подбор по уровню")
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	var cases := [["strizh"], ["strizh", "shmel"], ["sokol"], ["flanker"], ["groza"], ["prizrak"], ["krechet", "burevestnik"]]
	for lu in cases:
		var level := Matchmaker.lineup_level(lu)
		for size in [4, 8]:
			var counts := {}
			var lo := 99.0
			var hi := -99.0
			var outside := 0
			var total := 0
			var sum_diff := 0.0
			for it in 400:
				var teams: Array = Matchmaker.make_teams(level, size, rng, level)
				var t0 := level
				var t1 := 0.0
				for side in 2:
					for b in teams[side]:
						var lv := float(Data.plane(String(b.def_id)).level)
						counts[b.def_id] = int(counts.get(b.def_id, 0)) + 1
						lo = minf(lo, lv - level)
						hi = maxf(hi, lv - level)
						if absf(lv - level) > 1.0 + 0.001:
							outside += 1
						total += 1
						if side == 0:
							t0 += lv
						else:
							t1 += lv
				sum_diff += t0 - t1
			var parts: Array = []
			for id in Data.ORDER:
				if counts.has(id):
					parts.append("%s(%s)=%d%%" % [id, Data.level_text(Data.plane(id).level), int(round(100.0 * counts[id] / total))])
			print("[qa]   lineup=%s level=%.1f size=%d: range %+.1f..%+.1f outside±1=%d/%d avg team diff=%+.2f  %s" % [
				lu, level, size, lo, hi, outside, total, sum_diff / 400.0, ", ".join(parts)])
			_ok(lo >= -1.0 - 0.001 and hi <= 1.0 + 0.001, "подбор %s размер %d в пределах ±1.0" % [str(lu), size])


func _settings_persist() -> void:
	print("\n[qa] ===== настройки (сохранение/перезагрузка)")
	_fresh()
	var vals := {"graphics": "high", "sensitivity": 1.55, "invert_y": true, "fov": 82.0, "engine_volume": 0.35,
		"effects_volume": 0.15, "player_name": "Тестер", "touch": "on", "show_fps": true, "control": "keyboard",
		"button_scale": 1.3, "left_handed": true}
	for k in vals:
		Profile.set_setting(k, vals[k])
	var text := FileAccess.get_file_as_string(TMP)
	print("[qa] file size=%d" % text.length())
	Profile.data = {}
	Profile.load_profile()
	for k in vals:
		var v = Profile.get_setting(k)
		var same: bool = (typeof(v) == TYPE_FLOAT and absf(float(v) - float(vals[k])) < 0.0001) or v == vals[k]
		_ok(same, "настройка %s = %s после перезагрузки (получено %s)" % [k, vals[k], v])
	# мусорные значения
	Profile.set_setting("graphics", "ultra")
	Profile.set_setting("fov", 200)
	Profile.set_setting("sensitivity", -5)
	Profile.set_setting("player_name", "   ")
	Profile.set_setting("player_name", "ОченьДлинныйПозывной12345")
	print("[qa] after junk: graphics=%s fov=%s sens=%s name=%s" % [Profile.get_setting("graphics"), Profile.get_setting("fov"),
		Profile.get_setting("sensitivity"), Profile.get_setting("player_name")])


func _corrupted() -> void:
	print("\n[qa] ===== повреждённый профиль")
	var cases := {
		"garbage": "{{{ not json",
		"array": "[1,2,3]",
		"empty": "",
		"truncated": "{\"credits\": 12000, \"owned\": [\"strizh\", \"krec",
		"wrong_types": "{\"credits\": \"много\", \"owned\": \"strizh\", \"lineup\": [\"flanker\", 5, null], \"settings\": {\"fov\": \"x\", \"graphics\": 3}, \"stats\": [], \"logbook\": {\"a\":1}, \"total_xp\": -50, \"research_xp\": {\"mirage\": \"abc\"}, \"camo\": {\"strizh\": 5}, \"last_setup\": {\"size\": \"8\", \"mode\": \"test\"}}",
		"negative": "{\"credits\": -400, \"total_xp\": 1e12, \"owned\": [\"flanker\"], \"lineup\": [\"flanker\",\"flanker\",\"strizh\"]}",
		"nan": "{\"credits\": 1e400}",
	}
	cases["camo_num"] = "{\"camo\": {\"strizh\": 5}}"
	cases["lineup_num"] = "{\"lineup\": [\"strizh\", 5]}"
	cases["owned_num"] = "{\"owned\": [\"strizh\", 7]}"
	cases["ach_num"] = "{\"achievements\": [1]}"
	cases["setup_num"] = "{\"last_setup\": {\"mode\": 1, \"map_id\": 2}}"
	cases["stats_str"] = "{\"stats\": {\"battles\": \"x\"}}"
	cases["ps_str"] = "{\"plane_stats\": {\"strizh\": {\"kills\": \"x\"}}}"
	cases["logbook_bad"] = "{\"logbook\": [{\"planes\": 5, \"kills\": \"x\", \"outcome\": 3}]}"
	for k in cases:
		_one_corrupt(k, cases[k])


func _one_corrupt(k: String, text: String) -> void:
	Profile.save_path = TMP
	var f := FileAccess.open(TMP, FileAccess.WRITE)
	f.store_string(text)
	f.close()
	Profile.data = {}
	Profile.load_profile()
	var d: Dictionary = Profile.data
	if not d.has("credits"):
		print("[qa]   %s -> ПРОФИЛЬ ПУСТОЙ после load_profile (data=%s)" % [k, d])
		_ok(false, "профиль '%s' загружается" % k)
		return
	print("[qa]   %s -> credits=%s owned=%s lineup=%s fov=%s graphics=%s total_xp=%s camo=%s setup=%s rank=%s" % [k, d.credits, d.owned,
		Profile.get_lineup(), Profile.get_setting("fov"), Profile.get_setting("graphics"), d.total_xp, d.camo, d.last_setup,
		Profile.player_rank().name])
	var s := Profile.apply_battle_result(_res({}))
	_ok(s is Dictionary and s.has("credits_delta"), "бой применяется к профилю после '%s'" % k)


func _idempotency() -> void:
	print("\n[qa] ===== повторное применение")
	_fresh()
	var r := _res({"credits": 700})
	var s1 := Profile.apply_battle_result(r)
	var c1 := int(Profile.data.credits)
	var s2 := Profile.apply_battle_result(r)
	_ok(int(Profile.data.credits) == c1 and s1 == s2, "повторный вызов с тем же итогом ничего не меняет")
	# два разных боя с одинаковым итогом (быстрый выход дважды)
	var q := {"mode": "arcade", "map_id": "canyon", "outcome": "exit", "duration": 0.0, "planes_used": [], "kills": 0,
		"ground_kills": 0, "assists": 0, "deaths": 0, "captures": 0, "landings": 0, "score": 0, "xp_by_plane": {},
		"credits": 0, "scoreboard": [], "time_of_day": "day", "weather": "clear", "cobra": false}
	var b0 := int(Profile.data.stats.battles)
	Profile.apply_battle_result(q.duplicate(true))
	Profile.apply_battle_result(q.duplicate(true))
	print("[qa] two identical exit results: battles %d -> %d, logbook=%d" % [b0, Profile.data.stats.battles, Profile.data.logbook.size()])
