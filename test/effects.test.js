// Effects (game.effect in zot.js): something that stays with a creature
// for some turns and does something each one. Zot has none of its own.
import { describe, test, expect } from "vitest";
import * as Zot from "../zot.js";
import { makeGame, room, press, lastMessage } from "./helpers.js";

// The hero alone in the middle of a room, letters, nothing in the dark.
function hero(define = () => {}, config = {}) {
  const game = makeGame({ player: { name: "T", hp: 30, attack: 5 }, fit: false, dark: 0, fog: false, variation: 0, lighting: 0, fill: 0, tileset: false, ...config });
  define(game);
  game.scene(1, { map: room(9, 7, 4, 3), enemies: 0, items: 0, chests: 0 });
  game.start();
  return { game, player: game.player };
}
const wait = (n = 1) => { for (let i = 0; i < n; i++) press(" "); };
const colorAt = (game, x, y) => {
  const cam = game.updateCamera();
  return game.lastFrame.get(x - cam.x + "," + (y - cam.y))[3];
};

describe("game.effect", () => {
  test("onStart, then onTurn on each of the creature's turns, then onEnd once the turns run out", () => {
    const calls = [];
    const { game, player } = hero((g) => g.effect("poisoned", {
      turns: 3,
      onStart(who, s) { calls.push(["start", who.isPlayer, s.turns]); },
      onTurn(who, s) { calls.push(["turn", s.turns]); who.hurt(1); },
      onEnd(who) { calls.push(["end"]); },
    }));
    const effect = player.addEffect("poisoned");
    expect(effect).toMatchObject({ name: "poisoned", turns: 3, from: null });
    expect(player.hasEffect("poisoned")).toBe(true);
    wait(5);
    expect(calls).toEqual([["start", true, 3], ["turn", 3], ["turn", 2], ["turn", 1], ["end"]]);
    expect(player.hp).toBe(27);
    expect(player.hasEffect("poisoned")).toBe(false);
    expect(game.turn).toBe(6); // the first turn is the start
  });

  test("turns can be a [least, most] pair, rolled each time it is put on", () => {
    const { player } = hero((g) => g.effect("dazed", { turns: [2, 5] }));
    const rolls = new Set();
    for (let i = 0; i < 40; i++) {
      rolls.add(player.addEffect("dazed").turns);
      player.removeEffect("dazed");
    }
    expect([...rolls].sort()).toEqual([2, 3, 4, 5]);
  });

  test("without turns it lasts until removeEffect, which runs onEnd", () => {
    let ended = 0;
    const { player } = hero((g) => g.effect("cursed", { onEnd() { ended++; } }));
    player.addEffect("cursed");
    wait(20);
    expect(player.hasEffect("cursed")).toBe(true);
    expect(player.removeEffect("cursed")).toBe(true);
    expect(player.removeEffect("cursed")).toBe(false);
    expect(ended).toBe(1);
  });

  test("addEffect takes its own turns, and who did it", () => {
    const { game, player } = hero((g) => {
      g.effect("burning", { turns: 2 });
      g.enemy("imp", { hp: 3 });
    });
    const imp = game.currentScene.spawn("imp", 1, 1);
    expect(player.addEffect("burning", 6).turns).toBe(6);
    player.removeEffect("burning");
    const s = player.addEffect("burning", { turns: 4, from: imp });
    expect(s.turns).toBe(4);
    expect(s.from).toBe(imp);
  });

  test("put on again, it lasts the longer of the two, and onStart doesn't run again", () => {
    let starts = 0;
    const { player } = hero((g) => g.effect("poisoned", { turns: 3, onStart() { starts++; } }));
    player.addEffect("poisoned", 5);
    expect(player.addEffect("poisoned", 2).turns).toBe(5);
    expect(player.addEffect("poisoned", 8).turns).toBe(8);
    expect(player.effects).toHaveLength(1);
    expect(starts).toBe(1);
  });

  test("an enemy that dies of it stops, with the kill going to whoever put it on", () => {
    const { game, player } = hero((g) => {
      g.effect("burning", { turns: 10, onTurn(who, s) { who.hurt(2, s.from); } });
      g.enemy("imp", { hp: 3, ai: "still", xp: 7 });
    });
    const imp = game.currentScene.spawn("imp", 1, 1);
    imp.addEffect("burning", { from: player });
    wait(3);
    expect(imp.dead).toBe(true);
    expect(imp.effects).toEqual([]);
    expect(player.xp).toBe(7);
    expect(game.kills).toBe(1);
  });

  test("the hero can die of it", () => {
    const { game, player } = hero((g) => g.effect("poisoned", { turns: 50, onTurn(who) { who.hurt(10); } }));
    player.addEffect("poisoned");
    wait(5);
    expect(player.dead).toBe(true);
    expect(game.over).toBe(true);
  });

  test("the side panel lists the hero's, with the turns left", () => {
    const { game, player } = hero((g) => {
      g.effect("poisoned", { turns: 3 });
      g.effect("cursed", { name: "Cursed!" });
    });
    const box = game.find("zot-effects-box");
    expect(box.hidden).toBe(true);
    player.addEffect("poisoned");
    player.addEffect("cursed");
    game.draw();
    expect(box.hidden).toBe(false);
    expect(game.find("zot-effects").textContent).toBe("Poisoned 3 turnsCursed!");
    wait(3);
    expect(game.find("zot-effects").textContent).toBe("Cursed!");
    player.removeEffect("cursed");
    game.draw();
    expect(box.hidden).toBe(true);
  });

  test("a hook that throws is reported, and the game goes on", () => {
    const { player } = hero((g) => g.effect("bad", { turns: 2, onTurn() { throw new Error("oops"); } }));
    player.addEffect("bad");
    wait(2);
    expect(player.hasEffect("bad")).toBe(false);
  });
});

describe("how it looks", () => {
  test("color: the creature is drawn in it while it lasts", () => {
    const { game, player } = hero((g) => g.effect("poisoned", { turns: 2, color: "#00ff00" }));
    game.drawMap();
    expect(colorAt(game, player.x, player.y)).not.toBe("#00ff00");
    player.addEffect("poisoned");
    game.drawMap();
    expect(colorAt(game, player.x, player.y)).toBe("#00ff00");
    wait(2);
    expect(colorAt(game, player.x, player.y)).not.toBe("#00ff00");
  });

  test("glow: flickers over the creature and the squares around it, not far ones", () => {
    const { game, player } = hero((g) => g.effect("burning", { glow: "#ff0000" }));
    game.drawMap();
    const before = [colorAt(game, player.x + 1, player.y), colorAt(game, player.x + 3, player.y)];
    player.addEffect("burning");
    game.drawMap();
    expect(colorAt(game, player.x + 1, player.y)).not.toBe(before[0]);
    expect(colorAt(game, player.x + 3, player.y)).toBe(before[1]);
    expect(game.glowing).toBe(true);
    expect(game.animation).toBeTruthy(); // the flicker runs because some effect glows
  });

  test("fx: a named fx or dots of its own play over the creature and follow it", () => {
    const { game, player } = hero((g) => {
      g.effect("burning", { fx: "sparks" });
      g.effect("poisoned", { fx: { color: ["#7cff6b", "#3fd13a"], rate: 4, rise: 10 } });
    });
    player.addEffect("burning");
    player.addEffect("poisoned");
    game.drawMap();
    const box = (name) => game.el.fx.querySelector(`.zot-fx[data-fx="${name}"]`);
    expect(box("sparks")).toBeTruthy();
    const bubbles = box("poisoned");
    expect(bubbles).toBeTruthy();
    const left = bubbles.style.left;
    press("ArrowRight");
    expect(box("poisoned")).toBe(bubbles);
    expect(bubbles.style.left).not.toBe(left);
    player.removeEffect("poisoned");
    game.drawMap();
    expect(box("poisoned")).toBeNull();
    expect(box("sparks")).toBeTruthy();
  });
});

describe("what it adds", () => {
  test("its stats are added to the creature's while it lasts, like worn gear", () => {
    const { game, player } = hero((g) => g.effect("hasty", { turns: 2, speed: 1 }));
    expect(player.speed).toBe(1);
    player.addEffect("hasty");
    expect(player.speed).toBe(2);
    expect(player.getSpeed()).toBe(200);
    player.speed = 3; // sets the base, like gear: still +1 on top
    expect(player.base.speed).toBe(2);
    expect(player.speed).toBe(3);
    wait(2);
    expect(player.hasEffect("hasty")).toBe(false);
    expect(player.speed).toBe(2);
    game.draw();
  });

  test("an enemy's too", () => {
    const { game, player } = hero((g) => {
      g.effect("enraged", { attack: 4 });
      g.enemy("rat", { hp: 5, attack: 1 });
    });
    const rat = game.currentScene.spawn("rat", player.x + 3, player.y);
    rat.addEffect("enraged");
    expect(rat.attack).toBe(5);
  });

  test("the side panel badge says the bonus comes from effects", () => {
    const { game, player } = hero((g) => {
      g.effect("strong", { attack: 2 });
      g.item("sword", { slot: "weapon", attack: 1 });
    });
    player.addEffect("strong");
    game.draw();
    expect(game.find("zot-attack").textContent).toBe("5+2 7");
    expect(game.find("zot-attack").querySelector(".zot-badge").title).toBe("attack +2 from effects");
    player.equip(new Zot.Item(game, game.defs.item.sword));
    game.draw();
    expect(game.find("zot-attack").querySelector(".zot-badge").title).toBe("attack +3 from gear and effects");
  });

  test("light: the hero sees in the dark while it lasts, and it's dark again when it ends", () => {
    const game = makeGame({ player: { sight: 8 }, fit: false });
    game.effect("radiant", { turns: 2, light: true });
    game.scene(1, { map: room(21, 21, 10, 10), enemies: 0, items: 0 });
    game.start();
    const player = game.player;
    expect(game.hasLights()).toBe(true); // the effect counts as a light, so the scene can be dark
    expect(game.dark).toBe(true);
    expect(game.sightRadius()).toBe(3);
    player.addEffect("radiant");
    expect(player.light).toBe(true);
    expect(game.dark).toBe(false);
    expect(game.sightRadius()).toBe(8);
    wait(2);
    expect(player.hasEffect("radiant")).toBe(false);
    expect(game.dark).toBe(true);
    expect(lastMessage(game)).toBe("It's dark. You can only see a few steps around you.");
  });

  test("a light with a number lights that many squares, and the best light wins", () => {
    const game = makeGame({ player: { sight: 8 }, fit: false });
    game.effect("glowing", { light: 4 });
    game.item("candle", { slot: "light", light: 2 });
    game.scene(1, { map: room(21, 21, 10, 10), enemies: 0, items: 0 });
    game.start();
    const player = game.player;
    player.addEffect("glowing");
    expect(player.light).toBe(4);
    expect(game.sightRadius()).toBe(4);
    player.equip(new Zot.Item(game, game.defs.item.candle));
    expect(player.light).toBe(4);
  });
});

describe("mistakes", () => {
  test("an unknown effect", () => {
    const { player } = hero((g) => g.effect("poisoned", {}));
    expect(() => player.addEffect("posioned")).toThrow(/no effect called "posioned". You have: poisoned/);
  });
  test("a misspelt option", () => {
    const game = makeGame();
    expect(() => game.effect("poisoned", { turn: 3 })).toThrow(/the poisoned effect has no option called "turn". Did you mean turns\?/);
  });
  test("turns that aren't a number or a pair", () => {
    const game = makeGame();
    expect(() => game.effect("a", { turns: "3" })).toThrow(/turns is how many turns it lasts/);
    expect(() => game.effect("b", { turns: [5, 2] })).toThrow(/turns is how many turns it lasts/);
    expect(() => game.effect("c", { turns: [2, 5] })).not.toThrow();
  });
  test("an fx that doesn't exist", () => {
    const game = makeGame();
    expect(() => game.effect("a", { fx: "bubbles" })).toThrow(/no fx called "bubbles"/);
    expect(() => game.effect("b", { fx: 3 })).toThrow(/fx is the name of an fx/);
  });
  test("a stat that isn't a number", () => {
    const game = makeGame();
    expect(() => game.effect("a", { speed: "fast" })).toThrow(/speed is what the effect adds to the creature's speed while it lasts, a number like speed: 1/);
  });
  test("a light that isn't true or a number of squares", () => {
    const game = makeGame();
    expect(() => game.effect("a", { light: "yes" })).toThrow(/light is true \(the creature sees normally while it lasts\) or how many squares it lights/);
    expect(() => game.effect("b", { light: 0 })).toThrow(/light is true/);
    expect(() => game.effect("c", { light: 6 })).not.toThrow();
  });
});

describe("an item's onHit", () => {
  // The hero at the west end of a room with a fire sword, a bow and arrows, and knives to throw.
  function armed(wield) {
    const calls = [];
    const onHit = (name) => (who, target, damage, item) => {
      calls.push([name, who.isPlayer, target.kind, damage, item.kind]);
      target.addEffect("burning", { from: who });
    };
    const game = makeGame({ player: { hp: 30, attack: 5, items: [wield, "arrow", "knife"] }, fit: false, dark: 0, fog: false, tileset: false });
    game.effect("burning", { turns: 3 });
    game.item("fire_sword", { slot: "weapon", attack: 2, onHit: onHit("sword") });
    game.item("bow", { slot: "weapon", shoots: "arrow", range: 4 });
    game.item("arrow", { count: 5, onHit: onHit("arrow") });
    game.item("knife", { attack: 1, throw: 4, count: 3, onHit: onHit("knife") });
    game.enemy("ogre", { hp: 50, attack: 0, defense: 0, ai: "still" });
    game.scene(1, { map: room(9, 3, 1, 1), enemies: 0, items: 0, chests: 0 });
    game.start();
    return { game, player: game.player, scene: game.currentScene, calls };
  }

  test("the wielded weapon's runs after a melee hit that does damage, so the Fire Sword sets them burning", () => {
    const { player, scene, calls } = armed("fire_sword");
    const ogre = scene.spawn("ogre", player.x + 1, player.y);
    const dmg = player.hit(ogre);
    expect(calls).toEqual([["sword", true, "ogre", dmg, "fire_sword"]]);
    expect(ogre.effects[0]).toMatchObject({ name: "burning", from: player });
  });

  test("not after a hit that does no damage", () => {
    const { player, scene, calls } = armed("fire_sword");
    const ogre = scene.spawn("ogre", player.x + 1, player.y);
    ogre.def.onHurt = () => 0;
    player.hit(ogre);
    expect(calls).toEqual([]);
    expect(ogre.hasEffect("burning")).toBe(false);
  });

  test("a thrown thing's runs instead of the wielded weapon's", () => {
    const { player, scene, calls } = armed("fire_sword");
    scene.spawn("ogre", player.x + 2, player.y);
    player.throwItem(player.itemNamed("knife"), 1, 0);
    expect(calls.map((c) => c[0])).toEqual(["knife"]);
  });

  test("an arrow's runs when it hits", () => {
    const { player, scene, calls } = armed("bow");
    const ogre = scene.spawn("ogre", player.x + 3, player.y);
    player.shoot(1, 0);
    expect(calls.map((c) => c[0])).toEqual(["arrow"]);
    expect(ogre.hasEffect("burning")).toBe(true);
  });
});
