import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, press } from "./helpers.js";

// The hero (@) in the middle of an empty room, wielding a sword (attack 5 + 2).
function hero(config = {}) {
  const game = makeGame({ player: { name: "T", hp: 30, attack: 5, items: ["sword"] }, ...config });
  game.enemy("goblin", { hp: 4, attack: 1, xp: 6, drops: { gold: 100 } });
  game.item("gold", { symbol: "$", keep: false, onPickup(p) { p.gold += 5; } });
  game.item("sword", { slot: "weapon", attack: 2 });
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

describe("the hero", () => {
  test("player.attack += 1 raises the base, not the sword's bonus", () => {
    const { player } = hero();
    player.attack += 1;
    expect(player.attack).toBe(8);
    expect(player.base.attack).toBe(6);
  });

  test("moving takes a turn", () => {
    const { game, player } = hero();
    const turn = game.turn, x = player.x;
    press("ArrowRight");
    expect(player.x).toBe(x + 1);
    expect(game.turn).toBe(turn + 1);
  });

  test("space waits a turn", () => {
    const { game, player } = hero();
    const turn = game.turn, x = player.x, y = player.y;
    press(" ");
    expect([player.x, player.y]).toEqual([x, y]);
    expect(game.turn).toBe(turn + 1);
  });
});

describe("fighting", () => {
  test("a hit always does at least 1 damage", () => {
    const { game, player } = hero();
    const goblin = game.currentScene.spawn("goblin", player.x + 1, player.y);
    player.base.defense = 50;
    const hp = player.hp;
    goblin.hit(player);
    expect(player.hp).toBe(hp - 1);
  });

  // Bump the goblin to the right until it dies.
  function killGoblin() {
    const { game, player } = hero();
    const goblin = game.currentScene.spawn("goblin", player.x + 1, player.y);
    const xp = player.xp, gold = player.gold;
    let hits = 0;
    while (!goblin.dead && hits++ < 10) press("ArrowRight");
    return { game, player, goblin, xp, gold };
  }

  test("walking into an enemy attacks it; a kill gives XP and removes it", () => {
    const { game, player, goblin, xp } = killGoblin();
    expect(goblin.dead).toBe(true);
    expect(player.xp).toBeGreaterThan(xp);
    expect(game.currentScene.enemies).not.toContain(goblin);
  });

  test("the goblin drops its gold on or beside where it died", () => {
    const { game, goblin } = killGoblin();
    const gold = game.currentScene.items.find((it) => it.kind === "gold");
    expect(gold).toBeDefined();
    expect(Zot.distance(gold, goblin)).toBeLessThanOrEqual(1);
  });

  test("gold with keep: false runs onPickup and isn't carried", () => {
    const { game, player, gold } = killGoblin();
    const coins = game.currentScene.items.find((it) => it.kind === "gold");
    player.moveTo(coins.x, coins.y);
    expect(player.gold).toBe(gold + 5);
    expect(player.items).toHaveLength(1);
  });
});

// Which enemies show up where comes from the scene generator, so this uses a seeded dungeon.
describe("a generated scene", () => {
  function dungeon() {
    const game = makeGame({ seed: 42, scenes: 3 });
    game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
    game.enemy("snake", { hp: 5, attack: 2, xp: 3, scenes: [2, 3] });
    game.enemy("boss", { hp: 30, attack: 3, xp: 50, unique: true });
    game.scene(3, { map: "cave", boss: "boss" });
    game.start();
    return game;
  }

  test("scene 1 has enemies, only the ones allowed there", () => {
    const game = dungeon();
    expect(game.currentScene.enemies.length).toBeGreaterThan(0);
    expect(game.currentScene.enemies.every((e) => e.kind === "goblin")).toBe(true);
  });
});
