import { canonicalGlyph, type IconRegistry } from "./glyphs.js";
import { canonicalTheme, componentToneStyle, resolveComponentRecipe, resolveComponentStyle, resolveTheme, resolveVisualValue, toneColor, type LiveryTheme, type TokenOverrides } from "./theme.js";
import type { SolvedVisualNode, VisualScene } from "./visual-layout.js";
import type { VisualTimelineState } from "./timeline.js";

export type VisualSvgOptions = { theme?: LiveryTheme; tokenOverrides?: TokenOverrides; icons?: IconRegistry; state?: VisualTimelineState };

export function visualSceneToSvg(scene: VisualScene, options: VisualSvgOptions = {}) {
  const tokens = resolveTheme(options.theme ?? canonicalTheme, options.tokenOverrides);
  const markerId = `${safeId(scene.id)}-arrow`;
  const gridId = `${safeId(scene.id)}-grid`;
  const titleHeight = scene.title ? 42 : 0;
  const height = scene.height + titleHeight;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${height}" viewBox="0 0 ${scene.width} ${height}" role="img" aria-labelledby="${safeId(scene.id)}-title ${safeId(scene.id)}-desc">`,
    `  <title id="${safeId(scene.id)}-title">${escapeXml(scene.title ?? scene.id)}</title>`,
    `  <desc id="${safeId(scene.id)}-desc">${escapeXml(scene.accessibility.summary)}</desc>`,
    `  <rect width="${scene.width}" height="${height}" fill="${tokens["color.canvas"]}"/>`,
    `  <defs>`,
    `    <marker id="${markerId}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke"/></marker>`,
    `    <filter id="${safeId(scene.id)}-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#101828" flood-opacity="0.08"/></filter>`,
    ...(tokens["color.grid"] ? [`    <pattern id="${gridId}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${tokens["color.grid"]}" stroke-width="1"/></pattern>`] : []),
    `  </defs>`,
  ];
  if (tokens["color.grid"]) lines.push(`  <rect width="${scene.width}" height="${height}" fill="url(#${gridId})"/>`);
  if (scene.title) lines.push(`  <text x="20" y="27" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${tokens["type.label"]}" font-weight="${tokens["type.titleWeight"]}" fill="${tokens["color.text"]}">${escapeXml(scene.title)}</text>`);
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const node of scene.nodes.filter(({ kind }) => kind === "frame")) lines.push(...renderNode(node, tokens, options.theme ?? canonicalTheme, `${safeId(scene.id)}-shadow`, options.state, options.icons));
  for (const connector of scene.connectors) {
    const stateTone = options.state?.properties.get(connector.id)?.tone;
    const stroke = connector.style?.stroke ? resolveVisualValue(connector.style.stroke, tokens) : toneColor(typeof stateTone === "string" ? stateTone as typeof connector.tone : connector.tone, tokens);
    const connectorState = stateAttributes(connector.id, options.state);
    lines.push(`    <path data-livery-id="${escapeXml(connector.id)}" d="${connector.path}" fill="none" stroke="${stroke}" stroke-width="${options.state?.traced.has(connector.id) ? tokens["stroke.strong"] : tokens["stroke.normal"]}" marker-end="url(#${markerId})"${connectorState}/>`);
    if (connector.label) {
      const labelWidth = Math.max(30, connector.label.length * 5.4 + 10);
      lines.push(`    <rect x="${connector.labelX - labelWidth / 2}" y="${connector.labelY - 12}" width="${labelWidth}" height="18" rx="5" fill="${tokens["color.surface"]}" stroke="${tokens["color.border"]}"/>`);
      lines.push(`    <text x="${connector.labelX}" y="${connector.labelY + 1}" text-anchor="middle" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${tokens["type.caption"]}" font-weight="650" fill="${tokens["color.muted"]}">${escapeXml(connector.label)}</text>`);
    }
  }
  for (const node of scene.nodes.filter(({ kind }) => kind !== "frame")) lines.push(...renderNode(node, tokens, options.theme ?? canonicalTheme, `${safeId(scene.id)}-shadow`, options.state, options.icons));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function renderNode(node: SolvedVisualNode, tokens: TokenOverrides, theme: LiveryTheme, shadowId: string, state?: VisualTimelineState, icons?: IconRegistry) {
  const stateTone = state?.properties.get(node.id)?.tone;
  const properties = state?.properties.get(node.id);
  const style = { ...resolveComponentStyle(node.kind, node.variant, undefined, theme), ...componentToneStyle(node.tone, node.variant), ...node.style, ...(typeof stateTone === "string" ? componentToneStyle(stateTone as typeof node.tone, node.variant) : undefined) };
  const fill = resolveVisualValue(properties?.fill ?? style.fill ?? "$color.surface", tokens);
  const stroke = resolveVisualValue(properties?.stroke ?? style.stroke, tokens) ?? toneColor(typeof stateTone === "string" ? stateTone as typeof node.tone : node.tone, { ...tokens, "color.connector": tokens["color.border"]! });
  const radius = resolveVisualValue(style.radius ?? "$radius.md", tokens);
  const focusStroke = state?.focused.has(node.id) ? ` stroke-width="${tokens["stroke.strong"]}" stroke-dasharray="4 3"` : "";
  const shadow = node.kind === "text" || node.kind === "line" || node.kind === "path" ? "" : ` filter="url(#${shadowId})"`;
  const lines = [`    <g data-livery-id="${escapeXml(node.id)}"${stateAttributes(node.id, state)}${shadow}>`, `      <title>${escapeXml(node.description ?? node.label ?? node.id)}</title>`];
  if (node.kind === "text") {
    // Text primitives intentionally have no implicit surface.
  } else if (node.kind === "circle") {
    lines.push(`      <circle cx="${node.x + node.width / 2}" cy="${node.y + node.height / 2}" r="${Math.min(node.width, node.height) / 2}" fill="${fill}" stroke="${stroke}"${focusStroke}/>`);
  } else if (node.kind === "line") {
    lines.push(`      <line x1="${node.x}" y1="${node.y + node.height / 2}" x2="${node.x + node.width}" y2="${node.y + node.height / 2}" stroke="${stroke}"${focusStroke}/>`);
  } else if (node.kind === "path" && typeof node.props?.d === "string") {
    lines.push(`      <path d="${escapeXml(node.props.d)}" fill="${fill}" stroke="${stroke}"${focusStroke}/>`);
  } else if (node.kind === "lib.database" || node.kind === "lib.warehouse" || node.kind === "lib.objectStore") {
    lines.push(`      <rect x="${node.x}" y="${node.y + 7}" width="${node.width}" height="${node.height - 14}" fill="${fill}" stroke="${stroke}"${focusStroke}/>`);
    lines.push(`      <ellipse cx="${node.x + node.width / 2}" cy="${node.y + 7}" rx="${node.width / 2}" ry="7" fill="${fill}" stroke="${stroke}"${focusStroke}/>`);
    lines.push(`      <path d="M ${node.x} ${node.y + node.height - 7} A ${node.width / 2} 7 0 0 0 ${node.x + node.width} ${node.y + node.height - 7}" fill="none" stroke="${stroke}"/>`);
  } else {
    lines.push(`      <rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="${radius}" fill="${fill}" stroke="${stroke}"${focusStroke}/>`);
    lines.push(...componentDetails(node, tokens, theme, style, icons));
  }
  if (node.label) {
    const hasGlyph = node.kind.startsWith("lib.") && !["lib.database", "lib.warehouse", "lib.objectStore"].includes(node.kind);
    const labelX = node.kind === "text" ? node.x : hasGlyph ? node.x + 42 : node.x + 18;
    const labelY = node.y + node.height / 2 + (node.subtitle ? -2 : 5);
    const color = resolveVisualValue(properties?.color ?? style.color, tokens) ?? tokens["color.text"];
    lines.push(`      <text x="${labelX}" y="${labelY}" text-anchor="start" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${resolveVisualValue(properties?.fontSize ?? style.fontSize, tokens) ?? tokens["type.body"]}" font-weight="${resolveVisualValue(properties?.fontWeight ?? style.fontWeight, tokens) ?? tokens["type.bodyWeight"]}" fill="${color}">${escapeXml(node.label)}</text>`);
    if (node.subtitle) lines.push(`      <text x="${labelX}" y="${labelY + 16}" text-anchor="start" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${tokens["type.caption"]}" font-weight="500" fill="${resolveVisualValue(style.color, tokens) ?? tokens["color.muted"]}">${escapeXml(node.subtitle)}</text>`);
  }
  lines.push("    </g>");
  return lines;
}

function componentDetails(node: SolvedVisualNode, tokens: TokenOverrides, theme: LiveryTheme, style: ReturnType<typeof resolveComponentStyle>, icons?: IconRegistry) {
  const recipe = resolveComponentRecipe(node.kind, node.variant, theme);
  const glyph = typeof node.props?.icon === "string" ? node.props.icon : recipe.detail?.glyph;
  const paths = canonicalGlyph(glyph, icons);
  if (!paths?.length) return [];
  const size = recipe.detail?.size ?? 18;
  const scale = size / 24;
  const x = node.x + 14;
  const y = node.y + (node.height - size) / 2;
  const color = resolveVisualValue(style.iconColor, tokens) ?? tokens["color.muted"];
  return [
    `      <g data-livery-glyph="${escapeXml(glyph ?? "")}" transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="${(recipe.detail?.strokeWidth ?? 1.5) / scale}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">`,
    ...paths.map((path) => `        <path d="${escapeXml(path)}"/>`),
    "      </g>",
  ];
}

function safeId(value: string) { return value.replaceAll(/[^A-Za-z0-9_-]/g, "-") || "livery"; }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function stateAttributes(id: string, state?: VisualTimelineState) {
  if (!state) return "";
  const opacity = state.visible.has(id) ? 1 : 0;
  const focused = state.focused.has(id) ? ' data-livery-focused="true"' : "";
  const morph = state.morphs.get(id);
  return ` opacity="${opacity}"${focused}${morph ? ` data-livery-morph-from="${escapeXml(morph)}"` : ""}`;
}
