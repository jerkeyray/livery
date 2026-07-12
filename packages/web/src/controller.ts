import { CompilerSession, type CompileRevision, type LiveryArtifact, type LiverySource } from "@jerkeyray/core";

export type LiveryControllerOptions = {
  retainLastValid?: boolean;
};

export type LiveryControllerRevision = CompileRevision & {
  renderArtifact?: LiveryArtifact;
  retained: boolean;
};

export class LiveryController {
  readonly #session = new CompilerSession();
  #lastValidArtifact?: LiveryArtifact;
  #revision?: LiveryControllerRevision;

  get revision() {
    return this.#revision;
  }

  update(source: LiverySource, options: LiveryControllerOptions = {}): LiveryControllerRevision {
    const revision = this.#session.compile(source);
    if (revision.artifact) this.#lastValidArtifact = revision.artifact;
    const renderArtifact =
      revision.artifact ?? (options.retainLastValid === false ? undefined : this.#lastValidArtifact);
    this.#revision = {
      ...revision,
      ...(renderArtifact ? { renderArtifact } : {}),
      retained: !revision.artifact && Boolean(renderArtifact),
    };
    return this.#revision;
  }
}
