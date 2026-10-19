/**
 * Handler for `arc user inbox-list`: reports which `USER-INBOX` captures still
 * name one work unit, so a lifecycle gate dispatches on a typed result instead
 * of scanning the inbox itself.
 *
 * @module
 */

import { z } from "zod";
import { createStore, createDefaultStorePorts } from "../lib/store/index.js";
import { inboxOutput, type InboxHandlerPorts } from "./inbox-runtime.js";

import { runUserInboxList } from "../commands/user.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { resolveIdentity } from "../lib/git/index.js";
import { createGitExec, createUserIOContext } from "../lib/io-context.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { resolveArcRoot } from "../lib/paths.js";
import * as p from "../lib/terminal.js";

/** Options for `arc user inbox-list`. */
export interface UserInboxListCommandOptions {
  target?: string;
  json?: boolean;
}

/** Validated command input: the work unit's slug and the output mode. */
export const UserInboxListInputSchema = z.strictObject({
  target: SlugSchema,
  json: z.boolean().optional(),
});

const InboxTargetEntrySchema = z.strictObject({
  title: z.string().min(1),
  section: z.enum(["Errand", "Work Unit"]),
  held: z.boolean(),
});

const ResultBase = {
  schemaVersion: z.literal(1),
  mode: z.literal("user-inbox-list"),
};

/** Closed result contract: no capture names the target, some do, or the inbox could not be read safely. */
export const UserInboxListResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ResultBase,
    state: z.literal("clear"),
    nextAction: z.literal("none"),
    target: SlugSchema,
    entries: z.array(InboxTargetEntrySchema).length(0),
  }),
  z.strictObject({
    ...ResultBase,
    state: z.literal("named"),
    nextAction: z.literal("route-captures"),
    target: SlugSchema,
    entries: z.array(InboxTargetEntrySchema).min(1),
  }),
  z.strictObject({
    ...ResultBase,
    state: z.literal("refused"),
    nextAction: z.literal("stop"),
    reason: z.string().min(1),
    code: z.literal("unsupported").optional(),
    remedy: z.string().min(1),
  }),
]);

/** One typed `arc user inbox-list` result. */
export type UserInboxListCommandResult = z.infer<typeof UserInboxListResultSchema>;

function refused(reason: string, remedy: string): Extract<UserInboxListCommandResult, { state: "refused" }> {
  return { schemaVersion: 1, mode: "user-inbox-list", state: "refused", nextAction: "stop", reason, remedy };
}

async function resolveUserInboxList(
  opts: UserInboxListCommandOptions,
  context?: InteractionContext,
  ports: InboxHandlerPorts = {},
): Promise<UserInboxListCommandResult> {
  const store = ports.store ?? createStore(createDefaultStorePorts({ checkoutRoot: ports.cwd ?? process.cwd(), exec: createGitExec(context?.subprocess) }));
  if (store.capabilities.stateOffBranch) return { ...refused("This title-keyed inbox listing is unsupported with off-branch state.", "Use arc inbox personal --target <slug>."), code: "unsupported" };
  const parsed = UserInboxListInputSchema.safeParse(opts);
  if (!parsed.success) return refused(z.prettifyError(parsed.error), "Pass the work unit's slug as --target.");
  const target = parsed.data.target;
  const cwd = ports.cwd ?? resolveArcRoot(process.cwd());
  if (cwd === null) return refused("ARC project root is unavailable.", "Run from an ARC project checkout.");
  const identity = await resolveIdentity({ exec: createGitExec(context?.subprocess) });
  if (identity === null) {
    return refused("No identity resolved.", "Set `arc.identity` for this checkout.");
  }
  const { listing } = await runUserInboxList({
    cwd,
    io: createUserIOContext(context?.subprocess),
    identity,
    target,
  });
  if (listing.diagnostics.length > 0) {
    return refused(
      `The inbox holds entries that could not be read, and any of them may name ${target}. `
        + listing.diagnostics.join(" "),
      "Repair the reported inbox entries, then retry.",
    );
  }
  const entries = [...listing.entries];
  if (entries.length === 0) {
    return { schemaVersion: 1, mode: "user-inbox-list", state: "clear", nextAction: "none", target, entries: [] };
  }
  return { schemaVersion: 1, mode: "user-inbox-list", state: "named", nextAction: "route-captures", target, entries };
}

/** Render one result as human text. */
function describe(result: UserInboxListCommandResult): string {
  if (result.state === "refused") return `${result.reason} ${result.remedy}`;
  if (result.state === "clear") return `No inbox capture names ${result.target}.`;
  const lines = result.entries.map((entry) => `- ${entry.title}${entry.held ? " (held)" : ""}`);
  return [`Inbox captures naming ${result.target}:`, ...lines].join("\n");
}

/**
 * List the `USER-INBOX` captures whose target line names one work unit.
 *
 * @param opts - The target slug and output mode.
 * @param context - Interaction context carrying the subprocess policy.
 */
export async function handleUserInboxList(
  opts: UserInboxListCommandOptions,
  context?: InteractionContext,
  ports: InboxHandlerPorts = {},
): Promise<void> {
  const json = opts.json === true;
  if (!json) p.intro("arc user inbox-list");
  let result: UserInboxListCommandResult;
  try {
    result = UserInboxListResultSchema.parse(await resolveUserInboxList(opts, context, ports));
  } catch (error) {
    result = refused(
      error instanceof Error ? error.message : String(error),
      "Resolve the reported identity, inbox read, or lock failure, then retry.",
    );
  }
  inboxOutput(ports).exit(result.state === "refused" ? 1 : 0);
  if (json) {
    inboxOutput(ports).stdout(`${JSON.stringify(result)}\n`);
    return;
  }
  if (result.state === "refused") {
    p.log.error(describe(result));
    return;
  }
  p.log.info(describe(result));
  p.outro("Done.");
}

/** Registry contribution for the target listing's input schema. */
export const userInboxListCommandInputRegistration = {
  commandPath: "user inbox-list",
  schema: UserInboxListInputSchema,
  schemaFields: { "option.target": "target", "option.json": "json" },
} as const satisfies CommandInputRegistration;

/** Output-mode policy the option syntax cannot express. */
export const userInboxListCommandInputPolicyDeclarations = [{
  commandPath: "user inbox-list",
  aliases: [],
  sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
    cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}] satisfies readonly CommandInputDeclaration[];
