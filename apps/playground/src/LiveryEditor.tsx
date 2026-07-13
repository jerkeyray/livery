import { StreamLanguage } from "@codemirror/language";
import { setDiagnostics, type Diagnostic as EditorDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useLayoutEffect, useRef } from "react";
import type { Diagnostic } from "@jerkeyray/core";

const keywords = new Set(["component", "figure", "return", "timeline", "state", "transition", "show", "hide", "focus", "trace", "set", "morph"]);
const constructors = new Set(["row", "column", "grid", "stack", "overlay", "canvas", "text", "box", "circle", "line", "path", "image", "icon", "connect", "person", "team", "service", "api", "database", "cache", "queue", "stream", "browser", "agent", "model", "tool", "note", "callout"]);

const liveryLanguage = StreamLanguage.define({
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match("//")) { stream.skipToEnd(); return "comment"; }
    if (stream.peek() === '"') {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const character = stream.next();
        if (character === '"' && !escaped) break;
        escaped = character === "\\" && !escaped;
        if (character !== "\\") escaped = false;
      }
      return "string";
    }
    if (stream.match(/^-?\d+(?:\.\d+)?/)) return "number";
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_.]*/)) {
      const word = stream.current();
      if (keywords.has(word)) return "keyword";
      if (constructors.has(word)) return "typeName";
      if (["string", "number", "boolean", "tone", "success", "warning", "danger", "info", "neutral"].includes(word)) return "atom";
      return "variableName";
    }
    stream.next();
    return null;
  },
});

const editorTheme = EditorView.theme({
  "&": { height: "100%", background: "#fcfcfb", color: "#202124", fontSize: "13px" },
  ".cm-content": { padding: "18px 0", caretColor: "#1d4ed8", fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: "1.62" },
  ".cm-line": { padding: "0 18px" },
  ".cm-gutters": { background: "#f7f7f5", color: "#9a9a96", border: "0", borderRight: "1px solid #e5e5e1" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "42px", padding: "0 12px 0 8px" },
  ".cm-activeLine, .cm-activeLineGutter": { background: "#f1f5fb" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "#dbeafe" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip": { border: "1px solid #d8d8d3", borderRadius: "4px", boxShadow: "0 8px 24px rgb(0 0 0 / 10%)" },
});

export function LiveryEditor({ diagnostics, onChange, source }: { diagnostics: Diagnostic[]; onChange(source: string): void; source: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const applyingSourceRef = useRef(false);
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: source,
        extensions: [
          basicSetup,
          liveryLanguage,
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingSourceRef.current) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, []);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      applyingSourceRef.current = true;
      try {
        view.dispatch({ changes: { from: 0, to: current.length, insert: source } });
      } finally {
        applyingSourceRef.current = false;
      }
    }
  }, [source]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const length = view.state.doc.length;
    const mapped: EditorDiagnostic[] = diagnostics.map((diagnostic) => ({
      from: Math.max(0, Math.min(length, diagnostic.span?.start.offset ?? 0)),
      to: Math.max(0, Math.min(length, diagnostic.span?.end.offset ?? diagnostic.span?.start.offset ?? 0)),
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.code,
    }));
    view.dispatch(setDiagnostics(view.state, mapped));
  }, [diagnostics]);

  return <div aria-label="Livery source editor" className="source-editor" ref={hostRef} />;
}
