import { describe, expect, it } from "vitest";
import { planHierarchy } from "./hierarchy-layout.js";
import { solvePinboard } from "./pinboard.js";
import { compileVisual, formatVisualDocument } from "./program.js";
import type { Connector, VisualNode } from "./visual.js";

describe("native hierarchy layout", () => {
  it("centers a parent over stable source-ordered children", () => {
    const nodes = ["parent", "first", "second"].map((id) => ({ id, kind: "lib.card", label: id } satisfies VisualNode));
    const connectors: Connector[] = [
      { id: "first", from: { node: "parent" }, to: { node: "first" }, role: "primary" },
      { id: "second", from: { node: "parent" }, to: { node: "second" }, role: "primary" },
    ];
    const plan = planHierarchy(nodes.map((node) => ({ node, width: 120, height: 64 })), connectors, { direction: "down", gap: 24, rankGap: 40, maxWidth: 720 });
    const parent = plan.placements.find(({ index }) => index === 0)!;
    expect(parent.x + 60).toBe(plan.width / 2);
    expect(plan.bundleIds.get("first")).toBe("hierarchy.parent");
    expect(plan.placements.map(({ index }) => index)).toEqual([0, 1, 2]);
  });

  it("keeps wide balanced-tree siblings on their semantic ranks at 900px", () => {
    const compiled = compileVisual(`figure b_tree("B-tree") {
      rootNode = card("[20 | 40]", subtitle: "separator keys")
      left = card("[10]", subtitle: "internal")
      middle = card("[30]", subtitle: "internal")
      right = card("[50 | 60]", subtitle: "internal")
      l1 = card("[5 | 8]", subtitle: "leaf · same depth")
      l2 = card("[12 | 15]", subtitle: "leaf · same depth")
      m1 = card("[22 | 28]", subtitle: "leaf · same depth")
      m2 = card("[35 | 38]", subtitle: "leaf · same depth")
      r1 = card("[45 | 48]", subtitle: "leaf · same depth")
      r2 = card("[55 | 58]", subtitle: "leaf · same depth")
      r3 = card("[62 | 68]", subtitle: "leaf · same depth")
      a = connect(rootNode.bottom, left.top, role: primary)
      b = connect(rootNode.bottom, middle.top, role: primary)
      c = connect(rootNode.bottom, right.top, role: primary)
      d = connect(left.bottom, l1.top, role: primary)
      e = connect(left.bottom, l2.top, role: primary)
      f = connect(middle.bottom, m1.top, role: primary)
      g = connect(middle.bottom, m2.top, role: primary)
      h = connect(right.bottom, r1.top, role: primary)
      i = connect(right.bottom, r2.top, role: primary)
      j = connect(right.bottom, r3.top, role: primary)
      hierarchy(rootNode, left, middle, right, l1, l2, m1, m2, r1, r2, r3, direction: down, gap: xs, rankGap: lg)
    }`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 900 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const y = (id: string) => result.scene.elements.find((element) => element.id === id)!.bounds.y;
    expect(new Set(["left", "middle", "right"].map(y))).toHaveLength(1);
    expect(new Set(["l1", "l2", "m1", "m2", "r1", "r2", "r3"].map(y))).toHaveLength(1);
    expect(result.report.metrics.crossingCount).toBe(0);
  });

  it("compiles and renders the complete university governance fixture at target widths", async () => {
    const source = await readFixture("university-governance");
    const compiled = compileVisual(source);
    expect(compiled.diagnostics).toEqual([]);
    expect(compileVisual(formatVisualDocument(compiled.document!)).diagnostics).toEqual([]);
    for (const width of [360, 480, 720, 900, 1200]) {
      const first = solvePinboard(compiled.document!, { width });
      expect(first.ok, `${width}: ${first.ok ? "" : first.diagnostics.map(({ code }) => code).join(", ")}`).toBe(true);
      if (width === 900) expect(solvePinboard(compiled.document!, { width })).toEqual(first);
      if (!first.ok) continue;
      expect(first.scene.elements).toHaveLength(24);
      expect(first.report.metrics.crossingCount).toBe(0);
      expect(first.report.metrics.overlappingSegmentCount).toBe(0);
      expect(first.scene.elements.map(({ id }) => id)).toEqual(expect.arrayContaining([
        "board", "president", "academic.provost", "academic.science.biology", "academic.business.management",
        "operations.hr", "student_life.organizations", "senate", "council",
      ]));
      for (const frame of first.scene.elements.filter(({ kind }) => kind === "frame")) {
        const children = first.scene.elements.filter(({ parent }) => parent === frame.id);
        if (!frame.labelBounds || !children.length) continue;
        expect(
          Math.min(...children.map(({ bounds }) => bounds.y)),
          `${width}: ${frame.id} content overlaps its heading`,
        ).toBeGreaterThanOrEqual(frame.labelBounds.y + frame.labelBounds.height + 8);
      }
      for (const connector of first.scene.connectors.filter(({ variant }) => variant === "advisory")) {
        expect(connector.points.every(({ x, y }) => x >= 0 && x <= first.scene.board.width && y >= 0 && y <= first.scene.board.height), `${width}: ${connector.id} is clipped`).toBe(true);
      }
      if (width === 900) {
        const divisions = ["academic", "operations", "student_life"].map((id) => first.scene.elements.find((element) => element.id === id)!);
        expect(new Set(divisions.map(({ bounds }) => bounds.y)).size).toBe(1);
        const council = first.scene.elements.find(({ id }) => id === "council")!;
        const studentLife = divisions[2]!;
        expect(council.bounds.y).toBeLessThan(studentLife.bounds.y + studentLife.bounds.height + 96);
      }
    }
  }, 60_000);

  it("reserves label space for authored icons on generic cards", () => {
    const compiled = compileVisual(`figure icons { leader = card("Board of Trustees", icon: "team") hierarchy(leader, direction: down) }`);
    const result = solvePinboard(compiled.document!, { width: 480 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leader = result.scene.elements.find(({ id }) => id === "leader")!;
    expect(leader.labelBounds!.x).toBeGreaterThanOrEqual(leader.bounds.x + 48);
  });

  it("rejects structural cycles and multiple reporting parents", () => {
    const cycle = compileVisual(`figure cycle { a = card("A") b = card("B") ab = connect(a.bottom, b.top) ba = connect(b.bottom, a.top) hierarchy(a, b) }`).document!;
    expect(solvePinboard(cycle, { width: 720 })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "layout.hierarchy_cycle" })]) });
    const multiple = compileVisual(`figure multiple { a = card("A") b = card("B") c = card("C") ac = connect(a.bottom, c.top) bc = connect(b.bottom, c.top) hierarchy(a, b, c) }`).document!;
    expect(solvePinboard(multiple, { width: 720 })).toMatchObject({ ok: false, diagnostics: expect.arrayContaining([expect.objectContaining({ code: "layout.hierarchy_multiple_parents" })]) });
  });

  it("renders the medium hierarchy acceptance gallery", async () => {
    for (const fixture of ["biological-taxonomy", "corporate-org", "decision-tree", "historical-causes", "newspaper-editorial"]) {
      const source = await readFixture(fixture);
      const compiled = compileVisual(source);
      expect(compiled.diagnostics, fixture).toEqual([]);
      const result = solvePinboard(compiled.document!, { width: 900 });
      expect(result.ok, fixture).toBe(true);
      if (result.ok) expect(result.report.metrics.crossingCount, fixture).toBe(0);
    }
  }, 30_000);
});

async function readFixture(name: string) {
  // @ts-expect-error Node types are intentionally excluded from the published core package.
  const nodeFs = await import("node:fs/promises") as { readFile(path: URL, encoding: "utf8"): Promise<string> };
  return nodeFs.readFile(new URL(`./fixtures/${name}.livery`, import.meta.url), "utf8");
}
