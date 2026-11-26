extends Node
## Поддельный Recorder: просто собирает события.

var events: Array = []


func event(type: String, data: Dictionary) -> void:
	events.append({"type": type, "data": data})


func count(type: String) -> int:
	var n := 0
	for e in events:
		if e.type == type:
			n += 1
	return n


func last(type: String) -> Dictionary:
	for i in range(events.size() - 1, -1, -1):
		if events[i].type == type:
			return events[i].data
	return {}


func current_time() -> float:
	return 0.0
