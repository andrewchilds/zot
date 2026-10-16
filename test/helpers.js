// The standard screen (SCREEN in zot.js), so the tests fill in the same boxes a real game does.
import * as Zot from "../zot.js";

// A fresh copy of the screen on the page, already filled in so a test can
// look at its parts before the game starts.
export function mountLayout() {
  const el = document.createElement("div");
  el.className = "zot zot-test-mount";
  el.innerHTML = Zot.SCREEN;
  document.body.append(el);
  return el;
}

// A game on its own screen, quiet and without scene transitions. Define things, then call start().
export function makeGame({ player, ...config } = {}) {
  const game = new Zot.Game({ mount: mountLayout(), seed: 1, scenes: 1, fontSize: 8, sounds: false, transition: 0, ...config });
  if (player) game.hero(player);
  return game;
}

// A game from examples/ run as a script with a Zot whose games are quiet and
// on their own screen, like makeGame's; the game's own settings still win.
export function runPreset(source) {
  const games = [];
  class Game extends Zot.Game {
    constructor(config = {}) {
      super({ mount: mountLayout(), seed: 1, sounds: false, transition: 0, ...config });
      games.push(this);
    }
  }
  const run = new Function("Zot", source.replace(/^import .*$/m, ""));
  run({ ...Zot, Game });
  return games[0];
}

// An open room walled in, with the hero (@) at x, y. Pass it as a scene's map.
export function room(width, height, x = 1, y = 1) {
  return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) =>
    col === 0 || row === 0 || col === width - 1 || row === height - 1 ? "#" : col === x && row === y ? "@" : ".").join(""));
}

// A tap: down and straight back up, so a direction key takes one step and doesn't walk on.
export function press(key) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  window.dispatchEvent(new KeyboardEvent("keyup", { key }));
}

export const sees = (game, x, y) => game.visible.has(x + "," + y);
export const lastMessage = (game) => game.messages[game.messages.length - 1].text;
export const said = (game, text) => game.messages.some((m) => m.text === text);
export const overlay = (game) => game.el.overlay;
