import { readFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { encode } from "gpt-tokenizer";
import { compileProgram, createAgentGuide, createRepairPrompt, render, type VisualDocument, type VisualNode } from "@jerkeyray/core";
import { agentEvalCases, type AgentEvalCase, type AgentSemanticAssertions } from "./cases.js";

export type AgentEvalAdapter = {
  id: string;
  model?: string;
  generate(input: { prompt: string; guide: string; repair?: string }): Promise<string>;
};

export type AgentEvalRecord = {
  id: string;
  promptTokens: number;
  sourceTokens: number;
  firstPass: boolean;
  repaired: boolean;
  responsive: boolean;
  semantic: boolean;
  diagnostics: string[];
  elapsedMs: number;
  adapter: string;
  model?: string;
};

export type AgentEvalReport = {
  records: AgentEvalRecord[];
  guideTokens: number;
  checkoutTokens: number;
  rates: { firstPass: number; repaired: number; responsive: number; semantic: number };
  passed: boolean;
};

export async function loadAgentEvalAdapter(modulePath: string): Promise<AgentEvalAdapter> {
  const imported = await import(pathToFileURL(path.resolve(modulePath)).href);
  const adapter = imported.default ?? imported.adapter;
  if (!adapter || typeof adapter.id !== "string" || typeof adapter.generate !== "function") throw new Error("Agent adapter must export { id, model?, generate() }.");
  return adapter;
}

export async function evaluateAgentCases(adapter?: AgentEvalAdapter): Promise<AgentEvalReport> {
  const guide = createAgentGuide({ mode: "compact" });
  const records: AgentEvalRecord[] = [];
  for (const item of agentEvalCases) records.push(await evaluateCase(item, guide, adapter));
  const count = records.length || 1;
  const rates = {
    firstPass: records.filter(({ firstPass }) => firstPass).length / count,
    repaired: records.filter(({ repaired }) => repaired).length / count,
    responsive: records.filter(({ responsive }) => responsive).length / count,
    semantic: records.filter(({ semantic }) => semantic).length / count,
  };
  const checkoutTokens = encode(await readFile(path.resolve("fixtures/comparisons/checkout.livery"), "utf8")).length;
  const guideTokens = encode(guide).length;
  return {
    records,
    guideTokens,
    checkoutTokens,
    rates,
    passed: rates.firstPass >= 0.9 && rates.repaired === 1 && rates.responsive === 1 && rates.semantic === 1 && guideTokens < 300 && checkoutTokens <= 88,
  };
}

async function evaluateCase(item: AgentEvalCase, guide: string, adapter?: AgentEvalAdapter): Promise<AgentEvalRecord> {
  const started = performance.now();
  const committed = await readFile(path.resolve(item.fixture), "utf8");
  const source = adapter ? await adapter.generate({ prompt: item.prompt, guide }) : committed;
  const first = compileProgram(source);
  const firstPass = Boolean(first.document) && !first.diagnostics.some(({ severity }) => severity === "error");
  let finalSource = source;
  if (!firstPass) {
    if (adapter) finalSource = await adapter.generate({ prompt: item.prompt, guide, repair: createRepairPrompt(source, first.diagnostics) });
    else if (item.repairFixture) finalSource = await readFile(path.resolve(item.repairFixture), "utf8");
  }
  const compiled = compileProgram(finalSource);
  const repaired = Boolean(compiled.document) && !compiled.diagnostics.some(({ severity }) => severity === "error");
  const responsive = repaired && [320, 720].every((width) => Boolean(render(finalSource, { width }).scene));
  const semantic = Boolean(compiled.document && assertSemantics(compiled.document, item.assertions));
  return {
    id: item.id,
    promptTokens: encode(item.prompt).length,
    sourceTokens: encode(finalSource).length,
    firstPass,
    repaired,
    responsive,
    semantic,
    diagnostics: compiled.diagnostics.map(({ code }) => code),
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
    adapter: adapter?.id ?? "committed-replay",
    ...(adapter?.model ? { model: adapter.model } : {}),
  };
}

function assertSemantics(document: VisualDocument, assertions: AgentSemanticAssertions) {
  const nodes = flatten(document.root);
  const labels = new Set<string>([document.title, ...nodes.map(({ label }) => label)].filter((value): value is string => Boolean(value)));
  const kinds = new Set<string>(nodes.map(({ kind }) => kind));
  return (assertions.labels?.every((label) => labels.has(label)) ?? true)
    && (assertions.componentKinds?.every((kind) => kinds.has(kind)) ?? true)
    && (assertions.primitiveKinds?.every((kind) => kinds.has(kind)) ?? true)
    && document.connectors.length >= (assertions.minimumConnectors ?? 0)
    && document.timelines.reduce((total, timeline) => total + timeline.states.length, 0) >= (assertions.minimumTimelineStates ?? 0);
}

function flatten(node: VisualNode): VisualNode[] {
  return [node, ...(node.children?.flatMap(flatten) ?? [])];
}
