import { describe, expect, it } from "vitest";
import { compileVisual, createAgentGuide } from "./index.js";

describe("generation agent guide", () => {
  it("keeps its canonical examples compilable", () => {
    const guide = createAgentGuide({ mode: "generation" });
    const linear = guide.split("Canonical linear example:\n")[1]!.split("\n\nCanonical grouped example:")[0]!;
    const grouped = guide.split("Canonical grouped example:\n")[1]!.split("\n\nCanonical hierarchy example:")[0]!;
    const hierarchy = guide.split("Canonical hierarchy example:\n")[1]!;
    expect(compileVisual(linear).diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(compileVisual(grouped).diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(compileVisual(hierarchy).diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  });

  it("distinguishes hierarchy entities from visual groups", () => {
    const guide = createAgentGuide({ mode: "generation" });
    expect(guide).toContain("taxonomy ranks, and taxa as cards");
    expect(guide).toContain("Frames are quiet containers and do not accept variant or tone");
    expect(guide).toContain("never duplicate a frame label as a card");
  });
});
