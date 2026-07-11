import { describe, expect, it } from "vitest";

import { LIVERY_ARTIFACT_VERSION } from "./index.js";

describe("core package", () => {
  it("exposes the initial artifact version", () => {
    expect(LIVERY_ARTIFACT_VERSION).toBe("0.1");
  });
});
