# @jerkeyray/export-node

Optional PNG export for Node.js and Bun, powered by resvg. Core SVG and JSON exports remain available from `@jerkeyray/core` without this native dependency.

```ts
import { exportVisualPng } from "@jerkeyray/export-node";

const result = exportVisualPng(`figure hello("Hello") {
  note = box("Portable PNG", fill: "#f8fafc")
}`, {
  width: 720,
  scale: 2,
});
```

`exportHeadlessPng` remains available as a deprecated compatibility wrapper for legacy flow source.
