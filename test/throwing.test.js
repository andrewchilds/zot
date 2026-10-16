import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage } from "./helpers.js";

// The hero (@) at the west end of a room, a sword wielded and three daggers that can be thrown.
// Without pictures (the default here) a thrown thing lands the moment it's thrown.
function yard(config = {}, items = ["sword", "dagger"]) {
  const game = makeGame({ player: { hp: 30, attack: 1, items }, ...config });
  game.item("sword", { slot: "weapon", attack: 10 });
  game.item("dagger", { slot: "weapon", attack: 2, throw: 4, count: 3 });
  game.item("spear", { slot: "weapon", attack: 3, throw: 3 });
  game.enemy("rat", { hp: 3, attack: 1 });
  game.enemy("ogre", { hp: 50, attack: 1 });
  game.scene(1, {
    map: `
      ##########
      #........#
      #@.......#
      #........#
      ##########
    `,
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player, scene: game.currentScene };
}

const onFloor = (scene, kind) => scene.items.filter((i) => i.kind === kind);

describe("throwing", () => {
  test("h throws one off the pile at the closest enemy in line, using a turn", () => {
    const { game, player, scene } = yard();
    const ogre = scene.spawn("ogre", player.x + 3, player.y);
    const turn = game.turn;
    press("h");
    expect(game.turn).toBe(turn + 1);
    expect(player.countOf("dagger")).toBe(2);
    expect(ogre.hp).toBeLessThan(50);
    expect(lastMessage(game)).toMatch(/^Your dagger flies east and hits the ogre for \d+\.$/);
  });

  test("hits with its own attack, not the wielded sword's", () => {
    const { player, scene } = yard();
    expect(player.attack).toBe(11);
    const ogre = scene.spawn("ogre", player.x + 2, player.y);
    for (let i = 0; i < 3; i++) player.throwItem(player.itemNamed("dagger"), 1, 0);
    expect(50 - ogre.hp).toBeLessThanOrEqual(9); // at most 1 + 2 a throw
    expect(player.attack).toBe(11);
  });

  test("is gone once it hits", () => {
    const { player, scene } = yard();
    scene.spawn("ogre", player.x + 2, player.y);
    player.throwItem(player.itemNamed("dagger"), 1, 0);
    expect(onFloor(scene, "dagger")).toHaveLength(0);
    expect(player.countOf("dagger")).toBe(2);
  });

  test("is gone when it misses too", () => {
    const { game, player, scene } = yard();
    expect(player.throwItem(player.itemNamed("dagger"), 1, 0)).toBe(true);
    expect(lastMessage(game)).toBe("Your dagger flies east and is lost.");
    expect(onFloor(scene, "dagger")).toHaveLength(0);
  });

  test("ignores an enemy past its range", () => {
    const { game, player, scene } = yard();
    scene.spawn("rat", player.x + 6, player.y);
    press("h");
    expect(lastMessage(game)).toBe("There's no enemy in line to throw at.");
    expect(player.countOf("dagger")).toBe(3);
  });

  test("the wielded one is taken off when it's thrown", () => {
    const { player, scene } = yard({}, ["spear"]);
    expect(player.gear.weapon.kind).toBe("spear");
    scene.spawn("ogre", player.x + 2, player.y);
    expect(player.throwNearest(player.gear.weapon)).toBe(true);
    expect(player.gear.weapon).toBeUndefined();
    expect(player.has("spear")).toBe(false);
  });

  test("with more than one kind, h asks which", () => {
    const { game, player, scene } = yard({}, ["sword", "dagger", "spear"]);
    const rat = scene.spawn("rat", player.x + 2, player.y);
    press("h");
    expect(game.mode).toBe("menu");
    const spear = game.menuState.options.findIndex((o) => o.item.kind === "spear");
    game.menuState.onPick(spear, game.menuState.options[spear]);
    expect(player.has("spear")).toBe(false);
    expect(rat.hp).toBeLessThan(3);
  });

  test("with nothing to throw, h says so and takes no turn", () => {
    const { game } = yard({}, ["sword"]);
    const turn = game.turn;
    press("h");
    expect(lastMessage(game)).toBe("You have nothing to throw.");
    expect(game.turn).toBe(turn);
  });

  test("throw must be a number of squares", () => {
    const game = makeGame();
    expect(() => game.item("rock", { throw: "far" })).toThrow(/throw is how far/);
  });
});

// The hero at the west end, an enemy that shoots arrows at the east end.
function gallery(enemy = {}, config = {}) {
  const game = makeGame({ player: { hp: 100, attack: 1 }, ...config });
  game.item("arrow", { count: 5 });
  game.enemy("archer", { hp: 10, attack: 3, shoots: "arrow", range: 6, ai: "still", sight: 10, ...enemy });
  game.scene(1, {
    map: `
      ##########
      #........#
      #@.......#
      #........#
      ##########
    `,
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player, scene: game.currentScene };
}

describe("an enemy that shoots", () => {
  test("shoots the hero in line and in range, and the arrow is used up", () => {
    const { game, player, scene } = gallery();
    scene.spawn("archer", player.x + 5, player.y);
    press(" ");
    expect(player.hp).toBeLessThan(100);
    expect(game.messages.some((m) => /^The archer's arrow flies west and hits you for \d+\.$/.test(m.text))).toBe(true);
    expect(onFloor(scene, "arrow")).toHaveLength(0);
  });

  test("doesn't shoot out of range, out of line, or through a wall", () => {
    const { player, scene } = gallery({ range: 3 });
    scene.spawn("archer", player.x + 5, player.y); // too far
    scene.spawn("archer", player.x + 2, player.y + 1); // not in line
    press(" ");
    expect(player.hp).toBe(100);
  });

  test("right beside the hero it hits up close instead", () => {
    const { game, player, scene } = gallery();
    scene.spawn("archer", player.x + 1, player.y);
    press(" ");
    expect(player.hp).toBeLessThan(100);
    expect(game.messages.some((m) => /^The archer hits you/.test(m.text))).toBe(true);
  });

  test("a chasing one shoots rather than walks when it can", () => {
    const { player, scene } = gallery({ ai: "chase" });
    const archer = scene.spawn("archer", player.x + 5, player.y);
    press(" ");
    expect(archer.x).toBe(player.x + 5);
    expect(player.hp).toBeLessThan(100);
  });

  test("its act can shoot with shootAt", () => {
    const { player, scene } = gallery({
      ai: "chase",
      act(self, game) {
        if (!self.shootAt(game.player)) self.wander();
      },
    });
    scene.spawn("archer", player.x + 4, player.y);
    press(" ");
    expect(player.hp).toBeLessThan(100);
  });

  test("shoots must name an item", () => {
    const game = makeGame();
    game.enemy("archer", { shoots: "bolt" });
    expect(() => game.start()).toThrow(/the archer enemy shoots "bolt"/);
  });
});

describe("arrows in flight", () => {
  const until = (done) => new Promise((resolve) => {
    const t = setInterval(() => { if (done()) { clearInterval(t); resolve(); } }, 5);
  });

  test("keys wait until every arrow shot this turn has landed", async () => {
    const { game, player, scene } = gallery({}, { tileset: true });
    await until(() => game.tilesReady);
    scene.spawn("archer", player.x + 2, player.y);
    scene.spawn("archer", player.x + 6, player.y);
    // The near one's arrow lands first, while the far one's is still on its way.
    game.afterTurn(true);
    expect(game.inAir).toBe(2);
    await until(() => game.inAir === 1);
    expect(game.flying).toBe(true);
    await until(() => !game.flying);
    expect(game.inAir).toBe(0);
  });
});

describe("the log", () => {
  test("shows every message kept, not just the last few", () => {
    const { game } = yard();
    for (let i = 0; i < 40; i++) game.say(`line ${i}`);
    const lines = game.el.log.querySelectorAll(".zot-msg");
    expect(lines.length).toBe(game.messages.length);
    expect(lines[lines.length - 1].textContent).toBe("line 39");
  });
});
