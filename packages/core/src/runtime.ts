import { diagnostic, type Diagnostic } from "./diagnostics.js";
import { compile as compileLegacy } from "./compiler.js";
import { boardSceneToSvg, type BoardSvgOptions } from "./board-export.js";
import type { BoardScene, LayoutAttempt, ValidationReport } from "./board.js";
import { solvePinboard, type PinboardOptions } from "./pinboard.js";
import { compileVisual, migrateLegacyArtifact, type VisualCompileResult } from "./program.js";
import { compileVisualPlan, type VisualPlan } from "./visual-plan.js";
import { computeTimelineState } from "./timeline.js";
import type { VisualDocument } from "./visual.js";
import { validateBoardResources } from "./resources.js";

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

export type VisualPlanRenderResult = VisualRenderResult & {
  plan?: VisualPlan;
  source?: string;
  quality?: VisualPlanQualityReport;
};

export type VisualPlanQualityReport = {
  acceptable: boolean;
  score: number;
  diagnostics: Diagnostic[];
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
  return renderDocument(compiled.document, compiled.diagnostics, options);
}

export function renderVisualPlan(plan: unknown, options: VisualRenderOptions = {}): VisualPlanRenderResult {
  const initial = compileVisualPlan(plan);
  if (!initial.document || !initial.plan) return { diagnostics: initial.diagnostics };
  const acceptedPlan = initial.plan;
  const candidates: Array<{ compiled: typeof initial; rendered: VisualRenderResult; quality: VisualPlanQualityReport }> = [];
  const candidateSources = new Set<string>();
  const addCandidate = (compiled: typeof initial) => {
    if (!compiled.document || !compiled.source || candidateSources.has(compiled.source)) return;
    candidateSources.add(compiled.source);
    const rendered = renderDocument(compiled.document, compiled.diagnostics, options);
    candidates.push({ compiled, rendered, quality: evaluateVisualPlanQuality(rendered, acceptedPlan, options.width ?? 720) });
  };
  addCandidate(initial);
  if ((options.width ?? 720) > 560 && acceptedPlan.direction === "auto") {
    addCandidate(compileVisualPlan({ ...acceptedPlan, direction: "right" }));
  } else if (acceptedPlan.direction === "right") {
    addCandidate(compileVisualPlan({ ...acceptedPlan, direction: "auto" }));
  }
  if (acceptedPlan.direction !== "down") {
    addCandidate(compileVisualPlan({ ...acceptedPlan, direction: "down" }, { compact: true }));
  }
  const selected = candidates.sort((first, second) =>
    Number(second.quality.acceptable) - Number(first.quality.acceptable)
    || first.quality.score - second.quality.score)[0]!;
  return {
    ...selected.rendered,
    plan: acceptedPlan,
    quality: selected.quality,
    ...(selected.compiled.source ? { source: selected.compiled.source } : {}),
  };
}

function evaluateVisualPlanQuality(result: VisualRenderResult, plan: VisualPlan, width: number): VisualPlanQualityReport {
  if (!result.scene || !result.report?.valid || !result.svg) {
    return { acceptable: false, score: Number.MAX_SAFE_INTEGER, diagnostics: [diagnostic("plan.quality.unrenderable", "The semantic plan has no valid rendered candidate.")] };
  }
  const { scene, report } = result;
  const metrics = report.metrics;
  const landscapeTarget = width > 560 && plan.direction !== "down";
  const heightRatio = scene.board.height / Math.max(1, scene.board.width);
  const maximumHeightRatio = landscapeTarget ? 1.15 : 2.8;
  const annotationDistances = scene.connectors
    .filter(({ id }) => id.startsWith("__livery_annotation_edge_"))
    .map((connector) => connector.points.slice(1).reduce((length, point, index) =>
      length + Math.abs(point.x - connector.points[index]!.x) + Math.abs(point.y - connector.points[index]!.y), 0) / Math.max(1, scene.board.width));
  const maximumAnnotationDistance = Math.max(0, ...annotationDistances);
  const diagnostics: Diagnostic[] = [];
  const elementById = new Map(scene.elements.map((element) => [element.id, element]));
  const primaryEdges = scene.connectors.filter(({ role }) => role === "primary");
  const directionAlignment = primaryEdges.length ? primaryEdges.filter((edge) => {
    const from = elementById.get(edge.from)?.visualBounds;
    const to = elementById.get(edge.to)?.visualBounds;
    if (!from || !to) return false;
    const dx = to.x + to.width / 2 - (from.x + from.width / 2);
    const dy = to.y + to.height / 2 - (from.y + from.height / 2);
    return plan.direction === "down" ? dy > 0 && Math.abs(dy) >= Math.abs(dx) : dx > 0 && Math.abs(dx) >= Math.abs(dy);
  }).length / primaryEdges.length : 1;
  if (heightRatio > maximumHeightRatio) diagnostics.push(diagnostic("plan.quality.excessive_height", `The plan produced a ${scene.board.width}×${scene.board.height} canvas, which is too tall for its requested reading direction.`));
  if (plan.direction !== "auto" && (plan.direction === "down" || width >= 800) && primaryEdges.length >= 2 && directionAlignment < 0.75) {
    diagnostics.push(diagnostic("plan.quality.direction_mismatch", `The dominant flow does not preserve the requested ${plan.direction} reading direction.`));
  }
  if (maximumAnnotationDistance > 0.55) diagnostics.push(diagnostic("plan.quality.distant_annotation", "A generated annotation is too far from its subject."));
  if (metrics.primaryContinuity < 0.6) diagnostics.push(diagnostic("plan.quality.broken_spine", "The dominant flow is not visually continuous."));
  if (metrics.maximumNormalizedRouteLength > 4) diagnostics.push(diagnostic("plan.quality.route_detour", "A connector takes an excessive visual detour."));
  if (metrics.rankErrorCount > 1 || metrics.backtrackingCount > 1) diagnostics.push(diagnostic("plan.quality.backtracking", "The diagram repeatedly moves against its dominant reading direction."));
  const sparse = metrics.elementCount >= 4 && metrics.occupancyRatio < 0.045;
  if (sparse) diagnostics.push(diagnostic("plan.quality.sparse", "The diagram uses too little of its canvas."));
  const score = Math.round(1000 * (
    Math.max(0, heightRatio - (landscapeTarget ? 0.65 : 1.4)) * 4
    + maximumAnnotationDistance * 2
    + Math.max(0, 1 - metrics.primaryContinuity) * 3
    + Math.max(0, metrics.maximumNormalizedRouteLength - 1) * 0.4
    + metrics.backtrackingCount * 0.75
    + metrics.rankErrorCount * 0.75
    + metrics.densityPenalty
    + metrics.whitespaceImbalance
  )) / 1000;
  return { acceptable: diagnostics.length === 0, score, diagnostics };
}

function renderDocument(document: VisualDocument, diagnostics: Diagnostic[], options: VisualRenderOptions): VisualRenderResult {
  const layout = solvePinboard(document, options);
  if (!layout.ok) return { document, diagnostics: [...diagnostics, ...layout.diagnostics], attempts: layout.attempts };
  const resourceDiagnostics = validateBoardResources(layout.scene, options.resourcePolicy, options.icons);
  if (resourceDiagnostics.length) return { document, scene: layout.scene, diagnostics: [...diagnostics, ...resourceDiagnostics], report: layout.report, attempts: layout.attempts };
  const timeline = document.timelines.find(({ id }) => id === options.timeline) ?? document.timelines[0];
  const state = timeline && options.state ? computeTimelineState(timeline, options.state, layout.scene) : options.state;
  const svg = boardSceneToSvg(layout.scene, {
    ...(options.debug !== undefined ? { debug: options.debug } : {}),
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.tokenOverrides ? { tokenOverrides: options.tokenOverrides } : {}),
    ...(options.resourcePolicy ? { resourcePolicy: options.resourcePolicy } : {}),
    ...(options.icons ? { icons: options.icons } : {}),
    ...(typeof state === "object" ? { state } : {}),
  });
  return { document, scene: layout.scene, svg, diagnostics, report: layout.report, attempts: layout.attempts };
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
