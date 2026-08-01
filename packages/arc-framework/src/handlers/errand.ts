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

import { randomBytes } from "node:crypto";
import { access, lstat, readFile, realpath, readdir } from "node:fs/promises";
import { basename } from "node:path";

import * as p from "@clack/prompts";
import { z } from "zod";

import { runActiveInFlight } from "../commands/active.js";
import {
  removeCurrentInboxEntry,
  runUserInboxRemove,
  runUserInboxMutation,
  unmarkCurrentInboxEntry,
  withLockedUserInbox,
  type UserIOContext,
} from "../commands/user.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  closeLegacyErrand,
  type ErrandPushOutcome,
} from "../lib/errand/index.js";
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
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import { createLocusEvidenceIO } from "../lib/locus/evidence.js";
import { readLocusState } from "../lib/locus/reader.js";
import { readPrimarySafety } from "../lib/locus/primary-safety.js";
import { openOrdinaryErrandAtRuntime } from "../lib/errand/open-runtime.js";
import { linkOrdinaryErrandAtRuntime } from "../lib/errand/link-runtime.js";
import {
  closeOrdinaryErrandAtRuntime,
  readCloseIdentityAtRuntime,
} from "../lib/errand/close-runtime.js";
import { settlePartialErrandAtRuntime } from "../lib/errand/partial-settle-runtime.js";
import { abandonOrdinaryErrandAtRuntime } from "../lib/errand/abandon-runtime.js";
import { promoteOrdinaryErrandAtRuntime } from "../lib/errand/promote-runtime.js";
import {
  type LocusMutationErrorCode,
  type LocusMutationResultV1,
} from "../lib/locus/schema/index.js";
import { resolveOriginatingMetaPath } from "../lib/release/wu-resolution.js";
import { PrioritySchema, SlugSchema, WorkClassSchema } from "../lib/kernel/index.js";
import type { CommandInputRegistration } from "../lib/command-input/registry.js";
import {
  clearErrandPartialPushMarker,
  InboxMutationConflictError,
  inspectInboxEntry,
  recordErrandPartialPushMarker,
  resolveExecutionNextOffer,
} from "../lib/user-sync/index.js";
import { acquireSessionAnchor } from "../lib/locus/process-inspector.js";
import { createPlatformProcessAncestryInspector, createPlatformProcessInspector } from "../lib/locus/platform-inspectors.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { buildLifecycleIndex } from "../lib/work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../lib/work-unit/lifecycle-resolver.js";
import { requireArcProjectRoot, resolveIdentityWithPrompt } from "./shared.js";

type ErrandPushLabel = "Record" | "Record-link" | "Record-removal";

/** Honest recovery text shared by every errand-record mutation handler. */
export function formatErrandPushDeferredWarning(
  label: ErrandPushLabel,
  outcome: Extract<ErrandPushOutcome, { kind: "no-remote" | "conflict" | "failed" }>,
  markerRecorded: boolean,
): string {
  const markerDetail = markerRecorded
    ? ""
    : " The recovery marker was not recorded because no usable sync-state record exists; keep this warning for recovery.";
  if (outcome.kind === "conflict") {
    return `${label} push blocked by same-slug errand record conflict(s): ${outcome.slugs.join(", ")}. `
      + "Choose the record to keep, then run `arc errand close --force <slug>` on the discarded side and retry."
      + markerDetail;
  }
  return `${label} push deferred (${outcome.kind}); retry recovery with \`arc sync\`.` + markerDetail;
}

async function settleErrandPushOutcome(
  cwd: string,
  io: UserIOContext,
  identity: string,
  label: ErrandPushLabel,
  outcome: ErrandPushOutcome,
  quiet: boolean = false,
): Promise<void> {
  switch (outcome.kind) {
    case "pushed":
    case "reconciled":
    case "noop":
      await clearErrandPartialPushMarker(cwd, io, identity);
      return;
    case "no-remote":
    case "conflict":
    case "failed": {
      const markerRecorded = await recordErrandPartialPushMarker(cwd, io, identity);
      if (!quiet) p.log.warn(formatErrandPushDeferredWarning(label, outcome, markerRecorded));
      return;
    }
  }
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

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

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
    emitErrandOpenResult(createLocusMutationResult({
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
  let result: LocusMutationResultV1;
  try {
    result = await openOrdinaryErrandAtRuntime({
      slug,
      intent: opts.intent,
      inbox,
      protection,
      base,
      createdAt,
      identity,
      locationTemplate: settings["worktree.location_template"],
      repo: basename(primaryPath),
      leaseId: randomBytes(16).toString("hex"),
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      identityGlobalUserDir,
      exec: io.exec,
      execInput: io.execInput,
    });
  } catch (err) {
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-open",
      error: { code: "locus.errand-open.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Inspect the retained identity or session locus evidence before retrying.",
    });
  }
  emitErrandOpenResult(result, opts.json === true);
}

export function formatErrandOpenResult(
  result: LocusMutationResultV1,
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

function emitErrandOpenResult(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandOpenResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandOpenFailure(code: LocusMutationErrorCode, message: string, json: boolean): void {
  emitErrandOpenResult(createLocusMutationResult({
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

  let result: LocusMutationResultV1;
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
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-link",
      error: { code: "locus.errand-link.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Re-read the inbox and identity evidence before retrying.",
    });
  }
  emitErrandLinkResult(result, opts.json === true);
}

export function formatErrandLinkResult(
  result: LocusMutationResultV1,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandLinkResult(result: LocusMutationResultV1, json: boolean): void {
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
  code: LocusMutationErrorCode,
  message: string,
  json: boolean,
  reason?: "full-protection-required",
): void {
  emitErrandLinkResult(createLocusMutationResult(reason === undefined ? {
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

/** Options for the `arc errand close` subcommand. */
export interface ErrandCloseOptions {
  /** Bypass the containment safety check — the deliberate shipped / abandon override. */
  force?: boolean;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for closing an errand. */
export const ErrandCloseInputSchema = z
  .object({ slug: SlugSchema, force: z.boolean().optional(), json: z.boolean().optional() })
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

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

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

  let result: LocusMutationResultV1;
  try {
    if (protection === "partial") {
      if (opts.force === true) {
        result = createLocusMutationResult({
          outcome: "refused",
          operation: "errand-close",
          reason: "identity-conflict",
          recommendedPromptText: "Partial Errand close does not permit --force.",
        });
      } else {
        const identityGlobalUserDir = (await resolveUserSurfaceResolver({
          cwd,
          identity: SlugSchema.parse(identity),
          exec: io.exec,
        })).identityGlobalRoot;
        result = await settlePartialErrandAtRuntime({
          slug,
          action: "close",
          base,
          cwd,
          identity,
          identityGlobalUserDir,
          postCreateScript: settings["worktree.post_create"],
          registeredHarnessDirs: settings["worktree.harness_dirs"],
          exec: io.exec,
          settleInbox: async (binding) => {
            if (binding.originEntry === null) return { kind: "idempotent", nextOffer: null };
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
      }
    } else {
      const identityRead = await readCloseIdentityAtRuntime({
        slug,
        identity,
        exec: io.exec,
        execInput: io.execInput,
      });
      if (identityRead.kind === "refused") {
        result = createLocusMutationResult({
          outcome: "refused",
          operation: "errand-close",
          reason: "identity-conflict",
          recommendedPromptText: identityRead.reason,
        });
      } else if (identityRead.kind === "error") {
        result = createLocusMutationResult({
          outcome: "error",
          operation: "errand-close",
          error: { code: "locus.errand-close.identity-read", message: identityRead.message },
          recommendedPromptText: "Inspect the retained Errand identity before retrying.",
        });
      } else if (identityRead.record?.version === 1 || identityRead.record?.version === 2) {
        result = await closeLegacyErrandResult(cwd, io, identity, slug, base, opts);
      } else {
        const identityGlobalUserDir = (await resolveUserSurfaceResolver({
          cwd,
          identity: SlugSchema.parse(identity),
          exec: io.exec,
        })).identityGlobalRoot;
        const parentCheckoutPath = await resolveCurrentWorkUnitPath(
          identityGlobalUserDir,
          identity,
          base,
          io,
        );
        result = await closeOrdinaryErrandAtRuntime({
          slug,
          base,
          protection: "full",
          force: opts.force === true,
          identity,
          identityGlobalUserDir,
          exec: io.exec,
          execInput: io.execInput,
          removeInbox: async (record) => {
            if (record.originEntry === null) return { kind: "absent", nextOffer: null };
            const removed = await removeCurrentInboxEntry({ cwd, io, identity, title: record.originEntry });
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
    }
  } catch (err) {
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-close",
      error: { code: "locus.errand-close.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Inspect the retained Errand identity and exact ref evidence before retrying.",
    });
  }
  emitErrandCloseResult(result, opts.json === true);
}

async function resolveCurrentWorkUnitPath(
  identityGlobalUserDir: string,
  identity: string,
  base: string,
  io: ReturnType<typeof createUserIOContext>,
): Promise<string | null> {
  if (!io.execInput) return null;
  const anchor = await acquireSessionAnchor(process.pid, createPlatformProcessAncestryInspector());
  if (anchor.kind !== "process") return null;
  const inspector = createPlatformProcessInspector();
  const state = await readLocusState({
    identity,
    pathFlavor: process.platform === "win32" ? "windows" : "posix",
    evidenceIO: createLocusEvidenceIO({ exec: io.exec, identity, inspector }),
    subjectMetaIO: {
      readFile: (path) => readFile(path, "utf8"),
      pathExists: async (path) => access(path).then(() => true, () => false),
      realpath,
      lstat,
    },
    identityGlobalUserDir,
    enteringAnchor: anchor,
    readPrimarySafety: (path) => readPrimarySafety({
      primaryPath: path,
      baseBranch: base,
      exec: io.exec,
    }),
  });
  if (state.current.kind !== "resolved") return null;
  const activeRecordId = state.current.activeRecordId;
  return state.roster.rows.find((row) => row.recordId === activeRecordId
    && row.role?.kind === "work-unit")?.checkoutPath ?? null;
}

export function formatErrandCloseResult(
  result: LocusMutationResultV1,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandCloseResult(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandCloseResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandCloseFailure(code: LocusMutationErrorCode, message: string, json: boolean): void {
  emitErrandCloseResult(createLocusMutationResult({
    outcome: "error",
    operation: "errand-close",
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand abandon` subcommand. */
export interface ErrandAbandonOptions {
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Validated input for abandoning an errand. */
export const ErrandAbandonInputSchema = z
  .object({ slug: SlugSchema, json: z.boolean().optional() })
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
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
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
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: io.exec,
  })).identityGlobalRoot;
  let result: LocusMutationResultV1;
  try {
    result = protection === "partial"
      ? await settlePartialErrandAtRuntime({
        slug: input.slug,
        action: "abandon",
        base,
        cwd,
        identity,
        identityGlobalUserDir,
        postCreateScript: settings["worktree.post_create"],
        registeredHarnessDirs: settings["worktree.harness_dirs"],
        exec: io.exec,
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
      })
      : await abandonOrdinaryErrandAtRuntime({
        slug: input.slug,
        protection: "full",
        base,
        identity,
        identityGlobalUserDir,
        postCreateScript: settings["worktree.post_create"],
        registeredHarnessDirs: settings["worktree.harness_dirs"],
        exec: io.exec,
        execInput: io.execInput,
        confirmedNoLiveSession: false,
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
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-abandon",
      error: { code: "locus.errand-abandon.handler", message: error instanceof Error ? error.message : String(error) },
      recommendedPromptText: "Inspect the retained Errand identity, residue, refs, and inbox binding before retrying.",
    });
  }
  emitErrandAbandonResult(result, opts.json === true);
}

export function formatErrandAbandonResult(
  result: LocusMutationResultV1,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandAbandonResult(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandAbandonResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandAbandonFailure(code: LocusMutationErrorCode, message: string, json: boolean): void {
  emitErrandAbandonResult(createLocusMutationResult({
    outcome: "error",
    operation: "errand-abandon",
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

async function closeLegacyErrandResult(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string,
  slug: string,
  base: string,
  opts: ErrandCloseOptions,
): Promise<LocusMutationResultV1> {
  if (!io.execInput) throw new Error("The stdin Git boundary is unavailable.");
  const result = await closeLegacyErrand(
    { exec: io.exec, execInput: io.execInput, identity },
    { slug, base, force: opts.force === true },
  );
  if (result.kind === "no-record") {
    return createLocusMutationResult({
      outcome: "idempotent", operation: "errand-close", allocation: null, recordId: null, leaseId: null,
      activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null,
      restoredParent: null, nextOffer: null,
      recommendedPromptText: `Errand '${slug}' is already closed.`,
    });
  }
  if (result.kind === "unsafe-reap") {
    return createLocusMutationResult({
      outcome: "refused", operation: "errand-close", reason: "preservation-unproven",
      recommendedPromptText: `${result.reason}. The legacy record is retained; retry with --force only after verification.`,
    });
  }
  await settleErrandPushOutcome(cwd, io, identity, "Record-removal", result.push, opts.json === true);
  await dropOriginatingInboxCapture(cwd, io, identity, result.record.originEntry, opts.json === true);
  const remote = result.remoteHead.kind === "deleted" || result.remoteHead.kind === "absent"
    ? "Remote cleanup is complete."
    : "The remote head was retained for manual verification.";
  return createLocusMutationResult({
    outcome: "applied", operation: "errand-close", allocation: null, recordId: null, leaseId: null,
    activeLocusPath: null, sessionHomePath: null, identity: null,
    originEntry: result.record.originEntry ?? null,
    restoredParent: null, nextOffer: null,
    recommendedPromptText: `Closed legacy Errand '${slug}' and reaped '${result.record.branch}'. ${remote}`,
  });
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
  json: z.boolean().optional(),
}).strict();

/** Registry contributions owned by value-bearing errand commands. */
export const errandCommandInputRegistrations = [
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
    commandPath: "errand abandon",
    schema: ErrandAbandonInputSchema,
    schemaFields: { "operand.slug": "slug", "option.json": "json" },
  },
  {
    commandPath: "errand close",
    schema: ErrandCloseInputSchema,
    schemaFields: { "operand.slug": "slug", "option.force": "force", "option.json": "json" },
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
      "option.json": "json",
    },
  },
] as const satisfies readonly CommandInputRegistration[];

/** Input and interaction policies owned by errand command adapters. */
export const errandCommandInputPolicyDeclarations = [
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

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandPromoteResult(createLocusMutationResult({
      outcome: "refused",
      operation: "errand-promote",
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

  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: io.exec,
  })).identityGlobalRoot;
  let result: LocusMutationResultV1;
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
      identityGlobalUserDir,
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      exec: io.exec,
      execInput: io.execInput,
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
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-promote",
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
  result: LocusMutationResultV1,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandPromoteResult(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandPromoteResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandPromoteFailure(code: LocusMutationErrorCode, message: string, json: boolean): void {
  emitErrandPromoteResult(createLocusMutationResult({
    outcome: "error",
    operation: "errand-promote",
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

/** Drop the originating capture, if the record carries a back-pointer. */
async function dropOriginatingInboxCapture(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string,
  originEntry: string | undefined,
  quiet: boolean = false,
): Promise<void> {
  if (originEntry === undefined) return;
  const dropped = await runUserInboxRemove({ cwd, io, identity, slug: originEntry });
  if (dropped.removed) {
    if (!quiet) p.log.info("Dropped the originating inbox capture.");
    return;
  }
  if (dropped.inboxMissing) {
    if (!quiet) p.log.warn(
      `Originating inbox capture '${originEntry}' not dropped — USER-INBOX is missing.`,
    );
    return;
  }
  if (!quiet) p.log.warn(
    `Originating inbox capture '${originEntry}' not found in USER-INBOX — left for manual cleanup.`,
  );
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
