import type { LiveryArtifact } from "./artifact.js";
import type { Diagnostic } from "./diagnostics.js";
import { computeStoryState } from "./story.js";

export type LintOptions = {
  maxEntities?: number;
  maxEntityLabelLength?: number;
  maxRelationships?: number;
  maxRelationshipLabelLength?: number;
  maxUnbrokenLabelLength?: number;
};

const unsupportedStoryActions = new Set(["transform", "compare", "set_state"]);

export function lintArtifact(artifact: LiveryArtifact, options: LintOptions = {}): Diagnostic[] {
  const maxEntities = options.maxEntities ?? 12;
  const maxRelationships = options.maxRelationships ?? 18;
  const maxEntityLabelLength = options.maxEntityLabelLength ?? 48;
  const maxRelationshipLabelLength = options.maxRelationshipLabelLength ?? 64;
  const maxUnbrokenLabelLength = options.maxUnbrokenLabelLength ?? 24;
  const diagnostics: Diagnostic[] = [];
  const connectedIds = new Set(artifact.relationships.flatMap(({ from, to }) => [from, to]));

  if (
    artifact.composition === "flow" &&
    (artifact.entities.length > maxEntities || artifact.relationships.length > maxRelationships)
  ) {
    diagnostics.push(
      warning(
        "visual.flow_density",
        `Flow has ${artifact.entities.length} entities and ${artifact.relationships.length} relationships; the small-flow renderer is designed for at most ${maxEntities} and ${maxRelationships}.`,
      ),
    );
  }

  for (const [index, entity] of artifact.entities.entries()) {
    if (artifact.composition === "flow" && !connectedIds.has(entity.id)) {
      diagnostics.push({
        ...warning("visual.disconnected_entity", `Entity ${entity.id} has no relationships.`),
        path: ["entities", index],
        repair: { description: "Connect the entity or remove it from this flow." },
      });
    }
    if (isDifficultLabel(entity.label, maxEntityLabelLength, maxUnbrokenLabelLength)) {
      diagnostics.push({
        ...warning("visual.long_label", `Entity ${entity.id} has a label that will be truncated.`),
        path: ["entities", index, "label"],
        repair: { description: `Shorten the label to ${maxEntityLabelLength} characters with breakable words.` },
      });
    }
  }

  for (const [index, relationship] of artifact.relationships.entries()) {
    if (relationship.label && isDifficultLabel(relationship.label, maxRelationshipLabelLength, maxUnbrokenLabelLength)) {
      diagnostics.push({
        ...warning("visual.long_label", `Relationship ${relationship.id} has a label that may collide or clip.`),
        path: ["relationships", index, "label"],
        repair: { description: `Shorten the label to ${maxRelationshipLabelLength} characters with breakable words.` },
      });
    }
  }

  for (const [index, step] of artifact.story.entries()) {
    if (unsupportedStoryActions.has(step.action)) {
      diagnostics.push({
        ...warning("visual.unsupported_story_action", `Story action ${step.action} is not rendered yet.`),
        path: ["story", index, "action"],
        repair: { description: "Use reveal, hide, focus, indicate, trace, enter, or exit." },
      });
    }

    if (step.action !== "focus" && step.action !== "indicate") continue;
    const state = computeStoryState(artifact, index);
    for (const target of step.targets) {
      const visible =
        target.type === "entity" ? state.visibleEntities.has(target.id) : state.visibleRelationships.has(target.id);
      if (visible) continue;
      diagnostics.push({
        ...warning("visual.hidden_story_target", `Story action ${step.action} targets hidden ${target.id}.`),
        path: ["story", index, "targets"],
        repair: { description: "Reveal or trace the target before focusing or indicating it." },
      });
    }
  }

  return diagnostics;
}

function isDifficultLabel(label: string, maxLength: number, maxUnbrokenLength: number) {
  return label.length > maxLength || label.split(/\s+/).some((part) => part.length > maxUnbrokenLength);
}

function warning(code: string, message: string): Diagnostic {
  return { code, message, severity: "warning" };
}
