import type { SemanticTone } from "./artifact.js";
import type { VisualStyle, VisualValue } from "./visual.js";

export type ScaleTokens = Record<string, string | number>;
export type ComponentGeometry = { minWidth: number; minHeight: number; paddingX: number; paddingY: number; detailWidth: number; labelGap: number };
export type ComponentTypography = { color?: VisualValue; fontSize?: VisualValue; fontWeight?: VisualValue; lineHeight?: VisualValue; align?: "start" | "center" | "end" };
export type ComponentDetail = { glyph: string; size: number; strokeWidth: number };
export type ComponentRecipe = {
  /** @deprecated Use surface. */
  base?: VisualStyle;
  geometry?: Partial<ComponentGeometry>;
  surface?: VisualStyle;
  typography?: ComponentTypography;
  detail?: ComponentDetail;
  shape?: "rect" | "circle" | "storage" | "callout" | "boundary";
  elevation?: "none" | "low" | "raised";
  states?: Partial<Record<"focused" | "traced" | "muted" | "success" | "warning" | "danger", VisualStyle>>;
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
      surfaceMuted: "#f4f6f8",
      text: "#111827",
      muted: "#667085",
      border: "#d8dee8",
      connector: "#7c8ba1",
      accent: "#2563eb",
      accentSoft: "#eff6ff",
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
    box: nodeRecipe("none", { detailWidth: 0 }),
    text: { typography: { color: "$color.text", fontSize: "$type.body", fontWeight: 500, lineHeight: 18 } },
    connector: { surface: { stroke: "$color.connector", strokeWidth: "$stroke.normal" }, states: { traced: { stroke: "$color.accent", strokeWidth: "$stroke.strong" } } },
    "lib.person": nodeRecipe("person", { minWidth: 124, detailWidth: 26 }),
    "lib.team": nodeRecipe("team", { minWidth: 132, detailWidth: 28 }),
    "lib.service": labelNodeRecipe(),
    "lib.api": labelNodeRecipe(),
    "lib.server": nodeRecipe("server"),
    "lib.worker": nodeRecipe("worker"),
    "lib.tool": nodeRecipe("tool", { minWidth: 116, minHeight: 60, paddingX: 14, detailWidth: 22, labelGap: 8 }),
    "lib.agent": nodeRecipe("agent", { minWidth: 152, minHeight: 76, detailWidth: 30, labelGap: 12 }),
    "lib.model": nodeRecipe("model", { minWidth: 148, minHeight: 76, detailWidth: 30, labelGap: 12 }),
    "lib.database": nodeRecipe("database", { minWidth: 124 }, "storage"),
    "lib.objectStore": nodeRecipe("database", { minWidth: 132 }, "storage"),
    "lib.warehouse": nodeRecipe("database", { minWidth: 136 }, "storage"),
    "lib.cache": nodeRecipe("cache"),
    "lib.queue": nodeRecipe("queue"),
    "lib.topic": nodeRecipe("queue"),
    "lib.stream": nodeRecipe("stream"),
    "lib.event": nodeRecipe("event"),
    "lib.browser": nodeRecipe("browser", { minWidth: 136 }),
    "lib.mobile": nodeRecipe("mobile", { minWidth: 124 }),
    "lib.terminal": nodeRecipe("terminal", { minWidth: 136 }),
    "lib.file": nodeRecipe("document"),
    "lib.document": nodeRecipe("document"),
    "lib.code": nodeRecipe("code", { minWidth: 144 }),
    "lib.table": nodeRecipe("table", { minWidth: 144 }),
    "lib.note": nodeRecipe("note", { minWidth: 132 }, "callout"),
    "lib.callout": nodeRecipe("callout", { minWidth: 140 }, "callout"),
    "lib.boundary": nodeRecipe("boundary", { minWidth: 160, minHeight: 96 }, "boundary"),
    "lib.badge": nodeRecipe("badge", { minWidth: 96, minHeight: 40, detailWidth: 0 }),
    "lib.legend": nodeRecipe("legend", { minWidth: 144 }),
    "lib.barChart": nodeRecipe("barChart", { minWidth: 180, minHeight: 112 }),
    "lib.lineChart": nodeRecipe("lineChart", { minWidth: 180, minHeight: 112 }),
    "lib.areaChart": nodeRecipe("areaChart", { minWidth: 180, minHeight: 112 }),
    "lib.progress": nodeRecipe("progress", { minWidth: 140 }),
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
    ...fallback?.surface,
    ...recipe?.base,
    ...recipe?.surface,
    ...(variant ? fallback?.variants?.[variant] : undefined),
    ...(variant ? recipe?.variants?.[variant] : undefined),
    ...primitive,
  } satisfies VisualStyle;
}

export function resolveComponentRecipe(kind: string, variant: string | undefined, theme: LiveryTheme = canonicalTheme): ComponentRecipe {
  const fallback = canonicalTheme.components[kind] ?? canonicalTheme.components.box ?? {};
  const selected = theme.components[kind] ?? theme.components.box ?? {};
  return {
    ...fallback,
    ...selected,
    geometry: { ...fallback.geometry, ...selected.geometry },
    surface: { ...fallback.base, ...fallback.surface, ...selected.base, ...selected.surface, ...(variant ? fallback.variants?.[variant] : undefined), ...(variant ? selected.variants?.[variant] : undefined) },
    typography: { ...fallback.typography, ...selected.typography },
    states: { ...fallback.states, ...selected.states },
  };
}

function flattenTokens(theme: LiveryTheme) {
  const result: TokenOverrides = {};
  for (const [group, values] of Object.entries(theme.tokens)) {
    for (const [name, value] of Object.entries(values)) result[`${group}.${name}`] = value;
  }
  return result;
}

function nodeRecipe(glyph: string, geometry: Partial<ComponentGeometry> = {}, shape: ComponentRecipe["shape"] = "rect"): ComponentRecipe {
  return {
    geometry: { minWidth: 128, minHeight: 68, paddingX: 16, paddingY: 14, detailWidth: 24, labelGap: 10, ...geometry },
    surface: { fill: "$color.surface", stroke: "$color.border", strokeWidth: "$stroke.hairline", radius: "$radius.md" },
    typography: { color: "$color.text", fontSize: "$type.body", fontWeight: 650, lineHeight: 18, align: shape === "storage" ? "center" : "start" },
    detail: { glyph, size: 18, strokeWidth: 1.4 },
    shape,
    elevation: "low",
    states: { focused: { fill: "$color.accentSoft", stroke: "$color.accent", strokeWidth: "$stroke.strong" }, muted: { opacity: 0.62 } },
    variants: { muted: { fill: "$color.surfaceMuted" }, emphasis: { stroke: "$color.accent", strokeWidth: "$stroke.strong" } },
  };
}

function labelNodeRecipe(): ComponentRecipe {
  const recipe = nodeRecipe("none", { detailWidth: 0 });
  return { ...recipe, typography: { ...recipe.typography, align: "center" } };
}
