extends WeaponSystem
## Упрощённая система оружия для тестов ENTITY, пока настоящая WeaponSystem — заглушка.
## Считает боезапас и стреляет в Game.battle.projectiles (поддельный менеджер в тестах).

var hx_rocket_cd: float = 0.0
var hx_flares_prev: bool = false


func setup(p_def: Dictionary) -> void:
	def = p_def
	var w: Dictionary = def.get("weapons", {})
	var guns: Array = []
	for g in w.get("guns", []):
		guns.append(int(g.get("ammo", 0)) * int(g.get("count", 1)))
	max_ammo = {"guns": guns, "rockets": int(w.get("rockets", {}).get("count", 0)),
		"bombs": int(w.get("bombs", {}).get("count", 0)), "missiles": int(w.get("missiles", {}).get("count", 0)),
		"flares": int(w.get("flares", 0))}
	rearm_full()


func rearm_full() -> void:
	ammo = max_ammo.duplicate(true)
	bomb_cooldown = 0.0


func update(dt: float, owner, ctrl: Dictionary) -> void:
	bomb_cooldown = maxf(0.0, bomb_cooldown - dt)
	hx_rocket_cd = maxf(0.0, hx_rocket_cd - dt)
	var fl := bool(ctrl.get("flares", false))
	var fl_edge := fl and not hx_flares_prev
	hx_flares_prev = fl
	if owner == null or not bool(owner.alive):
		return
	var pm = Game.battle.projectiles if Game.battle != null else null
	if pm == null:
		return
	var p: Vector3 = owner.global_position
	var v: Vector3 = owner.velocity()
	var fwd: Vector3 = owner.forward()
	if bool(ctrl.get("guns", false)):
		var g: Array = ammo.guns
		for i in g.size():
			if int(g[i]) > 0:
				g[i] = int(g[i]) - 1
				pm.spawn_bullet(p, v + fwd * gun_speed(), 5.0, 12.7, owner.uid, owner.team, false)
	if bool(ctrl.get("rocket", false)) and hx_rocket_cd <= 0.0 and int(ammo.rockets) > 0:
		var n := mini(2, int(ammo.rockets))
		for k in n:
			pm.spawn_rocket(p, v + fwd * 500.0, 60.0, 10.0, owner.uid, owner.team)
		ammo.rockets = int(ammo.rockets) - n
		hx_rocket_cd = 0.25
	if bool(ctrl.get("bomb", false)) and bomb_cooldown <= 0.0 and int(ammo.bombs) > 0:
		pm.spawn_bomb(p, v, 160.0, 22.0, owner.uid, owner.team)
		ammo.bombs = int(ammo.bombs) - 1
		bomb_cooldown = 0.35
	if fl_edge and int(ammo.flares) > 0:
		pm.spawn_flare(p, v, owner.team)
		ammo.flares = int(ammo.flares) - 1


func gun_speed() -> float:
	var best := 800.0
	var cal := -1.0
	for g in def.get("weapons", {}).get("guns", []):
		if float(g.get("caliber", 0.0)) > cal:
			cal = float(g.get("caliber", 0.0))
			best = float(g.get("speed", 800.0))
	return best


func rearm_step(dt: float) -> bool:
	var full := true
	var g: Array = ammo.guns
	var gm: Array = max_ammo.guns
	for i in gm.size():
		if int(g[i]) < int(gm[i]):
			g[i] = mini(int(gm[i]), int(g[i]) + maxi(1, int(float(gm[i]) * dt / 15.0)))
			full = full and int(g[i]) >= int(gm[i])
	for k in ["rockets", "bombs", "missiles", "flares"]:
		if int(ammo[k]) < int(max_ammo[k]):
			ammo[k] = int(ammo[k]) + 1
			full = full and int(ammo[k]) >= int(max_ammo[k])
	return full


func is_empty() -> bool:
	for n in ammo.guns:
		if int(n) > 0:
			return false
	return int(ammo.rockets) <= 0 and int(ammo.bombs) <= 0 and int(ammo.missiles) <= 0


func has_ordnance() -> bool:
	return int(ammo.rockets) > 0 or int(ammo.bombs) > 0


func summary() -> Array:
	return []
