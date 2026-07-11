import { diagnostic, type Diagnostic, type SourceSpan } from "../diagnostics.js";
import type {
  EntitySyntax,
  FlowSyntax,
  RelationshipSyntax,
  StoryStepSyntax,
  StorySyntax,
  StoryTargetSyntax,
  SyntaxDocument,
  SyntaxProperty,
  SyntaxStatement,
} from "./syntax.js";
import { tokenize, type Token, type TokenKind } from "./tokenizer.js";

type ParsedArguments = {
  positional: Array<{ value: string; span: SourceSpan }>;
  properties: SyntaxProperty[];
  end: SourceSpan;
};

class Parser {
  readonly diagnostics: Diagnostic[];
  readonly statements: SyntaxStatement[] = [];
  incomplete: boolean;
  #index = 0;

  constructor(
    private readonly tokens: Token[],
    diagnostics: Diagnostic[],
    incomplete: boolean,
  ) {
    this.diagnostics = [...diagnostics];
    this.incomplete = incomplete;
  }

  parse(): SyntaxDocument {
    this.skipNewlines();
    this.parseFlow();
    this.skipNewlines();
    if (!this.at("eof")) {
      this.diagnostics.push(
        diagnostic("syntax.multiple_documents", "A source file may contain only one visual document.", this.current()?.span),
      );
    }
    return { statements: this.statements, diagnostics: this.diagnostics, incomplete: this.incomplete };
  }

  private parseFlow() {
    const keyword = this.takeIdentifier("syntax.expected_composition", "Expected a flow declaration.");
    if (!keyword) return;
    if (keyword.value !== "flow") {
      this.diagnostics.push(
        diagnostic(
          "semantic.unsupported_composition",
          `Composition ${keyword.value} is not implemented yet.`,
          keyword.span,
        ),
      );
    }
    const id = this.takeIdentifier("syntax.expected_flow_id", "Expected a visual identifier.");
    if (!id) return;

    let title: Token | undefined;
    if (this.match("left_paren")) {
      title = this.matchToken("string");
      this.take("right_paren", "syntax.expected_right_paren", "Expected ) after the visual title.");
    }

    const open = this.take("left_brace", "syntax.expected_left_brace", "Expected { to begin the visual body.");
    const flow: FlowSyntax = {
      type: "flow",
      id: id.value,
      span: mergeSpan(keyword.span, (open ?? title ?? id).span),
      ...(title ? { title: title.value } : {}),
    };
    this.statements.push(flow);
    if (!open) return;

    while (!this.at("right_brace") && !this.at("eof")) {
      this.skipNewlines();
      if (this.at("right_brace") || this.at("eof")) break;
      if (this.current()?.kind === "identifier" && this.current()?.value === "story") {
        this.parseStory();
      } else {
        this.parseVisualStatement();
      }
      this.skipNewlines();
    }
    this.closeBlock("visual");
  }

  private parseVisualStatement() {
    const first = this.parseReference();
    if (!first) {
      this.skipStatement();
      return;
    }

    if (this.match("equals")) {
      const expressionStart = this.parseReference();
      if (!expressionStart) {
        this.skipStatement();
        return;
      }
      if (this.match("arrow")) {
        this.parseRelationship(first.value, expressionStart, first.span);
      } else {
        this.parseEntity(first, expressionStart);
      }
      return;
    }

    if (this.match("arrow")) {
      this.parseRelationship(undefined, first, first.span);
      return;
    }

    this.diagnostics.push(
      diagnostic(
        "syntax.expected_assignment_or_relationship",
        "Expected = for a declaration or -> for a relationship.",
        first.span,
      ),
    );
    this.skipStatement();
  }

  private parseEntity(id: { value: string; span: SourceSpan }, constructor: { value: string; span: SourceSpan }) {
    const args = this.parseArguments();
    if (!args) {
      this.skipStatement();
      return;
    }
    const label = args.positional[0];
    if (args.positional.length > 1) {
      this.diagnostics.push(
        diagnostic(
          "syntax.unexpected_positional_argument",
          "Entity constructors accept at most one positional label.",
          args.positional[1]?.span,
        ),
      );
    }
    const statement: EntitySyntax = {
      type: "entity",
      id: id.value,
      constructor: constructor.value,
      properties: args.properties,
      span: mergeSpan(id.span, args.end),
      ...(label ? { label: label.value } : {}),
    };
    this.statements.push(statement);
  }

  private parseRelationship(
    id: string | undefined,
    from: { value: string; span: SourceSpan },
    start: SourceSpan,
  ) {
    const to = this.parseReference();
    if (!to) {
      this.diagnostics.push(
        diagnostic("syntax.expected_relationship_target", "Expected a reference after ->.", this.current()?.span),
      );
      this.skipStatement();
      return;
    }
    const args = this.at("left_paren")
      ? this.parseArguments()
      : { positional: [], properties: [], end: to.span } satisfies ParsedArguments;
    if (!args) return;
    const label = args.positional[0];
    if (args.positional.length > 1) {
      this.diagnostics.push(
        diagnostic(
          "syntax.unexpected_positional_argument",
          "Relationships accept at most one positional label.",
          args.positional[1]?.span,
        ),
      );
    }
    const statement: RelationshipSyntax = {
      type: "relationship",
      from: from.value,
      to: to.value,
      properties: args.properties,
      span: mergeSpan(start, args.end),
      ...(id ? { id } : {}),
      ...(label ? { label: label.value } : {}),
    };
    this.statements.push(statement);
  }

  private parseStory() {
    const keyword = this.advance()!;
    const open = this.take("left_brace", "syntax.expected_left_brace", "Expected { after story.");
    const story: StorySyntax = { type: "story", span: mergeSpan(keyword.span, (open ?? keyword).span) };
    this.statements.push(story);
    if (!open) return;

    while (!this.at("right_brace") && !this.at("eof")) {
      this.skipNewlines();
      if (this.at("right_brace") || this.at("eof")) break;
      this.parseStoryStep();
      this.skipNewlines();
    }
    this.closeBlock("story");
  }

  private parseStoryStep() {
    const action = this.takeIdentifier("syntax.expected_story_action", "Expected a story action.");
    if (!action) {
      this.skipStatement();
      return;
    }
    const open = this.take("left_paren", "syntax.expected_left_paren", "Expected ( after the story action.");
    if (!open) {
      this.skipStatement();
      return;
    }

    const targets: StoryTargetSyntax[] = [];
    const properties: SyntaxProperty[] = [];
    while (!this.at("right_paren") && !this.at("eof") && !this.at("newline")) {
      const first = this.parseReference();
      if (!first) {
        this.skipToCallEnd();
        break;
      }
      if (this.match("colon")) {
        const value = this.takeValue("syntax.expected_property_value", "Expected a named argument value.");
        if (value) properties.push({ name: first.value, value: value.value, span: mergeSpan(first.span, value.span) });
      } else if (this.match("arrow")) {
        const to = this.parseReference();
        if (to) targets.push({ type: "relationship", from: first.value, to: to.value });
      } else {
        targets.push({ type: "reference", value: first.value });
      }
      if (!this.match("comma") && !this.at("right_paren")) {
        this.diagnostics.push(
          diagnostic("syntax.expected_comma", "Expected , between action arguments.", this.current()?.span),
        );
        this.skipToCallEnd();
      }
    }
    const close = this.take("right_paren", "syntax.expected_right_paren", "Expected ) after story arguments.");
    const statement: StoryStepSyntax = {
      type: "story_step",
      action: action.value,
      targets,
      properties,
      span: mergeSpan(action.span, (close ?? this.previous() ?? action).span),
    };
    this.statements.push(statement);
  }

  private parseArguments(): ParsedArguments | undefined {
    const open = this.take("left_paren", "syntax.expected_left_paren", "Expected constructor or relationship arguments.");
    if (!open) return undefined;
    const positional: ParsedArguments["positional"] = [];
    const properties: SyntaxProperty[] = [];

    while (!this.at("right_paren") && !this.at("eof") && !this.at("newline")) {
      const candidate = this.takeValue("syntax.expected_argument", "Expected an argument.");
      if (!candidate) {
        this.skipToCallEnd();
        break;
      }
      if (candidate.kind === "identifier" && this.match("colon")) {
        const value = this.takeValue("syntax.expected_property_value", "Expected a named argument value.");
        if (value) {
          properties.push({ name: candidate.value, value: value.value, span: mergeSpan(candidate.span, value.span) });
        }
      } else {
        positional.push({ value: candidate.value, span: candidate.span });
      }
      if (!this.match("comma") && !this.at("right_paren")) {
        this.diagnostics.push(
          diagnostic("syntax.expected_comma", "Expected , between arguments.", this.current()?.span),
        );
        this.skipToCallEnd();
      }
    }
    const close = this.take("right_paren", "syntax.expected_right_paren", "Expected ) after arguments.");
    return { positional, properties, end: (close ?? this.previous() ?? open).span };
  }

  private parseReference(): { value: string; span: SourceSpan } | undefined {
    const first = this.matchToken("identifier");
    if (!first) return undefined;
    let value = first.value;
    let end = first.span;
    while (this.match("dot")) {
      const part = this.takeIdentifier("syntax.expected_reference_part", "Expected an identifier after .");
      if (!part) break;
      value += `.${part.value}`;
      end = part.span;
    }
    return { value, span: mergeSpan(first.span, end) };
  }

  private closeBlock(name: string) {
    if (this.match("right_brace")) return;
    this.incomplete = true;
    this.diagnostics.push(
      diagnostic("syntax.incomplete_block", `The ${name} block is missing a closing }.`, this.current()?.span),
    );
  }

  private skipStatement() {
    while (!this.at("newline") && !this.at("right_brace") && !this.at("eof")) this.advance();
  }

  private skipToCallEnd() {
    while (!this.at("right_paren") && !this.at("newline") && !this.at("eof")) this.advance();
  }

  private skipNewlines() {
    while (this.match("newline")) {}
  }

  private takeIdentifier(code: string, message: string) {
    return this.take("identifier", code, message);
  }

  private takeValue(code: string, message: string) {
    const value = this.matchToken("identifier") ?? this.matchToken("string");
    if (!value) this.diagnostics.push(diagnostic(code, message, this.current()?.span));
    return value;
  }

  private take(kind: TokenKind, code: string, message: string) {
    const token = this.matchToken(kind);
    if (!token) this.diagnostics.push(diagnostic(code, message, this.current()?.span));
    return token;
  }

  private at(kind: TokenKind) {
    return this.current()?.kind === kind;
  }

  private match(kind: TokenKind) {
    return Boolean(this.matchToken(kind));
  }

  private matchToken(kind: TokenKind) {
    if (!this.at(kind)) return undefined;
    return this.advance();
  }

  private current() {
    return this.tokens[this.#index];
  }

  private previous() {
    return this.tokens[this.#index - 1];
  }

  private advance() {
    const token = this.current();
    if (token && token.kind !== "eof") this.#index += 1;
    return token;
  }
}

function mergeSpan(start: SourceSpan, end: SourceSpan): SourceSpan {
  return { start: start.start, end: end.end };
}

export function parse(source: string): SyntaxDocument {
  const result = tokenize(source);
  return new Parser(result.tokens, result.diagnostics, result.incomplete).parse();
}
