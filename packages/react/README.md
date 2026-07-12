# @jerkeyray/react

React renderer for Livery visuals. It supports responsive scenes, stories, activation callbacks, retained valid output, and custom layout adapters.

```tsx
import { Livery } from "@jerkeyray/react";
import "@jerkeyray/react/styles.css";

export function Visual() {
  return <Livery source={'flow hello { user -> app("open") }'} />;
}
```
