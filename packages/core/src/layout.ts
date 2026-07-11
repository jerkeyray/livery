import type { LiveryArtifact, Relationship } from "./artifact.js";
import type { FlowLayoutOptions, Scene, SceneDirection, SceneEdge, SceneNode } from "./scene.js";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 72;
const COMPACT_NODE_HEIGHT = 64;
const PADDING = 28;
const LAYER_GAP = 104;
const ROW_GAP = 28;
const COMPACT_GAP = 44;

export function computeFlowScene(artifact: LiveryArtifact, options: FlowLayoutOptions): Scene {
  const width = Math.max(280, Math.floor(options.width));
  const compactBreakpoint = options.compactBreakpoint ?? 640;
  const layers = assignLayers(artifact);
  const maxLayer = Math.max(...layers.values(), 0);
  const requiredHorizontalWidth = PADDING * 2 + NODE_WIDTH * (maxLayer + 1) + LAYER_GAP * maxLayer;
  const direction: SceneDirection =
    width <= compactBreakpoint || requiredHorizontalWidth > width ? "vertical" : "horizontal";
  const nodes =
    direction === "vertical" ? layoutCompactNodes(artifact, width) : layoutLayeredNodes(artifact, width, layers);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pairCounts = new Map<string, number>();
  const pairIndexes = new Map<string, number>();
  for (const relationship of artifact.relationships) {
    const key = pairKey(relationship.from, relationship.to);
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }
  const edges = artifact.relationships.flatMap((relationship) => {
    const from = nodeById.get(relationship.from);
    const to = nodeById.get(relationship.to);
    const key = pairKey(relationship.from, relationship.to);
    const pairIndex = pairIndexes.get(key) ?? 0;
    pairIndexes.set(key, pairIndex + 1);
    const pairCount = pairCounts.get(key) ?? 1;
    const laneGap = direction === "vertical" ? 64 : 28;
    const lane = (pairIndex - (pairCount - 1) / 2) * laneGap;
    return from && to ? [routeEdge(relationship, from, to, direction, lane)] : [];
  });
  const contentBottom = Math.max(...nodes.map((node) => node.y + node.height), 0);
  const height = Math.max(180, contentBottom + PADDING);

  return {
    id: artifact.id,
    width,
    height,
    direction,
    nodes,
    edges,
    accessibility: {
      summary: `${artifact.title ?? artifact.id}: ${nodes.length} entities and ${edges.length} relationships.`,
      readingOrder: nodes.map(({ id }) => id),
    },
    ...(artifact.title ? { title: artifact.title } : {}),
  };
}

function layoutCompactNodes(artifact: LiveryArtifact, width: number): SceneNode[] {
  const nodeWidth = Math.min(NODE_WIDTH + 32, width - PADDING * 2);
  const x = Math.round((width - nodeWidth) / 2);

  return artifact.entities.map((entity, index) => ({
    id: entity.id,
    label: entity.label,
    x,
    y: PADDING + index * (COMPACT_NODE_HEIGHT + COMPACT_GAP),
    width: nodeWidth,
    height: COMPACT_NODE_HEIGHT,
    ...(entity.role ? { role: entity.role } : {}),
    ...(entity.tone ? { tone: entity.tone } : {}),
  }));
}

function layoutLayeredNodes(artifact: LiveryArtifact, width: number, layers: Map<string, number>): SceneNode[] {
  const maxLayer = Math.max(...layers.values(), 0);
  const requiredWidth = PADDING * 2 + NODE_WIDTH * (maxLayer + 1) + LAYER_GAP * maxLayer;
  const availableExtra = Math.max(0, width - requiredWidth);
  const startX = PADDING + Math.floor(availableExtra / 2);
  const layersToEntities = new Map<number, string[]>();

  for (const entity of artifact.entities) {
    const layer = layers.get(entity.id) ?? 0;
    const ids = layersToEntities.get(layer) ?? [];
    ids.push(entity.id);
    layersToEntities.set(layer, ids);
  }

  const maxRows = Math.max(...[...layersToEntities.values()].map((ids) => ids.length), 1);
  const contentHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;

  return artifact.entities.map((entity) => {
    const layer = layers.get(entity.id) ?? 0;
    const siblings = layersToEntities.get(layer) ?? [entity.id];
    const row = siblings.indexOf(entity.id);
    const layerHeight = siblings.length * NODE_HEIGHT + (siblings.length - 1) * ROW_GAP;
    const layerOffset = Math.floor((contentHeight - layerHeight) / 2);

    return {
      id: entity.id,
      label: entity.label,
      x: startX + layer * (NODE_WIDTH + LAYER_GAP),
      y: PADDING + layerOffset + row * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      ...(entity.role ? { role: entity.role } : {}),
      ...(entity.tone ? { tone: entity.tone } : {}),
    };
  });
}

function assignLayers(artifact: LiveryArtifact) {
  const layers = new Map<string, number>();
  const incoming = new Map(artifact.entities.map(({ id }) => [id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const relationship of artifact.relationships) {
    incoming.set(relationship.to, (incoming.get(relationship.to) ?? 0) + 1);
    const targets = outgoing.get(relationship.from) ?? [];
    targets.push(relationship.to);
    outgoing.set(relationship.from, targets);
  }

  const roots = artifact.entities.filter(({ id }) => (incoming.get(id) ?? 0) === 0).map(({ id }) => id);
  const queue = roots.length > 0 ? [...roots] : artifact.entities[0] ? [artifact.entities[0].id] : [];
  for (const root of queue) layers.set(root, 0);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const currentLayer = layers.get(current) ?? 0;
    for (const target of outgoing.get(current) ?? []) {
      if (layers.has(target)) continue;
      layers.set(target, currentLayer + 1);
      queue.push(target);
    }
  }

  let nextDisconnectedLayer = Math.max(...layers.values(), -1) + 1;
  for (const entity of artifact.entities) {
    if (layers.has(entity.id)) continue;
    layers.set(entity.id, nextDisconnectedLayer);
    nextDisconnectedLayer += 1;
  }

  return layers;
}

function routeEdge(
  relationship: Relationship,
  from: SceneNode,
  to: SceneNode,
  direction: SceneDirection,
  lane: number,
): SceneEdge {
  if (direction === "vertical") return routeVerticalEdge(relationship, from, to, lane);

  const forward = to.x >= from.x;
  const startX = forward ? from.x + from.width : from.x;
  const endX = forward ? to.x : to.x + to.width;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2;
  const distance = Math.max(48, Math.abs(endX - startX) * 0.45);
  const control1 = forward ? startX + distance : startX - distance;
  const control2 = forward ? endX - distance : endX + distance;

  return edgeScene(
    relationship,
    `M ${startX} ${startY} C ${control1} ${startY + lane}, ${control2} ${endY + lane}, ${endX} ${endY}`,
    (startX + endX) / 2,
    (startY + endY) / 2 + lane - 8,
  );
}

function routeVerticalEdge(relationship: Relationship, from: SceneNode, to: SceneNode, lane: number): SceneEdge {
  const spansIntermediateNode = Math.abs(to.y - from.y) > COMPACT_NODE_HEIGHT + COMPACT_GAP + 8;
  if (spansIntermediateNode) {
    const startX = from.x;
    const endX = to.x;
    const startY = from.y + from.height / 2;
    const endY = to.y + to.height / 2;
    const outsideX = Math.max(PADDING / 2, Math.min(startX, endX) - 44);
    return edgeScene(
      relationship,
      `M ${startX} ${startY} C ${outsideX} ${startY}, ${outsideX} ${endY}, ${endX} ${endY}`,
      outsideX - 2,
      (startY + endY) / 2,
    );
  }

  const forward = to.y >= from.y;
  const startX = from.x + from.width / 2;
  const endX = to.x + to.width / 2;
  const startY = forward ? from.y + from.height : from.y;
  const endY = forward ? to.y : to.y + to.height;
  const distance = Math.max(36, Math.abs(endY - startY) * 0.45);
  const control1 = forward ? startY + distance : startY - distance;
  const control2 = forward ? endY - distance : endY + distance;

  return edgeScene(
    relationship,
    `M ${startX} ${startY} C ${startX + lane} ${control1}, ${endX + lane} ${control2}, ${endX} ${endY}`,
    (startX + endX) / 2 + lane + 10,
    (startY + endY) / 2,
  );
}

function pairKey(from: string, to: string) {
  return [from, to].sort().join("\u0000");
}

function edgeScene(relationship: Relationship, path: string, labelX: number, labelY: number): SceneEdge {
  return {
    id: relationship.id,
    from: relationship.from,
    to: relationship.to,
    path,
    labelX,
    labelY,
    ...(relationship.label ? { label: relationship.label } : {}),
    ...(relationship.tone ? { tone: relationship.tone } : {}),
  };
}
