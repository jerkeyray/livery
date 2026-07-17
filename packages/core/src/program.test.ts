import { describe, expect, it } from "vitest";
import { compile, compileVisual, formatVisualDocument, migrateLegacyArtifact, migrateLegacySource, standardLibrary } from "./index.js";

const source = `component RequestPath(client: string, endpoint: string) {
  user = lib.person(label: client)
  api = lib.service(label: endpoint)
  request = connect(user.right, api.left, label: "request")
  return row(gap: md) {
    user
    api
  }
}

figure checkout("Checkout request") {
  path = RequestPath("Customer", "Checkout API")
  db = lib.database(label: "Orders")
  persist = connect(path.right, db.left, label: "persist")

  row(gap: lg) {
    path
    db
  }

  timeline checkout {
    state start {
      show(path)
    }
    state complete {
      show(db)
      trace(persist)
    }
    transition start -> complete(duration: normal)
  }
}`;

describe("programmable language", () => {
  it("expands components, layouts, connectors, and timelines", () => {
    const result = compileVisual(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      type: "livery.visual",
      id: "checkout",
      root: { layout: { kind: "row", gap: "$space.lg" } },
      timelines: [{ id: "checkout", states: [{ id: "start" }, { id: "complete" }] }],
    });
    expect(result.document?.connectors[0]).toMatchObject({ id: "persist", from: { node: "path", anchor: "right" }, to: { node: "db", anchor: "left" } });
    expect(result.document?.root.children?.[0]).toMatchObject({
      id: "path",
      kind: "component.RequestPath",
      children: [
        { id: "path.user", kind: "lib.person", label: "Customer" },
        { id: "path.api", kind: "lib.service", label: "Checkout API" },
      ],
    });
    expect(result.document?.connectors.map(({ id }) => id)).toContain("path.request");
  });

  it("migrates legacy roles through standard-library components", () => {
    const legacy = compile(`flow sample {\n a = actor("A")\n db = database("DB")\n read = a -> db("read")\n story {\n reveal(a, db)\n trace(read)\n }\n}`).artifact!;
    expect(migrateLegacyArtifact(legacy)).toMatchObject({
      root: { children: [{ kind: "lib.person" }, { kind: "lib.database" }] },
      connectors: [{ from: { node: "a" }, to: { node: "db" } }],
    });
    expect(formatVisualDocument(migrateLegacyArtifact(legacy))).toContain('a = lib.person(label: "A")');
    expect(formatVisualDocument(migrateLegacyArtifact(legacy))).toContain("timeline legacy");
    expect(compileVisual(formatVisualDocument(migrateLegacyArtifact(legacy))).diagnostics).toEqual([]);
    expect(migrateLegacySource(`flow sample {\n a = actor("A")\n}`).diagnostics.map(({ code }) => code)).toContain("compat.legacy_source");
  });

  it("rejects recursive expansion before it can execute unbounded work", () => {
    const result = compileVisual(`component Loop() {\n child = Loop()\n return row {\n child\n }\n}\nfigure bad {\n root = Loop()\n}`);
    expect(result.diagnostics.map(({ code }) => code)).toContain("resource.max_component_depth");
  });

  it("supports compact library, connector, and layout syntax", () => {
    const result = compileVisual(`figure compact {\n a = service("API")\n b = database("DB")\n read = a.right -> b.left("read")\n row(a, b, gap: lg)\n}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      root: { layout: { kind: "row", gap: "$space.lg" }, children: [{ kind: "lib.service" }, { kind: "lib.database" }] },
      connectors: [{ id: "read", label: "read" }],
    });
  });

  it("compiles flow layouts and connector roles", () => {
    const result = compileVisual(`figure native_flow {
 a = service("Client")
 b = service("API")
 request = connect(a.right, b.left, label: "request", role: primary)
 flow(a, b, direction: auto, gap: lg, rankGap: xl, maxCandidates: 8)
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.layout).toMatchObject({ kind: "flow", direction: "auto", gap: "$space.lg", rankGap: "$space.xl", maxCandidates: 8 });
    expect(result.document?.connectors[0]).toMatchObject({ id: "request", role: "primary" });
  });

  it("rejects unbounded flow candidate counts", () => {
    const result = compileVisual(`figure invalid_flow { a = service("A") flow(a, maxCandidates: 13) }`);
    expect(result.diagnostics.map(({ code }) => code)).toContain("semantic.invalid_flow_candidate_limit");
  });

  it("assigns deterministic IDs to anonymous connectors", () => {
    const result = compileVisual(`figure compact {\n a = service("API")\n b = database("DB")\n a.right -> b.left("read")\n}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.connectors[0]).toMatchObject({ id: "a-right--b-left", label: "read" });
  });

  it("compiles explicit spatial constraints", () => {
    const result = compileVisual(`figure constrained {\n a = box("A")\n b = box("B")\n c = box("C")\n row(a, b, c)\n align(a, b, axis: y)\n distribute(a, b, c, axis: x, gap: lg)\n near(a, b, distance: md)\n}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.constraints.map(({ kind }) => kind)).toEqual(["align", "distribute", "near"]);
  });

  it("rejects constraints that reference unknown nodes", () => {
    const result = compileVisual(`figure invalid {\n a = box("A")\n align(a, missing, axis: x)\n}`);
    expect(result.document).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toContain("semantic.unknown_constraint_target");
  });

  it("evaluates bounded arithmetic from typed component parameters", () => {
    const result = compileVisual(`component Plot(size: number) {
 dot = circle(x: size / 2 - 6, y: size / 4, width: 12, height: 12)
 return canvas(width: size + 20, height: size) {
  dot
 }
}
figure arithmetic {
 plot = Plot(120)
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.children?.[0]).toMatchObject({
      layout: { width: 140, height: 120 },
      children: [{ props: { x: 54, y: 30 } }],
    });
  });

  it("rejects unknown, mistyped, missing, and invalid-enum call arguments", () => {
    const cases = [
      ['figure bad { a = box("A", nonsense: 1) }', "semantic.unknown_argument"],
      ['figure bad { a = box("A", opacity: "high") }', "semantic.invalid_argument_value"],
      ['figure bad { a = path(width: 20, height: 20) }', "semantic.missing_argument"],
      ['figure bad { a = icon(name: 42) }', "semantic.invalid_argument_value"],
      ['figure bad { a = service("A", variant: impossible) }', "semantic.invalid_argument_value"],
      ['figure bad { a = repeat(count: 2, kind: box) }', "semantic.unsupported_context"],
    ] as const;
    for (const [input, code] of cases) expect(compileVisual(input).diagnostics.map((item) => item.code), input).toContain(code);
  });

  it("supports complete presentation overrides on standard components", () => {
    const result = compileVisual(`figure styled {
 stripe = service("Stripe", subtitle: "Payment provider", icon: "credit-card", variant: soft, tone: info, fill: "#f3e8ff", stroke: "#7c3aed", strokeWidth: 2, color: "#4c1d95", iconColor: "#7c3aed", radius: 12, opacity: 0.95, fontSize: 14, fontWeight: 700, width: 180, height: 80)
 row(stripe)
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.children?.[0]).toMatchObject({
      kind: "lib.service",
      label: "Stripe",
      subtitle: "Payment provider",
      variant: "soft",
      tone: "info",
      style: { fill: "#f3e8ff", stroke: "#7c3aed", strokeWidth: 2, color: "#4c1d95", iconColor: "#7c3aed", radius: 12, opacity: 0.95, fontSize: 14, fontWeight: 700 },
      props: { icon: "credit-card", width: 180, height: 80 },
    });
    const formatted = formatVisualDocument(result.document!);
    expect(formatted).toContain('subtitle: "Payment provider"');
    expect(formatted).toContain('icon: "credit-card"');
    expect(compileVisual(formatted).diagnostics).toEqual([]);
  });

  it("exposes the complete visual parameter contract on every standard component", () => {
    const expected = ["label", "subtitle", "icon", "variant", "tone", "fill", "stroke", "strokeWidth", "color", "iconColor", "radius", "opacity", "fontSize", "fontWeight", "width", "height"];
    for (const component of Object.values(standardLibrary)) {
      expect(component.parameters.map(({ name }) => name), component.name).toEqual(expected);
      expect(component.variants, component.name).toEqual(["default", "muted", "emphasis", "soft", "solid", "ghost"]);
    }
  });

  it("rejects unsafe paints on primitives and standard components", () => {
    for (const input of [
      'figure bad { a = box("A", fill: "url(https://evil.example/x)") }',
      'figure bad { a = service("A", stroke: "var(--secret)") }',
    ]) expect(compileVisual(input).diagnostics).toContainEqual(expect.objectContaining({ code: "semantic.invalid_argument_value" }));
  });

  it("compiles nested styled frames with stable qualified child ids", () => {
    const result = compileVisual(`figure framed {
 backend = frame("Backend", subtitle: "Private network", layout: row, gap: lg, padding: lg, fill: "#f8fafc") {
  api = service("API")
  db = database("Orders")
  write = api.right -> db.left("write")
 }
 row(backend)
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.children?.[0]).toMatchObject({
      id: "backend",
      kind: "frame",
      subtitle: "Private network",
      layout: { kind: "row", gap: "$space.lg" },
      children: [{ id: "backend.api" }, { id: "backend.db" }],
    });
    expect(result.document?.connectors[0]).toMatchObject({ from: { node: "backend.api" }, to: { node: "backend.db" } });
    const formatted = formatVisualDocument(result.document!);
    expect(formatted).toContain('backend = frame("Backend"');
    expect(formatted).toContain('api = lib.service(label: "API")');
    expect(compileVisual(formatted).diagnostics).toEqual([]);
  });

  it("rejects duplicate layouts, omitted bindings, and duplicate layout children", () => {
    const duplicateLayout = compileVisual(`figure bad {
 a = box("A")
 row(a)
 column(a)
}`);
    expect(duplicateLayout.diagnostics.map(({ code }) => code)).toContain("semantic.duplicate_root_layout");

    const omitted = compileVisual(`figure bad {
 a = box("A")
 b = box("B")
 edge = a.right -> b.left("send")
 row(a)
}`);
    expect(omitted.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining(["semantic.unplaced_binding", "semantic.unplaced_connector_target"]));

    const duplicateChild = compileVisual(`figure bad {
 a = box("A")
 row(a, a)
}`);
    expect(duplicateChild.diagnostics.map(({ code }) => code)).toContain("semantic.duplicate_layout_child");
  });

  it("keeps unused component internals and their connectors out of expanded output", () => {
    const result = compileVisual(`component Pair() {
 shown = box("Shown")
 unused = box("Unused")
 hidden_edge = unused.right -> unused.left("internal")
 return row {
  shown
 }
}
figure scoped {
 pair = Pair()
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.document?.root.children?.[0]?.children?.map(({ id }) => id)).toEqual(["pair.shown"]);
    expect(result.document?.connectors).toEqual([]);
  });

  it("rejects arbitrary unsupported named arguments instead of dropping them", () => {
    for (let index = 0; index < 50; index += 1) {
      const property = `unsupported_${index}`;
      const result = compileVisual(`figure generated { node = box("Node", ${property}: ${index}) }`);
      expect(result.document, property).toBeUndefined();
      expect(result.diagnostics, property).toContainEqual(expect.objectContaining({ code: "semantic.unknown_argument" }));
    }
  });

  it("rejects canvas references and repeat properties that cannot render", () => {
    const missingMask = compileVisual(`figure invalid {
 shape = box(x: 10, y: 10, width: 40, height: 40, mask: missing)
 canvas(shape, width: 120, height: 80)
}`);
    expect(missingMask.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic.unknown_canvas_reference" }));

    const invalidRepeat = compileVisual(`figure invalid {
 marks = repeat(count: 3, kind: line, width: 20, height: 1, fill: "red")
 canvas(marks, width: 120, height: 80)
}`);
    expect(invalidRepeat.diagnostics).toContainEqual(expect.objectContaining({ code: "semantic.invalid_repeat_property" }));
  });
});
