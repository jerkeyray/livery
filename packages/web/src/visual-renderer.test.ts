// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { mountLiveryVisual } from "./visual-renderer.js";

const source = (label = "API") => `figure demo("Demo") {
  api = service("${label}")
  row(api)
}`;

describe("retained visual runtime", () => {
  it("retains a valid scene through an incomplete streamed revision", () => {
    const host = document.createElement("div");
    const revisions: string[] = [];
    const instance = mountLiveryVisual(host, source(), {
      width: 480,
      onRevision: ({ status }) => revisions.push(status),
    });
    const svg = host.querySelector("svg");
    const api = host.querySelector('[data-livery-id="api"]');
    expect(instance.revision.status).toBe("ready");

    const incomplete = instance.update(source().slice(0, -1));
    expect(incomplete.status).toBe("retained");
    expect(incomplete.diagnostics.length).toBeGreaterThan(0);
    expect(host.querySelector("svg")).toBe(svg);

    const repaired = instance.update(source("Gateway"));
    expect(repaired.status).toBe("ready");
    expect(host.querySelector("svg")).toBe(svg);
    expect(host.querySelector('[data-livery-id="api"]')).toBe(api);
    expect(host.textContent).toContain("Gateway");
    expect(revisions).toEqual(["ready", "retained", "ready"]);
  });

  it("reports explicit empty and invalid initial revisions", () => {
    const emptyHost = document.createElement("div");
    expect(mountLiveryVisual(emptyHost, "", { width: 320 }).revision.status).toBe("empty");
    const invalidHost = document.createElement("div");
    const instance = mountLiveryVisual(invalidHost, "figure", { width: 320 });
    expect(instance.revision.status).toBe("invalid");
    expect(invalidHost.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("re-solves responsive instances when observed width changes", () => {
    let callback: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      constructor(next: ResizeObserverCallback) { callback = next; }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    Object.defineProperty(window, "ResizeObserver", { configurable: true, value: TestResizeObserver });
    const host = document.createElement("div");
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 480 });
    const instance = mountLiveryVisual(host, source());
    expect(instance.revision.scene?.board.width).toBe(480);
    callback?.([{ contentRect: { width: 320 } } as ResizeObserverEntry], {} as ResizeObserver);
    expect(instance.revision.scene?.board.width).toBe(320);
    instance.destroy();
  });
});
