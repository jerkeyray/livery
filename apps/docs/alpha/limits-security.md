# Limits and security

Compilation is sandboxed and bounded by nesting, expanded-node, path, text, state, transition, and image limits. Livery does not execute JavaScript or perform I/O.

Remote images are disabled by default. Allow only explicit HTTPS hosts:

```ts
render(source, {
  resourcePolicy: { allowedImageHosts: ["assets.example.com"] }
});
```

Data images remain enabled within the byte limit. For CSP, allow styles and images required by your selected renderer; avoid `unsafe-eval`. Node rasterization applies the same resource policy and never performs unrestricted remote fetches.

The alpha supports current evergreen browsers with SVG, `ResizeObserver`, and `DOMParser`. Without `ResizeObserver`, pass an explicit width.
