# @jerkeyray/web

Framework-independent browser renderer for Livery with responsive layout, stories, activation events, async adapters, and layout telemetry.

```ts
import { mountLivery } from "@jerkeyray/web";
import "@jerkeyray/web/styles.css";

const visual = mountLivery(element, 'flow hello { user -> app("open") }');
visual.destroy();
```
