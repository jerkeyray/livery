import { describe, expect, it, vi } from "vitest";

import { parseCliArgs, runCli, type CliIo } from "./index.js";

describe("Livery CLI", () => {
  it("parses render options and infers output format", () => {
    expect(parseCliArgs(["input.livery", "-o", "visual.png", "--width", "720", "--scale", "2"]))
      .toMatchObject({ format: "png", input: "input.livery", output: "visual.png", scale: 2, width: 720 });
  });

  it("renders SVG to stdout", async () => {
    const io = fakeIo(`flow cli("CLI") { a -> b("call") }`);
    const status = await runCli(["-", "--format", "svg", "--layout", "fast"], io);

    expect(status).toBe(0);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining("<svg"));
  });

  it("writes compiler diagnostics and exits with failure", async () => {
    const io = fakeIo("not a flow");
    const status = await runCli(["-", "--format", "svg"], io);

    expect(status).toBe(1);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining("1:1 error"));
    expect(io.stdout).not.toHaveBeenCalled();
  });

  it("emits diagnostic JSON with a failing exit code", async () => {
    const io = fakeIo("not a flow");
    const status = await runCli(["-", "--format", "json"], io);

    expect(status).toBe(1);
    expect(io.stdout).toHaveBeenCalledWith(expect.stringContaining('"diagnostics"'));
  });

  it("rejects invalid command options", async () => {
    const io = fakeIo("");
    const status = await runCli(["input.livery", "--width", "wide"], io);

    expect(status).toBe(2);
    expect(io.stderr).toHaveBeenCalledWith(expect.stringContaining("requires a positive number"));
  });
});

function fakeIo(source: string) {
  return {
    read: vi.fn(async () => source),
    stderr: vi.fn(),
    stdout: vi.fn(),
    write: vi.fn(async () => {}),
  } satisfies CliIo;
}
