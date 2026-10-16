// =====================================================================
//  LAND OF ZOT  — an example game made with Zot.
//  Change the numbers, names and colors and see what happens.
//
//    1. new Zot.Game({...})  the settings
//    2. game.hero(...)       the hero
//       game.enemy(...)      one block per kind of enemy
//       game.effect(...)     things that stay with someone for a few turns (poisoned)
//       game.tile(...)       map squares of your own (a campfire)
//       game.npc(...)        friendly folk: walk into them to talk or shop
//       game.item(...)       one block per kind of item
//       game.skill(...)      one block per skill
//       game.quest(...)      things people ask the hero to do
//       game.scene(...)      the places in the world, and how they join up
//    3. game.start()         go!
// =====================================================================

import * as Zot from "../zot.js";

const game = new Zot.Game({
	title: "Land of Zot",
	start: "meadow", // the scene the hero begins in (see SCENES at the bottom)
	welcome: "You wake up in a meadow with no memory of how you got here. Someone is waving at you.",
	tileset: true, // set to false to use ASCII (text) instead of tiles for the map.

	// Every 3rd level, the hero gets an extra boost.
	onLevelUp(player, level) {
		if (level % 3 === 0) {
			player.attack += 1;
			player.defense += 1;
			game.say("You feel much stronger!");
		}
	},
});

game.hero({
	name: "Jimmy",
	symbol: "@",
	color: "yellow",
	hp: 16,
	mp: 6,
	attack: 1,
	defense: 1,
	strength: 12, // the hero carries this much weight; also a little extra damage with a weapon (see Weight and strength in README.md)
	items: ["dagger", "torch"], // the torch is lit from the start

	// Sometimes the hero dodges completely.
	// Returning a number from onHurt changes the damage.
	onHurt(player, attacker, damage) {
		if (Zot.chance(10)) {
			game.say("You dodge the attack!");
			return 0;
		}
	},
});

// ---------------------------------------------------------------------
//  ENEMIES
// ---------------------------------------------------------------------

game.enemy("rat", {
	symbol: "r", // what it looks like on the map, with letters
	tile: [31, 8], // and with pictures: column 31, row 8 of tiles/guide.png
	color: "#5e5852",
	hp: 3,
	attack: 2,
	xp: 2, // XP the hero gets for killing it
	speed: 1.4, // 1 is normal, 2 is twice as fast
	verb: "bites", // "The rat bites you for 2."
	level: { from: 1, to: 2 },
});

game.enemy("goblin", {
	symbol: "g",
	tile: [26, 2],
	color: "lime",
	hp: 6,
	attack: 4,
	xp: 5,
	level: { from: 2, to: 4 },
	drops: { gold: 60, potion: 10 }, // 60% chance of gold, 10% of a potion, never both
});

// A goblin with a bow. It shoots whenever the hero is in a straight line
// (the same row or column) within range, and fights up close once they're
// next to it. It never runs out of arrows, but an arrow that hits is gone.
game.enemy("goblin_archer", {
	symbol: "g",
	tile: [29, 2],
	color: "olive",
	hp: 5,
	attack: 3,
	xp: 8,
	shoots: "arrow", // any item; the arrow is defined below
	range: 5, // how far it shoots (its sight if left out)
	level: { from: 2, to: 5 },
	drops: { arrow: 30, gold: 40 },
});

game.enemy("skeleton", {
	symbol: "s",
	tile: [29, 6],
	color: "white",
	hp: 12,
	attack: 5,
	defense: 2,
	speed: 0.9,
	xp: 10,
	level: { from: 2 }, // level 2 and up (each scene below says what level it is)
	rarity: "uncommon", // common, uncommon, rare or legendary
	drops: { bone_sword: 20 },
});

game.enemy("slime", {
	symbol: "j",
	tile: [20, 5],
	color: "aqua",
	hp: 8,
	attack: 2,
	xp: 6,
	level: { from: 2, to: 4 },
	ai: "wander", // doesn't chase you, just oozes around
	// When you hit a slime, it might split in two!
	onHurt(slime, attacker, damage) {
		if (slime.hp - damage > 0 && Zot.chance(30)) {
			slime.scene.spawn("slime", slime.x, slime.y); // in the scene the slime is in
			game.say("The slime splits!");
		}
	},
});

game.enemy("spider", {
	symbol: "x",
	tile: [28, 5],
	color: "#9c7011",
	hp: 6,
	attack: 4,
	xp: 10,
	verb: "stings",
	level: { from: 2, to: 4 },
});

game.enemy("bat", {
	symbol: "b",
	tile: [26, 8],
	frames: [
		[26, 8],
		[31, 5],
	], // with pictures it flaps: these squares take turns
	color: "violet",
	hp: 4,
	attack: 2,
	xp: 4,
	speed: 1.8,
	level: { from: 2 },
	verb: "nips",
	// A bat with its own tiny brain: flutter around at random,
	// but bite the hero when it happens to be next to them.
	act(bat) {
		if (bat.isNextTo(game.player)) bat.hit(game.player);
		else bat.wander();
	},
});

game.enemy("snake", {
	symbol: "S",
	tile: [28, 8],
	color: "green",
	hp: 7,
	attack: 3,
	xp: 8,
	level: { from: 3 },
	verb: "bites",
	// A snake bite sometimes poisons (see the effects below).
	onAttack(snake, target, damage) {
		if (damage > 0 && Zot.chance(33)) target.addEffect("poisoned", { from: snake });
	},
});

game.enemy("ogre", {
	symbol: "O",
	tile: [24, 7],
	color: "orange",
	hp: 28,
	attack: 9,
	defense: 4,
	xp: 34,
	speed: 0.75,
	level: { from: 4 },
	rarity: "rare",
	verb: "smashes",
	drops: { gold: 100 }, // always drops gold
});

game.enemy("orc", {
	symbol: "O",
	tile: [26, 2],
	color: "#999999",
	hp: 40,
	attack: 12,
	defense: 5,
	xp: 40,
	speed: 0.8,
	level: { from: 4 },
	rarity: "rare",
	drops: { gold: 40 },
});

game.enemy("dragon", {
	name: "The Dragon",
	symbol: "🐉", // an emoji works as well as a letter
	tile: [29, 8],
	color: "red",
	hp: 70,
	attack: 15,
	defense: 6,
	xp: 200,
	sight: 10,
	verb: "burns",
	unique: true, // never shows up by accident, only where we put it
	// Half the time, whoever it burns catches fire (see the effects below).
	onAttack(dragon, target, damage) {
		if (damage > 0 && Zot.chance(50)) target.addEffect("burning", { from: dragon });
	},
	onDie() {
		// Killing it is the goal of the old man's quest, and it wins the game.
		game.win("You've slain the Dragon and saved the kingdom!");
	},
});

// ---------------------------------------------------------------------
//  EFFECTS  (things that stay with someone for a few turns)
// ---------------------------------------------------------------------

// Poison: 1 damage a turn for 4 to 7 turns. The poisoned turn green, with
// green bubbles rising off them.
game.effect("poisoned", {
	turns: [4, 7],
	color: "#7cff6b",
	fx: {
		color: ["#7cff6b", "#3fd13a", "#b6ff9e"],
		size: [1, 2],
		rate: 3,
		rise: [8, 14],
		drift: 2,
		life: [600, 1000],
		area: [0.2, 0.4, 0.8, 0.9],
	},
	onStart(who) {
		if (who.isPlayer) game.say("You are poisoned!");
	},
	onTurn(who, effect) {
		who.hurt(1, effect.from);
	},
	onEnd(who) {
		if (who.isPlayer) game.say("The poison wears off.");
	},
});

// Fire: 2 damage a turn for 2 or 3 turns. The burning glow, with sparks flying off them.
game.effect("burning", {
	turns: [2, 3],
	glow: "#ff8a1f",
	fx: "sparks",
	onTurn(who, effect) {
		who.hurt(2, effect.from);
	},
});

// Radiance (the radiant skill below): the hero gives off light for 90
// turns, seeing further than any torch, and glows while they do.
game.effect("radiant", {
	turns: 90,
	light: true, // like a lit torch: sees normally in the dark
	sight: 8, // added to their own 7: 15 squares in all
	glow: "#fff2b0",
	onEnd(who) {
		if (who.isPlayer) game.say("The light fades.");
	},
});

// ---------------------------------------------------------------------
//  ITEMS
// ---------------------------------------------------------------------

game.item("gold", {
	symbol: "$",
	tile: [41, 3],
	color: "gold",
	keep: false, // not kept, just picked up
	onPickup(player) {
		const amount = Zot.random(2, 8);
		player.gold += amount;
		game.say(`You find ${amount} gold.`);
	},
});

game.item("diamond", {
	symbol: "*",
	tile: [23, 4],
	color: "#00fffb",
	price: 1000,
	weight: 0,
	level: 6, // only on the lowest level, the lair (and in the dragon's hoard, see its treasure)
	rarity: "legendary",
});

game.item("potion", {
	symbol: "!",
	tile: [32, 13],
	color: "hotpink",
	price: 12, // what the shop charges (you can sell it back for half)
	weight: 1, // what it weighs (1 if you leave it out); the hero carries up to their strength
	onUse(player) {
		player.heal(Zot.random(8, 12));
	},
});

game.item("mp_potion", {
	name: "MP Potion",
	symbol: "!",
	tile: [33, 13],
	color: "dodgerblue",
	rarity: "uncommon",
	price: 20,
	onUse(player) {
		player.mp = player.maxMp;
		game.say("Your MP is full again.");
	},
});

game.item("scroll_of_fire", {
	name: "Scroll of Fire",
	symbol: "?",
	tile: [33, 15],
	color: "orange",
	rarity: "rare",
	price: 40,
	onUse(player) {
		const enemies = game.enemiesInSight(4);
		if (enemies.length === 0) {
			game.say("There is nothing nearby to burn.");
			return false; // return false = don't use it up
		}
		game.say("The scroll bursts into flames!");
		for (const e of enemies) {
			e.hurt(8, player);
			e.addEffect("burning", { from: player }); // see the effects above; nothing happens to one already dead
		}
	},
});

// Anything with a slot can be worn. Its attack/defense/maxHp are added while
// worn. Worn or not, it weighs the same: big weapons and armor are heavy, so
// a spare sword takes up room that potions could have had.
game.item("dagger", { slot: "weapon", symbol: "t", tile: [34, 6], color: "#6f6f6f", attack: 1, price: 8 });

// Anything with `throw` can be thrown: press h to throw one at the closest
// enemy in a straight line, up to that many squares. It hits with its own
// attack (not the sword's), and is gone, hit or miss.
game.item("throwing_knife", {
	symbol: "-",
	tile: [32, 6],
	color: "silver",
	attack: 3,
	throw: 5, // how many squares it flies
	count: 3, // found and sold in piles of 3
	weight: 0.5, // each
	price: 4, // each
});

game.item("sword", {
	slot: "weapon",
	symbol: "/",
	tile: [32, 8],
	color: "silver",
	attack: 3,
	weight: 2,
	price: 40,
	level: { from: 2 },
}); // level 2 and up

game.item("bone_sword", {
	name: "Bone Sword",
	slot: "weapon",
	symbol: ")",
	tile: [36, 9],
	color: "white",
	attack: 4,
	weight: 2,
	rarity: "rare",
	price: 80,
	level: { from: 3 },
});

game.item("fire_sword", {
	name: "Fire Sword",
	slot: "weapon",
	symbol: "|",
	tile: [33, 9],
	color: "red",
	attack: 5,
	weight: 3,
	rarity: "rare",
	price: 120,
	level: { from: 4 },
	// Whoever it hits catches fire (see the effects above).
	onHit(player, target) {
		target.addEffect("burning", { from: player });
	},
});

// A bow shoots arrows: wield it and press f to fire one at the closest enemy
// in a straight line (the same row or column, never diagonally), up to 6
// squares away. Arrows are items too:
// they turn up in piles of 5, the shop sells them by the pile, and one that
// misses lands on the floor, so go and pick it up again.
game.item("bow", {
	slot: "weapon",
	symbol: "}",
	tile: [37, 6],
	color: "tan",
	attack: 2,
	weight: 2,
	shoots: "arrow", // the item it fires, one per shot
	range: 6, // how far an arrow flies
	rarity: "uncommon",
	price: 45,
});

game.item("crossbow", {
	slot: "weapon",
	symbol: "}",
	tile: [37, 5],
	color: "tan",
	attack: 3,
	weight: 3,
	shoots: "arrow", // the item it fires, one per shot
	range: 8, // how far an arrow flies
	rarity: "rare",
	price: 90,
});

game.item("arrow", {
	symbol: "-",
	tile: [41, 5],
	color: "silver",
	count: 5, // found and sold in piles of 5
	weight: 0, // each
	price: 2, // each, so 10 gold a pile
});

// A torch: light it (it goes in the "light" slot) to see in the dark. It burns
// for 150 turns, then it's gone. Putting it out saves what's left. Fresh
// torches pile up, so it's worth carrying a spare.
game.item("torch", {
	slot: "light",
	symbol: "i",
	tile: [43, 3],
	color: "orange",
	light: true, // the hero sees normally while it's lit
	lasts: 160, // turns of light
	price: 5,
});

game.item("leather_armor", {
	name: "Leather Armor",
	slot: "armor",
	symbol: "[",
	tile: [37, 1],
	color: "tan",
	defense: 1,
	weight: 2,
	price: 25,
});
game.item("chain_mail", {
	name: "Chain Mail",
	slot: "armor",
	symbol: "[",
	tile: [32, 1],
	color: "silver",
	defense: 3,
	weight: 4, // heavy: hard to carry as a spare
	rarity: "uncommon",
	price: 70,
	level: { from: 3 },
});
game.item("ring_of_life", {
	name: "Ring of Life",
	slot: "ring",
	symbol: "=",
	tile: [44, 6],
	color: "gold",
	maxHp: 10,
	weight: 0, // a ring weighs nothing
	rarity: "rare",
	price: 120,
	level: { from: 2 },
});
// Strength is how much the hero can carry, and every 4 points gained over what
// they started with add 1 to a hit with a weapon. This ring is in the mine's storeroom, next to the chain mail.
game.item("ring_of_strength", {
	name: "Ring of Strength",
	slot: "ring",
	symbol: "=",
	tile: [45, 6],
	color: "orangered",
	strength: 4,
	weight: 0,
	rarity: "rare",
	price: 120,
	level: { from: 3 },
});

game.gearModifier("enchanted", { weapon: { attack: 1 }, armor: { defense: 1 }, price: (p) => p * 2 });
game.gearModifier("elvish", { slot: ["weapon", "armor"], weight: (w) => w / 2, price: (p) => p * 2 }); // half the weight
game.gearModifier("dwarvish", {
	weapon: { attack: 2 },
	armor: { defense: 2 },
	weight: 1, // heavier, but a good deal stronger
	price: (p) => p * 3,
	rarity: "uncommon",
});
game.gearModifier("glowing", { weapon: { light: 3 }, color: "#9ff0ff", rarity: "uncommon" }); // lights 2 squares around the hero in the dark
game.gearModifier("golden", { slot: ["weapon", "armor", "ring"], color: "gold", price: (p) => p * 4, rarity: "rare" }); // no better, but the shopkeeper pays well for it
game.gearModifier("rusted", { weapon: { attack: -1 }, armor: { defense: -1 }, price: (p) => p / 3, color: "yellow" });

// The key to the storeroom in the mine (see game.scene("mine", ...) below).
// It's drawn on that scene's map; unique means it never turns up anywhere else.
game.item("iron_key", { name: "Iron Key", symbol: "k", tile: [33, 11], color: "gold", weight: 0, unique: true });

// ---------------------------------------------------------------------
//  MAP SQUARES  (ones of your own; wall, floor, door, water, tree, grass
//  and chest are built in)
// ---------------------------------------------------------------------

// A campfire. The old man sits by it (see beside: "campfire" below). Nobody
// can walk through it; `light` is how many squares around it the hero can
// see in the dark, and `glow` is a color that flickers over them, in daylight
// too. `frames` are the two pictures of the flames, shown in turn, and
// `fx` sends sparks flying up from it (see FX in zot.js for the fx there
// are; scene.addFx(x, y, "sparks") puts one on any square).
game.tile("campfire", {
	symbol: "^",
	tile: [14, 10],
	frames: [
		[14, 10],
		[12, 22],
	],
	fx: "sparks",
	color: "#ff9b3d",
	walkable: false,
	light: 5,
	glow: "#ff8a1f",
	// Walking into it. Returning false means no turn passes.
	onBump(player, x, y, game) {
		game.say("The fire crackles. It's warm.");
		return false;
	},
});

// The furniture of the house (see the "house" scene). The cottage is its
// door on the meadow: the square of the meadow's "house" exit. Nothing can
// stand on it, so the hero goes in by walking into it and comes out in front.
game.tile("cottage", { symbol: "H", tile: [1, 21], color: "#e3aa41", walkable: false, seeThrough: true });
game.tile("houseFloor", {
	symbol: ".",
	tile: [17, 0],
	color: "#291f14",
	walkable: true,
	seeThrough: true,
	ground: true,
});
game.tile("houseWall", {
	symbol: "#",
	tile: [7, 18],
	color: "#818509",
	walkable: false,
	seeThrough: false,
});
game.tile("window", { symbol: "O", tile: [14, 17], color: "#9fd3ff", walkable: false, seeThrough: true });
game.tile("table", { symbol: "T", tile: [2, 8], color: "#f7b430", walkable: false, seeThrough: true });
game.tile("oven", {
	symbol: "U",
	tile: [11, 8],
	color: "#b9b9cd",
	onBump(player, x, y, game) {
		game.say("There is no fire in the oven.");
		return false;
	},
	walkable: false,
	seeThrough: true,
});
game.tile("bookshelf", {
	symbol: "B",
	tile: [
		[3, 7],
		[4, 7],
	],
	color: "#bf8601",
	onBump(player, x, y, game) {
		game.say("You read a chapter from Journey to the Centre of the Earth.");
		return false;
	},
	walkable: false,
	seeThrough: true,
});

function bedTile(side) {
	return {
		symbol: "b",
		tile: [side === "left" ? 6 : 7, 8],
		color: "#f4f470",
		exactColor: true,
		walkable: false,
		seeThrough: true,
		onBump(player, x, y, game) {
			game.menu("Take a nap?", ["Yes", "Not now"], (i) => {
				if (i !== 0) return;
				game.dissolve(1000, () => {
					player.heal(player.maxHp, true);
					player.mp = player.maxMp;
					game.say("You feel well rested!", "good");
				});
				return true;
			});
			return false;
		},
	};
}
game.tile("bedLeft", bedTile("left"));
game.tile("bedRight", bedTile("right"));

// ---------------------------------------------------------------------
//  FRIENDLY FOLK  (walk into them to talk; nobody fights them)
// ---------------------------------------------------------------------

game.npc("cat", {
	symbol: "🐈",
	tile: [30, 7],
	color: "#926124",
	says: "Meow!",
	ai: "wander",
});

game.npc("merchant", {
	symbol: "M",
	tile: [25, 1],
	color: "gold",
	says: ["Welcome, traveler! Have a look.", "Back again? Good."], // one line per visit, then round again
	stock: ["torch", "potion", "mp_potion", "leather_armor", "sword", "bow", "arrow", "throwing_knife"], // prices come from each item's `price`
	// A remark shown inside the shop. A list gives one per visit; a function
	// (npc, player) can change it with the hero's gold or what they carry.
	comment: "My prices are fair!",
	// Add prices: { potion: 15 } to give this shop its own price for something.
	// The merchant also buys anything with a price, for half. Add buys: false to stop that.
});

game.npc("old_man", {
	name: "Old Man",
	symbol: "@",
	tile: [24, 2],
	color: "gray",
	beside: "campfire", // he stays put (no ai: "wander"), with a campfire on a square next to him
	quest: "slay_dragon", // the first time you talk to him he hands this out (see QUESTS below)
	says: ["The cave mouth is close by.", "Careful down there."], // after that, these
});

game.npc("farmer", {
	symbol: "F",
	tile: [31, 2],
	color: "burlywood",
	ai: "wander", // shuffles about near where he started instead of standing still
	quest: "rats",
	says: "Lovely weather today.",
});

// ---------------------------------------------------------------------
//  QUESTS  (things people ask the hero to do; press j to see them)
// ---------------------------------------------------------------------

// The big one. kill: "dragon" means it's done when a dragon dies. The old
// man gives it out (quest: "slay_dragon" above) and says `ask` as he does.
game.quest("slay_dragon", {
	name: "Slay the Dragon",
	text: "The Dragon sleeps at the bottom of the dungeon, six floors down. Find the cave mouth and go in.",
	kill: "dragon",
	report: false, // done the moment the Dragon dies, no need to climb back up to say so
	// `ask` can be a line, or a function (npc, player) that makes one
	ask: (npc, player) =>
		`${player.name}! You're awake. The Dragon under the hill has taken everything we had. Someone has to go down there. Take this potion.`,
	onStart() {
		game.give("potion");
	},
});

// A small one. kill: { rat: 5 } counts five rats; without a `text` of its
// own, the quest list says "Defeat 5 rats." Then go back to the farmer
// for the reward: he says `wait` until it's done, and `thanks` when it is.
game.quest("rats", {
	name: "Rats in the Barley",
	text: "Take care of the rat problem for the farmer.",
	kill: { rat: 5 },
	reward: { gold: 25 }, // can also have xp: 10 and items: "potion" (or a list)
	ask: "Rats are eating my barley! Get rid of five of them and I'll pay you 25 gold.",
	wait: "Still rats in the barley. Five of them, then we talk.",
	thanks: "That's the rats sorted. Here, as promised.",
});

// ---------------------------------------------------------------------
//  SKILLS  (press 1, 2, 3... to use them)
// ---------------------------------------------------------------------

game.skill("fireball", {
	mp: 5,
	cooldown: 5,
	target: true,
	range: 6,
	learnAt: 3, // learned at level 3
	onUse(player, enemy) {
		game.say(`A fireball flies at ${enemy.label}!`);
		enemy.hurt(Zot.random(6, 12), player);
		enemy.addEffect("burning", { from: player }); // see the effects above
	},
});

game.skill("heal", {
	mp: 8,
	cooldown: 12,
	learnAt: 5,
	onUse(player) {
		player.heal(Zot.random(5, 10));
	},
});

game.skill("radiant", {
	mp: 8,
	cooldown: 100,
	learnAt: 2,
	onUse(player) {
		game.say("Light pours out of you and fills the passages.", "good");
		player.addEffect("radiant"); // see the effects above
	},
});

// ---------------------------------------------------------------------
//  SCENES
// ---------------------------------------------------------------------
// Each scene has a name of its own and says where its ways out lead: the
// `exits`. "down" is the > and "up" is the <; any other name is a portal,
// drawn on the map or put somewhere free. `level` is how tough it is: what
// the `level: { from: 2 }` on the enemies and items above go by.

// The meadow is outdoors: grass, trees and ponds. The > is the cave mouth,
// and the cottage somewhere on the grass is the door of the house.
game.scene("meadow", {
	name: "The Meadow",
	level: 1,
	exits: { down: "mine", house: { to: "house", at: "door", tile: "cottage" } }, // the cottage can't be walked on, so you go in by walking into it
	map: "overworld", // "dungeon", "rooms", "cave", "maze" or "overworld"
	width: 90, // bigger than the screen; the view scrolls to follow you
	height: 40,
	sight: 12, // you can see further outdoors
	daylight: true, // the sun is out: no torch needed (an overworld gets this anyway)
	enemies: 10, // spread over a big map, so fewer per screen than the dungeon
	items: 8,
	npcs: ["old_man", "farmer", "cat"], // they start out near where you do: the old man by his fire, the others wandering
});

// A house: one room, drawn by hand, with nothing in it but furniture. D is
// the door, the "door" exit, which leads back out to the cottage on the
// meadow; the hero arrives on it. Walk into the bed to rest.
game.scene("house", {
	name: "The House",
	exits: { door: { to: "meadow", at: "house" } },
	map: `
		WWWWWoWW
		Wbe,B,UW
		W,,,,,,o
		W,,,T,,W
		o,,,,,,W
		W,,,,,BW
		WWDWooWW
	`,
	legend: {
		",": "houseFloor",
		W: "houseWall",
		o: "window",
		b: "bedLeft",
		e: "bedRight",
		B: "bookshelf",
		U: "oven",
		T: "table",
		D: { tile: "openDoor", exit: "door" },
	},
	daylight: true,
	fog: false,
	variation: 0,
	enemies: 0,
	items: 0,
});

// The mine is drawn by hand: one letter per square. # is wall, . is floor,
// + a door, ~ water, = a chest, < the way back up and > the way down. The
// legend says what the other letters are: enemies, the merchant, ^ the
// campfire in his room, the key, and L, a door locked for the Iron Key. The
// storeroom behind it holds the chain mail and a ring of strength. S, in its
// east wall, is a secret door: it looks like any other wall until the hero
// walks into it, which opens it. Behind it is O, a secret way straight down
// to the depths (the "shortcut" exit). Zot adds a few random enemies and items on top
// (enemies: 0 and items: 0 would leave only what's drawn).
game.scene("mine", {
	name: "The Old Mine",
	level: 2,
	exits: { up: "meadow", down: "caves", shortcut: "depths" },
	map: `
############################################
#<....#..............#..........~~~........#
#.....+..............+........~~~~~~.......#
#.....#..............#.........~~~~........#
###+###############+###....................#
#.................#...#.......b............#
#..r..............#...#....................#
#.......=.........#...####+#######...#######
#.................+...#..........#...#.....#
########+##########...#....g.....+...+..k..#
#........#........#...#..........#...#.....#
#...M....+........#...########+##############
#.....^..#....j...#.........#....#.....#...O#
#........#........#....s....#....L..=..#....#
####+#####........+.........#....#..r..S....#
#~................#........>#....#.....#....#
#############################################
`,
	legend: {
		r: "rat",
		b: "bat",
		g: "goblin",
		j: "slime",
		s: "skeleton",
		M: "merchant",
		"^": "campfire",
		k: "iron_key",
		L: { tile: "lockedDoor", key: "iron_key" },
		S: "secretDoor",
		O: { tile: "portal", exit: "shortcut" },
	},
	chests: ["torch", ["chain_mail", "ring_of_strength"]], // the two = squares, in reading order
	enemies: 5,
	items: 4,
	onEnter() {
		game.say("The air smells of damp earth and old timber.");
	},
});

// Pitch black: without a torch, only the squares touching the hero can be seen.
game.scene("caves", { name: "The Caves", level: 3, exits: { up: "mine", down: "depths" }, map: "cave", dark: 1.5 });

game.scene("depths", {
	name: "The Depths",
	level: 4,
	// The shortcut's portal here is put somewhere free; it leads back to the mine's.
	exits: { up: "caves", down: "labyrinth", shortcut: "mine" },
	npcs: "merchant",
	// This scene's chests hold exactly these (on top of the loose items),
	// instead of random finds. One name or a list per chest.
	chests: [["ring_of_life", "potion"], "fire_sword"],
});

// A maze: winding passages one square wide, with a few small rooms let in.
// You arrive in one; the way down is in the one furthest to walk to; the
// side rooms each hold a monster, a chest or both. The size and the number
// of side rooms are the scene's to choose (a game made of numbered floors
// gets a maze thrown in every so often by itself, see `maze` in the settings).
game.scene("labyrinth", {
	name: "The Labyrinth",
	level: 5,
	exits: { up: "depths", down: "lair" },
	map: "maze",
	width: 48,
	height: 31,
	rooms: 4,
});

// No way down from here: the only way to win is the quest, slay the Dragon (see QUESTS).
game.scene("lair", {
	name: "The Dragon's Lair",
	level: 6,
	exits: { up: "labyrinth" },
	map: "rooms",
	boss: "dragon",
	treasure: ["potion", "potion", "diamond"],
	onEnter() {
		game.say("You hear a deep rumbling breath...");
	},
});

// ---------------------------------------------------------------------
//  GO!
// ---------------------------------------------------------------------
game.start();
