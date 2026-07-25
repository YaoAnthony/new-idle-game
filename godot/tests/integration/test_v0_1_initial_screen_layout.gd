extends SceneTree

const GameStyle := preload("res://ui/style/style.gd")

const SCENE_PATH := "res://ui/menus/initial_screen.tscn"
const LOGICAL_VIEWPORTS := [
	Vector2i(1280, 720),
	Vector2i(1280, 768),
	Vector2i(1280, 960),
	Vector2i(1707, 720),
]
const EXPECTED_BUTTON_ROLES := [
	"new_game_button",
	"continue_button",
	"settings_button",
	"quit_button",
]

var failures: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	for viewport_size in LOGICAL_VIEWPORTS:
		await _check_viewport(viewport_size)

	if failures.is_empty():
		print("PASS v0.1.0 native adaptive initial screen layout")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL %s" % failure)
		quit(1)


func _check_viewport(viewport_size: Vector2i) -> void:
	var packed_scene := load(SCENE_PATH) as PackedScene
	if packed_scene == null:
		_fail("missing scene: %s" % SCENE_PATH)
		return

	var test_viewport := SubViewport.new()
	test_viewport.size = viewport_size
	test_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(test_viewport)

	var scene := packed_scene.instantiate() as Control
	test_viewport.add_child(scene)
	await process_frame
	await process_frame

	var background := scene.get_node("HomeBackground") as TextureRect
	var menu_center := scene.get_node("MenuCenter") as CenterContainer
	var menu_reveal := scene.get_node("%MenuReveal") as VBoxContainer
	var title_banner := scene.get_node("%TitleBanner") as PanelContainer
	var button_group := scene.get_node("%MenuButtonGroup") as VBoxContainer

	_assert_full_rect(scene, viewport_size, "initial screen")
	_assert_full_rect(background, viewport_size, "background")
	_assert_full_rect(menu_center, viewport_size, "menu center")
	_assert_inside(title_banner, viewport_size, "title")
	_assert_inside(button_group, viewport_size, "button group")
	_assert_centered(menu_reveal, viewport_size, "menu")
	_assert_menu_contract(title_banner, button_group, viewport_size)
	await _assert_settings_modal(scene, viewport_size)

	test_viewport.queue_free()
	await process_frame


func _assert_menu_contract(title_banner: PanelContainer, button_group: VBoxContainer, viewport_size: Vector2i) -> void:
	if button_group.get_theme_constant("separation") != GameStyle.BUTTON_SEPARATION:
		_fail("[%s] VBox separation must use GameStyle.BUTTON_SEPARATION" % viewport_size)
	if button_group.get_child_count() != EXPECTED_BUTTON_ROLES.size():
		_fail("[%s] button group must contain four buttons" % viewport_size)
		return

	for index in EXPECTED_BUTTON_ROLES.size():
		var button := button_group.get_child(index) as Button
		var role: String = EXPECTED_BUTTON_ROLES[index]
		if button == null or str(button.get_meta("ui_test_role", "")) != role:
			_fail("[%s] button %d must have role '%s'" % [viewport_size, index, role])
			continue
		if button.size.x + 1.0 < GameStyle.BUTTON_MIN_SIZE.x or button.size.y + 1.0 < GameStyle.BUTTON_MIN_SIZE.y:
			_fail("[%s] %s is below GameStyle.BUTTON_MIN_SIZE" % [viewport_size, role])

	var gap := button_group.get_global_rect().position.y - title_banner.get_global_rect().end.y
	if abs(gap - GameStyle.MENU_TITLE_GAP) > 1.0:
		_fail("[%s] title/button gap must use GameStyle.MENU_TITLE_GAP" % viewport_size)
	if title_banner.get_global_rect().intersects(button_group.get_global_rect()):
		_fail("[%s] title overlaps button group" % viewport_size)


func _assert_settings_modal(scene: Control, viewport_size: Vector2i) -> void:
	(scene.get_node("%SettingsButton") as Button).emit_signal(&"pressed")
	await process_frame
	await process_frame

	var panel := scene.get_node("%SettingsPanel") as CenterContainer
	var body := panel.get_node("PanelBody") as Control
	if not panel.visible:
		_fail("[%s] settings modal did not open" % viewport_size)
	_assert_inside(body, viewport_size, "settings modal")
	_assert_centered(body, viewport_size, "settings modal")
	if body.custom_minimum_size != GameStyle.MODAL_MIN_SIZE:
		_fail("[%s] modal must use the single GameStyle.MODAL_MIN_SIZE" % viewport_size)

	var back_button := panel.find_child("BackButton", true, false) as Button
	if back_button == null:
		_fail("[%s] settings modal is missing BackButton" % viewport_size)
		return
	back_button.emit_signal(&"pressed")
	await process_frame


func _assert_full_rect(control: Control, viewport_size: Vector2i, role: String) -> void:
	var rect := control.get_global_rect()
	if rect.position.distance_to(Vector2.ZERO) > 1.0 or rect.size.distance_to(Vector2(viewport_size)) > 1.0:
		_fail("[%s] %s must cover the logical viewport, got %s" % [viewport_size, role, rect])


func _assert_inside(control: Control, viewport_size: Vector2i, role: String) -> void:
	var rect := control.get_global_rect()
	if rect.size.x <= 0.0 or rect.size.y <= 0.0:
		_fail("[%s] %s has an empty rect" % [viewport_size, role])
	if rect.position.x < -1.0 or rect.position.y < -1.0 or rect.end.x > viewport_size.x + 1.0 or rect.end.y > viewport_size.y + 1.0:
		_fail("[%s] %s is outside the logical viewport: %s" % [viewport_size, role, rect])


func _assert_centered(control: Control, viewport_size: Vector2i, role: String) -> void:
	var center_delta := control.get_global_rect().get_center().distance_to(Vector2(viewport_size) * 0.5)
	if center_delta > 1.0:
		_fail("[%s] %s must be centered, delta %.2f" % [viewport_size, role, center_delta])


func _fail(message: String) -> void:
	failures.append(message)
