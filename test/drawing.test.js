import { describe, test, expect } from "vitest";
import { makeGame, press } from "./helpers.js";

const arena = ["#######", "#@....#", "#.....#", "#######"];

function pictureGame(config = {}) {
  const game = makeGame({ fit: false, viewWidth: 20, viewHeight: 10, ...config });
  game.scene(1, { map: arena, enemies: 0, items: 0 });
  return game;
}

describe("pictures", () => {
  test("tileset: true means the built-in sheet", () => {
    expect(makeGame({ tileset: true }).tileset.image).toBe(new URL("../tiles/tiles.png", import.meta.url).href);
  });

  test("a tile canvas has 16px squares, shown at 2x", () => {
    const game = pictureGame({ tileset: true, animate: 0 });
    game.start();
    const canvas = game.display.getContainer();
    expect(canvas.width).toBe(20 * 16);
    expect(canvas.style.width).toBe(20 * 32 + "px");
  });

  test("your own tileset settings sit on top of the built-in ones", () => {
    const game = pictureGame({ tileset: { image: "../tiles/tiles.png", scale: 3, map: { wall: [11, 17] } }, animate: 0 });
    game.start();
    expect(game.tileset.map.wall).toEqual([11, 17]);
    expect(game.tileset.map.floor.length).toBeGreaterThan(0);
    expect(game.tileset.image).toBe("../tiles/tiles.png");
    expect(game.display.getContainer().style.width).toBe(game.view.width * 48 + "px");
  });

  test("without a tileset the map is letters", () => {
    const game = pictureGame();
    game.start();
    expect(game.tileset).toBeNull();
  });

  test("a bad tile is explained", () => {
    const game = pictureGame({ tileset: true, animate: 0 });
    expect(() => game.spriteKey([1])).toThrow("tile: [3, 9]");
  });
});

describe("the change of scene", () => {
  function stairsGame(config = {}) {
    const game = makeGame({ scenes: 3, transition: 800, ...config });
    game.enemy("x", { hp: 1 });
    game.start();
    return game;
  }

  test("the game is in the new scene as soon as the change starts", () => {
    const game = stairsGame();
    expect(game.transition).toBeNull();
    game.goToScene(2);
    expect(game.transition).not.toBeNull();
    expect(game.currentScene.key).toBe(2);
  });

  test("keys are dropped while it plays, and work again once it's over", () => {
    const game = stairsGame();
    game.goToScene(2);
    const t = game.transition;
    cancelAnimationFrame(t.timer); // driven by hand from here, with made-up times
    const { x, y } = game.player, turn = game.turn;
    press("ArrowRight"); press("ArrowLeft"); press(" ");
    expect([game.player.x, game.player.y]).toEqual([x, y]);
    expect(game.turn).toBe(turn);

    game.stepTransition(1000);
    game.stepTransition(1400); // the old map is gone
    game.stepTransition(1800); // the new one is in
    expect(game.transition).toBeNull();
    press(" ");
    expect(game.turn).toBe(turn + 1);
  });

  test("transition: 0 changes scene at once", () => {
    const game = stairsGame({ transition: 0 });
    game.goToScene(2);
    expect(game.transition).toBeNull();
    expect(game.currentScene.key).toBe(2);
  });
});
