import { describe, expect, it } from "vitest";
import { blackoutTheme, blueprintTheme, editorialTheme, midnightTheme, monochromeTheme, paperTheme, render } from "@liveryscript/core";

const source = `figure foundation("Visual foundation") {
  normal = service("Default", subtitle: "Neutral")
  muted = service("Muted", variant: muted)
  emphasis = service("Emphasis", variant: emphasis)
  soft = service("Soft info", variant: soft, tone: info)
  solid = service("Solid success", variant: solid, tone: success)
  ghost = service("Ghost", variant: ghost)
  grid(normal, muted, emphasis, soft, solid, ghost, columns: 2, gap: lg)
}`;

const themes = [
  ["editorial", editorialTheme],
  ["paper", paperTheme],
  ["midnight", midnightTheme],
  ["blackout", blackoutTheme],
  ["blueprint", blueprintTheme],
  ["monochrome", monochromeTheme],
] as const;

describe("visual foundation proof matrix", () => {
  it.each(themes)("lays out every variant in %s at mobile, standard, and wide widths", (_name, theme) => {
    for (const width of [320, 720, 1200]) {
      const result = render(source, { theme, width });
      expect(result.diagnostics, `${theme.name}:${width}`).toEqual([]);
      expect(result.report?.valid).toBe(true);
      expect(result.report?.metrics.crossingCount).toBe(0);
      expect(result.svg).not.toMatch(/(?:NaN|Infinity|undefined)/);
    }
  });

  it.each(themes)("keeps %s text and captions readable on every base surface", (_name, theme) => {
    const { canvas, surface, text, muted } = theme.tokens.color;
    expect(contrast(text!, surface!)).toBeGreaterThanOrEqual(7);
    expect(contrast(text!, canvas!)).toBeGreaterThanOrEqual(7);
    expect(contrast(muted!, surface!)).toBeGreaterThanOrEqual(4.5);
  });
});

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
