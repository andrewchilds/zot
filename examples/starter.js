import * as Zot from "../zot.js";

// This is the most basic game possible in Zot. Change a number
// or a name and press Run to see what happens.
//
// The lines that start with // are commented out, so they don't run.
// Take away the // to enable it and then click the Run button to try it.

const game = new Zot.Game({
	scenes: 3, // this is a quick way to set the game world as a 3-level dungeon.
	tileset: true, // false uses ASCII (text) characters instead
	title: "Starter Dungeon", // an optional name shown in the sidebar
	// welcome: "Welcome, Hero!",   // the first line in the log
});

game.hero({
	name: "Sam",
	hp: 15,
	attack: 3,
	// defense: 1,                  // comes off every hit taken
	// gold: 20,                    // gold to start with
	// items: ["potion"],           // items to start with
});

game.enemy("goblin", {
	symbol: "g", // the letter drawn for it without pictures
	tile: [26, 2],
	color: "lime",
	hp: 6,
	attack: 2,
	xp: 5, // what the hero gets for killing it
	// defense: 1, // comes off every hit it takes
	// speed: 1.5, // 1 is normal, 2 is twice as fast
	// ai: "wander", // "chase", "wander", "still" or "flee"
	// level: { from: 2 }, // only on level 2 and below
	// drops: { gold: 60, potion: 10 }, // percent chances, one roll
});

game.item("potion", {
	symbol: "!",
	color: "hotpink",
	price: 10, // what a shop would charge for this item
	onUse(player) {
		player.heal(8);
		// player.heal(Zot.random(6, 12)); // or make it a random amount
	},
	// rarity: "uncommon",          // "common", "uncommon", "rare" or "legendary"
	// count: 2,                    // how many come in a pile
});

game.start();
