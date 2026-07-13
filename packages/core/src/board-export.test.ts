import { describe, expect, it } from "vitest";
import { boardSceneToSvg } from "./board-export.js";
import { solvePinboard } from "./pinboard.js";
import { compileVisual } from "./program.js";

describe("board SVG export", () => {
  it("uses solved connector, canvas, transform, mask, and debug geometry", () => {
    const compiled = compileVisual(`component Art() {
 mask_shape = circle(x: 20, y: 20, width: 60, height: 60)
 shape = box(x: 20, y: 20, width: 60, height: 60, rotate: 20, mask: mask_shape)
 return canvas(width: 120, height: 100) {
  mask_shape
  shape
 }
}
figure export_test {
 art = Art()
 note = note("Result")
 edge = art.shape.right -> note.left("label")
 row(art, note, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 640 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const svg = boardSceneToSvg(result.scene, { debug: true });
    expect(svg).toContain('data-livery-id="edge"');
    expect(svg).toContain('data-livery-id="art.shape"');
    expect(svg).toContain('mask="url(#art-shape-mask)"');
    expect(svg).toContain('transform="translate(0 0) rotate(20');
    expect(svg).toContain('data-livery-debug="true"');
    for (const point of result.scene.connectors[0]!.points) expect(svg).toContain(`${point.x} ${point.y}`);
  });
});
