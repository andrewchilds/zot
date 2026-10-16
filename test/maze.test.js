import { describe, test, expect } from "vitest";
import { makeGame } from "./helpers.js";

const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// A one-scene game whose scene is a maze.
function mazeGame({ seed = 7, scene = {}, ...config } = {}) {
  const game = makeGame({ seed, ...config });
  game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
  game.item("potion", { onUse() {} });
  game.scene(1, { map: "maze", ...scene });
  game.start();
  return { game, scene: game.currentScene };
}

const floorCells = (scene) => {
  const cells = [];
  for (let x = 0; x < scene.width; x++) for (let y = 0; y < scene.height; y++) if (scene.isPassable(x, y)) cells.push({ x, y });
  return cells;
};
const inRoom = (room, c) => c.x >= room.getLeft() && c.x <= room.getRight() && c.y >= room.getTop() && c.y <= room.getBottom();

describe("a maze", () => {
  test("passages one square wide between walls one square thick, all joined up", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { scene } = mazeGame({ seed, scene: { enemies: 0, items: 0 } });
      for (let x = 0; x < scene.width; x += 2) {
        for (let y = 0; y < scene.height; y += 2) if (!scene.roomAt(x, y)) expect(scene.tileAt(x, y)).toBe("wall");
      }
      const reach = scene.reachableFrom(scene.up.x, scene.up.y);
      for (const c of floorCells(scene)) expect(reach.has(c.x + "," + c.y)).toBe(true);
      expect(scene.tileAt(scene.down.x, scene.down.y)).toBe("stairsDown");
    }
  });

  test("the way down is the room furthest to walk to from the start", () => {
    const { scene } = mazeGame({ scene: { enemies: 0, items: 0 } });
    const steps = scene.stepsFrom(scene.up.x, scene.up.y);
    const walk = (c) => steps.get(c.x + "," + c.y);
    expect(scene.roomAt(scene.up.x, scene.up.y)).not.toBeNull();
    expect(scene.roomAt(scene.down.x, scene.down.y)).not.toBeNull();
    for (const room of scene.rooms) {
      const [x, y] = room.getCenter();
      expect(walk({ x, y })).toBeLessThanOrEqual(walk(scene.down));
    }
  });

  test("takes its size from the scene, then the game's maze settings, then the game, and keeps it odd", () => {
    expect(mazeGame({ scene: { width: 21, height: 11 } }).scene.width).toBe(21);
    const { scene } = mazeGame({ maze: { width: 31, height: 15 } });
    expect([scene.width, scene.height]).toEqual([31, 15]);
    expect(mazeGame({ width: 25, height: 13 }).scene.width).toBe(25);
    const even = mazeGame({ width: 48, height: 32 }).scene;
    expect([even.width, even.height]).toEqual([47, 31]);
    expect(even.tiles.length).toBe(47);
  });

  test("has a start room, an end room and the side rooms asked for, each with one door", () => {
    for (const rooms of [0, 1, 2, [1, 2]]) {
      const { scene } = mazeGame({ scene: { rooms, enemies: 0, items: 0 } });
      const [least, most] = Array.isArray(rooms) ? rooms : [rooms, rooms];
      expect(scene.rooms.length).toBeGreaterThanOrEqual(2 + least);
      expect(scene.rooms.length).toBeLessThanOrEqual(2 + most);
      for (const room of scene.rooms) {
        const doors = [];
        room.getDoors((x, y) => doors.push([x, y]));
        expect(doors.length).toBe(1);
        expect(scene.tileAt(...doors[0])).toBe("door");
      }
    }
  });

  test("each side room holds a monster, a chest or both", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { game, scene } = mazeGame({ seed, scene: { rooms: 2 }, exitStairs: false });
      const start = scene.roomAt(scene.up.x, scene.up.y), end = scene.roomAt(scene.down.x, scene.down.y);
      const chests = Object.keys(scene.chests).map((k) => { const [x, y] = k.split(",").map(Number); return { x, y }; });
      for (const room of scene.rooms.filter((r) => r !== start && r !== end)) {
        const monster = game.currentScene.enemies.some((e) => inRoom(room, e));
        const chest = chests.some((c) => inRoom(room, c));
        expect(monster || chest).toBe(true);
      }
      // With exitStairs off there is no way down from the end room, so a chest marks it.
      expect(chests.some((c) => inRoom(end, c))).toBe(true);
    }
  });

  test("the end room gets no chest when the way down is there", () => {
    const game = makeGame({ seed: 7, scenes: 2 });
    game.item("potion", { onUse() {} });
    game.scene(1, { map: "maze", rooms: 0, enemies: 0 });
    game.start();
    const scene = game.currentScene, end = scene.roomAt(scene.down.x, scene.down.y);
    expect(Object.keys(scene.chests).some((k) => { const [x, y] = k.split(",").map(Number); return inRoom(end, { x, y }); })).toBe(false);
  });

  test("a chest never blocks a doorway", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { scene } = mazeGame({ seed, scene: { rooms: 2 } });
      for (const k of Object.keys(scene.chests)) {
        const [x, y] = k.split(",").map(Number);
        expect(SIDES.some(([dx, dy]) => scene.isDoor(x + dx, y + dy))).toBe(false);
      }
    }
  });
});

describe("mazes in the numbered dungeon", () => {
  const types = (game, n) => Array.from({ length: n }, (_, i) => game.sceneNamed(i + 1).type);

  test("every so often a floor between the first and the last is a maze", () => {
    const game = makeGame({ seed: 1, scenes: 5, maze: { chance: 100 } });
    game.start();
    expect(types(game, 5)).toEqual(["dungeon", "maze", "maze", "maze", "dungeon"]);
  });

  test("but never with maze: false, or a chance of 0", () => {
    for (const maze of [false, { chance: 0 }]) {
      const game = makeGame({ seed: 1, scenes: 4, maze });
      game.start();
      expect(types(game, 4)).toEqual(["dungeon", "dungeon", "dungeon", "dungeon"]);
    }
  });

  test("a scene that picks its own map keeps it", () => {
    const game = makeGame({ seed: 1, scenes: 3, maze: { chance: 100 } });
    game.scene(2, { map: "cave" });
    game.start();
    expect(types(game, 3)).toEqual(["dungeon", "cave", "dungeon"]);
  });

  test("the mix is a mix, and the same for the same seed", () => {
    const mix = (seed) => {
      const game = makeGame({ seed, scenes: 8 });
      game.start();
      return types(game, 8);
    };
    const all = [];
    for (let seed = 1; seed <= 12; seed++) all.push(...mix(seed).slice(1, -1));
    expect(all).toContain("maze");
    expect(all).toContain("dungeon");
    expect(mix("k7x2")).toEqual(mix("k7x2"));
  });
});

describe("a vault in a maze", () => {
  test("locks one of the side rooms, with the key outside it", () => {
    const game = makeGame({ seed: 7, scenes: 1, exitStairs: false });
    game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
    game.item("potion", { onUse() {} });
    game.item("iron_key", { name: "Iron Key", symbol: "-" });
    game.item("gem", { unique: true });
    game.scene(1, { map: "maze", rooms: 2, vault: { key: "iron_key", treasure: ["gem"] }, enemies: 0, items: 0 });
    game.start();
    const scene = game.currentScene, vault = scene.vault;
    expect(vault).toBeDefined();
    expect(vault.room).not.toBe(scene.roomAt(scene.up.x, scene.up.y));
    expect(scene.tileAt(...vault.doors[0])).toBe("lockedDoor");
    const reach = scene.reachableFrom(scene.up.x, scene.up.y);
    const key = game.currentScene.items.find((i) => i.kind === "iron_key"), gem = game.currentScene.items.find((i) => i.kind === "gem");
    expect(reach.has(key.x + "," + key.y)).toBe(true);
    expect(reach.has(gem.x + "," + gem.y)).toBe(false);
    expect(reach.has(scene.down.x + "," + scene.down.y)).toBe(true);
  });
});
