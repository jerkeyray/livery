import type { SemanticTone } from "./artifact.js";
import type { VisualStyle, VisualValue } from "./visual.js";

export type ScaleTokens = Record<string, string | number>;
export type ComponentRecipe = {
  base?: VisualStyle;
  variants?: Record<string, VisualStyle>;
};

export type LiveryTheme = {
  name: string;
  tokens: {
    color: Record<string, string>;
    space: ScaleTokens;
    type: ScaleTokens;
    radius: ScaleTokens;
    stroke: ScaleTokens;
    elevation: ScaleTokens;
    motion: ScaleTokens;
  };
  components: Record<string, ComponentRecipe>;
};

export type TokenOverrides = Record<string, string | number>;

export const canonicalTheme: LiveryTheme = {
  name: "canonical",
  tokens: {
    color: {
      background: "#ffffff",
      canvas: "#f7f9fc",
      surface: "#ffffff",
      text: "#111827",
      muted: "#667085",
      border: "#d8dee8",
      connector: "#7c8ba1",
      accent: "#2563eb",
      info: "#2563eb",
      success: "#15803d",
      warning: "#a16207",
      danger: "#b91c1c",
    },
    space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    type: { caption: 10, body: 13, label: 14, title: 18 },
    radius: { none: 0, sm: 4, md: 6, lg: 8, pill: 999 },
    stroke: { hairline: 1, normal: 1.5, strong: 2 },
    elevation: { none: "none", low: "0 1px 2px rgb(15 23 42 / 8%)", raised: "0 8px 24px rgb(15 23 42 / 10%)" },
    motion: { fast: 120, normal: 220, slow: 400 },
  },
  components: {
    box: { base: { fill: "$color.surface", stroke: "$color.border", radius: "$radius.md" } },
    text: { base: { color: "$color.text", fontSize: "$type.body" } },
    connector: { base: { stroke: "$color.connector", strokeWidth: "$stroke.normal" } },
  },
};

export function resolveTheme(theme: LiveryTheme = canonicalTheme, overrides: TokenOverrides = {}) {
  const flattened = flattenTokens(theme);
  return { ...flattened, ...overrides };
}

export function resolveVisualValue(value: VisualValue | undefined, tokens: TokenOverrides) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  return tokens[value.slice(1)] ?? value;
}

export function toneColor(tone: SemanticTone | undefined, tokens: TokenOverrides) {
  return String(tokens[`color.${tone ?? "connector"}`] ?? tokens["color.connector"] ?? "#94a3b8");
}

export function resolveComponentStyle(
  kind: string,
  variant: string | undefined,
  primitive: VisualStyle | undefined,
  theme: LiveryTheme = canonicalTheme,
) {
  const fallback = canonicalTheme.components[kind] ?? canonicalTheme.components.box;
  const recipe = theme.components[kind] ?? theme.components.box;
  return {
    ...fallback?.base,
    ...recipe?.base,
    ...(variant ? fallback?.variants?.[variant] : undefined),
    ...(variant ? recipe?.variants?.[variant] : undefined),
    ...primitive,
  } satisfies VisualStyle;
}

function flattenTokens(theme: LiveryTheme) {
  const result: TokenOverrides = {};
  for (const [group, values] of Object.entries(theme.tokens)) {
    for (const [name, value] of Object.entries(values)) result[`${group}.${name}`] = value;
  }
  return result;
}
