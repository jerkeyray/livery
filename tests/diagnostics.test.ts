import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { compile } from "@jerkeyray/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const fixtureSchema = z.object({
  id: z.string(),
  source: z.string(),
  expectedCode: z.string(),
  recoverable: z.boolean(),
});

describe("diagnostic fixtures", () => {
  it("emits every fixture's expected stable diagnostic", async () => {
    const directory = path.resolve("fixtures/invalid");
    const entries = (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort();

    for (const entry of entries) {
      const source = await readFile(path.join(directory, entry), "utf8");
      const fixture = fixtureSchema.parse(JSON.parse(source));
      const result = compile(fixture.source);
      const codes = result.diagnostics.map(({ code }) => code);

      expect(codes, `${entry} did not emit ${fixture.expectedCode}`).toContain(fixture.expectedCode);
      expect(result.incomplete, `${entry} recoverability mismatch`).toBe(fixture.recoverable);
    }
  });
});
