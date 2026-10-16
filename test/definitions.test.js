import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

describe("level: which levels a thing appears on", () => {
  const game = makeGame({ scenes: 5 });
  game.enemy("a", { level: 3 });
  game.enemy("b", { level: [1, 5] });
  game.enemy("c", { level: { from: 2, to: 4 } });
  game.enemy("d", { level: { from: 4 } });
  game.enemy("e", { level: { to: 2 } });
  game.enemy("f", {});
  game.enemy("g", { scenes: 3 }); // the old spelling: a number in scenes is a level too
  const on = (n) => Object.keys(game.pool("enemy", n)).sort().join("");

  test("a number is that one level", () => {
    expect(on(3)).toContain("a");
    expect(on(2)).not.toContain("a");
    expect(on(3)).toContain("g");
    expect(on(2)).not.toContain("g");
  });

  test("a list is exactly those scenes", () => {
    expect([1, 2, 3, 4, 5].filter((n) => on(n).includes("b"))).toEqual([1, 5]);
  });

  test("{ from, to } is a range, and either end can be left open", () => {
    expect([1, 2, 3, 4, 5].filter((n) => on(n).includes("c"))).toEqual([2, 3, 4]);
    expect([1, 2, 3, 4, 5].filter((n) => on(n).includes("d"))).toEqual([4, 5]);
    expect([1, 2, 3, 4, 5].filter((n) => on(n).includes("e"))).toEqual([1, 2]);
  });

  test("no level and no scenes means every scene", () => {
    expect([1, 2, 3, 4, 5].every((n) => on(n).includes("f"))).toBe(true);
  });
});

describe("the wrong shape of a property is refused with the right one", () => {
  const game = makeGame();
  const refuse = (fn, shape) => {
    expect(fn).toThrow(/^Zot:/);
    expect(fn).toThrow(shape);
  };

  test("drops as a list", () => refuse(() => game.enemy("x", { drops: ["gold"] }), "drops: { gold: 60"));
  test("rarity as a number", () => refuse(() => game.enemy("x", { rarity: 3 }), '"legendary"'));
  test("stock as a table points at prices", () => refuse(() => game.npc("x", { stock: { potion: 5 } }), "prices: { potion: 15 }"));
  test("a scenes list with something that isn't a scene", () => refuse(() => game.item("x", { scenes: [2, true] }), 'scenes: ["mine", "lair"]'));
  test("an empty scenes range", () => refuse(() => game.item("x", { scenes: {} }), "scenes:"));
  test("a level that is a name", () => refuse(() => game.item("x", { level: "mine" }), "level: { from: 2, to: 4 }"));
  test("an empty level range", () => refuse(() => game.item("x", { level: {} }), "level:"));

  test("the right shapes are accepted", () => {
    game.enemy("fine", { drops: { gold: 100 }, rarity: "rare", scenes: 2 });
    expect(game.defs.enemy.fine).toBeDefined();
  });
});

describe("a key that isn't an option is refused, with a guess at what was meant", () => {
  const game = makeGame();

  test("a misspelling gets the right name", () => {
    expect(() => game.enemy("goblin", { colour: "lime" })).toThrow(/the goblin enemy has no option called "colour". Did you mean color\?/);
    expect(() => game.hero({ attak: 3 })).toThrow(/the hero has no option called "attak". Did you mean attack\?/);
    expect(() => game.item("potion", { onuse() {} })).toThrow(/Did you mean onUse\?/);
    expect(() => game.quest("rats", { kills: { rat: 5 } })).toThrow(/the rats quest .*Did you mean kill\?/);
    expect(() => game.scene(2, { enemys: 3 })).toThrow(/scene 2 has no option called "enemys". Did you mean enemies\?/);
    expect(() => game.tile("fire", { walkabel: false })).toThrow(/the fire tile .*Did you mean walkable\?/);
    expect(() => game.skill("zap", { cooldwon: 3 })).toThrow(/Did you mean cooldown\?/);
    expect(() => game.npc("bob", { say: "hi" })).toThrow(/Did you mean says\?/);
    expect(() => makeGame({ titel: "x" })).toThrow(/the game's settings has no option called "titel". Did you mean title\?/);
  });

  test("a key like nothing points at the list instead", () => {
    expect(() => game.enemy("goblin", { hitpoints: 6 })).toThrow(/no option called "hitpoints". game.enemy in README.md lists/);
    expect(() => makeGame({ difficulty: 2 })).toThrow(/The game settings in README.md lists/);
  });

  test("the keys inside a table are not checked", () => {
    game.enemy("rat", { drops: { gold: 50, anything: 1 } });
    game.scene(3, { exits: { down: "x" }, legend: { g: { tile: "grass", on: "rat" } } });
    expect(game.defs.enemy.rat).toBeDefined();
  });

  test("the game stops at the first bad key, so nothing half-made is left", () => {
    expect(() => game.item("sword", { slot: "weapon", attck: 2 })).toThrow();
    expect(game.defs.item.sword).toBeUndefined();
  });
});

test("a shop's prices override an item's own price", () => {
  const game = makeGame({ player: { gold: 100 } });
  game.item("potion", { price: 12, onUse() {} });
  game.item("sword", { slot: "weapon", price: 40 });
  game.npc("shop", { stock: ["potion", "sword"], prices: { potion: 3 } });
  game.scene(1, { map: ["#####", "#@S.#", "#####"], legend: { S: "shop" }, enemies: 0, items: 0 });
  game.start();
  press("ArrowRight"); // opens the shop: 1 is the potion, 2 the sword
  press("1");
  expect(game.player.gold).toBe(97);
  press("2");
  expect(game.player.gold).toBe(57);
});
