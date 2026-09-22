/**
 * Handler for the `arc errand check` subcommand.
 *
 * `check` is the read half of errand prep: it runs the foreign-artifact overlap
 * detection over the oracle-backed in-flight set and emits the facts (JSON for
 * skill consumption) so the caller can word an advisory caveat before relocating
 * to the errand's execution locus. Sourcing the oracle (not the local worktree
 * roster) lets the gate see work units in flight on another machine.
 *
 * `arc errand` is a noun, not a flat verb: it owns this subcommand and has no
 * default action, mirroring `arc active` / `arc user`.
 *
 * @module
 */

import { readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

import * as p from "@clack/prompts";
import { z } from "zod";

import { runActiveInFlight } from "../commands/active.js";
import {
  removeCurrentInboxEntry,
  runUserInboxMutation,
  unmarkCurrentInboxEntry,
  withLockedUserInbox,
} from "../commands/user.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  detectForeignArtifactOverlap,
  preferRemoteBaseRef,
  projectInFlightToOverlapRoster,
  type ForeignArtifactDetectionResult,
  type GitExec,
} from "../lib/git/index.js";
import {
  renderInFlightWarning,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import {
  declareCliOptionSite,
  declareInteractionSite,
  type CommandInputDeclaration,
} from "../lib/command-input/declaration.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { createGitExec, createUserIOContext } from "../lib/io-context.js";
import { resolveInboxEntryOperand } from "../lib/inbox-entry-operand.js";
import {
  openOrdinaryErrandAtRuntime,
  openOrdinaryErrandAtRuntimeWithDisposition,
} from "../lib/errand/open-runtime.js";
import { linkOrdinaryErrandAtRuntime } from "../lib/errand/link-runtime.js";
import { leaveOrdinaryErrandAtRuntime } from "../lib/errand/leave-runtime.js";
import { prepareMaterializedBranch } from "../lib/errand/materialize-branch.js";
import { transactTransientIdentities } from "../lib/errand/identity-transaction.js";
import {
  closeOrdinaryErrandAtRuntime,
} from "../lib/errand/close-runtime.js";
import { settlePartialErrandAtRuntime } from "../lib/errand/partial-settle-runtime.js";
import { abandonOrdinaryErrandAtRuntime } from "../lib/errand/abandon-runtime.js";
import {
  completeErrandTerminalResult,
  createErrandTerminalResult,
  createTerminalOperationOutcome,
  ErrandTerminalGenerationSchema,
  type CompleteErrandTerminalResultOptions,
  type ErrandTerminalResult,
  type TerminalOperationOutcome,
} from "../lib/errand/terminal-result.js";
import {
  type ErrandTerminalAuthority,
} from "../lib/errand/terminal-authority.js";
import { promoteOrdinaryErrandAtRuntime } from "../lib/errand/promote-runtime.js";
import {
  createErrandPromotionResult,
  type ErrandPromotionResult,
} from "../lib/errand/promotion-result.js";
import {
  createErrandOperationResult,
  type ErrandOperationResult,
} from "../lib/errand/operation-result.js";
import {
  LocusGitOidSchema,
  LocusTokenSchema,
  type LocusIdentityV1,
} from "../lib/locus/schema/index.js";
import {
  errandErrorCode,
  type ErrandErrorCode,
  type ErrandErrorStage,
} from "../lib/errand/result-common.js";
import { resolveOriginatingMetaPath } from "../lib/release/wu-resolution.js";
import { resolveArcRoot } from "../lib/paths.js";
import { PrioritySchema, SlugSchema, WorkClassSchema, type CanonicalDigest } from "../lib/kernel/index.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  InboxMutationConflictError,
  inspectInboxEntry,
  resolveExecutionNextOffer,
  type ExecutionOfferResolution,
} from "../lib/user-sync/index.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";

type ErrandHandlerOperation = "errand-leave" | "errand-close" | "errand-abandon";
type ErrandResultEmitter = (result: ErrandTerminalResult, json: boolean) => void;
type TerminalProjection = Omit<CompleteErrandTerminalResultOptions, "result">;
type OrdinaryTerminalIdentity = Extract<LocusIdentityV1, { kind: "errand"; purpose: "errand" }>;

/** Options for the read-only `arc errand next` queue-head resolver. */
export interface ErrandNextOptions {
  /** Emit the typed result without human decoration. */
  json?: boolean;
}

/** Validated input for resolving the next queued Errand. */
export const ErrandNextInputSchema = z.object({ json: z.boolean().optional() }).strict();

const ErrandNextOfferSchema = z.strictObject({
  kind: z.literal("errand"),
  key: z.string().min(1),
  parentCheckoutPath: z.null(),
});

/** Typed queue-head result consumed by `arc-session --errand --next`. */
export const ErrandNextResultSchema = z.discriminatedUnion("state", [
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("available"),
    nextAction: z.literal("open-errand"),
    nextOffer: ErrandNextOfferSchema,
    recommendedPromptText: z.string().min(1),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("empty"),
    nextAction: z.literal("none"),
    nextOffer: z.null(),
    recommendedPromptText: z.string().min(1),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("errand-next"),
    state: z.literal("refused"),
    nextAction: z.literal("stop"),
    nextOffer: z.null(),
    reason: z.string().min(1),
    remedy: z.string().min(1),
    retryCommand: z.literal("arc errand next --json"),
    recommendedPromptText: z.string().min(1),
  }),
]);
export type ErrandNextResult = z.infer<typeof ErrandNextResultSchema>;

/** Project one queue read into the closed startup-selection contract. */
export function buildErrandNextResult(
  resolution: ExecutionOfferResolution,
  refusalRemedy = "Repair the reported `USER-INBOX` condition.",
): ErrandNextResult {
  if (resolution.kind === "refused") {
    return ErrandNextResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-next",
      state: "refused",
      nextAction: "stop",
      nextOffer: null,
      reason: resolution.reason,
      remedy: refusalRemedy,
      retryCommand: "arc errand next --json",
      recommendedPromptText: "The execute-bound Errand queue could not be read safely: "
        + `${resolution.reason} ${refusalRemedy} Retry with \`arc errand next --json\`.`,
    });
  }
  if (resolution.nextOffer === null) {
    return ErrandNextResultSchema.parse({
      schemaVersion: 1,
      mode: "errand-next",
      state: "empty",
      nextAction: "none",
      nextOffer: null,
      recommendedPromptText: "No execute-bound Errand is queued.",
    });
  }
  return ErrandNextResultSchema.parse({
    schemaVersion: 1,
    mode: "errand-next",
    state: "available",
    nextAction: "open-errand",
    nextOffer: { ...resolution.nextOffer, parentCheckoutPath: null },
    recommendedPromptText: `Next execute-bound Errand: ${resolution.nextOffer.key}`,
  });
}

/** Resolve the stable first execute-bound capture without opening or mutating it. */
export async function handleErrandNext(
  opts: ErrandNextOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand next");
  const parsed = ErrandNextInputSchema.safeParse(opts);
  if (!parsed.success) {
    emitErrandNextResult(buildErrandNextResult({
      kind: "refused",
      reason: z.prettifyError(parsed.error),
    }, "Correct the command options."), opts.json === true);
    return;
  }
  const cwd = requireArcProjectRoot();
  const identity = cwd === null ? null : await resolveIdentityWithPrompt(false);
  if (cwd === null || identity === null) {
    emitErrandNextResult(buildErrandNextResult({
      kind: "refused",
      reason: cwd === null
        ? "ARC project root is unavailable."
        : "No identity resolved — set arc.identity before selecting an Errand.",
    }, cwd === null
      ? "Run from an ARC project checkout."
      : "Set `arc.identity` for this checkout."), opts.json === true);
    return;
  }
  try {
    const resolution = await resolveCurrentExecutionNextOffer({
      cwd,
      io: createUserIOContext(context?.subprocess),
      identity,
      completedTitle: null,
      parentCheckoutPath: null,
    });
    emitErrandNextResult(buildErrandNextResult(resolution), opts.json === true);
  } catch (error) {
    emitErrandNextResult(buildErrandNextResult({
      kind: "refused",
      reason: error instanceof Error ? error.message : String(error),
    }, "Resolve the reported inbox read or lock failure."), opts.json === true);
  }
}

/** Render one typed queue-head result for human or machine consumption. */
export function formatErrandNextResult(
  result: ErrandNextResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  if (json) {
    return {
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: result.state === "refused" ? 1 : 0,
    };
  }
  return {
    stream: result.state === "refused" ? "stderr" : "stdout",
    text: result.recommendedPromptText,
    exitCode: result.state === "refused" ? 1 : 0,
  };
}

function emitErrandNextResult(result: ErrandNextResult, json: boolean): void {
  const formatted = formatErrandNextResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.info(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

async function runErrandHandlerBoundary(
  operation: ErrandHandlerOperation,
  json: boolean,
  emit: ErrandResultEmitter,
  recommendedPromptText: string,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    emit(createErrandTerminalResult({
      outcome: "error",
      operation,
      subject: null,
      checkoutPath: null,
      generation: null,
      error: {
        code: errandErrorCode(operation, "handler"),
        message: error instanceof Error ? error.message : String(error),
      },
      recommendedPromptText,
    }), json);
  }
}

async function runErrandEntryHandlerBoundary(
  operation: "errand-open" | "errand-materialize",
  json: boolean,
  emit: (result: ErrandOperationResult, json: boolean) => void,
  recommendedPromptText: string,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    emit(createErrandOperationResult({
      outcome: "error",
      operation,
      error: {
        code: errandErrorCode(operation, "handler"),
        message: error instanceof Error ? error.message : String(error),
      },
      recommendedPromptText,
    }), json);
  }
}

function prepareTerminalProjection(options: {
  readonly authority: ErrandTerminalAuthority | null;
  readonly settlement: NonNullable<TerminalProjection["evidence"]>["settlement"];
}): TerminalProjection {
  const { authority } = options;
  return {
    authority,
    evidence: authority === null || authority.kind === "refused" ? null : {
      subject: authority.subject,
      generation: authority.generation,
      checkoutPath: authority.checkoutPath,
      parentCheckoutPath: authority.kind === "authorized" ? authority.parentCheckoutPath : null,
      settlement: options.settlement,
    },
  };
}

function formatTerminalResult(
  result: ErrandTerminalResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  const success = result.outcome === "applied" || result.outcome === "idempotent";
  return {
    stream: json || success ? "stdout" : "stderr",
    text: json ? `${JSON.stringify(result)}\n` : result.recommendedPromptText,
    exitCode: success ? 0 : 1,
  };
}

function partialCaptureSettlement(
  authority: ErrandTerminalAuthority | null,
  disposition: "removed" | "retained",
): NonNullable<TerminalProjection["evidence"]>["settlement"] {
  const origin = authority?.kind === "authorized" ? authority.row?.origin ?? null : null;
  return {
    kind: "capture",
    disposition: origin === null ? "absent" : disposition,
    originEntry: origin?.entry ?? null,
    originEntrySourceDigest: origin?.sourceDigest ?? null,
  };
}

function ordinaryOutcomeIdentity(result: TerminalOperationOutcome): OrdinaryTerminalIdentity | null {
  if ((result.outcome !== "applied" && result.outcome !== "idempotent")
    || result.identity?.kind !== "errand"
    || result.identity.purpose !== "errand") return null;
  return result.identity;
}

export interface ErrandCheckOptions {
  /** Target path(s) the errand will edit — matched by prefix against in-flight WUs. */
  target?: string[];
  /** Emit the overlap facts as JSON (for skill consumption). */
  json?: boolean;
  /** `--local`: skip the oracle's network read; derive from local refs. */
  local?: boolean;
  /** `--no-fetch`: Commander sets `fetch === false` — same effect as `--local`. */
  fetch?: boolean;
}

/** Validated input for the errand overlap inspection. */
export const ErrandCheckInputSchema = z.object({
  target: z.array(z.string().trim().min(1)).min(1),
  local: z.boolean().optional(),
  fetch: z.boolean().optional(),
  json: z.boolean().optional(),
}).strict();

export function formatErrandCheckCaveats(result: ForeignArtifactDetectionResult): string[] {
  return [
    ...(result.skipped ?? []).map(
      (entry) =>
        `${entry.branch}  skipped  marked ${entry.marks.join(", ")}  (${formatOverlapLocation(entry)})`,
    ),
    ...(result.indeterminate ?? []).map(
      (entry) => `${entry.branch}  caveat  probe indeterminate  (${formatOverlapLocation(entry)})`,
    ),
    ...(result.notes ?? []),
  ];
}

export function buildErrandCheckJsonEnvelope(
  result: ForeignArtifactDetectionResult,
  warnings: readonly InFlightWarning[],
  reachable: boolean,
): ForeignArtifactDetectionResult & { warnings: readonly InFlightWarning[]; reachable: boolean } {
  return { ...result, warnings, reachable };
}

export async function handleErrandCheck(
  opts: ErrandCheckOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const exec = createGitExec(interaction?.subprocess);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const targetPaths = (opts.target ?? []).map((t) => t.trim()).filter((t) => t !== "");
  if (targetPaths.length === 0) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ overlaps: [] })}\n`);
      return;
    }
    p.intro("arc errand check");
    p.log.error("No --target paths given; nothing to check.");
    process.exitCode = 1;
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  const { settings } = await readConfigSettings(cwd);
  const teamMode = settings["team.mode"] === "true";
  const baseBranch = settings["branch.base"];
  const localOnly = Boolean(opts.local) || opts.fetch === false;
  const parkedSlugs = listParkedSlugs(
    await buildLifecycleIndex({
      cwd,
      fs: {
        readdir: (path) => readdir(path, { withFileTypes: true }),
        readFile: (path) => readFile(path, "utf8"),
      },
    }),
  );

  const { entries, warnings, snapshot, reachable } = await runActiveInFlight({
    exec,
    cwd,
    identity,
    teamMode,
    localOnly,
    baseBranch,
    parkedSlugs,
  });
  const baseRef = await preferRemoteBaseRef(exec, baseBranch);

  const result = await detectForeignArtifactOverlap({
    exec,
    roster: projectInFlightToOverlapRoster(entries),
    targetPaths,
    baseBranch: baseRef,
    originatingWorktreePath: await currentWorktreePath(cwd, exec),
    originatingMetaPath: await resolveOriginatingMetaPath(cwd),
    snapshot,
  });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(buildErrandCheckJsonEnvelope(result, warnings, reachable))}\n`);
    return;
  }

  p.intro("arc errand check");
  const caveats = formatErrandCheckCaveats(result);
  if (result.overlaps.length === 0 && caveats.length === 0) {
    p.note("No in-flight work unit touches the target — proceed without a caveat.", "Advisory");
  } else {
    const lines = result.overlaps.map(
      (o) => `${o.branch}  touches  ${o.matchedPaths.join(", ")}  (${formatOverlapLocation(o)})`,
    );
    p.note(
      [...lines, ...caveats].join("\n"),
      result.overlaps.length > 0
        ? "Foreign overlap — coordinate or sequence after it integrates"
        : "Advisory caveat — review before proceeding",
    );
  }
  if (!reachable && !localOnly) {
    p.log.warn("Remote unreachable — checked local refs only; work in flight on another machine may be missed.");
  }
  for (const warning of warnings) {
    p.log.warn(renderInFlightWarning(warning));
  }
  p.outro("Done.");
}

function formatOverlapLocation(entry: { worktreePath?: string; remoteOnly?: boolean }): string {
  return entry.worktreePath ?? (entry.remoteOnly === false ? "no worktree" : "remote-only");
}

/** Options for the `arc errand open` subcommand. */
export interface ErrandOpenOptions {
  /** Free-text statement of the errand's concern; defaults to the slug. */
  intent?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
  /**
   * Originating `USER-INBOX` capture this errand adopts (its bold title). Marks
   * the record `inbox`-origin so `arc errand close` drops the capture; omitted
   * for a free-description launch.
   */
  fromInbox?: string;
  /**
   * UTF-8 file containing the originating capture's **inner bold title** (one
   * line), or `-` for stdin. Preferred name; see also `inboxEntryFile`.
   */
  inboxTitleFile?: string;
  /** Compatibility alias of `inboxTitleFile`. */
  inboxEntryFile?: string;
}

const InboxTitleSourcesSchema = z.object({
  fromInbox: z.string().min(1).optional(),
  inboxTitleFile: z.string().min(1).optional(),
  inboxEntryFile: z.string().min(1).optional(),
});

function titleSourceCount(value: z.infer<typeof InboxTitleSourcesSchema>): number {
  return [value.fromInbox, value.inboxTitleFile, value.inboxEntryFile]
    .filter((candidate) => candidate !== undefined).length;
}

/** Validated input for opening an errand. */
export const ErrandOpenInputSchema = InboxTitleSourcesSchema.extend({
  slug: SlugSchema,
  intent: z.string().min(1).optional(),
  json: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (titleSourceCount(value) > 1) {
    ctx.addIssue({ code: "custom", message: "Provide at most one inbox title source." });
  }
});

/**
 * Open an Errand through the shared identity, allocation, role, and lease
 * composition. Full protection claims `chore/<slug>` identity before occupying
 * a free primary or spawned checkout; partial protection remains branch- and
 * identity-free in the free primary.
 *
 * `--from-inbox <entry-title>` adopts a `USER-INBOX` capture: the entry is
 * revalidated under the identity notes lock and its title is carried into the
 * identity or partial role.
 */
export async function handleErrandOpen(
  slug: string,
  opts: ErrandOpenOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand open");

  const parsed = ErrandOpenInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandOpenFailure("locus.errand-open.input", z.prettifyError(parsed.error), opts.json === true);
    return;
  }
  const input = parsed.data;

  await runErrandEntryHandlerBoundary(
    "errand-open",
    opts.json === true,
    emitErrandOpenResult,
    "Inspect the retained identity or session locus evidence before retrying.",
    () => runErrandOpenHandler(slug, opts, input, context),
  );
}

async function runErrandOpenHandler(
  slug: string,
  opts: ErrandOpenOptions,
  input: z.infer<typeof ErrandOpenInputSchema>,
  context?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) {
    if (opts.json === true) {
      emitErrandOpenFailure(
        "locus.errand-open.topology",
        "ARC project root is unavailable.",
        true,
      );
    }
    return;
  }

  const { settings } = await readConfigSettings(cwd);
  const protectionValue = settings["branch.protection"];
  if (protectionValue !== "full" && protectionValue !== "partial") {
    emitErrandOpenFailure(
      "locus.errand-open.config",
      `Unsupported branch.protection value '${protectionValue}'.`,
      opts.json === true,
    );
    return;
  }
  const protection = protectionValue;

  const base = settings["branch.base"].trim();
  if (base === "") {
    emitErrandOpenFailure(
      "locus.errand-open.config",
      "No branch.base configured — cannot resolve the allocation base.",
      opts.json === true,
    );
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandOpenFailure(
      "locus.errand-open.identity",
      "No identity resolved — set arc.identity before opening an Errand.",
      opts.json === true,
    );
    return;
  }

  const io = createUserIOContext(context?.subprocess);
  if (!io.execInput) {
    emitErrandOpenFailure(
      "locus.errand-open.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }

  let inbox: ReturnType<typeof inspectInboxEntry> | null = null;
  if (
    input.fromInbox !== undefined
    || input.inboxTitleFile !== undefined
    || input.inboxEntryFile !== undefined
  ) {
    try {
      const adoption = await resolveLiveInboxAdoption({
        cwd,
        io,
        identity,
        literal: input.fromInbox,
        file: input.inboxTitleFile ?? input.inboxEntryFile,
      });
      inbox = adoption;
    } catch (err) {
      emitErrandOpenFailure(
        "locus.errand-open.inbox",
        err instanceof Error ? err.message : String(err),
        opts.json === true,
      );
      return;
    }
  }

  const primaryPath = await resolvePrimaryWorktreePath(io.exec);
  if (primaryPath === null) {
    emitErrandOpenResult(createErrandOperationResult({
      outcome: "error",
      operation: "errand-open",
      error: { code: "locus.errand-open.topology", message: "Primary checkout is unavailable" },
      recommendedPromptText: "Reconcile the Git worktree topology before retrying.",
    }), opts.json === true);
    return;
  }
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: io.exec,
  }))
    .identityGlobalRoot;
  const createdAt = new Date().toISOString();
  let result: ErrandOperationResult;
  try {
    result = await openOrdinaryErrandAtRuntime({
      cwd,
      slug,
      intent: opts.intent,
      inbox,
      protection,
      base,
      syncPrimaryBase: settings["session.remote_sync"] === "enabled"
        && settings["session.init_pull.base"] === "always",
      createdAt,
      identity,
      locationTemplate: settings["worktree.location_template"],
      repo: basename(primaryPath),
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      identityGlobalUserDir,
      exec: io.exec,
      execInput: io.execInput,
    });
  } catch (err) {
    result = createErrandOperationResult({
      outcome: "error",
      operation: "errand-open",
      error: { code: "locus.errand-open.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Inspect the retained identity or session locus evidence before retrying.",
    });
  }
  emitErrandOpenResult(result, opts.json === true);
}

export function formatErrandOpenResult(
  result: ErrandOperationResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  if (json) {
    return {
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: result.outcome === "applied" || result.outcome === "idempotent" ? 0 : 1,
    };
  }
  if (result.outcome === "error") {
    return { stream: "stderr", text: `Error [${result.error.code}]: ${result.error.message}`, exitCode: 1 };
  }
  if (result.outcome === "refused") {
    return {
      stream: "stderr",
      text: `Refused [${result.reason}]: ${result.recommendedPromptText}`,
      exitCode: 1,
    };
  }
  return { stream: "stdout", text: result.recommendedPromptText, exitCode: 0 };
}

function emitErrandOpenResult(result: ErrandOperationResult, json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandOpenFailure(code: ErrandErrorCode, message: string, json: boolean): void {
  emitErrandOpenResult(createErrandOperationResult({
    outcome: "error",
    operation: "errand-open",
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand link` subcommand. */
export interface ErrandLinkOptions {
  /** USER-INBOX capture title to associate with this errand. */
  fromInbox?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
  /**
   * UTF-8 file containing the capture's **inner bold title** (one line), or `-`
   * for stdin. Preferred name; see also `inboxEntryFile`.
   */
  inboxTitleFile?: string;
  /** Compatibility alias of `inboxTitleFile`. */
  inboxEntryFile?: string;
}

/** Validated input for linking an errand to exactly one inbox title source. */
export const ErrandLinkInputSchema = InboxTitleSourcesSchema
  .extend({ slug: SlugSchema, json: z.boolean().optional() })
  .strict()
  .superRefine((value, ctx) => {
    if (titleSourceCount(value) !== 1) {
      ctx.addIssue({ code: "custom", message: "Provide exactly one inbox title source." });
    }
  });

/**
 * Link an already-open errand to a USER-INBOX capture.
 *
 * This is the late-adoption counterpart to `open --from-inbox`: it updates the
 * existing errand record to carry the inbox back-pointer, so the normal close or
 * promote path can drop the capture after the record is removed.
 */
export async function handleErrandLink(
  slug: string,
  opts: ErrandLinkOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand link");

  const parsed = ErrandLinkInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandLinkFailure("locus.errand-link.input", z.prettifyError(parsed.error), opts.json === true);
    return;
  }
  const input = parsed.data;

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandLinkFailure(
      "locus.errand-link.protection",
      "Errand link requires full branch protection.",
      opts.json === true,
      "full-protection-required",
    );
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandLinkFailure(
      "locus.errand-link.identity",
      "No identity resolved — set arc.identity before linking an Errand.",
      opts.json === true,
    );
    return;
  }

  const io = createUserIOContext(context?.subprocess);
  if (!io.execInput) {
    emitErrandLinkFailure(
      "locus.errand-link.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }

  let inbox: ReturnType<typeof inspectInboxEntry>;
  try {
    inbox = await resolveLiveInboxAdoption({
      cwd,
      io,
      identity,
      literal: input.fromInbox,
      file: input.inboxTitleFile ?? input.inboxEntryFile,
    });
  } catch (err) {
    emitErrandLinkFailure(
      "locus.errand-link.inbox",
      err instanceof Error ? err.message : String(err),
      opts.json === true,
    );
    return;
  }

  let result: ErrandOperationResult;
  try {
    result = await linkOrdinaryErrandAtRuntime({
      slug,
      inbox,
      updatedAt: new Date().toISOString(),
      identity,
      exec: io.exec,
      execInput: io.execInput,
    });
  } catch (err) {
    result = createErrandOperationResult({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Re-read the inbox and identity evidence before retrying.",
    });
  }
  emitErrandLinkResult(result, opts.json === true);
}

export function formatErrandLinkResult(
  result: ErrandOperationResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandLinkResult(result: ErrandOperationResult, json: boolean): void {
  const formatted = formatErrandLinkResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandLinkFailure(
  code: ErrandErrorCode,
  message: string,
  json: boolean,
  reason?: "full-protection-required",
): void {
  emitErrandLinkResult(createErrandOperationResult(reason === undefined ? {
    outcome: "error",
    operation: "errand-link",
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  } : {
    outcome: "refused",
    operation: "errand-link",
    reason,
    recommendedPromptText: message,
  }), json);
}

/** Options for `arc errand materialize`. */
export interface ErrandMaterializeOptions {
  /** Require this exact remote identity generation. */
  claimId?: string;
  /** Require this exact retained branch head. */
  expectedHead?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for materializing an Errand. */
export const ErrandMaterializeInputSchema = z.object({
  slug: SlugSchema,
  claimId: LocusTokenSchema.optional(),
  expectedHead: LocusGitOidSchema.optional(),
  json: z.boolean().optional(),
}).strict().superRefine((input, context) => {
  if ((input.claimId === undefined) === (input.expectedHead === undefined)) return;
  context.addIssue({
    code: "custom",
    path: input.claimId === undefined ? ["claimId"] : ["expectedHead"],
    message: "--claim-id and --expected-head must be supplied together",
  });
});

/** Materialize one exact remote-only ordinary-v3 Errand generation. */
export async function handleErrandMaterialize(
  slug: string,
  opts: ErrandMaterializeOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand materialize");
  await runErrandEntryHandlerBoundary(
    "errand-materialize",
    opts.json === true,
    emitErrandOpenResult,
    "Inspect the retained identity and local branch evidence before retrying.",
    async () => {
      const parsed = ErrandMaterializeInputSchema.safeParse({ slug, ...opts });
      if (!parsed.success) {
        emitMaterializeError("input", z.prettifyError(parsed.error), opts.json === true);
        return;
      }
      const cwd = opts.json === true ? resolveArcRoot(process.cwd()) : requireArcProjectRoot();
      if (!cwd) {
        if (opts.json === true) {
          emitMaterializeError("topology", "ARC project root is unavailable.", true);
        }
        return;
      }
      const { settings } = await readConfigSettings(cwd);
      if (settings["branch.protection"] !== "full") {
        emitMaterializeRefusal("full-protection-required", "Errand materialization requires full branch protection.", opts.json === true);
        return;
      }
      const identity = await resolveIdentityWithPrompt(false);
      if (!identity) {
        emitMaterializeError("identity", "No identity resolved — set arc.identity before materializing.", opts.json === true);
        return;
      }
      const io = createUserIOContext(context?.subprocess);
      if (!io.execInput) {
        emitMaterializeError("identity", "The stdin Git boundary is unavailable.", opts.json === true);
        return;
      }
      const read = await transactTransientIdentities({ exec: io.exec, execInput: io.execInput, identity }, {
        remote: "origin",
        message: `arc: reconcile errand identity ${parsed.data.slug}`,
        transform: (records) => ({ kind: "idempotent", value: records.get(parsed.data.slug) ?? null }),
      });
      if (read.kind !== "applied" && read.kind !== "idempotent") {
        emitMaterializeError("identity", read.kind === "error" ? read.message : read.reason, opts.json === true);
        return;
      }
      const record = read.value;
      if (record === null || record.kind !== "errand" || record.purpose !== "errand"
        || (record.state !== "paused" && record.state !== "awaiting-merge")) {
        emitMaterializeRefusal("identity-conflict", `Identity '${parsed.data.slug}' is not an exact resumable ordinary v3 Errand.`, opts.json === true);
        return;
      }
      const expectedHead = record.state === "paused" ? record.savedHead : record.changeRequest.headSha;
      if (parsed.data.claimId !== undefined
        && (record.claimId !== parsed.data.claimId || expectedHead !== parsed.data.expectedHead)) {
        emitMaterializeRefusal(
          "identity-conflict",
          `Identity '${parsed.data.slug}' changed from the selected Errand generation.`,
          opts.json === true,
        );
        return;
      }
      const expectedResumeGeneration = {
        claimId: parsed.data.claimId ?? record.claimId,
        expectedHead: parsed.data.expectedHead ?? expectedHead,
      };
      const prepared = await prepareMaterializedBranch({
        exec: io.exec,
        remote: "origin",
        branch: record.branch,
        expectedHead,
        existingLocal: "accept-exact",
      });
      if (prepared.kind === "refused") {
        emitMaterializeRefusal(
          prepared.code === "local-branch-exists" ? "identity-conflict" : "preservation-unproven",
          prepared.reason,
          opts.json === true,
        );
        return;
      }
      if (prepared.kind === "error") {
        emitMaterializeError(prepared.stage, prepared.message, opts.json === true);
        return;
      }
        const primaryPath = await resolvePrimaryWorktreePath(io.exec);
        if (primaryPath === null) throw new Error("Primary checkout is unavailable");
        const identityGlobalUserDir = (await resolveUserSurfaceResolver({
          cwd,
          identity: SlugSchema.parse(identity),
          exec: io.exec,
        })).identityGlobalRoot;
        const execution = await openOrdinaryErrandAtRuntimeWithDisposition({
          cwd,
          slug: parsed.data.slug,
          inbox: record.originEntry === null ? null : {
            title: record.originEntry,
            sourceDigest: record.originEntrySourceDigest as CanonicalDigest,
            executeBound: false,
          },
          protection: "full",
          syncPrimaryBase: false,
          isolation: "require-isolation",
          changeRequestReentry: "strict",
          pausedHeadReentry: "exact",
          expectedResumeGeneration,
          base: settings["branch.base"],
          createdAt: new Date().toISOString(),
          identity,
          locationTemplate: settings["worktree.location_template"],
          repo: basename(primaryPath),
          postCreateScript: settings["worktree.post_create"],
          registeredHarnessDirs: settings["worktree.harness_dirs"],
          identityGlobalUserDir,
          exec: io.exec,
          execInput: io.execInput,
        });
        const { result } = execution;
        const materialized = createErrandOperationResult({
          ...result,
          operation: "errand-materialize",
          recommendedPromptText: (result.outcome === "applied" || result.outcome === "idempotent")
            && result.allocation !== null
            ? `Errand materialized at ${result.allocation.checkoutPath}; open a fresh session there to resume. `
              + result.recommendedPromptText
            : result.recommendedPromptText,
        });
        if (materialized.outcome !== "applied" && materialized.outcome !== "idempotent"
          && prepared.created && execution.rollbackDisposition !== "retained-or-unknown") {
          await deleteExactLocalBranch(io.exec, prepared.localRef, expectedHead);
        }
        emitErrandOpenResult(materialized, opts.json === true);
    },
  );
}

async function deleteExactLocalBranch(
  exec: ReturnType<typeof createGitExec>,
  ref: string,
  expectedHead: string,
): Promise<void> {
  await exec("git", ["update-ref", "-d", ref, expectedHead]).catch(() => undefined);
}

function emitMaterializeRefusal(
  reason: "full-protection-required" | "identity-conflict" | "preservation-unproven",
  message: string,
  json: boolean,
): void {
  emitErrandOpenResult(createErrandOperationResult({
    outcome: "refused",
    operation: "errand-materialize",
    reason,
    recommendedPromptText: message,
  }), json);
}

function emitMaterializeError(stage: ErrandErrorStage, message: string, json: boolean): void {
  emitErrandOpenResult(createErrandOperationResult({
    outcome: "error",
    operation: "errand-materialize",
    error: { code: errandErrorCode("errand-materialize", stage), message },
    recommendedPromptText: "Inspect the retained identity and local branch evidence before retrying.",
  }), json);
}

/** Options for the `arc errand leave` subcommand. */
export interface ErrandLeaveOptions {
  /** Durable identity tail to retain after local occupancy closes. */
  state: string;
  /** Exact foreign subject generation authorizing this leave request. */
  confirmForeignGeneration?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for leaving an Errand. */
export const ErrandLeaveInputSchema = z.object({
  slug: SlugSchema,
  state: z.enum(["paused", "awaiting-merge"]),
  confirmForeignGeneration: ErrandTerminalGenerationSchema.optional(),
  json: z.boolean().optional(),
}).strict();

/** Preserve an exact Errand head or change request, then close its local occupancy. */
export async function handleErrandLeave(
  slug: string,
  opts: ErrandLeaveOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand leave");
  const parsed = ErrandLeaveInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandLeaveFailure("locus.errand-leave.input", z.prettifyError(parsed.error), opts.json === true);
    return;
  }
  await runErrandHandlerBoundary(
    "errand-leave",
    opts.json === true,
    emitErrandLeaveResult,
    "Inspect the preserved identity tail and local session locus residue before retrying.",
    async () => {
      const cwd = opts.json === true ? resolveArcRoot(process.cwd()) : requireArcProjectRoot();
      if (!cwd) {
        if (opts.json === true) {
          emitErrandLeaveFailure(
            "locus.errand-leave.topology",
            "ARC project root is unavailable.",
            true,
          );
        }
        return;
      }
      const { settings } = await readConfigSettings(cwd);
      const protection = settings["branch.protection"];
      if (protection !== "full" && protection !== "partial") {
        emitErrandLeaveFailure("locus.errand-leave.config", `Unsupported branch.protection value '${protection}'.`, opts.json === true);
        return;
      }
      const base = settings["branch.base"].trim();
      if (base === "") {
        emitErrandLeaveFailure(
          "locus.errand-leave.config",
          "No branch.base configured — cannot restore the parent checkout.",
          opts.json === true,
        );
        return;
      }
      const identity = await resolveIdentityWithPrompt(false);
      if (!identity) {
        emitErrandLeaveFailure("locus.errand-leave.identity", "No identity resolved — set arc.identity before leaving an Errand.", opts.json === true);
        return;
      }
      const io = createUserIOContext(context?.subprocess);
      if (!io.execInput) {
        emitErrandLeaveFailure("locus.errand-leave.identity", "The stdin Git boundary is unavailable.", opts.json === true);
        return;
      }
      let observedAuthority: ErrandTerminalAuthority | null = null;
      const result = await leaveOrdinaryErrandAtRuntime({
        slug: parsed.data.slug,
        state: parsed.data.state,
        protection,
        base,
        updatedAt: new Date().toISOString(),
        identity,
        exec: io.exec,
        execInput: io.execInput,
        readFrame: () => runDerivedLocusStateProbe({ cwd, identity, baseBranch: base, exec: io.exec }),
        confirmForeignGeneration: parsed.data.confirmForeignGeneration,
        onAuthority: (authority) => { observedAuthority = authority; },
      });
      const settlementIdentity = result.outcome === "applied" || result.outcome === "idempotent"
        ? result.identity
        : null;
      const ordinarySettlementIdentity = settlementIdentity?.kind === "errand"
        && settlementIdentity.purpose === "errand"
        ? settlementIdentity
        : null;
      const projection = prepareTerminalProjection({
        authority: observedAuthority,
        settlement: {
          kind: "identity-tail",
          state: parsed.data.state,
          savedHead: ordinarySettlementIdentity?.state === "paused" ? ordinarySettlementIdentity.savedHead : null,
          changeRequest: ordinarySettlementIdentity?.state === "awaiting-merge"
            ? ordinarySettlementIdentity.changeRequest
            : null,
          originEntry: ordinarySettlementIdentity?.originEntry ?? null,
          originEntrySourceDigest: ordinarySettlementIdentity?.origin === "inbox"
            ? ordinarySettlementIdentity.originEntrySourceDigest
            : null,
        },
      });
      emitErrandLeaveResult(completeErrandTerminalResult({ result, ...projection }), opts.json === true);
    },
  );
}

export function formatErrandLeaveResult(
  result: ErrandTerminalResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatTerminalResult(result, json);
}

function emitErrandLeaveResult(result: ErrandTerminalResult, json: boolean): void {
  const formatted = formatErrandLeaveResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandLeaveFailure(code: ErrandErrorCode, message: string, json: boolean): void {
  emitErrandLeaveResult(createErrandTerminalResult({
    outcome: "error",
    operation: "errand-leave",
    subject: null,
    checkoutPath: null,
    generation: null,
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand close` subcommand. */
export interface ErrandCloseOptions {
  /** Exact foreign subject generation authorizing this close request. */
  confirmForeignGeneration?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for closing an errand. */
export const ErrandCloseInputSchema = z
  .object({
    slug: SlugSchema,
    confirmForeignGeneration: ErrandTerminalGenerationSchema.optional(),
    json: z.boolean().optional(),
  })
  .strict();

/**
 * Complete an Errand after its exact full-mode merge or partial direct-base
 * result is proven, then retire its durable state and originating capture.
 *
 * Full protection finalizes the exact merged identity tail and refs. Partial
 * protection proves the direct-base push and pops its identity-free primary
 * role. Both modes remove only the recorded originating inbox capture.
 */
export async function handleErrandClose(
  slug: string,
  opts: ErrandCloseOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand close");

  const parsed = ErrandCloseInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandCloseFailure("locus.errand-close.input", z.prettifyError(parsed.error), opts.json === true);
    return;
  }

  await runErrandHandlerBoundary(
    "errand-close",
    opts.json === true,
    emitErrandCloseResult,
    "Inspect the retained Errand identity and exact ref evidence before retrying.",
    () => runErrandCloseHandler(slug, opts, context),
  );
}

async function runErrandCloseHandler(
  slug: string,
  opts: ErrandCloseOptions,
  context?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) {
    if (opts.json === true) {
      emitErrandCloseFailure(
        "locus.errand-close.topology",
        "ARC project root is unavailable.",
        true,
      );
    }
    return;
  }

  const { settings } = await readConfigSettings(cwd);
  const protection = settings["branch.protection"];
  if (protection !== "full" && protection !== "partial") {
    emitErrandCloseFailure(
      "locus.errand-close.config",
      `Unsupported branch.protection value '${protection}'.`,
      opts.json === true,
    );
    return;
  }

  const base = settings["branch.base"].trim();
  if (base === "") {
    emitErrandCloseFailure("locus.errand-close.base", "No branch.base is configured.", opts.json === true);
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandCloseFailure("locus.errand-close.identity", "No identity resolved.", opts.json === true);
    return;
  }

  const io = createUserIOContext(context?.subprocess);
  if (!io.execInput) {
    emitErrandCloseFailure("locus.errand-close.identity", "The stdin Git boundary is unavailable.", opts.json === true);
    return;
  }

  let result: TerminalOperationOutcome;
  let observedAuthority: ErrandTerminalAuthority | null = null;
  try {
    if (protection === "partial") {
      result = await settlePartialErrandAtRuntime({
        slug,
        action: "close",
        base,
        exec: io.exec,
        readFrame: () => runDerivedLocusStateProbe({ cwd, identity, baseBranch: base, exec: io.exec }),
        confirmForeignGeneration: opts.confirmForeignGeneration,
        onAuthority: (authority) => { observedAuthority = authority; },
        settleInbox: async (binding) => {
          if (binding.originEntry === null) {
            const offer = await resolveCurrentExecutionNextOffer({
              cwd,
              io,
              identity,
              completedTitle: null,
              parentCheckoutPath: binding.parentCheckoutPath,
            });
            if (offer.kind === "refused") return offer;
            return { kind: "idempotent", nextOffer: offer.nextOffer };
          }
          const removed = await removeCurrentInboxEntry({ cwd, io, identity, title: binding.originEntry });
          if (removed.postImage.state !== "present") {
            return { kind: removed.removed ? "applied" : "idempotent", nextOffer: null };
          }
          const offer = resolveExecutionNextOffer({
            content: removed.postImage.content,
            completedTitle: binding.originEntry,
            parentCheckoutPath: binding.parentCheckoutPath,
          });
          if (offer.kind === "refused") return offer;
          return { kind: removed.removed ? "applied" : "idempotent", nextOffer: offer.nextOffer };
        },
      });
    } else {
      result = await closeOrdinaryErrandAtRuntime({
        slug,
        base,
        protection: "full",
        identity,
        exec: io.exec,
        execInput: io.execInput,
        readFrame: () => runDerivedLocusStateProbe({ cwd, identity, baseBranch: base, exec: io.exec }),
        confirmForeignGeneration: opts.confirmForeignGeneration,
        onAuthority: (authority) => { observedAuthority = authority; },
        removeInbox: async (record, parentCheckoutPath, settlementCheckoutPath) => {
          const inboxCwd = settlementCheckoutPath ?? parentCheckoutPath ?? cwd;
          if (record.originEntry === null) {
            const offer = await resolveCurrentExecutionNextOffer({
              cwd: inboxCwd,
              io,
              identity,
              completedTitle: null,
              parentCheckoutPath,
            });
            if (offer.kind === "refused") return offer;
            return { kind: "absent", nextOffer: offer.nextOffer };
          }
          const removed = await removeCurrentInboxEntry({
            cwd: inboxCwd,
            io,
            identity,
            title: record.originEntry,
          });
          if (removed.postImage.state !== "present") {
            return { kind: removed.removed ? "removed" : "absent", nextOffer: null };
          }
          const offer = resolveExecutionNextOffer({
            content: removed.postImage.content,
            completedTitle: record.originEntry,
            parentCheckoutPath,
          });
          if (offer.kind === "refused") return offer;
          return {
            kind: removed.removed ? "removed" : "absent",
            nextOffer: offer.nextOffer,
          };
        },
      });
    }
  } catch (err) {
    result = createTerminalOperationOutcome({
      outcome: "error",
      operation: "errand-close",
      error: { code: "locus.errand-close.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Inspect the retained Errand identity and exact ref evidence before retrying.",
    });
  }
  const terminalIdentity = ordinaryOutcomeIdentity(result);
  const projection = prepareTerminalProjection({
    authority: observedAuthority,
    settlement: protection === "partial"
      ? partialCaptureSettlement(observedAuthority, "removed")
      : {
          kind: "capture",
          disposition: terminalIdentity?.originEntry === null ? "absent" : "removed",
          originEntry: terminalIdentity?.originEntry ?? null,
          originEntrySourceDigest: terminalIdentity?.origin === "inbox"
            ? terminalIdentity.originEntrySourceDigest
            : null,
        },
  });
  emitErrandCloseResult(completeErrandTerminalResult({ result, ...projection }), opts.json === true);
}

async function resolveCurrentExecutionNextOffer(options: {
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
  identity: string;
  completedTitle: string | null;
  parentCheckoutPath: string | null;
}): Promise<ExecutionOfferResolution> {
  const { postImage } = await withLockedUserInbox(
    { cwd: options.cwd, io: options.io, identity: options.identity },
    () => ({ result: null }),
  );
  if (postImage.state === "missing") return { kind: "resolved", nextOffer: null };
  return resolveExecutionNextOffer({
    content: postImage.content,
    completedTitle: options.completedTitle,
    parentCheckoutPath: options.parentCheckoutPath,
  });
}

export function formatErrandCloseResult(
  result: ErrandTerminalResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatTerminalResult(result, json);
}

function emitErrandCloseResult(result: ErrandTerminalResult, json: boolean): void {
  const formatted = formatErrandCloseResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandCloseFailure(code: ErrandErrorCode, message: string, json: boolean): void {
  emitErrandCloseResult(createErrandTerminalResult({
    outcome: "error",
    operation: "errand-close",
    subject: null,
    checkoutPath: null,
    generation: null,
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand abandon` subcommand. */
export interface ErrandAbandonOptions {
  /** Exact foreign subject generation authorizing this abandon request. */
  confirmForeignGeneration?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for abandoning an errand. */
export const ErrandAbandonInputSchema = z
  .object({
    slug: SlugSchema,
    confirmForeignGeneration: ErrandTerminalGenerationSchema.optional(),
    json: z.boolean().optional(),
  })
  .strict();

/** Explicitly retire a safely preserved ordinary Errand while retaining its capture. */
export async function handleErrandAbandon(
  slug: string,
  opts: ErrandAbandonOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand abandon");
  const parsed = ErrandAbandonInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandAbandonFailure("locus.errand-abandon.input", z.prettifyError(parsed.error), opts.json === true);
    return;
  }
  const input = parsed.data;
  await runErrandHandlerBoundary(
    "errand-abandon",
    opts.json === true,
    emitErrandAbandonResult,
    "Inspect the retained Errand identity, residue, refs, and inbox binding before retrying.",
    () => runErrandAbandonHandler(input, opts, context),
  );
}

async function runErrandAbandonHandler(
  input: z.infer<typeof ErrandAbandonInputSchema>,
  opts: ErrandAbandonOptions,
  context?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) {
    if (opts.json === true) {
      emitErrandAbandonFailure(
        "locus.errand-abandon.topology",
        "ARC project root is unavailable.",
        true,
      );
    }
    return;
  }
  const { settings } = await readConfigSettings(cwd);
  const protection = settings["branch.protection"];
  if (protection !== "full" && protection !== "partial") {
    emitErrandAbandonFailure(
      "locus.errand-abandon.config",
      `Unsupported branch.protection value '${protection}'.`,
      opts.json === true,
    );
    return;
  }
  const base = settings["branch.base"].trim();
  if (base === "") {
    emitErrandAbandonFailure("locus.errand-abandon.base", "No branch.base is configured.", opts.json === true);
    return;
  }
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandAbandonFailure("locus.errand-abandon.identity", "No identity resolved.", opts.json === true);
    return;
  }
  const io = createUserIOContext(context?.subprocess);
  if (!io.execInput) {
    emitErrandAbandonFailure(
      "locus.errand-abandon.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }
  let result: TerminalOperationOutcome;
  let observedAuthority: ErrandTerminalAuthority | null = null;
  try {
    if (protection === "partial") {
      result = await settlePartialErrandAtRuntime({
        slug: input.slug,
        action: "abandon",
        base,
        exec: io.exec,
        readFrame: () => runDerivedLocusStateProbe({ cwd, identity, baseBranch: base, exec: io.exec }),
        confirmForeignGeneration: input.confirmForeignGeneration,
        onAuthority: (authority) => { observedAuthority = authority; },
        settleInbox: async (binding) => {
          if (binding.originEntry === null) {
            return { kind: "idempotent", nextOffer: null };
          }
          const cleared = await unmarkCurrentInboxEntry({
            cwd,
            io,
            identity,
            title: binding.originEntry,
          });
          return { kind: cleared.changed ? "applied" : "idempotent", nextOffer: null };
        },
      });
    } else {
      result = await abandonOrdinaryErrandAtRuntime({
        slug: input.slug,
        protection: "full",
        base,
        identity,
        exec: io.exec,
        execInput: io.execInput,
        readFrame: () => runDerivedLocusStateProbe({ cwd, identity, baseBranch: base, exec: io.exec }),
        confirmForeignGeneration: input.confirmForeignGeneration,
        onAuthority: (authority) => { observedAuthority = authority; },
        clearExecuteBound: async (record) => {
          if (record.originEntry === null) return { kind: "idempotent" };
          const cleared = await unmarkCurrentInboxEntry({
            cwd,
            io,
            identity,
            title: record.originEntry,
          });
          return { kind: cleared.changed ? "applied" : "idempotent" };
        },
      });
    }
  } catch (error) {
    result = createTerminalOperationOutcome({
      outcome: "error",
      operation: "errand-abandon",
      error: { code: "locus.errand-abandon.handler", message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the retained Errand identity, residue, refs, and inbox binding before retrying.",
    });
  }
  const terminalIdentity = ordinaryOutcomeIdentity(result);
  const projection = prepareTerminalProjection({
    authority: observedAuthority,
    settlement: protection === "partial"
      ? partialCaptureSettlement(observedAuthority, "retained")
      : {
          kind: "capture",
          disposition: terminalIdentity?.originEntry === null ? "absent" : "retained",
          originEntry: terminalIdentity?.originEntry ?? null,
          originEntrySourceDigest: terminalIdentity?.origin === "inbox"
            ? terminalIdentity.originEntrySourceDigest
            : null,
        },
  });
  emitErrandAbandonResult(completeErrandTerminalResult({ result, ...projection }), opts.json === true);
}

export function formatErrandAbandonResult(
  result: ErrandTerminalResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatTerminalResult(result, json);
}

function emitErrandAbandonResult(result: ErrandTerminalResult, json: boolean): void {
  const formatted = formatErrandAbandonResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandAbandonFailure(code: ErrandErrorCode, message: string, json: boolean): void {
  emitErrandAbandonResult(createErrandTerminalResult({
    outcome: "error",
    operation: "errand-abandon",
    subject: null,
    checkoutPath: null,
    generation: null,
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand promote` subcommand. */
export interface ErrandPromoteOptions {
  /** The new WU name (the meta filename stem and branch leaf); defaults to the slug. */
  name?: string;
  /** The WU branch nature-type prefixing the name; defaults to `feat`. */
  type?: string;
  /** Which floor the errand crossed — `derivation` | `scale`. Required (the agent's judgment). */
  floor?: string;
  /** WU priority for the minted meta. */
  priority?: string;
  /** WU `Class` for the minted meta. */
  class?: string;
  /** Confirm one exact foreign Errand generation. */
  confirmForeignGeneration?: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for promoting an errand into a work unit. */
export const ErrandPromoteInputSchema = z.object({
  slug: SlugSchema,
  name: SlugSchema.optional(),
  type: z.string().regex(/^[a-z][a-z0-9-]*$/u).optional(),
  floor: z.enum(["derivation", "scale"]),
  priority: PrioritySchema.optional(),
  class: WorkClassSchema.optional(),
  confirmForeignGeneration: ErrandTerminalGenerationSchema.optional(),
  json: z.boolean().optional(),
}).strict();

/** Registry contributions owned by value-bearing errand commands. */
export const errandCommandInputRegistrations = [
  {
    commandPath: "errand next",
    schema: ErrandNextInputSchema,
    schemaFields: { "option.json": "json" },
  },
  {
    commandPath: "errand check",
    schema: ErrandCheckInputSchema,
    schemaFields: {
      "option.target": "target",
      "option.local": "local",
      "option.no-fetch": "fetch",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand open",
    schema: ErrandOpenInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.intent": "intent",
      "option.from-inbox": "fromInbox",
      "option.inbox-title-file": "inboxTitleFile",
      "option.inbox-entry-file": "inboxEntryFile",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand link",
    schema: ErrandLinkInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.from-inbox": "fromInbox",
      "option.inbox-title-file": "inboxTitleFile",
      "option.inbox-entry-file": "inboxEntryFile",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand materialize",
    schema: ErrandMaterializeInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.claim-id": "claimId",
      "option.expected-head": "expectedHead",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand leave",
    schema: ErrandLeaveInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.state": "state",
      "option.confirm-foreign-generation": "confirmForeignGeneration",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand abandon",
    schema: ErrandAbandonInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.confirm-foreign-generation": "confirmForeignGeneration",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand close",
    schema: ErrandCloseInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.confirm-foreign-generation": "confirmForeignGeneration",
      "option.json": "json",
    },
  },
  {
    commandPath: "errand promote",
    schema: ErrandPromoteInputSchema,
    schemaFields: {
      "operand.slug": "slug",
      "option.name": "name",
      "option.type": "type",
      "option.floor": "floor",
      "option.priority": "priority",
      "option.class": "class",
      "option.confirm-foreign-generation": "confirmForeignGeneration",
      "option.json": "json",
    },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Input and interaction policies owned by errand command adapters. */
export const errandCommandInputPolicyDeclarations = [
  {
    commandPath: "errand next", aliases: [], sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    })],
  },
  {
    commandPath: "errand check", aliases: [], sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode", schemaOwnership: "owned", schemaField: "json",
      cancellation: "not-applicable", automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none",
    })],
  },
  ...[
    "errand open",
    "errand link",
    "errand leave",
    "errand close",
    "errand abandon",
    "errand promote",
  ].map((commandPath) => ({
    commandPath, aliases: [], sites: [declareCliOptionSite("json", {
      acquisition: "machine-mode" as const,
      schemaOwnership: "owned" as const,
      schemaField: "json",
      cancellation: "not-applicable" as const,
      automation: { noInput: "same" as const, flags: ["--json"], acceptedSyntax: [] },
      mutationBoundary: "output selection", subprocess: "none" as const,
    })],
  })),
  {
    commandPath: "errand materialize",
    aliases: [],
    sites: [
      declareCliOptionSite("claim-id", {
        acquisition: "optional",
        schemaOwnership: "owned",
        schemaField: "claimId",
        cancellation: "not-applicable",
        automation: {
          noInput: "preserve-absent",
          flags: ["--claim-id <claim-id>"],
          acceptedSyntax: ["--claim-id <claim-id>"],
        },
        mutationBoundary: "errand materialize generation preflight",
        subprocess: "none",
      }),
      declareCliOptionSite("expected-head", {
        acquisition: "optional",
        schemaOwnership: "owned",
        schemaField: "expectedHead",
        cancellation: "not-applicable",
        automation: {
          noInput: "preserve-absent",
          flags: ["--expected-head <oid>"],
          acceptedSyntax: ["--expected-head <oid>"],
        },
        mutationBoundary: "errand materialize generation preflight",
        subprocess: "none",
      }),
      declareCliOptionSite("json", {
        acquisition: "machine-mode",
        schemaOwnership: "owned",
        schemaField: "json",
        cancellation: "not-applicable",
        automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
        mutationBoundary: "output selection",
        subprocess: "none",
      }),
    ],
  },
  {
    commandPath: "errand leave",
    aliases: [],
    sites: [
      declareCliOptionSite("state", {
        acquisition: "handler-required",
        schemaOwnership: "owned",
        schemaField: "state",
        cancellation: "not-applicable",
        automation: { noInput: "require-explicit", flags: [], acceptedSyntax: ["--state <value>"] },
        mutationBoundary: "errand leave input preflight",
        subprocess: "none",
      }),
      declareCliOptionSite("confirm-foreign-generation", {
        acquisition: "optional",
        schemaOwnership: "owned",
        schemaField: "confirmForeignGeneration",
        cancellation: "not-applicable",
        automation: {
          noInput: "preserve-absent",
          flags: ["--confirm-foreign-generation <generation>"],
          acceptedSyntax: ["--confirm-foreign-generation <generation>"],
        },
        mutationBoundary: "errand leave subject-generation authority",
        subprocess: "none",
      }),
    ],
  },
  {
    commandPath: "errand abandon",
    aliases: [],
    sites: [declareCliOptionSite("confirm-foreign-generation", {
      acquisition: "optional",
      schemaOwnership: "owned",
      schemaField: "confirmForeignGeneration",
      cancellation: "not-applicable",
      automation: {
        noInput: "preserve-absent",
        flags: ["--confirm-foreign-generation <generation>"],
        acceptedSyntax: ["--confirm-foreign-generation <generation>"],
      },
      mutationBoundary: "errand abandon subject-generation authority",
      subprocess: "none",
    })],
  },
  {
    commandPath: "errand close",
    aliases: [],
    sites: [declareCliOptionSite("confirm-foreign-generation", {
      acquisition: "optional",
      schemaOwnership: "owned",
      schemaField: "confirmForeignGeneration",
      cancellation: "not-applicable",
      automation: {
        noInput: "preserve-absent",
        flags: ["--confirm-foreign-generation <generation>"],
        acceptedSyntax: ["--confirm-foreign-generation <generation>"],
      },
      mutationBoundary: "errand close subject-generation authority",
      subprocess: "none",
    })],
  },
  {
    commandPath: "errand promote",
    aliases: [],
    sites: [declareCliOptionSite("confirm-foreign-generation", {
      acquisition: "optional",
      schemaOwnership: "owned",
      schemaField: "confirmForeignGeneration",
      cancellation: "not-applicable",
      automation: {
        noInput: "preserve-absent",
        flags: ["--confirm-foreign-generation <generation>"],
        acceptedSyntax: ["--confirm-foreign-generation <generation>"],
      },
      mutationBoundary: "errand promote subject-generation authority",
      subprocess: "none",
    })],
  },
  {
    commandPath: "errand open", aliases: [], sites: [1, 2].map((occurrence) => declareInteractionSite(
      { file: "lib/inbox-entry-operand.ts", kind: "explicit-stdin", callee: "process.stdin", occurrence },
      {
        acquisition: "explicit-stdin", schemaOwnership: "none", cancellation: "not-applicable",
        automation: { noInput: "read-explicit-stdin", flags: [], acceptedSyntax: ["-"] },
        mutationBoundary: "errand open input preflight", subprocess: "explicit-stdin",
      },
    )),
  },
] satisfies readonly CommandInputDeclaration[];

/**
 * Promote an errand to a work unit: rename its branch (commits preserved), mint
 * the backing meta at the floor-dictated stage, and retire the identity record.
 *
 * A full-protection verb, like `open` / `close` / `retire`. The crossed floor is
 * the agent's judgment and is required — `derivation` enters planning at
 * `draft-design`, `scale` enters `Active` for a brief + task-list backfill. The
 * deterministic mechanics (rename, meta mint, record retire, push) run here; only
 * the WU name/type, the floor, and optional priority/`Class` are supplied.
 */
export async function handleErrandPromote(
  slug: string,
  opts: ErrandPromoteOptions,
  context?: InteractionContext,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand promote");

  const parsed = ErrandPromoteInputSchema.safeParse({ slug, ...opts });
  if (!parsed.success) {
    emitErrandPromoteFailure(
      "locus.errand-promote.input",
      z.prettifyError(parsed.error),
      opts.json === true,
    );
    return;
  }
  const input = parsed.data;

  try {
    await runErrandPromoteHandler(slug, opts, input, context);
  } catch (error) {
    emitErrandPromoteFailure(
      "locus.errand-promote.handler",
      error instanceof Error ? error.message : String(error),
      opts.json === true,
    );
  }
}

async function runErrandPromoteHandler(
  slug: string,
  opts: ErrandPromoteOptions,
  input: z.infer<typeof ErrandPromoteInputSchema>,
  context?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) {
    if (opts.json === true) {
      emitErrandPromoteFailure(
        "locus.errand-promote.topology",
        "ARC project root is unavailable.",
        true,
      );
    }
    return;
  }

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandPromoteResult(createErrandPromotionResult({
      outcome: "refused",
      operation: "errand-promote",
      subject: null,
      checkoutPath: null,
      generation: null,
      reason: "full-protection-required",
      recommendedPromptText: "Errand promotion requires full branch protection.",
    }), opts.json === true);
    return;
  }

  const floor = input.floor;

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandPromoteFailure("locus.errand-promote.identity", "No identity resolved.", opts.json === true);
    return;
  }

  const io = createUserIOContext(context?.subprocess);
  if (!io.execInput) {
    emitErrandPromoteFailure(
      "locus.errand-promote.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }

  const rawName = input.name?.trim();
  const wuName = rawName !== undefined && rawName !== "" ? rawName : slug;
  const type = input.type?.trim();

  let result: ErrandPromotionResult;
  try {
    result = await promoteOrdinaryErrandAtRuntime({
      slug,
      name: wuName,
      type: type !== undefined && type !== "" ? type : "feat",
      floor,
      owner: identity,
      priority: input.priority,
      class: input.class,
      protection: "full",
      base: settings["branch.base"],
      identity,
      exec: io.exec,
      execInput: io.execInput,
      readFrame: () => runDerivedLocusStateProbe({
        cwd,
        identity,
        baseBranch: settings["branch.base"],
        exec: io.exec,
      }),
      confirmForeignGeneration: input.confirmForeignGeneration,
      settleInbox: async (binding) => {
        try {
          const settled = await runUserInboxMutation({
            cwd,
            io,
            identity,
            mutations: [{
              kind: "remove",
              title: binding.originEntry,
              sourceDigest: binding.originEntrySourceDigest,
            }],
          });
          return { kind: settled.changed ? "applied" : "idempotent" };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return error instanceof InboxMutationConflictError
            ? { kind: "refused", message }
            : { kind: "error", message };
        }
      },
    });
  } catch (error) {
    result = createErrandPromotionResult({
      outcome: "error",
      operation: "errand-promote",
      subject: null,
      checkoutPath: null,
      generation: null,
      error: {
        code: "locus.errand-promote.handler",
        message: error instanceof Error ? error.message : String(error),
      },
      recommendedPromptText: "Inspect the retained identity and local promotion evidence before retrying.",
    });
  }
  emitErrandPromoteResult(result, opts.json === true);
}

export function formatErrandPromoteResult(
  result: ErrandPromotionResult,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  if (json) {
    return {
      stream: "stdout",
      text: `${JSON.stringify(result)}\n`,
      exitCode: result.outcome === "applied" || result.outcome === "idempotent" ? 0 : 1,
    };
  }
  if (result.outcome === "error") {
    return { stream: "stderr", text: `Error [${result.error.code}]: ${result.error.message}`, exitCode: 1 };
  }
  if (result.outcome === "refused") {
    return { stream: "stderr", text: `Refused [${result.reason}]: ${result.recommendedPromptText}`, exitCode: 1 };
  }
  if (result.outcome === "confirmation-required") {
    return { stream: "stderr", text: result.recommendedPromptText, exitCode: 1 };
  }
  return { stream: "stdout", text: result.recommendedPromptText, exitCode: 0 };
}

function emitErrandPromoteResult(result: ErrandPromotionResult, json: boolean): void {
  const formatted = formatErrandPromoteResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandPromoteFailure(code: ErrandErrorCode, message: string, json: boolean): void {
  emitErrandPromoteResult(createErrandPromotionResult({
    outcome: "error",
    operation: "errand-promote",
    subject: null,
    checkoutPath: null,
    generation: null,
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Resolve and revalidate one exact inbox adoption while holding the identity notes lock. */
async function resolveLiveInboxAdoption(options: {
  cwd: string;
  io: ReturnType<typeof createUserIOContext>;
  identity: string;
  literal?: string;
  file?: string;
}): Promise<ReturnType<typeof inspectInboxEntry>> {
  const title = await resolveInboxEntryOperand({ literal: options.literal, file: options.file });
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) {
      throw new Error(
        `USER-INBOX is missing — cannot adopt capture '${title}'. Create the inbox or drop --from-inbox.`,
      );
    }
    return { result: inspectInboxEntry(content, title) };
  });
  return transaction.result;
}

/** The current worktree's root, in `git worktree list` path form (for self-exclusion). */
async function currentWorktreePath(fallback: string, exec: GitExec): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top === "" ? fallback : top;
  } catch {
    return fallback;
  }
}
