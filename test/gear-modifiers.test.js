import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage } from "./helpers.js";

// The hero (@) in an empty room with a few kinds of gear defined, and the mods under test.
function hero({ mods = {}, items = [], ...config } = {}) {
  const game = makeGame({ player: { name: "T", hp: 30, attack: 5, strength: 20, items }, ...config });
  game.item("potion", { price: 10, onUse(p) { p.heal(10); } });
  game.item("sword", { slot: "weapon", attack: 2, weight: 2, price: 40 });
  game.item("bow", { slot: "weapon", attack: 1, weight: 2, shoots: "arrow", range: 6 });
  game.item("arrow", { count: 5, weight: 0 });
  game.item("mail", { slot: "armor", defense: 3, weight: 4, price: 70 });
  game.item("ring", { slot: "ring", maxHp: 5, weight: 0 });
  for (const name in mods) game.gearModifier(name, mods[name]);
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

const MODS = {
  enchanted: { weapon: { attack: 1 }, armor: { defense: 1 }, price: (p) => p * 2 },
  elvish: { weight: (w) => w / 2 },
  gilded: { slot: ["weapon", "ring"], color: "gold" },
};

describe("what a gear modifier does to an item", () => {
  test("a number is added, a function transforms, a word replaces; the name is both", () => {
    const { game } = hero({ mods: MODS });
    const sword = game.lookup("item", "enchanted sword");
    expect(sword.name).toBe("Enchanted Sword");
    expect(sword.attack).toBe(3);
    expect(sword.price).toBe(80);
    expect(sword.defense).toBeUndefined(); // the armor field doesn't touch a weapon
    expect(game.lookup("item", "elvish mail").weight).toBe(2);
    expect(game.lookup("item", "gilded ring").color).toBe("gold");
    expect(game.lookup("item", "sword").attack).toBe(2); // the plain one is as it was
  });

  test("a function on something the item doesn't have is skipped; weight is 1 when unsaid", () => {
    const { game } = hero({ mods: { odd: { price: (p) => p * 2, weight: (w) => w + 1, range: 1 } } });
    game.item("club", { slot: "weapon", attack: 1 });
    const club = game.lookup("item", "odd club");
    expect(club.price).toBeUndefined();
    expect(club.weight).toBe(2);
    expect(club.range).toBe(1); // a number sets what wasn't there
  });

  test("one def per pair, with the item's kind", () => {
    const { game } = hero({ mods: MODS });
    const a = game.lookup("item", "enchanted sword");
    expect(game.lookup("item", "enchanted sword")).toBe(a);
    expect(a.id).toBe("sword");
    expect(a.gearModifier).toBe("enchanted");
  });

  test("a gear modifier that names slots goes only on those; a potion takes none", () => {
    const { game } = hero({ mods: MODS });
    expect(() => game.lookup("item", "enchanted ring")).toThrow(/weapon or armor/);
    expect(() => game.lookup("item", "gilded mail")).toThrow(/weapon or ring/);
    expect(game.lookup("item", "elvish ring").name).toBe("Elvish Ring");
    expect(() => game.lookup("item", "elvish potion")).toThrow(/needs a slot/);
    expect(() => game.lookup("item", "shiny sword")).toThrow(/no gearModifier called "shiny"/);
    expect(() => game.lookup("item", "elvish axe")).toThrow(/no item called "axe"/);
  });

  test("the wrong shape of a change is refused", () => {
    const { game } = hero();
    expect(() => game.gearModifier("x", { weapon: [1] })).toThrow(/weight: \(w\) => w \/ 2/);
    expect(() => game.gearModifier("x", { attack: true })).toThrow(/^Zot:/);
    expect(() => game.gearModifier("x", { rarity: "epic" })).toThrow(/legendary/);
    expect(() => game.gearModifier("x", { slot: 3 })).toThrow(/slot: \["weapon", "armor"\]/);
    expect(() => game.gearModifier("x", { level: "mine" })).toThrow(/level: \{ from: 2, to: 4 \}/);
    game.gearModifier("fine", { attack: 1, weight: (w) => w, color: "red", weapon: { attack: 1 }, level: { from: 2 } });
    expect(game.defs.gearModifier.fine.name).toBe("Fine");
  });
});

describe("wearing and carrying one", () => {
  test("give, wield: the bonus counts and the message names it", () => {
    const { game, player } = hero({ mods: MODS });
    const it = game.give("enchanted sword");
    expect(it.kind).toBe("sword");
    expect(player.has("sword")).toBe(true);
    player.equip(it);
    expect(lastMessage(game)).toBe("You wield the Enchanted Sword.");
    expect(player.attack).toBe(8);
    expect(it.bonuses).toEqual([{ stat: "attack", value: 3 }]);
  });

  test("starting gear can have one", () => {
    const { player } = hero({ mods: MODS, items: ["elvish mail"] });
    expect(player.gear.armor.name).toBe("Elvish Mail");
    expect(player.load).toBe(2);
  });

  test("enchanted swords pile up together, never with a plain one", () => {
    const { game, player } = hero({ mods: MODS });
    game.give("sword");
    game.give("enchanted sword");
    game.give("enchanted sword");
    expect(player.items.map((it) => it.label).sort()).toEqual(["Enchanted Sword x2", "Sword"]);
  });

  test("a chest can hold one, and so can the floor", () => {
    const game = makeGame({ player: { strength: 20 } });
    game.item("sword", { slot: "weapon", attack: 2 });
    game.gearModifier("enchanted", { attack: 1 });
    game.scene(1, { map: ["#####", "#@=.#", "#####"], enemies: 0, items: 0, chests: [["enchanted sword"]] });
    game.start();
    game.currentScene.drop("enchanted sword", 3, 1);
    expect(game.currentScene.items[0].name).toBe("Enchanted Sword");
    press("ArrowRight");
    expect(game.player.itemNamed("sword").name).toBe("Enchanted Sword");
  });

  test("the shop pays the modified price, and ignores its own price for the plain thing", () => {
    const { game, player } = hero({ mods: MODS });
    game.npc("shop", { stock: ["sword"], prices: { sword: 100 } });
    game.give("sword");
    game.give("enchanted sword");
    game.currentScene.spawn("shop", 4, 2);
    press("ArrowRight");
    const notes = [...game.el.overlay.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim());
    expect(notes.some((t) => /Sell Sword.*50 gold/.test(t))).toBe(true); // the shop's 100, halved
    expect(notes.some((t) => /Sell Enchanted Sword.*40 gold/.test(t))).toBe(true); // 40 doubled, halved
    expect(player.gold).toBe(0);
  });
});

// Whether a find gets a gear modifier comes from the scene generator, so this uses seeded dungeons.
describe("finding one", () => {
  function dungeon({ gearModifierChance, mods, seed = 7 }) {
    const game = makeGame({ seed, scenes: 2, gearModifierChance });
    game.item("potion", { onUse() {} });
    game.item("sword", { slot: "weapon", attack: 2 });
    game.item("mail", { slot: "armor", defense: 1 });
    for (const name in mods) game.gearModifier(name, mods[name]);
    game.scene(1, { chests: 0, items: 12 });
    game.start();
    return game;
  }
  const found = (game) => game.currentScene.items.map((it) => it.name);

  test("at 100% every piece of gear has one, and a potion never does", () => {
    const game = dungeon({ gearModifierChance: 100, mods: MODS });
    const names = found(game);
    expect(names.length).toBeGreaterThan(3);
    expect(names.filter((n) => n === "Potion").length).toBeGreaterThan(0);
    expect(names.every((n) => n === "Potion" || /^(Enchanted|Elvish|Gilded) /.test(n))).toBe(true);
    expect(names.some((n) => n !== "Potion")).toBe(true);
  });

  test("at 0% there are none, and the dungeon is the same as without any mods", () => {
    const a = dungeon({ gearModifierChance: 0, mods: MODS });
    const b = dungeon({ gearModifierChance: 10, mods: {} });
    expect(found(a).every((n) => !/^(Enchanted|Elvish|Gilded) /.test(n))).toBe(true);
    expect(found(a)).toEqual(found(b));
  });

  test("a gear modifier's level keeps it off the scenes it doesn't belong to", () => {
    const game = dungeon({ gearModifierChance: 100, mods: { deep: { attack: 1, level: { from: 2 } } } });
    expect(found(game).every((n) => !n.startsWith("Deep "))).toBe(true);
  });

  test("a chest's random contents can have one too", () => {
    const game = makeGame({ seed: 3, scenes: 1, gearModifierChance: 100 });
    game.item("sword", { slot: "weapon", attack: 2 });
    game.gearModifier("enchanted", { attack: 1 });
    game.scene(1, { chests: 3, items: 6 });
    game.start();
    const inChests = Object.values(game.currentScene.chests).flat();
    expect(inChests.length).toBeGreaterThan(0);
    expect(inChests.every((n) => n === "enchanted sword")).toBe(true);
  });
});
