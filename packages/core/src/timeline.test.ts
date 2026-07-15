import { describe, expect, it } from "vitest";
import { boardSceneToSvg, compileVisual, computeTimelineState, solvePinboard, type Timeline } from "./index.js";

const timeline: Timeline = {
  id: "demo",
  states: [
    { id: "start", operations: [{ action: "show", targets: ["a"] }] },
    { id: "done", operations: [{ action: "show", targets: ["b"] }, { action: "focus", targets: ["b"] }, { action: "set", targets: ["b"], properties: { tone: "success" } }] },
  ],
  transitions: [{ from: "start", to: "done" }],
};

describe("visual timelines", () => {
  it("computes named states without changing object identity", () => {
    const start = computeTimelineState(timeline, "start", ["a", "b"]);
    expect([...start.visible]).toEqual(["a"]);
    const done = computeTimelineState(timeline, "done", ["a", "b"]);
    expect([...done.visible]).toEqual(["a", "b"]);
    expect([...done.focused]).toEqual(["b"]);
    expect(done.properties.get("b")).toEqual({ tone: "success" });
  });

  it("models morphs as stable identity replacement", () => {
    const state = computeTimelineState({ id: "morph", states: [{ id: "done", operations: [{ action: "morph", targets: ["before", "after"] }] }], transitions: [] }, "done", ["before", "after"]);
    expect(state.visible.has("before")).toBe(false);
    expect(state.visible.has("after")).toBe(true);
    expect(state.morphs.get("after")).toBe("before");
  });

  it("cascades group visibility and stages traced connectors", () => {
    const compiled = compileVisual(`component Pair() {
 customer = person("Customer")
 api = service("API")
 return row(gap: md) {
  customer
  api
 }
}
figure checkout("Checkout") {
 request = Pair()
 payment = service("Payment")
 authorize = request.right -> payment.left("authorize")
 row(request, payment)
 timeline checkout {
  state start {
   show(request)
  }
  state payment {
   show(payment)
   trace(authorize)
   focus(payment)
  }
 }
}`);
    const layout = solvePinboard(compiled.document!, { width: 640 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const visualTimeline = compiled.document!.timelines[0]!;
    const start = computeTimelineState(visualTimeline, "start", layout.scene);
    expect(start.visible.has("request")).toBe(true);
    const child = layout.scene.elements.find(({ parent }) => parent === "request")!;
    expect(start.visible.has(child.id)).toBe(true);
    expect(start.visible.has("authorize")).toBe(false);
    const payment = computeTimelineState(visualTimeline, "payment", layout.scene);
    expect(payment.visible.has("authorize")).toBe(true);
    expect(payment.traced.has("authorize")).toBe(true);
  });

  it("hides connectors when either endpoint is hidden", () => {
    const compiled = compileVisual(`figure gated("Gated") {
 a = box("A")
 b = box("B")
 edge = a.right -> b.left("edge")
 row(a, b)
 timeline steps {
  state first {
   show(a)
   trace(edge)
  }
  state second {
   show(b)
  }
 }
}`);
    const layout = solvePinboard(compiled.document!, { width: 480 });
    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    const state = computeTimelineState(compiled.document!.timelines[0]!, "first", layout.scene);
    expect(state.traced.has("edge")).toBe(true);
    expect(state.visible.has("edge")).toBe(false);
  });

  it("preserves each parsed timeline state exactly once in source order", () => {
    const compiled = compileVisual(`figure ordered("Ordered") {
 node = box("Node")
 timeline steps {
  state first { show(node) }
  state second { focus(node) }
  state third { hide(node) }
 }
}`);

    expect(compiled.document?.timelines[0]?.states.map(({ id }) => id)).toEqual(["first", "second", "third"]);
  });

  it("rejects duplicate timeline identities and invalid transitions", () => {
    const duplicateTimeline = compileVisual(`figure invalid {
 node = box("Node")
 timeline steps { state first { show(node) } }
 timeline steps { state second { show(node) } }
}`);
    expect(duplicateTimeline.diagnostics.map(({ code }) => code)).toContain("semantic.duplicate_timeline");

    const invalid = compileVisual(`figure invalid {
 node = box("Node")
 timeline steps {
  state first { show(node) }
  state first { show(node) }
  transition first -> missing(duration: warp)
  transition first -> missing(duration: warp)
 }
}`);
    expect(invalid.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "semantic.duplicate_timeline_state",
      "semantic.invalid_transition_duration",
      "semantic.unknown_timeline_state",
      "semantic.duplicate_timeline_transition",
    ]));
  });

  it("validates set properties against target kinds", () => {
    const invalid = compileVisual(`component Plot() {
 label = text("Label", x: 0, y: 0, width: 60, height: 20)
 return canvas(width: 80, height: 40) { label }
}
figure invalid {
 plot = Plot()
 box = box("Box")
 edge = box.right -> plot.left("edge")
 row(box, plot)
 timeline steps {
  state bad {
   set(box, width: 300)
   set(edge, fill: "red")
   set(plot.label, radius: 10)
  }
 }
}`);
    expect(invalid.diagnostics.filter(({ code }) => code === "semantic.invalid_timeline_property")).toHaveLength(3);
  });

  it("renders accepted element, primitive, and connector state properties", () => {
    const compiled = compileVisual(`component Plot() {
 label = text("Label", x: 4, y: 4, width: 60, height: 20, color: "#111111")
 return canvas(width: 80, height: 40) { label }
}
figure states {
 box = box("Box", opacity: 0.8, color: "#222222")
 plot = Plot()
 edge = box.right -> plot.left("edge")
 row(box, plot)
 timeline steps {
  state changed {
   set(box, color: "#123456", opacity: 0.5, translateX: 10)
   set(plot.label, color: "#654321", x: 12, fontSize: 15)
   set(edge, stroke: "#abcdef", strokeWidth: 3, opacity: 0.4)
  }
 }
}`);
    expect(compiled.diagnostics).toEqual([]);
    const solved = solvePinboard(compiled.document!, { width: 480 });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    const state = computeTimelineState(compiled.document!.timelines[0]!, "changed", solved.scene);
    const svg = boardSceneToSvg(solved.scene, { state });
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('opacity="0.5"');
    expect(svg).toContain('transform="translate(10 0)');
    expect(svg).toContain('fill="#654321"');
    expect(svg).toContain('font-size="15"');
    expect(svg).toContain('stroke="#abcdef"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('opacity="0.4"');
    expect(solved.scene.timelineEnvelopes.find(({ owner }) => owner === "plot.label")?.width).toBeGreaterThanOrEqual(60);
  });
});
