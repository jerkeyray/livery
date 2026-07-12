import ELK from "elkjs/lib/elk.bundled.js";

import {
  estimatedMeasurementService,
  fastFlowLayoutAdapter,
  type LayoutAdapter,
  type LayoutRequest,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "@livery/core";

type ElkPoint = { x: number; y: number };
type ElkSection = { startPoint: ElkPoint; bendPoints?: ElkPoint[]; endPoint: ElkPoint };
type ElkEdge = { id: string; sources?: string[]; targets?: string[]; sections?: ElkSection[] };
type ElkChild = { id: string; x?: number; y?: number; width?: number; height?: number };
type ElkGraph = {
  id: string;
  width?: number;
  height?: number;
  children?: ElkChild[];
  edges?: ElkEdge[];
  layoutOptions?: Record<string, string>;
};
type ElkLike = { layout(graph: ElkGraph): Promise<ElkGraph> };

export type ElkLayoutAdapterOptions = {
  elk?: ElkLike;
  fallback?: LayoutAdapter;
};

export function createElkLayoutAdapter(options: ElkLayoutAdapterOptions = {}): LayoutAdapter {
  const elk = options.elk ?? (new ELK() as unknown as ElkLike);
  const fallback = options.fallback ?? fastFlowLayoutAdapter;
  return {
    id: "livery.elk-layered",
    async layout(request) {
      try {
        return await layoutWithElk(elk, request);
      } catch {
        return await fallback.layout(request);
      }
    },
  };
}

async function layoutWithElk(elk: ElkLike, request: LayoutRequest): Promise<Scene> {
  const { artifact, options } = request;
  const width = Math.max(280, Math.floor(options.width));
  const vertical = width <= (options.compactBreakpoint ?? 640);
  const measurement = options.measurement ?? estimatedMeasurementService;
  const maxNodeWidth = vertical ? Math.min(208, width - 56) : 220;
  const measurements = new Map(
    artifact.entities.map((entity) => [
      entity.id,
      measurement.measureEntity(entity, {
        minWidth: Math.min(152, maxNodeWidth),
        maxWidth: maxNodeWidth,
        minHeight: vertical ? 64 : 72,
        maxLines: 2,
      }),
    ]),
  );
  const graph = await elk.layout({
    id: artifact.id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": vertical ? "DOWN" : "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.considerModelOrder.strategy": "PREFER_EDGES",
      "elk.spacing.nodeNode": "44",
      "elk.layered.spacing.nodeNodeBetweenLayers": vertical ? "64" : "104",
      "elk.padding": "[top=28,left=28,bottom=28,right=28]",
    },
    children: artifact.entities.map((entity) => ({ id: entity.id, ...measurements.get(entity.id)! })),
    edges: artifact.relationships.map((relationship) => ({
      id: relationship.id,
      sources: [relationship.from],
      targets: [relationship.to],
    })),
  });

  const graphWidth = Math.ceil(graph.width ?? 0);
  if (graphWidth > width) throw new Error(`ELK layout width ${graphWidth} exceeds container width ${width}.`);
  const offsetX = Math.floor((width - graphWidth) / 2);
  const childById = new Map((graph.children ?? []).map((child) => [child.id, child]));
  const edgeById = new Map((graph.edges ?? []).map((edge) => [edge.id, edge]));
  const nodes: SceneNode[] = artifact.entities.map((entity) => {
    const child = childById.get(entity.id);
    const measured = measurements.get(entity.id)!;
    if (!child || child.x === undefined || child.y === undefined) throw new Error(`ELK omitted node ${entity.id}.`);
    return {
      id: entity.id,
      label: entity.label,
      x: Math.round(child.x + offsetX),
      y: Math.round(child.y),
      width: Math.round(child.width ?? measured.width),
      height: Math.round(child.height ?? measured.height),
      ...(entity.role ? { role: entity.role } : {}),
      ...(entity.tone ? { tone: entity.tone } : {}),
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: SceneEdge[] = artifact.relationships.map((relationship) => {
    const elkEdge = edgeById.get(relationship.id);
    const points = elkEdge?.sections?.flatMap((section) => [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ]);
    const shifted = points?.length
      ? points.map(({ x, y }) => ({ x: x + offsetX, y }))
      : fallbackPoints(nodeById.get(relationship.from), nodeById.get(relationship.to));
    const middle = shifted[Math.floor(shifted.length / 2)]!;
    return {
      id: relationship.id,
      from: relationship.from,
      to: relationship.to,
      path: shifted.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${Math.round(x)} ${Math.round(y)}`).join(" "),
      labelX: Math.round(middle.x),
      labelY: Math.round(middle.y - 8),
      ...(relationship.label ? { label: relationship.label } : {}),
      ...(relationship.tone ? { tone: relationship.tone } : {}),
    };
  });

  return {
    id: artifact.id,
    width,
    height: Math.max(180, Math.ceil(graph.height ?? 0)),
    direction: vertical ? "vertical" : "horizontal",
    nodes,
    edges,
    accessibility: {
      summary: `${artifact.title ?? artifact.id}: ${nodes.length} entities and ${edges.length} relationships.`,
      readingOrder: nodes.map(({ id }) => id),
    },
    ...(artifact.title ? { title: artifact.title } : {}),
  };
}

function fallbackPoints(from?: SceneNode, to?: SceneNode): ElkPoint[] {
  if (!from || !to) throw new Error("ELK edge references a missing node.");
  return [
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    { x: to.x + to.width / 2, y: to.y + to.height / 2 },
  ];
}
