<div align="center">

<p>
  <picture>
    <source srcset="docs/brand/lockup-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="docs/brand/lockup-light.svg" media="(prefers-color-scheme: light)">
    <img src="docs/brand/lockup-dark.svg" alt="Livery" width="168">
  </picture>
</p>

<p>
  <strong>Programmable visuals for agents.</strong>
</p>

<p>
  Validated layout &middot; Retained streaming &middot; React and browser runtimes &middot; SVG, PNG, and JSON exports
</p>

<p>
  <a href="https://livery.jerkeyray.com/docs">Documentation</a> &middot;
  <a href="https://livery.jerkeyray.com/docs/language">Language guide</a> &middot;
  <a href="https://livery.jerkeyray.com/studio">Studio</a>
</p>

</div>

---

## Every accepted visual has valid geometry.

That is the central constraint. Livery is a small visual language for agents to create responsive technical figures, explainers, and stateful visuals without generating raw SVG or positioning every object by hand.

Source is expanded into visual components, placed on a deterministic pinboard, routed through reserved channels, and checked for clipping, collisions, invalid geometry, and broken connections before a renderer receives it.

```text
visual program
  -> component expansion
  -> pinboard placement
  -> connector routing
  -> geometry validation
  -> SVG / PNG / JSON
```

If no valid scene can be produced, Livery returns typed diagnostics instead of drawing a best-effort broken figure.

## What's included

- **Programmable visual language:** bindings, components, primitives, layouts, connectors, constraints, and timelines in a compact single-file syntax.
- **Responsive pinboard layout:** deterministic placement and routing at chat, content, and expanded widths without macro coordinates.
- **Bounded local canvases:** paths, shapes, text, images, transforms, clipping, and repeated elements for figures beyond flowcharts.
- **Technical component library:** people, services, storage, streams, tools, models, documents, charts, callouts, and more, all built on public primitives.
- **Streaming-safe runtime:** retains the last valid scene while an agent is still producing incomplete source and patches stable SVG nodes when possible.
- **Portable output:** the same solved scene powers React, framework-independent Web, SVG, PNG, JSON, and CLI output.
- **Agent tooling:** a machine-readable language catalog, compact generation guide, structured diagnostics, and deterministic repair edits.
- **Sandboxed evaluation:** bounded expansion and resource policies with remote images disabled by default.

## Public preview

LiveryScript is not yet published to npm. Try the hosted [Studio](https://livery.jerkeyray.com/studio), or run the current source checkout:

```sh
git clone https://github.com/jerkeyray/livery.git
cd livery
bun install
bun run build
```

Once `npm view liveryscript` confirms the alpha is available, installation will be `bun add liveryscript`. PNG additionally requires `bun add @resvg/resvg-js`. Until then, package installation commands are preview documentation rather than a registry availability claim.

## React quickstart

`LiveryChatVisual` is the opinionated path for streamed agent output. It debounces compilation, retains the last valid scene during generation, responds to container width, and adds accessible timeline controls when states exist.

```tsx
import { LiveryChatVisual } from "liveryscript/react";
import "liveryscript/styles.css";

export function AssistantVisual({
  source,
  streaming,
}: {
  source: string;
  streaming: boolean;
}) {
  return (
    <LiveryChatVisual
      source={source}
      streaming={streaming}
      fallback={<p>Visual unavailable.</p>}
    />
  );
}
```

Use `LiveryVisual` for a lower-level controlled renderer:

```tsx
import { LiveryVisual } from "liveryscript/react";
import "liveryscript/styles.css";

export function Figure({ source }: { source: string }) {
  return <LiveryVisual source={source} width={720} />;
}
```

## The language

For common connected visuals, agents can submit a small semantic plan instead of authoring the language directly. Livery validates the references, chooses standard components and responsive layout, and returns both the rendered result and canonical editable source:

```ts
import { renderVisualPlan, type VisualPlan } from "liveryscript";

const plan: VisualPlan = {
  type: "livery.plan",
  version: "0.1",
  id: "request_path",
  family: "process",
  direction: "auto",
  nodes: [
    { id: "client", label: "Client", kind: "client" },
    { id: "api", label: "API", kind: "api" },
  ],
  edges: [{ id: "request", from: "client", to: "api", kind: "flow" }],
  annotations: [{ id: "protocol", target: "api", text: "HTTPS", kind: "fact" }],
  groups: [],
};

const result = renderVisualPlan(plan, { width: 720 });
console.log(result.source); // canonical Livery DSL for editing or storage
console.log(result.quality); // deterministic geometry-based quality report
```

Use the plan API for architecture, process, and explainer diagrams. Short annotations stay inside their subject component, the dominant flow is placed first, and responsive candidates are scored for continuity, density, detours, and annotation distance. The textual DSL remains the precise path for custom components, canvases, timelines, schemas, interactions, and other specialized visuals.

## Textual DSL

This figure uses standard-library components, stable connection anchors, coordinate-free macro layout, and named timeline states:

```livery
figure checkout("Checkout request") {
  customer = person("Customer")
  api = service("Checkout API")
  payment = service("Payment provider")
  orders = database("Orders")

  submit = customer.right -> api.left("submit order")
  authorize = api.right -> payment.left("authorize")
  persist = api.bottom -> orders.top("persist")

  grid(customer, api, payment, orders, columns: 3, gap: 56)

  timeline checkout {
    state request {
      show(customer, api)
      trace(submit)
    }
    state authorization {
      show(payment)
      trace(authorize)
      focus(payment)
    }
    state complete {
      show(orders)
      trace(persist)
      set(persist, tone: success)
    }
  }
}
```

Components such as `database` and `service` are library conveniences, not compiler-level entity types. Custom components and local canvases are composed from the same public visual primitives.

## Headless rendering

The LiveryScript root compiles, validates, renders, and exports without a framework dependency:

```ts
import { exportVisual, render } from "liveryscript";

const result = render(source, { width: 720 });

if (!result.svg) {
  console.error(result.diagnostics);
}

const exported = exportVisual(source, {
  format: "svg",
  width: 720,
});

const svg = exported.output;
```

Node and Bun PNG export is available through `liveryscript/node`. The `livery` CLI renders `.livery` files to SVG, PNG, or deterministic scene JSON. PNG support loads lazily and requires the optional `@resvg/resvg-js` package; SVG and JSON do not.

## One package, focused entry points

| Entry point | Purpose |
| --- | --- |
| `liveryscript` | Language parser, compiler, pinboard solver, validation, themes, timelines, catalog, agent helpers, and portable exports |
| `liveryscript/web` | Framework-independent retained browser runtime |
| `liveryscript/react` | React renderer and chat-oriented streaming component |
| `liveryscript/node` | Optional Node and Bun PNG export adapter |
| `liveryscript/styles.css` | Combined Web and React runtime styles |
| `livery` | Command-line validation and SVG, JSON, or optional PNG export |

The implementation remains separated into private workspaces, but consumers install only `liveryscript`.

## Documentation

- [Start](https://livery.jerkeyray.com/docs/start)
- [Language reference](https://livery.jerkeyray.com/docs/language)
- [SDKs and tooling](https://livery.jerkeyray.com/docs/sdks)
- [Generate with agents](https://livery.jerkeyray.com/docs/agents)
- [Architecture](https://livery.jerkeyray.com/docs/architecture)
- [Operations and release status](https://livery.jerkeyray.com/docs/operations)

## Development

This repository uses Bun workspaces.

```sh
bun install
bun dev
```

The playground runs at `http://127.0.0.1:5173/` by default.

Run the full local verification suite before submitting a change:

```sh
bun run typecheck
bun run test
bun run test:visual
bun run test:packages
```

## Status

Livery is pre-1.0 and currently a public preview. The source and hosted Studio are ready for evaluation; the npm alpha remains pending until trusted publication and clean npm/Bun installs are verified. The current alpha prioritizes deterministic static and state-based visuals. Imports, third-party component packages, additional themes, and advanced motion remain intentionally deferred.

## License

[MIT](LICENSE), Copyright 2026 Aditya Srivastava
