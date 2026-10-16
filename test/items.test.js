import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

// The hero (@) in the middle of an empty room, carrying a potion and wielding a sword.
function hero({ items = ["potion", "sword"], skills = {}, ...config } = {}) {
  const game = makeGame({ player: { name: "T", hp: 30, attack: 5, items }, ...config });
  game.item("potion", { onUse(p) { p.heal(10); } });
  game.item("sword", { slot: "weapon", attack: 2 });
  game.item("fire", { onUse() {} });
  for (const name in skills) game.skill(name, skills[name]);
  game.scene(1, {
    map: `
      #######
      #.....#
      #..@..#
      #.....#
      #######
    `,
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player };
}

describe("starting gear", () => {
  test("a starting item with a slot is worn, and adds its attack", () => {
    const { player } = hero();
    expect(player.gear.weapon.kind).toBe("sword");
    expect(player.attack).toBe(7);
    expect(player.unworn.map((it) => it.kind)).toEqual(["potion"]);
  });

  test("worn things count against what the hero can carry", () => {
    const { game, player } = hero({ carry: () => 3 });
    expect(game.give("fire")).toBeTruthy();
    expect(player.load).toBe(3);
    expect(game.give("potion")).toBeFalsy();
  });
});

describe("the item list (i)", () => {
  test("picking a number uses that item and closes the list", () => {
    const { game, player } = hero();
    player.hp = 5;
    press("i");
    expect(game.mode).toBe("menu");
    press("1");
    expect(game.mode).toBe("play");
    expect(player.hp).toBeGreaterThan(5);
    expect(player.has("potion")).toBe(false);
  });

  test("Escape closes it", () => {
    const { game } = hero();
    press("i");
    press("Escape");
    expect(game.mode).toBe("play");
  });

  test("a worn thing's letter takes it off, and its attack goes with it", () => {
    const { player } = hero({ items: ["sword"] });
    press("i");
    press("a");
    expect(player.gear.weapon).toBeFalsy();
    expect(player.attack).toBe(5);
  });
});

describe("number keys on the map", () => {
  test("an unworn item's number uses it and takes a turn", () => {
    const { game, player } = hero();
    player.hp = 5;
    const turn = game.turn;
    press("1");
    expect(player.hp).toBeGreaterThan(5);
    expect(player.has("potion")).toBe(false);
    expect(game.turn).toBe(turn + 1);
  });

  test("a sword taken off is wielded again by its number", () => {
    const { player } = hero({ items: ["sword"] });
    press("i");
    press("a");
    press("1");
    expect(player.gear.weapon.kind).toBe("sword");
  });

  test("skills take the first numbers, and the items follow", () => {
    let zapped = 0;
    const { player } = hero({ skills: { zap: { onUse() { zapped++; } } } });
    player.learn("zap", true);
    player.hp = 5;
    press("1");
    expect(zapped).toBe(1);
    press("2");
    expect(player.has("potion")).toBe(false);
  });

  test("a skill with its own letter key leaves the numbers to the items", () => {
    let zapped = 0;
    const { player } = hero({ skills: { zap: { key: "f", onUse() { zapped++; } } } });
    player.learn("zap", true);
    press("1");
    expect(player.has("potion")).toBe(false);
    expect(zapped).toBe(0);
  });
});

describe("dropping and picking up", () => {
  test("x drops a worn thing under the hero, and walking back onto it picks it up", () => {
    const { game, player } = hero({ items: ["sword"] });
    press("x");
    press("a");
    expect(player.items).toHaveLength(0);
    expect(game.currentScene.itemAt(player.x, player.y).kind).toBe("sword");
    press("ArrowRight");
    press("ArrowLeft");
    expect(player.has("sword")).toBe(true);
  });

  // Two swords lie to the right of the hero, who carries nothing, and walks over both.
  function twoSwords() {
    const { game, player } = hero({ items: [] });
    game.currentScene.drop("sword", player.x + 1, player.y);
    const second = game.currentScene.drop("sword", player.x + 2, player.y);
    press("ArrowRight");
    press("ArrowRight");
    return { game, player, second, pile: player.items[0] };
  }

  test("a second one piles onto the first", () => {
    const { game, player, second, pile } = twoSwords();
    expect(player.items).toHaveLength(1);
    expect(pile.count).toBe(2);
    expect(game.currentScene.items).not.toContain(second);
  });

  test("wielding one takes it off the pile, and taking it off puts it back", () => {
    const { player, pile } = twoSwords();
    player.use(pile);
    expect(player.gear.weapon).not.toBe(pile);
    expect(pile.count).toBe(1);
    expect(player.items).toHaveLength(2);
    player.use(player.gear.weapon);
    expect(player.gear.weapon).toBeFalsy();
    expect(pile.count).toBe(2);
    expect(player.items).toHaveLength(1);
  });

  test("removeItem with a count takes that many off the pile", () => {
    const { player, pile } = twoSwords();
    player.removeItem(pile, 1);
    expect(pile.count).toBe(1);
    expect(player.items).toHaveLength(1);
  });
});
