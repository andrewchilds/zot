import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, press, lastMessage } from "./helpers.js";

const at = (k) => k.split(",").map(Number);
const SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// The hero (@) with a chest (=) to the right, holding what `chests` lists.
function chestRoom({ chests = ["gem"], player = {} } = {}) {
  const game = makeGame({ player });
  game.item("gem", {});
  game.item("sword", { slot: "weapon", attack: 1 });
  game.scene(1, {
    map: `
      ######
      #.@=.#
      #....#
      ######
    `,
    enemies: 0, items: 0, chests,
  });
  game.start();
  return { game, player: game.player, chest: [3, 1] };
}

describe("opening a chest", () => {
  test("walking into it opens it and takes a turn; the hero stays put", () => {
    const { game, player, chest } = chestRoom();
    const turn = game.turn;
    press("ArrowRight");
    expect(game.turn).toBe(turn + 1);
    expect(game.currentScene.tileAt(...chest)).toBe("openChest");
    expect([player.x, player.y]).toEqual([2, 1]);
  });

  test("the hero takes everything inside", () => {
    const { game, player, chest } = chestRoom({ chests: [["gem", "sword"]] });
    player.moveBy(1, 0);
    expect(player.has("gem")).toBe(true);
    expect(player.has("sword")).toBe(true);
    expect(game.currentScene.chests).not.toHaveProperty(chest.join(","));
  });

  test("an open chest stays empty: bumping it again takes no turn", () => {
    const { game, player, chest } = chestRoom();
    press("ArrowRight");
    const turn = game.turn;
    press("ArrowRight");
    expect(game.turn).toBe(turn);
    expect(game.currentScene.tileAt(...chest)).toBe("openChest");
    expect(lastMessage(game)).toMatch(/empty/);
  });

  test("what the hero can't carry falls out beside the chest", () => {
    const { game, player, chest } = chestRoom({ chests: [["gem", "gem"]], player: { strength: 0 } });
    player.moveBy(1, 0);
    expect(player.has("gem")).toBe(false);
    const fallen = game.currentScene.items.filter((i) => i.kind === "gem");
    expect(fallen.reduce((n, i) => n + i.count, 0)).toBe(2);
    expect(fallen.every((i) => Zot.distance(i, { x: chest[0], y: chest[1] }) === 1)).toBe(true);
  });

  test("chests are solid but see-through", () => {
    const { game } = chestRoom();
    expect(game.tiles.chest.walkable).toBe(false);
    expect(game.tiles.chest.seeThrough).toBe(true);
    expect(game.tiles.openChest.walkable).toBe(false);
  });
});

// Where chests go and what's in them is up to the scene generator, so these use seeds.
describe("chests on generated scenes", () => {
  function scenes() {
    const game = makeGame({ seed: 11, scenes: 4, chestsPerScene: 2 });
    game.item("potion", { onUse(p) { p.heal(1); } });
    game.item("gem", {});
    game.item("sword", { slot: "weapon", attack: 1 });
    game.scene(1, { enemies: 0, items: 6 });
    game.scene(2, { enemies: 0, items: 0, chests: [["gem", "gem"], "sword"] });
    game.scene(3, { enemies: 0, items: 5, chests: 0 });
    game.scene(4, { map: "overworld", enemies: 0, items: 4, chests: 1 });
    game.start();
    return game;
  }

  test("chestsPerScene sets how many, and their contents come out of the scene's item count", () => {
    const game = scenes();
    const f = game.currentScene, keys = Object.keys(f.chests);
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => game.currentScene.tileAt(...at(k)) === "chest")).toBe(true);
    const inChests = keys.reduce((n, k) => n + f.chests[k].length, 0);
    expect(inChests).toBeGreaterThanOrEqual(2);
    expect(game.currentScene.items.length + inChests).toBe(6);
  });

  test("the stairs and every chest can still be walked to", () => {
    const game = scenes();
    const f = game.currentScene, reach = f.reachableFrom(f.up.x, f.up.y);
    expect(reach.has(f.down.x + "," + f.down.y)).toBe(true);
    for (const k of Object.keys(f.chests)) {
      const [x, y] = at(k);
      expect(SIDES.some(([dx, dy]) => reach.has((x + dx) + "," + (y + dy)))).toBe(true);
    }
  });

  test("a chests list fills one chest per entry with exactly that, without using the loose items", () => {
    const game = scenes();
    game.goToScene(2);
    const f = game.currentScene;
    expect(Object.values(f.chests).map((c) => c.join("+")).sort()).toEqual(["gem+gem", "sword"]);
    expect(game.currentScene.items).toHaveLength(0);
  });

  test("chests: 0 means no chests and every item loose", () => {
    const game = scenes();
    game.goToScene(3);
    expect(Object.keys(game.currentScene.chests)).toHaveLength(0);
    expect(game.currentScene.items).toHaveLength(5);
  });

  test("an overworld gets chests only when its scene asks", () => {
    const game = scenes();
    game.goToScene(4);
    expect(Object.keys(game.currentScene.chests)).toHaveLength(1);
  });
});

describe("game.currentScene.chest", () => {
  test("puts a chest holding the given items on the map", () => {
    const { game } = chestRoom({ chests: [] });
    expect(game.currentScene.chest(4, 2, "gem")).toBeTruthy();
    expect(game.currentScene.tileAt(4, 2)).toBe("chest");
    expect(game.currentScene.chests["4,2"]).toEqual(["gem"]);
  });

  test("complains about an unknown item straight away", () => {
    const { game } = chestRoom({ chests: [] });
    expect(() => game.currentScene.chest(4, 2, ["gem", "nope"])).toThrow(/no item called "nope"/);
  });
});
