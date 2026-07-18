# Language reference

One file may declare reusable components followed by one `figure`. Bindings create stable identities; calls create primitives and standard components; layouts claim board regions; connectors join named anchors. Use `flow(...)` for connected architectures, `hierarchy(...)` for reporting trees, and `interaction(...)` for ordered participant narratives.

```livery
figure request("Request path") {
  client = person("Customer")
  api = service("API")
  request = client.right -> api.left("request")
  row(client, api, gap: lg)
}
```

Visual values include bounded strings, numbers, booleans, token references, lists, and records. Records make schema fields and methods structural rather than prose:

```livery
figure account_schema("Account schema") {
  account = entity("Account", fields: [
    { name: "id", type: "uuid", key: true },
    { name: "email", type: "string" }
  ])
  row(account)
}
```

Interaction messages remain ordinary typed connectors:

```livery
figure lookup("Account lookup") {
  client = participant("Client")
  api = participant("API")
  request = connect(client.right, api.left,
    label: "lookup", semantic: message, messageKind: sync, order: 0)
  response = connect(api.left, client.right,
    label: "account", semantic: message, messageKind: return, order: 1)
  interaction(client, api)
}
```

Connector semantics also cover transitions, associations, inheritance, composition, aggregation, dependencies, traceability, verification, and satisfaction. Unsupported syntax produces a diagnostic; accepted syntax is never silently ignored.
