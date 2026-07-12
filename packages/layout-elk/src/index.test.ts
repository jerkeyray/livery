import { compile, fastFlowLayoutAdapter, layoutWithAdapter, type LayoutAdapter } from "@livery/core";
import { describe, expect, it, vi } from "vitest";

import { createElkLayoutAdapter } from "./index.js";

const cycle = compile(`flow cycle("Cyclic flow") {
  first = a -> b("one")
  second = b -> a("two")
}`).artifact!;

describe("ELK layout adapter", () => {
  it("lays out cyclic graphs with measured nodes and routed edges", async () => {
    const scene = await layoutWithAdapter(createElkLayoutAdapter(), { artifact: cycle, options: { width: 960 } });

    expect(scene.id).toBe("cycle");
    expect(scene.nodes).toHaveLength(2);
    expect(scene.edges).toHaveLength(2);
    expect(scene.nodes.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(scene.edges.every(({ path }) => path.startsWith("M "))).toBe(true);
  });

  it("is deterministic for equivalent requests", async () => {
    const adapter = createElkLayoutAdapter();
    const request = { artifact: cycle, options: { width: 960 } };

    expect(await layoutWithAdapter(adapter, request)).toEqual(await layoutWithAdapter(adapter, request));
  });

  it("falls back when ELK fails", async () => {
    const fallback = { id: "fallback", layout: vi.fn(fastFlowLayoutAdapter.layout) } satisfies LayoutAdapter;
    const elk = { layout: vi.fn(async () => { throw new Error("worker failed"); }) };
    const scene = await layoutWithAdapter(createElkLayoutAdapter({ elk, fallback }), {
      artifact: cycle,
      options: { width: 960 },
    });

    expect(fallback.layout).toHaveBeenCalledOnce();
    expect(scene.id).toBe("cycle");
  });
});
