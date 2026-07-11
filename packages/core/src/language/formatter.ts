import type { LiveryArtifact } from "../artifact.js";

function quote(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n")}"`;
}

export function formatArtifact(artifact: LiveryArtifact) {
  const title = artifact.title ? `(${quote(artifact.title)})` : "";
  const lines = [`${artifact.composition} ${artifact.id}${title} {`];
  const inferredIds = new Set(artifact.relationships.flatMap(({ from, to }) => [from, to]));

  for (const entity of artifact.entities) {
    const hasMetadata = Boolean(entity.role || entity.tone || entity.source);
    if (!hasMetadata && inferredIds.has(entity.id) && entity.label === titleFromId(entity.id)) continue;
    const constructor = entity.role ?? "entity";
    const argumentsList = [
      quote(entity.label),
      entity.tone ? `tone: ${entity.tone}` : undefined,
      entity.source ? `source: ${quote(entity.source)}` : undefined,
    ].filter(Boolean);
    lines.push(`  ${entity.id} = ${constructor}(${argumentsList.join(", ")})`);
  }

  if (artifact.entities.some((entity) => entity.role || entity.tone || entity.source)) lines.push("");

  for (const relationship of artifact.relationships) {
    const argumentsList = [
      relationship.label ? quote(relationship.label) : undefined,
      relationship.tone ? `tone: ${relationship.tone}` : undefined,
    ].filter(Boolean);
    const call = argumentsList.length ? `(${argumentsList.join(", ")})` : "";
    lines.push(`  ${relationship.id} = ${relationship.from} -> ${relationship.to}${call}`);
  }

  if (artifact.story.length > 0) {
    lines.push("", "  story {");
    for (const step of artifact.story) {
      lines.push(`    ${step.action}(${step.targets.map(({ id }) => id).join(", ")})`);
    }
    lines.push("  }");
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

function titleFromId(id: string) {
  return id
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
