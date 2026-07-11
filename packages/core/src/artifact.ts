export type CompositionKind = "flow" | "sequence" | "explainer";

export type SemanticTone = "neutral" | "info" | "success" | "warning" | "danger";

export type EntityRole =
  | "actor"
  | "service"
  | "database"
  | "queue"
  | "worker"
  | "api"
  | "external"
  | "document"
  | "concept"
  | "decision"
  | "step";

export type Entity = {
  id: string;
  label: string;
  role?: EntityRole;
  tone?: SemanticTone;
  source?: string;
};

export type Relationship = {
  id: string;
  from: string;
  to: string;
  label?: string;
  tone?: SemanticTone;
};

export type StoryAction =
  | "reveal"
  | "hide"
  | "focus"
  | "indicate"
  | "trace"
  | "transform"
  | "compare"
  | "set_state"
  | "enter"
  | "exit";

export type StoryTarget =
  | { type: "entity"; id: string }
  | { type: "relationship"; id: string };

export type StoryStep = {
  id: string;
  action: StoryAction;
  targets: StoryTarget[];
};

export type LiveryArtifact = {
  type: "livery";
  version: "0.1";
  id: string;
  title?: string;
  composition: CompositionKind;
  entities: Entity[];
  relationships: Relationship[];
  story: StoryStep[];
};

export type LiverySource = string | Record<string, unknown>;
