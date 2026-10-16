import { test, expect } from "vitest";
import * as Zot from "../zot.js";
import { mountLayout } from "./helpers.js";

// A game whose map box is w x h pixels.
function inBox(w, h, config) {
  const mount = mountLayout();
  const box = mount.querySelector("#zot-map");
  box.style.flex = "none";
  box.style.width = w + "px";
  box.style.height = h + "px";
  const game = new Zot.Game({ mount, seed: 5, scenes: 1, sounds: false, transition: 0, ...config });
  game.start();
  return { game, box };
}

test("letters: the view is as many fontSize squares as fit the map box", () => {
  const { game } = inBox(400, 300, { width: 60, height: 40, fontSize: 16 });
  expect([game.view.width, game.view.height]).toEqual([25, 18]); // 400x300 in 16px squares; the canvas has no border
  expect(game.display.getContainer().width).toBe(25 * 16);
});

test("the hero is in the middle of the fitted view", () => {
  const { game } = inBox(400, 300, { width: 60, height: 40, fontSize: 16 });
  expect(game.camera.x).toBe(Math.max(0, Math.min(game.player.x - 12, 60 - 25)));
});

test("a box wider than the map: the map sits in the middle", () => {
  const { game, box } = inBox(400, 300, { width: 60, height: 40, fontSize: 16 });
  box.style.width = "1000px";
  game.fitMap();
  expect(game.view.width).toBe(62);
  expect(game.display.getContainer().width).toBe(62 * 16);
  expect(game.camera.x).toBe(-1);
});

test("in the editor's frame the refit waits while the code pane slides", () => {
  const { game, box } = inBox(400, 300, { width: 60, height: 40, fontSize: 16 });
  const fromShell = (data) => window.dispatchEvent(new MessageEvent("message", { data, source: window.parent }));
  window.ZOT_SHELL = true;
  try {
    const shelled = inBox(400, 300, { width: 60, height: 40, fontSize: 16 });
    fromShell({ type: "zot:sliding", on: true });
    shelled.box.style.width = "1000px";
    shelled.game.fitMap();
    expect(shelled.game.view.width).toBe(25); // held
    fromShell({ type: "zot:sliding", on: false });
    expect(shelled.game.view.width).toBe(62); // refit once the slide ends
  } finally {
    delete window.ZOT_SHELL;
  }
  box.style.width = "1000px"; // a game on its own page never hears of a slide
  game.fitMap();
  expect(game.view.width).toBe(62);
});

test("fit: false keeps the view size and fontSize", () => {
  const { game } = inBox(400, 300, { width: 20, height: 10, fontSize: 8, fit: false });
  expect(game.view.width).toBe(20);
  expect(game.display.getContainer().width).toBe(20 * 8);
});

test("pictures: 32px squares fit the box", () => {
  const { game } = inBox(400, 300, { width: 20, height: 10, tileset: true });
  expect([game.view.width, game.view.height]).toEqual([12, 9]);
});
