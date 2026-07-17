type NodeFixture = [id: string, constructor: string, label: string];
type EdgeFixture = [id: string, from: string, to: string, label: string, variant?: "async" | "data"];

export type VisualBenchmarkFixture = { id: string; category: string; source: string; nodes: string[]; connectors: string[] };

function fixture(id: string, category: string, title: string, nodes: NodeFixture[], edges: EdgeFixture[]): VisualBenchmarkFixture {
  const bindings = nodes.map(([nodeId, constructor, label]) => `  ${nodeId} = ${constructor}("${label}")`);
  const connectors = edges.map(([edgeId, from, to, label, variant], index) => `  ${edgeId} = connect(${from}.right, ${to}.left, label: "${label}"${variant ? `, variant: ${variant}` : ""}, role: ${index === 0 ? "primary" : "secondary"})`);
  return {
    id,
    category,
    source: [`figure ${id.replaceAll("-", "_")}("${title}") {`, ...bindings, ...connectors, `  flow(${nodes.map(([nodeId]) => nodeId).join(", ")}, direction: auto, gap: $space.lg, rankGap: $space.xl)`, "}"].join("\n"),
    nodes: nodes.map(([nodeId]) => nodeId),
    connectors: edges.map(([edgeId]) => edgeId),
  };
}

export const visualBenchmarkFixtures: VisualBenchmarkFixture[] = [
  fixture("checkout", "architecture", "Checkout", [["browser", "browser", "Browser"], ["api", "api", "Checkout API"], ["queue", "queue", "Order queue"], ["worker", "worker", "Worker"]], [["call", "browser", "api", "checkout"], ["publish", "api", "queue", "publish", "async"], ["consume", "queue", "worker", "consume", "async"]]),
  fixture("agent-trace", "agent", "Agent trace", [["user", "person", "Researcher"], ["agent", "agent", "Research agent"], ["search", "tool", "Web search"], ["answer", "document", "Cited answer"]], [["ask", "user", "agent", "question"], ["query", "agent", "search", "search"], ["write", "search", "answer", "evidence", "data"]]),
  fixture("data-pipeline", "workflow", "Data pipeline", [["events", "stream", "Raw events"], ["validate", "service", "Validate"], ["warehouse", "warehouse", "Warehouse"], ["dashboard", "lineChart", "Dashboard"]], [["ingest", "events", "validate", "ingest"], ["store", "validate", "warehouse", "store", "data"], ["read", "warehouse", "dashboard", "read", "data"]]),
  fixture("cloud-network", "architecture", "Cloud network", [["edge", "server", "Public edge"], ["service", "service", "Application"], ["database", "database", "Database"]], [["forward", "edge", "service", "forward"], ["query", "service", "database", "query", "data"]]),
  fixture("order-state", "state-machine", "Order state", [["draft", "badge", "Draft"], ["authorized", "badge", "Authorized"], ["fulfilled", "badge", "Fulfilled"]], [["authorize", "draft", "authorized", "authorize"], ["fulfill", "authorized", "fulfilled", "fulfill"]]),
  fixture("ops-dashboard", "dashboard", "Operations", [["traffic", "barChart", "Traffic"], ["latency", "lineChart", "Latency"], ["status", "progress", "Deployment"]], [["observe", "traffic", "latency", "observe"], ["report", "latency", "status", "report", "data"]]),
  fixture("oauth-sequence", "sequence", "OAuth exchange", [["browser", "browser", "Browser"], ["identity", "service", "Identity provider"], ["api", "api", "Protected API"]], [["authorize", "browser", "identity", "authorize"], ["token", "identity", "api", "token"]]),
  fixture("cache-read", "workflow", "Cache read", [["client", "browser", "Client"], ["cache", "cache", "Cache"], ["origin", "database", "Origin"]], [["lookup", "client", "cache", "lookup"], ["miss", "cache", "origin", "miss", "data"]]),
  fixture("incident-response", "infographic", "Incident response", [["detect", "service", "Detect"], ["mitigate", "team", "Mitigate"], ["learn", "document", "Learn"]], [["triage", "detect", "mitigate", "triage"], ["review", "mitigate", "learn", "review"]]),
  fixture("event-sourcing", "architecture", "Event sourcing", [["command", "api", "Command"], ["aggregate", "service", "Aggregate"], ["store", "database", "Event store"], ["projection", "worker", "Projection"]], [["handle", "command", "aggregate", "handle"], ["append", "aggregate", "store", "append", "data"], ["project", "store", "projection", "project", "async"]]),
  fixture("rag-pipeline", "agent", "RAG pipeline", [["document", "document", "Documents"], ["embed", "model", "Embeddings"], ["search", "tool", "Vector search"], ["answer", "agent", "Answer"]], [["index", "document", "embed", "index"], ["retrieve", "embed", "search", "retrieve", "data"], ["ground", "search", "answer", "ground"]]),
  fixture("ci-pipeline", "workflow", "CI pipeline", [["commit", "code", "Commit"], ["tests", "service", "Tests"], ["deploy", "server", "Production"]], [["build", "commit", "tests", "build"], ["release", "tests", "deploy", "release"]]),
  fixture("payment-comparison", "comparison", "Payments", [["checkout", "api", "Checkout"], ["fraud", "service", "Fraud check"], ["settlement", "database", "Settlement"]], [["screen", "checkout", "fraud", "screen"], ["settle", "fraud", "settlement", "settle", "data"]]),
  fixture("retry-timeline", "timeline", "Retries", [["request", "api", "Request"], ["breaker", "service", "Circuit breaker"], ["recovery", "badge", "Recovery"]], [["retry", "request", "breaker", "retry"], ["recover", "breaker", "recovery", "recover"]]),
  fixture("database-replication", "architecture", "Replication", [["primary", "database", "Primary"], ["replica", "database", "Read replica"], ["backup", "objectStore", "Backups"]], [["replicate", "primary", "replica", "replicate", "data"], ["archive", "replica", "backup", "archive", "data"]]),
  fixture("feature-flags", "state-machine", "Feature rollout", [["internal", "badge", "Internal"], ["canary", "badge", "Canary"], ["general", "badge", "General availability"]], [["expose", "internal", "canary", "expose"], ["promote", "canary", "general", "promote"]]),
  fixture("etl-quality", "dashboard", "Data quality", [["sources", "table", "Sources"], ["quality", "barChart", "Quality"], ["lineage", "document", "Lineage"]], [["measure", "sources", "quality", "measure", "data"], ["trace", "quality", "lineage", "trace", "data"]]),
  fixture("webhook-delivery", "sequence", "Webhooks", [["sender", "service", "Sender"], ["receiver", "api", "Receiver"], ["worker", "worker", "Processor"]], [["deliver", "sender", "receiver", "deliver"], ["enqueue", "receiver", "worker", "enqueue", "async"]]),
  fixture("model-routing", "agent", "Model routing", [["gateway", "api", "AI gateway"], ["router", "agent", "Router"], ["model", "model", "Selected model"]], [["classify", "gateway", "router", "classify"], ["dispatch", "router", "model", "dispatch"]]),
  fixture("platform-map", "infographic", "Platform map", [["developer", "service", "Developer experience"], ["runtime", "server", "Runtime"], ["observability", "lineChart", "Observability"]], [["ship", "developer", "runtime", "ship"], ["observe", "runtime", "observability", "observe", "data"]]),
];
