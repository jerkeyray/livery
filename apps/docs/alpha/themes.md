# Themes

All renderers consume the same serializable `LiveryTheme`. Override semantic tokens at render time:

```ts
render(source, {
  tokenOverrides: { "color.accent": "#c0264f" }
});
```

Primitive properties take precedence over component variants, caller overrides, theme values, and canonical fallbacks.

Livery ships six built-in themes:

- `editorial` is the restrained technical default.
- `paper` uses warm documentation surfaces.
- `midnight` is a softer navy dark mode.
- `blackout` uses true near-black surfaces, high contrast, and a subtle drafting grid.
- `blueprint` uses technical navy surfaces, cool typography, square geometry, and a drafting grid.
- `monochrome` removes hue, shadow, and decorative softness for print-like black-and-white output.

Color communicates category, emphasis, or state rather than component type. Exact component overrides remain available in every theme.
