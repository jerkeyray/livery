import type { LayoutAdapter, LayoutRequest, LiveryArtifact, Scene } from "@jerkeyray/core";

export type LayoutControllerRevision = {
  adapterId: string;
  artifact?: LiveryArtifact;
  error?: unknown;
  pending: boolean;
  request: number;
  durationMs?: number;
  fallback?: boolean;
  requestedAdapterId?: string;
  scene?: Scene;
};

export type LayoutEvent = {
  adapterId: string;
  artifactId: string;
  durationMs?: number;
  fallback?: boolean;
  phase: "start" | "complete" | "error" | "abort";
  request: number;
  requestedAdapterId?: string;
};

export class LayoutController {
  #active: { adapterId: string; artifactId: string; request: number; startedAt: number } | undefined;
  #abort: AbortController | undefined;
  #destroyed = false;
  #request = 0;
  #revision: LayoutControllerRevision | undefined;
  readonly #listeners = new Set<(event: LayoutEvent) => void>();

  get revision() {
    return this.#revision;
  }

  subscribe(listener: (event: LayoutEvent) => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  update(
    adapter: LayoutAdapter,
    request: LayoutRequest,
    onChange?: (revision: LayoutControllerRevision) => void,
  ): LayoutControllerRevision {
    if (this.#destroyed) throw new Error("Cannot update a destroyed layout controller.");
    this.#abortActive();
    this.#abort = new AbortController();
    const requestId = ++this.#request;
    const startedAt = now();
    this.#active = { adapterId: adapter.id, artifactId: request.artifact.id, request: requestId, startedAt };
    this.#emit({ adapterId: adapter.id, artifactId: request.artifact.id, phase: "start", request: requestId });
    let output: Scene | Promise<Scene>;
    try {
      output = adapter.layout({ ...request, signal: this.#abort.signal });
    } catch (error) {
      return this.#fail(adapter.id, requestId, error);
    }

    if (!isPromise(output)) {
      return this.#complete(adapter.id, requestId, request.artifact, output, now() - startedAt);
    }

    this.#revision = {
      adapterId: adapter.id,
      ...(this.#revision?.artifact ? { artifact: this.#revision.artifact } : {}),
      pending: true,
      request: requestId,
      ...(this.#revision?.scene ? { scene: this.#revision.scene } : {}),
    };
    void output.then(
      (scene) => {
        if (this.#destroyed || requestId !== this.#request) return;
        onChange?.(this.#complete(adapter.id, requestId, request.artifact, scene, now() - startedAt));
      },
      (error: unknown) => {
        if (this.#destroyed || requestId !== this.#request) return;
        onChange?.(this.#fail(adapter.id, requestId, error));
      },
    );
    return this.#revision;
  }

  clear() {
    this.#abortActive();
    this.#abort = undefined;
    this.#request++;
    this.#revision = undefined;
  }

  destroy() {
    this.#destroyed = true;
    this.clear();
  }

  #complete(
    requestedAdapterId: string,
    request: number,
    artifact: LiveryArtifact,
    scene: Scene,
    durationMs: number,
  ) {
    const adapterId = scene.layout?.adapterId ?? requestedAdapterId;
    this.#revision = {
      adapterId,
      artifact,
      durationMs: Math.max(0, Math.round(durationMs * 10) / 10),
      ...(scene.layout?.fallback ? { fallback: true } : {}),
      pending: false,
      request,
      ...(adapterId !== requestedAdapterId ? { requestedAdapterId } : {}),
      scene,
    };
    this.#active = undefined;
    this.#emit({
      adapterId,
      artifactId: artifact.id,
      ...(this.#revision.durationMs !== undefined ? { durationMs: this.#revision.durationMs } : {}),
      ...(this.#revision.fallback ? { fallback: true } : {}),
      phase: "complete",
      request,
      ...(this.#revision.requestedAdapterId
        ? { requestedAdapterId: this.#revision.requestedAdapterId }
        : {}),
    });
    return this.#revision;
  }

  #fail(adapterId: string, request: number, error: unknown) {
    this.#revision = {
      adapterId,
      ...(this.#revision?.artifact ? { artifact: this.#revision.artifact } : {}),
      error,
      pending: false,
      request,
      ...(this.#revision?.scene ? { scene: this.#revision.scene } : {}),
    };
    const active = this.#active;
    this.#active = undefined;
    this.#emit({
      adapterId,
      artifactId: active?.artifactId ?? this.#revision.artifact?.id ?? "unknown",
      ...(active ? { durationMs: elapsed(active.startedAt) } : {}),
      phase: "error",
      request,
    });
    return this.#revision;
  }

  #abortActive() {
    const active = this.#active;
    if (active) {
      this.#emit({
        adapterId: active.adapterId,
        artifactId: active.artifactId,
        durationMs: elapsed(active.startedAt),
        phase: "abort",
        request: active.request,
      });
      this.#active = undefined;
    }
    this.#abort?.abort();
  }

  #emit(event: LayoutEvent) {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch {
        // Telemetry observers must not affect layout completion.
      }
    }
  }
}

function isPromise(value: Scene | Promise<Scene>): value is Promise<Scene> {
  return typeof (value as Promise<Scene>).then === "function";
}

function now() {
  return globalThis.performance?.now() ?? Date.now();
}

function elapsed(startedAt: number) {
  return Math.max(0, Math.round((now() - startedAt) * 10) / 10);
}
