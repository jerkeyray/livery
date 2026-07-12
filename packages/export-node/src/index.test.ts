import { describe, expect, it } from "vitest";

import { exportHeadlessPng, svgToPng } from "./index.js";

const source = `flow png("PNG export") { sender -> receiver("send") }`;

describe("PNG exports", () => {
  it("rasterizes standalone SVG to PNG bytes", () => {
    const png = svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="20" height="10" fill="#fff"/></svg>', { scale: 2 });

    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(readPngSize(png)).toEqual({ height: 20, width: 40 });
  });

  it("compiles and exports PNG in one call", async () => {
    const result = await exportHeadlessPng(source, { outputWidth: 320, width: 640 });

    expect(result.mediaType).toBe("image/png");
    expect(result.scene?.id).toBe("png");
    expect(result.scene?.width).toBe(640);
    expect(readPngSize(result.output!)).toMatchObject({ width: 320 });
  });

  it("returns diagnostics without rasterizing invalid source", async () => {
    const result = await exportHeadlessPng("not a flow");

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

function readPngSize(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}
