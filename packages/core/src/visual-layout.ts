import type { Connector, LayoutSpec, VisualConstraint, VisualDocument, VisualNode, VisualStyle, VisualValue } from "./visual.js";

export type VisualBounds = { x: number; y: number; width: number; height: number };
export type SolvedVisualNode = VisualBounds & {
  id: string;
  kind: VisualNode["kind"];
  label?: string;
  subtitle?: string;
  description?: string;
  variant?: string;
  tone?: VisualNode["tone"];
  style?: VisualStyle;
  props?: Record<string, VisualValue>;
  parent?: string;
};
export type SolvedConnector = Connector & { path: string; labelX: number; labelY: number };
export type VisualScene = {
  id: string;
  title?: string;
  width: number;
  height: number;
  nodes: SolvedVisualNode[];
  connectors: SolvedConnector[];
  bounds: Record<string, VisualBounds>;
  accessibility: { summary: string; readingOrder: string[] };
};

const PADDING = 28;
const DEFAULT_GAP = 24;
const NODE_HEIGHT = 72;

/** @deprecated Use solvePinboard; this compatibility solver does not provide the validated BoardScene contract. */
export function solveVisualDocument(document: VisualDocument, width = 720): VisualScene {
  const sceneWidth = Math.max(280, Math.floor(width));
  const availableWidth = sceneWidth - PADDING * 2;
  const measured = measure(document.root, availableWidth);
  const bounds = new Map<string, VisualBounds>();
  const nodes: SolvedVisualNode[] = [];
  place(document.root, PADDING, PADDING, Math.min(availableWidth, measured.width), measured.height, undefined, nodes, bounds);
  applyConstraints(document.constraints, nodes, bounds);
  const connectors = document.connectors.flatMap((connector) => {
    const from = bounds.get(connector.from.node);
    const to = bounds.get(connector.to.node);
    return from && to ? [route(connector, from, to, bounds)] : [];
  });
  const height = Math.max(160, measured.height + PADDING * 2, ...connectors.map(({ labelY }) => labelY + 34));
  return {
    id: document.id,
    ...(document.title ? { title: document.title } : {}),
    width: sceneWidth,
    height,
    nodes,
    connectors,
    bounds: Object.fromEntries(bounds),
    accessibility: {
      summary: `${document.title ?? document.id}: ${nodes.length} visual elements and ${connectors.length} connections.`,
      readingOrder: nodes.map(({ id }) => id),
    },
  };
}

function applyConstraints(constraints: VisualConstraint[], nodes: SolvedVisualNode[], bounds: Map<string, VisualBounds>) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const move = (id: string, x: number, y: number) => {
    const bound = bounds.get(id);
    if (!bound) return;
    const dx = x - bound.x;
    const dy = y - bound.y;
    bound.x = x;
    bound.y = y;
    const node = nodeById.get(id);
    if (node) { node.x = x; node.y = y; }
    for (const candidate of nodes) if (candidate.parent === id) move(candidate.id, candidate.x + dx, candidate.y + dy);
  };
  for (const constraint of constraints) {
    if (constraint.kind === "align") {
      const reference = bounds.get(constraint.targets[0]!);
      if (!reference) continue;
      for (const id of constraint.targets.slice(1)) {
        const target = bounds.get(id);
        if (!target) continue;
        if (constraint.axis === "x") move(id, aligned(reference.x, reference.width, target.width, constraint.edge), target.y);
        else move(id, target.x, aligned(reference.y, reference.height, target.height, constraint.edge));
      }
    }
    if (constraint.kind === "near") {
      const first = bounds.get(constraint.first);
      const second = bounds.get(constraint.second);
      if (first && second) move(constraint.second, first.x + first.width + numeric(constraint.distance, DEFAULT_GAP), first.y);
    }
    if (constraint.kind === "inside") {
      const child = bounds.get(constraint.child);
      const container = bounds.get(constraint.container);
      const padding = numeric(constraint.padding, 8);
      if (child && container) move(constraint.child, Math.max(container.x + padding, Math.min(child.x, container.x + container.width - child.width - padding)), Math.max(container.y + padding, Math.min(child.y, container.y + container.height - child.height - padding)));
    }
    if (constraint.kind === "distribute") {
      const targets = constraint.targets.flatMap((id) => bounds.has(id) ? [{ id, bounds: bounds.get(id)! }] : []);
      const gap = numeric(constraint.gap, DEFAULT_GAP);
      targets.forEach((target, index) => {
        if (index === 0) return;
        const previous = targets[index - 1]!.bounds;
        if (constraint.axis === "x") move(target.id, previous.x + previous.width + gap, target.bounds.y);
        else move(target.id, target.bounds.x, previous.y + previous.height + gap);
      });
    }
  }
}

function aligned(position: number, size: number, targetSize: number, edge: "start" | "center" | "end" = "center") {
  if (edge === "start") return position;
  if (edge === "end") return position + size - targetSize;
  return position + (size - targetSize) / 2;
}

function measure(node: VisualNode, maxWidth: number): { width: number; height: number } {
  if (!node.children?.length) {
    const explicit = node.layout;
    const labelWidth = Math.max(144, Math.min(224, (node.label?.length ?? 8) * 6.2 + 44));
    return { width: explicit?.width ?? labelWidth, height: explicit?.height ?? NODE_HEIGHT };
  }
  const gap = numeric(node.layout?.gap, DEFAULT_GAP);
  const children = node.children.map((child) => measure(child, maxWidth));
  const kind = node.layout?.kind ?? "row";
  if (kind === "column") return { width: Math.max(...children.map(({ width }) => width), 0), height: children.reduce((sum, { height }) => sum + height, 0) + gap * Math.max(0, children.length - 1) };
  if (kind === "grid") {
    const columns = Math.max(1, node.layout?.columns ?? Math.ceil(Math.sqrt(children.length)));
    const cellWidth = Math.max(...children.map(({ width }) => width, 0));
    const cellHeight = Math.max(...children.map(({ height }) => height, 0));
    return { width: columns * cellWidth + gap * (columns - 1), height: Math.ceil(children.length / columns) * cellHeight + gap * Math.max(0, Math.ceil(children.length / columns) - 1) };
  }
  if (kind === "stack" || kind === "overlay") return { width: Math.max(...children.map(({ width }) => width), 0), height: Math.max(...children.map(({ height }) => height), 0) };
  const rawWidth = children.reduce((sum, { width }) => sum + width, 0) + gap * Math.max(0, children.length - 1);
  if (rawWidth > maxWidth && node.id === "root") {
    return { width: Math.max(...children.map(({ width }) => width), 0), height: children.reduce((sum, { height }) => sum + height, 0) + gap * Math.max(0, children.length - 1) };
  }
  return { width: rawWidth, height: Math.max(...children.map(({ height }) => height), 0) };
}

function place(
  node: VisualNode,
  x: number,
  y: number,
  width: number,
  height: number,
  parent: string | undefined,
  nodes: SolvedVisualNode[],
  bounds: Map<string, VisualBounds>,
) {
  const ownBounds = { x: node.layout?.x ?? x, y: node.layout?.y ?? y, width, height };
  bounds.set(node.id, ownBounds);
  if (!node.children?.length) {
    nodes.push({ id: node.id, kind: node.kind, ...ownBounds, ...(node.label ? { label: node.label } : {}), ...(node.subtitle ? { subtitle: node.subtitle } : {}), ...(node.description ? { description: node.description } : {}), ...(node.variant ? { variant: node.variant } : {}), ...(node.tone ? { tone: node.tone } : {}), ...(node.style ? { style: node.style } : {}), ...(node.props ? { props: node.props } : {}), ...(parent ? { parent } : {}) });
    return;
  }
  const gap = numeric(node.layout?.gap, DEFAULT_GAP);
  const sizes = node.children.map((child) => measure(child, width));
  const kind = node.layout?.kind ?? "row";
  let cursorX = ownBounds.x;
  let cursorY = ownBounds.y;
  const columns = kind === "grid" ? Math.max(1, node.layout?.columns ?? Math.ceil(Math.sqrt(node.children.length))) : 1;
  const cellWidth = Math.max(...sizes.map(({ width }) => width), 0);
  const cellHeight = Math.max(...sizes.map(({ height }) => height), 0);
  node.children.forEach((child, index) => {
    const size = sizes[index]!;
    let childX = cursorX;
    let childY = cursorY;
    if (kind === "column" || (node.id === "root" && sizes.reduce((sum, item) => sum + item.width, 0) + gap * (sizes.length - 1) > width)) cursorY += size.height + gap;
    else if (kind === "grid") {
      childX = ownBounds.x + (index % columns) * (cellWidth + gap);
      childY = ownBounds.y + Math.floor(index / columns) * (cellHeight + gap);
    } else if (kind === "stack" || kind === "overlay") {
      childX = ownBounds.x + (width - size.width) / 2;
      childY = ownBounds.y + (height - size.height) / 2;
    } else cursorX += size.width + gap;
    place(child, childX, childY, size.width, size.height, node.id, nodes, bounds);
  });
}

function route(connector: Connector, from: VisualBounds, to: VisualBounds, bounds: Map<string, VisualBounds>): SolvedConnector {
  const vertical = Math.abs((to.y + to.height / 2) - (from.y + from.height / 2)) > Math.abs((to.x + to.width / 2) - (from.x + from.width / 2));
  const start = anchorPoint(from, vertical ? "bottom" : connector.from.anchor ?? "right");
  const end = anchorPoint(to, vertical ? "top" : connector.to.anchor ?? "left");
  const midX = (start.x + end.x) / 2;
  const verticalObstacle = vertical && [...bounds.entries()].find(([id, candidate]) =>
    id !== connector.from.node && id !== connector.to.node &&
    !contains(candidate, start) && !contains(candidate, end) &&
    candidate.y < Math.max(start.y, end.y) && candidate.y + candidate.height > Math.min(start.y, end.y) &&
    candidate.x < Math.max(start.x, end.x) && candidate.x + candidate.width > Math.min(start.x, end.x),
  )?.[1];
  if (verticalObstacle) {
    const laneX = Math.max(from.x + from.width, to.x + to.width, verticalObstacle.x + verticalObstacle.width) + 8;
    return { ...connector, path: `M ${start.x} ${start.y} L ${laneX} ${start.y} L ${laneX} ${end.y} L ${end.x} ${end.y}`, labelX: laneX, labelY: (start.y + end.y) / 2 - 5 };
  }
  const obstacle = !vertical && [...bounds.entries()].find(([id, candidate]) =>
    id !== connector.from.node && id !== connector.to.node &&
    !contains(candidate, start) && !contains(candidate, end) &&
    candidate.x < Math.max(start.x, end.x) && candidate.x + candidate.width > Math.min(start.x, end.x) &&
    start.y >= candidate.y && start.y <= candidate.y + candidate.height,
  )?.[1];
  if (obstacle) {
    const laneY = Math.max(from.y + from.height, to.y + to.height, obstacle.y + obstacle.height) + 24;
    const direction = end.x >= start.x ? 1 : -1;
    const startTurnX = start.x + direction * 14;
    const endTurnX = end.x - direction * 14;
    return { ...connector, path: `M ${start.x} ${start.y} L ${startTurnX} ${start.y} L ${startTurnX} ${laneY} L ${endTurnX} ${laneY} L ${endTurnX} ${end.y} L ${end.x} ${end.y}`, labelX: midX, labelY: laneY + 4 };
  }
  return { ...connector, path: `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`, labelX: midX, labelY: (start.y + end.y) / 2 - 8 };
}

function contains(bounds: VisualBounds, point: { x: number; y: number }) {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
}

function anchorPoint(bounds: VisualBounds, anchor: string) {
  if (anchor === "top") return { x: bounds.x + bounds.width / 2, y: bounds.y };
  if (anchor === "bottom") return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
  if (anchor === "left") return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  if (anchor === "center") return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
}

function numeric(value: LayoutSpec["gap"], fallback: number) {
  if (typeof value === "number") return value;
  const scale: Record<string, number> = { "$space.xs": 4, "$space.sm": 8, "$space.md": 16, "$space.lg": 24, "$space.xl": 40 };
  return typeof value === "string" ? scale[value] ?? fallback : fallback;
}
