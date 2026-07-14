# @jerkeyray/web

Framework-independent retained browser renderer for Livery visual programs and timelines.

```ts
import { mountLiveryVisual } from "@jerkeyray/web";
import "@jerkeyray/web/styles.css";

const visual = mountLiveryVisual(element, `figure hello("Hello") {
  user = person("Builder")
  app = service("Application")
  row(user, app)
}`);

visual.setState("complete");
visual.destroy();
```
