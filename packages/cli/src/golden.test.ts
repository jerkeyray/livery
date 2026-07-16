import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { runCli, type CliIo } from "./index.js";

const fixture = new URL("../fixtures/checkout.livery", import.meta.url);
const expectedSvg = new URL("../fixtures/checkout.svg", import.meta.url);
const expectedJson = new URL("../fixtures/checkout.json", import.meta.url);

describe("CLI golden exports", () => {
  it("matches the SVG fixture", async () => {
    const { io, output } = fixtureIo();
    const status = await runCli([fixture.pathname, "--format", "svg", "--layout", "fast", "--width", "640"], io);

    expect(status).toBe(0);
    expect(output()).toBe((await readFile(expectedSvg, "utf8")).trimEnd());
  });

  it("matches the JSON fixture", async () => {
    const { io, output } = fixtureIo();
    const status = await runCli([fixture.pathname, "--format", "json", "--layout", "fast", "--width", "640", "--pretty"], io);

    expect(status).toBe(0);
    expect(output()).toBe(await readFile(expectedJson, "utf8"));
  });

  it("produces structurally valid PNG bytes", async () => {
    const { io, output } = fixtureIo();
    const status = await runCli([fixture.pathname, "--format", "png", "--layout", "fast", "--width", "640", "--scale", "2"], io);
    const png = output() as Uint8Array;

    expect(status).toBe(0);
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(readPngSize(png).width).toBe(1280);
  });
});

function fixtureIo() {
  let value: string | Uint8Array = "";
  const io = {
    read: vi.fn(async (path: string) => await readFile(path, "utf8")),
    stderr: vi.fn(),
    stdout: vi.fn((next: string | Uint8Array) => { value = next; }),
    write: vi.fn(async (_path: string, next: string | Uint8Array) => { value = next; }),
  } satisfies CliIo;
  return { io, output: () => value };
}

function readPngSize(png: Uint8Array) {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}
