import type { LiverySource } from "./artifact.js";
import { compile, type CompileResult } from "./compiler.js";

export type CompileRevision = CompileResult & {
  revision: number;
  completeness: "partial" | "complete";
};

export class CompilerSession {
  #revision = 0;

  compile(source: LiverySource): CompileRevision {
    const result = compile(source);
    return {
      ...result,
      revision: ++this.#revision,
      completeness: result.incomplete ? "partial" : "complete",
    };
  }
}
