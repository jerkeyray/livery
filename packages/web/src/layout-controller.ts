import type { LayoutAdapter, LayoutRequest, LiveryArtifact, Scene } from "@livery/core";

export type LayoutControllerRevision = {
  adapterId: string;
  artifact?: LiveryArtifact;
  error?: unknown;
  pending: boolean;
  request: number;
  scene?: Scene;
};

export class LayoutController {
  #abort: AbortController | undefined;
  #destroyed = false;
  #request = 0;
  #revision: LayoutControllerRevision | undefined;

  get revision() {
    return this.#revision;
  }

  update(
    adapter: LayoutAdapter,
    request: LayoutRequest,
    onChange?: (revision: LayoutControllerRevision) => void,
  ): LayoutControllerRevision {
    if (this.#destroyed) throw new Error("Cannot update a destroyed layout controller.");
    this.#abort?.abort();
    this.#abort = new AbortController();
    const requestId = ++this.#request;
    let output: Scene | Promise<Scene>;
    try {
      output = adapter.layout({ ...request, signal: this.#abort.signal });
    } catch (error) {
      return this.#fail(adapter.id, requestId, error);
    }

    if (!isPromise(output)) {
      return this.#complete(adapter.id, requestId, request.artifact, output);
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
        onChange?.(this.#complete(adapter.id, requestId, request.artifact, scene));
      },
      (error: unknown) => {
        if (this.#destroyed || requestId !== this.#request) return;
        onChange?.(this.#fail(adapter.id, requestId, error));
      },
    );
    return this.#revision;
  }

  clear() {
    this.#abort?.abort();
    this.#abort = undefined;
    this.#request++;
    this.#revision = undefined;
  }

  destroy() {
    this.#destroyed = true;
    this.clear();
  }

  #complete(adapterId: string, request: number, artifact: LiveryArtifact, scene: Scene) {
    this.#revision = { adapterId, artifact, pending: false, request, scene };
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
    return this.#revision;
  }
}

function isPromise(value: Scene | Promise<Scene>): value is Promise<Scene> {
  return typeof (value as Promise<Scene>).then === "function";
}
