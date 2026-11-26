extends RefCounted
## Проверяет, что все скрипты проекта компилируются и все сцены загружаются.

func _walk(path: String, ext: String, out: Array) -> void:
	var d := DirAccess.open(path)
	if d == null:
		return
	for f in d.get_files():
		if f.ends_with(ext):
			out.append(path.path_join(f))
	for sub in d.get_directories():
		if sub.begins_with("."):
			continue
		_walk(path.path_join(sub), ext, out)

func run(tree: SceneTree) -> Array:
	var errors: Array = []
	var scripts: Array = []
	_walk("res://", ".gd", scripts)
	for p in scripts:
		var s = load(p)
		if s == null or not (s is GDScript) or not s.can_instantiate():
			errors.append("скрипт не компилируется: " + p)
	var scenes: Array = []
	_walk("res://scenes", ".tscn", scenes)
	for p in scenes:
		var ps = load(p)
		if ps == null:
			errors.append("сцена не загружается: " + p)
	for id in Data.ORDER:
		var d: Dictionary = Data.plane(id)
		if d.parent != "" and not Data.has_plane(d.parent):
			errors.append("нет родителя у " + id)
	return errors
