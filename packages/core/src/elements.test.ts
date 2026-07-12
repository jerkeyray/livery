import { describe, expect, it } from "vitest";

import { compile } from "./compiler.js";
import { resolveArtifactElement } from "./elements.js";

const artifact = compile(`flow elements {
  client = actor("Client")
  request = client -> api("request")
}`).artifact!;

describe("resolveArtifactElement", () => {
  it("returns typed semantic entities and relationships", () => {
    expect(resolveArtifactElement(artifact, "entity", "client")).toMatchObject({
      type: "entity",
      value: { id: "client", role: "actor" },
    });
    expect(resolveArtifactElement(artifact, "relationship", "request")).toMatchObject({
      type: "relationship",
      value: { id: "request", from: "client", to: "api" },
    });
  });

  it("does not fabricate missing elements", () => {
    expect(resolveArtifactElement(artifact, "entity", "missing")).toBeUndefined();
  });
});
