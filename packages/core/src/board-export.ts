import type { BoardRect, BoardScene, CanvasPrimitive, SolvedElement } from "./board.js";
import { canonicalGlyph, type IconRegistry } from "./glyphs.js";
import { canonicalTheme, componentToneStyle, resolveComponentRecipe, resolveTheme, resolveVisualValue, toneColor, type ComponentRecipe, type LiveryTheme, type TokenOverrides } from "./theme.js";
import { wrapVisualText } from "./text-metrics.js";
import type { VisualTimelineState } from "./timeline.js";
import type { VisualStyle } from "./visual.js";
import { isImageSourceAllowed, type ResourcePolicy } from "./resources.js";

export type BoardSvgOptions = {
  debug?: boolean;
  state?: VisualTimelineState;
  theme?: LiveryTheme;
  tokenOverrides?: TokenOverrides;
  resourcePolicy?: ResourcePolicy;
  icons?: IconRegistry;
};

export function boardSceneToSvg(scene: BoardScene, options: BoardSvgOptions = {}) {
  const tokens = resolveTheme(options.theme ?? canonicalTheme, options.tokenOverrides);
  const titleHeight = scene.title ? 42 : 0;
  const markerId = `${safeId(scene.id)}-arrow`;
  const gridId = `${safeId(scene.id)}-grid`;
  const childParents = new Set(scene.elements.flatMap(({ parent }) => parent ? [parent] : []));
  const canvasOwners = new Set(scene.canvases.map(({ owner }) => owner));
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.board.width}" height="${scene.board.height + titleHeight}" viewBox="0 0 ${scene.board.width} ${scene.board.height + titleHeight}" role="img" aria-labelledby="${safeId(scene.id)}-title ${safeId(scene.id)}-desc">`,
    `  <title id="${safeId(scene.id)}-title">${escapeXml(scene.title ?? scene.id)}</title>`,
    `  <desc id="${safeId(scene.id)}-desc">${escapeXml(`${scene.title ?? scene.id}: ${scene.elements.length} elements and ${scene.connectors.length} connections.`)}</desc>`,
    `  <rect width="${scene.board.width}" height="${scene.board.height + titleHeight}" fill="${tokens["color.canvas"]}"/>`,
    "  <defs>",
    ...scene.connectors.map((connector) => {
      const { stroke } = connectorStyle(connector, options.state, tokens, options.theme ?? canonicalTheme);
      return `    <marker id="${connectorMarkerId(markerId, connector.id)}" markerWidth="5" markerHeight="5" refX="4.6" refY="2.5" orient="auto"><path d="M 0 0 L 5 2.5 L 0 5 z" fill="${stroke}"/></marker>`;
    }),
    `    <filter id="${safeId(scene.id)}-card-shadow" x="-15%" y="-20%" width="130%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#101828" flood-opacity="0.08"/></filter>`,
    ...(tokens["color.grid"] ? [`    <pattern id="${gridId}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" fill="none" stroke="${tokens["color.grid"]}" stroke-width="1"/></pattern>`] : []),
    ...scene.canvases.filter(({ clip }) => clip).map((canvas) => `    <clipPath id="${safeId(canvas.id)}-clip"><rect x="${canvas.bounds.x}" y="${canvas.bounds.y}" width="${canvas.bounds.width}" height="${canvas.bounds.height}"/></clipPath>`),
    ...canvasReferences(scene, "clip").map(({ id, target }) => `    <clipPath id="${safeId(id)}-clip">${referenceShape(target, "#fff")}</clipPath>`),
    ...canvasReferences(scene, "mask").map(({ id, target }) => `    <mask id="${safeId(id)}-mask">${referenceShape(target, "#fff")}</mask>`),
    "  </defs>",
  ];
  if (tokens["color.grid"]) lines.push(`  <rect width="${scene.board.width}" height="${scene.board.height + titleHeight}" fill="url(#${gridId})"/>`);
  if (scene.title) lines.push(`  <text x="20" y="27" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${tokens["type.label"]}" font-weight="${tokens["type.titleWeight"]}" fill="${tokens["color.text"]}">${escapeXml(scene.title)}</text>`);
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const element of scene.elements) {
    if (element.kind !== "frame" || canvasOwners.has(element.id)) continue;
    lines.push(...renderElement(element, tokens, `${safeId(scene.id)}-card-shadow`, options.state, options.theme ?? canonicalTheme, options.resourcePolicy, options.icons));
  }
  for (const connector of scene.connectors) {
    const { stroke, strokeWidth, opacity } = connectorStyle(connector, options.state, tokens, options.theme ?? canonicalTheme);
    const variant = connector.variant ?? "directional";
    const markerStart = variant === "bidirectional" ? ` marker-start="url(#${connectorMarkerId(markerId, connector.id)})"` : "";
    const markerEnd = variant === "data" ? "" : ` marker-end="url(#${connectorMarkerId(markerId, connector.id)})"`;
    const dash = variant === "async" ? ' stroke-dasharray="5 4"' : variant === "data" ? ' stroke-dasharray="2 3"' : "";
    lines.push(`    <g data-livery-connector="${escapeXml(connector.id)}"${stateAttributes(connector.id, options.state, opacity)} data-livery-variant="${variant}">`);
    lines.push(`      <path data-livery-id="${escapeXml(connector.id)}" d="${pathData(connector.points)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}${markerStart}${markerEnd}/>`);
    if (connector.label) {
      lines.push(`      <rect x="${connector.label.x}" y="${connector.label.y}" width="${connector.label.width}" height="${connector.label.height}" rx="2" fill="${tokens["color.canvas"]}" fill-opacity="0.98"/>`);
      lines.push(`      <text x="${connector.label.x + connector.label.width / 2}" y="${connector.label.y + connector.label.height / 2}" dominant-baseline="middle" text-anchor="middle" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${tokens["type.caption"]}" font-weight="600" fill="${tokens["color.muted"]}">${escapeXml(connector.label.text)}</text>`);
    }
    lines.push("    </g>");
  }
  for (const canvas of scene.canvases) {
    const canvasProperties = options.state?.properties.get(canvas.owner);
    const canvasTransform = elementTransformValue(canvasProperties, canvas.bounds);
    const canvasElement = scene.elements.find(({ id }) => id === canvas.owner);
    const canvasOpacity = finiteNumber(resolveVisualValue(canvasElement?.style?.opacity, tokens));
    lines.push(`    <g data-livery-canvas="${escapeXml(canvas.id)}"${canvasTransform ? ` transform="${canvasTransform}"` : ""}${stateAttributes(canvas.owner, options.state, canvasOpacity)}${canvas.clip ? ` clip-path="url(#${safeId(canvas.id)}-clip)"` : ""}>`);
    lines.push(...renderCanvasPrimitives(canvas.primitives, tokens, options.state, options.resourcePolicy, options.icons));
    lines.push("    </g>");
  }
  for (const element of scene.elements) {
    if (element.kind === "frame" || childParents.has(element.id) || canvasOwners.has(element.id) || element.kind === "canvas") continue;
    lines.push(...renderElement(element, tokens, `${safeId(scene.id)}-card-shadow`, options.state, options.theme ?? canonicalTheme, options.resourcePolicy, options.icons));
  }
  if (options.debug) lines.push(...renderDebug(scene));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function renderElement(element: SolvedElement, tokens: TokenOverrides, shadowId: string, state: VisualTimelineState | undefined, theme: LiveryTheme, resourcePolicy?: ResourcePolicy, icons?: IconRegistry) {
  const { x, y, width, height } = element.visualBounds;
  const recipe = resolveComponentRecipe(element.kind, element.variant, theme);
  const properties = state?.properties.get(element.id);
  const propertyTone = typeof properties?.tone === "string" ? properties.tone : undefined;
  const surfaceStyle = {
    ...recipe.surface,
    ...componentToneStyle(element.tone, element.variant),
    ...element.style,
    ...(propertyTone ? componentToneStyle(propertyTone as typeof element.tone, element.variant) : undefined),
    ...(state?.focused.has(element.id) ? recipe.states?.focused : undefined),
  };
  const stroke = String(resolveVisualValue(properties?.stroke ?? surfaceStyle.stroke, tokens) ?? toneColor(propertyTone as typeof element.tone ?? element.tone, { ...tokens, "color.connector": tokens["color.border"]! }));
  const fill = String(resolveVisualValue(properties?.fill ?? surfaceStyle.fill, tokens) ?? tokens["color.surface"]);
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? surfaceStyle.strokeWidth, tokens) ?? tokens["stroke.hairline"];
  const radius = resolveVisualValue(properties?.radius ?? surfaceStyle.radius, tokens) ?? tokens["radius.md"];
  const surface = element.kind === "text" || element.kind === "line" || element.kind === "path" || recipe.elevation === "none" ? "" : ` filter="url(#${shadowId})"`;
  const transform = elementTransformValue(properties, element.visualBounds);
  const baseOpacity = finiteNumber(resolveVisualValue(surfaceStyle.opacity, tokens));
  const lines = [`    <g data-livery-id="${escapeXml(element.id)}"${transform ? ` transform="${transform}"` : ""}${stateAttributes(element.id, state, baseOpacity)}${surface}>`];
  if (element.subtitle) lines.push(`      <title>${escapeXml(`${element.label ?? element.id}: ${element.subtitle}`)}</title>`);
  if (element.kind === "text") {
    // Text is emitted below without an implicit surface.
  } else if (element.kind === "image" && typeof element.props?.src === "string") {
    if (isImageSourceAllowed(element.props.src, resourcePolicy)) lines.push(`      <image href="${escapeXml(element.props.src)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"${typeof element.props.alt === "string" ? ` role="img" aria-label="${escapeXml(element.props.alt)}"` : ""}/>`);
  } else if (element.kind === "line") {
    lines.push(`      <line x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  } else if (element.kind === "path" && typeof element.props?.d === "string") {
    lines.push(`      <path d="${escapeXml(element.props.d)}" transform="translate(${x} ${y})" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
  } else if (element.kind === "icon" && typeof element.props?.name === "string") {
    lines.push(...renderIconGlyph(element.id, element.props.name, element.visualBounds, stroke, strokeWidth, "", icons).map((line) => `      ${line.trimStart()}`));
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
    lines.push(...componentDetails(element, tokens, recipe, { ...surfaceStyle, ...(properties?.iconColor !== undefined ? { iconColor: properties.iconColor as string | number } : {}) }, icons));
  }
  if (element.label) {
    const labelBounds = element.labelBounds ?? { x: x + 16, y: y + height / 2 - 9, width: width - 32, height: 18 };
    const typography = recipe.typography;
    const fontSize = Number(resolveVisualValue(properties?.fontSize ?? element.style?.fontSize ?? typography?.fontSize, tokens) ?? tokens["type.body"] ?? 13);
    const fontWeight = resolveVisualValue(properties?.fontWeight ?? element.style?.fontWeight ?? typography?.fontWeight, tokens) ?? tokens["type.bodyWeight"] ?? 650;
    const lineHeight = Math.max(Number(resolveVisualValue(typography?.lineHeight, tokens) ?? 18), Math.ceil(fontSize * 1.1));
    const color = resolveVisualValue(properties?.color ?? (element.kind === "text" ? properties?.fill : undefined) ?? surfaceStyle.color ?? (element.kind === "text" ? element.style?.fill : undefined) ?? typography?.color, tokens) ?? tokens["color.text"];
    const textLines = wrapVisualText(element.label, labelBounds.width, { fontSize, fontWeight: Number(fontWeight) });
    const align = typography?.align ?? "start";
    const labelX = align === "center" ? labelBounds.x + labelBounds.width / 2 : align === "end" ? labelBounds.x + labelBounds.width : labelBounds.x;
    const textAnchor = align === "center" ? "middle" : align === "end" ? "end" : "start";
    lines.push(`      <text x="${labelX}" y="${labelBounds.y + fontSize}" text-anchor="${textAnchor}" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">`);
    textLines.forEach((line, index) => lines.push(`        <tspan x="${labelX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`));
    lines.push("      </text>");
    if (element.subtitle) {
      const subtitleFontSize = Number(tokens["type.caption"] ?? 10);
      const subtitleLineHeight = Math.max(Math.ceil(subtitleFontSize * 1.35), 14);
      const subtitleLines = wrapVisualText(element.subtitle, labelBounds.width, { fontSize: subtitleFontSize, fontWeight: 500 });
      const subtitleY = labelBounds.y + textLines.length * lineHeight + 4;
      const subtitleColor = resolveVisualValue(surfaceStyle.color, tokens) ?? tokens["color.muted"];
      lines.push(`      <text x="${labelX}" y="${subtitleY + subtitleFontSize}" text-anchor="${textAnchor}" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${subtitleFontSize}" font-weight="500" fill="${subtitleColor}">`);
      subtitleLines.forEach((line, index) => lines.push(`        <tspan x="${labelX}" dy="${index === 0 ? 0 : subtitleLineHeight}">${escapeXml(line)}</tspan>`));
      lines.push("      </text>");
    }
  }
  lines.push("    </g>");
  return lines;
}

function componentDetails(element: SolvedElement, tokens: TokenOverrides, recipe: ComponentRecipe, style: VisualStyle, icons?: IconRegistry) {
  const glyph = typeof element.props?.icon === "string" ? element.props.icon : recipe.detail?.glyph;
  const paths = canonicalGlyph(glyph, icons);
  if (!paths?.length) return [];
  const { x, y, height } = element.visualBounds;
  const size = recipe.detail?.size ?? 18;
  const detailWidth = recipe.geometry?.detailWidth ?? 24;
  const iconX = x + 14 + (detailWidth - size) / 2;
  const iconY = y + (height - size) / 2;
  const scale = size / 24;
  const stroke = resolveVisualValue(style.iconColor as string | number | undefined, tokens) ?? tokens["color.muted"];
  const strokeWidth = recipe.detail?.strokeWidth ?? 1.5;
  return [
    `      <g data-livery-glyph="${escapeXml(glyph ?? "")}" transform="translate(${iconX} ${iconY}) scale(${scale})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth / scale}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">`,
    ...paths.map((path) => `        <path d="${path}"/>`),
    "      </g>",
  ];
}

function renderPrimitive(primitive: CanvasPrimitive, tokens: TokenOverrides, state?: VisualTimelineState, resourcePolicy?: ResourcePolicy, icons?: IconRegistry) {
  const properties = state?.properties.get(primitive.id);
  const bounds = primitiveBounds(primitive, properties);
  const { x, y, width, height } = bounds;
  const fill = resolveVisualValue(properties?.color ?? properties?.fill ?? primitive.style?.color ?? primitive.style?.fill ?? primitive.props?.color ?? primitive.props?.fill ?? "$color.surface", tokens);
  const stroke = resolveVisualValue(properties?.stroke ?? primitive.style?.stroke ?? primitive.props?.stroke ?? "$color.connector", tokens);
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? primitive.style?.strokeWidth ?? primitive.props?.strokeWidth, tokens);
  const paint = strokeWidth === undefined ? "" : ` stroke-width="${strokeWidth}"`;
  const baseOpacity = finiteNumber(resolveVisualValue(primitive.style?.opacity ?? primitive.props?.opacity, tokens));
  const attributes = `${primitiveAttributes(primitive, properties, bounds)}${stateAttributes(primitive.id, state, baseOpacity)}`;
  if (primitive.kind === "circle") return appendPrimitiveLabel([`      <circle data-livery-id="${escapeXml(primitive.id)}" cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}" stroke="${stroke}"${paint}${attributes}/>`], primitive, bounds, tokens, attributes, properties);
  if (primitive.kind === "line") return [`      <line data-livery-id="${escapeXml(primitive.id)}" x1="${x}" y1="${y + height / 2}" x2="${x + width}" y2="${y + height / 2}" stroke="${stroke}"${paint}${attributes}/>`];
  if (primitive.kind === "path" && typeof primitive.props?.d === "string") {
    const transform = transformValue(primitive, properties, bounds);
    return [`      <path data-livery-id="${escapeXml(primitive.id)}" d="${escapeXml(primitive.props.d)}" transform="translate(${x} ${y})${transform ? ` ${transform}` : ""}" fill="${fill}" stroke="${stroke}"${paint}${referenceAttributes(primitive)}${stateAttributes(primitive.id, state)}/>`];
  }
  if (primitive.kind === "text") {
    const fontSize = resolveVisualValue(properties?.fontSize ?? primitive.style?.fontSize ?? primitive.props?.fontSize ?? "$type.body", tokens);
    const fontWeight = resolveVisualValue(properties?.fontWeight ?? primitive.style?.fontWeight ?? primitive.props?.fontWeight, tokens);
    return [`      <text data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y + height}" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${fontSize}"${fontWeight !== undefined ? ` font-weight="${fontWeight}"` : ""} fill="${fill}"${attributes}>${escapeXml(primitive.label ?? String(primitive.props?.text ?? ""))}</text>`];
  }
  if (primitive.kind === "image" && typeof primitive.props?.src === "string") return isImageSourceAllowed(primitive.props.src, resourcePolicy)
    ? [`      <image data-livery-id="${escapeXml(primitive.id)}" href="${escapeXml(primitive.props.src)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"${typeof primitive.props.alt === "string" ? ` role="img" aria-label="${escapeXml(primitive.props.alt)}"` : ""}${attributes}/>`]
    : [];
  if (primitive.kind === "icon") return renderIconPrimitive(primitive, bounds, stroke, strokeWidth, attributes, icons);
  if (primitive.kind === "group") return [];
  return appendPrimitiveLabel([`      <rect data-livery-id="${escapeXml(primitive.id)}" x="${x}" y="${y}" width="${width}" height="${height}" rx="${properties?.radius ?? primitive.style?.radius ?? primitive.props?.radius ?? 0}" fill="${fill}" stroke="${stroke}"${paint}${attributes}/>`], primitive, bounds, tokens, attributes, properties);
}

function appendPrimitiveLabel(
  lines: string[],
  primitive: CanvasPrimitive,
  bounds: BoardRect,
  tokens: TokenOverrides,
  attributes: string,
  properties?: Readonly<Record<string, unknown>>,
) {
  if (!primitive.label) return lines;
  const fontSize = resolveVisualValue((properties?.fontSize as number | string | undefined) ?? primitive.style?.fontSize ?? "$type.body", tokens);
  const fontWeight = resolveVisualValue((properties?.fontWeight as number | string | undefined) ?? primitive.style?.fontWeight ?? 600, tokens);
  const color = resolveVisualValue((properties?.color as number | string | undefined) ?? primitive.style?.color ?? "$color.text", tokens);
  return [...lines, `      <text data-livery-label-for="${escapeXml(primitive.id)}" x="${bounds.x + bounds.width / 2}" y="${bounds.y + bounds.height / 2}" dominant-baseline="middle" text-anchor="middle" font-family="${escapeXml(String(tokens["type.fontFamily"]))}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}"${attributes}>${escapeXml(primitive.label)}</text>`];
}

function renderCanvasPrimitives(primitives: CanvasPrimitive[], tokens: TokenOverrides, state?: VisualTimelineState, resourcePolicy?: ResourcePolicy, icons?: IconRegistry) {
  const byParent = new Map<string | undefined, CanvasPrimitive[]>();
  for (const primitive of primitives) {
    const siblings = byParent.get(primitive.parent) ?? [];
    siblings.push(primitive);
    byParent.set(primitive.parent, siblings);
  }
  const renderLevel = (parent: string | undefined, indent: string): string[] => [...(byParent.get(parent) ?? [])]
    .sort((a, b) => a.layer - b.layer || a.id.localeCompare(b.id))
    .flatMap((primitive) => {
      if (primitive.kind !== "group") return renderPrimitive(primitive, tokens, state, resourcePolicy, icons).map((line) => `${indent}${line.trimStart()}`);
      const properties = state?.properties.get(primitive.id);
      const transform = transformValue(primitive, properties, primitive.bounds);
      const baseOpacity = finiteNumber(resolveVisualValue(primitive.style?.opacity ?? primitive.props?.opacity, tokens));
      return [
        `${indent}<g data-livery-group="${escapeXml(primitive.id)}"${transform ? ` transform="${transform}"` : ""}${referenceAttributes(primitive)}${stateAttributes(primitive.id, state, baseOpacity)}>`,
        ...renderLevel(primitive.id, `${indent}  `),
        `${indent}</g>`,
      ];
    });
  return renderLevel(undefined, "      ");
}

function renderIconPrimitive(primitive: CanvasPrimitive, bounds: BoardRect, stroke: unknown, strokeWidth: unknown, attributes: string, icons?: IconRegistry) {
  const name = typeof primitive.props?.name === "string" ? primitive.props.name : "unknown";
  return renderIconGlyph(primitive.id, name, bounds, stroke, strokeWidth, attributes, icons);
}

function renderIconGlyph(id: string, name: string, bounds: BoardRect, stroke: unknown, strokeWidth: unknown, attributes: string, icons?: IconRegistry) {
  const { x, y, width, height } = bounds;
  const scaleX = width / 24;
  const scaleY = height / 24;
  const paths = canonicalGlyph(name, icons) ?? canonicalGlyph("star")!;
  return [
    `      <g data-livery-id="${escapeXml(id)}" data-livery-icon="${escapeXml(name)}"${attributes}><g transform="translate(${x} ${y}) scale(${scaleX} ${scaleY})" fill="none" stroke="${stroke}" stroke-width="${strokeWidth ?? 1.5}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">`,
    ...paths.map((path) => `        <path d="${escapeXml(path)}"/>`),
    "      </g></g>",
  ];
}

function renderDebug(scene: BoardScene) {
  const lines = [`    <g data-livery-debug="true" pointer-events="none" font-family="ui-monospace,monospace" font-size="8">`];
  for (const channel of scene.board.channels) lines.push(`      <rect x="${channel.x}" y="${channel.y}" width="${channel.width}" height="${channel.height}" fill="#22c55e" fill-opacity="0.08" stroke="#16a34a" stroke-opacity="0.35"/>`);
  for (const envelope of scene.envelopes) lines.push(`      <rect x="${envelope.x}" y="${envelope.y}" width="${envelope.width}" height="${envelope.height}" fill="none" stroke="#ef4444" stroke-dasharray="3 2"/>`);
  for (const element of scene.elements) for (const pin of element.pins) lines.push(`      <circle cx="${pin.point.x}" cy="${pin.point.y}" r="3" fill="#c0264f"><title>${escapeXml(pin.id)}</title></circle>`);
  for (const primitive of scene.canvases.flatMap(({ primitives }) => primitives)) for (const pin of primitive.pins) lines.push(`      <circle cx="${pin.point.x}" cy="${pin.point.y}" r="2" fill="#7c3aed"><title>${escapeXml(pin.id)}</title></circle>`);
  lines.push("    </g>");
  return lines;
}

function pathData(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const commands = [`M ${points[0]!.x} ${points[0]!.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const incoming = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
    const outgoing = Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y);
    const radius = Math.min(8, incoming / 2, outgoing / 2);
    const before = moveToward(corner, previous, radius);
    const after = moveToward(corner, next, radius);
    commands.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }
  const last = points.at(-1)!;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

function moveToward(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  if (!length) return from;
  return { x: from.x + (to.x - from.x) * distance / length, y: from.y + (to.y - from.y) * distance / length };
}
function connectorMarkerId(markerId: string, connectorId: string) { return `${markerId}-${safeId(connectorId)}`; }
function connectorStyle(connector: BoardScene["connectors"][number], state: VisualTimelineState | undefined, tokens: TokenOverrides, theme: LiveryTheme) {
  const properties = state?.properties.get(connector.id);
  const propertyTone = typeof properties?.tone === "string" ? properties.tone : undefined;
  const recipe = resolveComponentRecipe("connector", undefined, theme);
  const tone = propertyTone ?? connector.tone;
  const toneStyle = tone && tone in (recipe.states ?? {}) ? recipe.states?.[tone as "success" | "warning" | "danger"] : undefined;
  const tracedStyle = state?.traced.has(connector.id) ? recipe.states?.traced : undefined;
  const style = { ...recipe.surface, ...connector.style, ...tracedStyle, ...toneStyle };
  const styledStroke = resolveVisualValue(properties?.stroke ?? style.stroke, tokens);
  const stroke = String(properties?.stroke !== undefined || toneStyle?.stroke !== undefined || !tone
    ? styledStroke ?? toneColor(tone as typeof connector.tone, tokens)
    : toneColor(tone as typeof connector.tone, tokens));
  const strokeWidth = resolveVisualValue(properties?.strokeWidth ?? style.strokeWidth, tokens) ?? tokens["stroke.normal"];
  const opacity = finiteNumber(resolveVisualValue(properties?.opacity ?? style.opacity, tokens));
  return { stroke, strokeWidth, opacity };
}
function safeId(value: string) { return value.replaceAll(/[^A-Za-z0-9_-]/g, "-") || "livery"; }
function escapeXml(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
function stateAttributes(id: string, state?: VisualTimelineState, baseOpacity = 1) {
  if (!state) return baseOpacity === 1 ? "" : ` opacity="${baseOpacity}"`;
  const propertyOpacity = state.properties.get(id)?.opacity;
  const emphasized = state.focused.has(id) || state.traced.has(id);
  const focusOpacity = state.focused.size && !emphasized ? 0.62 : 1;
  const opacity = !state.visible.has(id) ? 0 : (typeof propertyOpacity === "number" ? propertyOpacity : baseOpacity) * focusOpacity;
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
function elementTransformValue(properties: Readonly<Record<string, unknown>> | undefined, bounds: BoardRect) {
  const transform = {
    translateX: finiteNumber(properties?.translateX) ?? 0,
    translateY: finiteNumber(properties?.translateY) ?? 0,
    scaleX: finiteNumber(properties?.scaleX) ?? finiteNumber(properties?.scale) ?? 1,
    scaleY: finiteNumber(properties?.scaleY) ?? finiteNumber(properties?.scale) ?? 1,
    rotate: finiteNumber(properties?.rotate) ?? 0,
  };
  if (transform.translateX === 0 && transform.translateY === 0 && transform.scaleX === 1 && transform.scaleY === 1 && transform.rotate === 0) return "";
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return `translate(${transform.translateX} ${transform.translateY}) rotate(${transform.rotate} ${centerX} ${centerY}) translate(${centerX} ${centerY}) scale(${transform.scaleX} ${transform.scaleY}) translate(${-centerX} ${-centerY})`;
}
function finiteNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function primitiveBounds(primitive: CanvasPrimitive, properties?: Readonly<Record<string, unknown>>): BoardRect {
  const x = finiteNumber(properties?.x);
  const y = finiteNumber(properties?.y);
  const authoredX = finiteNumber(primitive.props?.x) ?? 0;
  const authoredY = finiteNumber(primitive.props?.y) ?? 0;
  return {
    x: x === undefined ? primitive.bounds.x : primitive.bounds.x + x - authoredX,
    y: y === undefined ? primitive.bounds.y : primitive.bounds.y + y - authoredY,
    width: finiteNumber(properties?.width) ?? primitive.bounds.width,
    height: finiteNumber(properties?.height) ?? primitive.bounds.height,
  };
}
function canvasReferences(scene: BoardScene, property: "clip" | "mask") { const primitives = scene.canvases.flatMap(({ primitives }) => primitives); return primitives.flatMap((primitive) => { const targetId = primitive[property]; const target = targetId ? primitives.find(({ id }) => id === targetId) : undefined; return target ? [{ id: primitive.id, target }] : []; }); }
function referenceShape(primitive: CanvasPrimitive, fill: string) { const { x, y, width, height } = primitive.bounds; return primitive.kind === "circle" ? `<circle cx="${x + width / 2}" cy="${y + height / 2}" r="${Math.min(width, height) / 2}" fill="${fill}"/>` : `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`; }
export function boardRectToViewBox(rect: BoardRect) { return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`; }
