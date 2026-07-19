import { describe, expect, it } from "vitest";
import { solvePinboard } from "./pinboard.js";
import { compileVisual } from "./program.js";
import { canonicalTheme } from "./theme.js";
import type { VisualDocument } from "./visual.js";

it("solves a deterministic compound hierarchy with shared reporting bundles", () => {
  const source = `figure governance("University governance") {
    board = card("Board of Trustees")
    president = card("President")
    academic = frame("Academic Affairs", layout: column) { provost = card("Provost") schools = list("Schools", items: ["Science", "Arts", "Business"]) }
    operations = frame("Operations", layout: column) { finance = card("Finance") facilities = card("Facilities") }
    appoint = connect(board.bottom, president.top, role: primary)
    academic_report = connect(president.bottom, academic.top, role: primary)
    operations_report = connect(president.bottom, operations.top, role: primary)
    hierarchy(board, president, academic, operations, direction: down, gap: lg, rankGap: xl)
  }`;
  const document = compileVisual(source).document!;
  const first = solvePinboard(document, { width: 900 });
  const second = solvePinboard(document, { width: 900 });
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);
  if (!first.ok || !second.ok) return;
  expect(first.scene).toEqual(second.scene);
  expect(first.scene.connectors.filter(({ bundleId }) => bundleId === "hierarchy.president")).toHaveLength(2);
  expect(first.report.metrics.crossingCount).toBe(0);
});

const document: VisualDocument = {
  type: "livery.visual",
  version: "0.2",
  id: "checkout",
  title: "Checkout",
  root: {
    id: "root",
    kind: "group",
    layout: { kind: "row", gap: 32 },
    children: [
      { id: "customer", kind: "lib.person", label: "Customer" },
      { id: "api", kind: "lib.service", label: "Checkout API" },
      { id: "payment", kind: "lib.service", label: "Payment provider" },
      { id: "orders", kind: "lib.database", label: "Orders" },
    ],
  },
  connectors: [
    { id: "submit", from: { node: "customer", anchor: "right" }, to: { node: "api", anchor: "left" }, label: "submit order" },
    { id: "authorize", from: { node: "api", anchor: "right" }, to: { node: "payment", anchor: "left" }, label: "authorize" },
    { id: "persist", from: { node: "api", anchor: "right" }, to: { node: "orders", anchor: "left" }, label: "persist" },
  ],
  constraints: [],
  timelines: [],
};

const complexRoutingSource = `component DescentMap() {
  return canvas(width: 260, height: 220) {}
}
component TelemetryPanel() {
  return canvas(width: 260, height: 138) {}
}
figure lunar_autonomy("Autonomous lunar landing") {
  descent = DescentMap()
  flight = agent("Flight director")
  guidance = model("Guidance model")
  telemetry = TelemetryPanel()
  thrusters = tool("Thruster controller")
  archive = database("Mission archive")
  alert = callout("Touchdown confirmed inside the certified landing ellipse")
  acquire = descent.right -> flight.left("optical navigation", variant: data)
  infer = flight.right -> guidance.left("state vector", variant: async)
  stream = telemetry.right -> guidance.bottom("sensor fusion", variant: data)
  command = guidance.right -> thrusters.left("burn profile")
  persist = guidance.bottom -> archive.top("persist telemetry", variant: data)
  confirm = thrusters.bottom -> alert.top("touchdown", variant: async)
  grid(descent, flight, guidance, telemetry, thrusters, archive, alert, columns: 3, gap: xl, align: center, distribute: between)
}`;

describe("solvePinboard", () => {
  it.each([360, 900])("solves native interaction lanes with ordered message rows at %ipx", (width) => {
    const compiled = compileVisual(`figure request("Request interaction") {
      client = participant("Client")
      api = participant("API")
      store = participant("Store")
      request = connect(client.right, api.left, label: "request", semantic: message, messageKind: sync, order: 0)
      read = connect(api.right, store.left, label: "read", semantic: message, messageKind: sync, order: 1)
      result = connect(store.left, api.right, label: "result", semantic: message, messageKind: return, order: 2)
      response = connect(api.left, client.right, label: "response", semantic: message, messageKind: return, order: 3)
      interaction(client, api, store, gap: lg)
    }`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    expect(result.scene.canvases.find(({ id }) => id === "root.interaction-lanes")?.primitives).toHaveLength(3);
    expect(result.scene.connectors.map(({ order }) => order)).toEqual([0, 1, 2, 3]);
    const messageRows = result.scene.connectors.map(({ points }) => points[0]!.y);
    expect(messageRows).toEqual([...messageRows].sort((a, b) => a - b));
    expect(result.scene.connectors.filter(({ messageKind }) => messageKind === "return").every(({ variant }) => variant === "async")).toBe(true);
  });

  it.each([[360, "down"], [900, "right"]] as const)("solves native compound flow at %ipx in the expected direction", (width, direction) => {
    const compiled = compileVisual(`figure checkout("Checkout") {
      client = frame("Client", layout: column) { browser = browser("Browser") }
      commerce = frame("Commerce", layout: column) { api = api("Checkout API") stripe = service("Stripe") }
      async = frame("Async", layout: column) { queue = queue("Queue") worker = worker("Worker") }
      call = connect(client.browser.right, commerce.api.left, label: "checkout", role: primary)
      publish = connect(commerce.api.right, async.queue.left, label: "order", variant: async, role: primary)
      flow(client, commerce, async, direction: auto, gap: lg, rankGap: xl)
    }`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    const frames = ["client", "commerce", "async"].map((id) => result.scene.elements.find((element) => element.id === id)!.bounds);
    const coordinates = frames.map((bounds) => direction === "right" ? bounds.x : bounds.y);
    expect(coordinates).toEqual([...coordinates].sort((a, b) => a - b));
    expect(result.scene.connectors.every(({ role }) => role === "primary")).toBe(true);
    expect(result.report.metrics.crossingCount).toBe(0);
  });

  it("keeps a cyclic native flow on local channels", () => {
    const compiled = compileVisual(`figure cycle {
      a = service("A")
      b = service("B")
      c = service("C")
      ab = connect(a.right, b.left, label: "ab")
      bc = connect(b.right, c.left, label: "bc")
      ca = connect(c.right, a.left, label: "feedback", role: secondary)
      flow(a, b, c, direction: right, gap: lg, rankGap: xl)
    }`);
    const result = solvePinboard(compiled.document!, { width: 900 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    const feedback = result.scene.connectors.find(({ id }) => id === "ca");
    expect(feedback?.feedback).toBe(true);
    expect(feedback?.channelIds.some((id) => id.startsWith("channel.outer."))).toBe(false);
  });

  it.each([320, 480, 720, 1024])("returns only validated scenes at %ipx", (width) => {
    const result = solvePinboard(document, { width });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    expect(result.report.valid).toBe(true);
    expect(result.scene.board.width).toBe(width);
    expect(result.report.metrics.occupancyRatio).toBeGreaterThan(0);
    expect(result.report.metrics.normalizedRouteLength).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(result.report.metrics.whitespaceImbalance)).toBe(true);
    expect(result.scene.elements.map(({ id }) => id)).toEqual(["root", "customer", "api", "payment", "orders"]);
    for (const connector of result.scene.connectors) {
      connector.points.slice(1).forEach((point, index) => {
        const previous = connector.points[index]!;
        expect(point.x === previous.x || point.y === previous.y).toBe(true);
      });
    }
  });

  it("returns a typed failure when the resource limit is exceeded", () => {
    const result = solvePinboard(document, { maxElements: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("layout.resource_limit");
  });

  it("enforces native flow child limits independently of the board limit", () => {
    const oversized: VisualDocument = {
      ...document,
      root: { id: "root", kind: "group", layout: { kind: "flow" }, children: Array.from({ length: 65 }, (_, index) => ({ id: `n${index}`, kind: "lib.service" as const, label: `Node ${index}` })) },
      connectors: [],
    };
    const result = solvePinboard(oversized, { maxElements: 100 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]).toMatchObject({ code: "layout.resource_limit", elementIds: ["root"] });
  });

  it.each([
    [320, 1, 1120],
    [480, 1, 1120],
    [720, 2, 900],
    [1024, 3, 700],
  ] as const)("preserves the largest fitting ordered grid at %ipx", (width, expectedColumns, maximumHeight) => {
    const compiled = compileVisual(complexRoutingSource);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ code }) => code).join(", ")).toBe(true);
    if (!result.ok) return;
    const children = result.scene.elements.filter(({ parent }) => parent === "root");
    expect(
      new Set(
        children.map(({ bounds }) =>
          Math.round((bounds.x + bounds.width / 2) * 100) / 100,
        ),
      ).size,
    ).toBe(expectedColumns);
    expect(children.map(({ id }) => id)).toEqual(["descent", "flight", "guidance", "telemetry", "thrusters", "archive", "alert"]);
    expect(result.scene.board.height).toBeLessThan(maximumHeight);
    expect(result.report.metrics.crossingCount).toBe(0);
    expect(result.report.metrics.overlappingSegmentCount).toBe(0);
    expect(result.report.metrics.maximumNormalizedRouteLength).toBeLessThan(4);
    expect(result.attempts.filter(({ selected }) => selected)).toHaveLength(1);
  });

  it("routes independently of connector declaration order", () => {
    const compiled = compileVisual(complexRoutingSource);
    expect(compiled.diagnostics).toEqual([]);
    const forward = solvePinboard(compiled.document!, { width: 1024 });
    const reversed = solvePinboard({ ...compiled.document!, connectors: [...compiled.document!.connectors].reverse() }, { width: 1024 });
    expect(forward.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    if (!forward.ok || !reversed.ok) return;
    const routeGeometry = (scene: typeof forward.scene) => Object.fromEntries(scene.connectors.map(({ id, points, label }) => [id, { points, label }]));
    expect(routeGeometry(reversed.scene)).toEqual(routeGeometry(forward.scene));
  });

  it("fails instead of truncating an oversized canvas repeat", () => {
    const oversized: VisualDocument = {
      ...document,
      root: { id: "root", kind: "canvas", layout: { kind: "canvas", width: 240, height: 120 }, children: [{ id: "dots", kind: "repeat", props: { count: 129, kind: "circle" } }] },
      connectors: [],
    };
    const result = solvePinboard(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe("layout.resource_limit");
  });

  it("fails when several legal repeats exceed the total canvas budget", () => {
    const oversized: VisualDocument = {
      ...document,
      root: { id: "root", kind: "canvas", layout: { kind: "canvas", width: 240, height: 120 }, children: Array.from({ length: 5 }, (_, index) => ({ id: `dots_${index}`, kind: "repeat" as const, props: { count: 110, kind: "circle" } })) },
      connectors: [],
    };
    const result = solvePinboard(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.message).toContain("expanded primitives");
  });

  it("solves a bounded canvas and expands repeat deterministically", () => {
    const compiled = compileVisual(`
      component Orbit() {
        dots = repeat(count: 4, kind: circle, x: 20, y: 40, width: 12, height: 12, stepX: 30)
        axis = line(x: 12, y: 46, width: 120, height: 2)
        return canvas(width: 180, height: 100, bleed: 4) {
          axis
          dots
        }
      }

      figure orbit("Orbit") {
        plot = Orbit()
        row(plot)
      }
    `);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.canvases).toHaveLength(1);
    expect(result.scene.canvases[0]?.primitives.map(({ id }) => id)).toEqual(["plot.axis", "plot.dots.0", "plot.dots.1", "plot.dots.2", "plot.dots.3"]);
    expect(result.scene.canvases[0]?.bleed).toBe(4);
  });

  it("rejects a timeline whose motion envelope collides with a neighbor", () => {
    const moving: VisualDocument = {
      ...document,
      timelines: [{
        id: "move",
        states: [{ id: "shift", operations: [{ action: "set", targets: ["customer"], properties: { translateX: 180 } }] }],
        transitions: [],
      }],
    };
    const result = solvePinboard(moving, { width: 1024, maxCandidates: 1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain("layout.component_collision");
  });

  it("rejects scaled timeline motion that exceeds a canvas bleed envelope", () => {
    const compiled = compileVisual(`component Art() {
 dot = circle(x: 70, y: 40, width: 20, height: 20)
 return canvas(width: 100, height: 100) {
  dot
 }
}
figure motion {
 art = Art()
 row(art)
 timeline states {
  state enlarged {
   set(art.dot, scale: 8, rotate: 20)
  }
 }
}`);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain("layout.canvas_bleed");
  });

  it("measures labels with resolved typography tokens", () => {
    const compiled = compileVisual(`figure typography {
 service = service("A very long service label")
 row(service)
}`);
    const theme = {
      ...canonicalTheme,
      tokens: { ...canonicalTheme.tokens, type: { ...canonicalTheme.tokens.type, body: 40 } },
    };
    const result = solvePinboard(compiled.document!, { width: 320, theme });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const service = result.scene.elements.find(({ id }) => id === "service")!;
    expect(service.labelBounds!.height).toBeLessThanOrEqual(service.bounds.height);
    expect(service.labelBounds!.height).toBeGreaterThan(100);
  });

  it("routes from a component boundary without treating its children as obstacles", () => {
    const compiled = compileVisual(`
      component Pair() {
        left = person("Customer")
        right = service("API")
        return row(gap: md) {
          left
          right
        }
      }
      figure nested("Nested") {
        pair = Pair()
        payment = service("Payment")
        edge = pair.right -> payment.left("authorize")
        row(pair, payment, gap: lg)
      }
    `);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
  });

  it("routes through internal channels when compact reflow blocks midpoint doglegs", () => {
    const compiled = compileVisual(`figure channels {
 a = service("A")
 b = service("B")
 c = service("C")
 d = service("D")
 e = service("E")
 f = service("F")
 first = b.right -> c.left("first")
 second = c.right -> e.left("second")
 grid(a, b, c, d, e, f, columns: 3, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 480, maxCandidates: 3 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    expect(result.attempts.at(-1)?.strategy).toBe("alternate_spans");
    expect(result.scene.connectors.every(({ channelIds }) => channelIds.length > 0)).toBe(true);
  });

  it("preserves explicitly authored connector pins when their axis remains meaningful", () => {
    const compiled = compileVisual(`figure pinned {
 first = service("First")
 source = service("Ground station")
 target = service("Telemetry buffer")
 last = service("Last")
 edge = source.bottom -> target.top("decode")
 column(first, source, target, last, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors[0]).toMatchObject({ fromPin: "source.bottom", toPin: "target.top" });
  });

  it("corrects authored pins that face away from the solved relationship", () => {
    const compiled = compileVisual(`figure corrected_pins {
 source = service("Source")
 target = service("Target")
 edge = source.left -> target.right("dispatch")
 row(source, target, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 560 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors[0]).toMatchObject({ fromPin: "source.right", toPin: "target.left" });
  });

  it("keeps nested-grid measurement consistent with compact placement", () => {
    const compiled = compileVisual(`figure nested_grid {
 left = frame("Left", layout: grid, columns: 2, padding: sm) {
  a = service("A")
  b = service("B")
  c = service("C")
 }
 right = frame("Right", layout: grid, columns: 2, padding: sm) {
  d = service("D")
  e = service("E")
  f = service("F")
 }
 grid(left, right, columns: 2, gap: sm)
}`);
    const result = solvePinboard(compiled.document!, { width: 480 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    expect(result.report.diagnostics.map(({ code }) => code)).not.toContain("layout.component_collision");
  });

  it("routes a dense two-by-two checkout architecture without dropping reverse telemetry", () => {
    const compiled = compileVisual(`figure resilient_checkout("Resilient checkout") {
 ingress = frame("Ingress", layout: grid, columns: 2, gap: xs, padding: sm) {
  customer = person("Customer", variant: muted)
  gateway = service("Edge Gateway", variant: muted)
  auth = service("Auth Service", variant: muted)
 }
 transaction = frame("Transaction", layout: grid, columns: 2, gap: xs, padding: sm) {
  checkout = api("Checkout API", subtitle: "Creates order", variant: soft, tone: info)
  payment = service("Payment Service", subtitle: "Authorizes funds", variant: muted)
  orders = database("Orders DB", variant: muted)
 }
 operations = frame("Operations", layout: row, gap: xs, padding: sm) {
  alerts = service("Alert Manager", variant: soft, tone: warning)
  telemetry = list("Telemetry", items: ["Logs", "Metrics", "Traces"], variant: muted)
 }
 fulfillment = frame("Fulfillment", layout: grid, columns: 2, gap: xs, padding: sm) {
  events = queue("Event Bus", variant: soft, tone: info)
  inventory = worker("Inventory Worker", subtitle: "Reserves stock", variant: muted)
  shipping = worker("Shipping Worker", subtitle: "Books carrier", variant: muted)
  receipt = document("Receipt", variant: soft, tone: success)
 }
 connect(ingress.customer.right, ingress.gateway.left, role: primary)
 connect(ingress.gateway.right, ingress.auth.left, role: primary)
 connect(ingress.auth.right, transaction.checkout.left, role: primary, bundleId: auth)
 connect(transaction.checkout.right, transaction.payment.left, role: primary)
 connect(transaction.payment.bottom, fulfillment.events.top, role: primary, bundleId: payment)
 connect(fulfillment.events.right, fulfillment.inventory.left, role: primary)
 connect(fulfillment.inventory.bottom, fulfillment.shipping.top, role: primary)
 connect(fulfillment.shipping.right, fulfillment.receipt.left, role: primary)
 connect(ingress.auth.bottom, transaction.orders.left, label: "session", role: supporting, bundleId: auth)
 connect(transaction.checkout.bottom, transaction.orders.top, label: "write", role: supporting, bundleId: orders)
 connect(transaction.payment.bottom, transaction.orders.right, label: "payment", role: supporting, bundleId: orders)
 connect(ingress.gateway.bottom, operations.telemetry.left, label: "traffic", role: supporting, bundleId: telemetry)
 connect(transaction.payment.bottom, operations.telemetry.top, label: "latency", role: supporting, bundleId: payment)
 connect(fulfillment.shipping.bottom, operations.telemetry.right, label: "delivery", role: supporting, bundleId: telemetry)
 connect(operations.telemetry.right, operations.alerts.left, label: "threshold", role: supporting)
 connect(operations.alerts.right, fulfillment.events.left, label: "replay", role: secondary)
 grid(ingress, transaction, operations, fulfillment, columns: 2, gap: sm)
}`);
    const result = solvePinboard(compiled.document!, { width: 900, maxCandidates: 3 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors).toHaveLength(16);
    expect(result.report.metrics.crossingCount).toBe(0);
  }, 30000);

  it("adapts mismatched pins and contains routes inside a vertically stacked frame", () => {
    const compiled = compileVisual(`figure deploy("Safe deploy") {
 pipeline = frame("Pipeline", layout: column, gap: lg, padding: lg) {
  developer = person("Developer")
  commit = code("Commit")
  tests = tool("CI Tests")
  push = developer.right -> commit.left("push")
  run = commit.right -> tests.left("run")
 }
 column(pipeline)
}`);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const frame = result.scene.elements.find(({ id }) => id === "pipeline")!.bounds;
    for (const connector of result.scene.connectors) {
      expect(connector.fromPin).toMatch(/\.bottom$/);
      expect(connector.toPin).toMatch(/\.top$/);
      expect(connector.points.every((point) => point.x >= frame.x && point.x <= frame.x + frame.width && point.y >= frame.y && point.y <= frame.y + frame.height)).toBe(true);
      expect(connector.label && connector.label.x >= frame.x && connector.label.x + connector.label.width <= frame.x + frame.width).toBe(true);
    }
  });

  it("keeps cross-frame connector labels clear of frame borders and headings", () => {
    const compiled = compileVisual(`figure checkout("Checkout") {
 client = frame("Client", layout: column, padding: lg) {
  browser = person("Browser")
 }
 commerce = frame("Commerce", layout: column, padding: lg) {
  api = service("Checkout API")
 }
 checkout = client.right -> commerce.left("checkout")
 row(client, commerce, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const label = result.scene.connectors[0]!.label!;
    for (const frame of result.scene.elements.filter(({ kind }) => kind === "frame")) {
      const inside = label.x >= frame.bounds.x + 4
        && label.y >= frame.bounds.y + 4
        && label.x + label.width <= frame.bounds.x + frame.bounds.width - 4
        && label.y + label.height <= frame.bounds.y + frame.bounds.height - 4;
      const outside = label.x + label.width <= frame.bounds.x - 4
        || label.x >= frame.bounds.x + frame.bounds.width + 4
        || label.y + label.height <= frame.bounds.y - 4
        || label.y >= frame.bounds.y + frame.bounds.height + 4;
      expect(inside || outside).toBe(true);
      if (frame.labelBounds) expect(intersectsForTest(label, frame.labelBounds)).toBe(false);
    }
  });

  it("keeps a compound checkout flow on a stable primary row with local supporting data", () => {
    const compiled = compileVisual(`figure checkout("Checkout architecture") {
 client = frame("Client", layout: column, padding: lg) {
  browser = browser("Browser")
 }
 commerce = frame("Commerce", layout: column, gap: lg, padding: lg) {
  api = api("Checkout API")
  stripe = service("Stripe")
  authorize = api.right -> stripe.left("authorize", role: supporting)
 }
 async = frame("Async processing", layout: column, gap: lg, padding: lg) {
  queue = queue("Queue")
  worker = worker("Fulfillment worker")
  dispatch = queue.right -> worker.left("dispatch", role: primary)
 }
 data = frame("Data", layout: column, padding: lg) {
  postgres = database("Postgres")
 }
 call = client.browser.right -> commerce.api.left("checkout", role: primary)
 event = commerce.api.right -> async.queue.left("event", variant: async, role: primary)
 write = commerce.api.bottom -> data.postgres.top("write", variant: data, role: supporting)
 flow(client, commerce, async, data, direction: auto, gap: lg, rankGap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 900 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;

    const frame = (id: string) => result.scene.elements.find((element) => element.id === id)!.bounds;
    expect(new Set([frame("client").y, frame("commerce").y, frame("async").y]).size).toBe(1);
    expect(frame("data").x + frame("data").width / 2).toBe(frame("commerce").x + frame("commerce").width / 2);
    expect(frame("data").y).toBeGreaterThan(frame("commerce").y + frame("commerce").height);

    for (const connector of result.scene.connectors) {
      if (!connector.label) continue;
      expect(connector.label.x).toBeGreaterThanOrEqual(0);
      expect(connector.label.x + connector.label.width).toBeLessThanOrEqual(result.scene.board.width);
    }
  });

  it("top-aligns unequal architecture frames in a grid to preserve a straight primary flow", () => {
    const compiled = compileVisual(`figure checkout("Checkout") {
 client = frame("Client", layout: column, padding: lg) {
  browser = browser("Browser")
 }
 commerce = frame("Commerce", layout: column, gap: lg, padding: lg) {
  api = api("Checkout API")
  stripe = service("Stripe", variant: solid, tone: success)
  authorize = api.right -> stripe.left("authorize")
 }
 async = frame("Async processing", layout: column, gap: lg, padding: lg) {
  queue = queue("Queue")
  worker = worker("Fulfillment worker")
  dispatch = queue.right -> worker.left("dispatch", variant: async)
 }
 data = frame("Data", layout: column, padding: lg) {
  postgres = database("Postgres")
 }
 call = client.browser.right -> commerce.api.left("call")
 order = commerce.api.right -> async.queue.left("order event", variant: async)
 write = commerce.api.bottom -> data.postgres.top("write", variant: data)
 grid(client, commerce, async, data, columns: 3, gap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 900 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const firstRow = ["client", "commerce", "async"].map((id) => result.scene.elements.find((element) => element.id === id)!);
    expect(new Set(firstRow.map(({ bounds }) => bounds.y)).size).toBe(1);
    const call = result.scene.connectors.find(({ id }) => id === "call")!;
    expect(call.points).toHaveLength(2);
    expect(call.points[0]!.y).toBe(call.points[1]!.y);
  });

  it("rejects tower-shaped frames instead of accepting unusable density", () => {
    const compiled = compileVisual(`figure tower {
 pipeline = frame("Pipeline", layout: column, gap: lg, padding: lg) {
  one = service("One")
  two = service("Two")
  three = service("Three")
  four = service("Four")
  five = service("Five")
  six = service("Six")
  seven = service("Seven")
 }
 column(pipeline)
}`);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map(({ code }) => code)).toContain("layout.excessive_aspect_ratio");
  });

  it("connects to stable pins on objects inside a canvas", () => {
    const compiled = compileVisual(`component Plot() {
 dot = circle(x: 140, y: 50, width: 16, height: 16)
 return canvas(width: 180, height: 120) {
  dot
 }
}
figure anchored {
 plot = Plot()
 note = callout("Sample")
 edge = plot.dot.right -> note.left("annotate")
 row(plot, note, gap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene.connectors[0]).toMatchObject({ from: "plot.dot", fromPin: "plot.dot.right", to: "note", toPin: "note.left" });
    expect(result.scene.canvases[0]?.primitives[0]?.pins).toHaveLength(4);
  });

  it("keeps a fitting canvas annotation row instead of forcing vertical reflow", () => {
    const compiled = compileVisual(`component Plot() {
 dot = circle(x: 20, y: 20, width: 40, height: 40)
 return canvas(width: 180, height: 100, bleed: 4) {
  dot
 }
}
figure annotated {
 plot = Plot()
 note = callout("Controls flow")
 edge = plot.right -> note.left("annotation")
 row(plot, note, gap: xl)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1 });
    expect(result.ok, result.ok ? undefined : result.diagnostics.map(({ message }) => message).join(" ")).toBe(true);
    if (!result.ok) return;
    const plot = result.scene.elements.find(({ id }) => id === "plot")!;
    const note = result.scene.elements.find(({ id }) => id === "note")!;
    expect(note.bounds.x).toBeGreaterThan(plot.bounds.x + plot.bounds.width);
  });

  it("centers differently sized children on a shared column axis", () => {
    const compiled = compileVisual(`figure centered {
 wide = box("Wide", width: 220)
 narrow = callout("Narrow")
 edge = wide.bottom -> narrow.top("next")
 column(wide, narrow, gap: lg)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 320 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wide = result.scene.elements.find(({ id }) => id === "wide")!;
    const narrow = result.scene.elements.find(({ id }) => id === "narrow")!;
    expect(wide.bounds.x + wide.bounds.width / 2).toBe(narrow.bounds.x + narrow.bounds.width / 2);
  });

  it("centers compact root compositions and crops unused board height", () => {
    const compiled = compileVisual(`figure compact {
 agent = agent("Research agent")
 tool = tool("Search")
 edge = agent.right -> tool.left("query")
 row(agent, tool, gap: xl)
}`);
    const result = solvePinboard(compiled.document!, { width: 760 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const root = result.scene.elements.find(({ id }) => id === "root")!;
    expect(root.bounds.x + root.bounds.width / 2).toBe(380);
    expect(result.scene.board.height).toBeLessThanOrEqual(124);
    expect(result.scene.connectors[0]?.points).toHaveLength(2);
  });

  it("uses a balanced fallback grid for four components", () => {
    const result = solvePinboard(document, { width: 760 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const leaves = result.scene.elements.filter(({ parent }) => parent === "root");
    expect(result.scene.board.height).toBeLessThan(260);
    expect(new Set(leaves.map(({ bounds }) => bounds.x + bounds.width / 2)).size).toBe(3);
    expect(new Set(leaves.map(({ bounds }) => bounds.y)).size).toBe(2);
    expect(leaves[3]!.bounds.x + leaves[3]!.bounds.width / 2).toBe(leaves[1]!.bounds.x + leaves[1]!.bounds.width / 2);
  });

  it("sizes each grid row from its own tallest component", () => {
    const compiled = compileVisual(`component TallPanel() {
 return canvas(width: 220, height: 196) {}
}
component MediumPanel() {
 return canvas(width: 220, height: 132) {}
}
figure mixed_grid {
 tall = TallPanel()
 first = service("Ground station")
 note = callout("Escalate")
 medium = MediumPanel()
 archive = database("Archive")
 model = model("Anomaly model")
 grid(tall, first, note, medium, archive, model, columns: 2, gap: lg)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 760, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tall = result.scene.elements.find(({ id }) => id === "tall")!;
    const medium = result.scene.elements.find(({ id }) => id === "medium")!;
    const archive = result.scene.elements.find(({ id }) => id === "archive")!;
    expect(medium.bounds.y - tall.bounds.y).toBe(220);
    expect(archive.bounds.y - medium.bounds.y).toBeLessThan(180);
    expect(result.scene.board.height).toBeLessThan(560);
  });

  it("measures long callout labels inside their rendered text area", () => {
    const compiled = compileVisual(`figure note_test {
 note = callout("Position changes while the orbit remains stable")
 row(note)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 360, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const note = result.scene.elements.find(({ id }) => id === "note")!;
    expect(note.labelBounds!.y).toBeGreaterThanOrEqual(note.bounds.y);
    expect(note.labelBounds!.y + note.labelBounds!.height).toBeLessThanOrEqual(note.bounds.y + note.bounds.height);
  });

  it("resolves layout gaps through caller token overrides", () => {
    const compiled = compileVisual(`figure spacing {
 a = box("A")
 b = box("B")
 row(a, b, gap: lg)
}`);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1, tokenOverrides: { "space.lg": 60 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.scene.elements.find(({ id }) => id === "a")!;
    const b = result.scene.elements.find(({ id }) => id === "b")!;
    expect(b.bounds.x - (a.bounds.x + a.bounds.width)).toBe(60);
    expect(result.scene.board.gutter).toBe(60);
  });

  it("applies flex-like alignment and distribution deterministically", () => {
    const compiled = compileVisual(`component Tall() {
 return canvas(width: 100, height: 120) {}
}
component Short() {
 return canvas(width: 80, height: 64) {}
}
figure flex {
 tall = Tall()
 short = Short()
 row(tall, short, width: 500, align: end, distribute: between)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720, maxCandidates: 1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tall = result.scene.elements.find(({ id }) => id === "tall")!;
    const short = result.scene.elements.find(({ id }) => id === "short")!;
    expect(short.bounds.y + short.bounds.height).toBe(tall.bounds.y + tall.bounds.height);
    expect(short.bounds.x + short.bounds.width).toBe(tall.bounds.x + 500);
  });

  it("returns localized failures for conflicting or impossible constraints", () => {
    const conflicting = compileVisual(`figure conflict {
 a = box("A")
 b = box("B")
 c = box("C")
 row(a, b, c)
 align(a, b, c, axis: x)
 distribute(a, b, c, axis: x, gap: 40)
}`).document!;
    const conflictResult = solvePinboard(conflicting, { width: 720 });
    expect(conflictResult.ok).toBe(false);
    if (!conflictResult.ok) expect(conflictResult.diagnostics.map(({ code }) => code)).toContain("layout.unsatisfied_align");

    const oversized = compileVisual(`component Large() {
 return canvas(width: 200, height: 160) {}
}
component Small() {
 return canvas(width: 100, height: 80) {}
}
figure impossible {
 large = Large()
 small = Small()
 row(large, small)
 inside(large, small, padding: 8)
}`).document!;
    const insideResult = solvePinboard(oversized, { width: 720 });
    expect(insideResult.ok).toBe(false);
    if (!insideResult.ok) expect(insideResult.diagnostics.map(({ code }) => code)).toContain("layout.unsatisfied_inside");
  });

  it("treats a satisfied inside constraint as an explicit overlap", () => {
    const compiled = compileVisual(`component Container() {
 return canvas(width: 220, height: 160) {}
}
component Child() {
 return canvas(width: 80, height: 48) {}
}
figure nested {
 container = Container()
 child = Child()
 row(container, child)
 inside(child, container, padding: 12)
}`);
    expect(compiled.diagnostics).toEqual([]);
    const result = solvePinboard(compiled.document!, { width: 720 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const container = result.scene.elements.find(({ id }) => id === "container")!.bounds;
    const child = result.scene.elements.find(({ id }) => id === "child")!.bounds;
    expect(child.x).toBeGreaterThanOrEqual(container.x + 12);
    expect(child.y).toBeGreaterThanOrEqual(container.y + 12);
    expect(child.x + child.width).toBeLessThanOrEqual(container.x + container.width - 12);
    expect(child.y + child.height).toBeLessThanOrEqual(container.y + container.height - 12);
  });
});

function intersectsForTest(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
