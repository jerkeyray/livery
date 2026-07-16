import { describe, expect, it } from "vitest";
import { compileVisual, createAgentGuide } from "./index.js";

describe("generation agent guide", () => {
  it("keeps its canonical examples compilable", () => {
    const guide = createAgentGuide({ mode: "generation" });
    const linear = guide.split("Canonical linear example:\n")[1]!.split("\n\nCanonical grouped example:")[0]!;
    const grouped = guide.split("Canonical grouped example:\n")[1]!;
    expect(compileVisual(linear).diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
    expect(compileVisual(grouped).diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
  });
});
