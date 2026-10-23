extends Control
## The kit in a game's HUD: hearts, health, mana and stamina bars, a boss bar, a party panel of
## plain ProgressBars under a style's Theme, status columns, two orbs, cooldown rings and a
## segmented XP bar. The buttons hit, heal and cast; the row under them swaps the frame style.

const KIT := "res://addons/pixel_bars/"
const ALL_STYLES: Array[String] = ["wood", "stone", "sky", "forest", "royal", "ember", "gilded", "cyan"]
const ALL_FILLS: Array[String] = ["health", "mana", "stamina", "xp", "shield", "rage", "magic", "poison"]
const ART_HEIGHT := 240.0
const COOLDOWN := 2.5  # seconds a ring takes to refill

## Store capture only: plays hits, heals and casts by itself, and swaps the style every
## `auto_style_frames` frames (0: never).
@export var auto := false
@export var auto_style_frames := 0

var style := "wood"
var bars: Array[PixelBar] = []
var style_buttons := {}
var party: Control
var hearts: PixelHearts
var hp: PixelBar
var mp: PixelBar
var stamina: PixelBar
var boss: PixelBar
var hp_orb: PixelBar
var mp_orb: PixelBar
var rings: Array[PixelBar] = []
var mobs: Array[PixelBar] = []
var xp: PixelBar
var frame := 0


## Draws at a whole-number scale so the art pixels stay square: the largest that still fits
## `art_height` pixels of art on screen.
static func pixel_scale(node: Node, art_height: float) -> void:
	var window := node.get_tree().root
	window.content_scale_factor = 1.0
	window.content_scale_factor = maxf(1.0, floorf(window.get_visible_rect().size.y / art_height))


static func installed(folder: String, names: Array[String]) -> Array[String]:
	return names.filter(func(n: String) -> bool: return DirAccess.dir_exists_absolute(KIT + folder + n))


static func styles() -> Array[String]:
	return installed("frames/", ALL_STYLES)


static func fills() -> Array[String]:
	return installed("fills/", ALL_FILLS)


## The fill if the kit has it, else the first it has: the free sampler has three.
static func some_fill(name: String) -> String:
	return name if name in fills() else fills()[0]


static func bar(parent: Control, shape: PixelBar.Shape, fill: String, at: Vector2, length := 0.0, value := 100.0) -> PixelBar:
	var b := PixelBar.new()
	b.shape = shape
	b.fill = some_fill(fill)
	b.position = at
	if length > 0.0:
		b.custom_minimum_size = Vector2(12, length) if shape == PixelBar.Shape.VERTICAL else Vector2(length, {PixelBar.Shape.THIN: 7, PixelBar.Shape.BOSS: 16}.get(shape, 12))
	b.value = value
	parent.add_child(b)
	b.settle()
	return b


static func label(parent: Control, text: String, at: Vector2) -> Label:
	var l := Label.new()
	l.text = text
	l.position = at
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	parent.add_child(l)
	return l


## The style's Theme: its ProgressBars, and the pixel font; plus buttons cut from its frame.
static func style_theme(name: String) -> Theme:
	var t: Theme = load(KIT + "themes/%s.tres" % name).duplicate()
	for state in [["normal", 1.0], ["hover", 1.25], ["pressed", 0.8], ["focus", 1.0]]:
		var sb := StyleBoxTexture.new()
		sb.texture = load(KIT + "frames/%s/bar.png" % name)
		sb.set_texture_margin_all(4)
		sb.set_content_margin_all(4)
		sb.content_margin_top = 2
		sb.content_margin_bottom = 2
		sb.modulate_color = Color(state[1], state[1], state[1])
		if state[0] == "focus":
			sb.draw_center = false
			sb.modulate_color.a = 0.0
		t.set_stylebox(state[0], "Button", sb)
	return t


func _ready() -> void:
	get_viewport().canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST  # project.godot's, for a project without it
	pixel_scale(self, ART_HEIGHT)
	var width := get_viewport_rect().size.x
	style = styles()[0]
	theme = style_theme(style)
	_player()
	_boss(width)
	_party(width)
	_status()
	_mobs(width)
	_bottom(width)
	_buttons(width)


func _player() -> void:
	hearts = PixelHearts.new()
	hearts.max_value = 20
	hearts.value = 14
	hearts.position = Vector2(6, 6)
	add_child(hearts)
	hp = bar(self, PixelBar.Shape.BAR, "health", Vector2(6, 26), 100, 80)
	hp.low = 0.3
	mp = bar(self, PixelBar.Shape.BAR, "mana", Vector2(6, 40), 80, 65)
	stamina = bar(self, PixelBar.Shape.THIN, "stamina", Vector2(6, 54), 64, 100)
	bars.append_array([hp, mp, stamina])


func _boss(width: float) -> void:
	boss = bar(self, PixelBar.Shape.BOSS, "health", Vector2(roundf(width / 2 - 89), 8), 176, 90)
	boss.segments = 4
	bars.append(boss)
	var name_label := label(self, "THE HOLLOW KING", Vector2.ZERO)
	name_label.position = Vector2(roundf(width / 2 - name_label.get_minimum_size().x / 2 + 8), 25)


## Plain ProgressBars: the style's Theme gives them its frame and a fill per variation.
func _party(width: float) -> void:
	party = GridContainer.new()
	party.columns = 3
	party.position = Vector2(width - 120, 6)
	party.add_theme_constant_override("h_separation", 2)
	party.add_theme_constant_override("v_separation", 2)
	add_child(party)
	for member in [["Wren", 90, 40], ["Bram", 35, 70], ["Cyn", 60, 100]]:
		var l := Label.new()
		l.text = member[0]
		l.custom_minimum_size.x = 26
		party.add_child(l)
		for pair in [["HealthBar", member[1], 52], ["ManaBar", member[2], 36]]:
			var p := ProgressBar.new()
			p.theme_type_variation = StringName(pair[0])
			p.show_percentage = false
			p.value = pair[1]
			p.custom_minimum_size = Vector2(pair[2], 12)
			party.add_child(p)


## Bars over the enemies' heads: thin ones, a shield over the health of one.
func _mobs(width: float) -> void:
	var x := roundf(width / 2 - 120)
	for mob in [["Slime", "health", 100, ""], ["Knight", "health", 70, "shield"], ["Wisp", "magic", 45, "poison"]]:
		var name_label := label(self, mob[0], Vector2(x, 106))
		name_label.position.x = x + 24 - roundf(name_label.get_minimum_size().x / 2)
		var b := bar(self, PixelBar.Shape.THIN, mob[1], Vector2(x, 118), 48, mob[2])
		bars.append(b)
		mobs.append(b)
		if mob[3] != "" and mob[3] in fills():
			var extra := bar(self, PixelBar.Shape.THIN, mob[3], Vector2(x, 126), 48, 60)
			bars.append(extra)
			mobs.append(extra)
		x += 96


func _status() -> void:
	var x := 6.0
	var shown: Array = ["rage", "shield", "magic", "poison"].filter(func(f: String) -> bool: return f in fills())
	if shown.is_empty():  # the sampler's
		shown = fills()
	for i in shown.size():
		var fill: String = shown[i]
		var b := bar(self, PixelBar.Shape.VERTICAL, fill, Vector2(x, 86), 56, [70, 45, 90, 25][i % 4])
		b.segments = 4
		bars.append(b)
		label(self, fill.left(1).to_upper(), Vector2(x + 3, 142))
		x += 16


func _bottom(width: float) -> void:
	hp_orb = bar(self, PixelBar.Shape.ORB, "health", Vector2(6, 168), 0, 80)
	hp_orb.scale = Vector2(2, 2)
	mp_orb = bar(self, PixelBar.Shape.ORB, "mana", Vector2(width - 70, 168), 0, 65)
	mp_orb.scale = Vector2(2, 2)
	bars.append_array([hp_orb, mp_orb])
	for i in 4:
		var r := bar(self, PixelBar.Shape.RING, ["magic", "mana", "rage", "shield"][i], Vector2(roundf(width / 2 - 52 + i * 28), 196), 0, 100)
		r.trail = false
		r.flash = false
		bars.append(r)
		rings.append(r)
		label(self, str(i + 1), r.position + Vector2(8, 5))
	xp = bar(self, PixelBar.Shape.BAR, "xp", Vector2(roundf(width / 2 - 110), 222), 220, 40)
	xp.segments = 10
	xp.trail = false
	xp.flash = false
	bars.append(xp)


func _buttons(width: float) -> void:
	var actions := HBoxContainer.new()
	actions.add_theme_constant_override("separation", 4)
	add_child(actions)
	for pair in [["Hit", hit], ["Heal", heal], ["Cast", cast], ["Strike boss", strike]]:
		var b := Button.new()
		b.text = pair[0]
		b.pressed.connect(pair[1])
		actions.add_child(b)
	actions.position = Vector2(roundf(width / 2 - actions.get_combined_minimum_size().x / 2), 44)
	var switcher := HBoxContainer.new()
	switcher.add_theme_constant_override("separation", 2)
	add_child(switcher)
	var group := ButtonGroup.new()
	for name in styles():
		var b := Button.new()
		b.text = name.capitalize()
		b.toggle_mode = true
		b.button_group = group
		b.button_pressed = name == style
		b.toggled.connect(func(on: bool) -> void: if on: set_style(name))
		switcher.add_child(b)
		style_buttons[name] = b
	switcher.position = Vector2(roundf(width / 2 - switcher.get_combined_minimum_size().x / 2), 66)


func set_style(name: String) -> void:
	style = name
	theme = style_theme(name)
	for b in bars:
		b.style = name


func hit() -> void:
	hp.value -= 22
	hp_orb.value = hp.value
	hearts.value -= 3


func heal() -> void:
	hp.value += 30
	hp_orb.value = hp.value
	hearts.value += 4


func cast() -> void:
	for r in rings:
		if r.value >= r.max_value:
			r.value = 0
			mp.value -= 20
			mp_orb.value = mp.value
			stamina.value -= 30
			xp.value = fmod(xp.value + 7, 100)
			return


func strike() -> void:
	boss.value = boss.value - 9 if boss.value > 9 else 100
	for m in mobs:
		m.value = m.value - 15 if m.value > 15 else 100


func _process(delta: float) -> void:
	for r in rings:
		r.value += delta * 100 / COOLDOWN
	stamina.value += delta * 12
	mp.value += delta * 3
	mp_orb.value = mp.value
	if not auto:
		return
	frame += 1
	var beat := {20: strike, 45: hit, 70: cast, 95: strike, 120: hit, 135: cast, 160: heal, 175: strike}
	if beat.has(frame % 180):
		beat[frame % 180].call()
	if auto_style_frames > 0 and frame % auto_style_frames == 0:
		var names := styles()
		style_buttons[names[(names.find(style) + 1) % names.size()]].button_pressed = true
