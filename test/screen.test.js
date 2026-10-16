// The screen: an empty <div id="game"> gets the standard screen (SCREEN in
// zot.js); a page's own markup is left alone. See buildDom.
import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";

const quiet = { seed: 1, scenes: 1, fontSize: 8, sounds: false, transition: 0 };

function start(mount) {
  const game = new Zot.Game({ ...quiet, mount });
  game.hero({ name: "Sam", hp: 10 });
  game.start();
  return game;
}

describe("the screen", () => {
  test("an empty div gets the standard screen, filled in", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const game = start(mount);
    expect(mount.classList.contains("zot")).toBe(true);
    expect(mount.querySelector("#zot-map canvas")).not.toBeNull();
    expect(mount.querySelector("#zot-name").textContent).toBe("Sam");
    expect(mount.querySelector("#zot-hp-text").textContent).toBe("HP 10/10");
    expect(mount.querySelector("#zot-inventory")).not.toBeNull();
  });

  test("the standard screen has every part zot.js writes to", () => {
    const parts = ["zot-map", "zot-log", "zot-overlay", "zot-overlay-title", "zot-overlay-text", "zot-overlay-list", "zot-overlay-hint",
      "zot-hp", "zot-hp-fill", "zot-hp-text", "zot-mp", "zot-xp", "zot-name", "zot-level", "zot-attack", "zot-defense", "zot-strength",
      "zot-weight", "zot-gold", "zot-skills", "zot-quests", "zot-gear", "zot-inventory", "zot-help", "zot-sound", "zot-title"];
    const div = document.createElement("div");
    div.innerHTML = Zot.SCREEN;
    for (const id of parts) expect(div.querySelector("#" + id), id).not.toBeNull();
  });

  test("a page's own screen is left as it is", () => {
    const mount = document.createElement("div");
    mount.innerHTML = '<div id="zot-map"></div><div id="zot-log"></div><div id="zot-overlay" hidden></div><p id="mine">kept</p>';
    document.body.append(mount);
    start(mount);
    expect(mount.querySelector("#mine").textContent).toBe("kept");
    expect(mount.querySelector("#zot-inventory")).toBeNull();
    expect(mount.querySelector("#zot-map canvas")).not.toBeNull();
  });

  test("a screen without a map is refused", () => {
    const mount = document.createElement("div");
    mount.innerHTML = "<p>no map here</p>";
    document.body.append(mount);
    expect(() => start(mount)).toThrow(/zot-map/);
  });
});
