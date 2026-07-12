import { describe, expect, it } from "vitest";

import { exportHeadless, headlessResultToJson, sceneToSvg } from "./export.js";
import { renderHeadless } from "./headless.js";

const source = `flow export_test("Export & verify") {
  sender = actor("Sender <admin>")
  receiver = service("Receiver")
  send = sender -> receiver("send & confirm", tone: success)
}`;

describe("headless exports", () => {
  it("creates standalone deterministic SVG", async () => {
    const first = await exportHeadless(source, { format: "svg", width: 640 });
    const second = await exportHeadless(source, { format: "svg", width: 640 });

    expect(first.output).toBe(second.output);
    expect(first.output).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(first.output).toContain('fill="#fff"');
    expect(first.output).toContain("Export &amp; verify");
    expect(first.output).toContain("Sender &lt;admin&gt;");
    expect(first.output).toContain('data-livery-id="send"');
    expect(first.mediaType).toBe("image/svg+xml");
  });

  it("creates deterministic JSON without runtime timing", async () => {
    const result = await renderHeadless(source, { width: 640 });
    const json = headlessResultToJson(result, true);

    expect(json).not.toContain("durationMs");
    expect(JSON.parse(json)).toMatchObject({
      artifact: { id: "export_test" },
      scene: { id: "export_test", width: 640 },
    });
  });

  it("returns diagnostics but no SVG for invalid source", async () => {
    const result = await exportHeadless("not a flow", { format: "svg" });

    expect(result.output).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("serializes an existing scene without compilation", async () => {
    const result = await renderHeadless(source);

    expect(sceneToSvg(result.scene!)).toContain("<svg");
  });
});
