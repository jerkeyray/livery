import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { setDiagnostics, type Diagnostic as EditorDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useLayoutEffect, useRef } from "react";
import { applyDiagnosticFix, getLanguageCatalog, type Diagnostic } from "@jerkeyray/core";
import { tags } from "@lezer/highlight";

const catalog = getLanguageCatalog();
const supportedTimelineOperations = catalog.timelineOperations.filter(({ status }) => status === "supported");
const keywords = new Set([...catalog.keywords, ...supportedTimelineOperations.map(({ name }) => name)]);
const constructors = new Set([
  ...catalog.primitives,
  ...catalog.layouts.map(({ name }) => name),
  ...catalog.constraints.map(({ name }) => name),
  ...catalog.components.map(({ name }) => name),
]);
const completions = [
  ...catalog.keywords.map((label) => ({ label, type: "keyword" })),
  ...catalog.primitives.map((label) => ({ label, type: "function", apply: `${label}()` })),
  ...catalog.layouts.map(({ name: label, description: info }) => ({ label, type: "function", info, apply: `${label}()` })),
  ...catalog.constraints.map(({ name: label, description: info }) => ({ label, type: "function", info, apply: `${label}()` })),
  ...supportedTimelineOperations.map(({ name: label, description: info }) => ({ label, type: "function", info, apply: `${label}()` })),
  ...catalog.components.map(({ name: label, description: info, status }) => ({ label, type: "class", info: `${info}${status === "experimental" ? " Experimental." : ""}`, apply: `${label}()` })),
  ...catalog.anchors.map((label) => ({ label, type: "property" })),
  ...catalog.tokens.map((token) => ({ label: `$${token}`, type: "constant", detail: "theme token" })),
];

function completeLivery(context: CompletionContext) {
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_.-]*/);
  if (!word && !context.explicit) return null;
  return { from: word?.from ?? context.pos, options: completions, validFor: /^[A-Za-z_][A-Za-z0-9_.-]*$/ };
}

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

const liveryHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-keyword)" },
  { tag: tags.typeName, color: "var(--syntax-type)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: [tags.number, tags.bool, tags.atom], color: "var(--syntax-number)" },
  { tag: tags.variableName, color: "var(--editor-text)" },
  { tag: tags.comment, color: "var(--editor-muted)" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", background: "var(--editor-bg)", color: "var(--editor-text)", fontSize: "13px" },
  ".cm-content": { padding: "18px 0", caretColor: "#c0264f", fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', lineHeight: "1.62" },
  ".cm-line": { padding: "0 18px" },
  ".cm-gutters": { background: "var(--editor-gutter)", color: "var(--editor-muted)", border: "0", borderRight: "1px solid var(--editor-border)" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "42px", padding: "0 12px 0 8px" },
  ".cm-activeLine, .cm-activeLineGutter": { background: "var(--editor-active)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { background: "var(--editor-selection)" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip": { border: "1px solid var(--editor-border)", borderRadius: "4px", background: "var(--editor-bg)", color: "var(--editor-text)", boxShadow: "0 8px 24px rgb(0 0 0 / 18%)" },
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
          autocompletion({ override: [completeLivery] }),
          liveryLanguage,
          syntaxHighlighting(liveryHighlightStyle),
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
    const mapped: EditorDiagnostic[] = diagnostics.map((diagnostic) => {
      const fixed = diagnostic.repair?.edits?.length ? applyDiagnosticFix(view.state.doc.toString(), diagnostic) : undefined;
      return {
        from: Math.max(0, Math.min(length, diagnostic.span?.start.offset ?? 0)),
        to: Math.max(0, Math.min(length, diagnostic.span?.end.offset ?? diagnostic.span?.start.offset ?? 0)),
        severity: diagnostic.severity,
        message: diagnostic.message,
        source: diagnostic.code,
        ...(fixed !== undefined ? {
          actions: [{
            name: diagnostic.repair?.description ?? "Apply fix",
            apply(target: EditorView) {
              target.dispatch({ changes: { from: 0, to: target.state.doc.length, insert: fixed } });
            },
          }],
        } : {}),
      };
    });
    view.dispatch(setDiagnostics(view.state, mapped));
  }, [diagnostics]);

  return <div aria-label="Livery source editor" className="source-editor" ref={hostRef} />;
}
