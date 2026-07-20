# @liveryscript/react

React wrapper for the retained Livery visual renderer. Controlled timeline state changes preserve stable SVG nodes.

```tsx
import { LiveryVisual } from "@liveryscript/react";
import "@liveryscript/react/styles.css";

export function Visual() {
  return <LiveryVisual source={`figure hello("Hello") {
    user = person("Builder")
    app = service("Application")
    row(user, app)
  }`} width={720} />;
}
```

For streamed chat output, use `LiveryChatVisual`. It retains the last valid scene during generation, adds accessible timeline controls, and only shows your fallback after final invalid source.

```tsx
<LiveryChatVisual source={streamedSource} streaming={isStreaming} fallback={<p>Visual unavailable</p>} />
```
