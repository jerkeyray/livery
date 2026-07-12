import type { LiverySource } from "./artifact.js";
import { compile, type CompileOptions, type CompileResult } from "./compiler.js";
import { fastFlowLayoutAdapter, type LayoutAdapter } from "./layout-adapter.js";
import type { MeasurementService } from "./measurement.js";
import type { Scene } from "./scene.js";

export type HeadlessRenderOptions = {
  adapter?: LayoutAdapter;
  compactBreakpoint?: number;
  compile?: CompileOptions;
  measurement?: MeasurementService;
  signal?: AbortSignal;
  width?: number;
};

export type HeadlessRenderResult = CompileResult & {
  adapterId?: string;
  durationMs?: number;
  scene?: Scene;
};

export async function renderHeadless(
  source: LiverySource,
  options: HeadlessRenderOptions = {},
): Promise<HeadlessRenderResult> {
  throwIfAborted(options.signal);
  const result = compile(source, options.compile);
  if (!result.artifact) return result;
  throwIfAborted(options.signal);

  const adapter = options.adapter ?? fastFlowLayoutAdapter;
  const startedAt = now();
  const scene = await adapter.layout({
    artifact: result.artifact,
    options: {
      width: Math.max(280, Math.floor(options.width ?? 720)),
      ...(options.compactBreakpoint !== undefined
        ? { compactBreakpoint: options.compactBreakpoint }
        : {}),
      ...(options.measurement ? { measurement: options.measurement } : {}),
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });

  return {
    ...result,
    adapterId: scene.layout?.adapterId ?? adapter.id,
    durationMs: elapsed(startedAt),
    scene,
  };
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsed(startedAt: number) {
  return Math.max(0, Math.round((now() - startedAt) * 10) / 10);
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Headless render was aborted.");
  error.name = "AbortError";
  throw error;
}
