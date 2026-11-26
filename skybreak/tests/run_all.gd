extends Node
## Запускает все tests/test_*.gd. Аргумент --only=имя запускает test_имя.gd.

func _ready() -> void:
	var only := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--only="):
			only = a.substr(7)
	var files: Array = []
	var dir := DirAccess.open("res://tests")
	for f in dir.get_files():
		if f.begins_with("test_") and f.ends_with(".gd"):
			if only == "" or f == "test_" + only + ".gd":
				files.append(f)
	files.sort()
	var failed := 0
	for f in files:
		var script = load("res://tests/" + f)
		if script == null:
			print("FAIL ", f, ": не загрузился")
			failed += 1
			continue
		var t = script.new()
		var errors = await t.run(get_tree())
		if errors == null:
			errors = []
		if errors.is_empty():
			print("PASS ", f)
		else:
			failed += 1
			print("FAIL ", f)
			for e in errors:
				print("   - ", e)
	print("ИТОГО: ", files.size() - failed, " из ", files.size(), " прошли")
	get_tree().quit(1 if failed > 0 else 0)
