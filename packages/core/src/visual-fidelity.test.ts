import { describe, expect, it } from "vitest";

import { boardSceneToSvg } from "./board-export.js";
import { compileVisual, formatVisualDocument } from "./program.js";
import { solvePinboard } from "./pinboard.js";
import { computeTimelineState } from "./timeline.js";

function compileAndSolve(source: string, width = 480) {
  const compiled = compileVisual(source);
  expect(compiled.diagnostics).toEqual([]);
  expect(compiled.document).toBeDefined();
  const layout = solvePinboard(compiled.document!, { width });
  expect(layout.ok, layout.ok ? undefined : layout.diagnostics.map(({ message }) => message).join("\n")).toBe(true);
  if (!layout.ok) throw new Error("Expected a valid board scene.");
  return { document: compiled.document!, scene: layout.scene };
}

describe("visual language fidelity", () => {
  it("preserves string contents that resemble comments or block syntax", () => {
    const result = compileVisual(`figure strings("Strings") {
      image = image(src: "https://example.com/{asset}.png")
      label = text("escaped \\"quote\\" // literal", x: 0, y: 0, width: 180, height: 20)
      canvas(image, label, width: 200, height: 80)
    }`);

    expect(result.diagnostics).toEqual([]);
    const children = result.document!.root.children!;
    expect(children.find(({ id }) => id === "image")?.props?.src).toBe("https://example.com/{asset}.png");
    expect(children.find(({ id }) => id === "label")?.label).toBe('escaped "quote" // literal');
  });

  it("validates component arguments and duplicate bindings", () => {
    const wrongType = compileVisual(`component Meter(value: number) {
      body = box(width: value)
      return row { body }
    }
    figure demo("Demo") { meter = Meter("large") row(meter) }`);
    expect(wrongType.diagnostics.map(({ code }) => code)).toContain("semantic.invalid_component_argument");

    const extraArgument = compileVisual(`component Label(value: string) {
      body = text(value)
      return canvas(width: 100, height: 30) { body }
    }
    figure demo("Demo") { label = Label("one", "two") row(label) }`);
    expect(extraArgument.diagnostics.map(({ code }) => code)).toContain("semantic.excess_component_argument");

    const duplicate = compileVisual(`component Dots() {
      dot = circle(x: 0, y: 0, width: 10, height: 10)
      dot = circle(x: 20, y: 0, width: 10, height: 10)
      return canvas(width: 40, height: 20) { dot }
    }
    figure demo("Demo") { dots = Dots() row(dots) }`);
    expect(duplicate.diagnostics.map(({ code }) => code)).toContain("semantic.duplicate_binding");
  });

  it("localizes semantic errors and rejects duplicate named arguments", () => {
    const invalidType = compileVisual(`component Meter(value: number) {
      body = box(width: value)
      return row { body }
    }
    figure demo("Demo") {
      meter = Meter("large")
      row(meter)
    }`);
    expect(invalidType.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic.invalid_component_argument",
      span: expect.objectContaining({ start: expect.objectContaining({ line: 6 }) }),
    }));

    const duplicate = compileVisual(`figure demo("Demo") {
      note = box("Note", fill: "red", fill: "blue")
      row(note)
    }`);
    expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({
      code: "semantic.duplicate_named_argument",
      span: expect.objectContaining({ start: expect.objectContaining({ line: 2 }) }),
    }));
  });

  it("expands the returned component tree in order and substitutes connector parameters", () => {
    const result = compileVisual(`component Ordered(message: string) {
      second = box("Second")
      unused = box("Unused")
      first = box("First")
      link = first.right -> second.left(message)
      return row(gap: 24) {
        first
        second
      }
    }
    figure demo("Demo") {
      pair = Ordered("next")
      row(pair)
    }`);

    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.children?.[0]?.children?.map(({ id }) => id)).toEqual(["pair.first", "pair.second"]);
    expect(result.document?.connectors).toContainEqual(expect.objectContaining({ id: "pair.link", label: "next" }));
  });

  it("preserves and renders authored primitive properties", () => {
    const { scene } = compileAndSolve(`figure primitives("Primitives") {
      title = text("Hello", x: 8, y: 8, width: 80, height: 18, fill: "#123456", fontSize: 14)
      dot = circle(x: 8, y: 36, width: 24, height: 24, fill: "#ff0000", stroke: "#00ff00", strokeWidth: 2)
      picture = image(src: "https://example.com/image.png", x: 44, y: 34, width: 32, height: 28)
      symbol = icon(name: "star", x: 88, y: 34, width: 28, height: 28)
      canvas(title, dot, picture, symbol, width: 140, height: 80)
    }`);
    const deniedSvg = boardSceneToSvg(scene);
    const svg = boardSceneToSvg(scene, { resourcePolicy: { allowedImageHosts: ["example.com"] } });

    expect(svg).toContain(">Hello</text>");
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('stroke="#00ff00"');
    expect(deniedSvg).not.toContain("<image");
    expect(svg).toContain("<image");
    expect(svg).toContain('href="https://example.com/image.png"');
    expect(svg).toContain('data-livery-icon="star"');
  });

  it("keeps groups nonvisual while preserving child hierarchy", () => {
    const { scene } = compileAndSolve(`component Mark() {
      group = group(x: 10, y: 10) {
        dot = circle(x: 0, y: 0, width: 16, height: 16, fill: "#ff0000")
      }
      return canvas(width: 60, height: 40) { group }
    }
    figure demo("Demo") { mark = Mark() row(mark) }`);
    const svg = boardSceneToSvg(scene);

    expect(svg).toContain('data-livery-group="mark.group"');
    expect(svg).toContain('data-livery-id="mark.group.dot"');
    expect(svg).not.toMatch(/<rect[^>]+data-livery-id="mark\.group"/);
  });

  it("carries connector variants and styles into SVG", () => {
    const { scene } = compileAndSolve(`figure connectors("Connectors") {
      a = box("A")
      b = box("B")
      link = connect(a.right, b.left, label: "sync", variant: bidirectional, stroke: "#765432")
      row(a, b, gap: xl)
    }`);
    const svg = boardSceneToSvg(scene);

    expect(scene.connectors[0]).toMatchObject({ variant: "bidirectional", style: { stroke: "#765432" } });
    expect(svg).toContain('data-livery-variant="bidirectional"');
    expect(svg).toContain('stroke="#765432"');
    expect(svg).toContain("marker-start=");
  });

  it("applies constraints to solved geometry", () => {
    const source = (constraint: string) => `figure constrained("Constrained") {
      a = box("A", width: 120)
      b = box("B", width: 120)
      column(a, b, gap: md)
      ${constraint}
    }`;
    const baseline = compileAndSolve(source(""));
    const constrained = compileAndSolve(source("near(a, b, distance: 80)"));
    const baselineGap = baseline.scene.elements.find(({ id }) => id === "b")!.bounds.y
      - (baseline.scene.elements.find(({ id }) => id === "a")!.bounds.y + baseline.scene.elements.find(({ id }) => id === "a")!.bounds.height);
    const constrainedGap = constrained.scene.elements.find(({ id }) => id === "b")!.bounds.y
      - (constrained.scene.elements.find(({ id }) => id === "a")!.bounds.y + constrained.scene.elements.find(({ id }) => id === "a")!.bounds.height);
    expect(constrainedGap).toBe(80);
    expect(constrainedGap).not.toBe(baselineGap);
  });

  it("renders component timeline transforms from the validated motion envelope", () => {
    const { document, scene } = compileAndSolve(`figure motion("Motion") {
      node = box("Node")
      row(node)
      timeline movement {
        state shifted { set(node, translateX: 20, translateY: 8) }
      }
    }`);
    const state = computeTimelineState(document.timelines[0]!, "shifted", scene);
    const svg = boardSceneToSvg(scene, { state });
    expect(svg).toMatch(/data-livery-id="node"[^>]*transform="translate\(20 8\)/);
  });

  it("formats documents without changing their visual meaning", () => {
    const source = `figure round_trip("Round trip") {
      dot = circle(x: 4, y: 6, width: 20, height: 20, fill: "#ff0000")
      label = text("Hello", x: 30, y: 6, width: 50, height: 20)
      canvas(dot, label, width: 100, height: 40)
    }`;
    const first = compileVisual(source);
    expect(first.diagnostics).toEqual([]);
    const formatted = formatVisualDocument(first.document!);
    const second = compileVisual(formatted);
    expect(second.diagnostics).toEqual([]);
    expect(second.document).toEqual(first.document);
  });
});
