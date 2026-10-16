// An fx plays over a square of the map without being part of it (see
// drawFx in zot.js): dots that fly up from it, or a sprite that hovers.
// The fx live in zot.js (FX); a tile plays one by name with `fx`, and
// game.currentScene.addFx puts one on any square.
import { describe, expect, test } from "vitest";
import { makeGame, room } from "./helpers.js";

const until = (done) => new Promise((resolve) => {
  const t = setInterval(() => { if (done()) { clearInterval(t); resolve(); } }, 5);
});
async function pictures(config = {}) {
  const game = makeGame({ fit: false, viewWidth: 9, viewHeight: 9, dark: 0, animate: 0, tileset: true, ...config });
  game.scene(1, { map: room(9, 9, 4, 4), enemies: 0, items: 0, chests: 0 });
  game.start();
  await until(() => game.tilesReady);
  game.drawMap();
  return game;
}
function letters(config = {}) {
  const game = makeGame({ fit: false, viewWidth: 9, viewHeight: 9, dark: 0, fontSize: 16, ...config });
  game.scene(1, { map: room(9, 9, 4, 4), enemies: 0, items: 0, chests: 0 });
  game.start();
  game.drawMap();
  return game;
}
const boxes = (game, name) => Array.from(game.el.fx.querySelectorAll(`.zot-fx[data-fx="${name}"]`));

describe("fx on a square", () => {
  test("addFx plays an fx on a square until removeFx", async () => {
    const game = await pictures();
    game.currentScene.addFx(6, 2, "sparks");
    game.drawMap();
    const [box] = boxes(game, "sparks");
    expect(boxes(game, "sparks")).toHaveLength(1);
    expect(box.style.left).toBe(6 * 32 + "px");
    expect(box.style.top).toBe(2 * 32 + "px");
    expect(box.style.width).toBe("32px");
    game.drawMap();
    expect(boxes(game, "sparks")[0]).toBe(box); // kept from one drawing to the next
    game.currentScene.removeFx(6, 2, "sparks");
    game.drawMap();
    expect(boxes(game, "sparks")).toHaveLength(0);
  });

  test("a square can play more than one; removeFx with no name stops them all", async () => {
    const game = await pictures();
    game.currentScene.addFx(2, 2, "sparks");
    game.currentScene.addFx(2, 2, "quest");
    game.currentScene.addFx(2, 2, "sparks"); // twice is once
    game.drawMap();
    expect(boxes(game, "sparks")).toHaveLength(1);
    expect(boxes(game, "quest")).toHaveLength(1);
    game.currentScene.removeFx(2, 2);
    game.drawMap();
    expect(game.el.fx.querySelectorAll(".zot-fx")).toHaveLength(0);
    expect(game.currentScene.fx.size).toBe(0);
    game.currentScene.removeFx(2, 2, "sparks"); // nothing there: fine
  });

  test("only while the square is in sight", async () => {
    const game = await pictures();
    game.currentScene.addFx(7, 4, "sparks");
    for (let y = 1; y <= 7; y++) game.currentScene.setTile(6, y, "wall");
    game.drawMap();
    expect(boxes(game, "sparks")).toHaveLength(0); // behind the wall
    game.currentScene.setTile(6, 4, "floor");
    game.drawMap();
    expect(boxes(game, "sparks")).toHaveLength(1);
  });

  test("an fx that doesn't exist is an error, with the ones that do", async () => {
    const game = await pictures();
    expect(() => game.currentScene.addFx(2, 2, "fireworks")).toThrow(/no fx called "fireworks". The fx are: sparks, swirl, quest, alert/);
  });
});

describe("the dots", () => {
  test("come up one at a time at the fx's rate, and go when their life is up", async () => {
    const game = await pictures();
    game.currentScene.addFx(4, 2, "sparks"); // 5 a second: one every 100 to 300 ms, each living 500 to 1000
    game.drawMap();
    const [box] = boxes(game, "sparks");
    expect(game.emitter).not.toBe(null);
    const now = performance.now();
    game.emit(now);
    expect(box.querySelectorAll(".zot-dot")).toHaveLength(1);
    game.emit(now + 50); // not due yet
    expect(box.querySelectorAll(".zot-dot")).toHaveLength(1);
    game.emit(now + 300);
    expect(box.querySelectorAll(".zot-dot")).toHaveLength(2);
    const dot = box.querySelector(".zot-dot");
    expect(dot.style.width).toBe("2px"); // one sheet pixel, at scale 2
    expect(parseFloat(dot.style.getPropertyValue("--zot-dy"))).toBeLessThan(-20); // 12 to 24 sheet pixels up
    expect(dot.style.getPropertyValue("--zot-life")).toMatch(/ms$/);
    game.emit(now + 2000);
    expect(dot.isConnected).toBe(false); // the first two have gone
    game.currentScene.removeFx(4, 2);
    game.drawMap();
    expect(game.emitter).toBe(null); // nothing left to send up
  });

  test("a swirl's dots start in the middle of the square and circle in toward it", async () => {
    const game = await pictures();
    game.currentScene.addFx(4, 2, "swirl"); // 7 to 9 sheet pixels out, round by 0.6 to 1 turns, 85% of the way in
    game.drawMap();
    const [box] = boxes(game, "swirl");
    game.emit(performance.now());
    const dot = box.querySelector(".zot-dot.zot-swirl");
    expect(dot.style.left).toBe("15px"); // the middle of a 32px square, less half its 2px
    expect(dot.style.top).toBe("15px");
    const px = (name) => parseFloat(dot.style.getPropertyValue(name));
    expect(px("--zot-from")).toBeGreaterThanOrEqual(14);
    expect(px("--zot-from")).toBeLessThanOrEqual(18);
    expect(px("--zot-to")).toBeCloseTo(px("--zot-from") * 0.15, 5);
    expect(px("--zot-turn")).toBeGreaterThanOrEqual(216);
    expect(px("--zot-turn")).toBeLessThanOrEqual(360);
    expect(dot.style.getPropertyValue("--zot-angle")).toMatch(/deg$/);
    expect(dot.style.getPropertyValue("--zot-dy")).toBe(""); // it doesn't fly
  });

  test("the portal tile plays the swirl", async () => {
    const game = await pictures();
    game.currentScene.setTile(2, 2, "portal");
    game.drawMap();
    expect(boxes(game, "swirl")).toHaveLength(1);
    expect(boxes(game, "swirl")[0].style.left).toBe(2 * 32 + "px");
  });

  test("a tile's fx plays wherever the tile is, with letters too", () => {
    const game = letters();
    game.tile("spring", { symbol: "~", fx: "sparks" });
    game.currentScene.setTile(2, 2, "spring");
    game.currentScene.setTile(6, 6, "spring");
    game.drawMap();
    expect(boxes(game, "sparks")).toHaveLength(2);
    expect(boxes(game, "sparks")[0].style.width).toBe("16px");
    game.emit(performance.now());
    expect(game.el.fx.querySelectorAll(".zot-dot")).toHaveLength(2);
  });

  test("a sprite fx needs pictures: with letters it isn't shown", () => {
    const game = letters();
    game.currentScene.addFx(2, 2, "quest");
    game.drawMap();
    expect(boxes(game, "quest")).toHaveLength(0);
  });
});

describe("recipes", () => {
  test("a tile's fx must exist by the time the game starts", () => {
    const game = makeGame();
    game.tile("geyser", { fx: "steam" });
    expect(() => game.start()).toThrow(/the geyser tile plays "steam", but there is no fx called "steam". The fx are: sparks, swirl, quest, alert/);
  });

  test("fx: on a tile is a name", () => {
    const game = makeGame();
    expect(() => game.tile("bad", { fx: [[13, 22]] })).toThrow(/fx is the name of an fx/);
    game.tile("fine", { fx: false });
  });

  test("a color in the questMark setting paints the quest mark instead of its own", async () => {
    const game = await pictures({ questMark: "#ff0000" });
    game.currentScene.addFx(4, 2, "quest");
    game.drawMap();
    expect(game.playing.get("quest@4,2").color).toBe("#ffe14d"); // placed by hand: the fx's own color
    game.npc("farmer", { quest: "rats" });
    game.quest("rats", {});
    game.currentScene.spawn("farmer", 2, 2);
    game.drawMap();
    expect(game.playing.get("quest#" + game.currentScene.creatures.at(-1).serial).color).toBe("#ff0000");
  });
});

// The "!" over an enemy the moment it spots the hero: game.alert, which the
// enemy's brain calls when it sees the hero without knowing where they were.
describe("an enemy spotting the hero", () => {
  async function withGoblin(config = {}) {
    const game = makeGame({ fit: false, viewWidth: 9, viewHeight: 9, dark: 0, animate: 0, tileset: true, ...config });
    game.enemy("goblin", { hp: 4, attack: 1, tile: [1, 1] });
    game.scene(1, { map: room(9, 9, 4, 4), enemies: 0, items: 0, chests: 0 });
    game.start();
    await until(() => game.tilesReady);
    const goblin = game.currentScene.spawn("goblin", 6, 4);
    game.drawMap(); // now the screen has shown it, so it can see the hero
    return { game, goblin };
  }

  test("puts the alert fx over its head for the alert setting's milliseconds, then takes it away", async () => {
    const { game, goblin } = await withGoblin({ alert: 60 });
    expect(boxes(game, "alert")).toHaveLength(0);
    goblin.act();
    game.drawMap();
    const [box] = boxes(game, "alert");
    expect(boxes(game, "alert")).toHaveLength(1);
    expect(box.style.left).toBe(goblin.x * 32 + "px"); // it stepped toward the hero as it spotted them
    expect(box.style.top).toBe((goblin.y - 1) * 32 + "px"); // over the square above it
    expect(game.playing.get("alert#" + goblin.serial).color).toBe("#ff5c5c");
    goblin.act(); // it knows where the hero is now: no new "!"
    game.drawMap();
    expect(boxes(game, "alert")).toHaveLength(1);
    expect(boxes(game, "alert")[0]).toBe(box);
    await until(() => boxes(game, "alert").length === 0);
    expect(game.alerts).toHaveLength(0);
  });

  test("an enemy with its own act still spots the hero first, so the mark shows", async () => {
    const game = makeGame({ fit: false, viewWidth: 9, viewHeight: 9, dark: 0, animate: 0, tileset: true, alert: 5000 });
    let acted = 0;
    game.enemy("bat", { hp: 4, attack: 1, tile: [1, 1], act: () => acted++ });
    game.scene(1, { map: room(9, 9, 4, 4), enemies: 0, items: 0, chests: 0 });
    game.start();
    await until(() => game.tilesReady);
    const bat = game.currentScene.spawn("bat", 6, 4);
    game.drawMap();
    bat.act();
    bat.act();
    game.drawMap();
    expect(acted).toBe(2);
    expect(bat.memory).toEqual({ x: 4, y: 4 });
    expect(boxes(game, "alert")).toHaveLength(1);
  });

  test("the mark follows the enemy, and dies with it", async () => {
    const { game, goblin } = await withGoblin({ alert: 5000 });
    goblin.act();
    goblin.moveTo(5, 3);
    game.drawMap();
    expect(boxes(game, "alert")[0].style.left).toBe(5 * 32 + "px");
    expect(boxes(game, "alert")[0].style.top).toBe(2 * 32 + "px");
    goblin.die();
    game.drawMap();
    expect(boxes(game, "alert")).toHaveLength(0);
  });

  test("alert: 0 in the settings, or letters instead of pictures, shows nothing", async () => {
    const { game, goblin } = await withGoblin({ alert: 0 });
    expect(game.alert(goblin)).toBe(false);
    goblin.act();
    game.drawMap();
    expect(boxes(game, "alert")).toHaveLength(0);
    expect(game.alerts).toHaveLength(0);
    const plain = letters();
    plain.enemy("goblin", { hp: 4, attack: 1 });
    expect(plain.alert(plain.currentScene.spawn("goblin", 6, 4))).toBe(false);
  });
});
