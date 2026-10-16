// The pictures and swatches shown beside tile: [c, r] and color: "..." in
// the editor, and the pickers that rewrite them. See swatches.js.
import { describe, test, expect, afterEach } from "vitest";
import { EditorView, javascript } from "../lib/codemirror.js";
import { swatches, replaceTile, replaceColor, openTilePicker, toHex, SHEET } from "../swatches.js";

const views = [];
afterEach(() => {
  for (const v of views.splice(0)) v.destroy();
  const dialog = document.querySelector("dialog.tile-picker");
  if (dialog && dialog.open) dialog.close();
});

function editor(doc) {
  const view = new EditorView({ doc, extensions: [javascript(), swatches], parent: document.body });
  views.push(view);
  return view;
}
const tiles = (view) => [...view.dom.querySelectorAll(".cm-tile")];
const colors = (view) => [...view.dom.querySelectorAll(".cm-swatch")].map((el) => el.style.backgroundColor);
// Where a widget sits in the text: just after the node it follows
const posOf = (view, el) => view.posAtDOM(el);

describe("the pictures", () => {
  test("follow tile, frames and tileFacing squares, in the thing's color", () => {
    const view = editor(`game.enemy("bat", {
	tile: [26, 8],
	frames: [[26, 8], [31, 5]],
	color: "violet",
});
game.item("arrow", { tile: [41, 5], tileFacing: { north: [4, 22], east: [6, 22] } });
`);
    const els = tiles(view);
    expect(els.map((el) => el.style.maskPosition)).toEqual([
      "-416px -128px",
      "-416px -128px",
      "-496px -80px",
      "-656px -80px",
      "-64px -352px",
      "-96px -352px",
    ]);
    expect(els.map((el) => el.style.backgroundColor)).toEqual(["violet", "violet", "violet", "rgb(201, 201, 217)", "rgb(201, 201, 217)", "rgb(201, 201, 217)"]);
  });

  test("follow the squares of a tileset's map, weights and all", () => {
    const view = editor(`new Zot.Game({ tileset: { map: { wall: [[10, 17, 2], [7, 15]], water: [0, 22], waterFrames: [[0, 22], [1, 22]], arrowFacing: { north: [4, 22] } } } });`);
    expect(tiles(view).length).toBe(6);
  });

  test("leave other arrays alone", () => {
    const view = editor(`const a = [1, 2];\ngame.scene("x", { exits: { down: [1, 2] } });\ngame.enemy("x", { tile: [1, "a"], level: [2, 5] });\ngame.tile("x", { tile: [[3, 7], [4, 7]] });`);
    expect(tiles(view).length).toBe(2); // the two squares the tile picks from
  });

  test("sit right after the closing bracket", () => {
    const view = editor(`game.enemy("rat", { tile: [31, 8] });`);
    expect(posOf(view, tiles(view)[0])).toBe('game.enemy("rat", { tile: [31, 8]'.length);
  });

  test("are rewritten by a pick, keeping a weight", () => {
    const view = editor(`game.enemy("rat", { tile: [31, 8], frames: [[31, 8, 2], [1, 1]] });`);
    const els = tiles(view);
    expect(replaceTile(view, posOf(view, els[0]), 3, 4)).toBe(true);
    expect(view.state.doc.toString()).toBe(`game.enemy("rat", { tile: [3, 4], frames: [[31, 8, 2], [1, 1]] });`);
    expect(replaceTile(view, posOf(view, tiles(view)[1]), 5, 6)).toBe(true);
    expect(view.state.doc.toString()).toBe(`game.enemy("rat", { tile: [3, 4], frames: [[5, 6, 2], [1, 1]] });`);
    expect(replaceTile(view, 3, 1, 1)).toBe(false);
    expect(tiles(view)[0].style.maskPosition).toBe("-48px -64px");
  });

  test("the picker opens on the sheet, framed at the current square, and a click writes the square", () => {
    const view = editor(`game.enemy("rat", { tile: [31, 8], color: "red" });`);
    const el = tiles(view)[0];
    el.click();
    const dialog = document.querySelector("dialog.tile-picker");
    expect(dialog.open).toBe(true);
    const sheet = dialog.querySelector(".tile-sheet");
    expect(dialog.querySelector(".tile-preview").style.backgroundColor).toBe("red");
    expect(dialog.querySelector(".tile-preview").style.maskPosition).toBe("-1488px -384px");
    expect(sheet.style.width).toBe(`${SHEET.columns * SHEET.size * 2}px`);
    const current = dialog.querySelector(".tile-current");
    expect([current.style.left, current.style.top]).toEqual(["992px", "256px"]);
    expect(dialog.querySelector(".tile-text").textContent).toMatch(/column 31, row 8/);
    // a click at the middle of square (2, 3)
    const rect = sheet.getBoundingClientRect();
    sheet.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: rect.left + 2 * 32 + 16, clientY: rect.top + 3 * 32 + 16 }));
    expect(dialog.open).toBe(false);
    expect(view.state.doc.toString()).toBe(`game.enemy("rat", { tile: [2, 3], color: "red" });`);
    expect(openTilePicker(view, 3)).toBe(false);
  });
});

describe("the swatches", () => {
  test("follow color, glow and background strings only", () => {
    const view = editor(`new Zot.Game({ background: "#0e0e16", title: "x" });
game.tile("fire", { color: "#ff9b3d", glow: "orange", symbol: "^" });
const color = "blue";
game.npc("x", { says: "color" });`);
    expect(colors(view)).toEqual(["rgb(14, 14, 22)", "rgb(255, 155, 61)", "orange"]);
  });

  test("are rewritten by a pick, keeping the quotes", () => {
    const view = editor(`game.enemy("rat", { color: 'lime', hp: 3 });`);
    const el = view.dom.querySelector(".cm-swatch");
    expect(replaceColor(view, posOf(view, el), "#00ff00")).toBe(true);
    expect(view.state.doc.toString()).toBe(`game.enemy("rat", { color: '#00ff00', hp: 3 });`);
    // and again, found from inside the string, as the picker does while it is dragged
    expect(replaceColor(view, view.state.doc.toString().indexOf("'") + 1, "#00aa00")).toBe(true);
    expect(view.state.doc.toString()).toBe(`game.enemy("rat", { color: '#00aa00', hp: 3 });`);
    expect(replaceColor(view, 3, "#fff")).toBe(false);
    expect(colors(view)).toEqual(["rgb(0, 170, 0)"]);
  });

  test("any CSS color becomes hex for the picker", () => {
    expect(toHex("lime")).toBe("#00ff00");
    expect(toHex("#abc")).toBe("#aabbcc");
    expect(toHex("rgb(1, 2, 3)")).toBe("#010203");
  });
});
