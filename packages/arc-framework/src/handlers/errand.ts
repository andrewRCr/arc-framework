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
import { readFile, readdir } from "node:fs/promises";
import { basename } from "node:path";

import * as p from "@clack/prompts";

import { runActiveInFlight } from "../commands/active.js";
import { runExtensionsSessionInitStatus } from "../commands/extensions.js";
import {
  removeCurrentInboxEntry,
  runUserInboxRemove,
  unmarkCurrentInboxEntry,
  withLockedUserInbox,
  type UserIOContext,
} from "../commands/user.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  closeLegacyErrand,
  readTransientIdentitySnapshot,
  transactTransientIdentities,
  type ErrandPushOutcome,
} from "../lib/errand/index.js";
import {
  detectForeignArtifactOverlap,
  preferRemoteBaseRef,
  projectInFlightToOverlapRoster,
  type ForeignArtifactDetectionResult,
} from "../lib/git/index.js";
import {
  renderInFlightWarning,
  type InFlightWarning,
} from "../lib/git/in-flight-derivation.js";
import { resolvePrimaryWorktreePath } from "../lib/git/worktree-roster.js";
import { gitExec, createUserIOContext } from "../lib/io-context.js";
import { resolveInboxEntryOperand } from "../lib/inbox-entry-operand.js";
import { createLocusMutationResult } from "../lib/locus/mutation.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { openOrdinaryErrandAtRuntime } from "../lib/errand/open-runtime.js";
import { linkOrdinaryErrandAtRuntime } from "../lib/errand/link-runtime.js";
import { leaveOrdinaryErrandAtRuntime } from "../lib/errand/leave-runtime.js";
import { closeOrdinaryErrandAtRuntime } from "../lib/errand/close-runtime.js";
import { abandonOrdinaryErrandAtRuntime } from "../lib/errand/abandon-runtime.js";
import { promoteOrdinaryErrandAtRuntime } from "../lib/errand/promote-runtime.js";
import { normalizeGitRejection } from "../lib/git/process-error.js";
import { uniqueRefToken } from "../lib/git/ref-tree.js";
import type { LocusMutationResultV1 } from "../lib/locus/schema/index.js";
import { resolveOriginatingMetaPath } from "../lib/release/wu-resolution.js";
import {
  clearErrandPartialPushMarker,
  findNextDispatchInboxEntry,
  inspectInboxEntry,
  recordErrandPartialPushMarker,
} from "../lib/user-sync/index.js";
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

export async function handleErrandCheck(opts: ErrandCheckOptions): Promise<void> {
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
    exec: gitExec,
    identity,
    teamMode,
    localOnly,
    baseBranch,
    parkedSlugs,
  });
  const baseRef = await preferRemoteBaseRef(gitExec, baseBranch);

  const result = await detectForeignArtifactOverlap({
    exec: gitExec,
    roster: projectInFlightToOverlapRoster(entries),
    targetPaths,
    baseBranch: baseRef,
    originatingWorktreePath: await currentWorktreePath(cwd),
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

/** Options for `arc errand materialize`. */
export interface ErrandMaterializeOptions {
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Materialize one exact remote-only ordinary-v3 Errand generation. */
export async function handleErrandMaterialize(
  slug: string,
  opts: ErrandMaterializeOptions,
): Promise<void> {
  if (opts.json !== true) p.intro("arc errand materialize");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandOpenResult(createLocusMutationResult({
      outcome: "refused", operation: "errand-materialize", reason: "full-protection-required",
      recommendedPromptText: "Errand materialization requires full branch protection.",
    }), opts.json === true);
    return;
  }
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitMaterializeError("identity", "No identity resolved — set arc.identity before materializing.", opts.json === true);
    return;
  }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitMaterializeError("identity", "The stdin Git boundary is unavailable.", opts.json === true);
    return;
  }
  const read = await transactTransientIdentities({ exec: io.exec, execInput: io.execInput, identity }, {
    remote: "origin",
    message: `arc: reconcile errand identity ${slug}`,
    transform: (records) => ({ kind: "idempotent", value: records.get(slug) ?? null }),
  });
  if (read.kind !== "applied" && read.kind !== "idempotent") {
    emitMaterializeError("identity", read.kind === "error" ? read.message : read.reason, opts.json === true);
    return;
  }
  const record = read.value;
  if (record?.version !== 3 || record.kind !== "errand" || record.purpose !== "errand"
    || (record.state !== "paused" && record.state !== "awaiting-merge")) {
    emitMaterializeRefusal("identity-conflict", `Identity '${slug}' is not an exact resumable ordinary v3 Errand.`, opts.json === true);
    return;
  }
  const expectedHead = record.state === "paused" ? record.savedHead : record.changeRequest.headSha;
  const localRef = `refs/heads/${record.branch}`;
  try {
    await io.exec("git", ["show-ref", "--verify", "--quiet", localRef]);
    emitMaterializeRefusal("identity-conflict", `Local branch '${record.branch}' already exists.`, opts.json === true);
    return;
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args: ["show-ref", "--verify", "--quiet", localRef] });
    if (normalized.exitCode !== 1) {
      emitMaterializeError("local-branch", normalized.message, opts.json === true);
      return;
    }
  }
  const snapshotRef = `refs/arc/tmp/errand-materialize/${uniqueRefToken()}`;
  let branchCreated = false;
  try {
    await io.exec("git", ["fetch", "--", "origin", `+refs/heads/${record.branch}:${snapshotRef}`]);
    const fetchedHead = (await io.exec("git", ["rev-parse", "--verify", `${snapshotRef}^{commit}`])).stdout.trim();
    if (fetchedHead !== expectedHead) {
      emitMaterializeRefusal("preservation-unproven", "The remote Errand head changed after candidate projection.", opts.json === true);
      return;
    }
    await io.exec("git", ["update-ref", localRef, expectedHead, "0".repeat(40)]);
    branchCreated = true;
    const primaryPath = await resolvePrimaryWorktreePath(io.exec);
    if (primaryPath === null) throw new Error("Primary checkout is unavailable");
    const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
    const identityGlobalUserDir = (await resolveUserSurfaceResolver({
      cwd, identity: SlugSchema.parse(identity), exec: io.exec,
    })).identityGlobalRoot;
    const result = await openOrdinaryErrandAtRuntime({
      slug,
      originEntry: record.originEntry,
      dispatchId: record.dispatchId,
      protection: "full",
      isolation: "require-isolation",
      base: settings["branch.base"],
      createdAt: new Date().toISOString(),
      identity,
      locationTemplate: settings["worktree.location_template"],
      repo: basename(primaryPath),
      leaseId: randomBytes(16).toString("hex"),
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      identityGlobalUserDir,
      activeExtensions: activeExtensions.active,
      exec: io.exec,
      execInput: io.execInput,
    });
    const materialized = createLocusMutationResult({
      ...result,
      operation: "errand-materialize",
      recommendedPromptText: result.outcome === "applied" || result.outcome === "idempotent"
        ? `Errand materialized at ${result.activeLocusPath}; open a fresh session there to resume.`
        : result.recommendedPromptText,
    });
    if (materialized.outcome !== "applied" && materialized.outcome !== "idempotent") {
      await deleteExactLocalBranch(io.exec, localRef, expectedHead);
      branchCreated = false;
    }
    emitErrandOpenResult(materialized, opts.json === true);
  } catch (error) {
    if (branchCreated) await deleteExactLocalBranch(io.exec, localRef, expectedHead);
    emitMaterializeError("handler", error instanceof Error ? error.message : String(error), opts.json === true);
  } finally {
    await io.exec("git", ["update-ref", "-d", snapshotRef]).catch(() => undefined);
  }
}

async function deleteExactLocalBranch(exec: typeof gitExec, ref: string, expectedHead: string): Promise<void> {
  await exec("git", ["update-ref", "-d", ref, expectedHead]).catch(() => undefined);
}

function emitMaterializeRefusal(
  reason: "identity-conflict" | "preservation-unproven",
  message: string,
  json: boolean,
): void {
  emitErrandOpenResult(createLocusMutationResult({
    outcome: "refused", operation: "errand-materialize", reason, recommendedPromptText: message,
  }), json);
}

function emitMaterializeError(suffix: string, message: string, json: boolean): void {
  emitErrandOpenResult(createLocusMutationResult({
    outcome: "error", operation: "errand-materialize",
    error: { code: `locus.errand-materialize.${suffix}`, message },
    recommendedPromptText: "Inspect the retained identity and local branch evidence before retrying.",
  }), json);
}

/**
 * Open an Errand through the shared identity, allocation, role, and lease
 * composition. Full protection claims `chore/<slug>` identity before occupying
 * a free primary or spawned checkout; partial protection remains branch- and
 * identity-free in the free primary.
 *
 * `--from-inbox <entry-title>` adopts a `USER-INBOX` capture: the record is
 * is revalidated under the identity notes lock and its exact dispatch binding
 * is carried into the identity or partial role.
 */
export async function handleErrandOpen(slug: string, opts: ErrandOpenOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand open");

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

  const io = createUserIOContext();
  if (!io.execInput) {
    emitErrandOpenFailure(
      "locus.errand-open.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }

  let originEntry: string | null = null;
  let dispatchId: string | null = null;
  if (
    opts.fromInbox !== undefined
    || opts.inboxTitleFile !== undefined
    || opts.inboxEntryFile !== undefined
  ) {
    try {
      const adoption = await resolveLiveInboxAdoption({
        cwd,
        io,
        identity,
        literal: opts.fromInbox,
        file: opts.inboxTitleFile ?? opts.inboxEntryFile,
      });
      originEntry = adoption.title;
      dispatchId = adoption.dispatchId;
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
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
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
      originEntry,
      dispatchId,
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
      activeExtensions: activeExtensions.active,
      exec: io.exec,
      execInput: io.execInput,
    });
  } catch (err) {
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-open",
      error: { code: "locus.errand-open.handler", message: err instanceof Error ? err.message : String(err) },
      recommendedPromptText: "Inspect the retained identity or locus evidence before retrying.",
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

function emitErrandOpenFailure(code: string, message: string, json: boolean): void {
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

/**
 * Link an already-open errand to a USER-INBOX capture.
 *
 * This is the late-adoption counterpart to `open --from-inbox`: it updates the
 * existing errand record to carry the inbox back-pointer, so the normal close or
 * promote path can drop the capture after the record is removed.
 */
export async function handleErrandLink(slug: string, opts: ErrandLinkOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand link");

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

  const io = createUserIOContext();
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
      literal: opts.fromInbox,
      file: opts.inboxTitleFile ?? opts.inboxEntryFile,
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
  code: string,
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

/** Options for the `arc errand leave` subcommand. */
export interface ErrandLeaveOptions {
  /** Durable identity tail to retain after local occupancy closes. */
  state: string;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/** Preserve an exact Errand head or change request, then close its local occupancy. */
export async function handleErrandLeave(slug: string, opts: ErrandLeaveOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand leave");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  if (opts.state !== "paused" && opts.state !== "awaiting-merge") {
    emitErrandLeaveFailure(
      "locus.errand-leave.input",
      "--state must be 'paused' or 'awaiting-merge'.",
      opts.json === true,
    );
    return;
  }
  const { settings } = await readConfigSettings(cwd);
  const protection = settings["branch.protection"];
  if (protection !== "full" && protection !== "partial") {
    emitErrandLeaveFailure(
      "locus.errand-leave.config",
      `Unsupported branch.protection value '${protection}'.`,
      opts.json === true,
    );
    return;
  }
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandLeaveFailure(
      "locus.errand-leave.identity",
      "No identity resolved — set arc.identity before leaving an Errand.",
      opts.json === true,
    );
    return;
  }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitErrandLeaveFailure(
      "locus.errand-leave.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: io.exec,
  }))
    .identityGlobalRoot;
  let result: LocusMutationResultV1;
  try {
    result = await leaveOrdinaryErrandAtRuntime({
      slug,
      state: opts.state,
      protection,
      base: settings["branch.base"],
      updatedAt: new Date().toISOString(),
      identity,
      identityGlobalUserDir,
      activeExtensions: activeExtensions.active,
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      exec: io.exec,
      execInput: io.execInput,
    });
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error",
      operation: "errand-leave",
      error: {
        code: "locus.errand-leave.handler",
        message: error instanceof Error ? error.message : String(error),
      },
      recommendedPromptText: "Inspect the preserved identity tail and local locus residue before retrying.",
    });
  }
  emitErrandLeaveResult(result, opts.json === true);
}

export function formatErrandLeaveResult(
  result: LocusMutationResultV1,
  json: boolean,
): { stream: "stdout" | "stderr"; text: string; exitCode: 0 | 1 } {
  return formatErrandOpenResult(result, json);
}

function emitErrandLeaveResult(result: LocusMutationResultV1, json: boolean): void {
  const formatted = formatErrandLeaveResult(result, json);
  if (json) process.stdout.write(formatted.text);
  else if (formatted.stream === "stderr") p.log.error(formatted.text);
  else {
    p.log.success(formatted.text);
    p.outro("Done.");
  }
  process.exitCode = formatted.exitCode;
}

function emitErrandLeaveFailure(code: string, message: string, json: boolean): void {
  emitErrandLeaveResult(createLocusMutationResult({
    outcome: "error",
    operation: "errand-leave",
    error: { code, message },
    recommendedPromptText: "Resolve the reported input or configuration error before retrying.",
  }), json);
}

/** Options for the `arc errand close` subcommand. */
export interface ErrandCloseOptions {
  /** Bypass the containment safety check — the deliberate shipped / abandon override. */
  force?: boolean;
  /** Emit the producer-validated mutation result without human decoration. */
  json?: boolean;
}

/**
 * Close an errand: reap its branch (containment-safe), delete its remote head
 * when the work provably landed in base, remove the identity record and push
 * the removal, then drop the originating inbox capture.
 *
 * A full-protection verb, like `open`. The reap refuses (record kept) when the
 * branch's commits are not provably preserved, so an abandoned errand stays
 * recoverable; `--force` is the explicit override for the deliberate shipped /
 * abandon case. A remote head that may be the only preservation (pushed but not
 * provably merged) is kept and surfaced, never deleted. The inbox drop targets
 * the record's originating entry — present only for inbox-promoted errands —
 * and is an idempotent no-op otherwise.
 */
export async function handleErrandClose(slug: string, opts: ErrandCloseOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand close");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandCloseResult(createLocusMutationResult({
      outcome: "refused",
      operation: "errand-close",
      reason: "full-protection-required",
      recommendedPromptText: "Errand close requires full branch protection.",
    }), opts.json === true);
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

  const io = createUserIOContext();
  if (!io.execInput) {
    emitErrandCloseFailure("locus.errand-close.identity", "The stdin Git boundary is unavailable.", opts.json === true);
    return;
  }

  let result: LocusMutationResultV1;
  try {
    const snapshot = await readTransientIdentitySnapshot({ exec: io.exec, identity });
    const localRecord = snapshot.kind === "complete" ? snapshot.records.get(slug) : undefined;
    result = localRecord?.version === 1 || localRecord?.version === 2
      ? await closeLegacyErrandResult(cwd, io, identity, slug, base, opts)
      : await closeOrdinaryErrandAtRuntime({
        slug,
        base,
        protection: "full",
        force: opts.force === true,
        identity,
        exec: io.exec,
        execInput: io.execInput,
        removeInbox: async (record) => {
          if (record.originEntry === null) return { kind: "absent", nextOffer: null };
          const removed = await removeCurrentInboxEntry({ cwd, io, identity, title: record.originEntry });
          const next = record.dispatchId !== null && removed.postImage.state === "present"
            ? findNextDispatchInboxEntry(removed.postImage.content, record.dispatchId)
            : null;
          return {
            kind: removed.removed ? "removed" : "absent",
            nextOffer: next === null ? null : {
              kind: "errand",
              key: next.title,
              dispatchId: next.dispatchId,
              parentCheckoutPath: null,
            },
          };
        },
      });
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

function emitErrandCloseFailure(code: string, message: string, json: boolean): void {
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

/** Explicitly retire a safely preserved ordinary Errand while retaining its capture. */
export async function handleErrandAbandon(slug: string, opts: ErrandAbandonOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand abandon");
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandAbandonResult(createLocusMutationResult({
      outcome: "refused",
      operation: "errand-abandon",
      reason: "full-protection-required",
      recommendedPromptText: "Errand abandonment requires full branch protection.",
    }), opts.json === true);
    return;
  }
  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandAbandonFailure("locus.errand-abandon.identity", "No identity resolved.", opts.json === true);
    return;
  }
  const io = createUserIOContext();
  if (!io.execInput) {
    emitErrandAbandonFailure(
      "locus.errand-abandon.identity",
      "The stdin Git boundary is unavailable.",
      opts.json === true,
    );
    return;
  }
  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: io.exec,
  })).identityGlobalRoot;
  let result: LocusMutationResultV1;
  try {
    result = await abandonOrdinaryErrandAtRuntime({
      slug,
      protection: "full",
      base: settings["branch.base"],
      identity,
      identityGlobalUserDir,
      activeExtensions: activeExtensions.active,
      postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"],
      exec: io.exec,
      execInput: io.execInput,
      clearDispatch: async (record) => {
        if (record.originEntry === null || record.dispatchId === null) return { kind: "idempotent" };
        const cleared = await unmarkCurrentInboxEntry({
          cwd,
          io,
          identity,
          title: record.originEntry,
          dispatchId: record.dispatchId,
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

function emitErrandAbandonFailure(code: string, message: string, json: boolean): void {
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
      activeLocusPath: null, sessionHomePath: null, identity: null, originEntry: null, dispatchId: null,
      routingPlanDigest: null, restoredParent: null, nextOffer: null,
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
    originEntry: result.record.originEntry ?? null, dispatchId: null, routingPlanDigest: null,
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
export async function handleErrandPromote(slug: string, opts: ErrandPromoteOptions): Promise<void> {
  if (opts.json !== true) p.intro("arc errand promote");

  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { settings } = await readConfigSettings(cwd);
  if (settings["branch.protection"] !== "full") {
    emitErrandPromoteResult(createLocusMutationResult({
      outcome: "refused", operation: "errand-promote", reason: "full-protection-required",
      recommendedPromptText: "Errand promotion requires full branch protection.",
    }), opts.json === true);
    return;
  }

  const floor = opts.floor?.trim();
  if (floor !== "derivation" && floor !== "scale") {
    emitErrandPromoteFailure("locus.errand-promote.input", "--floor must be 'derivation' or 'scale'.", opts.json === true);
    return;
  }

  const identity = await resolveIdentityWithPrompt(false);
  if (!identity) {
    emitErrandPromoteFailure("locus.errand-promote.identity", "No identity resolved.", opts.json === true);
    return;
  }

  const io = createUserIOContext();
  if (!io.execInput) {
    emitErrandPromoteFailure("locus.errand-promote.identity", "The stdin Git boundary is unavailable.", opts.json === true);
    return;
  }

  const rawName = opts.name?.trim();
  const wuName = rawName !== undefined && rawName !== "" ? rawName : slug;
  const type = opts.type?.trim();

  const activeExtensions = await runExtensionsSessionInitStatus({ cwd });
  const identityGlobalUserDir = (await resolveUserSurfaceResolver({
    cwd, identity: SlugSchema.parse(identity), exec: io.exec,
  })).identityGlobalRoot;
  let result: LocusMutationResultV1;
  try {
    result = await promoteOrdinaryErrandAtRuntime({
      slug, name: wuName, type: type !== undefined && type !== "" ? type : "feat", floor,
      owner: identity, priority: opts.priority, class: opts.class, protection: "full",
      base: settings["branch.base"], identity, identityGlobalUserDir,
      activeExtensions: activeExtensions.active, postCreateScript: settings["worktree.post_create"],
      registeredHarnessDirs: settings["worktree.harness_dirs"], exec: io.exec, execInput: io.execInput,
    });
  } catch (error) {
    result = createLocusMutationResult({
      outcome: "error", operation: "errand-promote",
      error: { code: "locus.errand-promote.handler", message: error instanceof Error ? error.message : String(error) },
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

function emitErrandPromoteFailure(code: string, message: string, json: boolean): void {
  emitErrandPromoteResult(createLocusMutationResult({
    outcome: "error", operation: "errand-promote", error: { code, message },
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
async function currentWorktreePath(fallback: string): Promise<string> {
  try {
    const { stdout } = await gitExec("git", ["rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top === "" ? fallback : top;
  } catch {
    return fallback;
  }
}
