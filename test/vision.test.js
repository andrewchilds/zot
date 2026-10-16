import { describe, test, expect } from "vitest";
import { makeGame, press, sees } from "./helpers.js";

// Two rooms joined by a shut door (+). The hero (@) stands beside it; a goblin (g) waits on the far side.
function twoRooms() {
  const game = makeGame();
  game.enemy("goblin", { hp: 4, attack: 1 });
  game.scene(1, {
    map: `
      #########
      #...#...#
      #..@+.g.#
      #...#...#
      #########
    `,
    legend: { g: "goblin" },
    enemies: 0, items: 0,
  });
  game.start();
  const goblin = game.currentScene.enemies[0];
  // Put the hero in the (opened) doorway without a turn passing or the screen being drawn.
  const intoDoorway = () => { game.currentScene.setTile(4, 2, "openDoor"); game.player.moveTo(4, 2); };
  return { game, player: game.player, goblin, door: { x: 4, y: 2 }, intoDoorway };
}

describe("doors", () => {
  test("a door blocks sight from beside it", () => {
    const { game } = twoRooms();
    expect(sees(game, 5, 2)).toBe(false);
  });

  test("the door opens on the first step, and standing in the doorway the hero sees both rooms", () => {
    const { game, player, door } = twoRooms();
    press("ArrowRight");
    expect(game.currentScene.tileAt(door.x, door.y)).toBe("openDoor");
    expect(player.x).toBe(3);
    expect(sees(game, 5, 2)).toBe(true);
    press("ArrowRight");
    expect([player.x, player.y]).toEqual([door.x, door.y]);
    expect(sees(game, 5, 2)).toBe(true);
    expect(sees(game, 3, 2)).toBe(true);
  });
});

describe("enemies noticing the hero", () => {
  test("an enemy the hero hasn't seen on screen yet can't see the hero", () => {
    const { player, goblin, intoDoorway } = twoRooms();
    intoDoorway();
    expect(player.canSee(goblin)).toBe(true);
    expect(goblin.canSee(player)).toBe(false);
  });

  test("once the screen has shown it, it can", () => {
    const { game, player, goblin, intoDoorway } = twoRooms();
    intoDoorway();
    game.draw();
    expect(goblin.canSee(player)).toBe(true);
  });
});
