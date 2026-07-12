# @livery/export-node

Optional PNG export for Node.js and Bun, powered by resvg. Core SVG and JSON exports remain available from `@livery/core` without this native dependency.

```ts
import { exportHeadlessPng } from "@livery/export-node";

const result = await exportHeadlessPng('flow hello { user -> app("open") }', {
  width: 720,
  scale: 2,
});
```
