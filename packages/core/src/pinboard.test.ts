import { describe, expect, it } from "vitest";
import { solvePinboard } from "./pinboard.js";
import { compileVisual } from "./program.js";
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
    expect(result.scene.canvases[0]?.primitives.map(({ id }) => id)).toEqual(["plot.dots.0", "plot.dots.1", "plot.dots.2", "plot.dots.3", "plot.axis"]);
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
});
