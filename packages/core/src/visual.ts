import type { SemanticTone } from "./artifact.js";

export type PrimitiveKind = "text" | "box" | "circle" | "line" | "path" | "image" | "icon" | "group" | "canvas" | "repeat";
export type LayoutKind = "free" | "row" | "column" | "stack" | "grid" | "overlay" | "canvas";
export type AnchorName = "top" | "right" | "bottom" | "left" | "center";
export type TokenReference = `$${string}`;
export type VisualValue = string | number | boolean | TokenReference;

export type VisualStyle = {
  fill?: VisualValue;
  stroke?: VisualValue;
  strokeWidth?: VisualValue;
  radius?: VisualValue;
  opacity?: VisualValue;
  color?: VisualValue;
  fontSize?: VisualValue;
  fontWeight?: VisualValue;
};

export type VisualNode = {
  id: string;
  kind: PrimitiveKind | `lib.${string}` | `component.${string}`;
  label?: string;
  description?: string;
  variant?: string;
  tone?: SemanticTone;
  layout?: LayoutSpec;
  style?: VisualStyle;
  props?: Record<string, VisualValue>;
  children?: VisualNode[];
  anchors?: AnchorName[];
};

export type LayoutSpec = {
  kind: LayoutKind;
  gap?: VisualValue;
  columns?: number;
  align?: "start" | "center" | "end" | "stretch";
  distribute?: "start" | "center" | "end" | "between" | "around";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type Connector = {
  id: string;
  from: { node: string; anchor?: AnchorName };
  to: { node: string; anchor?: AnchorName };
  label?: string;
  variant?: "directional" | "bidirectional" | "async" | "data";
  tone?: SemanticTone;
  style?: VisualStyle;
};

export type TimelineOperation =
  | { action: "show" | "hide" | "focus" | "trace"; targets: string[] }
  | { action: "set"; targets: string[]; properties: Record<string, VisualValue> }
  | { action: "morph"; targets: [string, string] };

export type TimelineState = { id: string; operations: TimelineOperation[] };
export type TimelineTransition = { from: string; to: string; duration?: string };
export type Timeline = { id: string; states: TimelineState[]; transitions: TimelineTransition[] };

export type VisualConstraint =
  | { kind: "align"; targets: string[]; axis: "x" | "y"; edge?: "start" | "center" | "end" }
  | { kind: "distribute"; targets: string[]; axis: "x" | "y"; gap?: VisualValue }
  | { kind: "inside"; child: string; container: string; padding?: VisualValue }
  | { kind: "near"; first: string; second: string; distance?: VisualValue };

export type VisualDocument = {
  type: "livery.visual";
  version: "0.2";
  id: string;
  title?: string;
  root: VisualNode;
  connectors: Connector[];
  constraints: VisualConstraint[];
  timelines: Timeline[];
};

export type ComponentParameter = {
  name: string;
  type: "string" | "number" | "boolean" | "tone";
  required: boolean;
  default?: VisualValue;
};

export type ComponentDefinition = {
  name: string;
  category: "people" | "compute" | "storage" | "messaging" | "device" | "ai" | "content" | "chart";
  description: string;
  status: "supported" | "experimental";
  parameters: ComponentParameter[];
  root: VisualNode;
  ports: AnchorName[];
  variants: string[];
  tokens: string[];
  intrinsicSize: { minWidth: number; minHeight: number };
  sizing: { minWidth: number; minHeight: number; maxWidth?: number };
  accessibility: { role: "figure" | "group" | "img"; labelParameter: string };
  example: string;
  examples: string[];
};
