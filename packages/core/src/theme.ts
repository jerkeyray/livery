import type { SemanticTone } from "./artifact.js";
import type { VisualStyle, VisualValue } from "./visual.js";

export type ScaleTokens = Record<string, string | number>;
export type ComponentGeometry = { minWidth: number; maxWidth: number; minHeight: number; paddingX: number; paddingY: number; detailWidth: number; labelGap: number };
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
      canvas: "#f8fafc",
      surface: "#ffffff",
      surfaceMuted: "#f4f6f8",
      text: "#172033",
      muted: "#64748b",
      border: "#cbd5e1",
      connector: "#8492a6",
      accent: "#c0264f",
      accentSoft: "#fff1f4",
      info: "#2563eb",
      infoSoft: "#eff6ff",
      success: "#15803d",
      successSoft: "#f0fdf4",
      warning: "#a16207",
      warningSoft: "#fffbeb",
      danger: "#b91c1c",
      dangerSoft: "#fef2f2",
      onAccent: "#ffffff",
    },
    space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    type: {
      fontFamily: "Inter,system-ui,sans-serif",
      monoFamily: "SFMono-Regular,Consolas,monospace",
      caption: 10,
      body: 13,
      label: 14,
      title: 18,
      bodyWeight: 600,
      titleWeight: 700,
      lineHeight: 18,
    },
    radius: { none: 0, sm: 4, md: 6, lg: 8, pill: 999 },
    stroke: { hairline: 1, normal: 1.5, strong: 2 },
    elevation: { none: "none", low: "0 1px 2px rgb(15 23 42 / 6%)", raised: "0 6px 18px rgb(15 23 42 / 9%)" },
    motion: { fast: 120, normal: 220, slow: 400 },
  },
  components: {
    box: nodeRecipe("none", { detailWidth: 0 }),
    frame: {
      geometry: { minWidth: 220, maxWidth: 960, minHeight: 140, paddingX: 20, paddingY: 18, detailWidth: 0, labelGap: 0 },
      surface: { fill: "$color.surfaceMuted", stroke: "$color.border", strokeWidth: "$stroke.hairline", radius: "$radius.lg" },
      typography: { color: "$color.text", fontSize: "$type.label", fontWeight: "$type.titleWeight", lineHeight: 20, align: "start" },
      shape: "rect",
      elevation: "none",
      states: { focused: { stroke: "$color.accent", strokeWidth: "$stroke.strong" }, muted: { opacity: 0.62 } },
      variants: {
        muted: { fill: "$color.surfaceMuted", opacity: 0.72 },
        emphasis: { fill: "$color.accentSoft", stroke: "$color.accent", strokeWidth: "$stroke.strong" },
        soft: { fill: "$color.accentSoft", stroke: "$color.accent" },
        solid: { fill: "$color.accent", stroke: "$color.accent", color: "$color.onAccent" },
        ghost: { fill: "transparent", stroke: "transparent" },
      },
    },
    text: { typography: { color: "$color.text", fontSize: "$type.body", fontWeight: 500, lineHeight: 18 } },
    connector: { surface: { stroke: "$color.connector", strokeWidth: "$stroke.normal" }, states: { traced: { stroke: "$color.accent", strokeWidth: "$stroke.strong" } } },
    "lib.person": nodeRecipe("person", { minWidth: 132, detailWidth: 28 }),
    "lib.team": nodeRecipe("team", { minWidth: 140, detailWidth: 30 }),
    "lib.service": nodeRecipe("service"),
    "lib.api": nodeRecipe("api"),
    "lib.server": nodeRecipe("server"),
    "lib.worker": nodeRecipe("worker"),
    "lib.tool": nodeRecipe("tool", { minWidth: 124, minHeight: 64, paddingX: 14, detailWidth: 24, labelGap: 9 }),
    "lib.agent": nodeRecipe("agent", { minWidth: 148, minHeight: 72, detailWidth: 28, labelGap: 11 }),
    "lib.model": nodeRecipe("model", { minWidth: 148, minHeight: 72, detailWidth: 28, labelGap: 11 }),
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
    "lib.note": raisedRecipe("note", { minWidth: 180, maxWidth: 220 }, "callout"),
    "lib.callout": raisedRecipe("callout", { minWidth: 196, maxWidth: 232 }, "callout"),
    "lib.boundary": nodeRecipe("boundary", { minWidth: 160, minHeight: 96 }, "boundary"),
    "lib.badge": nodeRecipe("badge", { minWidth: 96, minHeight: 40, detailWidth: 0 }),
    "lib.legend": nodeRecipe("legend", { minWidth: 144 }),
    "lib.barChart": nodeRecipe("barChart", { minWidth: 180, minHeight: 104 }),
    "lib.lineChart": nodeRecipe("lineChart", { minWidth: 180, minHeight: 104 }),
    "lib.areaChart": nodeRecipe("areaChart", { minWidth: 180, minHeight: 104 }),
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
    geometry: { minWidth: 128, maxWidth: 184, minHeight: 68, paddingX: 16, paddingY: 14, detailWidth: 24, labelGap: 10, ...geometry },
    surface: { fill: "$color.surface", stroke: "$color.border", strokeWidth: "$stroke.hairline", radius: "$radius.md" },
    typography: { color: "$color.text", fontSize: "$type.body", fontWeight: 600, lineHeight: 18, align: shape === "storage" ? "center" : "start" },
    detail: { glyph, size: 18, strokeWidth: 1.4 },
    shape,
    elevation: "none",
    states: { focused: { fill: "$color.accentSoft", stroke: "$color.accent", strokeWidth: "$stroke.strong" }, muted: { opacity: 0.62 } },
    variants: {
      muted: { fill: "$color.surfaceMuted", opacity: 0.72 },
      emphasis: { fill: "$color.accentSoft", stroke: "$color.accent", strokeWidth: "$stroke.strong", iconColor: "$color.accent" },
      soft: { fill: "$color.accentSoft", stroke: "$color.accent", iconColor: "$color.accent" },
      solid: { fill: "$color.accent", stroke: "$color.accent", color: "$color.onAccent", iconColor: "$color.onAccent" },
      ghost: { fill: "transparent", stroke: "transparent", color: "$color.text", iconColor: "$color.muted" },
    },
  };
}

function raisedRecipe(glyph: string, geometry: Partial<ComponentGeometry> = {}, shape: ComponentRecipe["shape"] = "rect"): ComponentRecipe {
  return { ...nodeRecipe(glyph, geometry, shape), elevation: "low" };
}

export function componentToneStyle(tone: SemanticTone | undefined, variant?: string): VisualStyle {
  if (!tone || tone === "neutral") return {};
  const color = `$color.${tone}`;
  if (variant === "solid") return { fill: color, stroke: color, color: "$color.onAccent", iconColor: "$color.onAccent" };
  if (variant === "ghost") return { fill: "transparent", stroke: "transparent", color, iconColor: color };
  return { fill: `$color.${tone}Soft`, stroke: color, iconColor: color };
}

export const editorialTheme: LiveryTheme = { ...canonicalTheme, name: "editorial" };

export const paperTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "paper",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#f5f1e8",
      canvas: "#f8f5ee",
      surface: "#fffdf8",
      surfaceMuted: "#f1ece2",
      text: "#24211d",
      muted: "#746e65",
      border: "#d6cec0",
      connector: "#8c857b",
    },
  },
};

export const midnightTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "midnight",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#0b1020",
      canvas: "#0f1629",
      surface: "#171f34",
      surfaceMuted: "#202a42",
      text: "#eef2ff",
      muted: "#9aa7bd",
      border: "#34415b",
      connector: "#71809a",
      accent: "#f0527d",
      accentSoft: "#341a2a",
      info: "#60a5fa",
      infoSoft: "#142a46",
      success: "#4ade80",
      successSoft: "#153526",
      warning: "#fbbf24",
      warningSoft: "#3a2d13",
      danger: "#fb7185",
      dangerSoft: "#3c1922",
      onAccent: "#ffffff",
    },
  },
};

export const builtInThemes = {
  editorial: editorialTheme,
  paper: paperTheme,
  midnight: midnightTheme,
} as const satisfies Record<string, LiveryTheme>;

export type BuiltInThemeName = keyof typeof builtInThemes;

export function getBuiltInTheme(name: BuiltInThemeName): LiveryTheme {
  return builtInThemes[name];
}
