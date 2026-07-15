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
    expect(catalog.tokens).toContain("color.accent");
    expect(catalog.components.find(({ name }) => name === "database")).toMatchObject({ category: "storage", status: "supported", sizing: { minWidth: expect.any(Number) }, examples: [expect.any(String)] });
    expect(catalog.components.find(({ name }) => name === "barChart")).toMatchObject({ category: "chart", status: "experimental" });
    expect(getLanguageCatalog()).toEqual(catalog);
  });

  it("generates compact and reference guides from the same catalog", () => {
    expect(LIVERY_AGENT_GUIDE).toBe(createAgentGuide({ mode: "compact" }));
    expect(LIVERY_AGENT_GUIDE).toContain("database");
    expect(createAgentGuide({ mode: "reference" })).toContain("barChart [experimental, chart]");
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
