import { describe, expect, it } from "vitest";

import { compile } from "./compiler.js";
import { computeFlowScene } from "./layout.js";
import type { MeasurementService } from "./measurement.js";
import type { SceneNode } from "./scene.js";

const source = `flow checkout("Checkout request") {
  customer = actor("Customer")
  api = service("Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  submission = customer -> api("submit order")
  authorization = api -> payment("authorize")
  approval = payment -> api("approved", tone: success)
  persistence = api -> orders("persist")
}`;

const artifact = compile(source).artifact!;

function overlaps(first: SceneNode, second: SceneNode) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

describe("computeFlowScene", () => {
  it("creates a deterministic horizontal scene when the graph fits", () => {
    const first = computeFlowScene(artifact, { width: 960 });
    const second = computeFlowScene(artifact, { width: 960 });

    expect(first).toEqual(second);
    expect(first.direction).toBe("horizontal");
    expect(first.edges).toHaveLength(4);
    expect(first.edges.every(({ path }) => path.startsWith("M "))).toBe(true);
  });

  it("uses vertical reading order at chat width", () => {
    const scene = computeFlowScene(artifact, { width: 360 });

    expect(scene.direction).toBe("vertical");
    expect(scene.nodes.map(({ y }) => y)).toEqual([...scene.nodes.map(({ y }) => y)].sort((a, b) => a - b));
    expect(scene.nodes.every(({ x, width }) => x >= 0 && x + width <= scene.width)).toBe(true);
  });

  it("falls back to vertical layout when a layered graph cannot fit", () => {
    expect(computeFlowScene(artifact, { width: 700 }).direction).toBe("vertical");
  });

  it("does not overlap entity cards", () => {
    for (const width of [360, 960]) {
      const nodes = computeFlowScene(artifact, { width }).nodes;
      for (let first = 0; first < nodes.length; first += 1) {
        for (let second = first + 1; second < nodes.length; second += 1) {
          expect(overlaps(nodes[first]!, nodes[second]!)).toBe(false);
        }
      }
    }
  });

  it("routes opposite relationships on distinct lanes", () => {
    const scene = computeFlowScene(artifact, { width: 960 });
    const authorization = scene.edges.find(({ id }) => id === "authorization");
    const approval = scene.edges.find(({ id }) => id === "approval");

    expect(authorization?.path).not.toBe(approval?.path);
    expect(authorization?.labelY).not.toBe(approval?.labelY);
  });

  it("routes mobile edges that skip nodes through an outside lane", () => {
    const scene = computeFlowScene(artifact, { width: 360 });
    const persistence = scene.edges.find(({ id }) => id === "persistence");
    const leftmostNode = Math.min(...scene.nodes.map(({ x }) => x));

    expect(persistence?.labelX).toBeLessThan(leftmostNode);
    expect(persistence?.path).toContain(`C ${Math.max(14, leftmostNode - 44)}`);
  });

  it("allocates two lines and extra height for long entity labels", () => {
    const longArtifact = compile(`flow measured {
      client = actor("A considerably longer client label that needs wrapping")
      client -> api("request")
    }`).artifact!;
    const scene = computeFlowScene(longArtifact, { width: 960 });
    const client = scene.nodes.find(({ id }) => id === "client");

    expect(client?.width).toBe(220);
    expect(client?.height).toBe(89);
  });

  it("keeps mixed measured heights from overlapping within a layer", () => {
    const mixedArtifact = compile(`flow mixed {
      first = actor("A considerably longer first actor label that wraps")
      second = actor("Second")
      first -> target("one")
      second -> target("two")
    }`).artifact!;
    const nodes = computeFlowScene(mixedArtifact, { width: 960 }).nodes;

    for (let first = 0; first < nodes.length; first += 1) {
      for (let second = first + 1; second < nodes.length; second += 1) {
        expect(overlaps(nodes[first]!, nodes[second]!)).toBe(false);
      }
    }
  });

  it("accepts an injected measurement service", () => {
    const measurement: MeasurementService = {
      measureEntity: () => ({ width: 160, height: 80, lineCount: 1 }),
    };
    const scene = computeFlowScene(artifact, { width: 960, measurement });

    expect(scene.nodes.every(({ width, height }) => width === 160 && height === 80)).toBe(true);
  });
});
