import type { CompileResult, LiveryArtifact } from "@livery/core";

export type RenderRevision = {
  artifact?: LiveryArtifact;
  retained: boolean;
};

export function resolveRenderRevision(
  result: CompileResult,
  previous?: LiveryArtifact,
  retainLastValid = true,
): RenderRevision {
  if (result.artifact) return { artifact: result.artifact, retained: false };
  if (retainLastValid && previous) return { artifact: previous, retained: true };
  return { retained: false };
}
