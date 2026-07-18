import { z } from "zod";

const visualScalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const visualValueSchemaAt = (depth: number): z.ZodTypeAny => depth >= 3
  ? visualScalarSchema
  : z.lazy(() => z.union([
    visualScalarSchema,
    z.array(visualValueSchemaAt(depth + 1)).max(256),
    z.record(z.string(), visualValueSchemaAt(depth + 1)).superRefine((value, context) => {
      if (Object.keys(value).length > 32) context.addIssue({ code: "custom", message: "Structured visual records support at most 32 fields." });
    }),
  ]));
const visualValueSchema = visualValueSchemaAt(0);
const styleValueSchema = visualScalarSchema;
const styleSchema = z.record(z.string(), styleValueSchema);
const layoutSchema = z.object({
  kind: z.enum(["free", "row", "column", "stack", "grid", "flow", "hierarchy", "interaction", "overlay", "canvas"]),
  gap: visualValueSchema.optional(),
  columns: z.number().int().positive().optional(),
  align: z.enum(["start", "center", "end", "stretch"]).optional(),
  distribute: z.enum(["start", "center", "end", "between", "around"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  direction: z.enum(["auto", "right", "down"]).optional(),
  rankGap: visualValueSchema.optional(),
  maxCandidates: z.number().int().min(1).max(12).optional(),
});

export const visualNodeSchema: z.ZodType = z.lazy(() => z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().optional(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  variant: z.string().optional(),
  tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
  layout: layoutSchema.optional(),
  style: styleSchema.optional(),
  props: z.record(z.string(), visualValueSchema).optional(),
  children: z.array(visualNodeSchema).optional(),
  anchors: z.array(z.enum(["top", "right", "bottom", "left", "center"])).optional(),
}));

const targetSchema = z.object({ node: z.string().min(1), anchor: z.enum(["top", "right", "bottom", "left", "center"]).optional() });
const operationSchema = z.union([
  z.object({ action: z.enum(["show", "hide", "focus", "trace"]), targets: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("set"), targets: z.array(z.string()).min(1), properties: styleSchema }),
  z.object({ action: z.literal("morph"), targets: z.tuple([z.string(), z.string()]) }),
]);

export const visualDocumentSchema = z.object({
  type: z.literal("livery.visual"),
  version: z.literal("0.2"),
  id: z.string().min(1),
  title: z.string().optional(),
  root: visualNodeSchema,
  constraints: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("align"), targets: z.array(z.string()).min(2), axis: z.enum(["x", "y"]), edge: z.enum(["start", "center", "end"]).optional() }),
    z.object({ kind: z.literal("distribute"), targets: z.array(z.string()).min(3), axis: z.enum(["x", "y"]), gap: visualValueSchema.optional() }),
    z.object({ kind: z.literal("inside"), child: z.string(), container: z.string(), padding: visualValueSchema.optional() }),
    z.object({ kind: z.literal("near"), first: z.string(), second: z.string(), distance: visualValueSchema.optional() }),
  ])).default([]),
  connectors: z.array(z.object({
    id: z.string().min(1),
    from: targetSchema,
    to: targetSchema,
    label: z.string().optional(),
    variant: z.enum(["directional", "bidirectional", "async", "data", "advisory"]).optional(),
    tone: z.enum(["neutral", "info", "success", "warning", "danger"]).optional(),
    role: z.enum(["auto", "primary", "secondary", "supporting"]).optional(),
    bundleId: z.string().min(1).optional(),
    semantic: z.enum(["message", "transition", "association", "inheritance", "composition", "aggregation", "dependency", "trace", "verify", "satisfy"]).optional(),
    messageKind: z.enum(["sync", "async", "return"]).optional(),
    fromCardinality: z.string().min(1).optional(),
    toCardinality: z.string().min(1).optional(),
    order: z.number().int().nonnegative().optional(),
    style: styleSchema.optional(),
  })).default([]),
  timelines: z.array(z.object({
    id: z.string().min(1),
    states: z.array(z.object({ id: z.string().min(1), operations: z.array(operationSchema) })),
    transitions: z.array(z.object({ from: z.string(), to: z.string(), duration: z.string().optional() })),
  })).default([]),
});
