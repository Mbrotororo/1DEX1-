extends RefCounted
## Тесты модуля REPLAY: Recorder, Killcam, сцена повтора, Sfx.

const Fake = preload("res://tests/harness_replay_fake.gd")
const SOUNDS := ["gun_small", "gun_large", "cannon", "rocket", "bomb_drop", "explosion_small", "explosion_big",
	"hit", "flak", "missile_launch", "lock_tone", "missile_warning", "stall_warning", "gear", "click", "splash",
	"rearm_done", "capture"]

var errors: Array = []


func check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


func run(tree: SceneTree) -> Array:
	errors.clear()
	await tree.process_frame
	var saved_replay: Dictionary = Game.last_replay
	await _test_recorder(tree)
	_test_memory(tree)
	await _test_sfx(tree)
	await _test_killcam(tree)
	await _test_killcam_fixed(tree)
	await _test_replay_scene(tree)
	await _test_replay_empty(tree)
	Game.last_replay = saved_replay
	# дать звуку доиграть остановку, чтобы при выходе не оставалось воспроизведений
	Sfx.stop_all()
	await tree.create_timer(0.2).timeout
	return errors


# ---------------------------------------------------------------- запись

## Бой на 3 с: 3 самолёта, один исчезает, движущаяся колонна, события.
func _record_scenario(tree: SceneTree) -> Dictionary:
	var b := Fake.make_battle(tree.root)
	var p1 := Fake.add_plane(b, 1001, "strizh", 0, "Иней", Fake.line_path(Vector3(0, 1000, 0), Vector3(0, 0, -1), 150.0))
	p1.is_player = true
	var p2 := Fake.add_plane(b, 1002, "krechet", 1, "Гром", Fake.line_path(Vector3(200, 1100, -300), Vector3(1, 0, -1), 120.0))
	var p3 := Fake.add_plane(b, 1003, "shmel", 1, "Тайга", Fake.circle_path(Vector3(0, 800, 0), 600.0, 0.3, 0.0))
	var col := Fake.add_ground(b, 2001, "tank", 1, Vector3(500, 0, 500))
	var bunker := Fake.add_ground(b, 2002, "building", 1, Vector3(-800, 0, 300))
	bunker.variant = "bunker"
	var rec := Fake.add_recorder(b)
	for i in 180:
		var step := i + 1
		if step == 30:
			rec.event("explosion", {"pos": Vector3(10, 900, -20), "size": 1.5})
		if step >= 40 and step < 70:
			rec.event("tracer", {"from": [0.0, 1000.0, -float(step)], "to": [0.0, 1000.0, -float(step) - 50.0]})
		if step == 60:
			p2.fm.gear_down = true
			p2.dmg.on_fire = true
		if step == 100:
			rec.event("ground_destroyed", {"uid": 2002, "killer_uid": 1001, "kind": "building", "team": 1})
			bunker.alive = false
		if step == 120:
			p2.alive = false
			rec.event("kill", {"killer_uid": 1001, "victim_uid": 1002, "text": "Стриж (Иней) сбил Кречет (Гром)",
				"reason": "pilot", "killer_team": 0, "victim_team": 1})
		if step == 150:
			b.aircraft.erase(p3)
		# колонна едет первые 2 с
		if step <= 120:
			col.position = Vector3(500, 0, 500) + Vector3(5.0, 0, 0) * (float(step) / 60.0)
		b.step(Fake.DT)
	return {"battle": b, "rec": rec, "p1": p1, "p2": p2, "p3": p3, "col": col, "bunker": bunker}


func _test_recorder(tree: SceneTree) -> void:
	var sc := _record_scenario(tree)
	var b = sc.battle
	var rec: Recorder = sc.rec
	check(absf(rec.current_time() - 3.0) < 0.02, "время записи %.3f вместо 3" % rec.current_time())
	var n1 := rec.sample_count(1001)
	check(n1 >= 59 and n1 <= 62, "самолёт 1001: %d отсчётов вместо ~60" % n1)
	var n3 := rec.sample_count(1003)
	check(n3 >= 48 and n3 <= 52, "самолёт 1003 пропал на 2,5 с, отсчётов %d" % n3)
	check(rec.event_count("explosion") == 1, "событие explosion не записано")
	check(rec.event_count("kill") == 1, "событие kill не записано")
	check(rec.event_count("ground_destroyed") == 1, "событие ground_destroyed не записано")
	check(rec.event_count("tracer") == 30, "трассеров %d вместо 30" % rec.event_count("tracer"))

	# пауза не двигает время
	b.paused = true
	var before := rec.current_time()
	rec._physics_process(Fake.DT)
	check(rec.current_time() == before, "запись идёт во время паузы")
	b.paused = false

	# окно
	var w := rec.window(1.0, 2.0)
	check(float(w.start) == 1.0 and float(w.end) == 2.0, "окно: неверные границы")
	var wd := ReplayData.decode(w)
	var bad := 0
	for uid in wd.tracks:
		var tr: PackedFloat32Array = wd.tracks[uid]
		for i in tr.size() / ReplayData.STRIDE:
			var ts := tr[i * ReplayData.STRIDE]
			if ts < 0.999 or ts > 2.001:
				bad += 1
	check(bad == 0, "окно: %d отсчётов вне [1, 2]" % bad)
	check(wd.tracks.has(1001) and wd.tracks.has(1003), "окно: нет треков самолётов")
	var wn: int = wd.tracks[1001].size() / ReplayData.STRIDE
	check(wn >= 19 and wn <= 22, "окно: %d отсчётов вместо ~21" % wn)
	for e in wd.events:
		check(float(e.t) >= 0.999 and float(e.t) <= 2.001, "окно: событие %s в %.2f" % [e.type, float(e.t)])
	check(wd.ground_deaths.has(2002), "окно: нет уничтожения бункера на 1,67 с")
	var w2 := ReplayData.decode(rec.window(2.5, 3.0))
	check(w2.ground_dead.has(2002), "окно после уничтожения: бункер не в ground_dead")
	check(not w2.tracks.has(1003), "окно 2,5–3 с: трек исчезнувшего самолёта")

	# поза в окне совпадает с траекторией
	var s := ReplayData.sample(wd.tracks[1001], 1.5)
	var want: Transform3D = sc.p1.path.call(1.5)
	check(s.present and (s.pos as Vector3).distance_to(want.origin) < 0.05, "окно: позиция 1001 в 1,5 с не совпадает")

	# finish + JSON
	var rep := rec.finish()
	check(Game.last_replay == rep, "finish не положил повтор в Game.last_replay")
	for key in ["version", "map_id", "time_of_day", "weather", "seed", "duration", "planes", "tracks", "events", "ground"]:
		check(rep.has(key), "в повторе нет поля " + key)
	check(rep.get("map_id") == "fjord" and rep.get("time_of_day") == "dusk" and rep.get("weather") == "cloudy",
		"повтор: карта, время или погода не из боя")
	check(int(rep.get("seed", 0)) == 4242, "повтор: seed не из config")
	check(absf(float(rep.get("duration", 0.0)) - 3.0) < 0.02, "повтор: duration %s" % str(rep.get("duration")))
	check((rep.planes as Dictionary).has("1001") and str(rep.planes["1001"].callsign) == "Иней", "повтор: нет самолёта 1001")
	check(bool(rep.planes["1001"].get("player", false)), "повтор: не отмечен игрок")
	check(rep.ground.has("2001") and rep.ground.has("2002"), "повтор: нет наземных целей")
	check(str(rep.ground["2002"].get("variant", "")) == "bunker", "повтор: не сохранён вариант здания")
	var parsed = JSON.parse_string(JSON.stringify(rep))
	check(parsed is Dictionary, "повтор не проходит через JSON")
	if parsed is Dictionary:
		var a := ReplayData.decode(rep)
		var c := ReplayData.decode(parsed)
		check(c.valid, "повтор после JSON не читается")
		var worst := 0.0
		for uid in a.tracks:
			for k in 12:
				var tt := 0.05 + float(k) * 0.24
				var sa := ReplayData.sample(a.tracks[uid], tt)
				var sb := ReplayData.sample(c.tracks.get(uid, PackedFloat32Array()), tt)
				if sa.present != sb.present:
					worst = 999.0
				elif sa.present:
					worst = maxf(worst, (sa.pos as Vector3).distance_to(sb.pos))
		check(worst < 0.01, "JSON: позиции разошлись на %.4f м" % worst)
		check(c.events.size() == a.events.size(), "JSON: потерялись события")
		check(c.tracers.size() == a.tracers.size(), "JSON: потерялись трассеры")
		check(c.ground_tracks.has(2001), "JSON: нет трека колонны")
		var gp = ReplayData.ground_pose(c.ground_tracks[2001], 1.0)
		check(gp != null and absf((gp as Transform3D).origin.x - 505.0) < 0.6, "колонна: позиция в 1 с не совпадает")
		var sb2 := ReplayData.sample(c.tracks[1002], 1.5)
		check((int(sb2.flags) & ReplayData.F_GEAR) != 0 and (int(sb2.flags) & ReplayData.F_FIRE) != 0, "флаги: шасси и пожар не записаны")
		check((int(sb2.flags) & ReplayData.F_ALIVE) != 0, "флаг alive в 1,5 с")
		var sb3 := ReplayData.sample(c.tracks[1002], 2.5)
		check((int(sb3.flags) & ReplayData.F_ALIVE) == 0, "флаг alive после гибели")
		var gone := ReplayData.sample(c.tracks[1003], 2.9)
		check(not gone.present, "исчезнувший самолёт виден в 2,9 с")
	check(FileAccess.file_exists(Recorder.SAVE_PATH), "файл повтора не сохранён")
	var on_disk = JSON.parse_string(FileAccess.get_file_as_string(Recorder.SAVE_PATH))
	check(on_disk is Dictionary and absf(float(on_disk.get("duration", 0.0)) - float(rep.duration)) < 0.001,
		"файл повтора не совпадает с finish()")
	check(rec.finish() == rep, "повторный finish() вернул другое")
	var t_end := rec.current_time()
	b.step(Fake.DT)
	check(rec.current_time() == t_end, "после finish() запись продолжается")

	# обрезка длинной записи
	var rec2 := Recorder.new()
	rec2.set_physics_process(false)
	rec2.save_to_disk = false
	b.add_child(rec2)
	b.recorder = rec2
	rec2.start(b)
	for i in 120:
		if i == 30:
			rec2.event("ground_destroyed", {"uid": 2001, "kind": "tank", "team": 1})
		b.step(Fake.DT)
	rec2.trim_before(1.0)
	var trimmed := rec2.window(0.0, 10.0)
	check(float(trimmed.start) >= 1.0, "обрезка: начало %.2f" % float(trimmed.start))
	check(2001 in trimmed.ground_dead, "обрезка: уничтоженная цель потерялась")
	var td := ReplayData.decode(trimmed)
	check(td.valid and ReplayData.first_time(td.tracks[1001]) >= 0.999, "обрезка: остались старые отсчёты")
	rec2.finish()
	b.queue_free()
	await tree.process_frame


func _test_memory(tree: SceneTree) -> void:
	var b := Fake.make_battle(tree.root)
	for i in 16:
		Fake.add_plane(b, 3000 + i, "mirage", i % 2, "П%d" % i, Fake.circle_path(Vector3(0, 1500, 0), 900.0 + i * 20.0, 0.12, i * 0.4))
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	var steps := 60 * 60   # минута
	for i in steps:
		b.step(Fake.DT)
		if i % 6 == 0:
			rec.event("tracer", {"from": [0, 1500, 0], "to": [0, 1500, -60]})
	var per_min := rec.memory_bytes()
	var est := per_min * 20
	check(est < 40 * 1024 * 1024, "20 минут 16 самолётов: ~%d МБ" % (est / 1048576))
	check(rec.sample_count(3000) >= 1195 and rec.sample_count(3000) <= 1205, "минута: %d отсчётов" % rec.sample_count(3000))
	rec.finish()
	b.free()


# ---------------------------------------------------------------- звук

func _test_sfx(tree: SceneTree) -> void:
	var sfx = tree.root.get_node_or_null("Sfx")
	check(sfx != null, "нет автозагрузки Sfx")
	if sfx == null:
		return
	check(int(sfx.gen_ms) < 1500, "генерация звуков %d мс" % int(sfx.gen_ms))
	for n in SOUNDS:
		var s = sfx.stream(n)
		check(s is AudioStreamWAV, "нет звука " + n)
		if s is AudioStreamWAV:
			check(s.get_length() > 0.0, "пустой звук " + n)
			check(s.format == AudioStreamWAV.FORMAT_16_BITS and s.mix_rate == 22050 and not s.stereo, "формат звука " + n)
			check(s.loop_mode == AudioStreamWAV.LOOP_DISABLED, "звук %s зациклен" % n)
	var holder := Node3D.new()
	tree.root.add_child(holder)
	var cam := Camera3D.new()
	holder.add_child(cam)
	cam.make_current()
	for n in SOUNDS:
		Sfx.play(n)
		Sfx.play(n, Vector3(10, 0, -20), -3.0, 1.1)
	Sfx.play("нет такого")
	Sfx.play("explosion_big", Vector3(0, 0, -9000))   # дальше max_distance — пропускается
	await tree.process_frame
	await tree.process_frame
	for n in SOUNDS:
		Sfx.play(n, Vector3(5, 5, 5))
	check(sfx._pool3d.size() <= Sfx.MAX_3D, "3D-голосов больше %d" % Sfx.MAX_3D)
	check(sfx._pool3d.size() > 0, "3D-голоса не созданы")
	var any_playing := false
	for p in sfx._pool3d:
		if is_instance_valid(p) and p.playing and p.is_inside_tree():
			any_playing = true
	check(any_playing, "3D-звук не играет")
	for kind in ["prop", "jet"]:
		var e: AudioStreamPlayer3D = Sfx.make_engine(kind)
		check(e != null and e.stream is AudioStreamWAV, "make_engine(%s) без звука" % kind)
		if e == null:
			continue
		check((e.stream as AudioStreamWAV).loop_mode == AudioStreamWAV.LOOP_FORWARD, "двигатель %s не зациклен" % kind)
		holder.add_child(e)
		e.play()
		Sfx.set_engine(e, 0.0, false)
		check(absf(e.pitch_scale - 0.6) < 0.01, "set_engine: pitch на малом газу %.2f" % e.pitch_scale)
		var quiet := e.volume_db
		Sfx.set_engine(e, 1.0, true)
		check(absf(e.pitch_scale - 1.6) < 0.01, "set_engine: pitch на полном газу %.2f" % e.pitch_scale)
		check(e.volume_db > quiet, "set_engine: громкость не растёт с газом")
		var r := e.get_node_or_null("Rumble") as AudioStreamPlayer3D
		check(r != null and r.playing, "форсаж: нет рокота (%s)" % kind)
		Sfx.set_engine(e, 1.0, false)
		check(r == null or not r.playing, "рокот не выключается без форсажа")
		check(e.playing, "двигатель %s не играет" % kind)
	var wind: AudioStreamPlayer = Sfx.make_wind()
	check(wind != null and wind.stream is AudioStreamWAV and (wind.stream as AudioStreamWAV).loop_mode == AudioStreamWAV.LOOP_FORWARD, "ветер не зациклен")
	holder.add_child(wind)
	wind.play()
	await tree.process_frame
	holder.queue_free()
	await tree.process_frame


# ---------------------------------------------------------------- киллкам

func _test_killcam(tree: SceneTree) -> void:
	var b := Fake.make_battle(tree.root)
	var killer := Fake.add_plane(b, 1, "mirage", 1, "Иней", Fake.line_path(Vector3(0, 1000, 300), Vector3(0, 0, -1), 160.0), true)
	var victim := Fake.add_plane(b, 2, "strizh", 0, "Беркут", Fake.line_path(Vector3(0, 1000, 0), Vector3(0, 0, -1), 140.0), true)
	victim.is_player = true
	var far := Fake.add_plane(b, 3, "shmel", 0, "Лис", Fake.line_path(Vector3(4000, 600, 4000), Vector3(1, 0, 0), 100.0), true)
	var near := Fake.add_plane(b, 4, "sokol", 1, "Кедр", Fake.line_path(Vector3(300, 1000, 0), Vector3(0, 0, -1), 150.0), true)
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	for i in 150:
		b.step(Fake.DT)
	victim.alive = false
	var rig_cam: Camera3D = b.camera_rig.camera
	var kc := Killcam.new()
	b.add_child(kc)
	var count := [0]
	kc.finished.connect(func(): count[0] += 1)
	kc.play(b, 2, 1, 1.0)
	check(kc.mode == "chase", "киллкам: режим %s вместо chase" % kc.mode)
	check(kc.camera != null and kc.camera.current, "киллкам: своя камера не стала текущей")
	check(kc.title_text == "Вас сбил: Иней, Мираж", "киллкам: надпись «%s»" % kc.title_text)
	check(kc._ghosts.has(1) and kc._ghosts.has(2) and kc._ghosts.has(4), "киллкам: нет призраков убийцы, жертвы или соседа")
	check(not kc._ghosts.has(3), "киллкам: призрак самолёта дальше 2 км")
	check(not killer.model.visible and not victim.model.visible, "киллкам: настоящие модели не скрыты")
	check(kc.overlay != null, "киллкам: нет своей надписи без HUD")
	var start_cam := kc.camera.global_position
	var frames := 0
	while is_instance_valid(kc) and count[0] == 0 and frames < 600:
		await tree.process_frame
		frames += 1
		if frames == 20 and is_instance_valid(kc):
			var kg: ReplayGhost = kc._ghosts[1]
			var cam_to_killer := kg.global_position - kc.camera.global_position
			var killer_to_victim: Vector3 = (kc._ghosts[2] as ReplayGhost).global_position - kg.global_position
			check(cam_to_killer.dot(killer_to_victim) > 0.0, "киллкам: камера не за сбившим")
			check(kc.camera.global_position.distance_to(start_cam) > 1.0, "киллкам: камера стоит на месте")
	check(count[0] == 1, "киллкам: finished %d раз" % count[0])
	await tree.process_frame
	check(not is_instance_valid(kc), "киллкам не удалил себя")
	check(rig_cam.current, "киллкам: камера боя не вернулась")
	check(killer.model.visible and victim.model.visible and near.model.visible, "киллкам: модели не вернулись")

	# пропуск
	var kc2 := Killcam.new()
	b.add_child(kc2)
	var count2 := [0]
	kc2.finished.connect(func(): count2[0] += 1)
	kc2.play(b, 2, 1, 6.0)
	var ev := InputEventAction.new()
	ev.action = "fire_guns"
	ev.pressed = true
	kc2._input(ev)
	check(count2[0] == 0, "киллкам: пропуск сработал сразу, без задержки")
	kc2._elapsed = 0.5
	kc2._input(ev)
	kc2._input(ev)
	check(count2[0] == 1, "киллкам: пропуск огнём не сработал")
	await tree.process_frame
	check(rig_cam.current, "киллкам: после пропуска камера не вернулась")

	# HUD рисует надпись сам — своей нет
	var hud := FakeHud.new()
	b.hud = hud
	var kc3 := Killcam.new()
	b.add_child(kc3)
	kc3.play(b, 2, 1, 1.0)
	check(kc3.overlay == null, "киллкам: надпись дублирует HUD")
	kc3.skip()
	b.hud = null
	rec.finish()
	b.queue_free()
	await tree.process_frame


class FakeHud extends RefCounted:
	var killcam_info: Dictionary = {}


## Сбил не самолёт (зенитка): неподвижная камера на падающий самолёт.
func _test_killcam_fixed(tree: SceneTree) -> void:
	var b := Fake.make_battle(tree.root)
	var victim := Fake.add_plane(b, 7, "krechet", 0, "Ворон", Fake.line_path(Vector3(0, 400, 0), Vector3(1, -0.3, 0), 120.0), true)
	var aa := Fake.add_ground(b, 8, "aa", 1, Vector3(300, 0, 100))
	var rec := Fake.add_recorder(b)
	rec.save_to_disk = false
	for i in 60:
		b.step(Fake.DT)
	victim.alive = false
	var kc := Killcam.new()
	b.add_child(kc)
	var done := [false]
	kc.finished.connect(func(): done[0] = true)
	kc.play(b, 7, aa.uid, 0.8)
	check(kc.mode == "fixed", "киллкам без сбившего: режим %s" % kc.mode)
	check(kc.title_text == "Вас сбила зенитка", "киллкам без сбившего: надпись «%s»" % kc.title_text)
	var p0 := kc.camera.global_position
	for i in 10:
		b.step(Fake.DT)
		await tree.process_frame
	if is_instance_valid(kc):
		check(kc.camera.global_position == p0, "неподвижная камера двигается")
		var fwd := -kc.camera.global_transform.basis.z
		check(fwd.dot((victim.global_position - p0).normalized()) > 0.98, "неподвижная камера не смотрит на самолёт")
	var frames := 0
	while not done[0] and frames < 300:
		await tree.process_frame
		frames += 1
	check(done[0], "киллкам без сбившего не закончился")
	# совсем нет данных — заканчивается сразу
	var kc2 := Killcam.new()
	b.add_child(kc2)
	var done2 := [false]
	kc2.finished.connect(func(): done2[0] = true)
	kc2.play(b, 999, 998, 6.0)
	await tree.process_frame
	await tree.process_frame
	check(done2[0], "киллкам без данных не закончился")
	rec.finish()
	b.queue_free()
	await tree.process_frame


# ---------------------------------------------------------------- сцена повтора

func _test_replay_scene(tree: SceneTree) -> void:
	var sc := _record_scenario(tree)
	var rec: Recorder = sc.rec
	var rep := rec.finish()
	var p1_path: Callable = sc.p1.path
	sc.battle.queue_free()
	await tree.process_frame
	Game.last_replay = rep
	var scene: Node3D = load("res://scenes/replay.tscn").instantiate()
	tree.root.add_child(scene)
	await tree.process_frame
	check(bool(scene.loaded), "повтор не загрузился")
	if not bool(scene.loaded):
		scene.queue_free()
		return
	check(scene.ghosts.size() == 3, "повтор: %d моделей вместо 3" % scene.ghosts.size())
	check(scene.selected_uid == 1001, "повтор: выбран не самолёт игрока")
	check(scene.world != null and str(scene.world.map.get("id", "")) == "fjord", "повтор: мир построен не по карте")
	check(scene.ground_nodes.size() == 2, "повтор: наземных целей %d" % scene.ground_nodes.size())
	check(scene.camera != null and scene.camera.current, "повтор: камера не текущая")
	var t0: float = scene.t
	for i in 60:
		await tree.process_frame
	check(float(scene.t) > t0, "повтор: время не идёт")
	scene.set_speed(4.0)
	check(scene.speed == 4.0, "повтор: скорость не меняется")
	scene.seek(2.0)
	check(absf(float(scene.t) - 2.0) < 0.001, "повтор: перемотка не работает")
	check(scene.is_ground_dead(2002), "повтор: бункер не уничтожен в 2 с")
	scene.seek(1.0)
	check(not scene.is_ground_dead(2002), "повтор: бункер не восстановлен в 1 с")
	var g1: ReplayGhost = scene.ghosts[1001]
	var want: Transform3D = p1_path.call(1.0)
	check(g1.visible and g1.global_position.distance_to(want.origin) < 0.05, "повтор: модель не на месте в 1 с")
	scene.seek(2.9)
	check(not (scene.ghosts[1003] as ReplayGhost).visible, "повтор: исчезнувший самолёт виден")
	for mode in ["cockpit", "orbit", "free", "chase"]:
		scene.set_camera_mode(mode)
		scene.seek(1.2)
		await tree.process_frame
		check(scene.cam_mode == mode, "повтор: камера %s не включилась" % mode)
	scene.set_camera_mode("chase")
	scene.seek(1.0)
	await tree.process_frame
	check(scene.camera.global_position.distance_to(g1.global_position) < 60.0, "повтор: камера «Сзади» далеко от самолёта")
	scene.step_plane(1)
	check(scene.selected_uid != 1001, "повтор: следующий самолёт не выбран")
	scene.jump_to_kill(0)
	check(absf(float(scene.t) - (2.0 - 5.0)) < 0.01 or absf(float(scene.t) - float(rep.start)) < 0.01, "повтор: переход к сбитому")
	check(scene.selected_uid == 1001, "повтор: при переходе к сбитому не выбран сбивший")
	scene.toggle_play()
	scene.toggle_play()
	var ev := InputEventKey.new()
	ev.physical_keycode = KEY_RIGHT
	ev.pressed = true
	var before: float = scene.t
	scene._unhandled_input(ev)
	check(float(scene.t) > before, "повтор: стрелка вправо не перематывает")
	scene.seek(float(rep.end) - 0.05)
	scene.playing = true
	for i in 10:
		await tree.process_frame
	check(not scene.playing and absf(float(scene.t) - float(rep.end)) < 0.001, "повтор: не остановился в конце")
	scene.queue_free()
	await tree.process_frame
	await tree.process_frame


func _test_replay_empty(tree: SceneTree) -> void:
	Game.last_replay = {"version": 1}
	var scene: Node3D = load("res://scenes/replay.tscn").instantiate()
	tree.root.add_child(scene)
	await tree.process_frame
	check(not bool(scene.loaded), "пустой повтор: сцена считает, что загрузилась")
	var lbl := scene.find_child("EmptyLabel", true, false) as Label
	check(lbl != null and lbl.text == "Повтора нет", "пустой повтор: нет надписи «Повтора нет»")
	var back := scene.find_child("BackButton", true, false) as Button
	check(back != null and back.text == "Назад", "пустой повтор: нет кнопки «Назад»")
	for i in 5:
		await tree.process_frame
	scene.queue_free()
	await tree.process_frame
