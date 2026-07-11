import { describe, expect, it } from "vitest";

import { compile } from "./compiler.js";
import { formatArtifact } from "./language/formatter.js";
import { parse } from "./language/parser.js";
import { tokenize } from "./language/tokenizer.js";
import { renderToText } from "./text.js";

const checkout = `flow checkout("Checkout request") {
  customer = actor("Customer")
  api = service("Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  submission = customer -> api("submit order")
  authorization = api -> payment("authorize")
  approval = payment -> api("approved", tone: success)
  persistence = api -> orders("persist")

  story {
    reveal(customer, api)
    trace(submission)
    focus(payment)
    reveal(orders)
  }
}`;

describe("tokenize", () => {
  it("retains blocks, arrows, strings, and source positions", () => {
    const result = tokenize(checkout);

    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.some(({ kind }) => kind === "left_brace")).toBe(true);
    expect(result.tokens.filter(({ kind }) => kind === "arrow")).toHaveLength(4);
    expect(result.tokens.find(({ value }) => value === "Checkout request")?.span.start).toEqual({
      line: 1,
      column: 15,
      offset: 14,
    });
  });

  it("marks an unterminated final string as incomplete", () => {
    const result = tokenize('flow checkout("Checkout');

    expect(result.incomplete).toBe(true);
    expect(result.diagnostics.map(({ code }) => code)).toContain("syntax.incomplete_string");
  });

  it("ignores line comments without losing the following statement", () => {
    const result = compile(`flow comments {
      // This relationship is intentionally direct.
      client -> api("call")
    }`);

    expect(result.diagnostics).toEqual([]);
    expect(result.artifact?.relationships).toHaveLength(1);
  });
});

describe("parse", () => {
  it("produces flow, relationship, story, and story-step syntax", () => {
    const document = parse(checkout);

    expect(document.diagnostics).toEqual([]);
    expect(document.statements.map(({ type }) => type)).toEqual([
      "flow",
      "entity",
      "entity",
      "entity",
      "entity",
      "relationship",
      "relationship",
      "relationship",
      "relationship",
      "story",
      "story_step",
      "story_step",
      "story_step",
      "story_step",
    ]);
  });
});

describe("compile", () => {
  it("creates a canonical artifact with inferred entities and stable relationships", () => {
    const result = compile(checkout);

    expect(result.diagnostics).toEqual([]);
    expect(result.artifact).toMatchObject({
      type: "livery",
      version: "0.1",
      id: "checkout",
      title: "Checkout request",
      composition: "flow",
    });
    expect(result.artifact?.entities.map(({ id }) => id)).toEqual(["customer", "api", "payment", "orders"]);
    expect(result.artifact?.relationships[2]).toMatchObject({ id: "approval", tone: "success" });
    expect(result.artifact?.story).toHaveLength(4);
  });

  it("accepts equivalent canonical JSON", () => {
    const compiled = compile(checkout).artifact!;
    const result = compile(structuredClone(compiled) as unknown as Record<string, unknown>);

    expect(result.diagnostics).toEqual([]);
    expect(result.artifact).toEqual(compiled);
  });

  it("does not let canonical JSON bypass semantic reference validation", () => {
    const artifact = compile(checkout).artifact!;
    artifact.relationships[0]!.to = "missing";
    const result = compile(artifact as unknown as Record<string, unknown>);

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("semantic.unknown_entity_reference");
  });

  it("formats deterministically and compiles the formatted source equivalently", () => {
    const artifact = compile(checkout).artifact!;
    const formatted = formatArtifact(artifact);
    const roundTrip = compile(formatted).artifact;

    expect(formatArtifact(roundTrip!)).toBe(formatted);
    expect(roundTrip).toEqual(artifact);
  });

  it("produces a readable text fallback", () => {
    const text = renderToText(compile(checkout).artifact!);

    expect(text).toContain("Customer -> Checkout API: submit order");
    expect(text).toContain("2. trace submission");
  });

  it("supports concise flows with implicit entities", () => {
    const result = compile(`flow concise {
      browser -> api("request")
      api -> database("write")
    }`);

    expect(result.diagnostics).toEqual([]);
    expect(result.artifact?.entities.map(({ id }) => id)).toEqual(["browser", "api", "database"]);
  });

  it("keeps a partial artifact when the final block is incomplete", () => {
    const result = compile(`flow streaming {
      browser -> api("request")`);

    expect(result.incomplete).toBe(true);
    expect(result.diagnostics.map(({ code }) => code)).toContain("syntax.incomplete_block");
    expect(result.artifact?.relationships).toHaveLength(1);
  });

  it("rejects unknown named arguments instead of ignoring them", () => {
    const result = compile(`flow invalid {
      api -> database("write", color: purple)
    }`);

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("semantic.unknown_property");
  });

  it("uses one namespace for entities and assigned relationships", () => {
    const result = compile(`flow collision {
      request = actor("Request")
      request = client -> api("submit")
    }`);

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("semantic.duplicate_id");
  });
});
