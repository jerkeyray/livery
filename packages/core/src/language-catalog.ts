import { standardLibrary } from "./stdlib.js";
import { canonicalTheme } from "./theme.js";
import type { AnchorName, ComponentDefinition, PrimitiveKind } from "./visual.js";

export type LanguageCatalogEntry = {
  name: string;
  description: string;
};

export type LanguageCatalog = {
  version: "0.1";
  keywords: readonly string[];
  primitives: readonly (PrimitiveKind | "connect")[];
  layouts: readonly LanguageCatalogEntry[];
  constraints: readonly LanguageCatalogEntry[];
  timelineOperations: readonly LanguageCatalogEntry[];
  tokens: readonly string[];
  anchors: readonly AnchorName[];
  components: readonly ComponentDefinition[];
};

const keywords = ["component", "figure", "return", "timeline", "state", "transition"] as const;
const primitives = ["text", "box", "circle", "line", "path", "image", "icon", "group", "canvas", "repeat", "connect"] as const;
const layouts = [
  { name: "row", description: "Arrange children horizontally." },
  { name: "column", description: "Arrange children vertically." },
  { name: "grid", description: "Arrange children in deterministic tracks." },
  { name: "stack", description: "Stack children in one occupied region." },
  { name: "overlay", description: "Intentionally layer children." },
  { name: "canvas", description: "Create a bounded local coordinate system." },
] as const;
const constraints = [
  { name: "align", description: "Align two or more component edges or centers." },
  { name: "distribute", description: "Distribute three or more components on an axis." },
  { name: "inside", description: "Keep a component inside another component." },
  { name: "near", description: "Keep two components within a requested distance." },
] as const;
const timelineOperations = [
  { name: "show", description: "Show stable visual identities." },
  { name: "hide", description: "Hide stable visual identities." },
  { name: "focus", description: "Focus targets and mute unrelated content." },
  { name: "trace", description: "Reveal and emphasize a connector." },
  { name: "set", description: "Set supported visual properties." },
  { name: "morph", description: "Relate compatible visual identities." },
] as const;
const anchors = ["top", "right", "bottom", "left", "center"] as const;

export function getLanguageCatalog(): LanguageCatalog {
  const tokens = Object.entries(canonicalTheme.tokens)
    .flatMap(([group, values]) => Object.keys(values).map((name) => `${group}.${name}`))
    .sort();
  return {
    version: "0.1",
    keywords,
    primitives,
    layouts,
    constraints,
    timelineOperations,
    tokens,
    anchors,
    components: Object.values(standardLibrary),
  };
}
