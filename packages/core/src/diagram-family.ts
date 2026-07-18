export type DiagramKernel =
  | "ranked-graph"
  | "interaction-lanes"
  | "temporal-schedule"
  | "hierarchy-tree"
  | "quantitative-plot"
  | "spatial-editorial";

export type DiagramFamilyStatus = "supported" | "foundation" | "planned";

export type DiagramFamilyContract = {
  id: string;
  title: string;
  kernel: DiagramKernel;
  status: DiagramFamilyStatus;
  description: string;
  capabilities: readonly string[];
  agentCues: readonly string[];
  limits: Readonly<Record<string, number>>;
};

const family = (
  id: string,
  title: string,
  kernel: DiagramKernel,
  status: DiagramFamilyStatus,
  description: string,
  capabilities: readonly string[],
  agentCues: readonly string[],
  limits: Readonly<Record<string, number>> = {},
): DiagramFamilyContract => ({ id, title, kernel, status, description, capabilities, agentCues, limits });

const contracts: readonly DiagramFamilyContract[] = [
  family("flowchart", "Flow", "ranked-graph", "supported", "Processes, decisions, branches, and connected systems.", ["ranked nodes", "compound frames", "orthogonal routes"], ["workflow", "process", "architecture"], { nodes: 96, connectors: 192 }),
  family("swimlane", "Swimlanes", "temporal-schedule", "planned", "Cross-lane responsibility and handoff flows.", ["lanes", "handoffs", "stages"], ["swimlane", "handoff", "responsibility"]),
  family("sequence", "Interaction narrative", "interaction-lanes", "foundation", "Ordered messages between stable participants.", ["participants", "messages", "fragments", "activations"], ["sequence", "request response", "interaction"]),
  family("class-model", "Class model", "ranked-graph", "foundation", "Types, members, inheritance, composition, and dependencies.", ["class members", "inheritance", "composition"], ["class diagram", "type model", "inheritance"]),
  family("state-model", "State model", "ranked-graph", "foundation", "States, transitions, choices, forks, and compound behavior.", ["states", "transitions", "choices", "compound states"], ["state machine", "lifecycle", "transition"]),
  family("entity-model", "Entity model", "ranked-graph", "foundation", "Entities, keys, attributes, and cardinal relationships.", ["entities", "attributes", "cardinality"], ["entity relationship", "database schema", "cardinality"]),
  family("journey", "Journey", "temporal-schedule", "planned", "Experience stages, actors, sentiment, and touchpoints.", ["stages", "actors", "scores"], ["user journey", "experience map", "touchpoint"]),
  family("schedule", "Schedule", "temporal-schedule", "planned", "Tasks, milestones, dates, durations, and dependencies.", ["tasks", "milestones", "dependencies"], ["gantt", "schedule", "project plan"]),
  family("proportion", "Proportion", "quantitative-plot", "planned", "Part-to-whole quantitative comparisons.", ["slices", "labels", "legend"], ["pie chart", "share", "proportion"]),
  family("quadrant", "Quadrant", "quantitative-plot", "planned", "Points classified across two quantitative dimensions.", ["axes", "quadrants", "points"], ["quadrant", "matrix", "positioning"]),
  family("requirement-model", "Requirement model", "ranked-graph", "foundation", "Requirements, risks, verification, evidence, and traceability.", ["requirements", "verification", "traceability"], ["requirements", "sysml", "verification"]),
  family("revision-graph", "Revision graph", "temporal-schedule", "planned", "Commits, branches, merges, tags, and releases.", ["commits", "branches", "merges"], ["git graph", "branch history", "release history"]),
  family("system-context", "System context", "ranked-graph", "supported", "People, systems, containers, components, and boundaries.", ["nested boundaries", "typed relationships", "system levels"], ["c4", "system context", "container diagram"]),
  family("mindmap", "Mindmap", "hierarchy-tree", "foundation", "Radial or directional idea hierarchies.", ["branches", "depth styling", "compact leaves"], ["mindmap", "brainstorm", "ideas"]),
  family("chronology", "Chronology", "temporal-schedule", "planned", "Events and periods arranged through time.", ["events", "periods", "eras"], ["timeline", "history", "chronology"]),
  family("structured-interaction", "Structured interaction", "interaction-lanes", "planned", "Nested calls and control structures in an interaction narrative.", ["nested calls", "control fragments", "returns"], ["structured sequence", "nested call", "protocol"]),
  family("weighted-flow", "Weighted flow", "quantitative-plot", "planned", "Weighted quantities moving between stages.", ["weighted links", "stages", "flow totals"], ["sankey", "weighted flow", "allocation"]),
  family("xy-plot", "XY plot", "quantitative-plot", "planned", "Bar, line, and area series on measured axes.", ["axes", "series", "scales"], ["bar chart", "line chart", "area chart"]),
  family("block-system", "Block system", "ranked-graph", "supported", "Authored block composition with explicit grouping.", ["blocks", "groups", "connectors"], ["block diagram", "system blocks", "module map"]),
  family("packet", "Packet", "spatial-editorial", "planned", "Measured bit fields, offsets, and grouped headers.", ["bit fields", "offsets", "field widths"], ["packet", "protocol header", "memory layout"]),
  family("kanban", "Kanban", "temporal-schedule", "planned", "Work cards organized into bounded status lanes.", ["lanes", "cards", "limits"], ["kanban", "work board", "status lanes"]),
  family("architecture", "Architecture", "ranked-graph", "supported", "Services, resources, groups, and data movement.", ["services", "resources", "groups"], ["architecture", "cloud system", "deployment"]),
  family("radar", "Radar", "quantitative-plot", "planned", "Multivariate series compared on radial axes.", ["dimensions", "series", "radial scale"], ["radar chart", "capability profile", "scorecard"]),
  family("event-model", "Event model", "temporal-schedule", "planned", "Commands, events, read models, and UI across timeframes.", ["timeframes", "commands", "events", "read models"], ["event modeling", "event sourced", "timeframes"]),
  family("treemap", "Treemap", "quantitative-plot", "planned", "Hierarchical values represented by nested area.", ["hierarchical values", "area encoding", "labels"], ["treemap", "portfolio", "hierarchical share"]),
  family("venn", "Set relationships", "spatial-editorial", "planned", "Bounded set membership and intersections.", ["sets", "intersections", "labels"], ["venn", "set overlap", "intersection"]),
  family("cause-map", "Cause map", "spatial-editorial", "planned", "Cause-and-effect branches organized around a central spine.", ["effect spine", "cause branches", "subcauses"], ["ishikawa", "fishbone", "root cause"]),
  family("evolution-map", "Evolution map", "spatial-editorial", "planned", "Value chains positioned by visibility and evolution.", ["value chain", "evolution", "inertia"], ["wardley", "strategy map", "evolution"]),
  family("sensemaking", "Sensemaking domains", "spatial-editorial", "planned", "Items placed in named decision and uncertainty domains.", ["domains", "boundaries", "items"], ["cynefin", "sensemaking", "decision context"]),
  family("tree-view", "Tree view", "hierarchy-tree", "supported", "Deterministic hierarchy, taxonomy, and reporting structures.", ["parents", "children", "bundled trunks"], ["tree", "taxonomy", "hierarchy"]),
];

export function getDiagramFamilyCatalog(): readonly DiagramFamilyContract[] {
  return contracts.map((contract) => ({
    ...contract,
    capabilities: [...contract.capabilities],
    agentCues: [...contract.agentCues],
    limits: { ...contract.limits },
  }));
}

