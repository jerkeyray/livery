import { diagnostic, type Diagnostic, type SourcePosition, type SourceSpan } from "../diagnostics.js";

export type TokenKind =
  | "identifier"
  | "string"
  | "arrow"
  | "equals"
  | "colon"
  | "comma"
  | "dot"
  | "left_brace"
  | "right_brace"
  | "left_paren"
  | "right_paren"
  | "newline"
  | "eof";

export type Token = {
  kind: TokenKind;
  value: string;
  span: SourceSpan;
};

export type TokenizeResult = {
  tokens: Token[];
  diagnostics: Diagnostic[];
  incomplete: boolean;
};

type Cursor = SourcePosition;

const punctuation: Partial<Record<string, TokenKind>> = {
  "=": "equals",
  ":": "colon",
  ",": "comma",
  ".": "dot",
  "{": "left_brace",
  "}": "right_brace",
  "(": "left_paren",
  ")": "right_paren",
};

const MAX_TOKENIZER_DIAGNOSTICS = 100;

function clonePosition(cursor: Cursor): SourcePosition {
  return { ...cursor };
}

function makeSpan(start: SourcePosition, end: SourcePosition): SourceSpan {
  return { start, end };
}

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  const cursor: Cursor = { line: 1, column: 1, offset: 0 };
  let braceDepth = 0;
  let incomplete = false;

  const report = (item: Diagnostic) => {
    if (diagnostics.length < MAX_TOKENIZER_DIAGNOSTICS) {
      diagnostics.push(item);
    } else if (diagnostics.length === MAX_TOKENIZER_DIAGNOSTICS) {
      diagnostics.push({
        ...diagnostic(
          "resource.max_diagnostics",
          `Tokenizer diagnostics were truncated after ${MAX_TOKENIZER_DIAGNOSTICS} errors.`,
        ),
        repair: { description: "Repair the earliest reported errors before compiling again." },
      });
    }
  };

  const advance = () => {
    const character = source[cursor.offset] ?? "";
    cursor.offset += 1;
    if (character === "\n") {
      cursor.line += 1;
      cursor.column = 1;
    } else {
      cursor.column += 1;
    }
    return character;
  };

  const push = (kind: TokenKind, value: string, start: SourcePosition) => {
    tokens.push({ kind, value, span: makeSpan(start, clonePosition(cursor)) });
  };

  while (cursor.offset < source.length) {
    const character = source[cursor.offset] ?? "";

    if (character === " " || character === "\t" || character === "\r") {
      advance();
      continue;
    }

    if (character === "\n") {
      const start = clonePosition(cursor);
      advance();
      push("newline", "", start);
      continue;
    }

    if (source.startsWith("//", cursor.offset)) {
      while (cursor.offset < source.length && source[cursor.offset] !== "\n") advance();
      continue;
    }

    if (source.startsWith("->", cursor.offset)) {
      const start = clonePosition(cursor);
      advance();
      advance();
      push("arrow", "->", start);
      continue;
    }

    const punctuationKind = punctuation[character];
    if (punctuationKind) {
      const start = clonePosition(cursor);
      advance();
      push(punctuationKind, character, start);
      if (punctuationKind === "left_brace") {
        braceDepth += 1;
        if (braceDepth > 4) {
          report(
            diagnostic(
              "resource.max_nesting_depth",
              "Block nesting exceeds the maximum depth of 4.",
              makeSpan(start, clonePosition(cursor)),
            ),
          );
        }
      } else if (punctuationKind === "right_brace") {
        braceDepth = Math.max(0, braceDepth - 1);
      }
      continue;
    }

    if (character === '"') {
      const start = clonePosition(cursor);
      advance();
      let value = "";
      let closed = false;
      while (cursor.offset < source.length) {
        const next = source[cursor.offset] ?? "";
        if (next === '"') {
          advance();
          closed = true;
          break;
        }
        if (next === "\n") break;
        if (next === "\\") {
          advance();
          const escaped = source[cursor.offset] ?? "";
          if (!escaped) break;
          value += escaped === "n" ? "\n" : escaped;
          advance();
          continue;
        }
        value += advance();
      }
      push("string", value, start);
      if (!closed) {
        incomplete = cursor.offset >= source.length;
        report(
          diagnostic(
            incomplete ? "syntax.incomplete_string" : "syntax.unterminated_string",
            "String is missing a closing quote.",
            makeSpan(start, clonePosition(cursor)),
          ),
        );
      }
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = clonePosition(cursor);
      let value = advance();
      while (cursor.offset < source.length && /[A-Za-z0-9_-]/.test(source[cursor.offset] ?? "")) {
        value += advance();
      }
      push("identifier", value, start);
      continue;
    }

    const start = clonePosition(cursor);
    advance();
    report(
      diagnostic(
        "syntax.unexpected_character",
        `Unexpected character ${JSON.stringify(character)}.`,
        makeSpan(start, clonePosition(cursor)),
      ),
    );
  }

  const eof = clonePosition(cursor);
  tokens.push({ kind: "eof", value: "", span: makeSpan(eof, eof) });
  return { tokens, diagnostics, incomplete };
}
