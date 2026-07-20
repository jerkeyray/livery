import { Resvg } from "@resvg/resvg-js";
import {
  exportHeadless,
  exportVisual,
  type HeadlessExportOptions,
  type HeadlessRenderResult,
  type LiverySource,
  type VisualRenderOptions,
  assertSvgResourcesAllowed,
  type ResourcePolicy,
} from "@liveryscript/core";

export type PngRasterOptions = {
  background?: string;
  outputWidth?: number;
  scale?: number;
  resourcePolicy?: ResourcePolicy;
};

export type HeadlessPngExportOptions = Omit<HeadlessExportOptions, "format" | "pretty"> &
  PngRasterOptions;

export type HeadlessPngExportResult = HeadlessRenderResult & {
  format: "png";
  mediaType: "image/png";
  output?: Uint8Array;
};

export type VisualPngExportOptions = VisualRenderOptions & PngRasterOptions;

export type VisualPngExportResult = Omit<ReturnType<typeof exportVisual>, "format" | "mediaType" | "output"> & {
  format: "png";
  mediaType: "image/png";
  output?: Uint8Array;
};

export function svgToPng(svg: string | Uint8Array, options: PngRasterOptions = {}) {
  const svgText = typeof svg === "string" ? svg : Buffer.from(svg).toString("utf8");
  assertSvgResourcesAllowed(svgText, options.resourcePolicy);
  const scale = Math.max(0.1, Math.min(options.scale ?? 1, 8));
  const outputWidth =
    options.outputWidth === undefined ? undefined : Math.max(1, Math.floor(options.outputWidth));
  const renderer = new Resvg(svgText, {
    ...(options.background ? { background: options.background } : {}),
    fitTo: outputWidth
      ? { mode: "width", value: outputWidth }
      : { mode: "zoom", value: scale },
  });
  return renderer.render().asPng();
}

export async function exportHeadlessPng(
  source: LiverySource,
  options: HeadlessPngExportOptions = {},
): Promise<HeadlessPngExportResult> {
  const { background, outputWidth, scale, ...headlessOptions } = options;
  const result = await exportHeadless(source, { ...headlessOptions, format: "svg" });
  return {
    ...(result.artifact ? { artifact: result.artifact } : {}),
    diagnostics: result.diagnostics,
    incomplete: result.incomplete,
    ...(result.adapterId ? { adapterId: result.adapterId } : {}),
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
    format: "png",
    mediaType: "image/png",
    ...(result.scene ? { scene: result.scene } : {}),
    ...(result.output
      ? {
          output: svgToPng(result.output, {
            ...(background ? { background } : {}),
            ...(outputWidth !== undefined ? { outputWidth } : {}),
            ...(scale !== undefined ? { scale } : {}),
          }),
        }
      : {}),
  };
}

export function exportVisualPng(source: string, options: VisualPngExportOptions = {}): VisualPngExportResult {
  const { background, outputWidth, scale, resourcePolicy, ...renderOptions } = options;
  const result = exportVisual(source, { ...renderOptions, ...(resourcePolicy ? { resourcePolicy } : {}), format: "svg" });
  const { output: _svg, ...metadata } = result;
  return {
    ...metadata,
    format: "png",
    mediaType: "image/png",
    ...(result.output ? { output: svgToPng(result.output, { ...(background ? { background } : {}), ...(outputWidth !== undefined ? { outputWidth } : {}), ...(scale !== undefined ? { scale } : {}), ...(resourcePolicy ? { resourcePolicy } : {}) }) } : {}),
  };
}
