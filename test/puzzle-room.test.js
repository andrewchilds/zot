// The Puzzle Room (examples/puzzle-room.js): every station in the room
// does what its comment says, tried in one walk round it with the hero
// moved through the game's own API (moveTo picks things up and steps on
// things, moveBy walks into them, a space key waits a turn).
import { describe, test, expect } from "vitest";
import { runPreset, press, said } from "./helpers.js";
import source from "../examples/puzzle-room.js?raw";

const square = (game, name) => {
  const s = game.currentScene.tilesNamed(name)[0];
  expect(s, `a ${name} square`).toBeTruthy();
  return s;
};
const itemSquare = (game, kind) => {
  const it = game.currentScene.items.find((i) => i.kind === kind);
  expect(it, `the ${kind} lying about`).toBeTruthy();
  return { x: it.x, y: it.y };
};
const carried = (game, kind) => game.player.items.find((i) => i.kind === kind);

// Can the hero walk from where they are to (x, y)?
function canReach(game, x, y) {
  const scene = game.currentScene, p = game.player;
  const seen = new Set([p.x + "," + p.y]), queue = [[p.x, p.y]];
  while (queue.length) {
    const [cx, cy] = queue.pop();
    if (cx === x && cy === y) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = nx + "," + ny;
      if (seen.has(k) || !scene.inBounds(nx, ny) || !scene.isWalkable(nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return false;
}

// Walk onto a square (picking up what lies there, or setting off what's there).
function walkTo(game, { x, y }) {
  expect(canReach(game, x, y), `a way to ${x},${y}`).toBe(true);
  expect(game.player.moveTo(x, y)).toBe(true);
}
// Stand next to a solid square (not on something that does anything) and walk into it.
function bump(game, { x, y }) {
  const scene = game.currentScene, p = game.player;
  const beside = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .find((s) => (scene.isFree(s.x, s.y) || (s.x === p.x && s.y === p.y)) && !scene.itemAt(s.x, s.y) && !scene.tileInfo(s.x, s.y).onStep && canReach(game, s.x, s.y));
  expect(beside, `somewhere to stand beside ${x},${y}`).toBeTruthy();
  game.player.moveTo(beside.x, beside.y);
  return game.player.moveBy(x - beside.x, y - beside.y);
}
const saidAbout = (game, text) => game.messages.some((m) => m.text.includes(text));
const wait = (game, turns) => { for (let i = 0; i < turns; i++) press(" "); };

describe("the Puzzle Room", () => {
  test("every station works, and the gate wins", () => {
    const game = runPreset(source);
    const p = game.player;
    expect(game.currentScene.key).toBe("room");

    // The sign and the note: read, no turn passes, the note is kept
    let turn = game.turn;
    bump(game, square(game, "sign"));
    expect(saidAbout(game, "Walk into things")).toBe(true);
    expect(game.turn).toBe(turn);
    walkTo(game, itemSquare(game, "note"));
    turn = game.turn;
    p.use(carried(game, "note"));
    expect(saidAbout(game, "UP, DOWN, UP")).toBe(true);
    expect(p.has("note")).toBe(true);
    expect(game.turn).toBe(turn);

    // The drawer: a potion the first time, nothing after
    bump(game, square(game, "drawer"));
    expect(p.has("potion")).toBe(true);
    bump(game, square(game, "drawer"));
    expect(p.countOf("potion")).toBe(1);

    // The bookshelves: the one picked when the hero came in holds a potion, once
    const shelves = game.currentScene.tilesNamed("bookshelf");
    const full = shelves.filter((s) => s.flags.holds);
    expect(full).toHaveLength(1);
    bump(game, shelves.find((s) => !s.flags.holds));
    expect(p.countOf("potion")).toBe(1);
    bump(game, full[0]);
    expect(p.countOf("potion")).toBe(2);
    bump(game, full[0]);
    expect(p.countOf("potion")).toBe(2);

    // The lever: both lanterns lit, then out, then lit again
    expect(game.currentScene.tilesNamed("lantern").length).toBe(2);
    bump(game, square(game, "lever"));
    expect(game.currentScene.tilesNamed("lantern")).toEqual([]);
    expect(game.currentScene.tilesNamed("lanternLit").length).toBe(2);
    expect(game.lit.size).toBeGreaterThan(0);
    bump(game, square(game, "leverOn"));
    expect(game.currentScene.tilesNamed("lanternLit")).toEqual([]);
    bump(game, square(game, "lever"));
    expect(game.currentScene.tilesNamed("lanternLit").length).toBe(2);

    // The plate: the bookcase in front of it goes, and the gear behind it can be had
    const gear = itemSquare(game, "gear");
    expect(canReach(game, gear.x, gear.y)).toBe(false);
    walkTo(game, square(game, "plate"));
    expect(game.currentScene.tileAt(p.x, p.y)).toBe("platePushed");
    expect(game.currentScene.tilesNamed("bookcase")).toEqual([]);
    walkTo(game, gear);
    expect(p.has("gear")).toBe(true);

    // The switches: up down up opens the vault, anything else shuts it
    const vault = square(game, "vaultDoor");
    const gold = itemSquare(game, "gold");
    bump(game, vault);
    expect(saidAbout(game, "A locked vault door.")).toBe(true);
    expect(canReach(game, gold.x, gold.y)).toBe(false);
    const [first, second, third] = game.currentScene.tilesNamed("switchUp");
    bump(game, second); // up down up
    expect(game.currentScene.tileAt(vault.x, vault.y)).toBe("vaultOpen");
    expect(saidAbout(game, "slowly swings open")).toBe(true);
    bump(game, third); // up down down: shut again
    expect(game.currentScene.tileAt(vault.x, vault.y)).toBe("vaultDoor");
    expect(saidAbout(game, "swings shut and locks")).toBe(true);
    bump(game, first); // down down down
    expect(game.currentScene.tileAt(vault.x, vault.y)).toBe("vaultDoor");
    bump(game, first);
    bump(game, third); // up down up
    expect(game.currentScene.tileAt(vault.x, vault.y)).toBe("vaultOpen");
    const before = p.gold;
    walkTo(game, gold);
    expect(p.gold).toBe(before + 25);
    expect(p.has("gold")).toBe(false);

    // The chest and the locked door: the rod is behind it, the key inside the chest
    const rod = itemSquare(game, "iron_rod");
    const locked = square(game, "lockedDoor");
    expect(canReach(game, rod.x, rod.y)).toBe(false);
    bump(game, locked);
    expect(saidAbout(game, "You need the Iron Key")).toBe(true);
    bump(game, square(game, "chest"));
    expect(p.has("iron_key")).toBe(true);
    bump(game, locked);
    expect(game.currentScene.tileAt(locked.x, locked.y)).toBe("openDoor");
    expect(p.has("iron_key")).toBe(false);
    walkTo(game, rod);
    expect(p.has("iron_rod")).toBe(true);

    // The secret door: a wall until walked into, with a potion behind it
    const potion = itemSquare(game, "potion");
    expect(canReach(game, potion.x, potion.y)).toBe(false);
    const secret = square(game, "secretDoor");
    expect(game.currentScene.isWalkable(secret.x, secret.y)).toBe(false);
    bump(game, secret);
    expect(game.currentScene.tileAt(secret.x, secret.y)).toBe("openDoor");
    walkTo(game, potion);
    expect(p.countOf("potion")).toBe(3); // the drawer's, the shelf's and this one

    // The button and the grate: open for five turns, then shut, unless the hero is under it
    const grate = square(game, "grate");
    const inside = { x: grate.x, y: grate.y - 1 };
    expect(canReach(game, inside.x, inside.y)).toBe(false);
    bump(game, square(game, "button"));
    expect(game.currentScene.tileAt(grate.x, grate.y)).toBe("grateOpen");
    wait(game, 4);
    expect(game.currentScene.tileAt(grate.x, grate.y)).toBe("grateOpen");
    wait(game, 1);
    expect(game.currentScene.tileAt(grate.x, grate.y)).toBe("grate");
    expect(saidAbout(game, "drops shut")).toBe(true);
    bump(game, square(game, "button"));
    walkTo(game, inside);
    walkTo(game, grate);
    wait(game, 8);
    expect(game.currentScene.tileAt(grate.x, grate.y)).toBe("grateOpen"); // held for the hero under it
    walkTo(game, { x: grate.x, y: grate.y + 1 });
    wait(game, 1);
    expect(game.currentScene.tileAt(grate.x, grate.y)).toBe("grate");

    // The spikes hurt
    const hp = p.hp;
    walkTo(game, square(game, "spikes"));
    expect(p.hp).toBe(hp - 2);
    expect(p.alive).toBe(true);

    // The rings: step on one, stand beside the other
    const [left, right] = game.currentScene.tilesNamed("ring");
    walkTo(game, left);
    expect(p.x).toBe(right.x - 1);
    expect(p.y).toBe(right.y);
    walkTo(game, right);
    expect(p.x).toBe(left.x + 1);
    expect(p.y).toBe(left.y);

    // The crank, the winch and the gate
    const winch = square(game, "winch");
    const gate = square(game, "gate");
    bump(game, winch);
    expect(saidAbout(game, "square hole")).toBe(true);
    expect(game.currentScene.tileAt(gate.x, gate.y)).toBe("gate");
    expect(game.combine(["iron_rod", "gear"])).toBeTruthy();
    expect(p.has("crank")).toBe(true);
    expect(p.has("gear")).toBe(false);
    bump(game, winch);
    expect(game.currentScene.tileAt(gate.x, gate.y)).toBe("gateOpen");
    expect(game.over).toBe(false);
    walkTo(game, gate);
    expect(game.over).toBe(true);
    expect(said(game, "You walk out through the gate. That's everything in the room.")).toBe(true);
  }, 15000);

  test("has no fighting and nothing random in it", () => {
    const game = runPreset(source);
    expect(Object.keys(game.defs.enemy)).toEqual([]);
    expect(game.currentScene.creatures.filter((c) => !c.isPlayer)).toEqual([]);
    expect(game.currentScene.items.map((i) => i.kind).sort()).toEqual(["gear", "gold", "gold", "iron_rod", "note", "potion"]);
  });
});
