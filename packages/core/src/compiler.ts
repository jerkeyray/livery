import type {
  Entity,
  EntityRole,
  LiveryArtifact,
  LiverySource,
  Relationship,
  SemanticTone,
  StoryAction,
  StoryStep,
} from "./artifact.js";
import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { parse } from "./language/parser.js";
import type { EntitySyntax, RelationshipSyntax, StoryStepSyntax } from "./language/syntax.js";
import { lintArtifact } from "./lint.js";
import { liveryArtifactSchema } from "./schema.js";

export type CompileResult = {
  artifact?: LiveryArtifact;
  diagnostics: Diagnostic[];
  incomplete: boolean;
};

const storyActions = new Set<StoryAction>([
  "reveal",
  "hide",
  "focus",
  "indicate",
  "trace",
  "transform",
  "compare",
  "set_state",
  "enter",
  "exit",
]);

const tones = new Set<SemanticTone>(["neutral", "info", "success", "warning", "danger"]);
const roles = new Set<EntityRole>([
  "actor",
  "service",
  "database",
  "queue",
  "worker",
  "api",
  "external",
  "document",
  "concept",
  "decision",
  "step",
]);

function titleFromId(id: string) {
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function property(statement: EntitySyntax | RelationshipSyntax | StoryStepSyntax, name: string) {
  return statement.properties.find((candidate) => candidate.name === name)?.value;
}

function validateProperties(
  statement: EntitySyntax | RelationshipSyntax | StoryStepSyntax,
  allowed: ReadonlySet<string>,
  diagnostics: Diagnostic[],
) {
  for (const candidate of statement.properties) {
    if (!allowed.has(candidate.name)) {
      diagnostics.push(
        diagnostic("semantic.unknown_property", `Unknown property ${candidate.name}.`, candidate.span),
      );
    }
  }
}

function validateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return !value.includes(":");
  }
}

export function compile(source: LiverySource): CompileResult {
  if (typeof source !== "string") return compileJson(source);

  const syntax = parse(source);
  const diagnostics = [...syntax.diagnostics];
  const flow = syntax.statements.find((statement) => statement.type === "flow");
  if (!flow) {
    diagnostics.push(diagnostic("semantic.missing_flow", "Document must contain a flow declaration."));
    return { diagnostics, incomplete: syntax.incomplete };
  }

  const entities = new Map<string, Entity>();
  const explicitEntities = new Set<string>();
  const relationships: Relationship[] = [];
  const relationshipCounts = new Map<string, number>();
  const relationshipIds = new Set<string>();

  for (const statement of syntax.statements) {
    if (statement.type === "entity") {
      validateProperties(statement, new Set(["tone", "source", "role"]), diagnostics);
      if (explicitEntities.has(statement.id) || relationshipIds.has(statement.id)) {
        diagnostics.push(
          diagnostic("semantic.duplicate_id", `Identifier ${statement.id} is already declared.`, statement.span),
        );
        continue;
      }
      explicitEntities.add(statement.id);
      const tone = property(statement, "tone");
      const role = statement.constructor === "entity" ? property(statement, "role") : statement.constructor;
      const sourceUrl = property(statement, "source");
      if (role && !roles.has(role as EntityRole)) {
        diagnostics.push(
          diagnostic(
            "semantic.unknown_entity_constructor",
            `Unknown entity constructor ${statement.constructor}.`,
            statement.span,
          ),
        );
      }
      if (tone && !tones.has(tone as SemanticTone)) {
        diagnostics.push(
          diagnostic("semantic.invalid_property_value", `Unknown tone ${tone}.`, statement.span),
        );
      }
      if (sourceUrl && !validateUrl(sourceUrl)) {
        diagnostics.push(diagnostic("security.unsafe_url", `URL protocol is not allowed: ${sourceUrl}.`, statement.span));
      }
      entities.set(statement.id, {
        id: statement.id,
        label: statement.label ?? titleFromId(statement.id),
        ...(tone && tones.has(tone as SemanticTone) ? { tone: tone as SemanticTone } : {}),
        ...(role && roles.has(role as EntityRole) ? { role: role as EntityRole } : {}),
        ...(sourceUrl ? { source: sourceUrl } : {}),
      });
    }

    if (statement.type === "relationship") {
      validateProperties(statement, new Set(["tone"]), diagnostics);
      for (const id of [statement.from, statement.to]) {
        if (!entities.has(id)) entities.set(id, { id, label: titleFromId(id) });
      }
      const baseId = `${statement.from}--${statement.to}`;
      const occurrence = (relationshipCounts.get(baseId) ?? 0) + 1;
      relationshipCounts.set(baseId, occurrence);
      const relationshipId = statement.id ?? (occurrence === 1 ? baseId : `${baseId}--${occurrence}`);
      if (relationshipIds.has(relationshipId) || entities.has(relationshipId)) {
        diagnostics.push(
          diagnostic("semantic.duplicate_id", `Identifier ${relationshipId} is already declared.`, statement.span),
        );
        continue;
      }
      relationshipIds.add(relationshipId);
      const tone = property(statement, "tone");
      if (tone && !tones.has(tone as SemanticTone)) {
        diagnostics.push(
          diagnostic("semantic.invalid_property_value", `Unknown tone ${tone}.`, statement.span),
        );
      }
      relationships.push({
        id: relationshipId,
        from: statement.from,
        to: statement.to,
        ...(statement.label ? { label: statement.label } : {}),
        ...(tone && tones.has(tone as SemanticTone) ? { tone: tone as SemanticTone } : {}),
      });
    }
  }

  const story: StoryStep[] = [];
  const knownIds = [...entities.keys()];
  for (const statement of syntax.statements) {
    if (statement.type !== "story_step") continue;
    validateProperties(statement, new Set(), diagnostics);
    if (!storyActions.has(statement.action as StoryAction)) {
      diagnostics.push(
        diagnostic("semantic.unknown_story_action", `Unknown story action ${statement.action}.`, statement.span),
      );
      continue;
    }

    if (statement.targets.length === 0) {
      diagnostics.push(diagnostic("semantic.missing_story_target", "Story action requires a target.", statement.span));
      continue;
    }
    const targets: StoryStep["targets"] = [];
    let invalidTarget = false;
    for (const target of statement.targets) {
      if (target.type === "relationship") {
        const relationship = relationships.find(
          (candidate) => candidate.from === target.from && candidate.to === target.to,
        );
        if (!relationship) {
          diagnostics.push({
            ...diagnostic(
              "semantic.unknown_relationship_target",
              `Story target ${target.from} -> ${target.to} does not match a relationship.`,
              statement.span,
            ),
            repair: { description: "Target an existing relationship." },
          });
          invalidTarget = true;
        } else {
          targets.push({ type: "relationship", id: relationship.id });
        }
        continue;
      }

      if (entities.has(target.value)) {
        targets.push({ type: "entity", id: target.value });
      } else if (relationshipIds.has(target.value)) {
        targets.push({ type: "relationship", id: target.value });
      } else {
        diagnostics.push({
          ...diagnostic(
            "semantic.unknown_story_target",
            `Story target ${target.value} does not match an entity or relationship.`,
            statement.span,
          ),
          repair: {
            description: "Target an existing entity or relationship.",
            knownIds: [...knownIds, ...relationshipIds],
          },
        });
        invalidTarget = true;
      }
    }
    if (invalidTarget) continue;
    story.push({
      id: `story-${story.length + 1}`,
      action: statement.action as StoryAction,
      targets,
    });
  }

  const artifact: LiveryArtifact = {
    type: "livery",
    version: "0.1",
    id: flow.id,
    composition: "flow",
    entities: [...entities.values()],
    relationships,
    story,
    ...(flow.title ? { title: flow.title } : {}),
  };

  const hasErrors = diagnostics.some((item) => item.severity === "error" && !item.code.startsWith("syntax.incomplete"));
  if (!hasErrors && !syntax.incomplete) diagnostics.push(...lintArtifact(artifact));
  return {
    diagnostics,
    incomplete: syntax.incomplete,
    ...(!hasErrors ? { artifact } : {}),
  };
}

function compileJson(source: Record<string, unknown>): CompileResult {
  const result = liveryArtifactSchema.safeParse(source);
  if (result.success) {
    const artifact = result.data as LiveryArtifact;
    const diagnostics = validateArtifactSemantics(artifact);
    const hasErrors = diagnostics.some((item) => item.severity === "error");
    if (!hasErrors) diagnostics.push(...lintArtifact(artifact));
    return {
      diagnostics,
      incomplete: false,
      ...(!hasErrors ? { artifact } : {}),
    };
  }

  return {
    diagnostics: result.error.issues.map((issue) => ({
      code: "structure.invalid_artifact",
      severity: "error" as const,
      message: issue.message,
      path: issue.path.map((part) => (typeof part === "symbol" ? part.description ?? "symbol" : part)),
    })),
    incomplete: false,
  };
}

function validateArtifactSemantics(artifact: LiveryArtifact) {
  const diagnostics: Diagnostic[] = [];
  const entityIds = new Set<string>();
  const relationshipIds = new Set<string>();

  for (const [index, entity] of artifact.entities.entries()) {
    if (entityIds.has(entity.id)) {
      diagnostics.push({
        ...diagnostic("semantic.duplicate_id", `Entity ${entity.id} is declared more than once.`),
        path: ["entities", index, "id"],
      });
    }
    entityIds.add(entity.id);
    if (entity.source && !validateUrl(entity.source)) {
      diagnostics.push({
        ...diagnostic("security.unsafe_url", `URL protocol is not allowed: ${entity.source}.`),
        path: ["entities", index, "source"],
      });
    }
  }

  for (const [index, relationship] of artifact.relationships.entries()) {
    if (relationshipIds.has(relationship.id) || entityIds.has(relationship.id)) {
      diagnostics.push({
        ...diagnostic("semantic.duplicate_id", `Identifier ${relationship.id} is already declared.`),
        path: ["relationships", index, "id"],
      });
    }
    relationshipIds.add(relationship.id);
    for (const field of ["from", "to"] as const) {
      if (!entityIds.has(relationship[field])) {
        diagnostics.push({
          ...diagnostic(
            "semantic.unknown_entity_reference",
            `Relationship ${relationship.id} references unknown entity ${relationship[field]}.`,
          ),
          path: ["relationships", index, field],
          repair: { description: "Reference an existing entity.", knownIds: [...entityIds] },
        });
      }
    }
  }

  for (const [index, step] of artifact.story.entries()) {
    for (const target of step.targets) {
      if (target.type === "entity" && !entityIds.has(target.id)) {
        diagnostics.push({
          ...diagnostic("semantic.unknown_story_target", `Story target ${target.id} does not match an entity.`),
          path: ["story", index, "targets"],
          repair: { description: "Target an existing entity.", knownIds: [...entityIds] },
        });
      }
      if (target.type === "relationship" && !relationshipIds.has(target.id)) {
        diagnostics.push({
          ...diagnostic(
            "semantic.unknown_relationship_target",
            `Story target ${target.id} does not match a relationship.`,
          ),
          path: ["story", index, "targets"],
        });
      }
    }
  }

  return diagnostics;
}
