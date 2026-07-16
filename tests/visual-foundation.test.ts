import { describe, expect, it } from "vitest";
import { editorialTheme, midnightTheme, paperTheme, render } from "@jerkeyray/core";

const source = `figure foundation("Visual foundation") {
  normal = service("Default", subtitle: "Neutral")
  muted = service("Muted", variant: muted)
  emphasis = service("Emphasis", variant: emphasis)
  soft = service("Soft info", variant: soft, tone: info)
  solid = service("Solid success", variant: solid, tone: success)
  ghost = service("Ghost", variant: ghost)
  grid(normal, muted, emphasis, soft, solid, ghost, columns: 2, gap: lg)
}`;

describe("visual foundation proof matrix", () => {
  it.each([
    ["editorial", editorialTheme],
    ["paper", paperTheme],
    ["midnight", midnightTheme],
  ])("lays out every variant in %s at mobile, standard, and wide widths", (_name, theme) => {
    for (const width of [320, 720, 1200]) {
      const result = render(source, { theme, width });
      expect(result.diagnostics, `${theme.name}:${width}`).toEqual([]);
      expect(result.report?.valid).toBe(true);
      expect(result.report?.metrics.crossingCount).toBe(0);
      expect(result.svg).not.toMatch(/(?:NaN|Infinity|undefined)/);
    }
  });
});
