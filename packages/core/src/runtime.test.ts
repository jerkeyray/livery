import { describe, expect, it } from "vitest";

import { compileProgram, exportVisual, render } from "./runtime.js";

const visualSource = `figure runtime("Runtime") {
  api = box("API", fill: "#fef3c7", stroke: "#92400e")
  worker = box("Worker")
  call = api.right -> worker.left("dispatch", variant: async, stroke: "#2563eb")
  row(api, worker, gap: 40)
}`;

describe("canonical visual runtime", () => {
  it("compiles and renders programmable visual source", () => {
    const result = render(visualSource, { width: 480 });

    expect(result.diagnostics).toEqual([]);
    expect(result.document?.type).toBe("livery.visual");
    expect(result.scene?.type).toBe("livery.board-scene");
    expect(result.report?.valid).toBe(true);
    expect(result.svg).toContain('fill="#fef3c7"');
    expect(result.svg).toContain('data-livery-variant="async"');
    expect(result.svg).toContain('stroke="#2563eb"');
  });

  it("translates legacy flow source before solving a board scene", () => {
    const result = compileProgram(`flow legacy("Legacy") { sender -> receiver("send") }`);

    expect(result.document?.type).toBe("livery.visual");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "compat.legacy_source", severity: "warning" }));
  });

  it("exports SVG and JSON from the same solved visual scene", () => {
    const svg = exportVisual(visualSource, { format: "svg", width: 480 });
    const json = exportVisual(visualSource, { format: "json", width: 480 });
    const payload = JSON.parse(json.output!);

    expect(svg.output).toContain("<svg");
    expect(svg.scene?.id).toBe(payload.scene.id);
    expect(payload.document.type).toBe("livery.visual");
    expect(payload.scene.type).toBe("livery.board-scene");
  });

  it("returns diagnostics instead of output for invalid programs", () => {
    const result = exportVisual("figure broken { missing = unknown() }", { format: "svg" });

    expect(result.output).toBeUndefined();
    expect(result.scene).toBeUndefined();
    expect(result.diagnostics.some(({ severity }) => severity === "error")).toBe(true);
  });
});
