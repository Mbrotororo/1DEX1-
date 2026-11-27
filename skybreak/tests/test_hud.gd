extends RefCounted
## Тест HUD на поддельном бое: привязка, все состояния в обоих режимах, сигналы, меню вылета,
## пауза, таблица, сенсорные кнопки, кабина, предупреждения, упреждение, миникарта,
## маркеры за облаками, реализм без маркеров врагов, подписи самолётов в повторе.

const Fakes = preload("res://tests/harness_hud_fakes.gd")
const HudMarkers = preload("res://scripts/ui/hud_markers.gd")
const HudWarnings = preload("res://scripts/ui/hud_warnings.gd")
const HudOverlay = preload("res://scripts/ui/hud_overlay.gd")
const HudFeed = preload("res://scripts/ui/hud_feed.gd")
const HudDraw = preload("res://scripts/ui/hud_draw.gd")
const SpawnMenu = preload("res://scripts/ui/spawn_menu.gd")

var errors: Array = []


func _check(cond: bool, msg: String) -> void:
	if not cond:
		errors.append(msg)


func _frames(tree: SceneTree, n: int) -> void:
	for i in n:
		await tree.process_frame


func _make(tree: SceneTree, mode: String) -> Array:
	var b = Fakes.make_battle(mode)
	tree.root.add_child(b)
	Fakes.chase_camera(b)
	var hud := BattleHUD.new()
	hud.set_touch_override(0)
	b.add_child(hud)
	b.hud = hud
	hud.bind(b)
	return [b, hud]


func _free(tree: SceneTree, b) -> void:
	if tree.paused:
		tree.paused = false
	if is_instance_valid(b):
		b.queue_free()


func run(tree: SceneTree) -> Array:
	errors = []
	# корень дерева ещё занят добавлением раннера тестов
	await tree.process_frame
	_static_checks()
	await _test_states(tree)
	await _test_signals_and_menus(tree)
	await _test_pause(tree)
	await _test_touch(tree)
	await _test_cockpit_and_warnings(tree)
	await _test_clouds(tree)
	await _test_realistic_markers(tree)
	await _test_replay_tags(tree)
	if tree.paused:
		tree.paused = false
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	return errors


func _static_checks() -> void:
	# упреждение: цель неподвижна в 800 м, пуля 800 м/с -> 1 с
	var t := HudMarkers.lead_time(Vector3(0, 0, -800), Vector3.ZERO, 800.0)
	_check(absf(t - 1.0) < 0.01, "lead_time для неподвижной цели: %f" % t)
	var t2 := HudMarkers.lead_time(Vector3(0, 0, -800), Vector3(100, 0, 0), 800.0)
	_check(t2 > 1.0 and t2 < 1.1, "lead_time для боковой цели: %f" % t2)
	_check(HudMarkers.lead_time(Vector3(0, 0, -800), Vector3(0, 0, -900), 800.0) < 0.0, "убегающую быстрее пули цель не догнать")
	# форматирование
	_check(HudDraw.fmt_dist(1234.0) == "1,2 км", "дистанция в км: " + HudDraw.fmt_dist(1234.0))
	_check(HudDraw.fmt_dist(640.0) == "640 м", "дистанция в м: " + HudDraw.fmt_dist(640.0))
	_check(HudDraw.plural(1, "ракета", "ракеты", "ракет") == "ракета", "plural 1")
	_check(HudDraw.plural(3, "ракета", "ракеты", "ракет") == "ракеты", "plural 3")
	_check(HudDraw.plural(12, "ракета", "ракеты", "ракет") == "ракет", "plural 12")
	_check(HudDraw.plural(150, "очко", "очка", "очков") == "очков", "plural 150")
	# текст киллкама
	var kt := HudOverlay.killcam_text({"killer_name": "Иней", "killer_plane": "Кречет", "killer_uid": 5, "reason": "structure"})
	_check(kt == "Вас сбил: Иней, Кречет", "текст киллкама: " + kt)
	_check(HudOverlay.killcam_text({"killer_name": "", "killer_plane": "", "killer_uid": -1, "reason": "ground"}) == "Самолёт разбился", "текст при падении")
	_check(HudOverlay.banner_for({"outcome": "loss"}, "arcade") == "Поражение", "баннер поражения")
	# вооружение в карточке
	var lines := SpawnMenu.weapons_lines(Data.plane("shmel"))
	_check(lines.size() == 2 and String(lines[0]).find("20 мм") >= 0 and String(lines[1]) == "8 ракет, 4 бомбы",
		"вооружение Шмеля в карточке: " + str(lines))
	var lf := SpawnMenu.weapons_lines(Data.plane("flanker"))
	_check(lf.size() == 2 and String(lf[1]) == "6 ракет В-В", "вооружение Фланкера: " + str(lf))
	# разбор строки ленты
	var parts := HudFeed._split_kill("Стриж (Иней) сбил Кречет (Гром)")
	_check(parts.size() == 3 and String(parts[0][0]) == "Стриж (Иней)" and String(parts[2][0]) == "Кречет (Гром)", "разбор ленты: " + str(parts))


func _test_states(tree: SceneTree) -> void:
	for mode in ["arcade", "realistic", "test"]:
		var pair := _make(tree, mode)
		var b = pair[0]
		var hud: BattleHUD = pair[1]
		_check(hud.process_mode == Node.PROCESS_MODE_ALWAYS, "HUD должен работать на паузе")
		_check(hud.battle == b, "bind не сохранил бой")
		_check(b.is_connected("kill_event", hud._on_kill_event), "bind не подключил kill_event")
		for st in ["spawn", "flying", "killcam", "dead", "ended"]:
			if st == "ended":
				b.match_ended.emit({"outcome": "win"})
			if st == "killcam":
				b.player_killed.emit({"killer_name": "Гром", "killer_plane": "Кречет", "killer_uid": 5, "reason": "structure"})
			b.set_state(st)
			var f0 := hud.frames
			await _frames(tree, 3)
			_check(hud.frames > f0, "%s/%s: _process не идёт" % [mode, st])
			_check(hud.spawn_menu.visible == (st == "spawn" or st == "dead"), "%s/%s: меню вылета видно=%s" % [mode, st, hud.spawn_menu.visible])
			_check(hud.markers.visible == (st == "flying"), "%s/%s: маркеры" % [mode, st])
			_check(hud.flight.visible == (st == "flying"), "%s/%s: полётные данные" % [mode, st])
			_check(hud.overlay.killcam_on == (st == "killcam"), "%s/%s: надпись киллкама" % [mode, st])
			if st == "flying":
				_check(not hud.flight.rows.is_empty(), "%s: нет строк полётных данных" % mode)
				_check(not hud.weapons.rows.is_empty(), "%s: нет строк боезапаса" % mode)
				_check(hud.score.show_score == (mode != "test"), "%s: счёт команд показан=%s" % [mode, hud.score.show_score])
			if st == "ended":
				_check(hud.overlay.banner_text == "Победа", "%s: нет баннера победы" % mode)
				_check(hud.scoreboard.visible, "%s: в конце боя нужна таблица" % mode)
		# без игрока в полёте и после удаления игрока не должно быть ошибок
		b.state = "flying"
		var pl = b.player
		b.player = null
		await _frames(tree, 2)
		_check(not hud.flight.visible, "%s: без игрока полётные данные скрыты" % mode)
		b.player = pl
		_free(tree, b)
		await _frames(tree, 1)


func _test_signals_and_menus(tree: SceneTree) -> void:
	var pair := _make(tree, "arcade")
	var b = pair[0]
	var hud: BattleHUD = pair[1]
	b.set_state("spawn")
	await _frames(tree, 2)
	# лента и сообщения
	for i in 7:
		b.kill_event.emit("Стриж (Иней) сбил Кречет (Гром %d)" % i, 0, 1)
	_check(hud.feed.kills.size() == HudFeed.KILL_MAX, "в ленте должно быть 5 строк, есть %d" % hud.feed.kills.size())
	b.message.emit("Зона A захвачена", 3.0)
	b.message.emit("Зона A захвачена", 5.0)
	b.message.emit("Победа", 4.0)
	_check(hud.feed.messages.size() == 1, "одинаковые сообщения склеиваются, итог боя идёт в баннер: %d" % hud.feed.messages.size())
	_check(absf(float(hud.feed.messages[0].t) - 5.0) < 0.01, "повтор сообщения продлевает его")
	hud.feed.tick(5.5)
	_check(hud.feed.messages.is_empty(), "сообщение не исчезло по времени")
	hud.feed.tick(1.0)
	_check(hud.feed.kills.is_empty(), "лента не очистилась через 6 с")
	# меню вылета: карточки и клик
	hud.spawn_menu.refresh()
	_check(hud.spawn_menu.cards.size() == b.lineup.size(), "карточек %d, а в составе %d" % [hud.spawn_menu.cards.size(), b.lineup.size()])
	var card: Button = hud.spawn_menu.cards.get("shmel")
	_check(card != null and not card.disabled, "карточка Шмеля должна быть доступна")
	if card != null:
		card.pressed.emit()
	_check(b.spawn_requests.has("shmel"), "клик по карточке не вызвал request_spawn")
	# после первого вылета Фантом стоит 250 очков, а очков 200: карточка недоступна
	b.lineup_uses["burevestnik"] = 0
	hud.spawn_menu.refresh()
	var fantom: Button = hud.spawn_menu.cards.get("fantom")
	_check(fantom != null and fantom.disabled, "карточка без очков должна быть недоступна")
	var bure: Button = hud.spawn_menu.cards.get("burevestnik")
	_check(bure != null and bure.disabled, "карточка без вылетов должна быть недоступна")
	# реализм: подсказка «Одна жизнь»
	b.mode = "realistic"
	hud.spawn_menu.refresh()
	_check(hud.spawn_menu._hint.visible and hud.spawn_menu._hint.text == "Одна жизнь", "в реализме нужна подсказка «Одна жизнь»")
	b.mode = "arcade"
	# экран «Самолётов не осталось» и выход в ангар
	b.set_state("dead")
	await _frames(tree, 2)
	_check(hud.spawn_menu.visible and hud.spawn_menu._title.text == "Самолётов не осталось", "нет экрана «Самолётов не осталось»")
	hud.spawn_menu._hangar_btn.pressed.emit()
	_check(b.quit_calls == 1, "«В ангар» не вызвал quit_to_hangar")
	# киллкам
	b.player_killed.emit({"killer_name": "Иней", "killer_plane": "Кречет", "killer_uid": 3, "reason": "pilot"})
	b.set_state("killcam")
	await _frames(tree, 2)
	_check(hud.overlay.killcam_on and HudOverlay.killcam_text(hud.overlay.killcam_info) == "Вас сбил: Иней, Кречет", "надпись киллкама")
	_check(hud.overlay.killcam_skippable, "киллкам с убийцей можно пропустить")
	# таблица по Tab
	b.set_state("flying")
	Input.action_press("scoreboard")
	await _frames(tree, 2)
	_check(hud.scoreboard.visible, "Tab не открыл таблицу")
	_check(hud.scoreboard.rows.size() == b.aircraft.size(), "строк в таблице %d" % hud.scoreboard.rows.size())
	var has_player := false
	for r in hud.scoreboard.team_rows(0):
		if bool(r.is_player):
			has_player = true
	_check(has_player, "строка игрока в таблице синих")
	Input.action_release("scoreboard")
	await _frames(tree, 2)
	_check(not hud.scoreboard.visible, "таблица не закрылась")
	# миникарта
	_check(hud.minimap.texture != null and hud.minimap.texture.get_width() == 96, "миникарта: нет текстуры рельефа 96×96")
	_free(tree, b)
	await _frames(tree, 1)


func _test_pause(tree: SceneTree) -> void:
	var pair := _make(tree, "arcade")
	var b = pair[0]
	var hud: BattleHUD = pair[1]
	b.set_state("flying")
	await _frames(tree, 2)
	var ev := InputEventAction.new()
	ev.action = "pause"
	ev.pressed = true
	hud._input(ev)
	_check(b.paused and b.pause_calls == [true], "Esc должен вызвать set_paused(true)")
	_check(tree.paused, "дерево на паузе")
	var f0 := hud.frames
	await _frames(tree, 3)
	_check(hud.frames > f0, "HUD не обновляется на паузе")
	_check(hud.pause_menu.visible, "меню паузы не открылось")
	hud.pause_menu.show_page("controls")
	await _frames(tree, 1)
	_check(hud.pause_menu.page == "controls", "страница «Управление»")
	# Esc из подстраницы возвращает на главную, пауза остаётся
	hud._input(ev)
	_check(b.paused and hud.pause_menu.page == "main", "Esc из подстраницы — назад")
	hud.pause_menu.show_page("settings")
	_check(hud.pause_menu.sliders.has("sensitivity") and hud.pause_menu.sliders.has("fov"), "в настройках есть ползунки")
	hud.pause_menu.show_page("main")
	hud._input(ev)
	_check(not b.paused and b.pause_calls == [true, false], "второй Esc снимает паузу: %s" % str(b.pause_calls))
	_check(not tree.paused, "дерево снято с паузы")
	await _frames(tree, 2)
	_check(not hud.pause_menu.visible, "меню паузы не закрылось")
	# кнопка «Продолжить» и «Выйти в ангар»
	hud.toggle_pause()
	await _frames(tree, 1)
	hud.pause_menu.resume_requested.emit()
	_check(not b.paused, "«Продолжить» снимает паузу")
	hud.toggle_pause()
	hud.pause_menu.hangar_requested.emit()
	_check(b.quit_calls == 1, "«Выйти в ангар» вызывает quit_to_hangar")
	b.set_paused(false)
	# в киллкаме пауза не открывается (Esc пропускает киллкам)
	b.set_state("killcam")
	await _frames(tree, 1)
	var n: int = b.pause_calls.size()
	hud._input(ev)
	_check(b.pause_calls.size() == n, "в киллкаме Esc не ставит паузу")
	_free(tree, b)
	await _frames(tree, 1)


func _touch_ev(index: int, pos: Vector2, pressed: bool) -> InputEventScreenTouch:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = pos
	e.pressed = pressed
	return e


func _drag_ev(index: int, pos: Vector2, rel: Vector2) -> InputEventScreenDrag:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = pos
	e.relative = rel
	return e


func _test_touch(tree: SceneTree) -> void:
	var pair := _make(tree, "arcade")
	var b = pair[0]
	var hud: BattleHUD = pair[1]
	hud.set_touch_override(1)
	b.set_state("flying")
	b.player_spawned.emit(b.player)
	await _frames(tree, 3)
	var tc = hud.touch
	_check(tc.visible, "сенсорные кнопки не показаны")
	_check(tc.has_button("guns") and tc.has_button("rocket") and tc.has_button("bomb"), "у Шмеля есть пушки, ракеты и бомбы")
	_check(not tc.has_button("missile") and not tc.has_button("flares"), "у Шмеля нет ракет В-В и ловушек")
	var ti: Dictionary = b.player_pilot.touch_input
	var fire: Dictionary = tc.button("guns")
	var rocket: Dictionary = tc.button("rocket")
	# два пальца одновременно: огонь и ракеты
	tc.touch_down(0, fire.c)
	tc.touch_down(1, rocket.c)
	tc.tick(0.016)
	_check(bool(ti.get("guns", false)) and bool(ti.get("rocket", false)), "мультитач: огонь и ракеты вместе")
	tc.touch_up(0)
	tc.tick(0.016)
	_check(not bool(ti.get("guns", true)) and bool(ti.get("rocket", false)), "отпустили огонь, ракеты держатся")
	tc.touch_up(1)
	# стик
	var base: Vector2 = tc.stick_base
	tc.touch_down(2, base)
	tc.touch_move(2, base + Vector2(200, -40), Vector2(200, -40))
	tc.tick(0.016)
	var st: Vector2 = ti.get("stick", Vector2.ZERO)
	_check(st.x > 0.9 and st.y < 0.0 and st.length() <= 1.001, "стик вправо-вверх: %s" % str(st))
	tc.touch_up(2)
	tc.tick(0.016)
	_check((ti.get("stick", Vector2.ONE) as Vector2) == Vector2.ZERO, "стик вернулся в ноль")
	# перетаскивание вне кнопок двигает прицел
	var free_pt := Vector2(tc.size.x * 0.6, tc.size.y * 0.3)
	tc.touch_down(3, free_pt)
	tc.touch_move(3, free_pt + Vector2(30, 5), Vector2(30, 5))
	tc.touch_move(3, free_pt + Vector2(50, 5), Vector2(20, 0))
	tc.tick(0.016)
	_check((ti.get("aim_delta", Vector2.ZERO) as Vector2).is_equal_approx(Vector2(50, 5)), "aim_delta копится: %s" % str(ti.get("aim_delta")))
	ti["aim_delta"] = Vector2.ZERO
	tc.touch_up(3)
	# газ: пока тянут — число, отпустили — ключа нет
	var tr: Rect2 = tc.throttle_rect
	tc.touch_down(4, Vector2(tr.get_center().x, tr.position.y + tr.size.y * 0.25))
	tc.tick(0.016)
	_check(ti.has("throttle") and absf(float(ti.throttle) - 0.75) < 0.02, "газ ползунком: %s" % str(ti.get("throttle")))
	tc.touch_up(4)
	tc.tick(0.016)
	_check(not ti.has("throttle"), "отпущенный газ не перезаписывает газ пилота")
	# вид и пауза
	tc.touch_down(5, tc.button("camera").c)
	tc.touch_up(5)
	_check(b.camera_rig.toggles == 1, "кнопка «Вид» переключает кабину")
	tc.touch_down(6, tc.button("pause").c)
	tc.touch_up(6)
	_check(b.paused, "кнопка «Пауза» ставит паузу")
	await _frames(tree, 2)
	_check(not tc.visible, "на паузе сенсорные кнопки скрыты")
	hud.resume()
	await _frames(tree, 2)
	# реактивный самолёт с ракетами и ловушками
	var fl = Fakes.FakeAircraft.new()
	fl.setup_fake("flanker", 0, 77, "1DEX1", Vector3(0, 1500, 0), Basis.IDENTITY, 200.0)
	b.add_child(fl)
	b.player = fl
	b.aircraft.append(fl)
	b.player_spawned.emit(fl)
	await _frames(tree, 2)
	_check(tc.has_button("missile") and tc.has_button("flares") and tc.has_button("afterburner"), "у Фланкера есть ракеты В-В, ловушки и форсаж")
	_check(not tc.has_button("bomb") and not tc.has_button("rocket"), "у Фланкера нет бомб и НАР")
	tc.touch_down(7, tc.button("afterburner").c)
	tc.touch_up(7)
	tc.tick(0.016)
	_check(bool(ti.get("afterburner", false)), "форсаж включается касанием")
	tc.touch_down(8, tc.button("afterburner").c)
	tc.touch_up(8)
	tc.tick(0.016)
	_check(not bool(ti.get("afterburner", true)), "форсаж выключается вторым касанием")
	_free(tree, b)
	await _frames(tree, 1)


func _test_cockpit_and_warnings(tree: SceneTree) -> void:
	var pair := _make(tree, "realistic")
	var b = pair[0]
	var hud: BattleHUD = pair[1]
	b.set_state("flying")
	await _frames(tree, 2)
	b.camera_rig.mode = 1
	await _frames(tree, 2)
	_check(hud.cockpit_on and hud.cockpit.visible, "режим кабины: нет приборной панели")
	_check(not hud.flight.visible, "в кабине полётные данные слева скрыты")
	_check(hud.weapons.bottom_offset > 0.0, "боезапас поднят над панелью")
	b.camera_rig.mode = 0
	await _frames(tree, 2)
	_check(not hud.cockpit.visible and hud.flight.visible, "выход из кабины")
	# предупреждения
	var pl = b.player
	pl.fm.stalled = true
	pl.dmg.on_fire = true
	pl.fm.gear_down = true
	b.projectiles.incoming = 1
	var w := HudWarnings.collect(pl, b, false)
	var texts: Array = []
	for it in w:
		texts.append(String(it.text))
	for need in ["Сваливание", "Пожар: T", "Ракета!", "Шасси выпущено"]:
		_check(need in texts, "нет предупреждения «%s»: %s" % [need, str(texts)])
	pl.place(Vector3(4900, 900, 0), Basis.IDENTITY, 120.0)
	pl.border_time = 3.2
	texts.clear()
	for it in HudWarnings.collect(pl, b, false):
		texts.append(String(it.text))
	_check("Вернись в зону боя: 7" in texts, "предупреждение о границе: %s" % str(texts))
	pl.place(Vector3(0, 90, 0), Basis(Vector3.RIGHT, deg_to_rad(-30.0)), 120.0)
	pl.fm.vertical_speed = -40.0
	pl.ground_height = 0.0
	texts.clear()
	for it in HudWarnings.collect(pl, b, false):
		texts.append(String(it.text))
	_check("Земля!" in texts, "предупреждение «Земля!»: %s" % str(texts))
	pl.servicing = true
	pl.service_progress = 0.45
	pl.dmg.ratios["tail"] = 0.5
	texts.clear()
	for it in HudWarnings.collect(pl, b, true):
		texts.append(String(it.text))
	_check("Ремонт 45 %" in texts and "Пожар" in texts, "ремонт и пожар на сенсорном экране: %s" % str(texts))
	pl.dmg.ratios["tail"] = 1.0
	pl.service_progress = 0.8
	texts.clear()
	for it in HudWarnings.collect(pl, b, false):
		texts.append(String(it.text))
	_check("Перезарядка 80 %" in texts, "перезарядка: %s" % str(texts))
	# затемнение от перегрузки только в реализме
	pl.fm.g_load = 9.5
	for i in 40:
		hud.effects.update(0.05, b, pl, null, true)
	_check(hud.effects.black > 0.3, "нет затемнения при 9,5 G: %f" % hud.effects.black)
	hud.effects.reset()
	for i in 40:
		hud.effects.update(0.05, b, pl, null, false)
	_check(hud.effects.black == 0.0, "в аркаде нет затемнения")
	# вспышка при попадании
	hud.effects.update(0.016, b, pl, null, false)
	pl.dmg.last_hit_time = 12.0
	hud.effects.update(0.016, b, pl, null, false)
	_check(hud.effects.flash > 0.3, "нет вспышки при попадании")
	_free(tree, b)
	await _frames(tree, 1)


## Облака прячут врагов: в облаке дальше 300 м и за плотным облаком; союзники видны всегда.
func _test_clouds(tree: SceneTree) -> void:
	# чистая функция видимости
	var w = Fakes.FakeWorld.new()
	var a := Vector3(0, 1000, 0)
	var b := Vector3(0, 1000, -2000)
	_check(is_equal_approx(HudMarkers.cloud_visibility(w, a, b, false), 1.0), "без облаков цель видна")
	_check(HudMarkers.cloud_visibility(w, a, b, true) == 0.0, "цель в облаке дальше 300 м не видна")
	_check(HudMarkers.cloud_visibility(w, a, a + Vector3(0, 0, -200), true) == 1.0, "цель в облаке ближе 300 м видна")
	w.clouds = [{"pos": Vector3(0, 1000, -1000), "radius": 300.0}]
	_check(HudMarkers.cloud_depth(w, a, b) > HudMarkers.LOS_HIDE, "плотное облако на линии взгляда: %.0f м" % HudMarkers.cloud_depth(w, a, b))
	_check(HudMarkers.cloud_visibility(w, a, b, false) == 0.0, "за плотным облаком цель не видна")
	_check(HudMarkers.cloud_visibility(w, a, Vector3(900, 1000, -2000), false) > 0.99, "облако в стороне не мешает")
	w.free()
	# в бою
	var pair := _make(tree, "arcade")
	var bt = pair[0]
	var hud: BattleHUD = pair[1]
	bt.set_state("flying")
	await _frames(tree, 2)
	var pl = bt.player
	var vihr = _by_name(bt, "Вихрь")
	var grom = _by_name(bt, "Гром")
	var korshun = _by_name(bt, "Коршун")
	var inei = _by_name(bt, "Иней")
	hud.markers.tick(0.2)
	_check(hud.markers.visibility_of(vihr) > 0.99 and hud.markers.visibility_of(grom) > 0.99, "без облаков враги видны")
	# облако между игроком и Вихрем, Коршун сам в облаке, союзник Иней в облаке
	var mid: Vector3 = (pl.global_position + vihr.global_position) * 0.5
	bt.world.clouds = [{"pos": mid, "radius": 260.0}]
	korshun.in_cloud = true
	inei.in_cloud = true
	for i in 4:
		hud.markers.tick(0.2)
	_check(hud.markers.visibility_of(vihr) < 0.01, "враг за облаком виден: %.2f" % hud.markers.visibility_of(vihr))
	_check(hud.markers.visibility_of(grom) > 0.99, "враг вне облака спрятан: %.2f" % hud.markers.visibility_of(grom))
	_check(hud.markers.visibility_of(korshun) < 0.01, "враг в облаке виден")
	_check(hud.markers.visibility_of(inei) == 1.0, "союзник в облаке должен быть виден")
	# облако ушло — маркер возвращается плавно
	bt.world.clouds = []
	korshun.in_cloud = false
	hud.markers.tick(0.1)
	var half: float = hud.markers.visibility_of(vihr)
	_check(half > 0.0 and half < 1.0, "маркер появляется плавно: %.2f" % half)
	for i in 4:
		hud.markers.tick(0.2)
	_check(hud.markers.visibility_of(vihr) > 0.99 and hud.markers.visibility_of(korshun) > 0.99, "после облака враги снова видны")
	# плашка «В облаке» у игрока
	pl.in_cloud = true
	hud._refresh_labels(pl, "flying")
	_check(hud.warnings.in_cloud, "нет плашки «В облаке»")
	pl.in_cloud = false
	hud._refresh_labels(pl, "flying")
	_check(not hud.warnings.in_cloud, "плашка «В облаке» не убралась")
	_free(tree, bt)
	await _frames(tree, 1)


## В реализме маркеров врагов, стрелок и упреждения нет; союзники ближе 800 м подписаны.
func _test_realistic_markers(tree: SceneTree) -> void:
	var pair := _make(tree, "realistic")
	var bt = pair[0]
	var hud: BattleHUD = pair[1]
	bt.set_state("flying")
	await _frames(tree, 3)
	_check(not bool(bt.markers_enabled), "в реализме маркеры выключены")
	var drawn: Array = hud.markers.debug_marks
	var enemies := 0
	var allies := 0
	for m in drawn:
		if int(m.team) == int(bt.player.team):
			allies += 1
		else:
			enemies += 1
	_check(enemies == 0, "в реализме нарисованы маркеры врагов: %d" % enemies)
	_check(allies > 0, "в реализме нет подписей союзников рядом")
	_check(not hud.markers.debug_lead, "в реализме нарисовано упреждение")
	# затемнение от перегрузки видно поверх HUD
	bt.player.fm.g_load = 9.0
	for i in 60:
		hud.effects.update(0.05, bt, bt.player, null, true)
	_check(hud.effects.black > 0.55, "нет затемнения при 9 g: %.2f" % hud.effects.black)
	_check(hud.gfx != null and hud.gfx.get_index() > hud.weapons.get_index(), "затемнение должно быть поверх приборов")
	_free(tree, bt)
	await _frames(tree, 1)


func _by_name(bt, callsign: String):
	for ac in bt.aircraft:
		if String(ac.callsign) == callsign:
			return ac
	return null


## Подписи в повторе: дальние скрыты (кроме выбранного), налезающие друг на друга отброшены.
func _test_replay_tags(tree: SceneTree) -> void:
	var holder := Node3D.new()
	tree.root.add_child(holder)
	var cam := Camera3D.new()
	holder.add_child(cam)
	cam.look_at_from_position(Vector3(0, 1000, 0), Vector3(0, 1000, -100), Vector3.UP)
	var ghosts: Dictionary = {}
	for i in 9:
		var g := ReplayGhost.new()
		holder.add_child(g)
		g.setup(100 + i, {"def_id": "strizh", "team": i % 2, "callsign": String(Data.CALLSIGNS[i]), "camo": "factory"})
		g.present = true
		g.visible = true
		g.last_pos = Vector3(i * 12.0 - 48.0, 1000.0 + (i % 3) * 8.0, -2000.0)
		ghosts[100 + i] = g
	var far := ReplayGhost.new()
	holder.add_child(far)
	far.setup(200, {"def_id": "flanker", "team": 1, "callsign": "Гром", "camo": "factory"})
	far.present = true
	far.last_pos = Vector3(900, 1100, -4000)
	ghosts[200] = far
	await tree.process_frame
	var view := Vector2(1280, 720)
	var tags := ReplayUI.collect_tags(ghosts, cam, -1, "free", view)
	_check(tags.size() >= 1 and tags.size() < 9, "кучная группа: подписей %d из 9" % tags.size())
	for i in tags.size():
		for j in range(i + 1, tags.size()):
			_check(not ReplayUI.tag_rect(tags[i]).intersects(ReplayUI.tag_rect(tags[j])), "подписи %d и %d налезают" % [i, j])
	var uids: Array = []
	for t in tags:
		uids.append(int(t.uid))
	_check(not 200 in uids, "подпись самолёта дальше %.0f м" % ReplayUI.TAG_RANGE)
	_check(not far.show_tag and not far.tag.visible, "объёмная подпись призрака не выключена")
	uids.clear()
	for t in ReplayUI.collect_tags(ghosts, cam, 200, "free", view):
		uids.append(int(t.uid))
	_check(200 in uids, "выбранный самолёт подписан на любой дистанции")
	uids.clear()
	for t in ReplayUI.collect_tags(ghosts, cam, 200, "chase", view):
		uids.append(int(t.uid))
	_check(not 200 in uids, "в виде «Сзади» выбранный не подписывается (его имя сверху)")
	holder.queue_free()
	await tree.process_frame
