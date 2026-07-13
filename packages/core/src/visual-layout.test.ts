import { describe, expect, it } from "vitest";
import { compileVisual, solveVisualDocument, visualSceneToSvg } from "./index.js";

const source = `figure cache("Cache read-through") {
  app = lib.service(label: "Application")
  cache = lib.cache(label: "Cache")
  db = lib.database(label: "Database")
  hit = connect(app.right, cache.left, label: "read")
  miss = connect(cache.right, db.left, label: "miss")
  row(gap: lg) {
    app
    cache
    db
  }
}`;

describe("visual constraint layout and export", () => {
  it("solves deterministic bounds and anchor paths", () => {
    const document = compileVisual(source).document!;
    const first = solveVisualDocument(document, 720);
    const second = solveVisualDocument(document, 720);
    expect(first).toEqual(second);
    expect(first.nodes.map(({ id }) => id)).toEqual(["app", "cache", "db"]);
    expect(first.connectors).toHaveLength(2);
    expect(first.connectors[0]?.path).toMatch(/^M /);
  });

  it("uses the same canonical theme and caller overrides for SVG", () => {
    const scene = solveVisualDocument(compileVisual(source).document!, 720);
    const svg = visualSceneToSvg(scene, { tokenOverrides: { "color.accent": "#ff00ff", "color.surface": "#fefefe" } });
    expect(svg).toContain('fill="#fefefe"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Cache read-through");
  });

  it("reflows a wide root row vertically in chat width", () => {
    const scene = solveVisualDocument(compileVisual(source).document!, 320);
    expect(scene.nodes[1]!.y).toBeGreaterThan(scene.nodes[0]!.y);
    expect(scene.connectors[0]!.path).toContain(`${scene.nodes[0]!.y + scene.nodes[0]!.height}`);
    expect(scene.width).toBe(320);
  });

  it("routes long connectors around intervening nodes", () => {
    const document = compileVisual(`figure obstacle {\n a = service("A")\n b = service("B")\n c = database("C")\n a.right -> c.left("long")\n row(a, b, c, gap: lg)\n}`).document!;
    const scene = solveVisualDocument(document, 720);
    expect(scene.connectors[0]?.path).toContain(" L ");
    expect(scene.connectors[0]!.labelY).toBeGreaterThan(scene.nodes[1]!.y + scene.nodes[1]!.height);
  });

  it("applies explicit alignment and distribution constraints", () => {
    const document = compileVisual(`figure constrained {\n a = box("A")\n b = box("B")\n c = box("C")\n row(a, b, c)\n align(a, b, axis: y, edge: start)\n distribute(a, b, c, axis: x, gap: 40)\n}`).document!;
    const scene = solveVisualDocument(document, 720);
    expect(scene.nodes[0]!.y).toBe(scene.nodes[1]!.y);
    expect(scene.nodes[1]!.x - (scene.nodes[0]!.x + scene.nodes[0]!.width)).toBe(40);
  });

  it("routes vertical connectors around intervening nodes after reflow", () => {
    const document = compileVisual(`figure vertical {\n a = box("A")\n b = box("B")\n c = box("C")\n a.right -> c.left("long")\n row(a, b, c, gap: lg)\n}`).document!;
    const scene = solveVisualDocument(document, 320);
    expect(scene.connectors[0]?.path).toContain(" L ");
    expect(scene.connectors[0]!.labelX).toBeGreaterThan(scene.nodes[1]!.x + scene.nodes[1]!.width);
  });
});
