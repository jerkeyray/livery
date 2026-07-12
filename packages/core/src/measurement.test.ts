import { describe, expect, it } from "vitest";

import { estimatedMeasurementService } from "./measurement.js";

const constraints = { minWidth: 152, maxWidth: 220, minHeight: 72, maxLines: 2 };

describe("estimatedMeasurementService", () => {
  it("keeps short labels compact", () => {
    expect(estimatedMeasurementService.measureEntity({ id: "api", label: "API" }, constraints)).toEqual({
      width: 152,
      height: 72,
      lineCount: 1,
    });
  });

  it("bounds long labels to two lines", () => {
    const measurement = estimatedMeasurementService.measureEntity(
      { id: "long", label: "A considerably longer service label that needs wrapping" },
      constraints,
    );

    expect(measurement.width).toBe(220);
    expect(measurement.height).toBe(89);
    expect(measurement.lineCount).toBe(2);
  });

  it("accounts for wide non-ascii text without exceeding constraints", () => {
    const measurement = estimatedMeasurementService.measureEntity(
      { id: "unicode", label: "payment processing service" },
      constraints,
    );

    expect(measurement.width).toBeGreaterThanOrEqual(constraints.minWidth);
    expect(measurement.width).toBeLessThanOrEqual(constraints.maxWidth);
  });
});
