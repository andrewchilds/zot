import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { makeGame, press, overlay } from "./helpers.js";

const title = "vitest-score";
const forgetBest = () => { try { localStorage.removeItem("zot-best:" + title); } catch (e) {} };
beforeEach(forgetBest);
afterEach(forgetBest);

function endedGame({ gold = 50, ...config } = {}) {
  const game = makeGame({ title, seed: 4, player: { gold }, ...config });
  game.scene(1, { map: ["#####", "#@..#", "#...#", "#####"], enemies: 0, items: 0 });
  game.start();
  return game;
}

// The end screen's rows by name: { Score: "150 — new best!", Best: "150", ... }.
function rows(game) {
  const out = {};
  for (const li of overlay(game).querySelectorAll("#zot-overlay-list li")) {
    const name = li.firstElementChild?.textContent.trim();
    if (name) out[name] = li.textContent.slice(li.firstElementChild.textContent.length).trim();
  }
  return out;
}

describe("the score", () => {
  test("is scene x 100 + kills x 10 + gold, and the first one is a new best", () => {
    const game = endedGame({ gold: 50 });
    game.lose("Eaten.");
    expect(rows(game).Score).toMatch(/^150\b.*new best/);
  });

  test("a lower score shows the best so far", () => {
    endedGame({ gold: 50 }).lose("Eaten.");
    const game = endedGame({ gold: 0 });
    game.lose("Eaten again.");
    expect(rows(game).Score).toBe("100");
    expect(rows(game).Best).toBe("150");
  });

  test("your own score function is used", () => {
    const game = endedGame({ score: () => 42 });
    game.win("Done");
    expect(rows(game).Score).toMatch(/^42\b/);
  });
});

test("the end screen names the dungeon's seed", () => {
  const game = endedGame();
  game.lose("Eaten.");
  expect(rows(game).Dungeon).toBe("4");
  expect(overlay(game).querySelector("#zot-overlay-list a")).toBe(null);
});

describe("the end screen's picture", () => {
  const until = (done) => new Promise((resolve) => {
    const check = () => (done() ? resolve() : setTimeout(check, 10));
    check();
  });
  const icon = (game) => overlay(game).querySelector("#zot-overlay-icon");
  const killedByOgre = (config) => {
    const game = endedGame(config);
    game.enemy("ogre", { symbol: "O", color: "#ff0000", hp: 5, attack: 1 });
    const ogre = game.currentScene.spawn("ogre", game.player.x + 1, game.player.y);
    game.player.hurt(999, ogre);
    return game;
  };

  test("is whoever killed the hero, in their letter", () => {
    const game = killedByOgre();
    expect(icon(game).hidden).toBe(false);
    expect(icon(game).querySelector("span").textContent).toBe("O");
  });

  test("is whoever killed the hero, or a crown for a win, with pictures", async () => {
    const game = endedGame({ tileset: true });
    await until(() => game.tilesReady);
    game.win("Done");
    expect(icon(game).querySelector("canvas")).not.toBe(null);
    const lost = endedGame({ tileset: true });
    await until(() => lost.tilesReady);
    lost.enemy("ogre", { hp: 5, attack: 1 });
    lost.player.hurt(999, lost.currentScene.spawn("ogre", lost.player.x + 1, lost.player.y));
    expect(icon(lost).querySelector("canvas")).not.toBe(null);
  });

  test("is left out for a death with nobody to blame, and for a win with letters", () => {
    const game = endedGame();
    game.lose("Eaten.");
    expect(icon(game).hidden).toBe(true);
    const won = endedGame();
    won.win("Done");
    expect(icon(won).hidden).toBe(true);
  });
});

describe("after the end", () => {
  test("Esc puts the end screen away to look at the map, and Enter or Esc brings it back", () => {
    const game = endedGame();
    game.lose("Eaten.");
    const ov = overlay(game);
    expect(ov.hidden).toBe(false);
    press("Escape");
    expect(ov.hidden).toBe(true);
    expect(game.over).toBe(true);
    press("Enter");
    expect(ov.hidden).toBe(false);
    press("Escape"); press("Escape");
    expect(ov.hidden).toBe(false);
  });

  test("an enemy with its own brain leaves the hero's remains alone", () => {
    const game = endedGame({ afterDeath: 0 });
    // The bat from Land of Zot: bite the hero when next to them, else flutter about.
    game.enemy("bat", { hp: 4, attack: 2, act(bat) {
      if (bat.isNextTo(game.player)) bat.hit(game.player);
      else bat.wander();
    } });
    game.player.die();
    expect(game.player.dead).toBe(true);
    const bat = game.currentScene.spawn("bat", game.player.x + 1, game.player.y);
    const count = game.messages.length;
    press("Escape");
    for (let i = 0; i < 20; i++) game.deadTurn();
    expect(game.messages.slice(count).map((m) => m.text)).not.toContainEqual(expect.stringMatching(/bat/));
    expect(bat.dead).toBe(false);
  });

  test("a click around the box puts it away, a click on the box doesn't", () => {
    const game = endedGame();
    game.lose("Eaten.");
    const ov = overlay(game);
    ov.querySelector(".zot-overlay-box").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ov.hidden).toBe(false);
    ov.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ov.hidden).toBe(true);
  });
});
