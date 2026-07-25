/** Canonical acquisition and schema contract for `arc join`. */

import { z } from "zod";

import { CommandToolListSchema } from "./init-input.js";
import { normalizeCommandIdentity } from "../lib/command-input/identity.js";
import type { InputResolution } from "../lib/command-input/resolution.js";
import type { CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";

/** Complete canonical input for fresh join and personal reconfiguration. */
export const JoinCommandInputSchema = z.object({
  role: z.enum(["maintainer", "contributor"]),
  tools: CommandToolListSchema,
  identity: z.string().min(1).optional(),
  reconfigure: z.boolean(),
  compatibilityYes: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.reconfigure && value.identity !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["identity"],
      message: "--identity is available only for fresh workspace setup",
    });
  }
});

/** Schema-inferred canonical join object. */
export type JoinCommandInput = z.infer<typeof JoinCommandInputSchema>;

/** Registry contribution owned by the join command family. */
export const joinCommandInputRegistration = {
  commandPath: "join",
  schema: JoinCommandInputSchema,
  schemaFields: {
    "option.contributor": "role",
    "option.tools": "tools",
    "option.identity": "identity",
    "option.reconfigure": "reconfigure",
    "option.yes": "compatibilityYes",
  },
} satisfies CommandInputRegistration;

/** Command-owned acquisition policies shared syntax cannot express for join. */
export const joinCommandInputPolicyDeclarations = [{
  commandPath: "join",
  aliases: [],
  sites: [
    {
      id: "interaction.prompts-join-prompts.ts-prompt-p.select-1",
      source: {
        file: "prompts/join-prompts.ts",
        interaction: { kind: "prompt", callee: "p.select", occurrence: 1 },
      },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "role",
      defaultSource: "current role or maintainer",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--contributor"], acceptedSyntax: ["--contributor"] },
      mutationBoundary: "workspace role selection",
      subprocess: "none",
    },
    {
      id: "semantic.tools",
      source: { file: "commands/join-input.ts", symbol: "resolveJoinCommandInput" },
      origin: "declaration",
      acquisition: "safe-default",
      schemaOwnership: "owned",
      schemaField: "tools",
      defaultSource: "empty or current tool list",
      cancellation: "stop",
      automation: { noInput: "use-default", flags: ["--tools"], acceptedSyntax: ["--tools <list>"] },
      mutationBoundary: "workspace tool selection",
      subprocess: "none",
    },
    {
      id: "semantic.identity",
      source: { file: "commands/join-input.ts", symbol: "resolveJoinCommandInput" },
      origin: "declaration",
      acquisition: "handler-required",
      schemaOwnership: "owned",
      schemaField: "identity",
      cancellation: "stop",
      automation: { noInput: "require-explicit", flags: ["--identity"], acceptedSyntax: ["--identity <name>"] },
      mutationBoundary: "workspace identity resolution",
      subprocess: "none",
    },
  ],
}] satisfies readonly CommandInputDeclaration[];

/** CLI syntax retained at the join adapter boundary. */
export interface JoinCommandOptions {
  readonly contributor?: boolean;
  readonly yes?: boolean;
  readonly tools?: string;
  readonly identity?: string;
  readonly reconfigure?: boolean;
}

/** Resolve fresh or reconfigure input before any dependent workspace mutation. */
export async function resolveJoinCommandInput(input: {
  readonly options: JoinCommandOptions;
  readonly context: { readonly interaction: "allowed" | "forbidden" };
  readonly current?: {
    readonly role: "maintainer" | "contributor";
    readonly tools: readonly string[];
  };
  readonly prompt?: (supplied: {
    readonly role?: "maintainer" | "contributor";
    readonly tools?: readonly string[];
  }) => Promise<{ readonly role: string; readonly tools: readonly string[] } | null>;
  readonly resolveIdentity: (interactive: boolean) => Promise<string | null>;
}): Promise<InputResolution<JoinCommandInput>> {
  const reconfigure = input.options.reconfigure ?? false;
  if (reconfigure && input.options.identity !== undefined) {
    return {
      kind: "invalid",
      issues: [{ path: ["identity"], message: "--identity is available only for fresh workspace setup" }],
    };
  }
  const explicitIdentity = input.options.identity === undefined
    ? undefined
    : normalizeCommandIdentity(input.options.identity);
  if (input.options.identity !== undefined && explicitIdentity === null) {
    return { kind: "invalid", issues: [{ path: ["identity"], message: "Identity is not a valid slug" }] };
  }
  const suppliedRole = input.options.contributor === true ? "contributor" as const : undefined;
  const suppliedTools = input.options.tools?.split(",").map((tool) => tool.trim()).filter(Boolean);
  let values: { readonly role: string; readonly tools: readonly string[] };
  let source: "argument" | "prompt" | "default";
  if (input.context.interaction === "allowed") {
    if (input.prompt === undefined) {
      return { kind: "unavailable", missing: [{ name: "interactive join values", acceptedSyntax: [] }] };
    }
    const prompted = await input.prompt({
      ...(suppliedRole === undefined ? {} : { role: suppliedRole }),
      ...(suppliedTools === undefined ? {} : { tools: suppliedTools }),
    });
    if (prompted === null) return { kind: "cancelled" };
    values = prompted;
    source = "prompt";
  } else {
    values = {
      role: suppliedRole ?? input.current?.role ?? "maintainer",
      tools: suppliedTools ?? input.current?.tools ?? [],
    };
    source = suppliedRole !== undefined || suppliedTools !== undefined ? "argument" : "default";
  }
  const identity = reconfigure
    ? undefined
    : explicitIdentity ?? await input.resolveIdentity(input.context.interaction === "allowed");
  if (!reconfigure && identity === null) {
    return { kind: "unavailable", missing: [{ name: "identity", acceptedSyntax: ["--identity <name>"] }] };
  }
  const parsed = JoinCommandInputSchema.safeParse({
    ...values,
    ...(identity === undefined ? {} : { identity }),
    reconfigure,
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
