import { z } from "zod";

export const semanticToneSchema = z.enum(["neutral", "info", "success", "warning", "danger"]);

export const entityRoleSchema = z.enum([
  "actor",
  "service",
  "database",
  "queue",
  "worker",
  "api",
  "external",
  "document",
  "concept",
  "decision",
  "step",
]);

export const entitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  role: entityRoleSchema.optional(),
  tone: semanticToneSchema.optional(),
  source: z.string().optional(),
});

export const relationshipSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().optional(),
  tone: semanticToneSchema.optional(),
});

export const storyActionSchema = z.enum([
  "reveal",
  "hide",
  "focus",
  "indicate",
  "trace",
  "transform",
  "compare",
  "set_state",
  "enter",
  "exit",
]);

export const storyTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("entity"), id: z.string().min(1) }),
  z.object({ type: z.literal("relationship"), id: z.string().min(1) }),
]);

export const storyStepSchema = z.object({
  id: z.string().min(1),
  action: storyActionSchema,
  targets: z.array(storyTargetSchema).min(1),
});

export const liveryArtifactSchema = z.object({
  type: z.literal("livery"),
  version: z.literal("0.1"),
  id: z.string().min(1),
  title: z.string().optional(),
  composition: z.enum(["flow", "sequence", "explainer"]),
  entities: z.array(entitySchema),
  relationships: z.array(relationshipSchema),
  story: z.array(storyStepSchema).default([]),
});

export const liveryJsonSchema = z.toJSONSchema(liveryArtifactSchema);
