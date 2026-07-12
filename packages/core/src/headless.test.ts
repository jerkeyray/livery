import { describe, expect, it, vi } from "vitest";

import { fastFlowLayoutAdapter, type LayoutAdapter } from "./layout-adapter.js";
import { renderHeadless } from "./headless.js";

describe("renderHeadless", () => {
  it("compiles and lays out source in one call", async () => {
    const result = await renderHeadless(`flow checkout("Checkout") { customer -> api("submit") }`, {
      width: 960,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.scene).toMatchObject({ id: "checkout", width: 960 });
    expect(result.adapterId).toBe("livery.fast-flow");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns compile diagnostics without invoking layout", async () => {
    const adapter = { id: "unused", layout: vi.fn(fastFlowLayoutAdapter.layout) } satisfies LayoutAdapter;
    const result = await renderHeadless("not a flow", { adapter });

    expect(result.scene).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(adapter.layout).not.toHaveBeenCalled();
  });

  it("normalizes async adapters and forwards cancellation", async () => {
    const abort = new AbortController();
    const adapter: LayoutAdapter = {
      id: "async",
      async layout(request) {
        expect(request.signal).toBe(abort.signal);
        return await fastFlowLayoutAdapter.layout(request);
      },
    };
    const result = await renderHeadless(`flow async { a -> b }`, {
      adapter,
      signal: abort.signal,
    });

    expect(result.scene?.id).toBe("async");
    expect(result.adapterId).toBe("livery.fast-flow");
  });

  it("does not compile or lay out a pre-aborted request", async () => {
    const abort = new AbortController();
    const adapter = { id: "unused", layout: vi.fn(fastFlowLayoutAdapter.layout) } satisfies LayoutAdapter;
    abort.abort();

    await expect(renderHeadless(`flow aborted { a -> b }`, {
      adapter,
      signal: abort.signal,
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(adapter.layout).not.toHaveBeenCalled();
  });
});
