extends Node
## ЗАГЛУШКА. Заменяется реализацией модуля. API — в CONTRACT.md.

func play(name: String, pos = null, volume_db := 0.0, pitch := 1.0) -> void:
	pass

func make_engine(kind: String) -> AudioStreamPlayer3D:
	return AudioStreamPlayer3D.new()

func set_engine(player: AudioStreamPlayer3D, rpm01: float, afterburner: bool) -> void:
	pass

func make_wind() -> AudioStreamPlayer:
	return AudioStreamPlayer.new()
