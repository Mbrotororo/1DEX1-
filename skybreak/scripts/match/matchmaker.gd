class_name Matchmaker
extends RefCounted
## Подбор ботов по уровню боя. Только статические функции.

const WINDOW_LOW := 1.0
const WINDOW_HIGH := 0.7
const NEAREST_SLACK := 0.35
const BALANCE_TOLERANCE := 0.5

## Максимальный уровень боя среди самолётов сетапа (1.0, если сетап пуст).
static func lineup_level(lineup: Array) -> float:
	var best := 0.0
	for id in lineup:
		var p: Dictionary = Data.plane(String(id))
		if p.is_empty():
			continue
		best = maxf(best, float(p.level))
	return best if best > 0.0 else 1.0

## Самолёты, подходящие под уровень: окно [level-1.0, level+0.7], иначе ближайшие уровни.
static func candidates(level: float) -> Array:
	var out: Array = []
	for id in Data.ORDER:
		var lv := float(Data.plane(id).level)
		if lv >= level - WINDOW_LOW - 0.001 and lv <= level + WINDOW_HIGH + 0.001:
			out.append(id)
	if not out.is_empty():
		return out
	var best := INF
	for id in Data.ORDER:
		best = minf(best, absf(float(Data.plane(id).level) - level))
	for id in Data.ORDER:
		if absf(float(Data.plane(id).level) - level) <= best + NEAREST_SLACK:
			out.append(id)
	return out

## Вес самолёта: чем ближе к уровню боя, тем чаще встречается.
static func plane_weight(id: String, level: float) -> float:
	var d := absf(float(Data.plane(id).level) - level)
	return 1.0 / (0.3 + d)

## Позывные команды: синим чётные, красным нечётные — так они не совпадают между командами.
static func callsign_pool(team: int, rng: RandomNumberGenerator) -> Array:
	var pool: Array = []
	for i in Data.CALLSIGNS.size():
		if i % 2 == clampi(team, 0, 1):
			pool.append(Data.CALLSIGNS[i])
	for i in range(pool.size() - 1, 0, -1):
		var j := rng.randi_range(0, i)
		var tmp = pool[i]
		pool[i] = pool[j]
		pool[j] = tmp
	return pool

## [{def_id, skill, callsign}] для одной команды.
static func pick_bots(level: float, count: int, team: int, rng: RandomNumberGenerator) -> Array:
	var out: Array = []
	if count <= 0:
		return out
	var cands := candidates(level)
	var names := callsign_pool(team, rng)
	for i in count:
		var name: String = names[i % names.size()]
		if i >= names.size():
			name += " " + str(i / names.size() + 1)
		out.append({"def_id": _weighted(cands, level, rng), "skill": snappedf(rng.randf_range(0.3, 0.8), 0.01), "callsign": name})
	_ensure_roles(out, cands, level, rng)
	return out

## Обе команды сразу: синим size-1 ботов (плюс игрок), красным size; суммарные уровни выравниваются.
static func make_teams(level: float, size: int, rng: RandomNumberGenerator, player_level: float) -> Array:
	var friends := pick_bots(level, size - 1, 0, rng)
	var foes := pick_bots(level, size, 1, rng)
	balance(friends, foes, player_level, level)
	return [friends, foes]

static func team_level(bots: Array) -> float:
	var s := 0.0
	for b in bots:
		s += float(Data.plane(String(b.def_id)).level)
	return s

## Меняет самолёты ботов (в пределах той же линии), пока разница суммарных уровней больше допуска.
static func balance(team0: Array, team1: Array, extra0: float, level: float) -> void:
	var cands := candidates(level)
	for _iter in (team0.size() + team1.size()) * 2:
		var diff := team_level(team0) + extra0 - team_level(team1)
		if absf(diff) <= BALANCE_TOLERANCE:
			return
		var best_abs := absf(diff)
		var best_team: Array = []
		var best_i := -1
		var best_id := ""
		for side in 2:
			var team: Array = team0 if side == 0 else team1
			var sgn := 1.0 if side == 0 else -1.0
			for i in team.size():
				var cur: Dictionary = Data.plane(String(team[i].def_id))
				for c in cands:
					if c == team[i].def_id or Data.plane(c).line != cur.line:
						continue
					var nd := diff + sgn * (float(Data.plane(c).level) - float(cur.level))
					if absf(nd) < best_abs - 0.01:
						best_abs = absf(nd)
						best_team = team
						best_i = i
						best_id = c
		if best_i < 0:
			return
		best_team[best_i].def_id = best_id

static func _weighted(cands: Array, level: float, rng: RandomNumberGenerator) -> String:
	var total := 0.0
	for c in cands:
		total += plane_weight(c, level)
	var r := rng.randf() * total
	for c in cands:
		r -= plane_weight(c, level)
		if r <= 0.0:
			return c
	return cands[cands.size() - 1]

## В команде от трёх ботов должны быть и истребители, и штурмовики, если уровень это позволяет.
static func _ensure_roles(bots: Array, cands: Array, level: float, rng: RandomNumberGenerator) -> void:
	if bots.size() < 3:
		return
	for line in ["fighter", "attacker"]:
		var pool: Array = []
		for c in cands:
			if Data.plane(c).line == line:
				pool.append(c)
		if pool.is_empty():
			continue
		var has := false
		for b in bots:
			if Data.plane(String(b.def_id)).line == line:
				has = true
				break
		if has:
			continue
		# заменить последнего бота из линии, которой больше
		for i in range(bots.size() - 1, -1, -1):
			if Data.plane(String(bots[i].def_id)).line != line:
				bots[i].def_id = _weighted(pool, level, rng)
				break
