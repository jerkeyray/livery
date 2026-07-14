import { describe, expect, it } from "vitest";
import { compileVisual, computeTimelineState, solvePinboard, type Timeline } from "./index.js";

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
});
