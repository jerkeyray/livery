import type { ComponentDefinition, VisualNode, VisualValue } from "./visual.js";
import { canonicalTheme, resolveComponentRecipe } from "./theme.js";

export type StandardComponentName = keyof typeof standardLibrary;

const technicalComponents = [
  "person", "team", "service", "api", "database", "cache", "objectStore", "warehouse",
  "queue", "topic", "stream", "event", "browser", "mobile", "terminal", "server",
  "agent", "model", "tool", "worker", "file", "document", "code", "table", "note",
  "callout", "badge", "legend", "boundary", "barChart", "lineChart", "areaChart", "progress",
] as const;

export const standardLibrary = Object.fromEntries(
  technicalComponents.map((name) => [name, component(name)]),
) as Record<(typeof technicalComponents)[number], ComponentDefinition>;

export function instantiateStandardComponent(
  name: StandardComponentName,
  id: string,
  props: Record<string, VisualValue> = {},
): VisualNode {
  const definition = standardLibrary[name];
  if (!definition) throw new Error(`Unknown standard library component ${name}.`);
  return {
    id,
    kind: `lib.${name}`,
    label: typeof props.label === "string" ? props.label : humanize(name),
    ...(typeof props.variant === "string" ? { variant: props.variant } : {}),
    ...(typeof props.tone === "string" && ["neutral", "info", "success", "warning", "danger"].includes(props.tone) ? { tone: props.tone as "neutral" | "info" | "success" | "warning" | "danger" } : {}),
    props,
    anchors: ["top", "right", "bottom", "left", "center"],
  };
}

function component(name: string): ComponentDefinition {
  const geometry = resolveComponentRecipe(`lib.${name}`, undefined, canonicalTheme).geometry;
  return {
    name,
    parameters: [
      { name: "label", type: "string", required: false },
      { name: "variant", type: "string", required: false },
      { name: "tone", type: "tone", required: false, default: "neutral" },
    ],
    root: {
      id: "root",
      kind: "box",
      label: humanize(name),
      anchors: ["top", "right", "bottom", "left", "center"],
    },
    ports: ["top", "right", "bottom", "left", "center"],
    variants: ["default", "muted", "emphasis"],
    tokens: ["color.surface", "color.border", "color.text", "space.md", "radius.md", "stroke.normal"],
    intrinsicSize: { minWidth: geometry?.minWidth ?? 120, minHeight: geometry?.minHeight ?? 64 },
    accessibility: { role: "group", labelParameter: "label" },
  };
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
