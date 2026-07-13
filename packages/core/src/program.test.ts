import { describe, expect, it } from "vitest";
import { compile, compileVisual, formatVisualDocument, migrateLegacyArtifact, migrateLegacySource } from "./index.js";

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
});
