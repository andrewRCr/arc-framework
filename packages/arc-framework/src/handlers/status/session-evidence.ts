/** Session evidence, compaction snapshots, and personal nudge markers. */

import type { CompactionSeedWriteStatus } from "../../commands/status.js";
import {
  parseUncommittedFiles,
  type CompactionSeedGitSnapshot,
  type EmitCompactionSeedResult,
} from "../../lib/compaction-seed/emitter.js";
import { type ResolvedSettingsResult } from "../../lib/config/resolved-settings.js";
import { type DirtyStateResult } from "../../lib/git/dirty-state.js";
import type { GitExec } from "../../lib/git/index.js";
import { createUserIOContext } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import type { ReleaseRoutingValue } from "../../lib/release/routing.js";
import { resolveReleaseRouting } from "../../lib/release/routing.js";
import type { CleanupBaseEvidence } from "../../lib/session-init/cleanup-remote-evidence.js";
import { locusWorkUnitAtPath } from "../../lib/session-init/locus-classification.js";
import { shouldNudge, type NudgeMarkerState } from "../../lib/session-init/nudge-rate-limit.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../../lib/user-surfaces.js";
import { GhDeliveryHostPort } from "../../scripts/delivery/hosts/github.js";
import { type HostedProcessRunner } from "../../scripts/review-gate/hosted/gh-process.js";
import { runDerivedLocusStateProbe } from "../derived-locus-state-probe.js";
import { sessionRemotePrerequisites, type SessionRemoteContext } from "../status-remote-context.js";

const SESSION_DELIVERY_OBSERVATION_TIMEOUT_MS = 10_000;

/**
 * Bind all host calls in one session delivery observation to one aggregate deadline.
 *
 * @param runner - Underlying hosted-process runner.
 * @param timeoutMs - Aggregate observation deadline in milliseconds.
 * @returns A delivery host whose calls share one abort signal.
 */
export function createSessionDeliveryObservationHost(
  runner: HostedProcessRunner,
  timeoutMs = SESSION_DELIVERY_OBSERVATION_TIMEOUT_MS,
): GhDeliveryHostPort {
  const signal = AbortSignal.timeout(timeoutMs);
  return new GhDeliveryHostPort({ run: (args) => runner.run(args, { signal }) });
}

/**
 * Project the release-wrapper routing from resolved session settings.
 * @param settings - Resolved configuration for this request.
 * @returns Commit and push routing for the session envelope.
 */
export function releaseRoutingFromSettings(settings: ResolvedSettingsResult): ReleaseRoutingValue {
  return resolveReleaseRouting({
    releaseOptedIn: settings.resolved.releaseOptedIn.value === "true",
    commitInterlock: settings.resolved.commitInterlock.value,
    pushInterlock: settings.resolved.pushInterlock.value,
  });
}

export const ERRAND_NUDGE_MARKER_RELATIVE = ".internal/errand-reminder-last-nudge.txt";

/**
 * Marker for the work-unit staleness nudge — a separate per-user file from the
 * errand reminder so the two batch independently (the errand reminder clears at
 * housekeep; WU staleness clears when the WU merges / archives).
 */
export const WORK_UNIT_STALE_NUDGE_MARKER_RELATIVE = ".internal/work-unit-stale-last-nudge.txt";
export const NOTES_COMPACTION_NUDGE_MARKER_RELATIVE = ".internal/notes-compaction-last-nudge.txt";

/**
 * Read the branch at the request root rather than the process directory.
 * @param exec - Request Git executor.
 * @param cwd - Checkout whose branch is being observed.
 * @returns The branch name, or null for detached HEAD.
 */
export async function readSessionBranch(exec: GitExec, cwd: string): Promise<string | null> {
  const branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd })).stdout.trim();
  return branch === "" || branch === "HEAD" ? null : branch;
}

/**
 * Project cleanup prerequisites from the shared request evidence.
 * @param context - This request's remote context.
 * @returns Supplied evidence or the disabled-remote prerequisites.
 */
export function sessionCleanupBaseEvidence(context: SessionRemoteContext): CleanupBaseEvidence {
  const prerequisites = sessionRemotePrerequisites(context);
  if (prerequisites.kind === "supplied") {
    return {
      remoteSyncEnabled: true,
      snapshot: prerequisites.snapshot,
      objectAvailability: prerequisites.objectAvailability,
      history: prerequisites.history,
    };
  }
  return {
    remoteSyncEnabled: false,
    snapshot: { kind: "unreachable", failureReason: "error" },
    objectAvailability: { kind: "unavailable", reason: "execution" },
    history: { kind: "unavailable", reason: "execution" },
  };
}

/**
 * Resolve the advertised base OID when — and only when — exact evidence establishes
 * it is present locally.
 *
 * `null` means the evidence is genuinely absent: remote sync is off, the remote is
 * unreachable, the base is not advertised, its object is still pending fetch, or the
 * local history is shallow. Each is a fact a caller may act on.
 *
 * An uninspectable prerequisite is not such a fact. A local availability batch or
 * history read that failed says nothing about the base, so it raises rather than
 * resolving to `null`, and the caller's `safeProbe` boundary reports the typed probe
 * error. This matches the sibling comparators — `analyzeBehindBaseSnapshot` and
 * `runStaleWorktreeSweep` — which raise on the same gaps.
 *
 * @param evidence - Advertised-base prerequisites for this request.
 * @param baseBranch - Integration base branch short-name.
 * @returns The base OID under exact local presence, or `null` on evidence absence.
 */
export function exactSessionBaseOid(evidence: CleanupBaseEvidence, baseBranch: string): string | null {
  if (!evidence.remoteSyncEnabled || evidence.snapshot.kind === "unreachable") return null;
  const baseOid = evidence.snapshot.tips[baseBranch];
  if (baseOid === undefined) return null;
  if (evidence.objectAvailability.kind !== "complete") {
    throw new Error("Advertised base commit availability could not be inspected.");
  }
  const baseCommitIsLocal = evidence.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) return null;
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  if (evidence.history.kind === "shallow") return null;
  if (evidence.history.kind !== "complete") {
    throw new Error("Local history completeness could not be inspected.");
  }
  return baseOid;
}

/**
 * Resolve the work unit at the derived frame's canonical entering checkout.
 *
 * @param frame - Derived roster and canonical entering-checkout selection.
 * @returns The retained work-unit identity, or `null` when the entering row owns none.
 */
export function sessionPathTreatmentWorkUnit(
  frame: Pick<Awaited<ReturnType<typeof runDerivedLocusStateProbe>>, "roster" | "entering">,
): { name: string } | null {
  const row = frame.entering.kind === "selected" ? frame.entering.row : null;
  return row === null ? null : locusWorkUnitAtPath(frame.roster, row.checkout.path);
}

/**
 * Read a nonnegative integer setting with its existing fallback.
 * @param raw - Configured value.
 * @param fallback - Value used for invalid input.
 * @returns Parsed setting or fallback.
 */
export function parsePositiveInteger(raw: string, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Resolve once-per-calendar-day marker state for a batched session-init nudge
 * from its per-user marker file. Shared across the rate-limited surfaces (errand
 * reminder / stale-errand, work-unit staleness) — each passes its own
 * `markerRelative` so the surfaces batch independently.
 * @param cwd - Request checkout root.
 * @param io - Personal-surface I/O.
 * @param identity - Configured identity, when present.
 * @param markerRelative - Identity-relative nudge marker.
 * @param resolveSurfaces - Optional request-scoped resolver cache.
 * @returns The marker path and whether today's nudge is due.
 */
export async function resolveNudgeState(
  cwd: string,
  io: ReturnType<typeof createUserIOContext>,
  identity: string | null,
  markerRelative: string,
  resolveSurfaces?: (identity: string) => Promise<UserSurfaceResolver>,
): Promise<NudgeMarkerState> {
  const today = new Date().toISOString().slice(0, 10);
  if (identity === null) {
    return { shouldNudge: false, markerPath: null, today };
  }
  const surfaces = resolveSurfaces !== undefined
    ? await resolveSurfaces(identity)
    : await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: io.exec });
  const markerPath = surfaces.identityGlobalDisplayPath(markerRelative);
  const absoluteMarkerPath = surfaces.identityGlobalPath(markerRelative);
  const lastNudge = await io.readFile(absoluteMarkerPath).then(
    (content) => content.trim(),
    () => null,
  );
  return {
    shouldNudge: shouldNudge({ lastNudge, today }),
    markerPath,
    today,
  };
}

/**
 * Acquire the Git snapshot shared by dirty-state and compaction-seed output.
 * @param cwd - Request checkout root.
 * @param exec - Request Git executor.
 * @returns Branch, head, and uncommitted paths from parallel reads.
 */
export async function readCompactionSeedGitSnapshot(cwd: string, exec: GitExec): Promise<CompactionSeedGitSnapshot> {
  const [branchResult, headResult, statusResult] = await Promise.all([
    exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd }),
    exec("git", ["rev-parse", "HEAD"], { cwd }),
    exec("git", ["status", "--porcelain=v1", "-z"], { cwd }),
  ]);
  return {
    branch: branchResult.stdout.trim(),
    head: headResult.stdout.trim(),
    uncommittedFiles: parseUncommittedFiles(statusResult.stdout),
  };
}

function dirtyStateFromCompactionSeedSnapshot(snapshot: CompactionSeedGitSnapshot) {
  const fileCount = snapshot.uncommittedFiles.length;
  return {
    state: fileCount === 0 ? "clean" as const : "dirty" as const,
    fileCount,
  };
}

/**
 * Reuse the compaction snapshot or fall back after its read fails.
 * @param options - Optional snapshot promise and ordinary dirty-state probe.
 * @returns Dirty-state evidence from the successful reader.
 */
export async function resolveSessionInitDirtyState(options: {
  compactionSeedGitSnapshotP: Promise<CompactionSeedGitSnapshot> | null;
  fallback: () => Promise<DirtyStateResult>;
}): Promise<DirtyStateResult> {
  if (options.compactionSeedGitSnapshotP === null) {
    return options.fallback();
  }
  try {
    return dirtyStateFromCompactionSeedSnapshot(await options.compactionSeedGitSnapshotP);
  } catch {
    return options.fallback();
  }
}

/**
 * Project a seed emitter result into its envelope slot.
 * @param result - Emitter result.
 * @returns The session-visible write status.
 */
export function summarizeCompactionSeedWrite(result: EmitCompactionSeedResult): CompactionSeedWriteStatus {
  if (result.status === "written") {
    return { status: "written", path: result.path };
  }
  return result;
}

/**
 * Report failed or identity-less seed writes on stderr.
 * @param result - Session-visible seed write status.
 * @returns Nothing after any applicable warning is written.
 */
export function surfaceCompactionSeedWrite(result: CompactionSeedWriteStatus): void {
  if (result.status === "failed") {
    process.stderr.write(`warn: compaction seed not written (${result.reason}): ${result.message}\n`);
  }
  if (result.status === "skipped" && result.reason === "identity-missing") {
    process.stderr.write("warn: compaction seed not written: identity not configured\n");
  }
  if (result.status === "skipped" && result.reason === "load-set-unresolved") {
    process.stderr.write("warn: compaction seed not written: load-set unresolved\n");
  }
}

/**
 * Render a thrown seed-write failure.
 * @param err - Thrown value.
 * @returns Error message or string representation.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
