import { describe, test, expect } from "vitest";
import { makeGame, press, lastMessage, said, overlay } from "./helpers.js";

// The hero (@) alone in a room, carrying a stick, two rags and a knife
// (wielded), with recipes for a torch, a spear and a bandage.
function workshop({ items = ["stick", "rag", "rag", "knife"], recipes = true, ...config } = {}) {
  const game = makeGame({ player: { name: "T", hp: 20, attack: 2, items }, ...config });
  game.item("stick", { weight: 1 });
  game.item("rag", { weight: 0 });
  game.item("knife", { slot: "weapon", attack: 1 });
  game.item("rope", {});
  game.item("torch", { slot: "light", light: true, lasts: 50 });
  game.item("spear", { slot: "weapon", attack: 3, weight: 2 });
  game.item("bandage", { onUse(p) { p.heal(5); } });
  game.item("anvil", { weight: 30 });
  if (recipes) {
    game.recipe("torch", { combine: ["stick", "rag"], say: "You wrap the rag around the stick." });
    game.recipe("spear", { combine: ["stick", "knife", "rope"], onMake(p, item) { p.equip(item); } });
    game.recipe("bandage", { combine: { rag: 2 }, count: 2 });
    game.recipe("anvil", { combine: ["rope", "rope"] });
  }
  game.scene(1, {
    map: `
      #####
      #...#
      #.@.#
      #...#
      #####
    `,
    enemies: 0, items: 0,
  });
  game.start();
  return { game, player: game.player };
}

const labels = (game) => game.menuState.options.map((o) => o.label);
const rowKey = (game, label) => game.menuState.options.find((o) => o.label === label).key;

describe("the Combine screen (c)", () => {
  test("c opens it with the pack on the left and nothing on the bench, and no turn passes", () => {
    const { game } = workshop();
    const turn = game.turn;
    press("c");
    expect(game.mode).toBe("menu");
    expect(game.turn).toBe(turn);
    expect(overlay(game).classList.contains("zot-craft")).toBe(true);
    expect(labels(game)).toEqual(["Stick", "Rag x2", "Knife", "Combine"]);
    expect(game.menuState.options.find((o) => o.label === "Knife").note).toBe("(wielded)");
    expect(game.menuState.options.find((o) => o.label === "Combine").disabled).toBe(true);
    expect(game.menuState.options.find((o) => o.label === "Combine").key).toBe("Enter");
    expect(game.el.root.querySelector("#zot-overlay-text").textContent).toBe("Pick the things to combine.");
  });

  test("a thing's key moves one of it to the bench, and the bench's key moves it back", () => {
    const { game } = workshop();
    press("c");
    expect(rowKey(game, "Rag x2")).toBe("2");
    press("2");
    expect(game.mode).toBe("menu");
    expect(labels(game)).toEqual(["Stick", "Rag", "Knife", "Rag", "Combine"]);
    expect(game.bench).toEqual({ rag: 1 });
    // Every kind keeps its key on both sides: the pack's rag is 2 all along, the bench's rag 5
    expect(game.menuState.options.map((o) => o.key)).toEqual(["1", "2", "3", "5", "Enter"]);
    press("2");
    expect(labels(game)).toEqual(["Stick", "Rag", "Knife", "Rag x2", "Combine"]);
    const left = game.menuState.options[1];
    expect(left.disabled).toBe(true);
    expect(left.note).toBe("(on the bench)");
    press("2"); // all on the bench: nothing to move
    expect(labels(game)).toEqual(["Stick", "Rag", "Knife", "Rag x2", "Combine"]);
    press("5");
    expect(labels(game)).toEqual(["Stick", "Rag", "Knife", "Rag", "Combine"]);
    expect(game.menuState.options[1].disabled).toBeFalsy();
  });

  test("with a recipe's things on the bench, the screen says what they make and Enter makes it in a turn", () => {
    const { game, player } = workshop();
    press("c");
    press(rowKey(game, "Stick"));
    press(rowKey(game, "Rag x2"));
    expect(game.el.root.querySelector("#zot-overlay-text").textContent).toBe("These make a Torch.");
    expect(overlay(game).classList.contains("zot-craft-ready")).toBe(true);
    expect(game.menuState.options.find((o) => o.label === "Combine").disabled).toBe(false);
    const turn = game.turn;
    press("Enter");
    expect(game.mode).toBe("play");
    expect(game.turn).toBe(turn + 1);
    expect(player.has("torch")).toBe(true);
    expect(player.has("stick")).toBe(false);
    expect(player.countOf("rag")).toBe(1);
    expect(said(game, "You wrap the rag around the stick.")).toBe(true);
    expect(game.bench).toEqual({});
  });

  test("things that no recipe takes say so, and Enter does nothing", () => {
    const { game, player } = workshop();
    press("c");
    press(rowKey(game, "Stick"));
    press(rowKey(game, "Knife"));
    expect(game.el.root.querySelector("#zot-overlay-text").textContent).toBe("Those don't go together.");
    expect(overlay(game).classList.contains("zot-craft-ready")).toBe(false);
    press("Enter");
    expect(game.mode).toBe("menu");
    expect(player.has("stick")).toBe(true);
    expect(player.has("knife")).toBe(true);
  });

  test("Esc leaves everything as it was, and c starts over with an empty bench", () => {
    const { game, player } = workshop();
    press("c");
    press(rowKey(game, "Stick"));
    press("Escape");
    expect(game.mode).toBe("play");
    expect(player.has("stick")).toBe(true);
    press("c");
    expect(labels(game)).toEqual(["Stick", "Rag x2", "Knife", "Combine"]);
  });

  test("a worn thing can go into a recipe: it comes off first", () => {
    const { game, player } = workshop({ items: ["stick", "knife", "rope"] });
    expect(player.gear.weapon.kind).toBe("knife");
    press("c");
    press(rowKey(game, "Stick"));
    press(rowKey(game, "Knife"));
    press(rowKey(game, "Rope"));
    press("Enter");
    expect(player.has("knife")).toBe(false);
    expect(player.gear.weapon.kind).toBe("spear"); // the recipe's onMake wields it
    expect(player.attack).toBe(5);
  });

  test("in a game with no recipes, c says so", () => {
    const { game } = workshop({ recipes: false });
    press("c");
    expect(game.mode).toBe("play");
    expect(lastMessage(game)).toBe("You can't think of anything to make.");
  });

  test("with diagonals on, c is a step and b opens the screen", () => {
    const { game, player } = workshop({ diagonals: true });
    press("c");
    expect(game.mode).toBe("play");
    expect([player.x, player.y]).toEqual([3, 3]);
    press("b");
    expect(game.mode).toBe("menu");
    expect(overlay(game).classList.contains("zot-craft")).toBe(true);
  });
});

describe("game.combine and game.recipeFor", () => {
  test("combine takes the things and gives the thing made, in any order, and returns it", () => {
    const { game, player } = workshop();
    const made = game.combine(["rag", "stick"]);
    expect(made.kind).toBe("torch");
    expect(player.has("torch")).toBe(true);
    expect(player.has("stick")).toBe(false);
    expect(player.countOf("rag")).toBe(1);
  });

  test("a table of counts and a count made: two rags make two bandages", () => {
    const { game, player } = workshop();
    expect(game.recipeFor({ rag: 2 }).id).toBe("bandage");
    expect(game.recipeFor(["rag", "rag"]).id).toBe("bandage");
    expect(game.recipeFor(["rag"])).toBeNull();
    expect(game.recipeFor(["rag", "rag", "rag"])).toBeNull();
    expect(game.recipeFor([])).toBeNull();
    const made = game.combine({ rag: 2 });
    expect(made.count).toBe(2);
    expect(player.countOf("bandage")).toBe(2);
    expect(player.has("rag")).toBe(false);
    expect(said(game, "You make 2 Bandages.")).toBe(true);
  });

  test("with a count, removeItem by name takes out of as many piles as it needs", () => {
    const { player } = workshop({ items: ["knife", "knife"] });
    expect(player.items.filter((it) => it.kind === "knife")).toHaveLength(2); // one wielded, one spare
    expect(player.removeItem("knife", 3)).toBe(false);
    expect(player.countOf("knife")).toBe(2);
    expect(player.removeItem("knife", 2)).toBe(true);
    expect(player.has("knife")).toBe(false);
    expect(player.gear.weapon).toBeFalsy();
  });

  test("nothing happens, and it says why, when no recipe matches or something is missing", () => {
    const { game, player } = workshop();
    expect(game.combine(["stick", "knife"])).toBeNull();
    expect(lastMessage(game)).toBe("Those don't go together.");
    expect(game.combine(["stick", "knife", "rope"])).toBeNull();
    expect(lastMessage(game)).toBe("You don't have a Rope.");
    expect(player.has("stick")).toBe(true);
    expect(game.combine([])).toBeNull();
  });

  test("something too heavy to carry falls at the hero's feet", () => {
    const { game, player } = workshop({ items: ["rope", "rope"], carry: () => 3 });
    const made = game.combine(["rope", "rope"]);
    expect(made.kind).toBe("anvil");
    expect(player.has("anvil")).toBe(false);
    expect(game.currentScene.itemAt(player.x, player.y).kind).toBe("anvil");
    expect(lastMessage(game)).toBe("An Anvil falls at your feet.");
  });
});

describe("mistakes", () => {
  test("a recipe needs a list or a table of things to combine", () => {
    const game = makeGame();
    expect(() => game.recipe("x", {})).toThrow(/combine is everything it takes/);
    expect(() => game.recipe("x", { combine: "stick" })).toThrow(/combine: "stick"/);
    expect(() => game.recipe("x", { combine: [] })).toThrow(/combine/);
    expect(() => game.recipe("x", { combine: { rag: 0 } })).toThrow(/combine/);
    expect(() => game.recipe("x", { combine: ["rag"], count: 0 })).toThrow(/count/);
  });

  test("two recipes can't take the same things", () => {
    const game = makeGame();
    game.recipe("torch", { combine: ["stick", "rag"] });
    expect(() => game.recipe("club", { combine: { rag: 1, stick: 1 } })).toThrow(/same things as the torch recipe/);
  });

  test("the things combined and the thing made must be items, checked when the game starts", () => {
    const game = makeGame();
    game.item("stick", {});
    game.recipe("torch", { combine: ["stick", "rag"] });
    expect(() => game.start()).toThrow(/no item called "rag"/);
    const other = makeGame();
    other.item("stick", {});
    other.recipe("torch", { combine: ["stick"] });
    expect(() => other.start()).toThrow(/no item called "torch"/);
  });
});
