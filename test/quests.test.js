import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage, said } from "./helpers.js";

// A room with the hero in the middle, and every quest giver defined but none placed.
function questGame() {
  const game = makeGame({ scenes: 3, player: { name: "T", hp: 50, attack: 10 } });
  game.enemy("rat", { hp: 1, attack: 0, xp: 1 });
  game.enemy("dragon", { name: "The Dragon", hp: 1, attack: 0, xp: 1, unique: true });
  game.item("potion", { onUse() {} });
  game.item("locket", {});
  game.npc("farmer", { quest: "rats", says: "Lovely weather." });
  game.npc("collector", { quest: "locket" });
  game.npc("old_man", { name: "Old Man", quest: ["slay_dragon", "deeper"], says: ["Careful.", "Still here?"] });
  game.quest("rats", { name: "Rats in the Barley", kill: { rat: 5 }, reward: { gold: 25 }, ask: "Five rats, please.", wait: "Still rats.", thanks: "Rats sorted." });
  game.quest("locket", { bring: "locket", reward: { gold: 10, xp: 5, items: "potion" } });
  game.quest("slay_dragon", { kill: "dragon", report: false, onStart() { game.give("potion"); } });
  game.quest("deeper", { reach: 2, text: "Go down a floor." });
  game.quest("secret", { onDone(p) { p.gold += 1; } });
  const room = `
    #######
    #.....#
    #..@..#
    #.....#
    #######
  `;
  for (const n of [1, 2, 3]) game.scene(n, { map: room, enemies: 0, items: 0, chests: 0 });
  game.start();
  const player = game.player;
  const giver = (name) => game.currentScene.spawn(name, player.x + 1, player.y);
  const kill = (name) => game.currentScene.spawn(name, player.x - 1, player.y).hurt(99, player);
  return { game, player, giver, kill };
}

describe("a kill quest", () => {
  test("talking to the giver starts it, and the giver's usual line waits", () => {
    const { game, giver } = questGame();
    game.talkTo(giver("farmer"));
    const q = game.questNamed("rats");
    expect(q.status).toBe("active");
    expect(game.hasQuest("rats")).toBe(true);
    expect(game.questDone("rats")).toBe(false);
    expect(said(game, "Farmer: Five rats, please.")).toBe(true);
    expect(said(game, "Farmer: Lovely weather.")).toBe(false);
  });

  test("talking again doesn't hand out a second copy", () => {
    const { game, giver } = questGame();
    const farmer = giver("farmer");
    game.talkTo(farmer);
    game.talkTo(farmer);
    expect(game.quests).toHaveLength(1);
    expect(lastMessage(game)).toBe("Farmer: Still rats.");
  });

  test("kills count toward the goal, and the quest is ready when it's met", () => {
    const { game, giver, kill } = questGame();
    game.talkTo(giver("farmer"));
    const q = game.questNamed("rats");
    kill("rat");
    expect(q.counts.rat).toBe(1);
    expect(q.status).toBe("active");
    for (let i = 0; i < 5; i++) kill("rat");
    expect(q.status).toBe("ready");
    expect(q.counts.rat).toBe(5);
  });

  test("handing it in finishes it and pays the reward", () => {
    const { game, player, giver, kill } = questGame();
    const farmer = giver("farmer");
    game.talkTo(farmer);
    for (let i = 0; i < 5; i++) kill("rat");
    const gold = player.gold;
    game.talkTo(farmer);
    expect(game.questDone("rats")).toBe(true);
    expect(player.gold).toBe(gold + 25);
  });

  test("once it's done the giver is back to the usual line, and it can't be taken again", () => {
    const { game, giver, kill } = questGame();
    const farmer = giver("farmer");
    game.talkTo(farmer);
    for (let i = 0; i < 5; i++) kill("rat");
    game.talkTo(farmer);
    game.talkTo(farmer);
    expect(lastMessage(game)).toBe("Farmer: Lovely weather.");
    expect(game.startQuest("rats")).toBeNull();
    expect(game.quests).toHaveLength(1);
  });
});

describe("a bring quest", () => {
  test("is ready as soon as the item is picked up", () => {
    const { game, giver } = questGame();
    game.talkTo(giver("collector"));
    game.give("locket");
    expect(game.questNamed("locket").status).toBe("ready");
  });

  test("handing it in takes the item and gives gold, XP and items", () => {
    const { game, player, giver } = questGame();
    const collector = giver("collector");
    game.talkTo(collector);
    game.give("locket");
    const gold = player.gold, xp = player.xp, potions = player.countOf("potion");
    game.talkTo(collector);
    expect(game.questDone("locket")).toBe(true);
    expect(player.has("locket")).toBe(false);
    expect(player.gold).toBe(gold + 10);
    expect(player.xp).toBe(xp + 5);
    expect(player.countOf("potion")).toBe(potions + 1);
  });
});

describe("a list of quests from one giver", () => {
  test("hands out only the first, and runs its onStart", () => {
    const { game, player, giver } = questGame();
    game.talkTo(giver("old_man"));
    expect(game.hasQuest("slay_dragon")).toBe(true);
    expect(game.questNamed("deeper")).toBeFalsy();
    expect(player.countOf("potion")).toBe(1);
  });

  test("report: false finishes the quest the moment its goal is met", () => {
    const { game, giver, kill } = questGame();
    game.talkTo(giver("old_man"));
    kill("dragon");
    expect(game.questDone("slay_dragon")).toBe(true);
  });

  test("the next visit hands out the next quest", () => {
    const { game, giver, kill } = questGame();
    const old = giver("old_man");
    game.talkTo(old);
    kill("dragon");
    game.talkTo(old);
    expect(game.hasQuest("deeper")).toBe(true);
  });

  test("with the list done, the giver's says lines start from the first", () => {
    const { game, giver, kill } = questGame();
    const old = giver("old_man");
    game.talkTo(old);
    kill("dragon");
    game.talkTo(old);
    game.finishQuest("deeper");
    game.talkTo(old);
    game.talkTo(old);
    expect(game.messages.slice(-2).map((m) => m.text)).toEqual(["Old Man: Careful.", "Old Man: Still here?"]);
  });
});

describe("other ways to finish a quest", () => {
  test("a reach quest is ready on arriving in that scene", () => {
    const { game, giver, kill } = questGame();
    const old = giver("old_man");
    game.talkTo(old);
    kill("dragon");
    game.talkTo(old);
    expect(game.questNamed("deeper").status).toBe("active");
    game.goToScene(2, true);
    expect(game.questNamed("deeper").status).toBe("ready");
  });

  test("finishQuest ends a quest from code, once", () => {
    const { game } = questGame();
    game.startQuest("deeper");
    expect(game.finishQuest("deeper")).toBe(true);
    expect(game.questDone("deeper")).toBe(true);
    expect(game.finishQuest("deeper")).toBe(false);
  });

  test("finishQuest works on a quest the hero never took, and runs onDone", () => {
    const { game, player } = questGame();
    const gold = player.gold;
    expect(game.finishQuest("secret")).toBeTruthy();
    expect(game.questDone("secret")).toBe(true);
    expect(player.gold).toBe(gold + 1);
  });
});

describe("the journal", () => {
  test("j with no quests says so without opening anything", () => {
    const { game } = questGame();
    press("j");
    expect(lastMessage(game)).toBe("You have no quests yet.");
    expect(game.mode).toBe("play");
  });

  test("j lists the quests, and Esc closes it", () => {
    const { game } = questGame();
    game.startQuest("deeper");
    game.finishQuest("secret");
    press("j");
    expect(game.mode).toBe("menu");
    const text = game.el.overlay.textContent;
    expect(text).toContain("Go down a floor.");
    expect(text).toMatch(/Secret/i);
    press("Escape");
    expect(game.mode).toBe("play");
  });
});

describe("mistakes in quests", () => {
  const thrown = (fn) => { try { fn(); } catch (e) { return e.message; } return ""; };

  test("the wrong shapes for kill, reward and reach are explained", () => {
    const game = makeGame();
    expect(thrown(() => game.quest("bad", { kill: ["rat"] }))).toMatch(/kill: "rat"/);
    expect(thrown(() => game.quest("bad", { reward: "gold" }))).toMatch(/reward: \{ gold: 25/);
    expect(thrown(() => game.quest("bad", { reach: true }))).toMatch(/reach: 5/);
  });

  test("a quest to kill something that doesn't exist is caught at start", () => {
    const game = makeGame();
    game.quest("ghosts", { kill: "ghost" });
    expect(() => game.start()).toThrow(/no enemy called "ghost"/);
  });

  test("an NPC with a quest that doesn't exist is caught at start", () => {
    const game = makeGame();
    game.npc("bob", { quest: "nothing" });
    expect(() => game.start()).toThrow(/no quest called "nothing"/);
  });
});

// With pictures, a "!" bubble hovers over an npc with a quest to hand out: the
// quest fx, a part of the page laid over the map (see drawFx in zot.js).
describe("the quest mark", () => {
  const until = (done) => new Promise((resolve) => {
    const t = setInterval(() => { if (done()) { clearInterval(t); resolve(); } }, 5);
  });
  async function pictures(config = {}, map) {
    const game = makeGame({ fit: false, viewWidth: 9, viewHeight: 9, tileset: true, animate: 0, ...config });
    game.enemy("rat", { hp: 1, attack: 0, xp: 1 });
    game.npc("farmer", { quest: "rats", says: "Lovely weather." });
    game.npc("old_man", { name: "Old Man", quest: ["rats", "deeper"] });
    game.npc("nobody", {});
    game.quest("rats", { kill: "rat", thanks: "Rats sorted." });
    game.quest("deeper", { reach: 2 });
    const room = `
      #########
      #.......#
      #.......#
      #.......#
      #...@...#
      #.......#
      #.......#
      #.......#
      #########
    `;
    game.scene(1, { map: map || room, enemies: 0, items: 0, chests: 0 });
    game.start();
    await until(() => game.tilesReady);
    game.drawMap();
    return { game, player: game.player };
  }
  const marks = (game) => Array.from(game.el.fx.querySelectorAll('.zot-sprite[data-fx="quest"]'));

  test("offersQuest names the quest an npc would hand out next, if any", () => {
    const game = makeGame();
    game.npc("old_man", { quest: ["rats", "deeper"] });
    game.npc("nobody", {});
    game.quest("rats", { kill: "rat" });
    game.quest("deeper", { reach: 2 });
    game.enemy("rat", { hp: 1 });
    game.scene(1, { map: ["#####", "#.@.#", "#####"], enemies: 0, items: 0 });
    game.start();
    const man = game.currentScene.spawn("old_man", 1, 1);
    expect(game.offersQuest(man)).toBe("rats");
    expect(game.offersQuest(game.currentScene.spawn("nobody", 3, 1))).toBe(null);
    game.talkTo(man);
    expect(game.offersQuest(man)).toBe(null); // in the middle of it
    game.finishQuest("rats");
    expect(game.offersQuest(man)).toBe("deeper");
    game.finishQuest("deeper");
    expect(game.offersQuest(man)).toBe(null);
  });

  test("hovers over the square above an npc with a quest, in the quest sprite and color", async () => {
    const { game } = await pictures();
    game.currentScene.spawn("farmer", 6, 4);
    game.currentScene.spawn("nobody", 2, 4);
    game.drawMap();
    const [mark] = marks(game);
    expect(marks(game)).toHaveLength(1);
    expect(mark.tagName).toBe("CANVAS");
    expect(mark.style.left).toBe(6 * 32 + "px");
    expect(mark.style.top).toBe(3 * 32 + "px");
    expect(mark.style.width).toBe("32px");
    expect(getComputedStyle(mark).animationName).toBe("zot-hover");
    const layer = game.el.fx;
    expect(layer.style.width).toBe(9 * 32 + "px");
    expect(layer.style.left).toBe("0px"); // flush with the canvas, which has no border
  });

  test("goes away once the quest is taken, and comes back for the next one", async () => {
    const { game } = await pictures();
    const man = game.currentScene.spawn("old_man", 6, 4);
    game.drawMap();
    expect(marks(game)).toHaveLength(1);
    game.talkTo(man);
    game.drawMap();
    expect(marks(game)).toHaveLength(0);
    game.currentScene.spawn("rat", 2, 2).hurt(99, game.player);
    game.talkTo(man); // hands in rats, and the next quest waits for another talk
    game.drawMap();
    expect(marks(game)).toHaveLength(1);
  });

  test("the same bubble stays from one drawing to the next, so the hovering goes on", async () => {
    const { game } = await pictures();
    const farmer = game.currentScene.spawn("farmer", 6, 4);
    game.drawMap();
    const [before] = marks(game);
    farmer.moveTo(5, 4);
    game.drawMap();
    const [after] = marks(game);
    expect(after).toBe(before);
    expect(after.style.left).toBe(5 * 32 + "px");
  });

  test("an npc out of sight has none", async () => {
    const { game } = await pictures();
    game.currentScene.spawn("farmer", 6, 4);
    for (let y = 1; y <= 7; y++) game.currentScene.setTile(5, y, "wall");
    game.drawMap();
    expect(marks(game)).toHaveLength(0);
    game.currentScene.setTile(5, 4, "floor");
    game.drawMap();
    expect(marks(game)).toHaveLength(1);
  });

  test("an npc on the top row of the view has none: its bubble would be off the screen", async () => {
    const tall = ["#########", ...Array.from({ length: 13 }, (_, y) => (y === 6 ? "#...@...#" : "#.......#")), "#########"];
    const { game } = await pictures({ dark: 0 }, tall);
    expect(game.updateCamera().y).toBe(3);
    game.currentScene.spawn("farmer", 6, 3); // on the view's top row
    game.currentScene.spawn("old_man", 2, 4); // one down: the bubble fits
    game.drawMap();
    expect(marks(game)).toHaveLength(1);
    expect(marks(game)[0].style.top).toBe("0px");
  });

  test("questMark: false, or letters instead of pictures, draws none", async () => {
    const { game } = await pictures({ questMark: false });
    game.currentScene.spawn("farmer", 6, 4);
    game.drawMap();
    expect(marks(game)).toHaveLength(0);
    const letters = makeGame({ fit: false, viewWidth: 9, viewHeight: 9 });
    letters.npc("farmer", { quest: "rats" });
    letters.quest("rats", {});
    letters.scene(1, { map: ["#####", "#.@.#", "#####"], enemies: 0, items: 0 });
    letters.start();
    letters.currentScene.spawn("farmer", 1, 1);
    letters.drawMap();
    expect(marks(letters)).toHaveLength(0);
  });
});
