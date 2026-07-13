import type { BoardScene } from "./board.js";
import type { Timeline, VisualValue } from "./visual.js";

export type VisualTimelineState = {
  visible: ReadonlySet<string>;
  focused: ReadonlySet<string>;
  traced: ReadonlySet<string>;
  morphs: ReadonlyMap<string, string>;
  properties: ReadonlyMap<string, Readonly<Record<string, VisualValue>>>;
};

export function computeTimelineState(timeline: Timeline, stateId: string, subject: Iterable<string> | BoardScene): VisualTimelineState {
  const scene = isBoardScene(subject) ? subject : undefined;
  const allIds = scene ? sceneIds(scene) : [...subject as Iterable<string>];
  const stateIndex = timeline.states.findIndex(({ id }) => id === stateId);
  const visible = new Set(allIds);
  const focused = new Set<string>();
  const traced = new Set<string>();
  const properties = new Map<string, Record<string, VisualValue>>();
  const morphs = new Map<string, string>();
  if (stateIndex < 0) return { visible, focused, traced, morphs, properties };
  const staged = new Set(timeline.states.flatMap(({ operations }) => operations.filter(({ action }) => action === "show" || action === "trace").flatMap(({ targets }) => targets)));
  for (const id of expandTargets(staged, scene)) visible.delete(id);
  for (const state of timeline.states.slice(0, stateIndex + 1)) {
    focused.clear();
    traced.clear();
    for (const operation of state.operations) {
      const targets = expandTargets(operation.targets, scene);
      if (operation.action === "show") for (const id of targets) visible.add(id);
      if (operation.action === "hide") for (const id of targets) visible.delete(id);
      if (operation.action === "focus") for (const id of targets) focused.add(id);
      if (operation.action === "trace") for (const id of operation.targets) { visible.add(id); traced.add(id); }
      if (operation.action === "set") for (const id of targets) properties.set(id, { ...properties.get(id), ...operation.properties });
      if (operation.action === "morph") {
        visible.delete(operation.targets[0]);
        visible.add(operation.targets[1]);
        morphs.set(operation.targets[1], operation.targets[0]);
      }
    }
  }
  if (scene) for (const connector of scene.connectors) {
    if (!visible.has(connector.from) || !visible.has(connector.to)) visible.delete(connector.id);
  }
  return { visible, focused, traced, morphs, properties };
}

function isBoardScene(value: Iterable<string> | BoardScene): value is BoardScene {
  return typeof value === "object" && value !== null && "type" in value && value.type === "livery.board-scene";
}

function sceneIds(scene: BoardScene) {
  return [...scene.elements.map(({ id }) => id), ...scene.connectors.map(({ id }) => id), ...scene.canvases.flatMap(({ primitives }) => primitives.map(({ id }) => id))];
}

function expandTargets(targets: Iterable<string>, scene?: BoardScene) {
  const expanded = new Set(targets);
  if (!scene) return expanded;
  let changed = true;
  while (changed) {
    changed = false;
    for (const element of scene.elements) if (element.parent && expanded.has(element.parent) && !expanded.has(element.id)) {
      expanded.add(element.id);
      changed = true;
    }
    for (const canvas of scene.canvases) if (expanded.has(canvas.owner)) for (const primitive of canvas.primitives) expanded.add(primitive.id);
  }
  return expanded;
}
