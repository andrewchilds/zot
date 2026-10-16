import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage } from "./helpers.js";

// The hero (@) at the west end of a corridor, a bow wielded and a pile of 5 arrows.
// Without pictures (the default here) an arrow lands the moment it's shot.
function range(config = {}) {
  const game = makeGame({ player: { hp: 30, attack: 5, items: ["bow", "arrow"] }, ...config });
  game.item("bow", { slot: "weapon", attack: 2, shoots: "arrow", range: 4, price: 45 });
  game.item("arrow", { count: 5, price: 2 });
  game.item("potion", { price: 10, onUse(p) { p.heal(1); } });
  game.enemy("rat", { hp: 3, attack: 1, defense: 0 });
  game.enemy("ogre", { hp: 50, attack: 1 });
  game.npc("bob", { says: "hi", stock: ["arrow", "potion"] });
  game.scene(1, {
    map: `
      ##########
      #........#
      #@.......#
      #........#
      ##########
    `,
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player };
}

const arrowsOnFloor = (game) => game.currentScene.items.filter((i) => i.kind === "arrow");

describe("a bow", () => {
  test("is wielded as the hero's shooter and adds its attack", () => {
    const { player } = range();
    expect(player.gear.weapon.kind).toBe("bow");
    expect(player.shooter).toBe(player.gear.weapon);
    expect(player.attack).toBe(7);
  });

  test("arrows come in a pile", () => {
    const { player } = range();
    expect(player.countOf("arrow")).toBe(5);
    expect(player.unworn).toHaveLength(1);
  });

  test("moving, or bumping a wall, turns the hero that way", () => {
    const { player } = range();
    expect(player.moveBy(1, 0)).toBe(true);
    expect(player.facing).toEqual([1, 0]);
    expect(player.moveBy(0, -1)).toBe(true);
    expect(player.moveBy(0, -1)).toBe(false); // the wall
    expect(player.facing).toEqual([0, -1]);
  });
});

describe("shooting", () => {
  test("f shoots the closest enemy in a straight line, using a turn and one arrow", () => {
    const { game, player } = range();
    const far = game.currentScene.spawn("ogre", player.x + 4, player.y);
    const near = game.currentScene.spawn("ogre", player.x, player.y + 1);
    const turn = game.turn;
    press("f");
    expect(game.turn).toBe(turn + 1);
    expect(player.countOf("arrow")).toBe(4);
    expect(near.hp).toBeLessThan(50);
    expect(far.hp).toBe(50);
  });

  test("f aims whichever way the enemy is, not the way the hero faces", () => {
    const { game, player } = range();
    player.moveBy(1, 0); // face east
    const rat = game.currentScene.spawn("rat", player.x + 2, player.y - 1); // not in line
    const ogre = game.currentScene.spawn("ogre", player.x + 3, player.y); // in line, east
    const west = game.currentScene.spawn("ogre", player.x - 1, player.y); // in line, west and closer
    const turn = game.turn;
    press("f");
    expect(game.turn).toBe(turn + 1);
    expect(west.hp).toBeLessThan(50);
    expect(ogre.hp).toBe(50);
    expect(rat.hp).toBe(3);
  });

  test("f with an enemy on a diagonal says so and takes no turn", () => {
    const { game, player } = range();
    game.currentScene.spawn("rat", player.x + 1, player.y + 1);
    const turn = game.turn;
    press("f");
    expect(lastMessage(game)).toBe("Can't fire diagonally.");
    expect(game.turn).toBe(turn);
    expect(player.countOf("arrow")).toBe(5);
  });

  test("f with an enemy in sight but out of line says so", () => {
    const { game, player } = range();
    game.currentScene.spawn("rat", player.x + 3, player.y + 1);
    press("f");
    expect(lastMessage(game)).toBe("There's no enemy in line to shoot at.");
  });

  test("f with nothing in sight says so", () => {
    const { game, player } = range();
    press("f");
    expect(lastMessage(game)).toBe("There's nothing to shoot at.");
    expect(player.countOf("arrow")).toBe(5);
  });

  test("f ignores an enemy in line but out of range", () => {
    const { game, player } = range();
    game.currentScene.spawn("rat", player.x + 6, player.y); // the bow's range here is 4
    press("f");
    expect(lastMessage(game)).toBe("There's no enemy in line to shoot at.");
  });

  test("with nothing to hit, the arrow flies the bow's range and lands there", () => {
    const { game, player } = range();
    player.moveBy(1, 0);
    player.shoot();
    const [fallen] = arrowsOnFloor(game);
    expect([fallen.x, fallen.y]).toEqual([player.x + 4, player.y]);
    expect(fallen.count).toBe(1);
  });

  test("an arrow that hits an enemy hurts it and is used up", () => {
    const { game, player } = range();
    const rat = game.currentScene.spawn("rat", player.x + 2, player.y);
    player.shoot(1, 0);
    expect(rat.dead).toBe(true);
    expect(arrowsOnFloor(game)).toHaveLength(0);
  });

  test("an enemy that survives comes looking where the arrow came from", () => {
    const { game, player } = range();
    const ogre = game.currentScene.spawn("ogre", player.x + 3, player.y);
    player.shoot(1, 0);
    expect(ogre.hp).toBeLessThan(50);
    expect(ogre.memory).toMatchObject({ x: player.x, y: player.y });
  });

  test("friendly folk are never hit: the arrow flies past to the enemy behind", () => {
    const { game, player } = range();
    const bob = game.currentScene.spawn("bob", player.x + 1, player.y);
    const rat = game.currentScene.spawn("rat", player.x + 2, player.y);
    expect(player.shoot(1, 0)).toBe(true);
    expect(bob.hp).toBe(bob.maxHp);
    expect(rat.dead).toBe(true);
  });

  test("straight into a wall takes no turn and no arrow", () => {
    const { player } = range();
    expect(player.shoot(-1, 0)).toBe(false);
    expect(player.countOf("arrow")).toBe(5);
  });

  test("can't shoot without arrows, or without a bow", () => {
    const { player } = range();
    player.removeItem("arrow");
    expect(player.shoot(1, 0)).toBe(false);
    expect(lastMessage(player.game)).toBe("You have no arrows left.");
    player.use(player.gear.weapon);
    expect(player.shooter).toBeFalsy();
    expect(player.shoot(1, 0)).toBe(false);
    expect(lastMessage(player.game)).toBe("You have nothing to shoot with.");
  });
});

// With pictures an arrow takes time to fly; keys and the monsters wait for it.
describe("an arrow in flight", () => {
  const until = (done) => new Promise((resolve) => {
    const t = setInterval(() => { if (done()) { clearInterval(t); resolve(); } }, 5);
  });

  test("hits only when it gets there, and the turn goes on after it lands", async () => {
    const { game, player } = range({ tileset: true });
    await until(() => game.tilesReady);
    player.moveBy(1, 0); // face east
    const rat = game.currentScene.spawn("rat", player.x + 2, player.y);
    const turn = game.turn;
    game.afterTurn(game.playerAction("f")); // what a key press does
    expect(game.flying).toBe(true);
    expect(rat.dead).toBe(false);
    expect(game.turn).toBe(turn);
    await until(() => !game.flying);
    expect(rat.dead).toBe(true);
    expect(game.turn).toBe(turn + 1);
  });
});

describe("arrows in shops and on the floor", () => {
  test("a shop sells a whole pile for count x price", () => {
    const { game, player } = range();
    player.gold = 12;
    const bob = game.currentScene.spawn("bob", player.x + 1, player.y);
    game.shop(bob);
    expect(game.menuState.options[0].label).toBe("Buy Arrow x5");
    game.menuState.onPick(0);
    expect(player.gold).toBe(2);
    expect(player.countOf("arrow")).toBe(10);
  });

  test("a shop buys arrows one at a time, for half of one arrow's price", () => {
    const { game, player } = range();
    const bob = game.currentScene.spawn("bob", player.x + 1, player.y);
    game.shop(bob);
    const sell = game.menuState.options.findIndex((o) => /^Sell Arrow/.test(o.label));
    game.menuState.onPick(sell);
    expect(player.countOf("arrow")).toBe(4);
    expect(player.gold).toBe(1);
  });

  test("game.give gives a whole pile", () => {
    const { game, player } = range();
    game.give("arrow");
    expect(player.countOf("arrow")).toBe(10);
  });

  test("a pile on the floor is picked up as one", () => {
    const { game, player } = range();
    player.removeItem("arrow");
    const pile = game.currentScene.drop("arrow", player.x + 1, player.y);
    expect(pile.count).toBe(5);
    player.moveTo(pile.x, pile.y);
    expect(player.countOf("arrow")).toBe(5);
  });
});

describe("mistakes are explained", () => {
  test("shoots without a slot", () => {
    const game = makeGame();
    expect(() => game.item("sling", { shoots: "stone" })).toThrow(/needs a slot/);
  });

  test("a count that isn't a number", () => {
    const game = makeGame();
    expect(() => game.item("bolt", { count: "5" })).toThrow(/count is how many come in a pile/);
  });

  test("shooting something that doesn't exist is caught at start", () => {
    const game = makeGame();
    game.item("crossbow", { slot: "weapon", shoots: "bolt" });
    expect(() => game.start()).toThrow(/no item called "bolt"/);
  });
});
