import type { LiveryArtifact, StoryStep, StoryTarget } from "./artifact.js";

export type StoryState = {
  step: number;
  visibleEntities: ReadonlySet<string>;
  visibleRelationships: ReadonlySet<string>;
  focusedEntities: ReadonlySet<string>;
  focusedRelationships: ReadonlySet<string>;
  indicatedEntities: ReadonlySet<string>;
  indicatedRelationships: ReadonlySet<string>;
  tracedRelationships: ReadonlySet<string>;
};

export function computeStoryState(artifact: LiveryArtifact, step: number): StoryState {
  const boundedStep = Math.max(-1, Math.min(step, artifact.story.length - 1));
  const revealedEntities = targetsForActions(artifact.story, ["reveal", "enter"], "entity");
  const stagedRelationships = targetsForActions(artifact.story, ["reveal", "enter", "trace", "indicate"], "relationship");
  const visibleEntities = new Set(artifact.entities.map(({ id }) => id).filter((id) => !revealedEntities.has(id)));
  const visibleRelationships = new Set(
    artifact.relationships.map(({ id }) => id).filter((id) => !stagedRelationships.has(id)),
  );
  const focusedEntities = new Set<string>();
  const focusedRelationships = new Set<string>();
  const indicatedEntities = new Set<string>();
  const indicatedRelationships = new Set<string>();
  const traced = new Set<string>();

  for (const storyStep of artifact.story.slice(0, boundedStep + 1)) {
    applyStep(storyStep, {
      visibleEntities,
      visibleRelationships,
      focusedEntities,
      focusedRelationships,
      indicatedEntities,
      indicatedRelationships,
      traced,
    });
  }

  return {
    step: boundedStep,
    visibleEntities,
    visibleRelationships,
    focusedEntities,
    focusedRelationships,
    indicatedEntities,
    indicatedRelationships,
    tracedRelationships: traced,
  };
}

function targetsForActions(
  story: StoryStep[],
  actions: StoryStep["action"][],
  type: StoryTarget["type"],
) {
  return new Set(
    story
      .filter(({ action }) => actions.includes(action))
      .flatMap(({ targets }) => targets)
      .filter((target) => target.type === type)
      .map(({ id }) => id),
  );
}

function applyStep(
  step: StoryStep,
  state: {
    visibleEntities: Set<string>;
    visibleRelationships: Set<string>;
    focusedEntities: Set<string>;
    focusedRelationships: Set<string>;
    indicatedEntities: Set<string>;
    indicatedRelationships: Set<string>;
    traced: Set<string>;
  },
) {
  if (step.action === "focus") {
    state.focusedEntities.clear();
    state.focusedRelationships.clear();
  }
  if (step.action === "indicate") {
    state.indicatedEntities.clear();
    state.indicatedRelationships.clear();
  }

  for (const target of step.targets) {
    const visible = target.type === "entity" ? state.visibleEntities : state.visibleRelationships;
    if (step.action === "reveal" || step.action === "enter") visible.add(target.id);
    if (step.action === "hide" || step.action === "exit") visible.delete(target.id);
    if (step.action === "focus") {
      (target.type === "entity" ? state.focusedEntities : state.focusedRelationships).add(target.id);
    }
    if (step.action === "indicate") {
      visible.add(target.id);
      (target.type === "entity" ? state.indicatedEntities : state.indicatedRelationships).add(target.id);
    }
    if (step.action === "trace" && target.type === "relationship") {
      state.visibleRelationships.add(target.id);
      state.traced.add(target.id);
    }
  }
}
