import { describe, test, expect } from "vitest";
import { makeGame } from "./helpers.js";

// The overworld is made by a generator, so these use a seed.
function outdoors() {
  const game = makeGame({ seed: 3, scenes: 2, player: { sight: 6 } });
  game.enemy("wolf", { hp: 3, attack: 1, xp: 2 });
  game.item("berry", { onUse() {} });
  game.npc("hermit", {});
  game.scene(1, { map: "overworld", sight: 12, fog: false, enemies: 3, items: 2, npcs: "hermit" });
  game.start();
  const scene = game.currentScene;
  const count = (name) => scene.tiles.flat().filter((t) => t === name).length;
  const reach = scene.reachableFrom(scene.up.x, scene.up.y);
  const reachable = (o) => reach.has(o.x + "," + o.y);
  return { game, player: game.player, scene, count, reachable };
}

describe("the overworld", () => {
  test("is mostly grass, with trees and ponds, and no walls or floor", () => {
    const { count } = outdoors();
    expect(count("tree")).toBeGreaterThan(0);
    expect(count("grass")).toBeGreaterThan(count("tree"));
    expect(count("water")).toBeGreaterThan(0);
    expect(count("wall")).toBe(0);
    expect(count("floor")).toBe(0);
  });

  test("has a ring of trees around the edge", () => {
    const { scene } = outdoors();
    for (let x = 0; x < scene.width; x++) {
      expect(scene.tiles[x][0]).toBe("tree");
      expect(scene.tiles[x][scene.height - 1]).toBe("tree");
    }
  });

  test("trees block walking and sight; water blocks only walking", () => {
    const { scene, count } = outdoors();
    expect(count("water")).toBeGreaterThan(0);
    const pond = scene.tiles.flatMap((col, x) => col.map((t, y) => [t, x, y])).find(([t]) => t === "water");
    expect(scene.isWalkable(pond[1], pond[2])).toBe(false);
    expect(scene.isSeeThrough(pond[1], pond[2])).toBe(true);
    expect(scene.isWalkable(1, 0)).toBe(false);
    expect(scene.isSeeThrough(1, 0)).toBe(false);
  });

  test("the hero starts on grass, and the way down is a short, reachable walk off", () => {
    const { scene, player, reachable } = outdoors();
    expect(scene.tileAt(player.x, player.y)).toBe("grass");
    expect(scene.tileAt(scene.down.x, scene.down.y)).toBe("stairsDown");
    expect(reachable(scene.down)).toBe(true);
    const distance = Math.max(Math.abs(scene.down.x - scene.up.x), Math.abs(scene.down.y - scene.up.y));
    expect(distance).toBeGreaterThanOrEqual(8);
    expect(distance).toBeLessThanOrEqual(30);
  });

  test("with pictures, the way down is the mouth of a mine shaft, and plain stairs underground", () => {
    const game = makeGame({ seed: 3, scenes: 2, tileset: true, animate: 0 });
    game.scene(1, { map: "overworld" });
    game.start();
    const scene = game.currentScene;
    const stairs = game.tiles.stairsDown;
    expect(game.tileSprite(stairs, scene.down.x, scene.down.y, scene)).toEqual([17, 11]);
    game.goDown();
    const below = game.currentScene;
    expect(game.tileSprite(stairs, below.down.x, below.down.y, below)).toEqual([3, 6]);
  });

  test("enemies, NPCs and items are placed on ground the hero can reach", () => {
    const { game, scene, reachable } = outdoors();
    expect(game.currentScene.enemies).toHaveLength(3);
    expect(game.currentScene.npcs).toHaveLength(1);
    expect(scene.items).toHaveLength(2);
    for (const c of scene.creatures) {
      expect(reachable(c)).toBe(true);
      expect(c.isPlayer || scene.isGround(c.x, c.y)).toBe(true);
    }
    for (const i of scene.items) {
      expect(reachable(i)).toBe(true);
      expect(scene.tileAt(i.x, i.y)).toBe("grass");
    }
  });

  test("has no treasure chests", () => {
    const { scene } = outdoors();
    expect(Object.keys(scene.chests)).toHaveLength(0);
  });

  test("a scene's sight overrides the hero's", () => {
    const { game, player } = outdoors();
    const furthest = Math.max(...[...game.visible].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return Math.max(Math.abs(x - player.x), Math.abs(y - player.y));
    }));
    expect(furthest).toBeGreaterThan(6);
    expect(furthest).toBeLessThanOrEqual(12);
  });

  test("walking onto > leads down into an ordinary dungeon", () => {
    const { game, scene, player } = outdoors();
    player.moveTo(scene.down.x, scene.down.y);
    expect(game.currentScene.key).toBe(2);
    expect(game.currentScene.tiles.some((col) => col.includes("wall"))).toBe(true);
  });
});
