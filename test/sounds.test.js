import { describe, test, expect, vi } from "vitest";
import { makeGame, press } from "./helpers.js";

function noisy(sounds = true) {
  const game = makeGame({ sounds });
  game.scene(1, { map: ["####", "#@.#", "####"], enemies: 0, items: 0 });
  game.start();
  return game;
}

describe("sound overrides", () => {
  test("a function is called with the game instead of a recipe", () => {
    let heard = null;
    const game = noisy({ boom: (g) => { heard = g; } });
    game.play("boom");
    expect(heard).toBe(game);
  });

  test("false turns a built-in sound off", () => {
    const game = noisy({ walk: false });
    game.play("walk");
    expect(game.sound.last).toBeNull();
  });

  test("custom recipes are added and the built-ins are kept", () => {
    const game = noisy({ custom: { wave: "sine", freq: 440 } });
    game.play("custom");
    expect(game.sound.last).toBe("custom");
    game.play("hit");
    expect(game.sound.last).toBe("hit");
  });

  test("sounds: false makes the game silent", () => {
    const game = noisy(false);
    game.play("hit");
    expect(game.sound.enabled).toBe(false);
    expect(game.sound.last).toBeNull();
  });
});

describe("muting", () => {
  test("m mutes and m again unmutes", () => {
    const game = noisy();
    press("m");
    expect(game.sound.muted).toBe(true);
    press("m");
    expect(game.sound.muted).toBe(false);
  });

  test("nothing plays while muted", () => {
    let calls = 0;
    const game = noisy({ boom: () => { calls++; } });
    press("m");
    game.play("boom");
    expect(calls).toBe(0);
  });

  test("the speaker button toggles mute", () => {
    const game = noisy();
    const button = () => game.el.root.querySelector(".zot-sound");
    button().click();
    expect(game.sound.muted).toBe(true);
    button().click();
    expect(game.sound.muted).toBe(false);
  });
});

// In the editor's frame (index.html) the speaker button is in the shell's top
// bar: the game reports its sound state and the shell's button sends the setting back.
describe("in the editor's frame", () => {
  function shelled(fn, muted = false) {
    window.ZOT_SHELL = true;
    window.ZOT_MUTED = muted;
    const post = vi.spyOn(window.parent, "postMessage").mockImplementation(() => {});
    try {
      fn(post);
    } finally {
      post.mockRestore();
      delete window.ZOT_SHELL;
      delete window.ZOT_MUTED;
    }
  }
  const fromShell = (data) => window.dispatchEvent(new MessageEvent("message", { data, source: window.parent }));

  test("the side panel has no speaker button, and the game tells the shell its sound state", () => {
    shelled((post) => {
      const game = noisy();
      expect(game.el.root.querySelector(".zot-sound")).toBeNull();
      expect(post).toHaveBeenCalledWith({ type: "zot:sound", enabled: true, muted: false }, "*");
    });
  });

  test("a game without sounds says so, so the shell hides its button", () => {
    shelled((post) => {
      noisy(false);
      expect(post).toHaveBeenCalledWith({ type: "zot:sound", enabled: false, muted: false }, "*");
    });
  });

  test("the shell's button sets the sound, and m still works and reports back", () => {
    shelled((post) => {
      const game = noisy();
      fromShell({ type: "zot:sound", on: false });
      expect(game.sound.muted).toBe(true);
      expect(post).toHaveBeenLastCalledWith({ type: "zot:sound", enabled: true, muted: true }, "*");
      fromShell({ type: "zot:sound", on: true });
      expect(game.sound.muted).toBe(false);
      press("m");
      expect(game.sound.muted).toBe(true);
      expect(post).toHaveBeenLastCalledWith({ type: "zot:sound", enabled: true, muted: true }, "*");
      fromShell({ type: "zot:seed", seed: "x" }); // some other message leaves the sound alone
      expect(game.sound.muted).toBe(true);
    });
  });

  test("a Run while the shell's button is off starts the game muted", () => {
    shelled(() => {
      expect(noisy().sound.muted).toBe(true);
    }, true);
  });
});

describe("the browser's sound lock", () => {
  test("nothing is synthesized before the first key press", () => {
    const game = noisy();
    game.play("pickup");
    expect(game.sound.unlocked).toBe(false);
    expect(game.sound.ctx).toBeNull();
  });

  test("the first key press unlocks sound", () => {
    const game = noisy();
    press(" ");
    expect(game.sound.unlocked).toBe(true);
  });
});
