import { Resvg } from "@resvg/resvg-js";
import {
  exportHeadless,
  type HeadlessExportOptions,
  type HeadlessRenderResult,
  type LiverySource,
} from "@jerkeyray/core";

export type PngRasterOptions = {
  background?: string;
  outputWidth?: number;
  scale?: number;
};

export type HeadlessPngExportOptions = Omit<HeadlessExportOptions, "format" | "pretty"> &
  PngRasterOptions;

export type HeadlessPngExportResult = HeadlessRenderResult & {
  format: "png";
  mediaType: "image/png";
  output?: Uint8Array;
};

export function svgToPng(svg: string | Uint8Array, options: PngRasterOptions = {}) {
  const scale = Math.max(0.1, Math.min(options.scale ?? 1, 8));
  const outputWidth =
    options.outputWidth === undefined ? undefined : Math.max(1, Math.floor(options.outputWidth));
  const renderer = new Resvg(typeof svg === "string" ? svg : Buffer.from(svg), {
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
