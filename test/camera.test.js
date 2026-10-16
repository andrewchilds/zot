import { describe, test, expect } from "vitest";
import { makeGame, press, room } from "./helpers.js";

// A 100x50 scene seen through a 30x12 screen.
function bigScene() {
  const game = makeGame({ scenes: 2, fit: false, width: 40, height: 20, viewWidth: 30, viewHeight: 12 });
  game.scene(1, { map: room(100, 50), enemies: 0, items: 0 });
  game.scene(2, { enemies: 0, items: 0 });
  game.start();
  const player = game.player;
  const placeHero = (x, y) => { player.x = x; player.y = y; game.updateVision(); game.draw(); };
  const onScreen = () => {
    const sx = player.x - game.camera.x, sy = player.y - game.camera.y;
    return sx >= 0 && sx < 30 && sy >= 0 && sy < 12;
  };
  return { game, player, placeHero, onScreen };
}

describe("a scene bigger than the screen", () => {
  test("the screen is the view size, not the map size", () => {
    const { game } = bigScene();
    expect(game.currentScene.width).toBe(100);
    expect(game.currentScene.height).toBe(50);
    expect(game.display.getOptions().width).toBe(30);
    expect(game.display.getOptions().height).toBe(12);
  });

  test("the hero in the middle of the map is in the middle of the screen", () => {
    const { game, placeHero } = bigScene();
    placeHero(50, 25);
    expect(game.camera).toMatchObject({ x: 35, y: 19 });
  });

  test("the camera stops at the top-left corner", () => {
    const { game, placeHero, onScreen } = bigScene();
    placeHero(1, 1);
    expect(game.camera).toMatchObject({ x: 0, y: 0 });
    expect(onScreen()).toBe(true);
  });

  test("the camera stops at the bottom-right corner", () => {
    const { game, placeHero, onScreen } = bigScene();
    placeHero(98, 48);
    expect(game.camera).toMatchObject({ x: 70, y: 38 });
    expect(onScreen()).toBe(true);
  });

  test("walking near the edge keeps the hero on screen", () => {
    const { placeHero, onScreen } = bigScene();
    placeHero(97, 47);
    for (let i = 0; i < 60; i++) press(["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"][i % 4]);
    expect(onScreen()).toBe(true);
  });

  test("a scene without its own size uses the game's, and scrolls too", () => {
    const { game, player } = bigScene();
    game.goToScene(2);
    game.draw();
    expect(game.currentScene.width).toBe(40);
    expect(game.currentScene.height).toBe(20);
    expect(game.camera.x).toBe(Math.max(0, Math.min(player.x - 15, 10)));
  });
});

test("a map smaller than the screen never scrolls; it sits in the middle", () => {
  const game = makeGame({ fit: false, width: 20, height: 10, viewWidth: 30, viewHeight: 12 });
  game.scene(1, { enemies: 0, items: 0 });
  game.start();
  game.draw();
  expect(game.camera).toMatchObject({ x: -5, y: -1 });
});
