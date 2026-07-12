import { compile, fastFlowLayoutAdapter, layoutWithAdapter, type LayoutAdapter } from "@jerkeyray/core";
import { describe, expect, it, vi } from "vitest";

import { createElkLayoutAdapter, createElkWorkerLayoutAdapter } from "./index.js";

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
    expect(scene.layout).toMatchObject({ fallback: true, requestedAdapterId: "livery.elk-layered" });
  });

  it("lazily delegates to a worker client and terminates it", async () => {
    const layout = vi.fn(async (graph: {
      children?: Array<{ id: string; width?: number; height?: number }>;
      edges?: Array<{ id: string }>;
      id: string;
    }) => ({
      ...graph,
      height: 180,
      width: 560,
      ...(graph.children
        ? { children: graph.children.map((child, index) => ({ ...child, x: 28 + index * 250, y: 28 })) }
        : {}),
    }));
    const workerClient = {
      layout,
      terminateWorker: vi.fn(),
    };
    const adapter = createElkWorkerLayoutAdapter({ elk: workerClient });

    expect(layout).not.toHaveBeenCalled();
    const scene = await layoutWithAdapter(adapter, { artifact: cycle, options: { width: 960 } });
    adapter.terminate();

    expect(scene.id).toBe("cycle");
    expect(layout).toHaveBeenCalledOnce();
    expect(workerClient.terminateWorker).toHaveBeenCalledOnce();
  });

  it("falls back when no worker URL is available", async () => {
    const fallback = { id: "fallback", layout: vi.fn(fastFlowLayoutAdapter.layout) } satisfies LayoutAdapter;
    const adapter = createElkWorkerLayoutAdapter({ fallback });
    const scene = await layoutWithAdapter(adapter, { artifact: cycle, options: { width: 960 } });

    expect(fallback.layout).toHaveBeenCalledOnce();
    expect(scene.id).toBe("cycle");
  });

  it("terminates worker work when a request is aborted", async () => {
    const terminateWorker = vi.fn();
    const workerClient = {
      layout: vi.fn(() => new Promise<never>(() => {})),
      terminateWorker,
    };
    const adapter = createElkWorkerLayoutAdapter({ elk: workerClient });
    const abort = new AbortController();
    const pending = layoutWithAdapter(adapter, {
      artifact: cycle,
      options: { width: 960 },
      signal: abort.signal,
    });

    abort.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(terminateWorker).toHaveBeenCalledOnce();
  });
});
