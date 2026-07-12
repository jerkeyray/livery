import { compile, fastFlowLayoutAdapter, type LayoutAdapter, type Scene } from "@livery/core";
import { describe, expect, it, vi } from "vitest";

import { LayoutController } from "./layout-controller.js";

const first = compile(`flow first { a -> b }`).artifact!;
const second = compile(`flow second { c -> d }`).artifact!;

describe("LayoutController", () => {
  it("completes synchronous layouts immediately", () => {
    const revision = new LayoutController().update(fastFlowLayoutAdapter, {
      artifact: first,
      options: { width: 720 },
    });

    expect(revision).toMatchObject({ adapterId: "livery.fast-flow", pending: false, request: 1 });
    expect(revision.scene?.id).toBe("first");
  });

  it("retains the completed scene while an async layout is pending", async () => {
    let resolve!: (scene: Scene) => void;
    const adapter: LayoutAdapter = {
      id: "async",
      layout: () => new Promise((done) => { resolve = done; }),
    };
    const controller = new LayoutController();
    const initial = controller.update(fastFlowLayoutAdapter, { artifact: first, options: { width: 720 } });
    const onChange = vi.fn();
    const pending = controller.update(adapter, { artifact: second, options: { width: 720 } }, onChange);

    expect(pending).toMatchObject({ artifact: first, pending: true, scene: initial.scene });
    resolve(await fastFlowLayoutAdapter.layout({ artifact: second, options: { width: 720 } }));
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ artifact: second, pending: false }));
  });

  it("ignores stale async results", async () => {
    const resolvers: Array<(scene: Scene) => void> = [];
    const adapter: LayoutAdapter = {
      id: "async",
      layout: () => new Promise((resolve) => { resolvers.push(resolve); }),
    };
    const controller = new LayoutController();
    const onChange = vi.fn();
    controller.update(adapter, { artifact: first, options: { width: 720 } }, onChange);
    controller.update(adapter, { artifact: second, options: { width: 720 } }, onChange);

    resolvers[0]!(await fastFlowLayoutAdapter.layout({ artifact: first, options: { width: 720 } }));
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();

    resolvers[1]!(await fastFlowLayoutAdapter.layout({ artifact: second, options: { width: 720 } }));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledOnce();
    expect(controller.revision?.scene?.id).toBe("second");
  });

  it("retains the completed scene when an async layout fails", async () => {
    const controller = new LayoutController();
    const initial = controller.update(fastFlowLayoutAdapter, { artifact: first, options: { width: 720 } });
    const onChange = vi.fn();
    controller.update(
      { id: "failing", layout: async () => { throw new Error("layout failed"); } },
      { artifact: second, options: { width: 720 } },
      onChange,
    );
    await Promise.resolve();

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      artifact: first,
      error: expect.any(Error),
      pending: false,
      scene: initial.scene,
    }));
  });
});
