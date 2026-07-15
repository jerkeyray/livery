import { describe, expect, it } from "vitest";
import { agentEvalCases } from "./agent-eval/cases.js";
import { evaluateAgentCases } from "./agent-eval/harness.js";

describe("agent generation replay", () => {
  it("covers at least 25 prompts and meets the alpha reliability gate", async () => {
    expect(agentEvalCases.length).toBeGreaterThanOrEqual(25);
    const report = await evaluateAgentCases();
    expect(report.rates.firstPass).toBeGreaterThanOrEqual(0.9);
    expect(report.rates.repaired).toBe(1);
    expect(report.rates.responsive).toBe(1);
    expect(report.rates.semantic).toBe(1);
    expect(report.guideTokens).toBeLessThan(300);
    expect(report.checkoutTokens).toBeLessThanOrEqual(88);
    expect(report.passed).toBe(true);
  });
});
