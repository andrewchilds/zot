// zot-completions.js — what the editor knows about Zot: every public name
// with a line about it, and the completion source that offers the right
// names for where the cursor is. The descriptions follow README.md and the
// comments in zot.js. test/completions.test.js checks the tables against
// zot.js, so a method added there without a line here fails the tests.
//
// Each table maps a name to an entry: a description, or an object with
//   doc     the description, shown beside the list
//   type    for an option, what to write ("number", '"chase" | "wander"');
//           for a member, the class of its value ("Creature"), so that
//           player.scene. is completed as a Scene
//   params  the parameters, "name" or "name:Class". A hook in an options
//           table is inserted as a method with them filled in; on a method
//           they are shown. The class says what the parameter is, so
//           attacker. is completed as a Creature inside onHurt
//   kind    the icon for a Zot export: "class" or "constant"

import { syntaxTree, snippetCompletion } from "./lib/codemirror.js";

const STRING = "string",
	NUMBER = "number",
	BOOL = "true | false",
	COLOR = "string",
	NAMES = "name | [names]",
	LINE = "string | (npc, player) => string";

// The tiles and sounds zot.js has built in, and the fx it can play.
// Hard-coded rather than imported: importing zot.js needs rot.js on the page.
export const BUILT_IN_TILES = [
	"wall",
	"floor",
	"grass",
	"tree",
	"water",
	"door",
	"openDoor",
	"lockedDoor",
	"secretDoor",
	"chest",
	"openChest",
	"stairsDown",
	"stairsUp",
	"portal",
];
export const BUILT_IN_SOUNDS = [
	"walk",
	"hit",
	"kill",
	"pickup",
	"shoot",
	"chest",
	"stairsDown",
	"stairsUp",
	"magic",
	"quest",
	"levelup",
	"craft",
];
export const FX = ["sparks", "swirl", "quest", "alert"];
export const MAP_KINDS = ["dungeon", "rooms", "cave", "maze", "overworld"];
export const AI_KINDS = ["chase", "wander", "still", "flee"];
export const RARITIES = ["common", "uncommon", "rare", "legendary"];
export const SLOTS = ["weapon", "armor", "light", "ring"];

// ---- the options of each definition ----

// The look of anything drawn on the map, with letters or with pictures.
const LOOK = {
	symbol: { type: STRING, doc: "The letter or emoji drawn for it with letters" },
	tile: {
		type: "[column, row]",
		doc: "With pictures, which square of the sheet it is: open tiles/guide.png to see them all",
	},
	frames: {
		type: "[[column, row], ...]",
		doc: "With pictures, squares shown in turn, for something that moves: a bat that flaps, flames",
	},
	color: { type: COLOR, doc: 'Any CSS color: "lime", "#ff9b3d"' },
};

// Where an enemy, item or npc turns up
const WHERE = {
	level: {
		type: "number | [levels] | { from, to }",
		doc: "Which levels it turns up on: one, a list, or a range ({ from: 3 } is 3 and up). Leave it out for all",
	},
	scenes: { type: NAMES, doc: "Which named scenes it turns up in, instead of going by level" },
	rarity: {
		type: '"common" | "uncommon" | "rare" | "legendary"',
		doc: "How often it turns up next to the others: common is 10 to legendary's 1",
	},
};

// The fights a creature gets into
const FIGHTS = (who) => ({
	onHurt: {
		params: [who + ":Creature", "attacker:Creature", "damage"],
		doc: "Runs when it is hit. Return a number to change the damage: 0 is a dodge",
	},
	onAttack: {
		params: [who + ":Creature", "target:Creature", "damage"],
		doc: "Runs when it hits something. Return a number to change the damage",
	},
	onKill: { params: [who + ":Creature", "victim:Creature"], doc: "Runs when it kills something" },
	onDie: { params: [who + ":Creature", "killer:Creature"], doc: "Runs when it dies" },
	onTurn: { params: [who + ":Creature"], doc: "Runs at the end of each of its turns" },
});

export const GAME_CONFIG = {
	title: { type: STRING, doc: "The name shown over the map" },
	welcome: { type: STRING, doc: 'The first line in the log ("Welcome, Hero!")' },
	mount: { type: STRING, doc: 'Where the game goes on the page: a selector like "#game", or an element' },
	width: { type: NUMBER, doc: "The map's width in squares (48). A scene can set its own" },
	height: { type: NUMBER, doc: "The map's height in squares (32). A scene can set its own" },
	viewWidth: {
		type: NUMBER,
		doc: "How many squares across are shown at once: a smaller view scrolls to keep the hero in the middle. By default all of them",
	},
	viewHeight: { type: NUMBER, doc: "How many squares down are shown at once. By default all of them" },
	fontSize: { type: NUMBER, doc: "The size of the letters, in pixels (18)" },
	fit: {
		type: BOOL,
		doc: "Show as many squares as fill the room the page gives the map, and again when the window changes (true). false shows viewWidth by viewHeight",
	},
	font: { type: STRING, doc: 'The font the map is drawn in ("monospace")' },
	background: { type: COLOR, doc: 'The color behind the map ("#0e0e16")' },
	scenes: {
		type: NUMBER,
		doc: "How many numbered scenes there are, one below the next: as many as you define, or 5 if you define none",
	},
	start: { type: "scene", doc: "The scene the hero begins in: scene 1, or else the first one you define" },
	map: {
		type: '"dungeon" | "rooms" | "cave" | "maze" | "overworld"',
		doc: "The kind of place a numbered scene is when it does not say: rooms joined by corridors, rooms alone, a cave, a maze, or the outdoors",
	},
	maze: {
		type: "{ chance, width, height, rooms } | false",
		doc: "How often a numbered scene between the first and the last is a maze instead (25 percent), how big, and with how many side rooms. false for no random mazes",
	},
	seed: {
		type: "string | number",
		doc: "The dungeon's code: the same seed makes the same dungeon. Else ?seed= in the address, else a random one",
	},
	diagonals: { type: BOOL, doc: "Whether the hero and the monsters can move diagonally (false)" },
	fog: {
		type: BOOL,
		doc: "Squares out of sight are dimmed once seen and hidden before (true). false shows the whole map. A scene can set its own",
	},
	variation: {
		type: NUMBER,
		doc: "Faint per-square hue and brightness grain on the map (1; 0 is flat). A scene can set its own",
	},
	lighting: {
		type: NUMBER,
		doc: "Torchlight: bright next to the hero, darker toward the edge of sight (1; 0 is even light). A scene can set its own",
	},
	dark: {
		type: NUMBER,
		doc: "How far the hero sees with no light in a scene without daylight (3; 0 is never dark). A scene can set its own",
	},
	fill: {
		type: NUMBER,
		doc: "A faint solid fill behind each square, tinted like the tile (1; 0 is none, 2 is stronger)",
	},
	tileset: {
		type: "true | false | { image, size, gap, scale, map }",
		doc: "true draws pictures instead of letters, colored like the letters would be. A table changes parts of the built-in sheet or brings your own",
	},
	tiles: {
		type: "{ wall: {...}, ... }",
		doc: "Changes to the built-in tiles by name (wall, floor, door, water, tree, grass, chest...), or new ones. game.tile() does the same one at a time",
	},
	animate: { type: NUMBER, doc: "With pictures, milliseconds per frame for anything with frames (800; 0 holds still)" },
	flicker: {
		type: NUMBER,
		doc: "Milliseconds between flickers of a tile's glow, and of its frames (200; 0 is steady)",
	},
	flash: {
		type: NUMBER,
		doc: "With pictures, milliseconds per frame of the hit flash on a square that has just been attacked (50; 0 is none)",
	},
	questMark: {
		type: "true | false | color",
		doc: 'With pictures, a "!" hovers over an npc with a quest to hand out (true). false for none, or a color to paint it in',
	},
	alert: {
		type: NUMBER,
		doc: 'With pictures, milliseconds a "!" hovers over an enemy that has just spotted the hero (900; 0 is none)',
	},
	keyRepeat: {
		type: "[delay, every] | false",
		doc: "Holding a direction key: milliseconds before the hero walks on, then between steps ([200, 120]). false steps once a press",
	},
	transition: {
		type: NUMBER,
		doc: "Milliseconds a change of scene takes: the old map dissolves, then the new one fills in (800; 0 is at once)",
	},
	afterDeath: {
		type: NUMBER,
		doc: "After the hero dies and the end screen is put away, milliseconds per turn as the monsters go on (600; 0 stops time)",
	},
	exitStairs: { type: BOOL, doc: "The stairs down in the last numbered scene win the game (true)" },
	autoStairs: { type: BOOL, doc: "Stepping onto an exit takes it at once (true). false waits for Enter" },
	winText: { type: STRING, doc: "What the end screen says after a win by the stairs, or by an exit with win: true" },
	enemiesPerScene: {
		params: ["level"],
		doc: "How many enemies a numbered scene starts with, from its level (8 + level * 3). A number works too",
	},
	itemsPerScene: {
		params: ["level"],
		doc: "How many items lie about a numbered scene, from its level (4 + level). A number works too",
	},
	chestsPerScene: {
		params: ["level"],
		doc: "How many chests a numbered scene has, from its level (1 + half the level). Each holds 1 to 3 of the scene's items",
	},
	mpRegen: { type: NUMBER, doc: "One MP comes back every this many turns (5; 0 is never)" },
	carry: {
		params: ["strength"],
		doc: "How much weight the hero can carry, worn things included, from their strength (the strength itself)",
	},
	gearModifierChance: {
		type: NUMBER,
		doc: "Percent of the gear found lying about or in chests that has a gear modifier on it (15)",
	},
	levelUp: {
		type: "{ xp, hp, attack, defense, strength, mp }",
		doc: "What a level costs and gives: xp is a function of the level (level * 15), the rest are added to the hero's stats",
	},
	damage: {
		params: ["attacker:Creature", "defender:Creature", "melee"],
		doc: "How much a hit does: by default a roll up to the attacker's attack, less the defender's defense, at least 1. melee is false for an arrow",
	},
	help: { type: "string | false", doc: "The key list under the map: a string replaces it, false removes it" },
	score: {
		params: ["game:Game", "won"],
		doc: "The number on the end screen (100 per scene visited, 10 per kill, the gold, and 500 for a win)",
	},
	godMode: { type: BOOL, doc: "The hero cannot be hurt, for testing (false). ?god in the address does the same" },
	lowHp: { type: NUMBER, doc: "At or below this share of max HP the HP bar pulses red (0.25; 0 is never)" },
	sounds: {
		type: "true | false | { hit: ..., walk: ... }",
		doc: "false is silent. A table changes some sounds by name: a recipe, a list of them, a file, a function, or false for that one",
	},
	volume: { type: NUMBER, doc: "How loud, 0 to 1 (0.5)" },
	onStart: { params: ["game:Game"], doc: "Runs once the game is built and the hero is placed, before the first turn" },
	onScene: {
		params: ["scene:Scene", "game:Game"],
		doc: "Runs whenever the hero arrives in a scene. scene.key is its number or name",
	},
	onTurn: { params: ["game:Game"], doc: "Runs after every turn" },
	onKey: {
		params: ["key", "game:Game"],
		doc: "Runs on every key press before the game handles it. Return true to keep the key for yourself",
	},
	onDraw: { params: ["game:Game"], doc: "Runs after the screen is drawn" },
	onWin: { params: ["game:Game"], doc: "Runs when the hero wins" },
	onLose: { params: ["game:Game"], doc: "Runs when the hero dies" },
	onKill: { params: ["killer:Creature", "victim:Creature"], doc: "Runs whenever one creature kills another" },
	onLevelUp: { params: ["player:Creature", "level"], doc: "Runs when the hero gains a level" },
};

export const HERO = {
	name: { type: STRING, doc: 'What the hero is called ("Hero")' },
	...LOOK,
	verb: { type: STRING, doc: 'How the hero\'s hits are told: "You hit the rat" ("hit")' },
	hp: { type: NUMBER, doc: "Hit points to start with (20)" },
	mp: { type: NUMBER, doc: "Magic points to start with, for skills (10)" },
	attack: { type: NUMBER, doc: "How hard the hero hits (3)" },
	defense: { type: NUMBER, doc: "How much comes off every hit taken (1)" },
	strength: {
		type: NUMBER,
		doc: "How much weight the hero can carry (15). Every 4 points gained over this add 1 to a hit with a weapon",
	},
	sight: { type: NUMBER, doc: "How many squares the hero sees (8)" },
	speed: { type: NUMBER, doc: "1 is normal; 2 is two moves for every one of a normal monster's" },
	gold: { type: NUMBER, doc: "Gold to start with (0)" },
	items: { type: "[names]", doc: "Items to start with. Gear is worn from the start" },
	skills: { type: "[names]", doc: "Skills known from the start" },
	...FIGHTS("player"),
	onLevelUp: { params: ["player:Creature", "level"], doc: "Runs when the hero gains a level" },
};

export const ENEMY = {
	name: { type: STRING, doc: 'What it is called in messages ("Goblin" from "goblin")' },
	...LOOK,
	hp: { type: NUMBER, doc: "Hit points (5)" },
	attack: { type: NUMBER, doc: "How hard it hits (3)" },
	defense: { type: NUMBER, doc: "How much comes off every hit it takes (0)" },
	xp: { type: NUMBER, doc: "What the hero gets for killing it (5)" },
	speed: { type: NUMBER, doc: "1 is normal, 2 is twice as fast, 0.5 half (1)" },
	sight: { type: NUMBER, doc: "How many squares away it notices the hero (7)" },
	ai: {
		type: '"chase" | "wander" | "still" | "flee"',
		doc: "chase hunts the hero on sight, wander drifts about and only fights when bumped, still stays put, flee runs from the hero and never fights (chase)",
	},
	verb: { type: STRING, doc: 'How its hits are told: "The rat bites you" ("hits")' },
	unique: {
		type: BOOL,
		doc: "Never turns up by chance, only where you put it: a scene's boss or legend, or game.spawn() (false)",
	},
	...WHERE,
	drops: {
		type: "{ name: percent }",
		doc: "What it may leave behind, one roll: { gold: 60, potion: 10 } drops gold 60 times in 100, a potion 10, never both",
	},
	beside: { type: "tile", doc: "A tile of your own put on a square next to it when it is placed" },
	shoots: {
		type: "item",
		doc: "What it fires at the hero when they are in a straight line (a row or a column) and not right beside it: an archer shoots an arrow. It never runs out",
	},
	range: { type: NUMBER, doc: "How far it shoots (its sight). Needs shoots" },
	...FIGHTS("enemy"),
	onSpawn: { params: ["enemy:Creature"], doc: "Runs when it is placed on the map" },
	act: {
		params: ["enemy:Creature", "game:Game"],
		doc: "Its own brain, instead of the built-in one: what it does on its turn. It still looks for the hero first",
	},
};

export const NPC = {
	name: { type: STRING, doc: 'What it is called ("Old Man" from "old_man")' },
	...LOOK,
	says: {
		type: "string | [strings]",
		doc: "What it says when the hero walks into it. A list gives one line per visit, then round again",
	},
	stock: { type: "[names]", doc: "What it sells: walking into it opens the shop. Prices come from each item's price" },
	prices: { type: "{ name: gold }", doc: "This shop's own prices for some of its stock" },
	buys: { type: BOOL, doc: "Whether the shop buys what the hero sells, for half the price (true)" },
	comment: {
		type: LINE,
		doc: "A remark shown in the shop under the title. A list gives one per visit; a function can go by the hero's gold or pack",
	},
	quest: {
		type: "quest",
		doc: "The quest it hands out the first time the hero talks to it, and takes back when it is done",
	},
	beside: { type: "tile", doc: "A tile of your own put on a square next to it: a campfire for the old man" },
	ai: { type: '"still" | "wander"', doc: "still stays put, wander strolls about near where it started (still)" },
	sight: { type: NUMBER, doc: "How many squares it sees (7)" },
	speed: { type: NUMBER, doc: "How fast it strolls: 1 is normal (1)" },
	onTalk: {
		params: ["npc:Creature", "player:Creature", "game:Game"],
		doc: "Runs when the hero walks into it. Return a line for it to say, or false to stop there: no says, shop or quest",
	},
	onSpawn: { params: ["npc:Creature"], doc: "Runs when it is placed on the map" },
	onTurn: { params: ["npc:Creature"], doc: "Runs at the end of each of its turns" },
	act: {
		params: ["npc:Creature", "game:Game"],
		doc: "Its own brain: what it does on its turn, instead of standing or strolling",
	},
};

// Gear adds these to the hero's stats while worn
const STAT_BONUSES = {
	attack: { type: NUMBER, doc: "Added to the hero's attack while worn" },
	defense: { type: NUMBER, doc: "Added to the hero's defense while worn" },
	strength: { type: NUMBER, doc: "Added to the hero's strength while worn" },
	maxHp: { type: NUMBER, doc: "Added to the hero's max HP while worn" },
	maxMp: { type: NUMBER, doc: "Added to the hero's max MP while worn" },
	speed: { type: NUMBER, doc: "Added to the hero's speed while worn" },
	sight: { type: NUMBER, doc: "Added to how far the hero sees while worn" },
};

export const ITEM = {
	name: { type: STRING, doc: 'What it is called ("Fire Sword" from "fire_sword")' },
	...LOOK,
	slot: {
		type: STRING,
		doc: 'Where it is worn: "weapon", "armor", "light", "ring" or a name of your own; one thing per slot at a time. Without a slot it is used up when used',
	},
	...STAT_BONUSES,
	weight: { type: NUMBER, doc: "How heavy one is to carry (1; 0 for a ring). The hero carries up to their strength" },
	count: { type: NUMBER, doc: "How many come in a pile: arrows in fives" },
	price: {
		type: NUMBER,
		doc: "What a shop charges; the hero can sell it for half. Without one it cannot be bought or sold",
	},
	...WHERE,
	unique: {
		type: BOOL,
		doc: "Never found lying about, only where you put it: a chest, a legend, a drop, or game.give() (false)",
	},
	keep: { type: BOOL, doc: "false means it is not kept but used on the spot when picked up, like gold (true)" },
	consumable: { type: BOOL, doc: "false keeps it after it is used: a book that can be read again (true)" },
	sound: { type: "sound", doc: 'The sound played when it is used, or fired if it shoots ("magic", or "shoot")' },
	pickupSound: { type: "sound", doc: 'The sound played when it is picked up ("pickup")' },
	light: {
		type: "true | number",
		doc: "Worn, it lights the dark: true sees normally, a number lights that many squares around the hero. Needs a slot",
	},
	lasts: { type: NUMBER, doc: "How many turns it works for while worn, then it is gone: a torch. Needs a slot" },
	shoots: {
		type: "item",
		doc: "What it fires, one per shot, at the closest enemy in a straight line: a bow shoots an arrow. Needs a slot",
	},
	range: { type: NUMBER, doc: "How far it shoots. Needs shoots" },
	throw: {
		type: NUMBER,
		doc: "How many squares it can be thrown: h throws one at the closest enemy in a straight line. It hits with its own attack, and is gone, hit or miss",
	},
	tileFacing: {
		type: "{ north: [column, row], ... }",
		doc: "With pictures, a square per direction for one in flight, so an arrow points the way it goes",
	},
	onUse: {
		params: ["player:Creature", "item:Item"],
		doc: "Runs when the hero uses it. Return false to keep it from being used up",
	},
	onPickup: {
		params: ["player:Creature", "item:Item"],
		doc: "Runs when the hero picks it up. Return false to leave it on the floor",
	},
	onEquip: { params: ["player:Creature", "item:Item"], doc: "Runs when the hero puts it on" },
	onUnequip: { params: ["player:Creature", "item:Item"], doc: "Runs when the hero takes it off" },
	onWearOut: { params: ["player:Creature", "item:Item"], doc: "Runs when its turns (lasts) run out" },
	onHit: {
		params: ["attacker:Creature", "target:Creature", "damage", "item:Item"],
		doc: "Runs after it hits for some damage: wielded, thrown or shot as an arrow. The target may have just died",
	},
};

// A gear modifier's changes to an item's numbers
const CHANGE = "number | (old) => new";
const GEAR_CHANGES = {
	attack: {
		type: CHANGE,
		doc: "A number is added to the item's attack; a function gets the old value and returns the new one",
	},
	defense: {
		type: CHANGE,
		doc: "A number is added to the item's defense; a function gets the old value and returns the new one",
	},
	strength: { type: CHANGE, doc: "Added to, or a function of, the item's strength bonus" },
	maxHp: { type: CHANGE, doc: "Added to, or a function of, the item's max HP bonus" },
	maxMp: { type: CHANGE, doc: "Added to, or a function of, the item's max MP bonus" },
	speed: { type: CHANGE, doc: "Added to, or a function of, the item's speed bonus" },
	sight: { type: CHANGE, doc: "Added to, or a function of, the item's sight bonus" },
	light: { type: CHANGE, doc: "Added to, or a function of, how far the item lights the dark" },
	weight: { type: CHANGE, doc: "Added to, or a function of, the item's weight: (w) => w / 2 halves it" },
	price: { type: CHANGE, doc: "Added to, or a function of, the item's price: (p) => p * 2 doubles it" },
	color: { type: COLOR, doc: "Replaces the item's color" },
};

export const GEAR_MODIFIER = {
	name: { type: STRING, doc: 'How it is called, in front of the item\'s name ("Enchanted" from "enchanted")' },
	slot: {
		type: NAMES,
		doc: 'Which gear it goes on: a slot or a list of them, like ["weapon", "armor"]. Without one, anything worn',
	},
	...WHERE,
	...GEAR_CHANGES,
	weapon: {
		type: "{ attack: 1, ... }",
		doc: "Changes that apply only to gear in the weapon slot, and name that slot as one it goes on",
	},
	armor: {
		type: "{ defense: 1, ... }",
		doc: "Changes that apply only to gear in the armor slot, and name that slot as one it goes on",
	},
	ring: {
		type: "{ ... }",
		doc: "Changes that apply only to gear in the ring slot, and name that slot as one it goes on",
	},
};

export const RECIPE = {
	name: { type: STRING, doc: 'What it is called in mistakes ("Fire Bomb" from "fire_bomb")' },
	combine: {
		type: "[names] | { name: count }",
		doc: "Everything it takes, all at once: a list of items (a name twice for two of them) or a table of counts",
	},
	makes: { type: "item", doc: "The item it makes (the recipe's own name if left out)" },
	count: { type: NUMBER, doc: "How many it makes (1)" },
	say: { type: "string | (player, item) => string", doc: 'What the log says when it is made ("You make a Torch.")' },
	sound: { type: "sound", doc: 'The sound played when it is made ("craft")' },
	onMake: { params: ["player:Creature", "item:Item", "game:Game"], doc: "Runs once it is made and in the hero's pack" },
};

export const SKILL = {
	name: { type: STRING, doc: 'What it is called ("Fireball" from "fireball")' },
	mp: { type: NUMBER, doc: "MP it costs (0)" },
	cooldown: { type: NUMBER, doc: "Turns before it can be used again (0)" },
	target: {
		type: BOOL,
		doc: "Whether it needs an enemy: the nearest one in sight, within range, is the target (false)",
	},
	range: { type: NUMBER, doc: "How far away the target may be" },
	learnAt: {
		type: NUMBER,
		doc: "The level the hero learns it at. Else the hero's skills list gives it from the start",
	},
	key: { type: STRING, doc: 'The key that uses it, like key: "f". Without one it gets the next free number' },
	onUse: {
		params: ["player:Creature", "target:Creature"],
		doc: "What it does. target is the nearest enemy in sight with target: true. Return false to not spend the MP",
	},
};

export const EFFECT = {
	name: { type: STRING, doc: 'What it is called on the side panel ("Poisoned" from "poisoned")' },
	turns: {
		type: "number | [least, most]",
		doc: "How many of the creature's turns it lasts, or a pair to roll from each time. Leave it out for until removeEffect",
	},
	attack: { type: NUMBER, doc: "Added to the creature's attack while it lasts" },
	defense: { type: NUMBER, doc: "Added to the creature's defense while it lasts" },
	strength: { type: NUMBER, doc: "Added to the creature's strength while it lasts" },
	maxHp: { type: NUMBER, doc: "Added to the creature's max HP while it lasts" },
	maxMp: { type: NUMBER, doc: "Added to the creature's max MP while it lasts" },
	speed: { type: NUMBER, doc: "Added to the creature's speed while it lasts: speed: 1 makes the hero twice as fast" },
	sight: { type: NUMBER, doc: "Added to how far the creature sees while it lasts" },
	light: {
		type: "true | number",
		doc: "Lights the dark while it lasts, like a worn light: true sees normally, a number lights that many squares around the hero",
	},
	color: { type: COLOR, doc: 'The color the creature is drawn in while it lasts: "lime"' },
	glow: { type: COLOR, doc: "A color that flickers over the creature and the squares around it while it lasts" },
	fx: {
		type: '"sparks" | { color, rise, rate, ... }',
		doc: "An fx played over the creature while it lasts: a name, or dots of its own",
	},
	onStart: { params: ["creature:Creature", "effect"], doc: "Runs when it is put on" },
	onTurn: {
		params: ["creature:Creature", "effect"],
		doc: "Runs at the start of each of the creature's turns. effect.turns is how many are left, effect.from who put it on",
	},
	onEnd: { params: ["creature:Creature", "effect"], doc: "Runs when it wears off or is removed" },
};

export const QUEST = {
	name: { type: STRING, doc: 'Its title in the journal ("Rats in the Barley")' },
	text: { type: STRING, doc: "What the journal says it is about. Without one, the goal is described" },
	kill: {
		type: "name | { name: count }",
		doc: 'Done when these enemies have died: kill: "dragon", or kill: { rat: 5 }',
	},
	bring: {
		type: "name | { name: count }",
		doc: 'Done when the hero holds these items: bring: "amulet", or bring: { gem: 3 }',
	},
	reach: { type: "scene", doc: "Done when the hero arrives in this scene" },
	reward: {
		type: "{ gold, xp, items }",
		doc: "What the hero gets when it is handed in: gold, xp, and items (a name or a list)",
	},
	ask: { type: LINE, doc: "What the giver says handing it out" },
	wait: { type: LINE, doc: "What the giver says while it is not done" },
	thanks: { type: LINE, doc: "What the giver says when it is handed in" },
	report: {
		type: BOOL,
		doc: "Whether the hero must go back to the giver to finish it (true). false finishes it the moment the goal is met",
	},
	onStart: { params: ["player:Creature", "quest"], doc: "Runs when the hero takes it on" },
	onDone: { params: ["player:Creature", "quest"], doc: "Runs when it is finished" },
};

export const SCENE_OPTIONS = {
	name: { type: STRING, doc: 'Its title, shown when the hero arrives ("The Old Mine")' },
	level: {
		type: NUMBER,
		doc: "How tough it is: what the enemies' and items' level go by, and what enemiesPerScene and the like get (its number)",
	},
	map: {
		type: '"dungeon" | "rooms" | "cave" | "maze" | "overworld" | drawing',
		doc: "The kind of place, or a map drawn by hand, one letter per square: # wall, . floor, + door, < and > stairs, = chest, ~ water, T tree, comma grass, @ where the hero arrives, and the legend's letters",
	},
	width: { type: NUMBER, doc: "Its width in squares (the game's)" },
	height: { type: NUMBER, doc: "Its height in squares (the game's)" },
	exits: {
		type: '{ down: "mine", portal: { to, at, tile, win } }',
		doc: 'The ways out and where they lead. "down" is the > and "up" the <; any other name is a portal, drawn on the map or put somewhere free',
	},
	legend: {
		type: '{ g: "goblin", L: { tile: "lockedDoor", key: "iron_key" } }',
		doc: 'What the other letters of a drawn map are: an enemy, npc, item or tile by name, or a tile with a key, an exit, a thing standing on it, or flags for its square: { tile: "bookshelf", flags: { holds: "potion" } }',
	},
	ground: {
		type: "tile",
		doc: 'The tile the things drawn on the map stand on, and the hero arrives on: "floor" unless it says, "sand" for a beach',
	},
	chests: {
		type: "[name or [names], ...]",
		doc: "What the chests hold, one entry per chest in reading order: a name or a list of them",
	},
	enemies: { type: NUMBER, doc: "How many enemies to add at random (enemiesPerScene for its level)" },
	items: { type: NUMBER, doc: "How many items to scatter about (itemsPerScene for its level)" },
	npcs: { type: NAMES, doc: "Friendly folk placed here, near where the hero arrives" },
	boss: { type: "enemy", doc: "An enemy put in the room the way down is in, or at the far end" },
	treasure: { type: "[names]", doc: "Items put beside the boss" },
	vault: {
		type: "item | { key, ... }",
		doc: "A locked room with the key somewhere else in the scene: the item that opens it",
	},
	rooms: {
		type: "number | [least, most]",
		doc: "In a maze, how many side rooms besides the one you start in and the one the way down is in",
	},
	sight: { type: NUMBER, doc: "How far the hero sees here, instead of their own sight: further outdoors" },
	daylight: { type: BOOL, doc: "The sun is out: no torch needed (true for an overworld)" },
	fog: { type: BOOL, doc: "Squares out of sight are dimmed once seen and hidden before (the game's fog)" },
	dark: { type: NUMBER, doc: "How far the hero sees with no light (the game's dark)" },
	variation: { type: NUMBER, doc: "Per-square grain on the map (the game's variation; 0 is flat)" },
	lighting: { type: NUMBER, doc: "Torchlight falling off toward the edge of sight (the game's lighting; 0 is even)" },
	water: { type: BOOL, doc: "false leaves the lakes off an overworld (true)" },
	onEnter: { params: ["scene:Scene", "game:Game"], doc: "Runs the first time the hero arrives, with the scene" },
};

export const TILE = {
	...LOOK,
	walkable: {
		type: BOOL,
		doc: "Whether anything can walk on it (true). An exit on a solid tile (the door of a building) is taken by walking into it",
	},
	seeThrough: { type: BOOL, doc: "Whether the hero sees past it (true)" },
	ground: { type: BOOL, doc: "Whether creatures and items can be put on it at random, like a floor (false)" },
	light: {
		type: NUMBER,
		doc: "How many squares around it the hero can see in the dark; they are seen from any distance down a clear line, by day too: a campfire",
	},
	glow: { type: COLOR, doc: "A color that flickers over the squares it lights, in daylight too" },
	fx: {
		type: '"sparks"',
		doc: 'An fx played on the square: "sparks" fly up from it, a "swirl" circles in toward its middle',
	},
	exactColor: {
		type: BOOL,
		doc: "Leaves the per-square grain off, so something drawn over two squares (a bed) is one color",
	},
	door: { type: BOOL, doc: "Counts as a door: friendly folk do not go through it" },
	opens: { type: BOOL, doc: "The hero can get through by bumping it, which is how reachability is worked out" },
	key: { type: "item", doc: "On a locked door, the item that opens it" },
	onBump: {
		params: ["player:Creature", "x", "y", "game:Game", "here:Square"],
		doc: "Runs when the hero walks into it, with the square: here.flags, here.scene. Return false and no turn passes",
	},
	onStep: {
		params: ["player:Creature", "x", "y", "game:Game", "here:Square"],
		doc: "Runs when the hero steps onto it, with the square: here.flags, here.scene",
	},
};

// The options table of each definition method, by the method's name
export const OPTIONS = {
	Game: GAME_CONFIG,
	hero: HERO,
	enemy: ENEMY,
	npc: NPC,
	item: ITEM,
	gearModifier: GEAR_MODIFIER,
	recipe: RECIPE,
	skill: SKILL,
	effect: EFFECT,
	quest: QUEST,
	scene: SCENE_OPTIONS,
	tile: TILE,
};

// Keys inside an option that is a table, by the option's name. A string
// names the kind of thing the keys are: the items of drops: { gold: 60 }.
const RANGE = {
	from: { type: NUMBER, doc: "The lowest level it turns up on" },
	to: { type: NUMBER, doc: "The highest level it turns up on" },
};
export const NESTED = {
	level: RANGE,
	scenes: RANGE,
	drops: "item",
	prices: "item",
	kill: "enemy",
	bring: "item",
	combine: "item",
	tiles: "tile",
	sounds: "sound",
	reward: {
		gold: { type: NUMBER, doc: "Gold given when the quest is handed in" },
		xp: { type: NUMBER, doc: "XP given when the quest is handed in" },
		items: { type: NAMES, doc: "Items given when the quest is handed in" },
	},
	maze: {
		chance: {
			type: NUMBER,
			doc: "Percent of the numbered scenes between the first and the last that come out as mazes (25)",
		},
		width: { type: NUMBER, doc: "How wide those mazes are (the game's width)" },
		height: { type: NUMBER, doc: "How tall those mazes are (the game's height)" },
		rooms: { type: "number | [least, most]", doc: "How many side rooms a maze has ([1, 2])" },
	},
	levelUp: {
		xp: { params: ["level"], doc: "The XP a level costs (level * 15). A number works too" },
		hp: { type: NUMBER, doc: "Max HP gained per level (3)" },
		attack: { type: NUMBER, doc: "Attack gained per level (1)" },
		defense: { type: NUMBER, doc: "Defense gained per level (0)" },
		strength: { type: NUMBER, doc: "Strength gained per level (1)" },
		mp: { type: NUMBER, doc: "Max MP gained per level (2)" },
	},
	tileset: {
		image: { type: STRING, doc: 'The sheet of pictures ("tiles/tiles.png")' },
		size: { type: NUMBER, doc: "Pixels per square in the sheet (16)" },
		gap: { type: NUMBER, doc: "Pixels between squares in the sheet (0)" },
		scale: { type: NUMBER, doc: "How much bigger to draw them (2)" },
		map: {
			type: "{ wall: [column, row], ... }",
			doc: "Which square of the sheet shows each thing, by name: tiles, items, and player, enemy, npc and item for anything without a tile of its own",
		},
	},
	// An effect's own dots (see FX in zot.js): each number can be a [least, most] pair
	fx: {
		color: { type: "color | [colors]", doc: "The dots' color, or a list to pick from for each dot" },
		size: { type: NUMBER, doc: "How big each dot is, in sheet pixels (1)" },
		rate: { type: NUMBER, doc: "Dots a second (1)" },
		life: { type: NUMBER, doc: "Milliseconds each dot lasts (800)" },
		glow: { type: NUMBER, doc: "Sheet pixels of light around each dot (0)" },
		rise: { type: NUMBER, doc: "Sheet pixels each dot climbs over its life (16); less than 0 sinks" },
		drift: { type: NUMBER, doc: "Sheet pixels of sideways wander either way (0)" },
		area: {
			type: "[left, top, right, bottom]",
			doc: "The part of the square the dots start from, as fractions ([0, 0, 1, 1])",
		},
		orbit: { type: NUMBER, doc: "Swirl instead: how far from the middle each dot starts, in sheet pixels" },
		turns: { type: NUMBER, doc: "With orbit, how far round each dot goes over its life (1 is once round)" },
		pull: { type: NUMBER, doc: "With orbit, how much of the way in to the middle each dot is drawn (1 reaches it)" },
	},
	weapon: GEAR_CHANGES,
	armor: GEAR_CHANGES,
	ring: GEAR_CHANGES,
};
// Keys of the tables inside these options: the exits of a scene are named
// freely, but each one that is a table has these.
export const NESTED_UNDER = {
	exits: {
		to: { type: "scene", doc: "The scene it leads to" },
		at: {
			type: STRING,
			doc: 'The exit to arrive on over there. Without one, the one facing this: "up" for "down", else the same name',
		},
		tile: {
			type: "tile",
			doc: "The square that marks it (the stairs for up and down, else a portal). One that can't be walked on, like the door of a building, is taken by walking into it, and the hero arrives in front of it",
		},
		win: { type: BOOL, doc: "Taking it wins the game instead" },
	},
	legend: {
		tile: { type: "tile", doc: "The tile this letter is" },
		key: { type: "item", doc: "For a lockedDoor, the item that opens it" },
		exit: { type: STRING, doc: "The name of the scene's exit this square is" },
		on: { type: "name", doc: "An enemy, npc or item standing on the tile" },
	},
};

// What a string is the name of, by the option it sits under (alone or in a
// list), by the option its table sits under, and by the method it is an
// argument of. A list is fixed choices; a word is a kind of definition.
export const STRING_KEYS = {
	items: "item",
	stock: "item",
	chests: "item",
	treasure: "item",
	shoots: "item",
	key: "item",
	vault: "item",
	bring: "item",
	combine: "item",
	makes: "item",
	on: "standing",
	ground: "tile",
	sound: "sound",
	pickupSound: "sound",
	npcs: "npc",
	boss: "enemy",
	kill: "enemy",
	quest: "quest",
	skills: "skill",
	start: "scene",
	to: "scene",
	reach: "scene",
	beside: "tile",
	tile: "tile",
	fx: FX,
	map: MAP_KINDS,
	ai: AI_KINDS,
	rarity: RARITIES,
	slot: "slot",
};
export const STRING_UNDER = { exits: "scene", legend: "legend", scenes: "scene" };
export const STRING_CALLS = {
	spawn: "placed",
	drop: "item",
	give: "item",
	chest: "item",
	has: "item",
	countOf: "item",
	itemNamed: "item",
	removeItem: "item",
	combine: "item",
	recipeFor: "item",
	goToScene: "scene",
	sceneNamed: "scene",
	hasScene: "scene",
	play: "sound",
	startQuest: "quest",
	finishQuest: "quest",
	questNamed: "quest",
	hasQuest: "quest",
	questDone: "quest",
	addFx: FX,
	removeFx: FX,
	setTile: "tile",
	tilesNamed: "tile",
	knows: "skill",
	learn: "skill",
	forget: "skill",
	useSkill: "skill",
	addEffect: "effect",
	hasEffect: "effect",
	removeEffect: "effect",
};

// ---- the members of each class ----

const C = "Creature",
	I = "Item",
	S = "Scene",
	G = "Game";

export const GAME = {
	player: { type: C, doc: "The hero" },
	currentScene: { type: S, doc: "The scene the hero is in" },
	turn: { type: NUMBER, doc: "How many turns have passed" },
	flags: { type: "{}", doc: "A notepad for your own game: game.flags.metTheKing = true" },
	seed: { type: STRING, doc: "The dungeon's code: the same seed makes the same dungeon" },
	kills: { type: NUMBER, doc: "How many enemies the hero has killed" },
	quests: {
		type: "[quests]",
		doc: "The quests the hero has taken on, in order: { id, name, text, status, giver, counts }",
	},
	over: { type: BOOL, doc: "Whether the game has been won or lost" },
	started: { type: BOOL, doc: "Whether game.start() has run" },
	visited: { type: "Set", doc: "The keys of every scene the hero has been in" },
	defs: {
		type: "{ enemy, npc, item, gearModifier, recipe, skill, effect, scene, quest }",
		doc: "Every definition by kind and name, as given to game.enemy() and the rest",
	},
	bench: { type: "{ name: count }", doc: "What is on the Combine screen's bench right now, by item" },
	tiles: { type: "{ name: tile }", doc: "Every tile by name, built in and your own" },
	config: { type: "{}", doc: "The settings the game was made with, defaults filled in" },
	messages: { type: "[{ text, kind }]", doc: "The lines in the log, oldest first" },
	mode: { type: '"play" | "menu"', doc: "Whether the hero is playing or a list is open" },
	sound: { type: "Sound", doc: "The sound player: game.sound.muted = true" },
	dark: { type: BOOL, doc: "Whether the hero is in the dark: no daylight here and no light worn" },
	hero: { params: ["options"], doc: "The hero: name, symbol, color, hp, attack, items..." },
	enemy: { params: ["name", "options"], doc: "A kind of enemy" },
	tile: { params: ["name", "options"], doc: "A map square of your own, or a change to a built-in one" },
	npc: { params: ["name", "options"], doc: "A friendly creature: walk into it to talk, or to shop" },
	item: { params: ["name", "options"], doc: "A kind of item: a potion, a sword, a key" },
	gearModifier: { params: ["name", "options"], doc: 'A rare twist on a piece of gear: "Enchanted Sword"' },
	recipe: {
		params: ["name", "options"],
		doc: "Something the hero can make by combining things they carry, on the Combine screen (c)",
	},
	skill: { params: ["name", "options"], doc: "A skill, used with the number keys" },
	effect: {
		params: ["name", "options"],
		doc: "Something that stays with a creature for some turns and does something each one: poisoned, burning",
	},
	quest: { params: ["name", "options"], doc: "Something people ask the hero to do" },
	scene: {
		params: ["key", "options"],
		doc: "A place: a number in the chain of floors, or a name of its own joined to the others by its exits",
	},
	start: { params: [], doc: "Builds the screen and begins the game. The last line of a game" },
	say: { params: ["text", "kind"], doc: 'Writes a line to the log. kind colors it: "good", "warn", "item", "speech"' },
	win: { params: ["text"], doc: "Ends the game with a win" },
	lose: { params: ["text"], doc: "Ends the game with a loss" },
	give: {
		params: ["name", "count"],
		doc: "Puts an item straight into the hero's pack. Returns it, or null if it was too heavy",
	},
	alert: {
		params: ["creature"],
		doc: 'Shows the "!" over a creature for a moment, the way an enemy does when it spots the hero',
	},
	flash: {
		params: ["x", "y", "color", "frames", "delay", "then"],
		doc: "With pictures, plays the hit flash on a square",
	},
	dissolve: {
		params: ["ms", "then"],
		doc: "Takes the map away for ms milliseconds, then brings it back and runs then: a night's sleep",
	},
	after: {
		params: ["turns", "fn"],
		doc: "Runs fn once that many of the hero's turns have passed: a spell wearing off",
	},
	menu: {
		params: ["title", "options", "onPick", "hint", "text"],
		doc: "Opens a list to pick from with the number keys. onPick(index, option) gets the choice; return true to spend a turn",
	},
	closeMenu: { params: [], doc: "Closes the open list" },
	craft: {
		params: ["bench"],
		doc: "Opens the Combine screen, as the c key does: the pack on the left, the bench on the right, Enter to make what the bench adds up to",
	},
	combine: {
		params: ["names"],
		doc: "Makes what these items add up to, out of the hero's pack, if a recipe takes exactly them. Returns the item made, or null",
	},
	recipeFor: { params: ["names"], doc: "The recipe that takes exactly these items, in any order, or null" },
	play: { params: ["sound"], doc: 'Plays a sound by name ("hit", "magic"), a file, or a recipe' },
	toggleSound: { params: ["on"], doc: "Mutes or unmutes the sounds; without on, toggles" },
	nearestEnemy: { params: ["range", "from"], doc: "The closest enemy the hero can see within range, or null" },
	enemiesInSight: { params: ["range"], doc: "Every enemy the hero can see, within range if given" },
	enemiesNear: { params: ["creature", "range"], doc: "Every enemy within range squares of a creature" },
	goToScene: { params: ["key", "silent"], doc: "Takes the hero to a scene, onto its way up" },
	goDown: { params: [], doc: "Takes the hero down the stairs of this scene, if it has any" },
	goUp: { params: [], doc: "Takes the hero up the stairs of this scene, if it has any" },
	takeExit: {
		params: ["exit"],
		doc: "Takes the hero through one of the current scene's exits (game.currentScene.exits.down)",
	},
	talkTo: { params: ["npc"], doc: "Talks to a friendly creature, as walking into it does" },
	shop: { params: ["npc"], doc: "Opens the shop of a creature with stock" },
	startQuest: {
		params: ["name", "giver"],
		doc: "The hero takes on a quest. Returns it, or null if they already have or had it",
	},
	finishQuest: { params: ["name"], doc: "Hands a quest in: the reward is given" },
	questNamed: { params: ["name"], doc: "The quest the hero has taken on with this name, or null" },
	hasQuest: { params: ["name"], doc: "Whether the hero has this quest and has not finished it" },
	questDone: { params: ["name"], doc: "Whether the hero has finished this quest" },
	journal: { params: [], doc: "Opens the list of quests, as the j key does" },
	look: { params: [], doc: "Says where the hero is and what is underfoot, as the l key does" },
	restart: { params: [], doc: "Reloads the page" },
	lookup: {
		params: ["kind", "name"],
		doc: 'A definition by kind and name: game.lookup("item", "sword"). Throws if there is none',
	},
	sceneNamed: { params: ["key"], doc: "A scene by number or name, built if the hero has not been there yet" },
	hasScene: { params: ["key"], doc: "Whether there is a scene with this number or name" },
	draw: { params: [], doc: "Draws the screen again" },
	playerTurn: {
		params: ["fn"],
		doc: "Runs fn as the hero's turn, then the monsters move. Return false from fn and no turn passes",
	},
	bumpTile: { params: ["x", "y"], doc: "What walking into a square does: a door opens, a chest is opened" },
	callHook: {
		params: ["where", "fn", "...args"],
		doc: "Runs one of your functions, showing the mistake on the page if it throws instead of stopping the game",
	},
};

export const CREATURE = {
	name: { type: STRING, doc: "What it is called" },
	symbol: { type: STRING, doc: "The letter or emoji drawn for it" },
	color: { type: COLOR, doc: "Its color" },
	kind: { type: STRING, doc: 'The name it was defined with ("goblin"), or "player"' },
	def: { type: "{}", doc: "The options it was defined with" },
	label: { type: STRING, doc: 'How it is named in messages: "you", "the goblin", or its name if unique' },
	hp: { type: NUMBER, doc: "Hit points left" },
	maxHp: { type: NUMBER, doc: "Hit points when whole, gear included" },
	mp: { type: NUMBER, doc: "Magic points left" },
	maxMp: { type: NUMBER, doc: "Magic points when full, gear included" },
	attack: { type: NUMBER, doc: "How hard it hits, gear included. Setting it changes the base" },
	defense: { type: NUMBER, doc: "What comes off every hit it takes, gear included" },
	strength: { type: NUMBER, doc: "How much it can carry, gear included" },
	speed: { type: NUMBER, doc: "How fast it moves: 1 is normal" },
	sight: { type: NUMBER, doc: "How many squares it sees" },
	level: { type: NUMBER, doc: "Its level" },
	xp: { type: NUMBER, doc: "Experience points toward the next level" },
	gold: { type: NUMBER, doc: "Gold carried" },
	items: { type: "[Item]", doc: "Everything carried, worn or not" },
	gear: { type: "{ slot: Item }", doc: "What is worn, by slot" },
	skills: { type: "[{ name, def, cooldown }]", doc: "The skills it knows" },
	effects: { type: "[{ name, def, turns, from }]", doc: "The effects it has, oldest first, with the turns left" },
	x: { type: NUMBER, doc: "Its column on the map" },
	y: { type: NUMBER, doc: "Its row on the map" },
	scene: { type: S, doc: "The scene it is in" },
	dead: { type: BOOL, doc: "Whether it has died" },
	alive: { type: BOOL, doc: "Whether it is still alive" },
	isPlayer: { type: BOOL, doc: "Whether it is the hero" },
	isEnemy: { type: BOOL, doc: "Whether it is an enemy: not the hero and not friendly" },
	friendly: { type: BOOL, doc: "Whether it is friendly folk" },
	turns: { type: NUMBER, doc: "How many turns it has taken" },
	facing: { type: "[dx, dy]", doc: "The way it last moved, or tried to" },
	memory: { type: "{ x, y } | null", doc: "Where an enemy last saw the hero" },
	talks: { type: NUMBER, doc: "How many times the hero has talked to this npc" },
	light: {
		type: "true | number | null",
		doc: "The best light it has on: true sees normally, a number of squares, or null for none",
	},
	shooter: { type: "Item | null", doc: "The wielded thing that shoots, a bow, or null" },
	throwables: { type: "[Item]", doc: "The items carried that can be thrown (they have throw)" },
	strengthBonus: { type: NUMBER, doc: "What strength adds to a hit with a weapon: 1 for every 4 points gained" },
	load: { type: NUMBER, doc: "The weight of everything carried" },
	carry: { type: NUMBER, doc: "How much weight it can carry" },
	overloaded: { type: BOOL, doc: "Whether it carries more than it can" },
	unworn: { type: "[Item]", doc: "The items carried but not worn" },
	bonus: { params: ["stat"], doc: 'What gear adds to a stat: bonus("attack")' },
	distanceTo: { params: ["other"], doc: "How many steps apart it and another thing are" },
	isNextTo: { params: ["other"], doc: "Whether another creature is one step away" },
	canSee: { params: ["other"], doc: "Whether it can see another creature" },
	moveBy: {
		params: ["dx", "dy"],
		doc: "Takes a step: walking into a creature attacks it (or talks to it), into a tile bumps it. True if the turn was used",
	},
	moveTo: { params: ["x", "y"], doc: "Moves straight to a square if it is free. True if it did" },
	stepToward: {
		params: ["target"],
		doc: "Takes a step along the shortest path to a target, attacking it if it is next door",
	},
	stepAway: { params: ["target"], doc: "Takes a step that puts more room between it and a target" },
	wander: { params: [], doc: "Takes a step in a random direction" },
	stroll: { params: [], doc: "Walks about near where it started, the way friendly folk do" },
	hit: { params: ["target"], doc: "Attacks a creature with whatever it wields" },
	shoot: { params: ["dx", "dy"], doc: "Fires what it wields in a direction, if that shoots" },
	shootAt: {
		params: ["target"],
		doc: "Fires at a creature if it is in a straight line, within range, with nothing in the way. True if it did: an archer's act can call it",
	},
	throwItem: {
		params: ["item", "dx", "dy"],
		doc: "Throws one of an item in a direction, or the way it faces, as far as the item's throw",
	},
	throwNearest: { params: ["item"], doc: "Throws one of an item at the closest enemy in a straight line" },
	hurt: { params: ["amount", "source", "quiet"], doc: "Takes damage, from source if given. quiet skips the message" },
	heal: { params: ["amount", "quiet"], doc: "Gets hit points back, up to the max. quiet skips the message" },
	die: { params: ["killer"], doc: "Dies, at the hands of killer if given" },
	gainXp: { params: ["amount"], doc: "Gains experience, and levels up when there is enough" },
	xpToNext: { params: [], doc: "The XP the next level costs" },
	levelUp: { params: [], doc: "Goes up a level: stats rise, due skills are learned" },
	knows: { params: ["name"], doc: "Whether it knows a skill" },
	learn: { params: ["name", "quiet"], doc: "Learns a skill" },
	forget: { params: ["name"], doc: "Forgets a skill" },
	useSkill: { params: ["name"], doc: "Uses a skill it knows, if it has the MP and the skill is not cooling down" },
	addEffect: {
		params: ["name", "turns"],
		doc: "Puts an effect on it, for its own turns or this many; { turns, from } says who did it. One it has already lasts the longer",
	},
	hasEffect: { params: ["name"], doc: "Whether it has an effect" },
	removeEffect: { params: ["name"], doc: "Takes an effect off before its time; its onEnd runs" },
	has: { params: ["name"], doc: "Whether it carries an item" },
	countOf: { params: ["name"], doc: "How many of an item it carries" },
	itemNamed: { params: ["name"], doc: "The first item carried with this name, or null" },
	pickUp: {
		params: ["item", "quiet"],
		doc: "Takes an item into the pack. False if it is too heavy. quiet skips the message and the sound",
	},
	use: { params: ["item"], doc: "Uses an item: wears gear, or runs a potion's onUse and uses it up" },
	equip: { params: ["item"], doc: "Wears an item in its slot, taking off what was there" },
	unequip: { params: ["item", "quiet"], doc: "Takes an item off" },
	removeItem: {
		params: ["item", "count"],
		doc: "Takes an item (or this many of a pile) out of the pack for good. A name works too: with a count, out of as many piles as it takes",
	},
	drop: { params: ["item"], doc: "Puts an item down on the floor" },
	say: { params: ["text"], doc: 'Writes a line to the log in its voice: "Old Man: Careful down there."' },
};

export const ITEM_MEMBERS = {
	name: { type: STRING, doc: 'What it is called ("Fire Sword")' },
	kind: { type: STRING, doc: 'The name it was defined with ("fire_sword")' },
	def: { type: "{}", doc: "The options it was defined with" },
	symbol: { type: STRING, doc: "The letter or emoji drawn for it" },
	color: { type: COLOR, doc: "Its color" },
	count: { type: NUMBER, doc: "How many are in this pile" },
	equipped: { type: BOOL, doc: "Whether the hero wears it" },
	left: { type: "number | null", doc: "Turns of use left, for gear that wears out" },
	x: { type: "number | null", doc: "Its column on the map, when it lies on the floor" },
	y: { type: "number | null", doc: "Its row on the map, when it lies on the floor" },
	slot: { type: "string | null", doc: "Where it is worn, or null for something used up" },
	weight: { type: NUMBER, doc: "What this pile weighs" },
	bonuses: { type: "[{ stat, value }]", doc: 'What wearing it adds: [{ stat: "attack", value: 3 }]' },
	fresh: { type: BOOL, doc: "Whether it is still unused: a fresh torch piles up with the others" },
	label: { type: STRING, doc: 'Its name with the count: "Arrow x5"' },
	wornWord: { type: STRING, doc: '"wielded" for a weapon, "lit" for a light, "worn" for the rest' },
};

export const SCENE = {
	key: { type: "number | string", doc: "Its number in the chain of floors, or the name it was defined with" },
	number: { type: "number | null", doc: "Its number in the chain of floors, or null for a named scene" },
	name: { type: "string | null", doc: "Its title, if it has one" },
	label: { type: STRING, doc: 'How it is named in messages: "scene 3" or "the mine scene"' },
	level: { type: NUMBER, doc: "How tough it is" },
	type: { type: '"dungeon" | "rooms" | "cave" | "maze" | "overworld" | "drawn"', doc: "The kind of place it is" },
	width: { type: NUMBER, doc: "Its width in squares" },
	height: { type: NUMBER, doc: "Its height in squares" },
	exits: { type: "{ name: { x, y, to, at } }", doc: "Its ways out by name, each with its square and where it leads" },
	tiles: { type: "[[name]]", doc: "The tile on each square: tiles[x][y]" },
	creatures: { type: "[Creature]", doc: "Everyone in it, the hero included while they are here" },
	items: { type: "[Item]", doc: "What lies on its floor" },
	explored: { type: "Set", doc: 'The "x,y" squares the hero has seen at some point' },
	squares: { type: 'Map<"x,y", Square>', doc: 'The squares squareAt has handed out, by "x,y"' },
	chests: { type: '{ "x,y": [names] }', doc: "What is inside each closed chest" },
	opts: { type: "{}", doc: "The options it was defined with" },
	daylight: {
		type: BOOL,
		doc: "Whether the sun is out here. Set it to false for night: game.currentScene.daylight = false",
	},
	inBounds: { params: ["x", "y"], doc: "Whether a square is on the map" },
	tileAt: { params: ["x", "y"], doc: "The name of the tile on a square" },
	setTile: { params: ["x", "y", "name"], doc: "Changes the tile on a square" },
	tilesNamed: {
		params: ["names"],
		doc: 'Every square that is one of these tiles, in reading order, as squareAt gives them: scene.tilesNamed("lamp", "lampOn")',
	},
	squareAt: {
		params: ["x", "y"],
		doc: "A square as { x, y, scene, flags }: the same object every time. flags is a notepad for that square",
	},
	flagsAt: {
		params: ["x", "y"],
		doc: 'A square\'s flags, a notepad for that one square: scene.flagsAt(x, y).holds = "potion"',
	},
	tileInfo: { params: ["x", "y"], doc: "The tile on a square, with its symbol, color, walkable and the rest" },
	isWalkable: { params: ["x", "y", "creature"], doc: "Whether a square can be walked on" },
	isSeeThrough: { params: ["x", "y"], doc: "Whether a square can be seen past" },
	isPassable: { params: ["x", "y"], doc: "Whether the hero could get through a square, doors included" },
	isDoor: { params: ["x", "y"], doc: "Whether a square is a door, open or shut" },
	isGround: { params: ["x", "y"], doc: "Whether things can be put on a square at random" },
	creatureAt: { params: ["x", "y"], doc: "Who stands on a square, or null" },
	itemAt: { params: ["x", "y"], doc: "What lies on a square, or null" },
	isFree: { params: ["x", "y", "creature"], doc: "Whether a square can be walked on and has nobody on it" },
	randomFreeCell: {
		params: ["options"],
		doc: "A free square, or null: { near, maxDistance, awayFrom, minDistance } narrow it down",
	},
	placeItem: { params: ["item", "x", "y"], doc: "Puts an item on a square" },
	removeItem: { params: ["item"], doc: "Takes an item off the floor" },
	addCreature: { params: ["creature", "x", "y"], doc: "Puts a creature on a square and into the turn order" },
	removeCreature: { params: ["creature"], doc: "Takes a creature off the map and out of the turn order" },
	enemies: { type: "[Creature]", doc: "The living enemies here" },
	npcs: { type: "[Creature]", doc: "The friendly folk here" },
	spawn: {
		params: ["name", "x", "y"],
		doc: "Puts an enemy or npc here, anywhere free or at x, y (the nearest free square). Returns it",
	},
	drop: { params: ["name", "x", "y"], doc: "Puts an item on the floor here, anywhere free or at x, y. Returns it" },
	chest: { params: ["x", "y", "items"], doc: "Puts a chest at x, y with these items inside: a name or a list" },
	addFx: { params: ["x", "y", "name"], doc: 'Plays an fx on a square from now on: "sparks", "swirl"' },
	removeFx: {
		params: ["x", "y", "name"],
		doc: "Stops an fx on a square, or every fx there without a name",
	},
	computeFov: {
		params: ["x", "y", "radius", "callback"],
		doc: "Calls callback(x, y) for every square in sight from a square",
	},
	exitAt: { params: ["x", "y"], doc: "The exit on a square, or null" },
	roomAt: { params: ["x", "y"], doc: "The room a square is in, or null" },
	reachableFrom: { params: ["x", "y"], doc: 'The set of "x,y" squares the hero could walk to from a square' },
	replaceTile: { params: ["from", "to"], doc: "Changes every square of one tile into another" },
	putBeside: { params: ["creature", "name"], doc: "Puts a tile on a free square next to a creature" },
};

// A square of a scene, as scene.squareAt gives it, and as a tile's onBump and onStep get it
export const SQUARE = {
	x: { type: NUMBER, doc: "Its column" },
	y: { type: NUMBER, doc: "Its row" },
	scene: { type: S, doc: "The scene it is in" },
	flags: { type: "{}", doc: 'A notepad for this one square, kept when its tile changes: here.flags.holds = "potion"' },
};

export const ZOT = {
	Game: { kind: "class", doc: "The game: new Zot.Game({ ...settings })" },
	Creature: { kind: "class", doc: "The hero, every enemy and every npc" },
	Item: { kind: "class", doc: "One potion, sword or key, on the floor or carried: new Zot.Item(game, def)" },
	Scene: { kind: "class", doc: "One place in the world: the map and who is on it" },
	Sound: { kind: "class", doc: "The sound player" },
	random: { params: ["low", "high"], doc: "A whole number: random(6) is 1 to 6, random(2, 5) is 2 to 5" },
	chance: { params: ["percent"], doc: "True this often: chance(25) one time in four" },
	pick: { params: ["list"], doc: "One thing out of a list" },
	shuffle: { params: ["list"], doc: "The list in a random order" },
	distance: { params: ["a", "b"], doc: "How many steps apart two things with x and y are" },
	directionName: { params: ["dx", "dy"], doc: 'directionName(1, 0) is "east", directionName(-1, -1) "northwest"' },
	TILES: { kind: "constant", doc: "The built-in tiles by name" },
	RARITY: { kind: "constant", doc: "How often each rarity turns up: common 10, uncommon 4, rare 2, legendary 1" },
	SOUNDS: { kind: "constant", doc: "The built-in sound recipes by name" },
	OPTIONS: { kind: "constant", doc: "The options each kind of thing accepts, by kind: the keys of its { }" },
	SCREEN: { kind: "constant", doc: 'The standard screen as HTML: what an empty <div id="game"> is filled with' },
	game: { type: G, doc: "The most recent game" },
};

// The methods of each class that are the game's own business, left out of
// the lists on purpose. The test checks that every other method has an entry.
export const INTERNAL = {
	Game: [
		"withGearModifier",
		"findOf",
		"check",
		"checkWhere",
		"slots",
		"pool",
		"vaultKeys",
		"sceneCount",
		"knownScenes",
		"exitsOf",
		"checkExits",
		"startAnimation",
		"flight",
		"buildDom",
		"fitMap",
		"find",
		"write",
		"show",
		"bar",
		"addRow",
		"badges",
		"badge",
		"sceneTitle",
		"sceneWhere",
		"enterScene",
		"fxNamed",
		"checkQuests",
		"goalOf",
		"addQuest",
		"questText",
		"questProgress",
		"questGoalMet",
		"questEvent",
		"checkQuest",
		"offersQuest",
		"questTalk",
		"questNote",
		"shopComment",
		"priceOf",
		"sellPriceOf",
		"endScreen",
		"overlayIcon",
		"bestScore",
		"showOverlay",
		"hideOverlay",
		"toggleEndScreen",
		"deadTurn",
		"playerArrived",
		"runUntilPlayer",
		"afterTurn",
		"handleKey",
		"holdKey",
		"releaseKey",
		"walkAfter",
		"walk",
		"nextStep",
		"keyMove",
		"playerAction",
		"hurl",
		"hotkeys",
		"wornItems",
		"hasLights",
		"sightLimit",
		"sightRadius",
		"updateVision",
		"drawMap",
		"drawFx",
		"fxElement",
		"spriteCanvas",
		"squareSize",
		"unit",
		"startEmitter",
		"emit",
		"paint",
		"startTransition",
		"stepTransition",
		"sprite",
		"currentFrame",
		"tileSprite",
		"spriteKey",
		"updateCamera",
		"drawSide",
		"drawLog",
		"tellSound",
	],
	Creature: [
		"getSpeed",
		"tickEffects",
		"aim",
		"readyToShoot",
		"shootNearest",
		"lineToNearest",
		"dropLoot",
		"learnDueSkills",
		"clampStats",
		"runHooks",
		"hookName",
		"lightUp",
		"pileFor",
		"restack",
		"burnGear",
		"wearOut",
		"tick",
		"act",
	],
	Item: [],
	Scene: [
		"isMazeFloor",
		"darkSight",
		"litSquares",
		"tileFx",
		"glowAt",
		"hasGlow",
		"generate",
		"digMaze",
		"stepsFrom",
		"makeExits",
		"placeExit",
		"placeOtherExits",
		"solidExit",
		"landing",
		"cutsOff",
		"readDrawing",
		"border",
		"makeLakes",
		"makeVault",
		"randomCellInRoom",
		"npcCell",
		"populate",
		"chestCell",
		"addChest",
	],
};

// The member table of each class, and what a few well-known names are.
const CLASSES = { Game: GAME, Creature: CREATURE, Item: ITEM_MEMBERS, Scene: SCENE, Square: SQUARE, Zot: ZOT };
const NAMED = {
	game: G,
	Zot: "Zot",
	player: C,
	hero: C,
	enemy: C,
	attacker: C,
	target: C,
	defender: C,
	killer: C,
	victim: C,
	npc: C,
	creature: C,
	item: I,
	scene: S,
	here: "Square",
	square: "Square",
};

// ---- the completion source ----

const entryOf = (e) => (typeof e === "string" ? { doc: e } : e);
const paramNames = (params) => params.map((p) => p.split(":")[0]);

// A name that needs quotes as a key: "bone-sword" does, bone_sword does not
const asKey = (name) => (/^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name));

// One option key, or a hook as a method with its parameters and the cursor in the body
function keyOption(name, entry) {
	const e = entryOf(entry);
	if (e.params) {
		const names = paramNames(e.params).join(", ");
		return snippetCompletion(`${asKey(name)}(${names}) {\n\t\${}\n}`, {
			label: name,
			detail: `(${names})`,
			info: e.doc,
			type: "method",
			boost: 1,
		});
	}
	return { label: name, apply: `${asKey(name)}: `, detail: e.type, info: e.doc, type: "property", boost: 1 };
}

function memberOption(name, entry) {
	const e = entryOf(entry);
	const detail = e.params ? `(${paramNames(e.params).join(", ")})` : e.type;
	const type = e.kind || (e.params ? "method" : "property");
	return { label: name, detail, info: e.doc, type, boost: 1 };
}

const stringOption = (name) => ({ label: name, type: "text", boost: 1 });

// The names this file defines with game.enemy("rat", ...) and the rest, by
// kind. "placed" is anything spawn() takes: enemies and npcs; "legend" is
// anything a drawn map's letter can be; "slot" is every slot its items use.
const DEFINES = /\.(enemy|item|tile|npc|skill|effect|scene|quest|gearModifier|recipe)\(\s*(["'`])([^"'`\n]+)\2/g;
const SLOT = /\bslot:\s*(["'])([^"'\n]+)\1/g;
export function definedNames(text) {
	const out = {
		enemy: [],
		item: [],
		tile: [...BUILT_IN_TILES],
		npc: [],
		skill: [],
		effect: [],
		scene: [],
		quest: [],
		gearModifier: [],
		recipe: [],
	};
	for (const m of text.matchAll(DEFINES)) if (!out[m[1]].includes(m[3])) out[m[1]].push(m[3]);
	out.placed = [...out.enemy, ...out.npc];
	out.standing = [...out.enemy, ...out.npc, ...out.item]; // anything a legend's `on` can put on a tile
	out.legend = [...out.standing, ...out.tile];
	out.sound = [...BUILT_IN_SOUNDS];
	out.slot = [...SLOTS];
	for (const m of text.matchAll(SLOT)) if (!out.slot.includes(m[2])) out.slot.push(m[2]);
	return out;
}

// ---- reading the tree ----

const text = (state, node) => state.sliceDoc(node.from, node.to);

// The key of a Property node: "hp" in hp: 3
function keyName(state, prop) {
	const def = prop.getChild("PropertyDefinition");
	return def ? text(state, def).replace(/^(["'])(.*)\1$/, "$2") : null;
}

// Which definition an object literal is the options of: "enemy" for the
// table in game.enemy("rat", {...}), "Game" for new Zot.Game({...}), else null
function definitionOf(state, obj) {
	const args = obj.parent;
	if (!args || args.name !== "ArgList") return null;
	const call = args.parent;
	if (!call) return null;
	const callee =
		call.name === "NewExpression"
			? call.getChild("MemberExpression") || call.getChild("VariableName")
			: call.firstChild;
	if (!callee) return null;
	const name = text(state, callee).replace(/^.*\./, "");
	if (call.name === "NewExpression") return name === "Game" ? "Game" : null;
	if (call.name === "CallExpression" && name !== "Game" && OPTIONS[name]) return name;
	return null;
}

// The options table for a key typed in an object literal: the definition's
// own, or the table under one of its options (level: { from, to }), or the
// names of a kind (drops: { gold: 60 })
function tableFor(state, obj) {
	const kind = definitionOf(state, obj);
	if (kind) return OPTIONS[kind];
	const prop = obj.parent;
	if (!prop || prop.name !== "Property") return null;
	const key = keyName(state, prop);
	const outer = prop.parent;
	if (key != null && NESTED[key]) return NESTED[key];
	const outerProp = outer && outer.parent && outer.parent.name === "Property" ? keyName(state, outer.parent) : null;
	if (outerProp != null && NESTED_UNDER[outerProp]) return NESTED_UNDER[outerProp];
	return null;
}

// The class of what an expression stands for, from its text: a parameter
// of the hook the cursor is in, a well-known name, or a member of one of
// those (game.player is a Creature, player.scene a Scene)
function typeOf(state, name, node) {
	const dot = name.lastIndexOf(".");
	if (dot >= 0) {
		const owner = typeOf(state, name.slice(0, dot), node);
		const entry = owner && CLASSES[owner] && CLASSES[owner][name.slice(dot + 1)];
		const type = entry && entryOf(entry).type;
		return type && CLASSES[type] ? type : null;
	}
	return paramType(state, name, node) || NAMED[name] || null;
}

// The class of a parameter of the hook the cursor is in, from its entry:
// slime in onHurt(slime, attacker, damage) on an enemy is a Creature
function paramType(state, name, node) {
	for (let n = node; n; n = n.parent) {
		const params = n.getChild("ParamList");
		if (!params) continue;
		const names = [];
		for (let p = params.firstChild; p; p = p.nextSibling)
			if (p.name === "VariableDefinition") names.push(text(state, p));
		const index = names.indexOf(name);
		if (index < 0) continue;
		const prop = n.name === "Property" ? n : n.parent && n.parent.name === "Property" ? n.parent : null;
		if (!prop) return null;
		const table = tableFor(state, prop.parent);
		const entry = table && typeof table === "object" && table[keyName(state, prop)];
		const param = entry && entryOf(entry).params && entryOf(entry).params[index];
		return param && param.includes(":") ? param.split(":")[1] : null;
	}
	return null;
}

// What a string is the name of: the kind of definition, or a list of
// choices, from the option it sits under or the method it is passed to
function stringKind(state, str) {
	let parent = str.parent;
	while (parent && parent.name === "ArrayExpression") parent = parent.parent; // in a list, or a list in a list (chests)
	if (parent && parent.name === "Property") {
		const key = keyName(state, parent);
		if (key != null && STRING_KEYS[key]) return STRING_KEYS[key];
		const outer = parent.parent && parent.parent.parent;
		const outerKey = outer && outer.name === "Property" ? keyName(state, outer) : null;
		return outerKey != null ? STRING_UNDER[outerKey] || null : null;
	}
	if (parent && parent.name === "ArgList" && parent.parent && parent.parent.name === "CallExpression") {
		const callee = parent.parent.firstChild;
		const method = callee && text(state, callee).replace(/^.*\./, "");
		return (method && STRING_CALLS[method]) || null;
	}
	return null;
}

export function zotCompletions(context) {
	const { state, pos } = context;
	const node = syntaxTree(state).resolveInner(pos, -1);

	// Inside a string: the names of what it stands for
	if (node.name === "String") {
		if (pos <= node.from) return null;
		const kind = stringKind(state, node);
		if (!kind) return null;
		const names = Array.isArray(kind) ? kind : definedNames(state.doc.toString())[kind] || [];
		return { from: node.from + 1, options: names.map(stringOption), validFor: /^[^"'`]*$/ };
	}

	// After a dot: the members of what comes before it
	if ((node.name === "." || node.name === "PropertyName") && node.parent && node.parent.name === "MemberExpression") {
		const object = node.parent.firstChild;
		const type = object && typeOf(state, text(state, object), node);
		const table = type && CLASSES[type];
		if (!table) return null;
		const from = node.name === "PropertyName" ? node.from : pos;
		const options = Object.keys(table).map((name) => memberOption(name, table[name]));
		return { from, options, validFor: /^\w*$/ };
	}

	// A key in an object literal: the options that fit there and are not
	// there yet. With nothing typed, only when asked for (Ctrl+Space), so
	// that Enter after a comma still makes a new line.
	let obj = null,
		from = pos,
		typing = null;
	if (
		node.name === "ObjectExpression" ||
		(node.name === "{" && node.parent && node.parent.name === "ObjectExpression")
	) {
		obj = node.name === "{" ? node.parent : node;
		if (!context.explicit) return null;
	} else if (node.name === "PropertyDefinition" && node.parent && node.parent.name === "Property") {
		obj = node.parent.parent;
		typing = node.parent;
		from = node.from;
	}
	if (!obj || obj.name !== "ObjectExpression") return null;
	const table = tableFor(state, obj);
	if (!table) return null;
	const present = [];
	for (let child = obj.firstChild; child; child = child.nextSibling) {
		if (child.name === "Property" && child !== typing) present.push(keyName(state, child));
	}
	const names = typeof table === "string" ? definedNames(state.doc.toString())[table] || [] : Object.keys(table);
	const options = names
		.filter((name) => !present.includes(name))
		.map((name) =>
			typeof table === "string"
				? { label: name, apply: `${asKey(name)}: `, type: "property", boost: 1 }
				: keyOption(name, table[name]),
		);
	return { from, options, validFor: /^\w*$/ };
}
