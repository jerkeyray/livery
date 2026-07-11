import { describe, expect, it } from "vitest";

import type { LiveryArtifact } from "./artifact.js";
import { compile } from "./compiler.js";
import { lintArtifact } from "./lint.js";

function artifact(overrides: Partial<LiveryArtifact>): LiveryArtifact {
  return {
    type: "livery",
    version: "0.1",
    id: "lint",
    composition: "flow",
    entities: [],
    relationships: [],
    story: [],
    ...overrides,
  };
}

describe("lintArtifact", () => {
  it("finds disconnected entities and difficult labels", () => {
    const diagnostics = lintArtifact(
      artifact({ entities: [{ id: "orphan", label: "AnUnbrokenLabelThatCannotFitInsideTheNode" }] }),
    );

    expect(diagnostics.map(({ code }) => code)).toEqual(["visual.disconnected_entity", "visual.long_label"]);
  });

  it("warns when a flow exceeds configured layout capacity", () => {
    const diagnostics = lintArtifact(
      artifact({ entities: [{ id: "a", label: "A" }, { id: "b", label: "B" }] }),
      { maxEntities: 1 },
    );

    expect(diagnostics.map(({ code }) => code)).toContain("visual.flow_density");
  });

  it("does not apply flow topology rules to other compositions", () => {
    const diagnostics = lintArtifact(
      artifact({ composition: "explainer", entities: [{ id: "concept", label: "Concept" }] }),
      { maxEntities: 0 },
    );

    expect(diagnostics).toEqual([]);
  });

  it("finds hidden and unsupported story behavior", () => {
    const compiled = compile(`flow story_lint {
      a = actor("A")
      b = service("B")
      edge = a -> b("call")
      story {
        focus(a)
        reveal(a)
        transform(b)
      }
    }`);

    expect(compiled.artifact).toBeDefined();
    expect(compiled.diagnostics.map(({ code }) => code)).toContain("visual.hidden_story_target");
    expect(compiled.diagnostics.map(({ code }) => code)).toContain("visual.unsupported_story_action");
  });

  it("does not lint incomplete streamed input", () => {
    const result = compile(`flow partial {
      orphan = actor("Orphan")`);

    expect(result.incomplete).toBe(true);
    expect(result.diagnostics.map(({ code }) => code)).not.toContain("visual.disconnected_entity");
  });
});
