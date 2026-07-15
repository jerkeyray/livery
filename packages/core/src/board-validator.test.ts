import { describe, expect, it } from "vitest";
import { validateBoardScene, type BoardScene } from "./index.js";

function scene(): BoardScene {
  return {
    type: "livery.board-scene",
    version: "0.1",
    id: "valid",
    board: {
      width: 320,
      height: 180,
      padding: 16,
      gutter: 24,
      columns: [{ id: "column-1", index: 0, position: 16, size: 120 }, { id: "column-2", index: 1, position: 184, size: 120 }],
      rows: [{ id: "row-1", index: 0, position: 40, size: 72 }],
      channels: [{ id: "channel-1", axis: "horizontal", x: 136, y: 40, width: 48, height: 72, capacity: 2, used: 1 }],
    },
    elements: [element("a", 16), element("b", 184)],
    connectors: [{
      id: "a-b",
      from: "a",
      to: "b",
      fromPin: "right",
      toPin: "left",
      points: [{ x: 136, y: 76 }, { x: 184, y: 76 }],
      label: { text: "send", x: 145, y: 58, width: 30, height: 16 },
      channelIds: ["channel-1"],
    }],
    canvases: [],
    envelopes: [envelope("a", 16), envelope("b", 184)],
    timelineEnvelopes: [],
    readingOrder: ["a", "b"],
  };
}

describe("board scene validation", () => {
  it("accepts a finite, collision-free board", () => {
    expect(validateBoardScene(scene())).toMatchObject({ valid: true, diagnostics: [] });
  });

  it("rejects component and connector-label collisions", () => {
    const invalid = scene();
    invalid.envelopes[1]!.x = 100;
    invalid.elements[1]!.bounds.x = 100;
    invalid.elements[1]!.visualBounds.x = 100;
    invalid.connectors[0]!.label!.x = 105;
    const codes = validateBoardScene(invalid).diagnostics.map(({ code }) => code);
    expect(codes).toContain("layout.component_collision");
    expect(codes).toContain("layout.connector_label_collision");
  });

  it("rejects non-finite and out-of-bounds geometry", () => {
    const invalid = scene();
    invalid.elements[0]!.bounds.x = Number.NaN;
    invalid.elements[1]!.visualBounds.x = 300;
    const codes = validateBoardScene(invalid).diagnostics.map(({ code }) => code);
    expect(codes).toContain("layout.non_finite_geometry");
    expect(codes).toContain("layout.out_of_bounds");
  });

  it("rejects connector points that leave the board", () => {
    const invalid = scene();
    invalid.connectors[0]!.points[1]!.x = 400;
    expect(validateBoardScene(invalid).diagnostics.map(({ code }) => code)).toContain("layout.out_of_bounds");
  });

  it("rejects diagonal connector segments", () => {
    const invalid = scene();
    invalid.connectors[0]!.points = [{ x: 136, y: 76 }, { x: 184, y: 80 }];
    expect(validateBoardScene(invalid).diagnostics.map(({ code }) => code)).toContain("layout.non_orthogonal_route");
  });

  it("rejects connector crossings and overlapping segments", () => {
    const crossing = scene();
    crossing.connectors.push({
      id: "c-d",
      from: "c",
      to: "d",
      fromPin: "c.bottom",
      toPin: "d.top",
      points: [{ x: 160, y: 20 }, { x: 160, y: 150 }],
      channelIds: [],
    });
    expect(validateBoardScene(crossing).diagnostics.map(({ code }) => code)).toContain("layout.connector_crossing");

    const overlapping = scene();
    overlapping.connectors.push({
      id: "c-d",
      from: "c",
      to: "d",
      fromPin: "c.right",
      toPin: "d.left",
      points: [{ x: 146, y: 76 }, { x: 176, y: 76 }],
      channelIds: [],
    });
    const report = validateBoardScene(overlapping);
    expect(report.diagnostics.map(({ code }) => code)).toContain("layout.connector_overlap");
    expect(report.metrics.overlappingSegmentCount).toBeGreaterThan(0);
  });
});

function element(id: string, x: number) {
  return {
    id,
    kind: "box",
    bounds: { x, y: 40, width: 120, height: 72 },
    visualBounds: { x, y: 40, width: 120, height: 72 },
    label: id.toUpperCase(),
    labelBounds: { x: x + 12, y: 64, width: 40, height: 16 },
    layer: 0,
    pins: [
      { id: "left", owner: id, side: "left" as const, point: { x, y: 76 }, direction: { x: -1, y: 0 } },
      { id: "right", owner: id, side: "right" as const, point: { x: x + 120, y: 76 }, direction: { x: 1, y: 0 } },
    ],
  };
}

function envelope(owner: string, x: number) {
  return { id: `${owner}:envelope`, owner, kind: "component" as const, x, y: 40, width: 120, height: 72 };
}
