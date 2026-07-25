extends SceneTree

const SCENE_PATH := "res://ui/menus/initial_screen.tscn"
const SETTLE_FRAMES := 40


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var arguments := _parse_arguments()
	var viewport_size := arguments.size as Vector2i
	var output_path := arguments.output as String
	var open_panel := arguments.open_panel as String
	DisplayServer.window_set_size(viewport_size)

	var packed_scene := load(SCENE_PATH) as PackedScene
	if packed_scene == null:
		printerr("FAIL cannot load scene: %s" % SCENE_PATH)
		quit(1)
		return

	var scene := packed_scene.instantiate()
	root.add_child(scene)
	await process_frame
	if open_panel == "new-game":
		(scene.get_node("%NewGameButton") as Button).emit_signal(&"pressed")
	elif open_panel == "continue":
		(scene.get_node("%ContinueButton") as Button).emit_signal(&"pressed")
	elif open_panel == "settings":
		(scene.get_node("%SettingsButton") as Button).emit_signal(&"pressed")
	for frame in SETTLE_FRAMES:
		await process_frame
	if not open_panel.is_empty():
		var visible_panel_body := _find_visible_panel_body(scene)
		if visible_panel_body != null:
			print("Modal body rect: %s" % visible_panel_body.get_global_rect())

	var image := root.get_texture().get_image()
	if image == null:
		printerr("FAIL active renderer cannot capture the root viewport")
		quit(1)
		return
	var error := image.save_png(ProjectSettings.globalize_path(output_path))
	if error != OK:
		printerr("FAIL cannot save screenshot: %s" % error_string(error))
		quit(1)
		return

	print("PASS captured %s; requested window %s, image %s, logical viewport %s" % [output_path, viewport_size, image.get_size(), root.get_visible_rect().size])
	quit(0)


func _parse_arguments() -> Dictionary:
	var viewport_size := Vector2i(1280, 720)
	var output_path := "res://docs/evals/evidence/v0.1.0/initial-screen-1280x720.png"
	var open_panel := ""
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--size="):
			var dimensions := argument.trim_prefix("--size=").split("x")
			if dimensions.size() == 2:
				viewport_size = Vector2i(dimensions[0].to_int(), dimensions[1].to_int())
		elif argument.begins_with("--output="):
			output_path = argument.trim_prefix("--output=")
		elif argument.begins_with("--open="):
			open_panel = argument.trim_prefix("--open=")
	return {"size": viewport_size, "output": output_path, "open_panel": open_panel}


func _find_visible_panel_body(scene: Node) -> Control:
	for panel_path in ["%NewGamePanel", "%ContinuePanel", "%SettingsPanel"]:
		var panel := scene.get_node(panel_path) as Control
		if panel.visible:
			return panel.get_node("PanelBody") as Control
	return null
