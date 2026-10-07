/** Canonical acquisition and schema contract for `arc join`. */

import { z } from "zod";
import { joinRolePromptSite, joinToolsPromptSite } from "../prompts/join-prompts.js";

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
    joinRolePromptSite,
    joinToolsPromptSite,
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
  if (input.prompt === undefined) {
    return { kind: "unavailable", missing: [{ name: "interactive join values", acceptedSyntax: [] }] };
  }
  const values = await input.prompt({
    ...(suppliedRole === undefined ? {} : { role: suppliedRole }),
    ...(suppliedTools === undefined ? {} : { tools: suppliedTools }),
  });
  if (values === null) return { kind: "cancelled" };
  const source = input.context.interaction === "allowed" ? "prompt" as const
    : suppliedRole !== undefined || suppliedTools !== undefined ? "argument" as const : "default" as const;
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
