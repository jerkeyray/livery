import type { LiveryArtifact } from "./artifact.js";
import { computeFlowScene } from "./layout.js";
import type { FlowLayoutOptions, Scene } from "./scene.js";

export type LayoutComplexity = {
  advanced: boolean;
  cyclic: boolean;
  reasons: Array<"cycle" | "entity_count" | "relationship_count">;
};

export type LayoutRequest = {
  artifact: LiveryArtifact;
  options: FlowLayoutOptions;
  signal?: AbortSignal;
};

export type LayoutAdapter = {
  id: string;
  layout(request: LayoutRequest): Scene | Promise<Scene>;
};

export type LayoutPolicyOptions = {
  maxFastEntities?: number;
  maxFastRelationships?: number;
};

export type LayoutPolicyAdapterOptions = LayoutPolicyOptions & {
  advanced?: LayoutAdapter;
  fast?: LayoutAdapter;
};

export const fastFlowLayoutAdapter: LayoutAdapter = {
  id: "livery.fast-flow",
  layout: ({ artifact, options }) => computeFlowScene(artifact, options),
};

export function analyzeLayoutComplexity(
  artifact: LiveryArtifact,
  options: LayoutPolicyOptions = {},
): LayoutComplexity {
  const maxFastEntities = options.maxFastEntities ?? 12;
  const maxFastRelationships = options.maxFastRelationships ?? 18;
  const cyclic = hasDirectedCycle(artifact);
  const reasons: LayoutComplexity["reasons"] = [];
  if (cyclic) reasons.push("cycle");
  if (artifact.entities.length > maxFastEntities) reasons.push("entity_count");
  if (artifact.relationships.length > maxFastRelationships) reasons.push("relationship_count");
  return { advanced: reasons.length > 0, cyclic, reasons };
}

export function selectLayoutAdapter(
  artifact: LiveryArtifact,
  adapters: { advanced?: LayoutAdapter; fast?: LayoutAdapter },
  options?: LayoutPolicyOptions,
) {
  const complexity = analyzeLayoutComplexity(artifact, options);
  if (complexity.advanced && adapters.advanced) return adapters.advanced;
  return adapters.fast ?? fastFlowLayoutAdapter;
}

export function createLayoutPolicyAdapter(options: LayoutPolicyAdapterOptions = {}): LayoutAdapter {
  const { advanced, fast, ...policy } = options;
  return {
    id: "livery.layout-policy",
    layout(request) {
      return selectLayoutAdapter(
        request.artifact,
        {
          ...(advanced ? { advanced } : {}),
          ...(fast ? { fast } : {}),
        },
        policy,
      ).layout(request);
    },
  };
}

export async function layoutWithAdapter(adapter: LayoutAdapter, request: LayoutRequest) {
  return await adapter.layout(request);
}

function hasDirectedCycle(artifact: LiveryArtifact) {
  const outgoing = new Map<string, string[]>();
  for (const relationship of artifact.relationships) {
    const targets = outgoing.get(relationship.from) ?? [];
    targets.push(relationship.to);
    outgoing.set(relationship.from, targets);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of outgoing.get(id) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return artifact.entities.some(({ id }) => visit(id));
}
