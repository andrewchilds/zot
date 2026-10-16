// What the editor needs from CodeMirror, in one file. `npm run build:editor`
// bundles this into lib/codemirror.js, which is committed so the site stays
// static: Vercel never runs the build. Rerun it after upgrading CodeMirror.
// zot-completions.js and the tests import from the bundle too, so a page has
// one copy of CodeMirror's state and facets.
export { EditorView, basicSetup } from "codemirror";
export { EditorState, StateField, StateEffect, RangeSet } from "@codemirror/state";
export { keymap, Decoration, GutterMarker, lineNumberMarkers, ViewPlugin, WidgetType } from "@codemirror/view";
export { indentWithTab } from "@codemirror/commands";
export { syntaxTree, indentUnit } from "@codemirror/language";
export { snippetCompletion, CompletionContext } from "@codemirror/autocomplete";
export { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
export { oneDark } from "@codemirror/theme-one-dark";
