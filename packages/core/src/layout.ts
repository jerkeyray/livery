import type { Entity, LiveryArtifact, Relationship } from "./artifact.js";
import {
  estimatedMeasurementService,
  type ComponentMeasurement,
  type MeasurementService,
} from "./measurement.js";
import type { FlowLayoutOptions, Scene, SceneDirection, SceneEdge, SceneNode } from "./scene.js";

const PADDING = 28;
const LAYER_GAP = 104;
const ROW_GAP = 28;
const COMPACT_GAP = 44;

export function computeFlowScene(artifact: LiveryArtifact, options: FlowLayoutOptions): Scene {
  const width = Math.max(280, Math.floor(options.width));
  const compactBreakpoint = options.compactBreakpoint ?? 640;
  const measurement = options.measurement ?? estimatedMeasurementService;
  const layers = assignLayers(artifact);
  const expandedMeasurements = measureEntities(artifact.entities, measurement, {
    minWidth: 152,
    maxWidth: 220,
    minHeight: 72,
    maxLines: 2,
  });
  const layerWidths = measureLayerWidths(artifact.entities, layers, expandedMeasurements);
  const requiredHorizontalWidth =
    PADDING * 2 + [...layerWidths.values()].reduce((sum, layerWidth) => sum + layerWidth, 0) +
    LAYER_GAP * Math.max(0, layerWidths.size - 1);
  const direction: SceneDirection =
    width <= compactBreakpoint || requiredHorizontalWidth > width ? "vertical" : "horizontal";
  const compactMaxWidth = Math.min(208, width - PADDING * 2);
  const compactMeasurements = measureEntities(artifact.entities, measurement, {
    minWidth: Math.min(152, compactMaxWidth),
    maxWidth: compactMaxWidth,
    minHeight: 64,
    maxLines: 2,
  });
  const nodes = direction === "vertical"
    ? layoutCompactNodes(artifact, width, compactMeasurements)
    : layoutLayeredNodes(artifact, width, layers, expandedMeasurements, layerWidths, requiredHorizontalWidth);
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

function layoutCompactNodes(
  artifact: LiveryArtifact,
  width: number,
  measurements: Map<string, ComponentMeasurement>,
): SceneNode[] {
  let y = PADDING;
  return artifact.entities.map((entity) => {
    const measured = measurements.get(entity.id)!;
    const node = sceneNode(entity, Math.round((width - measured.width) / 2), y, measured);
    y += measured.height + COMPACT_GAP;
    return node;
  });
}

function layoutLayeredNodes(
  artifact: LiveryArtifact,
  width: number,
  layers: Map<string, number>,
  measurements: Map<string, ComponentMeasurement>,
  layerWidths: Map<number, number>,
  requiredWidth: number,
) {
  const availableExtra = Math.max(0, width - requiredWidth);
  const startX = PADDING + Math.floor(availableExtra / 2);
  const layersToEntities = new Map<number, Entity[]>();
  const layerX = new Map<number, number>();
  let nextX = startX;

  for (const [layer, layerWidth] of [...layerWidths.entries()].sort(([first], [second]) => first - second)) {
    layerX.set(layer, nextX);
    nextX += layerWidth + LAYER_GAP;
  }

  for (const entity of artifact.entities) {
    const layer = layers.get(entity.id) ?? 0;
    const entities = layersToEntities.get(layer) ?? [];
    entities.push(entity);
    layersToEntities.set(layer, entities);
  }

  const layerHeights = new Map(
    [...layersToEntities].map(([layer, entities]) => [
      layer,
      entities.reduce((sum, entity) => sum + measurements.get(entity.id)!.height, 0) +
        Math.max(0, entities.length - 1) * ROW_GAP,
    ]),
  );
  const contentHeight = Math.max(...layerHeights.values(), 0);

  return artifact.entities.map((entity) => {
    const layer = layers.get(entity.id) ?? 0;
    const siblings = layersToEntities.get(layer) ?? [entity];
    const row = siblings.findIndex(({ id }) => id === entity.id);
    const layerHeight = layerHeights.get(layer) ?? 0;
    const layerOffset = Math.floor((contentHeight - layerHeight) / 2);
    const measured = measurements.get(entity.id)!;
    const precedingHeight = siblings
      .slice(0, row)
      .reduce((sum, sibling) => sum + measurements.get(sibling.id)!.height + ROW_GAP, 0);
    const x = (layerX.get(layer) ?? startX) + ((layerWidths.get(layer) ?? measured.width) - measured.width) / 2;
    return sceneNode(entity, Math.round(x), PADDING + layerOffset + precedingHeight, measured);
  });
}

function measureEntities(
  entities: Entity[],
  measurement: MeasurementService,
  constraints: Parameters<MeasurementService["measureEntity"]>[1],
) {
  return new Map(entities.map((entity) => [entity.id, measurement.measureEntity(entity, constraints)]));
}

function measureLayerWidths(
  entities: Entity[],
  layers: Map<string, number>,
  measurements: Map<string, ComponentMeasurement>,
) {
  const widths = new Map<number, number>();
  for (const entity of entities) {
    const layer = layers.get(entity.id) ?? 0;
    widths.set(layer, Math.max(widths.get(layer) ?? 0, measurements.get(entity.id)!.width));
  }
  return widths;
}

function sceneNode(entity: Entity, x: number, y: number, measured: ComponentMeasurement): SceneNode {
  return {
    id: entity.id,
    label: entity.label,
    x,
    y,
    width: measured.width,
    height: measured.height,
    ...(entity.role ? { role: entity.role } : {}),
    ...(entity.tone ? { tone: entity.tone } : {}),
  };
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
  const spansIntermediateNode = Math.abs(to.y - from.y) > Math.max(from.height, to.height) + COMPACT_GAP + 8;
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
