import { describe, expect, it } from "vitest";

import { compileProgram, exportVisual, render } from "./runtime.js";
import { blackoutTheme, blueprintTheme, editorialTheme, midnightTheme, monochromeTheme, paperTheme } from "./theme.js";

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

  it("renders standard-component overrides, subtitles, icons, and tone precedence", () => {
    const result = render(`figure styled("Styled") {
 stripe = service("Stripe", subtitle: "Payment provider", icon: "credit-card", tone: info, fill: "#f3e8ff", stroke: "#7c3aed", color: "#4c1d95", iconColor: "#7c3aed", radius: 12)
 queue = queue("Orders", tone: warning)
 row(stripe, queue, gap: xl)
}`, { width: 560 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('fill="#f3e8ff"');
    expect(result.svg).toContain('stroke="#7c3aed"');
    expect(result.svg).toContain('fill="#4c1d95"');
    expect(result.svg).toContain('data-livery-glyph="credit-card"');
    expect(result.svg).toContain("Payment provider");
    expect(result.svg).toContain('fill="#fffbeb"');
  });

  it("renders a labeled frame behind its nested children", () => {
    const result = render(`figure framed {
 backend = frame("Backend", subtitle: "Private network", layout: row, gap: lg, padding: lg, fill: "#f8fafc") {
  api = service("API")
  db = database("Orders")
  write = api.right -> db.left("write")
 }
 row(backend)
}`, { width: 640 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('data-livery-id="backend"');
    expect(result.svg).toContain('data-livery-id="backend.api"');
    expect(result.svg).toContain("Private network");
    const frameIndex = result.svg!.indexOf('data-livery-id="backend"');
    const connectorIndex = result.svg!.indexOf('data-livery-connector="backend.write"');
    const childIndex = result.svg!.indexOf('data-livery-id="backend.api"');
    expect(frameIndex).toBeLessThan(connectorIndex);
    expect(connectorIndex).toBeLessThan(childIndex);
  });

  it.each([
    ["editorial", editorialTheme, "#f8fafc", "#172033"],
    ["paper", paperTheme, "#f8f5ee", "#24211d"],
    ["midnight", midnightTheme, "#0f1629", "#eef2ff"],
    ["blackout", blackoutTheme, "#050505", "#fafafa"],
    ["blueprint", blueprintTheme, "#091a2d", "#e8f5ff"],
    ["monochrome", monochromeTheme, "#fafafa", "#0a0a0a"],
  ])("renders the %s theme with accessible title metadata", (_name, theme, canvas, text) => {
    const result = render(`figure themed("Theme preview") { api = service("API", subtitle: "Public endpoint") row(api) }`, { theme, width: 360 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain(`fill="${canvas}"`);
    expect(result.svg).toContain(`fill="${text}"`);
    expect(result.svg).toContain('<title id="themed-title">Theme preview</title>');
    expect(result.svg).toContain("<title>API: Public endpoint</title>");
  });

  it.each([["blackout", blackoutTheme], ["blueprint", blueprintTheme]] as const)("renders the %s drafting grid", (_name, theme) => {
    const result = render(`figure grid("Grid") { api = service("API") row(api) }`, { theme, width: 360 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain("patternUnits=\"userSpaceOnUse\"");
    expect(result.svg).toContain("fill=\"url(#grid-grid)\"");
  });

  it.each(["default", "muted", "emphasis", "soft", "solid", "ghost"])("renders the %s component variant", (variant) => {
    const result = render(`figure variant { api = service("API", variant: ${variant}, tone: info) row(api) }`, { width: 360 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain(`data-livery-id="api"`);
    if (variant === "solid") expect(result.svg).toContain('fill="#ffffff"');
    if (variant === "ghost") expect(result.svg).toContain('fill="transparent"');
  });

  it("applies timeline presentation after component overrides", () => {
    const result = render(`figure stateful {
 api = service("API", fill: "#f3e8ff", stroke: "#7c3aed", iconColor: "#7c3aed", radius: 12)
 row(api)
 timeline states {
  state changed { set(api, fill: "#dbeafe", stroke: "#2563eb", color: "#1e3a8a", iconColor: "#2563eb", radius: 20, fontWeight: 800) }
 }
}`, { state: "changed", width: 360 });
    expect(result.diagnostics).toEqual([]);
    expect(result.svg).toContain('fill="#dbeafe"');
    expect(result.svg).toContain('stroke="#2563eb"');
    expect(result.svg).toContain('rx="20"');
    expect(result.svg).toContain('font-weight="800"');
  });
});
