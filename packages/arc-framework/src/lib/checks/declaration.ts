/** Typed project declarations for executable checks. */
import { z } from "zod";
import type { KernelRegistry } from "../kernel/index.js";

const ArgumentListSchema = z.array(z.string()).min(1);
const SharedFields = {
  command: z.union([ArgumentListSchema, z.string()]),
  inputs: z.array(z.string()).default(["**"]),
  runtime_inputs: z.array(ArgumentListSchema).default([]),
  root: z.string().default("."),
  shards: z.strictObject({ count: z.int().positive(), argument: z.string() }).optional(),
  no_evidence_exit: z.int().min(1).max(255).optional(),
};
const OrdinaryCheckSchema = z.strictObject({
  ...SharedFields,
  shell: z.boolean().default(false),
  gate: z.enum(["commit", "push", "merge"]).optional(),
  mode: z.enum(["files", "project"]).default("project")
    .describe("files receives selected tracked paths; project runs once over its declared inputs."),
  pass_paths: z.boolean().default(true),
  widen: z.boolean().default(true),
  fixes: z.boolean().default(false),
  ci_only: z.boolean().default(false),
  cache: z.boolean().default(true),
  reads_index: z.boolean().default(false),
});
const SelectionFields = {
  ...SharedFields,
  mode: z.literal("selection").describe("selection receives editable projected Markdown paths as feedback."),
  gate: z.never({ error: "selection cannot declare gate: no gate reads projected state." }).optional(),
  cache: z.literal(false, { error: "selection cannot enable cache: nothing keys its content." }).default(false),
  widen: z.literal(false, { error: "selection cannot enable widen: Git changes do not describe state changes." }).default(false),
  pass_paths: z.literal(true, { error: "selection requires pass_paths: only files checks can withhold paths." }).default(true),
};
const SelectionInputSchema = z.strictObject({
  ...SelectionFields,
  shell: z.never({ error: "selection cannot declare shell: shell commands cannot receive path batches." }).optional(),
  ci_only: z.never({ error: "selection cannot declare ci_only: a CI clone projects nothing." }).optional(),
  reads_index: z.never({ error: "selection cannot declare reads_index: projected files are never indexed." }).optional(),
  fixes: z.never({ error: "selection cannot declare fixes: fixer rewrites are detected only through Git." }).optional(),
});
// Validate authored presence before supplying the common execution fields.
const SelectionCheckSchema = z.codec(SelectionInputSchema, z.strictObject({
  ...SelectionFields,
  shell: z.literal(false).default(false), ci_only: z.literal(false).default(false),
  reads_index: z.literal(false).default(false), fixes: z.literal(false).default(false),
}), {
  decode: check => ({ ...check, shell: false as const, ci_only: false as const,
    reads_index: false as const, fixes: false as const }),
  encode: check => SelectionInputSchema.parse({ ...check,
    shell: undefined, ci_only: undefined, reads_index: undefined, fixes: undefined }),
});
const CheckSchema = z.union([OrdinaryCheckSchema, SelectionCheckSchema]).superRefine((check, context) => {
  if (check.shell && check.mode === "files") {
    context.addIssue({ code: "custom", path: ["mode"], message: "Shell checks require project mode." });
  }
  if (!check.pass_paths && check.mode !== "files") {
    context.addIssue({ code: "custom", path: ["pass_paths"],
      message: "Only a files check can withhold its paths; a project check never receives any." });
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
  if (check.no_evidence_exit !== undefined && check.gate !== undefined) {
    context.addIssue({ code: "custom", path: ["no_evidence_exit"],
      message: "A no-evidence exit status requires a check with no gate, since CI plays back gated checks and fails every non-zero status." });
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

/**
 * Register the declaration's shared runtime and editor-document schema.
 * @param registry - Registry receiving the project-authored contract
 * @returns The registry with the declaration registered
 */
export function registerCheckDeclarationSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(CheckDeclarationSchema, {
    id: "check-declaration", version: 1, migrationPosture: "strict-current", authored: "editor-document",
  });
  return registry;
}
