import * as Zot from "../zot.js";

// The Starter Dungeon with more in it: a sword to find, two skills, and an
// old man by a campfire with a quest to hand out. Each block is one kind of
// thing a game can have; the lines that start with // are options to try.
const game = new Zot.Game({
	title: "The Campfire",
	scenes: 3,
	// welcome: "Welcome, Hero!",   // the first line in the log
	// fog: false,                  // show the whole map from the start
});

game.hero({
	name: "Sam",
	hp: 15,
	mp: 6, // magic points, for skills
	attack: 3,
	// skills: ["haste"], 					// what skills are known from the start
	// defense: 1,
	// gold: 20,
	// items: ["potion", "sword"],  // items to start with
});

game.enemy("goblin", {
	symbol: "g", // the letter drawn for it without pictures
	tile: [26, 2], // the picture: column 26, row 2 of tiles/guide.png
	color: "lime",
	hp: 6,
	attack: 2,
	xp: 5, // what the hero gets for killing it
	// defense: 1,                  // comes off every hit it takes
	// speed: 1.5,                  // 1 is normal, 2 is twice as fast
	// ai: "wander",                // "chase", "wander" or "still"
	// level: { from: 2 },          // only on scene 2 and below
	// drops: { gold: 60, potion: 10 },  // percent chances, one roll
});

// One that keeps its distance: it throws knives at the hero whenever
// they're in a straight line (the same row or column), and fights up
// close once they're next to it. It never runs out of knives
game.enemy("knife_goblin", {
	name: "Knife Goblin",
	symbol: "g",
	tile: [29, 2],
	color: "olive",
	hp: 4,
	attack: 2,
	xp: 7,
	shoots: "knife", // any item: here the same knives the hero throws
	range: 4, // how far it throws (its sight if left out)
	level: { from: 2 },
	drops: { knife: 50 },
});

game.item("potion", {
	symbol: "!",
	color: "hotpink",
	price: 10, // what a shop charges
	onUse(player) {
		player.heal(8);
	},
	// rarity: "uncommon",          // "common", "uncommon", "rare" or "legendary"
	// count: 2,                    // how many come in a pile
});

// Gear has a slot: wearing it adds its numbers to the hero's
game.item("sword", {
	slot: "weapon", // "weapon", "armor", "light" or "ring"
	symbol: "/",
	color: "silver",
	attack: 2,
	price: 25,
	// weight: 3,                   // how heavy it is to carry
	// level: { from: 2 },          // only found on scene 2 and below
});

// Anything with throw can be thrown: press h to throw one at the closest
// enemy in a straight line. It hits with its own attack, not the sword's,
// and is gone, hit or miss
game.item("knife", {
	symbol: "-",
	tile: [32, 6],
	color: "silver",
	attack: 2,
	throw: 4, // how many squares it flies
	count: 3, // how many come in a pile
	// weight: 0.5,                 // each
});

// Skills are spells or powers. This one is learned at level 2
game.skill("heal", {
	mp: 5, // what it costs
	cooldown: 10, // turns before it can be used again
	learnAt: 3,
	onUse(player) {
		player.heal(10);
	},
	// target: true,                // needs an enemy in sight: onUse(player, enemy)
	// range: 6,                    // how far away that enemy may be
});

// A skill that wears off: it puts the hasty effect (below) on the hero.
game.skill("haste", {
	mp: 4,
	learnAt: 2,
	cooldown: 20, // longer than it lasts, so it can't stack
	onUse(player) {
		player.addEffect("hasty");
	},
});

// An effect stays with someone for a few turns. This one adds 1 to the
// hero's speed for ten turns (1 is normal, 2 is twice as fast), then wears
// off. An effect can add to any of the hero's numbers (attack, defense,
// sight...) the way worn gear does, and shows on the side panel while it lasts.
game.effect("hasty", {
	turns: 10,
	speed: 1,
	onStart() {
		game.say("Your feet feel light. You move twice as fast!", "good");
	},
	onEnd() {
		game.say("You slow down again.");
	},
});

game.tile("campfire", {
	symbol: "^",
	tile: [14, 10],
	frames: [
		// two pictures of the flames, shown in turn
		[14, 10],
		[12, 22],
	],
	fx: "sparks", // sparks flying up from it
	color: "#ff9b3d",
	walkable: false,
	light: 5, // lights the squares around it in the dark
	glow: "#ff8a1f", // a color that flickers over them
	// Walking into it. Returning false means no turn passes
	onBump(player, x, y, game) {
		game.say("The fire crackles. It's warm.");
		return false;
	},
});

game.npc("old_man", {
	name: "Old Man",
	symbol: "@",
	tile: [24, 2],
	color: "gray",
	beside: "campfire", // the campfire, on a square next to him
	quest: "goblins", // handed out the first time you talk
	says: "Careful down there.", // after that, this
	// stock: ["potion", "sword"],  // makes him a shop
	// ai: "wander",                // strolls about instead of sitting
});

game.quest("goblins", {
	name: "Goblin Trouble",
	kill: { goblin: 3 }, // done when three goblins have died
	reward: { gold: 30, xp: 10 },
	ask: "Goblins! Get rid of three of them and I'll make it worth your while.",
	thanks: "Well done. Here, take this.",
	// bring: { potion: 2 }, // or done when the hero holds these
	// wait: "Still goblins about.", // what he says until it's done
	// report: false, // done at once, no need to go back
});

// The numbered scenes are made at random; this changes the first one
game.scene(1, {
	name: "The Way In",
	npcs: ["old_man"], // friendly folk placed near the hero
	enemies: 5, // how many enemies to add at random
	// map: "cave", // "dungeon", "rooms", "cave", "maze" or "overworld"
	// items: 2, // how many items to scatter about
	// dark: 2, // how far the hero sees without a light
});

game.start();
