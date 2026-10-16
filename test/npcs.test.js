import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, press, lastMessage, said } from "./helpers.js";

// The hero (@) stands with the merchant (M) to the right and the sage (S) to the left.
function village({ gold = 50 } = {}) {
  const game = makeGame({ player: { name: "N", hp: 30, attack: 5, gold } });
  game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
  game.item("potion", { price: 15, onUse(p) { p.heal(10); } });
  game.item("sword", { slot: "weapon", attack: 2, price: 40 });
  game.item("rock", { onUse() {} }); // no price: can't be sold
  game.npc("merchant", {
    symbol: "M",
    says: ["Welcome!", "Back again?"],
    stock: ["potion", "sword"],
  });
  game.npc("sage", {
    onTalk(npc, p, g) {
      if (g.flags.gift) return "Go now.";
      g.flags.gift = true;
      g.give("potion");
      return "Take this.";
    },
  });
  game.scene(1, {
    map: `
      #######
      #.....#
      #.S@M.#
      #.....#
      #######
    `,
    legend: { M: "merchant", S: "sage" },
    enemies: 0, items: 0,
  });
  game.start();
  const merchant = game.currentScene.npcs.find((c) => c.kind === "merchant");
  const sage = game.currentScene.npcs.find((c) => c.kind === "sage");
  return { game, player: game.player, merchant, sage };
}

describe("a shop", () => {
  test("walking into the merchant talks and opens the shop, in one turn", () => {
    const { game, merchant } = village();
    const turn = game.turn;
    press("ArrowRight");
    expect(game.mode).toBe("menu");
    expect(merchant.talks).toBe(1);
    expect(said(game, "Merchant: Welcome!")).toBe(true);
    expect(game.turn).toBe(turn + 1);
  });

  test("buying takes the price and keeps the shop open", () => {
    const { game, player } = village();
    press("ArrowRight");
    press("1");
    expect(player.gold).toBe(35);
    expect(player.countOf("potion")).toBe(1);
    expect(game.mode).toBe("menu");
  });

  test("picking something the hero can't afford does nothing", () => {
    const { game, player } = village();
    press("ArrowRight");
    press("1"); // a potion: 35 left
    press("2"); // the sword costs 40
    expect(player.gold).toBe(35);
    expect(player.has("sword")).toBe(false);
    expect(game.mode).toBe("menu");
  });

  test("selling gives back half the price", () => {
    const { player } = village();
    press("ArrowRight");
    press("1"); // buy a potion: 35 left
    press("3"); // sell it for 7
    expect(player.gold).toBe(42);
    expect(player.has("potion")).toBe(false);
  });

  test("things without a price aren't for sale", () => {
    const { game } = village();
    game.give("rock");
    press("ArrowRight");
    expect(game.menuState.options.map((o) => o.label).join()).not.toMatch(/Rock/);
  });

  test("Esc leaves the shop, and buying took no turns", () => {
    const { game } = village();
    const turn = game.turn;
    press("ArrowRight");
    press("1");
    press("Escape");
    expect(game.mode).toBe("play");
    expect(game.turn).toBe(turn + 1);
  });

  test("each visit says the next line, then the lines start over", () => {
    const { game } = village();
    press("ArrowRight"); press("Escape");
    press("ArrowRight");
    expect(lastMessage(game)).toBe("Merchant: Back again?");
    press("Escape");
    press("ArrowRight");
    expect(lastMessage(game)).toBe("Merchant: Welcome!");
  });
});

describe("talking", () => {
  test("onTalk runs, and game.flags remembers", () => {
    const { game, player } = village();
    press("ArrowLeft");
    expect(game.flags.gift).toBe(true);
    expect(player.countOf("potion")).toBe(1);
  });

  test("a second talk can take another branch, without a menu", () => {
    const { game, player } = village();
    press("ArrowLeft");
    press("ArrowLeft");
    expect(lastMessage(game)).toBe("Sage: Go now.");
    expect(player.countOf("potion")).toBe(1);
    expect(game.mode).toBe("play");
  });
});

describe("NPCs and enemies", () => {
  test("an NPC is not an enemy", () => {
    const { game, merchant } = village();
    expect(game.currentScene.enemies).toHaveLength(0);
    expect(merchant.isEnemy).toBe(false);
    expect(merchant.friendly).toBeTruthy();
  });

  test("nearestEnemy and enemiesInSight ignore NPCs but find real enemies", () => {
    const { game, player } = village();
    expect(game.nearestEnemy(3)).toBeNull();
    expect(game.enemiesInSight()).toHaveLength(0);
    const goblin = game.currentScene.spawn("goblin", player.x + 2, player.y);
    game.draw();
    expect(game.nearestEnemy(3)).toBe(goblin);
  });

  test("an enemy can't walk into or attack an NPC", () => {
    const { game, player, merchant } = village();
    const goblin = game.currentScene.spawn("goblin", player.x + 2, player.y); // right behind the merchant
    expect(goblin.moveBy(-1, 0)).toBe(false);
    expect([goblin.x, goblin.y]).toEqual([player.x + 2, player.y]);
    expect(merchant.hp).toBe(merchant.maxHp);
  });

  test("spawn() works for NPCs", () => {
    const { game, player } = village();
    const another = game.currentScene.spawn("merchant", player.x, player.y - 1);
    expect([another.x, another.y]).toEqual([player.x, player.y - 1]);
  });

  test("a scene's npcs are placed near where the hero starts", () => {
    const game = makeGame({ seed: 7 });
    game.npc("merchant", {});
    game.scene(1, { npcs: ["merchant"], enemies: 0, items: 0 });
    game.start();
    expect(game.currentScene.npcs).toHaveLength(1);
    expect(Zot.distance(game.currentScene.npcs[0], game.currentScene.up)).toBeLessThanOrEqual(5);
  });
});

describe("game.menu", () => {
  function withMenu() {
    const game = makeGame();
    game.scene(1, { map: ["#####", "#@..#", "#####"], enemies: 0, items: 0 });
    game.start();
    return game;
  }

  test("picking runs onPick, and returning true uses a turn", () => {
    const game = withMenu();
    const turn = game.turn;
    let picked = null;
    game.menu("Which way?", ["Left", { label: "Right" }], (i, o) => { picked = o.label; return true; });
    press("2");
    expect(picked).toBe("Right");
    expect(game.mode).toBe("play");
    expect(game.turn).toBe(turn + 1);
  });

  test("onPick without true uses no turn", () => {
    const game = withMenu();
    const turn = game.turn;
    let picked = null;
    game.menu("Again?", ["Yes"], () => { picked = "yes"; });
    press("1");
    expect(picked).toBe("yes");
    expect(game.turn).toBe(turn);
  });
});
