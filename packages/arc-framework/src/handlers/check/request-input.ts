/** Command-owned input schemas and policies for declared check forms. */
import { z } from "zod";
import { declareCliOptionSite, declareCliOperandSite, declareInteractionSite, type CommandInputDeclaration } from "../../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../../lib/command-input/registry.js";
const common = { json: z.boolean().optional(), force: z.boolean().optional(),
  dryRun: z.boolean().optional(), serial: z.boolean().optional() };
const ci = z.boolean().optional();
const scopes = { staged: z.boolean().optional(), changed: z.boolean().optional(), all: z.boolean().optional(),
  range: z.union([z.literal(true), z.string().min(1)]).optional(), paths: z.array(z.string().min(1)).min(1).optional() };
/** Common non-hook request options. */
export const CheckIncrementInputSchema = z.strictObject({ ...common, ci });
/** Hook syntax deliberately excludes the CI flag. */
export const CheckPreCommitInputSchema = z.strictObject(common);
/** Push hook operands remain present even when the manager passes empty strings. */
export const CheckPrePushInputSchema = z.strictObject({ ...common, remote: z.string(), url: z.string() });
/** Named check and gate scope options. */
export const CheckScopeInputSchema = z.strictObject({ ...common, ci, ...scopes }).superRefine((input, context) => {
  if ([input.staged, input.changed, input.all, input.range, input.paths].filter(value => value !== undefined && value !== false).length > 1) {
    context.addIssue({ code: "custom", message: "Conflicting scopes; provide exactly one scope and retry." });
  }
});
/** Canonical gate request syntax. */
export const CheckGateInputSchema = CheckScopeInputSchema.safeExtend({ gate: z.enum(["commit", "push", "merge"]) });
/** Canonical by-id request syntax. */
export const CheckRunInputSchema = CheckScopeInputSchema.safeExtend({ ids: z.array(z.string().min(1)).min(1) });
/** Independently registered segment request syntax. */
export const CheckSegmentInputSchema = CheckIncrementInputSchema.clone();
/** Explicit earlier-head syntax. */
export const CheckNewHeadInputSchema = CheckIncrementInputSchema.extend({ from: z.string().min(1) });
export type CheckIncrementOptions = z.infer<typeof CheckIncrementInputSchema>;
export type CheckScopeOptions = z.infer<typeof CheckScopeInputSchema>;
const commonFields = { "option.json": "json", "option.force": "force", "option.dry-run": "dryRun", "option.serial": "serial" };
const scopeFields = { "option.staged": "staged", "option.changed": "changed", "option.all": "all", "option.range": "range", "option.paths": "paths" };
/** Registrations composed without sharing a schema identity across command paths. */
export const checkRequestInputRegistrations: readonly CommandInputRegistration[] = [
  { commandPath: "check increment", schema: CheckIncrementInputSchema, schemaFields: { ...commonFields, "option.ci": "ci" } },
  { commandPath: "check pre-commit", schema: CheckPreCommitInputSchema, schemaFields: commonFields },
  { commandPath: "check pre-push", schema: CheckPrePushInputSchema, schemaFields: { ...commonFields, "operand.remote": "remote", "operand.url": "url" } },
  { commandPath: "check gate", schema: CheckGateInputSchema, schemaFields: { ...commonFields, ...scopeFields, "option.ci": "ci", "operand.gate": "gate" } },
  { commandPath: "check run", schema: CheckRunInputSchema, schemaFields: { ...commonFields, ...scopeFields, "option.ci": "ci", "operand.ids": "ids" } },
  { commandPath: "check segment", schema: CheckSegmentInputSchema, schemaFields: { ...commonFields, "option.ci": "ci" } },
  { commandPath: "check new-head", schema: CheckNewHeadInputSchema, schemaFields: { ...commonFields, "option.ci": "ci", "option.from": "from" } },
];
/** Explicit syntax and process policies for every declared check form. */
export const checkInputPolicyDeclarations: readonly CommandInputDeclaration[] = checkRequestInputRegistrations.map(registration => ({
  commandPath: registration.commandPath, aliases: [], sites: [
    ...Object.entries(registration.schemaFields ?? {}).map(([site, field]) => {
      const operand = site.startsWith("operand.");
      const name = site.slice(site.indexOf(".") + 1);
      const policy = {
        acquisition: operand || name === "from" ? "parser-required" as const : name === "json" ? "machine-mode" as const : "optional" as const,
        schemaOwnership: "owned" as const, schemaField: field, cancellation: "not-applicable" as const,
        automation: { noInput: operand || name === "from" ? "require-explicit" as const : "same" as const,
          flags: operand ? [] : [`--${name}`], acceptedSyntax: operand ? [`<${name}>`] : [] },
        mutationBoundary: name === "json" ? "output selection" : "declared check request", subprocess: "none" as const,
      };
      return operand ? declareCliOperandSite(name, policy) : declareCliOptionSite(name, policy);
    }),
    ...([1, 3] as const).map(occurrence => declareInteractionSite(
      { file: "lib/git/process-executor.ts", kind: "subprocess", callee: "execa", occurrence },
      { acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "disable-terminal-input", flags: [], acceptedSyntax: [] },
        mutationBoundary: "check repository snapshot", subprocess: "terminal-prompts" },
    )),
    ...(registration.commandPath === "check pre-push" ? [
      declareInteractionSite({ file: "handlers/check/run-cli.ts", kind: "environment-policy", callee: "process.stdin", occurrence: 1 },
        { acquisition: "derived", derivationSource: "process.stdin.isTTY", schemaOwnership: "none", cancellation: "not-applicable",
          automation: { noInput: "same", flags: [], acceptedSyntax: [] }, mutationBoundary: "push input policy", subprocess: "none" }),
      declareInteractionSite({ file: "handlers/check/run-cli.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence: 1 },
        { acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
          automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: [] }, mutationBoundary: "push ref input", subprocess: "explicit-stdin" }),
    ] : []),
    declareInteractionSite({ file: "handlers/check/run-cli.ts", kind: "subprocess", callee: "execa", occurrence: 1 },
      { acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "same", flags: [], acceptedSyntax: [] }, mutationBoundary: "declared check execution", subprocess: "close-stdin" }),
  ],
}));
