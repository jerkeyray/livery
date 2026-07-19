import { describe, expect, it } from "vitest";
import { planFlow } from "./flow-layout.js";
import type { Connector, VisualNode } from "./visual.js";

const node = (id: string): VisualNode => ({ id, kind: "lib.service", label: id });
const items = (...ids: string[]) => ids.map((id) => ({ node: node(id), width: 120, height: 72 }));
const edge = (id: string, from: string, to: string, role?: Connector["role"]): Connector => ({ id, from: { node: from }, to: { node: to }, ...(role ? { role } : {}) });

describe("native flow planner", () => {
  it("assigns a deterministic left-to-right primary spine", () => {
    const input = items("client", "api", "queue", "worker");
    const connectors = [edge("request", "client", "api", "primary"), edge("publish", "api", "queue", "primary"), edge("consume", "queue", "worker", "primary")];
    const first = planFlow(input, connectors, { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });
    const second = planFlow(input, connectors, { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });
    expect(first).toEqual(second);
    expect(first.placements.map(({ rank }) => rank)).toEqual([0, 1, 2, 3]);
    expect(first.primaryNodeIds).toEqual(new Set(["client", "api", "queue", "worker"]));
  });

  it("condenses cycles and marks their connectors as feedback", () => {
    const input = items("a", "b", "c");
    const plan = planFlow(input, [edge("ab", "a", "b"), edge("bc", "b", "c"), edge("ca", "c", "a")], { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });
    expect(new Set(plan.placements.map(({ rank }) => rank))).toEqual(new Set([0]));
    expect(plan.feedbackConnectorIds).toEqual(new Set(["ca"]));
  });

  it("reflows down at compact widths", () => {
    const plan = planFlow(items("a", "b", "c"), [edge("ab", "a", "b"), edge("bc", "b", "c")], { direction: "auto", gap: 24, rankGap: 48, maxWidth: 360 });
    expect(plan.direction).toBe("down");
    expect(plan.placements.map(({ y }) => y)).toEqual([...plan.placements.map(({ y }) => y)].sort((a, b) => a - b));
  });

  it("ranks compound children from descendant connectors", () => {
    const client: VisualNode = { id: "client", kind: "frame", children: [node("client.browser")] };
    const app: VisualNode = { id: "app", kind: "frame", children: [node("app.api")] };
    const plan = planFlow([{ node: client, width: 180, height: 140 }, { node: app, width: 180, height: 140 }], [edge("call", "client.browser", "app.api")], { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });
    expect(plan.placements.map(({ rank }) => rank)).toEqual([0, 1]);
  });

  it("keeps supporting dependencies local and aligns the primary spine", () => {
    const input = items("client", "commerce", "async", "data");
    const plan = planFlow(input, [
      edge("call", "client", "commerce", "primary"),
      edge("event", "commerce", "async", "primary"),
      edge("write", "commerce", "data", "supporting"),
    ], { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });

    expect(plan.placements.map(({ rank }) => rank)).toEqual([0, 1, 2, 1]);
    const byId = new Map(plan.placements.map((placement) => [input[placement.index]!.node.id, placement]));
    expect(byId.get("client")!.y).toBe(0);
    expect(byId.get("commerce")!.y).toBe(0);
    expect(byId.get("async")!.y).toBe(0);
    expect(byId.get("data")!.y).toBeGreaterThan(0);
  });

  it("centers unequal primary cards on one straight connector axis", () => {
    const input = [
      { node: node("user"), width: 120, height: 88 },
      { node: node("agent"), width: 160, height: 136 },
      { node: node("evidence"), width: 150, height: 104 },
      { node: node("answer"), width: 140, height: 120 },
      { node: node("tools"), width: 150, height: 112 },
    ];
    const plan = planFlow(input, [
      edge("request", "user", "agent", "primary"),
      edge("synthesize", "agent", "evidence", "primary"),
      edge("answer", "evidence", "answer", "primary"),
      edge("research", "agent", "tools", "supporting"),
      edge("findings", "tools", "evidence", "supporting"),
    ], { direction: "right", gap: 24, rankGap: 48, maxWidth: 900 });

    const byId = new Map(plan.placements.map((placement) => [input[placement.index]!.node.id, placement]));
    const centerY = (id: string) => byId.get(id)!.y + input.find(({ node: item }) => item.id === id)!.height / 2;
    expect(["user", "agent", "evidence", "answer"].map(centerY)).toEqual([68, 68, 68, 68]);
    expect(byId.get("tools")!.y).toBeGreaterThan(136);
  });

  it.each([12, 24, 48])("keeps a %i-node topology solve bounded", (count) => {
    const input = items(...Array.from({ length: count }, (_, index) => `n${index}`));
    const connectors = Array.from({ length: count - 1 }, (_, index) => edge(`e${index}`, `n${index}`, `n${index + 1}`, "primary"));
    const started = performance.now();
    const plan = planFlow(input, connectors, { direction: "auto", gap: 24, rankGap: 48, maxWidth: 1200 });
    expect(plan.placements).toHaveLength(count);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
