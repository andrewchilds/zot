import { describe, test, expect, vi, afterEach } from "vitest";
import { makeGame, press, room } from "./helpers.js";

const down = (key, opts = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key, ...opts }));
const up = (key) => window.dispatchEvent(new KeyboardEvent("keyup", { key }));

// The hero in an open 12x10 room, at 5, 5 unless said otherwise.
function inRoom(config = {}, x = 5, y = 5) {
  const game = makeGame(config);
  game.scene(1, { map: room(12, 10, x, y), enemies: 0, items: 0 });
  game.start();
  return { game, p: game.player };
}

afterEach(() => {
  up("ArrowUp");
  up("ArrowRight");
  vi.useRealTimers();
});

describe("holding a direction key", () => {
  test("steps at once, then walks on after a pause, a step every so often", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: [200, 120] });
    down("ArrowRight");
    expect(p.x).toBe(6);
    vi.advanceTimersByTime(199);
    expect(p.x).toBe(6);
    vi.advanceTimersByTime(1);
    expect(p.x).toBe(7);
    vi.advanceTimersByTime(240);
    expect(p.x).toBe(9);
    up("ArrowRight");
    vi.advanceTimersByTime(1000);
    expect(p.x).toBe(9);
  });

  test("the keyboard's own repeats are ignored", () => {
    const { p } = inRoom();
    down("ArrowRight");
    down("ArrowRight", { repeat: true });
    down("ArrowRight", { repeat: true });
    expect(p.x).toBe(6);
  });

  test("into a wall the walk stops", () => {
    vi.useFakeTimers();
    const { game, p } = inRoom({}, 10, 5);
    const turn = game.turn;
    down("ArrowRight");
    vi.advanceTimersByTime(1000);
    expect(p.x).toBe(10);
    expect(game.turn).toBe(turn);
  });

  test("keyRepeat: false steps once a press", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: false });
    down("ArrowRight");
    vi.advanceTimersByTime(1000);
    expect(p.x).toBe(6);
  });
});

describe("two keys at once", () => {
  test("without diagonals, up and right zigzag, the newer key's way first", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: [200, 100] });
    down("ArrowUp");
    expect([p.x, p.y]).toEqual([5, 4]);
    down("ArrowRight");
    expect([p.x, p.y]).toEqual([6, 4]);
    vi.advanceTimersByTime(200);
    expect([p.x, p.y]).toEqual([6, 3]);
    vi.advanceTimersByTime(100);
    expect([p.x, p.y]).toEqual([7, 3]);
  });

  test("without diagonals, a step blocked one way slides along the wall the other", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: [100, 100] }, 5, 1);
    down("ArrowUp"); // the wall is there
    down("ArrowRight");
    expect([p.x, p.y]).toEqual([6, 1]);
    vi.advanceTimersByTime(100);
    expect([p.x, p.y]).toEqual([7, 1]);
  });

  test("a key that only slides into the step already on its way keeps the rhythm", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: [200, 120] }, 2, 1);
    down("ArrowRight");
    vi.advanceTimersByTime(200 + 120 + 10); // walking along the top wall, the next step 110ms off
    expect(p.x).toBe(5);
    down("ArrowUp"); // up is the wall: no step of its own
    expect(p.x).toBe(5);
    vi.advanceTimersByTime(109);
    expect(p.x).toBe(5);
    vi.advanceTimersByTime(1);
    expect(p.x).toBe(6);
    up("ArrowUp");
    down("ArrowUp");
    expect(p.x).toBe(6); // tapping it doesn't hurry the walk
    vi.advanceTimersByTime(120);
    expect(p.x).toBe(7);
  });

  test("a key that turns the walk steps at once", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ keyRepeat: [200, 120] });
    down("ArrowRight");
    vi.advanceTimersByTime(200 + 120 + 10);
    expect([p.x, p.y]).toEqual([8, 5]);
    down("ArrowUp");
    expect([p.x, p.y]).toEqual([8, 4]);
  });

  test("with diagonals, up and right pressed together take one diagonal step", () => {
    vi.useFakeTimers();
    const { p } = inRoom({ diagonals: true });
    down("ArrowUp");
    expect([p.x, p.y]).toEqual([5, 5]); // waiting a moment for a second key
    vi.advanceTimersByTime(20);
    down("ArrowRight");
    expect([p.x, p.y]).toEqual([6, 4]);
  });

  test("with diagonals, a quick tap steps when it's let go", () => {
    const { p } = inRoom({ diagonals: true });
    press("ArrowUp");
    expect([p.x, p.y]).toEqual([5, 4]);
  });
});
