# Livery

Livery is an agent-native visual language and browser runtime for generating correct, responsive, interactive visual explanations from compact model output.

The project is in its foundation phase. The language and public APIs are not stable yet.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
bun run dev
```

The benchmark corpus in `fixtures/benchmarks` defines the first supported visual behaviors before the DSL grammar is frozen.
