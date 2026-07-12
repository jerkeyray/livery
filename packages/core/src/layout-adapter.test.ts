import { describe, expect, it, vi } from "vitest";

import { compile } from "./compiler.js";
import {
  analyzeLayoutComplexity,
  fastFlowLayoutAdapter,
  layoutWithAdapter,
  selectLayoutAdapter,
  type LayoutAdapter,
} from "./layout-adapter.js";

describe("layout adapters", () => {
  it("keeps small acyclic flows on the synchronous adapter", () => {
    const artifact = compile(`flow small { a -> b("call") }`).artifact!;

    expect(analyzeLayoutComplexity(artifact)).toEqual({ advanced: false, cyclic: false, reasons: [] });
    expect(selectLayoutAdapter(artifact, {})).toBe(fastFlowLayoutAdapter);
  });

  it("routes cycles to an available advanced adapter", () => {
    const artifact = compile(`flow cycle {
      first = a -> b("one")
      second = b -> a("two")
    }`).artifact!;
    const advanced: LayoutAdapter = { id: "advanced", layout: fastFlowLayoutAdapter.layout };

    expect(analyzeLayoutComplexity(artifact)).toMatchObject({ advanced: true, cyclic: true, reasons: ["cycle"] });
    expect(selectLayoutAdapter(artifact, { advanced })).toBe(advanced);
  });

  it("uses configurable graph-size thresholds", () => {
    const artifact = compile(`flow size {
      a -> b
      b -> c
    }`).artifact!;

    expect(analyzeLayoutComplexity(artifact, { maxFastEntities: 2 }).reasons).toContain("entity_count");
    expect(analyzeLayoutComplexity(artifact, { maxFastRelationships: 1 }).reasons).toContain("relationship_count");
  });

  it("normalizes synchronous and asynchronous adapters", async () => {
    const artifact = compile(`flow async { a -> b }`).artifact!;
    const layout = vi.fn(async (request) => fastFlowLayoutAdapter.layout(request));
    const adapter: LayoutAdapter = { id: "async", layout };
    const scene = await layoutWithAdapter(adapter, { artifact, options: { width: 640 } });

    expect(layout).toHaveBeenCalledOnce();
    expect(scene.id).toBe("async");
  });
});
