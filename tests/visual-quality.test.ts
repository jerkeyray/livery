import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  boardSceneToSvg,
  compileVisual,
  computeTimelineState,
  solvePinboard,
} from "@jerkeyray/core";
import { describe, expect, it } from "vitest";

const proofFixtures = [
  "checkout-board.livery",
  "agent-trace.livery",
  "mechanism.livery",
  "data-pipeline-canvas.livery",
  "scientific-motion.livery",
];

describe("visual quality regressions", () => {
  for (const file of proofFixtures) {
    it(`exports finite, bounded SVG for ${file}`, () => {
      const source = readFileSync(resolve("fixtures/visual", file), "utf8");
      const result = compileVisual(source);
      expect(result.diagnostics).toEqual([]);

      for (const width of [320, 480, 720, 1024]) {
        const layout = solvePinboard(result.document!, { width });
        expect(layout.ok).toBe(true);
        if (!layout.ok) continue;

        const svg = boardSceneToSvg(layout.scene);
        const outputHeight = layout.scene.board.height + (layout.scene.title ? 42 : 0);
        expect(svg).toContain(`viewBox="0 0 ${width} ${outputHeight}"`);
        expect(svg).not.toMatch(/(?:NaN|Infinity|undefined)/);
        expect(layout.report.metrics.crossingCount).toBe(0);
        expect(layout.report.metrics.normalizedRouteLength).toBeLessThanOrEqual(3);
        expect(Number.isFinite(layout.report.metrics.aspectImbalance)).toBe(true);
        expect(new Set(layout.scene.readingOrder).size).toBe(layout.scene.readingOrder.length);
        expect(layout.scene.elements.every(({ visualBounds }) =>
          visualBounds.x >= 0
          && visualBounds.y >= 0
          && visualBounds.x + visualBounds.width <= layout.scene.board.width
          && visualBounds.y + visualBounds.height <= layout.scene.board.height
        )).toBe(true);
      }
    });
  }

  it("keeps connector paths, arrowheads, and labels in one state group", () => {
    const { document } = compileVisual(readFileSync(resolve("fixtures/visual/checkout-board.livery"), "utf8"));
    const layout = solvePinboard(document!, { width: 720 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;

    const svg = boardSceneToSvg(layout.scene);
    for (const connector of layout.scene.connectors) {
      const group = svg.match(new RegExp(`<g data-livery-connector="${connector.id}"[^>]*>([\\s\\S]*?)</g>`))?.[1];
      expect(group).toContain(`data-livery-id="${connector.id}"`);
      expect(group).toContain("marker-end=");
      if (connector.label) expect(group).toContain(connector.label.text);
    }
  });

  it("uses stable family glyphs without category color", () => {
    const checks = [
      ["checkout-board.livery", ["person", "service"]],
      ["agent-trace.livery", ["agent", "tool", "model"]],
      ["data-pipeline-canvas.livery", ["table"]],
      ["scientific-motion.livery", ["note"]],
    ] as const;
    for (const [file, glyphs] of checks) {
      const { document } = compileVisual(readFileSync(resolve("fixtures/visual", file), "utf8"));
      const layout = solvePinboard(document!, { width: 720 });
      expect(layout.ok).toBe(true);
      if (!layout.ok) continue;
      const svg = boardSceneToSvg(layout.scene);
      for (const glyph of glyphs) expect(svg).toContain(`data-livery-glyph="${glyph}"`);
      expect(svg).not.toMatch(/data-livery-glyph="[^"]+"[^>]*(?:#2563eb|#7c3aed|#db2777|#c0264f)/);
    }
  });

  it("attaches every connector label to one routed segment", () => {
    for (const file of proofFixtures) {
      const { document } = compileVisual(readFileSync(resolve("fixtures/visual", file), "utf8"));
      const layout = solvePinboard(document!, { width: 720 });
      expect(layout.ok).toBe(true);
      if (!layout.ok) continue;
      for (const connector of layout.scene.connectors) {
        if (!connector.label) continue;
        const center = { x: connector.label.x + connector.label.width / 2, y: connector.label.y + connector.label.height / 2 };
        const attached = connector.points.slice(1).some((point, index) => {
          const previous = connector.points[index]!;
          if (previous.y === point.y) return center.x >= Math.min(previous.x, point.x) && center.x <= Math.max(previous.x, point.x) && Math.abs(center.y - point.y) <= 24;
          if (previous.x === point.x) return center.y >= Math.min(previous.y, point.y) && center.y <= Math.max(previous.y, point.y) && Math.abs(center.x - point.x) <= connector.label!.width / 2 + 20;
          return false;
        });
        expect(attached, `${file}:${connector.id}`).toBe(true);
      }
    }
  });

  it("preserves board geometry while timeline presentation changes", () => {
    const { document } = compileVisual(readFileSync(resolve("fixtures/visual/timeline.livery"), "utf8"));
    const layout = solvePinboard(document!, { width: 480 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;

    const timeline = document!.timelines[0]!;
    const requestSvg = boardSceneToSvg(layout.scene, {
      state: computeTimelineState(timeline, "request", layout.scene),
    });
    const authorizationSvg = boardSceneToSvg(layout.scene, {
      state: computeTimelineState(timeline, "authorization", layout.scene),
    });

    const viewBox = `viewBox="0 0 ${layout.scene.board.width} ${layout.scene.board.height + 42}"`;
    expect(requestSvg).toContain(viewBox);
    expect(authorizationSvg).toContain(viewBox);
    expect(requestSvg).toMatch(/data-livery-connector="authorize" opacity="0"/);
    expect(authorizationSvg).toMatch(/data-livery-connector="authorize" opacity="1" data-livery-traced="true"/);
    expect(authorizationSvg).toMatch(/data-livery-id="payment" opacity="1" data-livery-focused="true"/);
  });
});
