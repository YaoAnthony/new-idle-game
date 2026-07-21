extends SceneTree

const GameStyle := preload("res://ui/style/style.gd")

const SCENE_PATH := "res://ui/menus/initial_screen.tscn"
const REQUIRED_VIEWPORTS := [
	Vector2i(1280, 720),
	Vector2i(960, 540),
]

const ROLE_KEY := "ui_test_role"
const ROLE_INITIAL_SCREEN := "initial_screen_root"
const ROLE_BACKGROUND := "home_background"
const ROLE_TITLE := "game_title"
const ROLE_BUTTON_GROUP := "menu_button_group"
const ROLE_NEW_GAME_BUTTON := "new_game_button"
const ROLE_CONTINUE_BUTTON := "continue_button"
const ROLE_SETTINGS_BUTTON := "settings_button"
const ROLE_QUIT_BUTTON := "quit_button"
const ROLE_MODAL_LAYER := "modal_layer"

const EXPECTED_BUTTON_ROLES := [
	ROLE_NEW_GAME_BUTTON,
	ROLE_CONTINUE_BUTTON,
	ROLE_SETTINGS_BUTTON,
	ROLE_QUIT_BUTTON,
]

var failures: Array[String] = []


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	if not ResourceLoader.exists(SCENE_PATH):
		_fail("missing scene: %s" % SCENE_PATH)
	else:
		for viewport_size in REQUIRED_VIEWPORTS:
			await _check_viewport(viewport_size)

	if failures.is_empty():
		print("PASS v0.1 initial screen layout")
		quit(0)
	else:
		for failure in failures:
			printerr("FAIL %s" % failure)
		quit(1)


func _check_viewport(viewport_size: Vector2i) -> void:
	root.size = viewport_size

	var packed_scene := load(SCENE_PATH) as PackedScene
	if packed_scene == null:
		_fail("cannot load scene: %s" % SCENE_PATH)
		return

	var scene := packed_scene.instantiate()
	root.add_child(scene)
	await process_frame
	await process_frame

	var initial_screen := _require_role(scene, ROLE_INITIAL_SCREEN, viewport_size)
	var background := _require_role(scene, ROLE_BACKGROUND, viewport_size)
	var title := _require_role(scene, ROLE_TITLE, viewport_size)
	var button_group := _require_role(scene, ROLE_BUTTON_GROUP, viewport_size)
	var modal_layer := _require_role(scene, ROLE_MODAL_LAYER, viewport_size)

	if background is Control:
		_assert_covers_viewport(background, viewport_size, ROLE_BACKGROUND)

	if title is Control:
		_assert_visible_rect(title, viewport_size, ROLE_TITLE)
		_assert_horizontally_centered(title, viewport_size, ROLE_TITLE)

	if button_group is VBoxContainer:
		_assert_button_group(button_group, viewport_size)
	elif button_group != null:
		_fail("[%s] role '%s' must be VBoxContainer, got %s" % [viewport_size, ROLE_BUTTON_GROUP, button_group.get_class()])

	if title is Control and button_group is Control:
		_assert_title_above_buttons(title, button_group, viewport_size)
		_assert_not_overlapping(title, button_group, viewport_size, ROLE_TITLE, ROLE_BUTTON_GROUP)
		_assert_menu_position(title, button_group, viewport_size)

	if modal_layer is Control:
		_assert_modal_initial_state(modal_layer, viewport_size)

	if initial_screen is Control:
		_assert_covers_viewport(initial_screen, viewport_size, ROLE_INITIAL_SCREEN)

	scene.queue_free()
	await process_frame


func _require_role(root_node: Node, role: String, viewport_size: Vector2i) -> Node:
	var found := _find_by_role(root_node, role)
	if found == null:
		_fail("[%s] missing ui_test_role '%s'" % [viewport_size, role])
	return found


func _find_by_role(node: Node, role: String) -> Node:
	if node.has_meta(ROLE_KEY) and str(node.get_meta(ROLE_KEY)) == role:
		return node

	for child in node.get_children():
		var found := _find_by_role(child, role)
		if found != null:
			return found

	return null


func _assert_button_group(button_group: VBoxContainer, viewport_size: Vector2i) -> void:
	_assert_visible_rect(button_group, viewport_size, ROLE_BUTTON_GROUP)
	_assert_horizontally_centered(button_group, viewport_size, ROLE_BUTTON_GROUP)

	if button_group.get_theme_constant("separation") != GameStyle.BUTTON_SEPARATION:
		_fail("[%s] button separation must equal GameStyle.BUTTON_SEPARATION" % viewport_size)

	if button_group.size.x > float(GameStyle.MENU_MAX_WIDTH) + 1.0:
		_fail("[%s] button group width %.2f exceeds GameStyle.MENU_MAX_WIDTH" % [viewport_size, button_group.size.x])

	var role_index := 0
	for child in button_group.get_children():
		if role_index >= EXPECTED_BUTTON_ROLES.size():
			break
		if child is Button:
			var expected_role: String = EXPECTED_BUTTON_ROLES[role_index]
			if not child.has_meta(ROLE_KEY) or str(child.get_meta(ROLE_KEY)) != expected_role:
				_fail("[%s] button index %d must have role '%s'" % [viewport_size, role_index, expected_role])
			_assert_button_size(child, viewport_size, expected_role)
			role_index += 1

	if role_index != EXPECTED_BUTTON_ROLES.size():
		_fail("[%s] button group must contain four Button children in expected order" % viewport_size)


func _assert_button_size(button: Button, viewport_size: Vector2i, role: String) -> void:
	if button.size.x + 1.0 < GameStyle.BUTTON_MIN_SIZE.x:
		_fail("[%s] %s width %.2f is below GameStyle.BUTTON_MIN_SIZE.x" % [viewport_size, role, button.size.x])
	if button.size.y + 1.0 < GameStyle.BUTTON_MIN_SIZE.y:
		_fail("[%s] %s height %.2f is below GameStyle.BUTTON_MIN_SIZE.y" % [viewport_size, role, button.size.y])


func _assert_covers_viewport(control: Control, viewport_size: Vector2i, role: String) -> void:
	var rect := control.get_global_rect()
	if rect.position.x > 1.0 or rect.position.y > 1.0:
		_fail("[%s] %s does not start at viewport origin: %s" % [viewport_size, role, rect])
	if rect.end.x + 1.0 < viewport_size.x or rect.end.y + 1.0 < viewport_size.y:
		_fail("[%s] %s does not cover viewport: %s" % [viewport_size, role, rect])


func _assert_visible_rect(control: Control, viewport_size: Vector2i, role: String) -> void:
	var rect := control.get_global_rect()
	if not control.visible:
		_fail("[%s] %s is not visible" % [viewport_size, role])
	if rect.size.x <= 0.0 or rect.size.y <= 0.0:
		_fail("[%s] %s has empty rect: %s" % [viewport_size, role, rect])
	if rect.position.x < -1.0 or rect.position.y < -1.0 or rect.end.x > viewport_size.x + 1.0 or rect.end.y > viewport_size.y + 1.0:
		_fail("[%s] %s is outside viewport: %s" % [viewport_size, role, rect])


func _assert_horizontally_centered(control: Control, viewport_size: Vector2i, role: String) -> void:
	var rect := control.get_global_rect()
	var center_delta: float = abs(rect.get_center().x - float(viewport_size.x) * 0.5)
	var allowed_delta: float = float(viewport_size.x) * 0.08
	if center_delta > allowed_delta:
		_fail("[%s] %s is not horizontally centered enough: delta %.2f > %.2f" % [viewport_size, role, center_delta, allowed_delta])


func _assert_title_above_buttons(title: Control, button_group: Control, viewport_size: Vector2i) -> void:
	if title.get_global_rect().end.y > button_group.get_global_rect().position.y:
		_fail("[%s] title must be above button group" % viewport_size)


func _assert_menu_position(title: Control, button_group: Control, viewport_size: Vector2i) -> void:
	var menu_rect := title.get_global_rect().merge(button_group.get_global_rect())
	var center_y_ratio := menu_rect.get_center().y / float(viewport_size.y)
	if center_y_ratio < 0.28 or center_y_ratio > 0.56:
		_fail("[%s] menu center y ratio %.3f must stay slightly above center" % [viewport_size, center_y_ratio])

	var gap := button_group.get_global_rect().position.y - title.get_global_rect().end.y
	if abs(gap - float(GameStyle.MENU_TITLE_GAP)) > 8.0:
		_fail("[%s] title/button gap %.2f must be close to GameStyle.MENU_TITLE_GAP" % [viewport_size, gap])


func _assert_not_overlapping(first: Control, second: Control, viewport_size: Vector2i, first_role: String, second_role: String) -> void:
	if first.get_global_rect().intersects(second.get_global_rect()):
		_fail("[%s] %s overlaps %s" % [viewport_size, first_role, second_role])


func _assert_modal_initial_state(modal_layer: Control, viewport_size: Vector2i) -> void:
	for child in modal_layer.get_children():
		if child is Control and child.visible:
			_fail("[%s] modal child '%s' should not be visible on initial menu" % [viewport_size, child.name])


func _fail(message: String) -> void:
	failures.append(message)
