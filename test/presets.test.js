// Every game in examples/ starts without a mistake: the code the editor
// offers has to run as it is, and the Starter Dungeon and the Campfire are
// what a first visitor plays.
import { describe, test, expect } from "vitest";
import { runPreset } from "./helpers.js";
import starterJs from "../examples/starter.js?raw";
import campfireJs from "../examples/campfire.js?raw";
import puzzleRoomJs from "../examples/puzzle-room.js?raw";
import landOfZotJs from "../examples/land-of-zot.js?raw";

describe.each([
  ["the Starter Dungeon", starterJs],
  ["the Campfire", campfireJs],
  ["the Puzzle Room", puzzleRoomJs],
  ["Land of Zot", landOfZotJs],
])("%s", (label, source) => {
  test("starts", () => {
    const game = runPreset(source);
    expect(game.started).toBe(true);
    expect(game.player.alive).toBe(true);
  });
});
