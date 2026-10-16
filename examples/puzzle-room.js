// =====================================================================
//  THE PUZZLE ROOM
//  One big room with different kinds of switches, locks, and puzzles.
// =====================================================================

import * as Zot from "../zot.js";

const game = new Zot.Game({
	title: "The Puzzle Room",
	enemiesPerScene: 0, // nothing at random: it's all drawn on the map below
	itemsPerScene: 0,
	chestsPerScene: 0,
	help:
		"<span><b>Move</b> arrows / WASD</span>" +
		"<span><b>Use</b> its number</span>" +
		"<span><b>Items</b> i</span>" +
		"<span><b>Combine</b> c</span>" +
		"<span><b>Look</b> l</span>" +
		"<span><b>Mute</b> m</span>",
});

game.hero({
	name: "Tester",
	hp: 10,
	mp: 0, // no skills here, so no MP bar
	strength: 20, // room in the pockets for everything
});

// ---------------------------------------------------------------------
//  A SIGN AND A NOTE
// ---------------------------------------------------------------------
// Walking into a sign runs its onBump. Returning false means no turn passes.
game.tile("sign", {
	symbol: "s",
	tile: [48, 4],
	color: "#d4a84a",
	walkable: false,
	onBump() {
		game.say("Walk into things. Step on buttons. See what happens. Press c to combine items into new items.");
		return false;
	},
});

// Using a note writes it to the log. Returning false keeps it in the pack.
game.item("note", {
	name: "Note",
	symbol: "?",
	tile: [33, 15],
	color: "tan",
	weight: 0,
	unique: true, // only where the map puts it, never scattered at random
	onUse() {
		game.say('"Explore this room and see if you can figure out what is controlled by what code."', "speech");
		return false;
	},
});

// ---------------------------------------------------------------------
//  A DRAWER
// ---------------------------------------------------------------------
// Every square has flags of its own, a notepad like game.flags. The
// legend puts a potion in this drawer's (flags: { holds: "potion" }), and
// a tile's onBump gets the square last, so it can see what's there.
game.item("potion", {
	symbol: "!",
	color: "hotpink",
	onUse(player) {
		player.heal(8);
	},
});
game.tile("drawer", {
	symbol: "d",
	tile: [9, 10],
	color: "#b07a34",
	walkable: false,
	onBump(player, x, y, game, here) {
		if (!here.flags.holds) {
			game.say("String, corks, a pencil stub.");
			return false;
		}
		game.say("Among the string and the corks, a potion.", "item");
		game.give(here.flags.holds);
		here.flags.holds = null;
	},
});

// ---------------------------------------------------------------------
//  BOOKSHELVES
// ---------------------------------------------------------------------
// All alike, but the scene's onEnter (at the bottom) picks one at random
// the first time the hero comes in and hides a potion in its flags. The
// same seed picks the same shelf.
game.tile("bookshelf", {
	symbol: "b",
	tile: [3, 7],
	color: "#bf8601",
	walkable: false,
	seeThrough: false,
	onBump(player, x, y, game, here) {
		if (!here.flags.holds) {
			game.say("Damp books, swollen shut.");
			return false;
		}
		game.say("Behind a row of books, a potion.", "item");
		game.give(here.flags.holds);
		here.flags.holds = null;
	},
});

// ---------------------------------------------------------------------
//  A LEVER AND TWO LANTERNS
// ---------------------------------------------------------------------
// Walking into the lever swaps it for the thrown one and every lantern
// (the scene's tilesNamed finds them) for a lit one, and back. A lit lantern
// gives light, a glow that flickers over the squares around it, and sparks.
game.tile("lantern", {
	symbol: "*",
	tile: [3, 15],
	color: "#55555f",
	walkable: false,
});
game.tile("lanternLit", {
	symbol: "*",
	tile: [3, 15],
	color: "#ffe08a",
	walkable: false,
	light: 5,
	glow: "#ffcf5a",
	fx: "sparks",
});
function throwLever(player, x, y, game, here) {
	const scene = here.scene;
	const on = scene.tileAt(x, y) === "lever";
	scene.setTile(x, y, on ? "leverOn" : "lever");
	for (const s of scene.tilesNamed("lantern", "lanternLit")) scene.setTile(s.x, s.y, on ? "lanternLit" : "lantern");
	if (on) {
		game.say("The lever clunks over and the lanterns flare up.");
	} else {
		game.say("The lanterns go out.");
	}
}
game.tile("lever", {
	symbol: "/",
	tile: [3, 10],
	color: "#9a9aae",
	walkable: false,
	onBump: throwLever,
});
game.tile("leverOn", {
	symbol: "\\",
	tile: [4, 10],
	color: "#ffd23d",
	walkable: false,
	onBump: throwLever,
});

// ---------------------------------------------------------------------
//  A PRESSURE PLATE
// ---------------------------------------------------------------------
// Stepping on a tile runs its onStep. This one turns the bookcase in
// front of it into floor, and itself into a plate that stays down.
game.tile("bookcase", {
	symbol: "B",
	tile: [3, 7],
	color: "#bf8601",
	walkable: false,
	seeThrough: false,
});
game.tile("plate", {
	symbol: "_",
	tile: [11, 15],
	color: "#9a9aae",
	onStep(player, x, y, game, here) {
		const scene = here.scene;
		scene.setTile(x, y, "platePushed");
		for (const s of scene.tilesNamed("bookcase")) scene.setTile(s.x, s.y, "floor");
		game.say("The plate sinks under your foot, and the bookcase grinds aside.", "good");
	},
});
game.tile("platePushed", { symbol: "_", tile: [16, 22], color: "#6e7382" });

// ---------------------------------------------------------------------
//  THREE SWITCHES AND A VAULT DOOR
// ---------------------------------------------------------------------
// Each switch flips when walked into. After every flip the three are
// read left to right: the right pattern opens the vault, any other
// shuts it.
const COMBINATION = [trueOrFalse(), trueOrFalse(), trueOrFalse()];

function trueOrFalse() {
	return Zot.pick([true, false]);
}

function flipSwitch(player, x, y, game, here) {
	const scene = here.scene;
	const up = scene.tileAt(x, y) === "switchUp";
	scene.setTile(x, y, up ? "switchDown" : "switchUp");

	checkDoorLock(game, scene);
}

function checkDoorLock(game, scene) {
	const setting = scene.tilesNamed("switchUp", "switchDown").map((s) => scene.tileAt(s.x, s.y) === "switchUp");
	const door = scene.tilesNamed("vaultDoor", "vaultOpen")[0];
	if (setting.join() === COMBINATION.join()) {
		scene.setTile(door.x, door.y, "vaultOpen");
		game.say("The heavy vault door slowly swings open.", "good");
		game.play("quest");
	} else if (scene.tileAt(door.x, door.y) === "vaultOpen") {
		scene.setTile(door.x, door.y, "vaultDoor");
		game.say("The vault door swings shut and locks.", "warn");
	} else game.say("Click.");
}

game.tile("switchUp", {
	symbol: "/",
	tile: [4, 10],
	color: "#4caf50",
	walkable: false,
	onBump: flipSwitch,
});
game.tile("switchDown", {
	symbol: "\\",
	tile: [3, 10],
	color: "#c0392b",
	walkable: false,
	onBump: flipSwitch,
});
game.tile("vaultDoor", {
	symbol: "#",
	tile: [0, 10],
	color: "#8a9aaa",
	walkable: false,
	seeThrough: false,
	onBump() {
		game.say("A locked vault door.");
		return false;
	},
});
game.tile("vaultOpen", { symbol: "'", tile: [2, 9], color: "#8a9aaa" });

// Gold is an item that isn't kept: picking it up adds to the hero's gold.
game.item("gold", {
	symbol: "$",
	tile: [41, 3],
	color: "gold",
	keep: false,
	onPickup(player) {
		player.gold += 25;
		game.say("You find 25 gold.", "item");
	},
});

// ---------------------------------------------------------------------
//  A CHEST, A KEY AND A LOCKED DOOR
// ---------------------------------------------------------------------
// The chest is drawn on the map (=) and the scene's `chests` list says
// what's in it. The locked door (the legend's K) names the key it
// wants; walking into it with the key opens it, and the key is used up.
game.item("iron_key", {
	name: "Iron Key",
	symbol: "k",
	tile: [33, 11],
	color: "#9a9aae",
	weight: 0,
	unique: true,
});

// ---------------------------------------------------------------------
//  A BUTTON AND A GRATE
// ---------------------------------------------------------------------
// The button raises the grate. game.after runs something once that many
// of the hero's turns have passed: the grate drops again, unless the
// hero is standing in the way, in which case it tries again next turn.
const GRATE_TURNS = 5;
game.tile("button", {
	symbol: "o",
	tile: [15, 12],
	color: "#c0392b",
	walkable: false,
	onBump(player, x, y, game, here) {
		const grate = here.scene.tilesNamed("grate")[0];
		if (!grate) {
			game.say("The button is already down.");
			return false;
		}
		here.scene.setTile(grate.x, grate.y, "grateOpen");
		game.say("The grate rattles up. Something above it is ticking.", "good");
		game.after(GRATE_TURNS, dropGrate);
	},
});
function dropGrate() {
	const scene = game.currentScene;
	const grate = scene.tilesNamed("grateOpen")[0];
	if (!grate) return;
	const p = game.player;
	if (p.x === grate.x && p.y === grate.y) {
		game.after(1, dropGrate); // the hero is under it
		return;
	}
	scene.setTile(grate.x, grate.y, "grate");
	game.say("The grate drops shut with a clang.");
}
game.tile("grate", {
	symbol: "#",
	tile: [13, 16],
	color: "#9a9aae",
	walkable: false,
	onBump() {
		game.say("An iron grate. There's a button on the wall beside it.");
		return false;
	},
});
game.tile("grateOpen", { symbol: "'", tile: [2, 9], color: "#9a9aae" });

// ---------------------------------------------------------------------
//  SPIKES
// ---------------------------------------------------------------------
// A trap: an onStep that hurts whoever steps there. The hero can die.
game.tile("spikes", {
	symbol: "^",
	tile: [22, 0],
	color: "#c0392b",
	onStep(player) {
		game.say("Spikes! You step on them.", "hurt");
		player.hurt(2);
	},
});

// ---------------------------------------------------------------------
//  TWO CHALK RINGS
// ---------------------------------------------------------------------
// Stepping on one puts the hero down beside the other. Beside, not on
// it: landing on a ring would set it off too. The swirl is the portal's
// fx: a few motes circling in toward the middle of the square.
game.tile("ring", {
	symbol: "O",
	tile: [29, 12],
	color: "#b784ff",
	fx: "swirl",
	onStep(player, x, y, game, here) {
		const other = here.scene.tilesNamed("ring").find((s) => s.x !== x || s.y !== y);
		player.moveTo(other.x + (other.x < x ? 1 : -1), other.y);
		game.say("The room lurches, and you're standing on the far side of it.");
	},
});

// ---------------------------------------------------------------------
//  A ROD, A GEAR, A WINCH AND THE GATE
// ---------------------------------------------------------------------
// Two things carried make a third: press c in the game, or use one of
// them.
game.item("iron_rod", {
	name: "Iron Rod",
	symbol: "|",
	tile: [22, 15],
	color: "#9a9aae",
	unique: true,
});
game.item("gear", {
	name: "Brass Gear",
	symbol: "*",
	tile: [28, 12],
	color: "#d4a84a",
	unique: true,
});
game.item("crank", {
	name: "Crank Handle",
	symbol: "L",
	tile: [25, 12],
	color: "#d4a84a",
	unique: true,
});
game.recipe("crank", {
	combine: ["iron_rod", "gear"],
	say: "The gear fits the rod's square end. A crank handle, more or less.",
});

// The winch wants the crank (player.has). With it, the gate becomes one
// that can be walked through; stepping onto that wins the game.
game.tile("winch", {
	symbol: "W",
	tile: [11, 12],
	color: "#9a9aae",
	walkable: false,
	onBump(player, x, y, game, here) {
		if (!player.has("crank")) {
			game.say(
				"A winch, its chain running off to the gate. Its spindle has a " + "square hole where a handle should be.",
				"warn",
			);
			return false;
		}
		const gate = here.scene.tilesNamed("gate")[0];
		if (!gate) {
			game.say("The gate is already up.");
			return false;
		}
		here.scene.setTile(gate.x, gate.y, "gateOpen");
		game.say("You fit the crank and heave. Across the room, the gate lifts.", "good");
		game.play("levelup");
	},
});
game.tile("gate", {
	symbol: "#",
	tile: [13, 16],
	color: "#ffd23d",
	walkable: false,
	seeThrough: false,
	onBump() {
		game.say("A heavy gate, chained down. The chain runs to a winch on the wall.");
		return false;
	},
});
game.tile("gateOpen", {
	symbol: "'",
	tile: [2, 9],
	color: "#ffd23d",
	onStep() {
		game.win("You walk out through the gate. That's everything in the room.");
	},
});

// ---------------------------------------------------------------------
//  THE ROOM
// ---------------------------------------------------------------------
// Drawn by hand, one letter per square; the legend says what each
// letter is. fog: false shows all of it from the start.
game.scene("room", {
	name: "The Puzzle Room",
	daylight: true,
	fog: false,
	map: `
		######################################
		###1........###.###.###.###...L/L....#
		#$#1........#r#.#!#.#g#.#$#..........#
		#V#1........#K#.#S#.#H#.#G#..........#
		#.......=............p..o............#
		#....................................#
		#....................................#
		#.............xxx....................#
		#.............xxx................W...X
		#.............xxx....................#
		#....................................#
		#....................................#
		#......O......................O......#
		#s@..n...............................#
		#...d...bbbbbbb......................#
		######################################
	`,
	legend: {
		s: "sign",
		n: "note",
		d: { tile: "drawer", flags: { holds: "potion" } },
		b: "bookshelf",
		L: "lantern",
		"/": "lever",
		p: "plate",
		H: "bookcase",
		g: "gear",
		1: "switchUp",
		1: "switchUp",
		1: "switchUp",
		V: "vaultDoor",
		$: "gold",
		K: { tile: "lockedDoor", key: "iron_key" },
		r: "iron_rod",
		S: "secretDoor",
		"!": "potion",
		o: "button",
		G: "grate",
		x: "spikes",
		O: "ring",
		W: "winch",
		X: "gate",
	},
	chests: ["iron_key"], // what the = holds
	// The first time the hero comes in: one shelf, picked at random, hides a potion.
	onEnter(scene) {
		Zot.pick(scene.tilesNamed("bookshelf")).flags.holds = "potion";
	},
});

game.start();
