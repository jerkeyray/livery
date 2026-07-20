# Quickstart

Install the React package and its runtime CSS:

```sh
# after npm publication is verified
bun add liveryscript
```

```tsx
import { LiveryVisual } from "liveryscript/react";
import "liveryscript/styles.css";

export function Figure({ source }: { source: string }) {
  return <LiveryVisual source={source} />;
}
```

Visual syntax is a single deterministic source file. This tested checkout example has no macro coordinates:

<<< ../../../fixtures/visual/checkout-board.livery{livery}

Livery is pre-1.0. The current single-file syntax is frozen for the alpha, but runtime APIs may receive additive changes.
