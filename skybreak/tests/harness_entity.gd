extends Node3D
## Скриншоты камеры: сзади (прицел мышью уведён вправо), из кабины, слежение за ботом, повреждённый самолёт.
## xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3 --resolution 1280x720 res://tests/harness_entity.tscn
## Скриншоты: /tmp/skybreak-shots/entity/ (или -- --shots=<папка>).

const BattleScript = preload("res://tests/harness_entity_battle.gd")

var shots_dir := "/tmp/skybreak-shots/entity"
var battle
var player: Aircraft
var bot: Aircraft
var pilot: PlayerPilot
var rig: CameraRig
var frame := 0


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shots="):
			shots_dir = a.substr(8)
	DirAccess.make_dir_recursive_absolute(shots_dir)
	battle = BattleScript.new()
	add_child(battle)
	Game.battle = battle
	_make_env()
	player = _plane("krechet", 0, 1, Vector3(0, 700, 0), Basis.IDENTITY, true)
	pilot = PlayerPilot.new()
	pilot.follow_settings = false
	pilot.mode = "mouse"
	battle.add_child(pilot)
	player.set_pilot(pilot)
	# прицел чуть вправо и вверх: камера смотрит по прицелу, самолёт доворачивает
	pilot.aim_dir = Vector3(0.3, 0.06, -1.0).normalized()
	bot = _plane("sokol", 1, 2, Vector3(-60, 720, -350), Basis.IDENTITY, false)
	var bp := BotPilot.new()
	bp.skill = 0.5
	bot.set_pilot(bp)
	rig = CameraRig.new()
	add_child(rig)
	battle.camera_rig = rig
	rig.follow(player)


func _exit_tree() -> void:
	if Game.battle == battle:
		Game.battle = null


func _plane(id: String, team: int, uid: int, pos: Vector3, b: Basis, is_player: bool) -> Aircraft:
	var ac := Aircraft.new()
	battle.aircraft.append(ac)
	battle.add_child(ac)
	ac.setup(id, team, uid, "П%d" % uid, "factory", {"pos": pos, "basis": b, "speed": 130.0, "on_ground": false},
		{"assist": true, "hardcore": false, "is_player": is_player})
	return ac


func _make_env() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color(0.32, 0.5, 0.78)
	mat.sky_horizon_color = Color(0.72, 0.8, 0.88)
	mat.ground_horizon_color = Color(0.6, 0.6, 0.55)
	mat.ground_bottom_color = Color(0.35, 0.33, 0.28)
	sky.sky_material = mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.8
	env.fog_enabled = true
	env.fog_light_color = Color(0.72, 0.8, 0.88)
	env.fog_density = 0.00008
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, 30, 0)
	sun.light_energy = 1.2
	add_child(sun)
	var ground := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(20000, 20000)
	ground.mesh = pm
	var gm := StandardMaterial3D.new()
	var tex = load("res://assets/textures/sand.webp")
	if tex is Texture2D:
		gm.albedo_texture = tex
		gm.uv1_scale = Vector3(400, 400, 1)
	else:
		gm.albedo_color = Color(0.55, 0.5, 0.38)
	ground.material_override = gm
	add_child(ground)


func _shot(name: String) -> void:
	var img := get_viewport().get_texture().get_image()
	var path := shots_dir.path_join(name)
	img.save_png(path)
	print("скриншот: ", path)


func _physics_process(_dt: float) -> void:
	frame += 1
	match frame:
		100:
			_shot("chase.png")
			rig.set_mode(CameraRig.Mode.COCKPIT)
		130:
			_shot("cockpit.png")
			rig.spectate(bot)
		200:
			_shot("spectate.png")
			rig.follow(player)
			rig.set_mode(CameraRig.Mode.CHASE)
			pilot.aim_dir = player.forward()
			# повреждения двигателя: дым и, может быть, пожар
			var sh: Dictionary = player.def.shape
			for k in 6:
				player.take_hit(Vector3(0.0, 0.2, -0.45 * float(sh.length)), 8.0, 2)
		300:
			_shot("damaged.png")
			# вираж с большой перегрузкой — инверсионные следы
			pilot.aim_dir = Vector3(1.0, 0.25, 0.3).normalized()
		380:
			_shot("hard_turn.png")
			get_tree().quit()
