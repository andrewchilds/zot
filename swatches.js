// swatches.js — pictures and colors shown in the editor beside the code
// that names them, and the pickers that open when they are clicked.
//
// A `tile: [12, 4]` (and the squares in `frames`, `tileFacing` and a
// tileset's `map`) gets the square of the sheet drawn after it, in the
// color of the thing it belongs to. A `color: "hotpink"` (and `glow`,
// `background`, `questMark`) gets a swatch. Clicking the picture opens the
// whole sheet to pick another square from; clicking the swatch opens the
// browser's color picker. Either one rewrites the code in place.
//
// The sheet is white shapes on transparent, so a tinted square is a CSS
// mask over a background color: the same way zot.js colors them on the map.

import { EditorView, ViewPlugin, WidgetType, Decoration, syntaxTree } from "./lib/codemirror.js";

// The built-in sheet (tiles/tiles.png, Kenney's 1-Bit Pack): 16px squares, no gap
export const SHEET = { image: "tiles/tiles.png", size: 16, columns: 49, rows: 23 };
const DEFAULT_COLOR = "#c9c9d9"; // what zot.js draws an item in when it says no color

// Options whose string value is a color, and whose arrays are squares of the sheet
export const COLOR_KEYS = ["color", "glow", "background", "questMark"];
const TILE_KEYS = ["tile", "frames", "tileFacing"];
const TILE_PARENTS = ["map", "tileFacing", "frames"]; // tables whose values are squares

const text = (state, node) => state.sliceDoc(node.from, node.to);

// The key of a Property node, "tile" in tile: [12, 4]
function keyName(state, prop) {
	const def = prop.getChild("PropertyDefinition");
	return def ? text(state, def).replace(/^(["'])(.*)\1$/, "$2") : null;
}

// The Property an array or string is the value of, looking out through
// lists: the one in frames: [[26, 8], [31, 5]] is a value of frames
function propertyOf(node) {
	let p = node.parent;
	while (p && p.name === "ArrayExpression") p = p.parent;
	return p && p.name === "Property" ? p : null;
}

// The Property whose table a Property sits in: map for wall in tileset: { map: { wall: ... } }
function enclosingProperty(prop) {
	const obj = prop.parent;
	return obj && obj.name === "ObjectExpression" && obj.parent && obj.parent.name === "Property" ? obj.parent : null;
}

// The Number nodes of an array that is a square of the sheet ([column, row],
// or [column, row, weight] in a tileset's map), or null
export function squareOf(state, node) {
	if (node.name !== "ArrayExpression") return null;
	const numbers = [];
	for (let c = node.firstChild; c; c = c.nextSibling) {
		if (c.name === "Number") numbers.push(c);
		else if (c.name !== "[" && c.name !== "]" && c.name !== ",") return null;
	}
	if (numbers.length < 2 || numbers.length > 3) return null;
	const prop = propertyOf(node);
	if (!prop) return null;
	const key = keyName(state, prop);
	if (key == null) return null;
	if (TILE_KEYS.includes(key) || /(Frames|Facing)$/.test(key)) return numbers;
	const outer = enclosingProperty(prop);
	const outerKey = outer && keyName(state, outer);
	if (outerKey != null && (TILE_PARENTS.includes(outerKey) || /Facing$/.test(outerKey))) return numbers;
	return null;
}

// Whether a String node is the value of a color option
export function isColorString(state, node) {
	if (node.name !== "String") return false;
	const prop = node.parent;
	if (!prop || prop.name !== "Property" || node.prevSibling == null) return false; // the key, not the value
	const key = keyName(state, prop);
	return key != null && COLOR_KEYS.includes(key);
}

// What a string says, without its quotes
const unquote = (s) => s.replace(/^(["'`])([^]*)\1$/, "$2");

// The color of the thing a node belongs to: the `color` of the nearest
// table around it that has one, else Zot's default
function colorAround(state, node) {
	for (let obj = node.parent; obj; obj = obj.parent) {
		if (obj.name !== "ObjectExpression") continue;
		for (let c = obj.firstChild; c; c = c.nextSibling) {
			if (c.name !== "Property" || keyName(state, c) !== "color") continue;
			const value = c.lastChild;
			if (value && value.name === "String") return unquote(text(state, value));
		}
	}
	return DEFAULT_COLOR;
}

// "lime" as "#00ff00": what a canvas makes of any CSS color (rgba(...) if it is see-through)
export function toHex(color) {
	const ctx = document.createElement("canvas").getContext("2d");
	ctx.fillStyle = "#000000";
	ctx.fillStyle = color;
	return ctx.fillStyle;
}

// ---- the widgets ----

class TileWidget extends WidgetType {
	constructor(column, row, color) {
		super();
		this.column = column;
		this.row = row;
		this.color = color;
	}
	eq(other) {
		return other.column === this.column && other.row === this.row && other.color === this.color;
	}
	toDOM(view) {
		const el = document.createElement("span");
		el.className = "cm-tile";
		el.title = `Column ${this.column}, row ${this.row} of the sheet. Click to pick another`;
		el.style.maskPosition = el.style.webkitMaskPosition = `${-this.column * SHEET.size}px ${-this.row * SHEET.size}px`;
		el.style.backgroundColor = this.color;
		el.addEventListener("mousedown", (e) => e.preventDefault()); // keep the cursor where it is
		el.addEventListener("click", () => openTilePicker(view, view.posAtDOM(el), this.color));
		return el;
	}
}

class ColorWidget extends WidgetType {
	constructor(color) {
		super();
		this.color = color;
	}
	eq(other) {
		return other.color === this.color;
	}
	toDOM(view) {
		const el = document.createElement("span");
		el.className = "cm-swatch";
		el.title = `${this.color}. Click to pick another`;
		el.style.backgroundColor = this.color;
		el.addEventListener("mousedown", (e) => e.preventDefault());
		el.addEventListener("click", () => openColorPicker(view, view.posAtDOM(el), el));
		return el;
	}
}

// The widgets for what is on screen: a picture after every square and a
// swatch after every color string
function build(view) {
	const { state } = view;
	const widgets = [];
	for (const { from, to } of view.visibleRanges) {
		syntaxTree(state).iterate({
			from,
			to,
			enter(node) {
				const numbers = squareOf(state, node.node);
				if (numbers) {
					const [column, row] = numbers.map((n) => Number(text(state, n)));
					const widget = new TileWidget(column, row, colorAround(state, node.node));
					widgets.push(Decoration.widget({ widget, side: 1 }).range(node.to));
				} else if (isColorString(state, node.node)) {
					const widget = new ColorWidget(unquote(text(state, node.node)));
					widgets.push(Decoration.widget({ widget, side: 1 }).range(node.to));
				}
			}
		});
	}
	return Decoration.set(widgets, true);
}

export const swatches = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.decorations = build(view);
		}
		update(update) {
			if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
				this.decorations = build(update.view);
			}
		}
	},
	{ decorations: (v) => v.decorations }
);

// ---- rewriting the code ----

// The square whose widget sits at `pos` (the end of its array), or null
function squareAt(view, pos) {
	for (let node = syntaxTree(view.state).resolveInner(pos, -1); node; node = node.parent) {
		const numbers = squareOf(view.state, node);
		if (numbers) return { node, numbers };
	}
	return null;
}

// Writes column and row into the array that ends at `pos`, keeping a third
// number (a weight) if there is one. True if there was an array to change.
export function replaceTile(view, pos, column, row) {
	const square = squareAt(view, pos);
	if (!square) return false;
	const [a, b] = square.numbers;
	view.dispatch({ changes: { from: a.from, to: b.to, insert: `${column}, ${row}` }, userEvent: "input.pick" });
	return true;
}

// Writes `color` into the string at `pos` (its end, or anywhere inside),
// keeping its quotes. True if there was a string to change.
export function replaceColor(view, pos, color) {
	const node = syntaxTree(view.state).resolveInner(pos, -1);
	if (!node || node.name !== "String" || !isColorString(view.state, node)) return false;
	view.dispatch({ changes: { from: node.from + 1, to: node.to - 1, insert: color }, userEvent: "input.pick" });
	return true;
}

// ---- the pickers ----

// The whole sheet in a plain light gray (the thing's own color could be too
// dark to see on the panel) with the current square in white, the square
// under the mouse framed, named, and shown bigger in that color. Made once,
// the first time a picture is clicked.
let tilePicker = null;
function tilePickerDialog() {
	if (tilePicker) return tilePicker;
	const dialog = document.createElement("dialog");
	dialog.className = "tile-picker";
	dialog.innerHTML = `
		<h2>Pick a picture</h2>
		<div class="tile-scroll"><div class="tile-sheet"><div class="tile-image"></div><div class="tile-active"></div><div class="tile-current"></div><div class="tile-cursor"></div></div></div>
		<p class="hint tile-hint"><span class="tile-preview"></span><span class="tile-text"></span></p>
		<menu><button type="button" class="cancel">Cancel</button></menu>`;
	document.body.appendChild(dialog);
	const scale = 2;
	const cell = SHEET.size * scale;
	const sheet = dialog.querySelector(".tile-sheet");
	sheet.style.width = `${SHEET.columns * cell}px`;
	sheet.style.height = `${SHEET.rows * cell}px`;
	// The mask sits on layers inside the sheet, so it doesn't clip the frames
	const image = dialog.querySelector(".tile-image");
	const active = dialog.querySelector(".tile-active");
	for (const layer of [image, active]) {
		layer.style.maskImage = layer.style.webkitMaskImage = `url("${SHEET.image}")`;
		layer.style.maskSize = layer.style.webkitMaskSize = `${SHEET.columns * cell}px ${SHEET.rows * cell}px`;
	}
	image.style.width = sheet.style.width;
	image.style.height = sheet.style.height;
	const cursor = dialog.querySelector(".tile-cursor");
	const current = dialog.querySelector(".tile-current");
	const hint = dialog.querySelector(".tile-text");
	const preview = dialog.querySelector(".tile-preview");
	const previewScale = 3;
	preview.style.maskImage = preview.style.webkitMaskImage = `url("${SHEET.image}")`;
	preview.style.maskSize = preview.style.webkitMaskSize = `${SHEET.columns * SHEET.size * previewScale}px ${SHEET.rows * SHEET.size * previewScale}px`;
	preview.style.width = preview.style.height = `${SHEET.size * previewScale}px`;
	const show = (column, row) => {
		preview.style.maskPosition = preview.style.webkitMaskPosition = `${-column * SHEET.size * previewScale}px ${-row * SHEET.size * previewScale}px`;
	};
	for (const box of [cursor, current, active]) box.style.width = box.style.height = `${cell}px`;
	const place = (box, column, row) => {
		box.style.left = `${column * cell}px`;
		box.style.top = `${row * cell}px`;
		box.hidden = false;
	};
	// Back to the current square, as when the sheet opened: no square under
	// the mouse, the current one shown bigger and named
	let now = null;
	const reset = () => {
		cursor.hidden = true;
		show(now.column, now.row);
		hint.textContent = `Now column ${now.column}, row ${now.row}. Point at a square to see it here, click it to use it.`;
	};
	// The current square: framed, and drawn in white over the gray
	const mark = (column, row) => {
		now = { column, row };
		place(current, column, row);
		place(active, column, row);
		active.style.maskPosition = active.style.webkitMaskPosition = `${-column * cell}px ${-row * cell}px`;
		reset();
	};
	const cellAt = (e) => {
		const rect = sheet.getBoundingClientRect();
		const column = Math.floor((e.clientX - rect.left) / cell);
		const row = Math.floor((e.clientY - rect.top) / cell);
		return column >= 0 && row >= 0 && column < SHEET.columns && row < SHEET.rows ? { column, row } : null;
	};
	sheet.addEventListener("mousemove", (e) => {
		const at = cellAt(e);
		if (!at) return;
		place(cursor, at.column, at.row);
		show(at.column, at.row);
		hint.textContent = `Column ${at.column}, row ${at.row}. Click to use it.`;
	});
	sheet.addEventListener("mouseleave", reset);
	sheet.addEventListener("click", (e) => {
		const at = cellAt(e);
		if (at && tilePicker.onPick) tilePicker.onPick(at.column, at.row);
		dialog.close();
	});
	dialog.querySelector(".cancel").addEventListener("click", () => dialog.close());
	tilePicker = { dialog, preview, mark, onPick: null };
	return tilePicker;
}

// Opens the sheet for the square whose picture is at `pos`, tinted with `color`
export function openTilePicker(view, pos, color = DEFAULT_COLOR) {
	const square = squareAt(view, pos);
	if (!square) return false;
	const picker = tilePickerDialog();
	const [column, row] = square.numbers.map((n) => Number(text(view.state, n)));
	picker.preview.style.backgroundColor = color;
	picker.mark(column, row);
	picker.onPick = (c, r) => {
		replaceTile(view, pos, c, r);
		view.focus();
	};
	picker.dialog.showModal();
	// scroll the current square into the middle
	const scroll = picker.dialog.querySelector(".tile-scroll");
	scroll.scrollTop = row * SHEET.size * 2 - scroll.clientHeight / 2 + SHEET.size;
	scroll.scrollLeft = column * SHEET.size * 2 - scroll.clientWidth / 2 + SHEET.size;
	return true;
}

// The browser's own color picker, opened over the swatch. Every change it
// makes is written into the string as it happens, so the map can be watched
// through the frame on the next Run.
let colorInput = null;
export function openColorPicker(view, pos, anchor) {
	const node = syntaxTree(view.state).resolveInner(pos, -1);
	if (!node || node.name !== "String") return false;
	if (!colorInput) {
		colorInput = document.createElement("input");
		colorInput.type = "color";
		colorInput.className = "color-picker";
		colorInput.setAttribute("aria-label", "Pick a color");
		document.body.appendChild(colorInput);
	}
	const hex = toHex(unquote(text(view.state, node)));
	colorInput.value = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
	if (anchor) {
		const rect = anchor.getBoundingClientRect();
		colorInput.style.left = `${rect.left + window.scrollX}px`;
		colorInput.style.top = `${rect.bottom + window.scrollY}px`;
	}
	// The string's start stays put as its inside is rewritten, so that is where it is found again
	const start = node.from;
	colorInput.oninput = () => replaceColor(view, start + 1, colorInput.value);
	colorInput.onchange = () => view.focus();
	if (colorInput.showPicker) colorInput.showPicker();
	else colorInput.click();
	return true;
}
