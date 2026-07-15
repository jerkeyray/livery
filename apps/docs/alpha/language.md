# Language reference

One file may declare reusable components followed by one `figure`. Bindings create stable identities; calls create primitives and standard components; layouts claim board regions; connectors join named anchors.

```livery
figure request("Request path") {
  client = person("Customer")
  api = service("API")
  request = client.right -> api.left("request")
  row(client, api, gap: lg)
}
```

Supported parameter types are `string`, `number`, `boolean`, and `tone`. Layout calls are `row`, `column`, `grid`, `stack`, `overlay`, and bounded `canvas`. Unsupported syntax produces a diagnostic; accepted syntax is never silently ignored.
