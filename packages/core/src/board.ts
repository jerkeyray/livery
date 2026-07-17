import type { Diagnostic } from "./diagnostics.js";
import type { SemanticTone } from "./artifact.js";
import type { ConnectorRole, VisualStyle, VisualValue } from "./visual.js";

export type BoardPoint = { x: number; y: number };
export type BoardRect = { x: number; y: number; width: number; height: number };
export type PinSide = "top" | "right" | "bottom" | "left";

export type SolvedPin = {
  id: string;
  owner: string;
  side: PinSide;
  point: BoardPoint;
  direction: BoardPoint;
};

export type CollisionEnvelope = BoardRect & {
  id: string;
  owner: string;
  kind: "component" | "label" | "canvas" | "motion";
  overlapGroup?: string;
  overlapGroups?: string[];
};

export type RouteChannel = BoardRect & {
  id: string;
  axis: "horizontal" | "vertical";
  capacity: number;
  used: number;
};

export type BoardTrack = {
  id: string;
  index: number;
  position: number;
  size: number;
};

export type BoardGeometry = {
  width: number;
  height: number;
  padding: number;
  gutter: number;
  columns: BoardTrack[];
  rows: BoardTrack[];
  channels: RouteChannel[];
};

export type SolvedElement = {
  id: string;
  kind: string;
  bounds: BoardRect;
  visualBounds: BoardRect;
  label?: string;
  subtitle?: string;
  labelBounds?: BoardRect;
  parent?: string;
  layer: number;
  tone?: SemanticTone;
  variant?: string;
  description?: string;
  style?: VisualStyle;
  pins: SolvedPin[];
  props?: Record<string, VisualValue>;
};

export type ConnectorLabel = BoardRect & { text: string };

export type BoardConnector = {
  id: string;
  from: string;
  to: string;
  fromPin: string;
  toPin: string;
  points: BoardPoint[];
  label?: ConnectorLabel;
  variant?: "directional" | "bidirectional" | "async" | "data";
  tone?: SemanticTone;
  role?: ConnectorRole;
  feedback?: boolean;
  style?: VisualStyle;
  channelIds: string[];
};

export type CanvasPrimitive = {
  id: string;
  kind: "text" | "box" | "circle" | "line" | "path" | "image" | "icon" | "group";
  bounds: BoardRect;
  visualBounds: BoardRect;
  label?: string;
  description?: string;
  parent?: string;
  style?: VisualStyle;
  layer: number;
  clip?: string;
  mask?: string;
  transform?: { translateX: number; translateY: number; scaleX: number; scaleY: number; rotate: number };
  pins: SolvedPin[];
  props?: Record<string, VisualValue>;
};

export type SolvedCanvas = {
  id: string;
  owner: string;
  bounds: BoardRect;
  clip: boolean;
  bleed: number;
  primitives: CanvasPrimitive[];
};

export type MotionEnvelope = BoardRect & {
  id: string;
  owner: string;
  states: string[];
};

export type BoardScene = {
  type: "livery.board-scene";
  version: "0.1";
  id: string;
  title?: string;
  board: BoardGeometry;
  elements: SolvedElement[];
  connectors: BoardConnector[];
  canvases: SolvedCanvas[];
  envelopes: CollisionEnvelope[];
  timelineEnvelopes: MotionEnvelope[];
  readingOrder: string[];
};

export type LayoutViolationCode =
  | "layout.non_finite_geometry"
  | "layout.out_of_bounds"
  | "layout.component_collision"
  | "layout.text_overflow"
  | "layout.connector_hits_component"
  | "layout.non_orthogonal_route"
  | "layout.connector_label_collision"
  | "layout.connector_crossing"
  | "layout.connector_overlap"
  | "layout.connector_outside_channel"
  | "layout.channel_capacity"
  | "layout.invalid_pin_approach"
  | "layout.missing_solved_endpoint"
  | "layout.unsatisfied_align"
  | "layout.unsatisfied_distribute"
  | "layout.unsatisfied_inside"
  | "layout.unsatisfied_near"
  | "layout.motion_outside_envelope"
  | "layout.canvas_bleed"
  | "layout.duplicate_id"
  | "layout.excessive_aspect_ratio"
  | "layout.excessive_route_detour"
  | "layout.excessive_backtracking"
  | "layout.poor_rank_progression"
  | "layout.route_congestion"
  | "layout.poor_density"
  | "layout.broken_primary_continuity"
  | "layout.invalid_reading_order";

export type LayoutDiagnostic = Diagnostic & {
  code: LayoutViolationCode | "layout.no_valid_candidate" | "layout.resource_limit" | "layout.routing_exhausted";
  elementIds?: string[];
};

export type ValidationMetrics = {
  elementCount: number;
  connectorCount: number;
  crossingCount: number;
  overlappingSegmentCount: number;
  occupiedArea: number;
  occupancyRatio: number;
  routeLength: number;
  normalizedRouteLength: number;
  maximumNormalizedRouteLength: number;
  bendCount: number;
  aspectImbalance: number;
  whitespaceImbalance: number;
  topologyDeviation: number;
  backtrackingCount: number;
  rankErrorCount: number;
  congestionScore: number;
  densityPenalty: number;
  primaryContinuity: number;
};

export type ValidationReport = {
  valid: boolean;
  diagnostics: LayoutDiagnostic[];
  metrics: ValidationMetrics;
};

export type LayoutStrategy = "requested" | "expanded_tracks" | "alternate_spans" | "balanced_grid" | "flow_right" | "flow_down" | "vertical_reflow" | "increased_height";

export type LayoutAttempt = {
  strategy: LayoutStrategy;
  width: number;
  height: number;
  diagnostics: LayoutDiagnostic[];
  columns?: number;
  topologyDeviation?: number;
  metrics?: ValidationMetrics;
  selected?: boolean;
};

export type LayoutResult =
  | { ok: true; scene: BoardScene; report: ValidationReport; attempts: LayoutAttempt[] }
  | { ok: false; diagnostics: LayoutDiagnostic[]; attempts: LayoutAttempt[] };
