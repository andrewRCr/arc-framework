/**
 * Handlers for `arc user` subcommands: add, save, load, push, pull.
 *
 * @module
 */

import { access } from "node:fs/promises";

import * as p from "@clack/prompts";
import { z } from "zod";

import {
  findStaleUserWuSubdirs, listUserWuSubdirContents, removeStaleUserWuSubdir,
  reconcileRetiredSubdirsStandalone,
  runUserCompact,
  runUserClose, runUserInboxRemove, runUserOpen,
  runUserSave, runUserLoad, runUserAdd, runUserPush, runUserFetch, runUserPull,
  runUserSessionInitStatus, runUserStatus,
  buildSaveSummary, buildLoadSummary, buildUserCompactSummary,
  buildUserSessionInitStatusSummary, buildUserStatusSummary,
  hasLocalNotes,
  hasSaveWarnings,
  UserPushBlockedError,
  type UserCompactResult,
  type UserIOContext,
} from "../commands/user.js";
import { isRefusalCondition } from "../lib/git/index.js";
import { normalizeCommandIdentity } from "../lib/command-input/identity.js";
import { SlugSchema } from "../lib/kernel/index.js";
import {
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import { resolveInboxEntryOperand } from "../lib/inbox-entry-operand.js";
import { resolveCurrentWuName } from "../lib/user-sync/index.js";
import { formatError, UserFacingError, type ArcErrorCode } from "../lib/errors.js";
import { getInternalTemplatePath, resolveArcRoot } from "../lib/paths.js";
import { createUserIOContext } from "../lib/io-context.js";
import {
  resolveProcessInteractionContext,
  type InteractionContext,
} from "../lib/command-input/interaction-context.js";
import { createSyncOutput, type SyncOutput } from "../lib/sync-output.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { pushNotesWithReconcile } from "./push-recovery.js";
import { gitFailureText } from "../lib/git/process-error.js";
import {
  runWithSpinner, isHandledError,
  requireArcProjectRoot, resolveUserIdentity, isRemoteError,
  resolveCurrentBranchName, ARC_PROJECT_ROOT_ERROR,
  isUserFetchOutcome, isUserFetchSuccess, reportUserFetchOutcome,
} from "./shared.js";

/** Uniform overwrite-confirm prompt copy. */
const OVERWRITE_CONFIRM_MESSAGE = "Local notes will be overwritten by remote. Continue?";

// --- Add ---

/** Validated input for creating an identity workspace. */
export const UserAddInputSchema = z.object({ identity: SlugSchema }).strict();

export async function handleUserAdd(
  rawIdentity: string,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc user add");
  const output = createSyncOutput(false);

  const normalizedIdentity = normalizeCommandIdentity(rawIdentity);
  const parsed = UserAddInputSchema.safeParse({ identity: normalizedIdentity });
  if (!parsed.success) {
    p.log.error("Invalid identity — must contain at least one alphanumeric character.");
    return;
  }
  const identity = parsed.data.identity;
  if (identity !== rawIdentity) {
    p.log.info(`Identity normalized to: ${identity}`);
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const io = createUserIOContext(context?.subprocess);

  try {
    await runWithSpinner(
      output,
      `Creating user directory for ${identity}...`,
      () => runUserAdd({ cwd, io, identity, internalTemplateDir: getInternalTemplatePath() }),
      `User directory created for ${identity}.`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Open ---

/**
 * Open a per-WU user workspace subdir at `user/{identity}/{wuName}/`.
 *
 * Shipped, drift-free retired subdirs are reconciled away up front (reversibly,
 * via {@link reconcileRetiredSubdirsStandalone}) with no prompt — their shipped
 * status is proof, not a decision. Any residual unresolvable subdir (not shipped,
 * or carrying local drift) is surfaced for a keep/remove choice that defaults to
 * the non-destructive keep and never aborts the open: under a non-interactive
 * environment it auto-skips to keep rather than hanging on a cancellable prompt.
 */
export async function handleUserOpen(
  wuName: string,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false, machineReadable: false, yes: "absent",
  });
  p.intro("arc user open");
  const output = createSyncOutput(false);
  const target = SlugSchema.safeParse(wuName);
  if (!target.success) {
    p.log.error("Invalid work-unit name.");
    process.exitCode = 1;
    return;
  }

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext(context.subprocess);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const reconciled = await reconcileRetiredSubdirsStandalone({ cwd, io, identity });
  for (const subdir of reconciled) {
    p.log.info(`Reconciled retired subdir user/${identity}/${subdir}/ (shipped; backed up).`);
  }

  const staleSubdirs = await findStaleUserWuSubdirs({ cwd, io, identity, wuName: target.data });
  for (const stale of staleSubdirs) {
    await resolveResidualStaleSubdir({ cwd, io, identity, stale, context });
  }

  try {
    await runWithSpinner(
      output,
      `Opening user workspace for ${target.data}...`,
      () => runUserOpen({
        cwd, io, identity, wuName: target.data, internalTemplateDir: getInternalTemplatePath(),
      }),
      `User workspace opened at user/${identity}/${target.data}/.`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

/**
 * Decide what to do with a residual stale subdir the reconcile couldn't clear
 * (not shipped, or carrying local drift). Never aborts the open and never
 * default-deletes: the default is the non-destructive keep, removal is explicit,
 * and a non-interactive environment auto-skips to keep rather than hanging on a
 * cancellable prompt. `inspect` lists contents and re-prompts.
 */
async function resolveResidualStaleSubdir(options: {
  cwd: string;
  io: UserIOContext;
  identity: string;
  stale: string;
  context: InteractionContext;
}): Promise<void> {
  const { cwd, io, identity, stale, context } = options;

  // Non-interactive: keep silently. A clack prompt would auto-cancel here and,
  // pre-fix, abort the whole open — so skip to the safe default instead.
  if (context.interaction === "forbidden") {
    p.log.info(`Keeping stale subdir user/${identity}/${stale}/ (non-interactive).`);
    return;
  }

  for (;;) {
    const choice = await p.select({
      message: `Stale subdir user/${identity}/${stale}/ from prior WU.`,
      initialValue: "keep",
      options: [
        { value: "keep", label: "keep — leave it in place" },
        { value: "remove", label: "remove — delete the subdir" },
        { value: "inspect", label: "inspect — list subdir contents" },
      ],
    });
    // A cancel (ctrl-C) resolves to the non-destructive default, never an abort.
    if (p.isCancel(choice) || choice === "keep") return;
    if (choice === "remove") {
      await removeStaleUserWuSubdir({ cwd, identity, subdir: stale });
      return;
    }
    const entries = await listUserWuSubdirContents({ cwd, io, identity, subdir: stale });
    if (entries.length === 0) {
      p.log.info(`(user/${identity}/${stale}/ is empty)`);
    } else {
      p.note(
        entries.map((e) => `  ${e.name} (${e.size} bytes)`).join("\n"),
        `Contents of user/${identity}/${stale}/`,
      );
    }
  }
}

// --- Close ---

/**
 * Close a per-WU user workspace subdir at `user/{identity}/{wuName}/`.
 * Recursive remove; idempotent on absent subdir.
 */
export async function handleUserClose(wuName: string): Promise<void> {
  p.intro("arc user close");
  const output = createSyncOutput(false);
  const target = SlugSchema.safeParse(wuName);
  if (!target.success) {
    p.log.error("Invalid work-unit name.");
    process.exitCode = 1;
    return;
  }

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  try {
    await runWithSpinner(
      output,
      `Closing user workspace for ${target.data}...`,
      () => runUserClose({ cwd, identity, wuName: target.data }),
      `User workspace closed (user/${identity}/${target.data}/).`,
    );
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

/**
 * Drop the slug-matched entry from the developer's `USER-INBOX`. Idempotent —
 * an absent entry or a missing inbox reports a clean no-op rather than failing,
 * so the errand-completion / drain / finalize call sites can replay it freely.
 */
/** Options for the `arc user inbox-remove` subcommand. */
export interface UserInboxRemoveOptions {
  /** UTF-8 file containing the capture's inner bold title, or `-` for stdin. */
  inboxTitleFile?: string;
  /** Compatibility alias of `inboxTitleFile`. */
  inboxEntryFile?: string;
}

/** Validated, mutually exclusive title sources for inbox removal. */
export const UserInboxRemoveInputSchema = z.object({
  literal: z.string().min(1).optional(),
  inboxTitleFile: z.string().min(1).optional(),
  inboxEntryFile: z.string().min(1).optional(),
}).strict().superRefine((value, refinement) => {
  const count = [value.literal, value.inboxTitleFile, value.inboxEntryFile]
    .filter((candidate) => candidate !== undefined).length;
  if (count !== 1) refinement.addIssue({ code: "custom", message: "Provide exactly one inbox title source." });
});

export async function handleUserInboxRemove(
  literal: string | undefined,
  opts: UserInboxRemoveOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc user inbox-remove");

  const parsed = UserInboxRemoveInputSchema.safeParse({ literal, ...opts });
  if (!parsed.success) {
    p.log.error(z.prettifyError(parsed.error));
    process.exitCode = 1;
    return;
  }

  let slug: string;
  try {
    slug = await resolveInboxEntryOperand({
      literal: parsed.data.literal,
      file: parsed.data.inboxTitleFile ?? parsed.data.inboxEntryFile,
    });
  } catch (err) {
    p.log.error(`Could not resolve the inbox entry title: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  try {
    const io = createUserIOContext(context?.subprocess);
    const result = await runUserInboxRemove({ cwd, io, identity, slug });
    if (result.removed) p.log.success(`Removed USER-INBOX entry: ${slug}`);
    else if (result.inboxMissing) p.log.info(`No USER-INBOX for ${identity}; nothing to remove.`);
    else p.log.info(`No matching USER-INBOX entry (already absent): ${slug}`);
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Save ---

export async function handleUserSave(): Promise<void> {
  p.intro("arc user save");
  const output = createSyncOutput(false);

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext();
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  try {
    const currentWuName = await resolveCurrentWuName(cwd, io.exec);
    const result = await runWithSpinner(
      output,
      "Saving user directory...",
      () => runUserSave({ cwd, io, identity, currentWuName }),
      "Save complete.",
    );
    p.note(buildSaveSummary(result), "Saved");

    if (hasSaveWarnings(result)) {
      p.log.warn("Save completed with warnings (see details above).");
    }
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }

  p.outro("Done.");
}

// --- Load ---

export interface UserLoadOptions {
  yes?: boolean;
  /** Override the auto-derived current WU name. Absent → derive from active-meta / branch. */
  currentWuName?: string;
}

export async function handleUserLoad(
  opts: UserLoadOptions = {},
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: false,
    yes: opts.yes === true ? "compatibility" : "absent",
  });
  p.intro("arc user load");
  const output = createSyncOutput(false);

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext(context.subprocess);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const spinner = output.spinner();
  spinner.start("Loading user directory...");

  let result;
  try {
    const currentWuName = opts.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);
    result = await runUserLoad({
      cwd,
      io,
      identity,
      currentWuName,
    });
  } catch (err) {
    spinner.stop("Load failed.");
    if (err instanceof UserFacingError) {
      p.log.error(formatError(err));
      return;
    }
    throw err;
  }

  if (!result) {
    spinner.stop("No note found.");
    p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
    return;
  }

  spinner.stop("Load complete.");
  p.note(buildLoadSummary(result), "Loaded");

  p.outro("Done.");
}

// --- Push ---

export interface UserPushOptions {
  force?: boolean;
}

/**
 * Handle `arc user push`.
 *
 * Default path runs through `pushNotesWithReconcile`, which gates on the
 * pushability pre-check, surfaces no-op detection, and auto-reconciles a
 * non-fast-forward (a concurrent worktree pushed first) losslessly via
 * `git notes merge` before re-pushing — no prompt. Block-disposition
 * conditions (rebase in progress, detached HEAD) refuse the push; advisory
 * `force-push-required` is not refused at this site — divergence reconciles
 * automatically (see `commands/user/push-fetch.ts`).
 *
 * **`--force` escape hatch.** Explicit user opt-in bypasses both the
 * pushability pre-check (block-disposition conditions still throw via
 * `UserPushBlockedError`) and the reconcile entirely, executing
 * `git push --force` against the notes ref. By-design unguarded — matches
 * `git push --force` semantics. Automatic pushes never reach this branch:
 * `arc sync`, the handoff cascade, and any other internal caller leaves
 * `force` unset, so the I7 advisory-refusal contract still covers every
 * non-explicit push.
 */
export async function handleUserPush(
  opts: UserPushOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc user push");
  const output = createSyncOutput(false);

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (isHandledError(err)) return;
    throw err;
  }
  const io = createUserIOContext(context?.subprocess);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const worktreeBranch = await resolveCurrentBranchName(io.exec) ?? undefined;

  // Explicit --force: bypass recovery prompt, push forcibly.
  if (opts.force) {
    try {
      await runWithSpinner(
        output,
        "Force-pushing user notes...",
        () => runUserPush({ cwd, io, identity, force: true, access, worktreeBranch }),
        "Force push complete.",
      );
      p.outro("Done.");
    } catch (err) {
      if (isHandledError(err)) return;
      if (err instanceof UserPushBlockedError) {
        p.log.error(err.message);
        process.exitCode = 1;
        return;
      }
      const msg = gitFailureText(err) || String(err);
      if (isRemoteError(msg)) {
        p.log.error("No remote configured. Push requires a remote repository.");
        p.log.info("Set up a remote with: git remote add origin <url>");
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    return;
  }

  const outcome = await pushNotesWithReconcile({
    io, identity, cwd, access, worktreeBranch, output,
  });
  switch (outcome.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      p.outro("Done.");
      return;
    case "no-local-notes":
      p.log.info("No local user notes to push.");
      p.outro("Done.");
      return;
    case "no-remote":
      p.log.error("No remote configured. Push requires a remote repository.");
      p.log.info("Set up a remote with: git remote add origin <url>");
      process.exitCode = 1;
      return;
    case "refused":
      p.log.error(outcome.message);
      process.exitCode = 1;
      return;
    case "blocked":
      for (const condition of outcome.conditions.filter(isRefusalCondition)) {
        p.log.error(condition.guidance);
      }
      process.exitCode = 1;
      return;
    case "conflict":
      p.log.error(outcome.message);
      process.exitCode = 1;
      return;
    case "failed":
      if (isHandledError(outcome.error)) return;
      throw outcome.error;
  }
}

// --- Fetch ---

export interface UserFetchOptions {
  identity?: string;
}

/** Validated input for selecting an optional notes identity. */
export const UserFetchInputSchema = z.object({ identity: SlugSchema.optional() }).strict();

export async function handleUserFetch(
  opts: UserFetchOptions,
  context?: InteractionContext,
): Promise<void> {
  p.intro("arc user fetch");
  const output = createSyncOutput(false);

  let identity: string;
  if (opts.identity) {
    const normalizedIdentity = normalizeCommandIdentity(opts.identity);
    const parsed = UserFetchInputSchema.safeParse({ identity: normalizedIdentity });
    if (!parsed.success) {
      p.log.error("Invalid identity — must contain at least one alphanumeric character.");
      process.exitCode = 1;
      return;
    }
    identity = parsed.data.identity ?? "";
    p.log.info(`Fetching notes for identity: ${identity}`);
  } else {
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
  }
  const io = createUserIOContext(context?.subprocess);

  const spinner = output.spinner();
  spinner.start("Fetching user notes...");

  const result = await runUserFetch({ io, identity });
  if (!isUserFetchSuccess(result)) {
    spinner.stop(result.kind === "remote-unavailable" ? "Fetch failed." : "Fetch skipped.");
    reportUserFetchOutcome(result, identity, "fetch");
    return;
  }

  spinner.stop("Fetch complete.");
  p.outro("Done.");
}

// --- Pull ---

export interface UserPullOptions {
  identity?: string;
  yes?: boolean;
  /** Override the auto-derived current WU name. Absent → derive from active-meta / branch. */
  currentWuName?: string;
}

/** Validated optional identity selector for user pull. */
export const UserPullInputSchema = z.object({ identity: SlugSchema.optional() }).strict();

/** Registry contributions owned by schema-bearing user commands. */
export const userCommandInputRegistrations = [
  { commandPath: "user add", schema: UserAddInputSchema, schemaFields: { "operand.identity": "identity" } },
  {
    commandPath: "user open",
    schema: z.object({ wuName: SlugSchema }).strict(),
    schemaFields: { "operand.wu-name": "wuName" },
  },
  {
    commandPath: "user close",
    schema: z.object({ wuName: SlugSchema }).strict(),
    schemaFields: { "operand.wu-name": "wuName" },
  },
  {
    commandPath: "user inbox-remove",
    schema: UserInboxRemoveInputSchema,
    schemaFields: {
      "operand.slug": "literal",
      "option.inbox-title-file": "inboxTitleFile",
      "option.inbox-entry-file": "inboxEntryFile",
    },
  },
  { commandPath: "user fetch", schema: UserFetchInputSchema, schemaFields: { "option.identity": "identity" } },
  { commandPath: "user pull", schema: UserPullInputSchema, schemaFields: { "option.identity": "identity" } },
] as const satisfies readonly CommandInputRegistration[];

/** Command-owned policy that syntax cannot express for user-state acquisition. */
export const userCommandInputPolicyDeclarations = [{
  commandPath: "user open",
  aliases: [],
  sites: [declareInteractionSite(
    { file: "handlers/user.ts", kind: "prompt", callee: "p.select", occurrence: 1 },
    {
    acquisition: "safe-default",
    schemaOwnership: "none",
    defaultSource: "keep",
    cancellation: "safe-default",
    automation: { noInput: "use-default", flags: [], acceptedSyntax: [] },
    mutationBoundary: "stale user subdirectory removal",
    subprocess: "none",
    },
  )],
}, {
  commandPath: "user pull",
  aliases: [],
  sites: [declareCliOptionSite("yes", {
    acquisition: "protected-confirmation", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "require-authority", flags: ["--yes"], acceptedSyntax: [] },
    mutationBoundary: "user pull handler", subprocess: "none",
  }), declareInteractionSite(
    { file: "handlers/user.ts", kind: "prompt", callee: "p.confirm", occurrence: 1 },
    {
      acquisition: "protected-confirmation",
      schemaOwnership: "none",
      cancellation: "stop",
      automation: { noInput: "require-authority", flags: ["--yes"], acceptedSyntax: ["--yes"] },
      mutationBoundary: "local notes overwrite",
      subprocess: "none",
    },
  )],
}, {
  commandPath: "user compact",
  aliases: [],
  sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}, {
  commandPath: "user status",
  aliases: [],
  sites: (["json", "session-init"] as const).map((option) => declareCliOptionSite(option, {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: [`--${option}`], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })),
}] satisfies readonly CommandInputDeclaration[];

export async function handleUserPull(
  opts: UserPullOptions,
  suppliedContext?: InteractionContext,
): Promise<void> {
  const context = suppliedContext ?? resolveProcessInteractionContext({
    noInput: false,
    machineReadable: false,
    yes: opts.yes === true ? "authority" : "absent",
  });
  p.intro("arc user pull");
  const output = createSyncOutput(false);

  let identity: string;
  if (opts.identity) {
    const normalizedIdentity = normalizeCommandIdentity(opts.identity);
    const parsed = UserPullInputSchema.safeParse({ identity: normalizedIdentity });
    if (!parsed.success) {
      p.log.error("Invalid identity — must contain at least one alphanumeric character.");
      process.exitCode = 1;
      return;
    }
    identity = parsed.data.identity ?? "";
    p.log.info(`Pulling notes for identity: ${identity}`);
  } else {
    try {
      identity = await resolveUserIdentity();
    } catch (err) {
      if (isHandledError(err)) return;
      throw err;
    }
  }

  const io = createUserIOContext(context.subprocess);
  const hasLocal = await hasLocalNotes(io, identity);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (hasLocal && context.confirmation !== "accept") {
    if (context.interaction === "forbidden") {
      p.log.error("Local notes would be overwritten; re-run with --yes to authorize the pull.");
      process.exitCode = 1;
      return;
    }
    const proceed = await p.confirm({
      message: OVERWRITE_CONFIRM_MESSAGE,
      initialValue: true,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.log.info("Pull cancelled.");
      return;
    }
  }

  const spinner = output.spinner();
  spinner.start("Pulling user notes...");

  let result;
  try {
    const currentWuName = opts.currentWuName ?? await resolveCurrentWuName(cwd, io.exec);
    result = await runUserPull({
      cwd,
      io,
      identity,
      currentWuName,
    });
  } catch (err) {
    spinner.stop("Pull failed.");
    if (err instanceof UserFacingError) {
      p.log.error(formatError(err));
      return;
    }
    throw err;
  }

  if (isUserFetchOutcome(result)) {
    spinner.stop(result.kind === "remote-unavailable" ? "Pull failed." : "Pull skipped.");
    reportUserFetchOutcome(result, identity, "pull");
    return;
  }

  if (!result) {
    spinner.stop("No note found.");
    p.log.warn("No saved user directory found on HEAD or any reachable ancestor.");
    process.exitCode = 1;
    return;
  }

  spinner.stop("Pull complete.");
  p.note(buildLoadSummary(result), "Pulled");
  p.outro("Done.");
}

// --- Compact ---

export interface UserCompactHandlerOptions {
  json?: boolean;
}

export async function handleUserCompact(
  opts: UserCompactHandlerOptions = {},
  context?: InteractionContext,
): Promise<void> {
  const json = Boolean(opts.json);
  const output = createSyncOutput(json);
  output.intro("arc user compact");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (err instanceof UserFacingError) {
      emitStatusError(json, output, err.code, err.message, err);
      process.exitCode = 1;
      return;
    }
    if (isHandledError(err)) return;
    throw err;
  }

  const cwd = json ? resolveArcRoot(process.cwd()) : requireArcProjectRoot();
  if (!cwd) {
    if (json) {
      emitStatusError(json, output, "NOT_IN_ARC_PROJECT", ARC_PROJECT_ROOT_ERROR);
      process.exitCode = 1;
    }
    return;
  }

  const io = createUserIOContext(context?.subprocess);
  const result = await runWithSpinner(
    output,
    "Compacting user notes...",
    () => runUserCompact({ cwd, io, identity }),
    "Compaction check complete.",
  );

  if (json) {
    process.stdout.write(`${JSON.stringify(toJsonSafeCompactResult(result))}\n`);
  } else {
    output.note(buildUserCompactSummary(result), "Compact");
    output.outro(isUserCompactFailure(result) ? "Failed." : "Done.");
  }

  if (isUserCompactFailure(result)) {
    process.exitCode = 1;
  }
}

function isUserCompactFailure(result: UserCompactResult): boolean {
  if (result.kind === "compacted" && result.marker === "failed") return true;
  return result.kind === "lease-declined"
    || result.kind === "conflict"
    || result.kind === "no-remote"
    || result.kind === "failed";
}

function toJsonSafeCompactResult(result: UserCompactResult): object {
  switch (result.kind) {
    case "lease-declined":
      return {
        ...result,
        error: { message: result.error.message },
      };
    case "no-remote":
    case "failed":
      return {
        ...result,
        error: { message: result.error.message },
      };
    case "compacted":
    case "nothing-to-prune":
    case "conflict":
      return result;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

// --- Status ---

export interface UserStatusOptions {
  offline?: boolean;
  all?: boolean;
  sessionInit?: boolean;
  verbose?: boolean;
  json?: boolean;
}

export async function handleUserStatus(
  opts: UserStatusOptions,
  context?: InteractionContext,
): Promise<void> {
  const json = Boolean(opts.json);
  const output = createSyncOutput(json);
  output.intro("arc user status");

  let identity: string;
  try {
    identity = await resolveUserIdentity();
  } catch (err) {
    if (err instanceof UserFacingError) {
      emitStatusError(json, output, err.code, err.message, err);
      process.exitCode = 1;
      return;
    }
    if (isHandledError(err)) return;
    throw err;
  }

  const io = createUserIOContext(context?.subprocess);
  const cwd = json ? resolveArcRoot(process.cwd()) : requireArcProjectRoot();
  if (!cwd) {
    if (json) {
      emitStatusError(json, output, "NOT_IN_ARC_PROJECT", ARC_PROJECT_ROOT_ERROR);
      process.exitCode = 1;
    }
    return;
  }

  if (opts.sessionInit) {
    const { settings } = await readConfigSettings(cwd);
    const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
    const result = await runUserSessionInitStatus({
      cwd,
      io,
      identity,
      remoteSyncEnabled,
    });
    if (json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    output.note(buildUserSessionInitStatusSummary(result), "Session Init");
    output.outro("Done.");
    return;
  }

  const { settings } = await readConfigSettings(cwd);
  const remoteSyncEnabled = settings["session.remote_sync"] === "enabled";
  const result = await runUserStatus({
    cwd,
    io,
    identity,
    offline: opts.offline,
    all: opts.all,
    remoteSyncEnabled,
    verbose: Boolean(opts.verbose),
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  output.note(buildUserStatusSummary(result), "Status");
  output.outro("Done.");
}

/**
 * Surface a status-handler error in the format appropriate for the active
 * mode. Under `--json`, writes a single envelope `{ error: { code, message } }`
 * to stdout — keeps the JSON pipe contract intact (every return path emits an
 * envelope) and avoids contaminating stdout with clack output. In human mode,
 * routes the formatted error through the SyncOutput log sink.
 */
function emitStatusError(
  json: boolean,
  output: SyncOutput,
  code: ArcErrorCode,
  message: string,
  formatSource?: Error,
): void {
  if (json) {
    const envelope = { error: { code, message } };
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
    return;
  }
  output.log.error(formatSource ? formatError(formatSource) : message);
}
