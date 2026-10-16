import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

// Scene 2 is drawn with every kind of letter; scene 3 is a list of strings; scene 1 is generated.
function drawn() {
  const game = makeGame({ seed: 3, scenes: 3, start: 2, tiles: { lockedDoor: { key: "key" } } });
  game.enemy("goblin", { hp: 1, attack: 1 });
  game.enemy("boss", { hp: 1, unique: true });
  game.npc("sage", { says: "Hi." });
  game.item("potion", { onUse(p) { p.heal(1); } });
  game.item("key", {});
  game.item("iron_key", {});
  game.item("gem", {});
  game.scene(2, {
    map: `
      ##########
      #<..#....#
      #...+..g.#
      #.k..#.=.#
      ####L####.
      #..M#B...#
      #....~~.>#
      ##########
    `,
    legend: { g: "goblin", B: "boss", M: "sage", k: "iron_key", L: { tile: "lockedDoor", key: "iron_key" } },
    enemies: 0, items: 0, chests: ["gem"],
  });
  game.scene(3, { map: ["#####", "#@..#", "#.=.#", "#...#", "#####"], enemies: 0, items: 0 });
  game.start();
  return { game, scene: game.currentScene, player: game.player };
}

describe("a scene drawn by hand", () => {
  test("the drawing sets the size", () => {
    const { scene } = drawn();
    expect(scene.type).toBe("drawn");
    expect([scene.width, scene.height]).toEqual([10, 8]);
  });

  test("the hero arrives on the <, and the > is the way down", () => {
    const { scene, player } = drawn();
    expect([player.x, player.y]).toEqual([1, 1]);
    expect(scene.tileAt(1, 1)).toBe("stairsUp");
    expect(scene.tileAt(8, 6)).toBe("stairsDown");
    expect([scene.down.x, scene.down.y]).toEqual([8, 6]);
  });

  test("#, +, ~ and . are wall, door, water and floor", () => {
    const { scene } = drawn();
    expect(scene.tileAt(0, 0)).toBe("wall");
    expect(scene.tileAt(4, 2)).toBe("door");
    expect(scene.tileAt(5, 6)).toBe("water");
    expect(scene.tileAt(9, 4)).toBe("floor");
  });

  test("enemies, NPCs and items stand where they were drawn, and nothing random is added", () => {
    const { game, scene } = drawn();
    expect(game.currentScene.enemies.map((e) => [e.kind, e.x, e.y])).toEqual(expect.arrayContaining([["goblin", 7, 2], ["boss", 5, 5]]));
    expect(game.currentScene.enemies).toHaveLength(2);
    expect(game.currentScene.npcs.map((n) => [n.kind, n.x, n.y])).toEqual([["sage", 3, 5]]);
    expect(scene.tileAt(3, 5)).toBe("floor");
    expect(game.currentScene.items.map((i) => [i.kind, i.x, i.y])).toEqual([["iron_key", 2, 3]]);
  });

  test("a = is a chest holding what the chests list says", () => {
    const { scene } = drawn();
    expect(scene.tileAt(7, 3)).toBe("chest");
    expect(scene.chests["7,3"]).toEqual(["gem"]);
  });

  test("a legend entry with a key locks the door for that key, and the key opens it", () => {
    const { scene, player } = drawn();
    expect(scene.tileAt(4, 4)).toBe("lockedDoor");
    expect(scene.flagsAt(4, 4).key).toBe("iron_key");
    player.moveTo(2, 3);
    expect(player.has("iron_key")).toBe(true);
    player.moveTo(4, 3);
    press("ArrowDown");
    expect(scene.tileAt(4, 4)).toBe("openDoor");
    expect(player.has("iron_key")).toBe(false);
    expect(scene.flagsAt(4, 4).key).toBeUndefined();
  });

  test("tilesNamed lists the squares with those tiles, in reading order", () => {
    const { scene } = drawn();
    const at = (...names) => scene.tilesNamed(...names).map((s) => [s.x, s.y]);
    expect(at("stairsUp")).toEqual([[1, 1]]);
    expect(at("door", "lockedDoor")).toEqual([[4, 2], [4, 4]]);
    expect(at("water")).toEqual([[5, 6], [6, 6]]);
    expect(at("lava")).toEqual([]);
    scene.setTile(5, 6, "floor");
    expect(at("water")).toEqual([[6, 6]]);
  });

  test("a list of strings works too; @ is where the hero arrives, with stairs up there", () => {
    const { game, player } = drawn();
    game.goToScene(3);
    const f3 = game.currentScene;
    expect([f3.width, f3.height]).toEqual([5, 5]);
    expect([player.x, player.y]).toEqual([1, 1]);
    expect(f3.tileAt(1, 1)).toBe("stairsUp");
  });

  test("a drawn chest with nothing listed holds something random", () => {
    const { game } = drawn();
    game.goToScene(3);
    expect(game.currentScene.tileAt(2, 2)).toBe("chest");
    expect(game.currentScene.chests["2,2"].length).toBeGreaterThan(0);
  });

  test("with no > drawn, the way down is put away from the hero", () => {
    const { game } = drawn();
    game.goToScene(3);
    const f3 = game.currentScene;
    expect(f3.tileAt(f3.down.x, f3.down.y)).toBe("stairsDown");
    expect([f3.down.x, f3.down.y]).not.toEqual([1, 1]);
  });

  test("scenes without a drawing are still generated", () => {
    const { game } = drawn();
    game.goToScene(1);
    expect(game.currentScene.type).toBe("dungeon");
    expect(game.currentScene.width).toBe(game.config.width);
    expect(game.currentScene.rooms.length).toBeGreaterThan(0);
  });

  test("a tab-indented template literal is dedented like a spaced one", () => {
    const game = makeGame();
    game.scene(1, { map: "\n\t\t#####\n\t\t#@..#\n\t\t#####\n\t", enemies: 0, items: 0 });
    game.start();
    expect(game.currentScene.width).toBe(5);
    expect(game.currentScene.tileAt(0, 0)).toBe("wall");
    expect(game.player.x).toBe(1);
  });
});

describe("mistakes in a drawing are explained", () => {
  const startWith = (sceneDef) => {
    const game = makeGame();
    game.scene(1, sceneDef);
    return () => game.start();
  };

  test("a letter not in the legend", () => {
    expect(startWith({ map: ["###", "#x#", "###"] })).toThrow(/"x" on row 2 that isn't in the legend/);
  });

  test("a legend name that doesn't exist", () => {
    expect(startWith({ map: ["###", "#x#", "###"], legend: { x: "dragon" } })).toThrow(/no tile, enemy, npc or item called "dragon"/);
  });

  test("a map with nowhere to stand", () => {
    expect(startWith({ map: ["###", "###"] })).toThrow(/no floor squares/);
  });
});
