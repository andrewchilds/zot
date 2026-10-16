// A square's flags (scene.squareAt, scene.flagsAt, the legend's flags),
// the square a tile's hooks get, and the scene onEnter and onScene get.
import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, press } from "./helpers.js";

// A row of shelves north of the hero, the middle one with a potion in it
// from the legend, and a mat to step on east of them.
function library(scene = {}) {
  const game = makeGame({ player: { items: [] } });
  game.item("potion", { onUse() {} });
  const take = (player, x, y, game, here) => {
    if (!here.flags.holds) return false;
    game.give(here.flags.holds);
    here.flags.holds = null;
  };
  game.tile("shelf", { symbol: "b", walkable: false, onBump: take });
  game.tile("mat", { symbol: "_", onStep: (player, x, y, game, here) => (here.flags.steps = (here.flags.steps || 0) + 1) });
  game.scene(1, {
    map: ["#######", "#bsb..#", "#.@.m.#", "#######"],
    legend: { b: "shelf", s: { tile: "shelf", flags: { holds: "potion" } }, m: "mat" },
    enemies: 0,
    items: 0,
    ...scene,
  });
  game.start();
  return { game, scene: game.currentScene, player: game.player };
}

describe("a square's flags", () => {
  test("squareAt is the same object every time, and its flags stay when the tile changes", () => {
    const { scene } = library();
    const here = scene.squareAt(4, 2);
    expect(here).toMatchObject({ x: 4, y: 2, scene });
    expect(scene.squareAt(4, 2)).toBe(here);
    scene.flagsAt(4, 2).note = "hi";
    scene.setTile(4, 2, "floor");
    expect(scene.squareAt(4, 2).flags).toEqual({ note: "hi" });
  });

  test("tilesNamed hands out the same squares, flags and all", () => {
    const { scene } = library();
    const shelves = scene.tilesNamed("shelf");
    expect(shelves.map((s) => [s.x, s.y])).toEqual([[1, 1], [2, 1], [3, 1]]);
    expect(shelves[1]).toBe(scene.squareAt(2, 1));
    expect(shelves.map((s) => s.flags.holds)).toEqual([undefined, "potion", undefined]);
  });

  test("a legend letter's flags are copied onto each of its squares", () => {
    const game = makeGame();
    game.tile("shelf", { walkable: false });
    game.scene(1, { map: ["#####", "#ss@#", "#####"], legend: { s: { tile: "shelf", flags: { holds: "potion" } } }, enemies: 0, items: 0 });
    game.start();
    const scene = game.currentScene;
    scene.flagsAt(1, 1).holds = null;
    expect(scene.flagsAt(2, 1).holds).toBe("potion");
  });

  test("onBump gets the square: the shelf with the potion gives it once", () => {
    const { game, scene, player } = library();
    press("ArrowUp");
    expect(player.has("potion")).toBe(true);
    expect(scene.flagsAt(2, 1).holds).toBe(null);
    const turn = game.turn;
    press("ArrowUp");
    expect(player.countOf("potion")).toBe(1);
    expect(game.turn).toBe(turn);
  });

  test("onStep gets the square", () => {
    const { scene, player } = library();
    player.moveTo(4, 2);
    player.moveTo(3, 2);
    player.moveTo(4, 2);
    expect(scene.flagsAt(4, 2).steps).toBe(2);
  });

  test("onEnter gets the scene, and can hide something in a square picked at random", () => {
    let got = null;
    const { game, player } = library({
      legend: { b: "shelf", s: "shelf", m: "mat" },
      onEnter(scene, g) {
        got = [scene, g];
        Zot.pick(scene.tilesNamed("shelf")).flags.holds = "potion";
      },
    });
    expect(got).toEqual([game.currentScene, game]);
    expect(game.currentScene.tilesNamed("shelf").filter((s) => s.flags.holds)).toHaveLength(1);
    for (const x of [1, 2, 3]) {
      player.moveTo(x, 2);
      press("ArrowUp");
    }
    expect(player.countOf("potion")).toBe(1);
  });

  test("onScene gets the scene and the game", () => {
    const seen = [];
    const game = makeGame({ scenes: 2, onScene: (scene, g) => seen.push([scene.key, g]) });
    game.scene(1, { map: ["#####", "#@.>#", "#####"], enemies: 0, items: 0 });
    game.scene(2, { map: ["#####", "#<.@#", "#####"], enemies: 0, items: 0 });
    game.start();
    game.player.moveTo(3, 1);
    expect(seen).toEqual([[1, game], [2, game]]);
  });
});

describe("a scene's own dice", () => {
  // Scene 2 is generated, with enemies and items scattered at random.
  function twoFloors() {
    const game = makeGame({ seed: "k7x2", scenes: 2 });
    game.enemy("rat", { hp: 2 });
    game.item("potion", { onUse() {} });
    game.scene(1, { map: ["#####", "#@.>#", "#####"], enemies: 0, items: 0 });
    game.start();
    return game;
  }
  const layout = (scene) => ({
    tiles: scene.tiles.map((col) => col.join("")).join("|"),
    enemies: scene.creatures.filter((c) => c.isEnemy).map((c) => [c.x, c.y]),
    items: scene.items.map((i) => [i.x, i.y]),
  });

  test("a scene comes out the same however much was rolled before it was built", () => {
    const quiet = layout(twoFloors().sceneNamed(2));
    const busy = twoFloors();
    for (let i = 0; i < 50; i++) Zot.random(100);
    expect(layout(busy.sceneNamed(2))).toEqual(quiet);
  });

  test("a scene the hero isn't in can have things put in it", () => {
    const game = twoFloors();
    const below = game.sceneNamed(2);
    const rat = below.spawn("rat");
    const potion = below.drop("potion");
    expect(game.currentScene.enemies).toEqual([]);
    expect(rat.scene).toBe(below);
    expect(below.enemies).toContain(rat);
    expect(below.items).toContain(potion);
  });

  test("changing a scene before the hero gets there sticks", () => {
    const game = twoFloors();
    const below = game.sceneNamed(2);
    const { x, y } = below.tilesNamed("stairsUp")[0];
    below.flagsAt(x, y).visitedFromAbove = false;
    game.player.moveTo(3, 1);
    expect(game.currentScene).toBe(below);
    expect(game.currentScene.flagsAt(x, y).visitedFromAbove).toBe(false);
  });
});
