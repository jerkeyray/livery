# @jerkeyray/core

Compiler, validated pinboard layout, timeline evaluation, and deterministic SVG/JSON exports for the Livery programmable visual language. This package has no framework dependency.

```ts
import { exportVisual, render } from "@jerkeyray/core";

const source = `figure hello("Hello") {
  user = person("Builder")
  app = service("Application")
  open = user.right -> app.left("open")
  row(user, app, gap: 40)
}`;

const result = render(source, { width: 720 });
const exported = exportVisual(source, {
  format: "svg",
  width: 720,
});
```

`compileProgram`, `render`, and `exportVisual` are the canonical APIs. Legacy `flow` source is translated with a deprecation diagnostic.
