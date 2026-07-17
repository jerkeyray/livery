import { describe, expect, it } from "vitest";
import { boardSceneToSvg } from "./board-export.js";
import { computeTimelineState } from "./timeline.js";
import { solvePinboard } from "./pinboard.js";
import { compileVisual } from "./program.js";
import { canonicalTheme } from "./theme.js";

describe("board SVG export", () => {
  it("uses solved connector, canvas, transform, mask, and debug geometry", () => {
    const compiled = compileVisual(`component Art() {
 mask_shape = circle(x: 20, y: 20, width: 60, height: 60)
 shape = box(x: 20, y: 20, width: 60, height: 60, rotate: 20, mask: mask_shape)
 return canvas(width: 120, height: 100) {
  mask_shape
  shape
 }
}
figure export_test {
 art = Art()
 note = note("Result")
 edge = art.shape.right -> note.left("label")
 row(art, note, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 640 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = boardSceneToSvg(result.scene, { debug: true });
    expect(svg).toContain('role="img" aria-labelledby="export_test-title export_test-desc"');
    expect(svg).toContain('<title id="export_test-title">export_test</title>');
    expect(svg).toContain('data-livery-id="edge"');
    expect(svg).toContain('data-livery-id="art.shape"');
    expect(svg).toContain('mask="url(#art-shape-mask)"');
    expect(svg).toContain('transform="translate(0 0) rotate(20');
    expect(svg).toContain('data-livery-debug="true"');
    for (const point of result.scene.connectors[0]!.points) expect(svg).toContain(`${point.x} ${point.y}`);
  });

  it("groups connector state and applies focus and property overrides", () => {
    const compiled = compileVisual(`figure states("States") {
 a = service("A")
 b = service("B")
 edge = a.right -> b.left("send")
 row(a, b)
 timeline steps {
  state active {
   focus(b)
   trace(edge)
   set(b, fill: "$color.accentSoft")
   set(edge, tone: success)
  }
 }
}`);
    const result = solvePinboard(compiled.document!, { width: 480 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = computeTimelineState(compiled.document!.timelines[0]!, "active", result.scene);
    const svg = boardSceneToSvg(result.scene, { state });
    expect(svg).toContain('data-livery-connector="edge" opacity="1"');
    expect(svg).toContain('data-livery-focused="true"');
    expect(svg).toContain('data-livery-traced="true"');
    expect(svg).toContain('data-livery-id="a" opacity="0.62"');
    expect(svg).toContain('stroke="#49755c"');
    expect(svg).toContain('<marker id="states-arrow-edge"');
    expect(svg).toContain('fill="#49755c"');
    expect(svg).toContain('marker-end="url(#states-arrow-edge)"');
    expect(svg.match(/stroke="#c0264f"/g)).toHaveLength(1);
  });

  it("keeps short orthogonal jogs crisp instead of rendering wavy curves", () => {
    const compiled = compileVisual(`figure crisp {
 a = service("A")
 b = service("B")
 edge = a.bottom -> b.top("send")
 column(a, b)
}`);
    const result = solvePinboard(compiled.document!, { width: 480 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const connector = result.scene.connectors[0]!;
    const scene = {
      ...result.scene,
      connectors: [{ ...connector, points: [{ x: 100, y: 100 }, { x: 100, y: 112 }, { x: 106, y: 112 }, { x: 106, y: 200 }] }],
    };
    const svg = boardSceneToSvg(scene);
    const path = svg.match(/data-livery-id="edge" d="([^"]+)"/)?.[1];
    expect(path).toBe("M 100 100 L 100 112 L 106 112 L 106 200");
  });

  it("applies timeline transforms to stable canvas primitives", () => {
    const compiled = compileVisual(`component Plot() {
 dot = circle(x: 80, y: 40, width: 12, height: 12)
 return canvas(width: 140, height: 100) {
  dot
 }
}
figure moving {
 plot = Plot()
 row(plot)
 timeline motion {
  state shifted {
   set(plot.dot, translateX: -20, translateY: 12, scale: 1.5)
  }
 }
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = computeTimelineState(compiled.document!.timelines[0]!, "shifted", result.scene);
    const svg = boardSceneToSvg(result.scene, { state });
    expect(svg).toMatch(/data-livery-id="plot\.dot"[^>]*transform="translate\(-20 12\)[^"]*scale\(1\.5 1\.5\)/);
  });

  it("renders connector surface and traced state recipes", () => {
    const compiled = compileVisual(`figure themed {
 a = box("A")
 b = box("B")
 edge = a.right -> b.left("send")
 row(a, b)
 timeline states {
  state active {
   trace(edge)
  }
 }
}`);
    const theme = {
      ...canonicalTheme,
      components: {
        ...canonicalTheme.components,
        connector: {
          surface: { stroke: "#ff00ff", strokeWidth: 7 },
          states: { traced: { stroke: "#00ffff", strokeWidth: 9 } },
        },
      },
    };
    const result = solvePinboard(compiled.document!, { width: 480, theme });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const base = boardSceneToSvg(result.scene, { theme });
    expect(base).toMatch(/data-livery-id="edge"[^>]*stroke="#ff00ff"[^>]*stroke-width="7"/);
    const state = computeTimelineState(compiled.document!.timelines[0]!, "active", result.scene);
    const traced = boardSceneToSvg(result.scene, { theme, state });
    expect(traced).toMatch(/data-livery-id="edge"[^>]*stroke="#00ffff"[^>]*stroke-width="9"/);
  });

  it("applies timeline paint and geometry properties to canvas text", () => {
    const compiled = compileVisual(`component Label() {
 label = text(text: "status", x: 10, y: 10, width: 60, height: 20)
 return canvas(width: 120, height: 60) {
  label
 }
}
figure text_state {
 plot = Label()
 row(plot)
 timeline states {
  state active {
   set(plot.label, fill: "#ff0000", width: 80, fontSize: 18)
  }
 }
}`);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = computeTimelineState(compiled.document!.timelines[0]!, "active", result.scene);
    const svg = boardSceneToSvg(result.scene, { state });
    expect(svg).toMatch(/data-livery-id="plot\.label" x="[^"]+" y="[^"]+"[^>]*font-size="18" fill="#ff0000"/);
  });
});
