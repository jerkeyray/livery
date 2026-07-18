import type { ComponentDefinition, VisualValue } from "./visual.js";
import { canonicalGlyphs } from "./glyphs.js";

export type LanguageCallCategory =
  | "primitive"
  | "component"
  | "connector"
  | "layout"
  | "constraint"
  | "timeline"
  | "transition";

export type LanguageCallContext = "figure" | "component" | "canvas" | "timeline";
export type LanguageCallStatus = "supported" | "unsupported" | "experimental";
export type LanguageValueType =
  | "string"
  | "number"
  | "boolean"
  | "length"
  | "paint"
  | "tone"
  | "identifier"
  | "list";

export type LanguageParameterContract = {
  name: string;
  type: LanguageValueType;
  required?: boolean;
  values?: readonly string[];
  description?: string;
};

export type LanguageCallContract = {
  name: string;
  category: LanguageCallCategory;
  description: string;
  status: LanguageCallStatus;
  contexts: readonly LanguageCallContext[];
  positional: readonly LanguageParameterContract[];
  named: readonly LanguageParameterContract[];
  variadic?: LanguageParameterContract;
};

export const TONE_VALUES = ["neutral", "info", "success", "warning", "danger"] as const;
export const ALIGN_VALUES = ["start", "center", "end", "stretch"] as const;
export const DISTRIBUTE_VALUES = ["start", "center", "end", "between", "around"] as const;
export const CONNECTOR_VARIANTS = ["directional", "bidirectional", "async", "data", "advisory"] as const;
export const CONNECTOR_ROLES = ["auto", "primary", "secondary", "supporting"] as const;
export const TIMELINE_DURATIONS = ["fast", "normal", "slow"] as const;
export const ICON_NAMES = Object.freeze(Object.keys(canonicalGlyphs).sort());

const transformParameters: readonly LanguageParameterContract[] = [
  { name: "translateX", type: "number" },
  { name: "translateY", type: "number" },
  { name: "scale", type: "number" },
  { name: "scaleX", type: "number" },
  { name: "scaleY", type: "number" },
  { name: "rotate", type: "number" },
];

const placementParameters: readonly LanguageParameterContract[] = [
  { name: "x", type: "number" },
  { name: "y", type: "number" },
  { name: "width", type: "length" },
  { name: "height", type: "length" },
  { name: "layer", type: "number" },
  { name: "clip", type: "identifier" },
  { name: "mask", type: "identifier" },
  ...transformParameters,
];

const paintParameters: readonly LanguageParameterContract[] = [
  { name: "fill", type: "paint" },
  { name: "stroke", type: "paint" },
  { name: "strokeWidth", type: "length" },
  { name: "opacity", type: "number" },
];

const textParameters: readonly LanguageParameterContract[] = [
  { name: "color", type: "paint" },
  { name: "fontSize", type: "length" },
  { name: "fontWeight", type: "number" },
];

const primitive = (
  name: string,
  description: string,
  positional: readonly LanguageParameterContract[],
  named: readonly LanguageParameterContract[],
): LanguageCallContract => ({
  name,
  category: "primitive",
  description,
  status: "supported",
  contexts: ["figure", "component", "canvas"],
  positional,
  named,
});

const layout = (
  name: string,
  description: string,
  named: readonly LanguageParameterContract[],
): LanguageCallContract => ({
  name,
  category: "layout",
  description,
  status: "supported",
  contexts: ["figure", "component"],
  positional: [],
  variadic: { name: "child", type: "identifier", required: true },
  named,
});

const layoutSizeParameters: readonly LanguageParameterContract[] = [
  { name: "gap", type: "length" },
  { name: "width", type: "length" },
  { name: "height", type: "length" },
];

export const CORE_LANGUAGE_CALLS: readonly LanguageCallContract[] = [
  primitive("text", "Render authored text.", [{ name: "text", type: "string", required: true }], [
    { name: "text", type: "string" },
    ...placementParameters,
    { name: "fill", type: "paint" },
    { name: "opacity", type: "number" },
    ...textParameters,
  ]),
  primitive("box", "Render a rectangular visual primitive.", [{ name: "label", type: "string" }], [
    { name: "label", type: "string" },
    ...placementParameters,
    ...paintParameters,
    ...textParameters,
    { name: "radius", type: "length" },
  ]),
  primitive("circle", "Render a circular visual primitive.", [{ name: "label", type: "string" }], [
    { name: "label", type: "string" },
    ...placementParameters,
    ...paintParameters,
    ...textParameters,
  ]),
  primitive("line", "Render a line primitive.", [], [
    ...placementParameters,
    { name: "stroke", type: "paint" },
    { name: "strokeWidth", type: "length" },
    { name: "opacity", type: "number" },
  ]),
  primitive("path", "Render an SVG path primitive.", [], [
    ...placementParameters,
    ...paintParameters,
    { name: "d", type: "string", required: true },
  ]),
  primitive("image", "Render an image from an allowed source.", [], [
    ...placementParameters,
    { name: "src", type: "string", required: true },
    { name: "alt", type: "string" },
    { name: "opacity", type: "number" },
  ]),
  primitive("icon", "Render a curated vector icon.", [], [
    ...placementParameters,
    { name: "stroke", type: "paint" },
    { name: "strokeWidth", type: "length" },
    { name: "opacity", type: "number" },
    { name: "name", type: "string", required: true },
  ]),
  primitive("group", "Group child visuals without adding geometry.", [], [
    ...placementParameters,
    { name: "opacity", type: "number" },
  ]),
  primitive("frame", "Create a labeled visual boundary with an internal layout.", [{ name: "label", type: "string" }], [
    { name: "label", type: "string" },
    { name: "subtitle", type: "string" },
    { name: "layout", type: "identifier", values: ["row", "column", "grid", "flow", "hierarchy", "stack", "overlay"] },
    { name: "columns", type: "number" },
    { name: "gap", type: "length" },
    { name: "rankGap", type: "length" },
    { name: "direction", type: "string", values: ["auto", "right", "down"] },
    { name: "maxCandidates", type: "number" },
    { name: "padding", type: "length" },
    { name: "align", type: "string", values: ALIGN_VALUES },
    { name: "distribute", type: "string", values: DISTRIBUTE_VALUES },
    { name: "width", type: "length" },
    { name: "height", type: "length" },
    ...paintParameters,
    ...textParameters,
    { name: "radius", type: "length" },
  ]),
  {
    ...primitive("repeat", "Repeat a bounded primitive template.", [], [
      ...placementParameters,
      ...paintParameters,
      ...textParameters,
      { name: "count", type: "number", required: true },
      { name: "kind", type: "string", required: true, values: ["box", "circle", "line", "path", "text", "icon"] },
      { name: "stepX", type: "number" },
      { name: "stepY", type: "number" },
      { name: "radius", type: "length" },
      { name: "d", type: "string" },
      { name: "name", type: "string" },
      { name: "text", type: "string" },
    ]),
    contexts: ["canvas"],
  },
  layout("row", "Arrange children horizontally.", [
    ...layoutSizeParameters,
    { name: "align", type: "string", values: ALIGN_VALUES },
    { name: "distribute", type: "string", values: DISTRIBUTE_VALUES },
  ]),
  layout("column", "Arrange children vertically.", [
    ...layoutSizeParameters,
    { name: "align", type: "string", values: ALIGN_VALUES },
    { name: "distribute", type: "string", values: DISTRIBUTE_VALUES },
  ]),
  layout("grid", "Arrange children in deterministic grid tracks.", [
    ...layoutSizeParameters,
    { name: "columns", type: "number", required: true },
    { name: "align", type: "string", values: ALIGN_VALUES },
    { name: "distribute", type: "string", values: DISTRIBUTE_VALUES },
  ]),
  layout("flow", "Arrange a connected compound graph by its reading direction.", [
    ...layoutSizeParameters,
    { name: "direction", type: "string", values: ["auto", "right", "down"] },
    { name: "rankGap", type: "length" },
    { name: "maxCandidates", type: "number" },
  ]),
  layout("hierarchy", "Arrange a reporting tree or taxonomy with deterministic tidy-tree placement.", [
    ...layoutSizeParameters,
    { name: "direction", type: "string", values: ["auto", "right", "down"] },
    { name: "rankGap", type: "length" },
    { name: "maxCandidates", type: "number" },
  ]),
  layout("stack", "Stack children in one aligned region.", [
    { name: "width", type: "length" },
    { name: "height", type: "length" },
    { name: "align", type: "string", values: ALIGN_VALUES },
  ]),
  layout("overlay", "Overlay children in one aligned region.", [
    { name: "width", type: "length" },
    { name: "height", type: "length" },
    { name: "align", type: "string", values: ALIGN_VALUES },
  ]),
  {
    name: "canvas",
    category: "layout",
    description: "Create a bounded local coordinate system.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [],
    variadic: { name: "child", type: "identifier" },
    named: [
      { name: "width", type: "length", required: true },
      { name: "height", type: "length", required: true },
      { name: "bleed", type: "length" },
      { name: "clip", type: "boolean" },
    ],
  },
  {
    name: "connect",
    category: "connector",
    description: "Connect two stable element anchors.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [
      { name: "from", type: "identifier", required: true },
      { name: "to", type: "identifier", required: true },
    ],
    named: [
      { name: "label", type: "string" },
      { name: "variant", type: "string", values: CONNECTOR_VARIANTS },
      { name: "tone", type: "tone", values: TONE_VALUES },
      { name: "role", type: "identifier", values: CONNECTOR_ROLES },
      { name: "bundleId", type: "identifier" },
      { name: "stroke", type: "paint" },
      { name: "strokeWidth", type: "length" },
      { name: "opacity", type: "number" },
    ],
  },
  {
    name: "align",
    category: "constraint",
    description: "Align visual anchors on a shared axis.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [
      { name: "first", type: "identifier", required: true },
      { name: "second", type: "identifier", required: true },
    ],
    variadic: { name: "target", type: "identifier" },
    named: [
      { name: "axis", type: "string", values: ["x", "y"] },
      { name: "edge", type: "string", values: ["start", "center", "end"] },
    ],
  },
  {
    name: "distribute",
    category: "constraint",
    description: "Distribute visuals evenly along an axis.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [
      { name: "first", type: "identifier", required: true },
      { name: "second", type: "identifier", required: true },
      { name: "third", type: "identifier", required: true },
    ],
    variadic: { name: "target", type: "identifier" },
    named: [
      { name: "axis", type: "string", values: ["x", "y"] },
      { name: "gap", type: "length" },
    ],
  },
  {
    name: "inside",
    category: "constraint",
    description: "Keep one visual inside another visual's bounds.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [
      { name: "child", type: "identifier", required: true },
      { name: "parent", type: "identifier", required: true },
    ],
    named: [{ name: "padding", type: "length" }],
  },
  {
    name: "near",
    category: "constraint",
    description: "Keep one visual near another with bounded spacing.",
    status: "supported",
    contexts: ["figure", "component"],
    positional: [
      { name: "source", type: "identifier", required: true },
      { name: "target", type: "identifier", required: true },
    ],
    named: [{ name: "distance", type: "length" }],
  },
  ...["show", "hide", "focus", "trace"].map<LanguageCallContract>((name) => ({
    name,
    category: "timeline",
    description: `${name[0]!.toUpperCase()}${name.slice(1)} a stable visual target.`,
    status: "supported",
    contexts: ["timeline"],
    positional: [{ name: "target", type: "identifier", required: true }],
    variadic: { name: "target", type: "identifier" },
    named: [],
  })),
  {
    name: "set",
    category: "timeline",
    description: "Set validated visual properties for one state.",
    status: "supported",
    contexts: ["timeline"],
    positional: [{ name: "target", type: "identifier", required: true }],
    named: [],
  },
  {
    name: "morph",
    category: "timeline",
    description: "Geometrically morph compatible paths.",
    status: "unsupported",
    contexts: ["timeline"],
    positional: [
      { name: "from", type: "identifier", required: true },
      { name: "to", type: "identifier", required: true },
    ],
    named: [],
  },
  {
    name: "transition",
    category: "transition",
    description: "Connect two timeline states with a canonical duration.",
    status: "supported",
    contexts: ["timeline"],
    positional: [
      { name: "from", type: "identifier", required: true },
      { name: "to", type: "identifier", required: true },
    ],
    named: [{ name: "duration", type: "string", values: TIMELINE_DURATIONS }],
  },
] as const;

const contractByName = new Map(CORE_LANGUAGE_CALLS.map((contract) => [contract.name, contract]));

export function getCoreCallContract(name: string): LanguageCallContract | undefined {
  return contractByName.get(name);
}

export function standardComponentCallContract(component: ComponentDefinition, name = component.name): LanguageCallContract {
  return {
    name,
    category: "component",
    description: component.description,
    status: component.status,
    contexts: ["figure", "component"],
    positional: [{ name: "label", type: "string" }],
    named: component.parameters.map((parameter) => ({
      name: parameter.name,
      type: parameter.type,
      required: parameter.required,
      ...(parameter.name === "variant" ? { values: component.variants } : {}),
      ...(parameter.name === "tone" ? { values: TONE_VALUES } : {}),
    })),
  };
}

export function isLanguageValue(value: VisualValue, parameter: LanguageParameterContract): boolean {
  if (parameter.type === "list") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (Array.isArray(value)) return false;
  if (parameter.values && !parameter.values.includes(String(value))) return false;
  switch (parameter.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "length":
      return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.startsWith("$"));
    case "tone":
      return typeof value === "string" && TONE_VALUES.includes(value as (typeof TONE_VALUES)[number]);
    case "string":
    case "identifier":
      return typeof value === "string";
    case "paint":
      return typeof value === "string" && isSafePaint(value);
  }
}

export function isSafePaint(value: string) {
  if (/^\$color\.[A-Za-z][A-Za-z0-9_-]*$/.test(value)) return true;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(value)) return true;
  if (/^[A-Za-z]+$/.test(value)) return true;
  return /^(?:rgb|rgba|hsl|hsla|oklab|oklch)\([0-9A-Za-z.%+/, -]+\)$/.test(value);
}
