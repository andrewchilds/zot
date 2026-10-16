import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage, room } from "./helpers.js";

// The hero (@) with a goblin (g) to the left, knowing no skills yet.
function hero() {
  const game = makeGame({ player: { name: "T", hp: 30, attack: 5 } });
  game.enemy("goblin", { hp: 4, attack: 1, xp: 6 });
  game.skill("zap", { mp: 2, cooldown: 2, target: true, range: 5, onUse(p, e) { e.hurt(10, p); } });
  game.skill("late", { learnAt: 2, onUse() {} });
  game.scene(1, {
    map: `
      #######
      #.....#
      #.g@..#
      #.....#
      #######
    `,
    legend: { g: "goblin" },
    enemies: 0, items: 0,
  });
  game.start();
  const goblin = game.currentScene.enemies[0];
  return { game, player: game.player, goblin };
}

// The hero has learned zap, has MP for it, and just zapped the goblin.
function zapped() {
  const setup = hero();
  setup.player.learn("zap", true);
  setup.player.mp = 10;
  setup.game.updateVision();
  setup.used = setup.player.useSkill("zap");
  return setup;
}

describe("skills", () => {
  test("none are known at the start", () => {
    const { player } = hero();
    expect(player.knows("zap")).toBe(false);
    expect(player.skills).toHaveLength(0);
  });

  test("a targeted skill hits the nearest enemy", () => {
    const { used, goblin } = zapped();
    expect(used).toBe(true);
    expect(goblin.dead).toBe(true);
  });

  test("using a skill spends its MP and starts its cooldown", () => {
    const { player } = zapped();
    expect(player.skills[0].cooldown).toBe(2);
    expect(player.mp).toBe(8);
  });

  test("a skill can't be used during its cooldown", () => {
    const { player } = zapped();
    expect(player.useSkill("zap")).toBe(false);
  });
});

describe("levels", () => {
  test("a level up raises max HP and MP, and leaves current HP and MP alone", () => {
    const { player } = hero();
    const maxHp = player.maxHp, maxMp = player.maxMp, mp = player.mp;
    player.hp = 3;
    player.gainXp(1000);
    expect(player.maxHp).toBeGreaterThan(maxHp);
    expect(player.maxMp).toBeGreaterThan(maxMp);
    expect(player.hp).toBe(3);
    expect(player.mp).toBe(mp);
  });

  test("enough XP raises the level", () => {
    const { player } = hero();
    player.gainXp(100);
    expect(player.level).toBeGreaterThanOrEqual(2);
  });

  test("a skill with learnAt is learned on reaching that level", () => {
    const { player } = hero();
    expect(player.knows("late")).toBe(false);
    player.gainXp(100);
    expect(player.knows("late")).toBe(true);
  });
});

describe("game.after", () => {
  // The hero alone in the middle of a room (the way down is in a corner), with a haste skill: speed 2 for three turns.
  function hasted() {
    const game = makeGame({ player: { name: "T", hp: 30, attack: 5 } });
    game.skill("haste", {
      onUse(p) {
        p.speed = 2;
        game.after(3, () => { p.speed = 1; game.say("You slow down again."); });
      },
    });
    game.scene(1, { map: room(7, 5, 3, 2), enemies: 0, items: 0 });
    game.start();
    game.player.learn("haste", true);
    expect(game.player.useSkill("haste")).toBe(true);
    return { game, player: game.player };
  }

  test("runs its function once that many of the hero's turns have passed", () => {
    const { game, player } = hasted();
    expect(player.speed).toBe(2);
    press("ArrowLeft");
    press("ArrowRight");
    expect(player.speed).toBe(2);
    press("ArrowLeft");
    expect(player.speed).toBe(1);
    expect(lastMessage(game)).toBe("You slow down again.");
    expect(game.timers).toEqual([]);
  });

  test("runs it only once", () => {
    const { game } = hasted();
    for (let i = 0; i < 6; i++) press(i % 2 ? "ArrowRight" : "ArrowLeft");
    expect(game.messages.filter((m) => m.text === "You slow down again.").length).toBe(1);
  });

  test("needs a function", () => {
    const { game } = hasted();
    expect(() => game.after(3)).toThrow("game.after(3, ...) needs a function");
  });
});
