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
      background: "#f5f5f3",
      canvas: "#f8f9fa",
      surface: "#ffffff",
      surfaceMuted: "#f1f3f5",
      text: "#1b2430",
      muted: "#687482",
      border: "#d5dbe2",
      connector: "#8793a2",
      accent: "#c0264f",
      accentSoft: "#fbeff2",
      info: "#4b6f96",
      infoSoft: "#eff4f9",
      success: "#49755c",
      successSoft: "#eff6f1",
      warning: "#936b30",
      warningSoft: "#faf5e9",
      danger: "#a34c59",
      dangerSoft: "#faeff1",
      onAccent: "#ffffff",
    },
    space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
    type: {
      fontFamily: "Inter,system-ui,sans-serif",
      monoFamily: "SFMono-Regular,Consolas,monospace",
      caption: 11,
      body: 13,
      label: 15,
      title: 19,
      bodyWeight: 600,
      titleWeight: 720,
      lineHeight: 19,
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
      background: "#f3eee4",
      canvas: "#faf7f0",
      surface: "#fffdf8",
      surfaceMuted: "#f1ece3",
      text: "#29251f",
      muted: "#746e64",
      border: "#d7cfc2",
      connector: "#8b8378",
      accent: "#a7433b",
      accentSoft: "#f7ebe7",
      info: "#586f7d",
      infoSoft: "#edf1f1",
      success: "#5c7556",
      successSoft: "#eef3eb",
      warning: "#8b6b38",
      warningSoft: "#f6f0e2",
      danger: "#9c4f47",
      dangerSoft: "#f7ebe7",
    },
    radius: { ...canonicalTheme.tokens.radius, sm: 2, md: 4, lg: 6 },
    elevation: { ...canonicalTheme.tokens.elevation, low: "0 2px 5px rgb(73 59 42 / 8%)", raised: "0 8px 20px rgb(73 59 42 / 10%)" },
  },
};

export const midnightTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "midnight",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#080d18",
      canvas: "#101827",
      surface: "#172132",
      surfaceMuted: "#1d293b",
      text: "#f1f5f9",
      muted: "#9ba9bb",
      border: "#334155",
      connector: "#718096",
      accent: "#d36a8a",
      accentSoft: "#35202a",
      info: "#7db4df",
      infoSoft: "#182d42",
      success: "#6eb58a",
      successSoft: "#193328",
      warning: "#d9ad59",
      warningSoft: "#352d1c",
      danger: "#df7f8f",
      dangerSoft: "#382129",
      onAccent: "#ffffff",
    },
    elevation: { ...canonicalTheme.tokens.elevation, low: "0 3px 10px rgb(0 0 0 / 24%)", raised: "0 12px 30px rgb(0 0 0 / 34%)" },
  },
};

export const blackoutTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "blackout",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#000000",
      canvas: "#080809",
      surface: "#111113",
      surfaceMuted: "#19191c",
      text: "#f4f4f5",
      muted: "#a1a1aa",
      border: "#303034",
      connector: "#75757f",
      accent: "#f4f4f5",
      accentSoft: "#242428",
      info: "#93b9d8",
      infoSoft: "#17232d",
      success: "#85b596",
      successSoft: "#19261e",
      warning: "#c6aa70",
      warningSoft: "#282317",
      danger: "#c9848e",
      dangerSoft: "#2b1d20",
      onAccent: "#09090b",
      grid: "#18181b",
    },
    type: {
      ...canonicalTheme.tokens.type,
      bodyWeight: 600,
      titleWeight: 720,
    },
    radius: { ...canonicalTheme.tokens.radius, sm: 3, md: 5, lg: 7 },
    elevation: { ...canonicalTheme.tokens.elevation, low: "0 2px 8px rgb(0 0 0 / 45%)", raised: "0 10px 28px rgb(0 0 0 / 60%)" },
  },
};

export const blueprintTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "blueprint",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#06111f",
      canvas: "#0a1b2e",
      surface: "#102a45",
      surfaceMuted: "#0d233a",
      text: "#e5f4ff",
      muted: "#8fb5d1",
      border: "#2b5c81",
      connector: "#6999bb",
      accent: "#67d8ee",
      accentSoft: "#0d384d",
      info: "#83c8eb",
      infoSoft: "#123850",
      success: "#78cdbd",
      successSoft: "#123c3c",
      warning: "#d8ba73",
      warningSoft: "#38311e",
      danger: "#d9919c",
      dangerSoft: "#40242d",
      onAccent: "#04131f",
      grid: "#153653",
    },
    type: {
      ...canonicalTheme.tokens.type,
      fontFamily: "Inter,system-ui,sans-serif",
      monoFamily: "SFMono-Regular,Consolas,monospace",
      bodyWeight: 600,
      titleWeight: 720,
    },
    radius: { ...canonicalTheme.tokens.radius, sm: 2, md: 3, lg: 4 },
    stroke: { ...canonicalTheme.tokens.stroke, hairline: 1, normal: 1.25, strong: 2 },
    elevation: { ...canonicalTheme.tokens.elevation, low: "0 2px 10px rgb(1 8 18 / 35%)", raised: "0 8px 24px rgb(1 8 18 / 45%)" },
  },
};

export const monochromeTheme: LiveryTheme = {
  ...canonicalTheme,
  name: "monochrome",
  tokens: {
    ...canonicalTheme.tokens,
    color: {
      ...canonicalTheme.tokens.color,
      background: "#eeeeee",
      canvas: "#fafafa",
      surface: "#ffffff",
      surfaceMuted: "#eeeeee",
      text: "#0a0a0a",
      muted: "#626262",
      border: "#ababab",
      connector: "#4a4a4a",
      accent: "#111111",
      accentSoft: "#e7e7e7",
      info: "#262626",
      infoSoft: "#e5e5e5",
      success: "#171717",
      successSoft: "#f0f0f0",
      warning: "#525252",
      warningSoft: "#ededed",
      danger: "#000000",
      dangerSoft: "#dddddd",
      onAccent: "#ffffff",
    },
    type: {
      ...canonicalTheme.tokens.type,
      fontFamily: "Inter,system-ui,sans-serif",
      bodyWeight: 600,
      titleWeight: 720,
    },
    radius: { ...canonicalTheme.tokens.radius, sm: 0, md: 2, lg: 3 },
    stroke: { ...canonicalTheme.tokens.stroke, hairline: 1, normal: 1.5, strong: 2.5 },
    elevation: { ...canonicalTheme.tokens.elevation, low: "none", raised: "none" },
  },
  components: {
    ...canonicalTheme.components,
    "lib.note": { ...canonicalTheme.components["lib.note"], elevation: "none" },
    "lib.callout": { ...canonicalTheme.components["lib.callout"], elevation: "none" },
  },
};

export const builtInThemes = {
  editorial: editorialTheme,
  paper: paperTheme,
  midnight: midnightTheme,
  blackout: blackoutTheme,
  blueprint: blueprintTheme,
  monochrome: monochromeTheme,
} as const satisfies Record<string, LiveryTheme>;

export type BuiltInThemeName = keyof typeof builtInThemes;

export function getBuiltInTheme(name: BuiltInThemeName): LiveryTheme {
  return builtInThemes[name];
}
