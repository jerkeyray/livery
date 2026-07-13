import { describe, expect, it } from "vitest";
import { solvePinboard } from "./pinboard.js";
import type { VisualDocument } from "./visual.js";

describe("pinboard bounded boards", () => {
  it("returns a validated scene or a typed failure for generated boards", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const count = 2 + seed % 8;
      const children = Array.from({ length: count }, (_, index) => ({ id: `node_${index}`, kind: index % 3 === 0 ? "lib.database" as const : "box" as const, label: `${"wide_".repeat(seed % 5)}node ${index}` }));
      const connectors = children.slice(1).map((child, index) => ({ id: `edge_${index}`, from: { node: children[index]!.id, anchor: "right" as const }, to: { node: child.id, anchor: "left" as const }, label: `${"route_".repeat(seed % 4)}${index}` }));
      const document: VisualDocument = { type: "livery.visual", version: "0.2", id: `generated_${seed}`, root: { id: "root", kind: "group", layout: { kind: seed % 2 ? "row" : "grid", columns: 3, gap: 24 }, children }, connectors, constraints: [], timelines: [] };
      const result = solvePinboard(document, { width: [320, 480, 720, 1024][seed % 4]! });
      if (result.ok) expect(result.report.valid).toBe(true);
      else {
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics.every(({ code }) => code.startsWith("layout."))).toBe(true);
      }
    }
  });

  it("serializes identical solved geometry across repeated runs", () => {
    const document: VisualDocument = { type: "livery.visual", version: "0.2", id: "golden", root: { id: "root", kind: "group", layout: { kind: "row", gap: 40 }, children: [{ id: "a", kind: "box", label: "A" }, { id: "b", kind: "box", label: "B" }] }, connectors: [{ id: "a_b", from: { node: "a", anchor: "right" }, to: { node: "b", anchor: "left" }, label: "send" }], constraints: [], timelines: [] };
    expect(JSON.stringify(solvePinboard(document, { width: 480 }))).toBe(JSON.stringify(solvePinboard(document, { width: 480 })));
  });

  it("stays within structural solve budgets", () => {
    const children = Array.from({ length: 12 }, (_, index) => ({ id: `n${index}`, kind: "box" as const, label: `Node ${index}` }));
    const document: VisualDocument = { type: "livery.visual", version: "0.2", id: "budget", root: { id: "root", kind: "group", layout: { kind: "grid", columns: 4, gap: 32 }, children }, connectors: children.slice(1).map((node, index) => ({ id: `e${index}`, from: { node: children[index]!.id, anchor: "right" }, to: { node: node.id, anchor: "left" }, label: `edge ${index}` })), constraints: [], timelines: [] };
    const result = solvePinboard(document, { width: 1024 });
    expect(result.attempts.length).toBeLessThanOrEqual(5);
    if (result.ok) expect(Math.max(...result.scene.connectors.map(({ points }) => points.length))).toBeLessThanOrEqual(6);
  });
});
