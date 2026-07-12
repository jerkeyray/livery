import type { Entity, LiveryArtifact, Relationship } from "./artifact.js";

export type ArtifactElement =
  | { type: "entity"; value: Entity }
  | { type: "relationship"; value: Relationship };

export function resolveArtifactElement(
  artifact: LiveryArtifact,
  type: "entity",
  id: string,
): Extract<ArtifactElement, { type: "entity" }> | undefined;
export function resolveArtifactElement(
  artifact: LiveryArtifact,
  type: "relationship",
  id: string,
): Extract<ArtifactElement, { type: "relationship" }> | undefined;
export function resolveArtifactElement(
  artifact: LiveryArtifact,
  type: ArtifactElement["type"],
  id: string,
): ArtifactElement | undefined {
  if (type === "entity") {
    const value = artifact.entities.find((entity) => entity.id === id);
    return value ? { type, value } : undefined;
  }
  const value = artifact.relationships.find((relationship) => relationship.id === id);
  return value ? { type, value } : undefined;
}
