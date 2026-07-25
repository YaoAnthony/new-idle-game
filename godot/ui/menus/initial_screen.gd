extends Control

signal quit_requested

const GameStyle := preload("res://ui/style/style.gd")

@export_range(0.0, 2.0, 0.05) var fade_in_duration: float

@onready var background_wash: ColorRect = %BackgroundWash
@onready var menu_reveal: VBoxContainer = %MenuReveal
@onready var menu_button_group: VBoxContainer = %MenuButtonGroup
@onready var title_banner: PanelContainer = %TitleBanner
@onready var game_title: Label = %GameTitle
@onready var modal_layer: Control = %ModalLayer
@onready var modal_backdrop: ColorRect = %ModalBackdrop
@onready var new_game_panel: CenterContainer = %NewGamePanel
@onready var continue_panel: CenterContainer = %ContinuePanel
@onready var settings_panel: CenterContainer = %SettingsPanel

var active_panel: Control
var modal_opener: Button


func _ready() -> void:
	_apply_layout_tokens()
	_apply_title_style()
	_apply_button_theme()
	_apply_modal_frames()
	_connect_actions()
	_play_fade_in()


func _unhandled_input(event: InputEvent) -> void:
	if active_panel != null and event.is_action_pressed(&"ui_cancel"):
		_close_modal()
		get_viewport().set_input_as_handled()


func _apply_layout_tokens() -> void:
	background_wash.color = GameStyle.BACKGROUND_WASH
	menu_reveal.add_theme_constant_override("separation", GameStyle.MENU_TITLE_GAP)
	menu_button_group.add_theme_constant_override("separation", GameStyle.BUTTON_SEPARATION)
	menu_button_group.custom_minimum_size.x = GameStyle.BUTTON_MIN_SIZE.x

	for button in get_tree().get_nodes_in_group(&"menu_button"):
		if button is Button:
			button.custom_minimum_size = GameStyle.BUTTON_MIN_SIZE

	for button in get_tree().get_nodes_in_group(&"modal_back_button"):
		if button is Button:
			button.custom_minimum_size = GameStyle.BACK_BUTTON_MIN_SIZE


func _apply_title_style() -> void:
	game_title.add_theme_color_override("font_color", GameStyle.TITLE_FILL)
	game_title.add_theme_color_override("font_outline_color", GameStyle.TITLE_OUTLINE)
	game_title.add_theme_color_override("font_shadow_color", GameStyle.TITLE_SHADOW)
	game_title.add_theme_font_size_override("font_size", GameStyle.TITLE_FONT_SIZE)
	game_title.add_theme_constant_override("outline_size", GameStyle.TITLE_OUTLINE_SIZE)
	game_title.add_theme_constant_override("shadow_offset_x", int(GameStyle.TITLE_SHADOW_OFFSET.x))
	game_title.add_theme_constant_override("shadow_offset_y", int(GameStyle.TITLE_SHADOW_OFFSET.y))

	var banner_style := StyleBoxFlat.new()
	banner_style.bg_color = GameStyle.TITLE_SURFACE
	banner_style.border_color = GameStyle.TITLE_BORDER
	banner_style.set_border_width_all(GameStyle.TITLE_BANNER_BORDER_WIDTH)
	banner_style.set_corner_radius_all(GameStyle.TITLE_BANNER_CORNER_RADIUS)
	banner_style.content_margin_left = GameStyle.TITLE_BANNER_MARGIN_X
	banner_style.content_margin_right = GameStyle.TITLE_BANNER_MARGIN_X
	banner_style.content_margin_top = GameStyle.TITLE_BANNER_MARGIN_Y
	banner_style.content_margin_bottom = GameStyle.TITLE_BANNER_MARGIN_Y
	title_banner.add_theme_stylebox_override("panel", banner_style)


func _apply_button_theme() -> void:
	var normal_style := _create_button_style(GameStyle.PRIMARY, GameStyle.TITLE_OUTLINE, GameStyle.BUTTON_BORDER_WIDTH)
	var hover_style := _create_button_style(GameStyle.PRIMARY_HOVER, GameStyle.SECONDARY, GameStyle.BUTTON_BORDER_WIDTH)
	var pressed_style := _create_button_style(GameStyle.PRIMARY_PRESSED, GameStyle.SECONDARY, GameStyle.BUTTON_BORDER_WIDTH)
	var disabled_style := _create_button_style(GameStyle.BUTTON_DISABLED, GameStyle.TITLE_OUTLINE, GameStyle.BUTTON_BORDER_WIDTH)
	var focus_style := _create_button_style(GameStyle.FOCUS_FILL, GameStyle.SECONDARY, GameStyle.BUTTON_FOCUS_BORDER_WIDTH)
	focus_style.draw_center = false

	for button in get_tree().get_nodes_in_group(&"styled_button"):
		if button is not Button:
			continue
		button.add_theme_stylebox_override("normal", normal_style)
		button.add_theme_stylebox_override("hover", hover_style)
		button.add_theme_stylebox_override("pressed", pressed_style)
		button.add_theme_stylebox_override("disabled", disabled_style)
		button.add_theme_stylebox_override("focus", focus_style)
		button.add_theme_color_override("font_color", GameStyle.BUTTON_TEXT)
		button.add_theme_color_override("font_hover_color", GameStyle.BUTTON_TEXT)
		button.add_theme_color_override("font_pressed_color", GameStyle.BUTTON_TEXT_PRESSED)
		button.add_theme_color_override("font_focus_color", GameStyle.BUTTON_TEXT)
		button.add_theme_color_override("font_disabled_color", GameStyle.BUTTON_DISABLED_TEXT)


func _create_button_style(background: Color, border: Color, border_width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(GameStyle.BUTTON_CORNER_RADIUS)
	style.content_margin_left = GameStyle.BUTTON_CONTENT_MARGIN_X
	style.content_margin_right = GameStyle.BUTTON_CONTENT_MARGIN_X
	style.content_margin_top = GameStyle.BUTTON_CONTENT_MARGIN_Y
	style.content_margin_bottom = GameStyle.BUTTON_CONTENT_MARGIN_Y
	style.shadow_color = GameStyle.BUTTON_SHADOW
	style.shadow_size = GameStyle.BUTTON_SHADOW_SIZE
	style.shadow_offset = GameStyle.BUTTON_SHADOW_OFFSET
	return style


func _apply_modal_frames() -> void:
	modal_backdrop.color = GameStyle.MODAL_BACKDROP
	for surface in get_tree().get_nodes_in_group(&"modal_surface"):
		if surface is not ColorRect:
			continue
		surface.color = GameStyle.SURFACE
		surface.offset_left = GameStyle.MODAL_SURFACE_INSET_X
		surface.offset_right = -GameStyle.MODAL_SURFACE_INSET_X
		surface.offset_top = GameStyle.MODAL_SURFACE_INSET_Y
		surface.offset_bottom = -GameStyle.MODAL_SURFACE_INSET_Y

	for frame in get_tree().get_nodes_in_group(&"modal_frame"):
		if frame is not NinePatchRect:
			continue
		frame.patch_margin_left = GameStyle.MODAL_PATCH_MARGIN_X
		frame.patch_margin_right = GameStyle.MODAL_PATCH_MARGIN_X
		frame.patch_margin_top = GameStyle.MODAL_PATCH_MARGIN_Y
		frame.patch_margin_bottom = GameStyle.MODAL_PATCH_MARGIN_Y

	for panel_body in get_tree().get_nodes_in_group(&"modal_body"):
		if panel_body is Control:
			panel_body.custom_minimum_size = GameStyle.MODAL_MIN_SIZE

	for content in get_tree().get_nodes_in_group(&"modal_content"):
		if content is not MarginContainer:
			continue
		content.add_theme_constant_override("margin_left", GameStyle.MODAL_CONTENT_MARGIN_X)
		content.add_theme_constant_override("margin_right", GameStyle.MODAL_CONTENT_MARGIN_X)
		content.add_theme_constant_override("margin_top", GameStyle.MODAL_CONTENT_MARGIN_Y)
		content.add_theme_constant_override("margin_bottom", GameStyle.MODAL_CONTENT_MARGIN_Y)

	for actions in get_tree().get_nodes_in_group(&"modal_actions"):
		if actions is VBoxContainer:
			actions.add_theme_constant_override("separation", GameStyle.MODAL_ACTION_SEPARATION)


func _connect_actions() -> void:
	%NewGameButton.pressed.connect(_open_modal.bind(new_game_panel, %NewGameButton))
	%ContinueButton.pressed.connect(_open_modal.bind(continue_panel, %ContinueButton))
	%SettingsButton.pressed.connect(_open_modal.bind(settings_panel, %SettingsButton))
	%QuitButton.pressed.connect(_request_quit)

	for button in get_tree().get_nodes_in_group(&"modal_back_button"):
		if button is Button:
			button.pressed.connect(_close_modal)


func _play_fade_in() -> void:
	menu_reveal.modulate.a = 0.0
	var tween := create_tween()
	tween.tween_property(menu_reveal, "modulate:a", 1.0, fade_in_duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _open_modal(panel: Control, opener: Button) -> void:
	_close_active_panel()
	active_panel = panel
	modal_opener = opener
	modal_backdrop.show()
	panel.show()
	var panel_body := panel.get_node("PanelBody") as Control
	panel_body.reset_size()
	panel.queue_sort()
	_set_menu_buttons_disabled(true)
	var back_button := panel.find_child("BackButton", true, false) as Button
	if back_button != null:
		back_button.grab_focus()


func _close_modal() -> void:
	_close_active_panel()
	modal_backdrop.hide()
	_set_menu_buttons_disabled(false)
	if modal_opener != null and is_instance_valid(modal_opener):
		modal_opener.grab_focus()
	modal_opener = null


func _close_active_panel() -> void:
	if active_panel != null:
		active_panel.hide()
	active_panel = null


func _set_menu_buttons_disabled(is_disabled: bool) -> void:
	for button in menu_button_group.get_children():
		if button is Button:
			button.disabled = is_disabled


func _request_quit() -> void:
	quit_requested.emit()
