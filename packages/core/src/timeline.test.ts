import { describe, expect, it } from "vitest";
import { computeTimelineState, type Timeline } from "./index.js";

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
});
