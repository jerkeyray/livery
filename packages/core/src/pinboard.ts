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

const STRATEGIES: Strategy[] = ["requested", "expanded_tracks", "alternate_spans", "vertical_reflow", "increased_height"];
const DEFAULT_WIDTH = 720;
const MIN_WIDTH = 280;
const PADDING = 24;
const COMPACT_PADDING = 16;
const DEFAULT_GAP = 32;
const MIN_GAP = 24;
const CLEARANCE = 6;
const MIN_ANCHOR_AXIS_RATIO = 0.35;
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
  const solvedIds = collectSolvedIds(document.root);
  const missingEndpoints = document.connectors.flatMap((connector) => [connector.from.node, connector.to.node]
    .filter((endpoint) => !solvedIds.has(endpoint))
    .map((endpoint) => issue("layout.missing_solved_endpoint", `Connector ${connector.id} has no solved endpoint for ${endpoint}.`, [connector.id, endpoint])));
  if (missingEndpoints.length) return { ok: false, diagnostics: missingEndpoints, attempts };

  const theme = options.theme ?? canonicalTheme;
  const tokens = resolveTheme(theme, options.tokenOverrides);
  for (const strategy of strategies) {
    const scene = buildCandidate(document, width, strategy, theme, tokens);
    const baseReport = validateBoardScene(scene);
    const constraintDiagnostics = validateSolvedConstraints(document.constraints, scene, tokens);
    const report = {
      ...baseReport,
      valid: baseReport.valid && constraintDiagnostics.length === 0,
      diagnostics: [...baseReport.diagnostics, ...constraintDiagnostics],
    };
    attempts.push({ strategy, width: scene.board.width, height: scene.board.height, diagnostics: report.diagnostics });
    if (report.valid) successes.push({ scene, report, cost: candidateCost(strategy, scene, report.metrics) });
  }
  const selected = successes.sort((a, b) => a.cost - b.cost)[0];
  if (selected) return { ok: true, scene: selected.scene, report: selected.report, attempts };
  return {
    ok: false,
    diagnostics: [issue("layout.no_valid_candidate", `No valid board layout was found at ${width}px.`), ...dedupeDiagnostics(attempts.flatMap(({ diagnostics }) => diagnostics))],
    attempts,
  };
}

function buildCandidate(document: VisualDocument, width: number, strategy: Strategy, theme: LiveryTheme, tokens: TokenOverrides): BoardScene {
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
  }));
  const context: PlacementContext = { elements: [], envelopes: [], channels: [], bounds: new Map(), minimumGap, rootColumnGap, rootRowGap, canvases: [], theme, tokens };
  const rootSize = measure(document.root, availableWidth, strategy, minimumGap, true, rootColumnGap, rootRowGap, theme, tokens);
  const rootWidth = Math.min(rootSize.width, availableWidth);
  const rootX = padding + (availableWidth - rootWidth) / 2;
  const routeReserve = document.connectors.length ? Math.max(40, document.connectors.length * 10) : 0;
  const constraintReserve = document.constraints.reduce((total, constraint) => total + constraintSpacing(constraint), 0);
  const height = Math.ceil(Math.max(120, rootSize.height) + padding * 2 + routeReserve + constraintReserve);
  place(document.root, rootX, padding, rootWidth, rootSize.height, undefined, context, strategy, true);
  for (let pass = 0; pass < 8; pass += 1) applyConstraints(document.constraints, context);
  declareConstraintOverlaps(document.constraints, context);
  context.channels.push(...buildChannels(context.envelopes, width, height, padding));
  const connectors = routeConnectors(document.connectors, context, width, height, padding);
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
  return {
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
    const recipeMaximumWidth = Math.max(minimumWidth, geometry?.maxWidth ?? 184);
    const authoredWidth = numericOptional(node.props?.width);
    const authoredHeight = numericOptional(node.props?.height);
    const preferredWidth = node.layout?.width ?? authoredWidth ?? Math.max(minimumWidth, Math.min(measuredLabelWidth + horizontalSpace, recipeMaximumWidth));
    const width = Math.min(preferredWidth, maxWidth);
    const textWidth = Math.max(24, width - horizontalSpace);
    const contentHeight = measureVisualTextBlock(label, textWidth, { fontSize, fontWeight, lineHeight }).height + (geometry?.paddingY ?? 14) * 2;
    return { width, height: node.layout?.height ?? authoredHeight ?? Math.max(geometry?.minHeight ?? NODE_HEIGHT, contentHeight) };
  }
  if (node.kind === "canvas" || node.layout?.kind === "canvas") {
    return { width: Math.min(maxWidth, node.layout?.width ?? numericProp(node, "width", 240)), height: node.layout?.height ?? numericProp(node, "height", 160) };
  }
  const declaredGap = gapFor(node.layout?.gap, tokens);
  const columnGap = Math.max(root ? rootColumnGap : minimumGap, declaredGap);
  const rowGap = Math.max(root ? rootRowGap : minimumGap, declaredGap);
  const children = node.children.map((child) => measure(child, maxWidth, strategy, minimumGap, false, rootColumnGap, rootRowGap, theme, tokens));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, children, maxWidth, columnGap);
  if (kind === "column") {
    const intrinsicWidth = Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0));
    const intrinsicHeight = sum(children.map(({ height }) => height)) + rowGap * Math.max(0, children.length - 1);
    return {
      width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, intrinsicWidth)),
      height: visualNumber(node.layout?.height ?? node.props?.height, tokens, intrinsicHeight),
    };
  }
  if (kind === "grid") {
    const cellWidth = Math.max(...children.map(({ width }) => width), 0);
    const columns = gridColumns(node, strategy, maxWidth, children.length, cellWidth, columnGap);
    const rowHeights = gridRowHeights(children, columns);
    const intrinsicWidth = Math.min(columns, children.length) * cellWidth + columnGap * Math.max(0, Math.min(columns, children.length) - 1);
    const distributedWidth = root && node.layout?.distribute && node.layout.distribute !== "start" ? maxWidth : intrinsicWidth;
    return {
      width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, distributedWidth)),
      height: visualNumber(node.layout?.height ?? node.props?.height, tokens, sum(rowHeights) + rowGap * Math.max(0, rowHeights.length - 1)),
    };
  }
  if (kind === "stack" || kind === "overlay") {
    const intrinsicWidth = Math.min(maxWidth, Math.max(...children.map(({ width }) => width), 0));
    const intrinsicHeight = Math.max(...children.map(({ height }) => height), 0);
    return { width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, intrinsicWidth)), height: visualNumber(node.layout?.height ?? node.props?.height, tokens, intrinsicHeight) };
  }
  const intrinsicWidth = sum(children.map(({ width }) => width)) + columnGap * Math.max(0, children.length - 1);
  const distributedWidth = root && node.layout?.distribute && node.layout.distribute !== "start" ? maxWidth : intrinsicWidth;
  return {
    width: Math.min(maxWidth, visualNumber(node.layout?.width ?? node.props?.width, tokens, distributedWidth)),
    height: visualNumber(node.layout?.height ?? node.props?.height, tokens, Math.max(...children.map(({ height }) => height), 0)),
  };
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
    ...(node.label ? { label: node.label, labelBounds: labelBounds(node, own, context.theme, context.tokens) } : {}),
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
  const declaredGap = gapFor(node.layout?.gap, context.tokens);
  const columnGap = Math.max(root ? context.rootColumnGap : context.minimumGap, declaredGap);
  const rowGap = Math.max(root ? context.rootRowGap : context.minimumGap, declaredGap);
  const sizes = node.children.map((child) => measure(child, width, strategy, context.minimumGap, false, context.rootColumnGap, context.rootRowGap, context.theme, context.tokens));
  const kind = effectiveLayout(node.layout?.kind ?? "row", strategy, root, sizes, width, columnGap);
  const cellWidth = kind === "grid" ? Math.max(...sizes.map(({ width }) => width), 0) : 0;
  const columns = kind === "grid" ? gridColumns(node, strategy, width, sizes.length, cellWidth, columnGap) : 1;
  const rowHeights = kind === "grid" ? gridRowHeights(sizes, columns) : [];
  const layoutAlign = node.layout?.align ?? "center";
  const layoutDistribute = node.layout?.distribute ?? "start";
  const rowDistribution = distribution(width, sizes.map(({ width: childWidth }) => childWidth), columnGap, layoutDistribute);
  const columnDistribution = distribution(height, sizes.map(({ height: childHeight }) => childHeight), rowGap, layoutDistribute);
  const gridColumnCount = Math.min(columns, sizes.length);
  const gridDistribution = distribution(width, Array.from({ length: gridColumnCount }, () => cellWidth), columnGap, layoutDistribute);
  let cursorX = x + rowDistribution.offset;
  let cursorY = y + columnDistribution.offset;
  node.children.forEach((child, index) => {
    const size = sizes[index]!;
    let childX = cursorX;
    let childY = cursorY;
    if (kind === "column") {
      const cross = alignedPlacement(x, width, size.width, layoutAlign);
      childX = cross.position;
      cursorY += size.height + columnDistribution.gap;
      if (layoutAlign === "stretch") size.width = cross.size;
    }
    else if (kind === "grid") {
      const row = Math.floor(index / columns);
      const itemsInRow = Math.min(columns, node.children!.length - row * columns);
      const unusedColumns = columns - itemsInRow;
      const rowOffset = layoutDistribute === "start" ? unusedColumns * (cellWidth + gridDistribution.gap) / 2 : 0;
      const cellX = x + gridDistribution.offset + rowOffset + (index % columns) * (cellWidth + gridDistribution.gap);
      const cellY = y + sum(rowHeights.slice(0, row)) + row * rowGap;
      const horizontal = alignedPlacement(cellX, cellWidth, size.width, layoutAlign);
      const vertical = alignedPlacement(cellY, rowHeights[row]!, size.height, layoutAlign);
      childX = horizontal.position;
      childY = vertical.position;
      if (layoutAlign === "stretch") { size.width = horizontal.size; size.height = vertical.size; }
    } else if (kind === "stack" || kind === "overlay") {
      const horizontal = alignedPlacement(x, width, size.width, layoutAlign);
      const vertical = alignedPlacement(y, height, size.height, layoutAlign);
      childX = horizontal.position;
      childY = vertical.position;
      if (layoutAlign === "stretch") { size.width = horizontal.size; size.height = vertical.size; }
    } else {
      const cross = alignedPlacement(y, height, size.height, layoutAlign);
      childY = cross.position;
      cursorX += size.width + rowDistribution.gap;
      if (layoutAlign === "stretch") size.height = cross.size;
    }
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
    const deltaX = Math.abs((to.x + to.width / 2) - (from.x + from.width / 2));
    const deltaY = Math.abs((to.y + to.height / 2) - (from.y + from.height / 2));
    const vertical = deltaY > deltaX;
    const automaticFrom = vertical ? (to.y >= from.y ? "bottom" : "top") : (to.x >= from.x ? "right" : "left");
    const automaticTo = vertical ? (to.y >= from.y ? "top" : "bottom") : (to.x >= from.x ? "left" : "right");
    const fromSide = responsiveAnchor(connector.from.anchor, automaticFrom, deltaX, deltaY);
    const toSide = responsiveAnchor(connector.to.anchor, automaticTo, deltaX, deltaY);
    const start = pointFor(from, fromSide);
    const end = pointFor(to, toSide);
    const candidates = routeCandidates(start, end, fromSide, toSide, width, height, padding, index, context.channels);
    const board = { x: 0, y: 0, width, height };
    const ranked = candidates.flatMap((points) => {
      if (!routeClear(points, context, connector.from.node, connector.to.node)) return [];
      const channels = channelsForRoute(points, context.channels);
      if (!routeCovered(points, channels, context, connector.from.node, connector.to.node)) return [];
      const label = connector.label ? placeConnectorLabel(connector.label, points, context.envelopes, reservedLabels, board, context.tokens) : undefined;
      if (connector.label && !label) return [];
      return [{ points, channels, label, cost: routeCost(points, channels, solved) }];
    }).sort((a, b) => a.cost - b.cost);
    const choice = ranked[0];
    const points = choice?.points ?? candidates.at(-1)!;
    const channels = choice?.channels ?? channelsForRoute(points, context.channels);
    const channelIds = channels.map(({ id }) => id);
    const label = choice?.label ?? (connector.label ? fallbackConnectorLabel(connector.label, points, board, context.tokens) : undefined);
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
      ...(connector.variant ? { variant: connector.variant } : {}),
      ...(connector.tone ? { tone: connector.tone } : {}),
      ...(connector.style ? { style: connector.style } : {}),
      channelIds,
    });
  });
  return solved;
}

function routeCandidates(start: BoardPoint, end: BoardPoint, from: AnchorName, to: AnchorName, width: number, height: number, padding: number, index: number, channels: RouteChannel[]): BoardPoint[][] {
  const middleX = (start.x + end.x) / 2;
  const middleY = (start.y + end.y) / 2;
  const outerY = height - padding / 2 - 10 - index * 3;
  const outerX = width - padding / 2 - 10 - index * 3;
  const startLead = lead(start, from, 12);
  const endLead = lead(end, to, 12);
  const horizontalCorridors = corridorCenters(channels, "horizontal", middleY);
  const verticalCorridors = corridorCenters(channels, "vertical", middleX);
  return [
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
  ].map(compactPoints).filter((points) => validEndpointDirections(points, from, to));
}

function corridorCenters(channels: RouteChannel[], axis: RouteChannel["axis"], target: number) {
  const centers = channels
    .filter((channel) => channel.axis === axis)
    .map((channel) => axis === "horizontal" ? channel.y + channel.height / 2 : channel.x + channel.width / 2);
  return [...new Set(centers)].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b).slice(0, 24);
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

function responsiveAnchor(anchor: AnchorName | undefined, fallback: AnchorName, deltaX: number, deltaY: number) {
  if (!anchor || anchor === "center") return fallback;
  const separation = anchor === "left" || anchor === "right" ? deltaX : deltaY;
  const perpendicular = anchor === "left" || anchor === "right" ? deltaY : deltaX;
  return separation >= perpendicular * MIN_ANCHOR_AXIS_RATIO ? anchor : fallback;
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
  const detailOffset = hasComponentDetail(recipe) ? (geometry?.detailWidth ?? 24) + (geometry?.labelGap ?? 10) : 0;
  const x = bounds.x + paddingX + detailOffset;
  const width = Math.max(1, bounds.x + bounds.width - paddingX - x);
  const fontSize = visualNumber(node.style?.fontSize ?? recipe.typography?.fontSize, tokens, tokenNumber(tokens, "type.body", 13));
  const lineHeight = Math.max(visualNumber(recipe.typography?.lineHeight, tokens, Math.ceil(fontSize * 1.38)), Math.ceil(fontSize * 1.1));
  const fontWeight = Number(resolveVisualValue(node.style?.fontWeight ?? recipe.typography?.fontWeight, tokens) ?? 650);
  const height = measureVisualTextBlock(node.label ?? node.id, width, { fontSize, fontWeight, lineHeight }).height;
  return { x, y: bounds.y + (bounds.height - height) / 2, width, height };
}

function placeConnectorLabel(text: string, points: BoardPoint[], envelopes: CollisionEnvelope[], reserved: BoardRect[], board: BoardRect, tokens: TokenOverrides) {
  const fontSize = tokenNumber(tokens, "type.caption", 10);
  const width = measureVisualText(text, { fontSize, fontWeight: 600 }) + 8;
  const height = Math.max(16, Math.ceil(fontSize * 1.2) + 4);
  const segments = points.slice(1).map((point, index) => ({ a: points[index]!, b: point })).sort((a, b) => distance(b.a, b.b) - distance(a.a, a.b));
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
    const available = attached.find((rect) => containsRect(board, rect) && envelopes.every((envelope) => !intersects(rect, envelope)) && reserved.every((label) => !intersects(rect, label)));
    if (available) return available;
  }
  return undefined;
}

function fallbackConnectorLabel(text: string, points: BoardPoint[], board: BoardRect, tokens: TokenOverrides) { const fontSize = tokenNumber(tokens, "type.caption", 10); const width = measureVisualText(text, { fontSize, fontWeight: 600 }) + 8; const height = Math.max(16, Math.ceil(fontSize * 1.2) + 4); const center = midpoint(points[0]!, points.at(-1)!); return { text, x: Math.max(0, Math.min(board.width - width, center.x - width / 2)), y: Math.max(0, Math.min(board.height - height, center.y - height / 2)), width, height }; }

function tracksFor(envelopes: CollisionEnvelope[], axis: "x" | "y"): BoardTrack[] {
  const values = [...new Set(envelopes.map((envelope) => envelope[axis]))].sort((a, b) => a - b);
  return values.map((position, index) => ({ id: `${axis === "x" ? "column" : "row"}.${index}`, index, position, size: Math.max(...envelopes.filter((envelope) => envelope[axis] === position).map((envelope) => axis === "x" ? envelope.width : envelope.height), 0) }));
}

function gridColumns(node: VisualNode, strategy: Strategy, maxWidth: number, count: number, cellWidth = 0, gap = 0) {
  if (strategy !== "alternate_spans") return Math.max(1, node.layout?.columns ?? Math.ceil(Math.sqrt(count)));
  return Math.max(1, Math.min(count, Math.floor((maxWidth + gap + 0.01) / Math.max(1, cellWidth + gap))));
}
function gridRowHeights(sizes: Size[], columns: number) {
  return Array.from({ length: Math.ceil(sizes.length / columns) }, (_, row) => Math.max(...sizes.slice(row * columns, (row + 1) * columns).map(({ height }) => height), 0));
}
function lead(point: BoardPoint, side: AnchorName, amount: number): BoardPoint { const direction = directionFor(side); return { x: point.x + direction.x * amount, y: point.y + direction.y * amount }; }
function compactPoints(points: BoardPoint[]) { return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y); }
function midpoint(a: BoardPoint, b: BoardPoint) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
function distance(a: BoardPoint, b: BoardPoint) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function tokenNumber(tokens: TokenOverrides, name: string, fallback: number) { const value = tokens[name]; return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function visualNumber(value: VisualValue | undefined, tokens: TokenOverrides, fallback: number) { const resolved = resolveVisualValue(value, tokens); return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : fallback; }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function gapFor(value: VisualValue | undefined, tokens: TokenOverrides) { return visualNumber(value, tokens, DEFAULT_GAP); }
function countNodes(node: VisualNode): number { return 1 + (node.children?.reduce((total, child) => total + countNodes(child), 0) ?? 0); }
function inflate(rect: BoardRect, amount: number): BoardRect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }; }
function containsPoint(rect: BoardRect, point: BoardPoint) { return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height; }
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
function candidateCost(strategy: Strategy, scene: BoardScene, metrics: ReturnType<typeof validateBoardScene>["metrics"]) {
  const strategyPenalty = [0, 80, 160, 360, 520][STRATEGIES.indexOf(strategy)] ?? 700;
  const sparsePenalty = Math.max(0, 0.24 - metrics.occupancyRatio) * 1800;
  return strategyPenalty + scene.board.height * 1.5 + metrics.crossingCount * 5000 + metrics.bendCount * 16 + Math.max(0, metrics.normalizedRouteLength - 1) * 120 + metrics.aspectImbalance * 180 + metrics.whitespaceImbalance * 900 + sparsePenalty;
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
function issue(code: LayoutViolationCode | "layout.no_valid_candidate" | "layout.resource_limit", message: string, elementIds?: string[]): LayoutDiagnostic { return { code, message, severity: "error", ...(elementIds ? { elementIds } : {}) }; }
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
