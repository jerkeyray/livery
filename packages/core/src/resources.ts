import { diagnostic, type Diagnostic } from "./diagnostics.js";
import type { BoardScene, CanvasPrimitive } from "./board.js";

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

export function validateBoardResources(scene: BoardScene, policy: ResourcePolicy = {}): Diagnostic[] {
  const canvasDiagnostics = scene.canvases.flatMap(({ primitives }) => primitives.flatMap((primitive) => validatePrimitiveResource(primitive, policy)));
  const elementDiagnostics = scene.elements.flatMap((element) => element.kind === "image" && typeof element.props?.src === "string"
    ? validateImageResource(element.id, element.props.src, policy, ["elements", element.id]) : []);
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

function validatePrimitiveResource(primitive: CanvasPrimitive, policy: ResourcePolicy) {
  if (primitive.kind !== "image" || typeof primitive.props?.src !== "string") return [];
  return validateImageResource(primitive.id, primitive.props.src, policy, ["canvases", primitive.parent ?? primitive.id, primitive.id]);
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
