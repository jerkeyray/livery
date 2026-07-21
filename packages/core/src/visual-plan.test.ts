import { describe, expect, it } from "vitest";
import { compileProgram, compileVisualPlan, renderVisualPlan, visualPlanSchema, type VisualPlan } from "./index.js";

const tokenBucketPlan = {
  type: "livery.plan",
  version: "0.1",
  id: "token_bucket",
  title: "Token bucket limiter",
  family: "explainer",
  direction: "right",
  nodes: [
    { id: "requests", label: "Incoming requests", kind: "client" },
    { id: "bucket", label: "Token bucket", kind: "process", emphasis: true },
    { id: "accepted", label: "Accepted", kind: "outcome", status: "success" },
    { id: "service", label: "API service", kind: "service" },
    { id: "rejected", label: "Rejected", kind: "outcome", status: "danger" },
  ],
  edges: [
    { id: "arrive", from: "requests", to: "bucket", label: "request", kind: "flow" },
    { id: "allow", from: "bucket", to: "accepted", label: "consume 1 token", kind: "flow" },
    { id: "continue", from: "accepted", to: "service", kind: "flow" },
    { id: "deny", from: "bucket", to: "rejected", label: "empty", kind: "branch" },
  ],
  annotations: [
    { id: "capacity", target: "bucket", text: "Capacity: 10 tokens", kind: "constraint" },
    { id: "refill", target: "bucket", text: "Refill: 2 tokens per second", kind: "behavior" },
    { id: "burst", target: "bucket", text: "Allows bursts of up to 10 requests", kind: "behavior" },
    { id: "status", target: "rejected", text: "HTTP 429", kind: "fact" },
  ],
  groups: [],
} as const satisfies VisualPlan;

describe("semantic visual plans", () => {
  it("materializes a token-bucket explainer into deterministic editable source", () => {
    const first = compileVisualPlan(tokenBucketPlan);
    const second = compileVisualPlan(tokenBucketPlan);
    expect(first.diagnostics).toEqual([]);
    expect(first.source).toBe(second.source);
    expect(first.source).toContain('rejected = lib.card(label: "Rejected", width: 124, annotations: ["HTTP 429"], tone: "danger")');
    expect(first.source).toContain('annotations: ["Capacity: 10 tokens", "Refill: 2 tokens per second", "Allows bursts of up to 10 requests"]');
    expect(first.source).not.toContain("__livery_annotation_bucket");
    expect(first.source).toContain("flow(requests, bucket, accepted, service, rejected");
    expect(first.document?.root.children?.filter(({ id }) => ["HTTP 429", "capacity", "refill", "burst"].includes(id))).toEqual([]);
    expect(compileProgram(first.source!).diagnostics).toEqual([]);
  });

  it.each([320, 720, 900])("renders the token-bucket plan at %ipx", (width) => {
    const result = renderVisualPlan(tokenBucketPlan, { width });
    expect(result.diagnostics).toEqual([]);
    expect(result.report?.valid).toBe(true);
    expect(result.quality?.acceptable).toBe(true);
    expect(result.svg).toContain("HTTP 429");
    expect(result.svg).toContain("Allows bursts of up to 10 requests");
    if (width === 320) {
      expect(result.source).toContain("column(requests, bucket, accepted, service, rejected");
      expect(result.plan?.direction).toBe("right");
    }
    if (width === 900) {
      const x = (id: string) => result.scene?.elements.find((element) => element.id === id)?.bounds.x;
      const positions = [x("requests"), x("bucket"), x("accepted"), x("service")];
      expect(positions.every((position) => typeof position === "number")).toBe(true);
      expect(positions[0]!).toBeLessThan(positions[1]!);
      expect(positions[1]!).toBeLessThan(positions[2]!);
      expect(positions[2]!).toBeLessThan(positions[3]!);
    }
  });

  it("validates references, identity, and flat group ownership", () => {
    const broken = structuredClone(tokenBucketPlan) as VisualPlan;
    broken.edges[0]!.to = "missing";
    broken.annotations[0]!.target = "missing";
    broken.groups = [
      { id: "first", label: "First", members: ["bucket"] },
      { id: "second", label: "Second", members: ["bucket", "missing"] },
    ];
    broken.nodes[1]!.id = "requests";
    const result = compileVisualPlan(broken);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "plan.duplicate_id",
      "plan.unknown_endpoint",
      "plan.unknown_annotation_target",
      "plan.conflicting_group_membership",
      "plan.unknown_group_member",
    ]));
    expect(visualPlanSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects unsupported plan properties instead of silently discarding them", () => {
    const styled = structuredClone(tokenBucketPlan) as VisualPlan & { background?: string };
    styled.background = "blue";
    (styled.nodes[0] as VisualPlan["nodes"][number] & { width?: number }).width = 240;
    const result = compileVisualPlan(styled);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.some(({ message }) => message.includes("Unrecognized key"))).toBe(true);
  });

  it("wraps inline annotations and grows their card to contain every line", () => {
    const verbose = structuredClone(tokenBucketPlan) as VisualPlan;
    verbose.annotations = [
      { id: "first", target: "bucket", text: "First moderately long behavior stays entirely inside the component", kind: "behavior" },
      { id: "second", target: "bucket", text: "Second moderately long constraint also wraps within the component", kind: "constraint" },
    ];
    const rendered = renderVisualPlan(verbose, { width: 900 });
    const bucket = rendered.scene?.elements.find(({ id }) => id === "bucket");
    expect(rendered.report?.valid).toBe(true);
    expect(rendered.source).not.toContain("__livery_annotation_bucket");
    expect(bucket?.bounds.height).toBeGreaterThan(86);
    expect(rendered.svg).toContain("First moderately long behavior");
  });

  it("splits large annotation sets into compiler-valid detail lists", () => {
    const many = structuredClone(tokenBucketPlan) as VisualPlan;
    many.annotations = Array.from({ length: 32 }, (_, index) => ({
      id: `fact_${index}`,
      target: "bucket",
      text: `Detailed rate-limiter fact ${index + 1} that belongs to the token bucket`,
      kind: "fact" as const,
    }));
    const compiled = compileVisualPlan(many);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.source).toContain("__livery_annotation_bucket_2");
    expect(compiled.source).toContain("__livery_annotation_bucket_3");
    expect(compileProgram(compiled.source!).diagnostics).toEqual([]);
  });

  it("qualifies grouped endpoints and keeps every root component placed", () => {
    const grouped = structuredClone(tokenBucketPlan) as VisualPlan;
    grouped.groups = [{ id: "limiter", label: "Limiter", members: ["bucket", "accepted"] }];
    grouped.annotations.push({ id: "overflow", target: "bucket", text: "Unused tokens beyond the configured capacity are discarded instead of accumulating.", kind: "behavior" });
    const result = compileVisualPlan(grouped);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.connectors.find(({ id }) => id === "allow")).toMatchObject({ from: { node: "limiter.bucket" }, to: { node: "limiter.accepted" } });
    expect(result.document?.connectors.find(({ id }) => id === "__livery_annotation_edge_bucket")).toMatchObject({ from: { node: "limiter.bucket" }, to: { node: "limiter.__livery_annotation_bucket" } });
    expect(result.document?.root.children?.find(({ id }) => id === "limiter")?.children?.map(({ id }) => id)).toContain("limiter.__livery_annotation_bucket");
    expect(result.document?.root.children?.some(({ id }) => id === "__livery_annotation_bucket")).toBe(false);
    expect(compileProgram(result.source!).diagnostics).toEqual([]);
    const rendered = renderVisualPlan(grouped, { width: 900 });
    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.scene?.board.height).toBeLessThan(900);
  });

  it("orders the dominant flow spine before branches regardless of model node order", () => {
    const shuffled = structuredClone(tokenBucketPlan) as VisualPlan;
    shuffled.nodes.reverse();
    const result = compileVisualPlan(shuffled);
    expect(result.document?.root.children?.map(({ id }) => id)).toEqual(["requests", "bucket", "accepted", "service", "rejected"]);
  });

  it("preserves a downward flow inside a flat group", () => {
    const grouped: VisualPlan = {
      type: "livery.plan", version: "0.1", id: "down_group", family: "process", direction: "down",
      nodes: [{ id: "a", label: "Start", kind: "process" }, { id: "b", label: "Finish", kind: "outcome" }],
      edges: [{ id: "next", from: "a", to: "b", kind: "flow" }], annotations: [],
      groups: [{ id: "stage", label: "Stage", members: ["a", "b"] }],
    };
    const rendered = renderVisualPlan(grouped, { width: 900 });
    const a = rendered.scene?.elements.find(({ id }) => id === "stage.a")?.bounds;
    const b = rendered.scene?.elements.find(({ id }) => id === "stage.b")?.bounds;
    expect(rendered.quality?.acceptable).toBe(true);
    expect(a && b && a.y < b.y).toBe(true);
  });

  it("never accepts a desktop layout that violates an explicit rightward spine", () => {
    const plan: VisualPlan = {
      type: "livery.plan", version: "0.1", id: "long_spine", family: "process", direction: "right",
      nodes: Array.from({ length: 6 }, (_, index) => ({ id: `n${index}`, label: `Stage ${index + 1}`, kind: "process" as const })),
      edges: Array.from({ length: 5 }, (_, index) => ({ id: `e${index}`, from: `n${index}`, to: `n${index + 1}`, kind: "flow" as const })),
      annotations: [], groups: [],
    };
    const rendered = renderVisualPlan(plan, { width: 900 });
    if (!rendered.quality?.acceptable) {
      expect(rendered.quality?.diagnostics.map(({ code }) => code)).toContain("plan.quality.direction_mismatch");
      return;
    }
    const elements = new Map(rendered.scene?.elements.map((element) => [element.id, element.bounds]));
    const aligned = plan.edges.filter((edge) => elements.get(edge.from)!.x < elements.get(edge.to)!.x).length / plan.edges.length;
    expect(aligned).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps an overbuilt grouped explainer within the visual-quality gate", () => {
    const overbuilt: VisualPlan = {
      type: "livery.plan", version: "0.1", id: "overbuilt_bucket", family: "explainer", direction: "auto",
      nodes: [
        { id: "requests", label: "Incoming API requests", kind: "client" },
        { id: "bucket", label: "Token bucket", kind: "datastore" },
        { id: "check", label: "Rate limit check", kind: "decision" },
        { id: "service", label: "API service", kind: "service", status: "success" },
        { id: "rejected", label: "Rejected", subtitle: "Request denied", kind: "outcome", status: "danger" },
      ],
      edges: [
        { id: "enter", from: "requests", to: "bucket", kind: "flow" },
        { id: "consume", from: "bucket", to: "check", kind: "flow" },
        { id: "accept", from: "check", to: "service", kind: "flow" },
        { id: "empty", from: "check", to: "rejected", kind: "branch" },
      ],
      annotations: [
        { id: "capacity", target: "bucket", text: "Capacity: 10 tokens", kind: "constraint" },
        { id: "refill", target: "bucket", text: "Refill: 2 tokens per second", kind: "behavior" },
        { id: "burst", target: "bucket", text: "Burst capacity: 10 requests", kind: "behavior" },
        { id: "cost", target: "bucket", text: "Each accepted request consumes 1 token", kind: "behavior" },
        { id: "status", target: "rejected", text: "HTTP 429", kind: "fact" },
      ],
      groups: [{ id: "limiter", label: "Rate limiter", members: ["bucket", "check", "rejected"] }],
    };
    const rendered = renderVisualPlan(overbuilt, { width: 900 });
    expect(rendered.diagnostics).toEqual([]);
    expect(rendered.quality?.acceptable).toBe(true);
    expect(rendered.scene?.board.height).toBeLessThanOrEqual(900);
    expect(rendered.source).not.toContain("__livery_annotation_");
    expect(rendered.source).toContain('annotations: ["HTTP 429"]');
  });
});
