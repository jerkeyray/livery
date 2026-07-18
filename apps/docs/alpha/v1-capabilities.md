# V1 visual capability inventory

Livery uses this inventory to track visual outcomes, not foreign syntax. Every entry must lower through the canonical Livery document and Board Scene, use an owned kernel, and pass renderer-parity and responsive-layout checks before it is marked supported.

| User outcome | Livery family | Native kernel | Status |
| --- | --- | --- | --- |
| Connected processes and decisions | Flow | ranked compound graph | supported |
| Responsibility lanes and handoffs | Swimlanes | temporal schedule | planned |
| Ordered participant messages and returns | Interaction narrative | interaction lanes | foundation |
| Types, members, inheritance and composition | Class model | ranked compound graph | foundation |
| States, transitions, choices and compound behavior | State model | ranked compound graph | foundation |
| Entities, keys and cardinal relationships | Entity model | ranked compound graph | foundation |
| Experience stages, actors and sentiment | Journey | temporal schedule | planned |
| Tasks, dates, durations and milestones | Schedule | temporal schedule | planned |
| Part-to-whole comparison | Proportion | quantitative plot | planned |
| Two-axis classification | Quadrant | quantitative plot | planned |
| Requirements, verification and evidence | Requirement model | ranked compound graph | foundation |
| Commits, branches, merges and releases | Revision graph | temporal schedule | planned |
| People, systems and decomposition boundaries | System context | ranked compound graph | supported |
| Idea hierarchies | Mindmap | hierarchy/tree | foundation |
| Events and periods through time | Chronology | temporal schedule | planned |
| Nested calls and control fragments | Structured interaction | interaction lanes | planned |
| Weighted movement between stages | Weighted flow | quantitative plot | planned |
| Bar, line and area series | XY plot | quantitative plot | planned |
| Authored system blocks | Block system | ranked compound graph | supported |
| Bit fields and protocol headers | Packet | bounded spatial canvas | planned |
| Work cards in status lanes | Kanban | temporal schedule | planned |
| Services, resources and data movement | Architecture | ranked compound graph | supported |
| Multivariate radial comparison | Radar | quantitative plot | planned |
| Commands, events and read models across time | Event model | temporal schedule | planned |
| Hierarchical values by area | Treemap | quantitative plot | planned |
| Set membership and intersections | Set relationships | bounded spatial canvas | planned |
| Causes organized around an effect | Cause map | bounded spatial canvas | planned |
| Value chains positioned by evolution | Evolution map | bounded spatial canvas | planned |
| Items classified into decision domains | Sensemaking domains | bounded spatial canvas | planned |
| Taxonomies and reporting trees | Tree view | hierarchy/tree | supported |

## Current foundation

Bounded list and record values now carry structured members, fields, messages, schedules, and series without embedding JSON strings. The standard library includes native participants, interaction fragments, class cards, entities, states, choices, requirements, and evidence. Typed connector semantics cover messages, transitions, schema relationships, traceability, verification, and satisfaction.

The first new kernel is `interaction(...)`. It creates participant lanes and ordered message rows while preserving the same component, theme, timeline, export, and accessibility model used by every other Livery visual.

```livery
figure account_lookup("Account lookup") {
  client = participant("Client")
  api = participant("API")
  store = participant("Store")

  request = connect(client.right, api.left,
    label: "lookup", semantic: message, messageKind: sync, order: 0)
  read = connect(api.right, store.left,
    label: "read", semantic: message, messageKind: sync, order: 1)
  result = connect(store.left, api.right,
    label: "account", semantic: message, messageKind: return, order: 2)

  interaction(client, api, store, gap: lg)
}
```

## Review gate

A family cannot move to supported until it has original basic, realistic, dense, narrow, and adversarial fixtures; deterministic snapshots at 360, 480, 720, 900 and 1200 pixels; accessible reading order; zero clipping and collisions; and parity across SVG, React, browser, CLI, PNG, JSON and timelines. No imported grammar, renderer, SVG, layout runtime, or translated example is accepted.
