import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const compositionSchema = z.enum(["flow", "sequence", "explainer"]);
const actionSchema = z.enum([
  "reveal",
  "hide",
  "focus",
  "indicate",
  "trace",
  "transform",
  "compare",
  "set_state",
  "enter",
  "exit",
]);

const benchmarkSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().min(1),
  composition: compositionSchema,
  intent: z.string().min(1),
  requiredEntities: z.array(z.string()).min(2),
  requiredRelationships: z.array(z.tuple([z.string(), z.string()])).min(1),
  relationshipCases: z
    .array(
      z.object({
        id: z.string(),
        from: z.string(),
        to: z.string(),
        meaning: z.string(),
        order: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  requiredActions: z.array(actionSchema),
  viewports: z.array(z.number().int().positive()).min(1),
  assertions: z.array(z.string().min(1)).min(1),
});

const invalidFixtureSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(["syntax", "semantic", "security", "resource"]),
  source: z.string().min(1),
  expectedCode: z.string().regex(/^[a-z]+\.[a-z0-9_]+$/),
  recoverable: z.boolean(),
});

async function readJsonDirectory(directory: string) {
  const entries = await readdir(directory);

  return Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map(async (entry) => {
        const contents = await readFile(path.join(directory, entry), "utf8");
        return { entry, value: JSON.parse(contents) as unknown };
      }),
  );
}

describe("benchmark corpus", () => {
  it("contains ten valid, uniquely identified visual specifications", async () => {
    const fixtures = await readJsonDirectory(path.resolve("fixtures/benchmarks"));
    const parsed = fixtures.map(({ value }) => benchmarkSchema.parse(value));
    const ids = parsed.map(({ id }) => id);

    expect(parsed).toHaveLength(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only references declared entities", async () => {
    const fixtures = await readJsonDirectory(path.resolve("fixtures/benchmarks"));

    for (const { entry, value } of fixtures) {
      const fixture = benchmarkSchema.parse(value);
      const entities = new Set(fixture.requiredEntities);

      for (const [from, to] of fixture.requiredRelationships) {
        expect(entities.has(from), `${entry}: missing relationship source ${from}`).toBe(true);
        expect(entities.has(to), `${entry}: missing relationship target ${to}`).toBe(true);
      }
    }
  });

  it("covers every v1 composition and foundation motion action", async () => {
    const fixtures = await readJsonDirectory(path.resolve("fixtures/benchmarks"));
    const parsed = fixtures.map(({ value }) => benchmarkSchema.parse(value));
    const compositions = new Set(parsed.map(({ composition }) => composition));
    const actions = new Set(parsed.flatMap(({ requiredActions }) => requiredActions));

    expect(compositions).toEqual(new Set(["flow", "sequence", "explainer"]));
    for (const action of ["reveal", "trace", "focus", "transform"] as const) {
      expect(actions.has(action), `missing foundation action ${action}`).toBe(true);
    }
  });
});

describe("invalid corpus", () => {
  it("declares stable expected diagnostic codes", async () => {
    const fixtures = await readJsonDirectory(path.resolve("fixtures/invalid"));
    const parsed = fixtures.map(({ value }) => invalidFixtureSchema.parse(value));

    expect(parsed.length).toBeGreaterThanOrEqual(6);
    expect(new Set(parsed.map(({ expectedCode }) => expectedCode)).size).toBe(parsed.length);
  });
});
