# Themes

All renderers consume the same serializable `LiveryTheme`. Override semantic tokens at render time:

```ts
render(source, {
  tokenOverrides: { "color.accent": "#c0264f" }
});
```

Primitive properties take precedence over component variants, caller overrides, theme values, and canonical fallbacks. The alpha ships one technical-editorial canonical theme; color communicates state rather than component category.
