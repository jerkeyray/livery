import { compile } from "@livery/core";
import { describe, expect, it } from "vitest";

import { resolveRenderRevision } from "./revision.js";

const valid = compile(`flow stable {
  client -> api("request")
}`);

describe("resolveRenderRevision", () => {
  it("uses the current artifact when compilation succeeds", () => {
    expect(resolveRenderRevision(valid).artifact).toBe(valid.artifact);
    expect(resolveRenderRevision(valid).retained).toBe(false);
  });

  it("retains the previous artifact through an invalid revision", () => {
    const invalid = compile("not a flow");
    const revision = resolveRenderRevision(invalid, valid.artifact);

    expect(revision.artifact).toBe(valid.artifact);
    expect(revision.retained).toBe(true);
  });

  it("can disable retention", () => {
    const invalid = compile("not a flow");

    expect(resolveRenderRevision(invalid, valid.artifact, false)).toEqual({ retained: false });
  });
});
