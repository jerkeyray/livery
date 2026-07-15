import { describe, expect, it } from "vitest";

import { measureVisualText, measureVisualTextBlock, wrapVisualText } from "./text-metrics.js";

describe("visual text metrics", () => {
  it("distinguishes narrow and wide Inter-like glyphs deterministically", () => {
    expect(measureVisualText("WWW", { fontSize: 13 })).toBeGreaterThan(measureVisualText("iii", { fontSize: 13 }) * 2);
    expect(measureVisualText("Checkout API", { fontSize: 13, fontWeight: 650 })).toBe(measureVisualText("Checkout API", { fontSize: 13, fontWeight: 650 }));
  });

  it("wraps at word boundaries when words fit", () => {
    expect(wrapVisualText("Payment provider", 72, { fontSize: 13, fontWeight: 650 })).toEqual(["Payment", "provider"]);
  });

  it("keeps editorial callout phrases together when space is available", () => {
    expect(wrapVisualText("Quarter-turn handle rotates the internal disc", 166, { fontSize: 13, fontWeight: 600 })).toEqual([
      "Quarter-turn handle rotates",
      "the internal disc",
    ]);
  });

  it("splits only unbreakable words that exceed the available width", () => {
    const lines = wrapVisualText("extraordinarilylongidentifier", 48, { fontSize: 13 });
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("extraordinarilylongidentifier");
    expect(lines.every((line) => measureVisualText(line, { fontSize: 13 }) <= 48)).toBe(true);
  });

  it("returns the exact line count used for block height", () => {
    const block = measureVisualTextBlock("Research agent", 68, { fontSize: 13, fontWeight: 650, lineHeight: 18 });
    expect(block.height).toBe(block.lines.length * 18);
    expect(block.width).toBeLessThanOrEqual(68);
  });
});
