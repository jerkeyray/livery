import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Prompt = { id: string; category: string; prompt: string };

describe("visual benchmark prompts", () => {
  const prompts = JSON.parse(readFileSync(resolve("benchmarks/visual-prompts.json"), "utf8")) as Prompt[];

  it("maintains at least twenty unique representative prompts", () => {
    expect(prompts.length).toBeGreaterThanOrEqual(20);
    expect(new Set(prompts.map(({ id }) => id)).size).toBe(prompts.length);
    expect([...new Set(prompts.map(({ category }) => category))]).toEqual(expect.arrayContaining([
      "architecture", "workflow", "agent", "state-machine", "dashboard", "sequence", "infographic",
    ]));
    expect(prompts.every(({ prompt }) => prompt.length >= 80)).toBe(true);
  });
});
