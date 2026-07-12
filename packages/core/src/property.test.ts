import { describe, expect, it } from "vitest";

import type { LiveryArtifact } from "./artifact.js";
import { compile } from "./compiler.js";
import { formatArtifact } from "./language/formatter.js";
import { tokenize } from "./language/tokenizer.js";

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function generatedText(next: () => number, alphabet: string[], maxLength: number) {
  const length = Math.floor(next() * maxLength);
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)]!).join("");
}

describe("bounded generated inputs", () => {
  it("compiles arbitrary text deterministically without throwing", () => {
    const next = random(0x1a2b3c4d);
    const alphabet = [..."abcXYZ09_{}()[],.:=->/\\\" \t\n@#$", "lambda", "snow"];

    for (let index = 0; index < 250; index += 1) {
      const source = generatedText(next, alphabet, 400);
      const first = compile(source);
      const second = compile(source);

      expect(second).toEqual(first);
      expect(first.diagnostics.length).toBeLessThanOrEqual(110);
    }
  });

  it("round-trips generated labels through formatting and compilation", () => {
    const next = random(0x5eed1234);
    const alphabet = [..."alpha beta / {} (), -> ", "\"", "\\", "\n", "lambda"];

    for (let index = 0; index < 100; index += 1) {
      const label = generatedText(next, alphabet, 80) || "empty";
      const artifact: LiveryArtifact = {
        type: "livery",
        version: "0.1",
        id: `generated_${index}`,
        composition: "flow",
        entities: [
          { id: "client", label, role: "actor" },
          { id: "api", label: "API", role: "service" },
        ],
        relationships: [{ id: "request", from: "client", to: "api", label }],
        story: [{ id: "story-1", action: "trace", targets: [{ type: "relationship", id: "request" }] }],
      };
      const formatted = formatArtifact(artifact);
      const compiled = compile(formatted);

      expect(compiled.artifact).toEqual(artifact);
      expect(formatArtifact(compiled.artifact!)).toBe(formatted);
    }
  });

  it("bounds diagnostics for repetitive malformed input", () => {
    const result = tokenize("@".repeat(10_000));

    expect(result.diagnostics).toHaveLength(101);
    expect(result.diagnostics.at(-1)?.code).toBe("resource.max_diagnostics");
    expect(result.diagnostics.at(-1)?.repair).toBeDefined();
  });

  it("reports deeply nested input without unbounded diagnostics", () => {
    const result = compile(`flow nested { ${"{".repeat(2_000)} ${"}".repeat(2_000)} }`);

    expect(result.artifact).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("resource.max_nesting_depth");
    expect(result.diagnostics.length).toBeLessThanOrEqual(110);
  });
});
