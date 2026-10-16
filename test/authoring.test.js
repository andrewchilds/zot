import { describe, test, expect, afterEach } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, press } from "./helpers.js";

const arena = ["#####", "#@..#", "#...#", "#####"];

describe("a mistake in a hook", () => {
  afterEach(() => document.getElementById("zot-error")?.remove());

  function brokenGame(config = {}) {
    const game = makeGame({ player: { attack: 50, hp: 30 }, ...config });
    game.enemy("imp", { hp: 3, onHurt() { throw new TypeError("Cannot read properties of undefined (reading 'hp')"); } });
    game.scene(1, { map: arena, enemies: 0, items: 0 });
    game.start();
    return game;
  }

  test("is reported on the page, naming the hook", () => {
    const game = brokenGame();
    game.player.hit(game.currentScene.spawn("imp", 2, 1));
    const box = document.getElementById("zot-error");
    expect(box).not.toBeNull();
    expect(box.textContent).toContain("the imp's onHurt");
    expect(box.textContent).toContain("reading 'hp'");
  });

  test("doesn't stop what was happening: the hit still lands", () => {
    const game = brokenGame();
    const imp = game.currentScene.spawn("imp", 2, 1);
    game.player.hit(imp);
    expect(imp.dead).toBe(true);
  });

  test("in a game hook is reported and the turn still passes", () => {
    const game = brokenGame({ onTurn() { throw new Error("turn boom"); } });
    const turn = game.turn;
    press(" ");
    expect(document.getElementById("zot-error").textContent).toContain("the game's onTurn");
    expect(game.turn).toBe(turn + 1);
  });
});

describe("testing helpers", () => {
  test("start begins in that scene", () => {
    const game = makeGame({ scenes: 3, start: 2 });
    game.enemy("wolf", { hp: 3 });
    game.start();
    expect(game.currentScene.key).toBe(2);
    expect(game.visited.has(2)).toBe(true);
  });

  test("godMode: the hero takes no damage", () => {
    const game = makeGame({ godMode: true, player: { hp: 20 } });
    game.scene(1, { map: arena, enemies: 0, items: 0 });
    game.start();
    game.player.hurt(15);
    expect(game.player.hp).toBe(20);
  });

  test("Zot.game is the latest game", () => {
    const game = makeGame();
    expect(Zot.game).toBe(game);
  });

  test("kills are counted", () => {
    const game = makeGame({ player: { attack: 50 } });
    game.enemy("wolf", { hp: 3 });
    game.scene(1, { map: arena, enemies: 0, items: 0 });
    game.start();
    game.player.hit(game.currentScene.spawn("wolf", 2, 1));
    expect(game.kills).toBe(1);
  });

  test("L says where the hero is and how to come back to this dungeon", () => {
    const game = makeGame({ seed: 9 });
    game.scene(1, { map: arena, enemies: 0, items: 0 });
    game.start();
    press("l");
    expect(game.messages.some((m) => m.text === "This is dungeon 9. You are on floor 1, standing on floor.")).toBe(true);
    expect(game.messages.some((m) => m.text.includes("?seed=9"))).toBe(true);
  });
});

describe("seeds", () => {
  test("a seed from the options is used as given", () => {
    const game = makeGame({ seed: 9 });
    expect(game.seed).toBe("9");
    expect(game.seedNumber).toBe(9);
    expect(game.seedGiven).toBeTruthy();
  });

  test("without a seed every game gets a random 4-character code", () => {
    const game = makeGame({ seed: undefined });
    expect(game.seed).toMatch(/^[a-z0-9]{4}$/);
    expect(game.seedGiven).toBeFalsy();
  });

  test("a code is lowercased and always gives the same number", () => {
    const upper = makeGame({ seed: "K7x2" });
    const lower = makeGame({ seed: "k7x2" });
    expect(upper.seed).toBe("k7x2");
    expect(upper.seedNumber).toBe(lower.seedNumber);
    expect(upper.seedNumber).not.toBe(makeGame({ seed: "abcd" }).seedNumber);
  });

  test("in the editor's frame the seed box's seed stands in for ?seed=, and options still win", () => {
    window.ZOT_SHELL = true;
    window.ZOT_SEED = "k7x2";
    try {
      expect(makeGame({ seed: undefined }).seed).toBe("k7x2");
      expect(makeGame({ seed: 9 }).seed).toBe("9");
      window.ZOT_SEED = "";
      expect(makeGame({ seed: undefined }).seedGiven).toBeFalsy();
    } finally {
      delete window.ZOT_SHELL;
      delete window.ZOT_SEED;
    }
  });

  test("the same seed builds the same dungeon", () => {
    const build = () => {
      const game = makeGame({ seed: "k7x2", scenes: 2 });
      game.enemy("wolf", { hp: 3 });
      game.start();
      return game.currentScene.tiles.map((col) => col.join("")).join("\n");
    };
    expect(build()).toBe(build());
  });
});
