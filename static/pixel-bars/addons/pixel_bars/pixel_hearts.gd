@tool
class_name PixelHearts
extends Range
## A row of hearts, shields or stars showing `value` of `max_value`, `per_icon` points to an icon:
## at 4 a heart empties by quarters, at 2 by halves (shields and stars by halves at most). When the
## value drops, the icons it emptied blink.
##
##     var hearts := PixelHearts.new()
##     hearts.max_value = 20   # five hearts of four
##     hearts.value = 13       # three full, a quarter, one empty
##     add_child(hearts)

const KIT := "res://addons/pixel_bars/pips/"
## Each icon's pictures from full to empty, by the share of it left full.
const STATES := {
	"heart": [[1.0, "heart"], [0.75, "heart_3q"], [0.5, "heart_half"], [0.25, "heart_1q"], [0.0, "heart_empty"]],
	"shield": [[1.0, "shield"], [0.5, "shield_half"], [0.0, "shield_empty"]],
	"star": [[1.0, "star"], [0.5, "star_half"], [0.0, "star_empty"]],
	"mini_heart": [[1.0, "mini_heart"], [0.5, "mini_heart_half"], [0.0, "mini_heart_empty"]],
}
const BLINK_TIME := 0.5

@export_enum("heart", "shield", "star", "mini_heart") var icon := "heart":
	set(v):
		icon = v
		update_minimum_size()
		queue_redraw()
## Points an icon holds.
@export_range(1, 4) var per_icon := 4:
	set(v):
		per_icon = v
		update_minimum_size()
		queue_redraw()
## Pixels between icons.
@export var gap := 0:
	set(v):
		gap = v
		update_minimum_size()
## Icons to a row before the next (0: one row).
@export var columns := 0:
	set(v):
		columns = v
		update_minimum_size()

var _last := 0.0
var _blink := {}  # icon index: seconds left
var _pictures := {}  # held here: a texture loaded in _draw and dropped is freed before it is drawn


func _init() -> void:
	max_value = 12
	value = 12
	step = 1


func _ready() -> void:
	_last = value


func count() -> int:
	return ceili((max_value - min_value) / per_icon)


## The share of icon `i` left full, rounded down to a picture there is.
func part(i: int) -> float:
	var s := clampf((value - min_value - i * per_icon) / per_icon, 0.0, 1.0)
	for state: Array in STATES[icon]:
		if s >= state[0] - 0.001:
			return state[0]
	return 0.0


func picture(s: float) -> Texture2D:
	for state: Array in STATES[icon]:
		if is_equal_approx(state[0], s):
			if not _pictures.has(state[1]):
				_pictures[state[1]] = load(KIT + state[1] + ".png")
			return _pictures[state[1]]
	return null


func _icon_size() -> Vector2:
	return Vector2(9, 8) if icon == "mini_heart" else Vector2(16, 16)


func _get_minimum_size() -> Vector2:
	var n := count()
	var cols := mini(n, columns) if columns > 0 else n
	var rows := ceili(n / float(maxi(1, cols)))
	var s := _icon_size()
	return Vector2(cols * s.x + maxi(0, cols - 1) * gap, rows * s.y + maxi(0, rows - 1) * gap)


func _value_changed(new_value: float) -> void:
	if new_value < _last and not Engine.is_editor_hint():
		for i in count():
			var before := clampf((_last - min_value - i * per_icon) / per_icon, 0.0, 1.0)
			var after := clampf((new_value - min_value - i * per_icon) / per_icon, 0.0, 1.0)
			if after < before:
				_blink[i] = BLINK_TIME
	_last = new_value
	queue_redraw()


func _process(delta: float) -> void:
	if _blink.is_empty():
		return
	for i in _blink.keys():
		_blink[i] -= delta
		if _blink[i] <= 0.0:
			_blink.erase(i)
	queue_redraw()


func _draw() -> void:
	var s := _icon_size()
	var n := count()
	var cols := mini(n, columns) if columns > 0 else n
	for i in n:
		var at := Vector2(i % cols * (s.x + gap), i / cols * (s.y + gap))
		var on := _blink.has(i) and fmod(_blink[i], 0.16) > 0.08  # lit every other 0.08 s
		draw_texture(picture(part(i)), at, Color(3, 3, 3) if on else Color.WHITE)
