import { diagnostic, type Diagnostic } from "./diagnostics.js";
import type { BoardScene, CanvasPrimitive } from "./board.js";
import { canonicalGlyph, type IconRegistry } from "./glyphs.js";

export type ResourcePolicy = {
  allowDataImages?: boolean;
  allowedImageHosts?: string[];
  maxDataImageBytes?: number;
};

export const defaultResourcePolicy: Required<ResourcePolicy> = {
  allowDataImages: true,
  allowedImageHosts: [],
  maxDataImageBytes: 256 * 1024,
};

export function resolveResourcePolicy(policy: ResourcePolicy = {}): Required<ResourcePolicy> {
  return {
    allowDataImages: policy.allowDataImages ?? defaultResourcePolicy.allowDataImages,
    allowedImageHosts: [...new Set((policy.allowedImageHosts ?? defaultResourcePolicy.allowedImageHosts).map((host) => host.toLowerCase()))].sort(),
    maxDataImageBytes: Math.max(0, Math.floor(policy.maxDataImageBytes ?? defaultResourcePolicy.maxDataImageBytes)),
  };
}

export function validateBoardResources(scene: BoardScene, policy: ResourcePolicy = {}, icons?: IconRegistry): Diagnostic[] {
  const canvasDiagnostics = scene.canvases.flatMap(({ primitives }) => primitives.flatMap((primitive) => validatePrimitiveResource(primitive, policy, icons)));
  const elementDiagnostics = scene.elements.flatMap((element) => {
    if (element.kind === "image" && typeof element.props?.src === "string") return validateImageResource(element.id, element.props.src, policy, ["elements", element.id]);
    if (typeof element.props?.icon === "string") return validateIconResource(element.id, element.props.icon, icons, ["elements", element.id]);
    return [];
  });
  return [...elementDiagnostics, ...canvasDiagnostics];
}

export function isImageSourceAllowed(source: string, policy: ResourcePolicy = {}) {
  const resolved = resolveResourcePolicy(policy);
  if (source.startsWith("data:image/")) return resolved.allowDataImages && dataImageBytes(source) <= resolved.maxDataImageBytes;
  try {
    const url = new URL(source);
    return url.protocol === "https:" && resolved.allowedImageHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function assertSvgResourcesAllowed(svg: string, policy: ResourcePolicy = {}) {
  const hrefs = [...svg.matchAll(/\b(?:href|xlink:href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]!);
  const denied = hrefs.find((source) => !source.startsWith("#") && !isImageSourceAllowed(source, policy));
  if (denied) throw new Error(`SVG resource is not allowed by the resource policy: ${summarizeSource(denied)}`);
}

function validatePrimitiveResource(primitive: CanvasPrimitive, policy: ResourcePolicy, icons?: IconRegistry) {
  if (primitive.kind === "image" && typeof primitive.props?.src === "string") return validateImageResource(primitive.id, primitive.props.src, policy, ["canvases", primitive.parent ?? primitive.id, primitive.id]);
  if (primitive.kind === "icon" && typeof primitive.props?.name === "string") return validateIconResource(primitive.id, primitive.props.name, icons, ["canvases", primitive.parent ?? primitive.id, primitive.id]);
  return [];
}

function validateIconResource(id: string, name: string, icons: IconRegistry | undefined, path: Array<string | number>) {
  if (canonicalGlyph(name, icons)?.length) return [];
  return [{
    ...diagnostic("resource.icon_not_registered", `Icon ${name} used by ${id} is not registered.`),
    path,
    repair: { description: "Use a canonical icon name or register a trusted icon path set in the renderer." },
  }];
}

function validateImageResource(id: string, source: string, policy: ResourcePolicy, path: Array<string | number>) {
  if (isImageSourceAllowed(source, policy)) return [];
  return [{
    ...diagnostic("resource.image_not_allowed", `Image ${id} is not allowed by the active resource policy.`),
    path,
    repair: { description: "Use a bounded data image or explicitly allow its HTTPS host." },
  }];
}

function dataImageBytes(source: string) {
  const comma = source.indexOf(",");
  if (comma < 0) return Number.POSITIVE_INFINITY;
  const metadata = source.slice(0, comma);
  const payload = source.slice(comma + 1);
  if (/;base64(?:;|$)/i.test(metadata)) return Math.ceil(payload.replaceAll(/\s/g, "").length * 3 / 4);
  try { return new TextEncoder().encode(decodeURIComponent(payload)).length; } catch { return Number.POSITIVE_INFINITY; }
}

function summarizeSource(source: string) {
  return source.length <= 80 ? source : `${source.slice(0, 77)}...`;
}
