import type { EntityRole, LiveryArtifact, SemanticTone } from "./artifact.js";

export type SceneDirection = "horizontal" | "vertical";

export type SceneNode = {
  id: string;
  label: string;
  role?: EntityRole;
  tone?: SemanticTone;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SceneEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
  tone?: SemanticTone;
  path: string;
  labelX: number;
  labelY: number;
};

export type Scene = {
  id: string;
  title?: string;
  width: number;
  height: number;
  direction: SceneDirection;
  nodes: SceneNode[];
  edges: SceneEdge[];
  accessibility: {
    summary: string;
    readingOrder: string[];
  };
};

export type FlowLayoutOptions = {
  width: number;
  compactBreakpoint?: number;
};

export type SceneCompiler = (artifact: LiveryArtifact, options: FlowLayoutOptions) => Scene;
