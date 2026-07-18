import { diagnostic, type Diagnostic, type SourceSpan } from "./diagnostics.js";
import { TIMELINE_DURATIONS } from "./language-contract.js";
import type { ComponentParameter, LayoutKind, Timeline, VisualValue } from "./visual.js";

export type ParsedCall = {
  name: string;
  positional: VisualValue[];
  named: Record<string, VisualValue>;
  span?: SourceSpan;
};

export type ParsedBinding = {
  id: string;
  call: ParsedCall;
  children?: ParsedBinding[];
  span?: SourceSpan;
};

export type ParsedLayout = {
  kind: LayoutKind;
  named: Record<string, VisualValue>;
  children: string[];
  span?: SourceSpan;
};

export type ParsedComponent = {
  name: string;
  parameters: ComponentParameter[];
  bindings: ParsedBinding[];
  returned?: ParsedLayout;
  span?: SourceSpan;
};

export type ParsedFigureItem =
  | { type: "binding"; binding: ParsedBinding }
  | { type: "call"; call: ParsedCall }
  | { type: "layout"; layout: ParsedLayout }
  | { type: "timeline"; timeline: Timeline };

export type ParsedFigure = {
  id: string;
  title?: string;
  items: ParsedFigureItem[];
  span?: SourceSpan;
};

export type ParsedVisualProgram = {
  components: ParsedComponent[];
  figures: ParsedFigure[];
};

export function parseVisualProgram(source: string): { program?: ParsedVisualProgram; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const tokens = tokenize(source, diagnostics);
  const parser = new VisualParser(tokens, diagnostics);
  const program = parser.parseProgram();
  return diagnostics.some(({ severity }) => severity === "error") ? { diagnostics } : { program, diagnostics };
}

type TokenKind = "identifier" | "string" | "number" | "symbol" | "arrow" | "eof";
type Token = { kind: TokenKind; value: string; raw: string; span: SourceSpan };

const layoutNames = new Set<LayoutKind>(["row", "column", "stack", "grid", "flow", "hierarchy", "overlay", "canvas"]);

class VisualParser {
  private index = 0;

  constructor(private readonly tokens: Token[], private readonly diagnostics: Diagnostic[]) {}

  parseProgram(): ParsedVisualProgram {
    const components: ParsedComponent[] = [];
    const figures: ParsedFigure[] = [];
    while (!this.at("eof")) {
      if (this.atIdentifier("component")) {
        const component = this.parseComponent();
        if (component) components.push(component);
      } else if (this.atIdentifier("figure")) {
        const figure = this.parseFigure();
        if (figure) figures.push(figure);
      } else {
        this.error("syntax.unexpected_statement", `Unexpected top-level token ${this.current().raw}.`);
        this.advance();
      }
    }
    return { components, figures };
  }

  private parseComponent(): ParsedComponent | undefined {
    const start = this.current().span.start;
    this.advance();
    const name = this.expectIdentifier("Expected a component name.");
    if (!name) return this.recoverDeclaration();
    if (!this.expectSymbol("(", "Expected ( after the component name.")) return this.recoverDeclaration();
    const parameters = this.parseParameters();
    if (!this.expectSymbol(")", "Expected ) after component parameters.")) return this.recoverDeclaration();
    if (!this.expectSymbol("{", "Expected { before the component body.")) return this.recoverDeclaration();

    const bindings: ParsedBinding[] = [];
    let returned: ParsedLayout | undefined;
    while (!this.at("eof") && !this.atSymbol("}")) {
      if (this.atIdentifier("return")) {
        this.advance();
        const layout = this.parseLayout(true);
        if (returned) this.error("semantic.duplicate_component_return", `Component ${name} has more than one return declaration.`);
        else if (layout) returned = layout;
      } else {
        const binding = this.parseBinding();
        if (binding) bindings.push(binding);
        else this.recoverStatement();
      }
    }
    this.expectSymbol("}", `Component ${name} is missing }.`);
    return { name, parameters, bindings, ...(returned ? { returned } : {}), span: this.spanFrom(start) };
  }

  private parseFigure(): ParsedFigure | undefined {
    const start = this.current().span.start;
    this.advance();
    const id = this.expectIdentifier("Expected a figure identifier.");
    if (!id) return this.recoverDeclaration();
    let title: string | undefined;
    if (this.matchSymbol("(")) {
      if (this.current().kind === "string") title = this.advance().value;
      else this.error("syntax.invalid_figure_title", "Figure titles must be string literals.");
      this.expectSymbol(")", "Expected ) after the figure title.");
    }
    if (!this.expectSymbol("{", "Expected { before the figure body.")) return this.recoverDeclaration();

    const items: ParsedFigureItem[] = [];
    while (!this.at("eof") && !this.atSymbol("}")) {
      if (this.atIdentifier("timeline")) {
        const timeline = this.parseTimeline();
        if (timeline) items.push({ type: "timeline", timeline });
        continue;
      }
      if (this.current().kind !== "identifier") {
        this.error("syntax.invalid_figure_statement", `Unexpected figure token ${this.current().raw}.`);
        this.recoverStatement();
        continue;
      }
      if (this.looksLikeBinding()) {
        const binding = this.parseBinding();
        if (binding) items.push({ type: "binding", binding });
        continue;
      }
      if (this.looksLikeArrow()) {
        const call = this.parseArrow();
        if (call) items.push({ type: "call", call });
        continue;
      }
      const callStart = this.current().span.start;
      const name = this.qualifiedIdentifier();
      if (!name) {
        this.recoverStatement();
        continue;
      }
      const call = layoutNames.has(name as LayoutKind) && this.atSymbol("{")
        ? { name, positional: [], named: {} }
        : this.parseCallAfterName(name, callStart);
      if (!call) {
        this.recoverStatement();
        continue;
      }
      if (layoutNames.has(call.name as LayoutKind)) {
        const children = this.matchSymbol("{") ? this.parseReferenceBlock() : call.positional.map(String);
        items.push({ type: "layout", layout: { kind: call.name as LayoutKind, named: call.named, children, ...(call.span ? { span: call.span } : {}) } });
      } else items.push({ type: "call", call });
    }
    this.expectSymbol("}", `Figure ${id} is missing }.`);
    return { id, ...(title !== undefined ? { title } : {}), items, span: this.spanFrom(start) };
  }

  private parseParameters(): ComponentParameter[] {
    const parameters: ComponentParameter[] = [];
    while (!this.at("eof") && !this.atSymbol(")")) {
      const name = this.expectIdentifier("Expected a parameter name.");
      this.expectSymbol(":", "Expected : after the parameter name.");
      const type = this.expectIdentifier("Expected a parameter type.");
      if (!name || !type) break;
      if (!(["string", "number", "boolean", "tone", "paint", "length", "identifier"] as string[]).includes(type)) {
        this.error("syntax.invalid_component_parameter", `Unsupported component parameter type ${type}.`);
      }
      const hasDefault = this.matchSymbol("=");
      const defaultValue = hasDefault ? this.parseValueUntil(new Set([",", ")"])) : undefined;
      parameters.push({
        name,
        type: (["string", "number", "boolean", "tone", "paint", "length", "identifier"] as string[]).includes(type) ? type as ComponentParameter["type"] : "string",
        required: !hasDefault,
        ...(hasDefault && defaultValue !== undefined ? { default: defaultValue } : {}),
      });
      if (!this.matchSymbol(",")) break;
    }
    return parameters;
  }

  private parseBinding(): ParsedBinding | undefined {
    const start = this.current().span.start;
    const id = this.qualifiedIdentifier();
    if (!id) this.error("syntax.invalid_binding", "Expected a binding name.");
    if (!id || !this.expectSymbol("=", "Expected = after the binding name.")) return undefined;
    const call = this.looksLikeArrow() ? this.parseArrow() : this.parseCall();
    if (!call) return undefined;
    if (!this.matchSymbol("{")) return { id, call, span: this.spanFrom(start) };

    const children: ParsedBinding[] = [];
    while (!this.at("eof") && !this.atSymbol("}")) {
      const child = this.parseBinding();
      if (child) children.push(child);
      else this.recoverStatement();
    }
    this.expectSymbol("}", `Group ${id} is missing }.`);
    return { id, call, children, span: this.spanFrom(start) };
  }

  private parseLayout(requireBlock: boolean): ParsedLayout | undefined {
    const start = this.current().span.start;
    const name = this.qualifiedIdentifier();
    const call = name && layoutNames.has(name as LayoutKind) && this.atSymbol("{")
      ? { name, positional: [], named: {} }
      : name ? this.parseCallAfterName(name, start) : undefined;
    if (!call || !layoutNames.has(call.name as LayoutKind)) {
      this.error("syntax.invalid_layout", "Expected a layout expression.");
      return undefined;
    }
    if (this.matchSymbol("{")) return { kind: call.name as LayoutKind, named: call.named, children: this.parseReferenceBlock(), span: this.spanFrom(start) };
    if (requireBlock) this.error("syntax.invalid_layout", `Layout ${call.name} requires a child block.`);
    return { kind: call.name as LayoutKind, named: call.named, children: call.positional.map(String), span: this.spanFrom(start) };
  }

  private parseReferenceBlock(): string[] {
    const children: string[] = [];
    while (!this.at("eof") && !this.atSymbol("}")) {
      const child = this.qualifiedIdentifier();
      if (child) children.push(child);
      else {
        this.error("syntax.invalid_layout_child", "Layout child references must be identifiers.");
        this.advance();
      }
      this.matchSymbol(",");
    }
    this.expectSymbol("}", "Layout block is missing }.");
    return children;
  }

  private parseTimeline(): Timeline | undefined {
    this.advance();
    const id = this.expectIdentifier("Expected a timeline identifier.");
    if (!id || !this.expectSymbol("{", "Expected { before the timeline body.")) return undefined;
    const states: Timeline["states"] = [];
    const transitions: Timeline["transitions"] = [];
    const stateIds = new Set<string>();
    while (!this.at("eof") && !this.atSymbol("}")) {
      if (this.atIdentifier("state")) {
        this.advance();
        const stateId = this.expectIdentifier("Expected a state identifier.");
        if (!stateId || !this.expectSymbol("{", "Expected { before state operations.")) {
          this.recoverStatement();
          continue;
        }
        const operations: Timeline["states"][number]["operations"] = [];
        while (!this.at("eof") && !this.atSymbol("}")) {
          const call = this.parseCall();
          if (!call) {
            this.recoverStatement();
            continue;
          }
          if (["show", "hide", "focus", "trace"].includes(call.name)) {
            if (call.positional.length < 1 || Object.keys(call.named).length) this.error("semantic.invalid_timeline_action_arguments", `${call.name} requires at least one target and no named arguments.`);
            else operations.push({ action: call.name as "show", targets: call.positional.map(String) });
          } else if (call.name === "set") {
            if (call.positional.length !== 1 || Object.keys(call.named).length === 0) this.error("semantic.invalid_timeline_action_arguments", "set requires exactly one target and at least one property.");
            else operations.push({ action: "set", targets: [String(call.positional[0])], properties: call.named });
          } else if (call.name === "morph") {
            if (call.positional.length !== 2 || Object.keys(call.named).length) this.error("semantic.invalid_timeline_action_arguments", "morph requires exactly two targets and no named arguments.");
            else operations.push({ action: "morph", targets: call.positional.map(String) as [string, string] });
          } else this.error("semantic.unknown_timeline_action", `Unknown timeline action ${call.name}.`);
        }
        this.expectSymbol("}", `State ${stateId} is missing }.`);
        if (stateIds.has(stateId)) this.error("semantic.duplicate_timeline_state", `Timeline ${id} declares state ${stateId} more than once.`);
        else { stateIds.add(stateId); states.push({ id: stateId, operations }); }
      } else if (this.atIdentifier("transition")) {
        this.advance();
        const from = this.expectIdentifier("Expected a transition source state.");
        if (!this.match("arrow")) this.error("syntax.invalid_transition", "Expected -> between transition states.");
        const to = this.expectIdentifier("Expected a transition target state.");
        let duration: string | undefined;
        if (this.matchSymbol("(")) {
          const call = this.parseArguments();
          for (const name of Object.keys(call.named)) if (name !== "duration") this.error("semantic.unknown_transition_option", `Transition has no option named ${name}.`);
          if (call.positional.length) this.error("semantic.excess_transition_argument", "Transition options must be named.");
          duration = typeof call.named.duration === "string" ? call.named.duration : undefined;
          if (call.named.duration !== undefined && (typeof call.named.duration !== "string" || !TIMELINE_DURATIONS.includes(call.named.duration as (typeof TIMELINE_DURATIONS)[number]))) this.error("semantic.invalid_transition_duration", `Transition duration must be ${TIMELINE_DURATIONS.join(", ")}.`);
          this.expectSymbol(")", "Expected ) after transition options.");
        }
        if (from && to) transitions.push({ from, to, ...(duration ? { duration } : {}) });
      } else {
        this.error("syntax.invalid_timeline_statement", `Unexpected timeline token ${this.current().raw}.`);
        this.recoverStatement();
      }
    }
    this.expectSymbol("}", `Timeline ${id} is missing }.`);
    const known = new Set(states.map(({ id: stateId }) => stateId));
    for (const transition of transitions) if (!known.has(transition.from) || !known.has(transition.to)) this.error("semantic.unknown_timeline_state", `Transition ${transition.from} -> ${transition.to} references an unknown state.`);
    const transitionIds = new Set<string>();
    for (const transition of transitions) {
      const key = `${transition.from}->${transition.to}`;
      if (transitionIds.has(key)) this.error("semantic.duplicate_timeline_transition", `Transition ${transition.from} -> ${transition.to} is declared more than once.`);
      transitionIds.add(key);
    }
    return { id, states, transitions };
  }

  private parseCall(): ParsedCall | undefined {
    const start = this.current().span.start;
    const name = this.qualifiedIdentifier();
    return name ? this.parseCallAfterName(name, start) : undefined;
  }

  private parseCallAfterName(name: string, start = this.current().span.start): ParsedCall | undefined {
    if (!this.expectSymbol("(", `Expected ( after ${name}.`)) return undefined;
    const args = this.parseArguments();
    this.expectSymbol(")", `Expected ) after ${name} arguments.`);
    return { name, ...args, span: this.spanFrom(start) };
  }

  private parseArguments() {
    const positional: VisualValue[] = [];
    const named: Record<string, VisualValue> = {};
    while (!this.at("eof") && !this.atSymbol(")")) {
      if (this.current().kind === "identifier" && this.peek().value === ":") {
        const keyToken = this.advance();
        const key = keyToken.value;
        this.advance();
        if (key in named) this.diagnostics.push(diagnostic("semantic.duplicate_named_argument", `Argument ${key} is provided more than once.`, keyToken.span));
        named[key] = this.parseValueUntil(new Set([",", ")"]));
      } else positional.push(this.parseValueUntil(new Set([",", ")"])));
      if (!this.matchSymbol(",")) break;
    }
    return { positional, named };
  }

  private parseArrow(): ParsedCall | undefined {
    const start = this.current().span.start;
    const from = this.qualifiedIdentifier();
    if (!from || !this.match("arrow")) {
      this.error("syntax.invalid_connector", "Expected a connector expression with ->.");
      return undefined;
    }
    const to = this.qualifiedIdentifier();
    if (!to) return undefined;
    const named: Record<string, VisualValue> = {};
    if (this.matchSymbol("(")) {
      if (this.current().kind === "string" && this.peek().value === ")") named.label = this.advance().value;
      else {
        const args = this.parseArguments();
        Object.assign(named, args.named);
        if (args.positional[0] !== undefined) named.label = args.positional[0];
      }
      this.expectSymbol(")", "Expected ) after connector options.");
    }
    return { name: "connect", positional: [from, to], named, span: this.spanFrom(start) };
  }

  private parseValueUntil(stops: Set<string>): VisualValue {
    if (this.atSymbol("[")) {
      this.advance();
      const values: Array<string | number | boolean> = [];
      while (!this.at("eof") && !this.atSymbol("]")) {
        const value = this.parseValueUntil(new Set([",", "]"]));
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") values.push(value);
        else this.error("syntax.nested_list", "Nested list values are not supported.");
        if (!this.matchSymbol(",")) break;
      }
      this.expectSymbol("]", "Expected ] after list values.");
      return values;
    }
    const start = this.index;
    let depth = 0;
    while (!this.at("eof")) {
      const token = this.current();
      if (depth === 0 && stops.has(token.value)) break;
      if (token.value === "(" || token.value === "[") depth += 1;
      if (token.value === ")" || token.value === "]") depth -= 1;
      this.advance();
    }
    const tokens = this.tokens.slice(start, this.index);
    if (tokens.length === 1) return tokenValue(tokens[0]!);
    const raw = tokens.map(({ raw: token }) => token).join("");
    return /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }

  private qualifiedIdentifier(): string | undefined {
    if (this.current().kind !== "identifier") {
      this.error("syntax.expected_identifier", `Expected an identifier, received ${this.current().raw}.`);
      return undefined;
    }
    let value = this.advance().value;
    while (this.matchSymbol(".")) {
      const part = this.expectIdentifier("Expected an identifier after .");
      if (!part) break;
      value += `.${part}`;
    }
    return value;
  }

  private looksLikeArrow() {
    let offset = 0;
    if (this.peek(offset).kind !== "identifier") return false;
    offset += 1;
    while (this.peek(offset).value === "." && this.peek(offset + 1).kind === "identifier") offset += 2;
    return this.peek(offset).kind === "arrow";
  }

  private looksLikeBinding() {
    let offset = 0;
    if (this.peek(offset).kind !== "identifier") return false;
    offset += 1;
    while (this.peek(offset).value === "." && this.peek(offset + 1).kind === "identifier") offset += 2;
    return this.peek(offset).value === "=";
  }

  private recoverStatement() {
    while (!this.at("eof") && !this.atSymbol("}")) {
      if (this.current().kind === "identifier" && (this.peek().value === "=" || ["return", "state", "transition", "timeline"].includes(this.current().value))) return;
      this.advance();
    }
  }

  private recoverDeclaration<T>(): T | undefined {
    while (!this.at("eof") && !this.atSymbol("}")) this.advance();
    this.matchSymbol("}");
    return undefined;
  }

  private expectIdentifier(message: string) {
    if (this.current().kind === "identifier") return this.advance().value;
    this.error("syntax.expected_identifier", message);
    return undefined;
  }

  private expectSymbol(symbol: string, message: string) {
    if (this.matchSymbol(symbol)) return true;
    if (this.at("eof")) {
      const span = this.current().span;
      this.diagnostics.push({
        ...diagnostic("syntax.expected_token", message, span),
        repair: { description: `Insert ${symbol}.`, edits: [{ span, text: symbol }] },
      });
      return false;
    }
    this.error("syntax.expected_token", message);
    return false;
  }

  private matchSymbol(symbol: string) { return this.atSymbol(symbol) ? Boolean(this.advance()) : false; }
  private atSymbol(symbol: string) { return this.current().kind === "symbol" && this.current().value === symbol; }
  private atIdentifier(value: string) { return this.current().kind === "identifier" && this.current().value === value; }
  private match(kind: TokenKind) { return this.at(kind) ? Boolean(this.advance()) : false; }
  private at(kind: TokenKind) { return this.current().kind === kind; }
  private current() { return this.tokens[Math.min(this.index, this.tokens.length - 1)]!; }
  private previous() { return this.tokens[Math.max(0, Math.min(this.index - 1, this.tokens.length - 1))]!; }
  private peek(offset = 1) { return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!; }
  private advance() { return this.tokens[Math.min(this.index++, this.tokens.length - 1)]!; }
  private error(code: string, message: string) { this.diagnostics.push(diagnostic(code, message, this.current().span)); }
  private spanFrom(start: SourceSpan["start"]): SourceSpan { return { start, end: this.previous().span.end }; }
}

function tokenize(source: string, diagnostics: Diagnostic[]): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  const point = () => ({ line, column, offset: index });
  const advance = () => {
    const character = source[index++]!;
    if (character === "\n") { line += 1; column = 1; } else column += 1;
    return character;
  };
  const push = (kind: TokenKind, value: string, raw: string, start: ReturnType<typeof point>) => tokens.push({ kind, value, raw, span: { start, end: point() } });

  while (index < source.length) {
    const character = source[index]!;
    if (/\s/.test(character)) { advance(); continue; }
    if (character === "/" && source[index + 1] === "/") {
      while (index < source.length && source[index] !== "\n") advance();
      continue;
    }
    const start = point();
    if (character === '"') {
      let raw = advance();
      let value = "";
      let closed = false;
      while (index < source.length) {
        const next = advance();
        raw += next;
        if (next === '"') { closed = true; break; }
        if (next === "\\") {
          if (index >= source.length) break;
          const escaped = advance();
          raw += escaped;
          value += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
        } else value += next;
      }
      if (!closed) {
        const end = point();
        const insertion = { start: end, end };
        diagnostics.push({
          ...diagnostic("syntax.unterminated_string", "String literal is missing a closing quote.", { start, end }),
          repair: { description: "Close the string literal.", edits: [{ span: insertion, text: '"' }] },
        });
      }
      push("string", value, raw, start);
      continue;
    }
    if (character === "-" && source[index + 1] === ">") {
      advance(); advance(); push("arrow", "->", "->", start); continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      let raw = "";
      while (index < source.length && /[A-Za-z0-9_$-]/.test(source[index]!)) raw += advance();
      push("identifier", raw, raw, start);
      continue;
    }
    if (/\d/.test(character)) {
      let raw = "";
      while (index < source.length && /[\d.]/.test(source[index]!)) raw += advance();
      push("number", raw, raw, start);
      continue;
    }
    if ("(){}[]:,=. +*/-".includes(character) && character !== " ") {
      const raw = advance(); push("symbol", raw, raw, start); continue;
    }
    advance();
    diagnostics.push(diagnostic("syntax.invalid_character", `Unexpected character ${character}.`, { start, end: point() }));
  }
  const at = point();
  tokens.push({ kind: "eof", value: "", raw: "end of source", span: { start: at, end: at } });
  return tokens;
}

function tokenValue(token: Token): VisualValue {
  if (token.kind === "string") return token.value;
  if (token.kind === "number") return Number(token.value);
  if (token.kind === "identifier" && (token.value === "true" || token.value === "false")) return token.value === "true";
  if (token.kind === "identifier" && ["xs", "sm", "md", "lg", "xl"].includes(token.value)) return `$space.${token.value}`;
  return token.value;
}
