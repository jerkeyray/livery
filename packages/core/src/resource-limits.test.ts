import { describe, expect, it } from "vitest";

import { compile } from "./compiler.js";
import { CompilerSession } from "./session.js";

describe("compiler resource limits", () => {
  it("rejects source before parsing when its character limit is exceeded", () => {
    const result = compile("flow oversized {}", { limits: { maxSourceLength: 8 } });

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["resource.max_source_length"]);
    expect(result.diagnostics[0]?.repair?.description).toContain("split the visual");
  });

  it("rejects excessive tokens and statements", () => {
    const source = `flow crowded {
      a = actor("A")
      b = actor("B")
    }`;
    const tokenLimited = compile(source, { limits: { maxTokens: 5 } });
    const statementLimited = compile(source, { limits: { maxStatements: 2 } });

    expect(tokenLimited.diagnostics.map(({ code }) => code)).toContain("resource.max_tokens");
    expect(statementLimited.diagnostics.map(({ code }) => code)).toContain("resource.max_statements");
    expect(tokenLimited.artifact).toBeUndefined();
    expect(statementLimited.artifact).toBeUndefined();
  });

  it("enforces artifact limits for DSL and canonical JSON", () => {
    const source = `flow entities {
      a = actor("A")
      b = actor("B")
    }`;
    const dsl = compile(source, { limits: { maxEntities: 1 } });
    const unrestricted = compile(source).artifact!;
    const json = compile(unrestricted as unknown as Record<string, unknown>, { limits: { maxEntities: 1 } });

    expect(dsl.diagnostics.map(({ code }) => code)).toContain("resource.max_entities");
    expect(json.diagnostics.map(({ code }) => code)).toContain("resource.max_entities");
    expect(dsl.artifact).toBeUndefined();
    expect(json.artifact).toBeUndefined();
  });

  it("passes custom limits through compiler sessions", () => {
    const session = new CompilerSession({ limits: { maxRelationships: 0 } });
    const revision = session.compile(`flow limited { a -> b("call") }`);

    expect(revision.diagnostics.map(({ code }) => code)).toContain("resource.max_relationships");
    expect(revision.artifact).toBeUndefined();
  });
});
