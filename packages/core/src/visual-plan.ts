import { z } from "zod";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { formatVisualDocument } from "./program.js";
import { instantiateStandardComponent, type StandardComponentName } from "./stdlib.js";
import type { Connector, VisualDocument, VisualNode } from "./visual.js";

const identifier = z.string().min(1).max(64).regex(/^[A-Za-z_][A-Za-z0-9_-]*$/, "Use a stable identifier containing letters, digits, underscores, or hyphens.")
  .refine((value) => !value.startsWith("__livery_"), "Identifiers beginning with __livery_ are reserved.");

const visualPlanNodeSchema = z.object({
  id: identifier,
  label: z.string().min(1).max(80),
  kind: z.enum(["actor", "client", "service", "api", "process", "decision", "datastore", "queue", "worker", "event", "outcome"]).describe("The semantic role of this real requested entity. Do not invent a node for a relationship label, check, fact, rate, capacity, or response code; those belong on an edge or annotation."),
  subtitle: z.string().min(1).max(120).optional().describe("Optional concise context only when the user requests it. Do not invent generic explanatory prose; requested facts belong in annotations."),
  status: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
  emphasis: z.boolean().optional(),
}).strict();

const visualPlanEdgeSchema = z.object({
  id: identifier,
  from: identifier,
  to: identifier,
  label: z.string().min(1).max(60).optional().describe("A concise relationship label, preferably three words or fewer. Never use an edge label to replace an explicitly requested outcome node."),
  kind: z.enum(["flow", "branch", "dependency", "advisory"]).describe("Flow is the primary path, branch is an alternate outcome, dependency is supporting, and advisory is non-directional context."),
}).strict();

const visualPlanAnnotationSchema = z.object({
  id: identifier,
  target: identifier,
  text: z.string().min(1).max(180),
  kind: z.enum(["fact", "constraint", "behavior"]).describe("The semantic type of explanatory text attached to a node."),
}).strict();

const visualPlanGroupSchema = z.object({
  id: identifier,
  label: z.string().min(1).max(80),
  members: z.array(identifier).min(1).max(12),
}).strict();

export const visualPlanSchema = z.object({
  type: z.literal("livery.plan"),
  version: z.literal("0.1"),
  id: identifier,
  title: z.string().min(1).max(100).optional(),
  family: z.enum(["architecture", "process", "explainer"]).describe("The semantic visual family, independent of its eventual Livery component styling."),
  direction: z.enum(["auto", "right", "down"]).default("auto").describe("Use right or down when explicitly requested and preserve that reading direction; otherwise auto is responsive."),
  nodes: z.array(visualPlanNodeSchema).min(1).max(32).describe("Real entities and outcomes that require visible components."),
  edges: z.array(visualPlanEdgeSchema).max(48).default([]).describe("Directed relationships between declared node IDs."),
  annotations: z.array(visualPlanAnnotationSchema).max(32).default([]).describe("Facts, constraints, rates, response codes, and behaviors attached to declared node IDs."),
  groups: z.array(visualPlanGroupSchema).max(8).default([]).describe("Optional flat visual regions. Create a group only when the user explicitly requests a named boundary, region, or subsystem; never infer one merely to collect related steps. Each node may belong to at most one group."),
}).strict().superRefine((plan, context) => {
  const ids = new Map<string, string>();
  const register = (id: string, kind: string, path: Array<string | number>) => {
    const previous = ids.get(id);
    if (previous) context.addIssue({ code: "custom", message: `[plan.duplicate_id] ${id} is used by both ${previous} and ${kind}.`, path });
    else ids.set(id, kind);
  };
  plan.nodes.forEach((node, index) => register(node.id, "a node", ["nodes", index, "id"]));
  plan.edges.forEach((edge, index) => register(edge.id, "an edge", ["edges", index, "id"]));
  plan.annotations.forEach((annotation, index) => register(annotation.id, "an annotation", ["annotations", index, "id"]));
  plan.groups.forEach((group, index) => register(group.id, "a group", ["groups", index, "id"]));

  const nodeIds = new Set(plan.nodes.map(({ id }) => id));
  const memberships = new Map<string, string>();
  plan.edges.forEach((edge, index) => {
    if (!nodeIds.has(edge.from)) context.addIssue({ code: "custom", message: `[plan.unknown_endpoint] Edge ${edge.id} references missing node ${edge.from}.`, path: ["edges", index, "from"] });
    if (!nodeIds.has(edge.to)) context.addIssue({ code: "custom", message: `[plan.unknown_endpoint] Edge ${edge.id} references missing node ${edge.to}.`, path: ["edges", index, "to"] });
  });
  plan.annotations.forEach((annotation, index) => {
    if (!nodeIds.has(annotation.target)) context.addIssue({ code: "custom", message: `[plan.unknown_annotation_target] Annotation ${annotation.id} references missing node ${annotation.target}.`, path: ["annotations", index, "target"] });
  });
  plan.groups.forEach((group, groupIndex) => {
    const seen = new Set<string>();
    group.members.forEach((member, memberIndex) => {
      if (seen.has(member)) context.addIssue({ code: "custom", message: `[plan.duplicate_group_member] Group ${group.id} lists ${member} more than once.`, path: ["groups", groupIndex, "members", memberIndex] });
      seen.add(member);
      if (!nodeIds.has(member)) context.addIssue({ code: "custom", message: `[plan.unknown_group_member] Group ${group.id} references missing node ${member}.`, path: ["groups", groupIndex, "members", memberIndex] });
      const previous = memberships.get(member);
      if (previous && previous !== group.id) context.addIssue({ code: "custom", message: `[plan.conflicting_group_membership] Node ${member} belongs to both ${previous} and ${group.id}.`, path: ["groups", groupIndex, "members", memberIndex] });
      else memberships.set(member, group.id);
    });
  });
});

export type VisualPlan = z.infer<typeof visualPlanSchema>;
export type VisualPlanNode = z.infer<typeof visualPlanNodeSchema>;
export type VisualPlanEdge = z.infer<typeof visualPlanEdgeSchema>;
export type VisualPlanAnnotation = z.infer<typeof visualPlanAnnotationSchema>;
export type VisualPlanGroup = z.infer<typeof visualPlanGroupSchema>;

export type VisualPlanCompileResult = {
  plan?: VisualPlan;
  document?: VisualDocument;
  source?: string;
  diagnostics: Diagnostic[];
};

export type VisualPlanCompileOptions = { compact?: boolean };

export function compileVisualPlan(input: unknown, options: VisualPlanCompileOptions = {}): VisualPlanCompileResult {
  const parsed = visualPlanSchema.safeParse(input);
  if (!parsed.success) return { diagnostics: parsed.error.issues.map(planIssueDiagnostic) };
  const plan = parsed.data;
  const annotations = new Map<string, VisualPlanAnnotation[]>();
  for (const annotation of plan.annotations) annotations.set(annotation.target, [...(annotations.get(annotation.target) ?? []), annotation]);

  const groupForNode = new Map<string, VisualPlanGroup>();
  for (const group of plan.groups) for (const member of group.members) groupForNode.set(member, group);
  const qualifiedIds = new Map(plan.nodes.map(({ id }) => [id, groupForNode.has(id) ? `${groupForNode.get(id)!.id}.${id}` : id]));
  const nodes = new Map<string, VisualNode>();
  const detailNodesForTarget = new Map<string, VisualNode[]>();
  const detailConnectors: Connector[] = [];

  for (const node of plan.nodes) {
    const notes = annotations.get(node.id) ?? [];
    const inlineAnnotations = notes.length > 0 && notes.length <= 5
      && notes.every(({ text }) => text.length <= 72)
      && notes.reduce((length, { text }) => length + text.length, 0) <= 240
      ? notes.map(({ text }) => text)
      : undefined;
    const visualNode = instantiateStandardComponent(componentFor(node.kind), qualifiedIds.get(node.id)!, {
      label: node.label,
      ...(plan.direction === "right" ? { width: rightwardNodeWidth(node.kind) } : {}),
      ...(inlineAnnotations ? { annotations: inlineAnnotations } : {}),
      ...(node.subtitle ? { subtitle: node.subtitle } : {}),
      ...(node.status && node.status !== "neutral" ? { tone: node.status } : {}),
      ...(node.emphasis ? { variant: "emphasis" } : {}),
    });
    nodes.set(node.id, visualNode);
    if (!inlineAnnotations && notes.length > 0) {
      const chunks = chunk(notes, 12);
      detailNodesForTarget.set(node.id, chunks.map((annotationChunk, index) => {
        const suffix = index === 0 ? "" : `_${index + 1}`;
        const detailsId = `__livery_annotation_${node.id}${suffix}`;
        const qualifiedDetailsId = groupForNode.has(node.id) ? `${groupForNode.get(node.id)!.id}.${detailsId}` : detailsId;
        detailConnectors.push({
          id: `__livery_annotation_edge_${node.id}${suffix}`,
          from: { node: qualifiedIds.get(node.id)!, anchor: plan.direction === "down" ? "bottom" : "right" },
          to: { node: qualifiedDetailsId, anchor: plan.direction === "down" ? "top" : "left" },
          variant: "advisory",
          role: "supporting",
        });
        return instantiateStandardComponent("list", qualifiedDetailsId, {
          label: `${node.label} details${index === 0 ? "" : ` ${index + 1}`}`,
          items: annotationChunk.map(({ text }) => text),
          variant: "muted",
        });
      }));
    }
  }

  const emittedGroups = new Set<string>();
  const rootChildren: VisualNode[] = [];
  for (const planNode of primarySpineFirst(plan)) {
    const group = groupForNode.get(planNode.id);
    if (!group) {
      rootChildren.push(nodes.get(planNode.id)!);
      rootChildren.push(...(detailNodesForTarget.get(planNode.id) ?? []));
      continue;
    }
    if (emittedGroups.has(group.id)) continue;
    emittedGroups.add(group.id);
    const children = group.members.flatMap((member) => {
      return [nodes.get(member)!, ...(detailNodesForTarget.get(member) ?? [])];
    });
    rootChildren.push({
      id: group.id,
      kind: "frame",
      label: group.label,
      layout: { kind: "flow", direction: plan.direction, gap: "$space.sm", rankGap: "$space.md" },
      children,
    });
  }
  const anchors = plan.direction === "down"
    ? { from: "bottom" as const, to: "top" as const }
    : { from: "right" as const, to: "left" as const };
  const connectors: Connector[] = plan.edges.map((edge) => ({
    id: edge.id,
    from: { node: qualifiedIds.get(edge.from)!, anchor: anchors.from },
    to: { node: qualifiedIds.get(edge.to)!, anchor: anchors.to },
    ...(edge.label ? { label: edge.label } : {}),
    ...(edge.kind === "flow" ? { role: "primary" as const }
      : edge.kind === "branch" ? { role: "secondary" as const }
        : edge.kind === "dependency" ? { role: "supporting" as const }
          : { role: "supporting" as const, variant: "advisory" as const }),
  }));
  connectors.push(...detailConnectors);

  const document: VisualDocument = {
    type: "livery.visual",
    version: "0.2",
    id: plan.id,
    ...(plan.title ? { title: plan.title } : {}),
    root: {
      id: "root",
      kind: "group",
      layout: options.compact
        ? { kind: "column", gap: "$space.sm" }
        : { kind: "flow", direction: plan.direction, gap: "$space.sm", rankGap: "$space.md" },
      children: rootChildren,
    },
    connectors,
    constraints: [],
    timelines: [],
  };
  return { plan, document, source: formatVisualDocument(document), diagnostics: [] };
}

function chunk<T>(values: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

function rightwardNodeWidth(kind: VisualPlanNode["kind"]) {
  if (kind === "actor" || kind === "client") return 152;
  if (kind === "process" || kind === "decision" || kind === "datastore") return 160;
  if (kind === "service" || kind === "api" || kind === "queue" || kind === "worker") return 136;
  return 124;
}

function primarySpineFirst(plan: VisualPlan): VisualPlanNode[] {
  const nodeById = new Map(plan.nodes.map((node) => [node.id, node]));
  const originalIndex = new Map(plan.nodes.map(({ id }, index) => [id, index]));
  const flowEdges = plan.edges.filter(({ kind }) => kind === "flow").sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.id.localeCompare(b.id));
  const bestPath = new Map(plan.nodes.map(({ id }) => [id, [id]]));
  for (let pass = 0; pass < plan.nodes.length - 1; pass += 1) {
    let changed = false;
    for (const edge of flowEdges) {
      const fromPath = bestPath.get(edge.from)!;
      if (fromPath.includes(edge.to)) continue;
      const candidate = [...fromPath, edge.to];
      if (comparePaths(candidate, bestPath.get(edge.to)!) < 0) {
        bestPath.set(edge.to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const spine = [...bestPath.values()].sort(comparePaths)[0] ?? [];
  const spineIndex = new Map(spine.map((id, index) => [id, index]));
  const attachmentRank = (id: string) => {
    const attached = plan.edges.flatMap((edge) => edge.to === id && spineIndex.has(edge.from) ? [spineIndex.get(edge.from)!] : []);
    return attached.length ? Math.min(...attached) : Number.MAX_SAFE_INTEGER;
  };
  const remainder = plan.nodes.map(({ id }) => id).filter((id) => !spineIndex.has(id)).sort((a, b) =>
    attachmentRank(a) - attachmentRank(b) || originalIndex.get(a)! - originalIndex.get(b)! || a.localeCompare(b));
  return [...spine, ...remainder].map((id) => nodeById.get(id)!);
}

function comparePaths(first: string[], second: string[]) {
  return second.length - first.length || first.join("\0").localeCompare(second.join("\0"));
}

function componentFor(kind: VisualPlanNode["kind"]): StandardComponentName {
  return ({
    actor: "person",
    client: "browser",
    service: "service",
    api: "api",
    process: "card",
    decision: "choice",
    datastore: "database",
    queue: "queue",
    worker: "worker",
    event: "event",
    outcome: "card",
  } as const)[kind];
}

function planIssueDiagnostic(issue: z.core.$ZodIssue): Diagnostic {
  const tagged = issue.message.match(/^\[([^\]]+)]\s*(.*)$/);
  const path = issue.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number");
  return {
    ...diagnostic(tagged?.[1] ?? "plan.invalid", tagged?.[2] ?? issue.message),
    ...(path.length ? { path } : {}),
  };
}
