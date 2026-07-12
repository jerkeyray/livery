import type { Diagnostic, SourceSpan } from "../diagnostics.js";

export type SyntaxProperty = {
  name: string;
  value: string;
  span: SourceSpan;
};

export type FlowSyntax = {
  type: "flow";
  id: string;
  title?: string;
  span: SourceSpan;
};

export type EntitySyntax = {
  type: "entity";
  id: string;
  constructor: string;
  label?: string;
  properties: SyntaxProperty[];
  span: SourceSpan;
};

export type RelationshipSyntax = {
  type: "relationship";
  id?: string;
  from: string;
  to: string;
  label?: string;
  properties: SyntaxProperty[];
  span: SourceSpan;
};

export type StorySyntax = {
  type: "story";
  span: SourceSpan;
};

export type StoryTargetSyntax =
  | { type: "reference"; value: string }
  | { type: "relationship"; from: string; to: string };

export type StoryStepSyntax = {
  type: "story_step";
  action: string;
  targets: StoryTargetSyntax[];
  properties: SyntaxProperty[];
  span: SourceSpan;
};

export type SyntaxStatement = FlowSyntax | EntitySyntax | RelationshipSyntax | StorySyntax | StoryStepSyntax;

export type SyntaxDocument = {
  statements: SyntaxStatement[];
  diagnostics: Diagnostic[];
  incomplete: boolean;
  tokenCount: number;
};
