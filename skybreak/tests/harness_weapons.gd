extends Node3D
## Визуальная проверка оружия и эффектов: трассеры, взрыв, дым, огонь, разрывы, ракета, ловушки.
## Запуск: xvfb-run -a -s "-screen 0 1280x720x24" godot --path skybreak --rendering-driver opengl3
##   --resolution 1280x720 res://tests/harness_weapons.tscn
## Скриншоты: /tmp/skybreak-shots/weapons/

const BattleScript := preload("res://tests/harness_weapons_battle.gd")
const TargetScript := preload("res://tests/harness_weapons_target.gd")
const UnitScript := preload("res://tests/harness_weapons_unit.gd")
const WorldScript := preload("res://tests/harness_weapons_world.gd")
const RecScript := preload("res://tests/harness_weapons_recorder.gd")
const OUT := "/tmp/skybreak-shots/weapons/"

var battle
var pm: ProjectileManager
var fx: Effects
var env: Environment
var sun: DirectionalLight3D
var cam: Camera3D
var ground_mat: StandardMaterial3D
var shooter
var ws: WeaponSystem
var aa_unit
var smoker: Node3D
var burner: Node3D
var jet: Node3D
var missile_target
var frame: int = 0
var aa_cd: float = 0.0
var stage: int = 0
var close_frame: int = 0
var smoker_speed := Vector3(40, 0, 6)
var burner_speed := Vector3(30, -2, -20)


func _ready() -> void:
	DirAccess.make_dir_recursive_absolute(OUT)
	# страховка: не висеть, если что-то пошло не так
	get_tree().create_timer(90.0).timeout.connect(get_tree().quit)
	_build_scene()
	_build_battle()


func _build_scene() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, -30, 0)
	add_child(sun)
	var ground := MeshInstance3D.new()
	var pmesh := PlaneMesh.new()
	pmesh.size = Vector2(6000, 6000)
	ground.mesh = pmesh
	ground_mat = StandardMaterial3D.new()
	ground_mat.albedo_texture = load("res://assets/textures/sand.webp")
	ground_mat.uv1_scale = Vector3(120, 120, 1)
	ground.material_override = ground_mat
	add_child(ground)
	var water := MeshInstance3D.new()
	var wmesh := PlaneMesh.new()
	wmesh.size = Vector2(3000, 3000)
	water.mesh = wmesh
	var wm := StandardMaterial3D.new()
	wm.albedo_texture = load("res://assets/textures/waves.webp")
	wm.uv1_scale = Vector3(60, 60, 1)
	water.material_override = wm
	water.position = Vector3(1600, 0.2, 0)
	add_child(water)
	cam = Camera3D.new()
	cam.fov = 70.0
	cam.far = 14000.0
	add_child(cam)
	cam.position = Vector3(0, 60, 110)
	cam.look_at(Vector3(10, 50, -100))
	_set_night(true)


func _set_night(on: bool) -> void:
	if on:
		env.background_color = Color(0.03, 0.05, 0.1)
		env.ambient_light_color = Color(0.25, 0.3, 0.45)
		env.ambient_light_energy = 0.5
		sun.light_color = Color(0.6, 0.7, 1.0)
		sun.light_energy = 0.25
		ground_mat.albedo_color = Color(0.5, 0.5, 0.55)
	else:
		env.background_color = Color(0.55, 0.7, 0.9)
		env.ambient_light_color = Color(0.7, 0.75, 0.85)
		env.ambient_light_energy = 0.6
		sun.light_color = Color(1, 0.97, 0.9)
		sun.light_energy = 1.2
		ground_mat.albedo_color = Color(1, 1, 1)


func _build_battle() -> void:
	battle = BattleScript.new()
	add_child(battle)
	var w = WorldScript.new()
	w.water_x = 100.0
	w.light = 0.4
	battle.add_child(w)
	battle.world = w
	var rec = RecScript.new()
	battle.add_child(rec)
	battle.recorder = rec
	fx = Effects.new()
	battle.add_child(fx)
	battle.fx = fx
	pm = ProjectileManager.new()
	battle.add_child(pm)
	battle.projectiles = pm
	Game.battle = battle

	# стрелок: Кречет, бьёт вперёд-вправо
	shooter = TargetScript.new()
	shooter.uid = 1
	shooter.team = 0
	shooter.def = Data.plane("krechet")
	battle.add_child(shooter)
	shooter.position = Vector3(-35, 45, 40)
	var spos: Vector3 = shooter.position
	var dir: Vector3 = (Vector3(60, 80, -500) - spos).normalized()
	shooter.transform.basis = Basis.looking_at(dir)
	shooter.vel = dir * 5.0
	var model := AircraftMeshBuilder.build(shooter.def, {})
	shooter.add_child(model)
	shooter.model = model
	battle.aircraft.append(shooter)
	ws = WeaponSystem.new()
	ws.setup(shooter.def)
	ws.ammo.guns = [100000, 100000]

	# зенитка: красноватые трассеры
	aa_unit = UnitScript.new()
	aa_unit.uid = 50
	aa_unit.team = 1
	aa_unit.radius = 3.0
	battle.add_child(aa_unit)
	aa_unit.position = Vector3(90, 1, -160)
	battle.ground_units.append(aa_unit)

	smoker = _mover(Vector3(-90, 75, -60))
	fx.attach_smoke(smoker, Vector3.ZERO, true)
	burner = _mover(Vector3(-50, 35, -10))
	fx.attach_fire(burner, Vector3.ZERO)
	jet = _mover(Vector3(-120, 110, -180))
	fx.attach_trail(jet, Vector3(-6, 0, 0))
	fx.attach_trail(jet, Vector3(6, 0, 0))

	missile_target = TargetScript.new()
	missile_target.uid = 70
	missile_target.team = 1
	battle.add_child(missile_target)
	missile_target.position = Vector3(200, 130, -450)
	missile_target.vel = Vector3(-80, 10, 40)
	battle.aircraft.append(missile_target)


func _mover(pos: Vector3) -> Node3D:
	var n := Node3D.new()
	battle.add_child(n)
	n.position = pos
	var mi := MeshInstance3D.new()
	var b := BoxMesh.new()
	b.size = Vector3(1.5, 1.5, 6)
	mi.mesh = b
	n.add_child(mi)
	return n


func _physics_process(dt: float) -> void:
	frame += 1
	var c := Data.empty_controls()
	c.guns = true
	ws.update(dt, shooter, c)
	missile_target.move(dt)
	smoker.position += smoker_speed * dt
	burner.position += burner_speed * dt
	var t := frame * dt
	jet.position += Vector3(90 * cos(t * 0.6), 4, -90 * sin(t * 0.6)) * dt
	jet.look_at(jet.position + Vector3(90 * cos(t * 0.6), 4, -90 * sin(t * 0.6)))
	aa_cd -= dt
	if aa_cd <= 0.0:
		aa_cd = 0.07
		var d := Vector3(-0.45, 0.8, 0.25).normalized()
		pm.spawn_bullet(aa_unit.position + Vector3(0, 2, 0), d * 900.0, 4.0, 12.7, 50, 1, true)
	match frame:
		10:
			pm.spawn_missile(Vector3(-60, 70, -60), Vector3(80, 20, -150), missile_target, Data.plane("fantom").weapons.missiles, 1, 0)
		20:
			fx.smoke_puff(Vector3(40, 120, -220), 1.4)
			fx.smoke_puff(Vector3(80, 105, -200), 1.2)
			fx.smoke_puff(Vector3(10, 135, -260), 1.6)
		30:
			for k in 4:
				pm.spawn_flare(Vector3(140 + k * 3, 110, -300), Vector3(-20 + k * 10, 10, 15), 1)
		40:
			fx.splash(Vector3(130, 0, -120), 1.5)
		48:
			fx.explosion(Vector3(20, 8, -90), 1.6)
			fx.debris(Vector3(20, 10, -90), Vector3(0, 10, 0), 16)
		55:
			fx.explosion(Vector3(-20, 95, -160), 0.8)


func _process(_dt: float) -> void:
	if stage == 0 and frame >= 62:
		stage = 1
		_shot("night_a.png")
	elif stage == 2 and frame >= 110:
		stage = 3
		_shot("night_b.png")
	elif stage == 4 and frame >= 125:
		stage = 5
		_set_night(false)
		battle.world.light = 1.0
		fx.light_level = 1.0
		fx.explosion(Vector3(40, 50, -140), 1.0)
		fx.smoke_puff(Vector3(0, 120, -240), 1.4)
	elif stage == 5 and frame >= 150:
		stage = 6
		_shot("day.png")
	elif stage == 7:
		stage = 8
		# крупный план: дымный след и пожар сбоку с 60 м
		smoker.position = Vector3(-60, 90, 20)
		burner.position = Vector3(-60, 70, 20)
		smoker_speed = Vector3(120, 0, 0)
		burner_speed = Vector3(120, 0, 0)
		pm.spawn_missile(Vector3(-80, 110, 30), Vector3(300, 0, 0), null, Data.plane("fantom").weapons.missiles, 1, 0)
		cam.position = Vector3(40, 85, 110)
		cam.look_at(Vector3(40, 85, 20))
		close_frame = frame
	elif stage == 8 and frame >= close_frame + 50:
		stage = 9
		_shot("closeup.png")
	elif stage == 10:
		stage = 11
		Game.battle = null
		get_tree().quit()


func _shot(file: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png(OUT + file)
	print("saved ", OUT + file, "  fps ", Engine.get_frames_per_second(), "  систем частиц ", fx.active_systems())
	stage += 1
