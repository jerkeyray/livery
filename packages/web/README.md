# @liveryscript/web

Framework-independent retained browser renderer for Livery visual programs and timelines.

```ts
import { mountLiveryVisual } from "@liveryscript/web";
import "@liveryscript/web/styles.css";

const visual = mountLiveryVisual(element, `figure hello("Hello") {
  user = person("Builder")
  app = service("Application")
  row(user, app)
}`);

visual.setState("complete");
visual.update(nextStreamedSource);
visual.destroy();
```

Read `visual.revision.status` to distinguish `empty`, `ready`, `retained`, and `invalid` source. By default the runtime retains its last valid scene and re-solves through `ResizeObserver` when no explicit width is supplied.
