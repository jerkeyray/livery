# Livery Language

Livery is a bounded programmable language for deterministic vector figures. Programs expand into a visual tree, solve through the pinboard, validate as a `BoardScene`, and render through the same SVG geometry in browser, React, CLI, and export APIs.

## Figures

```livery
figure checkout("Checkout request") {
  customer = person("Customer")
  api = service("Checkout API")
  orders = database("Orders")

  submit = customer.right -> api.left("submit order")
  persist = api.bottom -> orders.top("persist", tone: success)

  grid(customer, api, orders, columns: 2, gap: 48)
}
```

Bindings have stable IDs. Calls accept positional or named arguments, and connectors target explicit anchors. Accepted source never silently discards an unknown call, argument, constraint, variant, or timeline target.

## Components

```livery
component Pair(left: string, right: string = "Worker") {
  first = box(left)
  second = box(right)

  return row(gap: 32) {
    first
    second
  }
}
```

Component parameters support `string`, `number`, `boolean`, and `tone`. Expansion is declarative and bounded: no JavaScript, I/O, mutation, recursion, or unbounded loops.

## Primitives

The renderer-owned primitives are `text`, `box`, `circle`, `line`, `path`, `image`, `icon`, `group`, and `connector`. Authored properties such as `fill`, `stroke`, `strokeWidth`, `opacity`, typography, transforms, descriptions, and image sources survive into the solved scene and exports.

Standard-library calls such as `person`, `service`, `database`, `queue`, `agent`, `tool`, and `model` expand into public visual components. They are conveniences, not compiler-level entity categories.

## Layout

Use `row`, `column`, `grid`, `stack`, and `overlay` for primary composition. `align`, `distribute`, `inside`, and `near` add deterministic spatial constraints. Explicit coordinates are reserved for bounded local canvases.

The solver either returns a validated `BoardScene` or typed diagnostics. Renderers do not repair malformed geometry.

## Canvas

```livery
figure plot("Plot") {
  art = canvas(width: 240, height: 140) {
    axis = line(x1: 20, y1: 120, x2: 220, y2: 120, stroke: "#475569")
    curve = path(d: "M 20 110 C 80 100, 140 30, 220 20", stroke: "#2563eb", fill: "none")
    label = text("signal", x: 150, y: 30)
  }
}
```

Canvas coordinates are local and bounded. Canvas primitives support stable IDs, grouping, clipping, masks, declared bleed, and timeline transforms. Resource limits cap nesting, expanded elements, paths, images, and repeats.

## Timelines

```livery
timeline checkout {
  state request {
    show(customer, api)
    trace(submit)
  }

  state complete {
    show(orders)
    trace(persist)
    set(persist, tone: success)
  }

  transition request -> complete(duration: normal)
}
```

`show`, `hide`, `focus`, `trace`, and `set` operate on stable visual identities. Unsupported morph pairs fail explicitly. Timeline geometry remains fixed, motion stays inside validated envelopes, and reduced motion applies state immediately.

## APIs

```ts
import { compileProgram, exportVisual, render } from "@jerkeyray/core";

const compiled = compileProgram(source);
const rendered = render(source, { width: 720, state: "complete" });
const exported = exportVisual(source, { format: "svg", width: 720 });
```

Use `exportVisualPng` from `@jerkeyray/export-node` for PNG output, `mountLiveryVisual` from `@jerkeyray/web` in framework-independent browser code, and `LiveryVisual` from `@jerkeyray/react` in React applications.
