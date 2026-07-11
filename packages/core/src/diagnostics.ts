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

export type RepairHint = {
  description: string;
  knownIds?: string[];
};

export type Diagnostic = {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  span?: SourceSpan;
  path?: Array<string | number>;
  repair?: RepairHint;
};

export function diagnostic(
  code: string,
  message: string,
  span?: SourceSpan,
  severity: DiagnosticSeverity = "error",
): Diagnostic {
  return {
    code,
    message,
    severity,
    ...(span ? { span } : {}),
  };
}
