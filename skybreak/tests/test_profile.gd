extends RefCounted
## Профиль игрока, исследования, покупки, сетап, камуфляжи, достижения, итог боя,
## а также дымовая проверка сцен ангара и итогов. Реальный профиль не трогается.

const ProfileScript := preload("res://autoload/profile.gd")
const TMP := "user://test_profile_tmp.json"
const TMP_UI := "user://test_profile_ui.json"

var errors: Array = []
var _made: Array = []


func check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


func eq(a, b, msg: String) -> void:
	if typeof(a) != typeof(b) or a != b:
		errors.append("%s: ожидалось %s, получено %s" % [msg, str(b), str(a)])


func _rm(path: String) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)


func fresh(path: String = TMP):
	_rm(path)
	var p = ProfileScript.new()
	p.save_path = path
	p.load_profile()
	_made.append(p)
	return p


func battle(extra: Dictionary) -> Dictionary:
	var r := {"mode": "arcade", "map_id": "canyon", "outcome": "loss", "duration": 300.0 + randf() * 100.0,
		"planes_used": ["strizh"], "kills": 0, "ground_kills": 0, "assists": 0, "deaths": 0, "captures": 0,
		"landings": 0, "score": 0, "xp_by_plane": {}, "credits": 0, "scoreboard": [], "time_of_day": "day",
		"weather": "clear", "cobra": false}
	r.merge(extra, true)
	return r


func run(tree: SceneTree) -> Array:
	errors = []
	var real_path: String = Profile.save_path
	var real_before := FileAccess.get_file_as_string(real_path) if FileAccess.file_exists(real_path) else "<нет>"

	test_defaults()
	test_states()
	test_research_flow()
	test_research_default_target()
	test_buy()
	test_lineup()
	test_camos()
	test_achievements()
	test_apply_modes()
	test_credits_never_negative()
	test_logbook_and_rank()
	test_json_roundtrip()
	test_forward_compat()
	test_settings()
	test_text()
	await test_ui(tree)

	for p in _made:
		if is_instance_valid(p):
			p.free()
	_made.clear()
	_rm(TMP)
	_rm(TMP_UI)
	_rm(TMP + ".tmp")
	var real_after := FileAccess.get_file_as_string(real_path) if FileAccess.file_exists(real_path) else "<нет>"
	check(real_before == real_after, "тест изменил настоящий профиль")
	eq(Profile.save_path, real_path, "путь профиля восстановлен")
	return errors


# ---------------------------------------------------------------- профиль

func test_defaults() -> void:
	var p = fresh()
	eq(int(p.data.version), ProfileScript.VERSION, "версия")
	eq(int(p.data.credits), int(Data.ECONOMY.start_credits), "стартовые кредиты")
	eq(p.data.owned, Data.STARTER_PLANES, "куплены стартовые")
	eq(p.data.researched, Data.STARTER_PLANES, "исследованы стартовые")
	eq(p.get_lineup(), Data.STARTER_PLANES, "сетап из стартовых")
	eq(int(p.data.total_xp), 0, "опыт 0")
	eq(p.get_setting("fov"), Data.DEFAULT_SETTINGS.fov, "настройка по умолчанию")
	eq(p.player_rank().name, "Кадет", "звание новичка")
	eq(int(p.player_rank().next_xp), 2000, "следующее звание")
	eq(p.plane_stats("strizh"), {"battles": 0, "kills": 0, "wins": 0, "xp": 0, "ground_kills": 0}, "пустая статистика")
	check(not FileAccess.file_exists(TMP), "новый профиль не пишет файл до изменений")
	for k in ["version", "credits", "total_xp", "owned", "researched", "research_xp", "research_focus", "plane_stats",
			"camo", "lineup", "logbook", "achievements", "settings", "stats"]:
		check(p.data.has(k), "нет ключа " + k)


func test_states() -> void:
	var p = fresh()
	eq(p.plane_state("strizh"), "owned", "стриж куплен")
	eq(p.plane_state("krechet"), "available", "кречет доступен")
	eq(p.plane_state("burevestnik"), "available", "буревестник доступен")
	eq(p.plane_state("sokol"), "locked", "сокол закрыт")
	eq(p.plane_state("groza"), "locked", "гроза закрыта")
	eq(p.plane_state("nope"), "locked", "неизвестный закрыт")
	p.data.researched.append("krechet")
	eq(p.plane_state("krechet"), "researched", "кречет исследован")
	eq(p.plane_state("sokol"), "available", "сокол доступен после кречета")
	check(p.is_owned("strizh") and not p.is_owned("krechet"), "is_owned")


func test_research_flow() -> void:
	var p = fresh()
	p.set_research_focus("sokol")
	eq(p.data.research_focus, "", "закрытый нельзя выбрать")
	p.set_research_focus("strizh")
	eq(p.data.research_focus, "", "купленный нельзя выбрать")
	p.set_research_focus("krechet")
	eq(p.data.research_focus, "krechet", "фокус на кречете")
	var s: Dictionary = p.apply_battle_result(battle({"outcome": "win", "kills": 2, "xp_by_plane": {"strizh": 1000}, "credits": 800}))
	eq(p.research_progress("krechet"), 1000, "опыт в фокус")
	eq(int(p.data.total_xp), 1000, "общий опыт")
	eq(int(p.plane_stats("strizh").xp), 1000, "опыт самолёта")
	eq(int(s.xp_total), 1000, "xp_total")
	eq(s.research.size(), 1, "одна запись исследования")
	if s.research.size() == 1:
		eq(s.research[0].id, "krechet", "запись про кречет")
		eq(int(s.research[0].need), 2500, "need")
		eq(bool(s.research[0].done), false, "не исследован")
	check(FileAccess.file_exists(TMP), "профиль сохранён после боя")
	# перелив: 1500 закрывают кречет, 500 уходят дальше (в сокол — первый доступный)
	s = p.apply_battle_result(battle({"outcome": "loss", "xp_by_plane": {"strizh": 2000}, "credits": 300}))
	eq(p.plane_state("krechet"), "researched", "кречет исследован переливом")
	eq(p.research_progress("krechet"), 2500, "прогресс исследованного = need")
	eq(p.data.research_focus, "", "фокус сброшен после исследования")
	eq(p.research_progress("sokol"), 500, "остаток ушёл в сокол")
	eq(s.research.size(), 2, "две записи исследования")
	if s.research.size() == 2:
		check(bool(s.research[0].done) and s.research[0].id == "krechet", "первая запись: кречет исследован")
		check(not bool(s.research[1].done) and s.research[1].id == "sokol" and int(s.research[1].have) == 500, "вторая запись: сокол 500")
	# огромный опыт проходит через несколько самолётов подряд
	s = p.apply_battle_result(battle({"xp_by_plane": {"strizh": 100000}, "credits": 0}))
	for id in ["sokol", "mirage", "flanker", "prizrak"]:
		check(p.is_researched(id), "перелив исследовал " + id)
	check(s.research.size() >= 4, "перелив записан в сводку")


func test_research_default_target() -> void:
	var p = fresh()
	# без фокуса опыт идёт в доступного потомка того самолёта, на котором заработан
	p.apply_battle_result(battle({"planes_used": ["shmel"], "xp_by_plane": {"shmel": 300}}))
	eq(p.research_progress("burevestnik"), 300, "опыт шмеля в буревестник")
	eq(p.research_progress("krechet"), 0, "кречет не тронут")
	eq(p.research_target("strizh"), "krechet", "цель для стрижа")
	p.set_research_focus("burevestnik")
	eq(p.research_target("strizh"), "burevestnik", "фокус важнее потомка")
	# если у самолёта нет доступных потомков — первый доступный по порядку дерева
	p.data.researched.append("krechet")
	p.data.research_focus = ""
	p.apply_battle_result(battle({"planes_used": ["krechet"], "xp_by_plane": {"krechet": 100}}))
	eq(p.research_progress("sokol"), 100, "кречет -> сокол")
	p.data.research_focus = ""
	p.data.researched.append("sokol")
	p.data.research_xp.erase("burevestnik")
	p.apply_battle_result(battle({"planes_used": ["shtorm"], "xp_by_plane": {"shtorm": 0}, "kills": 1}))
	eq(p.research_target("groza"), "mirage", "первый доступный в Data.ORDER")


func test_buy() -> void:
	var p = fresh()
	check(not p.buy("krechet"), "нельзя купить неисследованный")
	p.data.researched.append("krechet")
	var c := int(p.data.credits)
	check(p.buy("krechet"), "покупка кречета")
	eq(int(p.data.credits), c - 3000, "списана цена")
	check(p.is_owned("krechet"), "кречет куплен")
	check("krechet" in p.get_lineup(), "куплен — сразу в сетап")
	check(not p.buy("krechet"), "второй раз не купить")
	p.data.researched.append("sokol")
	p.data.credits = 100
	check(not p.buy("sokol"), "не хватает кредитов")
	eq(int(p.data.credits), 100, "кредиты не списаны")
	check(not p.is_owned("sokol"), "сокол не куплен")
	check(not p.buy("nope"), "неизвестный")


func test_lineup() -> void:
	var p = fresh()
	p.set_lineup_slot(0, "sokol")
	eq(p.get_lineup(), ["strizh", "shmel"], "не купленный не ставится")
	p.data.owned.append_array(["krechet", "sokol", "mirage"])
	p.data.researched.append_array(["krechet", "sokol", "mirage"])
	p.set_lineup_slot(2, "krechet")
	eq(p.get_lineup(), ["strizh", "shmel", "krechet"], "добавлен в пустой слот")
	p.set_lineup_slot(3, "strizh")
	eq(p.get_lineup(), ["strizh", "shmel", "krechet"], "без повторов")
	p.set_lineup_slot(0, "krechet")
	eq(p.get_lineup(), ["krechet", "shmel", "strizh"], "повтор меняется местами")
	p.set_lineup_slot(1, "sokol")
	eq(p.get_lineup(), ["krechet", "sokol", "strizh"], "замена")
	p.set_lineup_slot(3, "shmel")
	eq(p.get_lineup().size(), 4, "четыре слота")
	p.set_lineup_slot(4, "mirage")
	p.set_lineup_slot(-1, "mirage")
	eq(p.get_lineup().size(), 4, "не больше четырёх")
	check(not p.add_to_lineup("mirage"), "сетап полон")
	p.set_lineup_slot(1, "")
	eq(p.get_lineup(), ["krechet", "strizh", "shmel"], "очистка слота")
	var lu: Array = p.get_lineup()
	lu.append("mirage")
	eq(p.get_lineup().size(), 3, "get_lineup отдаёт копию")
	check(p.add_to_lineup("mirage"), "add_to_lineup")
	for i in 4:
		p.set_lineup_slot(0, "")
	eq(p.get_lineup(), [], "можно очистить весь сетап")


func test_camos() -> void:
	var p = fresh()
	check(p.is_camo_unlocked("strizh", "factory"), "заводская открыта")
	check(not p.is_camo_unlocked("strizh", "desert"), "пустыня закрыта")
	check(not p.is_camo_unlocked("strizh", "nope"), "неизвестный камуфляж")
	eq(p.camo_unlock_text("strizh", "desert"), "Сбей 5 самолётов на Стриже", "текст пустыни")
	eq(p.camo_unlock_text("strizh", "winter"), "Проведи 10 боёв на Стриже", "текст зимы")
	eq(p.camo_unlock_text("strizh", "night"), "Выиграй 5 боёв на Стриже", "текст ночи")
	eq(p.camo_unlock_text("groza", "desert"), "Сбей 5 самолётов на Грозе", "падеж: Гроза")
	eq(p.camo_unlock_text("shmel", "desert"), "Сбей 5 самолётов на Шмеле", "падеж: Шмель")
	eq(p.camo_unlock_text("strizh", "factory"), "", "у заводской нет условия")
	p.select_camo("strizh", "desert")
	eq(p.selected_camo("strizh"), "factory", "закрытый не выбрать")
	var s: Dictionary = p.apply_battle_result(battle({"outcome": "win", "kills": 5, "xp_by_plane": {"strizh": 500}}))
	check(p.is_camo_unlocked("strizh", "desert"), "пустыня открыта после 5 сбитых")
	check("Пустыня (Стриж)" in s.camos, "новый камуфляж в сводке: " + str(s.camos))
	eq(p.camo_unlock_progress("strizh", "desert"), [5, 5], "прогресс камуфляжа")
	p.select_camo("strizh", "desert")
	eq(p.selected_camo("strizh"), "desert", "выбран открытый")
	# сбитые делятся между самолётами по опыту
	var p2 = fresh()
	p2.apply_battle_result(battle({"planes_used": ["strizh", "shmel"], "kills": 3, "ground_kills": 4,
		"xp_by_plane": {"strizh": 300, "shmel": 100}}))
	eq(int(p2.plane_stats("strizh").kills) + int(p2.plane_stats("shmel").kills), 3, "сбитые не теряются при делении")
	eq(int(p2.plane_stats("strizh").kills), 2, "больше опыта — больше сбитых")
	eq(int(p2.plane_stats("shmel").ground_kills) + int(p2.plane_stats("strizh").ground_kills), 4, "наземные не теряются")
	eq(int(p2.plane_stats("shmel").battles), 1, "бой засчитан каждому самолёту")


func test_achievements() -> void:
	var p = fresh()
	check(p.grant_achievement("first_battle"), "новое достижение")
	check(not p.grant_achievement("first_battle"), "повторно не выдаётся")
	check(not p.grant_achievement("nope"), "неизвестное")
	p = fresh()
	var s: Dictionary = p.apply_battle_result(battle({"outcome": "win", "kills": 5, "landings": 1, "cobra": true,
		"xp_by_plane": {"strizh": 100}, "mode": "realistic"}))
	for id in ["first_battle", "first_kill", "first_win", "ace", "landing", "cobra", "realistic_win"]:
		check(p.has_achievement(id), "достижение " + id)
		check(String(Data.ACHIEVEMENTS[id].name) in s.achievements, "в сводке " + id)
	check(not p.has_achievement("battles_10"), "10 боёв ещё нет")
	check(not p.has_achievement("ground_10"), "наземных ещё нет")
	for i in 9:
		p.apply_battle_result(battle({"ground_kills": 2, "xp_by_plane": {"strizh": 10 + i}}))
	check(p.has_achievement("battles_10"), "10 боёв")
	check(p.has_achievement("ground_10"), "10 наземных целей")
	check(not p.has_achievement("rank3"), "третьего ранга нет")
	p.data.researched.append_array(["krechet", "sokol", "mirage"])
	p.set_research_focus("flanker")
	s = p.apply_battle_result(battle({"xp_by_plane": {"strizh": 20000}}))
	check(p.is_researched("flanker"), "фланкер исследован")
	check(p.has_achievement("rank3"), "третий ранг")
	check("Третий ранг" in s.achievements, "третий ранг в сводке")
	# в аркаде победа не даёт достижение реализма
	var p2 = fresh()
	p2.apply_battle_result(battle({"outcome": "win", "xp_by_plane": {"strizh": 10}}))
	check(p2.has_achievement("first_win") and not p2.has_achievement("realistic_win"), "реализм только в реализме")


func test_apply_modes() -> void:
	# тестовый полёт ничего не меняет
	var p = fresh()
	var before := JSON.stringify(p.data)
	var s: Dictionary = p.apply_battle_result(battle({"mode": "test", "kills": 3, "xp_by_plane": {"strizh": 999}, "credits": 999}))
	eq(JSON.stringify(p.data), before, "тестовый полёт не меняет профиль")
	eq(int(s.credits_delta), 0, "тест: кредитов 0")
	eq(int(s.xp_total), 0, "тест: опыта 0")
	check(s.has("research") and s.has("achievements") and s.has("camos") and s.has("rank_up"), "тест: все ключи сводки")
	# победа
	var c0 := int(p.data.credits)
	s = p.apply_battle_result(battle({"outcome": "win", "kills": 1, "xp_by_plane": {"strizh": 400}, "credits": 900}))
	eq(int(s.credits_earned), 900, "заработано")
	eq(int(s.repair_cost), 0, "без потерь ремонта нет")
	eq(int(p.data.credits), c0 + 900, "победа: кредиты")
	eq(int(p.data.stats.wins), 1, "победа засчитана")
	eq(int(p.plane_stats("strizh").wins), 1, "победа самолёта")
	# поражение с потерей: ремонт за использованный самолёт
	c0 = int(p.data.credits)
	s = p.apply_battle_result(battle({"outcome": "loss", "deaths": 1, "xp_by_plane": {"strizh": 100}, "credits": 500}))
	eq(int(s.repair_cost), 150, "ремонт стрижа")
	eq(int(s.credits_delta), 350, "итог боя")
	eq(int(p.data.credits), c0 + 350, "поражение: кредиты")
	eq(int(p.data.stats.wins), 1, "поражение не победа")
	eq(int(p.data.stats.deaths), 1, "потери в статистике")
	# две гибели на двух самолётах
	s = p.apply_battle_result(battle({"planes_used": ["strizh", "shmel"], "deaths": 2, "credits": 1000,
		"xp_by_plane": {"strizh": 50, "shmel": 50}}))
	eq(int(s.repair_cost), 350, "ремонт стрижа и шмеля")
	# явный список потерь
	s = p.apply_battle_result(battle({"planes_used": ["strizh", "shmel"], "deaths": 3, "lost_planes": ["shmel", "shmel"],
		"credits": 1000, "xp_by_plane": {"strizh": 51}}))
	eq(int(s.repair_cost), 400, "ремонт по lost_planes")
	# выход из боя всё равно пишется в журнал
	var n: int = p.data.logbook.size()
	var battles := int(p.data.stats.battles)
	s = p.apply_battle_result(battle({"outcome": "exit", "xp_by_plane": {"strizh": 30}, "credits": 40}))
	eq(p.data.logbook.size(), n + 1, "выход записан в журнал")
	eq(p.data.logbook[0].outcome, "exit", "исход выхода")
	eq(int(p.data.stats.battles), battles + 1, "выход считается боем")
	# обучение: награда есть, бой не считается, ремонта нет
	battles = int(p.data.stats.battles)
	c0 = int(p.data.credits)
	s = p.apply_battle_result(battle({"mode": "training", "outcome": "win", "deaths": 1, "credits": 200,
		"xp_by_plane": {"strizh": 100}}))
	eq(int(p.data.stats.battles), battles, "обучение не бой")
	eq(int(s.repair_cost), 0, "в обучении нет ремонта")
	eq(int(p.data.credits), c0 + 200, "награда за обучение")
	eq(p.data.logbook[0].mode, "training", "обучение в журнале")
	# повторное применение того же итога ничего не меняет
	var r := battle({"outcome": "win", "credits": 777, "xp_by_plane": {"strizh": 77}})
	var s1: Dictionary = p.apply_battle_result(r)
	c0 = int(p.data.credits)
	n = p.data.logbook.size()
	var s2: Dictionary = p.apply_battle_result(r)
	eq(int(p.data.credits), c0, "повтор итога не начисляет кредиты")
	eq(p.data.logbook.size(), n, "повтор итога не пишет журнал")
	eq(int(s2.credits_delta), int(s1.credits_delta), "повтор отдаёт ту же сводку")


func test_credits_never_negative() -> void:
	var p = fresh()
	p.data.credits = 0
	p.data.owned.append("flanker")
	var s: Dictionary = p.apply_battle_result(battle({"planes_used": ["flanker"], "deaths": 3, "credits": 100,
		"xp_by_plane": {"flanker": 10}}))
	eq(int(s.credits_delta), 0, "итог не ниже 0")
	eq(int(p.data.credits), 0, "кредиты не ушли в минус")
	eq(int(s.repair_full), 5400, "полная цена ремонта")
	eq(int(s.repair_cost), 100, "ремонт не больше заработка")
	p.data.credits = 50
	s = p.apply_battle_result(battle({"planes_used": ["flanker"], "deaths": 1, "credits": 0, "xp_by_plane": {"flanker": 11}}))
	eq(int(p.data.credits), 50, "ремонт без заработка не списывает")
	s = p.apply_battle_result(battle({"credits": -500, "xp_by_plane": {"strizh": -100}, "kills": -3}))
	eq(int(p.data.credits), 50, "отрицательные награды игнорируются")
	check(int(p.data.total_xp) >= 0, "опыт не отрицательный")


func test_logbook_and_rank() -> void:
	var p = fresh()
	for i in 55:
		p.apply_battle_result(battle({"kills": i % 7, "credits": 10 * i, "xp_by_plane": {"strizh": 1 + i}, "map_id": "fjord"}))
	eq(p.data.logbook.size(), 50, "журнал не длиннее 50")
	var e: Dictionary = p.data.logbook[0]
	eq(int(e.kills), 54 % 7, "новые записи сверху")
	for k in ["date", "mode", "map_id", "outcome", "planes", "kills", "ground_kills", "deaths", "xp", "credits"]:
		check(e.has(k), "в записи журнала нет " + k)
	eq(e.map_id, "fjord", "карта в журнале")
	eq(e.planes, ["strizh"], "самолёты в журнале")
	check(String(e.date).length() >= 16, "дата в журнале")
	p.data.total_xp = 2500
	eq(p.player_rank().name, "Пилот", "звание по опыту")
	eq(int(p.player_rank().next_xp), 8000, "следующий порог")
	p.data.total_xp = 7999
	var s: Dictionary = p.apply_battle_result(battle({"xp_by_plane": {"strizh": 5}}))
	eq(s.rank_up, "Лейтенант", "повышение в сводке")
	p.data.total_xp = 1000000
	eq(p.player_rank().name, "Полковник", "высшее звание")
	eq(int(p.player_rank().next_xp), 0, "у высшего звания нет следующего")


func test_json_roundtrip() -> void:
	var p = fresh()
	p.data.researched.append("krechet")
	p.buy("krechet")
	p.set_research_focus("sokol")
	p.apply_battle_result(battle({"outcome": "win", "kills": 5, "xp_by_plane": {"krechet": 1234}, "credits": 4321,
		"planes_used": ["krechet"]}))
	p.select_camo("krechet", "desert")
	p.set_setting("sensitivity", 1.35)
	p.set_setting("invert_y", true)
	p.set_last_setup({"mode": "realistic", "size": 8, "map_id": "reef"})
	var q = ProfileScript.new()
	_made.append(q)
	q.save_path = TMP
	q.load_profile()
	for k in ["credits", "total_xp", "owned", "researched", "research_xp", "research_focus", "plane_stats", "camo",
			"lineup", "achievements", "stats", "settings", "last_setup"]:
		eq(JSON.stringify(q.data[k]), JSON.stringify(p.data[k]), "JSON: " + k)
	eq(typeof(q.data.credits), TYPE_INT, "кредиты int после загрузки")
	eq(typeof(q.data.research_xp.sokol), TYPE_INT, "опыт исследования int")
	eq(typeof(q.plane_stats("krechet").kills), TYPE_INT, "статистика int")
	eq(q.data.logbook.size(), p.data.logbook.size(), "журнал после загрузки")
	eq(q.selected_camo("krechet"), "desert", "камуфляж после загрузки")
	eq(q.get_setting("invert_y"), true, "bool после загрузки")
	eq(q.get_last_setup().size, 8, "размер боя int")
	eq(q.get_last_setup().mode, "realistic", "режим сохранён")


func test_forward_compat() -> void:
	_rm(TMP)
	var f := FileAccess.open(TMP, FileAccess.WRITE)
	f.store_string(JSON.stringify({"version": 99, "credits": 777, "owned": ["krechet", "bad_id"], "lineup": ["krechet", "krechet", "sokol"],
		"future_key": {"a": 1}, "settings": {"fov": 300, "graphics": "ultra", "new_option": 1}, "stats": "garbage",
		"research_xp": {"sokol": 12.0, "zzz": 5}}))
	f.close()
	var p = ProfileScript.new()
	_made.append(p)
	p.save_path = TMP
	p.load_profile()
	eq(int(p.data.credits), 777, "кредиты из файла")
	eq(int(p.data.version), 99, "версия файла сохранена")
	check(p.data.has("future_key"), "неизвестный ключ не потерян")
	check(p.is_owned("strizh") and p.is_owned("shmel"), "стартовые добавлены")
	check(p.is_owned("krechet") and p.is_researched("krechet"), "купленный считается исследованным")
	check(not "bad_id" in p.data.owned, "мусорный id убран")
	eq(p.get_lineup(), ["krechet"], "сетап без повторов и некупленных")
	eq(p.get_setting("fov"), 90.0, "настройка зажата в диапазон")
	eq(p.get_setting("graphics"), "medium", "неверное значение заменено")
	eq(p.get_setting("sensitivity"), Data.DEFAULT_SETTINGS.sensitivity, "недостающая настройка из умолчаний")
	eq(int(p.data.stats.battles), 0, "битая статистика заменена")
	eq(p.research_progress("sokol"), 12, "опыт исследования")
	check(not p.data.research_xp.has("zzz"), "мусор в research_xp убран")
	check(p.data.has("logbook") and p.data.logbook is Array, "журнал добавлен")
	# битый файл
	f = FileAccess.open(TMP, FileAccess.WRITE)
	f.store_string("{not json")
	f.close()
	p.load_profile()
	eq(int(p.data.credits), int(Data.ECONOMY.start_credits), "битый файл -> новый профиль")


func test_settings() -> void:
	var p = fresh()
	p.set_setting("sensitivity", 5.0)
	eq(p.get_setting("sensitivity"), 2.0, "чувствительность зажата")
	p.set_setting("graphics", "ultra")
	eq(p.get_setting("graphics"), "medium", "неверная графика")
	p.set_setting("graphics", "high")
	eq(p.get_setting("graphics"), "high", "графика")
	p.set_setting("player_name", "  Очень длинный позывной пилота  ")
	eq(String(p.get_setting("player_name")).length(), 16, "позывной до 16 символов")
	p.set_setting("player_name", "   ")
	eq(p.get_setting("player_name"), Data.DEFAULT_SETTINGS.player_name, "пустой позывной")
	var fired := [0]
	p.changed.connect(func(): fired[0] += 1)
	p.set_setting("show_fps", true)
	eq(fired[0], 1, "changed при изменении настройки")
	p.set_setting("show_fps", true)
	eq(fired[0], 1, "без изменения сигнала нет")
	p.reset_progress()
	eq(p.get_setting("show_fps"), true, "сброс прогресса сохраняет настройки")
	eq(int(p.data.credits), int(Data.ECONOMY.start_credits), "сброс прогресса")


func test_text() -> void:
	eq(ProfileScript.plural(1, "бой", "боя", "боёв"), "бой", "1 бой")
	eq(ProfileScript.plural(3, "бой", "боя", "боёв"), "боя", "3 боя")
	eq(ProfileScript.plural(11, "бой", "боя", "боёв"), "боёв", "11 боёв")
	eq(ProfileScript.plural(22, "бой", "боя", "боёв"), "боя", "22 боя")
	eq(ProfileScript.name_prepositional("Стриж"), "Стриже", "на Стриже")
	eq(ProfileScript.name_prepositional("Буревестник"), "Буревестнике", "на Буревестнике")
	var K = load("res://scripts/ui/menu_kit.gd")
	eq(K.weapon_lines(Data.plane("shmel")), ["2 × 20 мм", "2 × 7,62 мм", "8 ракет", "4 бомбы по 100 кг"], "вооружение шмеля")
	eq(K.weapon_lines(Data.plane("flanker"))[1], "6 ракет «воздух-воздух»", "ракеты фланкера")
	var kmh: float = K.top_speed_estimate(Data.plane("krechet")) * 3.6
	check(kmh > 450.0 and kmh < 750.0, "скорость кречета правдоподобна: %d" % int(kmh))
	check(K.top_speed_estimate(Data.plane("flanker")) > K.top_speed_estimate(Data.plane("sokol")), "фланкер быстрее сокола")
	eq(K.short_date("2026-11-27 14:05:33"), "27.11 14:05", "короткая дата")
	eq(K.map_name("random"), "Случайная", "случайная карта")
	eq(K.outcome_text("exit"), "Бой покинут", "текст выхода")


# ---------------------------------------------------------------- сцены

func test_ui(tree: SceneTree) -> void:
	await tree.process_frame   # корень дерева может ещё достраиваться
	var real_path: String = Profile.save_path
	Profile.save_path = TMP_UI
	_rm(TMP_UI)
	Profile.load_profile()
	var hangar = load("res://scenes/hangar.tscn").instantiate()
	tree.root.add_child(hangar)
	for i in 3:
		await tree.process_frame
	eq(hangar.current_tab, "hangar", "ангар открывается на вкладке «Ангар»")
	check(hangar.showroom != null and hangar.showroom.is_inside_tree(), "витрина в сцене")
	var cfg: Dictionary = hangar.battle_config()
	eq(cfg.lineup, ["strizh", "shmel"], "сетап в конфиге боя")
	eq(cfg.mode, "arcade", "режим по умолчанию")
	eq(int(cfg.size), 4, "размер по умолчанию")
	check(not hangar._battle_btn.disabled, "«В бой» доступна со стартовым сетапом")
	for t in ["research", "logbook", "settings", "hangar"]:
		hangar.show_tab(t)
		await tree.process_frame
		eq(hangar.current_tab, t, "вкладка " + t)
	# переключение сенсорного режима перестраивает интерфейс и сохраняет вкладку
	hangar.show_tab("settings")
	Profile.set_setting("touch", "on")
	await tree.process_frame
	await tree.process_frame
	check(hangar._touch, "сенсорный режим включился")
	eq(hangar.current_tab, "settings", "вкладка сохранена после перестройки")
	check(hangar._top_bar.custom_minimum_size.y > 52, "крупная верхняя панель в сенсорном режиме")
	Profile.set_setting("touch", "off")
	await tree.process_frame
	await tree.process_frame
	check(not hangar._touch, "сенсорный режим выключился")
	hangar.show_tab("hangar")
	hangar._on_mode("realistic")
	hangar._on_size(8)
	hangar._on_map("fjord")
	eq(Profile.get_last_setup().mode, "realistic", "выбор режима запомнен")
	eq(int(Profile.get_last_setup().size), 8, "выбор размера запомнен")
	eq(Profile.get_last_setup().map_id, "fjord", "выбор карты запомнен")
	hangar.select_plane("krechet")
	eq(Profile.data.selected_plane, "krechet", "выбор самолёта запомнен")
	Profile.set_lineup_slot(0, "")
	Profile.set_lineup_slot(0, "")
	await tree.process_frame
	await tree.process_frame
	check(hangar._battle_btn.disabled, "пустой сетап блокирует «В бой»")
	eq(hangar._battle_reason.text, "Добавь самолёт в сетап", "причина блокировки")
	hangar._open_slot_menu(0)
	await tree.process_frame
	check(hangar._slot_menu != null and is_instance_valid(hangar._slot_menu), "меню слота открывается")
	hangar._on_slot_pick(0, "shmel")
	await tree.process_frame
	eq(Profile.get_lineup(), ["shmel"], "самолёт выбран через меню слота")
	hangar.queue_free()
	await tree.process_frame

	# итоги: применяются ровно один раз
	var prev_result: Dictionary = Game.last_result
	var prev_applied: bool = Game.result_applied
	Game.last_result = battle({"outcome": "win", "kills": 2, "xp_by_plane": {"shmel": 600}, "credits": 1500,
		"planes_used": ["shmel"], "scoreboard": [
			{"uid": 1, "name": "1DEX1", "team": 0, "plane": "Шмель", "plane_id": "shmel", "kills": 2, "ground": 1, "deaths": 0, "score": 500, "is_player": true},
			{"uid": 2, "name": "Иней", "team": 1, "plane": "Стриж", "plane_id": "strizh", "kills": 0, "ground": 0, "deaths": 2, "score": 20, "is_player": false}]})
	Game.result_applied = false
	var c0 := int(Profile.data.credits)
	var res = load("res://scenes/results.tscn").instantiate()
	tree.root.add_child(res)
	await tree.process_frame
	check(Game.result_applied, "итог помечен применённым")
	eq(int(Profile.data.credits), c0 + 1500, "кредиты за бой начислены")
	eq(int(res.summary.credits_delta), 1500, "сводка в экране итогов")
	res.queue_free()
	await tree.process_frame
	var res2 = load("res://scenes/results.tscn").instantiate()
	tree.root.add_child(res2)
	await tree.process_frame
	eq(int(Profile.data.credits), c0 + 1500, "повторное открытие итогов не начисляет снова")
	eq(int(res2.summary.credits_delta), 1500, "повторное открытие показывает ту же сводку")
	res2.queue_free()
	await tree.process_frame

	Game.last_result = prev_result
	Game.result_applied = prev_applied
	Profile.save_path = real_path
	Profile.load_profile()
	_rm(TMP_UI)
