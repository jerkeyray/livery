import { describe, expect, it } from "vitest";

import { compile } from "./compiler.js";
import { computeStoryState } from "./story.js";

const artifact = compile(`flow story_test {
  a = actor("A")
  b = service("B")
  request = a -> b("request")
  story {
    reveal(a)
    reveal(b)
    trace(request)
    focus(b)
    indicate(a)
    indicate(request)
  }
}`).artifact!;

describe("computeStoryState", () => {
  it("creates a deterministic pre-story state", () => {
    const state = computeStoryState(artifact, -1);

    expect([...state.visibleEntities]).toEqual([]);
    expect([...state.visibleRelationships]).toEqual([]);
  });

  it("applies story steps cumulatively", () => {
    const state = computeStoryState(artifact, 2);

    expect([...state.visibleEntities]).toEqual(["a", "b"]);
    expect([...state.visibleRelationships]).toEqual(["request"]);
    expect([...state.tracedRelationships]).toEqual(["request"]);
  });

  it("clamps steps and keeps focus and indication semantic", () => {
    const state = computeStoryState(artifact, 99);

    expect(state.step).toBe(5);
    expect([...state.focusedEntities]).toEqual(["b"]);
    expect([...state.indicatedRelationships]).toEqual(["request"]);
  });
});
