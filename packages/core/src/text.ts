import type { LiveryArtifact } from "./artifact.js";

export function renderToText(artifact: LiveryArtifact) {
  const lines = [artifact.title ?? artifact.id, ""];

  lines.push("Entities:");
  for (const entity of artifact.entities) {
    const role = entity.role ? ` (${entity.role})` : "";
    lines.push(`- ${entity.label}${role}`);
  }

  lines.push("", "Relationships:");
  for (const relationship of artifact.relationships) {
    const from = artifact.entities.find((entity) => entity.id === relationship.from)?.label ?? relationship.from;
    const to = artifact.entities.find((entity) => entity.id === relationship.to)?.label ?? relationship.to;
    const label = relationship.label ? `: ${relationship.label}` : "";
    lines.push(`- ${from} -> ${to}${label}`);
  }

  if (artifact.story.length > 0) {
    lines.push("", "Story:");
    for (const [index, step] of artifact.story.entries()) {
      const targets = step.targets
        .map((target) => target.id)
        .join(", ");
      lines.push(`${index + 1}. ${step.action} ${targets}`);
    }
  }

  return lines.join("\n");
}
