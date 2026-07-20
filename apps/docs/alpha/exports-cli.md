# Exports and CLI

```ts
import { exportVisual } from "liveryscript";
import { exportVisualPng } from "liveryscript/node";

const svg = exportVisual(source, { format: "svg", width: 720 });
const png = exportVisualPng(source, { width: 720, scale: 2 });
```

```sh
livery figure.livery --format svg --output figure.svg
```

Web, React, CLI, SVG, and PNG use the same solved `BoardScene`. PNG export requires the Node package and its platform-specific Resvg binary.
