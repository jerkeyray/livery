import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileVisual, solvePinboard } from "@liveryscript/core";

describe("programmable visual fixtures", () => {
  for (const file of readdirSync(resolve("fixtures/visual")).sort()) {
    it(`compiles and lays out ${file} at proof widths`, () => {
      const result = compileVisual(readFileSync(resolve("fixtures/visual", file), "utf8"));
      expect(result.diagnostics).toEqual([]);
      for (const width of [320, 480, 720, 1024]) {
        const layout = solvePinboard(result.document!, { width });
        expect(layout.ok, layout.ok ? undefined : `${file} ${width}: ${layout.diagnostics.map(({ code }) => code).join(", ")}`).toBe(true);
        if (!layout.ok) continue;
        expect(layout.scene.elements.length).toBeGreaterThan(0);
        expect(layout.report.valid).toBe(true);
        expect(layout.scene.board.width).toBe(width);
      }
    });
  }
});
