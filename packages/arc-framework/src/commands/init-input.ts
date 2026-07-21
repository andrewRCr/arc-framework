/** Canonical acquisition and schema contract for `arc init`. */

import { basename } from "node:path";

import { z } from "zod";

import { VALID_TOOL_IDS } from "../lib/skills/index.js";
import { normalizeCommandIdentity } from "../lib/command-input/identity.js";
import type { InputResolution } from "../lib/command-input/resolution.js";
import type { CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

/** Project-management modes accepted by installation configuration. */
export const ProjectManagementModeSchema = z.enum(["none", "arc-in-git", "external"]);

/** Validated tool identifiers owned by installation and workspace commands. */
export const CommandToolListSchema = z.array(z.string()).superRefine((tools, context) => {
  for (const [index, tool] of tools.entries()) {
    if (!VALID_TOOL_IDS.has(tool)) {
      context.addIssue({ code: "custom", path: [index], message: `Unknown agent tool: ${tool}` });
    }
  }
});

/** Complete canonical input for fresh init and project reconfiguration. */
export const InitCommandInputSchema = z.object({
  projectName: z.string().trim().min(1),
  tools: CommandToolListSchema,
  pmMode: ProjectManagementModeSchema,
  teamMode: z.boolean(),
  identity: z.string().min(1).optional(),
  reconfigure: z.boolean(),
  dryRun: z.boolean(),
  compatibilityYes: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.dryRun && !value.reconfigure) {
    context.addIssue({ code: "custom", path: ["dryRun"], message: "--dry-run requires --reconfigure" });
  }
  if (value.reconfigure && value.identity !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["identity"],
      message: "--identity is available only for fresh installation",
    });
  }
});

/** Schema-inferred canonical init object. */
export type InitCommandInput = z.infer<typeof InitCommandInputSchema>;

/** Registry contribution owned by the init command family. */
export const initCommandInputRegistration = {
  commandPath: "init",
  schema: InitCommandInputSchema,
  schemaFields: {
    "option.name": "projectName",
    "option.tools": "tools",
    "option.pm-mode": "pmMode",
    "option.team": "teamMode",
    "option.identity": "identity",
    "option.reconfigure": "reconfigure",
    "option.dry-run": "dryRun",
    "option.yes": "compatibilityYes",
  },
} satisfies CommandInputRegistration;

/** Command-owned acquisition policies that Commander syntax cannot express. */
export const initCommandInputPolicyDeclarations = [{
  commandPath: "init",
  aliases: [],
  sites: [
    {
      id: "interaction.handlers-shared.ts-prompt-p.text-1",
      source: {
        file: "handlers/shared.ts",
        interaction: { kind: "prompt", callee: "p.text", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "identity",
      cancellation: "stop",
      automation: { noInput: "require-explicit", flags: ["--identity"], acceptedSyntax: ["--identity <name>"] },
      mutationBoundary: "installation identity resolution",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-init-prompts.ts-prompt-p.autocompletemultiselect-1",
      source: {
        file: "prompts/init-prompts.ts",
        interaction: { kind: "prompt", callee: "p.autocompleteMultiselect", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "tools",
      defaultSource: "empty or current tool list",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--tools"], acceptedSyntax: ["--tools <list>"] },
      mutationBoundary: "installation tool selection",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-init-prompts.ts-prompt-p.text-1",
      source: {
        file: "prompts/init-prompts.ts",
        interaction: { kind: "prompt", callee: "p.text", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "projectName",
      defaultSource: "current directory name",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--name"], acceptedSyntax: ["--name <name>"] },
      mutationBoundary: "installation project configuration",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-init-prompts.ts-prompt-p.select-1",
      source: {
        file: "prompts/init-prompts.ts",
        interaction: { kind: "prompt", callee: "p.select", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "pmMode",
      defaultSource: "none",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--pm-mode"], acceptedSyntax: ["--pm-mode <mode>"] },
      mutationBoundary: "installation project configuration",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-init-prompts.ts-prompt-p.confirm-1",
      source: {
        file: "prompts/init-prompts.ts",
        interaction: { kind: "prompt", callee: "p.confirm", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "teamMode",
      defaultSource: "disabled",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--team"], acceptedSyntax: ["--team"] },
      mutationBoundary: "installation project configuration",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-reconfigure-prompts.ts-prompt-p.text-1",
      source: {
        file: "prompts/reconfigure-prompts.ts",
        interaction: { kind: "prompt", callee: "p.text", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "projectName",
      defaultSource: "current project name",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--name"], acceptedSyntax: ["--name <name>"] },
      mutationBoundary: "reconfiguration project settings",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-reconfigure-prompts.ts-prompt-p.select-1",
      source: {
        file: "prompts/reconfigure-prompts.ts",
        interaction: { kind: "prompt", callee: "p.select", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "pmMode",
      defaultSource: "current project-management mode",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--pm-mode"], acceptedSyntax: ["--pm-mode <mode>"] },
      mutationBoundary: "reconfiguration project settings",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-reconfigure-prompts.ts-prompt-p.confirm-1",
      source: {
        file: "prompts/reconfigure-prompts.ts",
        interaction: { kind: "prompt", callee: "p.confirm", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "teamMode",
      defaultSource: "current team mode",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--team"], acceptedSyntax: ["--team"] },
      mutationBoundary: "reconfiguration project settings",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-removal-prompts.ts-prompt-p.select-1",
      source: {
        file: "prompts/removal-prompts.ts",
        interaction: { kind: "prompt", callee: "p.select", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "none",
      defaultSource: "classification-derived bulk removal action",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
      mutationBoundary: "reconfiguration removal plan",
      subprocess: "none",
    },
    {
      id: "interaction.prompts-removal-prompts.ts-prompt-p.select-2",
      source: {
        file: "prompts/removal-prompts.ts",
        interaction: { kind: "prompt", callee: "p.select", occurrence: 2 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "none",
      defaultSource: "classification-derived per-file removal action",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
      mutationBoundary: "reconfiguration removal plan",
      subprocess: "none",
    },
  ],
}] satisfies readonly CommandInputDeclaration[];

/** CLI syntax retained at the adapter boundary. */
export interface InitCommandOptions {
  readonly yes?: boolean;
  readonly name?: string;
  readonly pmMode?: string;
  readonly tools?: string;
  readonly team?: boolean;
  readonly identity?: string;
  readonly reconfigure?: boolean;
  readonly dryRun?: boolean;
}

/** Complete structural values returned by the interactive prompt sequence. */
export interface InitAcquiredValues {
  readonly projectName: string;
  readonly tools: readonly string[];
  readonly pmMode: string;
  readonly teamMode: boolean;
}

function invalid(path: readonly PropertyKey[], message: string): InputResolution<never> {
  return { kind: "invalid", issues: [{ path, message }] };
}

function toolsFromCsv(value: string | undefined): readonly string[] | undefined {
  return value?.split(",").map((tool) => tool.trim()).filter(Boolean);
}

/** Resolve fresh or reconfigure input before any dependent installation mutation. */
export async function resolveInitCommandInput(input: {
  readonly options: InitCommandOptions;
  readonly cwd: string;
  readonly context: { readonly interaction: "allowed" | "forbidden" };
  readonly current?: {
    readonly projectName: string;
    readonly pmMode: string;
    readonly teamMode: boolean;
  };
  readonly prompt?: (
    supplied: Partial<InitAcquiredValues>,
  ) => Promise<InitAcquiredValues | null>;
  readonly resolveIdentity: (interactive: boolean) => Promise<string | null>;
}): Promise<InputResolution<InitCommandInput>> {
  const reconfigure = input.options.reconfigure ?? false;
  if (reconfigure && input.options.identity !== undefined) {
    return invalid(["identity"], "--identity is available only for fresh installation");
  }
  if (input.options.identity !== undefined && normalizeCommandIdentity(input.options.identity) === null) {
    return invalid(["identity"], "Identity must contain at least one letter or number");
  }

  const supplied: Partial<InitAcquiredValues> = {
    ...(input.options.name === undefined ? {} : { projectName: input.options.name }),
    ...(input.options.tools === undefined ? {} : { tools: toolsFromCsv(input.options.tools) }),
    ...(input.options.pmMode === undefined ? {} : { pmMode: input.options.pmMode }),
    ...(input.options.team === undefined ? {} : { teamMode: input.options.team }),
  };
  let acquired: InitAcquiredValues;
  let source: "argument" | "prompt" | "default";
  if (input.context.interaction === "allowed") {
    if (input.prompt === undefined) {
      return { kind: "unavailable", missing: [{ name: "interactive init values", acceptedSyntax: [] }] };
    }
    const prompted = await input.prompt(supplied);
    if (prompted === null) return { kind: "cancelled" };
    acquired = prompted;
    source = "prompt";
  } else {
    acquired = {
      projectName: supplied.projectName ?? input.current?.projectName ?? basename(input.cwd),
      tools: supplied.tools ?? [],
      pmMode: supplied.pmMode ?? input.current?.pmMode ?? "none",
      teamMode: supplied.teamMode ?? input.current?.teamMode ?? false,
    };
    source = Object.keys(supplied).length > 0 ? "argument" : "default";
  }

  const identity = reconfigure
    ? undefined
    : input.options.identity === undefined
      ? await input.resolveIdentity(input.context.interaction === "allowed")
      : normalizeCommandIdentity(input.options.identity);
  if (!reconfigure && identity === null) {
    return { kind: "unavailable", missing: [{ name: "identity", acceptedSyntax: ["--identity <name>"] }] };
  }
  const parsed = InitCommandInputSchema.safeParse({
    ...acquired,
    ...(identity === undefined ? {} : { identity }),
    reconfigure,
    dryRun: input.options.dryRun ?? false,
    compatibilityYes: input.options.yes ?? false,
  });
  if (!parsed.success) {
    return {
      kind: "invalid",
      issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    };
  }
  return { kind: "resolved", value: parsed.data, source };
}
