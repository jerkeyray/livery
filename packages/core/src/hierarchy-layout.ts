import type { Connector, FlowDirection, VisualNode } from "./visual.js";

export type HierarchyItem = { node: VisualNode; width: number; height: number };
export type HierarchyPlacement = { index: number; depth: number; x: number; y: number };
export type HierarchyPlan = {
  direction: "down" | "right";
  width: number;
  height: number;
  placements: HierarchyPlacement[];
  bundleIds: Map<string, string>;
};

type Tree = { index: number; children: Tree[] };
type PlacedTree = { width: number; height: number; placements: HierarchyPlacement[] };

export function planHierarchy(
  items: HierarchyItem[],
  connectors: Connector[],
  options: { direction: FlowDirection; gap: number; rankGap: number; maxWidth: number; forceDown?: boolean },
): HierarchyPlan {
  if (!items.length) return { direction: "down", width: 0, height: 0, placements: [], bundleIds: new Map() };
  const owners = new Map<string, number>();
  items.forEach(({ node }, index) => collectIds(node).forEach((id) => owners.set(id, index)));
  const structural = connectors.flatMap((connector) => {
    if (connector.role === "supporting" || connector.variant === "advisory") return [];
    const from = owners.get(connector.from.node);
    const to = owners.get(connector.to.node);
    return from === undefined || to === undefined || from === to ? [] : [{ connector, from, to }];
  });
  const parent = Array.from({ length: items.length }, () => -1);
  for (const edge of structural) if (parent[edge.to] === -1) parent[edge.to] = edge.from;
  const children = Array.from({ length: items.length }, () => [] as number[]);
  parent.forEach((owner, child) => { if (owner >= 0) children[owner]!.push(child); });
  children.forEach((entries) => entries.sort((a, b) => a - b));
  const advisory = connectors.flatMap((connector) => {
    if (connector.variant !== "advisory" && connector.role !== "supporting") return [];
    const from = owners.get(connector.from.node);
    const to = owners.get(connector.to.node);
    return from === undefined || to === undefined || from === to ? [] : [{ from, to }];
  });
  const contextual = new Set(parent.flatMap((owner, index) => owner === -1 && children[index]!.length === 0 && advisory.some(({ from, to }) => from === index || to === index) ? [index] : []));
  const roots = parent.flatMap((owner, index) => owner === -1 && !contextual.has(index) ? [index] : []);
  const trees = roots.map((index): Tree => buildTree(index, children, new Set()));
  const direction = resolveDirection(options.direction, options.forceDown, options.maxWidth);
  const main = direction === "down"
    ? placeDownForest(trees, items, options.gap, options.rankGap, options.maxWidth)
    : placeRightForest(trees, items, options.gap, options.rankGap);
  const planned = placeContextual([...contextual], advisory, items, main, options.gap, options.maxWidth);
  const bundleIds = new Map<string, string>();
  const outgoing = new Map<number, typeof structural>();
  for (const edge of structural) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  for (const [from, edges] of outgoing) if (edges.length > 1) {
    const bundle = `hierarchy.${items[from]!.node.id}`;
    edges.forEach(({ connector }) => bundleIds.set(connector.id, connector.bundleId ?? bundle));
  }
  return { direction, ...planned, bundleIds };
}

function placeContextual(indexes: number[], advisory: Array<{ from: number; to: number }>, items: HierarchyItem[], main: PlacedTree, gap: number, maxWidth: number): PlacedTree {
  const placements = [...main.placements];
  let height = main.height;
  for (const index of indexes) {
    const item = items[index]!;
    const relation = advisory.find(({ from, to }) => from === index ? placements.some(({ index: placed }) => placed === to) : to === index && placements.some(({ index: placed }) => placed === from));
    const targetIndex = relation ? (relation.from === index ? relation.to : relation.from) : undefined;
    const target = targetIndex === undefined ? undefined : placements.find(({ index: placed }) => placed === targetIndex);
    const targetItem = targetIndex === undefined ? undefined : items[targetIndex];
    const y = target && targetItem ? target.y + (targetItem.height - item.height) / 2 : height + gap;
    const targetX = target && targetItem ? target.x + (targetItem.width - item.width) / 2 : 0;
    const externalCandidates = main.width + item.width + gap <= maxWidth + 0.01
      ? [{ x: -item.width - gap, y }, { x: main.width + gap, y }]
      : [];
    const adjacentCandidates = target && targetItem ? [
      { x: targetX, y: target.y - item.height - gap },
      { x: targetX, y: target.y + targetItem.height + gap },
    ] : [];
    const candidates = [...externalCandidates, ...adjacentCandidates, { x: 0, y }, { x: Math.max(0, main.width - item.width), y }];
    const fits = candidates.find((candidate) => placements.every((placement) => {
      const placed = items[placement.index]!;
      return candidate.x + item.width + gap / 2 <= placement.x || placement.x + placed.width + gap / 2 <= candidate.x || candidate.y + item.height + gap / 2 <= placement.y || placement.y + placed.height + gap / 2 <= candidate.y;
    }));
    const selected = fits ?? { x: Math.max(0, (main.width - item.width) / 2), y: height + gap };
    placements.push({ index, depth: target?.depth ?? 0, ...selected });
    height = Math.max(height, selected.y + item.height);
  }
  const minimumX = Math.min(0, ...placements.map(({ x }) => x));
  const maximumX = Math.max(main.width, ...placements.map(({ index, x }) => x + items[index]!.width));
  return {
    width: maximumX - minimumX,
    height,
    placements: minimumX < 0 ? placements.map((placement) => ({ ...placement, x: placement.x - minimumX })) : placements,
  };
}

export function hierarchyTopology(items: HierarchyItem[], connectors: Connector[]) {
  const owners = new Map<string, number>();
  items.forEach(({ node }, index) => collectIds(node).forEach((id) => owners.set(id, index)));
  const edges = connectors.flatMap((connector) => {
    if (connector.role === "supporting" || connector.variant === "advisory") return [];
    const from = owners.get(connector.from.node);
    const to = owners.get(connector.to.node);
    return from === undefined || to === undefined || from === to ? [] : [{ connector, from, to }];
  });
  const parents = new Map<number, string[]>();
  edges.forEach(({ connector, to }) => parents.set(to, [...(parents.get(to) ?? []), connector.id]));
  const adjacency = Array.from({ length: items.length }, () => [] as number[]);
  edges.forEach(({ from, to }) => adjacency[from]!.push(to));
  const visiting = new Set<number>();
  const visited = new Set<number>();
  let cyclic = false;
  const visit = (index: number) => {
    if (visiting.has(index)) { cyclic = true; return; }
    if (visited.has(index)) return;
    visiting.add(index);
    adjacency[index]!.forEach(visit);
    visiting.delete(index);
    visited.add(index);
  };
  items.forEach((_, index) => visit(index));
  return { edges, multipleParents: [...parents.entries()].filter(([, ids]) => ids.length > 1), cyclic };
}

function buildTree(index: number, children: number[][], seen: Set<number>): Tree {
  if (seen.has(index)) return { index, children: [] };
  const next = new Set(seen).add(index);
  return { index, children: children[index]!.map((child) => buildTree(child, children, next)) };
}

function placeDownForest(trees: Tree[], items: HierarchyItem[], gap: number, rankGap: number, maxWidth: number): PlacedTree {
  const planned = trees.map((tree) => placeDown(tree, items, gap, rankGap, maxWidth));
  const width = Math.max(...planned.map(({ width }) => width), 0);
  let y = 0;
  const placements: HierarchyPlacement[] = [];
  for (const plan of planned) {
    const dx = (width - plan.width) / 2;
    placements.push(...plan.placements.map((placement) => ({ ...placement, x: placement.x + dx, y: placement.y + y })));
    y += plan.height + gap;
  }
  return { width, height: Math.max(0, y - gap), placements };
}

function placeDown(tree: Tree, items: HierarchyItem[], gap: number, rankGap: number, maxWidth: number): PlacedTree {
  const own = items[tree.index]!;
  if (!tree.children.length) return { width: own.width, height: own.height, placements: [{ index: tree.index, depth: 0, x: 0, y: 0 }] };
  const childPlans = tree.children.map((child) => placeDown(child, items, gap, rankGap, maxWidth));
  const rows: PlacedTree[][] = [];
  for (const plan of childPlans) {
    const row = rows.at(-1);
    const occupied = row?.reduce((total, child) => total + child.width, 0) ?? 0;
    const nextWidth = occupied + (row?.length ? gap * row.length : 0) + plan.width;
    if (!row || row.length && nextWidth > maxWidth) rows.push([plan]);
    else row.push(plan);
  }
  const rowWidths = rows.map((row) => row.reduce((sum, plan) => sum + plan.width, 0) + gap * Math.max(0, row.length - 1));
  const rowHeights = rows.map((row) => Math.max(...row.map(({ height }) => height)));
  const childrenWidth = Math.max(...rowWidths, 0);
  const width = Math.max(own.width, childrenWidth);
  const placements: HierarchyPlacement[] = [{ index: tree.index, depth: 0, x: (width - own.width) / 2, y: 0 }];
  let rowY = own.height + rankGap;
  rows.forEach((row, rowIndex) => {
    let x = (width - rowWidths[rowIndex]!) / 2;
    for (const plan of row) {
      placements.push(...plan.placements.map((placement) => ({ ...placement, depth: placement.depth + rowIndex + 1, x: placement.x + x, y: placement.y + rowY })));
      x += plan.width + gap;
    }
    rowY += rowHeights[rowIndex]! + rankGap;
  });
  return { width, height: rowY - rankGap, placements };
}

function placeRightForest(trees: Tree[], items: HierarchyItem[], gap: number, rankGap: number): PlacedTree {
  const plans = trees.map((tree) => placeRight(tree, items, gap, rankGap));
  const height = plans.reduce((sum, plan) => sum + plan.height, 0) + gap * Math.max(0, plans.length - 1);
  let y = 0;
  const placements: HierarchyPlacement[] = [];
  for (const plan of plans) {
    placements.push(...plan.placements.map((placement) => ({ ...placement, y: placement.y + y })));
    y += plan.height + gap;
  }
  return { width: Math.max(...plans.map(({ width }) => width), 0), height, placements };
}

function placeRight(tree: Tree, items: HierarchyItem[], gap: number, rankGap: number): PlacedTree {
  const own = items[tree.index]!;
  if (!tree.children.length) return { width: own.width, height: own.height, placements: [{ index: tree.index, depth: 0, x: 0, y: 0 }] };
  const children = tree.children.map((child) => placeRight(child, items, gap, rankGap));
  const childrenHeight = children.reduce((sum, plan) => sum + plan.height, 0) + gap * Math.max(0, children.length - 1);
  const height = Math.max(own.height, childrenHeight);
  const placements: HierarchyPlacement[] = [{ index: tree.index, depth: 0, x: 0, y: (height - own.height) / 2 }];
  let y = (height - childrenHeight) / 2;
  for (const plan of children) {
    placements.push(...plan.placements.map((placement) => ({ ...placement, depth: placement.depth + 1, x: placement.x + own.width + rankGap, y: placement.y + y })));
    y += plan.height + gap;
  }
  return { width: own.width + rankGap + Math.max(...children.map(({ width }) => width), 0), height, placements };
}

function resolveDirection(direction: FlowDirection, forceDown: boolean | undefined, maxWidth: number): "down" | "right" {
  if (direction === "right") return "right";
  if (direction === "down") return "down";
  return forceDown || maxWidth <= 560 ? "down" : "down";
}

function collectIds(node: VisualNode): string[] {
  return [node.id, ...(node.children?.flatMap(collectIds) ?? [])];
}
