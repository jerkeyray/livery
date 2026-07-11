import { describe, expect, it } from "vitest";

import { createRepairPrompt, LIVERY_AGENT_GUIDE } from "./agent.js";
import { compile } from "./compiler.js";

describe("agent helpers", () => {
  it("keeps the generation guide compact and source-oriented", () => {
    expect(LIVERY_AGENT_GUIDE.length).toBeLessThan(900);
    expect(LIVERY_AGENT_GUIDE).toContain("Generate only Livery DSL");
    expect(LIVERY_AGENT_GUIDE).toContain("request = client -> api");
  });

  it("creates a local repair prompt with location and advice", () => {
    const source = `flow broken {
  client = actor("Client")
  client color purple
  client -> api("request")
}`;
    const prompt = createRepairPrompt(source, compile(source).diagnostics);

    expect(prompt).toContain("Return only corrected Livery source");
    expect(prompt).toContain("syntax.expected_assignment_or_relationship");
    expect(prompt).toContain("3 |   client color purple");
    expect(prompt).not.toContain("1 | flow broken");
  });

  it("bounds diagnostics, known IDs, and long source lines", () => {
    const diagnostics = Array.from({ length: 12 }, (_, index) => ({
      code: "semantic.unknown_story_target",
      severity: "error" as const,
      message: `Unknown target ${index}.`,
      repair: { description: "Choose a known target.", knownIds: ["one", "two", "three"] },
    }));
    const prompt = createRepairPrompt("x".repeat(100), diagnostics, {
      maxDiagnostics: 2,
      maxExcerptLines: 1,
      maxKnownIds: 2,
      maxLineLength: 40,
    });

    expect(prompt).toContain("Unknown target 1.");
    expect(prompt).not.toContain("Unknown target 2.");
    expect(prompt).toContain("Known IDs: one, two.");
    expect(prompt).not.toContain("three");
    expect(prompt).toContain("...");
    expect(prompt.match(/^\d+ \|/gm)).toHaveLength(1);
  });

  it("handles missing diagnostics explicitly", () => {
    const prompt = createRepairPrompt("flow valid {}", []);

    expect(prompt).toContain("No compiler diagnostics were provided");
  });
});
