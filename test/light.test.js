import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage, room } from "./helpers.js";

// A 21x21 open room with the hero in the middle.
const middle = room(21, 21, 10, 10);

// A hero who sees 8 squares and carries a torch that lasts 5 turns, on a dark scene
// unless the scene options say otherwise.
function torchGame(sceneOptions = {}, items = ["torch"]) {
  const game = makeGame({ player: { sight: 8, items } });
  game.item("torch", { slot: "light", light: true, lasts: 5 });
  game.item("candle", { slot: "light", light: 4, lasts: 3 });
  game.item("hat", { slot: "hat", defense: 1 });
  game.scene(1, { map: middle, enemies: 0, items: 0, ...sceneOptions });
  game.start();
  const player = game.player;
  const furthest = () => Math.max(...[...game.visible].map((k) => {
    const [x, y] = k.split(",").map(Number);
    return Math.max(Math.abs(x - player.x), Math.abs(y - player.y));
  }));
  const wait = (turns) => { for (let i = 0; i < turns; i++) press(" "); };
  return { game, player, furthest, wait };
}

describe("seeing in the dark", () => {
  test("with a lit torch the hero sees as far as their sight", () => {
    const { game, player } = torchGame();
    expect(player.gear.light.kind).toBe("torch");
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
  });

  test("without a light the hero sees only 3 squares", () => {
    const { game, player, furthest } = torchGame();
    player.use(player.gear.light);
    game.draw();
    expect(game.dark).toBe(true);
    expect(game.sightRadius()).toBe(3);
    expect(furthest()).toBeLessThanOrEqual(3);
  });

  test("sight is round: nothing is seen in the corners of the square around the hero", () => {
    const { game, player } = torchGame();
    const r = game.sightRadius();
    for (const k of game.visible) {
      const [x, y] = k.split(",").map(Number);
      expect((x - player.x) ** 2 + (y - player.y) ** 2).toBeLessThanOrEqual((r + 0.5) ** 2);
    }
  });

  test("a scene's own dark value sets how far the hero sees without a light", () => {
    const { game, player } = torchGame({ dark: 1.5 }, []);
    expect(game.sightRadius()).toBe(1.5);
    expect(game.visible.size).toBe(9);
    for (const k of game.visible) {
      const [x, y] = k.split(",").map(Number);
      expect(Math.max(Math.abs(x - player.x), Math.abs(y - player.y))).toBeLessThanOrEqual(1);
    }
  });

  test("a light with a number lights that many squares", () => {
    const { game, player } = torchGame({}, ["candle"]);
    expect(player.gear.light.kind).toBe("candle");
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(4);
  });

  test("a game with no lights is never dark", () => {
    const game = makeGame({ player: { sight: 8 } });
    game.scene(1, { map: middle, enemies: 0, items: 0 });
    game.start();
    expect(game.hasLights()).toBe(false);
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
  });
});

describe("daylight", () => {
  test("an overworld has daylight", () => {
    const { game } = torchGame({ map: "overworld", water: false }, []);
    expect(game.currentScene.daylight).toBe(true);
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
  });

  test("daylight: true lights a dungeon scene", () => {
    const { game } = torchGame({ daylight: true }, []);
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
  });

  test("daylight: false makes an overworld dark", () => {
    const { game } = torchGame({ map: "overworld", water: false, daylight: false }, []);
    expect(game.currentScene.daylight).toBe(false);
    expect(game.dark).toBe(true);
  });

  test("a torch doesn't burn in daylight", () => {
    const { player, wait } = torchGame({ daylight: true });
    wait(3);
    expect(player.gear.light.left).toBe(5);
  });
});

describe("burning down", () => {
  test("a lit torch burns one turn per turn", () => {
    const { player, wait } = torchGame();
    const torch = player.gear.light, left = torch.left;
    wait(2);
    expect(torch.left).toBe(left - 2);
  });

  test("then it burns out, is gone, and it's dark", () => {
    const { game, player, wait } = torchGame();
    const torch = player.gear.light;
    wait(torch.left);
    expect(torch.left).toBe(0);
    expect(player.gear.light).toBeFalsy();
    expect(player.items).not.toContain(torch);
    expect(game.dark).toBe(true);
  });

  test("a torch that's put out doesn't burn down, and lighting it again restores sight", () => {
    const { game, player, wait } = torchGame();
    const torch = player.gear.light;
    player.use(torch);
    const left = torch.left;
    wait(2);
    expect(torch.left).toBe(left);
    player.use(torch);
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
  });

  test("ordinary gear doesn't burn", () => {
    const { game, player, wait } = torchGame({}, ["hat"]);
    wait(10);
    expect(player.gear.hat.kind).toBe("hat");
    expect(game.dark).toBe(true);
  });
});

describe("piles of torches", () => {
  test("fresh torches pile up, and lighting one takes it off the pile", () => {
    const { game, player } = torchGame({}, []);
    game.give("torch"); game.give("torch");
    const pile = player.unworn.find((it) => it.kind === "torch");
    expect(player.unworn).toHaveLength(1);
    expect(pile.count).toBe(2);
    player.use(pile);
    expect(pile.count).toBe(1);
    expect(player.gear.light).not.toBe(pile);
    expect(player.gear.light.left).toBe(5);
  });

  test("a half-burnt torch put out stays separate from the fresh pile", () => {
    const { game, player } = torchGame({}, []);
    game.give("torch"); game.give("torch");
    const pile = player.unworn.find((it) => it.kind === "torch");
    player.use(pile);
    const lit = player.gear.light;
    press(" ");
    player.use(lit);
    expect(lit.left).toBe(4);
    expect(pile.count).toBe(1);
    expect(player.unworn).toContain(lit);
    expect(player.unworn).toHaveLength(2);
  });

  test("a fresh torch put out goes back on the pile", () => {
    const { game, player } = torchGame({ daylight: true }, []);
    game.give("torch"); game.give("torch"); game.give("torch");
    const pile = player.unworn.find((it) => it.kind === "torch");
    player.use(pile);
    player.use(player.gear.light);
    expect(pile.count).toBe(3);
    expect(player.unworn).toHaveLength(1);
  });

  test("lighting another light puts the torch back", () => {
    const { game, player } = torchGame({}, []);
    game.give("torch"); game.give("torch"); game.give("candle");
    const pile = player.unworn.find((it) => it.kind === "torch");
    player.use(pile);
    player.use(player.itemNamed("candle"));
    expect(player.gear.light.kind).toBe("candle");
    expect(pile.count).toBe(2);
  });

  test("in daylight, a fresh lit torch swapped for one off the pile goes back on the pile, not onto the one being lit", () => {
    const { game, player } = torchGame({ daylight: true }, []);
    game.give("torch"); game.give("torch"); game.give("torch");
    const pile = player.unworn.find((it) => it.kind === "torch");
    player.use(pile);
    const first = player.gear.light;
    player.use(pile);
    expect(player.gear.light).not.toBe(first);
    expect(player.gear.light).not.toBe(pile);
    expect(pile.count).toBe(2);
    expect(player.countOf("torch")).toBe(3);
  });
});

describe("the t key", () => {
  test("lights the half-burnt torch before a fresh one, and takes a turn", () => {
    const { game, player } = torchGame({}, []);
    game.give("torch"); game.give("torch");
    const pile = player.unworn.find((it) => it.kind === "torch");
    player.use(pile);
    const halfBurnt = player.gear.light;
    press(" ");
    player.use(halfBurnt);
    const turn = game.turn;
    press("t");
    expect(player.gear.light).toBe(halfBurnt);
    expect(pile.count).toBe(1);
    expect(game.turn).toBe(turn + 1);
  });

  test("does nothing and takes no turn when a torch is already lit", () => {
    const { game, player } = torchGame();
    const lit = player.gear.light, turn = game.turn;
    press("t");
    expect(player.gear.light).toBe(lit);
    expect(game.turn).toBe(turn);
  });

  test("takes no turn without a torch, even in a game with no lights", () => {
    const game = makeGame();
    game.scene(1, { map: middle, enemies: 0, items: 0 });
    game.start();
    const turn = game.turn;
    press("t");
    expect(game.turn).toBe(turn);
    expect(lastMessage(game)).toBe("You don't have a torch.");
  });
});

describe("mistakes in light items", () => {
  test.each([
    [{ lasts: 5 }, /needs a slot/],
    [{ light: true }, /needs a slot/],
    [{ slot: "x", lasts: "long" }, /lasts: "long"/],
    [{ slot: "x", light: "yes" }, /light: "yes"/],
  ])("%o is refused with a helpful error", (def, message) => {
    const game = makeGame();
    expect(() => game.item("bad", def)).toThrow(message);
  });
});
