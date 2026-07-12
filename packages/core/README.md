# @livery/core

Compiler, layout contracts, headless rendering, and deterministic SVG/JSON exports for Livery. This package has no framework dependency.

```ts
import { exportHeadless } from "@livery/core";

const result = await exportHeadless('flow hello { user -> app("open") }', {
  format: "svg",
  width: 720,
});
```
