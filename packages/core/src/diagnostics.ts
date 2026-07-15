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

export type TextEdit = {
  span: SourceSpan;
  text: string;
};

export type RepairHint = {
  description: string;
  knownIds?: string[];
  edits?: TextEdit[];
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

export function applyDiagnosticFix(source: string, item: Diagnostic): string | undefined {
  const edits = item.repair?.edits;
  if (!edits?.length) return undefined;
  const ordered = [...edits].sort((left, right) => right.span.start.offset - left.span.start.offset);
  let nextStart = source.length;
  for (const edit of ordered) {
    const { start, end } = edit.span;
    if (start.offset < 0 || end.offset < start.offset || end.offset > source.length || end.offset > nextStart) return undefined;
    nextStart = start.offset;
  }
  return ordered.reduce(
    (result, edit) => `${result.slice(0, edit.span.start.offset)}${edit.text}${result.slice(edit.span.end.offset)}`,
    source,
  );
}
