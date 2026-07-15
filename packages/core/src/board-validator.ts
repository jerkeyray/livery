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
    else if (!containsRect(sceneBounds, rect)) diagnostics.push(issue("layout.out_of_bounds", `${id} extends outside the board.`, [id]));
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
  }

  const componentByOwner = new Map(components.map((envelope) => [envelope.owner, envelope]));
  for (const connector of scene.connectors) validateConnector(connector, scene, componentByOwner, diagnostics);
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
  const contentBounds = unionRects([...components, ...labels.map(({ rect }) => rect)]);
  return {
    valid: diagnostics.length === 0,
    diagnostics,
    metrics: {
      elementCount: scene.elements.length,
      connectorCount: scene.connectors.length,
      crossingCount: countCrossings(scene.connectors),
      occupiedArea,
      occupancyRatio: occupiedArea / Math.max(1, scene.board.width * scene.board.height),
      routeLength,
      normalizedRouteLength: routeLength / Math.max(1, directRouteLength),
      bendCount: scene.connectors.reduce((total, connector) => total + Math.max(0, connector.points.length - 2), 0),
      aspectImbalance: contentBounds ? Math.abs(Math.log(Math.max(0.01, contentBounds.width / Math.max(1, contentBounds.height)) / Math.max(0.01, scene.board.width / Math.max(1, scene.board.height)))) : 0,
      whitespaceImbalance: contentBounds ? Math.abs((contentBounds.x + contentBounds.width / 2) - scene.board.width / 2) / scene.board.width + Math.abs((contentBounds.y + contentBounds.height / 2) - scene.board.height / 2) / scene.board.height : 0,
    },
  };
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

function finitePoint(point: BoardPoint) { return Number.isFinite(point.x) && Number.isFinite(point.y); }
function finiteRect(rect: BoardRect) { return finitePoint(rect) && Number.isFinite(rect.width) && Number.isFinite(rect.height) && rect.width >= 0 && rect.height >= 0; }
function containsRect(outer: BoardRect, inner: BoardRect) { return inner.x >= outer.x - EPSILON && inner.y >= outer.y - EPSILON && inner.x + inner.width <= outer.x + outer.width + EPSILON && inner.y + inner.height <= outer.y + outer.height + EPSILON; }
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

function countCrossings(connectors: BoardConnector[]) {
  const segments = connectors.flatMap((connector) => connector.points.slice(1).map((point, index) => ({ id: connector.id, a: connector.points[index]!, b: point })));
  let crossings = 0;
  for (let first = 0; first < segments.length; first += 1) for (let second = first + 1; second < segments.length; second += 1) {
    if (segments[first]!.id !== segments[second]!.id && segmentsCross(segments[first]!.a, segments[first]!.b, segments[second]!.a, segments[second]!.b)) crossings += 1;
  }
  return crossings;
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
