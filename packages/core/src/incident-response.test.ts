import { describe, expect, it } from "vitest";
import { compileVisual } from "./program.js";
import { solvePinboard } from "./pinboard.js";

describe("dense incident response layout", () => {
  it("keeps a four-frame 2x2 architecture on one bounded central trunk", () => {
    const compiled = compileVisual(`figure autonomous_incident_response("Autonomous incident response") {
 detection = frame("Detection", layout: grid, columns: 2, gap: xs, padding: sm) {
  edge = event("Edge Traffic", variant: muted, width: 140)
  metrics = lineChart("Metrics", variant: muted, width: 140)
  logs = list("Logs", items: ["Errors", "Latency", "Saturation"], variant: muted, width: 140)
  alert = worker("Alert Engine", variant: soft, tone: warning, width: 140)
 }
 coordination = frame("Coordination", layout: grid, columns: 2, gap: xs, padding: sm) {
  agent = agent("Incident Agent", subtitle: "Coordinates response", variant: soft, tone: info, width: 140)
  planner = tool("Runbook Planner", subtitle: "Builds recovery plan", variant: soft, tone: info, width: 140)
  gate = choice("Approval Gate", variant: soft, tone: warning, width: 140)
 }
 recovery = frame("Recovery", layout: grid, columns: 2, gap: xs, padding: sm) {
  shifter = api("Traffic Shifter", subtitle: "Moves live traffic", variant: muted, width: 140)
  cluster = server("Service Cluster", subtitle: "Healthy production", variant: soft, tone: success, width: 140)
  rollback = service("Rollback Controller", variant: soft, tone: danger, width: 140)
 }
 evidence = frame("Evidence", layout: grid, columns: 2, gap: xs, padding: sm) {
  timeline = event("Timeline", variant: muted, width: 140)
  report = document("Root Cause Report", subtitle: "Findings and follow-up", variant: soft, tone: success, width: 140)
  audit = database("Audit Log", variant: muted, width: 140)
 }
 edge_metrics = connect(detection.edge.right, detection.metrics.left, role: primary, bundleId: spine)
 metrics_alert = connect(detection.metrics.right, detection.alert.left, role: primary, bundleId: spine)
 alert_agent = connect(detection.alert.right, coordination.agent.left, role: primary, bundleId: spine)
 agent_planner = connect(coordination.agent.right, coordination.planner.left, role: primary, bundleId: spine)
 planner_gate = connect(coordination.planner.right, coordination.gate.left, role: primary, bundleId: spine)
 gate_shifter = connect(coordination.gate.bottom, recovery.shifter.top, role: primary, bundleId: spine)
 shifter_cluster = connect(recovery.shifter.right, recovery.cluster.left, role: primary, bundleId: spine)
 cluster_timeline = connect(recovery.cluster.right, evidence.timeline.left, role: primary, bundleId: spine)
 timeline_report = connect(evidence.timeline.right, evidence.report.left, role: primary, bundleId: spine)
 events = connect(detection.edge.bottom, detection.logs.top, label: "events", role: supporting, bundleId: detect)
 signals = connect(detection.logs.right, detection.alert.left, label: "signals", role: supporting, bundleId: detect)
 actions = connect(coordination.agent.bottom, evidence.timeline.top, label: "actions", role: supporting, bundleId: spine)
 plan = connect(coordination.planner.bottom, evidence.audit.top, label: "plan", role: supporting, bundleId: spine)
 approval = connect(coordination.gate.bottom, evidence.audit.top, label: "approval", role: supporting, bundleId: spine)
 health = connect(recovery.cluster.top, detection.metrics.bottom, label: "health", role: supporting, bundleId: spine)
 restore = connect(recovery.rollback.left, recovery.cluster.right, label: "restore", role: supporting, bundleId: recovery_trunk)
 reject = connect(coordination.gate.bottom, recovery.rollback.top, label: "reject", role: supporting, bundleId: spine)
 lessons = connect(evidence.report.top, coordination.agent.bottom, label: "lessons", variant: advisory, role: supporting, bundleId: spine)
 grid(detection, coordination, recovery, evidence, columns: 2, gap: sm)
}`);

    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 900 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors).toHaveLength(18);
    expect(result.scene.connectors.filter(({ role }) => role === "primary")).toHaveLength(9);
    expect(result.scene.elements.filter(({ parent }) => parent === "root").map(({ id }) => id)).toEqual([
      "detection", "coordination", "recovery", "evidence",
    ]);
    expect(result.report.metrics.crossingCount).toBe(0);
    expect(result.report.metrics.overlappingSegmentCount).toBe(0);
  });
});
