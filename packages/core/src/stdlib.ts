import type { ComponentDefinition, VisualNode, VisualValue } from "./visual.js";
import { canonicalTheme, resolveComponentRecipe } from "./theme.js";

const technicalComponents = [
  "person", "team", "service", "api", "database", "cache", "objectStore", "warehouse",
  "queue", "topic", "stream", "event", "browser", "mobile", "terminal", "server",
  "agent", "model", "tool", "worker", "file", "document", "code", "table", "note",
  "callout", "badge", "card", "list", "legend", "boundary", "barChart", "lineChart", "areaChart", "progress",
  "participant", "interactionFragment", "classCard", "entity", "stateNode", "choice", "requirement", "evidence",
] as const;

export type StandardComponentName = (typeof technicalComponents)[number];

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
  participant: { category: "interaction", description: "A participant in an ordered interaction narrative." },
  interactionFragment: { category: "interaction", description: "A bounded alternative, loop, or parallel interaction fragment." },
  classCard: { category: "schema", description: "A structured class with typed fields and methods." },
  entity: { category: "schema", description: "A structured data entity with keys and typed fields." },
  stateNode: { category: "state", description: "A state with optional entry and exit behavior." },
  choice: { category: "state", description: "A validated decision point in a state machine." },
  requirement: { category: "schema", description: "A typed requirement with risk and verification metadata." },
  evidence: { category: "schema", description: "Evidence linked to a requirement or verification outcome." },
};

export const standardLibrary = Object.assign(
  Object.create(null) as Record<(typeof technicalComponents)[number], ComponentDefinition>,
  Object.fromEntries(technicalComponents.map((name) => [name, component(name)])),
);

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
  const details = componentDetailRows(props);
  return {
    id,
    kind: `lib.${name}`,
    label: typeof props.label === "string" ? props.label : humanize(name),
    ...(typeof props.subtitle === "string" ? { subtitle: props.subtitle } : {}),
    ...(details.length ? { description: details.join(", ") } : {}),
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
      { name: "annotations", type: "list", required: false, itemType: "string", maxItems: 5 },
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
      ...componentParameters(name),
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

function componentParameters(name: string): ComponentDefinition["parameters"] {
  if (["list", "legend"].includes(name)) return [{ name: "items", type: "list", required: true, itemType: "string", minItems: 1, maxItems: name === "list" ? 12 : 8 }];
  if (name === "classCard") return [
    { name: "fields", type: "list", required: false, itemType: "record", maxItems: 16 },
    { name: "methods", type: "list", required: false, itemType: "record", maxItems: 16 },
  ];
  if (name === "entity") return [{ name: "fields", type: "list", required: true, itemType: "record", minItems: 1, maxItems: 24 }];
  if (name === "stateNode") return [
    { name: "entry", type: "string", required: false },
    { name: "exit", type: "string", required: false },
  ];
  if (name === "interactionFragment") return [
    { name: "fragmentType", type: "identifier", required: true },
    { name: "members", type: "list", required: true, itemType: "identifier", minItems: 1, maxItems: 16 },
  ];
  if (name === "participant") return [{ name: "participantType", type: "identifier", required: false }];
  if (name === "requirement") return [
    { name: "requirementType", type: "identifier", required: false },
    { name: "risk", type: "identifier", required: false },
    { name: "verification", type: "string", required: false },
    { name: "reference", type: "string", required: false },
  ];
  if (name === "evidence") return [
    { name: "status", type: "identifier", required: false },
    { name: "reference", type: "string", required: false },
  ];
  return [];
}

function componentDetailRows(props: Record<string, VisualValue>): string[] {
  const scalar = (key: string) => typeof props[key] === "string" ? `${humanize(key)}: ${props[key]}` : undefined;
  const records = (key: string) => Array.isArray(props[key])
    ? props[key].flatMap((value) => isRecord(value) ? [formatRecord(value)] : typeof value === "string" ? [value] : [])
    : [];
  return [
    ...records("annotations"),
    ...records("items"),
    ...records("fields"),
    ...records("methods"),
    ...["entry", "exit", "risk", "verification", "reference", "status"].map(scalar).filter((value): value is string => Boolean(value)),
  ];
}

function isRecord(value: VisualValue): value is Readonly<Record<string, VisualValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatRecord(value: Readonly<Record<string, VisualValue>>) {
  const marker = value.key === true ? "key " : typeof value.key === "string" ? `${value.key} ` : "";
  const name = typeof value.name === "string" ? value.name : "field";
  const signature = typeof value.signature === "string" ? value.signature : "";
  const type = typeof value.type === "string" ? `: ${value.type}` : typeof value.returns === "string" ? `: ${value.returns}` : "";
  return `${marker}${name}${signature}${type}`;
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}
