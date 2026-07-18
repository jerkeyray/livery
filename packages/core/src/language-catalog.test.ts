import { describe, expect, it } from "vitest";
import { applyDiagnosticFix, compileVisual, createAgentGuide, getLanguageCatalog, LIVERY_AGENT_GUIDE } from "./index.js";

function position(offset: number) {
  return { line: 1, column: offset + 1, offset };
}

describe("language intelligence", () => {
  it("exposes deterministic language and standard-library metadata", () => {
    const catalog = getLanguageCatalog();
    expect(catalog.keywords).toContain("figure");
    expect(catalog.primitives).toContain("path");
    expect(catalog.primitives).toContain("connect");
    expect(catalog.layouts.map(({ name }) => name)).toContain("grid");
    expect(catalog.layouts.find(({ name }) => name === "row")).toMatchObject({
      status: "supported",
      contexts: ["figure", "component"],
      parameters: expect.arrayContaining([expect.objectContaining({ name: "align", values: ["start", "center", "end", "stretch"] })]),
    });
    expect(catalog.calls.find(({ name }) => name === "connect")).toMatchObject({
      category: "connector",
      named: expect.arrayContaining([expect.objectContaining({ name: "variant", values: ["directional", "bidirectional", "async", "data", "advisory"] })]),
    });
    expect(catalog.calls.find(({ name }) => name === "morph")).toMatchObject({ status: "unsupported" });
    expect(catalog.tokens).toContain("color.accent");
    expect(catalog.icons).toContain("credit-card");
    expect(catalog.components.find(({ name }) => name === "database")).toMatchObject({ category: "storage", status: "supported", sizing: { minWidth: expect.any(Number) }, examples: [expect.any(String)] });
    expect(catalog.components.find(({ name }) => name === "barChart")).toMatchObject({ category: "chart", status: "experimental" });
    expect(catalog.components.find(({ name }) => name === "entity")).toMatchObject({
      category: "schema",
      parameters: expect.arrayContaining([expect.objectContaining({ name: "fields", type: "list", itemType: "record", maxItems: 24 })]),
    });
    expect(catalog.families).toHaveLength(30);
    expect(new Set(catalog.families.map(({ id }) => id)).size).toBe(catalog.families.length);
    expect(new Set(catalog.families.map(({ kernel }) => kernel))).toEqual(new Set([
      "ranked-graph", "interaction-lanes", "temporal-schedule", "hierarchy-tree", "quantitative-plot", "spatial-editorial",
    ]));
    expect(catalog.families.find(({ id }) => id === "sequence")).toMatchObject({
      kernel: "interaction-lanes",
      status: "foundation",
      capabilities: expect.arrayContaining(["participants", "messages", "fragments"]),
    });
    expect(getLanguageCatalog()).toEqual(catalog);
  });

  it("generates compact, generation, and reference guides from the same catalog", () => {
    expect(LIVERY_AGENT_GUIDE).toBe(createAgentGuide({ mode: "compact" }));
    expect(LIVERY_AGENT_GUIDE).toContain("database");
    expect(LIVERY_AGENT_GUIDE).not.toContain("morph");
    expect(LIVERY_AGENT_GUIDE).toContain("iconColor");
    expect(createAgentGuide({ mode: "reference" })).toContain("barChart [experimental, chart]");
    const generation = createAgentGuide({ mode: "generation" });
    expect(generation).toContain("Exact generation contract:");
    expect(generation).toContain("Canonical grouped example:");
    expect(generation).toContain("qualified IDs");
    expect(LIVERY_AGENT_GUIDE.trim().split(/\s+/).length).toBeLessThan(300);
  });

  it("applies deterministic non-overlapping diagnostic edits", () => {
    const source = "figure demo {\n  box = box()\n";
    const fixed = applyDiagnosticFix(source, {
      code: "syntax.incomplete_block",
      severity: "error",
      message: "Close the figure block.",
      repair: {
        description: "Close the block.",
        edits: [{ span: { start: position(source.length), end: position(source.length) }, text: "}\n" }],
      },
    });
    expect(fixed).toBe(`${source}}\n`);
  });

  it("rejects malformed or overlapping diagnostic edits", () => {
    const span = (start: number, end: number) => ({ start: position(start), end: position(end) });
    expect(applyDiagnosticFix("abcdef", {
      code: "test",
      severity: "error",
      message: "test",
      repair: { description: "test", edits: [{ span: span(1, 4), text: "x" }, { span: span(3, 5), text: "y" }] },
    })).toBeUndefined();
  });

  it("attaches source edits to incomplete visual syntax", () => {
    const source = 'figure demo("Demo") {';
    const result = compileVisual(source);
    const fixable = result.diagnostics.find(({ repair }) => repair?.edits?.length);
    expect(fixable).toBeDefined();
    expect(applyDiagnosticFix(source, fixable!)).toContain("}");
  });
});
