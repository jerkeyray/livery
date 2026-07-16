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
import type { AnchorName, Connector, LayoutKind, Timeline, VisualConstraint, VisualDocument, VisualNode, VisualValue } from "./visual.js";
import { canonicalTheme, resolveComponentRecipe, resolveTheme, resolveVisualValue, type LiveryTheme, type TokenOverrides } from "./theme.js";
import { measureVisualText, measureVisualTextBlock } from "./text-metrics.js";

export type PinboardOptions = { width?: number; maxCandidates?: number; maxElements?: number; theme?: LiveryTheme; tokenOverrides?: TokenOverrides };

type Strategy = LayoutAttempt["strategy"];
type Size = { width: number; height: number };
type BuiltCandidate = { scene: BoardScene; routingDiagnostics: LayoutDiagnostic[]; columns: number; topologyDeviation: number };
type PlacementContext = {
  elements: SolvedElement[];
  envelopes: CollisionEnvelope[];
  channels: RouteChannel[];
  bounds: Map<string, BoardRect>;
  minimumGap: number;
  rootColumnGap: number;
  rootRowGap: number;
  canvases: SolvedCanvas[];
  theme: LiveryTheme;
  tokens: TokenOverrides;
};

const STRATEGIES: Strategy[] = ["requested", "expanded_tracks", "alternate_spans", "balanced_grid", "vertical_reflow", "increased_height"];
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
const ROUTE_BEAM_WIDTH = 64;
const MAX_ROUTE_OPTIONS = 96;
const MAX_LABEL_OPTIONS = 3;
const ENDPOINT_LEAD = 12;

export function solvePinboard(document: VisualDocument, options: PinboardOptions = {}): LayoutResult {
  const width = Math.max(MIN_WIDTH, Math.floor(options.width ?? DEFAULT_WIDTH));
  const attempts: LayoutAttempt[] = [];
  const successes: Array<{ scene: BoardScene; report: ReturnType<typeof validateBoardScene>; attempt: LayoutAttempt }> = [];
  const strategies = STRATEGIES.slice(0, Math.max(1, options.maxCandidates ?? STRATEGIES.length));
  const nodeCount = countNodes(document.root);
  if (nodeCount > (options.maxElements ?? MAX_ELEMENTS)) {
    return { ok: false, diagnostics: [issue("layout.resource_limit", `Expanded board contains ${nodeCount} elements; limit is ${options.maxElements ?? MAX_ELEMENTS}.`)], attempts };
  }
  const canvasDiagnostic = validateCanvasResources(document.root);
  if (canvasDiagnostic) return { ok: false, diagnostics: [canvasDiagnostic], attempts };
  const solvedIds = collectSolvedIds(document.root);
  const missingEndpoints = document.connectors.flatMap((connector) => [connector.from.node, connector.to.node]
    .filter((endpoint) => !solvedIds.has(endpoint))
    .map((endpoint) => issue("layout.missing_solved_endpoint", `Connector ${connector.id} has no solved endpoint for ${endpoint}.`, [connector.id, endpoint])));
  if (missingEndpoints.length) return { ok: false, diagnostics: missingEndpoints, attempts };

  const theme = options.theme ?? canonicalTheme;
  const tokens = resolveTheme(theme, options.tokenOverrides);
  for (const strategy of strategies) {
    if (!strategyFits(document, width, strategy, theme, tokens)) continue;
    const built = buildCandidate(document, width, strategy, theme, tokens);
    const scene = built.scene;
    const baseReport = validateBoardScene(scene);
    const constraintDiagnostics = validateSolvedConstraints(document.constraints, scene, tokens);
    const report = {
      ...baseReport,
      valid: baseReport.valid && built.routingDiagnostics.length === 0 && constraintDiagnostics.length === 0,
      diagnostics: [...built.routingDiagnostics, ...baseReport.diagnostics, ...constraintDiagnostics],
      metrics: { ...baseReport.metrics, topologyDeviation: built.topologyDeviation },
    };
    const attempt: LayoutAttempt = { strategy, width: scene.board.width, height: scene.board.height, diagnostics: report.diagnostics, columns: built.columns, topologyDeviation: built.topologyDeviation, metrics: report.metrics };
    attempts.push(attempt);
    if (report.valid) successes.push({ scene, report, attempt });
    if (report.valid) break;
  }
  const selected = successes.sort(compareCandidates)[0];
  if (selected) {
    selected.attempt.selected = true;
    return { ok: true, scene: selected.scene, report: selected.report, attempts };
  }
  return {
    ok: false,
    diagnostics: [issue("layout.no_valid_candidate", `No valid board layout was found at ${width}px.`), ...dedupeDiagnostics(attempts.flatMap(({ diagnostics }) => diagnostics))],
    attempts,
  };
}

function buildCandidate(document: VisualDocument, width: number, strategy: Strategy, theme: LiveryTheme, tokens: TokenOverrides): BuiltCandidate {
  const padding = width <= 480 ? COMPACT_PADDING : PADDING;
  const availableWidth = width - padding * 2;
  const minimumGap = MIN_GAP;
  const rootColumnGap = Math.max(gapFor(document.root.layout?.gap, tokens), ...document.connectors.map((connector) => {
    if (!connector.label) return MIN_GAP;
    const endpointPadding = Math.max(endpointClearance(document.root, connector.from.node), endpointClearance(document.root, connector.to.node));
    return measureVisualText(connector.label, { fontSize: tokenNumber(tokens, "type.caption", 10), fontWeight: 600 }) + 14 + endpointPadding * 2;
  }));
  const rootRowGap = Math.max(gapFor(document.root.layout?.gap, tokens), ...document.connectors.map((connector) => {
    if (!connector.label) return MIN_GAP;
    const endpointPadding = Math.max(endpointClearance(document.root, connector.from.node), endpointClearance(document.root, connector.to.node));
    return 18 + 12 + endpointPadding * 2;
  })) + routingGutterExpansion(strategy, document.connectors.length);
  const context: PlacementContext = { elements: [], envelopes: [], channels: [], bounds: new Map(), minimumGap, rootColumnGap, rootRowGap, canvases: [], theme, tokens };
  const rootSize = measure(document.root, availableWidth, strategy, minimumGap, true, rootColumnGap, rootRowGap, theme, tokens);
  const rootWidth = Math.min(rootSize.width, availableWidth);
  const rootX = padding + (availableWidth - rootWidth) / 2;
  const routeReserve = routingReserve(document.connectors, tokens);
  const constraintReserve = document.constraints.reduce((total, constraint) => total + constraintSpacing(constraint), 0);
  const height = Math.ceil(Math.max(120, rootSize.height) + padding * 2 + routeReserve + constraintReserve);
  place(document.root, rootX, padding, rootWidth, rootSize.height, undefined, context, strategy, true);
  for (let pass = 0; pass < 8; pass += 1) applyConstraints(document.constraints, context);
  declareConstraintOverlaps(document.constraints, context);
  context.channels.push(...buildChannels(context.envelopes, width, height, padding));
  const routing = routeConnectors(document.connectors, context, width, height, padding);
  const connectors = routing.ok ? routing.connectors : [];
  const timelineEnvelopes = solveMotionEnvelopes(document.timelines, [...context.elements, ...context.canvases.flatMap(({ primitives }) => primitives)]);
  const contentBottom = Math.max(
    ...context.elements.map(({ visualBounds }) => visualBounds.y + visualBounds.height),
    ...context.canvases.flatMap(({ primitives }) => primitives.map(({ visualBounds }) => visualBounds.y + visualBounds.height)),
    ...connectors.flatMap(({ points, label }) => [...points.map(({ y }) => y), ...(label ? [label.y + label.height] : [])]),
    ...timelineEnvelopes.map(({ y, height }) => y + height),
    padding + 72,
  );
  const croppedHeight = Math.min(height, Math.ceil(contentBottom + padding));
  const channels = context.channels.map((routeChannel) => clipChannel(routeChannel, width, croppedHeight)).filter((routeChannel) => routeChannel.width > 0 && routeChannel.height > 0);
  const scene: BoardScene = {
    type: "livery.board-scene",
    version: "0.1",
    id: document.id,
    ...(document.title ? { title: document.title } : {}),
    board: {
      width,
      height: croppedHeight,
      padding,
      gutter: gapFor(document.root.layout?.gap, tokens),
      columns: tracksFor(context.envelopes, "x"),
      rows: tracksFor(context.envelopes, "y"),
      channels,
    },
    elements: context.elements,
    connectors,
    canvases: context.canvases,
    envelopes: context.envelopes,
    timelineEnvelopes,
    readingOrder: context.elements.map(({ id }) => id),
  };
  const columns = rootColumnCount(scene);
  const topologyDeviation = Math.abs(requestedRootColumns(document.root) - columns);
  return { scene, routingDiagnostics: routing.ok ? [] : routing.diagnostics, columns, topologyDeviation };
}

function constraintSpacing(constraint: VisualConstraint) {
  if (constraint.kind === "near" && typeof constraint.distance === "number") return constraint.distance;
  if (constraint.kind === "distribute" && typeof constraint.gap === "number") return constraint.gap;
  return 0;
}

function applyConstraints(constraints: VisualConstraint[], context: PlacementContext) {
  for (const constraint of constraints) {
    if (constraint.kind === "near") {
      const first = context.bounds.get(constraint.first);
      const second = context.bounds.get(constraint.second);
      if (!first || !second) continue;
      const distance = visualNumber(constraint.distance, context.tokens, context.minimumGap);
      const vertical = Math.abs(center(second).y - center(first).y) >= Math.abs(center(second).x - center(first).x);
      if (vertical) {
        const direction = center(second).y >= center(first).y ? 1 : -1;
        const desired = direction > 0 ? first.y + first.height + distance : first.y - distance - second.height;
        shiftSolvedTarget(constraint.second, 0, desired - second.y, context);
      } else {
        const direction = center(second).x >= center(first).x ? 1 : -1;
        const desired = direction > 0 ? first.x + first.width + distance : first.x - distance - second.width;
        shiftSolvedTarget(constraint.second, desired - second.x, 0, context);
      }
      continue;
    }
    if (constraint.kind === "align") {
      const reference = context.bounds.get(constraint.targets[0]!);
      if (!reference) continue;
      const edge = constraint.edge ?? "center";
      const referenceCoordinate = rectCoordinate(reference, constraint.axis, edge);
      for (const target of constraint.targets.slice(1)) {
        const bounds = context.bounds.get(target);
        if (!bounds) continue;
        const delta = referenceCoordinate - rectCoordinate(bounds, constraint.axis, edge);
        shiftSolvedTarget(target, constraint.axis === "x" ? delta : 0, constraint.axis === "y" ? delta : 0, context);
      }
      continue;
    }
    if (constraint.kind === "distribute") {
      const entries = constraint.targets.flatMap((id) => {
        const bounds = context.bounds.get(id);
        return bounds ? [{ id, bounds }] : [];
      }).sort((a, b) => a.bounds[constraint.axis] - b.bounds[constraint.axis]);
      if (entries.length < 3) continue;
      const gap = constraint.gap === undefined
        ? undefined
        : visualNumber(constraint.gap, context.tokens, context.minimumGap);
      const first = entries[0]!.bounds;
      const last = entries.at(-1)!.bounds;
      const totalSize = entries.reduce((total, { bounds }) => total + (constraint.axis === "x" ? bounds.width : bounds.height), 0);
      const span = constraint.axis === "x" ? last.x + last.width - first.x : last.y + last.height - first.y;
      const resolvedGap = gap ?? (span - totalSize) / Math.max(1, entries.length - 1);
      let cursor = constraint.axis === "x" ? first.x : first.y;
      for (const entry of entries) {
        const current = entry.bounds[constraint.axis];
        const delta = cursor - current;
        shiftSolvedTarget(entry.id, constraint.axis === "x" ? delta : 0, constraint.axis === "y" ? delta : 0, context);
        const shifted = context.bounds.get(entry.id)!;
        cursor += (constraint.axis === "x" ? shifted.width : shifted.height) + resolvedGap;
      }
      continue;
    }
    const child = context.bounds.get(constraint.child);
    const container = context.bounds.get(constraint.container);
    if (!child || !container) continue;
    const padding = visualNumber(constraint.padding, context.tokens, 0);
    const allowed = { x: container.x + padding, y: container.y + padding, width: Math.max(0, container.width - padding * 2), height: Math.max(0, container.height - padding * 2) };
    const x = Math.min(Math.max(child.x, allowed.x), allowed.x + allowed.width - child.width);
    const y = Math.min(Math.max(child.y, allowed.y), allowed.y + allowed.height - child.height);
    shiftSolvedTarget(constraint.child, x - child.x, y - child.y, context);
  }
}

function shiftSolvedTarget(target: string, dx: number, dy: number, context: PlacementContext) {
  if (dx === 0 && dy === 0) return;
  const movedElements = new Set(context.elements.filter((element) => element.id === target || belongsTo(element.id, target, context.elements)).map(({ id }) => id));
  const primitiveTarget = context.canvases.flatMap(({ primitives }) => primitives).find(({ id }) => id === target);
  const movedPrimitives = new Set<string>();
  if (primitiveTarget) for (const primitive of context.canvases.flatMap(({ primitives }) => primitives)) {
    let current: CanvasPrimitive | undefined = primitive;
    while (current) {
      if (current.id === target) { movedPrimitives.add(primitive.id); break; }
      current = current.parent ? context.canvases.flatMap(({ primitives }) => primitives).find(({ id }) => id === current!.parent) : undefined;
    }
  }
  for (const element of context.elements) if (movedElements.has(element.id)) {
    element.bounds = shiftRect(element.bounds, dx, dy);
    element.visualBounds = shiftRect(element.visualBounds, dx, dy);
    if (element.labelBounds) element.labelBounds = shiftRect(element.labelBounds, dx, dy);
    element.pins = pinsFor(element.id, element.visualBounds);
  }
  for (const canvas of context.canvases) {
    if (movedElements.has(canvas.owner)) canvas.bounds = shiftRect(canvas.bounds, dx, dy);
    for (const primitive of canvas.primitives) if (movedElements.has(canvas.owner) || movedPrimitives.has(primitive.id)) {
      primitive.bounds = shiftRect(primitive.bounds, dx, dy);
      primitive.visualBounds = shiftRect(primitive.visualBounds, dx, dy);
      primitive.pins = pinsFor(primitive.id, primitive.visualBounds);
      movedPrimitives.add(primitive.id);
    }
  }
  const movedOwners = new Set([...movedElements, ...movedPrimitives]);
  for (const envelope of context.envelopes) if (movedOwners.has(envelope.owner)) Object.assign(envelope, shiftRect(envelope, dx, dy));
  for (const id of movedOwners) {
    const bounds = context.bounds.get(id);
    if (bounds) context.bounds.set(id, shiftRect(bounds, dx, dy));
  }
}

function declareConstraintOverlaps(constraints: VisualConstraint[], context: PlacementContext) {
  for (const constraint of constraints) {
    if (constraint.kind !== "inside") continue;
    const group = `inside:${constraint.child}:${constraint.container}`;
    for (const envelope of context.envelopes) {
      if (envelope.owner !== constraint.child && envelope.owner !== constraint.container) continue;
      envelope.overlapGroups = [...new Set([...(envelope.overlapGroups ?? []), group])];
    }
  }
}

function rectCoordinate(rect: BoardRect, axis: "x" | "y", edge: "start" | "center" | "end") {
  const size = axis === "x" ? rect.width : rect.height;
  return rect[axis] + (edge === "start" ? 0 : edge === "center" ? size / 2 : size);
}

function center(rect: BoardRect) { return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; }
function shiftRect<T extends BoardRect>(rect: T, dx: number, dy: number): T { return { ...rect, x: rect.x + dx, y: rect.y + dy }; }

function alignedPlacement(position: number, available: number, requested: number, align: NonNullable<VisualNode["layout"]>["align"]) {
  if (align === "stretch") return { position, size: available };
  if (align === "start") return { position, size: requested };
  if (align === "end") return { position: position + available - requested, size: requested };
  return { position: position + (available - requested) / 2, size: requested };
}

function distribution(
  available: number,
  sizes: number[],
  baseGap: number,
  mode: NonNullable<VisualNode["layout"]>["distribute"],
) {
  if (sizes.length === 0) return { offset: 0, gap: baseGap };
  const occupied = sum(sizes) + baseGap * Math.max(0, sizes.length - 1);
  const extra = Math.max(0, available - occupied);
  if (mode === "center") return { offset: extra / 2, gap: baseGap };
  if (mode === "end") return { offset: extra, gap: baseGap };
  if (mode === "between" && sizes.length > 1) return { offset: 0, gap: baseGap + extra / (sizes.length - 1) };
  if (mode === "around") {
    const share = extra / sizes.length;
    return { offset: share / 2, gap: baseGap + share };
  }
  return { offset: 0, gap: baseGap };
}

function measure(
  node: VisualNode,
  maxWidth: number,
  strategy: Strategy,
  minimumGap: number,
  root = false,
  rootColumnGap = minimumGap,
  rootRowGap = minimumGap,
  theme: LiveryTheme = canonicalTheme,
  tokens: TokenOverrides = resolveTheme(theme),
): Size {
  if (!node.children?.length) {
    const recipe = resolveComponentRecipe(node.kind, node.variant, theme);
    const geometry = recipe.geometry;
    const horizontalSpace = (geometry?.paddingX ?? 16) * 2 + (hasComponentDetail(recipe) ? (geometry?.detailWidth ?? 24) + (geometry?.labelGap ?? 10) : 0);
    const minimumWidth = geometry?.minWidth ?? 120;
    const label = node.label ?? node.id;
    const fontSize = visualNumber(node.style?.fontSize ?? recipe.typography?.fontSize, tokens, tokenNumber(tokens, "type.body", 13));
    const lineHeight = Math.max(visualNumber(recipe.typography?.lineHeight, tokens, Math.ceil(fontSize * 1.38)), Math.ceil(fontSize * 1.1));
    const fontWeight = Number(resolveVisualValue(node.style?.fontWeight ?? recipe.typography?.fontWeight, tokens) ?? 650);
    const measuredLabelWidth = measureVisualText(label, { fontSize, fontWeight });
    const subtitleFontSize = tokenNumber(tokens, "type.caption", 10);
    const subtitleWeight = 500;
    const subtitleWidth = node.subtitle ? measureVisualText(node.subtitle, { fontSize: subtitleFontSize, fontWeight: subtitleWeight }) : 0;
    const recipeMaximumWidth = Math.max(minimumWidth, geometry?.maxWidth ?? 184);
    const authoredWidth = numericOptional(node.props?.width);
    const authoredHeight = numericOptional(node.props?.height);
    const preferredWidth = node.layout?.width ?? authoredWidth ?? Math.max(minimumWidth, Math.min(Math.max(measuredLabelWidth, subtitleWidth) + horizontalSpace, recipeMaximumWidth));
    const width = Math.min(preferredWidth, maxWidth);
    const textWidth = Math.max(24, width - horizontalSpace);
    const labelHeight = measureVisualTextBlock(label, textWidth, { fontSize, fontWeight, lineHeight }).height;
    const subtitleLineHeight = Math.max(Math.ceil(subtitleFontSize * 1.35), 14);
    const subtitleHeight = node.subtitle ? measureVisualTextBlock(node.subtitle, textWidth, { fontSize: subtitleFontSize, fontWeight: subtitleWeight, lineHeight: subtitleLineHeight }).height + 4 : 0;
    const contentHeight = labelHeight + subtitleHeight + (geometry?.paddingY ?? 14) * 2;
    return { width, height: node.layout?.height ?? authoredHeight ?? Math.max(geometry?.minHeight ?? NODE_HEIGHT, contentHeight) };
  }
  if (node.kind === "canvas" || node.layout?.kind === "canvas") {
    return { width: Math.min(maxWidth, node.layout?.width ?? numericProp(node, "width", 240)), height: node.layout?.height ?? numericProp(node, "height", 160) };
  }
  const frame = node.kind === "frame";
  const framePadding = frame ? visualNumber(node.props?.padding, tokens, tokenNumber(tokens, "space.lg", 24)) : 0;
  const frameHeader = frame && node.label ? (node.subtitle ? 44 : 30) : 0;
  const innerMaxWidth = Math.max(1, maxWidth - framePadding * 2);
  const declaredGap = gapFor(node.layout?.gap, tokens);
  const columnGap = Math.max(root ? rootColumnGap : minimumGap, declaredGap);
  const rowGap = Math.max(root ? rootRowGap : minimumGap, declaredGap);
  const children = node.children.map((child) => measure(child, innerMaxWidth, strategy, minimumGap, false, rootColumnGap, rootRowGap, theme, tokens));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, children, innerMaxWidth, columnGap);
  const withFrame = (size: Size): Size => frame ? {
    width: Math.min(maxWidth, visualNumber(node.props?.width, tokens, size.width + framePadding * 2)),
    height: visualNumber(node.props?.height, tokens, size.height + framePadding * 2 + frameHeader),
  } : size;
  if (kind === "column") {
    const intrinsicWidth = Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0));
    const intrinsicHeight = sum(children.map(({ height }) => height)) + rowGap * Math.max(0, children.length - 1);
    return withFrame({
      width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, intrinsicWidth)),
      height: visualNumber(node.layout?.height ?? node.props?.height, tokens, intrinsicHeight),
    });
  }
  if (kind === "grid") {
    const cellWidth = Math.max(...children.map(({ width }) => width), 0);
    const columns = gridColumns(node, strategy, maxWidth, children.length, cellWidth, columnGap);
    const rowHeights = gridRowHeights(children, columns);
    const intrinsicWidth = Math.min(columns, children.length) * cellWidth + columnGap * Math.max(0, Math.min(columns, children.length) - 1);
    const distributedWidth = root && node.layout?.distribute && node.layout.distribute !== "start" ? maxWidth : intrinsicWidth;
    return withFrame({
      width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, distributedWidth)),
      height: visualNumber(node.layout?.height ?? node.props?.height, tokens, sum(rowHeights) + rowGap * Math.max(0, rowHeights.length - 1)),
    });
  }
  if (kind === "stack" || kind === "overlay") {
    const intrinsicWidth = Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0));
    const intrinsicHeight = Math.max(...children.map(({ height }) => height), 0);
    return withFrame({ width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, intrinsicWidth)), height: visualNumber(node.layout?.height ?? node.props?.height, tokens, intrinsicHeight) });
  }
  const intrinsicWidth = sum(children.map(({ width }) => width)) + columnGap * Math.max(0, children.length - 1);
  const distributedWidth = root && node.layout?.distribute && node.layout.distribute !== "start" ? maxWidth : intrinsicWidth;
  return withFrame({
    width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, distributedWidth)),
    height: visualNumber(node.layout?.height ?? node.props?.height, tokens, Math.max(...children.map(({ height }) => height), 0)),
  });
}

function effectiveLayout(kind: LayoutKind, strategy: Strategy, root: boolean, sizes: Size[], maxWidth: number, gap: number): LayoutKind {
  const rowWidth = sum(sizes.map(({ width }) => width)) + gap * Math.max(0, sizes.length - 1);
  if ((strategy === "vertical_reflow" || strategy === "increased_height") && (root || rowWidth > maxWidth)) return "column";
  if ((strategy === "alternate_spans" || strategy === "balanced_grid") && root && (kind === "row" || kind === "grid")) return "grid";
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
    ...(node.label ? { label: node.label, labelBounds: labelBounds(node, own, context.theme, context.tokens) } : {}),
    ...(node.subtitle ? { subtitle: node.subtitle } : {}),
    ...(parent ? { parent } : {}),
    layer: parent ? 1 : 0,
    ...(node.tone ? { tone: node.tone } : {}),
    ...(node.variant ? { variant: node.variant } : {}),
    ...(node.description ? { description: node.description } : {}),
    ...(node.style ? { style: node.style } : {}),
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
  const framePadding = node.kind === "frame" ? visualNumber(node.props?.padding, context.tokens, tokenNumber(context.tokens, "space.lg", 24)) : 0;
  const frameHeader = node.kind === "frame" && node.label ? (node.subtitle ? 44 : 30) : 0;
  const contentX = x + framePadding;
  const contentY = y + framePadding + frameHeader;
  const contentWidth = Math.max(1, width - framePadding * 2);
  const contentHeight = Math.max(1, height - framePadding * 2 - frameHeader);
  const declaredGap = gapFor(node.layout?.gap, context.tokens);
  const columnGap = Math.max(root ? context.rootColumnGap : context.minimumGap, declaredGap);
  const rowGap = Math.max(root ? context.rootRowGap : context.minimumGap, declaredGap);
  const sizes = node.children.map((child) => measure(child, contentWidth, strategy, context.minimumGap, false, context.rootColumnGap, context.rootRowGap, context.theme, context.tokens));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, sizes, contentWidth, columnGap);
  const cellWidth = kind === "grid" ? Math.max(...sizes.map(({ width }) => width), 0) : 0;
  const columns = kind === "grid" ? gridColumns(node, strategy, contentWidth, sizes.length, cellWidth, columnGap) : 1;
  const rowHeights = kind === "grid" ? gridRowHeights(sizes, columns) : [];
  const layoutAlign = node.layout?.align ?? "center";
  const layoutDistribute = node.layout?.distribute ?? "start";
  const rowDistribution = distribution(contentWidth, sizes.map(({ width: childWidth }) => childWidth), columnGap, layoutDistribute);
  const columnDistribution = distribution(contentHeight, sizes.map(({ height: childHeight }) => childHeight), rowGap, layoutDistribute);
  const gridColumnCount = Math.min(columns, sizes.length);
  const gridDistribution = distribution(contentWidth, Array.from({ length: gridColumnCount }, () => cellWidth), columnGap, layoutDistribute);
  let cursorX = contentX + rowDistribution.offset;
  let cursorY = contentY + columnDistribution.offset;
  node.children.forEach((child, index) => {
    const size = sizes[index]!;
    let childX = cursorX;
    let childY = cursorY;
    if (kind === "column") {
      const cross = alignedPlacement(contentX, contentWidth, size.width, layoutAlign);
      childX = cross.position;
      cursorY += size.height + columnDistribution.gap;
      if (layoutAlign === "stretch") size.width = cross.size;
    }
    else if (kind === "grid") {
      const row = Math.floor(index / columns);
      const itemsInRow = Math.min(columns, node.children!.length - row * columns);
      const unusedColumns = columns - itemsInRow;
      const rowOffset = layoutDistribute === "start" ? unusedColumns * (cellWidth + gridDistribution.gap) / 2 : 0;
      const cellX = contentX + gridDistribution.offset + rowOffset + (index % columns) * (cellWidth + gridDistribution.gap);
      const cellY = contentY + sum(rowHeights.slice(0, row)) + row * rowGap;
      const horizontal = alignedPlacement(cellX, cellWidth, size.width, layoutAlign);
      const vertical = alignedPlacement(cellY, rowHeights[row]!, size.height, layoutAlign);
      childX = horizontal.position;
      childY = vertical.position;
      if (layoutAlign === "stretch") { size.width = horizontal.size; size.height = vertical.size; }
    } else if (kind === "stack" || kind === "overlay") {
      const horizontal = alignedPlacement(contentX, contentWidth, size.width, layoutAlign);
      const vertical = alignedPlacement(contentY, contentHeight, size.height, layoutAlign);
      childX = horizontal.position;
      childY = vertical.position;
      if (layoutAlign === "stretch") { size.width = horizontal.size; size.height = vertical.size; }
    } else {
      const cross = alignedPlacement(contentY, contentHeight, size.height, layoutAlign);
      childY = cross.position;
      cursorX += size.width + rowDistribution.gap;
      if (layoutAlign === "stretch") size.height = cross.size;
    }
    place(child, childX, childY, size.width, size.height, node.id, context, strategy);
  });
}

type RouteOption = { connector: BoardConnector; channels: RouteChannel[]; cost: number; pathSignature: string; signature: string };
type RouteTask = { id: string; options: RouteOption[]; alternativeCount: number; directLength: number; endpointDemand: number; sourceDemand: number; pinDemand: number };
type RoutingState = { routes: Map<string, RouteOption>; labels: BoardRect[]; channelUse: Map<string, number>; cost: number; signature: string };
type RoutingResult = { ok: true; connectors: BoardConnector[] } | { ok: false; diagnostics: LayoutDiagnostic[] };

function routeConnectors(connectors: Connector[], context: PlacementContext, width: number, height: number, padding: number): RoutingResult {
  if (!connectors.length) return { ok: true, connectors: [] };
  const board = { x: 0, y: 0, width, height };
  const endpointDemand = new Map<string, number>();
  for (const connector of connectors) for (const endpoint of [connector.from.node, connector.to.node]) endpointDemand.set(endpoint, (endpointDemand.get(endpoint) ?? 0) + 1);
  const maximumEndpointDemand = Math.max(...endpointDemand.values());
  const beamWidth = maximumEndpointDemand >= 3 ? ROUTE_BEAM_WIDTH : connectors.length > 6 ? 16 : 24;
  const optionLimit = maximumEndpointDemand >= 3 ? MAX_ROUTE_OPTIONS : connectors.length > 6 ? 40 : 56;
  const tasks = connectors.map((connector) => routeTask(
    connector,
    context,
    board,
    padding,
    Math.max(endpointDemand.get(connector.from.node) ?? 0, endpointDemand.get(connector.to.node) ?? 0),
    endpointDemand.get(connector.from.node) ?? 0,
    optionLimit,
  ));
  const unroutable = tasks.filter(({ options }) => options.length === 0);
  if (unroutable.length) return { ok: false, diagnostics: unroutable.map(({ id }) => issue("layout.routing_exhausted", `No valid route and label placement is available for connector ${id}.`, [id])) };
  const pinDemand = new Map<string, number>();
  for (const task of tasks) for (const pin of [task.options[0]!.connector.fromPin, task.options[0]!.connector.toPin]) pinDemand.set(pin, (pinDemand.get(pin) ?? 0) + 1);
  for (const task of tasks) task.pinDemand = Math.max(pinDemand.get(task.options[0]!.connector.fromPin) ?? 0, pinDemand.get(task.options[0]!.connector.toPin) ?? 0);
  const ordered = [...tasks].sort((a, b) => b.endpointDemand - a.endpointDemand || b.sourceDemand - a.sourceDemand || b.pinDemand - a.pinDemand || a.directLength - b.directLength || a.alternativeCount - b.alternativeCount || a.id.localeCompare(b.id));
  let beam: RoutingState[] = [{ routes: new Map(), labels: [], channelUse: new Map(), cost: 0, signature: "" }];
  for (let taskIndex = 0; taskIndex < ordered.length; taskIndex += 1) {
    const task = ordered[taskIndex]!;
    const remaining = ordered.slice(taskIndex + 1);
    const next: RoutingState[] = [];
    for (const state of beam) for (const option of task.options) {
      if (option.connector.label && state.labels.some((label) => intersects(label, option.connector.label!))) continue;
      if ([...state.routes.values()].some((selected) => routesConflict(selected.connector, option.connector))) continue;
      const channelUse = new Map(state.channelUse);
      let congestion = 0;
      let exceedsCapacity = false;
      for (const channel of option.channels) {
        const used = (channelUse.get(channel.id) ?? 0) + 1;
        if (used > channel.capacity) { exceedsCapacity = true; break; }
        channelUse.set(channel.id, used);
        congestion += used / Math.max(1, channel.capacity);
      }
      if (exceedsCapacity) continue;
      const routes = new Map(state.routes).set(task.id, option);
      const lookahead = remaining.length ? routeLookahead(routes, option.connector.label ? [...state.labels, option.connector.label] : state.labels, remaining) : { ok: true as const, cost: 0 };
      if (!lookahead.ok) continue;
      const signature = `${state.signature}|${task.id}:${option.signature}`;
      next.push({ routes, labels: option.connector.label ? [...state.labels, option.connector.label] : state.labels, channelUse, cost: state.cost + option.cost + congestion * 80 + lookahead.cost, signature });
    }
    beam = retainRoutingStateDiversity(next, beamWidth);
    if (!beam.length) return { ok: false, diagnostics: [issue("layout.routing_exhausted", `No crossing-free route set exists after allocating connector ${task.id}.`, connectors.map(({ id }) => id))] };
  }
  const selected = beam[0]!;
  for (const channel of context.channels) channel.used = selected.channelUse.get(channel.id) ?? 0;
  return { ok: true, connectors: connectors.map(({ id }) => selected.routes.get(id)!.connector) };
}

function retainRoutingStateDiversity(states: RoutingState[], limit: number) {
  const ordered = states.sort((a, b) => a.cost - b.cost || a.signature.localeCompare(b.signature));
  if (ordered.length <= limit) return ordered;
  const cheapestCount = Math.ceil(limit / 2);
  const retained = [...ordered.slice(0, cheapestCount)];
  const tail = ordered.slice(cheapestCount);
  const sampleCount = limit - retained.length;
  for (let index = 0; index < sampleCount; index += 1) {
    const tailIndex = sampleCount === 1 ? tail.length - 1 : Math.round(index * (tail.length - 1) / (sampleCount - 1));
    retained.push(tail[tailIndex]!);
  }
  return retained.sort((a, b) => a.cost - b.cost || a.signature.localeCompare(b.signature));
}

function routeLookahead(routes: Map<string, RouteOption>, labels: BoardRect[], remaining: RouteTask[]) {
  for (const task of remaining) {
    let compatible = false;
    for (const option of task.options) {
      if (option.connector.label && labels.some((label) => intersects(label, option.connector.label!))) continue;
      if ([...routes.values()].some((selected) => routesConflict(selected.connector, option.connector))) continue;
      compatible = true;
      break;
    }
    if (!compatible) return { ok: false as const, cost: 0 };
  }
  return { ok: true as const, cost: 0 };
}

function routeTask(connector: Connector, context: PlacementContext, board: BoardRect, padding: number, endpointDemand: number, sourceDemand: number, optionLimit: number): RouteTask {
  const from = context.bounds.get(connector.from.node)!;
  const to = context.bounds.get(connector.to.node)!;
  const deltaX = Math.abs(center(to).x - center(from).x);
  const deltaY = Math.abs(center(to).y - center(from).y);
  const vertical = deltaY > deltaX;
  const automaticFrom = vertical ? (to.y >= from.y ? "bottom" : "top") : (to.x >= from.x ? "right" : "left");
  const automaticTo = vertical ? (to.y >= from.y ? "top" : "bottom") : (to.x >= from.x ? "left" : "right");
  const fromSide = responsiveAnchor(connector.from.anchor, automaticFrom);
  const toSide = responsiveAnchor(connector.to.anchor, automaticTo);
  const start = pointFor(from, fromSide);
  const end = pointFor(to, toSide);
  const directLength = distance(start, end);
  const candidates = routeCandidates(start, end, fromSide, toSide, board.width, board.height, padding, stableRouteSeed(connector.id), context.channels);
  const options = candidates.flatMap((points): RouteOption[] => {
    if (!routeClear(points, context, connector.from.node, connector.to.node)) return [];
    const channels = channelsForRoute(points, context.channels);
    if (!routeCovered(points, channels)) return [];
    const labels = connector.label ? connectorLabelCandidates(connector.label, points, context.envelopes, board, context.tokens).slice(0, MAX_LABEL_OPTIONS) : [undefined];
    if (!labels.length) return [];
    const length = routeLength(points);
    const bends = Math.max(0, points.length - 2);
    return labels.map((label, labelIndex) => {
      const solved: BoardConnector = {
        id: connector.id, from: connector.from.node, to: connector.to.node,
        fromPin: `${connector.from.node}.${fromSide}`, toPin: `${connector.to.node}.${toSide}`, points,
        ...(label ? { label } : {}), ...(connector.variant ? { variant: connector.variant } : {}),
        ...(connector.tone ? { tone: connector.tone } : {}), ...(connector.style ? { style: connector.style } : {}),
        channelIds: [...new Set(channels.map(({ id }) => id))],
      };
      const pathSignature = pointsKey(points);
      return { connector: solved, channels, cost: length + bends * 18 + Math.max(0, length / Math.max(1, directLength) - 1) * 90 + labelIndex * 2, pathSignature, signature: `${pathSignature}:${label ? `${label.x},${label.y}` : "none"}` };
    });
  });
  const deduped = dedupeRouteOptions(options);
  return {
    id: connector.id,
    directLength,
    endpointDemand,
    sourceDemand,
    pinDemand: 0,
    alternativeCount: new Set(deduped.map(({ pathSignature }) => pathSignature)).size,
    options: diverseRouteOptions(deduped, optionLimit),
  };
}

function routeCandidates(start: BoardPoint, end: BoardPoint, from: AnchorName, to: AnchorName, width: number, height: number, padding: number, seed: number, channels: RouteChannel[]): BoardPoint[][] {
  const middleX = (start.x + end.x) / 2;
  const middleY = (start.y + end.y) / 2;
  const outerY = height - padding / 2 - 10 - seed * 3;
  const outerX = width - padding / 2 - 10 - seed * 3;
  const startLead = lead(start, from, ENDPOINT_LEAD);
  const endLead = lead(end, to, ENDPOINT_LEAD);
  const horizontalCorridors = routeCoordinates(channels, "horizontal", middleY, [startLead.y, endLead.y]);
  const verticalCorridors = routeCoordinates(channels, "vertical", middleX, [startLead.x, endLead.x]);
  const outerInset = Math.min(padding - 4, 4 + seed * 2);
  const outerLeft = outerInset;
  const outerRight = width - outerInset;
  const outerTop = outerInset;
  const outerBottom = height - outerInset;
  const sourceOuterX = from === "right" ? outerRight : from === "left" ? outerLeft : (start.x >= width / 2 ? outerRight : outerLeft);
  const targetOuterX = to === "right" ? outerRight : to === "left" ? outerLeft : (end.x >= width / 2 ? outerRight : outerLeft);
  const candidates = [
    ...(start.x === end.x || start.y === end.y ? [[start, end]] : []),
    [start, { x: start.x, y: end.y }, end],
    [start, { x: end.x, y: start.y }, end],
    [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end],
    [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end],
    [start, startLead, { x: startLead.x, y: middleY }, { x: endLead.x, y: middleY }, endLead, end],
    [start, startLead, { x: middleX, y: startLead.y }, { x: middleX, y: endLead.y }, endLead, end],
    [start, startLead, { x: startLead.x, y: outerY }, { x: endLead.x, y: outerY }, endLead, end],
    [start, startLead, { x: outerX, y: startLead.y }, { x: outerX, y: endLead.y }, endLead, end],
    ...horizontalCorridors.map((y) => [start, startLead, { x: startLead.x, y }, { x: endLead.x, y }, endLead, end]),
    ...verticalCorridors.map((x) => [start, startLead, { x, y: startLead.y }, { x, y: endLead.y }, endLead, end]),
    ...horizontalCorridors.flatMap((y) => [outerTop, outerBottom].map((outerY) => [
      start,
      startLead,
      { x: sourceOuterX, y: startLead.y },
      { x: sourceOuterX, y: outerY },
      { x: targetOuterX, y: outerY },
      { x: targetOuterX, y },
      { x: endLead.x, y },
      endLead,
      end,
    ])),
  ].map(compactPoints).filter((points) => validEndpointDirections(points, from, to));
  const seen = new Set<string>();
  return candidates.filter((points) => { const key = pointsKey(points); return !seen.has(key) && !!seen.add(key); });
}

function corridorLanes(channels: RouteChannel[], axis: RouteChannel["axis"], target: number) {
  const lanes = [...new Set(channels
    .filter((channel) => channel.axis === axis)
    .flatMap((channel) => channelLaneCoordinates(channel)))];
  const byDistance = [...lanes].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
  if (byDistance.length <= 36) return byDistance;
  const retained = new Set(byDistance.slice(0, 18));
  const byCoordinate = [...lanes].sort((a, b) => a - b);
  for (let index = 0; index < 18; index += 1) retained.add(byCoordinate[Math.round(index * (byCoordinate.length - 1) / 17)]!);
  return [...retained].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 36);
}

function routeCoordinates(channels: RouteChannel[], axis: RouteChannel["axis"], target: number, preferred: number[]) {
  const inChannel = (coordinate: number) => channels.some((channel) => {
    if (channel.axis !== axis) return false;
    const start = axis === "horizontal" ? channel.y : channel.x;
    const size = axis === "horizontal" ? channel.height : channel.width;
    return coordinate >= start + 3 && coordinate <= start + size - 3;
  });
  return [...new Set([...preferred.filter(inChannel), ...corridorLanes(channels, axis, target)])];
}

function channelLaneCoordinates(channel: RouteChannel) {
  const start = channel.axis === "horizontal" ? channel.y : channel.x;
  const size = channel.axis === "horizontal" ? channel.height : channel.width;
  const centerCoordinate = start + size / 2;
  return [0, -8, 8, -16, 16, -24, 24].map((offset) => centerCoordinate + offset).filter((coordinate) => coordinate >= start + 3 && coordinate <= start + size - 3);
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
  return channels.filter((channel) => points.some((point, pointIndex) => pointIndex > 0 && segmentChannelInterval(points[pointIndex - 1]!, point, channel) !== undefined));
}

function routeCovered(points: BoardPoint[], channels: RouteChannel[]) {
  return points.slice(1).every((point, index) => {
    const previous = points[index]!;
    const segmentLength = distance(previous, point);
    const trimStart = index === 0 ? Math.min(ENDPOINT_LEAD, segmentLength) : 0;
    const trimEnd = index === points.length - 2 ? Math.min(ENDPOINT_LEAD, Math.max(0, segmentLength - trimStart)) : 0;
    if (trimStart + trimEnd >= segmentLength - 0.01) return true;
    const start = pointAlong(previous, point, trimStart);
    const end = pointAlong(point, previous, trimEnd);
    return segmentCoveredByChannels(start, end, channels);
  });
}

function segmentCoveredByChannels(start: BoardPoint, end: BoardPoint, channels: RouteChannel[]) {
  const horizontal = start.y === end.y;
  const minimum = horizontal ? Math.min(start.x, end.x) : Math.min(start.y, end.y);
  const maximum = horizontal ? Math.max(start.x, end.x) : Math.max(start.y, end.y);
  const intervals = channels.flatMap((channel) => {
    const interval = segmentChannelInterval(start, end, channel);
    return interval ? [interval] : [];
  }).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let covered = minimum;
  for (const [from, to] of intervals) {
    if (to < covered - 0.01) continue;
    if (from > covered + 0.01) return false;
    covered = Math.max(covered, to);
    if (covered >= maximum - 0.01) return true;
  }
  return covered >= maximum - 0.01;
}

function segmentChannelInterval(start: BoardPoint, end: BoardPoint, channel: RouteChannel): [number, number] | undefined {
  if (start.y === end.y) {
    if (start.y < channel.y || start.y > channel.y + channel.height) return undefined;
    const from = Math.max(Math.min(start.x, end.x), channel.x);
    const to = Math.min(Math.max(start.x, end.x), channel.x + channel.width);
    return to >= from ? [from, to] : undefined;
  }
  if (start.x !== end.x || start.x < channel.x || start.x > channel.x + channel.width) return undefined;
  const from = Math.max(Math.min(start.y, end.y), channel.y);
  const to = Math.min(Math.max(start.y, end.y), channel.y + channel.height);
  return to >= from ? [from, to] : undefined;
}

function pointAlong(start: BoardPoint, end: BoardPoint, amount: number): BoardPoint {
  const length = distance(start, end);
  if (!length || !amount) return start;
  const ratio = Math.min(1, amount / length);
  return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio };
}

function orthogonalSegmentsCross(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const firstHorizontal = a.y === b.y;
  const secondHorizontal = c.y === d.y;
  if (firstHorizontal === secondHorizontal) return false;
  const horizontal = firstHorizontal ? [a, b] : [c, d];
  const vertical = firstHorizontal ? [c, d] : [a, b];
  return vertical[0]!.x > Math.min(horizontal[0]!.x, horizontal[1]!.x) && vertical[0]!.x < Math.max(horizontal[0]!.x, horizontal[1]!.x) && horizontal[0]!.y > Math.min(vertical[0]!.y, vertical[1]!.y) && horizontal[0]!.y < Math.max(vertical[0]!.y, vertical[1]!.y);
}

function routesConflict(first: BoardConnector, second: BoardConnector) {
  for (let a = 1; a < first.points.length; a += 1) for (let b = 1; b < second.points.length; b += 1) {
    const firstStart = first.points[a - 1]!;
    const firstEnd = first.points[a]!;
    const secondStart = second.points[b - 1]!;
    const secondEnd = second.points[b]!;
    if (orthogonalSegmentsCross(firstStart, firstEnd, secondStart, secondEnd)) return true;
    if (segmentsOverlap(firstStart, firstEnd, secondStart, secondEnd) && !sharedEndpointLeadOverlap(first, second, firstStart, firstEnd, secondStart, secondEnd)) return true;
    if (tJunctionPoints(firstStart, firstEnd, secondStart, secondEnd).some((point) => !nearSharedEndpoint(first, second, point))) return true;
  }
  return false;
}

function tJunctionPoints(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) { return [a, b].filter((point) => pointInsideSegment(point, c, d)).concat([c, d].filter((point) => pointInsideSegment(point, a, b))); }
function pointInsideSegment(point: BoardPoint, start: BoardPoint, end: BoardPoint) { return start.x === end.x ? point.x === start.x && point.y > Math.min(start.y, end.y) && point.y < Math.max(start.y, end.y) : point.y === start.y && point.x > Math.min(start.x, end.x) && point.x < Math.max(start.x, end.x); }
function segmentsOverlap(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const firstHorizontal = a.y === b.y;
  if (firstHorizontal !== (c.y === d.y)) return false;
  return firstHorizontal
    ? a.y === c.y && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x))
    : a.x === c.x && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
}

function sharedEndpointLeadOverlap(first: BoardConnector, second: BoardConnector, a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const shared = sharedEndpoint(first, second);
  if (!shared) return false;
  const overlapStart = a.x === b.x ? { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) } : { x: Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)), y: a.y };
  const overlapEnd = a.x === b.x ? { x: a.x, y: Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) } : { x: Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)), y: a.y };
  return distance(shared, overlapStart) <= 12.01 && distance(shared, overlapEnd) <= 12.01;
}

function nearSharedEndpoint(first: BoardConnector, second: BoardConnector, point: BoardPoint) { const shared = sharedEndpoint(first, second); return Boolean(shared && distance(shared, point) <= 12.01); }
function sharedEndpoint(first: BoardConnector, second: BoardConnector) {
  for (const node of [first.from, first.to]) {
    if (node !== second.from && node !== second.to) continue;
    const firstPoint = node === first.from ? first.points[0]! : first.points.at(-1)!;
    const secondPoint = node === second.from ? second.points[0]! : second.points.at(-1)!;
    if (firstPoint.x === secondPoint.x && firstPoint.y === secondPoint.y) return firstPoint;
  }
  return undefined;
}

function routeLength(points: BoardPoint[]) { return points.slice(1).reduce((total, point, index) => total + distance(points[index]!, point), 0); }
function pointsKey(points: BoardPoint[]) { return points.map(({ x, y }) => `${x},${y}`).join(";"); }
function stableRouteSeed(id: string) { return [...id].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0) % 8; }
function dedupeRouteOptions(options: RouteOption[]) { const seen = new Set<string>(); return options.sort((a, b) => a.cost - b.cost || a.signature.localeCompare(b.signature)).filter(({ signature }) => !seen.has(signature) && !!seen.add(signature)); }

function diverseRouteOptions(options: RouteOption[], limit: number) {
  const paths = new Map<string, RouteOption[]>();
  for (const option of options) {
    const entries = paths.get(option.pathSignature) ?? [];
    entries.push(option);
    paths.set(option.pathSignature, entries);
  }
  const orderedPaths = [...paths.values()].sort((a, b) => a[0]!.cost - b[0]!.cost || a[0]!.pathSignature.localeCompare(b[0]!.pathSignature));
  const retainedPaths = retainRoutePathDiversity(orderedPaths, limit);
  const selected: RouteOption[] = [];
  for (let labelIndex = 0; selected.length < limit; labelIndex += 1) {
    let added = false;
    for (const path of retainedPaths) {
      const option = path[labelIndex];
      if (!option) continue;
      selected.push(option);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

function retainRoutePathDiversity(paths: RouteOption[][], limit: number) {
  if (paths.length <= limit) return paths;
  const cheapestCount = Math.ceil(limit / 2);
  const retained = new Map<string, RouteOption[]>();
  for (const path of paths.slice(0, cheapestCount)) retained.set(path[0]!.pathSignature, path);
  const tail = paths.slice(cheapestCount);
  const sampleCount = limit - retained.size;
  for (let index = 0; index < sampleCount; index += 1) {
    const tailIndex = sampleCount === 1 ? tail.length - 1 : Math.round(index * (tail.length - 1) / (sampleCount - 1));
    const path = tail[tailIndex]!;
    retained.set(path[0]!.pathSignature, path);
  }
  return [...retained.values()];
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
  for (const envelope of envelopes) {
    channels.push(
      channel(`channel.access.left.${envelope.owner}`, "vertical", padding, envelope.y, Math.max(0, envelope.x - padding), envelope.height),
      channel(`channel.access.right.${envelope.owner}`, "vertical", envelope.x + envelope.width, envelope.y, Math.max(0, width - padding - envelope.x - envelope.width), envelope.height),
      channel(`channel.access.top.${envelope.owner}`, "horizontal", envelope.x, padding, envelope.width, Math.max(0, envelope.y - padding)),
      channel(`channel.access.bottom.${envelope.owner}`, "horizontal", envelope.x, envelope.y + envelope.height, envelope.width, Math.max(0, height - padding - envelope.y - envelope.height)),
    );
  }
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

function responsiveAnchor(anchor: AnchorName | undefined, fallback: AnchorName) {
  return !anchor || anchor === "center" ? fallback : anchor;
}

function validateSolvedConstraints(
  constraints: VisualConstraint[],
  scene: BoardScene,
  tokens: TokenOverrides,
): LayoutDiagnostic[] {
  const tolerance = 0.5;
  const bounds = new Map<string, BoardRect>([
    ...scene.elements.map((element) => [element.id, element.bounds] as const),
    ...scene.canvases.flatMap((canvas) => canvas.primitives.map((primitive) => [primitive.id, primitive.bounds] as const)),
  ]);
  const diagnostics: LayoutDiagnostic[] = [];
  for (const constraint of constraints) {
    if (constraint.kind === "align") {
      const rectangles = constraint.targets.flatMap((id) => bounds.has(id) ? [bounds.get(id)!] : []);
      const edge = constraint.edge ?? "center";
      const coordinate = rectangles[0] ? rectCoordinate(rectangles[0], constraint.axis, edge) : undefined;
      if (coordinate !== undefined && rectangles.some((rect) => Math.abs(rectCoordinate(rect, constraint.axis, edge) - coordinate) > tolerance)) {
        diagnostics.push(issue("layout.unsatisfied_align", `Align constraint is not satisfied for ${constraint.targets.join(", ")}.`, constraint.targets));
      }
      continue;
    }
    if (constraint.kind === "distribute") {
      const entries = constraint.targets.flatMap((id) => bounds.has(id) ? [{ id, bounds: bounds.get(id)! }] : [])
        .sort((a, b) => a.bounds[constraint.axis] - b.bounds[constraint.axis]);
      const gaps = entries.slice(1).map((entry, index) => {
        const previous = entries[index]!.bounds;
        return entry.bounds[constraint.axis] - (previous[constraint.axis] + (constraint.axis === "x" ? previous.width : previous.height));
      });
      const expected = constraint.gap === undefined ? gaps[0] : visualNumber(constraint.gap, tokens, 0);
      if (expected !== undefined && gaps.some((gap) => Math.abs(gap - expected) > tolerance)) {
        diagnostics.push(issue("layout.unsatisfied_distribute", `Distribute constraint is not satisfied for ${constraint.targets.join(", ")}.`, constraint.targets));
      }
      continue;
    }
    if (constraint.kind === "inside") {
      const child = bounds.get(constraint.child);
      const container = bounds.get(constraint.container);
      const padding = visualNumber(constraint.padding, tokens, 0);
      if (child && container && !containsRect({ x: container.x + padding - tolerance, y: container.y + padding - tolerance, width: container.width - padding * 2 + tolerance * 2, height: container.height - padding * 2 + tolerance * 2 }, child)) {
        diagnostics.push(issue("layout.unsatisfied_inside", `${constraint.child} cannot fit inside ${constraint.container} with the requested padding.`, [constraint.child, constraint.container]));
      }
      continue;
    }
    const first = bounds.get(constraint.first);
    const second = bounds.get(constraint.second);
    if (!first || !second) continue;
    const requested = visualNumber(constraint.distance, tokens, MIN_GAP);
    const deltaX = Math.abs(center(second).x - center(first).x);
    const deltaY = Math.abs(center(second).y - center(first).y);
    const actual = deltaY >= deltaX
      ? Math.max(0, second.y >= first.y ? second.y - (first.y + first.height) : first.y - (second.y + second.height))
      : Math.max(0, second.x >= first.x ? second.x - (first.x + first.width) : first.x - (second.x + second.width));
    if (Math.abs(actual - requested) > tolerance) diagnostics.push(issue("layout.unsatisfied_near", `${constraint.first} and ${constraint.second} are not separated by ${requested}.`, [constraint.first, constraint.second]));
  }
  return diagnostics;
}

function labelBounds(node: VisualNode, bounds: BoardRect, theme: LiveryTheme, tokens: TokenOverrides): BoardRect {
  const recipe = resolveComponentRecipe(node.kind, node.variant, theme);
  const geometry = recipe.geometry;
  const paddingX = geometry?.paddingX ?? 16;
  if (node.kind === "frame") {
    const fontSize = visualNumber(node.style?.fontSize ?? recipe.typography?.fontSize, tokens, tokenNumber(tokens, "type.label", 14));
    const lineHeight = Math.max(visualNumber(recipe.typography?.lineHeight, tokens, 20), Math.ceil(fontSize * 1.1));
    const subtitleHeight = node.subtitle ? Math.max(tokenNumber(tokens, "type.caption", 10) * 1.35, 14) + 4 : 0;
    return { x: bounds.x + paddingX, y: bounds.y + (geometry?.paddingY ?? 14), width: Math.max(1, bounds.width - paddingX * 2), height: lineHeight + subtitleHeight };
  }
  const detailOffset = hasComponentDetail(recipe) ? (geometry?.detailWidth ?? 24) + (geometry?.labelGap ?? 10) : 0;
  const x = bounds.x + paddingX + detailOffset;
  const width = Math.max(1, bounds.x + bounds.width - paddingX - x);
  const fontSize = visualNumber(node.style?.fontSize ?? recipe.typography?.fontSize, tokens, tokenNumber(tokens, "type.body", 13));
  const lineHeight = Math.max(visualNumber(recipe.typography?.lineHeight, tokens, Math.ceil(fontSize * 1.38)), Math.ceil(fontSize * 1.1));
  const fontWeight = Number(resolveVisualValue(node.style?.fontWeight ?? recipe.typography?.fontWeight, tokens) ?? 650);
  const height = measureVisualTextBlock(node.label ?? node.id, width, { fontSize, fontWeight, lineHeight }).height;
  const subtitleFontSize = tokenNumber(tokens, "type.caption", 10);
  const subtitleLineHeight = Math.max(Math.ceil(subtitleFontSize * 1.35), 14);
  const subtitleHeight = node.subtitle ? measureVisualTextBlock(node.subtitle, width, { fontSize: subtitleFontSize, fontWeight: 500, lineHeight: subtitleLineHeight }).height + 4 : 0;
  const totalHeight = height + subtitleHeight;
  return { x, y: bounds.y + (bounds.height - totalHeight) / 2, width, height: totalHeight };
}

function connectorLabelCandidates(text: string, points: BoardPoint[], envelopes: CollisionEnvelope[], board: BoardRect, tokens: TokenOverrides) {
  const fontSize = tokenNumber(tokens, "type.caption", 10);
  const width = measureVisualText(text, { fontSize, fontWeight: 600 }) + 8;
  const height = Math.max(16, Math.ceil(fontSize * 1.2) + 4);
  const segments = points.slice(1).map((point, index) => ({ a: points[index]!, b: point })).sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b));
  const available: Array<BoardRect & { text: string }> = [];
  for (const segment of segments) {
    const horizontal = Math.abs(segment.a.x - segment.b.x) >= Math.abs(segment.a.y - segment.b.y);
    const offsets = horizontal ? [-10, 10, -22, 22, 0] : [width / 2 + 4, -width / 2 - 4, width / 2 + 16, -width / 2 - 16, 0];
    const candidates = [0.5, 0.25, 0.75].flatMap((position) => {
      const center = {
        x: segment.a.x + (segment.b.x - segment.a.x) * position,
        y: segment.a.y + (segment.b.y - segment.a.y) * position,
      };
      return offsets.map((offset) => ({
        text,
        x: center.x - width / 2 + (horizontal ? 0 : offset),
        y: center.y - height / 2 + (horizontal ? offset : 0),
        width,
        height,
      }));
    });
    for (const envelope of envelopes) for (const offset of offsets) {
      if (horizontal) {
        candidates.push(
          { text, x: envelope.x + envelope.width, y: segment.a.y - height / 2 + offset, width, height },
          { text, x: envelope.x - width, y: segment.a.y - height / 2 + offset, width, height },
        );
      } else {
        candidates.push(
          { text, x: segment.a.x - width / 2 + offset, y: envelope.y + envelope.height, width, height },
          { text, x: segment.a.x - width / 2 + offset, y: envelope.y - height, width, height },
        );
      }
    }
    const attached = candidates.filter((rect) => horizontal
      ? rect.x + rect.width / 2 >= Math.min(segment.a.x, segment.b.x) && rect.x + rect.width / 2 <= Math.max(segment.a.x, segment.b.x)
      : rect.y + rect.height / 2 >= Math.min(segment.a.y, segment.b.y) && rect.y + rect.height / 2 <= Math.max(segment.a.y, segment.b.y));
    for (const candidate of attached) if (containsRect(board, candidate) && envelopes.every((envelope) => !intersects(candidate, envelope))) available.push(candidate);
  }
  const seen = new Set<string>();
  return available.filter(({ x, y }) => { const key = `${x},${y}`; return !seen.has(key) && !!seen.add(key); });
}

function tracksFor(envelopes: CollisionEnvelope[], axis: "x" | "y"): BoardTrack[] {
  const values = [...new Set(envelopes.map((envelope) => envelope[axis]))].sort((a, b) => a - b);
  return values.map((position, index) => ({ id: `${axis === "x" ? "column" : "row"}.${index}`, index, position, size: Math.max(...envelopes.filter((envelope) => envelope[axis] === position).map((envelope) => axis === "x" ? envelope.width : envelope.height), 0) }));
}

function gridColumns(node: VisualNode, strategy: Strategy, maxWidth: number, count: number, cellWidth = 0, gap = 0) {
  const requested = Math.max(1, Math.min(count, node.layout?.columns ?? count));
  const fitting = Math.max(1, Math.min(requested, Math.floor((maxWidth + gap + 0.01) / Math.max(1, cellWidth + gap))));
  if (strategy === "alternate_spans") return fitting;
  if (strategy === "balanced_grid") return Math.min(fitting, Math.max(1, Math.ceil(Math.sqrt(count))));
  return Math.max(1, node.layout?.columns ?? Math.ceil(Math.sqrt(count)));
}
function gridRowHeights(sizes: Size[], columns: number) {
  return Array.from({ length: Math.ceil(sizes.length / columns) }, (_, row) => Math.max(...sizes.slice(row * columns, (row + 1) * columns).map(({ height }) => height), 0));
}
function lead(point: BoardPoint, side: AnchorName, amount: number): BoardPoint { const direction = directionFor(side); return { x: point.x + direction.x * amount, y: point.y + direction.y * amount }; }
function compactPoints(points: BoardPoint[]) { return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y); }
function distance(a: BoardPoint, b: BoardPoint) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function tokenNumber(tokens: TokenOverrides, name: string, fallback: number) { const value = tokens[name]; return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function visualNumber(value: VisualValue | undefined, tokens: TokenOverrides, fallback: number) { const resolved = resolveVisualValue(value, tokens); return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : fallback; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function gapFor(value: VisualValue | undefined, tokens: TokenOverrides) { return visualNumber(value, tokens, DEFAULT_GAP); }
function countNodes(node: VisualNode): number { return 1 + (node.children?.reduce((total, child) => total + countNodes(child), 0) ?? 0); }
function inflate(rect: BoardRect, amount: number): BoardRect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }; }
function containsRect(outer: BoardRect, inner: BoardRect) { return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height; }
function intersects(a: BoardRect, b: BoardRect) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
function segmentIntersects(a: BoardPoint, b: BoardPoint, rect: BoardRect) { return intersects({ x: Math.min(a.x, b.x) - 0.5, y: Math.min(a.y, b.y) - 0.5, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 }, rect); }
function channel(id: string, axis: RouteChannel["axis"], x: number, y: number, width: number, height: number): RouteChannel { return { id, axis, x, y, width, height, capacity: 16, used: 0 }; }
function uniqueChannels(channels: RouteChannel[]) { const seen = new Set<string>(); return channels.filter(({ id }) => !seen.has(id) && !!seen.add(id)); }
function clipChannel(routeChannel: RouteChannel, width: number, height: number): RouteChannel {
  const right = Math.min(width, routeChannel.x + routeChannel.width);
  const bottom = Math.min(height, routeChannel.y + routeChannel.height);
  const x = Math.max(0, routeChannel.x);
  const y = Math.max(0, routeChannel.y);
  return { ...routeChannel, x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
function compareCandidates(
  first: { scene: BoardScene; report: ReturnType<typeof validateBoardScene>; attempt: LayoutAttempt },
  second: { scene: BoardScene; report: ReturnType<typeof validateBoardScene>; attempt: LayoutAttempt },
) {
  const a = first.report.metrics;
  const b = second.report.metrics;
  return compareNumbers(first.attempt.topologyDeviation ?? 0, second.attempt.topologyDeviation ?? 0)
    || compareNumbers(-(first.attempt.columns ?? 1), -(second.attempt.columns ?? 1))
    || compareNumbers(a.maximumNormalizedRouteLength, b.maximumNormalizedRouteLength)
    || compareNumbers(a.normalizedRouteLength, b.normalizedRouteLength)
    || compareNumbers(a.bendCount, b.bendCount)
    || compareNumbers(a.aspectImbalance, b.aspectImbalance)
    || compareNumbers(first.scene.board.height, second.scene.board.height)
    || compareNumbers(a.whitespaceImbalance, b.whitespaceImbalance)
    || compareNumbers(STRATEGIES.indexOf(first.attempt.strategy), STRATEGIES.indexOf(second.attempt.strategy));
}

function compareNumbers(first: number, second: number) { return first < second ? -1 : first > second ? 1 : 0; }

function requestedRootColumns(root: VisualNode) {
  const count = root.children?.length ?? 0;
  if (root.layout?.kind === "column") return 1;
  if (root.layout?.kind === "grid") return Math.min(count, Math.max(1, root.layout.columns ?? Math.ceil(Math.sqrt(count))));
  return Math.max(1, count);
}

function rootColumnCount(scene: BoardScene) {
  const children = scene.elements.filter(({ parent }) => parent === "root");
  return Math.max(
    1,
    new Set(
      children.map(({ bounds }) =>
        Math.round((bounds.x + bounds.width / 2) * 100) / 100,
      ),
    ).size,
  );
}

function strategyFits(document: VisualDocument, width: number, strategy: Strategy, theme: LiveryTheme, tokens: TokenOverrides) {
  if (strategy !== "requested" && strategy !== "expanded_tracks") return true;
  const root = document.root;
  if (!root.children?.length || root.layout?.kind === "column" || root.layout?.kind === "stack" || root.layout?.kind === "overlay" || root.layout?.kind === "canvas") return true;
  const padding = width <= 480 ? COMPACT_PADDING : PADDING;
  const available = width - padding * 2;
  const gap = gapFor(root.layout?.gap, tokens);
  const sizes = root.children.map((child) => measure(child, available, strategy, MIN_GAP, false, gap, gap, theme, tokens));
  const columns = root.layout?.kind === "grid" ? requestedRootColumns(root) : sizes.length;
  const cellWidth = root.layout?.kind === "grid" ? Math.max(...sizes.map(({ width: childWidth }) => childWidth), 0) : 0;
  const required = root.layout?.kind === "grid"
    ? columns * cellWidth + gap * Math.max(0, columns - 1)
    : sum(sizes.map(({ width: childWidth }) => childWidth)) + gap * Math.max(0, columns - 1);
  return required <= available + 0.01;
}

function routingReserve(connectors: Connector[], tokens: TokenOverrides) {
  if (!connectors.length) return 0;
  const labelWidth = connectors.reduce((total, connector) => total + (connector.label ? measureVisualText(connector.label, { fontSize: tokenNumber(tokens, "type.caption", 10), fontWeight: 600 }) + 16 : 0), 0);
  const labelRows = Math.max(1, Math.ceil(labelWidth / 560));
  return 28 + labelRows * 18 + Math.ceil(connectors.length / 4) * 8;
}

function routingGutterExpansion(strategy: Strategy, connectorCount: number) {
  const demand = Math.min(32, Math.max(8, Math.ceil(connectorCount / 2) * 8));
  if (strategy === "expanded_tracks") return demand;
  if (strategy === "alternate_spans" || strategy === "balanced_grid") return Math.ceil(demand * 0.75);
  return 0;
}
function hasComponentDetail(recipe: ReturnType<typeof resolveComponentRecipe>) { return Boolean(recipe.detail && recipe.detail.glyph !== "none" && recipe.shape !== "storage"); }
function endpointClearance(node: VisualNode, targetId: string, inherited = CLEARANCE): number {
  const canvas = node.kind === "canvas" || node.layout?.kind === "canvas";
  const clearance = canvas ? CLEARANCE + numericProp(node, "bleed", 0) : inherited;
  if (node.id === targetId) return clearance;
  for (const child of node.children ?? []) {
    const match = endpointClearance(child, targetId, clearance);
    if (match >= 0) return match;
  }
  return -1;
}
function issue(code: LayoutDiagnostic["code"], message: string, elementIds?: string[]): LayoutDiagnostic { return { code, message, severity: "error", ...(elementIds ? { elementIds } : {}) }; }
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

function collectSolvedIds(node: VisualNode): Set<string> {
  const ids = new Set<string>([node.id]);
  if (node.kind === "repeat") {
    const count = Math.max(0, Math.min(MAX_CANVAS_REPEAT, Math.floor(numericProp(node, "count", 0))));
    for (let index = 0; index < count; index += 1) ids.add(`${node.id}.${index}`);
  }
  for (const child of node.children ?? []) for (const id of collectSolvedIds(child)) ids.add(id);
  return ids;
}

function solveCanvasPrimitives(nodes: VisualNode[], canvas: BoardRect, context: PlacementContext): CanvasPrimitive[] {
  const primitives: CanvasPrimitive[] = [];
  const append = (node: VisualNode, suffix = "", offsetX = 0, offsetY = 0, parent?: string) => {
    if (primitives.length >= MAX_CANVAS_PRIMITIVES) return;
    if (node.kind === "repeat") {
      const count = Math.max(0, Math.min(MAX_CANVAS_REPEAT, Math.floor(numericProp(node, "count", 0))));
      const kind = stringProp(node, "kind", "circle") as CanvasPrimitive["kind"];
      for (let index = 0; index < count && primitives.length < MAX_CANVAS_PRIMITIVES; index += 1) {
        append({ ...node, id: `${node.id}.${index}`, kind, props: { ...node.props, count: 0 } }, "", offsetX + numericProp(node, "stepX", 0) * index, offsetY + numericProp(node, "stepY", 0) * index, parent);
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
    if (node.kind === "group") {
      const insertionIndex = primitives.length;
      for (const child of node.children ?? []) append(child, suffix, offsetX + numericProp(node, "x", 0), offsetY + numericProp(node, "y", 0), id);
      const childBounds = primitives.slice(insertionIndex).filter((primitive) => primitive.parent === id).map(({ visualBounds: child }) => child);
      const union = childBounds.reduce<BoardRect | undefined>((result, child) => result ? unionRect(result, child) : child, undefined);
      const groupBounds = node.props?.width !== undefined || node.props?.height !== undefined ? visualBounds : union ?? visualBounds;
      primitives.splice(insertionIndex, 0, {
        id,
        kind: "group",
        bounds: groupBounds,
        visualBounds: groupBounds,
        layer: Math.floor(numericProp(node, "layer", primitives.length)),
        ...(node.label ? { label: node.label } : {}),
        ...(node.description ? { description: node.description } : {}),
        ...(parent ? { parent } : {}),
        ...(node.style ? { style: node.style } : {}),
        ...(typeof node.props?.clip === "string" ? { clip: node.props.clip } : {}),
        ...(typeof node.props?.mask === "string" ? { mask: node.props.mask } : {}),
        transform,
        pins: pinsFor(id, groupBounds),
        ...(node.props ? { props: node.props } : {}),
      });
      context.bounds.set(id, groupBounds);
      return;
    }
    primitives.push({
      id,
      kind: canvasKind(node.kind),
      bounds,
      visualBounds,
      layer: Math.floor(numericProp(node, "layer", primitives.length)),
      ...(node.label ? { label: node.label } : {}),
      ...(node.description ? { description: node.description } : {}),
      ...(parent ? { parent } : {}),
      ...(node.style ? { style: node.style } : {}),
      ...(typeof node.props?.clip === "string" ? { clip: node.props.clip } : {}),
      ...(typeof node.props?.mask === "string" ? { mask: node.props.mask } : {}),
      transform,
      pins: pinsFor(id, visualBounds),
      ...(node.props ? { props: node.props } : {}),
    });
    context.bounds.set(id, visualBounds);
    for (const child of node.children ?? []) append(child, suffix, offsetX + numericProp(node, "x", 0), offsetY + numericProp(node, "y", 0), id);
  };
  for (const node of nodes) append(node);
  return primitives;
}

function solveMotionEnvelopes(timelines: Timeline[], elements: Array<{ id: string; bounds: BoardRect; visualBounds: BoardRect; transform?: CanvasPrimitive["transform"]; props?: Record<string, VisualValue> }>) {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const statesByOwner = new Map<string, Array<{ state: string; bounds: BoardRect }>>();
  for (const timeline of timelines) {
    const properties = new Map<string, Record<string, VisualValue>>();
    for (const state of timeline.states) {
      for (const operation of state.operations) {
        if (operation.action === "set") for (const target of operation.targets) properties.set(target, { ...properties.get(target), ...operation.properties });
        if (operation.action === "morph") {
          const from = byId.get(operation.targets[0]);
          const to = byId.get(operation.targets[1]);
          if (!from || !to) continue;
          const bounds = unionRect(from.visualBounds, to.visualBounds);
          const existing = statesByOwner.get(to.id) ?? [{ state: "base", bounds: to.visualBounds }];
          existing.push({ state: `${timeline.id}.${state.id}`, bounds });
          statesByOwner.set(to.id, existing);
        }
      }
      for (const [target, stateProperties] of properties) {
        const element = byId.get(target);
        if (!element) continue;
        const bounds = motionBounds(element, stateProperties);
        const existing = statesByOwner.get(target) ?? [{ state: "base", bounds: element.visualBounds }];
        existing.push({ state: `${timeline.id}.${state.id}`, bounds });
        statesByOwner.set(target, existing);
      }
    }
  }
  return [...statesByOwner.entries()].map(([owner, states]) => ({ id: `${owner}.motion`, owner, states: states.map(({ state }) => state), ...states.reduce((bounds, state) => unionRect(bounds, state.bounds), states[0]!.bounds) }));
}

function motionBounds(element: { bounds: BoardRect; transform?: CanvasPrimitive["transform"]; props?: Record<string, VisualValue> }, properties: Record<string, VisualValue>) {
  const base = element.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 };
  const scale = numericOptional(properties.scale);
  const bounds = {
    x: localTimelineCoordinate(properties.x, element.props?.x, element.bounds.x),
    y: localTimelineCoordinate(properties.y, element.props?.y, element.bounds.y),
    width: numericValue(properties.width, element.bounds.width),
    height: numericValue(properties.height, element.bounds.height),
  };
  return transformedBounds(bounds, {
    translateX: numericValue(properties.translateX, base.translateX),
    translateY: numericValue(properties.translateY, base.translateY),
    scaleX: numericValue(properties.scaleX, scale ?? base.scaleX),
    scaleY: numericValue(properties.scaleY, scale ?? base.scaleY),
    rotate: numericValue(properties.rotate, base.rotate),
  });
}

function localTimelineCoordinate(value: VisualValue | undefined, authored: VisualValue | undefined, solved: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? solved + value - (typeof authored === "number" && Number.isFinite(authored) ? authored : 0)
    : solved;
}

function numericProp(node: VisualNode, name: string, fallback: number) { return numericValue(node.props?.[name], fallback); }
function stringProp(node: VisualNode, name: string, fallback: string) { const value = node.props?.[name]; return typeof value === "string" ? value : fallback; }
function numericValue(value: VisualValue | undefined, fallback: number) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function numericOptional(value: VisualValue | undefined) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function defaultPrimitiveSize(kind: VisualNode["kind"]): Size { if (kind === "text") return { width: 80, height: 20 }; if (kind === "line" || kind === "path") return { width: 80, height: 2 }; if (kind === "circle") return { width: 24, height: 24 }; return { width: 48, height: 48 }; }
function canvasKind(kind: VisualNode["kind"]): CanvasPrimitive["kind"] { return (["text", "box", "circle", "line", "path", "image", "icon", "group"] as string[]).includes(kind) ? kind as CanvasPrimitive["kind"] : "group"; }
function unionRect(a: BoardRect, b: BoardRect): BoardRect { const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y); return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }; }
function transformedBounds(bounds: BoardRect, transform: { translateX: number; translateY: number; scaleX: number; scaleY: number; rotate: number }): BoardRect { const width = Math.abs(bounds.width * transform.scaleX); const height = Math.abs(bounds.height * transform.scaleY); const radians = transform.rotate * Math.PI / 180; const rotatedWidth = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)); const rotatedHeight = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians)); return { x: bounds.x + transform.translateX + (bounds.width - rotatedWidth) / 2, y: bounds.y + transform.translateY + (bounds.height - rotatedHeight) / 2, width: rotatedWidth, height: rotatedHeight }; }
