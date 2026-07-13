import { canonicalTheme, resolveComponentStyle, resolveTheme, resolveVisualValue, toneColor, type LiveryTheme, type TokenOverrides } from "./theme.js";
import type { SolvedVisualNode, VisualScene } from "./visual-layout.js";
import type { VisualTimelineState } from "./timeline.js";

export type VisualSvgOptions = { theme?: LiveryTheme; tokenOverrides?: TokenOverrides; state?: VisualTimelineState };

export function visualSceneToSvg(scene: VisualScene, options: VisualSvgOptions = {}) {
  const tokens = resolveTheme(options.theme ?? canonicalTheme, options.tokenOverrides);
  const markerId = `${safeId(scene.id)}-arrow`;
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
    `  </defs>`,
  ];
  if (scene.title) lines.push(`  <text x="20" y="27" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.label"]}" font-weight="700" fill="${tokens["color.text"]}">${escapeXml(scene.title)}</text>`);
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const connector of scene.connectors) {
    const stateTone = options.state?.properties.get(connector.id)?.tone;
    const stroke = connector.style?.stroke ? resolveVisualValue(connector.style.stroke, tokens) : toneColor(typeof stateTone === "string" ? stateTone as typeof connector.tone : connector.tone, tokens);
    const connectorState = stateAttributes(connector.id, options.state);
    lines.push(`    <path data-livery-id="${escapeXml(connector.id)}" d="${connector.path}" fill="none" stroke="${stroke}" stroke-width="${options.state?.traced.has(connector.id) ? tokens["stroke.strong"] : tokens["stroke.normal"]}" marker-end="url(#${markerId})"${connectorState}/>`);
    if (connector.label) {
      const labelWidth = Math.max(30, connector.label.length * 5.4 + 10);
      lines.push(`    <rect x="${connector.labelX - labelWidth / 2}" y="${connector.labelY - 12}" width="${labelWidth}" height="18" rx="5" fill="${tokens["color.surface"]}" stroke="${tokens["color.border"]}"/>`);
      lines.push(`    <text x="${connector.labelX}" y="${connector.labelY + 1}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.caption"]}" font-weight="650" fill="${tokens["color.muted"]}">${escapeXml(connector.label)}</text>`);
    }
  }
  for (const node of scene.nodes) lines.push(...renderNode(node, tokens, options.theme ?? canonicalTheme, `${safeId(scene.id)}-shadow`, options.state));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function renderNode(node: SolvedVisualNode, tokens: TokenOverrides, theme: LiveryTheme, shadowId: string, state?: VisualTimelineState) {
  const style = resolveComponentStyle(node.kind, node.variant, node.style, theme);
  const fill = resolveVisualValue(style.fill ?? "$color.surface", tokens);
  const stateTone = state?.properties.get(node.id)?.tone;
  const stroke = style.stroke ? resolveVisualValue(style.stroke, tokens) : toneColor(typeof stateTone === "string" ? stateTone as typeof node.tone : node.tone, { ...tokens, "color.connector": tokens["color.border"]! });
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
    lines.push(...componentDetails(node, tokens));
  }
  if (node.label) {
    const hasGlyph = node.kind.startsWith("lib.") && !["lib.database", "lib.warehouse", "lib.objectStore"].includes(node.kind);
    const labelX = node.kind === "text" ? node.x : hasGlyph ? node.x + 42 : node.x + 18;
    lines.push(`      <text x="${labelX}" y="${node.y + node.height / 2 + 5}" text-anchor="start" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.body"]}" font-weight="650" fill="${tokens["color.text"]}">${escapeXml(node.label)}</text>`);
  }
  lines.push("    </g>");
  return lines;
}

function componentDetails(node: SolvedVisualNode, tokens: TokenOverrides) {
  const muted = tokens["color.muted"];
  if (node.kind === "lib.browser") return [`      <line x1="${node.x}" y1="${node.y + 15}" x2="${node.x + node.width}" y2="${node.y + 15}" stroke="${muted}"/>`, `      <circle cx="${node.x + 10}" cy="${node.y + 8}" r="2" fill="${muted}"/>`];
  if (node.kind === "lib.cache" || node.kind === "lib.queue" || node.kind === "lib.stream") return [10, 16].map((offset) => `      <line x1="${node.x + 10}" y1="${node.y + offset}" x2="${node.x + node.width - 10}" y2="${node.y + offset}" stroke="${muted}"/>`);
  if (node.kind === "lib.person" || node.kind === "lib.agent") return [`      <circle cx="${node.x + 15}" cy="${node.y + 17}" r="5" fill="none" stroke="${muted}"/>`, `      <path d="M ${node.x + 7} ${node.y + 32} Q ${node.x + 15} ${node.y + 23} ${node.x + 23} ${node.y + 32}" fill="none" stroke="${muted}"/>`];
  if (node.kind === "lib.service" || node.kind === "lib.api" || node.kind === "lib.worker" || node.kind === "lib.tool" || node.kind === "lib.model") return [`      <rect x="${node.x + 14}" y="${node.y + node.height / 2 - 8}" width="16" height="16" rx="4" fill="#eef2f7" stroke="${muted}"/>`, `      <circle cx="${node.x + 22}" cy="${node.y + node.height / 2}" r="2.5" fill="${muted}"/>`];
  if (node.kind === "lib.note" || node.kind === "lib.document" || node.kind === "lib.file") return [`      <path d="M ${node.x + node.width - 18} ${node.y} V ${node.y + 18} H ${node.x + node.width}" fill="none" stroke="${muted}"/>`];
  return [];
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
