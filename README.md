<div align="center">

<p>
  <picture>
    <source srcset="docs/brand/wordmark-dark.svg" media="(prefers-color-scheme: dark)">
    <source srcset="docs/brand/wordmark-light.svg" media="(prefers-color-scheme: light)">
    <img src="docs/brand/wordmark-dark.svg" alt="Livery" width="112">
  </picture>
</p>

<p>
  <strong>Programmable visuals for agents.</strong>
</p>

<p>
  Validated layout &middot; Retained streaming &middot; React and browser runtimes &middot; SVG, PNG, and JSON exports
</p>

<p>
  <a href="https://jerkeyray.github.io/livery/">Documentation</a> &middot;
  <a href="https://jerkeyray.github.io/livery/alpha/language">Language guide</a> &middot;
  <a href="https://jerkeyray.github.io/livery/alpha/gallery">Gallery</a>
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

## Install

For React applications:

```sh
bun add @jerkeyray/react
```

Livery is currently a public alpha. The single-file language is frozen for the alpha cycle, while runtime APIs may receive additive changes.

## React quickstart

`LiveryChatVisual` is the opinionated path for streamed agent output. It debounces compilation, retains the last valid scene during generation, responds to container width, and adds accessible timeline controls when states exist.

```tsx
import { LiveryChatVisual } from "@jerkeyray/react";
import "@jerkeyray/react/styles.css";

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
import { LiveryVisual } from "@jerkeyray/react";
import "@jerkeyray/react/styles.css";

export function Figure({ source }: { source: string }) {
  return <LiveryVisual source={source} width={720} />;
}
```

## The language

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

`@jerkeyray/core` compiles, validates, renders, and exports without a framework dependency:

```ts
import { exportVisual, render } from "@jerkeyray/core";

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

Node and Bun PNG export is available through `@jerkeyray/export-node`. The CLI can render `.livery` files to SVG, PNG, or deterministic scene JSON.

## Packages

| Package | Purpose |
| --- | --- |
| `@jerkeyray/core` | Language parser, compiler, pinboard solver, validation, themes, timelines, and portable exports |
| `@jerkeyray/web` | Framework-independent retained browser runtime |
| `@jerkeyray/react` | React renderer and chat-oriented streaming component |
| `@jerkeyray/export-node` | Optional Node and Bun PNG export adapter |
| `@jerkeyray/cli` | Command-line validation and export |
| `@jerkeyray/layout-elk` | Optional compatibility adapter for complex legacy graph placement |

All public packages are versioned together.

## Documentation

- [Quickstart](https://jerkeyray.github.io/livery/alpha/quickstart)
- [React chat integration](https://jerkeyray.github.io/livery/alpha/react-chat)
- [Agent prompting](https://jerkeyray.github.io/livery/alpha/agent-prompting)
- [Language reference](https://jerkeyray.github.io/livery/alpha/language)
- [Canvas and primitives](https://jerkeyray.github.io/livery/alpha/canvas)
- [Timelines](https://jerkeyray.github.io/livery/alpha/timelines)
- [Limits and security](https://jerkeyray.github.io/livery/alpha/limits-security)
- [Exports and CLI](https://jerkeyray.github.io/livery/alpha/exports-cli)

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

Livery is pre-1.0 and aimed first at independent React and chat application builders. The current alpha prioritizes deterministic static and state-based visuals. Imports, third-party component packages, additional themes, and advanced motion remain intentionally deferred.

## License

[MIT](LICENSE), Copyright 2026 Aditya Srivastava
