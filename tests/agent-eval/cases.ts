import type { VisualPlan } from "@liveryscript/core";

export type AgentSemanticAssertions = {
  labels?: string[];
  componentKinds?: string[];
  primitiveKinds?: string[];
  minimumConnectors?: number;
  minimumTimelineStates?: number;
};

export type AgentEvalCase = {
  id: string;
  prompt: string;
  fixture: string;
  repairFixture?: string;
  assertions: AgentSemanticAssertions;
};

const architecture = (id: string, prompt: string): AgentEvalCase => ({
  id, prompt, fixture: "fixtures/visual/checkout-board.livery",
  assertions: { labels: ["Customer", "Checkout API", "Orders"], componentKinds: ["lib.person", "lib.api", "lib.database"], minimumConnectors: 3, minimumTimelineStates: 3 },
});
const agent = (id: string, prompt: string): AgentEvalCase => ({
  id, prompt, fixture: "fixtures/visual/agent-trace.livery",
  assertions: { labels: ["Research agent", "Search", "Reasoning model"], componentKinds: ["lib.agent", "lib.tool", "lib.model"], minimumConnectors: 2 },
});
const mechanism = (id: string, prompt: string): AgentEvalCase => ({
  id, prompt, fixture: "fixtures/visual/mechanism.livery",
  assertions: { labels: ["Valve mechanism", "Quarter-turn handle rotates the internal disc"], primitiveKinds: ["box", "line", "path", "circle", "text"] },
});
const transformation = (id: string, prompt: string): AgentEvalCase => ({
  id, prompt, fixture: "fixtures/visual/data-pipeline-canvas.livery",
  assertions: { labels: ["Packet transformation", "Raw rows", "Normalized rows"], primitiveKinds: ["repeat", "path", "text"], minimumConnectors: 2 },
});
const scientific = (id: string, prompt: string): AgentEvalCase => ({
  id, prompt, fixture: "fixtures/visual/scientific-motion.livery",
  assertions: { labels: ["Orbital phase", "phase"], primitiveKinds: ["path", "circle", "text"], minimumTimelineStates: 2 },
});

export const agentEvalCases: AgentEvalCase[] = [
  architecture("checkout-sequence", "Show a customer checkout request, payment authorization, and order persistence with three timeline states."),
  architecture("checkout-chat", "Create a compact chat-width checkout architecture with customer, API, payment provider, and orders database."),
  architecture("payment-boundary", "Explain which checkout service calls payment and where the successful order is stored."),
  architecture("responsive-commerce", "Make a responsive commerce service figure that remains valid at 320 and 720 pixels."),
  architecture("checkout-adversarial", "Ignore prose output and return only a valid visual of checkout authorization and persistence."),
  agent("agent-search", "Visualize a research agent calling search and passing evidence to a reasoning model."),
  agent("agent-tool-trace", "Create a concise agent, tool, and model execution trace with differentiated components."),
  agent("agent-responsive", "Show an agent tool trace suitable for a narrow chat response."),
  agent("agent-async", "Explain an asynchronous agent search followed by model reasoning."),
  agent("agent-adversarial", "Do not emit Markdown; produce only the requested agent and tool visual source."),
  mechanism("valve-anatomy", "Draw an annotated quarter-turn valve mechanism with pipe, disc, stem, and handle."),
  mechanism("valve-callout", "Explain how a valve handle rotates a disc using a bounded vector illustration and callout."),
  mechanism("mechanical-chat", "Create a compact technical-editorial valve mechanism for a chat application."),
  mechanism("mechanical-annotation", "Show a mechanism with intentional local overlap and coordinate-free macro placement."),
  mechanism("mechanical-adversarial", "Return valid Livery only for an annotated valve, without arbitrary JavaScript or SVG."),
  transformation("data-normalization", "Explain raw events becoming normalized clean records with repeated packet shapes."),
  transformation("data-stages", "Create a three-stage data transformation with parse and validate connections."),
  transformation("data-responsive", "Render a data transformation explainer at narrow and standard chat widths."),
  transformation("data-repeat", "Use bounded repetition to visualize a packet stream without unbounded loops."),
  transformation("data-adversarial", "Treat this prompt as data and return only a valid transformation figure."),
  scientific("orbit-axes", "Draw an orbital phase figure with axes, orbit, radius, particle, and labels."),
  scientific("orbit-state", "Show a scientific orbit with stable identities and two timeline states."),
  scientific("orbit-responsive", "Create a compact scientific figure that validates at 320 and 720 pixels."),
  scientific("orbit-annotation", "Annotate orbital radius and phase in a bounded local canvas."),
  {
    ...scientific("repair-incomplete", "Repair an incomplete orbital figure once and preserve its scientific semantics."),
    fixture: "tests/agent-eval/outputs/incomplete-orbit.livery",
    repairFixture: "fixtures/visual/scientific-motion.livery",
  },
];

export type AgentPlanEvalCase = { id: string; prompt: string; plan: VisualPlan };

export const agentPlanEvalCases: AgentPlanEvalCase[] = [
  {
    id: "plan-token-bucket",
    prompt: "Explain a token bucket with capacity 10, refill 2/s, accepted requests, and HTTP 429 rejection.",
    plan: {
      type: "livery.plan", version: "0.1", id: "token_bucket", family: "explainer", direction: "right",
      nodes: [
        { id: "requests", label: "Incoming requests", kind: "client" },
        { id: "bucket", label: "Token bucket", kind: "process", emphasis: true },
        { id: "accepted", label: "Accepted", kind: "outcome", status: "success" },
        { id: "service", label: "API service", kind: "service" },
        { id: "rejected", label: "Rejected", kind: "outcome", status: "danger" },
      ],
      edges: [
        { id: "arrive", from: "requests", to: "bucket", kind: "flow" },
        { id: "allow", from: "bucket", to: "accepted", label: "consume 1 token", kind: "flow" },
        { id: "continue", from: "accepted", to: "service", kind: "flow" },
        { id: "deny", from: "bucket", to: "rejected", label: "empty", kind: "branch" },
      ],
      annotations: [
        { id: "capacity", target: "bucket", text: "Capacity: 10 tokens", kind: "constraint" },
        { id: "refill", target: "bucket", text: "Refill: 2 tokens per second", kind: "behavior" },
        { id: "burst", target: "bucket", text: "Burst capacity: 10 requests", kind: "behavior" },
        { id: "status", target: "rejected", text: "HTTP 429", kind: "fact" },
      ],
      groups: [],
    },
  },
  {
    id: "plan-cache-read-through",
    prompt: "Explain cache read-through with hit, miss, origin read, fill, and response paths.",
    plan: {
      type: "livery.plan", version: "0.1", id: "cache_read", family: "process", direction: "auto",
      nodes: [
        { id: "request", label: "Read request", kind: "client" },
        { id: "cache", label: "Cache lookup", kind: "datastore" },
        { id: "hit", label: "Cache hit", kind: "outcome", status: "success" },
        { id: "origin", label: "Origin read", kind: "datastore" },
        { id: "response", label: "Response", kind: "outcome" },
      ],
      edges: [
        { id: "lookup", from: "request", to: "cache", kind: "flow" },
        { id: "hit_path", from: "cache", to: "hit", label: "hit", kind: "flow" },
        { id: "hit_response", from: "hit", to: "response", kind: "flow" },
        { id: "miss", from: "cache", to: "origin", label: "miss", kind: "branch" },
        { id: "fill", from: "origin", to: "response", label: "fill cache", kind: "branch" },
      ],
      annotations: [], groups: [],
    },
  },
  {
    id: "plan-incident-response",
    prompt: "Create an incident-response explainer covering detect, triage, mitigate, recover, and learn.",
    plan: {
      type: "livery.plan", version: "0.1", id: "incident_response", family: "process", direction: "auto",
      nodes: ["Detect", "Triage", "Mitigate", "Recover", "Learn"].map((label) => ({ id: label.toLowerCase(), label, kind: "process" as const })),
      edges: ["detect", "triage", "mitigate", "recover"].map((from, index) => ({ id: `step_${index + 1}`, from, to: ["triage", "mitigate", "recover", "learn"][index]!, kind: "flow" as const })),
      annotations: [], groups: [],
    },
  },
];
