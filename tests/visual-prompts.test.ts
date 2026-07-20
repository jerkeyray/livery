import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compileVisual } from "../packages/core/src/program.js";
import { solvePinboard } from "../packages/core/src/pinboard.js";
import { visualBenchmarkFixtures } from "../benchmarks/visual-fixtures.js";

type Prompt = { id: string; category: string; prompt: string };

describe("visual benchmark prompts", () => {
  const prompts = JSON.parse(readFileSync(resolve("benchmarks/visual-prompts.json"), "utf8")) as Prompt[];

  it("maintains at least twenty unique representative prompts", () => {
    expect(prompts.length).toBeGreaterThanOrEqual(20);
    expect(new Set(prompts.map(({ id }) => id)).size).toBe(prompts.length);
    expect([...new Set(prompts.map(({ category }) => category))]).toEqual(expect.arrayContaining([
      "architecture", "workflow", "agent", "state-machine", "dashboard", "sequence", "infographic",
    ]));
    expect(prompts.every(({ prompt }) => prompt.length >= 80)).toBe(true);
  });

  it("keeps executable canonical fixtures for every benchmark prompt", () => {
    expect(visualBenchmarkFixtures.map(({ id }) => id)).toEqual(prompts.map(({ id }) => id));
    for (const fixture of visualBenchmarkFixtures) {
      const compiled = compileVisual(fixture.source);
      expect(compiled.diagnostics, fixture.id).toEqual([]);
      for (const width of [360, 480, 720, 900, 1200]) {
        const layout = solvePinboard(compiled.document!, { width });
        expect(layout.ok, `${fixture.id} at ${width}px`).toBe(true);
        if (!layout.ok) continue;
        expect(layout.scene.elements.filter(({ id }) => fixture.nodes.includes(id))).toHaveLength(fixture.nodes.length);
        expect(layout.scene.connectors.map(({ id }) => id)).toEqual(fixture.connectors);
        expect(layout.report.metrics.crossingCount).toBe(0);
        expect(layout.report.metrics.overlappingSegmentCount).toBe(0);
        expect(layout.report.metrics.maximumNormalizedRouteLength).toBeLessThan(4);
        expect(layout.report.metrics.backtrackingCount).toBeLessThanOrEqual(1);
      }
    }
  }, 30_000);
});
