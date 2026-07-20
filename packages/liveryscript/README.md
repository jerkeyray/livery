# LiveryScript

The single npm distribution for Livery, a validated programmable visual language for agents and applications.

> The first public alpha is being prepared. Until `liveryscript` appears on npm, use the source checkout and Studio at https://livery.jerkeyray.com.

After publication:

```sh
bun add liveryscript
```

```ts
import { render } from "liveryscript";
import { LiveryVisual } from "liveryscript/react";
import "liveryscript/styles.css";
```

Browser mounting is available from `liveryscript/web`. PNG export is available from `liveryscript/node` after installing the optional `@resvg/resvg-js` dependency.
