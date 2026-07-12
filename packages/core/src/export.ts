import type { LiverySource, SemanticTone } from "./artifact.js";
import { renderHeadless, type HeadlessRenderOptions, type HeadlessRenderResult } from "./headless.js";
import type { Scene, SceneNode } from "./scene.js";

export type HeadlessExportFormat = "json" | "svg";

export type HeadlessExportOptions = HeadlessRenderOptions & {
  format: HeadlessExportFormat;
  pretty?: boolean;
};

export type HeadlessExportResult = HeadlessRenderResult & {
  format: HeadlessExportFormat;
  mediaType: "application/json" | "image/svg+xml";
  output?: string;
};

export async function exportHeadless(
  source: LiverySource,
  options: HeadlessExportOptions,
): Promise<HeadlessExportResult> {
  const { format, pretty = false, ...renderOptions } = options;
  const result = await renderHeadless(source, renderOptions);
  if (format === "json") {
    return {
      ...result,
      format,
      mediaType: "application/json",
      output: headlessResultToJson(result, pretty),
    };
  }
  return {
    ...result,
    format,
    mediaType: "image/svg+xml",
    ...(result.scene ? { output: sceneToSvg(result.scene) } : {}),
  };
}

export function headlessResultToJson(result: HeadlessRenderResult, pretty = false) {
  return JSON.stringify(
    {
      ...(result.artifact ? { artifact: result.artifact } : {}),
      diagnostics: result.diagnostics,
      incomplete: result.incomplete,
      ...(result.scene ? { scene: result.scene } : {}),
    },
    null,
    pretty ? 2 : undefined,
  );
}

export function sceneToSvg(scene: Scene) {
  const titleHeight = scene.title ? 40 : 0;
  const height = scene.height + titleHeight;
  const markerId = `${safeId(scene.id)}-arrow`;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${height}" viewBox="0 0 ${scene.width} ${height}" role="img" aria-labelledby="${safeId(scene.id)}-title ${safeId(scene.id)}-desc">`,
    `  <title id="${safeId(scene.id)}-title">${escapeXml(scene.title ?? scene.id)}</title>`,
    `  <desc id="${safeId(scene.id)}-desc">${escapeXml(scene.accessibility.summary)}</desc>`,
    `  <rect width="${scene.width}" height="${height}" fill="#fff"/>`,
    "  <style>text{font-family:Inter,ui-sans-serif,system-ui,sans-serif;letter-spacing:0}.edge{fill:none;stroke:#a1a1aa;stroke-width:1.5}.edge-label{fill:#71717a;font-size:11px;font-weight:600}.node{fill:#fff;stroke:#d4d4d8}.node-role{fill:#71717a;font-size:10px;font-weight:600}.node-label{fill:#18181b;font-size:13px;font-weight:700}</style>",
    "  <defs>",
    `    <marker id="${markerId}" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M 0 0 L 7 3.5 L 0 7 z" fill="context-stroke"/></marker>`,
    "  </defs>",
  ];
  if (scene.title) {
    lines.push(`  <text x="16" y="24" class="node-label">${escapeXml(scene.title)}</text>`);
  }
  lines.push(`  <g transform="translate(0 ${titleHeight})">`);
  for (const edge of scene.edges) {
    lines.push(
      `    <path class="edge" data-livery-id="${escapeXml(edge.id)}" d="${escapeXml(edge.path)}" marker-end="url(#${markerId})"${toneStroke(edge.tone)}/>`,
    );
    if (edge.label) {
      lines.push(
        `    <text class="edge-label" text-anchor="middle" x="${edge.labelX}" y="${edge.labelY}">${escapeXml(edge.label)}</text>`,
      );
    }
  }
  for (const node of scene.nodes) lines.push(...svgNode(node));
  lines.push("  </g>", "</svg>");
  return lines.join("\n");
}

function svgNode(node: SceneNode) {
  const centerX = node.x + node.width / 2;
  const labelLines = wrapLabel(node.label, Math.max(1, Math.floor((node.width - 28) / 7)));
  const labelStart = node.y + node.height / 2 + (node.role ? 9 : labelLines.length === 1 ? 5 : -2);
  const lines = [
    `    <g data-livery-id="${escapeXml(node.id)}">`,
    `      <title>${escapeXml(node.label)}</title>`,
    `      <rect class="node" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="6"${toneStroke(node.tone)}/>`
  ];
  if (node.role) {
    lines.push(
      `      <text class="node-role" text-anchor="middle" x="${centerX}" y="${node.y + node.height / 2 - 9}">${escapeXml(node.role)}</text>`,
    );
  }
  lines.push(`      <text class="node-label" text-anchor="middle" x="${centerX}" y="${labelStart}">`);
  for (const [index, label] of labelLines.entries()) {
    const maxWidth = node.width - 28;
    const fit = label.length * 7 > maxWidth ? ` textLength="${maxWidth}" lengthAdjust="spacingAndGlyphs"` : "";
    lines.push(`        <tspan x="${centerX}" dy="${index === 0 ? 0 : 16}"${fit}>${escapeXml(label)}</tspan>`);
  }
  lines.push("      </text>", "    </g>");
  return lines;
}

function wrapLabel(label: string, maxCharacters: number) {
  const words = label.trim().split(/\s+/);
  if (label.length <= maxCharacters || words.length === 1) return [label];
  let first = words.shift()!;
  while (words.length && `${first} ${words[0]}`.length <= maxCharacters) first += ` ${words.shift()}`;
  return [first, words.join(" ")];
}

function toneStroke(tone?: SemanticTone) {
  const colors: Partial<Record<SemanticTone, string>> = {
    danger: "#b91c1c",
    info: "#2563eb",
    success: "#15803d",
    warning: "#a16207",
  };
  return tone && colors[tone] ? ` style="stroke:${colors[tone]}"` : "";
}

function safeId(value: string) {
  return value.replaceAll(/[^A-Za-z0-9_-]/g, "-") || "livery";
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
