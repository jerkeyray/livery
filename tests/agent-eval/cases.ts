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
