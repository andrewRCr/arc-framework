/** Typed project declarations for executable checks. */
import { z } from "zod";

const ArgumentListSchema = z.array(z.string()).min(1);
const CheckSchema = z.strictObject({
  command: z.union([ArgumentListSchema, z.string()]),
  shell: z.boolean().default(false),
  gate: z.enum(["commit", "push", "merge"]).optional(),
  mode: z.enum(["files", "project"]).default("project"),
  inputs: z.array(z.string()).default(["**"]),
  runtime_inputs: z.array(ArgumentListSchema).default([]),
  widen: z.boolean().default(true),
  root: z.string().default("."),
  fixes: z.boolean().default(false),
  ci_only: z.boolean().default(false),
  shards: z.strictObject({ count: z.int().positive(), argument: z.string() }).optional(),
  cache: z.boolean().default(true),
  reads_index: z.boolean().default(false),
});

export const CheckDeclarationSchema = z.strictObject({
  checks: z.record(z.string(), CheckSchema),
  global_inputs: z.array(z.string()).default([]),
  global_runtime_inputs: z.array(ArgumentListSchema).default([]),
  commit_fixes: z.enum(["restage", "fail"]).default("restage"),
  $schema: z.string().optional(),
});
export type CheckDeclaration = z.infer<typeof CheckDeclarationSchema>;
