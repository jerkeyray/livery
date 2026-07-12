import { describe, expect, it } from "vitest";

import { LiveryController } from "./controller.js";

describe("LiveryController", () => {
  it("compiles numbered revisions and selects the current artifact", () => {
    const controller = new LiveryController();
    const first = controller.update("flow first { a -> b }");
    const second = controller.update("flow second { c -> d }");

    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(second.renderArtifact?.id).toBe("second");
    expect(second.retained).toBe(false);
    expect(controller.revision).toBe(second);
  });

  it("retains the last valid artifact through invalid input", () => {
    const controller = new LiveryController();
    controller.update("flow stable { a -> b }");
    const invalid = controller.update("not a flow");

    expect(invalid.artifact).toBeUndefined();
    expect(invalid.renderArtifact?.id).toBe("stable");
    expect(invalid.retained).toBe(true);
  });

  it("can disable last-valid retention per update", () => {
    const controller = new LiveryController();
    controller.update("flow stable { a -> b }");
    const invalid = controller.update("not a flow", { retainLastValid: false });

    expect(invalid.renderArtifact).toBeUndefined();
    expect(invalid.retained).toBe(false);
  });
});
