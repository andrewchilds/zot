import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

// The hero (@) with a potion and a wielded sword, in a room with space on every side.
function strongman(config = {}) {
  const game = makeGame({ player: { name: "T", hp: 50, attack: 4, items: ["potion", "sword"] }, ...config });
  game.item("potion", { onUse(p) { p.heal(1); }, price: 4 });
  game.item("sword", { slot: "weapon", attack: 2, weight: 2 });
  game.item("anvil", { weight: 20, price: 5 });
  game.item("arrow", { count: 5, weight: 0.2, price: 2 });
  game.item("bow", { slot: "weapon", attack: 2, shoots: "arrow" });
  game.item("ring", { name: "Ring of Strength", slot: "ring", strength: 4, weight: 0 });
  game.item("key", { weight: 0 });
  game.enemy("rat", { hp: 1000, attack: 1, defense: 0 });
  game.enemy("ogre", { hp: 1000, attack: 1 });
  game.npc("bob", { says: "hi", stock: ["anvil", "potion"] });
  game.skill("zap", { target: true, range: 5, onUse(p, e) { e.hurt(10, p); } });
  game.scene(1, {
    map: `
      #########
      #.......#
      #...@...#
      #.......#
      #########
    `,
    enemies: 0, items: 0, chests: 0,
  });
  game.start();
  return { game, player: game.player };
}

// Fill the hero's pack up to exactly 15 (their strength).
function fillUp(game, player) {
  for (let i = 0; i < 12; i++) game.give("potion"); // 3 + 12 = 15
  expect(player.load).toBe(15);
}

describe("carrying", () => {
  test("the hero starts with strength 15 and can carry that much", () => {
    const { player } = strongman();
    expect(player.strength).toBe(15);
    expect(player.carry).toBe(15);
  });

  test("an item without a weight weighs 1, and worn things count toward the load", () => {
    const { player } = strongman();
    expect(player.unworn[0].weight).toBe(1);
    expect(player.load).toBe(3); // potion 1 + wielded sword 2
    expect(player.overloaded).toBe(false);
  });

  test("a pile weighs its count times the weight", () => {
    const { game, player } = strongman();
    game.give("arrow");
    expect(player.itemNamed("arrow").weight).toBe(1); // 5 arrows at 0.2
    expect(player.load).toBe(4);
  });

  test("something too heavy stays out", () => {
    const { game, player } = strongman();
    expect(game.give("anvil")).toBeFalsy();
    expect(player.has("anvil")).toBe(false);
  });

  test("piles grow while there's room, then stop", () => {
    const { game, player } = strongman();
    fillUp(game, player);
    expect(game.give("potion")).toBeFalsy();
    expect(player.load).toBe(15);
  });

  test("something light still fits into what's left exactly", () => {
    const { game, player } = strongman();
    for (let i = 0; i < 11; i++) game.give("potion"); // 14
    expect(game.give("arrow", 5)).toBeTruthy(); // 1 more
    expect(player.load).toBeCloseTo(15);
  });

  test("a weight of 0 fits when the pack is full", () => {
    const { game, player } = strongman();
    fillUp(game, player);
    expect(game.give("key")).toBeTruthy();
  });

  test("a shop won't sell what's too heavy, and takes no gold for trying", () => {
    const { game, player } = strongman();
    const bob = game.currentScene.spawn("bob", player.x + 1, player.y);
    player.gold = 100;
    game.shop(bob);
    const anvil = game.menuState.options.findIndex((o) => /Anvil/.test(o.label));
    press(String(anvil + 1));
    expect(player.gold).toBe(100);
    expect(player.has("anvil")).toBe(false);
  });

  test("a weight that isn't a number 0 or more is explained", () => {
    const { game } = strongman();
    expect(() => game.item("bad", { weight: -1 })).toThrow(/weight: -1/);
    expect(() => game.item("bad", { weight: "heavy" })).toThrow(/weight: "heavy"/);
  });
});

describe("a ring of strength", () => {
  test("raises strength and what the hero can carry, without changing the load", () => {
    const { game, player } = strongman();
    const ring = game.give("ring");
    player.use(ring);
    expect(player.strength).toBe(19);
    expect(player.base.strength).toBe(15);
    expect(player.carry).toBe(19);
    expect(player.load).toBe(3);
  });

  test("taking it off can leave the hero overloaded, and then nothing more fits", () => {
    const { game, player } = strongman();
    const ring = game.give("ring");
    player.use(ring);
    for (let i = 0; i < 15; i++) game.give("potion"); // 18 of 19
    expect(player.overloaded).toBe(false);
    player.use(ring);
    expect(player.carry).toBe(15);
    expect(player.overloaded).toBe(true);
    expect(game.give("key")).toBeFalsy();
  });

  test("putting it back on puts things right", () => {
    const { game, player } = strongman();
    const ring = game.give("ring");
    player.use(ring);
    for (let i = 0; i < 15; i++) game.give("potion");
    player.use(ring);
    player.use(ring);
    expect(player.overloaded).toBe(false);
    expect(game.give("key")).toBeTruthy();
  });
});

describe("strength and damage", () => {
  test("strength over or under the starting 15 adds to or takes from a hit", () => {
    const { game, player } = strongman();
    expect(player.strengthBonus).toBe(0);
    player.use(game.give("ring"));
    expect(player.strengthBonus).toBe(1); // 19
    player.base.strength = 6;
    expect(player.strengthBonus).toBe(-2); // 10
  });

  test("the damage function counts strength up close, not from afar", () => {
    const { game } = strongman();
    const roll = (melee) => Array.from({ length: 200 }, () => game.config.damage({ attack: 4, strengthBonus: 2 }, { defense: 0 }, melee));
    const near = roll(true), far = roll(false);
    expect([Math.min(...near), Math.max(...near)]).toEqual([3, 6]);
    expect([Math.min(...far), Math.max(...far)]).toEqual([2, 4]);
  });

  test("enemies have no strength, and can't be given any", () => {
    const { game, player } = strongman();
    const rat = game.currentScene.spawn("rat", player.x + 1, player.y);
    const ogre = game.currentScene.spawn("ogre", player.x - 1, player.y);
    for (const e of [rat, ogre]) {
      expect(e.strength).toBe(0);
      expect(e.strengthBonus).toBe(0);
    }
    expect(() => game.enemy("troll", { hp: 10, strength: 18 })).toThrow(/the troll enemy has no option called "strength"/);
  });

  describe("what the damage function is told", () => {
    function watched() {
      const { game, player } = strongman();
      const melee = [];
      const damage = game.config.damage;
      game.config.damage = (a, d, m) => { melee.push(m); return damage(a, d, m); };
      const rat = game.currentScene.spawn("rat", player.x + 1, player.y);
      return { game, player, rat, melee };
    }

    test("a hit with a weapon is melee", () => {
      const { player, rat, melee } = watched();
      player.hit(rat);
      expect(melee).toEqual([true]);
    });

    test("a punch is melee, and dropping the sword takes its weight off", () => {
      const { player, rat, melee } = watched();
      const load = player.load;
      player.drop(player.gear.weapon);
      expect(player.load).toBe(load - 2);
      player.hit(rat);
      expect(melee).toEqual([true]);
    });

    test("an arrow isn't melee", () => {
      const { game, player, rat, melee } = watched();
      game.give("arrow");
      player.use(game.give("bow"));
      expect(player.shoot(rat.x - player.x, rat.y - player.y)).toBeTruthy();
      expect(melee).toEqual([false]);
    });

    test("a skill's own damage doesn't go through the damage function", () => {
      const { game, player, melee } = watched();
      game.updateVision();
      player.learn("zap", true);
      expect(player.useSkill("zap")).toBe(true);
      expect(melee).toEqual([]);
    });
  });
});

describe("strength over time", () => {
  test("each level up adds 1 strength", () => {
    const { player } = strongman();
    const level = player.level, strength = player.base.strength;
    player.gainXp(1000);
    expect(player.level).toBeGreaterThan(level);
    expect(player.base.strength).toBe(strength + (player.level - level));
  });

  test("player strength, levelUp.strength and your own carry function are used", () => {
    const game = makeGame({ levelUp: { xp: () => 10, strength: 0 }, carry: (s) => s + 5, player: { strength: 14 } });
    game.scene(1, { enemies: 0, items: 0, chests: 0 });
    game.start();
    game.player.gainXp(10);
    expect(game.player.level).toBe(2);
    expect(game.player.strength).toBe(14);
    expect(game.player.carry).toBe(19);
  });
});
