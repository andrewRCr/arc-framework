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
}).superRefine((check, context) => {
  if (check.shell && check.mode === "files") {
    context.addIssue({ code: "custom", path: ["mode"], message: "Shell checks require project mode." });
  }
  if (check.shell && typeof check.command !== "string") {
    context.addIssue({ code: "custom", path: ["command"], message: "A shell command must be one string." });
  }
  if (!check.shell && typeof check.command === "string") {
    context.addIssue({ code: "custom", path: ["command"], message: "A string command requires shell: true." });
  }
  if (check.shards !== undefined && !check.shards.argument.includes("{index}")) {
    context.addIssue({ code: "custom", path: ["shards", "argument"], message: "A shard argument must contain {index}." });
  }
});

export const CheckDeclarationSchema = z.strictObject({
  checks: z.record(z.string().regex(/^[a-z][a-z0-9_.:-]*$/u), CheckSchema),
  global_inputs: z.array(z.string()).default([]),
  global_runtime_inputs: z.array(ArgumentListSchema).default([]),
  commit_fixes: z.enum(["restage", "fail"]).default("restage"),
  $schema: z.string().optional(),
});
export type CheckDeclaration = z.infer<typeof CheckDeclarationSchema>;
