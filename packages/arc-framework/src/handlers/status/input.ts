/** Status command input schema, options, and registry declarations. */

import { z } from "zod";
import { declareCliOptionSite, type CommandInputDeclaration } from "../../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../../lib/command-input/registry.js";
import { SlugSchema } from "../../lib/kernel/index.js";

export interface StatusCliOptions {
  sessionInit?: boolean;
  sessionHandoff?: boolean;
  recover?: boolean;
  user?: boolean;
  project?: boolean;
  /** `--local`: render explicit user/project views from local refs without a network read. */
  local?: boolean;
  /** `--staged`: render the `--project` view's tree inputs from the git index (the pre-commit regen source). */
  staged?: boolean;
  /** `--write`: with `--project --staged`, write the rendered view to the tracked ROADMAP atomically. */
  write?: boolean;
  /** `true` opts a slug query into live membership; `false` skips network reads for live-default views. */
  fetch?: boolean;
  json?: boolean;
  /** With --session-init: write the machine-local compaction seed sidecar. */
  writeCompactionSeed?: boolean;
}

/** Validated composite status mode and optional subject. */
export const StatusCommandInputSchema = z.object({
  slug: SlugSchema.optional(),
  sessionInit: z.boolean().optional(),
  sessionHandoff: z.boolean().optional(),
  recover: z.boolean().optional(),
  user: z.boolean().optional(),
  project: z.boolean().optional(),
  local: z.boolean().optional(),
  staged: z.boolean().optional(),
  write: z.boolean().optional(),
  fetch: z.boolean().optional(),
  json: z.boolean().optional(),
  writeCompactionSeed: z.boolean().optional(),
}).strict().superRefine((value, refinement) => {
  const modes = [value.slug !== undefined, value.sessionInit, value.sessionHandoff, value.recover, value.user, value.project]
    .filter(Boolean).length;
  if (modes > 1) {
    refinement.addIssue({
      code: "custom",
      message: "A status <slug> query, --session-init, --session-handoff, --recover, --user, and --project are mutually exclusive.",
    });
  }
  if (value.writeCompactionSeed === true && value.sessionInit !== true) {
    refinement.addIssue({ code: "custom", path: ["writeCompactionSeed"], message: "Requires --session-init." });
  }
  if (value.staged === true && value.project !== true) {
    refinement.addIssue({ code: "custom", path: ["staged"], message: "Requires --project." });
  }
  if (value.write === true && (value.staged !== true || value.json === true)) {
    refinement.addIssue({ code: "custom", path: ["write"], message: "Requires --project --staged without --json." });
  }
});

/** Registry contribution owned by composite status. */
export const statusCommandInputRegistration = {
  commandPath: "status",
  schema: StatusCommandInputSchema,
  schemaFields: {
    "operand.slug": "slug",
    "option.session-init": "sessionInit",
    "option.session-handoff": "sessionHandoff",
    "option.recover": "recover",
    "option.user": "user",
    "option.project": "project",
    "option.local": "local",
    "option.no-fetch": "fetch",
    "option.staged": "staged",
    "option.write": "write",
    "option.fetch": "fetch",
    "option.json": "json",
    "option.write-compaction-seed": "writeCompactionSeed",
  },
} satisfies CommandInputRegistration;

/** Machine-output policies owned by the status adapter. */
export const statusCommandInputPolicyDeclarations = [{
  commandPath: "status",
  aliases: [],
  sites: ([
    ["json", "json"], ["recover", "recover"], ["session-handoff", "sessionHandoff"],
    ["session-init", "sessionInit"],
  ] as const).map(([option, schemaField]) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField,
    cancellation: "not-applicable", automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })).concat({
    id: "semantic.interaction-context",
    source: { file: "handlers/status.ts", symbol: "handleStatus" },
    origin: "declaration",
    acquisition: "derived",
    schemaOwnership: "none",
    derivationSource: "shared InteractionContext",
    cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--no-input", "--json"], acceptedSyntax: [] },
    mutationBoundary: "status probe orchestration",
    subprocess: "terminal-prompts",
  }),
}] satisfies readonly CommandInputDeclaration[];
