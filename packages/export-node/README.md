# @jerkeyray/export-node

Optional PNG export for Node.js and Bun, powered by resvg. Core SVG and JSON exports remain available from `@jerkeyray/core` without this native dependency.

```ts
import { exportHeadlessPng } from "@jerkeyray/export-node";

const result = await exportHeadlessPng('flow hello { user -> app("open") }', {
  width: 720,
  scale: 2,
});
```
