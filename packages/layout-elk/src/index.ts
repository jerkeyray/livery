import ELKApi from "elkjs/lib/elk-api.js";

import {
  estimatedMeasurementService,
  fastFlowLayoutAdapter,
  withLayoutMetadata,
  type LayoutAdapter,
  type LayoutRequest,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "@jerkeyray/core";

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
type ElkWorkerLike = ElkLike & { terminateWorker(): void };

export type ElkWorker = {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  postMessage(message: unknown): void;
  terminate(): void;
};

export type ElkLayoutAdapterOptions = {
  elk?: ElkLike;
  fallback?: LayoutAdapter;
};

export type ElkWorkerLayoutAdapter = LayoutAdapter & {
  terminate(): void;
};

export type ElkWorkerLayoutAdapterOptions = {
  elk?: ElkWorkerLike;
  fallback?: LayoutAdapter;
  workerFactory?: (url: string) => ElkWorker;
  workerUrl?: string | URL;
};

export function createElkLayoutAdapter(options: ElkLayoutAdapterOptions = {}): LayoutAdapter {
  let elk = options.elk;
  const fallback = options.fallback ?? fastFlowLayoutAdapter;
  return {
    id: "livery.elk-layered",
    async layout(request) {
      try {
        if (!elk) {
          const { default: ELK } = await import("elkjs/lib/elk.bundled.js");
          elk = new ELK() as unknown as ElkLike;
        }
        return withLayoutMetadata(await layoutWithElk(elk, request), { adapterId: "livery.elk-layered" });
      } catch {
        return await fallbackScene(fallback, request, "livery.elk-layered");
      }
    },
  };
}

export function createElkWorkerLayoutAdapter(
  options: ElkWorkerLayoutAdapterOptions,
): ElkWorkerLayoutAdapter {
  let elk = options.elk;
  const resolveElk = () => {
    if (!elk) {
      if (!options.workerUrl) throw new Error("An ELK worker URL is required.");
      elk = new ELKApi({
        workerUrl: String(options.workerUrl),
        ...(options.workerFactory
          ? { workerFactory: options.workerFactory as unknown as (url?: string) => Worker }
          : {}),
      }) as unknown as ElkWorkerLike;
    }
    return elk;
  };
  const resetWorker = () => {
    elk?.terminateWorker();
    elk = undefined;
  };
  return {
    id: "livery.elk-worker-layered",
    async layout(request) {
      try {
        return withLayoutMetadata(await layoutWithCancellation(resolveElk(), request, resetWorker), {
          adapterId: "livery.elk-worker-layered",
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        return await fallbackScene(
          options.fallback ?? fastFlowLayoutAdapter,
          request,
          "livery.elk-worker-layered",
        );
      }
    },
    terminate: resetWorker,
  };
}

async function fallbackScene(fallback: LayoutAdapter, request: LayoutRequest, requestedAdapterId: string) {
  const scene = await fallback.layout(request);
  return withLayoutMetadata(scene, {
    ...(scene.layout ?? { adapterId: fallback.id }),
    fallback: true,
    requestedAdapterId,
  });
}

function layoutWithCancellation(
  elk: ElkWorkerLike,
  request: LayoutRequest,
  terminate: () => void,
): Promise<Scene> {
  const { signal } = request;
  if (!signal) return layoutWithElk(elk, request);
  if (signal.aborted) {
    terminate();
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const abort = () => {
      terminate();
      reject(abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
    void layoutWithElk(elk, request).then(
      (scene) => {
        signal.removeEventListener("abort", abort);
        resolve(scene);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function abortError() {
  const error = new Error("Layout request was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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
        minWidth: Math.min(168, maxNodeWidth),
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
      "elk.layered.cycleBreaking.strategy": "GREEDY_MODEL_ORDER",
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
  const pairCounts = new Map<string, number>();
  for (const relationship of artifact.relationships) {
    const key = relationshipPair(relationship.from, relationship.to);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const pairIndexes = new Map<string, number>();
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
    const pair = relationshipPair(relationship.from, relationship.to);
    const pairIndex = pairIndexes.get(pair) ?? 0;
    pairIndexes.set(pair, pairIndex + 1);
    const pairCount = pairCounts.get(pair) ?? 1;
    const lane = pairCount > 1 ? (pairIndex - (pairCount - 1) / 2) * 28 : 0;
    const label = edgeLabelPosition(shifted, lane);
    return {
      id: relationship.id,
      from: relationship.from,
      to: relationship.to,
      path: shifted.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${Math.round(x)} ${Math.round(y)}`).join(" "),
      labelX: Math.round(label.x),
      labelY: Math.round(label.y),
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

function edgeLabelPosition(points: ElkPoint[], lane: number) {
  let longest = { from: points[0]!, length: -1, to: points.at(1) ?? points[0]! };
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
    const from = points[pointIndex - 1]!;
    const to = points[pointIndex]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length > longest.length) longest = { from, length, to };
  }
  const horizontal = Math.abs(longest.to.x - longest.from.x) >= Math.abs(longest.to.y - longest.from.y);
  return {
    x: (longest.from.x + longest.to.x) / 2 + (horizontal ? 0 : lane || 10),
    y: (longest.from.y + longest.to.y) / 2 + (horizontal ? lane || -9 : 4),
  };
}

function relationshipPair(from: string, to: string) {
  return from < to ? `${from}\u0000${to}` : `${to}\u0000${from}`;
}

function fallbackPoints(from?: SceneNode, to?: SceneNode): ElkPoint[] {
  if (!from || !to) throw new Error("ELK edge references a missing node.");
  return [
    { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    { x: to.x + to.width / 2, y: to.y + to.height / 2 },
  ];
}
