# Agent prompting

For architecture, process, and explainer diagrams, prefer a structured semantic plan. Pass `visualPlanSchema` directly to a structured-output or tool-calling model, then render the validated result without asking the model to write layout syntax:

```ts
import { renderVisualPlan, visualPlanSchema } from "liveryscript";

const plan = visualPlanSchema.parse(modelOutput);
const result = renderVisualPlan(plan, { width: 720 });
```

Nodes represent real entities and outcomes. Capacities, rates, response codes, constraints, and behavioral explanations belong in `annotations`. Livery keeps short annotation sets inline, places the dominant flow spine first, evaluates responsive candidates with geometry-based quality metrics, and returns canonical editable source. Inspect `result.quality` before accepting a generated plan.

Use DSL generation for specialized visual families or expert control:

Use the generated guide rather than maintaining a copied grammar prompt:

```ts
import { createAgentGuide, createRepairPrompt } from "liveryscript";

const guide = createAgentGuide({ mode: "compact" });
const repair = createRepairPrompt(source, diagnostics);
```

The compact guide is release-gated below 300 tokens. Ask for one figure, concise labels, stable bindings, coordinate-free macro layout, and a timeline only when state changes add meaning. Provider keys are never required by Livery or its CI replay harness.
