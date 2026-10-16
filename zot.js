/*
 * zot.js — a layer on top of rot.js for building dungeon crawlers.
 *
 * It is an ES module. Your HTML has an empty <div id="game" class="zot"> for
 * the screen, and loads rot.js, then your game, which imports Zot:
 *   <div id="game" class="zot"></div>
 *   <script src="lib/rot.min.js"></script>
 *   <script type="module" src="my-game.js"></script>
 * and my-game.js begins with:
 *   import * as Zot from "./zot.js";
 * Zot fills the empty div with the standard screen (SCREEN, below). Put your
 * own markup in the div instead to change the screen.
 *
 * What's in this file, top to bottom:
 *   helpers and defaults   random(), chance(), the standard settings
 *   Sound                  little 8-bit bleeps made with the Web Audio API
 *   Item                   one potion, sword, ... on the floor or carried
 *   Creature               the hero, every enemy and every NPC: stats, moving, fighting
 *   Scene                  one place in the world: the map, who's on it, whose turn it is, locked rooms
 *   Game                   the whole thing: definitions, turns, talking, shops, drawing, keys
 *
 * A turn goes: key press -> the hero acts -> every monster acts -> redraw.
 */
import * as Zot from "./zot.js";

if (typeof ROT === "undefined") {
	throw new Error(
		'Zot needs rot.js. Put <script src="lib/rot.min.js"></script> in your HTML, above the script that imports zot.js.',
	);
}

// ------------------------------------------------------------------
//  Little helpers (also available as Zot.random, Zot.chance, ...)
// ------------------------------------------------------------------

// random(6) -> 1..6      random(2, 5) -> 2..5
function random(low, high) {
	if (high === undefined) {
		high = low;
		low = 1;
	}
	return ROT.RNG.getUniformInt(low, high);
}
// chance(25) -> true one time in four
function chance(percent) {
	return ROT.RNG.getUniform() * 100 < percent;
}
// pick(["a", "b", "c"]) -> one of them
function pick(list) {
	return ROT.RNG.getItem(list);
}
function shuffle(list) {
	return ROT.RNG.shuffle(list);
}
// A random order that leaves the dungeon's dice alone, for things that are
// only for show: the same code must still make the same dungeon.
function jumble(list) {
	const out = list.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
// how many steps apart two things are
function distance(a, b) {
	return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function pretty(name) {
	const s = String(name).replace(/[_-]+/g, " ");
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function cap(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
function cellKey(x, y) {
	return x + "," + y;
}
// "arrow" -> "arrows", "torch" -> "torches"
function plural(word) {
	return /(s|x|z|ch|sh)$/i.test(word) ? word + "es" : word + "s";
}
// some(1, "Arrow") -> "the Arrow"      some(5, "Arrow") -> "5 Arrows"
function some(count, name) {
	return count > 1 ? `${count} ${plural(name)}` : `the ${name}`;
}
// aFew(1, "Torch") -> "a Torch"      aFew(1, "Anvil") -> "an Anvil"      aFew(2, "Rag") -> "2 Rags"
function aFew(count, name) {
	return count > 1 ? `${count} ${plural(name)}` : `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
}
// directionName(1, 0) -> "east"      directionName(-1, -1) -> "northwest"
function directionName(dx, dy) {
	return (dy < 0 ? "north" : dy > 0 ? "south" : "") + (dx < 0 ? "west" : dx > 0 ? "east" : "");
}
// Lets a setting be either a plain value or a function (of the scene's level, say).
function valueOf(v, ...args) {
	return typeof v === "function" ? v(...args) : v;
}
// Items by name with how many of each: a list (a name twice for two of them),
// a table of counts, one name, or nothing. countsOf(["rag", "rag", "stick"]) is { rag: 2, stick: 1 }.
function countsOf(v) {
	const out = {};
	if (v == null) return out;
	if (Array.isArray(v) || typeof v === "string") for (const name of asList(v)) out[name] = (out[name] || 0) + 1;
	else for (const name in v) if (v[name] > 0) out[name] = v[name];
	return out;
}
function asList(v) {
	return v == null ? [] : Array.isArray(v) ? v : [v];
}
// A table like { rat: 5 }: an object, and not a list
function isTable(v) {
	return v != null && typeof v === "object" && !Array.isArray(v);
}
// Two steps, [dx, dy], the same way (neither can be null for true).
function sameStep(a, b) {
	return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}
// A scene's key as it's stored: a whole number for the numbered scenes
// (so "4" from the address is 4), otherwise the name it was defined with.
function sceneKey(v) {
	return /^\d+$/.test(String(v)) ? Number(v) : String(v);
}
// A scene in an error message: "scene 3" or "the mine scene".
function sceneLabel(key) {
	return typeof key === "number" ? `scene ${key}` : `the ${key} scene`;
}
// A dungeon's code, like "k7x2": four letters or digits, easy to read out.
const CODE_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomCode() {
	let s = "";
	for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	return s;
}
// The number the random generator is seeded with for a code. "42" gives 42, so
// seed: 42 and ?seed=42 are the same dungeon; anything else is hashed.
function seedNumber(code) {
	if (/^\d+$/.test(code)) return Number(code);
	let h = 2166136261;
	for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619);
	return h >>> 0;
}
// ?seed=k7x2&scene=mine&god in the page address: for sharing a dungeon and for testing.
function urlParams() {
	const out = {};
	try {
		new URLSearchParams(location.search).forEach((v, k) => (out[k] = v));
	} catch (e) {
		/* no address to read (not in a browser page) */
	}
	return out;
}

let currentGame = null; // the most recent Zot.Game, see Zot.game

const CONSOLE_HINT = "Open the browser console to see which line: press F12, or Cmd+Option+J on a Mac.";
const DARK_TEXT = "It's dark. You can only see a few steps around you.";

// The red box at the top of the page, plus a line in the game's log if there is one.
function showProblem(text, hint) {
	if (document.body) {
		let box = document.getElementById("zot-error");
		if (!box) {
			box = document.createElement("div");
			box.id = "zot-error";
			box.className = "zot-error";
			box.innerHTML = '<button type="button" title="Close">\u00d7</button><b></b><p></p>';
			box.querySelector("button").addEventListener("click", () => box.remove());
			document.body.appendChild(box);
		}
		box.querySelector("b").textContent = text;
		box.querySelector("p").textContent = hint;
	}
	if (currentGame && currentGame.el) currentGame.say(text, "error");
}

// A hook of yours threw. `where` says whose code it was ("the goblin's onHurt").
function report(err, where) {
	const message = err && err.message ? err.message : String(err);
	console.error(`Zot: something's wrong in ${where}:`, err);
	showProblem(`Something's wrong in ${where}: ${message}`, CONSOLE_HINT);
	tellShell(`Something's wrong in ${where}: ${message}`, err);
}

window.addEventListener("error", (e) => {
	// Inside the editor's frame (the bootstrap in editor.js sets ZOT_SHELL) Run is the way to try again
	const next = window.ZOT_SHELL ? " Fix it, then press Run." : " Fix it, save, then reload the page.";
	showProblem("Something's wrong in your code, so the game stopped.", CONSOLE_HINT + next);
	tellShell(e.message, e.error, e);
});

// Inside the editor's frame, the shell gets every mistake too: the text,
// the stack of the error, and where the browser says it happened. It works
// out which line of the editor that is and marks it. See editor.js.
function tellShell(text, err, event) {
	toShell({
		type: "zot:error",
		text: String(text),
		stack: err && err.stack ? String(err.stack) : "",
		file: event && event.filename ? String(event.filename) : "",
		line: event && event.lineno ? event.lineno : 0,
		column: event && event.colno ? event.colno : 0,
	});
}
// A message for the editor around the frame, if there is one: a mistake, the
// seed of a new game (`fixed` when the game's options chose it), which the
// shell shows in its seed box, or the sound state, for its speaker button.
function toShell(msg) {
	if (!window.ZOT_SHELL || window.parent === window) return;
	parent.postMessage(msg, "*");
}

const dimCache = new Map();
function dimColor(color, amount) {
	const k = color + amount;
	if (!dimCache.has(k)) {
		const rgb = ROT.Color.fromString(color).map((c) => Math.min(255, Math.round(c * amount)));
		dimCache.set(k, ROT.Color.toHex(rgb));
	}
	return dimCache.get(k);
}

// A little of `color` mixed into `base`: t = 0 is all base, 1 is all color.
const mixCache = new Map();
function mixColor(base, color, t) {
	const k = base + color + t;
	if (!mixCache.has(k)) {
		const a = ROT.Color.fromString(base),
			b = ROT.Color.fromString(color);
		mixCache.set(k, ROT.Color.toHex(a.map((c, i) => Math.round(c + (b[i] - c) * t))));
	}
	return mixCache.get(k);
}

// A fixed number from 0 to 1 for a map square: the same square always
// gets the same number, so the grain of the map doesn't crawl as you move.
function grain(x, y, salt) {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

// The game's `maze` settings filled in with the defaults (maze: false turns the random mazes off).
function mazeSettings(config) {
	const m = config.maze;
	return Object.assign({}, DEFAULTS.maze, m === false ? { chance: 0 } : m || {});
}

const SIDES = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
]; // the four squares next door, no diagonals
const AROUND = [
	[-1, -1],
	[0, -1],
	[1, -1],
	[-1, 0],
	[1, 0],
	[-1, 1],
	[0, 1],
	[1, 1],
];

// Nudges a tile color: a small hue shift and a little brighter or darker,
// with `hue` and `bright` each from -1 to 1. Steps are coarse so the cache stays small.
const STEPS = 7;
const varyCache = new Map();
function varyColor(color, hue, bright, amount) {
	const hs = Math.round(hue * STEPS),
		bs = Math.round(bright * STEPS);
	const k = color + hs + "," + bs + "," + amount;
	if (!varyCache.has(k)) {
		const hsl = ROT.Color.rgb2hsl(ROT.Color.fromString(color));
		hsl[0] = (hsl[0] + ((hs / STEPS) * 0.025 * amount + 1)) % 1; // +-9 degrees at amount 1
		const m = 1 + (bs / STEPS) * 0.15 * amount; // +-15% at amount 1
		varyCache.set(k, ROT.Color.toHex(ROT.Color.hsl2rgb(hsl).map((c) => Math.max(0, Math.min(255, Math.round(c * m))))));
	}
	return varyCache.get(k);
}

const RARITY = { common: 10, uncommon: 4, rare: 2, legendary: 1 };
const STATS = ["attack", "defense", "strength", "maxHp", "maxMp", "speed", "sight"];
// The stats an item def adds while worn: [{ stat: "attack", value: 3 }, ...]
function bonusesOf(def) {
	return STATS.filter((stat) => typeof def[stat] === "number" && def[stat] !== 0).map((stat) => ({
		stat,
		value: def[stat],
	}));
}
// A weight as text: "3", or "2.5" for a pile of light things. Sums of
// fractions (five arrows of 0.2) are rounded so 1.0000000000000002 is "1".
function weightText(w) {
	return String(Math.round(w * 10) / 10);
}
const PALETTE = {
	red: "#ff5e5e",
	orange: "#ffa04d",
	yellow: "#ffd23d",
	green: "#8be04d",
	teal: "#4dd4c8",
	blue: "#5ea0ff",
	purple: "#b784ff",
	pink: "#ff7ad6",
};

const TILES = {
	wall: { symbol: "#", color: "#6b6b80", walkable: false, seeThrough: false },
	floor: { symbol: ".", color: "#37373e", walkable: true, seeThrough: true, ground: true },
	// Outdoors (map: "overworld"). `ground: true` means creatures and items can be placed there.
	grass: { symbol: ".", color: "#27401d", walkable: true, seeThrough: true, ground: true },
	tree: { symbol: "\u2663", color: "#2f6b2a", walkable: false, seeThrough: false },
	water: { symbol: "~", color: "#3a6fb0", walkable: false, seeThrough: true },
	// A door is shut: nobody can see or walk through it until the hero
	// walks into it, which opens it for good (`opens: true` says the hero
	// can get through by bumping, which is how reachability is worked out).
	// Enemies can't open doors, so a room stays safe until the hero does.
	door: {
		symbol: "+",
		color: "#b07a34",
		walkable: false,
		seeThrough: false,
		door: true,
		opens: true,
		onBump: openDoor,
	},
	openDoor: { symbol: "'", color: "#b07a34", walkable: true, seeThrough: true, door: true },
	// Bumping into a locked door with the right key unlocks and opens it.
	lockedDoor: {
		symbol: "#",
		color: "#ffd23d",
		walkable: false,
		seeThrough: false,
		door: true,
		key: "key",
		onBump: unlockDoor,
	},
	// A secret door: looks exactly like a wall and blocks sight like one,
	// until the hero walks into it; then it's an open door like any other.
	// Put one on a drawn map through the scene's legend.
	secretDoor: {
		symbol: "#",
		color: "#6b6b80",
		walkable: false,
		seeThrough: false,
		door: true,
		opens: true,
		onBump: openSecretDoor,
	},
	// A treasure chest. Walk into it to open it and take what's inside;
	// after that it's an openChest, and stays one.
	chest: { symbol: "=", color: "#e0a640", walkable: false, seeThrough: true, onBump: openChest },
	openChest: { symbol: "=", color: "#8c6a3a", walkable: false, seeThrough: true, onBump: bumpOpenChest },
	stairsDown: { symbol: ">", color: "#ffffff", walkable: true, seeThrough: true },
	stairsUp: { symbol: "<", color: "#ffffff", walkable: true, seeThrough: true },
	// The square of an exit that isn't stairs (see `exits` on a scene), unless it says which tile to use.
	portal: { symbol: "O", color: "#b784ff", walkable: true, seeThrough: true, fx: "swirl" },
};

// A tile you make yourself starts out like a floor. exactColor: true leaves
// the per-square grain (`variation`) off the tile, so one thing drawn over
// two squares (a bed) is the same color on both; fog and torchlight still apply.
const TILE_DEFAULTS = { symbol: "?", color: "#c9c9d9", walkable: true, seeThrough: true };

// The letters of a map drawn by hand (game.scene("mine", { map: ["#...#", ...] })).
// A scene's `legend` adds to these or changes them. `@` is where the
// hero arrives, see Scene.readDrawing.
const DRAWN = {
	"#": "wall",
	".": "floor",
	" ": "wall", // so short rows and ragged edges are fine
	"+": "door",
	"<": "stairsUp",
	">": "stairsDown",
	"=": "chest",
	"~": "water",
	T: "tree",
	",": "grass",
};
// The rows of a drawn map, if `map` is one: a list of strings, or one
// string with line breaks (blank lines at the ends and the indent are
// dropped, so a template literal in a game's script can be indented).
function drawingLines(map) {
	let lines;
	if (Array.isArray(map)) lines = map.map(String);
	else if (typeof map === "string" && map.includes("\n")) lines = map.split("\n");
	else return null;
	lines = lines.map((l) => l.replace(/\r$/, "").replace(/\s+$/, ""));
	while (lines.length && !lines[0].trim()) lines.shift();
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	// The indent every row shares (spaces or tabs) isn't part of the map.
	let indent = null;
	for (const l of lines) {
		const lead = l.match(/^\s*/)[0];
		if (indent === null) indent = lead;
		else while (!lead.startsWith(indent)) indent = indent.slice(0, -1);
	}
	return lines.map((l) => l.slice((indent || "").length));
}

// Pictures instead of letters: tileset: true in the game's settings turns
// them on. The sheet is tiles/tiles.png (Kenney's 1-Bit Pack, CC0): white
// shapes that get colored as they're drawn, with the `color` of whatever
// they stand for, so one sword shape makes a silver sword and a red one.
// tiles/guide.png shows every square with its column,row. `map` says which
// square is which thing: the built-in tiles, a few common item names, and
// what to draw for a hero, enemy, npc or item that doesn't have a `tile` of
// its own. A list of squares means "pick one per map square" (fixed, so it
// doesn't crawl as you move); a third number on a square in the list is how
// likely it is next to the others ([10, 17, 2] comes up twice as often as a
// plain [7, 15], [0, 15, 0.1] hardly ever); a name ending in Frames lists squares to
// cycle through over time, for water that ripples or a bat that flaps; a
// name ending in Facing gives a square per direction, for an arrow in flight;
// a name ending in Outdoors is what a tile looks like on an overworld.
const TILESET = {
	image: new URL("tiles/tiles.png", import.meta.url).href, // beside zot.js, whichever page loads it
	size: 16, // pixels per square in the sheet
	gap: 0, // pixels between squares in the sheet
	scale: 2, // how much bigger to draw them
	map: {
		wall: [
			[10, 17, 2],
			[7, 15],
			[6, 13, 0.1],
		],
		floor: [
			// cracked and grimy flagstones (drawn by tiles/build.py), with the pack's rubble among them
			[13, 22, 3],
			[14, 22, 3],
			[15, 22, 3],
			[1, 0, 0.3],
			[2, 0, 0.3],
			[0, 15, 0.02],
		],
		grass: [
			[7, 0],
			[6, 0],
			[5, 0, 10],
			[1, 0, 2],
			[7, 0],
			[0, 2],
		],
		tree: [
			[4, 1],
			[0, 1],
			[3, 1],
			[2, 1],
		],
		water: [0, 22],
		waterFrames: [
			[0, 22],
			[1, 22],
			[2, 22],
			[3, 22],
		],
		door: [3, 9],
		openDoor: [2, 9],
		lockedDoor: [0, 9],
		secretDoor: [
			// the same squares as a wall, so one in a wall is indistinguishable from the rest
			[10, 17, 2],
			[7, 15],
			[6, 13, 0.1],
		],
		chest: [8, 6],
		openChest: [9, 6],
		stairsDown: [3, 6],
		stairsDownOutdoors: [17, 11], // on an overworld: the mouth of an old mine shaft
		stairsUp: [2, 6],
		portal: [29, 12],
		portalFrames: [
			[29, 12],
			[30, 12],
			[36, 11],
			[37, 11],
			[31, 12],
		],
		// items by name, for games that don't say
		key: [32, 11],
		gold: [41, 3],
		potion: [32, 13],
		scroll: [33, 15],
		sword: [32, 8],
		bow: [37, 6],
		crossbow: [37, 5],
		arrow: [41, 5],
		// the arrow in flight, one square per direction (drawn by tiles/build.py)
		arrowFacing: {
			north: [4, 22],
			northeast: [5, 22],
			east: [6, 22],
			southeast: [7, 22],
			south: [8, 22],
			southwest: [9, 22],
			west: [10, 22],
			northwest: [11, 22],
		},
		torch: [28, 11],
		// and by kind
		player: [26, 0],
		dead: [0, 15], // the hero after the end: a skull
		enemy: [27, 6],
		npc: [25, 0],
		item: [45, 4],
		unknown: [37, 13],
		// The hit flash: what a square shows for a moment when whoever
		// stands on it is attacked, one frame after another (see `flash`).
		// Three of row 11's slashes, biggest first: a cross, three cuts, one.
		hit: [
			[30, 11],
			[26, 11],
			[24, 11],
		],
	},
};

// The built-in doors. Walking into a shut one opens it, and it stays open.
function openDoor(player, x, y, game) {
	game.currentScene.setTile(x, y, "openDoor");
}
function openSecretDoor(player, x, y, game) {
	game.currentScene.setTile(x, y, "openDoor");
	game.say("You push on the wall and a hidden door swings open.", "item");
}
// The locked one. Which key it wants: the square's own (flags.key, from
// the legend or the scene's vault), or the `key` on the lockedDoor tile.
function unlockDoor(player, x, y, game, here) {
	const scene = here.scene;
	const key = here.flags.key || game.tiles.lockedDoor.key || "key";
	const keyDef = game.defs.item[key];
	const keyName = keyDef ? keyDef.name : pretty(key);
	if (!player.has(key)) {
		game.say(`The door is locked. You need the ${keyName}.`, "warn");
		return false;
	}
	player.removeItem(key, 1);
	delete here.flags.key;
	scene.setTile(x, y, "openDoor");
	game.say(`You unlock the door with the ${keyName}.`, "item");
}

// The built-in chest. What's inside is the list the scene recorded for
// this cell (see Scene.addChest). The hero takes everything; whatever is
// too heavy to carry falls out onto the floor beside the chest.
function openChest(player, x, y, game) {
	const scene = game.currentScene;
	const k = cellKey(x, y);
	const names = scene.chests[k] || [];
	delete scene.chests[k];
	scene.setTile(x, y, "openChest");
	game.play("chest");
	if (!names.length) {
		game.say("You open the chest. It's empty.", "item");
		return;
	}
	game.say("You open the chest.", "item");
	for (const name of names) {
		const item = new Item(game, game.lookup("item", name));
		if (!player.pickUp(item)) {
			scene.placeItem(item, x, y);
			game.say(`${cap(some(item.count, item.name))} tumble${item.count > 1 ? "" : "s"} out onto the floor.`, "item");
		}
	}
}
function bumpOpenChest(player, x, y, game) {
	game.say("The chest is open and empty.");
	return false;
}

const MOVES = {
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	w: [0, -1],
	s: [0, 1],
	a: [-1, 0],
	d: [1, 0],
};
const DIAGONAL_MOVES = { q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1] };
const NUMPAD_MOVES = {
	Numpad8: [0, -1],
	Numpad2: [0, 1],
	Numpad4: [-1, 0],
	Numpad6: [1, 0],
	Numpad7: [-1, -1],
	Numpad9: [1, -1],
	Numpad1: [-1, 1],
	Numpad3: [1, 1],
};

const DEFAULTS = {
	title: "",
	mount: "#game",
	width: 48, // map size in squares; a scene can set its own
	height: 32,
	viewWidth: null, // how much of the map is shown at once (default: all of it).
	viewHeight: null, // A smaller view scrolls to keep the hero in the middle.
	fontSize: 18,
	fit: true, // show as many squares as fill the room the page leaves for the map, and again when the window changes (false = viewWidth x viewHeight)
	font: "monospace",
	background: "#0e0e16",
	scenes: null, // how many numbered scenes there are, one below the next: as many as you define, or 5 if you define none
	start: null, // the scene the hero begins in: scene 1, or else the first one you define
	map: "dungeon", // "dungeon" | "rooms" | "cave" | "maze"
	// Every so often a numbered scene between the first and the last is a maze
	// instead (see digMaze): `chance` percent of them, the same ones for the same
	// seed. `width` and `height` size those mazes (null = the game's), and `rooms`
	// is how many side rooms a maze has besides the one you start in and the one
	// you end in: a number, or [least, most]. false = no random mazes. A scene
	// with map: "maze" goes by its own width, height and rooms first.
	maze: { chance: 25, width: null, height: null, rooms: [1, 2] },
	diagonals: false,
	fog: true, // squares the hero doesn't see are drawn dimmed once seen, and not at all before (false = the whole map in plain view). A scene can set its own.
	variation: 1, // faint per-square hue and brightness grain on the map (0 = flat). A scene can set its own.
	lighting: 1, // torchlight: bright next to the hero, darker toward the edge of sight (0 = even light). A scene can set its own.
	dark: 3, // how far the hero sees with no light lit in a scene without daylight (0 = never dark); only a game with a "light" item is ever dark. A scene can set its own.
	fill: 1, // a faint solid fill behind each square, tinted like the tile (0 = none, 2 = stronger)
	tileset: true, // true draws pictures instead of letters, colored like the letters would be (see TILESET above); or { image, size, gap, scale, map } for your own sheet
	animate: 800, // with pictures: milliseconds per frame for anything with `frames` (0 = hold still)
	flicker: 200, // milliseconds between flickers of a tile's `glow` (a campfire), and its frames (0 = steady)
	flash: 50, // with pictures: milliseconds per frame of the hit flash on a square that's just been attacked (0 = none)
	questMark: true, // with pictures: a "!" (the quest fx) hovers over an npc with a quest to hand out (false = none, or a color to paint it in)
	alert: 900, // with pictures: milliseconds a "!" (the alert fx) hovers over an enemy that has just spotted the hero (0 = none)
	keyRepeat: [200, 120], // holding a direction key: milliseconds before the hero walks on, then between steps
	transition: 800, // milliseconds a change of scene takes: the old map dissolves, then the new one fills in (0 = at once)
	afterDeath: 600, // after the hero dies and the end screen is put away, milliseconds per turn as the monsters go on (0 = time stops)
	exitStairs: true, // the stairs down in the last numbered scene = you win
	winText: "You made it through the whole dungeon!",
	enemiesPerScene: (level) => 8 + level * 3, // functions of the scene's level (its number, unless it says otherwise)
	itemsPerScene: (level) => 4 + level,
	chestsPerScene: (level) => 1 + Math.floor(level / 2), // each holds 1 to 3 of the scene's items, so fewer lie about
	mpRegen: 5, // 1 MP every 5 turns (0 = never)
	carry: (strength) => strength, // how much weight the hero can carry, worn things included
	gearModifierChance: 15, // percent of the gear found lying about or in chests that has a gear modifier on it (see game.gearModifier)
	levelUp: { xp: (level) => level * 15, hp: 3, attack: 1, defense: 0, strength: 1, mp: 2 },
	// A hit always does at least 1 damage; armor takes the edge off. `melee`
	// is true for a hit with a weapon or bare hands, false for an arrow:
	// strength only counts up close (see strengthBonus on the creature).
	damage: (attacker, defender, melee) => {
		const atk = attacker.attack + (melee ? attacker.strengthBonus : 0);
		const roll = random(Math.ceil(atk / 2), Math.max(1, atk));
		return Math.max(1, roll - defender.defense);
	},
	help: null, // the key list is #zot-help on the screen; a string here replaces it, false removes it
	// The number on the end screen. Change it however you like.
	score: (game, won) => game.visited.size * 100 + game.kills * 10 + game.player.gold + (won ? 500 : 0),
	godMode: false, // the hero can't be hurt, for testing
	lowHp: 0.25, // at or below this share of max HP the HP bar pulses red (0 = never)
	sounds: true, // false = silent; or { hit: false, walk: "step.wav", ... } to change some
	volume: 0.5, // 0 to 1
};

// The options each kind of thing accepts: the keys of its { }. A key that
// isn't here stops the game at once (see checkOptions), because a misspelt
// one, colour: "lime" on an enemy, would otherwise do nothing and say
// nothing. The Game list is the settings above plus the ones with no default.
// zot-completions.js describes each option, and test/completions.test.js
// keeps the two lists the same.
const LOOK = ["symbol", "tile", "frames", "color"];
const WHERE = ["level", "scenes", "rarity"];
const CREATURE_HOOKS = ["onHurt", "onAttack", "onKill", "onDie", "onTurn"];
const OPTIONS = {
	Game: [
		...Object.keys(DEFAULTS),
		"welcome",
		"seed",
		"tiles",
		"autoStairs",
		"onStart",
		"onScene",
		"onTurn",
		"onKey",
		"onDraw",
		"onWin",
		"onLose",
		"onKill",
		"onLevelUp",
	],
	hero: [
		"name",
		...LOOK,
		"verb",
		"hp",
		"mp",
		"attack",
		"defense",
		"strength",
		"sight",
		"speed",
		"gold",
		"items",
		"skills",
		...CREATURE_HOOKS,
		"onLevelUp",
	],
	enemy: [
		"name",
		...LOOK,
		"hp",
		"attack",
		"defense",
		"xp",
		"speed",
		"sight",
		"ai",
		"verb",
		"unique",
		...WHERE,
		"drops",
		"beside",
		"shoots",
		"range",
		...CREATURE_HOOKS,
		"onSpawn",
		"act",
	],
	npc: [
		"name",
		...LOOK,
		"says",
		"stock",
		"prices",
		"buys",
		"comment",
		"quest",
		"beside",
		"ai",
		"sight",
		"speed",
		"onTalk",
		"onSpawn",
		"onTurn",
		"act",
	],
	item: [
		"name",
		...LOOK,
		"slot",
		...STATS,
		"weight",
		"count",
		"price",
		...WHERE,
		"unique",
		"keep",
		"consumable",
		"sound",
		"pickupSound",
		"light",
		"lasts",
		"shoots",
		"range",
		"throw",
		"tileFacing",
		"onUse",
		"onPickup",
		"onEquip",
		"onUnequip",
		"onWearOut",
		"onHit",
	],
	gearModifier: ["name", "slot", ...WHERE, ...STATS, "light", "weight", "price", "color", "weapon", "armor", "ring"],
	recipe: ["name", "combine", "makes", "count", "say", "sound", "onMake"],
	skill: ["name", "mp", "cooldown", "target", "range", "learnAt", "key", "onUse"],
	effect: ["name", "turns", ...STATS, "light", "color", "glow", "fx", "onStart", "onTurn", "onEnd"],
	quest: ["name", "text", "kill", "bring", "reach", "reward", "ask", "wait", "thanks", "report", "onStart", "onDone"],
	scene: [
		"name",
		"level",
		"map",
		"width",
		"height",
		"exits",
		"legend",
		"ground",
		"chests",
		"enemies",
		"items",
		"npcs",
		"boss",
		"treasure",
		"vault",
		"rooms",
		"sight",
		"daylight",
		"fog",
		"dark",
		"variation",
		"lighting",
		"water",
		"onEnter",
	],
	tile: [
		...LOOK,
		"walkable",
		"seeThrough",
		"ground",
		"light",
		"glow",
		"fx",
		"exactColor",
		"door",
		"opens",
		"key",
		"onBump",
		"onStep",
	],
};

// How many single-letter changes turn `a` into `b`.
function editDistance(a, b) {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const cur = [i];
		for (let j = 1; j <= b.length; j++)
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		prev = cur;
	}
	return prev[b.length];
}

// The name in `names` that `key` looks like a misspelling of, or null: the
// same letters in another case (maxhp), or a few letters out (colour, attak).
function nearest(key, names) {
	const allowed = Math.min(3, Math.max(1, Math.round(key.length / 3)));
	let best = null;
	let bestDistance = allowed + 1;
	for (const name of names) {
		const d = name.toLowerCase() === key.toLowerCase() ? 0 : editDistance(key, name);
		if (d < bestDistance) {
			best = name;
			bestDistance = d;
		}
	}
	return best;
}

// Every key of `def` must be an option of `kind` (see OPTIONS), or the game
// stops here and says which one isn't, and what it was probably meant to be.
// A gear modifier can change any of an item's options, so it takes those too.
function checkOptions(kind, what, def) {
	if (!def || typeof def !== "object") return;
	const names = kind === "gearModifier" ? [...OPTIONS.gearModifier, ...OPTIONS.item] : OPTIONS[kind];
	for (const key of Object.keys(def)) {
		if (names.includes(key)) continue;
		const guess = nearest(key, names);
		const list = kind === "Game" ? "The game settings" : `game.${kind}`;
		throw new Error(
			`Zot: ${what} has no option called "${key}". ` +
				(guess
					? `Did you mean ${guess}?`
					: `${list} in README.md lists its options, and the editor does as you type inside the { }.`),
		);
	}
}

// The built-in sound effects. Each one is a recipe (or a list of recipes
// played one after another):
//   wave     "square" | "triangle" | "sawtooth" | "sine" | "noise"
//   freq     pitch in Hz (for noise: 440 is normal, lower is duller)
//   to       slide the pitch to this by the end
//   length   seconds
//   volume   0 to 1
//   at       start this many seconds after the sound begins (default:
//            right after the previous recipe in the list)
//   vibrato  wobble the pitch by this much, in cents: 100 is one semitone, 20 is subtle
//            (vibratoRate: wobbles per second, default 6)
//   detune   add a second, quieter voice this many Hz sharp (2 or 3 sounds like a synth)
//   echo     repeat the note this many times, each one fading (echoDelay: seconds between
//            repeats, default 0.15)
const SOUNDS = {
	walk: { wave: "noise", freq: 200, length: 0.03, volume: 0.12 },
	hit: [
		{ wave: "square", freq: 220, to: 40, length: 0.1, volume: 0.4 },
		{ at: 0, wave: "noise", freq: 300, length: 0.07, volume: 0.25 },
	],
	kill: [
		{ wave: "noise", freq: 600, to: 60, length: 0.35, volume: 0.45 },
		{ at: 0, wave: "sawtooth", freq: 300, to: 30, length: 0.3, volume: 0.3 },
	],
	pickup: [
		{ wave: "square", freq: 988, length: 0.06, volume: 0.25 },
		{ wave: "square", freq: 1319, length: 0.14, volume: 0.25 },
	],
	// An arrow leaving the bow: a twang, then a quick whoosh of air.
	shoot: [
		{ wave: "square", freq: 1200, to: 300, length: 0.04, volume: 0.2 },
		{ wave: "noise", freq: 900, to: 300, length: 0.18, volume: 0.22 },
	],
	// A chest lid: a slow wobbly creak, then the clunk of it hitting the back.
	chest: [
		{ wave: "sawtooth", freq: 70, to: 130, length: 0.22, volume: 0.18, vibrato: 60, vibratoRate: 16 },
		{ wave: "noise", freq: 250, length: 0.05, volume: 0.25 },
	],
	// Five footsteps on the stairs, 0.2 s apart: each one is mostly a scuff of
	// noise with a faint low knock under it, and the five step down (or up) in pitch.
	stairsDown: [
		{ at: 0, wave: "noise", freq: 340, to: 200, length: 0.07, volume: 0.32 },
		{ at: 0, wave: "square", freq: 170, to: 110, length: 0.05, volume: 0.12 },
		{ at: 0.2, wave: "noise", freq: 300, to: 175, length: 0.07, volume: 0.32 },
		{ at: 0.2, wave: "square", freq: 150, to: 95, length: 0.05, volume: 0.12 },
		{ at: 0.4, wave: "noise", freq: 265, to: 155, length: 0.07, volume: 0.32 },
		{ at: 0.4, wave: "square", freq: 132, to: 84, length: 0.05, volume: 0.12 },
		{ at: 0.6, wave: "noise", freq: 235, to: 135, length: 0.07, volume: 0.32 },
		{ at: 0.6, wave: "square", freq: 117, to: 74, length: 0.05, volume: 0.12 },
		{ at: 0.8, wave: "noise", freq: 208, to: 120, length: 0.09, volume: 0.32 },
		{ at: 0.8, wave: "square", freq: 104, to: 65, length: 0.06, volume: 0.12 },
	],
	stairsUp: [
		{ at: 0, wave: "noise", freq: 208, to: 120, length: 0.07, volume: 0.32 },
		{ at: 0, wave: "square", freq: 104, to: 65, length: 0.05, volume: 0.12 },
		{ at: 0.2, wave: "noise", freq: 235, to: 135, length: 0.07, volume: 0.32 },
		{ at: 0.2, wave: "square", freq: 117, to: 74, length: 0.05, volume: 0.12 },
		{ at: 0.4, wave: "noise", freq: 265, to: 155, length: 0.07, volume: 0.32 },
		{ at: 0.4, wave: "square", freq: 132, to: 84, length: 0.05, volume: 0.12 },
		{ at: 0.6, wave: "noise", freq: 300, to: 175, length: 0.07, volume: 0.32 },
		{ at: 0.6, wave: "square", freq: 150, to: 95, length: 0.05, volume: 0.12 },
		{ at: 0.8, wave: "noise", freq: 340, to: 200, length: 0.09, volume: 0.32 },
		{ at: 0.8, wave: "square", freq: 170, to: 110, length: 0.06, volume: 0.12 },
	],
	magic: {
		wave: "triangle",
		freq: 200,
		to: 1800,
		length: 0.35,
		volume: 0.4,
		detune: 4,
		vibrato: 180, // a semitone and a half each way: a big, sparkly warble
		vibratoRate: 10,
		echo: 4, // four fading repeats that overlap the sweep and trail off after it
		echoDelay: 0.14,
	}, // a rising, shimmering swoosh
	// A quest taken on or handed in: three quick notes up the chord, then a held one.
	quest: [
		{ wave: "square", freq: 523, length: 0.08, volume: 0.22 },
		{ wave: "square", freq: 659, length: 0.08, volume: 0.22 },
		{ wave: "square", freq: 784, length: 0.08, volume: 0.22 },
		{ wave: "square", freq: 1047, length: 0.3, volume: 0.22, vibrato: 15, vibratoRate: 6 },
	],
	// A low synth fanfare in C minor: C Eb G C, the last note held with vibrato.
	// Each note is a detuned sawtooth lead with a triangle bass two octaves down.
	// The bass has `at` so it plays together with its note instead of after it.
	levelup: [
		{ wave: "sawtooth", freq: 131, length: 0.12, volume: 0.22, detune: 2 },
		{ at: 0, wave: "triangle", freq: 65, length: 0.12, volume: 0.25 },
		{ wave: "sawtooth", freq: 156, length: 0.12, volume: 0.22, detune: 2 },
		{ at: 0.12, wave: "triangle", freq: 78, length: 0.12, volume: 0.25 },
		{ wave: "sawtooth", freq: 196, length: 0.12, volume: 0.22, detune: 2 },
		{ at: 0.24, wave: "triangle", freq: 98, length: 0.12, volume: 0.25 },
		{ wave: "sawtooth", freq: 262, length: 0.8, volume: 0.25, detune: 2, vibrato: 20, vibratoRate: 5 },
		{ at: 0.36, wave: "triangle", freq: 131, length: 0.8, volume: 0.25 },
	],
	// Something made out of other things (see game.recipe): two knocks of
	// work, then a short rising note as it comes together.
	craft: [
		{ wave: "noise", freq: 320, length: 0.05, volume: 0.28 },
		{ at: 0.14, wave: "noise", freq: 320, length: 0.05, volume: 0.28 },
		{ at: 0.3, wave: "square", freq: 523, to: 784, length: 0.16, volume: 0.2 },
	],
};

// Fx: things that play over a square of the map without being part
// of it. One is either glowing dots that come and go over the square (a
// campfire's sparks fly up from it; a portal's swirl circles in toward its
// middle), or one square of the sheet that hovers over the square above
// (the "!" over an npc with a quest to hand out, or over an enemy that has
// just spotted the hero). A game plays them by name: a tile with fx:
// "sparks", any square of a scene with scene.addFx(x, y, "sparks"). New
// ones (smoke, bubbles, poison...) go in here. Dots work with letters too;
// a sprite needs pictures. See drawFx.
//
// Dots: `color` (one, or a list to pick from for each dot), `size` in sheet
// pixels (with letters, sixteenths of a square), `rate` dots a second,
// `life` milliseconds each lasts, and `glow` sheet pixels of light around
// each. Dots that fly: `rise` sheet pixels each climbs over its life (less
// than 0 sinks), `drift` sheet pixels of sideways wander either way, and
// `area`, the part of the square they start from, as fractions [left, top,
// right, bottom]. Dots that swirl instead: `orbit` sheet pixels from the
// middle of the square each starts, `turns` how far round it goes over its
// life (1 is once round, clockwise), and `pull`, how much of the way in to
// the middle it is drawn by the end (1 reaches it). Each number can be a
// [least, most] pair to pick from.
// A sprite: `sprite` [column, row] of the sheet, `color`, `hover` (bobs up
// and down), `above` (over the square above, not the square itself).
const FX = {
	sparks: {
		color: ["#ffd23f", "#ffb347", "#ff6a1f"],
		size: 1,
		rate: 5,
		rise: [12, 24],
		drift: 4,
		life: [500, 1000],
		glow: 1,
		area: [0.25, 0.1, 0.75, 0.6],
	},
	// A few faint motes circling slowly in toward the middle of the square,
	// as if something there were pulling them in: a portal's.
	swirl: {
		color: ["#b784ff", "#d9c6ff", "#8fd8ff"],
		size: 1,
		rate: 3,
		orbit: [7, 9],
		turns: [0.6, 1],
		pull: 0.85,
		life: [1500, 2500],
		glow: 1,
	},
	quest: { sprite: [36, 13], color: "#ffe14d", hover: true, above: true },
	alert: { sprite: [35, 13], color: "#ff5c5c", hover: true, above: true }, // a bare "!": an enemy has just spotted the hero (see alert)
};
for (const name in FX) FX[name].id = name;

const DEAD_COLOR = "#eee"; // the hero's remains (the skull) are bone-white, whatever their color was

const PLAYER_DEFAULTS = {
	name: "Hero",
	symbol: "@",
	color: "#ffd83d",
	verb: "hit",
	hp: 20,
	mp: 10,
	attack: 3,
	defense: 1,
	strength: 15, // how much the hero can carry (see `carry`), and a little extra on hits with a weapon
	sight: 8,
	speed: 1,
	gold: 0,
	items: [],
	skills: [],
};

const ENEMY_DEFAULTS = {
	hp: 5,
	attack: 3,
	defense: 0,
	xp: 5,
	speed: 1,
	sight: 7,
	ai: "chase",
	rarity: "common",
	verb: "hits",
	unique: false,
};

const STROLL_RANGE = 5; // how far from where they started friendly folk with ai: "wander" roam

// Friendly folk: they never attack, nobody attacks them, and walking into
// one talks to it (or opens its shop).
const NPC_DEFAULTS = {
	hp: 10,
	attack: 0,
	defense: 0,
	xp: 0,
	speed: 1,
	sight: 7,
	ai: "still",
	friendly: true,
	verb: "hits",
	unique: true,
};

// ------------------------------------------------------------------
//  Sound: 8-bit style bleeps, made on the fly with the Web Audio API
// ------------------------------------------------------------------
// game.play("hit") plays a built-in or user-defined sound. A sound in
// the config can be a recipe (see SOUNDS), a list of recipes, a URL of
// an audio file, a function, or false to turn that sound off.
class Sound {
	constructor(game, config) {
		this.game = game;
		this.enabled = config.sounds !== false && typeof window !== "undefined";
		this.volume = config.volume == null ? DEFAULTS.volume : config.volume;
		// In the editor's frame the shell's speaker button remembers mute across Runs (ZOT_MUTED, see editor.js)
		this.muted = typeof window !== "undefined" && !!(window.ZOT_SHELL && window.ZOT_MUTED);
		const custom = config.sounds && typeof config.sounds === "object" ? config.sounds : {};
		this.defs = Object.assign({}, SOUNDS, custom);
		this.ctx = null;
		this.noise = null;
		this.files = {};
		this.last = null; // name of the last sound played (handy for debugging)
		this.unlocked = false; // true once the player has pressed a key or clicked
	}

	// The browser only lets a page make noise after a key press or click.
	// Until then nothing is synthesized at all: a sound queued into a
	// suspended context would burst out later, on the first key press.
	// The game calls this from its key and click handlers.
	unlock() {
		if (this.unlocked || !this.enabled) return;
		this.unlocked = true;
		this.context();
	}
	context() {
		if (!this.ctx) {
			const AC = window.AudioContext || window.webkitAudioContext;
			if (!AC) return null;
			this.ctx = new AC();
		}
		if (this.ctx.state === "suspended") this.ctx.resume();
		return this.ctx;
	}

	play(name) {
		if (!this.enabled || this.muted) return;
		let def = name;
		if (typeof name === "string") {
			// A known name, or a file ("sounds/punch.wav") used straight from an item.
			def = name in this.defs ? this.defs[name] : /[./]/.test(name) ? name : null;
		}
		if (!def) return;
		if (typeof name === "string") this.last = name;
		if (typeof def === "function") {
			def(this.game);
			return;
		}
		if (typeof def === "string") {
			this.playFile(def);
			return;
		}
		if (!this.unlocked) return;
		const ctx = this.context();
		if (!ctx || ctx.state !== "running") return; // don't queue sounds for later
		const steps = Array.isArray(def) ? def : [def];
		let t = 0;
		for (const s of steps) {
			const start = s.at != null ? s.at : t;
			const len = s.length || 0.1;
			this.tone(ctx, s, ctx.currentTime + start, len);
			t = start + len;
		}
	}

	tone(ctx, s, when, len) {
		if (s.echo) {
			// Fading repeats: each one a little later and half as loud as the last.
			const delay = s.echoDelay || 0.15;
			for (let i = 1; i <= s.echo; i++) {
				const copy = Object.assign({}, s, {
					echo: 0,
					volume: (s.volume == null ? 0.3 : s.volume) * Math.pow(0.5, i),
				});
				this.tone(ctx, copy, when + i * delay, len);
			}
		}
		if (s.detune && s.wave !== "noise") {
			// A second copy a few Hz sharp, a bit quieter. The two beat against
			// each other, which is what makes a synth sound fat.
			const twin = Object.assign({}, s, {
				detune: 0,
				freq: (s.freq || 440) + s.detune,
				volume: (s.volume == null ? 0.3 : s.volume) * 0.7,
			});
			if (s.to) twin.to = s.to + s.detune;
			this.tone(ctx, twin, when, len);
		}
		const gain = ctx.createGain();
		const vol = (s.volume == null ? 0.3 : s.volume) * this.volume;
		gain.gain.setValueAtTime(0, when);
		gain.gain.linearRampToValueAtTime(vol, when + 0.005);
		gain.gain.linearRampToValueAtTime(0, when + len); // fade out, like a plucked note
		gain.connect(ctx.destination);
		let src;
		if (s.wave === "noise") {
			src = ctx.createBufferSource();
			src.buffer = this.noiseBuffer(ctx);
			src.loop = true;
			if (s.freq) src.playbackRate.setValueAtTime(s.freq / 440, when);
			if (s.to) src.playbackRate.exponentialRampToValueAtTime(s.to / 440, when + len);
		} else {
			src = ctx.createOscillator();
			src.type = s.wave || "square";
			src.frequency.setValueAtTime(s.freq || 440, when);
			if (s.to) src.frequency.exponentialRampToValueAtTime(s.to, when + len);
			if (s.vibrato) {
				// A slow sine wave nudging the pitch up and down, easing in over the first bit
				// of the note. It drives the oscillator's detune (in cents), so the wobble
				// stays the same size to the ear whether the note is low, high or sliding.
				const lfo = ctx.createOscillator();
				const depth = ctx.createGain();
				lfo.frequency.value = s.vibratoRate || 6;
				depth.gain.setValueAtTime(0, when);
				depth.gain.linearRampToValueAtTime(s.vibrato, when + Math.min(0.15, len / 2));
				lfo.connect(depth);
				depth.connect(src.detune);
				lfo.start(when);
				lfo.stop(when + len);
			}
		}
		src.connect(gain);
		src.start(when);
		src.stop(when + len);
	}

	// One second of crunchy noise, made once and reused.
	noiseBuffer(ctx) {
		if (this.noise) return this.noise;
		const rate = ctx.sampleRate;
		const buf = ctx.createBuffer(1, rate, rate);
		const data = buf.getChannelData(0);
		let v = 0;
		for (let i = 0; i < rate; i++) {
			if (i % 4 === 0) v = Math.random() * 2 - 1; // hold each value a bit: more 8-bit
			data[i] = v;
		}
		this.noise = buf;
		return buf;
	}

	// How long a recipe (or a named sound) lasts, in seconds. Files and functions count as 0.5.
	duration(name) {
		const def = typeof name === "string" ? this.defs[name] : name;
		if (!def || typeof def === "function" || typeof def === "string") return 0.5;
		let t = 0,
			end = 0;
		for (const s of Array.isArray(def) ? def : [def]) {
			const start = s.at != null ? s.at : t;
			t = start + (s.length || 0.1);
			end = Math.max(end, t + (s.echo ? s.echo * (s.echoDelay || 0.15) : 0));
		}
		return end;
	}

	playFile(url) {
		if (!this.files[url]) this.files[url] = new Audio(url);
		const a = this.files[url].cloneNode();
		a.volume = Math.max(0, Math.min(1, this.volume));
		const p = a.play();
		if (p && p.catch) p.catch(() => {});
	}
}

// ------------------------------------------------------------------
//  Item: a thing lying on the floor or carried by someone
// ------------------------------------------------------------------
class Item {
	// `def` is the recipe from game.item("potion", {...}); this is one copy of it.
	constructor(game, def) {
		this.game = game;
		this.def = def;
		this.kind = def.id;
		this.name = def.name;
		this.symbol = def.symbol;
		this.color = def.color;
		this.count = def.count > 1 ? Math.floor(def.count) : 1; // arrows come in piles
		this.equipped = false;
		this.left = def.lasts != null ? def.lasts : null; // turns of use left, for gear that wears out
		this.x = null;
		this.y = null;
	}
	get slot() {
		return this.def.slot || null;
	}
	// What this entry weighs: a pile is `count` of them. Everything weighs 1
	// unless its def says otherwise (weight: 0 for a ring, 0.2 for an arrow).
	get weight() {
		return (this.def.weight == null ? 1 : this.def.weight) * this.count;
	}
	// What wearing this adds, as [{ stat: "attack", value: 3 }, ...]. Empty for a potion.
	get bonuses() {
		return bonusesOf(this.def);
	}
	// Still unused. Fresh torches pile up; a half-burnt one is its own thing.
	get fresh() {
		return this.left == null || this.left >= this.def.lasts;
	}
	get label() {
		return this.count > 1 ? `${this.name} x${this.count}` : this.name;
	}
	// "wielded" for a weapon, "lit" for a light, "worn" for everything else (armor, rings, hats...)
	get wornWord() {
		return this.slot === "weapon" ? "wielded" : this.def.light ? "lit" : "worn";
	}
}

// ------------------------------------------------------------------
//  Creature: the hero, every enemy and every npc
// ------------------------------------------------------------------
class Creature {
	static count = 0;
	// `def` is the recipe: the player config, an enemy from game.enemy() or an npc from game.npc().
	constructor(game, def, isPlayer) {
		this.game = game;
		this.def = def;
		this.kind = def.id || "player";
		this.isPlayer = !!isPlayer;
		this.friendly = !!def.friendly; // an NPC from game.npc()
		this.serial = ++Creature.count; // its own number, to tell one rat from another (see drawFx)
		this.name = def.name;
		this.symbol = def.symbol;
		this.color = def.color;
		// Stats live here. player.attack etc. (defined at the bottom of the
		// class) add what gear and effects give on top of these.
		this.base = {
			attack: def.attack,
			defense: def.defense,
			strength: isPlayer ? def.strength : 0, // only the hero has strength: enemies neither carry nor hit harder with it
			maxHp: def.hp,
			maxMp: def.mp || 0,
			speed: def.speed || 1,
			sight: def.sight || 7,
		};
		this.startingStrengthBonus = this.base.strength;
		this.hp = this.base.maxHp;
		this.mp = this.base.maxMp;
		this.level = 1;
		this.xp = 0;
		this.gold = def.gold || 0;
		this.items = [];
		this.gear = {}; // slot -> Item
		this.skills = []; // { name, def, cooldown }
		this.effects = []; // { name, def, turns, from }, oldest first: see addEffect
		this.x = 0;
		this.y = 0;
		this.scene = null;
		this.dead = false;
		this.turns = 0;
		this.memory = null; // where an enemy last saw the hero
		this.facing = [0, 1]; // the way this creature last moved (or tried to): [dx, dy]
		this.talks = 0; // how many times the hero has talked to this NPC
		asList(def.skills).forEach((s) => this.learn(s, true));
	}

	// How this creature is named in messages:
	// "the goblin" / "you" / "Dragon King" (unique enemies keep their name)
	get label() {
		if (this.isPlayer) return "you";
		return this.def.unique ? this.name : "the " + this.name.toLowerCase();
	}
	get alive() {
		return !this.dead;
	}
	get isEnemy() {
		return !this.isPlayer && !this.friendly;
	}

	// What gear and effects add to a stat. While a thrown thing's hit is
	// worked out (see hit), it counts instead of whatever is worn in its
	// slot: a thrown dagger hits like a dagger, whatever sword is wielded.
	bonus(stat) {
		const thrown = this.throwing;
		const slot = thrown && (thrown.def.slot || "weapon");
		let total = thrown ? thrown.def[stat] || 0 : 0;
		for (const s in this.gear) if (s !== slot) total += this.gear[s].def[stat] || 0;
		for (const e of this.effects) total += e.def[stat] || 0;
		return total;
	}
	// The best light this creature has, worn or as an effect: true (sees
	// normally), a number of squares, or null for none. See `dark` in the
	// game options.
	get light() {
		let best = null;
		const defs = [...Object.values(this.gear), ...this.effects].map((x) => x.def);
		for (const def of defs) {
			const l = def.light;
			if (l === true) return true;
			if (typeof l === "number" && (best == null || l > best)) best = l;
		}
		return best;
	}
	// The wielded thing that `shoots` something (a bow), or null.
	get shooter() {
		for (const slot in this.gear) if (this.gear[slot].def.shoots) return this.gear[slot];
		return null;
	}
	// What strength adds to a hit with a weapon (not an arrow or a spell):
	// 1 for every 4 points over startingStrengthBonus, and 1 off for every 4
	// under. Always 0 for an enemy: they have no strength.
	get strengthBonus() {
		return Math.floor((this.strength - this.startingStrengthBonus) / 4);
	}
	// The weight of everything carried, worn or not (a sword on the belt
	// weighs the same as one in the pack), and how much this creature can
	// carry: the game's `carry` of its strength, the same number unless changed.
	get load() {
		return this.items.reduce((w, it) => w + it.weight, 0);
	}
	get carry() {
		const c = this.game.callHook("the game's carry function", this.game.config.carry, this.strength);
		return Number.isFinite(c) ? c : this.strength;
	}
	get overloaded() {
		return this.load > this.carry;
	}
	getSpeed() {
		return Math.max(1, this.speed * 100);
	}

	// ---- looking around ----
	distanceTo(other) {
		return distance(this, other);
	}
	isNextTo(other) {
		if (!other || other.dead || other.scene !== this.scene) return false;
		const dx = Math.abs(this.x - other.x),
			dy = Math.abs(this.y - other.y);
		return this.game.diagonals ? Math.max(dx, dy) === 1 : dx + dy === 1;
	}
	canSee(other) {
		if (!other || other.dead || other.scene !== this.scene) return false;
		const game = this.game;
		if (this.isPlayer) return game.visible.has(cellKey(other.x, other.y));
		if (other.isPlayer) {
			// Enemies only notice the hero once the hero has seen them on screen.
			return this.distanceTo(other) <= this.sight && game.shown.has(cellKey(this.x, this.y));
		}
		let seen = false;
		this.scene.computeFov(this.x, this.y, this.sight, (x, y) => {
			if (x === other.x && y === other.y) seen = true;
		});
		return seen;
	}

	// ---- moving ----
	moveBy(dx, dy) {
		const nx = this.x + dx,
			ny = this.y + dy;
		const scene = this.scene;
		if (dx || dy) this.facing = [Math.sign(dx), Math.sign(dy)];
		const other = scene.creatureAt(nx, ny);
		if (other) {
			if (other === this) return false;
			// The hero walking into a friendly creature talks to it.
			if (this.isPlayer && other.friendly) return this.game.talkTo(other);
			// Heroes and enemies fight; friendly creatures never do.
			if (other.isPlayer !== this.isPlayer && !this.friendly && !other.friendly) {
				this.hit(other);
				return true;
			}
			return false;
		}
		if (!scene.isWalkable(nx, ny)) {
			if (!this.isPlayer) return false;
			// Walking into a wall does nothing, but an exit on a square that
			// can't be stood on (the door of a building) is taken that way, and
			// some tiles (locked doors, chests, levers) have an onBump that does something.
			const exit = scene.exitAt(nx, ny);
			if (exit) {
				this.game.takeExit(exit);
				return true;
			}
			return this.game.bumpTile(nx, ny);
		}
		this.x = nx;
		this.y = ny;
		if (this.isPlayer) this.game.playerArrived();
		return true;
	}
	moveTo(x, y) {
		if (!this.scene.isWalkable(x, y) || this.scene.creatureAt(x, y)) return false;
		this.x = x;
		this.y = y;
		if (this.isPlayer) this.game.playerArrived();
		return true;
	}
	stepToward(target) {
		const scene = this.scene,
			tx = target.x,
			ty = target.y;
		if (tx === this.x && ty === this.y) return false;
		const findPath = (throughCreatures) => {
			const passable = (x, y) => {
				if (x === this.x && y === this.y) return true;
				if (!scene.isWalkable(x, y)) return false;
				if (throughCreatures || (x === tx && y === ty)) return true;
				return !scene.creatureAt(x, y);
			};
			const astar = new ROT.Path.AStar(tx, ty, passable, { topology: this.game.topology });
			const path = [];
			astar.compute(this.x, this.y, (x, y) => path.push([x, y]));
			return path;
		};
		// Try to walk around other creatures; if that's impossible, head
		// straight through (bumping into an enemy attacks it).
		let path = findPath(false);
		if (path.length < 2) path = findPath(true);
		if (path.length > 1) {
			const [nx, ny] = path[1];
			if (this.moveBy(nx - this.x, ny - this.y)) return true;
		}
		const dx = Math.sign(tx - this.x),
			dy = Math.sign(ty - this.y);
		if (dx && this.moveBy(dx, 0)) return true;
		if (dy && this.moveBy(0, dy)) return true;
		return false;
	}
	stepAway(target) {
		let best = null,
			bestDist = this.distanceTo(target);
		for (const [dx, dy] of this.game.directions) {
			const nx = this.x + dx,
				ny = this.y + dy;
			if (!this.scene.isWalkable(nx, ny) || this.scene.creatureAt(nx, ny)) continue;
			const d = distance({ x: nx, y: ny }, target);
			if (d > bestDist) {
				bestDist = d;
				best = [dx, dy];
			}
		}
		if (!best) return false;
		return this.moveBy(best[0], best[1]);
	}
	wander() {
		const [dx, dy] = pick(this.game.directions);
		const c = this.scene.creatureAt(this.x + dx, this.y + dy);
		if (c) return false;
		return this.moveBy(dx, dy);
	}
	// How friendly folk wander: stand around a while, then walk a straight
	// line, turning now and then, and stopping when something is in the
	// way. They don't go through doors, so an npc stays in its room.
	stroll() {
		// They keep within a few squares of where they started, so a farmer
		// put near the hero stays near.
		if (!this.home) this.home = { x: this.x, y: this.y };
		if (distance(this, this.home) > STROLL_RANGE) {
			this.heading = null;
			return chance(70) ? this.stepToward(this.home) : false;
		}
		if (!this.heading) {
			this.heading = pick(this.game.directions);
		} else if (chance(85)) {
			// stop for a rest
			return false;
		} else if (chance(25)) {
			this.heading = pick(this.game.directions); // a whim
		}
		const [dx, dy] = this.heading;
		const nx = this.x + dx,
			ny = this.y + dy;
		if (!this.scene.isFree(nx, ny) || this.scene.isDoor(nx, ny)) {
			this.heading = null;
			return false;
		}
		return this.moveBy(dx, dy);
	}

	// ---- fighting ----
	// A melee attack: roll damage, let onAttack/onHurt hooks adjust it,
	// print the message, then apply it. `shot` is for an arrow (see shoot):
	// { who, verb, color } change the line and the hit flash, `ammo` is the
	// arrow, and `item`, a thrown thing (see throwItem), hits instead of the
	// wielded weapon. Whatever hit runs its onHit after a hit that does damage.
	hit(target, shot) {
		const game = this.game;
		if (this.dead || !target || target.dead) return 0; // the hero's remains are left alone, whatever an enemy's own brain says
		// Whatever the hooks say ("The slime splits!") waits until after the hit line.
		const before = game.messageCount;
		this.throwing = (shot && shot.item) || null;
		let dmg = game.callHook("the game's damage function", game.config.damage, this, target, !shot);
		this.throwing = null;
		dmg = this.runHooks("onAttack", [target], dmg);
		dmg = target.runHooks("onHurt", [this], dmg);
		dmg = Number.isFinite(dmg) ? Math.max(0, Math.round(dmg)) : 0;
		const said = game.messages.filter((m) => m.id > before);
		if (said.length) game.messages = game.messages.filter((m) => m.id <= before);
		const who = shot ? shot.who : cap(this.label);
		const verb = shot ? shot.verb : this.def.verb || (this.isPlayer ? "hit" : "hits");
		if (dmg <= 0) {
			game.say(`${who} ${verb} ${target.label} but ${this.isPlayer ? "do" : "does"} no damage.`, "miss");
		} else {
			game.say(`${who} ${verb} ${target.label} for ${dmg}.`, target.isPlayer ? "hurt" : "hit");
		}
		if (said.length) {
			game.messages.push(...said);
			if (game.el) game.drawLog();
		}
		game.flash(target.x, target.y, shot ? shot.color : target.isPlayer ? "#ff6b6b" : this.color);
		target.hurt(dmg, this, true);
		const by = shot ? shot.item || shot.ammo : this.gear.weapon;
		if (dmg > 0 && by) game.callHook(`the ${by.def.name}'s onHit`, by.def.onHit, this, target, dmg, by);
		if (dmg > 0 && !target.dead) game.play("hit"); // a killing blow plays "kill" instead
		return dmg;
	}
	// Where an arrow would go from here in the direction given: the squares it
	// flies over, up to `range`, stopping at the first enemy (the `target`) or
	// the square before something solid. Friendly folk are never hit; the arrow
	// flies past them. An empty path means there's no room to shoot that way.
	aim(dx, dy, range) {
		const scene = this.scene;
		let x = this.x,
			y = this.y,
			target = null;
		const path = [];
		for (let i = 0; i < range; i++) {
			if (!scene.isWalkable(x + dx, y + dy)) break; // a wall, a chest, water
			x += dx;
			y += dy;
			path.push([x, y]);
			const c = scene.creatureAt(x, y);
			if (c && !c.dead && !c.friendly && c.isPlayer !== this.isPlayer) {
				target = c;
				break;
			}
		}
		return { path, target, x, y };
	}
	// The wielded thing that `shoots` and something to shoot from it, or null
	// after saying what's missing.
	// An enemy that `shoots` needs no bow and never runs out.
	readyToShoot() {
		const game = this.game;
		if (!this.isPlayer && this.def.shoots) {
			const ammoDef = game.lookup("item", this.def.shoots);
			return { weapon: null, ammoDef, ammo: null, range: this.def.range || this.sight };
		}
		const weapon = this.shooter;
		if (!weapon) {
			game.say("You have nothing to shoot with.", "warn");
			return null;
		}
		const ammoDef = game.lookup("item", weapon.def.shoots);
		const ammo = this.itemNamed(ammoDef.id);
		if (!ammo) {
			game.say(`You have no ${plural(ammoDef.name.toLowerCase())} left.`, "warn");
			return null;
		}
		return { weapon, ammoDef, ammo, range: weapon.def.range || this.sight };
	}
	// What the f key does: shoot at the closest enemy in a straight line from
	// here (the same row or column, with a clear path), whichever of the four
	// ways that is. An enemy that can be seen but not shot gets a word of
	// explanation instead, and no turn passes. Returns true if a turn passes.
	shootNearest() {
		const ready = this.readyToShoot();
		if (!ready) return false;
		const way = this.lineToNearest(ready.range, "shoot");
		return way ? this.shoot(way[0], way[1]) : false;
	}
	// Which way, [dx, dy], the closest enemy this creature can see is in a
	// straight line within `range`, or null after saying why there's none
	// ("Can't throw diagonally."). `verb` is "shoot" or "throw".
	lineToNearest(range, verb) {
		const game = this.game;
		let best = null;
		for (const [dx, dy] of SIDES) {
			const { target, path } = this.aim(dx, dy, range);
			if (target && this.canSee(target) && (!best || path.length < best.path.length)) best = { dx, dy, path };
		}
		if (best) return [best.dx, best.dy];
		const seen = this.scene.enemies.filter((e) => this.canSee(e));
		const diagonal = seen.some((e) => Math.abs(e.x - this.x) === Math.abs(e.y - this.y));
		if (!seen.length) game.say(`There's nothing to ${verb} at.`, "warn");
		else if (diagonal) game.say(`Can't ${verb === "shoot" ? "fire" : verb} diagonally.`, "warn");
		else game.say(`There's no enemy in line to ${verb} at.`, "warn");
		return null;
	}
	// An enemy that `shoots` fires at `target` (the hero) when it's in a
	// straight line, within range, with nothing solid in between. Returns
	// true if it fired, which uses up its turn.
	shootAt(target) {
		const dx = Math.sign(target.x - this.x),
			dy = Math.sign(target.y - this.y);
		if ((dx && dy) || (!dx && !dy)) return false; // only along a row or a column
		if (!this.isPlayer && !this.def.shoots) return false;
		const ready = this.readyToShoot();
		if (!ready) return false;
		if (this.aim(dx, dy, ready.range).target !== target) return false;
		return this.shoot(dx, dy);
	}
	// Shoot with the wielded thing that `shoots` (a bow shoots arrows) in the
	// direction given, or the way this creature is facing. The arrow flies
	// straight, up to the weapon's `range`, until it hits someone or something
	// solid (see aim). A hit uses the normal damage rules (and the arrow is
	// gone); a miss lands on the floor where the arrow stopped. With pictures
	// that happens when the arrow gets there (see flight). Returns true if a
	// turn passes.
	shoot(dx, dy) {
		const game = this.game,
			scene = this.scene;
		const ready = this.readyToShoot();
		if (!ready) return false;
		const { weapon, ammoDef, ammo, range } = ready;
		if (dx == null) [dx, dy] = this.facing;
		dx = Math.sign(dx);
		dy = Math.sign(dy || 0);
		if (!dx && !dy) return false;
		const { path, target, x, y } = this.aim(dx, dy, range);
		if (!path.length) {
			game.say("There's no room to shoot that way.", "warn");
			return false;
		}
		if (ammo) this.removeItem(ammo, 1);
		const arrow = new Item(game, ammoDef);
		arrow.count = 1; // one off the pile
		const name = arrow.name.toLowerCase();
		const whose = this.isPlayer ? "Your" : `${cap(this.label)}'s`;
		const dir = directionName(dx, dy);
		game.play((weapon && weapon.def.sound) || "shoot");
		game.flight(path, game.sprite("item", ammoDef, [dx, dy]), arrow.color, () => {
			if (target && !target.dead) {
				this.hit(target, { who: `${whose} ${name} flies ${dir} and`, verb: "hits", color: arrow.color, ammo: arrow });
				// Being shot from afar is enough to make an enemy come looking.
				if (!target.dead && target.isEnemy) target.memory = { x: this.x, y: this.y };
			} else {
				game.say(`${whose} ${name} flies ${dir} and lands on the floor.`, "miss");
				scene.placeItem(arrow, x, y);
			}
		});
		return true;
	}
	// The things carried that can be thrown (anything with `throw`), worn or not.
	get throwables() {
		return this.items.filter((it) => it.def.throw);
	}
	// Throw `item` at the closest enemy in a straight line within its
	// `throw` range. Returns true if a turn passes.
	throwNearest(item) {
		const way = this.lineToNearest(item.def.throw, "throw");
		return way ? this.throwItem(item, way[0], way[1]) : false;
	}
	// Throw one of `item` (one off a pile; the wielded one is taken off first)
	// in the direction given, or the way this creature is facing, up to its
	// `throw` range. It flies like an arrow (see aim) and hits with its own
	// attack instead of the wielded weapon's. Hit or miss, it's gone.
	// Returns true if a turn passes.
	throwItem(item, dx, dy) {
		const game = this.game;
		if (!item || !item.def.throw || !this.items.includes(item)) return false;
		if (dx == null) [dx, dy] = this.facing;
		dx = Math.sign(dx);
		dy = Math.sign(dy || 0);
		if (!dx && !dy) return false;
		const { path, target } = this.aim(dx, dy, item.def.throw);
		if (!path.length) {
			game.say("There's no room to throw that way.", "warn");
			return false;
		}
		let thrown = item;
		if (item.count > 1) {
			this.removeItem(item, 1);
			thrown = new Item(game, item.def);
			thrown.count = 1;
		} else {
			if (item.equipped) this.unequip(item, true);
			this.removeItem(item);
		}
		const name = thrown.name.toLowerCase();
		const whose = this.isPlayer ? "Your" : `${cap(this.label)}'s`;
		const dir = directionName(dx, dy);
		game.play("shoot");
		game.flight(path, game.sprite("item", thrown.def, [dx, dy]), thrown.color, () => {
			if (target && !target.dead) {
				this.hit(target, { who: `${whose} ${name} flies ${dir} and`, verb: "hits", color: thrown.color, item: thrown });
				if (!target.dead && target.isEnemy) target.memory = { x: this.x, y: this.y };
			} else {
				game.say(`${whose} ${name} flies ${dir} and is lost.`, "miss");
			}
		});
		return true;
	}
	hurt(amount, source, quiet) {
		if (this.dead) return;
		if (this.isPlayer && this.game.config.godMode) amount = 0; // godMode is for testing your game
		amount = Math.max(0, Math.round(amount));
		if (!quiet && amount > 0) {
			this.game.say(
				`${cap(this.label)} ${this.isPlayer ? "take" : "takes"} ${amount} damage.`,
				this.isPlayer ? "hurt" : "hit",
			);
		}
		this.hp -= amount;
		if (this.hp <= 0) {
			this.hp = 0;
			this.die(source);
		}
	}
	heal(amount, quiet) {
		if (this.dead) return;
		const before = this.hp;
		this.hp = Math.min(this.maxHp, this.hp + Math.round(amount));
		const gained = this.hp - before;
		if (!quiet && gained > 0) this.game.say(`${cap(this.label)} heal${this.isPlayer ? "" : "s"} ${gained} HP.`, "good");
		return gained;
	}
	die(killer) {
		if (this.dead) return;
		this.dead = true;
		this.effects = []; // nothing wears off a dead creature: they just stop
		const game = this.game;
		if (this.isPlayer) {
			const by = killer ? ` by ${killer.label}` : "";
			game.killer = killer; // the end screen shows them
			game.lose(`You were killed${by} ${game.sceneWhere(game.currentScene.key)}.`);
			return;
		}
		if (killer && killer.isPlayer) game.say(`You kill ${this.label}!`, "kill");
		else game.say(`${cap(this.label)} dies!`, "kill");
		game.play("kill");
		this.scene.removeCreature(this);
		this.dropLoot();
		if (killer && killer.isPlayer) {
			game.kills++;
			game.questEvent("kill", this.kind);
			killer.runHooks("onKill", [this]);
			game.callHook("the game's onKill", game.config.onKill, killer, this);
			killer.gainXp(this.def.xp || 0);
		}
		game.callHook(this.hookName("onDie"), this.def.onDie, this, killer);
	}
	// An enemy drops one item at most. `drops` is a table of percents,
	// rolled once: { gold: 60, potion: 10 } is gold 60% of the time, a
	// potion 10%, and nothing the other 30%. { gold: 100 } always drops gold.
	dropLoot() {
		const drops = this.def.drops;
		if (!drops) return;
		let name = null;
		let roll = ROT.RNG.getUniform() * 100;
		for (const key in drops) {
			roll -= drops[key];
			if (roll < 0) {
				name = key;
				break;
			}
		}
		if (name) this.scene.drop(name, this.x, this.y);
	}

	// ---- experience ----
	xpToNext() {
		return valueOf(this.game.config.levelUp.xp, this.level);
	}
	gainXp(amount) {
		if (!this.isPlayer || amount <= 0) return;
		this.xp += amount;
		this.game.say(`+${amount} XP`, "good");
		while (this.xp >= this.xpToNext()) {
			this.xp -= this.xpToNext();
			this.level++;
			this.levelUp();
		}
	}
	levelUp() {
		const game = this.game,
			L = game.config.levelUp;
		// Only the maximums go up. Current HP and MP stay put: a level-up is not a heal.
		this.base.maxHp += L.hp || 0;
		this.base.maxMp += L.mp || 0;
		this.base.attack += L.attack || 0;
		this.base.defense += L.defense || 0;
		this.base.strength += L.strength || 0;
		game.say(`Level up! You are now level ${this.level}.`, "level");
		game.play("levelup");
		this.learnDueSkills();
		this.runHooks("onLevelUp", [this.level]);
		game.callHook("the game's onLevelUp", game.config.onLevelUp, this, this.level);
	}

	learnDueSkills(quiet) {
		for (const name in this.game.defs.skill) {
			const s = this.game.defs.skill[name];
			if (s.learnAt != null && s.learnAt <= this.level && !this.knows(name)) this.learn(name, quiet);
		}
	}

	clampStats() {
		this.hp = Math.min(this.hp, this.maxHp);
		this.mp = Math.min(this.mp, this.maxMp);
	}
	// Calls def.onX if it exists. A numeric return replaces `value`.
	runHooks(hook, args, value) {
		const fn = this.def[hook];
		if (typeof fn !== "function") return value;
		const all = value === undefined ? [this, ...args] : [this, ...args, value];
		const r = this.game.callHook(this.hookName(hook), fn, ...all);
		return typeof r === "number" ? r : value;
	}
	// "the goblin's onHurt": who to blame when a hook goes wrong.
	hookName(hook) {
		return `${this.isPlayer ? "the hero" : this.label}'s ${hook}`;
	}

	// ---- skills ----
	knows(name) {
		return this.skills.some((s) => s.name === name);
	}
	learn(name, quiet) {
		const def = this.game.lookup("skill", name);
		if (this.knows(name)) return;
		this.skills.push({ name, def, cooldown: 0 });
		if (!quiet) this.game.say(`You learn ${def.name}!`, "level");
	}
	forget(name) {
		this.skills = this.skills.filter((s) => s.name !== name);
	}
	// Returns true if the skill was used (and a turn passes).
	useSkill(name) {
		const game = this.game;
		const s = this.skills.find((k) => k.name === name);
		if (!s) {
			game.say(`You don't know ${name}.`, "warn");
			return false;
		}
		const def = s.def;
		if (s.cooldown > 0) {
			game.say(`${def.name} is not ready (${s.cooldown} more turns).`, "warn");
			return false;
		}
		if ((def.mp || 0) > this.mp) {
			game.say(`Not enough MP for ${def.name}.`, "warn");
			return false;
		}
		let target = null;
		if (def.target) {
			target = game.nearestEnemy(def.range || this.sight, this);
			if (!target) {
				game.say(`No target in range for ${def.name}.`, "warn");
				return false;
			}
		}
		const result = game.callHook(`the ${def.name} skill's onUse`, def.onUse, this, target);
		if (result === false) return false;
		this.mp -= def.mp || 0;
		s.cooldown = def.cooldown || 0;
		game.play("magic");
		return true;
	}

	// ---- items ----
	// Everything carried but not worn: the numbered items in the side panel.
	// `items` is the whole inventory; what's worn is in `gear` as well.
	get unworn() {
		return this.items.filter((it) => !it.equipped);
	}
	has(name) {
		return this.items.some((it) => it.kind === name);
	}
	countOf(name) {
		return this.items.filter((it) => it.kind === name).reduce((n, it) => n + it.count, 0);
	}
	itemNamed(name) {
		return this.items.find((it) => it.kind === name) || null;
	}
	// Takes an item into the pack. False if it's too heavy (which it says) or
	// the item's onPickup refused. `quiet` skips the message and the sound,
	// for something that didn't come off the floor (a thing just made).
	pickUp(item, quiet) {
		const game = this.game;
		const def = item.def;
		if (game.callHook(`the ${def.name}'s onPickup`, def.onPickup, this, item) === false) return false;
		if (def.keep === false) {
			if (!quiet) {
				game.say(`You pick up ${some(item.count, item.name)}.`, "item");
				game.play(def.pickupSound || "pickup");
			}
			return true;
		}
		// Too heavy? See `carry`; a pile of arrows weighs count times the arrow's weight.
		if (this.load + item.weight > this.carry + 1e-9) {
			// (the hair of slack is for sums of fractions: 0.2 five times isn't exactly 1)
			game.say(
				`Too heavy: ${some(item.count, item.name)} weigh${item.count > 1 ? "" : "s"} ${weightText(item.weight)}; you're carrying ${weightText(this.load)} and can carry ${weightText(this.carry)}.`,
				"warn",
			);
			return false;
		}
		const stack = this.pileFor(item);
		if (stack) stack.count += item.count;
		else this.items.push(item);
		item.x = item.y = null;
		if (!quiet) {
			game.say(`You pick up ${some(item.count, item.name)}.`, "item");
			game.play(def.pickupSound || "pickup");
		}
		if (this.isPlayer) game.questEvent("pickup", item.kind);
		return true;
	}
	// Use, equip or unequip an item. Returns true if a turn passes.
	use(item) {
		const game = this.game,
			def = item.def;
		if (def.slot) {
			if (item.equipped) {
				this.unequip(item);
				this.restack(item);
				if (this.isPlayer && game.dark) game.say(DARK_TEXT, "warn");
			} else this.equip(item);
			return true;
		}
		if (!def.onUse) {
			game.say(`You can't use the ${item.name}.`, "warn");
			return false;
		}
		const r = game.callHook(`the ${def.name}'s onUse`, def.onUse, this, item);
		if (r === false) return false;
		if (def.consumable !== false) this.removeItem(item, 1);
		game.play(def.sound || "magic");
		return true;
	}
	// The t key: light a torch (any light that's carried unlit; a half-burnt one
	// before a fresh one). Returns true if a turn passes. With one already lit,
	// or none at all, it says so instead.
	lightUp() {
		const game = this.game;
		const lit = Object.values(this.gear).find((it) => it.def.light);
		if (lit) {
			game.say(`Your ${lit.name} is already lit.`, "warn");
			return false;
		}
		const spares = this.unworn.filter((it) => it.def.light).sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity));
		if (spares.length) return this.use(spares[0]);
		// Named after the game's own light, if it has one ("torch", "lantern")
		const def = Object.values(game.defs.item).find((d) => d.light);
		game.say(`You don't have a ${def ? def.name.toLowerCase() : "torch"}.`, "warn");
		return false;
	}
	equip(item) {
		const slot = item.def.slot;
		if (!slot) return false;
		if (item.count > 1) {
			// One off the pile; the rest stay as they were.
			item.count--;
			item = new Item(this.game, item.def);
		}
		if (!this.items.includes(item)) this.items.push(item);
		const old = this.gear[slot];
		if (old) this.unequip(old);
		this.gear[slot] = item;
		item.equipped = true;
		// Only now: a fresh old torch mustn't pile onto the one just lit.
		if (old) this.restack(old);
		const verb = item.def.light ? "light" : slot === "weapon" ? "wield" : "put on";
		this.game.say(`You ${verb} the ${item.name}.`, "item");
		this.game.callHook(`the ${item.name}'s onEquip`, item.def.onEquip, this, item);
		this.clampStats();
		return true;
	}
	unequip(item, quiet) {
		const slot = item.def.slot;
		if (!slot || this.gear[slot] !== item) return false;
		delete this.gear[slot];
		item.equipped = false;
		if (!quiet) this.game.say(`You ${item.def.light ? "put out" : "take off"} the ${item.name}.`, "item");
		this.game.callHook(`the ${item.name}'s onUnequip`, item.def.onUnequip, this, item);
		this.clampStats();
		return true;
	}
	// The pile that `item` would join: everything of a kind stacks (potions,
	// arrows, spare swords), as long as it's unused. A half-burnt torch is
	// its own thing, and so is whatever's worn; an Enchanted Sword piles up
	// with the other enchanted ones, never with a plain one (it has its own def).
	pileFor(item) {
		if (!item.fresh) return null;
		return this.items.find((it) => it !== item && it.def === item.def && !it.equipped && it.fresh) || null;
	}
	// Gear that's been taken off (or a fresh torch put out) goes back on the pile with the others.
	restack(item) {
		if (!this.items.includes(item)) return;
		const pile = this.pileFor(item);
		if (!pile) return;
		pile.count += item.count;
		this.items = this.items.filter((it) => it !== item);
	}
	// Worn things with `lasts` run down one turn at a time and are gone at 0.
	// A light isn't burning in daylight, so it doesn't run down there.
	burnGear() {
		for (const item of Object.values(this.gear)) {
			if (item.left == null) continue;
			if (item.def.light && this.scene && this.scene.daylight) continue;
			item.left--;
			if (item.left <= 0) this.wearOut(item);
		}
	}
	wearOut(item) {
		const game = this.game;
		this.unequip(item, true);
		this.items = this.items.filter((it) => it !== item);
		game.say(`Your ${item.name} ${item.def.light ? "burns out" : "wears out"}.`, "warn");
		game.callHook(`the ${item.name}'s onWearOut`, item.def.onWearOut, this, item);
		if (this.isPlayer && game.dark) game.say(DARK_TEXT, "warn");
	}
	// Takes an item out of the pack for good: all of it, or `count` of a pile.
	// By name with a count, out of as many piles as it takes (a worn knife and
	// a spare one); false, and nothing taken, if there aren't that many.
	removeItem(item, count) {
		if (typeof item === "string" && count != null) {
			if (this.countOf(item) < count) return false;
			for (let left = count; left > 0; ) {
				const pile = this.itemNamed(item);
				const take = Math.min(left, pile.count);
				this.removeItem(pile, take);
				left -= take;
			}
			return true;
		}
		if (typeof item === "string") item = this.itemNamed(item);
		if (!item) return false;
		if (count == null || count >= item.count) {
			if (item.equipped) this.unequip(item);
			this.items = this.items.filter((it) => it !== item);
		} else {
			item.count -= count;
		}
		return true;
	}
	drop(item) {
		if (typeof item === "string") item = this.itemNamed(item);
		if (!item) return false;
		if (item.equipped) this.unequip(item);
		let dropped = item;
		if (item.count > 1) {
			item.count--;
			dropped = new Item(this.game, item.def);
		} else {
			this.items = this.items.filter((it) => it !== item);
		}
		this.scene.placeItem(dropped, this.x, this.y);
		this.game.say(`You drop the ${item.name}.`, "item");
		return true;
	}

	// ---- effects (see game.effect) ----
	// addEffect("poisoned") puts one on, for its own turns; addEffect("poisoned", 3)
	// for 3 turns instead, or addEffect("burning", { turns: 3, from: dragon })
	// to say who did it (onTurn can pass effect.from on to hurt). One it
	// already has lasts the longer of what is left and what is new, and
	// onStart doesn't run again. Returns the effect: { name, def, turns, from }.
	addEffect(name, opts) {
		const def = this.game.lookup("effect", name);
		if (typeof opts === "number" || Array.isArray(opts)) opts = { turns: opts };
		opts = opts || {};
		const t = opts.turns !== undefined ? opts.turns : def.turns;
		const turns = t == null ? null : Array.isArray(t) ? random(Math.round(t[0]), Math.round(t[1])) : Math.round(t);
		const had = this.effects.find((s) => s.name === name);
		if (had) {
			had.turns = had.turns == null || turns == null ? null : Math.max(had.turns, turns);
			if (opts.from) had.from = opts.from;
			return had;
		}
		const effect = { name, def, turns, from: opts.from || null };
		if (this.dead) return effect;
		this.effects.push(effect);
		this.game.callHook(`the ${name} effect's onStart`, def.onStart, this, effect);
		return effect;
	}
	hasEffect(name) {
		return this.effects.some((s) => s.name === name);
	}
	// Takes an effect off before its time (a potion that cures poison); its
	// onEnd runs. False if it didn't have it.
	removeEffect(name) {
		const game = this.game;
		const effect = this.effects.find((s) => s.name === name);
		if (!effect) return false;
		this.effects = this.effects.filter((s) => s !== effect);
		game.callHook(`the ${name} effect's onEnd`, effect.def.onEnd, this, effect);
		if (effect.def.light && this.isPlayer && game.dark) game.say(DARK_TEXT, "warn"); // its light went out
		return true;
	}
	// One turn of every effect: its onTurn, then a turn off what is left.
	tickEffects() {
		for (const effect of [...this.effects]) {
			if (this.dead) return;
			if (!this.effects.includes(effect)) continue; // an earlier one's onTurn took it off
			this.game.callHook(`the ${effect.name} effect's onTurn`, effect.def.onTurn, this, effect);
			if (effect.turns != null && --effect.turns <= 0 && this.effects.includes(effect)) this.removeEffect(effect.name);
		}
	}

	// ---- every turn ----
	tick() {
		this.turns++;
		const game = this.game,
			cfg = game.config;
		for (const s of this.skills) if (s.cooldown > 0) s.cooldown--;
		this.tickEffects();
		if (this.dead) return;
		if (this.isPlayer && cfg.mpRegen && this.turns % cfg.mpRegen === 0 && this.mp < this.maxMp) this.mp++;
		this.burnGear();
		game.callHook(this.hookName("onTurn"), this.def.onTurn, this);
	}

	// The enemy's brain. Give an enemy its own `act(self)` to replace this:
	// the enemy still looks for the hero first (and gets the "!" over its
	// head when it spots them), and your act decides what it does about it.
	act() {
		if (this.dead) return;
		this.tick();
		if (this.dead) return;
		const def = this.def;
		const player = this.game.player;
		const sees = !this.friendly && !player.dead && this.canSee(player);
		if (sees && !this.memory) this.game.alert(this); // it had no idea where the hero was: a "!" over its head
		if (sees) this.memory = { x: player.x, y: player.y };
		if (def.act) {
			this.game.callHook(this.hookName("act"), def.act, this, this.game);
			return;
		}
		if (this.friendly) {
			// NPCs stand still or stroll about; they never fight.
			if (def.ai === "wander") this.stroll();
			return;
		}
		if (player.dead) {
			// The hero is gone: nothing to chase, so monsters go about their business.
			if (def.ai === "wander" || (def.ai !== "still" && chance(50))) this.wander();
			return;
		}
		const next = this.isNextTo(player);
		// One that shoots does so whenever it sees the hero in line, unless they're right beside it.
		if (def.shoots && sees && !next && this.shootAt(player)) return;
		switch (def.ai) {
			case "still":
				if (next) this.hit(player);
				return;
			case "wander":
				if (next) this.hit(player);
				else this.wander();
				return;
			case "flee":
				if (sees) this.stepAway(player);
				else if (chance(50)) this.wander();
				return;
			default: // chase
				if (next) {
					this.hit(player);
					return;
				}
				if (this.memory) {
					const moved = this.stepToward(this.memory);
					if (!moved || (this.x === this.memory.x && this.y === this.memory.y)) this.memory = null;
					return;
				}
				if (chance(50)) this.wander();
		}
	}

	say(text) {
		this.game.say(`${this.name}: ${text}`, "speech");
	}
}

// player.attack, player.maxHp, ... = base + what gear and effects add.
// Setting one changes the base, so `player.attack += 1` does what you expect.
for (const stat of STATS) {
	Object.defineProperty(Creature.prototype, stat, {
		get() {
			return this.base[stat] + this.bonus(stat);
		},
		set(v) {
			this.base[stat] = v - this.bonus(stat);
		},
	});
}

// A room let into a maze (see Scene.digMaze), answering what the vault,
// chest and npc code ask of rot.js's rooms.
class MazeRoom {
	constructor(x1, y1, x2, y2) {
		this.x1 = x1;
		this.y1 = y1;
		this.x2 = x2;
		this.y2 = y2;
		this.doors = [];
	}
	getLeft() {
		return this.x1;
	}
	getRight() {
		return this.x2;
	}
	getTop() {
		return this.y1;
	}
	getBottom() {
		return this.y2;
	}
	getCenter() {
		return [Math.floor((this.x1 + this.x2) / 2), Math.floor((this.y1 + this.y2) / 2)];
	}
	addDoor(x, y) {
		this.doors.push([x, y]);
	}
	getDoors(callback) {
		for (const [x, y] of this.doors) callback(x, y);
	}
}

// ------------------------------------------------------------------
//  Scene: one place in the world (a floor of the dungeon, a meadow, a town)
// ------------------------------------------------------------------
class Scene {
	constructor(game, key) {
		this.game = game;
		this.key = key; // its number in the chain of numbered scenes, or the name it was defined with
		this.number = typeof key === "number" ? key : null;
		this.opts = game.defs.scene[key] || {}; // from game.scene(key, {...})
		this.name = this.opts.name || null;
		// How tough it is: what enemiesPerScene and the like get, and what an
		// enemy's or item's `level` goes by. Its number unless it says.
		this.level = this.opts.level != null ? this.opts.level : this.number || 1;
		this.exits = {}; // name -> { name, x, y, to, at, win, tile }: the ways out, see makeExits
		// "dungeon", "rooms", "cave", "maze" or "overworld", or "drawn" when the
		// scene's map is a picture made of letters (see readDrawing).
		this.drawing = drawingLines(this.opts.map);
		this.mazeSettings = mazeSettings(game.config);
		this.type = this.drawing ? "drawn" : this.opts.map || (this.isMazeFloor() ? "maze" : game.config.map);
		const size = this.type === "maze" ? this.mazeSettings : {}; // a maze can have a size of its own
		this.width = this.drawing
			? Math.max(0, ...this.drawing.map((l) => l.length))
			: this.opts.width || size.width || game.config.width;
		this.height = this.drawing ? this.drawing.length : this.opts.height || size.height || game.config.height;
		if (this.type === "maze") {
			// A maze's walls and passages take turns, so its size is odd: an
			// even one loses a square, or the wall would be two thick on one side.
			this.width -= 1 - (this.width % 2);
			this.height -= 1 - (this.height % 2);
		}
		this.tiles = []; // tiles[x][y] = "wall" | "floor" | "door" | "openDoor" | ...
		this.squares = new Map(); // "x,y" -> { x, y, scene, flags }: see squareAt
		this.chests = {}; // "x,y" of a closed chest -> the names of the items inside
		this.fx = new Map(); // "x,y" -> { x, y, names }: the fx put on a square with addFx
		this.explored = new Set(); // "x,y" cells the hero has seen at some point
		this.salt = (game.seedNumber * 31 + seedNumber(String(key))) | 0; // for the map's grain, see drawMap
		this.creatures = [];
		this.items = [];
		this.scheduler = new ROT.Scheduler.Speed();
		this.fovOrigin = null;
		this.fov = new ROT.FOV.PreciseShadowcasting(
			(x, y) => (this.fovOrigin && x === this.fovOrigin.x && y === this.fovOrigin.y) || this.isSeeThrough(x, y),
		);
		this.generate();
		this.populate();
	}
	// For error messages: "scene 3" or "the mine scene".
	get label() {
		return sceneLabel(this.key);
	}
	// Every so often a floor of the numbered dungeon is a maze: one with no
	// map of its own that's neither the top floor nor the bottom one,
	// maze.chance percent of the time, the same floors for the same seed.
	isMazeFloor() {
		const n = this.number,
			chance = this.mazeSettings.chance;
		if (n == null || n <= 1 || n >= this.game.sceneCount || !(chance > 0)) return false;
		return seedNumber(`${this.game.seed}/maze/${n}`) % 100 < chance;
	}

	// Outdoors the sun is out, so the hero sees without a torch and torches
	// don't burn. daylight: true or false in the scene overrides that.
	get daylight() {
		return this.opts.daylight != null ? !!this.opts.daylight : this.type === "overworld";
	}
	// Turns the sun on or off: game.currentScene.daylight = false brings on
	// the night, with the hero's sight cut to `dark` squares and lights lit.
	set daylight(on) {
		this.opts.daylight = !!on;
		if (this.game.currentScene === this) this.game.updateVision();
	}
	// How far the hero sees here with no light on: the scene's `dark`, or the game's.
	get darkSight() {
		return this.opts.dark != null ? this.opts.dark : this.game.config.dark;
	}

	inBounds(x, y) {
		return x >= 0 && y >= 0 && x < this.width && y < this.height;
	}
	tileAt(x, y) {
		return this.inBounds(x, y) ? this.tiles[x][y] : "wall";
	}
	setTile(x, y, name) {
		if (!this.inBounds(x, y)) return;
		this.tiles[x][y] = name;
		this.litCache = null; // a light may have come or gone, see litSquares()
	}
	// A square of the map, as { x, y, scene, flags }. `flags` is a notepad
	// for that one square, the way game.flags is for the whole game: what a
	// bookshelf has hidden on it (squareAt(x, y).flags.holds = "potion"), or
	// which key a locked door wants (flags.key). The same square gives the
	// same object every time, and its flags stay when its tile changes.
	squareAt(x, y) {
		const k = cellKey(x, y);
		let square = this.squares.get(k);
		if (!square) {
			square = { x, y, scene: this, flags: {} };
			this.squares.set(k, square);
		}
		return square;
	}
	flagsAt(x, y) {
		return this.squareAt(x, y).flags;
	}
	// Every square that is one of these tiles, in reading order (left to
	// right, top to bottom), as squareAt gives them: tilesNamed("lamp", "lampOn").
	tilesNamed(...names) {
		const found = [];
		for (let y = 0; y < this.height; y++)
			for (let x = 0; x < this.width; x++) if (names.includes(this.tiles[x][y])) found.push(this.squareAt(x, y));
		return found;
	}
	tileInfo(x, y) {
		return this.game.tiles[this.tileAt(x, y)] || this.game.tiles.wall;
	}
	isWalkable(x, y) {
		return this.inBounds(x, y) && !!this.tileInfo(x, y).walkable;
	}
	isSeeThrough(x, y) {
		return this.inBounds(x, y) && !!this.tileInfo(x, y).seeThrough;
	}
	// Can the hero get through, opening what opens (a shut door) on the way?
	isPassable(x, y) {
		if (!this.inBounds(x, y)) return false;
		const info = this.tileInfo(x, y);
		return !!(info.walkable || info.opens);
	}
	// A door of any kind: shut, open, locked or secret.
	isDoor(x, y) {
		return this.inBounds(x, y) && !!this.tileInfo(x, y).door;
	}
	// Plain ground: where enemies, items and the stairs can go. Floor
	// indoors, grass outdoors, or any tile of yours with ground: true.
	isGround(x, y) {
		return this.inBounds(x, y) && !!this.tileInfo(x, y).ground;
	}
	creatureAt(x, y) {
		return this.creatures.find((c) => c.x === x && c.y === y && !c.dead) || null;
	}
	itemAt(x, y) {
		return this.items.find((it) => it.x === x && it.y === y) || null;
	}
	isFree(x, y) {
		return this.isWalkable(x, y) && !this.creatureAt(x, y);
	}
	// The squares lit by the tiles that give light (a campfire with light: 5):
	// "x,y" -> how well, 1 on the tile itself down to 0 at the edge of its
	// reach, wherever the tile can be seen from. Kept until a tile changes.
	litSquares() {
		if (!this.litCache) {
			const levels = new Map(),
				glows = new Map(),
				fx = []; // { x, y, name } for every tile that plays an fx (a campfire's sparks)
			for (let x = 0; x < this.width; x++) {
				for (let y = 0; y < this.height; y++) {
					const t = this.game.tiles[this.tiles[x][y]];
					if (!t || (!(t.light > 0) && !t.fx)) continue;
					if (t.fx) fx.push({ x, y, name: t.fx });
					if (!(t.light > 0)) continue;
					const radius = t.light;
					const edge = (Number.isInteger(radius) ? radius + 0.5 : radius) ** 2;
					this.computeFov(x, y, Math.ceil(radius), (sx, sy) => {
						const d2 = (sx - x) ** 2 + (sy - y) ** 2;
						if (d2 > edge) return;
						const k = cellKey(sx, sy);
						const level = Math.max(0, 1 - Math.sqrt(d2) / Math.max(1, radius));
						if (level < (levels.get(k) ?? -1)) return; // another light does better here
						levels.set(k, level);
						if (t.glow) glows.set(k, t.glow);
					});
				}
			}
			this.litCache = { levels, glows, fx };
		}
		return this.litCache.levels;
	}
	// Every tile in the scene with an `fx` (a campfire's sparks): { x, y, name }.
	tileFx() {
		this.litSquares();
		return this.litCache.fx;
	}
	// The glow color over a lit square ("x,y"), if the light that reaches it has one.
	glowAt(k) {
		this.litSquares();
		return this.litCache.glows.get(k);
	}
	hasGlow() {
		this.litSquares();
		return this.litCache.glows.size > 0;
	}

	// A tile next to a creature, for an npc with beside: "campfire": on a
	// free ground square touching it, never where the hero arrives or the way down.
	putBeside(c, name) {
		if (!this.game.tiles[name]) {
			throw new Error(
				`Zot: the ${c.kind} ${c.friendly ? "npc" : "enemy"} has beside: "${name}", but there is no tile called "${name}". Make one with game.tile("${name}", {...}).`,
			);
		}
		const spot = shuffle(AROUND.slice())
			.map(([dx, dy]) => ({ x: c.x + dx, y: c.y + dy }))
			.find(
				(s) =>
					this.isGround(s.x, s.y) &&
					!this.creatureAt(s.x, s.y) &&
					!this.itemAt(s.x, s.y) &&
					distance(s, this.up) > 0 &&
					distance(s, this.down) > 0,
			);
		if (spot) this.setTile(spot.x, spot.y, name);
	}

	// Field of view from (x, y). Standing in a doorway, you can see both ways.
	computeFov(x, y, radius, callback) {
		this.fovOrigin = { x, y };
		this.fov.compute(x, y, radius, callback);
		this.fovOrigin = null;
	}

	generate() {
		const { width, height } = this;
		for (let x = 0; x < width; x++) this.tiles.push(new Array(height).fill("wall"));
		const type = this.type;
		let spots = [];
		if (type === "drawn") {
			this.readDrawing();
		} else if (type === "overworld") {
			// Open grass with clumps of trees: the same cellular automaton as
			// a cave, but started mostly alive and run for fewer steps.
			const m = new ROT.Map.Cellular(width, height);
			m.randomize(0.68);
			for (let i = 0; i < 2; i++) m.create();
			m.connect((x, y, alive) => {
				this.tiles[x][y] = alive ? "grass" : "tree";
			}, 1);
			this.border("tree");
		} else if (type === "cave") {
			const m = new ROT.Map.Cellular(width, height);
			m.randomize(0.5);
			for (let i = 0; i < 4; i++) m.create();
			m.connect((x, y, alive) => {
				this.tiles[x][y] = alive ? "floor" : "wall";
			}, 1);
			this.border("wall");
		} else if (type === "maze") {
			spots = this.digMaze();
		} else {
			// Roomier than rot.js's defaults ([3,9] by [3,5]).
			const size = { roomWidth: [5, 13], roomHeight: [4, 8] };
			const m =
				type === "rooms"
					? new ROT.Map.Uniform(width, height, { ...size, roomDugPercentage: 0.25 })
					: new ROT.Map.Digger(width, height, { ...size, dugPercentage: 0.3 });
			m.create((x, y, wall) => {
				this.tiles[x][y] = wall ? "wall" : "floor";
			});
			this.rooms = m.getRooms();
			for (const room of this.rooms) {
				room.getDoors((x, y) => {
					this.tiles[x][y] = "door";
				});
				const [cx, cy] = room.getCenter();
				spots.push({ x: cx, y: cy });
			}
		}
		if (type !== "drawn") {
			spots = spots.filter((s) => this.isGround(s.x, s.y));
			if (spots.length < 2) {
				for (let i = 0; i < 40; i++) {
					const c = this.randomFreeCell();
					if (c) spots.push(c);
				}
			}
			const start = pick(spots);
			let end = start;
			if (type === "overworld") {
				// Outdoors the way down is a short walk off, not across the whole map.
				const want = Math.max(10, Math.min(25, Math.round(Math.max(width, height) / 4)));
				const off = (s) => Math.abs(distance(s, start) - want);
				for (const s of spots) if (off(s) < off(end) || end === start) end = s;
			} else if (type === "maze") {
				// In a maze the far end is the longest walk from the start, not the longest line.
				const steps = this.stepsFrom(start.x, start.y);
				const walk = (s) => steps.get(cellKey(s.x, s.y)) || 0;
				for (const s of spots) if (walk(s) > walk(end)) end = s;
			} else {
				for (const s of spots) if (distance(s, start) > distance(end, start)) end = s;
			}
			this.up = { x: start.x, y: start.y };
			this.down = { x: end.x, y: end.y };
		}
		this.makeExits();
		if (type === "overworld" && this.opts.water !== false) this.makeLakes();
		if (this.opts.vault) this.makeVault(this.opts.vault);
		this.placeOtherExits(); // last, so none ends up in a pond or behind the vault's door
	}

	// A maze (map: "maze"): passages one square wide between walls one square
	// thick, with a few small rooms let into it: the one the hero arrives in,
	// the one the way down is in (the longest walk from the first) and the
	// scene's `rooms` more (else the game's maze.rooms), each with something
	// in it, see populate. The rooms go in first, 3 to 5 squares a side with
	// a passage's width between them; then a recursive backtracker digs the
	// passages through the odd squares around them, which makes long winding
	// ways with few branches; each room gets one door onto them; and lastly
	// a few walls are knocked through so there's more than one way round.
	// Returns the middle of each room: the spots the stairs choose from.
	digMaze() {
		const cols = Math.floor((this.width - 1) / 2),
			rows = Math.floor((this.height - 1) / 2); // cell (i, j) is the square (2i + 1, 2j + 1)
		const inGrid = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows;
		const dig = (x, y) => (this.tiles[x][y] = "floor");
		this.rooms = [];
		if (cols < 1 || rows < 1) return [];
		const want = this.opts.rooms != null ? this.opts.rooms : this.mazeSettings.rooms;
		const [least, most] = Array.isArray(want) ? want : [want, want];
		const inRoom = new Set(), // "i,j" of the cells inside a room
			taken = new Set(); // ... and the ring of cells around each, kept for passages
		for (let tries = 0; tries < 200 && this.rooms.length < 2 + random(least, most); tries++) {
			const w = random(2, 3),
				h = random(2, 3);
			if (w > cols || h > rows) continue;
			const i = random(0, cols - w),
				j = random(0, rows - h);
			let clear = true;
			for (let a = i; a < i + w && clear; a++)
				for (let b = j; b < j + h && clear; b++) if (taken.has(cellKey(a, b))) clear = false;
			if (!clear) continue;
			for (let a = i - 1; a <= i + w; a++) for (let b = j - 1; b <= j + h; b++) taken.add(cellKey(a, b));
			for (let a = i; a < i + w; a++) for (let b = j; b < j + h; b++) inRoom.add(cellKey(a, b));
			const room = new MazeRoom(2 * i + 1, 2 * j + 1, 2 * (i + w - 1) + 1, 2 * (j + h - 1) + 1);
			for (let x = room.x1; x <= room.x2; x++) for (let y = room.y1; y <= room.y2; y++) dig(x, y);
			this.rooms.push(room);
		}
		// The passages: from a random cell, keep going to an unvisited
		// neighbor, and back up when there's none. The rooms are kept apart,
		// so the cells left over are all joined up and one walk takes them all.
		const seen = new Set(inRoom);
		const cells = [];
		for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (!inRoom.has(cellKey(i, j))) cells.push([i, j]);
		for (const first of shuffle(cells)) {
			if (seen.has(cellKey(...first))) continue;
			seen.add(cellKey(...first));
			dig(2 * first[0] + 1, 2 * first[1] + 1);
			const stack = [first];
			while (stack.length) {
				const [i, j] = stack[stack.length - 1];
				const next = shuffle(SIDES)
					.map(([di, dj]) => [i + di, j + dj])
					.find(([a, b]) => inGrid(a, b) && !seen.has(cellKey(a, b)));
				if (!next) {
					stack.pop();
					continue;
				}
				seen.add(cellKey(...next));
				dig(i + next[0] + 1, j + next[1] + 1); // the wall between the two
				dig(2 * next[0] + 1, 2 * next[1] + 1);
				stack.push(next);
			}
		}
		// One door into each room, on any side that has a passage behind it.
		for (const room of this.rooms) {
			const walls = [];
			for (let x = room.x1; x <= room.x2; x += 2) {
				for (let y = room.y1; y <= room.y2; y += 2) {
					for (const [dx, dy] of SIDES) {
						const i = (x + 2 * dx - 1) / 2,
							j = (y + 2 * dy - 1) / 2; // the cell past this wall
						if (inGrid(i, j) && !inRoom.has(cellKey(i, j))) walls.push([x + dx, y + dy]);
					}
				}
			}
			if (!walls.length) continue;
			const [x, y] = pick(walls);
			this.setTile(x, y, "door");
			room.addDoor(x, y);
		}
		// A few loops: walls between two passages, one for every 25 cells or so.
		const closed = [];
		for (const [i, j] of cells) {
			for (const [di, dj] of [
				[1, 0],
				[0, 1],
			]) {
				const a = i + di,
					b = j + dj;
				if (inGrid(a, b) && !inRoom.has(cellKey(a, b)) && this.tiles[i + a + 1][j + b + 1] === "wall")
					closed.push([i + a + 1, j + b + 1]);
			}
		}
		for (const [x, y] of shuffle(closed).slice(0, Math.round((cols * rows) / 25))) dig(x, y);
		return this.rooms.map((room) => {
			const [x, y] = room.getCenter();
			return { x, y };
		});
	}

	// How many steps it takes to walk from (x, y) to every square the hero
	// can get to, opening doors on the way: "x,y" -> steps.
	stepsFrom(x, y) {
		const steps = new Map([[cellKey(x, y), 0]]),
			queue = [[x, y]];
		for (let i = 0; i < queue.length; i++) {
			const [cx, cy] = queue[i],
				d = steps.get(cellKey(cx, cy)) + 1;
			for (const [dx, dy] of this.game.directions) {
				const nx = cx + dx,
					ny = cy + dy,
					k = cellKey(nx, ny);
				if (steps.has(k) || !this.isPassable(nx, ny)) continue;
				steps.set(k, d);
				queue.push([nx, ny]);
			}
		}
		return steps;
	}

	// The ways out of here and where they lead (see Game.exitsOf): the stairs
	// are the exits called "up" and "down", and the scene's `exits` can add
	// any others. Each gets a square: the one a drawn map gives it, the
	// stairs' own spots, or (for the rest) somewhere free, in placeOtherExits.
	makeExits() {
		const drawn = this.drawnExits || {};
		const defs = this.game.exitsOf(this.key);
		this.pendingExits = [];
		for (const name in defs) {
			const exit = Object.assign({ name }, defs[name]);
			const spot = drawn[name] || (name === "up" ? this.up : name === "down" ? this.down : null);
			if (spot) this.placeExit(exit, spot.x, spot.y, !drawn[name]);
			else this.pendingExits.push(exit);
		}
		// A < or > drawn with nothing in `exits` for it is just floor, so the picture can keep them.
		if (!this.exits.up) this.replaceTile("stairsUp", "floor");
		if (!this.exits.down) this.replaceTile("stairsDown", "floor");
	}
	placeExit(exit, x, y, setTile) {
		exit.x = x;
		exit.y = y;
		const mark = exit.name === "up" ? "stairsUp" : exit.name === "down" ? "stairsDown" : "portal";
		if (setTile) this.setTile(x, y, exit.tile || mark);
		this.exits[exit.name] = exit;
	}
	// An exit with no square yet goes on free ground the hero can walk to,
	// a little way from where the hero arrives and from the other exits.
	placeOtherExits() {
		if (!this.pendingExits.length) return;
		const reach = this.reachableFrom(this.up.x, this.up.y);
		const taken = (c) => this.exitAt(c.x, c.y) || distance(c, this.down) < 2;
		// One the hero can't stand on (a building) wants clear ground below
		// it to arrive on, and must not block the only way past.
		const fronted = (exit, c) =>
			!this.solidExit(exit) ||
			(this.isGround(c.x, c.y + 1) && !this.exitAt(c.x, c.y + 1) && !this.cutsOff(c.x, c.y, exit.tile, reach));
		for (const exit of this.pendingExits) {
			let cell = null;
			for (let tries = 0; tries < 400 && !cell; tries++) {
				const c = this.randomFreeCell({ awayFrom: this.up, minDistance: 6 });
				if (c && reach.has(cellKey(c.x, c.y)) && !taken(c) && (tries < 200 ? fronted(exit, c) : true)) cell = c;
			}
			this.placeExit(exit, ...(cell ? [cell.x, cell.y] : [this.up.x, this.up.y]), true);
		}
		this.pendingExits = [];
	}
	// Whether an exit's square can't be stood on: its tile is solid, so it
	// is taken by walking into it, like the door of a building.
	solidExit(exit) {
		const tile = exit.tile != null ? this.game.tiles[exit.tile] : exit.x != null ? this.tileInfo(exit.x, exit.y) : null;
		return !!tile && !tile.walkable;
	}
	// Where the hero arrives at an exit: on it, or when it can't be stood
	// on, in front of it (below), else the first free square around it, else on it.
	landing(exit) {
		if (!this.solidExit(exit)) return exit;
		for (const [dx, dy] of [[0, 1]].concat(AROUND)) {
			const x = exit.x + dx,
				y = exit.y + dy;
			if (this.isFree(x, y) && !this.exitAt(x, y)) return { x, y };
		}
		return exit;
	}
	// Would putting `tile` on (x, y) cut the hero off from squares they can
	// reach now (`reach`, from reachableFrom)?
	cutsOff(x, y, tile, reach) {
		const was = this.tileAt(x, y);
		this.setTile(x, y, tile);
		const still = this.reachableFrom(this.up.x, this.up.y).size;
		this.setTile(x, y, was);
		return still !== reach.size - 1;
	}
	// The exit on (x, y), if there is one.
	exitAt(x, y) {
		for (const name in this.exits) {
			const e = this.exits[name];
			if (e.x === x && e.y === y) return e;
		}
		return null;
	}

	// A scene drawn by hand: one string per row, one letter per square.
	//   game.scene("mine", { map: ["#####", "#<.>#", "#####"] })
	// The built-in letters are in DRAWN; the scene's `legend` adds more
	// (or changes those): a tile by name, or an enemy, npc or item, which
	// stands on a floor square (or the scene's `ground` tile, for a sandy
	// beach), or { tile, key } for a locked door, { tile, exit } for the
	// square of one of the scene's `exits`, { tile, on } for a thing
	// standing on a tile of your choosing ({ tile: "grass", on: "gull" }),
	// and { tile, flags } for the square's flags ({ tile: "bookshelf",
	// flags: { holds: "potion" } }; see squareAt). A key is flags.key.
	// `@` is where the hero arrives (the `<` if there's no `@`); `>` is the
	// way down. A chest's contents come from the scene's `chests` list, in
	// reading order, or are random.
	readDrawing() {
		const game = this.game,
			lines = this.drawing,
			legend = Object.assign({}, DRAWN, this.opts.legend || {});
		const where = `${this.label}'s map`;
		const standOn = this.opts.ground || "floor"; // what a drawn thing (and the hero) stands on
		if (!game.tiles[standOn])
			throw new Error(
				`Zot: ${this.label} has ground: ${JSON.stringify(this.opts.ground)}, but there is no tile called "${standOn}". ground is the tile the things drawn on the map stand on, like ground: "sand".`,
			);
		this.placed = []; // { kind, name, x, y } for enemies, npcs and items drawn on the map
		this.drawnChests = []; // { x, y } of every "=", in reading order
		this.drawnExits = {}; // exit name -> { x, y }: the first "<" is "up", the first ">" is "down", and a legend entry can say exit: "name"
		let at = null,
			down = null;
		const place = (name, x, y) => {
			const kind = game.defs.npc[name] || game.defs.enemy[name] ? "creature" : game.defs.item[name] ? "item" : null;
			if (kind) this.placed.push({ kind, name, x, y });
			return !!kind;
		};
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				const ch = lines[y][x] === undefined ? " " : lines[y][x];
				if (ch === "@") {
					at = { x, y };
					this.tiles[x][y] = standOn;
					continue;
				}
				let what = legend[ch];
				if (what === undefined) {
					throw new Error(
						`Zot: ${where} has a ${JSON.stringify(ch)} on row ${y + 1} that isn't in the legend. Add legend: { ${JSON.stringify(ch)}: "goblin" } (a tile, enemy, npc or item) to the scene.`,
					);
				}
				let key = null,
					exitName = null,
					on = null,
					flags = null;
				if (what && typeof what === "object" && !Array.isArray(what)) {
					key = what.key || null;
					exitName = what.exit || null;
					on = what.on || null;
					flags = what.flags || null;
					what = what.tile;
				}
				if (typeof what !== "string") {
					throw new Error(
						`Zot: ${where} has legend: { "${ch}": ${JSON.stringify(legend[ch])} }. Write a name: a tile ("lockedDoor"), an enemy, an npc or an item.`,
					);
				}
				if (game.tiles[what]) {
					this.tiles[x][y] = what;
					if (what === "stairsUp") {
						exitName = exitName || "up";
						if (!at) at = { x, y };
					}
					if (what === "stairsDown") {
						exitName = exitName || "down";
						if (!down) down = { x, y };
					}
					if (exitName && !this.drawnExits[exitName]) this.drawnExits[exitName] = { x, y };
					if (what === "chest") this.drawnChests.push({ x, y });
					if (flags) Object.assign(this.flagsAt(x, y), flags);
					if (key) this.flagsAt(x, y).key = key;
					if (on && !place(on, x, y)) {
						throw new Error(
							`Zot: ${where} has legend: { "${ch}": { tile: "${what}", on: ${JSON.stringify(on)} } }, but there is no enemy, npc or item called "${on}" to stand on it.`,
						);
					}
				} else if (place(what, x, y)) {
					this.tiles[x][y] = standOn;
				} else {
					throw new Error(
						`Zot: ${where} has legend: { "${ch}": "${what}" }, but there is no tile, enemy, npc or item called "${what}".`,
					);
				}
			}
		}
		const ground = [];
		for (let x = 0; x < this.width; x++)
			for (let y = 0; y < this.height; y++) if (this.isGround(x, y)) ground.push({ x, y });
		if (!at && !ground.length) throw new Error(`Zot: ${where} has no floor squares (".") to stand on.`);
		if (!at)
			at = down ? ground.reduce((best, s) => (distance(s, down) > distance(best, down) ? s : best)) : pick(ground);
		if (!down)
			down = ground.length ? ground.reduce((best, s) => (distance(s, at) > distance(best, at) ? s : best)) : at;
		this.up = at;
		this.down = down;
	}
	replaceTile(from, to) {
		for (let x = 0; x < this.width; x++)
			for (let y = 0; y < this.height; y++) if (this.tiles[x][y] === from) this.tiles[x][y] = to;
	}

	// A ring of `name` around the edge of the map.
	border(name) {
		for (let x = 0; x < this.width; x++) {
			this.tiles[x][0] = name;
			this.tiles[x][this.height - 1] = name;
		}
		for (let y = 0; y < this.height; y++) {
			this.tiles[0][y] = name;
			this.tiles[this.width - 1][y] = name;
		}
	}

	// Ponds on an overworld: a sparse cellular map laid over the grass.
	// Any pond that would cut the hero off from the stairs is filled back in.
	makeLakes() {
		const m = new ROT.Map.Cellular(this.width, this.height);
		m.randomize(0.32);
		for (let i = 0; i < 2; i++) m.create();
		const changed = [];
		const nearStairs = (x, y) => distance({ x, y }, this.up) <= 1 || distance({ x, y }, this.down) <= 1;
		m.create((x, y, alive) => {
			if (alive && this.tileAt(x, y) === "grass" && !nearStairs(x, y)) {
				this.tiles[x][y] = "water";
				changed.push([x, y]);
			}
		});
		const reach = this.reachableFrom(this.up.x, this.up.y);
		if (reach.has(cellKey(this.down.x, this.down.y))) {
			// Fill in any pond the hero can't walk around to, so nothing spawns on an island.
			for (let x = 0; x < this.width; x++)
				for (let y = 0; y < this.height; y++)
					if (this.tiles[x][y] === "grass" && !reach.has(cellKey(x, y))) this.tiles[x][y] = "tree";
			return;
		}
		for (const [x, y] of changed) this.tiles[x][y] = "grass";
	}

	// A vault is a room with one locked door. The key is dropped somewhere
	// the hero can reach, and the treasure (and any guards) wait inside.
	// Rooms with several doors get all but one bricked up, so one key is
	// always enough to get in.
	//   game.scene(2, { vault: { key: "iron_key", treasure: ["sword"], guards: ["ogre"] } })
	makeVault(vault) {
		if (typeof vault === "string") vault = { key: vault };
		const game = this.game;
		const key = vault.key || "key";
		if (!this.rooms || !this.rooms.length) {
			console.warn(
				`Zot: ${this.label} has no rooms, so it can't have a vault. Caves don't have rooms; use map: "dungeon", "rooms" or "maze".`,
			);
			return;
		}
		const inRoom = (room, p) =>
			p.x >= room.getLeft() && p.x <= room.getRight() && p.y >= room.getTop() && p.y <= room.getBottom();
		const doorsOf = (room) => {
			const d = [];
			room.getDoors((x, y) => d.push([x, y]));
			return d;
		};
		// Any room except the ones with the stairs in them. Rooms with a single
		// door first, so we brick up as few doors as possible.
		const candidates = shuffle(
			this.rooms.filter((room) => !inRoom(room, this.up) && !inRoom(room, this.down) && doorsOf(room).length > 0),
		).sort((a, b) => doorsOf(a).length - doorsOf(b).length);
		// Locking the room must leave the stairs and every other room reachable.
		const stillConnected = (room) => {
			const outside = this.reachableFrom(this.up.x, this.up.y);
			if (!outside.has(cellKey(this.down.x, this.down.y))) return null;
			for (const other of this.rooms) {
				if (other === room) continue;
				const [cx, cy] = other.getCenter();
				if (this.isWalkable(cx, cy) && !outside.has(cellKey(cx, cy))) return null;
			}
			return outside;
		};
		for (const room of candidates) {
			const doors = shuffle(doorsOf(room));
			let outside = null,
				entrance = null;
			// Try each door as the one entrance; the rest become wall.
			for (const door of doors) {
				for (const [x, y] of doors) this.setTile(x, y, x === door[0] && y === door[1] ? "lockedDoor" : "wall");
				outside = stillConnected(room);
				if (outside) {
					entrance = door;
					break;
				}
			}
			if (!entrance) {
				// Every choice cut something off. Undo and try another room.
				for (const [x, y] of doors) this.setTile(x, y, "door");
				continue;
			}
			this.flagsAt(entrance[0], entrance[1]).key = key;
			// The key goes somewhere the hero can walk to without it.
			const spots = [];
			for (const k of outside) {
				const [x, y] = k.split(",").map(Number);
				if (this.isGround(x, y) && !this.itemAt(x, y) && !inRoom(room, { x, y }) && distance({ x, y }, this.up) > 3)
					spots.push({ x, y });
			}
			const keySpot = spots.length ? pick(spots) : this.randomFreeCell();
			if (keySpot) this.drop(key, keySpot.x, keySpot.y);
			for (const name of asList(vault.treasure)) {
				const cell = this.randomCellInRoom(room);
				if (cell) this.drop(name, cell.x, cell.y);
			}
			for (const name of asList(vault.guards)) {
				const cell = this.randomCellInRoom(room);
				if (cell) this.spawn(name, cell.x, cell.y);
			}
			this.vault = { room, key, doors: [entrance] };
			return;
		}
		console.warn(`Zot: couldn't find a room to lock in ${this.label}, so there is no vault.`);
	}

	// A free cell inside a room. { clearDoors: true } also keeps it out of doorways.
	randomCellInRoom(room, opts = {}) {
		for (let tries = 0; tries < 100; tries++) {
			const x = random(room.getLeft(), room.getRight()),
				y = random(room.getTop(), room.getBottom());
			if (!this.isGround(x, y) || this.creatureAt(x, y) || this.itemAt(x, y)) continue;
			if (opts.clearDoors && this.game.directions.some(([dx, dy]) => this.isDoor(x + dx, y + dy))) continue;
			return { x, y };
		}
		return null;
	}

	// The room (x, y) is inside, or null in a corridor, cave or outdoors.
	roomAt(x, y) {
		return (
			(this.rooms || []).find(
				(room) => x >= room.getLeft() && x <= room.getRight() && y >= room.getTop() && y <= room.getBottom(),
			) || null
		);
	}

	// Somewhere in a room for friendly folk to stand: the hero's arrival
	// room if it has space, else the nearest room that does, never in a
	// corridor or blocking a door. Falls back to any free cell on maps
	// without rooms.
	npcCell() {
		if (this.rooms && this.rooms.length) {
			const rooms = this.rooms.slice().sort((a, b) => {
				const [ax, ay] = a.getCenter(),
					[bx, by] = b.getCenter();
				return distance({ x: ax, y: ay }, this.up) - distance({ x: bx, y: by }, this.up);
			});
			const home = this.roomAt(this.up.x, this.up.y);
			if (home) rooms.unshift(home);
			for (const room of rooms) {
				const cell = this.randomCellInRoom(room, { clearDoors: true });
				if (cell) return cell;
			}
		}
		return this.randomFreeCell({ near: this.up, maxDistance: 5 });
	}

	// Every "x,y" the hero can get to from (x, y), opening doors on the
	// way but not locked ones.
	reachableFrom(x, y) {
		const seen = new Set([cellKey(x, y)]),
			queue = [[x, y]];
		while (queue.length) {
			const [cx, cy] = queue.pop();
			for (const [dx, dy] of this.game.directions) {
				const nx = cx + dx,
					ny = cy + dy,
					k = cellKey(nx, ny);
				if (seen.has(k) || !this.isPassable(nx, ny)) continue;
				seen.add(k);
				queue.push([nx, ny]);
			}
		}
		return seen;
	}

	// A random floor cell with nothing on it. Options: { awayFrom, minDistance, near, maxDistance }
	randomFreeCell(opts = {}) {
		for (let tries = 0; tries < 400; tries++) {
			const x = random(1, this.width - 2),
				y = random(1, this.height - 2);
			if (!this.isGround(x, y) || this.creatureAt(x, y) || this.itemAt(x, y)) continue;
			if (opts.awayFrom && distance({ x, y }, opts.awayFrom) < (opts.minDistance || 6)) continue;
			if (opts.near && distance({ x, y }, opts.near) > (opts.maxDistance || 4)) continue;
			return { x, y };
		}
		if (opts.near || opts.awayFrom) return this.randomFreeCell();
		return null;
	}

	populate() {
		const game = this.game,
			cfg = game.config,
			n = this.level,
			opts = this.opts;
		// What a drawn map put where (see readDrawing), before anything random.
		for (const p of this.placed || []) {
			if (p.kind === "item") this.drop(p.name, p.x, p.y);
			else this.spawn(p.name, p.x, p.y);
		}
		let enemyCount = valueOf(opts.enemies != null ? opts.enemies : cfg.enemiesPerScene, n);
		const enemyPool = game.pool("enemy", this);
		// A maze's side rooms (see digMaze) each hold a monster, a chest or
		// both, the monster out of the scene's count; the chests come below.
		const roomChests = [];
		if (this.type === "maze") {
			const start = this.roomAt(this.up.x, this.up.y),
				end = this.roomAt(this.down.x, this.down.y),
				vault = this.vault && this.vault.room;
			for (const room of this.rooms.filter((r) => r !== start && r !== end && r !== vault)) {
				const roll = random(1, 3); // 1: a monster, 2: a chest, 3: both
				const cell = roll !== 2 && enemyCount > 0 && Object.keys(enemyPool).length ? this.randomCellInRoom(room) : null;
				if (cell) {
					this.spawn(ROT.RNG.getWeightedValue(enemyPool), cell.x, cell.y);
					enemyCount--;
				}
				if (roll !== 1 || !cell) roomChests.push(room);
			}
			// The end room has the way down or the boss in it, or else a chest.
			if (end && !this.exits.down && !asList(opts.boss).length) roomChests.push(end);
		}
		for (let i = 0; i < enemyCount && Object.keys(enemyPool).length; i++) {
			const cell = this.randomFreeCell({ awayFrom: this.up, minDistance: 8 });
			if (cell) this.spawn(ROT.RNG.getWeightedValue(enemyPool), cell.x, cell.y);
		}
		for (const name of asList(opts.boss)) {
			const cell = this.randomFreeCell({ near: this.down, maxDistance: 4 });
			if (cell) this.spawn(name, cell.x, cell.y);
		}
		// Friendly folk stand in the room where the hero arrives, never in
		// a corridor or a doorway.
		for (const name of asList(opts.npcs)) {
			const cell = this.npcCell();
			if (cell) this.spawn(name, cell.x, cell.y);
		}
		const itemCount = valueOf(opts.items != null ? opts.items : cfg.itemsPerScene, n);
		const itemPool = game.pool("item", this);
		// Chests first: a random one holds 1 to 3 of the scene's items, taken
		// out of the count, so the more chests there are the less lies about.
		// A list says what's in each chest instead, on top of the count.
		// Outdoors there are none, unless the scene asks for them itself; on
		// a drawn map, the "=" squares are the chests, and in a maze they are
		// the rooms' (see above); a number asks for more random ones on top.
		const chests =
			opts.chests != null
				? opts.chests
				: this.type === "overworld" || this.type === "maze" || this.drawing
					? 0
					: cfg.chestsPerScene;
		const given = Array.isArray(chests) ? chests : null;
		let loose = itemCount;
		const randomContents = (atLeastOne) => {
			const contents = [];
			if (!Object.keys(itemPool).length) return contents;
			const take = Math.min(random(1, 3), Math.max(loose, atLeastOne ? 1 : 0)); // never more than the scene has
			for (let j = 0; j < take; j++) contents.push(game.findOf(ROT.RNG.getWeightedValue(itemPool), this));
			loose = Math.max(0, loose - take);
			return contents;
		};
		// The chests drawn on the map: the `chests` list fills them in reading
		// order; the rest get something random (one thing at least).
		const drawn = this.drawnChests || [];
		drawn.forEach((cell, i) =>
			this.addChest(cell.x, cell.y, given && i < given.length ? asList(given[i]) : randomContents(true)),
		);
		// Never on the way up or down: another square of the room if it lands there.
		const offStairs = (c) => c && distance(c, this.up) > 0 && distance(c, this.down) > 0;
		for (const room of roomChests) {
			if (!Object.keys(itemPool).length) break;
			let cell = null;
			for (let tries = 0; tries < 20 && !offStairs(cell); tries++)
				cell = this.randomCellInRoom(room, { clearDoors: true }) || this.randomCellInRoom(room);
			if (offStairs(cell)) this.addChest(cell.x, cell.y, randomContents(true));
		}
		const chestCount = given ? given.length - drawn.length : valueOf(chests, n);
		if (chestCount > 0 && (given || (loose > 0 && Object.keys(itemPool).length))) {
			// Every square the hero can walk to. Each chest takes one away, and
			// must take only that one (see chestCell).
			const reach = this.reachableFrom(this.up.x, this.up.y);
			for (let i = 0; i < chestCount && (given || loose > 0); i++) {
				const cell = this.chestCell(reach);
				if (!cell) break;
				this.addChest(cell.x, cell.y, given ? asList(given[drawn.length + i]) : randomContents(false));
				reach.delete(cellKey(cell.x, cell.y));
			}
		}
		for (let i = 0; i < loose && Object.keys(itemPool).length; i++) {
			const cell = this.randomFreeCell();
			if (cell) this.drop(game.findOf(ROT.RNG.getWeightedValue(itemPool), this), cell.x, cell.y);
		}
		for (const name of asList(opts.treasure)) {
			const cell = this.randomFreeCell({ near: this.down, maxDistance: 4 });
			if (cell) this.drop(name, cell.x, cell.y);
		}
	}

	// Somewhere to put a chest: plain ground the hero can reach, inside a
	// room (in a cave, out in the open: most of the squares around it
	// walkable), not next to a door or the stairs, and not a square
	// everything squeezes through (blocking a corridor would cut off
	// whatever is past it). `reach` is every square the hero can walk to right now.
	chestCell(reach) {
		for (let tries = 0; tries < 60; tries++) {
			const cell = this.randomFreeCell();
			if (!cell) return null;
			const { x, y } = cell;
			if (!reach.has(cellKey(x, y)) || distance(cell, this.up) < 2 || distance(cell, this.down) < 2) continue;
			if (this.rooms) {
				if (!this.roomAt(x, y)) continue; // a corridor
			} else if (AROUND.filter(([dx, dy]) => this.isWalkable(x + dx, y + dy)).length < 6) continue;
			if (this.game.directions.some(([dx, dy]) => this.isDoor(x + dx, y + dy))) continue;
			if (!this.cutsOff(x, y, "chest", reach)) return cell;
		}
		return null;
	}
	// A closed chest at (x, y) with these items (names) inside.
	addChest(x, y, names) {
		this.setTile(x, y, "chest");
		this.chests[cellKey(x, y)] = names.slice();
	}

	addCreature(c, x, y) {
		c.scene = this;
		c.x = x;
		c.y = y;
		this.creatures.push(c);
		this.scheduler.add(c, true, c.isPlayer ? 0 : undefined);
	}
	removeCreature(c) {
		this.creatures = this.creatures.filter((k) => k !== c);
		this.scheduler.remove(c);
	}
	// Put an item on the floor at (x, y), or the nearest empty cell.
	placeItem(item, x, y) {
		for (let r = 0; r < 6; r++) {
			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
					const px = x + dx,
						py = y + dy;
					if (this.isGround(px, py) && !this.itemAt(px, py)) {
						item.x = px;
						item.y = py;
						item.scene = this;
						this.items.push(item);
						return true;
					}
				}
			}
		}
		return false;
	}
	removeItem(item) {
		this.items = this.items.filter((it) => it !== item);
	}
	// The living enemies here, and the friendly folk.
	get enemies() {
		return this.creatures.filter((c) => c.isEnemy && !c.dead);
	}
	get npcs() {
		return this.creatures.filter((c) => c.friendly && !c.dead);
	}

	// spawn("goblin") anywhere, or spawn("goblin", x, y): the nearest free
	// square if that one isn't. Works for npcs too. Returns the creature.
	spawn(name, x, y) {
		const game = this.game;
		const def = game.defs.npc[name] ? game.defs.npc[name] : game.lookup("enemy", name);
		const c = new Creature(game, def, false);
		if (x == null) {
			const cell = this.randomFreeCell({ awayFrom: game.player, minDistance: 3 });
			if (!cell) return null;
			x = cell.x;
			y = cell.y;
		} else if (!this.isFree(x, y)) {
			const cell = this.randomFreeCell({ near: { x, y }, maxDistance: 2 });
			if (!cell) return null;
			x = cell.x;
			y = cell.y;
		}
		this.addCreature(c, x, y);
		if (def.beside) this.putBeside(c, def.beside);
		game.callHook(c.hookName("onSpawn"), def.onSpawn, c);
		return c;
	}
	// drop("potion") anywhere, or drop("potion", x, y): on the floor there,
	// or the nearest empty square. Returns the item.
	drop(name, x, y) {
		const item = new Item(this.game, this.game.lookup("item", name));
		if (x == null) {
			const cell = this.randomFreeCell();
			if (!cell) return null;
			x = cell.x;
			y = cell.y;
		}
		this.placeItem(item, x, y);
		return item;
	}
	// chest(x, y, ["potion", "sword"]) puts a treasure chest there with
	// those items inside (one name on its own is fine). Walking into it opens it.
	chest(x, y, items) {
		const names = asList(items);
		for (const name of names) this.game.lookup("item", name); // complain now, not when it's opened
		if (!this.inBounds(x, y)) return false;
		this.addChest(x, y, names);
		return true;
	}

	// An fx (see FX) on a square from now on: addFx(x, y, "sparks"). It
	// plays whenever the square is in sight, and shows the next time the
	// map is drawn. removeFx(x, y, "sparks") stops it; removeFx(x, y) stops
	// every fx on the square.
	addFx(x, y, name) {
		this.game.fxNamed(name, "addFx");
		const k = cellKey(x, y);
		if (!this.fx.has(k)) this.fx.set(k, { x, y, names: new Set() });
		this.fx.get(k).names.add(name);
	}
	removeFx(x, y, name) {
		const k = cellKey(x, y),
			there = this.fx.get(k);
		if (!there) return;
		if (name == null) there.names.clear();
		else there.names.delete(name);
		if (!there.names.size) this.fx.delete(k);
	}
}

// ------------------------------------------------------------------
//  The standard screen
// ------------------------------------------------------------------
// Zot puts this inside the game's <div> when the page leaves it empty. The
// screen is plain HTML: Zot fills in every element that has an id (zot-hp-text,
// zot-gold, zot-inventory, ...) after each turn and leaves the rest alone. To
// change the screen, copy this into your page's <div id="game"> instead: move
// things around, change the words, add your own boxes, or delete the parts
// you don't want (a missing id is skipped). The colors and sizes are in zot.css.
export const SCREEN = `
  <aside class="zot-side">
    <button id="zot-sound" class="zot-sound" type="button" title="Sound on (M)">🔊</button>

    <div id="zot-title" class="zot-title"></div>
    <div class="zot-name"><span id="zot-name"></span> <span class="zot-level">Lv <span id="zot-level"></span></span></div>

    <div id="zot-hp" class="zot-bar zot-hp"><div id="zot-hp-fill" class="zot-bar-fill"></div><span id="zot-hp-text"></span></div>
    <div id="zot-mp" class="zot-bar zot-mp"><div id="zot-mp-fill" class="zot-bar-fill"></div><span id="zot-mp-text"></span></div>
    <div id="zot-xp" class="zot-bar zot-xp"><div id="zot-xp-fill" class="zot-bar-fill"></div><span id="zot-xp-text"></span></div>

    <div class="zot-stats">
      <span>Attack <b id="zot-attack"></b></span>
      <span>Defense <b id="zot-defense"></b></span>
      <span>Strength <b id="zot-strength"></b></span>  <!-- how much the hero can carry; a little extra on weapon hits -->
      <span>Weight <b id="zot-weight"></b></span>  <!-- what everything carried weighs / what the hero can carry -->
      <span>Gold <b id="zot-gold"></b></span>
    </div>

    <div id="zot-effects-box" hidden>
      <h3>Effects</h3>
      <ul id="zot-effects"></ul>  <!-- what the hero has on them (poisoned, burning), with the turns left -->
    </div>

    <div id="zot-skills-box">
      <h3>Skills</h3>
      <ul id="zot-skills"></ul>
    </div>

    <div id="zot-quests-box" hidden>
      <h3>Quests</h3>
      <ul id="zot-quests"></ul>  <!-- what the hero has been asked to do; j shows the details -->
    </div>

    <div id="zot-gear-box">
      <h3>Equipped</h3>
      <ul id="zot-gear"></ul>  <!-- one line per slot: weapon, armor, ring... -->
    </div>

    <h3>Inventory</h3>
    <ul id="zot-inventory"></ul>  <!-- what the hero carries and isn't wearing, each with its number -->

    <div id="zot-help" class="zot-help">
      <span><b>Move</b> arrows / WASD</span>
      <span><b>Wait</b> space</span>
      <span><b>Use</b> its number</span>
      <span><b>Items</b> i</span>
      <span><b>Drop</b> x</span>
      <span><b>Combine</b> c</span>
      <span><b>Shoot</b> f</span>
      <span><b>Throw</b> h</span>
      <span><b>Talk</b> walk into</span>
      <span><b>Down</b> walk onto &gt;</span>
      <span><b>Up</b> Enter on &lt;</span>
      <span><b>Look</b> l</span>
      <span><b>Quests</b> j</span>
      <span><b>Mute</b> m</span>
    </div>
  </aside>

  <div class="zot-main">
    <div id="zot-map" class="zot-map"></div>  <!-- the dungeon is drawn in here -->
    <div id="zot-log" class="zot-log"></div>  <!-- messages go in here -->
  </div>

  <!-- The pop-up: the item list, shops, and the win / game over screens -->
  <div id="zot-overlay" class="zot-overlay" hidden>
    <div class="zot-overlay-box">
      <h1 id="zot-overlay-title"></h1>
      <div id="zot-overlay-icon" class="zot-overlay-icon" hidden></div>
      <p id="zot-overlay-text"></p>
      <ul id="zot-overlay-list"></ul>
      <p id="zot-overlay-hint" class="zot-overlay-hint"></p>
    </div>
  </div>
`;

// ------------------------------------------------------------------
//  Game
// ------------------------------------------------------------------

class Game {
	constructor(config = {}) {
		this.config = Object.assign({}, DEFAULTS, config);
		this.config.levelUp = Object.assign({}, DEFAULTS.levelUp, config.levelUp || {});
		checkOptions("Game", "the game's settings", config);
		this.playerDef = Object.assign({}, PLAYER_DEFAULTS); // see game.hero()
		// Tiles: the built-in ones, changed or added to by config.tiles.
		this.tiles = {};
		const userTiles = config.tiles || {};
		for (const name of new Set([...Object.keys(TILES), ...Object.keys(userTiles)])) {
			this.tiles[name] = Object.assign({}, TILES[name] || TILE_DEFAULTS, userTiles[name] || {}, { id: name });
		}
		// Pictures or letters? tileset: true uses the built-in sheet; a table changes parts of it.
		this.tileset = null;
		if (this.config.tileset) {
			const user = this.config.tileset === true ? {} : this.config.tileset;
			this.tileset = Object.assign({}, TILESET, user, { map: Object.assign({}, TILESET.map, user.map || {}) });
			this.tileMap = {}; // "col,row" -> pixel position in the sheet, filled in as squares get drawn
			this.frame = 0; // which frame anything with `frames` is on
			this.animated = false; // did the last drawing have anything with `frames` in it?
			this.tilesReady = false;
		}
		this.flicker = 0; // goes up every `flicker` milliseconds: the glow of a campfire wavers with it
		this.glowing = false; // did the last drawing have a glow in it?
		this.lit = new Map(); // "x,y" -> how well a tile that gives light (a campfire) lights a square the hero sees, see updateVision()
		this.hits = []; // hit flashes playing right now, see flash()
		this.flashing = null; // the timer that moves them along
		this.playing = new Map(); // key -> the fx (a campfire's sparks, a quest giver's "!") on the page right now, see drawFx()
		this.alerts = []; // { who, until }: enemies that have just spotted the hero, each with a "!" over it until then, see alert()
		this.emitter = null; // the timer that sends up their dots, see emit()
		this.lastFrame = null; // what's on the map right now: screen square -> what was drawn there, see paint()
		this.transition = null; // the dissolve from one scene to the next while it plays, see startTransition()
		this.flying = false; // an arrow is in the air (see flight): keys and the monsters wait for it
		this.held = new Map(); // the direction keys held down: code -> { key, code, move }, oldest first (see holdKey)
		this.walking = null; // the timer that takes the next step while they're held
		this.lastStep = null; // the step the walk last took, [dx, dy]
		this.afterFlight = null; // what was waiting for it: the rest of the hero's turn (see afterTurn)
		this.afterDeath = null; // the timer that keeps the monsters going once the hero is dead, see toggleEndScreen
		this.defs = {
			enemy: {},
			npc: {},
			item: {},
			gearModifier: {},
			skill: {},
			effect: {},
			scene: {},
			quest: {},
			recipe: {},
		}; // the definitions
		this.modified = new Map(); // "enchanted sword" -> the def of one, see withGearModifier()
		this.bench = {}; // item -> how many of it are on the Combine screen's bench, see craft()
		this.quests = []; // the quests the hero has taken on, in order (see startQuest)
		this.flags = {}; // a notepad for your own game: game.flags.metTheKing = true
		this.scenes = {}; // built the first time the hero visits each one
		this.currentScene = null;
		this.visited = new Set(); // the keys of every scene the hero has been in
		this.turn = 0;
		this.timers = []; // { turn, fn } waiting for the hero's turn to come, see after()
		this.over = false; // won or lost
		this.started = false;
		this.mode = "play"; // or "menu" while a list (items, a shop...) is open
		this.menuState = null; // what the open list is, see menu()
		this.messages = [];
		this.messageCount = 0;
		this.seenMessages = 0;
		this.visible = new Set(); // "x,y" squares the hero sees right now, see updateVision()
		this.light = new Map(); // "x,y" -> how well lit each of them is, see updateVision()
		this.shown = new Set(); // what was on screen at the hero's last turn
		this.diagonals = !!this.config.diagonals;
		this.topology = this.diagonals ? 8 : 4;
		this.directions = this.diagonals
			? [
					[0, -1],
					[1, -1],
					[1, 0],
					[1, 1],
					[0, 1],
					[-1, 1],
					[-1, 0],
					[-1, -1],
				]
			: SIDES;
		this.sound = new Sound(this, this.config);
		this.kills = 0; // enemies the hero has killed
		// Every dungeon has a code (its seed), and the same code makes the same
		// dungeon: yours from the options, else ?seed=k7x2 in the address, else
		// a random one. game.seed is the code; the random generator gets a number made from it.
		const url = urlParams();
		const has = (v) => v != null && v !== "";
		// In the editor's frame there is no address; the shell's seed box sets ZOT_SEED instead.
		const shellSeed = window.ZOT_SHELL ? window.ZOT_SEED : null;
		const given = [this.config.seed, url.seed, shellSeed].find(has);
		this.seed = given != null ? String(given).toLowerCase() : randomCode();
		this.seedGiven = given != null;
		this.seedNumber = seedNumber(this.seed);
		ROT.RNG.setSeed(this.seedNumber);
		toShell({ type: "zot:seed", seed: this.seed, fixed: has(this.config.seed) });
		if (url.scene != null) {
			this.config.start = sceneKey(url.scene); // ?scene=mine, to test a scene without walking there
			this.testingStart = true;
		}
		if (url.god != null) this.config.godMode = true; // ?god
		currentGame = this;
	}

	// Runs one of your hooks (onUse, onHurt, act...). If it throws, the
	// mistake is shown on the page, with `where` saying whose code it was
	// ("the goblin's onHurt"), and the game carries on as if the hook had
	// done nothing.
	callHook(where, fn, ...args) {
		if (typeof fn !== "function") return undefined;
		try {
			return fn(...args);
		} catch (err) {
			report(err, where);
			return undefined;
		}
	}
	// Runs fn once `turns` of the hero's turns have passed: a spell wearing
	// off, a door closing again. It gets the game.
	//   player.speed = 2; game.after(10, () => { player.speed = 1; });
	after(turns, fn) {
		if (typeof fn !== "function")
			throw new Error(`Zot: game.after(${turns}, ...) needs a function to run as its second argument.`);
		this.timers.push({ turn: this.turn + Math.max(1, Math.round(turns)), fn });
	}

	// play("hit") for a built-in or configured sound, or play({ wave: "square", freq: 440 })
	play(sound) {
		this.sound.play(sound);
	}
	// Mute or unmute. The M key, the speaker button in the side panel and the
	// one in the editor's top bar (which sends a message, see below) all call this.
	toggleSound(on) {
		this.sound.muted = on == null ? !this.sound.muted : !on;
		this.say(this.sound.muted ? "Sound off." : "Sound on.", "system");
		if (this.el) this.drawSide();
		this.tellSound();
		return !this.sound.muted;
	}
	// The editor around the frame shows the sound state on its own speaker button.
	tellSound() {
		toShell({ type: "zot:sound", enabled: this.sound.enabled, muted: this.sound.muted });
	}

	// ---- describing the game ----
	// The hero: name, symbol, color, hp, mp, attack, defense, strength, sight,
	// the items and skills to start with, and hooks like onHurt. Anything left
	// out keeps its usual value (PLAYER_DEFAULTS above). Once the game has
	// started, game.player is the hero on the map.
	hero(def = {}) {
		if (!def || typeof def !== "object" || Array.isArray(def))
			throw new Error(
				`Zot: game.hero(${JSON.stringify(def)}) should be the hero's settings, like game.hero({ name: "Sam", hp: 15, attack: 3 }).`,
			);
		checkOptions("hero", "the hero", def);
		Object.assign(this.playerDef, def);
		return this.playerDef;
	}
	enemy(name, def = {}) {
		checkOptions("enemy", `the ${name} enemy`, def);
		const d = Object.assign({}, ENEMY_DEFAULTS, def);
		this.check("enemy", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		d.symbol = def.symbol || name.charAt(0);
		d.color = def.color || pick(Object.values(PALETTE));
		this.defs.enemy[name] = d;
		return d;
	}
	// A map square of your own, or a change to a built-in one (wall, floor,
	// door, water, tree, grass, chest...). It starts out like a floor:
	//   game.tile("campfire", { symbol: "^", color: "orange", walkable: false, light: 5, glow: "orange" })
	// `light` is how many squares around it the hero can see in the dark,
	// from any distance down a clear line; `glow` is a color that flickers
	// over them (in daylight too); `fx`
	// is the name of an fx to play on it (fx: "sparks", see FX).
	// Put it on a drawn map through the scene's legend, or next to an npc
	// with beside: "campfire".
	tile(name, def = {}) {
		checkOptions("tile", `the ${name} tile`, def);
		const d = Object.assign({}, this.tiles[name] || TILE_DEFAULTS, def, { id: name });
		this.check("tile", name, d);
		if (d.glow && !d.light) d.light = 3; // a glow needs a reach
		this.tiles[name] = d;
		return d;
	}
	// A friendly creature: walk into it to talk. Give it `says`, `stock` or `onTalk`.
	npc(name, def = {}) {
		checkOptions("npc", `the ${name} npc`, def);
		const d = Object.assign({}, NPC_DEFAULTS, def);
		this.check("npc", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		d.symbol = def.symbol || name.charAt(0).toUpperCase();
		d.color = def.color || "#ffffff";
		this.defs.npc[name] = d;
		return d;
	}
	item(name, def = {}) {
		checkOptions("item", `the ${name} item`, def);
		const d = Object.assign({ rarity: "common" }, def);
		this.check("item", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		d.symbol = def.symbol || (def.slot === "weapon" ? ")" : def.slot === "armor" ? "[" : def.slot ? "=" : "!");
		d.color = def.color || "#c9c9d9";
		this.defs.item[name] = d;
		return d;
	}
	// A gear modifier is a rare twist on a piece of gear, found now and then
	// (gearModifierChance in the settings) on what lies about the dungeon:
	//   game.gearModifier("enchanted", { weapon: { attack: 1 }, armor: { defense: 1 }, rarity: "uncommon" })
	//   game.gearModifier("elvish", { weight: (w) => w / 2 })
	// Each field changes one of the item's numbers: a number is added to it, a
	// function is given the old value and returns the new one, and a word
	// (color: "gold") replaces it. Fields under a slot's name only apply to the
	// gear of that slot, and a gear modifier that names slots turns up only on those
	// (slot: ["weapon", "armor"] says so without a table for each); one that
	// doesn't can land on anything worn. The item is called
	// "Enchanted Sword" (name: "Enchanted" to spell it differently), and
	// rarity, level and scenes work as they do for items. scene.drop("enchanted sword", x, y)
	// (or give, or a chest) puts one down on purpose.
	gearModifier(name, def = {}) {
		checkOptions("gearModifier", `the ${name} gearModifier`, def);
		const d = Object.assign({ rarity: "uncommon" }, def);
		this.check("gearModifier", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		this.defs.gearModifier[name] = d;
		return d;
	}
	// The def of an item with a gear modifier on it: the item's own, with the
	// gear modifier's changes made. There's one per pair, so two Enchanted Swords
	// pile up together and never with a plain one. `kind` stays the item's,
	// so has("sword") and a quest for a sword are happy with an enchanted one.
	withGearModifier(mod, base) {
		const key = mod.id + " " + base.id;
		if (!this.modified.has(key)) {
			if (!gearModifierFits(mod, base)) {
				throw new Error(
					`Zot: the ${mod.id} gear modifier can't go on the ${base.id} item. ` +
						(base.slot
							? `It only goes on ${gearModifierSlots(mod).join(" or ")}, not on a ${base.slot}.`
							: `A gear modifier goes on something worn, so the item needs a slot.`),
				);
			}
			const d = Object.assign({}, base, { id: base.id, name: `${mod.name} ${base.name}`, gearModifier: mod.id });
			for (const [field, change] of gearModifierChanges(mod, base.slot)) {
				const old = d[field] != null ? d[field] : field === "weight" ? 1 : 0;
				if (typeof change === "function") {
					if (d[field] == null && field !== "weight") continue; // nothing to work on
					d[field] = change(old);
				} else if (typeof change === "number") d[field] = old + change;
				else d[field] = change;
				if (field === "weight") d.weight = Math.max(0, d.weight);
			}
			this.modified.set(key, d);
		}
		return this.modified.get(key);
	}
	// What a random find is: the item, or one time in gearModifierChance (for
	// gear, when some gear modifier fits it here) one with a gear modifier on it, as
	// "enchanted sword". The dice are left alone when nothing could land.
	findOf(name, scene) {
		const base = this.defs.item[name];
		if (!base || !base.slot) return name;
		const pool = {};
		for (const id in this.defs.gearModifier) {
			const mod = this.defs.gearModifier[id];
			if (gearModifierFits(mod, base) && appearsIn(mod, scene)) pool[id] = RARITY[mod.rarity] || RARITY.common;
		}
		if (!Object.keys(pool).length || !(this.config.gearModifierChance > 0) || !chance(this.config.gearModifierChance))
			return name;
		return ROT.RNG.getWeightedValue(pool) + " " + name;
	}
	// A recipe: something the hero can make by combining things they carry
	// (the c key opens the Combine screen, see craft()):
	//   game.recipe("torch", { combine: ["stick", "rag"] })
	//   game.recipe("spear", { combine: ["stick", "knife", "rope"], say: "You lash the knife to the stick." })
	// `combine` is everything it takes, all at once: a list (a name twice for
	// two of them) or a table of counts ({ stone: 2, rope: 1 }). `makes` is the
	// item made (the recipe's own name if left out) and `count` how many; `say`
	// is what the log says (a line, or (player, item) => line); `sound` the
	// sound played ("craft"); onMake(player, item, game) runs once it's in the
	// hero's pack. The things combined are gone; a worn one is taken off first.
	recipe(name, def = {}) {
		checkOptions("recipe", `the ${name} recipe`, def);
		const d = Object.assign({}, def);
		this.check("recipe", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		d.makes = def.makes || name;
		d.combine = countsOf(def.combine);
		const other = this.recipeFor(d.combine);
		if (other)
			throw new Error(
				`Zot: the ${name} recipe combines the same things as the ${other.id} recipe (${JSON.stringify(def.combine)}), so there's no telling which one the hero means. Change one of them.`,
			);
		this.defs.recipe[name] = d;
		return d;
	}
	skill(name, def = {}) {
		checkOptions("skill", `the ${name} skill`, def);
		const d = Object.assign({ mp: 0, cooldown: 0 }, def);
		d.id = name;
		d.name = def.name || pretty(name);
		this.defs.skill[name] = d;
		return d;
	}
	// An effect: something that stays with a creature for a while, like being
	// poisoned, on fire or hasted. Zot has none of its own;
	// creature.addEffect("poisoned") puts one on.
	//   game.effect("poisoned", { turns: [4, 6], color: "lime", onTurn(who) { who.hurt(1); } })
	//   game.effect("hasty", { turns: 10, speed: 1 })
	// `turns` is how many of the creature's turns it lasts: a number, or a
	// [least, most] pair to roll from each time it is put on (leave it out and
	// it lasts until removeEffect). While it lasts, its stats (attack, speed,
	// sight...) are added to the creature's like a worn item's, and its
	// `light` lights the dark the way a worn light does (true sees normally,
	// a number lights that many squares). The creature is drawn in `color`,
	// a `glow` color flickers over it and the squares around it, and `fx`
	// plays over it: the name of an fx (fx: "sparks", see FX) or dots of its
	// own, written the way FX describes them
	// ({ color: "lime", rise: 10, rate: 4 }). onStart(creature, effect) runs
	// when it is put on, onTurn(creature, effect) at the start of each of the
	// creature's turns, and onEnd(creature, effect) when it wears off or is
	// removed. `effect` is { name, def, turns, from }: turns is how many are
	// left, and from is whoever put it on, if anyone said.
	effect(name, def = {}) {
		checkOptions("effect", `the ${name} effect`, def);
		const d = Object.assign({}, def);
		this.check("effect", name, d);
		d.id = name;
		d.name = def.name || pretty(name);
		if (typeof d.fx === "string") d.fx = this.fxNamed(d.fx, `the ${name} effect`);
		else if (d.fx) d.fx = Object.assign({}, d.fx, { id: name });
		this.defs.effect[name] = d;
		return d;
	}
	// A scene: a number in the chain (1 is where the game begins, the stairs
	// down in each lead to the next), or a name of its own, joined to the
	// others by its `exits`:
	//   exits: { down: "caves", portal: { to: "town", at: "gate" } }
	// Each exit is the scene it leads to, or { to, at, tile, win }: `at` is
	// the exit to arrive on over there (the one facing this one if left
	// out: "up" for "down", "down" for "up", else the same name); `tile` is
	// the square that marks it (the stairs for "up" and "down", else a
	// portal); win: true ends the game instead. A tile that can't be
	// walked on (walkable: false, for the door of a building) is taken by
	// walking into it, and the hero arrives in front of it rather than on
	// it. The square can also be drawn: < and > are "up" and "down", and
	// the legend can say { tile: "door", exit: "portal" }.
	scene(key, def = {}) {
		key = sceneKey(key);
		const what = sceneLabel(key);
		checkOptions("scene", what, def);
		const exits = def.exits;
		if (exits != null && (typeof exits !== "object" || Array.isArray(exits)))
			throw new Error(
				`Zot: ${what} has exits: ${JSON.stringify(exits)}. Write them like exits: { down: "caves", portal: { to: "town", at: "gate" } }.`,
			);
		for (const name in exits || {}) {
			const e = exits[name];
			const fine =
				typeof e === "string" || typeof e === "number" || (e && typeof e === "object" && (e.to != null || e.win));
			if (!fine)
				throw new Error(
					`Zot: ${what} has exits: { ${name}: ${JSON.stringify(e)} }. Write the scene it leads to, like ${name}: "caves", or ${name}: { to: "caves", at: "gate" }.`,
				);
		}
		this.defs.scene[key] = def;
		return def;
	}
	// How many numbered scenes there are: the `scenes` setting, else as
	// many as were defined by number, else 5 when no scene was defined at all.
	get sceneCount() {
		const cfg = this.config.scenes;
		if (typeof cfg === "number") return cfg;
		const numbers = Object.keys(this.defs.scene)
			.map(Number)
			.filter((n) => n >= 1);
		if (numbers.length) return Math.max(...numbers);
		return Object.keys(this.defs.scene).length ? 0 : 5;
	}
	hasScene(key) {
		if (this.defs.scene[key] != null) return true;
		return typeof key === "number" && Number.isInteger(key) && key >= 1 && key <= this.sceneCount;
	}
	// "You have: 1 to 5, mine, town." for an error about a scene that isn't there.
	knownScenes() {
		const n = this.sceneCount;
		const names = Object.keys(this.defs.scene).filter((k) => !/^\d+$/.test(k));
		const parts = (n >= 1 ? [n === 1 ? "1" : `1 to ${n}`] : []).concat(names.map((k) => `"${k}"`));
		return parts.length ? `You have: ${parts.join(", ")}.` : 'Make one with game.scene("town", {...}).';
	}
	// Where the exits of scene `key` lead: for a numbered scene the stairs,
	// down to the next number and up to the one before (the stairs down in
	// the last one win the game), then whatever its own `exits` say.
	exitsOf(key) {
		const out = {};
		const n = this.sceneCount;
		if (typeof key === "number") {
			if (key > 1) out.up = { to: key - 1 };
			if (key < n) out.down = { to: key + 1 };
			else if (key === n && this.config.exitStairs) out.down = { win: true };
		}
		const own = (this.defs.scene[key] || {}).exits || {};
		for (const name in own) {
			const e = own[name];
			out[name] = e && typeof e === "object" ? Object.assign({}, e) : { to: e };
			if (out[name].to != null) out[name].to = sceneKey(out[name].to);
		}
		return out;
	}
	// Every exit leads somewhere that exists and is marked by a tile that does.
	checkExits() {
		for (const k in this.defs.scene) {
			const key = sceneKey(k),
				exits = this.exitsOf(key);
			for (const name in exits) {
				const e = exits[name];
				if (!e.win && !this.hasScene(e.to))
					throw new Error(
						`Zot: ${sceneLabel(key)} has an exit (${name}) to ${JSON.stringify(e.to)}, but there is no such scene. ${this.knownScenes()}`,
					);
				if (e.tile && !this.tiles[e.tile])
					throw new Error(
						`Zot: ${sceneLabel(key)}'s ${name} exit has tile: "${e.tile}", but there is no tile called "${e.tile}". Make one with game.tile("${e.tile}", {...}).`,
					);
			}
		}
	}
	// A quest: something the hero is asked to do, with a reward at the end.
	//   kill: "dragon" or { rat: 5 }    bring: "locket" or { mushroom: 3 }    reach: 5
	//   reward: { gold: 25, xp: 10, items: "potion" }
	//   ask / wait / thanks: what the npc that hands it out says (a line, or (npc, player) => line)
	//   report: false means it's finished the moment the goal is met, no need to go back
	// An npc with quest: "name" hands it out; see questTalk. game.startQuest does it from code.
	quest(name, def = {}) {
		const what = `the ${name} quest`;
		checkOptions("quest", what, def);
		const d = Object.assign({ report: true }, def);
		for (const goal of ["kill", "bring"]) {
			const v = d[goal];
			if (v == null) continue;
			const counts = isTable(v) && Object.values(v).every((n) => typeof n === "number" && n > 0);
			if (typeof v !== "string" && !counts)
				throw new Error(
					`Zot: ${what} has ${goal}: ${JSON.stringify(v)}. Write a name, like ${goal}: "rat", or how many of each, like ${goal}: { rat: 5 }.`,
				);
		}
		if (d.reach != null && typeof d.reach !== "number" && typeof d.reach !== "string")
			throw new Error(
				`Zot: ${what} has reach: ${JSON.stringify(d.reach)}. It's a scene, like reach: "lair" or reach: 5.`,
			);
		if (d.reach != null) d.reach = sceneKey(d.reach);
		if (d.reward != null && !isTable(d.reward))
			throw new Error(
				`Zot: ${what} has reward: ${JSON.stringify(d.reward)}. Write it like reward: { gold: 25, xp: 10, items: "potion" }.`,
			);
		d.id = name;
		d.name = def.name || pretty(name);
		this.defs.quest[name] = d;
		return d;
	}
	// Each of these properties has exactly one shape. Anything else stops
	// the game with a message saying what to write instead.
	check(kind, name, d) {
		const what = `the ${name} ${kind}`;
		const show = (v) => JSON.stringify(v);
		if (kind === "tile") {
			if (d.light != null && d.light !== false && !(typeof d.light === "number" && d.light > 0)) {
				throw new Error(
					`Zot: ${what} has light: ${show(d.light)}. On a tile, light is how many squares around it the hero can see in the dark, a number like light: 5.`,
				);
			}
			if (d.glow != null && d.glow !== false && typeof d.glow !== "string") {
				throw new Error(
					`Zot: ${what} has glow: ${show(d.glow)}. glow is a color that flickers over the squares the tile lights, like glow: "orange".`,
				);
			}
			if (d.fx != null && d.fx !== false && typeof d.fx !== "string") {
				throw new Error(
					`Zot: ${what} has fx: ${show(d.fx)}. fx is the name of an fx to play on the square, like fx: "sparks".`,
				);
			}
			return;
		}
		if (kind === "effect") {
			const t = d.turns;
			const count = (v) => typeof v === "number" && v >= 1;
			if (t != null && !count(t) && !(Array.isArray(t) && t.length === 2 && t.every(count) && t[0] <= t[1])) {
				throw new Error(
					`Zot: ${what} has turns: ${show(t)}. turns is how many turns it lasts: a number like turns: 5, or a [least, most] pair to roll from, like turns: [3, 6]. Leave it out for until removeEffect.`,
				);
			}
			for (const key of ["color", "glow"]) {
				if (d[key] != null && d[key] !== false && typeof d[key] !== "string") {
					throw new Error(`Zot: ${what} has ${key}: ${show(d[key])}. ${key} is a color, like ${key}: "lime".`);
				}
			}
			for (const stat of STATS) {
				if (d[stat] != null && typeof d[stat] !== "number") {
					throw new Error(
						`Zot: ${what} has ${stat}: ${show(d[stat])}. ${stat} is what the effect adds to the creature's ${stat} while it lasts, a number like ${stat}: 1.`,
					);
				}
			}
			if (d.light != null && d.light !== false && d.light !== true && !(typeof d.light === "number" && d.light > 0)) {
				throw new Error(
					`Zot: ${what} has light: ${show(d.light)}. light is true (the creature sees normally while it lasts) or how many squares it lights, like light: 6.`,
				);
			}
			if (d.fx != null && d.fx !== false && typeof d.fx !== "string" && !isTable(d.fx)) {
				throw new Error(
					`Zot: ${what} has fx: ${show(d.fx)}. fx is the name of an fx to play over the creature, like fx: "sparks", or dots of its own, like fx: { color: "lime", rise: 10 }.`,
				);
			}
			return;
		}
		if (kind === "recipe") {
			const c = d.combine;
			const hint = `combine is everything it takes: a list of items (a name twice for two of them), like combine: ["stick", "rag"], or a table of counts, like combine: { stone: 2, rope: 1 }.`;
			const ok = Array.isArray(c)
				? c.length > 0 && c.every((v) => typeof v === "string" && v)
				: isTable(c) && Object.keys(c).length > 0 && Object.values(c).every((v) => typeof v === "number" && v > 0);
			if (!ok) throw new Error(`Zot: ${what} has combine: ${show(c)}. ${hint}`);
			if (d.makes != null && (typeof d.makes !== "string" || !d.makes)) {
				throw new Error(
					`Zot: ${what} has makes: ${show(d.makes)}. makes is the name of the item it makes, like makes: "torch".`,
				);
			}
			if (d.count != null && (typeof d.count !== "number" || d.count < 1)) {
				throw new Error(
					`Zot: ${what} has count: ${show(d.count)}. count is how many it makes, a number like count: 3.`,
				);
			}
			return;
		}
		if (kind === "gearModifier") {
			const change = (v) => typeof v === "number" || typeof v === "function" || typeof v === "string";
			const hint = `A gear modifier changes an item's numbers, like { weapon: { attack: 1 }, weight: (w) => w / 2 }.`;
			if (d.slot != null && !asList(d.slot).every((v) => typeof v === "string" && v)) {
				throw new Error(
					`Zot: ${what} has slot: ${show(d.slot)}. On a gear modifier, slot is which gear it goes on: a slot or a list of them, like slot: ["weapon", "armor"].`,
				);
			}
			for (const field in d) {
				if (GEAR_MODIFIER_META.includes(field)) continue;
				const v = d[field];
				if (change(v)) continue;
				if (!isTable(v) || !Object.keys(v).length || !Object.values(v).every(change)) {
					throw new Error(`Zot: ${what} has ${field}: ${show(v)}. ${hint}`);
				}
			}
			this.checkWhere(what, d);
			return;
		}
		if (d.beside != null && typeof d.beside !== "string") {
			throw new Error(
				`Zot: ${what} has beside: ${show(d.beside)}. beside is the name of a tile to put next to it, like beside: "campfire".`,
			);
		}
		if (d.drops != null && !isTable(d.drops)) {
			throw new Error(
				`Zot: ${what} has drops: ${show(d.drops)}. Write it as percentages, like drops: { gold: 60, potion: 10 } (or { gold: 100 } to always drop gold).`,
			);
		}
		if (d.stock != null && !Array.isArray(d.stock)) {
			throw new Error(
				`Zot: ${what} has stock: ${show(d.stock)}. Write it as a list, like stock: ["potion", "sword"]. To give this shop its own prices, add prices: { potion: 15 }.`,
			);
		}
		if (d.prices != null && !isTable(d.prices)) {
			throw new Error(`Zot: ${what} has prices: ${show(d.prices)}. Write it like prices: { potion: 15, sword: 60 }.`);
		}
		if (d.lasts != null && (typeof d.lasts !== "number" || d.lasts <= 0 || !d.slot)) {
			throw new Error(
				`Zot: ${what} has lasts: ${show(d.lasts)}. lasts is how many turns something works for while worn, so it needs a slot too, like slot: "light", lasts: 150.`,
			);
		}
		if (kind === "enemy" && d.shoots != null && typeof d.shoots !== "string") {
			throw new Error(
				`Zot: ${what} has shoots: ${show(d.shoots)}. shoots is the name of the item it fires, like shoots: "arrow". An enemy never runs out.`,
			);
		}
		if (kind !== "enemy" && d.shoots != null && (typeof d.shoots !== "string" || !d.slot)) {
			throw new Error(
				`Zot: ${what} has shoots: ${show(d.shoots)}. shoots is the name of the item it fires, and it needs a slot so it can be wielded, like slot: "weapon", shoots: "arrow".`,
			);
		}
		if (d.range != null && (typeof d.range !== "number" || d.range < 1 || !d.shoots)) {
			throw new Error(
				`Zot: ${what} has range: ${show(d.range)}. range is how far something with shoots can fire, a number of squares like shoots: "arrow", range: 6.`,
			);
		}
		if (d.throw != null && (typeof d.throw !== "number" || d.throw < 1)) {
			throw new Error(
				`Zot: ${what} has throw: ${show(d.throw)}. throw is how far it can be thrown (with the h key), a number of squares like throw: 4.`,
			);
		}
		if (d.weight != null && (typeof d.weight !== "number" || d.weight < 0)) {
			throw new Error(
				`Zot: ${what} has weight: ${show(d.weight)}. weight is how heavy one of these is to carry, a number like weight: 2 (0 for something that weighs nothing). Leave it out for 1.`,
			);
		}
		if (d.count != null && (typeof d.count !== "number" || d.count < 1)) {
			throw new Error(
				`Zot: ${what} has count: ${show(d.count)}. count is how many come in a pile, a number like count: 5.`,
			);
		}
		const lightOk = d.light === true || (typeof d.light === "number" && d.light > 0);
		if (d.light != null && d.light !== false && (!lightOk || !d.slot)) {
			throw new Error(
				`Zot: ${what} has light: ${show(d.light)}. A light needs a slot so it can be worn, and light is true (the hero sees normally) or how many squares it lights, like slot: "light", light: true.`,
			);
		}
		this.checkWhere(what, d);
	}
	// The scenes, level and rarity a thing turns up by, see appearsIn().
	checkWhere(what, d) {
		const show = (v) => JSON.stringify(v);
		// one of them, a list of them, or a range: { from: 2, to: 4 }
		const fits = (f, one) =>
			one(f) || (Array.isArray(f) && f.length > 0 && f.every(one)) || (isTable(f) && ("from" in f || "to" in f));
		if (d.scenes != null) {
			const f = d.scenes;
			if (!fits(f, (v) => typeof v === "number" || typeof v === "string")) {
				throw new Error(
					`Zot: ${what} has scenes: ${show(f)}. Use a scene (scenes: "mine") or a list of them (scenes: ["mine", "lair"]). For levels, use level: 3 or level: { from: 2, to: 4 }.`,
				);
			}
			if (Array.isArray(f)) d.scenes = f.map((v) => (typeof v === "string" ? sceneKey(v) : v));
			else if (typeof f === "string") d.scenes = sceneKey(f);
		}
		if (d.level != null && !fits(d.level, (v) => typeof v === "number")) {
			throw new Error(
				`Zot: ${what} has level: ${show(d.level)}. Use a level (level: 3), a list (level: [2, 5]) or a range (level: { from: 2, to: 4 }, or { from: 3 } for 3 and up).`,
			);
		}
		if (d.rarity != null && !(d.rarity in RARITY)) {
			throw new Error(
				`Zot: ${what} has rarity: ${show(d.rarity)}. It must be "common", "uncommon", "rare" or "legendary".`,
			);
		}
	}
	// Every slot some item can go in ("weapon", "armor", "ring"...), in the order they were first defined.
	slots() {
		const seen = [];
		for (const name in this.defs.item) {
			const slot = this.defs.item[name].slot;
			if (slot && !seen.includes(slot)) seen.push(slot);
		}
		return seen;
	}
	lookup(kind, name) {
		const def = this.defs[kind][name];
		if (!def && kind === "item" && typeof name === "string" && name.includes(" ")) {
			// "enchanted sword": a gear modifier and the item it's on
			const i = name.indexOf(" ");
			return this.withGearModifier(
				this.lookup("gearModifier", name.slice(0, i)),
				this.lookup("item", name.slice(i + 1)),
			);
		}
		if (!def) {
			const known = Object.keys(this.defs[kind]);
			throw new Error(
				`Zot: there is no ${kind} called "${name}". ` +
					(known.length ? `You have: ${known.join(", ")}.` : `Make one with game.${kind}("${name}", {...}).`),
			);
		}
		return def;
	}
	// Which enemies/items can show up in a scene, weighted by rarity. `scene`
	// is the scene, or its key (a number counts as its level too).
	pool(kind, scene) {
		if (typeof scene !== "object") {
			const key = sceneKey(scene),
				opts = this.defs.scene[key] || {};
			scene = { key, level: opts.level != null ? opts.level : typeof key === "number" ? key : 1 };
		}
		const out = {};
		const keys = kind === "item" ? this.vaultKeys() : null;
		for (const name in this.defs[kind]) {
			const d = this.defs[kind][name];
			if (d.unique) continue;
			if (keys && keys.has(name)) continue; // vault keys only appear where the vault puts them
			if (!appearsIn(d, scene)) continue;
			const w = RARITY[d.rarity] || RARITY.common;
			if (w > 0) out[name] = w;
		}
		return out;
	}

	// Every item some scene's vault uses as its key.
	vaultKeys() {
		const keys = new Set();
		for (const n in this.defs.scene) {
			const v = this.defs.scene[n].vault;
			if (v) keys.add(typeof v === "string" ? v : v.key || "key");
		}
		return keys;
	}

	// ---- starting ----
	start() {
		if (this.started) return this;
		this.started = true;
		for (const kind of ["item", "enemy"]) {
			for (const name in this.defs[kind]) {
				const shoots = this.defs[kind][name].shoots;
				if (shoots && !this.defs.item[shoots])
					throw new Error(
						`Zot: the ${name} ${kind} shoots "${shoots}", but there is no item called "${shoots}". Make one with game.item("${shoots}", {...}).`,
					);
			}
		}
		for (const name in this.defs.recipe) {
			// Complain now, naming the recipe, not on the Combine screen
			const r = this.defs.recipe[name];
			for (const kind in r.combine) {
				if (!this.defs.item[kind])
					throw new Error(
						`Zot: the ${name} recipe combines "${kind}", but there is no item called "${kind}". Make one with game.item("${kind}", {...}).`,
					);
			}
			if (!this.defs.item[r.makes] && !r.makes.includes(" "))
				throw new Error(
					`Zot: the ${name} recipe makes "${r.makes}", but there is no item called "${r.makes}". Make one with game.item("${r.makes}", {...}), or say which item it makes with makes: "torch".`,
				);
			this.lookup("item", r.makes); // "enchanted sword" is fine: a gear modifier on an item
		}
		this.checkQuests();
		for (const name in this.tiles) if (this.tiles[name].fx) this.fxNamed(this.tiles[name].fx, `the ${name} tile`);
		this.buildDom();
		const pd = this.playerDef;
		this.player = new Creature(this, pd, true);
		this.player.learnDueSkills(true);
		for (const name of asList(pd.items)) {
			const it = new Item(this, this.lookup("item", name));
			if (it.slot && !this.player.gear[it.slot]) {
				this.player.items.push(it);
				this.player.equip(it);
			} else this.player.pickUp(it);
		}
		this.messages = [];
		this.say(this.config.welcome || `Welcome, ${pd.name}!`, "system");
		this.checkExits();
		const cfg = this.config;
		const first =
			cfg.start != null ? sceneKey(cfg.start) : this.sceneCount >= 1 ? 1 : sceneKey(Object.keys(this.defs.scene)[0]);
		if (!this.hasScene(first))
			throw new Error(`Zot: there is no scene called ${JSON.stringify(first)} to start in. ${this.knownScenes()}`);
		if (this.testingStart) this.say(`Testing: starting in ${this.sceneTitle(first)}.`, "system");
		if (cfg.godMode) this.say("God mode: the hero can't be hurt.", "system");
		this.goToScene(first, true);
		window.addEventListener("keydown", (e) => this.handleKey(e));
		window.addEventListener("keyup", (e) => this.releaseKey(e));
		window.addEventListener("blur", () => this.releaseKey(null)); // a key let go of in another window never comes back up here
		this.callHook("the game's onStart", this.config.onStart, this);
		this.runUntilPlayer();
		this.draw();
		this.startAnimation();
		return this;
	}

	// With pictures, anything with `frames` moves: every `animate`
	// milliseconds the frame counter goes up and the map is drawn again.
	// A glow (and the frames of the tile that gives it) flickers every
	// `flicker` milliseconds instead, pictures or not. Nothing happens while
	// the page is hidden or nothing on screen moves.
	startAnimation() {
		const ms = +this.config.animate,
			flicker = +this.config.flicker;
		const frames = !!this.tileset && ms > 0;
		const glows = flicker > 0 && [...Object.values(this.tiles), ...Object.values(this.defs.effect)].some((t) => t.glow); // a campfire, or an effect (burning)
		if ((!frames && !glows) || this.animation) return;
		const step = frames && glows ? Math.min(ms, flicker) : frames ? ms : flicker;
		const every = frames ? Math.max(1, Math.round(ms / step)) : 0; // steps per frame
		let ticks = 0;
		this.animation = setInterval(() => {
			if (document.hidden || (this.tileset && !this.tilesReady)) return;
			let redraw = false;
			if (frames && ++ticks % every === 0) {
				this.frame++;
				if (this.animated) redraw = true;
			}
			if (glows) {
				this.flicker++;
				if (this.glowing) redraw = true;
			}
			if (redraw) this.drawMap();
		}, step);
	}

	// With pictures: show the hit flash on a square for a moment. The
	// tileset's `hit` frames (or your own list) take the place of whoever
	// stands there, `flash` milliseconds each, painted in `color`. Every
	// attack does this by itself; call it for a spell or a trap of your own.
	// `delay` frames of nothing first, and `then` runs once the last frame has
	// shown (an arrow in flight uses both). Returns true if the flash will play.
	flash(x, y, color, frames, delay, then) {
		const ms = +this.config.flash;
		if (!this.tileset || !(ms > 0) || !this.el) return false;
		frames = frames || this.tileset.map.hit;
		if (!frames || !frames.length) return false;
		if (delay > 0) frames = new Array(delay).fill(null).concat(frames);
		this.hits.push({ x, y, scene: this.currentScene, frames, color: color || "#ffffff", i: 0, then });
		if (this.flashing) return true;
		this.flashing = setInterval(() => {
			for (const e of this.hits) e.i++;
			const done = this.hits.filter((e) => e.i >= e.frames.length);
			this.hits = this.hits.filter((e) => e.i < e.frames.length);
			if (!this.hits.length) {
				clearInterval(this.flashing);
				this.flashing = null;
			}
			if (this.tilesReady) this.drawMap();
			for (const e of done) if (e.then) e.then();
		}, ms);
		return true;
	}

	// With pictures: a "!" (the alert fx) hovers over `who` for the
	// `alert` milliseconds in the settings. An enemy does this the moment it
	// spots the hero; call it for a sentry of your own. Returns true if it shows.
	alert(who) {
		const ms = +this.config.alert;
		if (!this.tileset || !(ms > 0) || !this.el || !who || who.dead) return false;
		this.alerts = this.alerts.filter((a) => a.who !== who);
		this.alerts.push({ who, until: performance.now() + ms });
		setTimeout(() => {
			const now = performance.now();
			this.alerts = this.alerts.filter((a) => a.until > now);
			if (this.tilesReady) this.drawMap();
		}, ms);
		return true;
	}

	// With pictures: `sprite` (a square of the sheet) flies along `path`, a
	// list of [x, y], one square per `flash` frame, and `then` runs when it
	// gets to the end: an arrow in the air, and what it does when it lands.
	// Keys and the monsters wait for it (see afterTurn). Without pictures
	// `then` runs right away. Returns true if the arrow is in the air.
	flight(path, sprite, color, then) {
		const land = () => {
			this.inAir--;
			this.flying = this.inAir > 0;
			then();
			if (this.flying) return; // another one is still on its way: what waits, waits for that
			const next = this.afterFlight;
			this.afterFlight = null;
			if (next) next();
			else this.draw();
		};
		let inAir = false;
		path.forEach(([x, y], i) => {
			if (this.flash(x, y, color, [sprite], i, i === path.length - 1 ? land : null)) inAir = true;
		});
		if (inAir) {
			this.inAir = (this.inAir || 0) + 1;
			this.flying = true;
		} else then();
		return inAir;
	}

	// ---- the screen ----
	// The screen is plain HTML: the standard one (SCREEN, above) when the
	// page's <div id="game"> is empty, or whatever the page put in it. Zot
	// finds each part by its id (zot-hp-text, zot-gold, zot-inventory, ...) and
	// fills it in after every turn.
	buildDom() {
		const cfg = this.config;
		let root = typeof cfg.mount === "string" ? document.querySelector(cfg.mount) : cfg.mount;
		if (!root) {
			root = document.createElement("div");
			root.id = "game";
			document.body.appendChild(root);
		}
		root.classList.add("zot");
		if (root.children.length === 0) root.innerHTML = SCREEN;
		if (!root.querySelector("#zot-map")) {
			throw new Error(
				'Zot can\'t find the map on the screen. Give your <div id="game"> a <div id="zot-map"></div>, or leave the whole div empty to get the standard screen.',
			);
		}
		this.el = { root }; // the parts of the page Zot uses most
		this.el.map = this.find("zot-map");
		this.el.log = this.find("zot-log");
		this.el.side = root.querySelector(".zot-side");
		this.el.overlay = this.find("zot-overlay");
		this.el.overlay.addEventListener("click", (e) => {
			if (this.over && e.target === this.el.overlay) this.toggleEndScreen(); // a click on the dark around the end screen puts it away
		});
		this.view = { width: cfg.viewWidth || cfg.width, height: cfg.viewHeight || cfg.height };
		const ts = this.tileset;
		if (ts) {
			// Pictures: rot.js copies squares out of the sheet. The canvas is
			// drawn at the sheet's size and blown up with CSS, so pixels stay crisp.
			const image = new Image();
			this.tileImage = image; // the sheet itself, for drawing outside the map (see spriteCanvas)
			image.onload = () => {
				this.tilesReady = true;
				if (this.currentScene) this.draw();
			};
			image.onerror = () =>
				showProblem(
					`Zot can't load the pictures at "${ts.image}".`,
					"Check the path in tileset: { image: ... }, and that the file is there. The game works with letters meanwhile: tileset: false.",
				);
			image.src = ts.image;
			this.display = new ROT.Display({
				layout: "tile",
				width: this.view.width,
				height: this.view.height,
				tileWidth: ts.size,
				tileHeight: ts.size,
				tileSet: image,
				tileMap: this.tileMap,
				tileColorize: true, // the white shapes take the color of what they stand for
				bg: cfg.background,
			});
			const canvas = this.display.getContainer();
			canvas.style.width = this.view.width * ts.size * ts.scale + "px";
			canvas.style.height = this.view.height * ts.size * ts.scale + "px";
			canvas.style.imageRendering = "pixelated";
		} else {
			this.display = new ROT.Display({
				width: this.view.width,
				height: this.view.height,
				fontSize: cfg.fontSize,
				fontFamily: cfg.font,
				forceSquareRatio: true,
				bg: cfg.background,
			});
		}
		// The map canvas sits in a box of its own, so the fx that play over
		// the map (a campfire's sparks, a quest giver's "!") can be laid over it
		// by the square: see drawFx.
		const stage = document.createElement("div");
		stage.className = "zot-stage";
		stage.appendChild(this.display.getContainer());
		this.el.fx = document.createElement("div");
		this.el.fx.className = "zot-fx-layer";
		stage.appendChild(this.el.fx);
		this.el.map.appendChild(stage);
		if (cfg.fit) {
			this.fitMap();
			if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.fitMap()).observe(this.el.map);
		}

		// The speaker button: gone when the game has no sounds, and in the
		// editor's frame, where the shell's top bar has one of its own instead.
		const button = this.find("zot-sound");
		if (button && (!this.sound.enabled || window.ZOT_SHELL)) button.remove();
		else if (button) {
			button.addEventListener("click", () => {
				button.blur(); // so the space bar keeps meaning "wait", not "click the button again"
				this.sound.unlock();
				this.toggleSound();
			});
		}
		if (window.ZOT_SHELL) {
			// The shell's speaker button says which way to set the sound. A click
			// out there doesn't let this frame make noise, so sound isn't unlocked
			// here: the next key press in the game does that. The shell also says
			// when its code pane starts and stops sliding; see fitMap.
			window.addEventListener("message", (e) => {
				if (e.source !== window.parent || !e.data) return;
				if (e.data.type === "zot:sound") this.toggleSound(!!e.data.on);
				if (e.data.type === "zot:sliding") {
					this.sliding = !!e.data.on;
					if (!this.sliding) this.fitMap();
				}
			});
			this.tellSound();
		}
		const help = this.find("zot-help");
		if (help && cfg.help === false) help.remove();
		else if (help && typeof cfg.help === "string") help.innerHTML = cfg.help;
		if (cfg.title) document.title = cfg.title;
	}

	// Makes the view as many squares wide and tall as fit the room #zot-map
	// has (the `fit` setting): a square is fontSize pixels, or a picture
	// times `scale`. Runs at the start and whenever the box changes size,
	// except while the editor's code pane is sliding (zot:sliding), when the
	// room changes size on every step: the refit waits for the slide's end.
	fitMap() {
		if (!this.el || !this.display || this.sliding) return;
		const canvas = this.display.getContainer();
		const box = this.el.map;
		const cs = getComputedStyle(canvas);
		const roomW = box.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
		const roomH = box.clientHeight - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
		if (roomW <= 0 || roomH <= 0) return; // not on screen; leave it alone
		const ts = this.tileset;
		const square = ts ? ts.size * ts.scale : this.config.fontSize;
		const width = Math.max(1, Math.floor(roomW / square));
		const height = Math.max(1, Math.floor(roomH / square));
		if (width === this.view.width && height === this.view.height) return;
		this.view = { width, height };
		this.display.setOptions({ width, height }); // rot.js resizes the canvas and blanks it
		if (ts) {
			canvas.style.width = width * square + "px";
			canvas.style.height = height * square + "px";
		}
		if (this.currentScene) this.draw();
	}
	// find("zot-gold") is like document.getElementById("zot-gold"), but only
	// looks inside this game. Returns null if the page doesn't have that part.
	find(id) {
		return this.el.root.querySelector("#" + id);
	}
	// write("zot-gold", 12) puts the text "12" into that element. If the
	// page doesn't have it, nothing happens, so you can delete parts of
	// the screen you don't want.
	write(id, text) {
		const el = this.find(id);
		if (el) el.textContent = text;
	}
	// show("zot-mp", false) hides that element; show("zot-mp", true) shows it again.
	show(id, yes) {
		const el = this.find(id);
		if (el) el.hidden = !yes;
	}
	// bar("zot-hp", "HP", 7, 20) fills the HP bar 35% and writes "HP 7/20" on it.
	bar(id, label, value, max) {
		this.show(id, max > 0);
		const percent = max > 0 ? Math.round((100 * Math.max(0, value)) / max) : 0;
		const fill = this.find(id + "-fill");
		if (fill) fill.style.width = percent + "%";
		this.write(id + "-text", `${label} ${value}/${max}`);
	}
	// Adds one line to a list: [key] label (note). Used for the inventory, skills and menus.
	// `item` (an Item, or an item def) adds its bonus badges after the label: "Sword +3".
	addRow(list, key, label, note, className, item) {
		const row = document.createElement("li");
		if (className) row.className = className;
		if (key !== "" && key != null && key !== false) {
			const kbd = document.createElement("kbd");
			kbd.textContent = key;
			row.append(kbd, " ");
		}
		row.append(label, ...this.badges(item));
		if (note) {
			const small = document.createElement("small");
			small.textContent = note;
			row.append(" ", small);
		}
		list.appendChild(row);
		return row;
	}
	// A small "+3" for each stat a piece of gear adds (hover for which stat).
	// Takes an Item or an item def; anything without bonuses gets nothing.
	badges(item) {
		if (!item) return [];
		const def = item.def || item;
		return bonusesOf(def).map(({ stat, value }) => this.badge(stat, value));
	}
	// One "+3" badge; `from` names where it comes from in the hover text ("attack +3 from gear").
	badge(stat, value, from) {
		const badge = document.createElement("span");
		badge.className = "zot-badge";
		badge.textContent = (value > 0 ? "+" : "") + value;
		const name = stat === "maxHp" ? "max HP" : stat === "maxMp" ? "max MP" : stat;
		badge.title = `${name} ${badge.textContent}${from ? ` from ${from}` : ""}`;
		return badge;
	}

	// ---- scenes ----
	// What to call a scene to the player: its name, or "floor 3" for a
	// numbered scene without one, or its key made readable ("old_mine" -> "Old Mine").
	sceneTitle(key) {
		key = sceneKey(key);
		const s = this.scenes[key] || this.defs.scene[key] || {};
		return s.name || (typeof key === "number" ? `floor ${key}` : pretty(key));
	}
	// Where the hero is, for a sentence: "in The Meadow", "on floor 2", "in Old Mine".
	sceneWhere(key) {
		key = sceneKey(key);
		const s = this.scenes[key] || this.defs.scene[key] || {};
		return s.name ? `in ${s.name}` : typeof key === "number" ? `on floor ${key}` : `in ${pretty(key)}`;
	}
	// The scene with that key, built the first time it's asked for. It's
	// built with dice of its own, made from the seed and its key, so the
	// same code makes the same scene whenever it's built: before the hero
	// gets there, after a long fight elsewhere, or by another way in.
	sceneNamed(key) {
		key = sceneKey(key);
		if (!this.hasScene(key))
			throw new Error(`Zot: there is no scene called ${JSON.stringify(key)}. ${this.knownScenes()}`);
		if (!this.scenes[key]) {
			const dice = ROT.RNG.getState();
			ROT.RNG.setSeed(seedNumber(`${this.seed}/scene/${key}`));
			try {
				this.scenes[key] = new Scene(this, key);
			} finally {
				ROT.RNG.setState(dice);
			}
		}
		return this.scenes[key];
	}

	// Jump to a scene from code: the hero lands where it starts (on its
	// "up" exit, where stairs from before would lead, or its first square).
	// Walking through an exit goes through takeExit instead.
	goToScene(key, silent) {
		const scene = this.sceneNamed(key);
		const spot = scene.landing(scene.exits.up || scene.up);
		this.enterScene(scene, spot, silent ? null : `You arrive${scene.name ? ` in ${scene.name}` : ""}.`, "stairsDown");
	}
	// Through an exit: into the scene it leads to, onto the exit there that
	// faces this one (see exitsOf), or wherever the hero starts there if
	// there's no such exit. An exit with win: true ends the game instead.
	takeExit(exit) {
		if (exit.win) {
			this.win(this.config.winText);
			return;
		}
		const scene = this.sceneNamed(exit.to);
		const at = exit.at || (exit.name === "down" ? "up" : exit.name === "up" ? "down" : exit.name);
		let spot = scene.exits[at];
		if (!spot) {
			console.warn(
				`Zot: ${scene.label} has no exit called "${at}" for the hero to arrive on, so the hero starts at the beginning of it. Give it exits: { ${at}: ... }, or the exit that leads there an at: "name".`,
			);
			spot = scene.exits.up || scene.up;
		}
		const how =
			exit.name === "down" ? "go down the stairs" : exit.name === "up" ? "climb up the stairs" : "step through";
		const text = `You ${how}${scene.name ? ` to ${scene.name}` : ""}.`;
		this.enterScene(scene, scene.landing(spot), text, exit.name === "up" ? "stairsUp" : "stairsDown");
	}
	// The hero moves to (x, y) of `scene`. `text` is what to say about it
	// (none for the quiet start of the game, when a named scene is announced instead).
	enterScene(scene, spot, text, sound) {
		const old = this.currentScene;
		if (old) old.removeCreature(this.player);
		this.currentScene = scene;
		this.visited.add(scene.key);
		this.questEvent("reach", scene.key);
		scene.addCreature(this.player, spot.x, spot.y);
		this.updateVision();
		if (text) {
			this.startTransition();
			this.say(text, "system");
			this.play(sound);
		} else if (scene.name) {
			this.say(scene.name, "system");
		}
		if (this.dark) this.say(DARK_TEXT, "warn");
		if (!scene.entered) this.callHook(`${scene.label}'s onEnter`, scene.opts.onEnter, scene, this);
		scene.entered = true;
		this.callHook("the game's onScene", this.config.onScene, scene, this);
	}
	goDown() {
		const exit = this.currentScene.exits.down;
		if (exit) this.takeExit(exit);
	}
	goUp() {
		const exit = this.currentScene.exits.up;
		if (exit) this.takeExit(exit);
	}

	// ---- things in the world ----
	// One of the fx (see FX), or an error naming them all.
	fxNamed(name, where) {
		const def = FX[name];
		if (!def)
			throw new Error(
				`Zot: ${where} plays "${name}", but there is no fx called "${name}". The fx are: ${Object.keys(FX).join(", ")}.`,
			);
		return def;
	}
	// give("potion") puts an item straight into the hero's inventory
	give(name, count) {
		const item = new Item(this, this.lookup("item", name));
		if (count != null) item.count = count;
		return this.player.pickUp(item) ? item : null;
	}
	nearestEnemy(range, from) {
		from = from || this.player;
		range = range == null ? from.sight : range;
		let best = null,
			bestD = Infinity;
		for (const e of this.currentScene.enemies) {
			const d = distance(from, e);
			if (d <= range && d < bestD && from.canSee(e)) {
				best = e;
				bestD = d;
			}
		}
		return best;
	}
	enemiesInSight(range) {
		const p = this.player;
		return this.currentScene.enemies.filter((e) => p.canSee(e) && (range == null || distance(p, e) <= range));
	}
	enemiesNear(who, range) {
		return who.scene.enemies.filter((e) => e !== who && distance(who, e) <= range);
	}

	// ---- quests ----
	// Every quest an npc hands out or asks for, and every reward, must exist. Checked at start.
	checkQuests() {
		for (const name in this.defs.quest) {
			const d = this.defs.quest[name];
			for (const kind in this.goalOf(d, "kill")) this.lookup("enemy", kind);
			for (const kind in this.goalOf(d, "bring")) this.lookup("item", kind);
			for (const item of asList(d.reward && d.reward.items)) this.lookup("item", item);
		}
		for (const name in this.defs.npc) for (const q of asList(this.defs.npc[name].quest)) this.lookup("quest", q);
	}
	// kill: "rat" -> { rat: 1 }     kill: { rat: 5 } -> { rat: 5 }     nothing -> {}
	goalOf(def, goal) {
		const v = def[goal];
		return v == null ? {} : typeof v === "string" ? { [v]: 1 } : v;
	}
	// The quest the hero has taken on with this name, or null. A quest is
	// { id, name, text, status, giver, counts }: status is "active", then
	// "ready" once the goal is met and it wants handing in, then "done".
	questNamed(name) {
		return this.quests.find((q) => q.id === name) || null;
	}
	hasQuest(name) {
		const q = this.questNamed(name);
		return !!q && q.status !== "done";
	}
	questDone(name) {
		const q = this.questNamed(name);
		return !!q && q.status === "done";
	}
	// The hero takes on a quest. `giver` is the npc who handed it out, if one
	// did: that's who it gets handed back to. Returns the quest, or null if the
	// hero already has it (or has done it).
	startQuest(name, giver) {
		const def = this.lookup("quest", name);
		if (this.questNamed(name)) return null;
		const q = this.addQuest(def, giver);
		this.say(`New quest: ${q.name}.`, "level");
		this.say(q.text, "info");
		this.play("quest");
		this.callHook(`the ${def.name} quest's onStart`, def.onStart, this.player, q);
		this.checkQuest(q); // a goal that's already met counts (a scene already reached)
		if (this.el) this.drawSide();
		return q;
	}
	addQuest(def, giver) {
		const q = {
			id: def.id,
			def,
			name: def.name,
			text: def.text || this.questText(def),
			status: "active",
			giver: giver ? giver.name : null,
			counts: {}, // kills so far, by enemy
		};
		this.quests.push(q);
		return q;
	}
	// Finish a quest: anything it asked the hero to bring is handed over, the
	// reward is given and onDone runs. Works whether or not the goal was met,
	// and on a quest the hero never took, so your own code can end one any way it likes.
	finishQuest(name) {
		const def = this.lookup("quest", name);
		const q = this.questNamed(name) || this.addQuest(def, null);
		if (q.status === "done") return false;
		q.status = "done";
		const p = this.player;
		const brings = this.goalOf(def, "bring");
		for (const kind in brings) {
			if (p.countOf(kind) < brings[kind]) continue;
			p.removeItem(kind, brings[kind]);
			this.say(`You hand over ${some(brings[kind], this.lookup("item", kind).name)}.`, "item");
		}
		this.say(`Quest done: ${q.name}!`, "level");
		this.play("quest");
		const reward = def.reward || {};
		if (reward.gold) {
			p.gold += reward.gold;
			this.say(`You get ${reward.gold} gold.`, "good");
		}
		for (const item of asList(reward.items)) {
			if (this.give(item)) continue;
			p.scene.drop(item, p.x, p.y); // too heavy to carry: it lands at the hero's feet
			this.say(`The ${this.lookup("item", item).name} falls at your feet.`, "item");
		}
		if (reward.xp) p.gainXp(reward.xp);
		this.callHook(`the ${def.name} quest's onDone`, def.onDone, p, q);
		if (this.el) this.drawSide();
		return true;
	}
	// What a quest asks for, in words, for a quest without `text` of its own.
	questText(def) {
		const parts = [];
		const kills = this.goalOf(def, "kill");
		for (const kind in kills) {
			const e = this.lookup("enemy", kind),
				n = kills[kind];
			parts.push(
				`Defeat ${e.unique ? e.name : n > 1 ? `${n} ${plural(e.name.toLowerCase())}` : `a ${e.name.toLowerCase()}`}.`,
			);
		}
		const brings = this.goalOf(def, "bring");
		for (const kind in brings) parts.push(`Bring back ${some(brings[kind], this.lookup("item", kind).name)}.`);
		if (def.reach != null) parts.push(`Reach ${this.sceneTitle(def.reach)}.`);
		return parts.join(" ");
	}
	// How far along a quest is: one { label, have, need } per thing it asks for.
	questProgress(q) {
		const def = q.def,
			out = [];
		const kills = this.goalOf(def, "kill");
		for (const kind in kills) {
			const e = this.lookup("enemy", kind),
				need = kills[kind];
			out.push({ label: need > 1 ? plural(e.name) : e.name, have: Math.min(need, q.counts[kind] || 0), need });
		}
		const brings = this.goalOf(def, "bring");
		for (const kind in brings) {
			const it = this.lookup("item", kind),
				need = brings[kind];
			out.push({
				label: need > 1 ? plural(it.name) : it.name,
				have: Math.min(need, this.player.countOf(kind)),
				need,
			});
		}
		if (def.reach != null)
			out.push({ label: cap(this.sceneTitle(def.reach)), have: this.visited.has(def.reach) ? 1 : 0, need: 1 });
		return out;
	}
	// True when everything the quest asks for has been done. A quest with no
	// kill, bring or reach of its own is only ever finished by finishQuest.
	questGoalMet(q) {
		const steps = this.questProgress(q);
		return steps.length > 0 && steps.every((s) => s.have >= s.need);
	}
	// Something a quest might care about just happened: "kill" (an enemy's
	// kind), "pickup" (an item's kind) or "reach" (a scene's key).
	questEvent(what, which) {
		for (const q of this.quests.slice()) {
			if (q.status !== "active") continue;
			if (what === "kill") {
				const need = this.goalOf(q.def, "kill")[which];
				if (!need) continue;
				const have = (q.counts[which] || 0) + 1;
				q.counts[which] = have;
				if (have < need)
					this.say(`${q.name}: ${plural(this.lookup("enemy", which).name).toLowerCase()} ${have}/${need}.`, "info");
			} else if (what === "pickup" && !this.goalOf(q.def, "bring")[which]) continue;
			else if (what === "reach" && q.def.reach == null) continue;
			this.checkQuest(q);
		}
	}
	// If the goal is met: finish the quest, or mark it ready to hand in to
	// whoever gave it out. Returns true if the goal was met.
	checkQuest(q) {
		if (q.status !== "active" || !this.questGoalMet(q)) return false;
		if (q.giver && q.def.report !== false) {
			q.status = "ready";
			this.say(`${q.name}: done! Go back to ${q.giver}.`, "level");
			this.play("quest");
		} else this.finishQuest(q.id);
		return true;
	}
	// The quest an npc with `quest` would hand out if the hero talked to it
	// now: the first in its list the hero hasn't taken on. Null while the
	// hero is in the middle of one of its quests, or once they're all done.
	offersQuest(npc) {
		for (const id of asList(npc.def.quest)) {
			const q = this.questNamed(id);
			if (q && q.status === "done") continue;
			return q ? null : id;
		}
		return null;
	}
	// Quest business with an npc that has `quest`: hand out the first one the
	// hero hasn't got yet, take in one whose goal is met, or say `wait` in the
	// meantime. A list of quests comes one at a time, each after the last is done.
	// Returns true if the npc said something about a quest.
	questTalk(npc) {
		const line = (def, what) =>
			typeof def[what] === "function"
				? this.callHook(`the ${def.name} quest's ${what}`, def[what], npc, this.player, this)
				: def[what];
		for (const id of asList(npc.def.quest)) {
			const def = this.lookup("quest", id);
			const q = this.questNamed(id);
			if (q && q.status === "done") continue;
			if (!q) {
				npc.say(line(def, "ask") || `I need your help. ${def.text || this.questText(def)}`);
				this.startQuest(id, npc);
				return true;
			}
			if (this.questGoalMet(q)) {
				npc.say(line(def, "thanks") || "You did it! Thank you.");
				this.finishQuest(id);
				return true;
			}
			const wait = line(def, "wait");
			if (wait) npc.say(wait);
			return !!wait;
		}
		return false;
	}
	// "rats 3/5", or "done, see Farmer" once the goal is met. With `long`, the quest's text first.
	questNote(q, long) {
		const parts = [];
		if (q.status === "ready") parts.push(q.giver ? `done, see ${q.giver}` : "done");
		else
			for (const s of this.questProgress(q)) if (s.need > 1) parts.push(`${s.label.toLowerCase()} ${s.have}/${s.need}`);
		const note = parts.join(", ");
		return long ? q.text + (note ? ` (${note})` : "") : note;
	}
	// The J key: every quest, what it asks and how far along it is.
	journal() {
		if (!this.quests.length) {
			this.say("You have no quests yet.", "system");
			return;
		}
		const rows = [];
		for (const q of this.quests)
			if (q.status !== "done") rows.push({ key: false, label: q.name, note: this.questNote(q, true) });
		const done = this.quests.filter((q) => q.status === "done");
		if (done.length) {
			rows.push({ heading: "Done" });
			for (const q of done)
				rows.push({ key: false, label: q.name, note: q.text, disabled: true, className: "zot-done" });
		}
		this.menu("Quests", rows, () => {}, "Press any key to close");
		if (this.el) this.el.overlay.classList.add("zot-journal");
	}

	// ---- talking and shopping ----
	// The hero walked into an NPC. Returns true if a turn passes.
	talkTo(npc) {
		const def = npc.def;
		npc.talks++;
		if (def.onTalk) {
			const at = this.messages.length;
			const r = this.callHook(`${npc.name}'s onTalk`, def.onTalk, npc, this.player, this);
			if (typeof r === "string") {
				// The NPC speaks first, ahead of anything the hook did ("You pick up the Potion.").
				npc.say(r);
				const spoken = this.messages.pop();
				this.messages.splice(Math.min(at, this.messages.length), 0, spoken);
				if (this.el) this.drawLog();
			}
			if (r === false) return false;
		}
		const lines = asList(def.says);
		if (this.questTalk(npc)) {
			// Handing a quest out or in comes first; the usual lines wait for the next visit.
		} else if (lines.length) {
			npc.chats = (npc.chats || 0) + 1;
			npc.say(lines[(npc.chats - 1) % lines.length]);
		}
		if (def.stock) this.shop(npc);
		else if (!lines.length && !def.onTalk && !def.quest) this.say(`${npc.name} has nothing to say.`, "speech");
		return true;
	}

	// Open the buy/sell list for an NPC with `stock`.
	//   stock: ["potion", "sword"]    prices come from each item's `price`...
	//   prices: { potion: 15 }        ...unless the shop has its own price for it
	//   comment: "No refunds."        a remark shown in the shop, under the title
	// The hero can sell anything with a price (for half), unless `buys: false`.
	// Buying is one column and selling the other.
	shop(npc) {
		const p = this.player,
			def = npc.def,
			prices = def.prices || {};
		const wares = asList(def.stock).map((name) => ({
			name,
			price: prices[name] != null ? prices[name] : this.priceOf(name),
		}));
		const rows = [{ column: "Buy" }],
			actions = [];
		for (const w of wares) {
			const item = this.lookup("item", w.name);
			// Things that come in piles (arrows) are sold by the pile: `count` of them for count x price.
			const n = item.count > 1 ? Math.floor(item.count) : 1,
				cost = w.price * n;
			rows.push({
				label: `Buy ${item.name}${n > 1 ? ` x${n}` : ""}`,
				note: `${cost} gold`,
				disabled: p.gold < cost,
				item,
			});
			actions.push(() => {
				if (!this.give(w.name)) return; // too heavy: pickUp already said so
				p.gold -= cost;
				this.say(`You buy ${some(n, item.name)} for ${cost} gold.`, "item");
			});
		}
		if (def.buys !== false) {
			rows.push({ column: "Sell" });
			for (const it of p.items) {
				const here = it.def.gearModifier ? null : wares.find((w) => w.name === it.kind); // the shop's own price, for the plain thing
				const price = this.sellPriceOf(it.def, here ? here.price : undefined);
				if (price == null) continue;
				rows.push({ label: `Sell ${it.label}`, note: `${price} gold`, item: it });
				actions.push(() => {
					p.removeItem(it, 1);
					p.gold += price;
					this.say(`You sell the ${it.name} for ${price} gold.`, "item");
				});
			}
		}
		this.menu(
			`${npc.name}'s shop`,
			rows,
			(i) => {
				actions[i]();
				this.shop(npc);
			}, // stay in the shop after each deal
			`You have ${p.gold} gold. Press a key to buy or sell, or Esc to leave.`,
			this.shopComment(npc),
		);
		if (this.el) this.el.overlay.classList.add("zot-shop");
	}
	// What the shopkeeper says inside the shop: a line, a list (one per
	// visit, round and round, like `says`), or a function (npc, player, game)
	// returning a line. Nothing means no remark.
	shopComment(npc) {
		const lines = asList(npc.def.comment);
		if (!lines.length) return "";
		let line = lines[(Math.max(1, npc.talks) - 1) % lines.length];
		if (typeof line === "function") line = this.callHook(`${npc.name}'s comment`, line, npc, this.player, this);
		return typeof line === "string" ? line : "";
	}
	priceOf(name) {
		const d = this.lookup("item", name);
		return d.price != null ? d.price : 10;
	}
	// `name` is an item's name or its def (an Enchanted Sword has its own, see withGearModifier).
	sellPriceOf(name, shopPrice) {
		const d = typeof name === "string" ? this.defs.item[name] : name;
		if (!d) return null;
		const price = shopPrice != null ? shopPrice : d.price;
		return price == null ? null : Math.max(1, Math.floor(price / 2));
	}

	// ---- combining things ----
	// The recipe that takes exactly these items (a list, or a table of
	// counts, see countsOf), or null. Order doesn't matter.
	recipeFor(names) {
		const counts = countsOf(names),
			kinds = Object.keys(counts);
		if (!kinds.length) return null;
		for (const id in this.defs.recipe) {
			const c = this.defs.recipe[id].combine;
			if (Object.keys(c).length === kinds.length && kinds.every((k) => c[k] === counts[k])) return this.defs.recipe[id];
		}
		return null;
	}
	// Makes whatever these items add up to, out of the hero's pack:
	// game.combine(["stick", "rag"]). The things go, the thing made comes
	// (or falls at the hero's feet if it's too heavy). Returns it, or null if
	// no recipe takes exactly those or the hero doesn't have them, saying why.
	combine(names) {
		const p = this.player,
			counts = countsOf(names);
		const recipe = this.recipeFor(counts);
		if (!recipe) {
			this.say(Object.keys(counts).length ? "Those don't go together." : "There's nothing to combine.", "warn");
			return null;
		}
		for (const kind in counts) {
			if (p.countOf(kind) >= counts[kind]) continue;
			this.say(`You don't have ${aFew(counts[kind], this.lookup("item", kind).name)}.`, "warn");
			return null;
		}
		for (const kind in counts) p.removeItem(kind, counts[kind]);
		const item = new Item(this, this.lookup("item", recipe.makes));
		if (recipe.count > 1) item.count = Math.floor(recipe.count);
		const line =
			typeof recipe.say === "function"
				? this.callHook(`the ${recipe.name} recipe's say`, recipe.say, p, item, this)
				: recipe.say;
		this.say(line || `You make ${aFew(item.count, item.name)}.`, "item");
		this.play(recipe.sound || "craft");
		if (!p.pickUp(item, true)) {
			this.currentScene.placeItem(item, p.x, p.y);
			this.say(`${cap(aFew(item.count, item.name))} fall${item.count > 1 ? "" : "s"} at your feet.`, "item");
		}
		this.callHook(`the ${recipe.name} recipe's onMake`, recipe.onMake, p, item, this);
		if (this.el) this.drawSide();
		return item;
	}
	// The Combine screen (the c key): what the hero carries on the left, the
	// bench on the right. A thing's key moves one of it across (and back),
	// and Enter makes whatever the bench adds up to, if some recipe does
	// (see recipeFor); that takes a turn and closes the screen. Esc leaves
	// it, and the things stay in the pack as they were. `bench` is a table of
	// counts to start with (the screen reopens itself with its own after each
	// key); without one the bench starts empty. Returns false, and says so,
	// in a game with no recipes.
	craft(bench) {
		const p = this.player;
		if (!Object.keys(this.defs.recipe).length) {
			this.say("You can't think of anything to make.", "warn");
			return false;
		}
		bench = this.bench = countsOf(bench);
		const have = {}, // item -> how many of it the hero carries, piles and worn things together
			first = {}; // item -> the first pile of it, for its name and badges
		for (const it of p.items) {
			have[it.kind] = (have[it.kind] || 0) + it.count;
			if (!first[it.kind]) first[it.kind] = it;
		}
		// Nothing can be on the bench that isn't in the pack (used up, dropped, burnt out)
		for (const kind in bench) {
			bench[kind] = Math.min(bench[kind], have[kind] || 0);
			if (bench[kind] <= 0) delete bench[kind];
		}
		// Every kind of thing keeps its key for the whole visit, on either side,
		// so a key means the same thing after a move as before it: the pack's
		// kinds take the first keys, and each kind's bench row the one after those.
		const kinds = Object.keys(have),
			keys = "123456789abcdefghijklmnopqrstuvwxyz";
		const label = (it, n) => (n > 1 ? `${it.name} x${n}` : it.name);
		const rows = [{ column: "Carrying" }];
		kinds.forEach((kind, i) => {
			const n = have[kind] - (bench[kind] || 0);
			const it = first[kind];
			const allWorn = p.items.filter((i) => i.kind === kind).every((i) => i.equipped);
			if (n <= 0)
				rows.push({ label: it.name, note: "(on the bench)", disabled: true, key: keys[i] || "", item: it, kind });
			else
				rows.push({
					label: label(it, n),
					note: allWorn ? `(${it.wornWord})` : "",
					key: keys[i] || "",
					item: it,
					kind,
					side: "carrying",
				});
		});
		rows.push({ column: "Combining" });
		kinds.forEach((kind, i) => {
			if (!bench[kind]) return;
			rows.push({
				label: label(first[kind], bench[kind]),
				key: keys[kinds.length + i] || "",
				item: first[kind],
				kind,
				side: "bench",
			});
		});
		const recipe = this.recipeFor(bench);
		const onBench = Object.values(bench).reduce((sum, n) => sum + n, 0);
		rows.push({ label: "Combine", key: "Enter", disabled: !recipe, className: "zot-combine", side: "combine" });
		const text = recipe
			? `These make ${aFew(recipe.count > 1 ? Math.floor(recipe.count) : 1, this.lookup("item", recipe.makes).name)}.`
			: onBench >= 2
				? "Those don't go together."
				: "Pick the things to combine.";
		this.menu(
			"Combine which items?",
			rows,
			(i, row) => {
				if (row.side === "carrying") bench[row.kind] = (bench[row.kind] || 0) + 1;
				else if (row.side === "bench") {
					if (--bench[row.kind] <= 0) delete bench[row.kind];
				} else if (this.combine(bench)) {
					this.bench = {};
					return true; // made: a turn passes and the screen stays closed
				}
				this.craft(bench); // back to the screen, as it is now
			},
			"Press a key to move a thing across, Enter to combine, or Esc to leave",
			text,
		);
		if (this.el) {
			this.el.overlay.classList.add("zot-craft");
			this.el.overlay.classList.toggle("zot-craft-ready", !!recipe); // the line under the title goes green
		}
		return true;
	}

	// Show a list to choose from. Used for the inventory, shops, and anything of yours.
	//   game.menu("Which door?", ["Left", "Right"], (i, option) => { ... })
	// Options can also be { label, note, key, disabled, className }. Keys are 1-9 then a-z.
	// A { heading: "Equipped" } is a title line between groups; it can't be picked
	// and doesn't count towards the index. A { column: "Sell" } starts a new
	// column with that heading, so a list can stand side by side with another.
	// onPick runs with the chosen index; return true from it to use up a turn.
	// `text` is a line shown under the title (a shopkeeper's remark).
	// Esc (or any other key) closes the list.
	menu(title, options, onPick, hint, text) {
		const rows = options.map((o) => (typeof o === "string" ? { label: o } : Object.assign({}, o)));
		const opts = rows.filter((o) => !o.heading && !o.column);
		opts.forEach((o, i) => {
			if (!o.key && o.key !== false) o.key = i < 9 ? String(i + 1) : String.fromCharCode(97 + i - 9);
		});
		this.mode = "menu";
		this.menuState = { options: opts, onPick };
		this.showOverlay(title, text || "", "zot-prompt", hint || "Press a key to choose, or Esc to close");
		const list = this.find("zot-overlay-list");
		if (!list) return;
		let target = list, // where rows go: the list itself, or the current column
			columns = null;
		const heading = (into, label) => {
			const li = document.createElement("li");
			li.className = "zot-heading";
			li.textContent = label;
			into.appendChild(li);
		};
		for (const o of rows) {
			if (o.column) {
				if (!columns) {
					columns = document.createElement("li");
					columns.className = "zot-columns";
					list.appendChild(columns);
				}
				target = document.createElement("ul");
				target.className = "zot-column";
				columns.appendChild(target);
				heading(target, o.column);
				target.empty = true;
			} else {
				if (o.heading) heading(target, o.heading);
				else
					this.addRow(
						target,
						o.key,
						o.label,
						o.note,
						[o.disabled && "zot-disabled", o.className].filter(Boolean).join(" "),
						o.item,
					);
				target.empty = false;
			}
		}
		// An empty column (nothing to sell) still says so, so the layout holds.
		if (columns)
			for (const col of columns.children)
				if (col.empty) col.insertAdjacentHTML("beforeend", "<li><small>nothing</small></li>");
		if (!opts.length && !columns) list.innerHTML = "<li><small>nothing here</small></li>";
	}
	closeMenu() {
		this.mode = "play";
		this.menuState = null;
		this.hideOverlay();
	}

	// Bumping into a tile you can't walk on (see the tile's onBump). True if a turn passes.
	bumpTile(x, y) {
		const scene = this.currentScene,
			info = scene.tileInfo(x, y);
		if (typeof info.onBump !== "function") return false;
		const r = this.callHook(
			`the ${scene.tileAt(x, y)} tile's onBump`,
			info.onBump,
			this.player,
			x,
			y,
			this,
			scene.squareAt(x, y),
		);
		if (r === false) return false;
		this.updateVision(); // the tile may have changed
		return true;
	}

	// ---- messages and endings ----
	say(text, kind) {
		this.messages.push({ text: String(text), kind: kind || "info", id: ++this.messageCount });
		if (this.messages.length > 200) this.messages.shift();
		if (this.el) this.drawLog();
	}
	win(text) {
		if (this.over) return;
		this.over = true;
		this.say(text || "You win!", "level");
		this.callHook("the game's onWin", this.config.onWin, this);
		this.endScreen("You win!", text || "", "zot-win");
	}
	lose(text) {
		if (this.over) return;
		this.over = true;
		this.say(text || "You died.", "kill");
		this.callHook("the game's onLose", this.config.onLose, this);
		this.endScreen("Game over", text || "", "zot-lose");
	}
	// The end-of-game pop-up: a big picture (a crown for a win, whoever
	// killed the hero for a loss), what happened, the numbers, the best score
	// so far on this computer, and the dungeon's seed.
	endScreen(title, text, cls) {
		const p = this.player;
		const score = this.callHook("the game's score function", this.config.score, this, cls === "zot-win");
		const best = this.bestScore(score);
		// From here on the side panel is only to look at (see .zot-over in zot.css).
		if (this.el) this.el.root.classList.add("zot-over");
		const sound = this.find("zot-sound");
		if (sound) sound.disabled = true;
		this.showOverlay(
			title,
			text,
			cls,
			(this.seedGiven ? "Press R to play this dungeon again" : "Press R for a new dungeon") + ", or Esc to look around",
		);
		const killer = this.killer;
		if (cls === "zot-win") this.overlayIcon([43, 2], null, PALETTE.yellow);
		else if (killer && killer.def && !killer.isPlayer)
			this.overlayIcon(this.sprite(killer.friendly ? "npc" : "enemy", killer.def), killer.symbol, killer.color);
		const list = this.find("zot-overlay-list");
		if (!list) return;
		const row = (label, value) => {
			const li = document.createElement("li");
			li.className = "zot-stat";
			const name = document.createElement("span");
			name.textContent = label;
			const val = document.createElement("b");
			if (value instanceof Node) val.appendChild(value);
			else val.textContent = value;
			li.append(name, val);
			list.appendChild(li);
		};
		row("Places visited", this.visited.size);
		row("Monsters killed", this.kills);
		if (this.quests.length)
			row("Quests done", `${this.quests.filter((q) => q.status === "done").length}/${this.quests.length}`);
		row("Gold", p.gold);
		row("Level", p.level);
		row("Turns", this.turn);
		if (Number.isFinite(score)) {
			row("Score", best.isNew ? `${score} \u2014 new best!` : score);
			if (!best.isNew && best.best != null) row("Best", best.best);
		}
		row("Dungeon", this.seed);
	}
	// The big picture on the end screen: a square of the sheet painted in
	// `color`, or with letters, `symbol` in that color (nothing if there's no symbol).
	overlayIcon(sprite, symbol, color) {
		const box = this.find("zot-overlay-icon");
		if (!box) return;
		const ts = this.tileset;
		if (ts && this.tilesReady && sprite) {
			box.appendChild(this.spriteCanvas(sprite, color, "zot-sprite"));
		} else if (symbol && !ts) {
			const letter = document.createElement("span");
			letter.textContent = symbol;
			letter.style.color = color;
			letter.style.fontFamily = this.config.font;
			box.appendChild(letter);
		} else return;
		box.hidden = false;
	}
	// The best score on this computer, remembered by the browser.
	// Returns { best, isNew }: isNew is true when `score` just became the best.
	bestScore(score) {
		const key = "zot-best:" + (this.config.title || "game");
		try {
			const saved = localStorage.getItem(key);
			const best = saved == null ? null : Number(saved);
			if (Number.isFinite(score) && (best == null || score > best)) {
				localStorage.setItem(key, String(score));
				return { best: score, isNew: true };
			}
			return { best, isNew: false };
		} catch (e) {
			return { best: null, isNew: false }; // the browser won't remember things here
		}
	}
	// The pop-up box (#zot-overlay on the screen). `cls` picks its look:
	// "zot-win", "zot-lose" or "zot-prompt" for a list.
	showOverlay(title, text, cls, hint) {
		const overlay = this.el.overlay;
		overlay.className = "zot-overlay " + (cls || "");
		this.write("zot-overlay-title", title);
		this.write("zot-overlay-text", text || "");
		this.show("zot-overlay-text", !!text);
		this.write("zot-overlay-hint", hint || "Press R to play again");
		const icon = this.find("zot-overlay-icon");
		if (icon) {
			icon.innerHTML = "";
			icon.hidden = true;
		}
		const list = this.find("zot-overlay-list");
		if (list) list.innerHTML = "";
		overlay.hidden = false;
	}
	hideOverlay() {
		this.el.overlay.hidden = true;
	}
	// After the end: Esc puts the end screen away so the map can be looked at,
	// and brings it back. Clicking the dark around the box puts it away too.
	// After a death, time goes on slowly while the end screen is away.
	toggleEndScreen() {
		const overlay = this.el.overlay;
		overlay.hidden = !overlay.hidden;
		clearInterval(this.afterDeath);
		this.afterDeath = null;
		const ms = this.config.afterDeath;
		if (overlay.hidden && this.player.dead && ms > 0) this.afterDeath = setInterval(() => this.deadTurn(), ms);
	}
	// One turn without the hero: every monster in the scene acts until the
	// hero's (empty) place in line comes round again.
	deadTurn() {
		if (this.transition || this.flying) return;
		const scene = this.currentScene;
		let guard = 0;
		while (guard++ < 10000) {
			const actor = scene.scheduler.next();
			if (!actor || actor.isPlayer) break;
			if (actor.dead) scene.scheduler.remove(actor);
			else actor.act();
		}
		this.draw();
	}
	restart() {
		location.reload();
	}

	// ---- the turn loop ----
	// Called after the hero steps onto a new cell.
	playerArrived() {
		const p = this.player,
			scene = this.currentScene;
		this.updateVision();
		let footstep = true;
		const item = scene.itemAt(p.x, p.y);
		if (item && p.pickUp(item)) {
			scene.removeItem(item);
			footstep = false;
		} // pickUp made its own sound
		const info = scene.tileInfo(p.x, p.y);
		if (typeof info.onStep === "function") {
			this.callHook(
				`the ${scene.tileAt(p.x, p.y)} tile's onStep`,
				info.onStep,
				p,
				p.x,
				p.y,
				this,
				scene.squareAt(p.x, p.y),
			);
			// A trap may have killed the hero, or a teleporter moved them on.
			if (this.over || this.currentScene !== scene) return;
		}
		// Onto an exit: through it at once, except the way back up (Enter does that), or any exit with autoStairs: false.
		const exit = scene.exitAt(p.x, p.y);
		if (exit && exit.name === "up") this.say("Press Enter to go back up.", "system");
		else if (exit && this.config.autoStairs !== false) {
			this.takeExit(exit);
			return;
		} else if (exit)
			this.say(exit.name === "down" ? "Press Enter to go down." : "Press Enter to go through.", "system");
		if (footstep) this.play("walk");
	}
	// Lets every monster act until it is the hero's turn again.
	runUntilPlayer() {
		let guard = 0;
		while (!this.over && guard++ < 10000) {
			const scene = this.currentScene;
			const actor = scene.scheduler.next();
			if (!actor) break;
			if (actor.dead) {
				scene.scheduler.remove(actor);
				continue;
			}
			if (actor.isPlayer) {
				this.turn++;
				actor.tick();
				this.callHook("the game's onTurn", this.config.onTurn, this);
				const due = this.timers.filter((t) => t.turn <= this.turn);
				this.timers = this.timers.filter((t) => t.turn > this.turn);
				for (const t of due) this.callHook("a function given to game.after", t.fn, this);
				return;
			}
			actor.act();
		}
	}
	// Do something as the hero, then let the monsters move. Use this from your own code.
	playerTurn(fn) {
		if (this.over) return;
		this.afterTurn(this.callHook("your playerTurn code", fn) !== false);
	}
	// After the hero's go: if it used up a turn (`took`) the monsters move,
	// then everything is redrawn. An arrow in the air holds all that until it lands.
	afterTurn(took) {
		if (this.flying) {
			this.afterFlight = () => this.afterTurn(took);
			this.draw();
			return;
		}
		if (took) this.runUntilPlayer();
		this.draw();
	}

	// Every key press comes through here. If the key used up a turn,
	// the monsters get to move, then everything is redrawn.
	handleKey(e) {
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		this.sound.unlock(); // a real key press: the browser now allows sound
		const key = e.key;
		if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Tab"].includes(key)) return;
		this.seenMessages = this.messageCount;
		if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(key)) e.preventDefault();
		if (this.over) {
			if (key === "r" || key === "R") this.restart();
			else if (key === "Escape" || (key === "Enter" && this.el.overlay.hidden)) this.toggleEndScreen();
			return;
		}
		if (this.mode !== "menu" && this.holdKey(e)) return;
		if (this.transition || this.flying) return; // the next scene is still appearing, or an arrow is in the air; keys wait
		if (this.mode === "menu") {
			const state = this.menuState;
			const idx = state.options.findIndex((o) => o.key === key);
			const opt = idx >= 0 ? state.options[idx] : null;
			if (opt && opt.disabled) return; // can't pick that; the list stays open
			this.closeMenu();
			if (opt) this.playerTurn(() => this.callHook("your menu's onPick", state.onPick, idx, opt) === true);
			else this.draw();
			return;
		}
		this.afterTurn(this.playerAction(key, e.code));
	}

	// The direction keys work like a game controller's: the hero steps at
	// once, and while the key is held walks on by itself, `keyRepeat`
	// milliseconds apart (the keyboard's own repeat is ignored). Two held at
	// once go between them: up and right go diagonally with `diagonals`, and
	// zigzag right, up, right... without. With `diagonals` a key waits a
	// moment for a second one, so pressing both together doesn't take a
	// straight step first. Returns true if `e` was a direction key.
	holdKey(e) {
		const move = this.keyMove(e.key, e.code);
		if (!move) return false;
		if (e.repeat) return true;
		const id = e.code || e.key;
		this.held.delete(id);
		this.held.set(id, { key: e.key, code: e.code, move });
		this.zig = !move[0]; // with a zigzag, the new key's way goes first
		if (this.diagonals && this.held.size === 1) this.walkAfter(50, true);
		else if (
			this.walking &&
			!this.pressing &&
			sameStep(this.nextStep(), this.lastStep) // a key that only slides into the step already on its way (up, in a hallway going right) keeps the rhythm
		);
		else this.walk(true);
		return true;
	}
	// A key let go of (null: all of them). A tap too quick to wait out the
	// moment for a second key steps now.
	releaseKey(e) {
		const id = e && (e.code || e.key);
		if (e && !this.held.has(id)) return;
		if (this.pressing) this.walk(true);
		if (e) this.held.delete(id);
		else this.held.clear();
		if (!this.held.size) this.walkAfter(-1);
	}
	// The next step in `ms` milliseconds (-1: none). `first` marks the step a
	// fresh key press takes.
	walkAfter(ms, first) {
		clearTimeout(this.walking);
		this.walking = ms >= 0 ? setTimeout(() => this.walk(first), ms) : null;
		this.pressing = ms >= 0 && !!first;
	}
	// One step the way the held keys say, then the next one lined up. A
	// step that goes nowhere (into a wall) stops the walk until a key changes.
	walk(first) {
		const [delay, every] = asList(this.config.keyRepeat);
		this.walkAfter(-1);
		if (!this.held.size || this.over || this.mode === "menu") return;
		if (this.transition || this.flying) return this.walkAfter(+every || 120, first); // try again once it's done
		this.seenMessages = this.messageCount;
		const move = this.nextStep();
		if (!move[0] && !move[1]) return;
		if (move[0] && !move[1]) this.zig = true;
		else if (move[1] && !move[0]) this.zig = false;
		const keys = [...this.held.values()];
		const newest = keys[keys.length - 1];
		const took = this.playerAction(newest.key, newest.code, move);
		this.lastStep = move;
		this.afterTurn(took);
		if (took && +every > 0) this.walkAfter(first ? +delay || +every : +every); // keyRepeat: false steps once a press
	}
	// The step the held keys ask for, [dx, dy]: a step blocked one way slides
	// along the wall the other.
	nextStep() {
		let dx = 0,
			dy = 0;
		for (const h of this.held.values()) {
			if (h.move[0]) dx = h.move[0]; // the later key wins: left then right goes right
			if (h.move[1]) dy = h.move[1];
		}
		// Where to try, best first.
		const tries =
			dx && dy
				? this.zig
					? [
							[0, dy],
							[dx, 0],
						]
					: [
							[dx, 0],
							[0, dy],
						]
				: [[dx, dy]];
		if (dx && dy && this.diagonals) tries.unshift([dx, dy]);
		const p = this.player;
		const open = ([x, y]) => (x || y) && (p.scene.isWalkable(p.x + x, p.y + y) || p.scene.creatureAt(p.x + x, p.y + y));
		return tries.find(open) || tries[0];
	}
	// The way a key moves the hero, [dx, dy], or null.
	keyMove(key, code) {
		return MOVES[key] || (this.diagonals && DIAGONAL_MOVES[key]) || (code && NUMPAD_MOVES[code]) || null;
	}

	// Returns true if the key used up a turn. `move` is the step a direction key takes.
	playerAction(key, code, move = this.keyMove(key, code)) {
		const p = this.player;
		if (this.callHook("the game's onKey", this.config.onKey, key, this) === true) return true;
		if (move) {
			if (!this.diagonals && move[0] && move[1]) return false;
			return p.moveBy(move[0], move[1]);
		}
		if (key === " " || key === ".") return true;
		if (key === "Enter" || key === ">" || key === "<") {
			const exit = this.currentScene.exitAt(p.x, p.y);
			const up = exit && exit.name === "up";
			if (exit && (key === "Enter" || (key === "<") === up)) {
				this.takeExit(exit);
				return true;
			}
			this.say(exit ? "Not that way." : "There is no way through here.", "warn");
			return false;
		}
		if (key === "i" || key === "x") {
			if (!p.items.length) {
				this.say("You're not carrying anything.", "warn");
				return false;
			}
			// What's not worn first, with the same numbers as the side panel, then
			// what the hero has on under its own heading (in slot order, with letters).
			const letters = "abcdefghijklmnopqrstuvwxyz".split("");
			const keys = this.hotkeys().items;
			const rows = p.unworn.map((it, i) => ({
				item: it,
				label: it.label,
				note: `weighs ${weightText(it.weight)}`,
				key: keys[i] || letters.shift(),
			}));
			const worn = this.wornItems();
			if (worn.length) rows.push({ heading: "Equipped" });
			for (const it of worn) rows.push({ item: it, label: it.label, note: `(${it.wornWord})`, key: letters.shift() });
			this.menu(
				key === "i" ? "Use which item?" : "Drop which item?",
				rows,
				(i, row) => (key === "i" ? p.use(row.item) : p.drop(row.item)),
				"Press a key, or Esc to cancel",
			);
			return false;
		}
		if (key === "f") return p.shootNearest(); // fire at the closest enemy in a straight line
		if (key === "h") return this.hurl();
		if (key === "t") return p.lightUp(); // light a torch the hero is carrying
		// Combine things the hero carries (see craft). With diagonals, c is a
		// step to the southeast, so b (build) opens the screen instead.
		if (key === (this.diagonals ? "b" : "c")) {
			this.craft();
			return false;
		}
		if (key === "m" || key === "M") {
			this.toggleSound();
			return false;
		}
		if (key === "l") {
			this.look();
			return false;
		}
		if (key === "j") {
			this.journal();
			return false;
		}
		// A skill's key, or an item's number: use it straight away.
		const keys = this.hotkeys();
		const si = keys.skills.indexOf(key);
		if (si >= 0) return p.useSkill(p.skills[si].name);
		const bi = keys.items.indexOf(key);
		if (bi >= 0) return p.use(p.unworn[bi]);
		return false;
	}

	// The keys shown in the side panel: 1-9 then 0, skills first (in the order
	// they were learned), then the items not worn. A skill with its own key (say "f")
	// doesn't use up a number. Items past the last number get "" and
	// can only be reached through the i list.
	// Returns { skills: [...], items: [...] } lined up with player.skills and player.unworn.
	hotkeys() {
		const p = this.player;
		const taken = p.skills.map((s) => s.def.key).filter(Boolean);
		const free = "1234567890".split("").filter((k) => !taken.includes(k));
		const skills = p.skills.map((s) => s.def.key || free.shift() || "");
		const items = p.unworn.map(() => free.shift() || "");
		return { skills, items };
	}
	// The h key: throw something with `throw` at the closest enemy in line,
	// asking which first if there's more than one kind. Returns true if a turn passes.
	hurl() {
		const p = this.player;
		const things = p.throwables;
		if (!things.length) {
			this.say("You have nothing to throw.", "warn");
			return false;
		}
		if (things.length === 1) return p.throwNearest(things[0]);
		this.menu(
			"Throw which?",
			things.map((it) => ({
				item: it,
				label: it.label,
				note: `up to ${it.def.throw} squares` + (it.equipped ? ` (${it.wornWord})` : ""),
			})),
			(i, row) => p.throwNearest(row.item),
			"Press a key, or Esc to cancel",
		);
		return false;
	}
	// What the hero has on, in slot order (weapon, armor, ring...).
	wornItems() {
		return this.slots()
			.map((slot) => this.player.gear[slot])
			.filter(Boolean);
	}

	// The L key: where the hero is, for finding your way around a map
	// ("This is dungeon k7x2. You are in The Meadow, standing on grass.").
	look() {
		const p = this.player,
			scene = this.currentScene;
		const item = scene.itemAt(p.x, p.y);
		let text = `This is dungeon ${this.seed}. You are ${this.sceneWhere(scene.key)}, standing on ${scene.tileAt(p.x, p.y)}.`;
		if (item) text += ` The ${item.name} is here.`;
		this.say(text, "system");
		this.say(`Add ?seed=${this.seed} to the address to play this dungeon again.`, "system");
	}

	// ---- seeing ----
	// The rule, in one sentence: the hero sees a square when they have a
	// clear line to it, it's within their sight, and something lights it:
	// the sun (a scene with daylight), their own light (a torch's reach, or
	// `dark` squares around them with none lit), or a tile with `light` (a
	// campfire). The one exception is a fire: what a tile lights is seen
	// from any distance down a clear line, by day too, so a campfire shows
	// across a cave or a meadow. updateVision() works that out. `fog` is a
	// separate matter of what is drawn of the squares the hero doesn't see:
	// see drawMap().

	// True once some item or effect gives light. Only then can a scene be
	// dark, so a game with no torches in it plays the same as before.
	hasLights() {
		for (const kind of ["item", "effect"])
			for (const name in this.defs[kind]) if (this.defs[kind][name].light) return true;
		return false;
	}
	// True when the hero is in the dark: no daylight in this scene, and
	// nothing on that gives light. Then their own light reaches `dark` squares.
	get dark() {
		const scene = this.currentScene;
		if (!scene || scene.daylight || !scene.darkSight || !this.hasLights()) return false;
		return this.player.light == null;
	}
	// How far the hero can see here at most, by any light: the scene's
	// `sight`, or their own.
	sightLimit() {
		const scene = this.currentScene;
		return scene.opts.sight != null ? scene.opts.sight : this.player.sight;
	}
	// How far the hero's own light reaches right now: as far as they can
	// see with the sun out or a light that sees normally, `dark` squares in
	// the dark with nothing lit, or what a smaller light reaches.
	sightRadius() {
		const scene = this.currentScene,
			sight = this.sightLimit();
		if (this.dark) return Math.min(sight, scene.darkSight);
		const light = this.player.light;
		return typeof light === "number" && !scene.daylight ? Math.min(sight, light) : sight;
	}
	// What the hero sees right now, by the rule above. `visible` is the
	// squares; `light` is how well each is lit, 1 next to a light down to 0
	// at the edge of its reach; `lit` is the ones a tile lights, for its glow.
	updateVision() {
		const p = this.player,
			scene = this.currentScene;
		this.visible = new Set();
		this.light = new Map();
		this.lit = new Map();
		// The map is made of squares, but light is round: a square is within
		// reach `r` when it is within r of the source as the crow flies, not
		// just within r rows and columns. A whole number gets half a square of
		// slack so the circle looks round on a grid; a fraction is exact, so
		// dark: 1.5 means just the eight squares touching the hero.
		const round = (r) => (Number.isInteger(r) ? r + 0.5 : r) ** 2;
		const sight = this.sightLimit(),
			own = this.sightRadius();
		const edge = round(sight),
			ownEdge = round(own);
		const tiles = scene.litSquares(); // what the campfires light, "x,y" -> how well
		const see = (k, level, lit) => {
			this.visible.add(k);
			this.light.set(k, level);
			scene.explored.add(k);
			if (lit !== undefined) this.lit.set(k, lit);
		};
		// Past the hero's sight only a fire's light shows: the field of view
		// reaches out to the farthest lit square.
		let radius = Math.ceil(sight);
		for (const k of tiles.keys()) {
			const [x, y] = k.split(",");
			radius = Math.max(radius, Math.ceil(Math.hypot(x - p.x, y - p.y)));
		}
		const walls = []; // lit squares that block sight, settled below
		scene.computeFov(p.x, p.y, radius, (x, y) => {
			const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
			const k = cellKey(x, y);
			const lit = tiles.get(k);
			if (d2 > edge && lit === undefined) return;
			// The hero's own light on the square, or -1 past its reach
			const mine = d2 <= ownEdge ? Math.max(0, 1 - Math.sqrt(d2) / Math.max(1, own)) : -1;
			if (lit !== undefined && !scene.isSeeThrough(x, y)) {
				walls.push({ x, y, k, mine, lit });
				return;
			}
			if (mine < 0 && lit === undefined) return; // a clear line, in range, but nothing lights it
			see(k, Math.max(mine, lit ?? 0), lit);
		});
		// A wall a fire lights shows its lit face only from the fire's side:
		// when the hero sees a lit open square beside it. From a room on the
		// other side it's a plain wall, seen or not by the hero's own light.
		for (const w of walls) {
			const litSide = AROUND.some(([dx, dy]) => this.lit.has(cellKey(w.x + dx, w.y + dy)));
			if (!litSide && w.mine < 0) continue;
			see(w.k, Math.max(w.mine, litSide ? w.lit : 0), litSide ? w.lit : undefined);
		}
	}

	// ---- drawing ----
	draw() {
		if (!this.el) return;
		this.drawMap();
		this.drawSide();
		this.drawLog();
	}

	// The map alone: the squares in view, then whatever stands on them.
	drawMap() {
		const scene = this.currentScene,
			d = this.display,
			ts = this.tileset,
			fog = scene.opts.fog != null ? scene.opts.fog : this.config.fog;
		const own = (name) => +(scene.opts[name] != null ? scene.opts[name] : this.config[name]) || 0;
		const variation = own("variation"),
			lighting = own("lighting"),
			fill = +this.config.fill || 0;
		const p = this.player;
		this.updateVision(); // what's on may have changed since the hero last moved: a torch lit, or burnt out
		const cam = this.updateCamera();
		this.animated = false;
		// Fog: the squares the hero sees are drawn as seen, the ones they have
		// seen before dimmed with nothing on them, and the rest not at all.
		// fog: false draws the whole map as if the hero saw all of it: nothing
		// dimmed, every glow and fx, even light. What the hero really
		// sees (this.visible) is the same either way: see updateVision().
		const seen = (k) => !fog || this.visible.has(k);
		// A glow is at its strongest right by the fire, and wavers between flickers:
		// two rolls averaged, so it breathes rather than jumps. It colors the
		// lit squares that count as seen: with fog, the ones the hero sees.
		const glows = scene.hasGlow();
		const glowLevels = fog ? this.lit : scene.litSquares();
		const flame = 0.3 + 0.3 * ((grain(this.flicker, 1, scene.salt) + grain(this.flicker + 1, 1, scene.salt)) / 2);
		let glowing = false;
		// A creature with an effect that glows (burning) lights up the squares
		// around it in that color, like a campfire's glow but only two squares
		// out, and its own square most: "x,y" -> { level, color }.
		const auras = new Map();
		for (const c of scene.creatures) {
			const glow = !c.dead && effectLook(c, "glow");
			if (!glow) continue;
			scene.computeFov(c.x, c.y, 2, (x, y) => {
				const level = 1 - Math.hypot(x - c.x, y - c.y) / 2.5;
				const k = cellKey(x, y);
				if (level > 0 && level > (auras.get(k)?.level ?? 0)) auras.set(k, { level, color: glow });
			});
		}
		if (ts && !this.tilesReady) return; // the sheet is still loading; draw() runs again when it's here
		const inView = (x, y) => x >= cam.x && y >= cam.y && x < cam.x + this.view.width && y < cam.y + this.view.height;
		// Everything goes into a frame first (screen square -> what to draw
		// there), and paint() puts it on the display at the end.
		const frame = new Map();
		// Letters: draw(x, y, ...) puts one letter on a map square; the camera
		// turns map squares into screen squares. A later letter covers an earlier one.
		const draw = (x, y, symbol, color, bg) => {
			if (inView(x, y)) frame.set(cellKey(x - cam.x, y - cam.y), [x - cam.x, y - cam.y, symbol, color, bg]);
		};
		// Pictures: put(x, y, ...) stacks a square of the sheet on a map square
		// (the floor first, then whatever stands on it), painted in `color`.
		// The stacks are drawn at the end.
		const stacks = new Map();
		const put = (x, y, sprite, color, bg) => {
			if (!inView(x, y)) return;
			const k = cellKey(x, y);
			let stack = stacks.get(k);
			if (!stack) stacks.set(k, (stack = { x: x - cam.x, y: y - cam.y, ch: [], fg: [], bg: [] }));
			stack.ch.push(this.spriteKey(sprite));
			stack.fg.push(color);
			stack.bg.push(bg || "transparent");
		};
		// The fill behind each square, kept so things standing on it get the same one.
		const fills = new Map();
		for (let x = Math.max(cam.x, 0); x < cam.x + this.view.width && x < scene.width; x++) {
			for (let y = Math.max(cam.y, 0); y < cam.y + this.view.height && y < scene.height; y++) {
				const k = cellKey(x, y);
				const shown = seen(k);
				if (!shown && !scene.explored.has(k)) continue; // never seen
				const t = scene.tileInfo(x, y);
				// Torchlight: half again as bright next to the hero, fading to a bit
				// under the plain color at the edge of their light. Even with fog off.
				const torch = fog && lighting && !scene.daylight ? 1 + lighting * ((this.light.get(k) ?? 1) * 0.8 - 0.3) : 1;
				let color = t.color;
				if (!shown)
					color = dimColor(color, 0.6); // remembered, out of sight
				else if (torch !== 1) color = dimColor(color, torch);
				if (variation && !t.exactColor)
					color = varyColor(color, grain(x, y, scene.salt) * 2 - 1, grain(x, y, scene.salt + 1) * 2 - 1, variation);
				// The glow of a campfire: its color over the squares it lights,
				// strongest next to it, wavering from one flicker to the next.
				const glow = glows ? glowLevels.get(k) : undefined;
				if (glow) {
					color = mixColor(color, scene.glowAt(k), Math.min(1, glow * flame));
					glowing = true;
				}
				const aura = shown && auras.get(k);
				if (aura) {
					color = mixColor(color, aura.color, Math.min(1, aura.level * flame));
					glowing = true;
				}
				// A faint fill behind the square: a little of the square's color
				// (after fog, torchlight and grain) mixed into the map background.
				const bg = fill ? mixColor(this.config.background, color, Math.min(1, 0.14 * fill)) : null;
				if (bg) fills.set(k, bg);
				if (ts) put(x, y, this.tileSprite(t, x, y, scene, shown), color, bg);
				else draw(x, y, t.symbol, color, bg);
			}
		}
		// Squares showing a hit flash right now: the flash stands in for whoever is there.
		const hits = ts ? this.hits.filter((e) => e.scene === scene && e.frames[e.i] && seen(cellKey(e.x, e.y))) : [];
		const struck = new Set(hits.map((e) => cellKey(e.x, e.y)));
		// Something standing on a square: an item, a creature, the hero.
		const show = (thing, kind) => {
			const k = cellKey(thing.x, thing.y);
			if (!seen(k) && !thing.isPlayer) return;
			if (kind !== "item" && struck.has(k)) return;
			let color = kind === "dead" ? DEAD_COLOR : thing.color;
			if (kind !== "item" && kind !== "dead") {
				// An effect can change the color (poisoned: green), and one that
				// glows flickers it toward the glow's color.
				color = effectLook(thing, "color") || color;
				const glow = effectLook(thing, "glow");
				if (glow) color = mixColor(color, glow, flame);
			}
			if (ts) put(thing.x, thing.y, this.sprite(kind, thing.def), color);
			else draw(thing.x, thing.y, kind === "dead" ? "%" : thing.symbol, color, fills.get(k) || null);
		};
		for (const it of scene.items) show(it, "item");
		for (const c of scene.creatures) if (!c.dead && !c.isPlayer) show(c, c.friendly ? "npc" : "enemy");
		show(p, p.dead ? "dead" : "player"); // the hero's remains after the end: a skull, or % with letters
		// The fx that play over the map without being part of it (a
		// campfire's sparks, the "!" over an npc with a quest to hand out), on
		// every square that counts as seen: see drawFx. Each has a key that stays
		// the same from one drawing to the next, so it carries on playing.
		const fx = [];
		const want = (key, name, x, y, color) => {
			const def = typeof name === "string" ? FX[name] : name; // an effect's fx is its own
			if (def.sprite && !ts) return; // a sprite needs pictures
			if (!seen(cellKey(x, y))) return;
			if (def.above) y--;
			if (inView(x, y)) fx.push({ key, def, x: x - cam.x, y: y - cam.y, color: color || def.color });
		};
		for (const t of scene.tileFx()) want(`${t.name}@${t.x},${t.y}`, t.name, t.x, t.y);
		for (const s of scene.fx.values()) for (const name of s.names) want(`${name}@${s.x},${s.y}`, name, s.x, s.y);
		// The fx of each effect a creature has (poisoned: bubbles), over it.
		for (const c of scene.creatures)
			if (!c.dead) for (const s of c.effects) if (s.def.fx) want(`${s.name}#${c.serial}`, s.def.fx, c.x, c.y);
		const mark = this.config.questMark;
		if (mark)
			for (const c of scene.creatures)
				if (!c.dead && c.friendly && this.offersQuest(c))
					want(`quest#${c.serial}`, "quest", c.x, c.y, typeof mark === "string" ? mark : null);
		const now = performance.now();
		for (const a of this.alerts)
			if (a.who.scene === scene && !a.who.dead && a.until > now)
				want(`alert#${a.who.serial}`, "alert", a.who.x, a.who.y);
		for (const e of hits) put(e.x, e.y, e.frames[e.i], e.color);
		for (const s of stacks.values()) frame.set(cellKey(s.x, s.y), [s.x, s.y, s.ch, s.fg, s.bg]);
		this.paint(frame);
		this.drawFx(fx);
		this.shown = this.visible;
		this.glowing = glowing;
	}

	// The fx over the map: `list` is [{ key, def, x, y, color }], screen
	// squares. The map can only draw by the square, so these are parts of
	// the page laid over the canvas: a sprite is one square of the sheet
	// (the hovering is a CSS animation, zot-hover in zot.css), and dots are
	// an empty box the size of a square that emit() sends them up from. An
	// fx keeps its element from one drawing to the next, so nothing
	// starts over every time the map is drawn.
	drawFx(list) {
		const layer = this.el.fx;
		if (!layer) return;
		layer.hidden = !!this.transition; // nothing plays over a map that's dissolving
		const canvas = this.display.getContainer();
		const square = this.squareSize();
		layer.style.left = canvas.clientLeft + "px"; // inside the canvas's border, if zot.css gives it one
		layer.style.top = canvas.clientTop + "px";
		layer.style.width = canvas.clientWidth + "px";
		layer.style.height = canvas.clientHeight + "px";
		layer.style.setProperty("--zot-unit", this.unit() + "px");
		const keep = new Set();
		for (const e of list) {
			keep.add(e.key);
			let p = this.playing.get(e.key);
			if (p && p.color !== e.color) {
				p.el.remove(); // the color changed: start afresh
				p = null;
			}
			if (!p) {
				p = { def: e.def, color: e.color, el: this.fxElement(e.def, e.color, square), dots: [], next: 0 };
				layer.appendChild(p.el);
				this.playing.set(e.key, p);
			}
			p.el.style.left = e.x * square + "px";
			p.el.style.top = e.y * square + "px";
		}
		for (const [key, p] of this.playing)
			if (!keep.has(key)) {
				p.el.remove();
				this.playing.delete(key);
			}
		this.startEmitter();
	}
	// One fx as a part of the page, `square` pixels across: a sprite is
	// a square of the sheet painted in `color` the way the map paints its
	// squares (the sheet's white shapes take the color); dots get an empty box.
	fxElement(def, color, square) {
		let el;
		if (def.sprite) {
			el = this.spriteCanvas(def.sprite, color, "zot-fx zot-sprite" + (def.hover ? " zot-hover" : ""));
		} else {
			el = document.createElement("div");
			el.className = "zot-fx zot-dots";
		}
		el.style.width = el.style.height = square + "px";
		el.dataset.fx = def.id;
		return el;
	}
	// A canvas of one square of the sheet, painted in `color`, for drawing outside the map.
	spriteCanvas(sprite, color, className) {
		const size = this.tileset.size;
		const [sx, sy] = this.tileMap[this.spriteKey(sprite)];
		const canvas = document.createElement("canvas");
		canvas.className = className;
		canvas.width = canvas.height = size;
		const ctx = canvas.getContext("2d");
		ctx.drawImage(this.tileImage, sx, sy, size, size, 0, 0, size, size);
		ctx.globalCompositeOperation = "source-atop";
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, size, size);
		return canvas;
	}
	// How many pixels of the page a map square takes.
	squareSize() {
		const ts = this.tileset;
		if (ts) return ts.size * ts.scale;
		return this.display.getContainer().clientWidth / this.view.width || this.config.fontSize;
	}
	// One sheet pixel on the page: with letters, a sixteenth of a square (at least a pixel).
	unit() {
		return Math.max(1, this.squareSize() / (this.tileset ? this.tileset.size : 16));
	}
	// Dots fly up from (or swirl around) every dot fx on the page: every
	// 40 milliseconds, each that is due sends out one more (`rate` a second,
	// give or take) and lets go of those whose time is up. Runs while there
	// are any, except while the page is hidden.
	startEmitter() {
		let any = false;
		for (const p of this.playing.values()) if (!p.def.sprite) any = true;
		if (!any) {
			clearInterval(this.emitter);
			this.emitter = null;
		} else if (!this.emitter) {
			this.emitter = setInterval(() => {
				if (!document.hidden) this.emit();
			}, 40);
		}
	}
	// One step of the dots: `now` is the time in milliseconds (the tests pass their own).
	emit(now = performance.now()) {
		const square = this.squareSize(),
			unit = this.unit();
		// A number, or one picked from a [least, most] pair.
		const pick = (v, fallback) => (v == null ? fallback : Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v);
		for (const p of this.playing.values()) {
			const d = p.def;
			if (d.sprite) continue;
			p.dots = p.dots.filter((dot) => dot.until > now || (dot.el.remove(), false));
			if (now < p.next) continue;
			const [left, top, right, bottom] = d.area || [0, 0, 1, 1];
			const colors = asList(p.color);
			const size = Math.max(1, Math.round(pick(d.size, 1) * unit)),
				life = pick(d.life, 800);
			const dot = document.createElement("i");
			dot.className = "zot-dot";
			dot.style.width = dot.style.height = size + "px";
			dot.style.setProperty("--zot-dot", colors[Math.floor(Math.random() * colors.length)]);
			dot.style.setProperty("--zot-glow", (d.glow || 0) * unit + "px");
			dot.style.setProperty("--zot-life", life + "ms");
			if (d.orbit != null) {
				// A swirling dot sits in the middle of the square, and zot-swirl
				// (zot.css) turns it around that point: from some angle, `orbit`
				// out, round by `turns` and in by `pull` of the way.
				const from = pick(d.orbit, 6) * unit;
				dot.classList.add("zot-swirl");
				dot.style.left = dot.style.top = square / 2 - size / 2 + "px";
				dot.style.setProperty("--zot-angle", Math.round(Math.random() * 360) + "deg");
				dot.style.setProperty("--zot-turn", pick(d.turns, 1) * 360 + "deg");
				dot.style.setProperty("--zot-from", from + "px");
				dot.style.setProperty("--zot-to", from * (1 - pick(d.pull, 1)) + "px");
			} else {
				dot.style.left = (left + Math.random() * (right - left)) * square - size / 2 + "px";
				dot.style.top = (top + Math.random() * (bottom - top)) * square - size / 2 + "px";
				dot.style.setProperty("--zot-dx", (Math.random() * 2 - 1) * (d.drift || 0) * unit + "px");
				dot.style.setProperty("--zot-dy", -pick(d.rise, 16) * unit + "px");
			}
			p.el.appendChild(dot);
			p.dots.push({ el: dot, until: now + life });
			p.next = now + (1000 / (d.rate || 1)) * (0.5 + Math.random()); // a rate a second, give or take half
		}
	}

	// Puts a frame on the display and keeps it as what's on screen. While a
	// change of scene plays, the old map shows in place of the new one
	// until it has gone, and the squares in `hidden` stay blank.
	paint(frame) {
		const t = this.transition;
		if (t && t.phase === "out") frame = t.frame;
		this.display.clear();
		for (const [k, cell] of frame) {
			if (t && t.hidden.has(k)) continue;
			this.display.draw(...cell);
		}
		this.lastFrame = frame;
	}

	// ---- the change of scene ----
	// The old map dissolves square by square until the screen is blank,
	// then the new one fills in the same way: `transition` milliseconds
	// all told. The game itself has already moved on; only the drawing
	// takes its time, and keys are ignored until it is done.
	startTransition(hold = 0, then = null) {
		const ms = +this.config.transition;
		if (!(ms > 0) || !this.el || !this.lastFrame) return false;
		const old = this.transition;
		if (old) cancelAnimationFrame(old.timer); // another change before the last one finished: carry on from what's on screen
		if (this.el.fx) this.el.fx.hidden = true; // the fx come back with the new scene (see drawFx)
		const cells = [];
		for (let x = 0; x < this.view.width; x++) for (let y = 0; y < this.view.height; y++) cells.push(cellKey(x, y));
		const t = {
			phase: "out",
			frame: this.lastFrame,
			hidden: old ? old.hidden : new Set(),
			order: jumble(cells),
			ms,
			hold, // milliseconds the screen stays blank between going and coming back
			then, // runs once the screen is blank and the hold is over, as the map comes back
			start: null,
			timer: 0,
		};
		this.transition = t;
		const loop = (now) => {
			this.stepTransition(now);
			if (this.transition === t) t.timer = requestAnimationFrame(loop);
		};
		t.timer = requestAnimationFrame(loop);
		return true;
	}
	// One step of the change of scene, for the time `now` (milliseconds).
	stepTransition(now) {
		const t = this.transition;
		if (!t) return;
		if (t.start == null) t.start = now;
		const n = t.order.length;
		const i = Math.max(0, Math.min(n, Math.round(((now - t.start) / (t.ms / 2)) * n))); // how many squares have gone (or come back) by now
		if (t.phase === "out") {
			for (let j = 0; j < i; j++) t.hidden.add(t.order[j]);
			if (i < n) return this.paint(t.frame);
			// All gone: from here in the new scene is drawn, still hidden, and shows a square at a time (after the hold, if any).
			t.phase = "in";
			t.order = jumble(t.order);
			t.start = now + (t.hold || 0);
			return this.drawMap();
		}
		if (now < t.start) return; // the hold: blank
		if (t.then) {
			const then = t.then;
			t.then = null;
			then();
		}
		for (let j = 0; j < i; j++) t.hidden.delete(t.order[j]);
		if (i < n) return this.paint(this.lastFrame);
		this.transition = null;
		this.drawMap();
	}
	// The map dissolves away, the screen stays blank for `hold` milliseconds,
	// and the same map fills back in: a night's sleep, a blow to the head.
	// `then(game)` runs as it comes back (at once when transition: 0), with
	// keys ignored until it has.
	//   game.dissolve(2000, () => game.say("You wake up."))
	dissolve(hold, then) {
		const run = () => {
			if (typeof then === "function") this.callHook("your dissolve's then", then, this);
			if (this.el) this.draw();
		};
		if (!this.startTransition(+hold || 0, run)) run();
	}

	// Which square of the sheet shows a thing: its own `tile`, else the
	// tileset's square for its name, else the plain one for its kind
	// ("player", "enemy", "npc" or "item"). With `frames`, the current one.
	// `facing` ([dx, dy]) picks from `tileFacing` (or the map's `idFacing`),
	// a square per direction, so an arrow in flight points the way it's going.
	sprite(kind, def, facing) {
		const map = this.tileset ? this.tileset.map : {}; // with letters there's no sheet: a thing's own `tile`, or nothing
		if (facing) {
			const turned = def.tileFacing || map[def.id + "Facing"];
			const s = turned && turned[directionName(...facing)];
			if (s) return s;
		}
		if (kind === "dead") return map.dead || map.unknown; // the hero's remains: the sheet's skull
		const frames = def.frames || map[def.id + "Frames"];
		if (frames) return this.currentFrame(frames);
		return def.tile || map[def.id] || map[kind] || map.unknown;
	}
	currentFrame(frames) {
		this.animated = true;
		return frames[this.frame % frames.length];
	}
	// The same for a map square. The sheet can give a tile another square for
	// when the scene is an overworld (the stairs down there are the mouth of a
	// mine shaft).
	tileSprite(t, x, y, scene, seen = true) {
		const map = this.tileset.map;
		const frames = t.frames || map[t.id + "Frames"];
		if (frames) {
			if (!seen) return frames[0]; // remembered, out of sight: it holds still
			return t.glow ? frames[this.flicker % frames.length] : this.currentFrame(frames); // a glowing tile's frames flicker with its glow
		}
		let s = t.tile || map[t.id] || map.unknown;
		const outdoors = map[t.id + "Outdoors"];
		if (outdoors && scene.type === "overworld") s = outdoors;
		// A list of squares: pick one, always the same one for this map square
		// (whatever `variation` says: that is about color). A third number on
		// a square is its weight (1 if left out).
		if (Array.isArray(s[0])) {
			const weight = (sq) => (sq.length > 2 ? sq[2] : 1);
			let roll = grain(x, y, scene.salt + 2) * s.reduce((sum, sq) => sum + weight(sq), 0);
			let i = 0;
			while (i < s.length - 1 && roll >= weight(s[i])) roll -= weight(s[i++]);
			s = s[i].length > 2 ? s[i].slice(0, 2) : s[i];
		}
		return s;
	}
	// rot.js wants a name for each square of the sheet; we use "col,row".
	spriteKey(s) {
		if (!Array.isArray(s) || s.length !== 2 || typeof s[0] !== "number" || typeof s[1] !== "number") {
			throw new Error(
				`Zot: a tile must be a square of the sheet, like tile: [3, 9] (column, row: see tiles/guide.png). Got ${JSON.stringify(s)}.`,
			);
		}
		const key = s[0] + "," + s[1];
		if (!this.tileMap[key]) {
			const step = this.tileset.size + (this.tileset.gap || 0);
			this.tileMap[key] = [s[0] * step, s[1] * step];
		}
		return key;
	}

	// Which map square is in the top-left corner of the screen. The hero
	// stays in the middle until the view reaches the edge of the map. A map
	// smaller than the screen sits in the middle of it (a negative camera).
	updateCamera() {
		const scene = this.currentScene,
			p = this.player,
			view = this.view;
		const along = (at, size, room) =>
			size <= room ? -Math.floor((room - size) / 2) : Math.max(0, Math.min(at - Math.floor(room / 2), size - room));
		this.camera = { x: along(p.x, scene.width, view.width), y: along(p.y, scene.height, view.height) };
		return this.camera;
	}

	// Fills in the side panel. Each line writes one part of the screen.
	drawSide() {
		const p = this.player,
			cfg = this.config;

		this.write("zot-title", cfg.title);
		this.show("zot-title", !!cfg.title);
		this.write("zot-name", p.name);
		this.write("zot-level", p.level);

		this.bar("zot-hp", "HP", p.hp, p.maxHp);
		// Near death: the page gets a zot-low-hp class, and zot.css turns things red.
		const low = cfg.lowHp > 0 && p.maxHp > 0 && !p.dead && p.hp / p.maxHp <= cfg.lowHp;
		this.el.root.classList.toggle("zot-low-hp", low);
		this.bar("zot-mp", "MP", p.mp, p.maxMp); // hidden when the hero has no MP
		this.bar("zot-xp", "XP", p.xp, p.xpToNext());

		// With gear (or an effect) adding to it: the base struck through, a
		// badge for what it adds, then the total ("~~4~~ +2 6"). Without: just
		// the number.
		for (const stat of ["attack", "defense", "strength"]) {
			const el = this.find(`zot-${stat}`);
			if (!el) continue;
			el.textContent = "";
			const bonus = p.bonus(stat);
			if (bonus) {
				const base = document.createElement("s");
				base.textContent = p.base[stat];
				const fromEffects = p.effects.some((e) => e.def[stat]);
				const fromGear = Object.values(p.gear).some((it) => it.def[stat]);
				const from = fromGear && fromEffects ? "gear and effects" : fromEffects ? "effects" : "gear";
				el.append(base, this.badge(stat, bonus, from), " ");
			}
			el.append(String(p[stat]));
		}
		// What everything weighs over what the hero can carry ("7/20"); red when
		// it's over: strength can drop (a ring taken off) after the hero loaded up.
		this.write("zot-weight", `${weightText(p.load)}/${weightText(p.carry)}`);
		const weight = this.find("zot-weight");
		if (weight) weight.classList.toggle("zot-overloaded", p.overloaded);
		this.write("zot-gold", p.gold);
		const scene = this.currentScene;
		this.write("zot-scene", scene.number ? `${scene.number}/${this.sceneCount}` : this.sceneTitle(scene.key));
		this.write("zot-scene-name", scene.name || "");
		this.write("zot-turn", this.turn);
		this.write("zot-seed", this.seed);

		// Quests: the ones the hero is on, with how far along each one is.
		const open = this.quests.filter((q) => q.status !== "done");
		const quests = this.find("zot-quests");
		if (quests) {
			quests.innerHTML = "";
			for (const q of open)
				this.addRow(quests, "", q.name, this.questNote(q), q.status === "ready" ? "zot-quest-ready" : "");
		}
		this.show("zot-quests-box", open.length > 0);

		// Effects: what the hero has on them, with how many turns are left.
		const effects = this.find("zot-effects");
		if (effects) {
			effects.innerHTML = "";
			for (const s of p.effects)
				this.addRow(effects, "", s.def.name, s.turns == null ? "" : `${s.turns} turn${s.turns === 1 ? "" : "s"}`);
		}
		this.show("zot-effects-box", p.effects.length > 0);

		const keys = this.hotkeys();
		const skills = this.find("zot-skills");
		if (skills) {
			skills.innerHTML = "";
			p.skills.forEach((s, i) => {
				const key = keys.skills[i];
				const notes = [];
				if (s.def.mp) notes.push(`${s.def.mp} MP`);
				if (s.cooldown > 0) notes.push(`${s.cooldown} turns`);
				this.addRow(skills, key, s.def.name, notes.join(", "));
			});
		}
		this.show("zot-skills-box", p.skills.length > 0);

		// What the hero has on: one line per slot the game knows about
		// (weapon, armor, ring... in the order the items were defined).
		const gear = this.find("zot-gear");
		if (gear) {
			gear.innerHTML = "";
			for (const slot of this.slots()) {
				const row = document.createElement("li");
				const name = document.createElement("span");
				name.className = "zot-slot";
				name.textContent = slot;
				row.append(name, " ");
				if (p.gear[slot]) row.append(p.gear[slot].label, ...this.badges(p.gear[slot]));
				else row.append(Object.assign(document.createElement("small"), { textContent: "nothing" }));
				gear.appendChild(row);
			}
		}
		this.show("zot-gear-box", this.slots().length > 0);

		// The inventory: what's carried and not worn, numbered. Everything the
		// hero has, worn or not, weighs on the Weight line.
		const items = p.unworn;
		const list = this.find("zot-inventory");
		if (list) {
			list.innerHTML = "";
			items.forEach((it, i) => this.addRow(list, keys.items[i], it.label, "", "", it));
			if (!items.length) list.innerHTML = "<li><small>nothing</small></li>";
		}

		const button = this.find("zot-sound");
		if (button) {
			const muted = this.sound.muted;
			button.textContent = muted ? "🔇" : "🔊";
			button.title = (muted ? "Sound off" : "Sound on") + " (M)";
			button.classList.toggle("zot-sound-off", muted);
			button.setAttribute("aria-pressed", String(!muted));
		}
		this.callHook("the game's onDraw", cfg.onDraw, this);
	}

	// Every message kept (the last 200), scrolled to the newest; scroll up
	// for the rest. New ones (since the last key press) are brighter.
	drawLog() {
		const log = this.el.log;
		if (!log) return;
		log.innerHTML = "";
		for (const m of this.messages) {
			const line = document.createElement("div");
			line.className = "zot-msg zot-msg-" + m.kind + (m.id > this.seenMessages ? " zot-msg-new" : "");
			line.textContent = m.text;
			log.appendChild(line);
		}
		log.scrollTop = log.scrollHeight;
	}
}

// The `color` or `glow` a creature's effects give it: the newest effect
// that has one wins. Undefined if none does.
function effectLook(creature, key) {
	for (let i = creature.effects.length - 1; i >= 0; i--) {
		const v = creature.effects[i].def[key];
		if (v) return v;
	}
	return undefined;
}

// A gear modifier's fields that aren't changes to the item (see game.gearModifier).
const GEAR_MODIFIER_META = ["id", "name", "rarity", "level", "scenes", "slot"];
// The slots a gear modifier names (slot: "weapon", or a table for each: { weapon: {...}, armor: {...} }); none means anything worn.
function gearModifierSlots(mod) {
	const tables = Object.keys(mod).filter(
		(k) => !GEAR_MODIFIER_META.includes(k) && mod[k] != null && typeof mod[k] === "object",
	);
	return asList(mod.slot).concat(tables.filter((k) => !asList(mod.slot).includes(k)));
}
function gearModifierFits(mod, def) {
	if (!def.slot) return false;
	const slots = gearModifierSlots(mod);
	return !slots.length || slots.includes(def.slot);
}
// The changes a gear modifier makes to gear of `slot`: [[field, change], ...], in
// the order they're written, the ones under another slot's name left out.
function gearModifierChanges(mod, slot) {
	const out = [];
	for (const k in mod) {
		if (GEAR_MODIFIER_META.includes(k)) continue;
		if (mod[k] != null && typeof mod[k] === "object") {
			if (k === slot) for (const f in mod[k]) out.push([f, mod[k][f]]);
		} else out.push([k, mod[k]]);
	}
	return out;
}
// Where an enemy or item turns up: the scenes its `scenes` names, the
// levels its `level` says, or anywhere when it says neither.
//   scenes: "mine" -> that scene.   scenes: ["mine", "lair"] -> both.
//   level: 3 -> every scene of level 3 (a numbered scene's level is its number).
//   level: [2, 5] -> those two.   level: { from: 2, to: 4 } -> 2 to 4.   { from: 3 } -> 3 and up.   { to: 2 } -> 1 and 2.
// A number in `scenes` still means a level, so scenes: ["mine", 3] works too.
function appearsIn(d, scene) {
	if (d.scenes == null && d.level == null) return true;
	return (d.scenes != null && sceneMatches(d.scenes, scene)) || (d.level != null && sceneMatches(d.level, scene));
}
function sceneMatches(scenes, scene) {
	if (scenes == null) return true;
	if (typeof scenes === "string") return scenes === scene.key;
	if (typeof scenes === "number") return scenes === scene.level;
	if (Array.isArray(scenes)) return scenes.some((s) => sceneMatches(s, scene));
	if (typeof scenes === "object") {
		const from = scenes.from == null ? 1 : scenes.from,
			to = scenes.to == null ? Infinity : scenes.to;
		return scene.level >= from && scene.level <= to;
	}
	return true;
}

export {
	Game,
	Creature,
	Item,
	Scene,
	Sound,
	random,
	chance,
	pick,
	shuffle,
	distance,
	directionName,
	TILES,
	RARITY,
	SOUNDS,
	OPTIONS,
};
// Zot.game is the most recent game.
export { currentGame as game };
// The same Zot as the import, as a global: handy in the browser console (Zot.game.player.hp = 99).
window.Zot = Zot;
