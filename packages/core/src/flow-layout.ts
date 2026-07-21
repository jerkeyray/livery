import type { Connector, ConnectorRole, FlowDirection, VisualNode } from "./visual.js";

export type FlowItem = {
  node: VisualNode;
  width: number;
  height: number;
};

export type FlowPlacement = {
  index: number;
  rank: number;
  x: number;
  y: number;
};

export type FlowPlan = {
  direction: Exclude<FlowDirection, "auto">;
  width: number;
  height: number;
  placements: FlowPlacement[];
  feedbackConnectorIds: Set<string>;
  primaryNodeIds: Set<string>;
  primaryConnectorIds: Set<string>;
};

type Edge = { connector: Connector; from: number; to: number; weight: number };
type ComponentGraph = { members: number[][]; componentByNode: number[]; edges: Edge[]; dagEdges: Array<{ from: number; to: number; weight: number }> };

export function planFlow(
  items: FlowItem[],
  connectors: Connector[],
  options: { direction: FlowDirection; gap: number; rankGap: number; maxWidth: number; forceDown?: boolean },
): FlowPlan {
  if (!items.length) return { direction: "right", width: 0, height: 0, placements: [], feedbackConnectorIds: new Set(), primaryNodeIds: new Set(), primaryConnectorIds: new Set() };
  const edges = flowEdges(items, connectors);
  const graph = condense(items.length, edges);
  const ranks = assignRanks(graph);
  const orderedRanks = orderRanks(graph, ranks);
  const primaryComponents = primarySpine(graph, ranks);
  const primaryNodeIds = new Set(primaryComponents.flatMap((component) => graph.members[component]!).map((index) => items[index]!.node.id));
  const primaryPairs = new Set(primaryComponents.slice(1).map((component, index) => `${primaryComponents[index]}:${component}`));
  const primaryConnectorIds = new Set(edges.filter((edge) => primaryPairs.has(`${graph.componentByNode[edge.from]}:${graph.componentByNode[edge.to]}`)).map(({ connector }) => connector.id));
  const feedbackConnectorIds = new Set(edges.filter((edge) => {
    const fromComponent = graph.componentByNode[edge.from]!;
    const toComponent = graph.componentByNode[edge.to]!;
    return fromComponent === toComponent ? edge.to <= edge.from : ranks[toComponent]! < ranks[fromComponent]!;
  }).map(({ connector }) => connector.id));
  const rightSize = flowSize(items, orderedRanks, "right", options.gap, options.rankGap, primaryNodeIds);
  const direction = resolveDirection(options.direction, options.forceDown, rightSize.width, rightSize.height, options.maxWidth);
  const size = direction === "right" ? rightSize : flowSize(items, orderedRanks, "down", options.gap, options.rankGap, primaryNodeIds);
  const placements = placeRanks(items, orderedRanks, direction, options.gap, options.rankGap, primaryNodeIds);
  return { direction, ...size, placements, feedbackConnectorIds, primaryNodeIds, primaryConnectorIds };
}

function flowEdges(items: FlowItem[], connectors: Connector[]): Edge[] {
  const owners = new Map<string, number>();
  items.forEach(({ node }, index) => collectIds(node).forEach((id) => owners.set(id, index)));
  return connectors.flatMap((connector) => {
    const from = owners.get(connector.from.node);
    const to = owners.get(connector.to.node);
    return from === undefined || to === undefined || from === to ? [] : [{ connector, from, to, weight: roleWeight(connector.role) }];
  }).sort((a, b) => a.connector.id.localeCompare(b.connector.id));
}

function collectIds(node: VisualNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectIds) ?? [])];
}

function roleWeight(role: ConnectorRole | undefined) {
  if (role === "primary") return 8;
  if (role === "secondary") return 2;
  if (role === "supporting") return 1;
  return 4;
}

function condense(nodeCount: number, edges: Edge[]): ComponentGraph {
  const outgoing = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const edge of edges) outgoing[edge.from]!.push(edge.to);
  outgoing.forEach((targets) => targets.sort((a, b) => a - b));
  let nextIndex = 0;
  const indexes = Array.from({ length: nodeCount }, () => -1);
  const lows = Array.from({ length: nodeCount }, () => -1);
  const stack: number[] = [];
  const active = new Set<number>();
  const members: number[][] = [];
  const visit = (node: number) => {
    indexes[node] = nextIndex;
    lows[node] = nextIndex;
    nextIndex += 1;
    stack.push(node);
    active.add(node);
    for (const target of outgoing[node]!) {
      if (indexes[target] === -1) { visit(target); lows[node] = Math.min(lows[node]!, lows[target]!); }
      else if (active.has(target)) lows[node] = Math.min(lows[node]!, indexes[target]!);
    }
    if (lows[node] !== indexes[node]) return;
    const component: number[] = [];
    while (stack.length) {
      const member = stack.pop()!;
      active.delete(member);
      component.push(member);
      if (member === node) break;
    }
    members.push(component.sort((a, b) => a - b));
  };
  for (let node = 0; node < nodeCount; node += 1) if (indexes[node] === -1) visit(node);
  members.sort((a, b) => a[0]! - b[0]!);
  const componentByNode = Array.from({ length: nodeCount }, () => -1);
  members.forEach((component, index) => component.forEach((node) => { componentByNode[node] = index; }));
  const combined = new Map<string, { from: number; to: number; weight: number }>();
  for (const edge of edges) {
    const from = componentByNode[edge.from]!;
    const to = componentByNode[edge.to]!;
    if (from === to) continue;
    const key = `${from}:${to}`;
    const current = combined.get(key);
    combined.set(key, { from, to, weight: Math.max(current?.weight ?? 0, edge.weight) });
  }
  return { members, componentByNode, edges, dagEdges: [...combined.values()].sort((a, b) => a.from - b.from || a.to - b.to) };
}

function assignRanks(graph: ComponentGraph) {
  const count = graph.members.length;
  const indegree = Array.from({ length: count }, () => 0);
  const outgoing = Array.from({ length: count }, () => [] as number[]);
  for (const edge of graph.dagEdges) { outgoing[edge.from]!.push(edge.to); indegree[edge.to]! += 1; }
  const queue = indegree.flatMap((degree, index) => degree === 0 ? [index] : []);
  const ranks = Array.from({ length: count }, () => 0);
  while (queue.length) {
    queue.sort((a, b) => a - b);
    const component = queue.shift()!;
    for (const target of outgoing[component]!.sort((a, b) => a - b)) {
      const edge = graph.dagEdges.find(({ from, to }) => from === component && to === target)!;
      // Supporting edges are local satellites, not another step in the reading
      // progression. Keep them beside their invoking rank while primary,
      // secondary, and automatic relationships advance the flow.
      const progression = edge.weight <= roleWeight("supporting") ? 0 : 1;
      ranks[target] = Math.max(ranks[target]!, ranks[component]! + progression);
      indegree[target]! -= 1;
      if (indegree[target] === 0) queue.push(target);
    }
  }
  return ranks;
}

function orderRanks(graph: ComponentGraph, ranks: number[]) {
  const maxRank = Math.max(0, ...ranks);
  const rows = Array.from({ length: maxRank + 1 }, (_, rank) => graph.members.flatMap((members, component) => ranks[component] === rank ? members : []));
  const neighbors = (node: number, previous: boolean) => graph.edges.flatMap((edge) => {
    if (previous && edge.to === node) return [edge.from];
    if (!previous && edge.from === node) return [edge.to];
    return [];
  });
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const forward = sweep % 2 === 0;
    const rankIndexes = forward ? rows.map((_, index) => index).slice(1) : rows.map((_, index) => index).slice(0, -1).reverse();
    for (const rank of rankIndexes) {
      const adjacent = rows[rank + (forward ? -1 : 1)] ?? [];
      const positions = new Map(adjacent.map((node, index) => [node, index]));
      rows[rank]!.sort((a, b) => barycenter(neighbors(a, forward), positions) - barycenter(neighbors(b, forward), positions) || a - b);
    }
  }
  return rows;
}

function barycenter(neighbors: number[], positions: Map<number, number>) {
  const values = neighbors.flatMap((node) => positions.has(node) ? [positions.get(node)!] : []);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.MAX_SAFE_INTEGER;
}

function primarySpine(graph: ComponentGraph, ranks: number[]) {
  const ordered = graph.members.map((_, index) => index).sort((a, b) => ranks[a]! - ranks[b]! || a - b);
  const score = Array.from({ length: graph.members.length }, () => 0);
  const previous = Array.from({ length: graph.members.length }, () => -1);
  for (const component of ordered) for (const edge of graph.dagEdges.filter(({ from }) => from === component)) {
    const candidate = score[component]! + edge.weight;
    if (candidate > score[edge.to]! || (candidate === score[edge.to]! && component < previous[edge.to]!)) { score[edge.to] = candidate; previous[edge.to] = component; }
  }
  let current = score.reduce((best, value, index) => value > score[best]! ? index : best, 0);
  const path: number[] = [];
  while (current >= 0) { path.push(current); current = previous[current]!; }
  return path.reverse();
}

function flowSize(items: FlowItem[], ranks: number[][], direction: "right" | "down", gap: number, rankGap: number, primaryNodeIds: Set<string>) {
  const primary = ranks.map((rank) => direction === "right" ? Math.max(...rank.map((index) => items[index]!.width), 0) : Math.max(...rank.map((index) => items[index]!.height), 0));
  const spineCrossSize = flowSpineCrossSize(items, ranks, direction, primaryNodeIds);
  const centerSpine = shouldCenterFlowSpine(items, ranks, primaryNodeIds);
  const cross = ranks.map((sourceRank) => {
    const rank = orderedRank(items, sourceRank, primaryNodeIds);
    const spine = rank[0];
    const satellites = rank.slice(1);
    return (centerSpine || spine === undefined ? spineCrossSize : crossSize(items[spine]!, direction))
      + satellites.reduce((total, index) => total + crossSize(items[index]!, direction), 0)
      + gap * satellites.length;
  });
  return direction === "right"
    ? { width: primary.reduce((sum, value) => sum + value, 0) + rankGap * Math.max(0, ranks.length - 1), height: Math.max(...cross, 0) }
    : { width: Math.max(...cross, 0), height: primary.reduce((sum, value) => sum + value, 0) + rankGap * Math.max(0, ranks.length - 1) };
}

function resolveDirection(direction: FlowDirection, forceDown: boolean | undefined, width: number, height: number, maxWidth: number): "right" | "down" {
  if (direction !== "auto") return direction;
  if (forceDown || width > maxWidth || maxWidth <= 560) return "down";
  return width / Math.max(1, height) <= 4.2 ? "right" : "down";
}

function placeRanks(
  items: FlowItem[],
  ranks: number[][],
  direction: "right" | "down",
  gap: number,
  rankGap: number,
  primaryNodeIds: Set<string>,
): FlowPlacement[] {
  const placements: FlowPlacement[] = [];
  const spineCrossSize = flowSpineCrossSize(items, ranks, direction, primaryNodeIds);
  const centerSpine = shouldCenterFlowSpine(items, ranks, primaryNodeIds);
  let primaryCursor = 0;
  ranks.forEach((sourceRank, rankIndex) => {
    const rank = orderedRank(items, sourceRank, primaryNodeIds);
    const primarySize = Math.max(...rank.map((index) => direction === "right" ? items[index]!.width : items[index]!.height), 0);
    // Center the first (normally primary) item in a shared spine band so side
    // pins remain exactly collinear even when card heights differ. Satellites
    // still begin after that band, keeping branches below/right of the spine.
    const [spine, ...satellites] = rank;
    let rankSpineCrossSize = spineCrossSize;
    if (spine !== undefined) {
      const item = items[spine]!;
      rankSpineCrossSize = centerSpine ? spineCrossSize : crossSize(item, direction);
      const spineOffset = centerSpine ? (spineCrossSize - crossSize(item, direction)) / 2 : 0;
      placements.push({ index: spine, rank: rankIndex, x: direction === "right" ? primaryCursor + (primarySize - item.width) / 2 : spineOffset, y: direction === "right" ? spineOffset : primaryCursor + (primarySize - item.height) / 2 });
    }
    let crossCursor = rankSpineCrossSize + (satellites.length ? gap : 0);
    for (const index of satellites) {
      const item = items[index]!;
      placements.push({ index, rank: rankIndex, x: direction === "right" ? primaryCursor + (primarySize - item.width) / 2 : crossCursor, y: direction === "right" ? crossCursor : primaryCursor + (primarySize - item.height) / 2 });
      crossCursor += crossSize(item, direction) + gap;
    }
    primaryCursor += primarySize + rankGap;
  });
  return placements.sort((a, b) => a.index - b.index);
}

function orderedRank(items: FlowItem[], sourceRank: number[], primaryNodeIds: Set<string>) {
  return [...sourceRank].sort((a, b) => {
    const aPrimary = primaryNodeIds.has(items[a]!.node.id) ? 0 : 1;
    const bPrimary = primaryNodeIds.has(items[b]!.node.id) ? 0 : 1;
    return aPrimary - bPrimary || a - b;
  });
}

function flowSpineCrossSize(items: FlowItem[], ranks: number[][], direction: "right" | "down", primaryNodeIds: Set<string>) {
  return Math.max(...ranks.map((rank) => {
    const spine = orderedRank(items, rank, primaryNodeIds)[0];
    return spine === undefined ? 0 : crossSize(items[spine]!, direction);
  }), 0);
}

function shouldCenterFlowSpine(items: FlowItem[], ranks: number[][], primaryNodeIds: Set<string>) {
  return ranks.every((rank) => {
    const spine = orderedRank(items, rank, primaryNodeIds)[0];
    return spine === undefined || !items[spine]!.node.children?.length;
  });
}

function crossSize(item: FlowItem, direction: "right" | "down") {
  return direction === "right" ? item.height : item.width;
}
