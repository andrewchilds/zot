import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage } from "./helpers.js";

// The hero (@) with a door (D) right above.
function doorway(door = "lockedDoor", config = {}) {
  const game = makeGame(config);
  game.item("key", {});
  game.item("iron_key", { name: "Iron Key", symbol: "-" });
  game.scene(1, {
    map: `
      #####
      #.D.#
      #.@.#
      #...#
      #####
    `,
    legend: { D: door },
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player, door: [2, 1] };
}

describe("doors", () => {
  const sees = (game, x, y) => game.visible.has(x + "," + y);

  test("a door is shut: walking into it opens it, which takes a turn, and then it stays open", () => {
    const { game, player, door } = doorway("door");
    expect(sees(game, 2, 0)).toBe(false);
    const turn = game.turn;
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("openDoor");
    expect(player.y).toBe(2);
    expect(game.turn).toBe(turn + 1);
    expect(sees(game, 2, 0)).toBe(true);
    press("ArrowUp");
    expect(player.y).toBe(1);
    press("ArrowDown");
    expect(game.currentScene.tileAt(...door)).toBe("openDoor");
  });

  // A goblin in the room above, with the shut door between it and the hero.
  test("enemies can't open a door, but follow through an open one", () => {
    const game = makeGame();
    game.enemy("goblin", { hp: 4, attack: 1, sight: 10 });
    game.scene(1, {
      map: `
        #####
        #.g.#
        ##D##
        #.@.#
        #####
      `,
      legend: { D: "door", g: "goblin" },
      enemies: 0, items: 0,
    });
    game.start();
    const player = game.player, goblin = game.currentScene.enemies[0];
    const chase = () => { goblin.memory = { x: player.x, y: player.y }; goblin.act(); };
    for (let i = 0; i < 8; i++) chase();
    expect(goblin.y).toBe(1);
    expect(game.currentScene.tileAt(2, 2)).toBe("door");
    press("ArrowUp");
    expect(game.currentScene.tileAt(2, 2)).toBe("openDoor");
    chase();
    expect([goblin.x, goblin.y]).toEqual([2, 2]);
  });
});

describe("locked doors", () => {
  test("without a key the door stays shut and no turn is used", () => {
    const { game, player, door } = doorway();
    const turn = game.turn;
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("lockedDoor");
    expect(player.y).toBe(2);
    expect(game.turn).toBe(turn);
  });

  test("the key unlocks and opens it, is used up, and takes a turn", () => {
    const { game, player, door } = doorway();
    game.give("key");
    const turn = game.turn;
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("openDoor");
    expect(player.has("key")).toBe(false);
    expect(player.y).toBe(2);
    expect(game.turn).toBe(turn + 1);
  });

  test("a door locked with a particular key wants that key", () => {
    const { game, player, door } = doorway({ tile: "lockedDoor", key: "iron_key" });
    game.give("key");
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("lockedDoor");
    expect(player.has("key")).toBe(true);
  });

  test("only the right key is used up", () => {
    const { game, player, door } = doorway({ tile: "lockedDoor", key: "iron_key" });
    game.give("key");
    game.give("iron_key");
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("openDoor");
    expect(player.has("iron_key")).toBe(false);
    expect(player.has("key")).toBe(true);
  });
});

describe("your own tiles", () => {
  const stepped = [];
  const tiles = {
    lever: { symbol: "/", color: "red", walkable: false, seeThrough: true, onBump(p, x, y, g) { g.currentScene.setTile(x, y, "floor"); g.say("Clunk."); } },
    grass: { symbol: '"', color: "green", onStep(p, x, y) { stepped.push(x + "," + y); } },
  };

  test("are kept alongside the built-in ones, walkable unless they say not", () => {
    const { game } = doorway("lever", { tiles });
    expect(game.tiles.lever.walkable).toBe(false);
    expect(game.tiles.grass.walkable).toBe(true);
    expect(game.tiles.lockedDoor).toBeDefined();
    expect(game.tiles.wall.symbol).toBe("#");
  });

  test("onBump runs and uses a turn", () => {
    const { game, player, door } = doorway("lever", { tiles });
    const turn = game.turn;
    press("ArrowUp");
    expect(game.currentScene.tileAt(...door)).toBe("floor");
    expect(lastMessage(game)).toBe("Clunk.");
    expect(player.y).toBe(2);
    expect(game.turn).toBe(turn + 1);
  });

  test("onStep runs when the hero walks onto the tile", () => {
    const { player } = doorway("grass", { tiles });
    press("ArrowUp");
    expect(player.y).toBe(1);
    expect(stepped).toContain("2,1");
  });
});

// Vaults are made by the scene generator, so these use a seeded scene.
describe("a vault", () => {
  function vaultScene() {
    const game = makeGame({ seed: 7, scenes: 2 });
    game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
    game.item("potion", { onUse() {} });
    game.item("iron_key", { name: "Iron Key", symbol: "-" });
    game.item("gem", { rarity: "rare", unique: true });
    game.scene(2, { vault: { key: "iron_key", treasure: ["gem"], guards: ["goblin"] }, enemies: 0, items: 0 });
    game.start();
    game.goToScene(2);
    const scene = game.currentScene, vault = scene.vault;
    const room = vault.room;
    const inRoom = (o) => o.x >= room.getLeft() && o.x <= room.getRight() && o.y >= room.getTop() && o.y <= room.getBottom();
    const reach = scene.reachableFrom(scene.up.x, scene.up.y);
    const reachable = (o) => reach.has(o.x + "," + o.y);
    return { game, player: game.player, scene, vault, inRoom, reach, reachable };
  }

  test("vault keys and unique items never drop by chance", () => {
    const { game } = vaultScene();
    const pool = game.pool("item", 2);
    expect(pool).toHaveProperty("potion");
    expect(pool).not.toHaveProperty("iron_key");
    expect(pool).not.toHaveProperty("gem");
  });

  test("has one door, locked with its key, and the room's other doors are bricked up", () => {
    const { scene, vault } = vaultScene();
    expect(vault.doors).toHaveLength(1);
    const [x, y] = vault.doors[0];
    expect(scene.tileAt(x, y)).toBe("lockedDoor");
    expect(scene.flagsAt(x, y).key).toBe("iron_key");
    const others = [];
    vault.room.getDoors((dx, dy) => { if (dx !== x || dy !== y) others.push(scene.tileAt(dx, dy)); });
    expect(others.every((t) => t === "wall")).toBe(true);
  });

  test("leaves every other room and the stairs down reachable", () => {
    const { scene, vault, reach } = vaultScene();
    const otherRooms = scene.rooms.filter((r) => r !== vault.room);
    expect(otherRooms.every((r) => reach.has(r.getCenter().join(",")))).toBe(true);
    expect(reach.has(scene.down.x + "," + scene.down.y)).toBe(true);
  });

  test("the key lies outside where the hero can get it; the treasure and guard are inside", () => {
    const { game, scene, inRoom, reachable } = vaultScene();
    const key = scene.items.find((i) => i.kind === "iron_key");
    const gem = scene.items.find((i) => i.kind === "gem");
    expect(reachable(key)).toBe(true);
    expect(inRoom(key)).toBe(false);
    expect(inRoom(gem)).toBe(true);
    expect(reachable(gem)).toBe(false);
    expect(game.currentScene.enemies.some((e) => e.kind === "goblin" && inRoom(e))).toBe(true);
  });

  test("the hero can fetch the key, unlock the door and walk in", () => {
    const { game, player, scene, vault, inRoom, reach } = vaultScene();
    const key = scene.items.find((i) => i.kind === "iron_key");
    player.moveTo(key.x, key.y);
    expect(player.has("iron_key")).toBe(true);

    const [dx, dy] = vault.doors[0];
    const outside = game.directions.map(([ox, oy]) => [dx + ox, dy + oy]).find(([x, y]) => reach.has(x + "," + y));
    player.x = outside[0]; player.y = outside[1]; game.updateVision();
    const toward = dx > player.x ? "ArrowRight" : dx < player.x ? "ArrowLeft" : dy > player.y ? "ArrowDown" : "ArrowUp";

    press(toward);
    expect(scene.tileAt(dx, dy)).toBe("openDoor");
    expect(player.has("iron_key")).toBe(false);
    press(toward); press(toward);
    expect(inRoom(player) || (player.x === dx && player.y === dy)).toBe(true);
  });
});

describe("secret doors", () => {
  // The hero in a room; the square above is a secret door in the wall, with a portal behind it.
  function hideout() {
    const game = makeGame({ scenes: null });
    game.scene("room", {
      map: `
        #####
        #.O.#
        ##S##
        #.@.#
        #####
      `,
      legend: { S: "secretDoor", O: { tile: "portal", exit: "out" } },
      exits: { out: "yard" },
      enemies: 0, items: 0,
    });
    game.scene("yard", { map: ["#####", "#.O.#", "#####"], legend: { O: { tile: "portal", exit: "out" } }, exits: { out: "room" }, enemies: 0, items: 0 });
    game.start();
    return { game, player: game.player };
  }
  const sees = (game, x, y) => game.visible.has(x + "," + y);

  test("it looks like a wall and hides what's behind it", () => {
    const { game } = hideout();
    const wall = game.tiles.wall, secret = game.tiles.secretDoor;
    expect([secret.symbol, secret.color]).toEqual([wall.symbol, wall.color]);
    expect(secret.walkable).toBe(false);
    expect(sees(game, 2, 2)).toBe(true);
    expect(sees(game, 2, 1)).toBe(false);
  });

  test("but the hero can get there: it counts as reachable", () => {
    const { game } = hideout();
    expect(game.currentScene.reachableFrom(2, 3).has("2,1")).toBe(true);
  });

  test("with pictures it is drawn with the wall's squares", () => {
    const game = makeGame({ tileset: true });
    expect(game.tileset.map.secretDoor).toEqual(game.tileset.map.wall);
  });

  test("walking into it opens it, for good, and says so", () => {
    const { game, player } = hideout();
    press("ArrowUp");
    expect([player.x, player.y]).toEqual([2, 3]);
    expect(game.currentScene.tileAt(2, 2)).toBe("openDoor");
    expect(lastMessage(game)).toBe("You push on the wall and a hidden door swings open.");
    expect(sees(game, 2, 1)).toBe(true);
    press("ArrowUp"); press("ArrowUp");
    expect(game.currentScene.key).toBe("yard");
    game.goToScene("room");
    expect(game.currentScene.tileAt(2, 2)).toBe("openDoor");
  });
});
