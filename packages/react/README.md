# @jerkeyray/react

React wrapper for the retained Livery visual renderer. Controlled timeline state changes preserve stable SVG nodes.

```tsx
import { LiveryVisual } from "@jerkeyray/react";
import "@jerkeyray/react/styles.css";

export function Visual() {
  return <LiveryVisual source={`figure hello("Hello") {
    user = person("Builder")
    app = service("Application")
    row(user, app)
  }`} width={720} />;
}
```
