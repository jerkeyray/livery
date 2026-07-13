import { validateBoardScene } from "./board-validator.js";
import type {
  BoardConnector,
  BoardPoint,
  BoardRect,
  BoardScene,
  BoardTrack,
  CanvasPrimitive,
  CollisionEnvelope,
  LayoutAttempt,
  LayoutDiagnostic,
  LayoutResult,
  LayoutViolationCode,
  RouteChannel,
  SolvedCanvas,
  SolvedElement,
  SolvedPin,
} from "./board.js";
import type { AnchorName, Connector, LayoutKind, Timeline, VisualDocument, VisualNode, VisualValue } from "./visual.js";

export type PinboardOptions = { width?: number; maxCandidates?: number; maxElements?: number };

type Strategy = LayoutAttempt["strategy"];
type Size = { width: number; height: number };
type PlacementContext = {
  elements: SolvedElement[];
  envelopes: CollisionEnvelope[];
  channels: RouteChannel[];
  bounds: Map<string, BoardRect>;
  minimumGap: number;
  rootGap: number;
  canvases: SolvedCanvas[];
};

const STRATEGIES: Strategy[] = ["requested", "expanded_tracks", "alternate_spans", "vertical_reflow", "increased_height"];
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 280;
const PADDING = 24;
const COMPACT_PADDING = 16;
const DEFAULT_GAP = 32;
const MIN_GAP = 24;
const CLEARANCE = 6;
const NODE_HEIGHT = 72;
const MAX_ELEMENTS = 512;
const MAX_CANVAS_REPEAT = 128;
const MAX_CANVAS_PRIMITIVES = 512;
const MAX_CANVAS_DEPTH = 16;
const MAX_PATH_SOURCE = 8192;
const MAX_IMAGE_DIMENSION = 4096;

export function solvePinboard(document: VisualDocument, options: PinboardOptions = {}): LayoutResult {
  const width = Math.max(MIN_WIDTH, Math.floor(options.width ?? DEFAULT_WIDTH));
  const attempts: LayoutAttempt[] = [];
  const successes: Array<{ scene: BoardScene; report: ReturnType<typeof validateBoardScene>; cost: number }> = [];
  const strategies = STRATEGIES.slice(0, Math.max(1, options.maxCandidates ?? STRATEGIES.length));
  const nodeCount = countNodes(document.root);
  if (nodeCount > (options.maxElements ?? MAX_ELEMENTS)) {
    return { ok: false, diagnostics: [issue("layout.resource_limit", `Expanded board contains ${nodeCount} elements; limit is ${options.maxElements ?? MAX_ELEMENTS}.`)], attempts };
  }
  const canvasDiagnostic = validateCanvasResources(document.root);
  if (canvasDiagnostic) return { ok: false, diagnostics: [canvasDiagnostic], attempts };

  for (const strategy of strategies) {
    const scene = buildCandidate(document, width, strategy);
    const report = validateBoardScene(scene);
    attempts.push({ strategy, width: scene.board.width, height: scene.board.height, diagnostics: report.diagnostics });
    if (report.valid) successes.push({ scene, report, cost: candidateCost(strategy, scene, report.metrics.crossingCount) });
  }
  const selected = successes.sort((a, b) => a.cost - b.cost)[0];
  if (selected) return { ok: true, scene: selected.scene, report: selected.report, attempts };
  return {
    ok: false,
    diagnostics: [issue("layout.no_valid_candidate", `No valid board layout was found at ${width}px.`), ...dedupeDiagnostics(attempts.flatMap(({ diagnostics }) => diagnostics))],
    attempts,
  };
}

function buildCandidate(document: VisualDocument, width: number, strategy: Strategy): BoardScene {
  const padding = width <= 480 ? COMPACT_PADDING : PADDING;
  const availableWidth = width - padding * 2;
  const minimumGap = MIN_GAP;
  const rootGap = Math.max(gapFor(document.root.layout?.gap), ...document.connectors.map(({ label }) => label ? measureText(label) + 12 + CLEARANCE * 2 : MIN_GAP));
  const context: PlacementContext = { elements: [], envelopes: [], channels: [], bounds: new Map(), minimumGap, rootGap, canvases: [] };
  const rootSize = measure(document.root, availableWidth, strategy, minimumGap, true, rootGap);
  const routeReserve = document.connectors.length ? Math.max(40, document.connectors.length * 10) : 0;
  const height = Math.ceil(Math.max(120, rootSize.height) + padding * 2 + routeReserve);
  place(document.root, padding, padding, Math.min(rootSize.width, availableWidth), rootSize.height, undefined, context, strategy, true);
  context.channels.push(...buildChannels(context.envelopes, width, height, padding));
  const connectors = routeConnectors(document.connectors, context, width, height, padding);
  return {
    type: "livery.board-scene",
    version: "0.1",
    id: document.id,
    ...(document.title ? { title: document.title } : {}),
    board: {
      width,
      height,
      padding,
      gutter: gapFor(document.root.layout?.gap),
      columns: tracksFor(context.envelopes, "x"),
      rows: tracksFor(context.envelopes, "y"),
      channels: context.channels,
    },
    elements: context.elements,
    connectors,
    canvases: context.canvases,
    envelopes: context.envelopes,
    timelineEnvelopes: solveMotionEnvelopes(document.timelines, [...context.elements, ...context.canvases.flatMap(({ primitives }) => primitives)]),
    readingOrder: context.elements.map(({ id }) => id),
  };
}

function measure(node: VisualNode, maxWidth: number, strategy: Strategy, minimumGap: number, root = false, rootGap = minimumGap): Size {
  if (!node.children?.length) {
    const preferredWidth = node.layout?.width ?? Math.max(120, measureText(node.label ?? node.id) + 32);
    return { width: Math.min(preferredWidth, maxWidth), height: node.layout?.height ?? NODE_HEIGHT };
  }
  if (node.kind === "canvas" || node.layout?.kind === "canvas") {
    return { width: Math.min(maxWidth, node.layout?.width ?? numericProp(node, "width", 240)), height: node.layout?.height ?? numericProp(node, "height", 160) };
  }
  const gap = Math.max(root ? rootGap : minimumGap, gapFor(node.layout?.gap));
  const children = node.children.map((child) => measure(child, maxWidth, strategy, minimumGap, false, rootGap));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, children, maxWidth, gap);
  if (kind === "column") return { width: Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0)), height: sum(children.map(({ height }) => height)) + gap * Math.max(0, children.length - 1) };
  if (kind === "grid") {
    const columns = gridColumns(node, strategy, maxWidth, children.length);
    const cellWidth = Math.max(...children.map(({ width }) => width), 0);
    const cellHeight = Math.max(...children.map(({ height }) => height), 0);
    return { width: Math.min(maxWidth, Math.min(columns, children.length) * cellWidth + gap * Math.max(0, Math.min(columns, children.length) - 1)), height: Math.ceil(children.length / columns) * cellHeight + gap * Math.max(0, Math.ceil(children.length / columns) - 1) };
  }
  if (kind === "stack" || kind === "overlay") return { width: Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0)), height: Math.max(...children.map(({ height }) => height), 0) };
  return { width: sum(children.map(({ width }) => width)) + gap * Math.max(0, children.length - 1), height: Math.max(...children.map(({ height }) => height), 0) };
}

function effectiveLayout(kind: LayoutKind, strategy: Strategy, root: boolean, sizes: Size[], maxWidth: number, gap: number): LayoutKind {
  const rowWidth = sum(sizes.map(({ width }) => width)) + gap * Math.max(0, sizes.length - 1);
  if ((strategy === "vertical_reflow" || strategy === "increased_height") && (root || rowWidth > maxWidth)) return "column";
  if (strategy === "alternate_spans" && root && kind === "row" && rowWidth > maxWidth) return "grid";
  if (kind === "canvas") return "overlay";
  return kind;
}

function place(node: VisualNode, x: number, y: number, width: number, height: number, parent: string | undefined, context: PlacementContext, strategy: Strategy, root = false) {
  const own = { x, y, width, height };
  context.bounds.set(node.id, own);
  context.elements.push({
    id: node.id,
    kind: node.kind,
    bounds: own,
    visualBounds: own,
    ...(node.label ? { label: node.label, labelBounds: labelBounds(node.label, own) } : {}),
    ...(parent ? { parent } : {}),
    layer: parent ? 1 : 0,
    ...(node.tone ? { tone: node.tone } : {}),
    ...(node.variant ? { variant: node.variant } : {}),
    pins: pinsFor(node.id, own),
    ...(node.props ? { props: node.props } : {}),
  });
  if (!node.children?.length) {
    context.envelopes.push({ id: `${node.id}.collision`, owner: node.id, kind: "component", ...inflate(own, CLEARANCE) });
    return;
  }
  if (node.kind === "canvas" || node.layout?.kind === "canvas") {
    const bleed = numericProp(node, "bleed", 0);
    const primitives = solveCanvasPrimitives(node.children, own, context);
    context.canvases.push({ id: `${node.id}.canvas`, owner: node.id, bounds: own, clip: node.props?.clip !== false, bleed, primitives });
    context.envelopes.push({ id: `${node.id}.collision`, owner: node.id, kind: "canvas", ...inflate(own, bleed + CLEARANCE) });
    return;
  }
  const gap = Math.max(root ? context.rootGap : context.minimumGap, gapFor(node.layout?.gap));
  const sizes = node.children.map((child) => measure(child, width, strategy, context.minimumGap, false, context.rootGap));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, sizes, width, gap);
  const columns = kind === "grid" ? gridColumns(node, strategy, width, sizes.length) : 1;
  const cellWidth = kind === "grid" ? Math.max(...sizes.map(({ width }) => width), 0) : 0;
  const cellHeight = kind === "grid" ? Math.max(...sizes.map(({ height }) => height), 0) : 0;
  let cursorX = x;
  let cursorY = y;
  node.children.forEach((child, index) => {
    const size = sizes[index]!;
    let childX = cursorX;
    let childY = cursorY;
    if (kind === "column") cursorY += size.height + gap;
    else if (kind === "grid") {
      childX = x + (index % columns) * (cellWidth + gap);
      childY = y + Math.floor(index / columns) * (cellHeight + gap);
    } else if (kind === "stack" || kind === "overlay") {
      childX = x + (width - size.width) / 2;
      childY = y + (height - size.height) / 2;
    } else cursorX += size.width + gap;
    place(child, childX, childY, size.width, size.height, node.id, context, strategy);
  });
}

function routeConnectors(connectors: Connector[], context: PlacementContext, width: number, height: number, padding: number): BoardConnector[] {
  const solved: BoardConnector[] = [];
  const reservedLabels: BoardRect[] = [];
  connectors.forEach((connector, index) => {
    const from = context.bounds.get(connector.from.node);
    const to = context.bounds.get(connector.to.node);
    if (!from || !to) return;
    const vertical = Math.abs((to.y + to.height / 2) - (from.y + from.height / 2)) > Math.abs((to.x + to.width / 2) - (from.x + from.width / 2));
    const fromSide = vertical ? (to.y >= from.y ? "bottom" : "top") : connector.from.anchor ?? (to.x >= from.x ? "right" : "left");
    const toSide = vertical ? (to.y >= from.y ? "top" : "bottom") : connector.to.anchor ?? (to.x >= from.x ? "left" : "right");
    const start = pointFor(from, fromSide);
    const end = pointFor(to, toSide);
    const candidates = routeCandidates(start, end, fromSide, toSide, width, height, padding, index);
    const board = { x: 0, y: 0, width, height };
    const ranked = candidates.flatMap((points) => {
      if (!routeClear(points, context, connector.from.node, connector.to.node)) return [];
      const channels = channelsForRoute(points, context.channels);
      if (!routeCovered(points, channels, context, connector.from.node, connector.to.node)) return [];
      const label = connector.label ? placeConnectorLabel(connector.label, points, context.envelopes, reservedLabels, board) : undefined;
      if (connector.label && !label) return [];
      return [{ points, channels, label, cost: routeCost(points, channels, solved) }];
    }).sort((a, b) => a.cost - b.cost);
    const choice = ranked[0];
    const points = choice?.points ?? candidates.at(-1)!;
    const channels = choice?.channels ?? channelsForRoute(points, context.channels);
    const channelIds = channels.map(({ id }) => id);
    const label = choice?.label ?? (connector.label ? fallbackConnectorLabel(connector.label, points, board) : undefined);
    if (label) reservedLabels.push(label);
    for (const channel of channels) channel.used += 1;
    solved.push({
      id: connector.id,
      from: connector.from.node,
      to: connector.to.node,
      fromPin: `${connector.from.node}.${fromSide}`,
      toPin: `${connector.to.node}.${toSide}`,
      points,
      ...(label ? { label } : {}),
      ...(connector.tone ? { tone: connector.tone } : {}),
      channelIds,
    });
  });
  return solved;
}

function routeCandidates(start: BoardPoint, end: BoardPoint, from: AnchorName, to: AnchorName, width: number, height: number, padding: number, index: number): BoardPoint[][] {
  const middleX = (start.x + end.x) / 2;
  const middleY = (start.y + end.y) / 2;
  const outerY = height - padding / 2 - 10 - index * 3;
  const outerX = width - padding / 2 - 10 - index * 3;
  const startLead = lead(start, from, 12);
  const endLead = lead(end, to, 12);
  return [
    ...(start.x === end.x || start.y === end.y ? [[start, end]] : []),
    [start, { x: start.x, y: end.y }, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end],
    [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end],
    [start, startLead, { x: startLead.x, y: outerY }, { x: endLead.x, y: outerY }, endLead, end],
    [start, startLead, { x: outerX, y: startLead.y }, { x: outerX, y: endLead.y }, endLead, end],
  ].map(compactPoints).filter((points) => validEndpointDirections(points, from, to));
}

function validEndpointDirections(points: BoardPoint[], from: AnchorName, to: AnchorName) {
  if (points.length < 2) return false;
  const departure = { x: points[1]!.x - points[0]!.x, y: points[1]!.y - points[0]!.y };
  const approach = { x: points.at(-1)!.x - points.at(-2)!.x, y: points.at(-1)!.y - points.at(-2)!.y };
  const sourceDirection = directionFor(from);
  const targetDirection = directionFor(to);
  return departure.x * sourceDirection.x + departure.y * sourceDirection.y > 0 && approach.x * targetDirection.x + approach.y * targetDirection.y < 0;
}

function routeClear(points: BoardPoint[], context: PlacementContext, from: string, to: string) {
  return points.slice(1).every((point, index) => context.envelopes.every((envelope) => belongsToContext(envelope.owner, from, context) || belongsToContext(envelope.owner, to, context) || !segmentIntersects(points[index]!, point, envelope)));
}

function channelsForRoute(points: BoardPoint[], channels: RouteChannel[]) {
  return channels.filter((channel) => points.some((point, pointIndex) => pointIndex > 0 && containsPoint(channel, midpoint(points[pointIndex - 1]!, point))));
}

function routeCovered(points: BoardPoint[], channels: RouteChannel[], context: PlacementContext, from: string, to: string) {
  const endpointBounds = [
    ...context.elements.filter(({ id }) => id === from || id === to).map(({ bounds }) => bounds),
    ...context.canvases.flatMap(({ primitives }) => primitives.filter(({ id }) => id === from || id === to).map(({ bounds }) => bounds)),
    ...context.canvases.filter((canvas) => canvas.primitives.some(({ id }) => id === from || id === to)).map(({ bounds }) => bounds),
  ];
  return points.slice(1).every((point, index) => {
    const center = midpoint(points[index]!, point);
    return channels.some((channel) => containsPoint(channel, center)) || endpointBounds.some((bounds) => containsPoint(bounds, center));
  });
}

function routeCost(points: BoardPoint[], channels: RouteChannel[], solved: BoardConnector[]) {
  const length = points.slice(1).reduce((total, point, index) => total + distance(points[index]!, point), 0);
  const bends = Math.max(0, points.length - 2);
  const congestion = channels.reduce((total, channel) => total + channel.used / Math.max(1, channel.capacity), 0);
  const crossings = solved.reduce((total, connector) => total + routeCrossings(points, connector.points), 0);
  return length + bends * 18 + congestion * 120 + crossings * 1000;
}

function routeCrossings(first: BoardPoint[], second: BoardPoint[]) {
  let total = 0;
  for (let a = 1; a < first.length; a += 1) for (let b = 1; b < second.length; b += 1) if (orthogonalSegmentsCross(first[a - 1]!, first[a]!, second[b - 1]!, second[b]!)) total += 1;
  return total;
}

function orthogonalSegmentsCross(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const firstHorizontal = a.y === b.y;
  const secondHorizontal = c.y === d.y;
  if (firstHorizontal === secondHorizontal) return false;
  const horizontal = firstHorizontal ? [a, b] : [c, d];
  const vertical = firstHorizontal ? [c, d] : [a, b];
  return vertical[0]!.x > Math.min(horizontal[0]!.x, horizontal[1]!.x) && vertical[0]!.x < Math.max(horizontal[0]!.x, horizontal[1]!.x) && horizontal[0]!.y > Math.min(vertical[0]!.y, vertical[1]!.y) && horizontal[0]!.y < Math.max(vertical[0]!.y, vertical[1]!.y);
}

function buildChannels(envelopes: CollisionEnvelope[], width: number, height: number, padding: number): RouteChannel[] {
  const occupiedRight = Math.max(...envelopes.map((envelope) => envelope.x + envelope.width), padding);
  const occupiedBottom = Math.max(...envelopes.map((envelope) => envelope.y + envelope.height), padding);
  const channels: RouteChannel[] = [
    channel("channel.outer.top", "horizontal", 0, 0, width, padding),
    channel("channel.outer.bottom", "horizontal", 0, height - padding, width, padding),
    channel("channel.outer.left", "vertical", 0, 0, padding, height),
    channel("channel.outer.right", "vertical", width - padding, 0, padding, height),
    channel("channel.free.bottom", "horizontal", 0, occupiedBottom, width, Math.max(0, height - padding - occupiedBottom)),
    channel("channel.free.right", "vertical", occupiedRight, 0, Math.max(0, width - padding - occupiedRight), height),
  ];
  for (let first = 0; first < envelopes.length; first += 1) for (let second = first + 1; second < envelopes.length; second += 1) {
    const a = envelopes[first]!;
    const b = envelopes[second]!;
    const y1 = Math.max(a.y, b.y);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    if (y2 > y1 && a.x + a.width <= b.x) channels.push(channel(`channel.v.${a.owner}.${b.owner}`, "vertical", a.x + a.width, y1, b.x - a.x - a.width, y2 - y1));
    else if (y2 > y1 && b.x + b.width <= a.x) channels.push(channel(`channel.v.${b.owner}.${a.owner}`, "vertical", b.x + b.width, y1, a.x - b.x - b.width, y2 - y1));
    if (a.y + a.height <= b.y) channels.push(channel(`channel.h.${a.owner}.${b.owner}`, "horizontal", 0, a.y + a.height, width, b.y - a.y - a.height));
    else if (b.y + b.height <= a.y) channels.push(channel(`channel.h.${b.owner}.${a.owner}`, "horizontal", 0, b.y + b.height, width, a.y - b.y - b.height));
  }
  return uniqueChannels(channels.filter(({ width: channelWidth, height: channelHeight }) => channelWidth > 0 && channelHeight > 0));
}

function pinsFor(owner: string, bounds: BoardRect): SolvedPin[] {
  return (["top", "right", "bottom", "left"] as const).map((side) => ({ id: `${owner}.${side}`, owner, side, point: pointFor(bounds, side), direction: directionFor(side) }));
}

function pointFor(bounds: BoardRect, side: AnchorName): BoardPoint {
  if (side === "top") return { x: bounds.x + bounds.width / 2, y: bounds.y };
  if (side === "bottom") return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
  if (side === "left") return { x: bounds.x, y: bounds.y + bounds.height / 2 };
  if (side === "center") return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
}

function directionFor(side: AnchorName): BoardPoint {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "bottom") return { x: 0, y: 1 };
  if (side === "left") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function labelBounds(label: string, bounds: BoardRect): BoardRect {
  const available = Math.max(1, bounds.width - 24);
  const longestWord = Math.max(...label.split(/\s+/).map(measureText));
  const width = Math.max(longestWord, Math.min(available, measureText(label)));
  const lines = wrapText(label, available).length;
  const height = lines * 18;
  return { x: bounds.x + (bounds.width - width) / 2, y: bounds.y + (bounds.height - height) / 2, width, height };
}

function placeConnectorLabel(text: string, points: BoardPoint[], envelopes: CollisionEnvelope[], reserved: BoardRect[], board: BoardRect) {
  const width = measureText(text) + 12;
  const height = 20;
  const segments = points.slice(1).map((point, index) => ({ a: points[index]!, b: point })).sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b));
  for (const segment of segments) {
    const center = midpoint(segment.a, segment.b);
    const horizontal = Math.abs(segment.a.x - segment.b.x) >= Math.abs(segment.a.y - segment.b.y);
    const candidates = [0, 14, -14, 28, -28].map((offset) => ({
      text,
      x: center.x - width / 2 + (horizontal ? 0 : offset),
      y: center.y - height / 2 + (horizontal ? offset : 0),
      width,
      height,
    }));
    const available = candidates.find((rect) => containsRect(board, rect) && envelopes.every((envelope) => !intersects(rect, envelope)) && reserved.every((label) => !intersects(rect, label)));
    if (available) return available;
  }
  return undefined;
}

function fallbackConnectorLabel(text: string, points: BoardPoint[], board: BoardRect) { const width = measureText(text) + 12; const height = 20; const center = midpoint(points[0]!, points.at(-1)!); return { text, x: Math.max(0, Math.min(board.width - width, center.x - width / 2)), y: Math.max(0, Math.min(board.height - height, center.y - height / 2)), width, height }; }

function tracksFor(envelopes: CollisionEnvelope[], axis: "x" | "y"): BoardTrack[] {
  const values = [...new Set(envelopes.map((envelope) => envelope[axis]))].sort((a, b) => a - b);
  return values.map((position, index) => ({ id: `${axis === "x" ? "column" : "row"}.${index}`, index, position, size: Math.max(...envelopes.filter((envelope) => envelope[axis] === position).map((envelope) => axis === "x" ? envelope.width : envelope.height), 0) }));
}

function gridColumns(node: VisualNode, strategy: Strategy, maxWidth: number, count: number) { return strategy === "alternate_spans" ? Math.max(1, Math.min(count, Math.floor(maxWidth / 200))) : Math.max(1, node.layout?.columns ?? Math.ceil(Math.sqrt(count))); }
function lead(point: BoardPoint, side: AnchorName, amount: number): BoardPoint { const direction = directionFor(side); return { x: point.x + direction.x * amount, y: point.y + direction.y * amount }; }
function compactPoints(points: BoardPoint[]) { return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y); }
function midpoint(a: BoardPoint, b: BoardPoint) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function distance(a: BoardPoint, b: BoardPoint) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function measureText(value: string) { return Math.max(24, value.length * 7.2); }
function wrapText(value: string, width: number) { const limit = Math.max(1, Math.floor(width / 7.2)); const lines: string[] = []; let line = ""; for (const word of value.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && next.length > limit) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines.length ? lines : [""]; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function gapFor(value: VisualValue | undefined) { if (typeof value === "number") return value; return ({ "$space.xs": 8, "$space.sm": 12, "$space.md": 20, "$space.lg": 32, "$space.xl": 48 } as Record<string, number>)[String(value)] ?? DEFAULT_GAP; }
function countNodes(node: VisualNode): number { return 1 + (node.children?.reduce((total, child) => total + countNodes(child), 0) ?? 0); }
function inflate(rect: BoardRect, amount: number): BoardRect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }; }
function containsPoint(rect: BoardRect, point: BoardPoint) { return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height; }
function containsRect(outer: BoardRect, inner: BoardRect) { return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height; }
function intersects(a: BoardRect, b: BoardRect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
function segmentIntersects(a: BoardPoint, b: BoardPoint, rect: BoardRect) { return intersects({ x: Math.min(a.x, b.x) - 0.5, y: Math.min(a.y, b.y) - 0.5, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 }, rect); }
function channel(id: string, axis: RouteChannel["axis"], x: number, y: number, width: number, height: number): RouteChannel { return { id, axis, x, y, width, height, capacity: 16, used: 0 }; }
function uniqueChannels(channels: RouteChannel[]) { const seen = new Set<string>(); return channels.filter(({ id }) => !seen.has(id) && !!seen.add(id)); }
function candidateCost(strategy: Strategy, scene: BoardScene, crossings: number) { return STRATEGIES.indexOf(strategy) * 1_000_000 + scene.board.height * 10 + crossings * 1000; }
function issue(code: LayoutViolationCode | "layout.no_valid_candidate" | "layout.resource_limit", message: string): LayoutDiagnostic { return { code, message, severity: "error" }; }
function dedupeDiagnostics(diagnostics: LayoutDiagnostic[]) { const seen = new Set<string>(); return diagnostics.filter(({ code, elementIds }) => { const key = `${code}:${elementIds?.join(",") ?? ""}`; return !seen.has(key) && !!seen.add(key); }); }
function belongsTo(elementId: string, ownerId: string, elements: SolvedElement[]) { let current = elements.find(({ id }) => id === elementId); while (current) { if (current.id === ownerId) return true; current = current.parent ? elements.find(({ id }) => id === current!.parent) : undefined; } return false; }
function belongsToContext(elementId: string, ownerId: string, context: PlacementContext) { return belongsTo(elementId, ownerId, context.elements) || context.canvases.some((canvas) => canvas.owner === elementId && canvas.primitives.some(({ id }) => id === ownerId)); }

function validateCanvasResources(root: VisualNode): LayoutDiagnostic | undefined {
  const visit = (node: VisualNode, insideCanvas: boolean, depth: number): LayoutDiagnostic | undefined => {
    const canvas = insideCanvas || node.kind === "canvas" || node.layout?.kind === "canvas";
    if (!insideCanvas && canvas && expandedCanvasCount(node) > MAX_CANVAS_PRIMITIVES) return issue("layout.resource_limit", `Canvas ${node.id} exceeds ${MAX_CANVAS_PRIMITIVES} expanded primitives.`);
    if (canvas && depth > MAX_CANVAS_DEPTH) return issue("layout.resource_limit", `Canvas nesting exceeds ${MAX_CANVAS_DEPTH} levels.`);
    if (canvas && node.kind === "repeat" && numericProp(node, "count", 0) > MAX_CANVAS_REPEAT) return issue("layout.resource_limit", `Canvas repeat ${node.id} exceeds ${MAX_CANVAS_REPEAT} items.`);
    if (canvas && node.kind === "path" && stringProp(node, "d", "").length > MAX_PATH_SOURCE) return issue("layout.resource_limit", `Canvas path ${node.id} exceeds ${MAX_PATH_SOURCE} characters.`);
    if (canvas && node.kind === "image" && Math.max(numericProp(node, "width", 0), numericProp(node, "height", 0)) > MAX_IMAGE_DIMENSION) return issue("layout.resource_limit", `Canvas image ${node.id} exceeds ${MAX_IMAGE_DIMENSION} logical units.`);
    for (const child of node.children ?? []) {
      const diagnostic = visit(child, canvas, canvas ? depth + 1 : 0);
      if (diagnostic) return diagnostic;
    }
    return undefined;
  };
  return visit(root, false, 0);
}

function expandedCanvasCount(node: VisualNode): number { return (node.children ?? []).reduce((total, child) => total + (child.kind === "repeat" ? Math.max(0, Math.floor(numericProp(child, "count", 0))) : child.children?.length ? expandedCanvasCount(child) : 1), 0); }

function solveCanvasPrimitives(nodes: VisualNode[], canvas: BoardRect, context: PlacementContext): CanvasPrimitive[] {
  const primitives: CanvasPrimitive[] = [];
  const append = (node: VisualNode, suffix = "", offsetX = 0, offsetY = 0) => {
    if (primitives.length >= MAX_CANVAS_PRIMITIVES) return;
    if (node.kind === "repeat") {
      const count = Math.max(0, Math.min(MAX_CANVAS_REPEAT, Math.floor(numericProp(node, "count", 0))));
      const kind = stringProp(node, "kind", "circle") as CanvasPrimitive["kind"];
      for (let index = 0; index < count && primitives.length < MAX_CANVAS_PRIMITIVES; index += 1) {
        append({ ...node, id: `${node.id}.${index}`, kind, props: { ...node.props, count: 0 } }, "", numericProp(node, "stepX", 0) * index, numericProp(node, "stepY", 0) * index);
      }
      return;
    }
    const x = canvas.x + numericProp(node, "x", node.layout?.x ?? 0) + offsetX;
    const y = canvas.y + numericProp(node, "y", node.layout?.y ?? 0) + offsetY;
    const width = numericProp(node, "width", node.layout?.width ?? defaultPrimitiveSize(node.kind).width);
    const height = numericProp(node, "height", node.layout?.height ?? defaultPrimitiveSize(node.kind).height);
    const bounds = { x, y, width, height };
    const id = `${node.id}${suffix}`;
    const transform = {
      translateX: numericProp(node, "translateX", 0),
      translateY: numericProp(node, "translateY", 0),
      scaleX: numericProp(node, "scaleX", numericProp(node, "scale", 1)),
      scaleY: numericProp(node, "scaleY", numericProp(node, "scale", 1)),
      rotate: numericProp(node, "rotate", 0),
    };
    const visualBounds = transformedBounds(bounds, transform);
    primitives.push({
      id,
      kind: canvasKind(node.kind),
      bounds,
      visualBounds,
      layer: Math.floor(numericProp(node, "layer", primitives.length)),
      ...(typeof node.props?.clip === "string" ? { clip: node.props.clip } : {}),
      ...(typeof node.props?.mask === "string" ? { mask: node.props.mask } : {}),
      transform,
      pins: pinsFor(id, visualBounds),
      ...(node.props ? { props: node.props } : {}),
    });
    context.bounds.set(id, visualBounds);
    for (const child of node.children ?? []) append(child, suffix, offsetX + numericProp(node, "x", 0), offsetY + numericProp(node, "y", 0));
  };
  for (const node of nodes) append(node);
  return primitives;
}

function solveMotionEnvelopes(timelines: Timeline[], elements: Array<{ id: string; visualBounds: BoardRect }>) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const statesByOwner = new Map<string, Array<{ state: string; bounds: BoardRect }>>();
  for (const timeline of timelines) for (const state of timeline.states) for (const operation of state.operations) {
    if (operation.action === "set") for (const target of operation.targets) {
      const element = byId.get(target);
      if (!element) continue;
      const bounds = {
        x: operation.properties.x === undefined ? element.visualBounds.x + numericValue(operation.properties.translateX, 0) : numericValue(operation.properties.x, element.visualBounds.x),
        y: operation.properties.y === undefined ? element.visualBounds.y + numericValue(operation.properties.translateY, 0) : numericValue(operation.properties.y, element.visualBounds.y),
        width: numericValue(operation.properties.width, element.visualBounds.width),
        height: numericValue(operation.properties.height, element.visualBounds.height),
      };
      const existing = statesByOwner.get(target) ?? [{ state: "base", bounds: element.visualBounds }];
      existing.push({ state: `${timeline.id}.${state.id}`, bounds });
      statesByOwner.set(target, existing);
    }
    if (operation.action === "morph") {
      const from = byId.get(operation.targets[0]);
      const to = byId.get(operation.targets[1]);
      if (!from || !to) continue;
      const bounds = unionRect(from.visualBounds, to.visualBounds);
      statesByOwner.set(to.id, [{ state: `${timeline.id}.${state.id}`, bounds }]);
    }
  }
  return [...statesByOwner.entries()].map(([owner, states]) => ({ id: `${owner}.motion`, owner, states: states.map(({ state }) => state), ...states.reduce((bounds, state) => unionRect(bounds, state.bounds), states[0]!.bounds) }));
}

function numericProp(node: VisualNode, name: string, fallback: number) { return numericValue(node.props?.[name], fallback); }
function stringProp(node: VisualNode, name: string, fallback: string) { const value = node.props?.[name]; return typeof value === "string" ? value : fallback; }
function numericValue(value: VisualValue | undefined, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function defaultPrimitiveSize(kind: VisualNode["kind"]): Size { if (kind === "text") return { width: 80, height: 20 }; if (kind === "line" || kind === "path") return { width: 80, height: 2 }; if (kind === "circle") return { width: 24, height: 24 }; return { width: 48, height: 48 }; }
function canvasKind(kind: VisualNode["kind"]): CanvasPrimitive["kind"] { return (["text", "box", "circle", "line", "path", "image", "icon", "group"] as string[]).includes(kind) ? kind as CanvasPrimitive["kind"] : "group"; }
function unionRect(a: BoardRect, b: BoardRect): BoardRect { const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y); return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }; }
function transformedBounds(bounds: BoardRect, transform: { translateX: number; translateY: number; scaleX: number; scaleY: number; rotate: number }): BoardRect { const width = Math.abs(bounds.width * transform.scaleX); const height = Math.abs(bounds.height * transform.scaleY); const radians = transform.rotate * Math.PI / 180; const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)); const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)); return { x: bounds.x + transform.translateX + (bounds.width - rotatedWidth) / 2, y: bounds.y + transform.translateY + (bounds.height - rotatedHeight) / 2, width: rotatedWidth, height: rotatedHeight }; }
