// The shell (index.html) runs the editor's code in a frame whose document is
// a small game page with a bootstrap in place of the game's script tag. See frameDocument.
import { describe, test, expect } from "vitest";
import { EditorState, EditorView } from "../lib/codemirror.js";
import { frameDocument, shareUrl, fileName, editedLabel, errorLine, optionLine, problemLine, setProblemLine, problemMarks, clampWidth } from "../editor.js";
import { decode } from "../share.js";

const parse = (html) => new DOMParser().parseFromString(html, "text/html");

describe("the frame document", () => {
  const code = 'import * as Zot from "./zot.js";\nconst s = "</script><b id=\\"escaped\\">x</b>";\n';
  const html = frameDocument(code, "https://example.test/zot/index.html");
  const doc = parse(html);

  test("has an empty screen div for zot.js to fill, the stylesheet and the title font", () => {
    const game = doc.getElementById("game");
    expect(game.classList.contains("zot")).toBe(true);
    expect(game.children.length).toBe(0);
    const hrefs = [...doc.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("zot.css");
    expect(hrefs.some((h) => h.startsWith("https://fonts.googleapis.com/") && h.includes("Pirata+One"))).toBe(true);
  });

  test("loads rot.js and carries the code in the bootstrap", () => {
    const srcs = [...doc.scripts].map((s) => s.getAttribute("src"));
    expect(srcs).toEqual(["lib/rot.min.js", null]);
    const boot = [...doc.scripts].find((s) => !s.getAttribute("src"));
    expect(boot.textContent).toContain("ZOT_SHELL");
    expect(boot.textContent).toContain("zot:started");
    expect(boot.textContent).toContain(JSON.stringify(code).replace(/<\//g, "<\\/"));
    expect(boot.textContent).toContain('"https://example.test/zot/zot.js"');
  });

  test("carries the seed box's seed, empty when there is none, and whether the bar's speaker is off", () => {
    const seeded = parse(frameDocument(code, "https://example.test/zot/index.html", "k7x2"));
    const muted = parse(frameDocument(code, "https://example.test/zot/index.html", "", true));
    const boot = (d) => [...d.scripts].find((s) => !s.getAttribute("src")).textContent;
    expect(boot(seeded)).toContain('"https://example.test/zot/zot.js", "k7x2", false)');
    expect(boot(doc)).toContain('"https://example.test/zot/zot.js", "", false)');
    expect(boot(muted)).toContain('"https://example.test/zot/zot.js", "", true)');
    expect(boot(muted)).toContain("ZOT_MUTED");
  });

  test("a </script> in the code does not end the bootstrap early", () => {
    expect(doc.scripts.length).toBe(2);
    expect(doc.getElementById("escaped")).toBeNull();
  });

  test("relative links resolve against the shell page", () => {
    expect(doc.querySelector("base").getAttribute("href")).toBe("https://example.test/zot/");
  });
});

describe("the share link", () => {
  test("puts the encoded code in the fragment of this page", async () => {
    const url = await shareUrl("const x = 1;\n", "https://example.test/zot/index.html?seed=k7x2");
    expect(url).toMatch(/^https:\/\/example\.test\/zot\/index\.html\?seed=k7x2#v1\.[A-Za-z0-9_-]+$/);
    expect(await decode(new URL(url).hash)).toBe("const x = 1;\n");
  });
});

describe("the download name", () => {
  test("comes from the save's name", () => {
    expect(fileName("Dark Castle!")).toBe("dark-castle.js");
    expect(fileName("my game.js")).toBe("my-game.js");
    expect(fileName("***")).toBe("game.js");
  });
});

// The frame reports a mistake with the error's stack and what the browser
// said about it; the shell works out which editor line that is.
describe("the edited marker", () => {
  test("is hidden while the code is as loaded", () => {
    expect(editedLabel({ kind: "save", name: "Dark Castle" }, false)).toBe(null);
  });

  test("says a save has unsaved changes", () => {
    const label = editedLabel({ kind: "save", name: "Dark Castle" }, true);
    expect(label.text).toBe("Unsaved changes");
    expect(label.title).toContain('"Dark Castle"');
  });

  test("says a preset or a link is edited", () => {
    expect(editedLabel({ kind: "preset", file: "examples/land-of-zot.js" }, true).text).toBe("Edited");
    expect(editedLabel({ kind: "link" }, true).text).toBe("Edited");
  });
});

describe("the line of a mistake", () => {
  const blob = "blob:https://example.test/0a1b2c3d-4e5f-6789-abcd-ef0123456789";

  test("is the first frame of the stack inside the blob module, Chrome style", () => {
    const stack = `Error: Zot: the goblin enemy has drops: 5\n    at Game.check (https://example.test/zot.js:3170:10)\n    at Game.enemy (https://example.test/zot.js:2889:8)\n    at ${blob}:41:6`;
    expect(errorLine({ stack })).toEqual({ line: 41, column: 6 });
  });

  test("and Firefox or Safari style", () => {
    expect(errorLine({ stack: `onHurt@${blob}:58:9\ncallHook@https://example.test/zot.js:2857:11\n` })).toEqual({ line: 58, column: 9 });
    expect(errorLine({ stack: `@${blob}:12:3` })).toEqual({ line: 12, column: 3 });
  });

  test("a syntax error has no stack, so the event's line counts when the module is blamed", () => {
    expect(errorLine({ stack: "", file: blob, line: 7, column: 15 })).toEqual({ line: 7, column: 15 });
    expect(errorLine({ stack: "", file: "https://example.test/zot.js", line: 7, column: 15 })).toBeNull();
    expect(errorLine({ stack: "", file: blob, line: 0 })).toBeNull();
  });

  test("a stack with no frame in the module gives no line", () => {
    expect(errorLine({ stack: "TypeError: x is undefined\n    at draw (https://example.test/zot.js:4700:3)" })).toBeNull();
    expect(errorLine({})).toBeNull();
  });
});

// The marked line: the line number lives in a state field, and the tint and
// the dot are worked out from it.
describe("the marked line", () => {
  const doc = "one\ntwo\nthree\nfour\nfive\n";
  const marked = (state) => {
    const sets = state.facet(EditorView.decorations).filter((d) => typeof d !== "function" && d.size);
    return sets.map((set) => state.doc.lineAt(set.iter().from).number);
  };
  const start = () => {
    const state = EditorState.create({ doc, extensions: problemMarks });
    return state.update({ effects: setProblemLine.of(4) }).state;
  };

  test("is set by an effect and tints that line", () => {
    const state = start();
    expect(state.field(problemLine)).toBe(4);
    expect(marked(state)).toEqual([4]);
    const cleared = state.update({ effects: setProblemLine.of(null) }).state;
    expect(cleared.field(problemLine)).toBeNull();
    expect(marked(cleared)).toEqual([]);
  });

  test("follows its line as lines are added or taken away above it", () => {
    let state = start().update({ changes: { from: 0, insert: "zero\n" } }).state;
    expect(state.field(problemLine)).toBe(5);
    expect(marked(state)).toEqual([5]);
    state = state.update({ changes: { from: 0, to: 9, insert: "" } }).state; // "zero\none\n" gone
    expect(state.field(problemLine)).toBe(3);
    expect(marked(state)).toEqual([3]);
  });

  test("stays put, and stays tinted, when text changes on a line above", () => {
    const state = start().update({ changes: { from: 4, insert: "two and a half " } }).state;
    expect(state.field(problemLine)).toBe(4);
    expect(marked(state)).toEqual([4]);
  });

  test("stays where it is when a line below changes", () => {
    const state = start().update({ changes: { from: doc.length, insert: "six\n" } }).state;
    expect(state.field(problemLine)).toBe(4);
    expect(marked(state)).toEqual([4]);
  });
});

describe("the line of a misspelt option", () => {
  const doc = EditorState.create({
    doc: 'game.hero({\n\tcolor: "red"\n});\ngame.enemy("goblin", {\n\tsymbol: "g",\n\tcolour: "lime",\n\t"colourful": 1\n});\n',
  }).doc;
  const text = 'Zot: the goblin enemy has no option called "colour". Did you mean color?';

  test("is the first line from the call's that starts with the key", () => {
    expect(optionLine(doc, text, 4)).toEqual({ line: 6, column: 2 });
  });

  test("looks from the top without a line to start at, and needs the whole key", () => {
    expect(optionLine(doc, text)).toEqual({ line: 6, column: 2 });
    expect(optionLine(doc, 'Zot: x has no option called "colourful".', 1)).toEqual({ line: 7, column: 3 });
  });

  test("is nothing for any other message, or a key that isn't there", () => {
    expect(optionLine(doc, "Zot: there is no enemy called \"rat\".", 1)).toBe(null);
    expect(optionLine(doc, text, 7)).toBe(null);
  });
});

// The handle on the code pane's edge sets its width; see editor.css's clamp
describe("the code pane's width", () => {
  test("keeps the code at least 240px and the game at least 320px", () => {
    expect(clampWidth(500, 1200)).toBe(500);
    expect(clampWidth(100, 1200)).toBe(240);
    expect(clampWidth(1100, 1200)).toBe(880);
    expect(clampWidth(500.4, 1200)).toBe(500);
  });
});
