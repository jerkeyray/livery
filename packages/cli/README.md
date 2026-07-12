# @livery/cli

Command-line renderer for Livery source files. It emits SVG, deterministic JSON, or PNG and supports stdin for agent and CI workflows.

```sh
livery diagram.livery -o diagram.svg
livery diagram.livery -o diagram.png --scale 2
cat diagram.livery | livery - --format json --pretty
```
