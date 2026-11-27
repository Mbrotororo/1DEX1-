extends Node
## QA (не коммитить): настройки и профиль между двумя запусками; влияние графики на мир.
## godot --headless --path skybreak res://tests/qa_meta_restart.tscn -- --phase=write|read|world

const TMP := "user://qa_meta_restart.json"

func _ready() -> void:
	var phase := "write"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--phase="):
			phase = a.substr(8)
	Profile.save_path = TMP
	match phase:
		"write":
			if FileAccess.file_exists(TMP):
				DirAccess.remove_absolute(TMP)
			Profile.load_profile()
			var vals := {"graphics": "low", "sensitivity": 1.4, "invert_y": true, "fov": 60.0, "engine_volume": 0.25,
				"effects_volume": 0.5, "player_name": "Сокол-7", "touch": "off", "show_fps": true}
			for k in vals:
				Profile.set_setting(k, vals[k])
			Profile.data.credits = 12345
			Profile.data.total_xp = 8100
			Profile.set_lineup_slot(0, "shmel")
			Profile.set_research_focus("krechet")
			Profile.set_last_setup({"mode": "realistic", "size": 8, "map_id": "reef", "time_of_day": "night", "weather": "fog"})
			Profile.save_profile()
			print("[qa] written settings=", Profile.data.settings, " lineup=", Profile.get_lineup())
		"read":
			Profile.load_profile()
			print("[qa] read settings=", Profile.data.settings)
			print("[qa] read credits=%d xp=%d rank=%s lineup=%s focus=%s setup=%s" % [Profile.data.credits, Profile.data.total_xp,
				Profile.player_rank().name, Profile.get_lineup(), Profile.data.research_focus, Profile.get_last_setup()])
			print("[qa] Game.is_touch()=", Game.is_touch())
			for bus in AudioServer.bus_count:
				print("[qa] bus %s volume_db=%.1f" % [AudioServer.get_bus_name(bus), AudioServer.get_bus_volume_db(bus)])
			DirAccess.remove_absolute(TMP)
		"badhangar":
			# настоящий прогресс + одно поле неверного типа (camo: число)
			var good := {"credits": 54321, "total_xp": 30000, "owned": ["strizh", "shmel", "krechet", "sokol"],
				"researched": ["strizh", "shmel", "krechet", "sokol"], "lineup": ["sokol", "krechet"],
				"camo": {"strizh": 5}, "stats": {"battles": 40, "wins": 22}}
			var f := FileAccess.open(TMP, FileAccess.WRITE)
			f.store_string(JSON.stringify(good))
			f.close()
			Profile.load_profile()
			print("[qa] after load data keys=", Profile.data.keys())
			var hangar = load("res://scenes/hangar.tscn").instantiate()
			add_child(hangar)
			for i in 10:
				await get_tree().process_frame
			print("[qa] file after hangar start: ", FileAccess.get_file_as_string(TMP).left(300))
			hangar.select_plane("shmel")
			await get_tree().process_frame
			print("[qa] file after selecting a plane: ", FileAccess.get_file_as_string(TMP).replace("\n", " ").left(300))
			hangar.queue_free()
			await get_tree().process_frame
			DirAccess.remove_absolute(TMP)
		"world":
			Profile.load_profile()
			for q in ["low", "medium", "high"]:
				Profile.data.settings.graphics = q
				var w = World.new()
				add_child(w)
				var t0 := Time.get_ticks_msec()
				w.build(Data.map_def("canyon"), "day", "cloudy", 4242, 1000)
				var ms := Time.get_ticks_msec() - t0
				var stats := {"nodes": 0, "mesh_inst": 0, "multimesh_inst": 0, "tris": 0, "shadow_lights": 0}
				_count(w, stats)
				print("[qa] world graphics=%s build_ms=%d %s" % [q, ms, stats])
				w.queue_free()
				await get_tree().process_frame
				await get_tree().process_frame
			DirAccess.remove_absolute(TMP)
	get_tree().quit()

func _count(n: Node, st: Dictionary) -> void:
	st.nodes += 1
	if n is MeshInstance3D and (n as MeshInstance3D).mesh != null:
		st.mesh_inst += 1
		var m: Mesh = (n as MeshInstance3D).mesh
		if m is ArrayMesh:
			for s in m.get_surface_count():
				var arr = m.surface_get_arrays(s)
				if arr[Mesh.ARRAY_INDEX] != null:
					st.tris += arr[Mesh.ARRAY_INDEX].size() / 3
				elif arr[Mesh.ARRAY_VERTEX] != null:
					st.tris += arr[Mesh.ARRAY_VERTEX].size() / 3
	if n is MultiMeshInstance3D and (n as MultiMeshInstance3D).multimesh != null:
		st.multimesh_inst += (n as MultiMeshInstance3D).multimesh.instance_count
	if n is Light3D and (n as Light3D).shadow_enabled:
		st.shadow_lights += 1
	for c in n.get_children():
		_count(c, st)
