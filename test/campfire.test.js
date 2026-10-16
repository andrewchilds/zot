import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage, sees } from "./helpers.js";
const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// A 21x21 open room with the hero (@) in the middle and a campfire (^) seven
// squares to the right. The hero sees 8 squares with the sun out, 3 in the dark.
function campsite(sceneOptions = {}, fire = {}) {
  const game = makeGame({ player: { sight: 8, items: [] }, dark: 3, fit: false, viewWidth: 21, viewHeight: 21 });
  game.item("torch", { slot: "light", light: true, lasts: 5 });
  game.tile("campfire", { symbol: "^", color: "orange", walkable: false, light: 3, glow: "#ff8000", ...fire });
  const rows = Array.from({ length: 21 }, (_, y) =>
    Array.from({ length: 21 }, (_, x) =>
      x === 0 || y === 0 || x === 20 || y === 20 ? "#" : x === 10 && y === 10 ? "@" : x === 17 && y === 10 ? "^" : ".").join(""));
  game.scene(1, { map: rows, legend: { "^": "campfire" }, enemies: 0, items: 0, ...sceneOptions });
  game.start();
  return { game, player: game.player, fire: { x: 17, y: 10 } };
}

describe("a tile that gives light", () => {
  test("lights the squares around it, so the hero sees them in the dark", () => {
    const { game } = campsite();
    expect(game.dark).toBe(true);
    expect(game.sightRadius()).toBe(3);
    expect(sees(game, 13, 10)).toBe(true); // the hero's own 3 squares
    expect(sees(game, 14, 10)).toBe(true); // too far for the hero, but at the edge of the fire's light
    expect(sees(game, 16, 10)).toBe(true);
    expect(sees(game, 17, 10)).toBe(true); // the fire itself
    expect(sees(game, 15, 5)).toBe(false); // dark: 5 from the hero, 5 from the fire
  });

  test("lit squares are lit from the fire outward, like torchlight from the hero", () => {
    const { game } = campsite();
    expect(game.lit.get("17,10")).toBe(1);
    expect(game.lit.get("16,10")).toBeGreaterThan(game.lit.get("14,10"));
    expect(game.light.get("16,10")).toBe(game.lit.get("16,10"));
    expect(game.light.get("11,10")).toBeGreaterThan(game.light.get("13,10")); // the hero's own light, near to far
  });

  test("and from any distance down a clear line, further than the hero could see by day", () => {
    const { game, player } = campsite();
    expect(sees(game, 18, 10)).toBe(true); // 8 from the hero: the edge of their sight
    expect(sees(game, 19, 10)).toBe(true); // lit, 9 away
    player.moveTo(2, 10); // 15 from the fire
    game.draw();
    expect(sees(game, 17, 10)).toBe(true); // the fire
    expect(sees(game, 14, 10)).toBe(true); // the edge of its light
    expect(sees(game, 13, 10)).toBe(false); // dark, and out of the hero's reach
    for (let y = 1; y <= 19; y++) game.currentScene.setTile(12, y, "wall");
    game.draw();
    expect(sees(game, 17, 10)).toBe(false); // behind the wall
  });

  test("a wall blocks the fire's light, and the hero's view of what it lights", () => {
    const { game } = campsite();
    for (let y = 9; y <= 11; y++) game.currentScene.setTile(15, y, "wall");
    game.draw();
    expect(sees(game, 14, 10)).toBe(false); // the wall keeps the fire's light off it
    expect(sees(game, 16, 10)).toBe(false); // lit, but behind the wall
    expect(sees(game, 16, 7)).toBe(true); // lit, and seen past the end of the wall
  });

  test("a wall between two rooms is lit only on the fire's side", () => {
    const { game, player } = campsite();
    for (let y = 1; y <= 19; y++) game.currentScene.setTile(15, y, "wall");
    game.draw();
    expect(sees(game, 15, 10)).toBe(false); // the hero's side of the wall, and the fire lights the other side
    player.moveTo(13, 10); // close enough to see the wall by their own light
    game.draw();
    expect(sees(game, 15, 10)).toBe(true);
    expect(game.lit.has("15,10")).toBe(false); // but it's a plain wall from here, nothing to glow
    player.moveTo(16, 8); // the fire's side
    game.draw();
    expect(sees(game, 15, 9)).toBe(true);
    expect(game.lit.get("15,9")).toBeGreaterThan(0);
  });

  test("the scene's lit squares are worked out again when a tile changes", () => {
    const { game } = campsite();
    game.currentScene.setTile(17, 10, "floor");
    game.draw();
    expect(game.lit.size).toBe(0);
    expect(sees(game, 16, 10)).toBe(false);
  });

  test("in daylight the hero sees as before, and the fire is still seen from afar", () => {
    const { game, player } = campsite({ daylight: true });
    expect(game.dark).toBe(false);
    expect(sees(game, 18, 10)).toBe(true);
    expect(sees(game, 19, 10)).toBe(true); // lit, 9 away
    expect(sees(game, 1, 10)).toBe(false); // plain floor 9 away
    player.moveTo(2, 10); // 15 from the fire
    game.draw();
    expect(sees(game, 17, 10)).toBe(true);
    expect(sees(game, 13, 10)).toBe(false); // between the hero's sight and the fire's light
  });
});

describe("a glow", () => {
  test("colors the lit squares, nearer ones more, and flickers from frame to frame", () => {
    const { game } = campsite({ daylight: true });
    expect(game.glowing).toBe(true);
    const cam = game.updateCamera();
    const colorAt = (x, y) => game.lastFrame.get(x - cam.x + "," + (y - cam.y))[3];
    const plain = colorAt(3, 10);
    const near = colorAt(16, 10), edge = colorAt(15, 10);
    expect(near).not.toBe(plain);
    expect(edge).not.toBe(plain);
    // Nearer the fire is more orange: more red, less blue.
    const rgb = (c) => ROT.Color.fromString(c);
    expect(rgb(near)[0] - rgb(near)[2]).toBeGreaterThan(rgb(edge)[0] - rgb(edge)[2]);
    expect(rgb(edge)[0] - rgb(edge)[2]).toBeGreaterThan(rgb(plain)[0] - rgb(plain)[2]);
    const seen = new Set();
    for (let i = 0; i < 12; i++) {
      game.flicker++;
      game.drawMap();
      seen.add(colorAt(16, 10));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test("a glow with no light reaches 3 squares", () => {
    const game = makeGame();
    const d = game.tile("lamp", { glow: "yellow" });
    expect(d.light).toBe(3);
  });

  test("a tile that only gives light has no glow", () => {
    const { game } = campsite({ daylight: true }, { glow: false });
    expect(game.lit.size).toBeGreaterThan(0);
    expect(game.glowing).toBe(false);
  });

  // A wall between the hero and the fire. With fog on, the lit squares behind it are never
  // seen, so they aren't drawn. With fog off the whole map is drawn as if seen, so they glow.
  test("with fog off, lit squares glow whether or not the hero sees them", () => {
    const walled = (sceneOptions) => {
      const map = Array.from({ length: 21 }, (_, y) =>
        Array.from({ length: 21 }, (_, x) =>
          x === 0 || y === 0 || x === 20 || y === 20 || x === 12 ? "#" : x === 10 && y === 10 ? "@" : x === 17 && y === 10 ? "^" : ".").join(""));
      const { game } = campsite({ daylight: true, map, ...sceneOptions });
      expect(sees(game, 16, 10)).toBe(false);
      const cam = game.updateCamera();
      const at = (x, y) => game.lastFrame.get(x - cam.x + "," + (y - cam.y));
      return { plain: at(3, 10)?.[3], lit: at(16, 10)?.[3] };
    };
    expect(walled({}).lit).toBeUndefined();
    const clear = walled({ fog: false });
    expect(clear.lit).not.toBe(clear.plain);
    const rgb = (c) => ROT.Color.fromString(c);
    expect(rgb(clear.lit)[0] - rgb(clear.lit)[2]).toBeGreaterThan(rgb(clear.plain)[0] - rgb(clear.plain)[2]);
  });
});

// With pictures: the stack of sheet squares drawn on a map square, as "col,row" names.
describe("with pictures", () => {
  const until = (done) => new Promise((resolve) => {
    const t = setInterval(() => { if (done()) { clearInterval(t); resolve(); } }, 5);
  });
  async function pictures(sceneOptions = {}) {
    const game = makeGame({ player: { sight: 8, items: [] }, dark: 3, fit: false, viewWidth: 21, viewHeight: 21, tileset: true, animate: 0 });
    game.tile("campfire", { tile: [14, 10], frames: [[14, 10], [12, 22]], fx: "sparks", light: 3, glow: "orange", walkable: false });
    game.npc("old_man", {});
    const rows = Array.from({ length: 21 }, (_, y) =>
      Array.from({ length: 21 }, (_, x) =>
        x === 0 || y === 0 || x === 20 || y === 20 ? "#" : x === 10 && y === 10 ? "@" : x === 17 && y === 10 ? "^" : x === 17 && y === 9 ? "O" : ".").join(""));
    game.scene(1, { map: rows, legend: { "^": "campfire", O: "old_man" }, enemies: 0, items: 0, daylight: true, ...sceneOptions });
    game.start();
    await until(() => game.tilesReady);
    game.drawMap();
    const cam = game.updateCamera();
    const stack = (x, y) => game.lastFrame.get(x - cam.x + "," + (y - cam.y))[2];
    return { game, player: game.player, stack };
  }

  test("the fire's frames take turns as it flickers", async () => {
    const { game, stack } = await pictures();
    expect(stack(17, 10)).toEqual(["7,0", "14,10"].slice(stack(17, 10).length - 2));
    game.flicker++;
    game.drawMap();
    expect(stack(17, 10).pop()).toBe("12,22");
  });

  // The sparks are an fx (see drawFx in zot.js): a box over the fire's
  // square that glowing dots fly up from, over whoever stands around it.
  const sparks = (game) => game.el.fx.querySelector('.zot-dots[data-fx="sparks"]');

  test("sparks fly up from the fire's square", async () => {
    const { game } = await pictures();
    const cam = game.updateCamera();
    const box = sparks(game);
    expect(box.style.left).toBe((17 - cam.x) * 32 + "px");
    expect(box.style.top).toBe((10 - cam.y) * 32 + "px");
    const now = performance.now();
    game.emit(now);
    expect(box.querySelectorAll(".zot-dot")).toHaveLength(1);
    const dot = box.querySelector(".zot-dot");
    expect(["#ffd23f", "#ffb347", "#ff6a1f"]).toContain(dot.style.getPropertyValue("--zot-dot"));
    expect(parseFloat(dot.style.getPropertyValue("--zot-dy"))).toBeLessThan(0); // up
    game.drawMap();
    expect(sparks(game)).toBe(box); // the same box from one drawing to the next
    game.emit(now + 5000); // long after the first dot's life: it has gone, and another is due
    expect(box.querySelectorAll(".zot-dot")).toHaveLength(1);
    expect(box.querySelector(".zot-dot")).not.toBe(dot);
  });

  test("out of sight, a remembered fire holds still and has no sparks", async () => {
    const { game, player, stack } = await pictures();
    player.moveTo(2, 2);
    for (let y = 1; y <= 19; y++) game.currentScene.setTile(12, y, "wall");
    game.drawMap();
    expect(sees(game, 17, 10)).toBe(false);
    expect(stack(17, 10).pop()).toBe("14,10");
    game.flicker++;
    game.drawMap();
    expect(stack(17, 10).pop()).toBe("14,10");
    expect(sparks(game)).toBe(null);
    expect(game.emitter).toBe(null);
  });

  test("with fog off, a fire out of sight flickers and sparks like one in view", async () => {
    const { game, player, stack } = await pictures({ fog: false });
    player.moveTo(2, 2);
    for (let y = 1; y <= 19; y++) game.currentScene.setTile(12, y, "wall");
    game.drawMap();
    expect(sees(game, 17, 10)).toBe(false);
    expect(sparks(game)).not.toBe(null);
    expect(game.glowing).toBe(true);
    const first = stack(17, 10).pop();
    game.flicker++;
    game.drawMap();
    expect(stack(17, 10).pop()).not.toBe(first);
  });
});

describe("walking into the fire", () => {
  test("runs the tile's onBump", () => {
    const game = makeGame();
    game.tile("campfire", {
      walkable: false,
      light: 2,
      onBump(player, x, y, g) {
        g.say("Hot!");
        return false;
      },
    });
    game.scene(1, { map: ["#####", "#@^.#", "#####"], legend: { "^": "campfire" }, enemies: 0, items: 0 });
    game.start();
    const turn = game.turn;
    press("ArrowRight");
    expect(lastMessage(game)).toBe("Hot!");
    expect(game.player.x).toBe(1);
    expect(game.turn).toBe(turn);
  });
});

describe("an npc beside a tile", () => {
  function camp(sceneOptions = {}) {
    const game = makeGame({ seed: 3, player: { sight: 6 } });
    game.tile("campfire", { walkable: false, light: 4, glow: "orange" });
    game.npc("old_man", { beside: "campfire", says: "Hello." });
    game.npc("farmer", { ai: "wander" });
    game.scene(1, { enemies: 0, items: 0, npcs: ["old_man", "farmer"], ...sceneOptions });
    game.start();
    const scene = game.currentScene;
    const oldMan = game.currentScene.npcs.find((c) => c.kind === "old_man");
    const farmer = game.currentScene.npcs.find((c) => c.kind === "farmer");
    const fires = [];
    for (let x = 0; x < scene.width; x++) for (let y = 0; y < scene.height; y++) if (scene.tiles[x][y] === "campfire") fires.push({ x, y });
    return { game, player: game.player, scene, oldMan, farmer, fires };
  }

  test("gets the tile on a square touching it, in a dungeon", () => {
    const { player, oldMan, fires } = camp();
    expect(fires.length).toBe(1);
    expect(distance(fires[0], oldMan)).toBe(1);
    expect(distance(fires[0], player)).toBeGreaterThan(0);
  });

  test("and outdoors", () => {
    const { player, oldMan, fires } = camp({ map: "overworld", water: false, sight: 12 });
    expect(fires.length).toBe(1);
    expect(distance(fires[0], oldMan)).toBe(1);
    expect(distance(fires[0], player)).toBeGreaterThan(0);
  });

  test("stands still by it while a wandering npc strolls, staying near where it started", () => {
    const { game, oldMan, farmer } = camp({ map: "overworld", water: false, sight: 12 });
    const start = { x: oldMan.x, y: oldMan.y }, home = { x: farmer.x, y: farmer.y };
    let moved = false;
    for (let i = 0; i < 300; i++) {
      press(" ");
      if (farmer.x !== home.x || farmer.y !== home.y) moved = true;
      expect(distance(farmer, home)).toBeLessThanOrEqual(6);
    }
    expect(game.turn).toBeGreaterThanOrEqual(300);
    expect(moved).toBe(true);
    expect(oldMan.x).toBe(start.x);
    expect(oldMan.y).toBe(start.y);
  });

  test("beside must name a tile that exists", () => {
    const game = makeGame();
    expect(() => game.npc("hermit", { beside: 3 })).toThrow(/beside is the name of a tile/);
    game.npc("ghost", { beside: "grave" });
    game.scene(1, { enemies: 0, items: 0, npcs: "ghost" });
    expect(() => game.start()).toThrow(/no tile called "grave".*game\.tile\("grave"/);
  });
});

describe("game.tile", () => {
  test("starts from a floor, or from the built-in tile of that name", () => {
    const game = makeGame();
    const moss = game.tile("moss", { color: "green" });
    expect(moss.walkable).toBe(true);
    expect(moss.symbol).toBe("?");
    const wall = game.tile("wall", { color: "red" });
    expect(wall.walkable).toBe(false);
    expect(wall.symbol).toBe("#");
    expect(game.tiles.wall.color).toBe("red");
  });

  test("light and glow must be a number of squares and a color", () => {
    const game = makeGame();
    expect(() => game.tile("bad", { light: "lots" })).toThrow(/light is how many squares/);
    expect(() => game.tile("bad", { light: -1 })).toThrow(/light is how many squares/);
    expect(() => game.tile("bad", { glow: 3 })).toThrow(/glow is a color/);
    expect(() => game.tile("bad", { fx: [[13, 22]] })).toThrow(/fx is the name of an fx/);
  });
});
