import type { ComponentDefinition, VisualNode, VisualValue } from "./visual.js";
import { canonicalTheme, resolveComponentRecipe } from "./theme.js";

export type StandardComponentName = keyof typeof standardLibrary;

const technicalComponents = [
  "person", "team", "service", "api", "database", "cache", "objectStore", "warehouse",
  "queue", "topic", "stream", "event", "browser", "mobile", "terminal", "server",
  "agent", "model", "tool", "worker", "file", "document", "code", "table", "note",
  "callout", "badge", "card", "list", "legend", "boundary", "barChart", "lineChart", "areaChart", "progress",
] as const;

const componentMetadata: Record<(typeof technicalComponents)[number], {
  category: ComponentDefinition["category"];
  description: string;
  status?: ComponentDefinition["status"];
}> = {
  person: { category: "people", description: "A single person or user." },
  team: { category: "people", description: "A group of people acting together." },
  service: { category: "compute", description: "A software service or application boundary." },
  api: { category: "compute", description: "An application programming interface." },
  database: { category: "storage", description: "A persistent database." },
  cache: { category: "storage", description: "A low-latency cache." },
  objectStore: { category: "storage", description: "An object or blob store." },
  warehouse: { category: "storage", description: "An analytical data warehouse." },
  queue: { category: "messaging", description: "A queued message channel." },
  topic: { category: "messaging", description: "A publish-subscribe topic." },
  stream: { category: "messaging", description: "An ordered event stream." },
  event: { category: "messaging", description: "An event or emitted message." },
  browser: { category: "device", description: "A web browser client." },
  mobile: { category: "device", description: "A mobile device or application." },
  terminal: { category: "device", description: "A command-line terminal." },
  server: { category: "compute", description: "A server or compute host." },
  agent: { category: "ai", description: "An autonomous or assisted agent." },
  model: { category: "ai", description: "A machine-learning or language model." },
  tool: { category: "ai", description: "A tool callable by an agent or model." },
  worker: { category: "compute", description: "A background worker or process." },
  file: { category: "content", description: "A file artifact." },
  document: { category: "content", description: "A structured document." },
  code: { category: "content", description: "A source-code or protocol block." },
  table: { category: "content", description: "A compact structured table." },
  note: { category: "content", description: "A short contextual note." },
  callout: { category: "content", description: "An annotation connected to visual content." },
  badge: { category: "content", description: "A compact status or category badge." },
  card: { category: "content", description: "A generic editorial card without a technical glyph." },
  list: { category: "content", description: "A bounded editorial list of descriptive leaves." },
  legend: { category: "content", description: "A legend explaining visual encodings." },
  boundary: { category: "content", description: "A labeled grouping boundary." },
  barChart: { category: "chart", description: "A basic bar chart.", status: "experimental" },
  lineChart: { category: "chart", description: "A basic line chart.", status: "experimental" },
  areaChart: { category: "chart", description: "A basic area chart.", status: "experimental" },
  progress: { category: "chart", description: "A quantitative progress indicator.", status: "experimental" },
};

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
  const styleKeys = new Set(["fill", "stroke", "strokeWidth", "color", "iconColor", "radius", "opacity", "fontSize", "fontWeight"]);
  const style = Object.fromEntries(Object.entries(props).filter(([key]) => styleKeys.has(key)));
  const componentProps = Object.fromEntries(Object.entries(props).filter(([key]) => !styleKeys.has(key) && !["subtitle", "variant", "tone"].includes(key)));
  const items = Array.isArray(props.items) ? props.items.filter((item): item is string => typeof item === "string") : undefined;
  return {
    id,
    kind: `lib.${name}`,
    label: typeof props.label === "string" ? props.label : humanize(name),
    ...(typeof props.subtitle === "string" ? { subtitle: props.subtitle } : {}),
    ...(items?.length ? { description: items.join(", ") } : {}),
    ...(typeof props.variant === "string" ? { variant: props.variant } : {}),
    ...(typeof props.tone === "string" && ["neutral", "info", "success", "warning", "danger"].includes(props.tone) ? { tone: props.tone as "neutral" | "info" | "success" | "warning" | "danger" } : {}),
    ...(Object.keys(style).length ? { style } : {}),
    ...(Object.keys(componentProps).length ? { props: componentProps } : {}),
    anchors: ["top", "right", "bottom", "left", "center"],
  };
}

function component(name: string): ComponentDefinition {
  const geometry = resolveComponentRecipe(`lib.${name}`, undefined, canonicalTheme).geometry;
  const metadata = componentMetadata[name as keyof typeof componentMetadata];
  const example = `${name}("${humanize(name)}")`;
  return {
    name,
    category: metadata.category,
    description: metadata.description,
    status: metadata.status ?? "supported",
    parameters: [
      { name: "label", type: "string", required: false },
      { name: "subtitle", type: "string", required: false },
      { name: "icon", type: "identifier", required: false },
      { name: "variant", type: "string", required: false },
      { name: "tone", type: "tone", required: false, default: "neutral" },
      { name: "fill", type: "paint", required: false },
      { name: "stroke", type: "paint", required: false },
      { name: "strokeWidth", type: "length", required: false },
      { name: "color", type: "paint", required: false },
      { name: "iconColor", type: "paint", required: false },
      { name: "radius", type: "length", required: false },
      { name: "opacity", type: "number", required: false },
      { name: "fontSize", type: "length", required: false },
      { name: "fontWeight", type: "number", required: false },
      { name: "width", type: "length", required: false },
      { name: "height", type: "length", required: false },
      ...(["list", "legend"].includes(name) ? [{ name: "items", type: "list" as const, required: true }] : []),
    ],
    root: {
      id: "root",
      kind: "box",
      label: humanize(name),
      anchors: ["top", "right", "bottom", "left", "center"],
    },
    ports: ["top", "right", "bottom", "left", "center"],
    variants: ["default", "muted", "emphasis", "soft", "solid", "ghost"],
    tokens: ["color.surface", "color.border", "color.text", "color.accent", "color.accentSoft", "space.md", "radius.md", "stroke.normal"],
    intrinsicSize: { minWidth: geometry?.minWidth ?? 120, minHeight: geometry?.minHeight ?? 64 },
    sizing: { minWidth: geometry?.minWidth ?? 120, minHeight: geometry?.minHeight ?? 64, ...(geometry?.maxWidth ? { maxWidth: geometry.maxWidth } : {}) },
    accessibility: { role: "group", labelParameter: "label" },
    example,
    examples: [example],
  };
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
