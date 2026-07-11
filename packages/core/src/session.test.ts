import { describe, expect, it } from "vitest";

import { CompilerSession } from "./session.js";

describe("CompilerSession", () => {
  it("numbers revisions monotonically", () => {
    const session = new CompilerSession();

    expect(session.compile("flow one {}").revision).toBe(1);
    expect(session.compile("flow two {}").revision).toBe(2);
  });

  it("distinguishes partial and complete input", () => {
    const session = new CompilerSession();

    expect(session.compile("flow partial {").completeness).toBe("partial");
    expect(session.compile("flow complete {}").completeness).toBe("complete");
  });

  it("keeps diagnostics attached to their revision", () => {
    const revision = new CompilerSession().compile("not a flow");

    expect(revision.artifact).toBeUndefined();
    expect(revision.diagnostics.length).toBeGreaterThan(0);
    expect(revision.revision).toBe(1);
  });
});
