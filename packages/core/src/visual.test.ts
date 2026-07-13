import { describe, expect, it } from "vitest";
import { canonicalTheme, instantiateStandardComponent, resolveComponentStyle, resolveTheme, resolveVisualValue, standardLibrary, visualDocumentSchema } from "./index.js";

describe("programmable visual contracts", () => {
  it("builds standard components from public visual primitives", () => {
    expect(instantiateStandardComponent("database", "orders", { label: "Orders" })).toMatchObject({
      id: "orders",
      kind: "lib.database",
      label: "Orders",
      anchors: ["top", "right", "bottom", "left", "center"],
    });
  });

  it("resolves canonical tokens and caller overrides deterministically", () => {
    const tokens = resolveTheme(canonicalTheme, { "color.accent": "#ff0000" });
    expect(resolveVisualValue("$color.accent", tokens)).toBe("#ff0000");
    expect(resolveVisualValue("$space.md", tokens)).toBe(16);
  });

  it("applies component variants before primitive style overrides", () => {
    const theme = { ...canonicalTheme, components: { ...canonicalTheme.components, box: { base: { fill: "$color.surface" }, variants: { emphasis: { strokeWidth: 2, fill: "$color.accent" } } } } };
    expect(resolveComponentStyle("box", "emphasis", { fill: "#fff" }, theme)).toMatchObject({ fill: "#fff", strokeWidth: 2 });
  });

  it("documents standard component ports, tokens, sizing, and accessibility", () => {
    expect(standardLibrary.database).toMatchObject({
      ports: ["top", "right", "bottom", "left", "center"],
      intrinsicSize: { minWidth: 120, minHeight: 64 },
      accessibility: { labelParameter: "label" },
    });
  });

  it("exposes a canonical visual document schema", () => {
    expect(visualDocumentSchema.safeParse({ type: "livery.visual", version: "0.2", id: "empty", root: { id: "root", kind: "group" } }).success).toBe(true);
  });
});
