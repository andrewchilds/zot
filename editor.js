// editor.js — the shell around the game (index.html): the top bar, the code
// editor, and the frame the game runs in.
//
// Run builds a small game page (an empty screen div, rot.js, and a bootstrap
// that runs the editor's code) and loads it into the frame. Every Run is a
// fresh document, so nothing from the last game has to be torn down, and
// keys pressed in the editor never reach the game.
//
// The code in the editor comes from one of three places, which the dropdown
// shows: a preset (a file of this site), a game saved in this browser, or a
// share link (see share.js). Code from a link waits for a click before it
// runs, and the frame has an opaque origin so that code can't read the saves.
//
// The editor knows Zot's names (see zot-completions.js), shows the picture
// and the color beside the code that names them (see swatches.js), and when
// the code goes wrong inside the frame, zot.js tells this page, which shows
// the message in a bar over the editor and marks the line.

import {
	EditorView,
	basicSetup,
	keymap,
	indentWithTab,
	javascript,
	javascriptLanguage,
	oneDark,
	indentUnit,
	StateField,
	StateEffect,
	RangeSet,
	Decoration,
	GutterMarker,
	lineNumberMarkers
} from "./lib/codemirror.js";
import { encode, decode } from "./share.js";
import { zotCompletions } from "./zot-completions.js";
import { swatches } from "./swatches.js";

// The games the dropdown offers: the file to fetch, its name, and the
// shorter label the dropdown shows. A first visit opens the Starter, so the
// game being played is the code Edit shows.
export const PRESETS = {
	"examples/starter.js": { name: "Starter Dungeon", label: "Starter" },
	"examples/campfire.js": { name: "The Campfire", label: "Campfire" },
	"examples/puzzle-room.js": { name: "The Puzzle Room", label: "Puzzle Room" },
	"examples/land-of-zot.js": { name: "Land of Zot", label: "Land of Zot" }
};
export const DEFAULT_PRESET = "examples/starter.js";

// The editor text is saved here before every Run, so a hang costs nothing,
// and restored on the next visit. `ran` turns true once the game's module has
// run, or when the page is left normally; a draft without it was in a tab
// that had to be killed, so it is not run again on its own.
export const DRAFT_KEY = "zot:draft";

// A JSON list of { name, code, time }: the games saved in this browser.
export const SAVES_KEY = "zot:saves";

// The width of the code pane in pixels once the handle on its edge has been
// dragged, kept for the next visit; null (or nothing) means the default.
export const WIDTH_KEY = "zot:editor-width";

// The code keeps at least 240px and the game at least 320px, as editor.css's
// clamp says: a width to keep is held to that, given the panes' whole width.
export const clampWidth = (width, total) => Math.round(Math.max(240, Math.min(width, total - 320)));

// Past this many characters a link is fine for a browser but may be cut
// short by chat apps, mail clients and QR codes.
const LONG_LINK = 8000;

// Runs inside the frame, after the screen div and rot.js have loaded. `code`
// is the editor text, and `zotUrl` the absolute address of zot.js: the code
// becomes a blob URL module, so its import of zot.js must not be relative.
// A blob module keeps error line numbers equal to editor line numbers.
// `seed` is the seed box's, or "" for a new dungeon each time, and `muted`
// is true while the bar's speaker button is off.
function bootstrap(code, zotUrl, seed, muted) {
	window.ZOT_SHELL = true; // zot.js reads this to word its error hint
	window.ZOT_SEED = seed; // and this where a page would have ?seed=
	window.ZOT_MUTED = muted; // and this to start the game muted
	var absolute = code.replace(/(["'])(?:\.\.?\/)+zot\.js\1/g, JSON.stringify(zotUrl));
	var script = document.createElement("script");
	script.type = "module";
	script.src = URL.createObjectURL(new Blob([absolute], { type: "text/javascript" }));
	// Once the module has run (or failed to load) the run is over, hang or no
	// hang: the shell marks the draft as started. See markStarted there.
	var started = function () {
		parent.postMessage({ type: "zot:started" }, "*");
	};
	script.addEventListener("load", started);
	script.addEventListener("error", started);
	document.body.appendChild(script);
	// Cmd/Ctrl+Enter runs the code from inside the game too
	window.addEventListener(
		"keydown",
		function (e) {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				e.stopImmediatePropagation();
				parent.postMessage({ type: "zot:run" }, "*");
			}
		},
		true
	);
}

// The document the frame runs: a game's page (an empty screen div that zot.js
// fills with the standard screen, zot.css and rot.js), with the bootstrap
// carrying `code`, `seed` and `muted` in place of the game's script tag.
// Relative links (zot.css, rot.js, the tiles) resolve against `base`, the shell page's URL.
export function frameDocument(code, base = location.href, seed = "", muted = false) {
	const dir = new URL(".", base).href;
	const zotUrl = new URL("zot.js", dir).href;
	// "</" inside the code would end the script tag early; JSON allows "<\/"
	const args = [code, zotUrl, seed, !!muted]
		.map((v) => JSON.stringify(v))
		.join(", ")
		.replace(/<\//g, "<\\/");
	return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base href="${dir}">
  <title>Zot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Pirata+One&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="zot.css">
</head>
<body>
  <div id="game" class="zot"></div>
  <script src="lib/rot.min.js"></script>
  <script>(${bootstrap.toString()})(${args});</script>
</body>
</html>
`;
}

// The share link for `code`, on this page.
export async function shareUrl(code, base = location.href) {
	const url = new URL(base);
	url.hash = await encode(code);
	return url.href;
}

// A file name for `name`: "Dark Castle!" becomes "dark-castle.js".
export function fileName(name) {
	const slug = String(name)
		.toLowerCase()
		.replace(/\.js$/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return (slug || "game") + ".js";
}

// The editor line a mistake reported by the frame (a zot:error message, see
// tellShell in zot.js) points at, with its column, or null. The code runs as
// a blob URL module, so its line numbers are the editor's: the first frame of
// the stack in that module is where the code went wrong, whether the error
// was thrown there or inside zot.js on its behalf. A syntax error has no
// stack; then the event's own line counts, if the browser blames the module.
export function errorLine(msg) {
	const m = /(?:^|[\s(@])blob:[^\s()]*?:(\d+):(\d+)(?=[\s)]|$)/m.exec(msg.stack || "");
	if (m) return { line: +m[1], column: +m[2] };
	if (/^blob:/.test(msg.file || "") && msg.line > 0) return { line: msg.line, column: msg.column || 0 };
	return null;
}

// Where the key an error names is, or null: a message like `has no option
// called "colour"` (zot.js refusing a misspelt option) blames the game.enemy(
// line, because that is the call the stack points at, so the mark goes on
// the key itself, the first line from there on that starts with it.
export function optionLine(doc, text, from = 1) {
	const m = /no option called "(\w+)"/.exec(text || "");
	if (!m) return null;
	const key = new RegExp(`^\\s*["']?${m[1]}["']?\\s*[:(]`);
	for (let n = Math.max(1, from); n <= doc.lines; n++) {
		const line = doc.line(n).text;
		if (key.test(line)) return { line: n, column: line.indexOf(m[1]) + 1 };
	}
	return null;
}

// The marker beside the dropdown while the editor's code differs from what
// was loaded, or null when it doesn't. Only a save has a copy the edits are
// missing from; a preset or a link is edited, and Save keeps it.
export function editedLabel(source, edited) {
	if (!edited) return null;
	return source.kind === "save"
		? { text: "Unsaved changes", title: `Changed since "${source.name}" was saved` }
		: { text: "Edited", title: "Changed from the code as loaded. Save keeps it in this browser" };
}

// ---- the marked line: a background and a dot by the number ----

// The line to mark, or null. The mark follows its line as text above it is
// added or taken away; Run clears it.
export const setProblemLine = StateEffect.define();
export const problemLine = StateField.define({
	create: () => null,
	update(line, tr) {
		if (line != null && tr.docChanged) {
			const from = tr.startState.doc.line(line).from;
			line = tr.state.doc.lineAt(tr.changes.mapPos(from, 1)).number;
		}
		for (const e of tr.effects) if (e.is(setProblemLine)) line = e.value;
		return line;
	}
});
const problemBackground = Decoration.line({ class: "cm-problem-line" });
const problemDot = new (class extends GutterMarker {
	elementClass = "cm-problem-number";
	toDOM() {
		const dot = document.createElement("span");
		dot.className = "cm-problem-dot";
		dot.textContent = "\u25cf";
		dot.title = "The mistake is on this line";
		return dot;
	}
})();
const lineFrom = (state) => {
	const line = state.field(problemLine);
	return line != null && line <= state.doc.lines ? state.doc.line(line).from : null;
};
// Both are worked out again on every change to the text, not only when the
// line number changes: typing on a line above moves where the line starts.
export const problemMarks = [
	problemLine,
	EditorView.decorations.compute([problemLine, "doc"], (state) => {
		const from = lineFrom(state);
		return from == null ? Decoration.none : Decoration.set([problemBackground.range(from)]);
	}),
	lineNumberMarkers.compute([problemLine, "doc"], (state) => {
		const from = lineFrom(state);
		return from == null ? RangeSet.empty : RangeSet.of([problemDot.range(from)]);
	})
];

// ---- storage: the saves list and the draft ----

function readJson(key, fallback) {
	try {
		const raw = localStorage.getItem(key);
		return raw == null ? fallback : JSON.parse(raw);
	} catch (e) {
		return fallback; // private window, or something else wrote junk there
	}
}

function writeJson(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
		return true;
	} catch (e) {
		return false; // private window or full storage
	}
}

export const readSaves = () => {
	const list = readJson(SAVES_KEY, []);
	return Array.isArray(list) ? list.filter((s) => s && typeof s.name === "string" && typeof s.code === "string") : [];
};
export const writeSaves = (list) => writeJson(SAVES_KEY, list);

async function fetchText(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Could not load ${url}: ${res.status}`);
	return res.text();
}

const $ = (id) => document.getElementById(id);

async function main() {
	const shell = $("shell");
	const pane = $("editor");
	const frame = $("frame");
	const notice = $("notice");
	const presetSelect = $("preset");
	presetSelect.prepend(...Object.entries(PRESETS).map(([file, p]) => new Option(p.label, file)));
	const editToggle = $("edit");
	const seedInput = $("seed");
	const soundButton = $("sound");

	const view = new EditorView({
		parent: pane,
		extensions: [
			basicSetup,
			javascript(),
			indentUnit.of("\t"), // the presets are indented with tabs, so Enter, Tab and the hook snippets are too
			javascriptLanguage.data.of({ autocomplete: zotCompletions }),
			swatches,
			problemMarks,
			// The "Line 12" chip in the bar follows the mark as lines are added above it
			EditorView.updateListener.of((u) => {
				const line = u.state.field(problemLine);
				if (line != null && line !== u.startState.field(problemLine)) problemWhere.textContent = `Line ${line}`;
			}),
			EditorView.updateListener.of((u) => u.docChanged && showEdited()),
			oneDark,
			keymap.of([indentWithTab])
		]
	});
	const code = () => view.state.doc.toString();
	const setCode = (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });

	// Where the editor's code came from: { kind: "preset", file }, { kind: "save", name } or { kind: "link" }
	let source = { kind: "preset", file: DEFAULT_PRESET };
	let loaded = ""; // its text as loaded; anything else in the editor is an edit
	const edited = () => code() !== loaded;
	const sourceName = () =>
		source.kind === "preset" ? PRESETS[source.file].name : source.kind === "save" ? source.name : "From link";

	const editedMark = $("edited");
	function showEdited() {
		const label = editedLabel(source, edited());
		editedMark.hidden = !label;
		if (label) {
			editedMark.textContent = label.text;
			editedMark.title = label.title;
		}
	}

	// The dropdown names the source: a preset, the save's name, or "From link"
	// and the marker beside it says whether the code has changed since
	function showSource() {
		const saveOption = presetSelect.querySelector('option[value="save"]');
		const linkOption = presetSelect.querySelector('option[value="link"]');
		saveOption.hidden = source.kind !== "save";
		linkOption.hidden = source.kind !== "link";
		if (source.kind === "save") saveOption.textContent = source.name;
		presetSelect.value = source.kind === "preset" ? source.file : source.kind;
		showEdited();
	}

	function setSource(next, text) {
		source = next;
		loaded = text;
		setCode(text);
		showSource();
	}

	// The pane slides open and closed (editor.css); closed, it is inert, so
	// Tab and a screen reader skip what is out of sight
	let editing = false;
	function setEditing(next) {
		editing = next;
		startSlide();
		pane.classList.toggle("closed", !editing);
		pane.toggleAttribute("inert", !editing);
		editToggle.setAttribute("aria-pressed", String(editing));
		shell.classList.toggle("editing", editing);
	}

	// The game refits its map whenever its page changes size (fitMap in
	// zot.js), and a slide would have it refit on every step, blanking and
	// redrawing the map each time. So the game is told when a slide starts
	// and ends (zot:sliding), and holds its refit for the end. Without a
	// slide (before the shell is ready, or under reduced motion) there is
	// nothing to say.
	let sliding = 0; // a timer that ends the slide in case its end is missed
	const tellSliding = (on) => frame.contentWindow && frame.contentWindow.postMessage({ type: "zot:sliding", on }, "*");
	function startSlide() {
		if (!(parseFloat(getComputedStyle(pane).transitionDuration) > 0)) return;
		if (!sliding) tellSliding(true);
		clearTimeout(sliding);
		sliding = setTimeout(endSlide, 500);
	}
	function endSlide() {
		if (!sliding) return;
		clearTimeout(sliding);
		sliding = 0;
		tellSliding(false);
	}
	pane.addEventListener("transitionend", (e) => {
		if (e.target === pane && e.propertyName === "flex-basis") endSlide();
	});

	// ---- the code's width ----

	// Dragging the handle on the pane's right edge sets --editor-width
	// (editor.css) as it goes, and the width is kept once it is let go.
	// Double-clicking the handle goes back to the default; with the handle
	// focused, the arrow keys move it a step at a time.
	const gutter = $("gutter");
	const panes = pane.parentElement;
	let width = null; // the width set, in pixels, or null for the default
	const showWidth = (px) => pane.style.setProperty("--editor-width", `${px}px`);
	function setWidth(next) {
		width = next == null ? null : clampWidth(next, panes.clientWidth);
		if (width == null) pane.style.removeProperty("--editor-width");
		else showWidth(width);
		writeJson(WIDTH_KEY, width);
	}
	let drag = null; // { x, width } where the drag began, while the handle is held
	gutter.addEventListener("pointerdown", (e) => {
		if (e.button !== 0) return;
		drag = { x: e.clientX, width: pane.getBoundingClientRect().width };
		gutter.setPointerCapture(e.pointerId);
		shell.classList.add("resizing");
		e.preventDefault();
	});
	gutter.addEventListener("pointermove", (e) => {
		if (drag) showWidth(clampWidth(drag.width + e.clientX - drag.x, panes.clientWidth));
	});
	function endDrag(e) {
		if (!drag) return;
		setWidth(drag.width + e.clientX - drag.x);
		drag = null;
		shell.classList.remove("resizing");
	}
	gutter.addEventListener("pointerup", endDrag);
	gutter.addEventListener("pointercancel", endDrag);
	gutter.addEventListener("dblclick", () => setWidth(null));
	gutter.addEventListener("keydown", (e) => {
		const step = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
		if (!step) return;
		e.preventDefault();
		// From the width set, not the pane's, which may still be sliding there
		setWidth((width == null ? pane.getBoundingClientRect().width : width) + step);
	});
	const keptWidth = readJson(WIDTH_KEY, null);
	if (typeof keptWidth === "number") {
		width = keptWidth;
		showWidth(width);
	}

	// ---- running ----

	// The seed box: typing a seed pins it, so every Run plays that dungeon.
	// Unpinned, it shows the seed of the dungeon now running, dimmed, and Run
	// makes a new one. Empty and Enter unpins it.
	let seedPinned = false;
	const pinnedSeed = () => (seedPinned ? seedInput.value.trim().toLowerCase() : "");
	function pinSeed(seed) {
		seedPinned = seed !== "";
		seedInput.value = seed.toLowerCase(); // as zot.js reads it
		seedInput.classList.toggle("pinned", seedPinned);
	}
	seedInput.addEventListener("input", () => {
		seedPinned = seedInput.value.trim() !== "";
		seedInput.classList.toggle("pinned", seedPinned);
	});
	seedInput.addEventListener("keydown", (e) => {
		if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
		pinSeed(seedInput.value.trim());
		run();
	});
	// The frame says which seed its game got, and whether the code chose it
	function showSeed(seed, fixed) {
		seedInput.readOnly = fixed;
		seedInput.title = fixed
			? "The code sets this seed (seed: in its options), so the box can't change it"
			: "The dungeon's seed. Type one and press Enter to play that dungeon on every Run; empty it for a new one each time";
		if (fixed || !seedPinned) seedInput.value = seed;
		seedInput.classList.toggle("pinned", seedPinned && !fixed);
	}

	let draft = null;
	function saveDraft(ran) {
		draft = { source, code: code(), seed: pinnedSeed(), time: Date.now(), ran };
		writeJson(DRAFT_KEY, draft);
	}

	// ---- the mistake bar over the editor ----

	const problem = $("problem");
	const problemText = $("problem-text");
	const problemWhere = $("problem-where");
	let problemAt = null; // { line, column } of the mistake shown, or null
	function showProblem(msg) {
		problemAt = errorLine(msg);
		if (problemAt && problemAt.line > view.state.doc.lines) problemAt = null;
		problemAt = optionLine(view.state.doc, msg.text, problemAt ? problemAt.line : 1) || problemAt;
		problemText.textContent = String(msg.text || "Something's wrong in your code").replace(/^Uncaught (Error: )?/, "");
		problemWhere.hidden = !problemAt;
		if (problemAt) problemWhere.textContent = `Line ${problemAt.line}`;
		problem.hidden = false;
		view.dispatch({ effects: setProblemLine.of(problemAt ? problemAt.line : null) });
	}
	function clearProblem() {
		problemAt = null;
		problem.hidden = true;
		if (view.state.field(problemLine) != null) view.dispatch({ effects: setProblemLine.of(null) });
	}
	// "Line 12" puts the cursor there
	problemWhere.addEventListener("click", () => {
		const line = view.state.field(problemLine);
		if (line == null) return;
		const info = view.state.doc.line(line);
		const pos = Math.min(info.from + Math.max(0, (problemAt ? problemAt.column : 1) - 1), info.to);
		view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
		view.focus();
	});
	$("problem-close").addEventListener("click", clearProblem);

	function run() {
		notice.hidden = true;
		clearProblem();
		// Once link code has run, the link has done its job: a reload then
		// restores the draft, edits and all, instead of the link again
		if (location.hash) history.replaceState(null, "", location.pathname + location.search);
		saveDraft(false);
		if (!seedPinned) seedInput.value = ""; // until the new game says its seed
		frame.srcdoc = frameDocument(code(), location.href, pinnedSeed(), muted);
	}
	// Once the game is up, the arrow keys should move the hero, not the page
	frame.addEventListener("load", () => frame.contentWindow && frame.contentWindow.focus());

	// Instead of running: a message over the frame, and a Run button
	function showNotice(text) {
		$("notice-text").textContent = text;
		notice.hidden = false;
		setEditing(true);
	}
	$("notice-run").addEventListener("click", run);

	async function loadPreset(file) {
		const text = await fetchText(file);
		setSource({ kind: "preset", file }, text);
		run();
	}

	presetSelect.addEventListener("change", async () => {
		const file = presetSelect.value;
		if (edited() && !confirm(`Replace your edits with the ${PRESETS[file].name} code?`)) {
			showSource();
			return;
		}
		await loadPreset(file);
	});

	$("run").addEventListener("click", run);

	// The speaker button mutes the game in the frame (M in the game does too,
	// and the game reports back, see the messages below). A new Run starts
	// the way the button shows. The button goes away while the game has no sounds.
	let muted = false;
	function showSound(enabled = true) {
		soundButton.hidden = !enabled;
		soundButton.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
		soundButton.title = (muted ? "Sound off" : "Sound on") + " (M in the game)";
		soundButton.setAttribute("aria-pressed", String(!muted));
	}
	soundButton.addEventListener("click", () => {
		muted = !muted;
		showSound();
		if (frame.contentWindow) {
			frame.contentWindow.postMessage({ type: "zot:sound", on: !muted }, "*");
			frame.contentWindow.focus(); // back to the game, so the keys go there
		}
	});

	// Showing or hiding the editor leaves the frame alone, so the game goes on
	editToggle.addEventListener("click", () => {
		setEditing(!editing);
		if (editing) view.focus();
		else frame.contentWindow && frame.contentWindow.focus();
	});

	// Cmd/Ctrl+Enter runs from the shell side (the frame side posts a message)
	window.addEventListener(
		"keydown",
		(e) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !document.querySelector("dialog[open]")) {
				e.preventDefault();
				e.stopPropagation();
				run();
			}
		},
		true
	);
	// The draft is marked as started once the frame says its module has run,
	// and when this page is left normally: a reload a moment after Run is not
	// a hang. A hung tab gets killed without pagehide, so its draft stays unmarked.
	function markStarted() {
		if (!draft || draft.ran) return;
		draft.ran = true;
		writeJson(DRAFT_KEY, draft);
	}
	window.addEventListener("pagehide", markStarted);
	window.addEventListener("message", (e) => {
		if (e.source !== frame.contentWindow || !e.data) return;
		if (e.data.type === "zot:run") run();
		if (e.data.type === "zot:started") markStarted();
		if (e.data.type === "zot:error") showProblem(e.data);
		if (e.data.type === "zot:seed") showSeed(String(e.data.seed), !!e.data.fixed);
		if (e.data.type === "zot:sound") {
			muted = !!e.data.muted;
			showSound(e.data.enabled !== false);
		}
	});

	// Light up the top edge of whichever pane has the keyboard. Focus moving
	// into the frame makes the frame the active element and blurs this window.
	function showFocus() {
		const active = document.activeElement;
		shell.classList.toggle("frame-focused", active === frame);
		shell.classList.toggle("editor-focused", active !== frame && pane.contains(active));
	}
	for (const type of ["focusin", "focusout", "focus", "blur"])
		window.addEventListener(type, () => setTimeout(showFocus));

	// ---- dialogs ----

	for (const button of document.querySelectorAll("dialog .cancel")) {
		button.addEventListener("click", () => button.closest("dialog").close());
	}

	// Save: asks for a name, then keeps the code in the saves list
	const saveDialog = $("save-dialog");
	const saveName = $("save-name");
	$("save").addEventListener("click", () => {
		saveName.value = sourceName();
		saveDialog.showModal();
		saveName.select();
	});
	saveDialog.querySelector("form").addEventListener("submit", (e) => {
		const name = saveName.value.trim();
		if (!name) return e.preventDefault();
		const saves = readSaves();
		const existing = saves.findIndex((s) => s.name === name);
		const replacingAnother = existing >= 0 && !(source.kind === "save" && source.name === name);
		if (replacingAnother && !confirm(`Replace the saved game "${name}"?`)) return e.preventDefault();
		const entry = { name, code: code(), time: Date.now() };
		if (existing >= 0) saves[existing] = entry;
		else saves.push(entry);
		if (!writeSaves(saves)) {
			e.preventDefault();
			alert("This browser would not keep the save. Download the code instead.");
			return;
		}
		source = { kind: "save", name };
		loaded = entry.code;
		showSource();
		saveDraft(draft ? draft.ran : true);
	});

	// Load: the saves list, newest first, each with Load and Delete
	const loadDialog = $("load-dialog");
	const saveList = $("save-list");
	const when = (time) => new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
	function showSaves() {
		const saves = readSaves().sort((a, b) => (b.time || 0) - (a.time || 0));
		saveList.replaceChildren(
			...saves.map((save) => {
				const li = document.createElement("li");
				const name = document.createElement("span");
				name.className = "name";
				name.textContent = save.name;
				name.title = save.name;
				const date = document.createElement("span");
				date.className = "when";
				date.textContent = when(save.time);
				const load = document.createElement("button");
				load.type = "button";
				load.textContent = "Load";
				load.addEventListener("click", () => {
					if (edited() && !confirm(`Replace your edits with "${save.name}"?`)) return;
					loadDialog.close();
					setSource({ kind: "save", name: save.name }, save.code);
					run();
				});
				const del = document.createElement("button");
				del.type = "button";
				del.className = "delete";
				del.textContent = "Delete";
				del.title = `Delete "${save.name}"`;
				del.addEventListener("click", () => {
					if (!confirm(`Delete the saved game "${save.name}"? This cannot be undone.`)) return;
					writeSaves(readSaves().filter((s) => s.name !== save.name));
					showSaves();
				});
				li.append(name, date, load, del);
				return li;
			})
		);
		$("no-saves").hidden = saves.length > 0;
	}
	$("load").addEventListener("click", () => {
		showSaves();
		loadDialog.showModal();
	});

	// Download: the code as a .js file named after its source
	$("download").addEventListener("click", () => {
		const blob = new Blob([code()], { type: "text/javascript" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download =
			source.kind === "preset" ? source.file.split("/").pop() : fileName(source.kind === "save" ? source.name : "game");
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	});

	// Share: a link carrying the code, with a note on its size
	const shareDialog = $("share-dialog");
	const shareInput = $("share-url");
	const shareCopy = $("share-copy");
	$("share").addEventListener("click", async () => {
		const url = await shareUrl(code());
		shareInput.value = url;
		const size = `${url.length.toLocaleString()} characters.`;
		$("share-note").textContent =
			url.length > LONG_LINK
				? `${size} Browsers take links this long, but chat apps, mail clients and QR codes may cut it short.`
				: size;
		shareCopy.textContent = "Copy link";
		shareDialog.showModal();
		shareInput.select();
	});
	shareCopy.addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(shareInput.value);
			shareCopy.textContent = "Copied";
		} catch (e) {
			shareInput.select();
			shareCopy.textContent = "Select and copy";
		}
	});

	// ---- what to show first: a link, the draft, or the default preset ----


	async function openLink(fragment) {
		let text;
		try {
			text = await decode(fragment);
		} catch (e) {
			await loadPreset(DEFAULT_PRESET);
			showNotice(`This link could not be read: ${e.message}. ${PRESETS[DEFAULT_PRESET].name} is loaded instead.`);
			return;
		}
		setSource({ kind: "link" }, text);
		showNotice(
			"This link carries code someone else wrote. Read it in the editor, then press Run if you want to try it."
		);
	}

	async function openDraft(saved) {
		let next = saved.source;
		let text = saved.code;
		if (next.kind === "preset") {
			if (!PRESETS[next.file]) next = { kind: "preset", file: DEFAULT_PRESET };
			text = await fetchText(next.file);
		} else if (next.kind === "save") {
			const save = readSaves().find((s) => s.name === next.name);
			if (save) text = save.code;
		}
		setSource(next, text);
		setCode(saved.code);
		if (saved.seed && !seedPinned) pinSeed(saved.seed);
		if (saved.ran === false) {
			showNotice(
				"The last time this code ran, the tab had to be closed before the game started. It was not run again on its own. Check the code for a loop that never ends, then press Run."
			);
		} else run();
	}

	// ?seed=k7x2 in the shell's address pins that dungeon, as it would on a game page
	pinSeed(new URLSearchParams(location.search).get("seed") || "");
	const saved = readJson(DRAFT_KEY, null);
	if (location.hash.length > 1) await openLink(location.hash);
	else if (saved && saved.source && typeof saved.code === "string") await openDraft(saved);
	else await loadPreset(DEFAULT_PRESET);
	// From here on Edit slides the pane; the layout is settled first, so the
	// transition doesn't pick up an opening that happened while loading
	void pane.offsetWidth;
	shell.classList.add("ready");
}

if ($("shell")) main();
