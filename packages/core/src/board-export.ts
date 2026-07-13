import type { BoardRect, BoardScene, CanvasPrimitive, SolvedElement } from "./board.js";
import { canonicalTheme, resolveComponentRecipe, resolveTheme, resolveVisualValue, toneColor, type ComponentRecipe, type LiveryTheme, type TokenOverrides } from "./theme.js";
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.board.width}" height="${scene.board.height + titleHeight}" viewBox="0 0 ${scene.board.width} ${scene.board.height + titleHeight}" role="img" aria-label="${escapeXml(scene.title ?? scene.id)}" aria-describedby="${safeId(scene.id)}-desc">`,
    `  <desc id="${safeId(scene.id)}-desc">${escapeXml(`${scene.title ?? scene.id}: ${scene.elements.length} elements and ${scene.connectors.length} connections.`)}</desc>`,
    `  <rect width="${scene.board.width}" height="${scene.board.height + titleHeight}" fill="${tokens["color.canvas"]}"/>`,
    "  <defs>",
    ...scene.connectors.map((connector) => {
      const { stroke } = connectorStyle(connector, options.state, tokens, options.theme ?? canonicalTheme);
      return `    <marker id="${connectorMarkerId(markerId, connector.id)}" markerWidth="6" markerHeight="6" refX="5.5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill="${stroke}"/></marker>`;
    }),
    `    <filter id="${safeId(scene.id)}-card-shadow" x="-15%" y="-20%" width="130%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#101828" flood-opacity="0.08"/></filter>`,
    ...scene.canvases.filter(({ clip }) => clip).map((canvas) => `    <clipPath id="${safeId(canvas.id)}-clip"><rect x="${canvas.bounds.x}" y="${canvas.bounds.y}" width="${canvas.bounds.width}" height="${canvas.bounds.height}"/></clipPath>`),
    ...canvasReferences(scene, "clip").map(({ id, target }) => `    <clipPath id="${safeId(id)}-clip">${referenceShape(target, "#fff")}</clipPath>`),
    ...canvasReferences(scene, "mask").map(({ id, target }) => `    <mask id="${safeId(id)}-mask">${referenceShape(target, "#fff")}</mask>`),
    "  </defs>",
  ];
  if (scene.title) lines.push(`  <text x="20" y="27" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.label"]}" font-weight="700" fill="${tokens["color.text"]}">${escapeXml(scene.title)}</text>`);
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const connector of scene.connectors) {
    const { stroke, strokeWidth } = connectorStyle(connector, options.state, tokens, options.theme ?? canonicalTheme);
    lines.push(`    <g data-livery-connector="${escapeXml(connector.id)}"${stateAttributes(connector.id, options.state)}>`);
    lines.push(`      <path data-livery-id="${escapeXml(connector.id)}" d="${pathData(connector.points)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#${connectorMarkerId(markerId, connector.id)})"/>`);
    if (connector.label) {
      lines.push(`      <rect x="${connector.label.x}" y="${connector.label.y}" width="${connector.label.width}" height="${connector.label.height}" rx="4" fill="${tokens["color.canvas"]}" fill-opacity="0.96"/>`);
      lines.push(`      <text x="${connector.label.x + connector.label.width / 2}" y="${connector.label.y + connector.label.height / 2 + 4}" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-size="${tokens["type.caption"]}" font-weight="700" fill="${tokens["color.muted"]}">${escapeXml(connector.label.text)}</text>`);
    }
    lines.push("    </g>");
  }
  for (const canvas of scene.canvases) {
    lines.push(`    <g data-livery-canvas="${escapeXml(canvas.id)}"${canvas.clip ? ` clip-path="url(#${safeId(canvas.id)}-clip)"` : ""}${stateAttributes(canvas.owner, options.state)}>`);
    for (const primitive of [...canvas.primitives].sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id))) lines.push(...renderPrimitive(primitive, tokens, options.state));
    lines.push("    </g>");
  }
  for (const element of scene.elements) {
    if (childParents.has(element.id) || element.kind === "canvas") continue;
    lines.push(...renderElement(element, tokens, `${safeId(scene.id)}-card-shadow`, options.state, options.theme ?? canonicalTheme));
  }
  if (options.debug) lines.push(...renderDebug(scene));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function renderElement(element: SolvedElement, tokens: TokenOverrides, shadowId: string, state: VisualTimelineState | undefined, theme: LiveryTheme) {
  const { x, y, width, height } = element.visualBounds;
  const recipe = resolveComponentRecipe(element.kind, element.variant, theme);
  const surfaceStyle = { ...recipe.surface, ...(state?.focused.has(element.id) ? recipe.states?.focused : undefined) };
  const properties = state?.properties.get(element.id);
  const propertyTone = typeof properties?.tone === "string" ? properties.tone : undefined;
  const stroke = String(resolveVisualValue(properties?.stroke ?? surfaceStyle.stroke, tokens) ?? toneColor(propertyTone as typeof element.tone ?? element.tone, { ...tokens, "color.connector": tokens["color.border"]! }));
  const fill = String(resolveVisualValue(properties?.fill ?? surfaceStyle.fill, tokens) ?? tokens["color.surface"]);
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? surfaceStyle.strokeWidth, tokens) ?? tokens["stroke.hairline"];
  const radius = resolveVisualValue(surfaceStyle.radius, tokens) ?? tokens["radius.md"];
  const surface = element.kind === "text" || element.kind === "line" || element.kind === "path" || recipe.elevation === "none" ? "" : ` filter="url(#${shadowId})"`;
  const lines = [`    <g data-livery-id="${escapeXml(element.id)}"${stateAttributes(element.id, state)}${surface}>`];
  if (element.kind === "text") {
    // Text is emitted below without an implicit surface.
  } else if (recipe.shape === "circle" || element.kind === "circle") lines.push(`      <circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  else if (recipe.shape === "storage") {
    lines.push(`      <rect x="${x}" y="${y + 7}" width="${width}" height="${height - 14}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    lines.push(`      <ellipse cx="${x + width / 2}" cy="${y + 7}" rx="${width / 2}" ry="7" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    lines.push(`      <path d="M ${x} ${y + height - 7} A ${width / 2} 7 0 0 0 ${x + width} ${y + height - 7}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  } else if (recipe.shape === "boundary") {
    lines.push(`      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" fill-opacity="0.35" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-dasharray="5 4"/>`);
  } else {
    const callout = recipe.shape === "callout" ? ` d="M ${x} ${y} H ${x + width} V ${y + height - 8} H ${x + 28} L ${x + 20} ${y + height} L ${x + 20} ${y + height - 8} H ${x} Z"` : undefined;
    if (callout) lines.push(`      <path${callout} fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`);
    else lines.push(`      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    lines.push(...componentDetails(element, tokens, recipe));
  }
  if (element.label) {
    const labelBounds = element.labelBounds ?? { x: x + 16, y: y + height / 2 - 9, width: width - 32, height: 18 };
    const typography = recipe.typography;
    const fontSize = Number(resolveVisualValue(typography?.fontSize, tokens) ?? tokens["type.body"] ?? 13);
    const fontWeight = resolveVisualValue(typography?.fontWeight, tokens) ?? 650;
    const lineHeight = Math.max(Number(resolveVisualValue(typography?.lineHeight, tokens) ?? 18), Math.ceil(fontSize * 1.1));
    const color = resolveVisualValue(typography?.color, tokens) ?? tokens["color.text"];
    const textLines = wrapText(element.label, labelBounds.width, fontSize);
    const align = typography?.align ?? "start";
    const labelX = align === "center" ? labelBounds.x + labelBounds.width / 2 : align === "end" ? labelBounds.x + labelBounds.width : labelBounds.x;
    const textAnchor = align === "center" ? "middle" : align === "end" ? "end" : "start";
    lines.push(`      <text x="${labelX}" y="${labelBounds.y + fontSize}" text-anchor="${textAnchor}" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">`);
    textLines.forEach((line, index) => lines.push(`        <tspan x="${labelX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`));
    lines.push("      </text>");
  }
  lines.push("    </g>");
  return lines;
}

function componentDetails(element: SolvedElement, tokens: TokenOverrides, recipe: ComponentRecipe) {
  const { x, y, height, width } = element.visualBounds;
  const muted = tokens["color.muted"];
  const centerY = y + height / 2;
  const glyph = recipe.detail?.glyph;
  const strokeWidth = recipe.detail?.strokeWidth ?? 1.4;
  if (glyph === "person" || glyph === "team") return [`      <circle cx="${x + 22}" cy="${centerY - 8}" r="5" fill="none" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <path d="M ${x + 14} ${centerY + 8} Q ${x + 22} ${centerY - 1} ${x + 30} ${centerY + 8}" fill="none" stroke="${muted}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`];
  if (glyph === "agent") return [`      <path d="M ${x + 22} ${centerY - 12} L ${x + 32} ${centerY - 6} V ${centerY + 6} L ${x + 22} ${centerY + 12} L ${x + 12} ${centerY + 6} V ${centerY - 6} Z" fill="${tokens["color.surfaceMuted"]}" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <circle cx="${x + 22}" cy="${centerY}" r="3" fill="${muted}"/>`];
  if (glyph === "tool") return [`      <path d="M ${x + 15} ${centerY + 8} L ${x + 27} ${centerY - 4} M ${x + 24} ${centerY - 8} A 6 6 0 0 0 ${x + 32} ${centerY - 14} A 7 7 0 0 1 ${x + 24} ${centerY - 2} L ${x + 18} ${centerY + 4} A 4 4 0 1 1 ${x + 15} ${centerY + 8}" fill="none" stroke="${muted}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`];
  if (glyph === "model") return [`      <path d="M ${x + 15} ${centerY} L ${x + 22} ${centerY - 9} L ${x + 30} ${centerY} L ${x + 22} ${centerY + 9} Z" fill="none" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <circle cx="${x + 15}" cy="${centerY}" r="2.5" fill="${muted}"/>`, `      <circle cx="${x + 22}" cy="${centerY - 9}" r="2.5" fill="${muted}"/>`, `      <circle cx="${x + 30}" cy="${centerY}" r="2.5" fill="${muted}"/>`, `      <circle cx="${x + 22}" cy="${centerY + 9}" r="2.5" fill="${muted}"/>`];
  if (["service", "api", "worker", "server"].includes(glyph ?? "")) return [`      <rect x="${x + 14}" y="${centerY - 8}" width="16" height="16" rx="4" fill="${tokens["color.surfaceMuted"]}" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <circle cx="${x + 22}" cy="${centerY}" r="2.5" fill="${muted}"/>`];
  if (glyph === "browser" || glyph === "mobile" || glyph === "terminal") return [`      <rect x="${x + 14}" y="${centerY - 10}" width="18" height="20" rx="3" fill="none" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <line x1="${x + 14}" y1="${centerY - 4}" x2="${x + 32}" y2="${centerY - 4}" stroke="${muted}"/>`];
  if (["cache", "queue", "stream", "event"].includes(glyph ?? "")) return [`      <rect x="${x + 14}" y="${centerY - 9}" width="18" height="18" rx="3" fill="none" stroke="${muted}" stroke-width="${strokeWidth}"/>`, `      <line x1="${x + 18}" y1="${centerY - 3}" x2="${x + 28}" y2="${centerY - 3}" stroke="${muted}"/>`, `      <line x1="${x + 18}" y1="${centerY + 3}" x2="${x + 28}" y2="${centerY + 3}" stroke="${muted}"/>`];
  if (["note", "callout", "document", "code", "table"].includes(glyph ?? "")) return [`      <path d="M ${x + 15} ${centerY - 10} H ${x + 29} L ${x + 33} ${centerY - 6} V ${centerY + 10} H ${x + 15} Z M ${x + 29} ${centerY - 10} V ${centerY - 6} H ${x + 33}" fill="none" stroke="${muted}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`];
  if (glyph === "progress") return [`      <rect x="${x + 14}" y="${centerY - 4}" width="18" height="8" rx="4" fill="${tokens["color.surfaceMuted"]}"/>`, `      <rect x="${x + 14}" y="${centerY - 4}" width="11" height="8" rx="4" fill="${muted}"/>`];
  if (["barChart", "lineChart", "areaChart"].includes(glyph ?? "")) return [`      <path d="M ${x + 14} ${centerY + 8} V ${centerY - 6} M ${x + 21} ${centerY + 8} V ${centerY - 12} M ${x + 28} ${centerY + 8} V ${centerY - 1}" stroke="${muted}" stroke-width="3" stroke-linecap="round"/>`];
  return [];
}

function renderPrimitive(primitive: CanvasPrimitive, tokens: TokenOverrides, state?: VisualTimelineState) {
  const properties = state?.properties.get(primitive.id);
  const bounds = primitiveBounds(primitive, properties);
  const { x, y, width, height } = bounds;
  const fill = resolveVisualValue(properties?.fill ?? primitive.props?.fill ?? "$color.surface", tokens);
  const stroke = resolveVisualValue(properties?.stroke ?? primitive.props?.stroke ?? "$color.connector", tokens);
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? primitive.props?.strokeWidth, tokens);
  const paint = strokeWidth === undefined ? "" : ` stroke-width="${strokeWidth}"`;
  const attributes = `${primitiveAttributes(primitive, properties, bounds)}${stateAttributes(primitive.id, state)}`;
  if (primitive.kind === "circle") return [`      <circle data-livery-id="${escapeXml(primitive.id)}" cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}" stroke="${stroke}"${paint}${attributes}/>`];
  if (primitive.kind === "line") return [`      <line data-livery-id="${escapeXml(primitive.id)}" x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}" stroke="${stroke}"${paint}${attributes}/>`];
  if (primitive.kind === "path" && typeof primitive.props?.d === "string") {
    const transform = transformValue(primitive, properties, bounds);
    return [`      <path data-livery-id="${escapeXml(primitive.id)}" d="${escapeXml(primitive.props.d)}" transform="translate(${x} ${y})${transform ? ` ${transform}` : ""}" fill="${fill}" stroke="${stroke}"${paint}${referenceAttributes(primitive)}${stateAttributes(primitive.id, state)}/>`];
  }
  if (primitive.kind === "text") {
    const fontSize = resolveVisualValue(properties?.fontSize ?? primitive.props?.fontSize ?? "$type.body", tokens);
    return [`      <text data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y + height}" font-family="Inter,system-ui,sans-serif" font-size="${fontSize}" fill="${fill}"${attributes}>${escapeXml(String(primitive.props?.text ?? ""))}</text>`];
  }
  return [`      <rect data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${properties?.radius ?? primitive.props?.radius ?? 0}" fill="${fill}" stroke="${stroke}"${paint}${attributes}/>`];
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
function connectorMarkerId(markerId: string, connectorId: string) { return `${markerId}-${safeId(connectorId)}`; }
function connectorStyle(connector: BoardScene["connectors"][number], state: VisualTimelineState | undefined, tokens: TokenOverrides, theme: LiveryTheme) {
  const properties = state?.properties.get(connector.id);
  const propertyTone = typeof properties?.tone === "string" ? properties.tone : undefined;
  const recipe = resolveComponentRecipe("connector", undefined, theme);
  const tone = propertyTone ?? connector.tone;
  const toneStyle = tone && tone in (recipe.states ?? {}) ? recipe.states?.[tone as "success" | "warning" | "danger"] : undefined;
  const tracedStyle = state?.traced.has(connector.id) ? recipe.states?.traced : undefined;
  const style = { ...recipe.surface, ...tracedStyle, ...toneStyle };
  const styledStroke = resolveVisualValue(properties?.stroke ?? style.stroke, tokens);
  const stroke = String(properties?.stroke !== undefined || toneStyle?.stroke !== undefined || !tone
    ? styledStroke ?? toneColor(tone as typeof connector.tone, tokens)
    : toneColor(tone as typeof connector.tone, tokens));
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? style.strokeWidth, tokens) ?? tokens["stroke.normal"];
  return { stroke, strokeWidth };
}
function safeId(value: string) { return value.replaceAll(/[^A-Za-z0-9_-]/g, "-") || "livery"; }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function stateAttributes(id: string, state?: VisualTimelineState) {
  if (!state) return "";
  const propertyOpacity = state.properties.get(id)?.opacity;
  const emphasized = state.focused.has(id) || state.traced.has(id);
  const opacity = !state.visible.has(id) ? 0 : typeof propertyOpacity === "number" ? propertyOpacity : state.focused.size && !emphasized ? 0.62 : 1;
  return ` opacity="${opacity}"${state.focused.has(id) ? ' data-livery-focused="true"' : ""}${state.traced.has(id) ? ' data-livery-traced="true"' : ""}`;
}
function primitiveAttributes(primitive: CanvasPrimitive, properties?: Readonly<Record<string, unknown>>, bounds = primitive.bounds) { const transform = transformValue(primitive, properties, bounds); return `${transform ? ` transform="${transform}"` : ""}${referenceAttributes(primitive)}`; }
function referenceAttributes(primitive: CanvasPrimitive) { return `${primitive.clip ? ` clip-path="url(#${safeId(primitive.id)}-clip)"` : ""}${primitive.mask ? ` mask="url(#${safeId(primitive.id)}-mask)"` : ""}`; }
function transformValue(primitive: CanvasPrimitive, properties?: Readonly<Record<string, unknown>>, bounds = primitive.bounds) {
  const base = primitive.transform ?? { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1, rotate: 0 };
  const scale = finiteNumber(properties?.scale);
  const transform = {
    translateX: finiteNumber(properties?.translateX) ?? base.translateX,
    translateY: finiteNumber(properties?.translateY) ?? base.translateY,
    scaleX: finiteNumber(properties?.scaleX) ?? scale ?? base.scaleX,
    scaleY: finiteNumber(properties?.scaleY) ?? scale ?? base.scaleY,
    rotate: finiteNumber(properties?.rotate) ?? base.rotate,
  };
  if (transform.translateX === 0 && transform.translateY === 0 && transform.scaleX === 1 && transform.scaleY === 1 && transform.rotate === 0) return "";
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return `translate(${transform.translateX} ${transform.translateY}) rotate(${transform.rotate} ${centerX} ${centerY}) translate(${centerX} ${centerY}) scale(${transform.scaleX} ${transform.scaleY}) translate(${-centerX} ${-centerY})`;
}
function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function primitiveBounds(primitive: CanvasPrimitive, properties?: Readonly<Record<string, unknown>>): BoardRect { return { x: finiteNumber(properties?.x) ?? primitive.bounds.x, y: finiteNumber(properties?.y) ?? primitive.bounds.y, width: finiteNumber(properties?.width) ?? primitive.bounds.width, height: finiteNumber(properties?.height) ?? primitive.bounds.height }; }
function canvasReferences(scene: BoardScene, property: "clip" | "mask") { const primitives = scene.canvases.flatMap(({ primitives }) => primitives); return primitives.flatMap((primitive) => { const targetId = primitive[property]; const target = targetId ? primitives.find(({ id }) => id === targetId) : undefined; return target ? [{ id: primitive.id, target }] : []; }); }
function referenceShape(primitive: CanvasPrimitive, fill: string) { const { x, y, width, height } = primitive.bounds; return primitive.kind === "circle" ? `<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}"/>` : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`; }
function wrapText(value: string, width: number, fontSize = 13) { const limit = Math.max(1, Math.floor(width / (fontSize * 0.56))); const lines: string[] = []; let line = ""; for (const sourceWord of value.split(/\s+/)) { let word = sourceWord; while (word.length > limit) { if (line) { lines.push(line); line = ""; } lines.push(word.slice(0, limit)); word = word.slice(limit); } if (!word) continue; const next = line ? `${line} ${word}` : word; if (line && next.length > limit) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines.length ? lines : [""]; }
export function boardRectToViewBox(rect: BoardRect) { return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`; }
