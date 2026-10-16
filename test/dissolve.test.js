import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage } from "./helpers.js";

// A room with a bed in it: walking into the bed asks about a rest, and
// resting takes the map away for a while (see game.dissolve).
function bedroom(config = {}) {
  const game = makeGame({ transition: 800, ...config, player: { hp: 10, mp: 4 } });
  game.tile("bed", {
    walkable: false,
    onBump(player, x, y, game) {
      game.menu("Rest here?", ["Rest", "Not now"], (i) => {
        if (i !== 0) return;
        game.dissolve(2000, () => {
          player.heal(player.maxHp, true);
          player.mp = player.maxMp;
          game.say("You feel well rested.", "good");
        });
        return true;
      });
      return false;
    }
  });
  game.scene(1, { map: ["#####", "#@b.#", "#...#", "#####"], legend: { b: "bed" }, enemies: 0, items: 0 });
  game.start();
  game.player.hp = 3;
  game.player.mp = 0;
  return game;
}

describe("game.dissolve", () => {
  test("the map goes, stays away for the hold, and comes back with `then` run", () => {
    const game = bedroom();
    press("ArrowRight"); // into the bed
    expect(game.mode).toBe("menu");
    press("1");
    const t = game.transition;
    expect(t).not.toBeNull();
    cancelAnimationFrame(t.timer); // driven by hand from here, with made-up times
    expect(game.player.hp).toBe(3); // nothing yet: the hero is asleep
    game.stepTransition(1000);
    game.stepTransition(1400); // the room is gone
    expect(t.phase).toBe("in");
    game.stepTransition(2400); // still blank, keys wait
    expect(game.player.hp).toBe(3);
    press("ArrowDown");
    expect(game.player.y).toBe(1);
    game.stepTransition(3401); // the hold is over: the room comes back
    expect(game.player.hp).toBe(10);
    expect(game.player.mp).toBe(4);
    expect(lastMessage(game)).toBe("You feel well rested.");
    game.stepTransition(3800);
    expect(game.transition).toBeNull();
    press("ArrowDown");
    expect(game.player.y).toBe(2);
  });

  test("with transition: 0 it all happens at once", () => {
    const game = bedroom({ transition: 0 });
    press("ArrowRight");
    press("1");
    expect(game.transition).toBeNull();
    expect(game.player.hp).toBe(10);
    expect(lastMessage(game)).toBe("You feel well rested.");
  });

  test("saying no leaves the hero as they were", () => {
    const game = bedroom();
    press("ArrowRight");
    press("2");
    expect(game.mode).toBe("play");
    expect(game.transition).toBeNull();
    expect(game.player.hp).toBe(3);
  });
});
