import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { compile as compileLegacy } from "./compiler.js";
import { boardSceneToSvg, type BoardSvgOptions } from "./board-export.js";
import type { BoardScene, LayoutAttempt, ValidationReport } from "./board.js";
import { solvePinboard, type PinboardOptions } from "./pinboard.js";
import { compileVisual, migrateLegacyArtifact, type VisualCompileResult } from "./program.js";
import { computeTimelineState } from "./timeline.js";
import type { VisualDocument } from "./visual.js";

export type VisualRenderOptions = PinboardOptions & Omit<BoardSvgOptions, "state"> & {
  timeline?: string;
  state?: string;
};

export type VisualRenderResult = {
  document?: VisualDocument;
  scene?: BoardScene;
  svg?: string;
  diagnostics: Diagnostic[];
  report?: ValidationReport;
  attempts?: LayoutAttempt[];
};

export type VisualExportOptions = VisualRenderOptions & {
  format: "svg" | "json";
  pretty?: boolean;
};

export type VisualExportResult = VisualRenderResult & {
  format: "svg" | "json";
  mediaType: "image/svg+xml" | "application/json";
  output?: string;
};

export function compileProgram(source: string): VisualCompileResult {
  if (!/^\s*flow\b/.test(source)) return compileVisual(source);
  const legacy = compileLegacy(source);
  if (!legacy.artifact) return { diagnostics: legacy.diagnostics };
  return {
    document: migrateLegacyArtifact(legacy.artifact),
    diagnostics: [...legacy.diagnostics, diagnostic("compat.legacy_source", "Legacy flow source was translated to the programmable visual language.", undefined, "warning")],
  };
}

export function render(source: string, options: VisualRenderOptions = {}): VisualRenderResult {
  const compiled = compileProgram(source);
  if (!compiled.document) return { diagnostics: compiled.diagnostics };
  const layout = solvePinboard(compiled.document, options);
  if (!layout.ok) return { document: compiled.document, diagnostics: [...compiled.diagnostics, ...layout.diagnostics], attempts: layout.attempts };
  const timeline = compiled.document.timelines.find(({ id }) => id === options.timeline) ?? compiled.document.timelines[0];
  const state = timeline && options.state ? computeTimelineState(timeline, options.state, layout.scene) : options.state;
  const svg = boardSceneToSvg(layout.scene, {
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}),
    ...(typeof state === "object" ? { state } : {}),
  });
  return { document: compiled.document, scene: layout.scene, svg, diagnostics: compiled.diagnostics, report: layout.report, attempts: layout.attempts };
}

export function exportVisual(source: string, options: VisualExportOptions): VisualExportResult {
  const { format, pretty = false, ...renderOptions } = options;
  const result = render(source, renderOptions);
  if (format === "svg") return { ...result, format, mediaType: "image/svg+xml", ...(result.svg ? { output: result.svg } : {}) };
  const output = JSON.stringify({
    ...(result.document ? { document: result.document } : {}),
    diagnostics: result.diagnostics,
    ...(result.scene ? { scene: result.scene } : {}),
    ...(result.report ? { report: result.report } : {}),
    ...(result.attempts ? { attempts: result.attempts } : {}),
  }, null, pretty ? 2 : undefined);
  return { ...result, format, mediaType: "application/json", output };
}
