export const LIVERY_ARTIFACT_VERSION = "0.1" as const;

export type LiverySource = string | Record<string, unknown>;

export type CompositionKind = "flow" | "sequence" | "explainer";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type SourcePosition = {
  line: number;
  column: number;
  offset: number;
};

export type SourceSpan = {
  start: SourcePosition;
  end: SourcePosition;
};

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  span?: SourceSpan;
  path?: Array<string | number>;
};
