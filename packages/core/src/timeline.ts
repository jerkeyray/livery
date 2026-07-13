import type { Timeline, VisualValue } from "./visual.js";

export type VisualTimelineState = {
  visible: ReadonlySet<string>;
  focused: ReadonlySet<string>;
  traced: ReadonlySet<string>;
  morphs: ReadonlyMap<string, string>;
  properties: ReadonlyMap<string, Readonly<Record<string, VisualValue>>>;
};

export function computeTimelineState(timeline: Timeline, stateId: string, allIds: Iterable<string>): VisualTimelineState {
  const stateIndex = timeline.states.findIndex(({ id }) => id === stateId);
  const visible = new Set(allIds);
  const focused = new Set<string>();
  const traced = new Set<string>();
  const properties = new Map<string, Record<string, VisualValue>>();
  const morphs = new Map<string, string>();
  if (stateIndex < 0) return { visible, focused, traced, morphs, properties };
  const staged = new Set(timeline.states.flatMap(({ operations }) => operations.filter(({ action }) => action === "show").flatMap((operation) => "targets" in operation ? operation.targets : [])));
  for (const id of staged) visible.delete(id);
  for (const state of timeline.states.slice(0, stateIndex + 1)) {
    focused.clear();
    traced.clear();
    for (const operation of state.operations) {
      if (operation.action === "show") for (const id of operation.targets) visible.add(id);
      if (operation.action === "hide") for (const id of operation.targets) visible.delete(id);
      if (operation.action === "focus") for (const id of operation.targets) focused.add(id);
      if (operation.action === "trace") for (const id of operation.targets) traced.add(id);
      if (operation.action === "set") for (const id of operation.targets) properties.set(id, { ...properties.get(id), ...operation.properties });
      if (operation.action === "morph") {
        visible.delete(operation.targets[0]);
        visible.add(operation.targets[1]);
        morphs.set(operation.targets[1], operation.targets[0]);
      }
    }
  }
  return { visible, focused, traced, morphs, properties };
}
