import type { BoardRect, BoardScene, CanvasPrimitive, SolvedElement } from "./board.js";
import { canonicalTheme, resolveTheme, resolveVisualValue, toneColor, type LiveryTheme, type TokenOverrides } from "./theme.js";
import type { VisualTimelineState } from "./timeline.js";

export type BoardSvgOptions = {
  debug?: boolean;
  state?: VisualTimelineState;
  theme?: LiveryTheme;
  tokenOverrides?: TokenOverrides;
};

export function boardSceneToSvg(scene: BoardScene, options: BoardSvgOptions = {}) {
  const tokens = resolveTheme(options.theme ?? canonicalTheme, options.tokenOverrides);
  const titleHeight = scene.title ? 42 : 0;
  const markerId = `${safeId(scene.id)}-arrow`;
  const childParents = new Set(scene.elements.flatMap(({ parent }) => parent ? [parent] : []));
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.board.width}" height="${scene.board.height + titleHeight}" viewBox="0 0 ${scene.board.width} ${scene.board.height + titleHeight}" role="img" aria-labelledby="${safeId(scene.id)}-title ${safeId(scene.id)}-desc">`,
    `  <title id="${safeId(scene.id)}-title">${escapeXml(scene.title ?? scene.id)}</title>`,
    `  <desc id="${safeId(scene.id)}-desc">${escapeXml(`${scene.title ?? scene.id}: ${scene.elements.length} elements and ${scene.connectors.length} connections.`)}</desc>`,
    `  <rect width="${scene.board.width}" height="${scene.board.height + titleHeight}" fill="${tokens["color.canvas"]}"/>`,
    "  <defs>",
    `    <marker id="${markerId}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke"/></marker>`,
    `    <filter id="${safeId(scene.id)}-card-shadow" x="-15%" y="-20%" width="130%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#101828" flood-opacity="0.08"/></filter>`,
    ...scene.canvases.filter(({ clip }) => clip).map((canvas) => `    <clipPath id="${safeId(canvas.id)}-clip"><rect x="${canvas.bounds.x}" y="${canvas.bounds.y}" width="${canvas.bounds.width}" height="${canvas.bounds.height}"/></clipPath>`),
    ...canvasReferences(scene, "clip").map(({ id, target }) => `    <clipPath id="${safeId(id)}-clip">${referenceShape(target, "#fff")}</clipPath>`),
    ...canvasReferences(scene, "mask").map(({ id, target }) => `    <mask id="${safeId(id)}-mask">${referenceShape(target, "#fff")}</mask>`),
    "  </defs>",
  ];
  if (scene.title) lines.push(`  <text x="20" y="27" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.label"]}" font-weight="700" fill="${tokens["color.text"]}">${escapeXml(scene.title)}</text>`);
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const connector of scene.connectors) {
    const stroke = toneColor(connector.tone, tokens);
    lines.push(`    <path data-livery-id="${escapeXml(connector.id)}" d="${pathData(connector.points)}" fill="none" stroke="${stroke}" stroke-width="${options.state?.traced.has(connector.id) ? tokens["stroke.strong"] : tokens["stroke.normal"]}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${markerId})"${stateAttributes(connector.id, options.state)}/>`);
    if (connector.label) {
      lines.push(`    <rect x="${connector.label.x}" y="${connector.label.y}" width="${connector.label.width}" height="${connector.label.height}" rx="4" fill="${tokens["color.canvas"]}" fill-opacity="0.96"/>`);
      lines.push(`    <text x="${connector.label.x + connector.label.width / 2}" y="${connector.label.y + connector.label.height / 2 + 4}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.caption"]}" font-weight="700" fill="${tokens["color.muted"]}">${escapeXml(connector.label.text)}</text>`);
    }
  }
  for (const canvas of scene.canvases) {
    lines.push(`    <g data-livery-canvas="${escapeXml(canvas.id)}"${canvas.clip ? ` clip-path="url(#${safeId(canvas.id)}-clip)"` : ""}>`);
    for (const primitive of [...canvas.primitives].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id))) lines.push(...renderPrimitive(primitive, tokens));
    lines.push("    </g>");
  }
  for (const element of scene.elements) {
    if (childParents.has(element.id) || element.kind === "canvas") continue;
    lines.push(...renderElement(element, tokens, `${safeId(scene.id)}-card-shadow`, options.state));
  }
  if (options.debug) lines.push(...renderDebug(scene));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function renderElement(element: SolvedElement, tokens: TokenOverrides, shadowId: string, state?: VisualTimelineState) {
  const { x, y, width, height } = element.visualBounds;
  const stroke = toneColor(element.tone, { ...tokens, "color.connector": tokens["color.border"]! });
  const surface = element.kind === "text" || element.kind === "line" || element.kind === "path" ? "" : ` filter="url(#${shadowId})"`;
  const lines = [`    <g data-livery-id="${escapeXml(element.id)}"${stateAttributes(element.id, state)}${surface}>`];
  if (element.kind === "text") {
    // Text is emitted below without an implicit surface.
  } else if (element.kind === "circle") lines.push(`      <circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${tokens["color.surface"]}" stroke="${stroke}"/>`);
  else if (element.kind === "lib.database" || element.kind === "lib.warehouse" || element.kind === "lib.objectStore") {
    lines.push(`      <rect x="${x}" y="${y + 7}" width="${width}" height="${height - 14}" fill="${tokens["color.surface"]}" stroke="${stroke}"/>`);
    lines.push(`      <ellipse cx="${x + width / 2}" cy="${y + 7}" rx="${width / 2}" ry="7" fill="${tokens["color.surface"]}" stroke="${stroke}"/>`);
    lines.push(`      <path d="M ${x} ${y + height - 7} A ${width / 2} 7 0 0 0 ${x + width} ${y + height - 7}" fill="none" stroke="${stroke}"/>`);
  } else {
    lines.push(`      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${tokens["radius.md"]}" fill="${tokens["color.surface"]}" stroke="${stroke}"/>`);
    lines.push(...componentDetails(element, tokens));
  }
  if (element.label) {
    const labelBounds = element.labelBounds ?? { x: x + 16, y: y + height / 2 - 9, width: width - 32, height: 18 };
    const hasGlyph = element.kind.startsWith("lib.") && !["lib.database", "lib.warehouse", "lib.objectStore"].includes(element.kind);
    const labelX = hasGlyph ? x + 44 : x + 18;
    const textLines = wrapText(element.label, Math.max(24, x + width - labelX - 14));
    lines.push(`      <text x="${labelX}" y="${labelBounds.y + 14}" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.body"]}" font-weight="650" fill="${tokens["color.text"]}">`);
    textLines.forEach((line, index) => lines.push(`        <tspan x="${labelX}" dy="${index === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`));
    lines.push("      </text>");
  }
  lines.push("    </g>");
  return lines;
}

function componentDetails(element: SolvedElement, tokens: TokenOverrides) {
  const { x, y, height, width } = element.visualBounds;
  const muted = tokens["color.muted"];
  const centerY = y + height / 2;
  if (element.kind === "lib.person" || element.kind === "lib.agent") return [`      <circle cx="${x + 22}" cy="${centerY - 8}" r="5" fill="none" stroke="${muted}" stroke-width="1.4"/>`, `      <path d="M ${x + 14} ${centerY + 8} Q ${x + 22} ${centerY - 1} ${x + 30} ${centerY + 8}" fill="none" stroke="${muted}" stroke-width="1.4" stroke-linecap="round"/>`];
  if (["lib.service", "lib.api", "lib.worker", "lib.tool", "lib.model"].includes(element.kind)) return [`      <rect x="${x + 14}" y="${centerY - 8}" width="16" height="16" rx="4" fill="#f1f5f9" stroke="${muted}"/>`, `      <circle cx="${x + 22}" cy="${centerY}" r="2.5" fill="${muted}"/>`];
  if (element.kind === "lib.browser") return [`      <rect x="${x + 14}" y="${centerY - 10}" width="18" height="20" rx="3" fill="none" stroke="${muted}"/>`, `      <line x1="${x + 14}" y1="${centerY - 4}" x2="${x + 32}" y2="${centerY - 4}" stroke="${muted}"/>`];
  if (["lib.cache", "lib.queue", "lib.stream", "lib.topic"].includes(element.kind)) return [`      <rect x="${x + 14}" y="${centerY - 9}" width="18" height="18" rx="3" fill="none" stroke="${muted}"/>`, `      <line x1="${x + 18}" y1="${centerY - 3}" x2="${x + 28}" y2="${centerY - 3}" stroke="${muted}"/>`, `      <line x1="${x + 18}" y1="${centerY + 3}" x2="${x + 28}" y2="${centerY + 3}" stroke="${muted}"/>`];
  if (["lib.note", "lib.callout", "lib.document", "lib.file"].includes(element.kind)) return [`      <path d="M ${x + 15} ${centerY - 10} H ${x + 29} L ${x + 33} ${centerY - 6} V ${centerY + 10} H ${x + 15} Z M ${x + 29} ${centerY - 10} V ${centerY - 6} H ${x + 33}" fill="none" stroke="${muted}" stroke-linejoin="round"/>`];
  if (element.kind === "lib.progress") return [`      <rect x="${x + 14}" y="${centerY - 4}" width="18" height="8" rx="4" fill="#eef2f7"/>`, `      <rect x="${x + 14}" y="${centerY - 4}" width="11" height="8" rx="4" fill="${muted}"/>`];
  if (element.kind === "lib.boundary") return [`      <rect x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" rx="4" fill="none" stroke="${muted}" stroke-dasharray="4 3"/>`];
  return [];
}

function renderPrimitive(primitive: CanvasPrimitive, tokens: TokenOverrides) {
  const { x, y, width, height } = primitive.bounds;
  const fill = resolveVisualValue(primitive.props?.fill ?? "$color.surface", tokens);
  const stroke = resolveVisualValue(primitive.props?.stroke ?? "$color.connector", tokens);
  const attributes = primitiveAttributes(primitive);
  if (primitive.kind === "circle") return [`      <circle data-livery-id="${escapeXml(primitive.id)}" cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}" stroke="${stroke}"${attributes}/>`];
  if (primitive.kind === "line") return [`      <line data-livery-id="${escapeXml(primitive.id)}" x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}" stroke="${stroke}"${attributes}/>`];
  if (primitive.kind === "path" && typeof primitive.props?.d === "string") return [`      <path data-livery-id="${escapeXml(primitive.id)}" d="${escapeXml(primitive.props.d)}" transform="translate(${x} ${y}) ${transformValue(primitive)}" fill="${fill}" stroke="${stroke}"${referenceAttributes(primitive)}/>`];
  if (primitive.kind === "text") return [`      <text data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y + height}" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.body"]}" fill="${tokens["color.text"]}"${attributes}>${escapeXml(String(primitive.props?.text ?? ""))}</text>`];
  return [`      <rect data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${primitive.props?.radius ?? 0}" fill="${fill}" stroke="${stroke}"${attributes}/>`];
}

function renderDebug(scene: BoardScene) {
  const lines = [`    <g data-livery-debug="true" pointer-events="none" font-family="ui-monospace,monospace" font-size="8">`];
  for (const channel of scene.board.channels) lines.push(`      <rect x="${channel.x}" y="${channel.y}" width="${channel.width}" height="${channel.height}" fill="#22c55e" fill-opacity="0.08" stroke="#16a34a" stroke-opacity="0.35"/>`);
  for (const envelope of scene.envelopes) lines.push(`      <rect x="${envelope.x}" y="${envelope.y}" width="${envelope.width}" height="${envelope.height}" fill="none" stroke="#ef4444" stroke-dasharray="3 2"/>`);
  for (const element of scene.elements) for (const pin of element.pins) lines.push(`      <circle cx="${pin.point.x}" cy="${pin.point.y}" r="3" fill="#2563eb"><title>${escapeXml(pin.id)}</title></circle>`);
  for (const primitive of scene.canvases.flatMap(({ primitives }) => primitives)) for (const pin of primitive.pins) lines.push(`      <circle cx="${pin.point.x}" cy="${pin.point.y}" r="2" fill="#7c3aed"><title>${escapeXml(pin.id)}</title></circle>`);
  lines.push("    </g>");
  return lines;
}

function pathData(points: Array<{ x: number; y: number }>) { return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" "); }
function safeId(value: string) { return value.replaceAll(/[^A-Za-z0-9_-]/g, "-") || "livery"; }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function stateAttributes(id: string, state?: VisualTimelineState) { if (!state) return ""; return ` opacity="${state.visible.has(id) ? 1 : 0}"${state.focused.has(id) ? ' data-livery-focused="true"' : ""}`; }
function primitiveAttributes(primitive: CanvasPrimitive) { return `${transformValue(primitive) ? ` transform="${transformValue(primitive)}"` : ""}${referenceAttributes(primitive)}`; }
function referenceAttributes(primitive: CanvasPrimitive) { return `${primitive.clip ? ` clip-path="url(#${safeId(primitive.id)}-clip)"` : ""}${primitive.mask ? ` mask="url(#${safeId(primitive.id)}-mask)"` : ""}`; }
function transformValue(primitive: CanvasPrimitive) { const transform = primitive.transform; if (!transform || (transform.translateX === 0 && transform.translateY === 0 && transform.scaleX === 1 && transform.scaleY === 1 && transform.rotate === 0)) return ""; const centerX = primitive.bounds.x + primitive.bounds.width / 2; const centerY = primitive.bounds.y + primitive.bounds.height / 2; return `translate(${transform.translateX} ${transform.translateY}) rotate(${transform.rotate} ${centerX} ${centerY}) translate(${centerX} ${centerY}) scale(${transform.scaleX} ${transform.scaleY}) translate(${-centerX} ${-centerY})`; }
function canvasReferences(scene: BoardScene, property: "clip" | "mask") { const primitives = scene.canvases.flatMap(({ primitives }) => primitives); return primitives.flatMap((primitive) => { const targetId = primitive[property]; const target = targetId ? primitives.find(({ id }) => id === targetId) : undefined; return target ? [{ id: primitive.id, target }] : []; }); }
function referenceShape(primitive: CanvasPrimitive, fill: string) { const { x, y, width, height } = primitive.bounds; return primitive.kind === "circle" ? `<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}"/>` : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`; }
function wrapText(value: string, width: number) { const limit = Math.max(1, Math.floor(width / 7.2)); const lines: string[] = []; let line = ""; for (const word of value.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (line && next.length > limit) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines.length ? lines : [""]; }
export function boardRectToViewBox(rect: BoardRect) { return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`; }
