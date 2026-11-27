extends Node
## Сохранение игрока: кредиты, опыт, исследования, состав, камуфляжи, журнал, достижения, настройки.
## Файл JSON в save_path. Сохраняется сразу после каждого изменения.

signal changed

const VERSION := 1
const LOGBOOK_MAX := 50
const LINEUP_MAX := 4
const BATTLE_MODES := ["arcade", "realistic"]

var save_path: String = "user://profile.json"
var data: Dictionary = {}
## false — изменения не пишутся на диск (для тестов и превью).
var autosave: bool = true


func _ready() -> void:
	load_profile()


# ---------------------------------------------------------------- загрузка и сохранение

func default_data() -> Dictionary:
	var starters: Array = Data.STARTER_PLANES.duplicate()
	return {
		"version": VERSION,
		"credits": int(Data.ECONOMY.start_credits),
		"total_xp": 0,
		"owned": starters.duplicate(),
		"researched": starters.duplicate(),
		"research_xp": {},
		"research_focus": "",
		"plane_stats": {},
		"camo": {},
		"lineup": starters.duplicate(),
		"logbook": [],
		"achievements": [],
		"settings": Data.DEFAULT_SETTINGS.duplicate(true),
		"stats": _default_stats(),
		"last_setup": default_setup(),
		"selected_plane": String(starters[0]) if starters.size() > 0 else "",
		"last_result_key": "",
		"last_summary": {},
	}


func default_setup() -> Dictionary:
	return {"mode": "arcade", "size": 4, "map_id": "random", "time_of_day": "random", "weather": "random"}


func _default_stats() -> Dictionary:
	return {"battles": 0, "wins": 0, "kills": 0, "ground_kills": 0, "deaths": 0, "landings": 0}


func load_profile() -> void:
	var raw = null
	if FileAccess.file_exists(save_path):
		var text := FileAccess.get_file_as_string(save_path)
		var json := JSON.new()
		if text != "" and json.parse(text) == OK:
			raw = json.data
		elif text != "":
			push_warning("Profile: файл повреждён, создан новый профиль")
	data = _sanitize(raw if raw is Dictionary else {})
	changed.emit()


func save_profile() -> void:
	var text := JSON.stringify(data, "\t")
	var tmp := save_path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		# запасной путь: пишем прямо в файл
		f = FileAccess.open(save_path, FileAccess.WRITE)
		if f == null:
			push_warning("Profile: не удалось сохранить " + save_path)
			return
		f.store_string(text)
		f.close()
		return
	f.store_string(text)
	f.close()
	if DirAccess.rename_absolute(tmp, save_path) != OK:
		var f2 := FileAccess.open(save_path, FileAccess.WRITE)
		if f2 != null:
			f2.store_string(text)
			f2.close()
		DirAccess.remove_absolute(tmp)


## Сбросить весь прогресс (настройки остаются).
func reset_progress() -> void:
	var keep: Dictionary = data.get("settings", {}).duplicate(true)
	data = default_data()
	data.settings = _sanitize_settings(keep)
	_commit()


func _commit() -> void:
	if autosave:
		save_profile()
	changed.emit()


## Заполняет недостающие ключи значениями по умолчанию, приводит типы, убирает мусор.
## Неизвестные ключи сохраняются (файл из более новой версии не теряет данные).
func _sanitize(src: Dictionary) -> Dictionary:
	var d := default_data()
	var out: Dictionary = src.duplicate(true)
	for k in d:
		if not out.has(k) or typeof(out[k]) != typeof(d[k]):
			if typeof(d[k]) == TYPE_INT and out.has(k) and typeof(out[k]) == TYPE_FLOAT:
				out[k] = int(out[k])
			else:
				out[k] = d[k]
	out.version = maxi(VERSION, int(out.version))
	out.credits = maxi(0, int(out.credits))
	out.total_xp = maxi(0, int(out.total_xp))
	# списки самолётов: только известные id, без повторов
	out.researched = _clean_ids(out.researched)
	out.owned = _clean_ids(out.owned)
	for id in Data.STARTER_PLANES:
		if not id in out.researched:
			out.researched.append(id)
		if not id in out.owned:
			out.owned.append(id)
	for id in out.owned:
		if not id in out.researched:
			out.researched.append(id)
	var rx: Dictionary = {}
	for id in out.research_xp:
		if Data.has_plane(String(id)):
			rx[String(id)] = maxi(0, int(out.research_xp[id]))
	out.research_xp = rx
	var focus := String(out.research_focus)
	out.research_focus = focus if Data.has_plane(focus) else ""
	var ps: Dictionary = {}
	for id in out.plane_stats:
		if Data.has_plane(String(id)) and out.plane_stats[id] is Dictionary:
			ps[String(id)] = _clean_plane_stats(out.plane_stats[id])
	out.plane_stats = ps
	var camo: Dictionary = {}
	for id in out.camo:
		if Data.has_plane(String(id)):
			camo[String(id)] = String(out.camo[id])
	out.camo = camo
	var lineup: Array = []
	for id in out.lineup:
		var s := String(id)
		if s in out.owned and not s in lineup and lineup.size() < LINEUP_MAX:
			lineup.append(s)
	out.lineup = lineup
	var book: Array = []
	for e in out.logbook:
		if e is Dictionary and book.size() < LOGBOOK_MAX:
			book.append(e)
	out.logbook = book
	var ach: Array = []
	for a in out.achievements:
		var s := String(a)
		if Data.ACHIEVEMENTS.has(s) and not s in ach:
			ach.append(s)
	out.achievements = ach
	out.settings = _sanitize_settings(out.settings)
	var st := _default_stats()
	for k in st:
		st[k] = maxi(0, int(out.stats.get(k, 0)))
	for k in out.stats:
		if not st.has(k):
			st[k] = out.stats[k]
	out.stats = st
	var setup := default_setup()
	for k in setup:
		if out.last_setup.has(k):
			setup[k] = out.last_setup[k]
	setup.size = 8 if int(setup.size) == 8 else 4
	setup.mode = String(setup.mode) if String(setup.mode) in BATTLE_MODES else "arcade"
	setup.map_id = String(setup.map_id)
	setup.time_of_day = String(setup.time_of_day) if Data.TIME_NAMES.has(String(setup.time_of_day)) else "random"
	setup.weather = String(setup.weather) if Data.WEATHER_NAMES.has(String(setup.weather)) else "random"
	out.last_setup = setup
	if not Data.has_plane(String(out.selected_plane)):
		out.selected_plane = d.selected_plane
	return out


func _clean_ids(list) -> Array:
	var res: Array = []
	if list is Array:
		for id in list:
			var s := String(id)
			if Data.has_plane(s) and not s in res:
				res.append(s)
	return res


func _clean_plane_stats(src: Dictionary) -> Dictionary:
	var st := {"battles": 0, "kills": 0, "wins": 0, "xp": 0, "ground_kills": 0}
	for k in st:
		st[k] = maxi(0, int(src.get(k, 0)))
	return st


func _sanitize_settings(src) -> Dictionary:
	var out: Dictionary = Data.DEFAULT_SETTINGS.duplicate(true)
	if src is Dictionary:
		for k in src:
			if out.has(k):
				out[k] = _coerce_setting(String(k), src[k])
			else:
				out[k] = src[k]
	return out


func _coerce_setting(key: String, value):
	var def = Data.DEFAULT_SETTINGS.get(key)
	match typeof(def):
		TYPE_BOOL:
			return bool(value) if (value is bool or value is int or value is float) else def
		TYPE_FLOAT:
			if value is float or value is int:
				var v := float(value)
				var r := setting_range(key)
				return clampf(v, r.x, r.y) if r != Vector2.ZERO else v
			return def
		TYPE_INT:
			return int(value) if (value is float or value is int) else def
		TYPE_STRING:
			var s := String(value) if value is String else String(def)
			var opts := setting_options(key)
			if not opts.is_empty() and not s in opts:
				return def
			if key == "player_name":
				s = s.strip_edges().left(16)
				if s == "":
					return def
			return s
	return value


## Допустимые значения строковых настроек.
func setting_options(key: String) -> Array:
	match key:
		"graphics":
			return ["low", "medium", "high"]
		"control":
			return ["mouse", "keyboard"]
		"touch":
			return ["auto", "on", "off"]
	return []


## Диапазон числовых настроек. Vector2.ZERO — без ограничений.
func setting_range(key: String) -> Vector2:
	match key:
		"sensitivity":
			return Vector2(0.3, 2.0)
		"button_scale":
			return Vector2(0.7, 1.5)
		"engine_volume", "effects_volume":
			return Vector2(0.0, 1.0)
		"fov":
			return Vector2(55.0, 90.0)
	return Vector2.ZERO


# ---------------------------------------------------------------- настройки

func get_setting(key: String):
	var s: Dictionary = data.get("settings", {})
	if s.has(key):
		return s[key]
	return Data.DEFAULT_SETTINGS.get(key)


func set_setting(key: String, value) -> void:
	if not data.has("settings"):
		data.settings = Data.DEFAULT_SETTINGS.duplicate(true)
	var v = _coerce_setting(key, value) if Data.DEFAULT_SETTINGS.has(key) else value
	if data.settings.has(key) and typeof(data.settings[key]) == typeof(v) and data.settings[key] == v:
		return
	data.settings[key] = v
	_commit()


# ---------------------------------------------------------------- самолёты и исследования

func plane_state(id: String) -> String:
	if not Data.has_plane(id):
		return "locked"
	if id in data.owned:
		return "owned"
	if id in data.researched:
		return "researched"
	var parent := String(Data.plane(id).parent)
	if parent == "" or parent in data.researched:
		return "available"
	return "locked"


func is_owned(id) -> bool:
	return String(id) in data.get("owned", [])


func is_researched(id) -> bool:
	return String(id) in data.get("researched", [])


func research_progress(id) -> int:
	var sid := String(id)
	var need := int(Data.plane(sid).get("research_xp", 0))
	if sid in data.researched:
		return need
	return mini(int(data.research_xp.get(sid, 0)), need)


func set_research_focus(id) -> void:
	var sid := String(id)
	if sid != "" and plane_state(sid) != "available":
		return
	if data.research_focus == sid:
		return
	data.research_focus = sid
	_commit()


## Куда пойдёт опыт, заработанный на самолёте from_id. "" — исследовать нечего.
func research_target(from_id: String = "") -> String:
	var focus := String(data.research_focus)
	if focus != "" and plane_state(focus) == "available":
		return focus
	if from_id != "":
		for c in Data.children_of(from_id):
			if plane_state(c) == "available":
				return c
	for id in Data.ORDER:
		if plane_state(id) == "available":
			return id
	return ""


func buy(id) -> bool:
	var sid := String(id)
	if plane_state(sid) != "researched":
		return false
	var price := int(Data.plane(sid).price)
	if int(data.credits) < price:
		return false
	data.credits = int(data.credits) - price
	data.owned.append(sid)
	if data.lineup.size() < LINEUP_MAX and not sid in data.lineup:
		data.lineup.append(sid)
	_commit()
	return true


func get_lineup() -> Array:
	var out: Array = []
	for id in data.get("lineup", []):
		if is_owned(id) and not id in out:
			out.append(String(id))
	return out


## slot 0..3. id = "" убирает самолёт из слота. Состав хранится без пустых мест.
func set_lineup_slot(slot: int, id: String) -> void:
	if slot < 0 or slot >= LINEUP_MAX:
		return
	var lineup: Array = get_lineup()
	if id == "":
		if slot < lineup.size():
			lineup.remove_at(slot)
		else:
			return
	else:
		if not is_owned(id):
			return
		var have := lineup.find(id)
		if slot < lineup.size():
			if have == slot:
				return
			if have >= 0:
				lineup[have] = lineup[slot]
			lineup[slot] = id
		else:
			if have >= 0:
				return
			lineup.append(id)
	data.lineup = lineup
	_commit()


## Добавить в первый свободный слот. false — уже в составе, не куплен или мест нет.
func add_to_lineup(id: String) -> bool:
	var lineup := get_lineup()
	if not is_owned(id) or id in lineup or lineup.size() >= LINEUP_MAX:
		return false
	set_lineup_slot(lineup.size(), id)
	return true


func get_selected_plane() -> String:
	var id := String(data.get("selected_plane", ""))
	if Data.has_plane(id):
		return id
	var lu := get_lineup()
	return String(lu[0]) if lu.size() > 0 else String(Data.ORDER[0])


func set_selected_plane(id: String) -> void:
	if not Data.has_plane(id) or data.get("selected_plane", "") == id:
		return
	data.selected_plane = id
	_commit()


func get_last_setup() -> Dictionary:
	return data.get("last_setup", default_setup()).duplicate()


func set_last_setup(setup: Dictionary) -> void:
	var s := get_last_setup()
	for k in setup:
		if s.has(k):
			s[k] = setup[k]
	if s == data.get("last_setup", {}):
		return
	data.last_setup = s
	_commit()


# ---------------------------------------------------------------- камуфляжи

func _camo_template(camo_id: String) -> Dictionary:
	for t in Data.CAMO_TEMPLATES:
		if t.id == camo_id:
			return t
	return {}


func selected_camo(plane_id) -> String:
	var pid := String(plane_id)
	var c := String(data.camo.get(pid, "factory"))
	if _camo_template(c).is_empty() or not is_camo_unlocked(pid, c):
		return "factory"
	return c


func select_camo(plane_id, camo_id) -> void:
	var pid := String(plane_id)
	var cid := String(camo_id)
	if not Data.has_plane(pid) or _camo_template(cid).is_empty() or not is_camo_unlocked(pid, cid):
		return
	if data.camo.get(pid, "factory") == cid:
		return
	data.camo[pid] = cid
	_commit()


## [есть, нужно] для условия открытия камуфляжа.
func camo_unlock_progress(plane_id, camo_id) -> Array:
	var t := _camo_template(String(camo_id))
	if t.is_empty():
		return [0, 0]
	var u: Dictionary = t.unlock
	var kind := String(u.type)
	if kind == "default":
		return [0, 0]
	var st := plane_stats(plane_id)
	return [int(st.get(kind, 0)), int(u.value)]


func is_camo_unlocked(plane_id, camo_id) -> bool:
	var t := _camo_template(String(camo_id))
	if t.is_empty() or not Data.has_plane(String(plane_id)):
		return false
	if String(t.unlock.type) == "default":
		return true
	var p := camo_unlock_progress(plane_id, camo_id)
	return int(p[0]) >= int(p[1])


func camo_unlock_text(plane_id, camo_id) -> String:
	var t := _camo_template(String(camo_id))
	if t.is_empty():
		return ""
	var n := int(t.unlock.value)
	var on := "на " + name_prepositional(String(Data.plane(String(plane_id)).get("name", "")))
	match String(t.unlock.type):
		"kills":
			return "Сбей %s %s %s" % [Game.fmt_int(n), plural(n, "самолёт", "самолёта", "самолётов"), on]
		"wins":
			return "Выиграй %s %s %s" % [Game.fmt_int(n), plural(n, "бой", "боя", "боёв"), on]
		"battles":
			return "Проведи %s %s %s" % [Game.fmt_int(n), plural(n, "бой", "боя", "боёв"), on]
	return ""


# ---------------------------------------------------------------- статистика и звание

func plane_stats(plane_id) -> Dictionary:
	var src = data.get("plane_stats", {}).get(String(plane_id), {})
	return _clean_plane_stats(src if src is Dictionary else {})


func player_rank() -> Dictionary:
	var xp := int(data.get("total_xp", 0))
	var idx := 0
	for i in Data.PLAYER_RANKS.size():
		if xp >= int(Data.PLAYER_RANKS[i].xp):
			idx = i
	var cur: Dictionary = Data.PLAYER_RANKS[idx]
	var next_xp := 0   # 0 — высшее звание
	if idx + 1 < Data.PLAYER_RANKS.size():
		next_xp = int(Data.PLAYER_RANKS[idx + 1].xp)
	return {"name": String(cur.name), "xp": xp, "next_xp": next_xp, "index": idx, "rank_xp": int(cur.xp)}


func has_achievement(id: String) -> bool:
	return id in data.get("achievements", [])


func grant_achievement(id: String) -> bool:
	if not Data.ACHIEVEMENTS.has(id) or has_achievement(id):
		return false
	data.achievements.append(id)
	_commit()
	return true


# ---------------------------------------------------------------- итог боя

func _empty_summary() -> Dictionary:
	return {"credits_earned": 0, "repair_cost": 0, "repair_full": 0, "credits_delta": 0, "xp_total": 0,
		"research": [], "achievements": [], "camos": [], "rank_up": ""}


## Применяет итог боя (Game.last_result) к профилю. Повторный вызов с тем же итогом ничего не меняет
## и возвращает ту же сводку.
func apply_battle_result(result: Dictionary) -> Dictionary:
	var summary := _empty_summary()
	var mode := String(result.get("mode", "arcade"))
	if mode == "test" or result.is_empty():
		return summary
	var key := str(JSON.stringify(result).hash())
	if key == String(data.get("last_result_key", "")) and data.get("last_summary", {}) is Dictionary \
			and not data.last_summary.is_empty():
		return data.last_summary.duplicate(true)

	var is_battle: bool = mode in BATTLE_MODES
	var outcome := String(result.get("outcome", "exit"))
	var win := outcome == "win" and is_battle
	var planes: Array = []
	for id in result.get("planes_used", []):
		if Data.has_plane(String(id)) and not String(id) in planes:
			planes.append(String(id))
	var xp_by: Dictionary = {}
	var xp_src = result.get("xp_by_plane", {})
	if xp_src is Dictionary:
		for id in xp_src:
			if Data.has_plane(String(id)):
				xp_by[String(id)] = maxi(0, int(xp_src[id]))
				if not String(id) in planes:
					planes.append(String(id))
	var kills := maxi(0, int(result.get("kills", 0)))
	var ground := maxi(0, int(result.get("ground_kills", 0)))
	var deaths := maxi(0, int(result.get("deaths", 0)))
	var landings := maxi(0, int(result.get("landings", 0)))

	var rank_before := String(player_rank().name)
	var camos_before := {}
	for id in planes:
		camos_before[id] = _unlocked_camos(id)

	# кредиты и ремонт
	var earned := maxi(0, int(result.get("credits", 0)))
	var repair := 0
	if is_battle:
		for id in _lost_planes(result, planes, deaths):
			repair += int(Data.plane(id).get("repair", 0))
	var delta := maxi(0, earned - repair)
	summary.credits_earned = earned
	summary.repair_full = repair
	summary.repair_cost = earned - delta
	summary.credits_delta = delta
	data.credits = maxi(0, int(data.credits) + delta)

	# опыт: самолётам, общий и в исследования
	var xp_total := 0
	var research_log: Array = []
	for id in xp_by:
		var xp := int(xp_by[id])
		if xp <= 0:
			continue
		xp_total += xp
		var ps := plane_stats(id)
		ps.xp += xp
		data.plane_stats[id] = ps
		_spend_research_xp(id, xp, research_log)
	data.total_xp = int(data.total_xp) + xp_total
	summary.xp_total = xp_total
	summary.research = research_log

	# статистика боёв и сбитых по самолётам
	if is_battle:
		var st: Dictionary = data.stats
		st.battles = int(st.battles) + 1
		if win:
			st.wins = int(st.wins) + 1
		st.kills = int(st.kills) + kills
		st.ground_kills = int(st.ground_kills) + ground
		st.deaths = int(st.deaths) + deaths
		st.landings = int(st.landings) + landings
		var weights: Array = []
		for id in planes:
			weights.append(float(xp_by.get(id, 0)))
		var kill_split := _split_int(kills, weights)
		var ground_split := _split_int(ground, weights)
		for i in planes.size():
			var id: String = planes[i]
			var ps := plane_stats(id)
			ps.battles += 1
			if win:
				ps.wins += 1
			ps.kills += int(kill_split[i])
			ps.ground_kills += int(ground_split[i])
			data.plane_stats[id] = ps

	# достижения
	var new_ach: Array = []
	var checks := {
		"first_battle": is_battle and int(data.stats.battles) >= 1,
		"first_kill": is_battle and kills > 0,
		"first_win": win,
		"ace": is_battle and kills >= 5,
		"ground_10": int(data.stats.ground_kills) >= 10,
		"landing": landings > 0,
		"cobra": bool(result.get("cobra", false)),
		"battles_10": int(data.stats.battles) >= 10,
		"rank3": _has_researched_rank(3),
		"realistic_win": win and mode == "realistic",
	}
	for id in Data.ACHIEVEMENTS:
		if bool(checks.get(id, false)) and not has_achievement(id):
			data.achievements.append(id)
			new_ach.append(String(Data.ACHIEVEMENTS[id].name))
	summary.achievements = new_ach

	# новые камуфляжи
	var new_camos: Array = []
	for id in planes:
		for c in _unlocked_camos(id):
			if not c in camos_before[id]:
				new_camos.append("%s (%s)" % [Data.camo(id, c).name, Data.plane(id).name])
	summary.camos = new_camos

	var rank_after := String(player_rank().name)
	summary.rank_up = rank_after if rank_after != rank_before else ""

	# журнал
	var entry := {
		"date": Time.get_datetime_string_from_system(false, true),
		"mode": mode, "map_id": String(result.get("map_id", "")), "outcome": outcome,
		"planes": planes, "kills": kills, "ground_kills": ground, "deaths": deaths,
		"xp": xp_total, "credits": delta,
	}
	data.logbook.insert(0, entry)
	while data.logbook.size() > LOGBOOK_MAX:
		data.logbook.pop_back()

	data.last_result_key = key
	data.last_summary = summary.duplicate(true)
	_commit()
	return summary


## Какие самолёты потеряны: result.lost_planes, иначе i-я гибель — i-й использованный самолёт.
func _lost_planes(result: Dictionary, planes: Array, deaths: int) -> Array:
	var lost: Array = []
	var src = result.get("lost_planes", null)
	if src is Array:
		for id in src:
			if Data.has_plane(String(id)):
				lost.append(String(id))
		return lost
	if planes.is_empty():
		return lost
	for i in deaths:
		lost.append(planes[mini(i, planes.size() - 1)])
	return lost


func _spend_research_xp(from_id: String, xp: int, entries: Array) -> void:
	var left := xp
	var guard := 0
	while left > 0 and guard < 32:
		guard += 1
		var target := research_target(from_id)
		if target == "":
			return
		var need := int(Data.plane(target).research_xp)
		var have := int(data.research_xp.get(target, 0))
		var add := mini(left, maxi(0, need - have))
		have += add
		left -= add
		data.research_xp[target] = have
		var done := have >= need
		if done:
			data.researched.append(target)
			if data.research_focus == target:
				data.research_focus = ""
		_log_research(entries, target, have, need, done)


func _log_research(entries: Array, id: String, have: int, need: int, done: bool) -> void:
	for e in entries:
		if e.id == id:
			e.have = have
			e.done = done
			return
	entries.append({"id": id, "name": String(Data.plane(id).name), "have": have, "need": need, "done": done})


func _has_researched_rank(rank: int) -> bool:
	for id in data.researched:
		if int(Data.plane(String(id)).get("rank", 0)) == rank:
			return true
	return false


func _unlocked_camos(plane_id: String) -> Array:
	var out: Array = []
	for t in Data.CAMO_TEMPLATES:
		if is_camo_unlocked(plane_id, t.id):
			out.append(String(t.id))
	return out


## Делит целое total по весам (метод наибольшего остатка). Без весов — всё первому.
func _split_int(total: int, weights: Array) -> Array:
	var n := weights.size()
	var out: Array = []
	out.resize(n)
	out.fill(0)
	if n == 0 or total <= 0:
		return out
	var sum := 0.0
	for w in weights:
		sum += maxf(0.0, float(w))
	if sum <= 0.0:
		out[0] = total
		return out
	var rema: Array = []
	var given := 0
	for i in n:
		var exact := total * maxf(0.0, float(weights[i])) / sum
		out[i] = int(floor(exact))
		given += int(out[i])
		rema.append([exact - floor(exact), i])
	rema.sort_custom(func(a, b): return a[0] > b[0])
	var k := 0
	while given < total:
		out[rema[k % n][1]] += 1
		given += 1
		k += 1
	return out


# ---------------------------------------------------------------- русский текст

## Множественное число: plural(5, "бой", "боя", "боёв") -> "боёв".
static func plural(n: int, one: String, few: String, many: String) -> String:
	var a := absi(n) % 100
	if a >= 11 and a <= 14:
		return many
	match a % 10:
		1:
			return one
		2, 3, 4:
			return few
	return many


## Предложный падеж названия самолёта: «на Стриже», «на Грозе», «на Шмеле».
static func name_prepositional(word: String) -> String:
	if word == "":
		return word
	match word.right(1):
		"а", "я", "ь", "й":
			return word.left(word.length() - 1) + "е"
		"о", "е", "и", "ы", "у", "ю", "э":
			return word
	return word + "е"
