import { describe, expect, it } from "vitest";
import { solvePinboard } from "./pinboard.js";
import { compileVisual } from "./program.js";
import { canonicalTheme } from "./theme.js";
import type { VisualDocument } from "./visual.js";

const document: VisualDocument = {
  type: "livery.visual",
  version: "0.2",
  id: "checkout",
  title: "Checkout",
  root: {
    id: "root",
    kind: "group",
    layout: { kind: "row", gap: 32 },
    children: [
      { id: "customer", kind: "lib.person", label: "Customer" },
      { id: "api", kind: "lib.service", label: "Checkout API" },
      { id: "payment", kind: "lib.service", label: "Payment provider" },
      { id: "orders", kind: "lib.database", label: "Orders" },
    ],
  },
  connectors: [
    { id: "submit", from: { node: "customer", anchor: "right" }, to: { node: "api", anchor: "left" }, label: "submit order" },
    { id: "authorize", from: { node: "api", anchor: "right" }, to: { node: "payment", anchor: "left" }, label: "authorize" },
    { id: "persist", from: { node: "api", anchor: "right" }, to: { node: "orders", anchor: "left" }, label: "persist" },
  ],
  constraints: [],
  timelines: [],
};

describe("solvePinboard", () => {
  it.each([320, 480, 720, 1024])("returns only validated scenes at %ipx", (width) => {
    const result = solvePinboard(document, { width });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    expect(result.report.valid).toBe(true);
    expect(result.scene.board.width).toBe(width);
    expect(result.report.metrics.occupancyRatio).toBeGreaterThan(0);
    expect(result.report.metrics.normalizedRouteLength).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.report.metrics.whitespaceImbalance)).toBe(true);
    expect(result.scene.elements.map(({ id }) => id)).toEqual(["root", "customer", "api", "payment", "orders"]);
    for (const connector of result.scene.connectors) {
      connector.points.slice(1).forEach((point, index) => {
        const previous = connector.points[index]!;
        expect(point.x === previous.x || point.y === previous.y).toBe(true);
      });
    }
  });

  it("returns a typed failure when the resource limit is exceeded", () => {
    const result = solvePinboard(document, { maxElements: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("layout.resource_limit");
  });

  it("fails instead of truncating an oversized canvas repeat", () => {
    const oversized: VisualDocument = {
      ...document,
      root: { id: "root", kind: "canvas", layout: { kind: "canvas", width: 240, height: 120 }, children: [{ id: "dots", kind: "repeat", props: { count: 129, kind: "circle" } }] },
      connectors: [],
    };
    const result = solvePinboard(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("layout.resource_limit");
  });

  it("fails when several legal repeats exceed the total canvas budget", () => {
    const oversized: VisualDocument = {
      ...document,
      root: { id: "root", kind: "canvas", layout: { kind: "canvas", width: 240, height: 120 }, children: Array.from({ length: 5 }, (_, index) => ({ id: `dots_${index}`, kind: "repeat" as const, props: { count: 110, kind: "circle" } })) },
      connectors: [],
    };
    const result = solvePinboard(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.message).toContain("expanded primitives");
  });

  it("solves a bounded canvas and expands repeat deterministically", () => {
    const compiled = compileVisual(`
      component Orbit() {
        dots = repeat(count: 4, kind: circle, x: 20, y: 40, width: 12, height: 12, stepX: 30)
        axis = line(x: 12, y: 46, width: 120, height: 2)
        return canvas(width: 180, height: 100, bleed: 4) {
          axis
          dots
        }
      }

      figure orbit("Orbit") {
        plot = Orbit()
        row(plot)
      }
    `);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.canvases).toHaveLength(1);
    expect(result.scene.canvases[0]?.primitives.map(({ id }) => id)).toEqual(["plot.axis", "plot.dots.0", "plot.dots.1", "plot.dots.2", "plot.dots.3"]);
    expect(result.scene.canvases[0]?.bleed).toBe(4);
  });

  it("rejects a timeline whose motion envelope collides with a neighbor", () => {
    const moving: VisualDocument = {
      ...document,
      timelines: [{
        id: "move",
        states: [{ id: "shift", operations: [{ action: "set", targets: ["customer"], properties: { translateX: 180 } }] }],
        transitions: [],
      }],
    };
    const result = solvePinboard(moving, { width: 1024, maxCandidates: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain("layout.component_collision");
  });

  it("rejects scaled timeline motion that exceeds a canvas bleed envelope", () => {
    const compiled = compileVisual(`component Art() {
 dot = circle(x: 70, y: 40, width: 20, height: 20)
 return canvas(width: 100, height: 100) {
  dot
 }
}
figure motion {
 art = Art()
 row(art)
 timeline states {
  state enlarged {
   set(art.dot, scale: 8, rotate: 20)
  }
 }
}`);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain("layout.canvas_bleed");
  });

  it("measures labels with resolved typography tokens", () => {
    const compiled = compileVisual(`figure typography {
 service = service("A very long service label")
 row(service)
}`);
    const theme = {
      ...canonicalTheme,
      tokens: { ...canonicalTheme.tokens, type: { ...canonicalTheme.tokens.type, body: 40 } },
    };
    const result = solvePinboard(compiled.document!, { width: 320, theme });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const service = result.scene.elements.find(({ id }) => id === "service")!;
    expect(service.labelBounds!.height).toBeLessThanOrEqual(service.bounds.height);
    expect(service.labelBounds!.height).toBeGreaterThan(100);
  });

  it("routes from a component boundary without treating its children as obstacles", () => {
    const compiled = compileVisual(`
      component Pair() {
        left = person("Customer")
        right = service("API")
        return row(gap: md) {
          left
          right
        }
      }
      figure nested("Nested") {
        pair = Pair()
        payment = service("Payment")
        edge = pair.right -> payment.left("authorize")
        row(pair, payment, gap: lg)
      }
    `);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
  });

  it("routes through internal channels when compact reflow blocks midpoint doglegs", () => {
    const compiled = compileVisual(`figure channels {
 a = service("A")
 b = service("B")
 c = service("C")
 d = service("D")
 e = service("E")
 f = service("F")
 first = b.right -> c.left("first")
 second = c.right -> e.left("second")
 grid(a, b, c, d, e, f, columns: 3, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 480, maxCandidates: 3 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    expect(result.attempts.at(-1)?.strategy).toBe("alternate_spans");
    expect(result.scene.connectors.every(({ channelIds }) => channelIds.length > 0)).toBe(true);
  });

  it("preserves explicitly authored connector pins when their axis remains meaningful", () => {
    const compiled = compileVisual(`figure pinned {
 first = service("First")
 source = service("Ground station")
 target = service("Telemetry buffer")
 last = service("Last")
 edge = source.bottom -> target.top("decode")
 grid(first, source, target, last, columns: 2, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors[0]).toMatchObject({ fromPin: "source.bottom", toPin: "target.top" });
  });

  it("connects to stable pins on objects inside a canvas", () => {
    const compiled = compileVisual(`component Plot() {
 dot = circle(x: 140, y: 50, width: 16, height: 16)
 return canvas(width: 180, height: 120) {
  dot
 }
}
figure anchored {
 plot = Plot()
 note = callout("Sample")
 edge = plot.dot.right -> note.left("annotate")
 row(plot, note, gap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors[0]).toMatchObject({ from: "plot.dot", fromPin: "plot.dot.right", to: "note", toPin: "note.left" });
    expect(result.scene.canvases[0]?.primitives[0]?.pins).toHaveLength(4);
  });

  it("keeps a fitting canvas annotation row instead of forcing vertical reflow", () => {
    const compiled = compileVisual(`component Plot() {
 dot = circle(x: 20, y: 20, width: 40, height: 40)
 return canvas(width: 180, height: 100, bleed: 4) {
  dot
 }
}
figure annotated {
 plot = Plot()
 note = callout("Controls flow")
 edge = plot.right -> note.left("annotation")
 row(plot, note, gap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const plot = result.scene.elements.find(({ id }) => id === "plot")!;
    const note = result.scene.elements.find(({ id }) => id === "note")!;
    expect(note.bounds.x).toBeGreaterThan(plot.bounds.x + plot.bounds.width);
  });

  it("centers differently sized children on a shared column axis", () => {
    const compiled = compileVisual(`figure centered {
 wide = box("Wide", width: 220)
 narrow = callout("Narrow")
 edge = wide.bottom -> narrow.top("next")
 column(wide, narrow, gap: lg)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wide = result.scene.elements.find(({ id }) => id === "wide")!;
    const narrow = result.scene.elements.find(({ id }) => id === "narrow")!;
    expect(wide.bounds.x + wide.bounds.width / 2).toBe(narrow.bounds.x + narrow.bounds.width / 2);
  });

  it("centers compact root compositions and crops unused board height", () => {
    const compiled = compileVisual(`figure compact {
 agent = agent("Research agent")
 tool = tool("Search")
 edge = agent.right -> tool.left("query")
 row(agent, tool, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.scene.elements.find(({ id }) => id === "root")!;
    expect(root.bounds.x + root.bounds.width / 2).toBe(380);
    expect(result.scene.board.height).toBeLessThanOrEqual(124);
    expect(result.scene.connectors[0]?.points).toHaveLength(2);
  });

  it("uses a balanced fallback grid for four components", () => {
    const result = solvePinboard(document, { width: 760 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leaves = result.scene.elements.filter(({ parent }) => parent === "root");
    expect(result.scene.board.height).toBeLessThan(260);
    expect(new Set(leaves.map(({ bounds }) => bounds.x + bounds.width / 2)).size).toBe(3);
    expect(new Set(leaves.map(({ bounds }) => bounds.y)).size).toBe(2);
    expect(leaves[3]!.bounds.x + leaves[3]!.bounds.width / 2).toBe(leaves[1]!.bounds.x + leaves[1]!.bounds.width / 2);
  });

  it("sizes each grid row from its own tallest component", () => {
    const compiled = compileVisual(`component TallPanel() {
 return canvas(width: 220, height: 196) {}
}
component MediumPanel() {
 return canvas(width: 220, height: 132) {}
}
figure mixed_grid {
 tall = TallPanel()
 first = service("Ground station")
 note = callout("Escalate")
 medium = MediumPanel()
 archive = database("Archive")
 model = model("Anomaly model")
 grid(tall, first, note, medium, archive, model, columns: 2, gap: lg)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 760, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tall = result.scene.elements.find(({ id }) => id === "tall")!;
    const medium = result.scene.elements.find(({ id }) => id === "medium")!;
    const archive = result.scene.elements.find(({ id }) => id === "archive")!;
    expect(medium.bounds.y - tall.bounds.y).toBe(220);
    expect(archive.bounds.y - medium.bounds.y).toBeLessThan(180);
    expect(result.scene.board.height).toBeLessThan(560);
  });

  it("measures long callout labels inside their rendered text area", () => {
    const compiled = compileVisual(`figure note_test {
 note = callout("Position changes while the orbit remains stable")
 row(note)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 360, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const note = result.scene.elements.find(({ id }) => id === "note")!;
    expect(note.labelBounds!.y).toBeGreaterThanOrEqual(note.bounds.y);
    expect(note.labelBounds!.y + note.labelBounds!.height).toBeLessThanOrEqual(note.bounds.y + note.bounds.height);
  });

  it("resolves layout gaps through caller token overrides", () => {
    const compiled = compileVisual(`figure spacing {
 a = box("A")
 b = box("B")
 row(a, b, gap: lg)
}`);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1, tokenOverrides: { "space.lg": 60 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.scene.elements.find(({ id }) => id === "a")!;
    const b = result.scene.elements.find(({ id }) => id === "b")!;
    expect(b.bounds.x - (a.bounds.x + a.bounds.width)).toBe(60);
    expect(result.scene.board.gutter).toBe(60);
  });

  it("applies flex-like alignment and distribution deterministically", () => {
    const compiled = compileVisual(`component Tall() {
 return canvas(width: 100, height: 120) {}
}
component Short() {
 return canvas(width: 80, height: 64) {}
}
figure flex {
 tall = Tall()
 short = Short()
 row(tall, short, width: 500, align: end, distribute: between)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tall = result.scene.elements.find(({ id }) => id === "tall")!;
    const short = result.scene.elements.find(({ id }) => id === "short")!;
    expect(short.bounds.y + short.bounds.height).toBe(tall.bounds.y + tall.bounds.height);
    expect(short.bounds.x + short.bounds.width).toBe(tall.bounds.x + 500);
  });

  it("returns localized failures for conflicting or impossible constraints", () => {
    const conflicting = compileVisual(`figure conflict {
 a = box("A")
 b = box("B")
 c = box("C")
 row(a, b, c)
 align(a, b, c, axis: x)
 distribute(a, b, c, axis: x, gap: 40)
}`).document!;
    const conflictResult = solvePinboard(conflicting, { width: 720 });
    expect(conflictResult.ok).toBe(false);
    if (!conflictResult.ok) expect(conflictResult.diagnostics.map(({ code }) => code)).toContain("layout.unsatisfied_align");

    const oversized = compileVisual(`component Large() {
 return canvas(width: 200, height: 160) {}
}
component Small() {
 return canvas(width: 100, height: 80) {}
}
figure impossible {
 large = Large()
 small = Small()
 row(large, small)
 inside(large, small, padding: 8)
}`).document!;
    const insideResult = solvePinboard(oversized, { width: 720 });
    expect(insideResult.ok).toBe(false);
    if (!insideResult.ok) expect(insideResult.diagnostics.map(({ code }) => code)).toContain("layout.unsatisfied_inside");
  });

  it("treats a satisfied inside constraint as an explicit overlap", () => {
    const compiled = compileVisual(`component Container() {
 return canvas(width: 220, height: 160) {}
}
component Child() {
 return canvas(width: 80, height: 48) {}
}
figure nested {
 container = Container()
 child = Child()
 row(container, child)
 inside(child, container, padding: 12)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const container = result.scene.elements.find(({ id }) => id === "container")!.bounds;
    const child = result.scene.elements.find(({ id }) => id === "child")!.bounds;
    expect(child.x).toBeGreaterThanOrEqual(container.x + 12);
    expect(child.y).toBeGreaterThanOrEqual(container.y + 12);
    expect(child.x + child.width).toBeLessThanOrEqual(container.x + container.width - 12);
    expect(child.y + child.height).toBeLessThanOrEqual(container.y + container.height - 12);
  });
});
