import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

describe("stairs", () => {
  // Scene 1 is drawn with the way down (>) two steps east of the hero; scene 2 is generated.
  function twoScenes() {
    const game = makeGame({ scenes: 2 });
    game.scene(1, { map: ["######", "#@..>#", "######"], enemies: 0, items: 0 });
    game.scene(2, { enemies: 0, items: 0 });
    game.start();
    return { game, player: game.player, first: game.currentScene };
  }

  test("walking onto > goes down and arrives on the <", () => {
    const { game, player, first } = twoScenes();
    player.moveTo(first.down.x, first.down.y);
    expect(game.currentScene.key).toBe(2);
    expect(game.currentScene.tileAt(player.x, player.y)).toBe("stairsUp");
  });

  test("Enter on < climbs back to the same scene, onto its >", () => {
    const { game, player, first } = twoScenes();
    player.moveTo(first.down.x, first.down.y);
    press("Enter");
    expect(game.currentScene.key).toBe(1);
    expect(game.currentScene).toBe(first);
    expect([player.x, player.y]).toEqual([first.down.x, first.down.y]);
  });

  test("going down from the last scene wins", () => {
    const game = makeGame({ scenes: 1 });
    game.scene(1, { map: ["#####", "#@.>#", "#####"], enemies: 0, items: 0 });
    game.start();
    game.player.moveTo(3, 1);
    expect(game.over).toBe(true);
  });
});

// These scenes come from the generator, so they use a seed.
describe("a scene's settings", () => {
  function deepCave() {
    const game = makeGame({ seed: 42, scenes: 3 });
    game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
    game.enemy("boss", { hp: 30, attack: 3, xp: 50, unique: true, onDie() { game.win("boss dead"); } });
    game.item("potion", { onUse(p) { p.heal(10); } });
    game.scene(3, { map: "cave", boss: "boss", treasure: ["potion"], name: "Deep" });
    game.start();
    game.goToScene(3);
    return { game, boss: game.currentScene.enemies.find((e) => e.kind === "boss") };
  }

  test("name, boss and treasure are placed in that scene", () => {
    const { game, boss } = deepCave();
    expect(game.currentScene.key).toBe(3);
    expect(game.currentScene.name).toBe("Deep");
    expect(boss).toBeDefined();
    expect(game.currentScene.items.some((i) => i.kind === "potion")).toBe(true);
  });

  test("enemies keep acting for 200 turns without errors", () => {
    const { game } = deepCave();
    game.config.godMode = true; // keep the hero alive so every turn runs
    const turn = game.turn;
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];
    for (let i = 0; i < 200; i++) press(keys[i % 5]);
    expect(game.turn).toBeGreaterThan(turn);
  });

  test("a boss whose onDie calls game.win ends the game", () => {
    const { game, boss } = deepCave();
    boss.hurt(999, game.player);
    expect(game.over).toBe(true);
  });
});

describe("mistakes", () => {
  test("spawning an enemy that doesn't exist names it and lists the real ones", () => {
    const game = makeGame();
    game.enemy("goblin", { hp: 4 });
    game.scene(1, { map: ["####", "#@.#", "####"], enemies: 0, items: 0 });
    game.start();
    expect(() => game.currentScene.spawn("dragon")).toThrow(/no enemy called "dragon".*goblin/s);
  });
});

describe("what the player is told", () => {
  test("the log names the scene when it has a name, and just the stairs when it hasn't", () => {
    const game = makeGame({ scenes: 3 });
    game.scene(1, { map: ["######", "#@..>#", "######"], enemies: 0, items: 0 });
    game.scene(2, { name: "The Mine", map: ["######", "#<..>#", "######"], enemies: 0, items: 0 });
    game.scene(3, { enemies: 0, items: 0 });
    game.start();
    const down = () => game.player.moveTo(game.currentScene.exits.down.x, game.currentScene.exits.down.y);
    down();
    down();
    const texts = game.messages.map((m) => m.text);
    expect(texts).toContain("You go down the stairs to The Mine.");
    expect(texts).toContain("You go down the stairs.");
    expect(texts.join(" ")).not.toMatch(/scene/i);
  });

  test("a reach quest and the end screen use the scene's name, or 'floor n'", () => {
    const game = makeGame({ scenes: 3 });
    game.scene(1, { map: ["####", "#@.#", "####"], enemies: 0, items: 0 });
    game.scene(3, { name: "The Lair", enemies: 0, items: 0 });
    game.quest("far", { reach: 3 });
    game.quest("near", { reach: 2 });
    game.start();
    game.startQuest("far");
    game.startQuest("near");
    expect(game.questNamed("far").text).toBe("Reach The Lair.");
    expect(game.questNamed("near").text).toBe("Reach floor 2.");
    expect(game.sceneTitle(3)).toBe("The Lair");
    expect(game.sceneTitle(2)).toBe("floor 2");
    expect(game.sceneTitle("old_mine")).toBe("Old mine");
  });
});

describe("scenes with names, joined by exits", () => {
  // A meadow with a cave mouth down to the mine; the mine has a secret way
  // out to the lair, drawn as the W; the lair's portal back is placed for it.
  function world(config = {}) {
    const game = makeGame({ scenes: null, ...config });
    game.enemy("rat", { hp: 1 });
    game.scene("meadow", {
      name: "The Meadow",
      map: ["######", "#@..>#", "######"],
      exits: { down: "mine" },
      enemies: 0,
      items: 0
    });
    game.scene("mine", {
      map: ["#######", "#<...W#", "#######"],
      legend: { W: { tile: "portal", exit: "secret" } },
      exits: { up: "meadow", secret: { to: "lair" } },
      enemies: 0,
      items: 0
    });
    game.scene("lair", { name: "The Lair", exits: { secret: { to: "mine" }, out: { to: "meadow", at: "down" } }, enemies: 0, items: 0 });
    return game;
  }
  const step = (game, exit) => game.player.moveTo(exit.x, exit.y);

  test("the game begins in the first scene defined, and the stairs lead to the named scene", () => {
    const game = world().start();
    expect(game.currentScene.key).toBe("meadow");
    expect(game.sceneCount).toBe(0);
    step(game, game.currentScene.exits.down);
    expect(game.currentScene.key).toBe("mine");
    expect(game.currentScene.tileAt(game.player.x, game.player.y)).toBe("stairsUp");
  });

  test("a drawn exit square and a placed one lead both ways, arriving on the matching exit", () => {
    const game = world().start();
    game.goToScene("mine");
    const w = game.currentScene.exits.secret;
    expect([w.x, w.y]).toEqual([5, 1]);
    expect(game.currentScene.tileAt(w.x, w.y)).toBe("portal");
    step(game, w);
    expect(game.currentScene.key).toBe("lair");
    const back = game.currentScene.exits.secret;
    expect([game.player.x, game.player.y]).toEqual([back.x, back.y]);
    expect(game.currentScene.tileAt(back.x, back.y)).toBe("portal");
    expect(game.messages.at(-1).text).toBe("You step through to The Lair.");
    press("Enter");
    expect(game.currentScene.key).toBe("mine");
  });

  test("at: picks which exit to arrive on over there", () => {
    const game = world().start();
    game.goToScene("lair");
    step(game, game.currentScene.exits.out);
    expect(game.currentScene.key).toBe("meadow");
    const down = game.currentScene.exits.down;
    expect([game.player.x, game.player.y]).toEqual([down.x, down.y]);
  });

  test("start: says where to begin, and an exit with win: true ends the game", () => {
    const game = world({ start: "lair" });
    game.defs.scene.lair.exits.gate = { win: true };
    game.start();
    expect(game.currentScene.key).toBe("lair");
    step(game, game.currentScene.exits.gate);
    expect(game.over).toBe(true);
    expect(game.messages.at(-1).text).toBe("You made it through the whole dungeon!");
  });

  test("an exit to a scene that doesn't exist is refused at start, naming the ones there are", () => {
    const game = world();
    game.defs.scene.mine.exits.secret = "lairr";
    expect(() => game.start()).toThrow(/the mine scene has an exit \(secret\) to "lairr".*"meadow", "mine", "lair"/);
  });

  test("a named scene without stairs in its exits gets none, even when they are drawn", () => {
    const game = makeGame({ scenes: null });
    game.scene("only", { map: ["#####", "#@.>#", "#####"], enemies: 0, items: 0 });
    game.start();
    expect(game.currentScene.tileAt(3, 1)).toBe("floor");
    expect(Object.keys(game.currentScene.exits)).toEqual([]);
  });

  test("scenes: on an enemy picks scenes by name, level: picks a level, and together they add up", () => {
    const game = world();
    game.enemy("bat", { scenes: "mine" });
    game.enemy("wolf", { level: 3 });
    game.enemy("snake", { scenes: "meadow", level: 3 });
    game.enemy("owl", { scenes: ["meadow", 3] }); // a number in scenes is a level too
    game.defs.scene.lair.level = 3;
    expect(Object.keys(game.pool("enemy", "mine")).sort()).toEqual(["bat", "rat"]);
    expect(Object.keys(game.pool("enemy", "lair")).sort()).toEqual(["owl", "rat", "snake", "wolf"]);
    expect(Object.keys(game.pool("enemy", "meadow")).sort()).toEqual(["owl", "rat", "snake"]);
  });

  test("the numbered chain still works alongside, and scenes: counts it", () => {
    const game = makeGame({ scenes: null });
    game.scene(1, { map: ["#####", "#@.>#", "#####"], enemies: 0, items: 0 });
    game.scene(2, { enemies: 0, items: 0 });
    game.scene("town", { exits: { back: { to: 2, at: "up" } }, enemies: 0, items: 0 });
    expect(game.sceneCount).toBe(2);
    game.start();
    expect(game.currentScene.key).toBe(1);
    game.goToScene("town");
    step(game, game.currentScene.exits.back);
    expect(game.currentScene.key).toBe(2);
  });
});

describe("an exit on a solid tile", () => {
  // The hero between a rat and the door of a house: nothing can stand on
  // the door, and the hero goes in by walking into it.
  function yard() {
    const game = makeGame({ player: { hp: 10 }, scenes: null });
    game.tile("cottage", { symbol: "H", walkable: false });
    game.enemy("rat", { hp: 1, attack: 0 });
    game.scene("yard", {
      map: ["######", "#r.@H#", "######"],
      legend: { H: { tile: "cottage", exit: "house" }, r: "rat" },
      exits: { house: { to: "house", at: "door" } },
      enemies: 0,
      items: 0
    });
    game.scene("house", {
      map: ["#####", "#...#", "##D##"],
      legend: { D: { tile: "openDoor", exit: "door" } },
      exits: { door: { to: "yard", at: "house" } },
      enemies: 0,
      items: 0
    });
    game.start();
    return { game, player: game.player, rat: game.currentScene.enemies[0] };
  }

  test("nobody can walk onto it, and the hero takes it by walking into it", () => {
    const { game, player, rat } = yard();
    expect(game.currentScene.isWalkable(4, 1)).toBe(false);
    expect(rat.moveTo(4, 1)).toBe(false);
    expect(player.moveBy(1, 0)).toBe(true);
    expect(game.currentScene.key).toBe("house");
  });

  test("the hero arrives in front of it on the way back", () => {
    const { game, player } = yard();
    player.moveBy(1, 0);
    player.moveBy(0, -1); // off the door, and back out through it
    player.moveBy(0, 1);
    expect(game.currentScene.key).toBe("yard");
    expect([player.x, player.y]).toEqual([3, 1]); // the only free square around it
  });
});

describe("a solid exit placed at random", () => {
  // A cottage on the meadow and the house behind its door.
  function homestead(mapRows, legend = {}) {
    const game = makeGame({ scenes: null });
    game.tile("cottage", { symbol: "H", walkable: false });
    game.scene("meadow", {
      map: mapRows,
      legend,
      exits: { house: { to: "house", at: "door", tile: "cottage" } },
      enemies: 0,
      items: 0
    });
    game.scene("house", {
      map: ["#####", "#...#", "##D##"],
      legend: { D: { tile: "openDoor", exit: "door" } },
      exits: { door: { to: "meadow", at: "house" } },
      enemies: 0,
      items: 0
    });
    game.start();
    return game;
  }

  test("goes where there is clear ground below it to arrive on", () => {
    const game = homestead(["##############", "#@...........#", "#............#", "#............#", "#............#", "##############"]);
    const h = game.currentScene.exits.house;
    expect(game.currentScene.tileAt(h.x, h.y)).toBe("cottage");
    expect(game.currentScene.tileAt(h.x, h.y + 1)).toBe("floor");
    game.player.moveTo(h.x, h.y + 1);
    game.player.moveBy(0, -1); // in
    expect(game.currentScene.key).toBe("house");
    game.player.moveBy(0, -1); // off the door, and back out through it
    game.player.moveBy(0, 1);
    expect(game.currentScene.key).toBe("meadow");
    expect([game.player.x, game.player.y]).toEqual([h.x, h.y + 1]);
  });

  test("with a wall below, the nearest free square around it", () => {
    const game = homestead(["##########", "#@......H#", "##########"], { H: { tile: "cottage", exit: "house" } });
    const h = game.currentScene.exits.house;
    expect(game.currentScene.landing(h)).toEqual({ x: h.x - 1, y: h.y });
  });
});
