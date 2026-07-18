import type {
  BoardConnector,
  BoardPoint,
  BoardRect,
  BoardScene,
  CollisionEnvelope,
  LayoutDiagnostic,
  ValidationReport,
} from "./board.js";

const EPSILON = 0.01;

export function validateBoardScene(scene: BoardScene): ValidationReport {
  const diagnostics: LayoutDiagnostic[] = [];
  const sceneBounds = { x: 0, y: 0, width: scene.board.width, height: scene.board.height };
  const ids = collectIds(scene);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) diagnostics.push(issue("layout.duplicate_id", `Solved scene contains duplicate id ${id}.`, [id]));
    seen.add(id);
  }

  for (const [id, rect] of allRects(scene)) {
    if (!finiteRect(rect)) diagnostics.push(issue("layout.non_finite_geometry", `${id} has non-finite geometry.`, [id]));
    else if (!containsRect(sceneBounds, rect)) diagnostics.push(issue("layout.out_of_bounds", `${id} extends outside the ${scene.board.width}×${scene.board.height} board at (${Math.round(rect.x)}, ${Math.round(rect.y)}, ${Math.round(rect.width)}, ${Math.round(rect.height)}).`, [id]));
  }

  const components = scene.envelopes.filter(({ kind }) => kind === "component" || kind === "canvas");
  for (let first = 0; first < components.length; first += 1) {
    for (let second = first + 1; second < components.length; second += 1) {
      const a = components[first]!;
      const b = components[second]!;
      if (sharesDeclaredOverlap(a, b)) continue;
      if (intersects(a, b)) diagnostics.push(issue("layout.component_collision", `${a.owner} overlaps ${b.owner}.`, [a.owner, b.owner]));
    }
  }

  for (const element of scene.elements) {
    if (element.labelBounds && !containsRect(element.bounds, element.labelBounds)) {
      diagnostics.push(issue("layout.text_overflow", `Label for ${element.id} does not fit its component.`, [element.id]));
    }
    if (element.kind === "frame") {
      const descendantCount = scene.elements.filter(({ id }) => id !== element.id && belongsTo(id, element.id, scene)).length;
      const aspectRatio = Math.max(element.bounds.width / Math.max(1, element.bounds.height), element.bounds.height / Math.max(1, element.bounds.width));
      const hierarchyReflow = element.layoutKind === "hierarchy";
      if (!hierarchyReflow && descendantCount >= 5 && aspectRatio > 3.2) {
        diagnostics.push(issue("layout.excessive_aspect_ratio", `Frame ${element.id} is too tall or wide for ${descendantCount} nested elements; split it into compact stages or short rows.`, [element.id]));
      }
    }
  }

  const componentByOwner = new Map(components.map((envelope) => [envelope.owner, envelope]));
  for (const connector of scene.connectors) validateConnector(connector, scene, componentByOwner, diagnostics);
  const routeInteractions = connectorInteractions(scene.connectors);
  for (const interaction of routeInteractions.conflicts) {
    diagnostics.push(issue(interaction.kind === "crossing" ? "layout.connector_crossing" : "layout.connector_overlap", `Connectors ${interaction.first} and ${interaction.second} ${interaction.kind === "crossing" ? "cross" : "share an overlapping segment"}.`, [interaction.first, interaction.second]));
  }
  for (const channel of scene.board.channels) if (channel.used > channel.capacity) diagnostics.push(issue("layout.channel_capacity", `${channel.id} exceeds routing capacity ${channel.capacity}.`, [channel.id]));

  const labels = scene.connectors.flatMap((connector) => connector.label ? [{ connector, rect: connector.label }] : []);
  for (let first = 0; first < labels.length; first += 1) {
    for (let second = first + 1; second < labels.length; second += 1) {
      if (intersects(labels[first]!.rect, labels[second]!.rect)) diagnostics.push(issue("layout.connector_label_collision", `Connector labels ${labels[first]!.connector.id} and ${labels[second]!.connector.id} overlap.`, [labels[first]!.connector.id, labels[second]!.connector.id]));
    }
  }

  for (const canvas of scene.canvases) {
    const allowed = inflate(canvas.bounds, canvas.bleed);
    for (const primitive of canvas.primitives) {
      if (!containsRect(allowed, primitive.visualBounds)) diagnostics.push(issue("layout.canvas_bleed", `${primitive.id} exceeds canvas ${canvas.id} bleed.`, [canvas.id, primitive.id]));
    }
  }

  for (const motion of scene.timelineEnvelopes) {
    const owner = scene.elements.find(({ id }) => id === motion.owner);
    if (owner && !containsRect(motion, owner.visualBounds)) diagnostics.push(issue("layout.motion_outside_envelope", `${motion.owner} exceeds its timeline envelope.`, [motion.id, motion.owner]));
    const owningCanvas = scene.canvases.find((canvas) => canvas.primitives.some(({ id }) => id === motion.owner));
    if (owningCanvas && !containsRect(inflate(owningCanvas.bounds, owningCanvas.bleed), motion)) diagnostics.push(issue("layout.canvas_bleed", `Motion for ${motion.owner} exceeds canvas ${owningCanvas.id} bleed.`, [owningCanvas.id, motion.owner]));
    for (const envelope of components) {
      const ownerEnvelope = components.find(({ owner }) => owner === motion.owner || owner === owningCanvas?.owner);
      if (envelope.owner !== motion.owner && envelope.owner !== owningCanvas?.owner && !(ownerEnvelope && sharesDeclaredOverlap(ownerEnvelope, envelope)) && intersects(motion, envelope)) diagnostics.push(issue("layout.component_collision", `Motion for ${motion.owner} overlaps ${envelope.owner}.`, [motion.owner, envelope.owner]));
    }
  }

  if (new Set(scene.readingOrder).size !== scene.readingOrder.length || scene.readingOrder.some((id) => !scene.elements.some((element) => element.id === id))) {
    diagnostics.push(issue("layout.invalid_reading_order", "Reading order must contain unique solved element ids.", scene.readingOrder));
  }

  const occupiedArea = components.reduce((sum, envelope) => sum + envelope.width * envelope.height, 0);
  const routeLength = scene.connectors.reduce((total, connector) => total + connector.points.slice(1).reduce((length, point, index) => length + manhattan(connector.points[index]!, point), 0), 0);
  const directRouteLength = scene.connectors.reduce((total, connector) => total + manhattan(connector.points[0]!, connector.points.at(-1)!), 0);
  const routeRatios = scene.connectors.map((connector) => {
    const length = connector.points.slice(1).reduce((total, point, index) => total + manhattan(connector.points[index]!, point), 0);
    return length / Math.max(1, manhattan(connector.points[0]!, connector.points.at(-1)!));
  });
  const contentBounds = unionRects([...components, ...labels.map(({ rect }) => rect)]);
  const progression = progressionMetrics(scene);
  const congestionScore = scene.board.channels.length ? Math.max(...scene.board.channels.map(({ used, capacity }) => used / Math.max(1, capacity))) : 0;
  const occupancyRatio = occupiedArea / Math.max(1, scene.board.width * scene.board.height);
  const densityPenalty = occupancyRatio < 0.12 ? (0.12 - occupancyRatio) / 0.12 : occupancyRatio > 0.72 ? (occupancyRatio - 0.72) / 0.28 : 0;
  if (progression.backtrackingCount >= Math.max(2, Math.ceil(scene.connectors.length * 0.4))) diagnostics.push(advisory("layout.excessive_backtracking", "Connector routes repeatedly backtrack against the diagram reading direction.", progression.backtrackingIds));
  if (progression.rankErrorCount >= Math.max(2, Math.ceil(scene.connectors.length * 0.4))) diagnostics.push(advisory("layout.poor_rank_progression", "Too many connectors oppose the dominant rank progression.", progression.rankErrorIds));
  if (congestionScore > 0.9) diagnostics.push(advisory("layout.route_congestion", "Routing channels are too congested for a readable diagram.", scene.connectors.map(({ id }) => id)));
  if (components.length >= 4 && densityPenalty > 0.8) diagnostics.push(advisory("layout.poor_density", "The diagram density is outside the readable target range.", components.map(({ owner }) => owner)));
  if (progression.primaryCount >= 2 && progression.primaryContinuity < 0.5) diagnostics.push(advisory("layout.broken_primary_continuity", "The primary reading spine is visually discontinuous.", scene.connectors.filter(({ role }) => role === "primary").map(({ id }) => id)));
  return {
    valid: !diagnostics.some(({ severity }) => severity === "error"),
    diagnostics,
    metrics: {
      elementCount: scene.elements.length,
      connectorCount: scene.connectors.length,
      crossingCount: routeInteractions.crossingCount,
      overlappingSegmentCount: routeInteractions.overlappingSegmentCount,
      occupiedArea,
      occupancyRatio,
      routeLength,
      normalizedRouteLength: routeLength / Math.max(1, directRouteLength),
      maximumNormalizedRouteLength: Math.max(1, ...routeRatios),
      bendCount: scene.connectors.reduce((total, connector) => total + Math.max(0, connector.points.length - 2), 0),
      aspectImbalance: contentBounds ? Math.abs(Math.log(Math.max(0.01, contentBounds.width / Math.max(1, contentBounds.height)) / Math.max(0.01, scene.board.width / Math.max(1, scene.board.height)))) : 0,
      whitespaceImbalance: contentBounds ? Math.abs((contentBounds.x + contentBounds.width / 2) - scene.board.width / 2) / scene.board.width + Math.abs((contentBounds.y + contentBounds.height / 2) - scene.board.height / 2) / scene.board.height : 0,
      topologyDeviation: 0,
      backtrackingCount: progression.backtrackingCount,
      rankErrorCount: progression.rankErrorCount,
      congestionScore,
      densityPenalty,
      primaryContinuity: progression.primaryContinuity,
    },
  };
}

function progressionMetrics(scene: BoardScene) {
  const elements = new Map(scene.elements.map((element) => [element.id, element]));
  const considered = scene.connectors.filter(({ role }) => role !== "supporting");
  const deltas = considered.flatMap((connector) => {
    const from = elements.get(connector.from)?.bounds;
    const to = elements.get(connector.to)?.bounds;
    return from && to ? [{ connector, x: to.x + to.width / 2 - from.x - from.width / 2, y: to.y + to.height / 2 - from.y - from.height / 2 }] : [];
  });
  const horizontal = deltas.reduce((sum, delta) => sum + Math.abs(delta.x), 0) >= deltas.reduce((sum, delta) => sum + Math.abs(delta.y), 0);
  const signedTotal = deltas.reduce((sum, delta) => sum + (horizontal ? delta.x : delta.y), 0);
  const sign = signedTotal < 0 ? -1 : 1;
  const rankErrors = deltas.filter((delta) => (horizontal ? delta.x : delta.y) * sign < -0.01).map(({ connector }) => connector.id);
  // Supporting and feedback routes are intentionally allowed to leave the
  // primary reading axis. Counting those local branches as backtracking makes
  // a tall, sparse candidate beat a compact primary-spine layout.
  const backtrackingIds = considered.filter((connector) => !connector.feedback && connector.points.slice(1).some((point, index) => {
    const previous = connector.points[index]!;
    return (horizontal ? point.x - previous.x : point.y - previous.y) * sign < -0.01;
  })).map(({ id }) => id);
  const primary = scene.connectors.filter(({ role }) => role === "primary");
  const primaryContinuity = primary.length ? primary.filter((connector) => {
    const length = connector.points.slice(1).reduce((sum, point, index) => sum + manhattan(connector.points[index]!, point), 0);
    const direct = manhattan(connector.points[0]!, connector.points.at(-1)!);
    return length / Math.max(1, direct) <= 1.75 && connector.points.length <= 5;
  }).length / primary.length : 1;
  return { backtrackingCount: backtrackingIds.length, backtrackingIds, rankErrorCount: rankErrors.length, rankErrorIds: rankErrors, primaryCount: primary.length, primaryContinuity };
}

function sharesDeclaredOverlap(first: CollisionEnvelope, second: CollisionEnvelope) {
  if (first.overlapGroup && first.overlapGroup === second.overlapGroup) return true;
  const firstGroups = new Set(first.overlapGroups ?? []);
  return (second.overlapGroups ?? []).some((group) => firstGroups.has(group));
}

function validateConnector(
  connector: BoardConnector,
  scene: BoardScene,
  components: Map<string, CollisionEnvelope>,
  diagnostics: LayoutDiagnostic[],
) {
  if (connector.points.length < 2 || connector.points.some((point) => !finitePoint(point))) {
    diagnostics.push(issue("layout.non_finite_geometry", `Connector ${connector.id} has invalid points.`, [connector.id]));
    return;
  }
  const boardBounds = { x: 0, y: 0, width: scene.board.width, height: scene.board.height };
  if (connector.points.some((point) => !containsPoint(boardBounds, point))) diagnostics.push(issue("layout.out_of_bounds", `Connector ${connector.id} leaves the board.`, [connector.id]));
  const segments = connector.points.slice(1).map((point, index) => [connector.points[index]!, point] as const);
  const routeLength = segments.reduce((total, [from, to]) => total + manhattan(from, to), 0);
  const directLength = manhattan(connector.points[0]!, connector.points.at(-1)!);
  if (!connector.feedback && connector.variant !== "advisory" && !connector.bundleId?.startsWith("hierarchy.") && directLength > 0 && routeLength - directLength > 120 && routeLength / directLength > 4) {
    diagnostics.push(issue("layout.excessive_route_detour", `${connector.id} takes an excessive detour; reflow the endpoints or use responsive anchors.`, [connector.id]));
  }
  for (const [from, to] of segments) {
    if (Math.abs(from.x - to.x) > EPSILON && Math.abs(from.y - to.y) > EPSILON) {
      diagnostics.push(issue("layout.non_orthogonal_route", `${connector.id} contains a diagonal routing segment.`, [connector.id]));
    }
    const segmentBounds = rectForSegment(from, to, 1);
    for (const envelope of components.values()) {
      if (belongsTo(envelope.owner, connector.from, scene) || belongsTo(envelope.owner, connector.to, scene)) continue;
      if (intersects(segmentBounds, envelope)) diagnostics.push(issue("layout.connector_hits_component", `${connector.id} crosses ${envelope.owner}.`, [connector.id, envelope.owner]));
    }
  }
  if (connector.label) {
    for (const envelope of components.values()) {
      if (intersects(connector.label, envelope)) diagnostics.push(issue("layout.connector_label_collision", `Label for ${connector.id} overlaps ${envelope.owner}.`, [connector.id, envelope.owner]));
    }
    for (const frame of scene.elements.filter(({ kind }) => kind === "frame")) {
      const safeInterior = inset(frame.bounds, 4);
      if (intersects(connector.label, inflate(frame.bounds, 4)) && !containsRect(safeInterior, connector.label)) {
        diagnostics.push(issue("layout.connector_label_collision", `Label for ${connector.id} crosses the boundary of frame ${frame.id}.`, [connector.id, frame.id]));
      }
      if (frame.labelBounds && intersects(connector.label, inflate(frame.labelBounds, 4))) {
        diagnostics.push(issue("layout.connector_label_collision", `Label for ${connector.id} overlaps the heading of frame ${frame.id}.`, [connector.id, frame.id]));
      }
    }
  }
  const target = scene.elements.find(({ id }) => id === connector.to) ?? scene.canvases.flatMap(({ primitives }) => primitives).find(({ id }) => id === connector.to);
  const pin = target?.pins.find(({ id }) => id === connector.toPin);
  const source = scene.elements.find(({ id }) => id === connector.from) ?? scene.canvases.flatMap(({ primitives }) => primitives).find(({ id }) => id === connector.from);
  const sourcePin = source?.pins.find(({ id }) => id === connector.fromPin);
  if (sourcePin && distanceSquared(sourcePin.point, connector.points[0]!) > EPSILON) diagnostics.push(issue("layout.invalid_pin_approach", `${connector.id} does not start at ${sourcePin.id}.`, [connector.id, sourcePin.id]));
  if (pin && distanceSquared(pin.point, connector.points.at(-1)!) > EPSILON) diagnostics.push(issue("layout.invalid_pin_approach", `${connector.id} does not end at ${pin.id}.`, [connector.id, pin.id]));
  if (target && pin) {
    const last = connector.points.at(-1)!;
    const previous = connector.points.at(-2)!;
    const approach = { x: last.x - previous.x, y: last.y - previous.y };
    if (dot(approach, pin.direction) >= -EPSILON) diagnostics.push(issue("layout.invalid_pin_approach", `${connector.id} approaches ${target.id} from the wrong direction.`, [connector.id, target.id]));
  }
  if (connector.channelIds.length) {
    const channels = connector.channelIds.flatMap((channelId) => scene.board.channels.filter(({ id }) => id === channelId));
    for (const channelId of connector.channelIds) {
      if (!scene.board.channels.some(({ id }) => id === channelId)) diagnostics.push(issue("layout.connector_outside_channel", `${connector.id} references missing channel ${channelId}.`, [connector.id, channelId]));
    }
    const endpointBounds: BoardRect[] = [
      ...[...components.values()].filter((envelope) => belongsTo(envelope.owner, connector.from, scene) || belongsTo(envelope.owner, connector.to, scene)),
      ...scene.elements.filter(({ id }) => id === connector.from || id === connector.to).map(({ bounds }) => bounds),
      ...scene.canvases.flatMap(({ primitives }) => primitives.filter(({ id }) => id === connector.from || id === connector.to).map(({ bounds }) => bounds)),
    ];
    for (const [from, to] of segments) {
      const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      if (!channels.some((channel) => containsPoint(channel, midpoint)) && !endpointBounds.some((bounds) => containsPoint(bounds, midpoint))) {
        diagnostics.push(issue("layout.connector_outside_channel", `${connector.id} leaves its allocated routing channels.`, [connector.id]));
        break;
      }
    }
  }
}

function collectIds(scene: BoardScene) {
  return [
    ...scene.elements.map(({ id }) => id),
    ...scene.connectors.map(({ id }) => id),
    ...scene.canvases.map(({ id }) => id),
    ...scene.canvases.flatMap(({ primitives }) => primitives.map(({ id }) => id)),
    ...scene.envelopes.map(({ id }) => id),
    ...scene.timelineEnvelopes.map(({ id }) => id),
  ];
}

function allRects(scene: BoardScene): Array<[string, BoardRect]> {
  return [
    ...scene.elements.flatMap((element): Array<[string, BoardRect]> => [[element.id, element.bounds], [`${element.id}:visual`, element.visualBounds], ...(element.labelBounds ? [[`${element.id}:label`, element.labelBounds] as [string, BoardRect]] : [])]),
    ...scene.connectors.flatMap((connector): Array<[string, BoardRect]> => connector.label ? [[`${connector.id}:label`, connector.label]] : []),
    ...scene.canvases.map((canvas): [string, BoardRect] => [canvas.id, canvas.bounds]),
    ...scene.canvases.flatMap(({ primitives }): Array<[string, BoardRect]> => primitives.flatMap((primitive) => [[primitive.id, primitive.bounds], [`${primitive.id}:visual`, primitive.visualBounds]])),
    ...scene.envelopes.map((envelope): [string, BoardRect] => [envelope.id, envelope]),
    ...scene.timelineEnvelopes.map((envelope): [string, BoardRect] => [envelope.id, envelope]),
  ];
}

function issue(code: LayoutDiagnostic["code"], message: string, elementIds: string[]): LayoutDiagnostic {
  return { code, message, severity: "error", elementIds };
}
function advisory(code: LayoutDiagnostic["code"], message: string, elementIds: string[]): LayoutDiagnostic {
  return { code, message, severity: "warning", elementIds };
}

function finitePoint(point: BoardPoint) { return Number.isFinite(point.x) && Number.isFinite(point.y); }
function finiteRect(rect: BoardRect) { return finitePoint(rect) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width >= 0 && rect.height >= 0; }
function containsRect(outer: BoardRect, inner: BoardRect) { return inner.x >= outer.x - EPSILON && inner.y >= outer.y - EPSILON && inner.x + inner.width <= outer.x + outer.width + EPSILON && inner.y + inner.height <= outer.y + outer.height + EPSILON; }
function inset(rect: BoardRect, amount: number): BoardRect { return { x: rect.x + amount, y: rect.y + amount, width: Math.max(0, rect.width - amount * 2), height: Math.max(0, rect.height - amount * 2) }; }
function containsPoint(rect: BoardRect, point: BoardPoint) { return point.x >= rect.x - EPSILON && point.x <= rect.x + rect.width + EPSILON && point.y >= rect.y - EPSILON && point.y <= rect.y + rect.height + EPSILON; }
function intersects(a: BoardRect, b: BoardRect) { return a.x < b.x + b.width - EPSILON && a.x + a.width > b.x + EPSILON && a.y < b.y + b.height - EPSILON && a.y + a.height > b.y + EPSILON; }
function inflate(rect: BoardRect, amount: number): BoardRect { return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 }; }
function rectForSegment(a: BoardPoint, b: BoardPoint, width: number): BoardRect { return { x: Math.min(a.x, b.x) - width / 2, y: Math.min(a.y, b.y) - width / 2, width: Math.abs(a.x - b.x) + width, height: Math.abs(a.y - b.y) + width }; }
function dot(a: BoardPoint, b: BoardPoint) { return a.x * b.x + a.y * b.y; }
function distanceSquared(a: BoardPoint, b: BoardPoint) { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
function manhattan(a: BoardPoint, b: BoardPoint) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
function unionRects(rects: BoardRect[]) {
  if (!rects.length) return undefined;
  const left = Math.min(...rects.map(({ x }) => x));
  const top = Math.min(...rects.map(({ y }) => y));
  const right = Math.max(...rects.map(({ x, width }) => x + width));
  const bottom = Math.max(...rects.map(({ y, height }) => y + height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
function belongsTo(elementId: string, ownerId: string, scene: BoardScene) { let current = scene.elements.find(({ id }) => id === elementId); while (current) { if (current.id === ownerId) return true; current = current.parent ? scene.elements.find(({ id }) => id === current!.parent) : undefined; } return scene.canvases.some((canvas) => canvas.owner === elementId && canvas.primitives.some(({ id }) => id === ownerId)); }

function connectorInteractions(connectors: BoardConnector[]) {
  const conflicts: Array<{ first: string; second: string; kind: "crossing" | "overlap" }> = [];
  let crossingCount = 0;
  let overlappingSegmentCount = 0;
  for (let first = 0; first < connectors.length; first += 1) for (let second = first + 1; second < connectors.length; second += 1) {
    const a = connectors[first]!;
    const b = connectors[second]!;
    if (a.bundleId && a.bundleId === b.bundleId) continue;
    let crossing = false;
    let overlap = false;
    for (let ai = 1; ai < a.points.length; ai += 1) for (let bi = 1; bi < b.points.length; bi += 1) {
      const aStart = a.points[ai - 1]!;
      const aEnd = a.points[ai]!;
      const bStart = b.points[bi - 1]!;
      const bEnd = b.points[bi]!;
      if (segmentsOverlap(aStart, aEnd, bStart, bEnd) && !sharedEndpointLeadOverlap(a, b, aStart, aEnd, bStart, bEnd)) { overlap = true; overlappingSegmentCount += 1; }
      else if (segmentsCross(aStart, aEnd, bStart, bEnd) || tJunctionPoints(aStart, aEnd, bStart, bEnd).some((point) => !nearSharedEndpoint(a, b, point))) { crossing = true; crossingCount += 1; }
    }
    if (crossing) conflicts.push({ first: a.id, second: b.id, kind: "crossing" });
    if (overlap) conflicts.push({ first: a.id, second: b.id, kind: "overlap" });
  }
  return { conflicts, crossingCount, overlappingSegmentCount };
}

function segmentsCross(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  if ([c, d].some((point) => distanceSquared(a, point) <= EPSILON || distanceSquared(b, point) <= EPSILON)) return false;
  const firstHorizontal = Math.abs(a.y - b.y) <= EPSILON;
  const secondHorizontal = Math.abs(c.y - d.y) <= EPSILON;
  if (firstHorizontal === secondHorizontal) return false;
  const horizontal = firstHorizontal ? [a, b] : [c, d];
  const vertical = firstHorizontal ? [c, d] : [a, b];
  const crossingX = vertical[0]!.x;
  const crossingY = horizontal[0]!.y;
  return crossingX > Math.min(horizontal[0]!.x, horizontal[1]!.x) + EPSILON
    && crossingX < Math.max(horizontal[0]!.x, horizontal[1]!.x) - EPSILON
    && crossingY > Math.min(vertical[0]!.y, vertical[1]!.y) + EPSILON
    && crossingY < Math.max(vertical[0]!.y, vertical[1]!.y) - EPSILON;
}

function tJunctionPoints(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) { return [a, b].filter((point) => pointInsideSegment(point, c, d)).concat([c, d].filter((point) => pointInsideSegment(point, a, b))); }

function pointInsideSegment(point: BoardPoint, start: BoardPoint, end: BoardPoint) {
  if (Math.abs(start.x - end.x) <= EPSILON) return Math.abs(point.x - start.x) <= EPSILON && point.y > Math.min(start.y, end.y) + EPSILON && point.y < Math.max(start.y, end.y) - EPSILON;
  return Math.abs(point.y - start.y) <= EPSILON && point.x > Math.min(start.x, end.x) + EPSILON && point.x < Math.max(start.x, end.x) - EPSILON;
}

function segmentsOverlap(a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const firstHorizontal = Math.abs(a.y - b.y) <= EPSILON;
  const secondHorizontal = Math.abs(c.y - d.y) <= EPSILON;
  if (firstHorizontal !== secondHorizontal) return false;
  if (firstHorizontal) return Math.abs(a.y - c.y) <= EPSILON && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) - Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) > EPSILON;
  return Math.abs(a.x - c.x) <= EPSILON && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) - Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) > EPSILON;
}

function sharedEndpointLeadOverlap(first: BoardConnector, second: BoardConnector, a: BoardPoint, b: BoardPoint, c: BoardPoint, d: BoardPoint) {
  const shared = sharedEndpoint(first, second);
  if (!shared) return false;
  const overlapStart = Math.abs(a.x - b.x) <= EPSILON ? { x: a.x, y: Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) } : { x: Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)), y: a.y };
  const overlapEnd = Math.abs(a.x - b.x) <= EPSILON ? { x: a.x, y: Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) } : { x: Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)), y: a.y };
  return manhattan(shared, overlapStart) <= 12.01 && manhattan(shared, overlapEnd) <= 12.01;
}

function nearSharedEndpoint(first: BoardConnector, second: BoardConnector, point: BoardPoint) { const shared = sharedEndpoint(first, second); return Boolean(shared && manhattan(shared, point) <= 12.01); }
function sharedEndpoint(first: BoardConnector, second: BoardConnector) {
  for (const node of [first.from, first.to]) {
    if (node !== second.from && node !== second.to) continue;
    const firstPoint = node === first.from ? first.points[0]! : first.points.at(-1)!;
    const secondPoint = node === second.from ? second.points[0]! : second.points.at(-1)!;
    if (distanceSquared(firstPoint, secondPoint) <= EPSILON) return firstPoint;
  }
  return undefined;
}
