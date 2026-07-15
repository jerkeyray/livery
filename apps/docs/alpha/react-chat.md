# React chat integration

`LiveryChatVisual` retains the last valid figure while tokens stream and shows your fallback only when completed source is invalid.

```tsx
import { LiveryChatVisual } from "@jerkeyray/react";

<LiveryChatVisual
  source={streamedSource}
  streaming={isStreaming}
  timeline="checkout"
  fallback={<p>This visual could not be rendered.</p>}
/>
```

It defaults to responsive width, an 80ms compile delay, reduced-motion-aware transitions, and keyboard-accessible timeline controls. Use `onRevision` and `onDiagnostics` to observe generation quality without parsing UI text.
