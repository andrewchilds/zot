// The editor's completion of Zot's names (zot-completions.js): the source
// run against short documents with the cursor at |, and the tables checked
// against zot.js so a new method or export cannot go without a line.
import { describe, test, expect } from "vitest";
import { EditorState, EditorView, javascript, indentUnit, CompletionContext } from "../lib/codemirror.js";
import * as Zot from "../zot.js";
import starterJs from "../examples/starter.js?raw";
import campfireJs from "../examples/campfire.js?raw";
import {
  zotCompletions,
  definedNames,
  OPTIONS,
  GAME_CONFIG,
  GAME,
  CREATURE,
  ITEM_MEMBERS,
  SCENE,
  SQUARE,
  ZOT,
  INTERNAL,
  BUILT_IN_TILES,
  BUILT_IN_SOUNDS,
  RARITIES,
  MAP_KINDS,
  FX,
} from "../zot-completions.js";
import { makeGame } from "./helpers.js";

// A game that defines a few things, for the names a file defines
const DEFS = `
import * as Zot from "./zot.js";
const game = new Zot.Game({ scenes: 2 });
game.enemy("rat", { hp: 3 });
game.enemy('bat', { hp: 2 });
game.npc("merchant", { stock: ["potion"] });
game.item("potion", { slot: "pocket" });
game.item("sword", { slot: "weapon" });
game.tile("campfire", { light: 5 });
game.skill("heal", { mp: 5 });
game.scene("mine", { level: 2 });
game.quest("rats", { kill: { rat: 5 } });
`;

// What the source offers at the | in `source`: { from, labels, options }, or null
function offered(source, explicit = false) {
  const pos = source.indexOf("|");
  const doc = source.replace("|", "");
  const state = EditorState.create({ doc, extensions: [javascript()] });
  const result = zotCompletions(new CompletionContext(state, pos, explicit));
  return result && { from: result.from, labels: result.options.map((o) => o.label), options: result.options };
}
const after = (code) => DEFS + code;

describe("after a dot", () => {
  test("game. offers the definitions, the methods and the properties", () => {
    const r = offered(after("game.|"));
    expect(r.from).toBe(after("game.").length);
    expect(r.labels).toEqual(expect.arrayContaining(["enemy", "say", "give", "player", "flags", "start"]));
    expect(r.labels).not.toContain("drawMap");
    expect(r.labels).not.toContain("spawn"); // a scene's, not the game's
  });

  test("a partly typed member keeps what was typed", () => {
    const r = offered(after("game.en|"));
    expect(r.from).toBe(after("game.").length);
    expect(r.labels).toContain("enemy");
    const enemy = r.options.find((o) => o.label === "enemy");
    expect(enemy.detail).toBe("(name, options)");
    expect(enemy.info).toMatch(/enemy/i);
  });

  test("Zot. offers the helpers and classes", () => {
    const r = offered(after("Zot.|"));
    expect(r.labels).toEqual(expect.arrayContaining(["random", "chance", "Game", "TILES"]));
    expect(r.options.find((o) => o.label === "Game").type).toBe("class");
    expect(r.options.find((o) => o.label === "random").detail).toBe("(low, high)");
  });

  test("game.player. is a Creature, player.scene. a Scene, Zot.game. a Game", () => {
    expect(offered(after("game.player.|")).labels).toEqual(expect.arrayContaining(["hp", "heal", "isNextTo"]));
    expect(offered(after("game.player.scene.|")).labels).toEqual(expect.arrayContaining(["tileAt", "creatures"]));
    expect(offered(after("game.currentScene.|")).labels).toContain("randomFreeCell");
    expect(offered(after("Zot.game.|")).labels).toContain("say");
  });

  test("well-known names stand for their class", () => {
    expect(offered(after("player.|")).labels).toContain("heal");
    expect(offered(after("item.|")).labels).toContain("count");
    expect(offered(after("scene.|")).labels).toEqual(expect.arrayContaining(["isWalkable", "spawn", "enemies", "addFx"]));
  });

  test("a hook's parameter has the class its entry gives it, whatever it is called", () => {
    const r = offered(after('game.enemy("slime", { onHurt(slime, foe, damage) { slime.| } });'));
    expect(r.labels).toContain("hp");
    expect(offered(after('game.enemy("slime", { onHurt(slime, foe, damage) { foe.| } });')).labels).toContain("hurt");
    expect(offered(after('game.item("x", { onUse(p, it) { it.| } });')).labels).toContain("equipped");
    expect(offered(after('game.tile("x", { onBump(p, x, y, g) { g.| } });')).labels).toContain("say");
    expect(offered(after('game.tile("x", { onBump(p, x, y, g, sq) { sq.| } });')).labels).toContain("flags");
    expect(offered(after('game.scene("x", { onEnter(s) { s.| } });')).labels).toContain("tilesNamed");
    expect(offered(after('game.item("x", { onUse: (p, it) => { it.| } });')).labels).toContain("equipped");
  });

  test("an unknown name is left to the built-in completion", () => {
    expect(offered(after("foo.|"))).toBeNull();
    expect(offered(after('game.enemy("slime", { onHurt(slime, foe, damage) { damage.| } });'))).toBeNull();
  });
});

describe("a key in an options table", () => {
  test("with nothing typed, only when asked for", () => {
    expect(offered(after('game.enemy("rat", { hp: 3, |'))).toBeNull();
    const r = offered(after('game.enemy("rat", { hp: 3, |'), true);
    expect(r.from).toBe(after('game.enemy("rat", { hp: 3, ').length);
    expect(r.labels).toEqual(expect.arrayContaining(["attack", "drops", "onHurt", "act"]));
  });

  test("leaves out the keys already there", () => {
    const r = offered(after('game.enemy("rat", { hp: 3, |'), true);
    expect(r.labels).not.toContain("hp");
    expect(offered(after('game.enemy("rat", {\n\tattack: 3,\n\t|\n});'), true).labels).not.toContain("attack");
  });

  test("a partly typed key filters the list from where it starts", () => {
    const r = offered(after('game.enemy("rat", { hp: 3, on|'));
    expect(r.from).toBe(after('game.enemy("rat", { hp: 3, ').length);
    expect(r.labels).toEqual(expect.arrayContaining(["onHurt", "onDie", "onSpawn"]));
    expect(r.labels).not.toContain("hp");
  });

  test("each definition gets its own options", () => {
    expect(offered(after("new Zot.Game({ |"), true).labels).toEqual(expect.arrayContaining(["title", "scenes", "onStart", "damage"]));
    expect(offered(after("game.hero({ |"), true).labels).toEqual(expect.arrayContaining(["items", "strength", "onHurt"]));
    expect(offered(after('game.item("x", { |'), true).labels).toEqual(expect.arrayContaining(["slot", "price", "onUse"]));
    expect(offered(after('game.npc("x", { |'), true).labels).toEqual(expect.arrayContaining(["says", "stock", "onTalk"]));
    expect(offered(after('game.skill("x", { |'), true).labels).toEqual(expect.arrayContaining(["mp", "cooldown", "onUse"]));
    expect(offered(after('game.quest("x", { |'), true).labels).toEqual(expect.arrayContaining(["kill", "reward", "thanks"]));
    expect(offered(after('game.scene("x", { |'), true).labels).toEqual(expect.arrayContaining(["map", "exits", "onEnter"]));
    expect(offered(after('game.tile("x", { |'), true).labels).toEqual(expect.arrayContaining(["walkable", "glow", "onBump"]));
    expect(offered(after('game.gearModifier("x", { |'), true).labels).toEqual(expect.arrayContaining(["slot", "weapon", "price"]));
  });

  test("a plain key inserts the key and a colon; a hook inserts a method with its parameters", () => {
    const r = offered(after('game.enemy("rat", { |'), true);
    const hp = r.options.find((o) => o.label === "hp");
    expect(hp.apply).toBe("hp: ");
    expect(hp.detail).toBe("number");
    const hook = r.options.find((o) => o.label === "onHurt");
    expect(hook.detail).toBe("(enemy, attacker, damage)");
    expect(typeof hook.apply).toBe("function");
  });

  test("the hook snippet puts the cursor inside the body, indented", () => {
    const doc = after('game.enemy("rat", {\n\thp: 3,\n\ton\n});');
    const pos = doc.indexOf("\ton\n") + 3;
    const view = new EditorView({ doc, extensions: [javascript(), indentUnit.of("\t")], parent: document.body });
    try {
      const r = zotCompletions(new CompletionContext(view.state, pos, false));
      const hook = r.options.find((o) => o.label === "onHurt");
      hook.apply(view, hook, r.from, pos);
      const text = view.state.doc.toString();
      expect(text).toContain("\tonHurt(enemy, attacker, damage) {\n\t\t\n\t}\n});");
      const cursor = view.state.selection.main.head;
      expect(text.slice(cursor - 2, cursor + 3)).toBe("\t\t\n\t}");
    } finally {
      view.destroy();
    }
  });

  test("the tables inside an option have their own keys", () => {
    expect(offered(after('game.enemy("rat", { level: { |'), true).labels).toEqual(["from", "to"]);
    expect(offered(after("new Zot.Game({ maze: { |"), true).labels).toEqual(["chance", "width", "height", "rooms"]);
    expect(offered(after("new Zot.Game({ levelUp: { xp: 5, |"), true).labels).toEqual(["hp", "attack", "defense", "strength", "mp"]);
    expect(offered(after('game.quest("x", { reward: { |'), true).labels).toEqual(["gold", "xp", "items"]);
    expect(offered(after('game.gearModifier("x", { weapon: { |'), true).labels).toEqual(expect.arrayContaining(["attack", "light"]));
    expect(offered(after('game.scene("x", { exits: { house: { |'), true).labels).toEqual(["to", "at", "tile", "win"]);
    expect(offered(after('game.scene("x", { legend: { L: { |'), true).labels).toEqual(["tile", "key", "exit", "on"]);
    expect(offered(after('game.recipe("x", { |'), true).labels).toEqual(expect.arrayContaining(["combine", "makes", "onMake"]));
  });

  test("drops and prices take the items this file defines", () => {
    const r = offered(after('game.enemy("rat", { drops: { |'), true);
    expect(r.labels).toEqual(["potion", "sword"]);
    expect(r.options[0].apply).toBe("potion: ");
    expect(offered(after('game.npc("x", { prices: { |'), true).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.quest("x", { kill: { |'), true).labels).toEqual(["rat", "bat"]);
  });

  test("an object that is not an options table is left alone", () => {
    expect(offered(after("const x = { |"), true)).toBeNull();
    expect(offered(after("foo({ |"), true)).toBeNull();
    expect(offered(after('game.enemy("rat", { hp: |'), true)).toBeNull();
    expect(offered(after('game.enemy("rat", { exits: { |'), true)).toBeNull();
  });
});

describe("inside a string", () => {
  test("the names this file defines, by what the string stands for", () => {
    const r = offered(after('game.hero({ items: ["|"] });'));
    expect(r.from).toBe(after('game.hero({ items: ["').length);
    expect(r.labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.hero({ items: ["potion", "sw|"] });')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.npc("x", { stock: ["|'))?.labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.scene("x", { npcs: "|" });')).labels).toEqual(["merchant"]);
    expect(offered(after('game.scene("x", { boss: "|" });')).labels).toEqual(["rat", "bat"]);
    expect(offered(after('game.scene("x", { chests: ["potion", ["|"]] });')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.npc("x", { quest: "|" });')).labels).toEqual(["rats"]);
    expect(offered(after('game.hero({ skills: ["|"] });')).labels).toEqual(["heal"]);
    expect(offered(after('new Zot.Game({ start: "|" });')).labels).toEqual(["mine"]);
    expect(offered(after('game.npc("x", { beside: "|" });')).labels).toEqual([...BUILT_IN_TILES, "campfire"]);
  });

  test("the values of exits and a legend", () => {
    expect(offered(after('game.scene(3, { exits: { down: "|" } });')).labels).toEqual(["mine"]);
    expect(offered(after('game.scene(3, { exits: { house: { to: "|" } } });')).labels).toEqual(["mine"]);
    expect(offered(after('game.scene("x", { exits: { house: { tile: "|" } } });')).labels).toContain("portal");
    const legend = offered(after('game.scene("x", { legend: { g: "|" } });')).labels;
    expect(legend).toEqual(expect.arrayContaining(["rat", "merchant", "potion", "campfire", "wall"]));
    expect(offered(after('game.scene("x", { legend: { L: { tile: "|" } } });')).labels).toContain("lockedDoor");
    expect(offered(after('game.scene("x", { legend: { L: { key: "|" } } });')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.scene("x", { legend: { g: { on: "|" } } });')).labels).toEqual(["rat", "bat", "merchant", "potion", "sword"]);
    expect(offered(after('game.scene("x", { ground: "|" });')).labels).toContain("campfire");
  });

  test("a recipe's things and the thing it makes are items", () => {
    expect(offered(after('game.recipe("x", { combine: ["|"] });')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.recipe("x", { combine: { |'), true).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.recipe("x", { makes: "|" });')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.combine(["|"])')).labels).toEqual(["potion", "sword"]);
  });

  test("fixed choices", () => {
    expect(offered(after('game.scene("x", { map: "|" });')).labels).toEqual(MAP_KINDS);
    expect(offered(after('game.enemy("x", { ai: "|" });')).labels).toEqual(["chase", "wander", "still", "flee"]);
    expect(offered(after('game.item("x", { rarity: "|" });')).labels).toEqual(RARITIES);
    expect(offered(after('game.tile("x", { fx: "|" });')).labels).toEqual(FX);
    expect(offered(after('game.item("x", { slot: "|" });')).labels).toEqual(["weapon", "armor", "light", "ring", "pocket"]);
  });

  test("the argument of a method", () => {
    expect(offered(after('scene.spawn("|")')).labels).toEqual(["rat", "bat", "merchant"]);
    expect(offered(after('game.give("|")')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('player.has("|")')).labels).toEqual(["potion", "sword"]);
    expect(offered(after('game.goToScene("|")')).labels).toEqual(["mine"]);
    expect(offered(after('game.play("|")')).labels).toEqual(BUILT_IN_SOUNDS);
    expect(offered(after('scene.addFx(1, 2, "|")')).labels).toEqual(FX);
    expect(offered(after('game.currentScene.setTile(1, 2, "|")')).labels).toContain("campfire");
    expect(offered(after('game.startQuest("|")')).labels).toEqual(["rats"]);
    expect(offered(after('player.learn("|")')).labels).toEqual(["heal"]);
  });

  test("any other string is left alone", () => {
    expect(offered(after('const s = "|";'))).toBeNull();
    expect(offered(after('game.say("|")'))).toBeNull();
    expect(offered(after('game.enemy("|", {})'))).toBeNull();
    expect(offered(after('game.hero({ name: "|" })'))).toBeNull();
  });

  test("definedNames reads every kind of definition", () => {
    const names = definedNames(DEFS);
    expect(names.enemy).toEqual(["rat", "bat"]);
    expect(names.tile).toEqual([...BUILT_IN_TILES, "campfire"]);
    expect(names.placed).toEqual(["rat", "bat", "merchant"]);
    expect(names.slot).toEqual(["weapon", "armor", "light", "ring", "pocket"]);
  });
});

describe("the tables against zot.js", () => {
  const classes = [
    ["Game", Zot.Game, GAME],
    ["Creature", Zot.Creature, CREATURE],
    ["Item", Zot.Item, ITEM_MEMBERS],
    ["Scene", Zot.Scene, SCENE],
  ];
  const methodsOf = (cls) => Object.getOwnPropertyNames(cls.prototype).filter((n) => n !== "constructor");

  test("every export of zot.js has a line", () => {
    expect(Object.keys(ZOT).sort()).toEqual(Object.keys(Zot).sort());
  });

  // zot.js refuses a key that isn't an option (see checkOptions there), so
  // its list of them and the one described here must be the same list
  test.each(Object.keys(OPTIONS))("the %s options are the ones zot.js accepts", (kind) => {
    expect(Object.keys(OPTIONS[kind]).sort()).toEqual([...Zot.OPTIONS[kind]].sort());
  });

  test.each(classes)("every method of %s has a line, or is listed as internal", (name, cls, table) => {
    const methods = methodsOf(cls);
    expect(methods.filter((m) => !(m in table) && !INTERNAL[name].includes(m))).toEqual([]);
    // and the internal list names only methods that exist, none of them in the table
    expect(INTERNAL[name].filter((m) => !methods.includes(m))).toEqual([]);
    expect(INTERNAL[name].filter((m) => m in table)).toEqual([]);
  });

  test("every member in the tables is on a real one", () => {
    const game = makeGame({ player: { items: ["potion"] } });
    game.item("potion", { onUse() {} });
    game.enemy("rat", {});
    game.start();
    const item = new Zot.Item(game, game.lookup("item", "potion"));
    const samples = [
      ["Game", game, GAME],
      ["Creature", game.player, CREATURE],
      ["Item", item, ITEM_MEMBERS],
      ["Scene", game.currentScene, SCENE],
      ["Square", game.currentScene.squareAt(1, 1), SQUARE],
    ];
    for (const [name, thing, table] of samples) {
      expect(Object.keys(table).filter((k) => !(k in thing)), name).toEqual([]);
    }
  });

  test("every game setting has a line", () => {
    const game = makeGame();
    expect(Object.keys(game.config).filter((k) => !(k in GAME_CONFIG))).toEqual([]);
  });

  test("the built-in names match", () => {
    expect(BUILT_IN_TILES).toEqual(Object.keys(Zot.TILES));
    expect(BUILT_IN_SOUNDS).toEqual(Object.keys(Zot.SOUNDS));
    expect(RARITIES).toEqual(Object.keys(Zot.RARITY));
  });

  test("every entry has a description, and every hook its parameters", () => {
    const tables = [...Object.values(OPTIONS), GAME, CREATURE, ITEM_MEMBERS, SCENE, ZOT];
    for (const table of tables) {
      for (const [name, entry] of Object.entries(table)) {
        const e = typeof entry === "string" ? { doc: entry } : entry;
        expect(typeof e.doc, name).toBe("string");
        expect(e.doc.length, name).toBeGreaterThan(3);
        if (/^on[A-Z]|^act$/.test(name) && table !== GAME) expect(Array.isArray(e.params), name).toBe(true);
      }
    }
  });
});

// The Starter Dungeon and the Campfire show the common options of each
// definition, some of them commented out to try. Every one must be a real
// option of its call, and taking the // off any one of them must leave code
// that parses: the line above it ends with a comma.
const CALL = /^(?:const game = new Zot\.(Game)|game\.(\w+))\(.*\{\n([\s\S]*?)\n\}\);/gm;
const OPTION_LINE = /^\t\/\/ (\w+:.*)$/gm;
// Parses the preset as a script, so a stray comma or brace throws here
const parses = (code) => new Function(code.replace(/^import .*$/m, ""));

describe.each([
  ["Starter Dungeon", starterJs, ["Game", "hero", "enemy", "item"]],
  ["The Campfire", campfireJs, ["Game", "hero", "enemy", "enemy", "item", "item", "item", "skill", "skill", "effect", "tile", "npc", "quest", "scene"]],
])("%s's options", (label, source, kinds) => {
  const calls = [...source.matchAll(CALL)];

  test("covers the expected calls", () => {
    expect(calls.map((m) => m[1] || m[2])).toEqual(kinds);
  });

  for (const [, game, method, body] of calls) {
    const kind = game || method;
    test(`lists only real ${kind} options`, () => {
      const listed = [...body.matchAll(/^\t(?:\/\/ )?(\w+)[:(]/gm)].map((m) => m[1]);
      expect(listed.length).toBeGreaterThan(0);
      expect(listed.filter((name) => !(name in OPTIONS[kind]))).toEqual([]);
    });
  }

  const options = [...source.matchAll(OPTION_LINE)];
  test("has options to turn on", () => {
    expect(options.length).toBeGreaterThan(5);
  });

  for (const m of options) {
    test(`still parses with ${m[1].split(":")[0]} turned on`, () => {
      const turnedOn = source.slice(0, m.index) + "\t" + m[1] + source.slice(m.index + m[0].length);
      expect(() => parses(turnedOn)).not.toThrow();
    });
  }
});
