extends SceneTree

const GameStyle := preload("res://ui/style/style.gd")

const SCENE_PATH := "res://ui/menus/initial_screen.tscn"
const MAIN_SCENE_PATH := "res://app/main.tscn"
const MODAL_FRAME_PATH := "res://assets/ui/frames/modal_frame.png"

var failures: Array[String] = []
var quit_request_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	if not auto_accept_quit:
		_fail("SceneTree must retain default OS window-close handling")
	_assert_project_window_contract()
	_assert_main_scene_contract()

	var packed_scene := load(SCENE_PATH) as PackedScene
	if packed_scene == null:
		_fail("cannot load scene: %s" % SCENE_PATH)
		_finish()
		return

	var test_viewport := SubViewport.new()
	test_viewport.size = Vector2i(1280, 720)
	test_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(test_viewport)

	var scene := packed_scene.instantiate()
	test_viewport.add_child(scene)
	scene.connect(&"quit_requested", _record_quit_request)
	var menu_reveal := scene.get_node("%MenuReveal") as VBoxContainer
	if scene.fade_in_duration <= 0.0:
		_fail("scene must configure a positive fade-in duration")
	if not is_zero_approx(menu_reveal.modulate.a):
		_fail("menu fade-in must begin from zero alpha")
	await process_frame
	await process_frame

	_assert_text(scene, "%GameTitle", "一起做任务吧！")
	_assert_text(scene, "%NewGameButton", "新建游戏")
	_assert_text(scene, "%ContinueButton", "继续游戏")
	_assert_text(scene, "%SettingsButton", "设置")
	_assert_text(scene, "%QuitButton", "退出游戏")
	_assert_modal_frames(scene)
	_assert_modal_surfaces(scene)
	_assert_modal_bodies(scene)
	_assert_button_states(scene)

	await create_timer(scene.fade_in_duration + 0.1).timeout
	if menu_reveal.modulate.a < 0.99:
		_fail("menu fade-in must finish at full alpha")

	await _assert_modal_flow(scene, "%NewGameButton", "%NewGamePanel")
	await _assert_modal_flow(scene, "%ContinueButton", "%ContinuePanel")
	await _assert_modal_flow(scene, "%SettingsButton", "%SettingsPanel")
	var quit_button := scene.get_node("%QuitButton") as Button
	quit_button.emit_signal(&"pressed")
	await process_frame
	if quit_request_count != 1:
		_fail("quit button must emit exactly one quit request")

	test_viewport.queue_free()
	await process_frame
	_finish()


func _assert_modal_flow(scene: Node, button_path: String, panel_path: String) -> void:
	var opener := scene.get_node(button_path) as Button
	var panel := scene.get_node(panel_path) as CenterContainer
	var backdrop := scene.get_node("%ModalBackdrop") as ColorRect
	opener.emit_signal(&"pressed")
	await process_frame

	if not panel.visible:
		_fail("%s must open %s" % [button_path, panel_path])
	if not backdrop.visible:
		_fail("%s must show the modal backdrop" % button_path)
	var panel_body := panel.get_node("PanelBody") as Control
	if panel_body.size.x < GameStyle.MODAL_MIN_SIZE.x or panel_body.size.y < GameStyle.MODAL_MIN_SIZE.y:
		_fail("%s must render at or above GameStyle.MODAL_MIN_SIZE" % panel_path)
	_assert_only_panel_visible(scene, panel)
	_assert_menu_disabled(scene, true)

	var back_button := panel.find_child("BackButton", true, false) as Button
	if back_button == null:
		_fail("%s must provide a back button" % panel_path)
		return
	back_button.emit_signal(&"pressed")
	await process_frame

	if panel.visible:
		_fail("back button must close %s" % panel_path)
	if backdrop.visible:
		_fail("back button must hide the modal backdrop")
	_assert_menu_disabled(scene, false)


func _assert_modal_frames(scene: Node) -> void:
	var frames := scene.get_tree().get_nodes_in_group(&"modal_frame")
	if frames.size() != 3:
		_fail("three placeholder panels must use modal frames")
		return

	for frame in frames:
		if frame is not NinePatchRect:
			_fail("modal frame must be a NinePatchRect")
			continue
		if frame.texture == null or frame.texture.resource_path != MODAL_FRAME_PATH:
			_fail("modal frame must use %s" % MODAL_FRAME_PATH)
		if frame.patch_margin_left != GameStyle.MODAL_PATCH_MARGIN_X or frame.patch_margin_right != GameStyle.MODAL_PATCH_MARGIN_X:
			_fail("modal horizontal patch margins must use GameStyle")
		if frame.patch_margin_top != GameStyle.MODAL_PATCH_MARGIN_Y or frame.patch_margin_bottom != GameStyle.MODAL_PATCH_MARGIN_Y:
			_fail("modal vertical patch margins must use GameStyle")


func _assert_modal_bodies(scene: Node) -> void:
	var bodies := scene.get_tree().get_nodes_in_group(&"modal_body")
	if bodies.size() != 3:
		_fail("three placeholder panels must provide modal bodies")
		return
	for body in bodies:
		if body is not Control:
			_fail("modal body must be a Control")
			continue
		if body.custom_minimum_size != GameStyle.MODAL_MIN_SIZE:
			_fail("modal body minimum size must use GameStyle.MODAL_MIN_SIZE")


func _assert_modal_surfaces(scene: Node) -> void:
	var surfaces := scene.get_tree().get_nodes_in_group(&"modal_surface")
	if surfaces.size() != 3:
		_fail("three placeholder panels must provide surface layers")
		return
	for surface in surfaces:
		if surface is not ColorRect or surface.color != GameStyle.SURFACE:
			_fail("modal surfaces must use GameStyle.SURFACE")


func _assert_button_states(scene: Node) -> void:
	var button := scene.get_node("%SettingsButton") as Button
	var normal := button.get_theme_stylebox("normal") as StyleBoxFlat
	var hover := button.get_theme_stylebox("hover") as StyleBoxFlat
	var pressed := button.get_theme_stylebox("pressed") as StyleBoxFlat
	var focus := button.get_theme_stylebox("focus") as StyleBoxFlat
	if normal == null or hover == null or pressed == null or focus == null:
		_fail("button must define normal, hover, pressed, and focus styles")
		return
	if normal.bg_color != GameStyle.PRIMARY:
		_fail("normal button state must use GameStyle.PRIMARY")
	if hover.bg_color != GameStyle.PRIMARY_HOVER or hover.border_color != GameStyle.SECONDARY:
		_fail("hover button state must use GameStyle hover/accent tokens")
	if pressed.bg_color != GameStyle.PRIMARY_PRESSED:
		_fail("pressed button state must use GameStyle.PRIMARY_PRESSED")
	if focus.border_color != GameStyle.SECONDARY or focus.border_width_left != GameStyle.BUTTON_FOCUS_BORDER_WIDTH:
		_fail("focus button state must provide a visible GameStyle outline")
	for style in [normal, hover, pressed, focus]:
		if style.content_margin_left != GameStyle.BUTTON_CONTENT_MARGIN_X or style.content_margin_top != GameStyle.BUTTON_CONTENT_MARGIN_Y:
			_fail("button states must keep stable GameStyle content margins")


func _assert_only_panel_visible(scene: Node, expected_panel: Control) -> void:
	for panel_path in ["%NewGamePanel", "%ContinuePanel", "%SettingsPanel"]:
		var panel := scene.get_node(panel_path) as Control
		if panel.visible != (panel == expected_panel):
			_fail("only the selected placeholder panel may be visible")


func _assert_menu_disabled(scene: Node, expected_disabled: bool) -> void:
	var button_group := scene.get_node("%MenuButtonGroup") as VBoxContainer
	for child in button_group.get_children():
		if child is Button and child.disabled != expected_disabled:
			_fail("all menu buttons must share modal disabled state")


func _assert_text(scene: Node, node_path: String, expected_text: String) -> void:
	var control := scene.get_node(node_path)
	if control == null or not "text" in control or control.text != expected_text:
		_fail("%s must display '%s'" % [node_path, expected_text])


func _assert_main_scene_contract() -> void:
	var configured_main := str(ProjectSettings.get_setting("application/run/main_scene"))
	if configured_main != MAIN_SCENE_PATH:
		_fail("project main scene must be %s" % MAIN_SCENE_PATH)
		return
	var packed_main := load(MAIN_SCENE_PATH) as PackedScene
	if packed_main == null:
		_fail("cannot load main scene")
		return
	var main := packed_main.instantiate()
	var initial_screen := main.get_node("InitialScreen")
	var quit_handler := Callable(main, "_on_initial_screen_quit_requested")
	if not initial_screen.is_connected(&"quit_requested", quit_handler):
		_fail("main scene must connect InitialScreen quit intent to SceneTree quit")
	main.free()


func _assert_project_window_contract() -> void:
	var default_size := Vector2i(
		int(ProjectSettings.get_setting("display/window/size/viewport_width")),
		int(ProjectSettings.get_setting("display/window/size/viewport_height"))
	)
	var minimum_size := Vector2i(
		int(ProjectSettings.get_setting("display/window/size/min_width")),
		int(ProjectSettings.get_setting("display/window/size/min_height"))
	)
	if default_size != GameStyle.DESIGN_VIEWPORT_SIZE:
		_fail("project base size must use GameStyle.DESIGN_VIEWPORT_SIZE")
	if minimum_size != GameStyle.MIN_WINDOW_SIZE:
		_fail("project minimum window size must use GameStyle.MIN_WINDOW_SIZE")
	if not bool(ProjectSettings.get_setting("display/window/size/resizable")):
		_fail("project window must remain resizable")
	if str(ProjectSettings.get_setting("display/window/stretch/mode")) != "canvas_items":
		_fail("game UI must use canvas_items native scaling")
	if str(ProjectSettings.get_setting("display/window/stretch/aspect")) != "expand":
		_fail("game UI must use expand stretch aspect")


func _record_quit_request() -> void:
	quit_request_count += 1


func _finish() -> void:
	if failures.is_empty():
		print("PASS v0.1.0 native adaptive initial screen flow")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL %s" % failure)
		quit(1)


func _fail(message: String) -> void:
	failures.append(message)
