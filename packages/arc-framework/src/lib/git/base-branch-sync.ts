/**
 * Base-branch-sync probe — non-destructive comparison of the local `<base>`
 * branch ref against `origin/<base>`, where `<base>` is the configured
 * integration base branch.
 *
 * Surfaces a silently-stale local base: how far the local base ref has fallen
 * behind its remote while a sibling clone (or this clone) worked on a feature
 * branch. Distinct from the base-distance probe (HEAD vs `origin/<base>`) —
 * that one measures the current branch's drift from the base; this one measures
 * the *local base ref's own* drift from the remote base, regardless of what is
 * checked out. A returning machine can sit on a feature branch with a local
 * `main` that is days behind `origin/main` and never notice; this probe makes
 * that visible at session-init.
 *
 * Also reports where the local base is checked out (if anywhere) so the
 * recommendation layer can refuse fetch-into-ref when the base is held in a
 * worktree — Git rejects `fetch origin <base>:<base>` against a checked-out
 * branch.
 *
 * Reuses the ref-parameterized distance primitive from worktree-sync rather
 * than re-implementing the `rev-list` body — same primitive, new invocation
 * (`<base>` vs `origin/<base>` instead of `HEAD` vs `origin/<base>`). Advisory
 * only; the recommendation layer (config-gated) decides what a resume does with
 * a stale base.
 *
 * @module
 */

import { z } from "zod";

import {
  boundedFetch,
  checkOriginExists,
  type GitExec,
} from "./exec.js";
import { localPathsEqual } from "../local-path-identity.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";
import type { RemoteHeadSnapshotResult } from "./remote-ref-reader.js";
import {
  RemoteFailureReasonSchema,
} from "../kernel/index.js";
import { isGitProcessError } from "./process-error.js";
import { isGitObjectId } from "./object-id.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
} from "./worktree-sync.js";
import { scanRegisteredWorktrees } from "./worktree-roster.js";

/**
 * Where the local base branch is checked out relative to this session.
 *
 * - `not-checked-out` — no worktree holds `<base>`; fetch-into-ref is viable.
 * - `current` — this worktree holds `<base>`; the worktree channel owns pull.
 * - `elsewhere` — another worktree holds `<base>`; auto fetch-into-ref is unsafe.
 * - `unknown` — worktree topology could not be read; treat as not auto-safe.
 */
export const BaseCheckoutLocusSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("not-checked-out") }),
  z.strictObject({
    kind: z.literal("current"),
    path: z.string().refine((value) => value.trim().length > 0, "path must not be empty"),
    primary: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("elsewhere"),
    path: z.string().refine((value) => value.trim().length > 0, "path must not be empty"),
    primary: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("unknown") }),
]);

/** Where the local base branch is checked out relative to this session. */
export type BaseCheckoutLocus = z.infer<typeof BaseCheckoutLocusSchema>;

const BASE_SYNC_COMMON_SHAPE = {
  base: z.string().refine((value) => value.trim().length > 0, "base branch must not be empty"),
  checkout: BaseCheckoutLocusSchema,
};
const ZERO = z.literal(0);
const POSITIVE_DISTANCE = z.number().int().positive();

/** Runtime authority for the base-branch synchronization advisory. */
export const BaseBranchSyncStatusResultSchema = z.discriminatedUnion("state", [
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("clean"), ahead: ZERO, behind: ZERO }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("remote-ahead"),
    ahead: ZERO,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("local-ahead"),
    ahead: POSITIVE_DISTANCE,
    behind: ZERO,
  }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("diverged"),
    ahead: POSITIVE_DISTANCE,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("skipped"), ahead: ZERO, behind: ZERO }),
  z.strictObject({ ...BASE_SYNC_COMMON_SHAPE, state: z.literal("no-remote"), ahead: ZERO, behind: ZERO }),
  z.strictObject({
    ...BASE_SYNC_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    failureReason: z.enum(["timeout", "error"]),
  }),
]);

/** Base-branch synchronization status and checkout locus. */
export type BaseBranchSyncStatusResult = z.infer<typeof BaseBranchSyncStatusResultSchema>;

/** Runtime authority for the explicit base synchronization remedy. */
export const BaseBranchSyncRemedySchema = z.strictObject({
  text: z.string().min(1),
  argv: z.tuple([
    z.literal("arc"),
    z.literal("base"),
    z.literal("sync"),
    z.literal("--json"),
  ]),
});

/** Structured explicit action offered when base evidence can be materialized safely. */
export type BaseBranchSyncRemedy = z.infer<typeof BaseBranchSyncRemedySchema>;

/** Supplied prerequisites for read-only local-base comparison. */
export interface AnalyzeBaseBranchSnapshotOptions {
  exec: GitExec;
  baseBranch: string;
  /** Validated local base commit, or null when the local branch does not exist. */
  localBaseOid: string | null;
  checkout: BaseCheckoutLocus;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
}

type BaseBranchRelationState = "clean" | "remote-ahead" | "local-ahead" | "diverged";

const SNAPSHOT_COMMON_SHAPE = {
  base: BASE_SYNC_COMMON_SHAPE.base,
  checkout: BaseCheckoutLocusSchema,
};
const EXACT_SNAPSHOT_COMMON_SHAPE = {
  ...SNAPSHOT_COMMON_SHAPE,
  remoteEvidence: z.literal("exact"),
  refreshRemedy: z.null(),
  guidance: z.null(),
};

/** Local-base relation classified against one immutable advertised snapshot. */
export const BaseBranchSnapshotAnalysisResultSchema = z.union([
  z.strictObject({
    ...EXACT_SNAPSHOT_COMMON_SHAPE,
    state: z.literal("clean"),
    ahead: ZERO,
    behind: ZERO,
  }),
  z.strictObject({
    ...EXACT_SNAPSHOT_COMMON_SHAPE,
    state: z.literal("remote-ahead"),
    ahead: ZERO,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({
    ...EXACT_SNAPSHOT_COMMON_SHAPE,
    state: z.literal("local-ahead"),
    ahead: POSITIVE_DISTANCE,
    behind: ZERO,
  }),
  z.strictObject({
    ...EXACT_SNAPSHOT_COMMON_SHAPE,
    state: z.literal("diverged"),
    ahead: POSITIVE_DISTANCE,
    behind: POSITIVE_DISTANCE,
  }),
  z.strictObject({
    ...SNAPSHOT_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    unavailableReason: z.literal("remote-base-absent"),
    refreshRemedy: z.null(),
    guidance: z.string().min(1),
    remoteEvidence: z.literal("exact"),
  }),
  z.strictObject({
    ...SNAPSHOT_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    unavailableReason: z.literal("local-base-absent"),
    refreshRemedy: BaseBranchSyncRemedySchema,
    guidance: z.string().min(1),
    remoteEvidence: z.literal("exact"),
  }),
  z.strictObject({
    ...SNAPSHOT_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    unavailableReason: z.literal("base-object-pending-fetch"),
    refreshRemedy: BaseBranchSyncRemedySchema,
    guidance: z.null(),
    remoteEvidence: z.literal("pending-fetch"),
  }),
  z.strictObject({
    ...SNAPSHOT_COMMON_SHAPE,
    state: z.literal("remote-unavailable"),
    ahead: ZERO,
    behind: ZERO,
    refreshRemedy: z.null(),
    guidance: z.string().min(1),
    remoteEvidence: z.literal("unreachable"),
    failureReason: RemoteFailureReasonSchema,
  }),
  z.strictObject({
    ...SNAPSHOT_COMMON_SHAPE,
    state: z.enum(["skipped", "no-remote"]),
    ahead: ZERO,
    behind: ZERO,
    refreshRemedy: z.null(),
    guidance: z.null(),
    remoteEvidence: z.literal("not-applicable"),
  }),
]);

/** Local-base relation classified against one immutable advertised snapshot. */
export type BaseBranchSnapshotAnalysisResult = z.infer<
  typeof BaseBranchSnapshotAnalysisResultSchema
>;

/**
 * Read the local base commit while distinguishing an absent ref from inspection failure.
 *
 * @param exec - Local-only Git execution boundary.
 * @param baseBranch - Configured local base branch.
 * @param cwd - Repository root the read runs against; see
 * {@link readConfiguredUpstreamBranch} for why a request-scoped caller must name it.
 * @returns The validated base commit, or null only when the local ref is absent.
 */
export async function readLocalBaseOid(
  exec: GitExec,
  baseBranch: string,
  cwd?: string,
): Promise<string | null> {
  try {
    const oid = (await exec(
      "git",
      ["rev-parse", "--verify", "--quiet", `refs/heads/${baseBranch}^{commit}`],
      { objectAccess: "local-only", ...(cwd === undefined ? {} : { cwd }) },
    )).stdout.trim();
    if (!isGitObjectId(oid)) {
      throw new Error("Git did not return a valid local base commit.");
    }
    return oid;
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return null;
    throw error;
  }
}

/**
 * Analyze the local base against supplied advertised evidence without acquiring it.
 *
 * @param options - Validated local and remote base evidence plus the local-only Git boundary.
 * @returns The exact, pending, or unreachable local-base relation and any safe explicit remedy.
 */
export async function analyzeBaseBranchSnapshot(
  options: AnalyzeBaseBranchSnapshotOptions,
): Promise<BaseBranchSnapshotAnalysisResult> {
  if (options.snapshot.kind === "unreachable") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      checkout: options.checkout,
      refreshRemedy: null,
      guidance: `Remote base evidence is unavailable (${options.snapshot.failureReason}).`,
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const advertisedOid = options.snapshot.tips[options.baseBranch];
  if (advertisedOid === undefined) {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      checkout: options.checkout,
      unavailableReason: "remote-base-absent",
      refreshRemedy: null,
      guidance: `The configured base branch ${options.baseBranch} does not exist on origin.`,
      remoteEvidence: "exact",
    };
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error(options.objectAvailability.reason === "execution"
      ? "Local base object-availability inspection failed."
      : "Local base object-availability inspection returned malformed output.");
  }
  const advertisedCommitIsLocal = options.objectAvailability.commits[advertisedOid];
  if (advertisedCommitIsLocal === false) {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      checkout: options.checkout,
      unavailableReason: "base-object-pending-fetch",
      refreshRemedy: composeBaseSyncRemedy(options.baseBranch),
      guidance: null,
      remoteEvidence: "pending-fetch",
    };
  }
  if (advertisedCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  const localOid = options.localBaseOid;
  if (localOid === null) {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      checkout: options.checkout,
      unavailableReason: "local-base-absent",
      refreshRemedy: composeBaseSyncRemedy(options.baseBranch),
      guidance: `The local ${options.baseBranch} branch does not exist.`,
      remoteEvidence: "exact",
    };
  }
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(localOid)) {
    throw new Error("Cannot resolve the local base commit.");
  }
  if (localOid === advertisedOid) {
    return {
      state: "clean",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      checkout: options.checkout,
      refreshRemedy: null,
      guidance: null,
      remoteEvidence: "exact",
    };
  }
  if (options.history.kind !== "complete") {
    throw new Error(options.history.kind === "shallow"
      ? "Complete local history is required for base-branch distance analysis."
      : options.history.reason === "execution"
        ? "Local base history inspection failed."
        : "Local base history inspection returned malformed output.");
  }
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const relation = await countAheadBehindRef(localOnlyExec, localOid, advertisedOid);
  return BaseBranchSnapshotAnalysisResultSchema.parse({
    ...relation,
    state: requireBaseBranchRelationState(relation.state),
    base: options.baseBranch,
    checkout: options.checkout,
    refreshRemedy: null,
    guidance: null,
    remoteEvidence: "exact",
  });
}

function requireBaseBranchRelationState(state: string): BaseBranchRelationState {
  if (state === "clean" || state === "remote-ahead" || state === "local-ahead" || state === "diverged") {
    return state;
  }
  throw new Error(`Unexpected base-branch relation state: ${state}`);
}

function composeBaseSyncRemedy(baseBranch: string): BaseBranchSyncRemedy {
  return {
    text: `Materialize and synchronize the local ${baseBranch} branch.`,
    argv: ["arc", "base", "sync", "--json"],
  };
}

export interface RunBaseBranchSyncStatusOptions {
  exec: GitExec;
  /** Resolved `branch.base` — the integration base branch to compare against. */
  baseBranch: string;
  /** Whether `session.remote_sync` is enabled. False short-circuits to `skipped`. */
  remoteSyncEnabled: boolean;
  /** Bounded fetch timeout in milliseconds. Defaults to {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  fetchTimeoutMs?: number;
}

/**
 * Resolve where the local base branch is checked out relative to this worktree.
 *
 * @param exec - Injectable git executor.
 * @param baseBranch - Configured integration base branch name.
 * @returns Checkout locus for recommendation-layer safety decisions.
 */
export async function resolveBaseCheckoutLocus(
  exec: GitExec,
  baseBranch: string,
): Promise<BaseCheckoutLocus> {
  const scan = await scanRegisteredWorktrees(exec);
  if (!scan.ok) return { kind: "unknown" };

  const baseWorktree = scan.worktrees.find((wt) => wt.branch === baseBranch);
  if (baseWorktree === undefined) return { kind: "not-checked-out" };

  let currentPath: string | null;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
    const trimmed = stdout.trim();
    currentPath = trimmed === "" ? null : trimmed;
  } catch {
    currentPath = null;
  }

  // Topology known, current worktree not — treat as held elsewhere so auto
  // fetch-into-ref degrades rather than racing an unknown checkout.
  if (currentPath === null) {
    return { kind: "elsewhere", path: baseWorktree.path, primary: baseWorktree.primary };
  }

  const same = await localPathsEqual(baseWorktree.path, currentPath);
  return {
    kind: same ? "current" : "elsewhere",
    path: baseWorktree.path,
    primary: baseWorktree.primary,
  };
}

/**
 * Probe the distance from the local `<base>` ref to `origin/<base>`.
 *
 * Non-destructive: at most performs a narrow `git fetch origin <base>` so the
 * base tracking ref is current before the distance read. Degrades gracefully
 * when the comparison cannot be made (no remote, fetch failure, or a local base
 * ref that does not exist — a fresh clone that has never materialized the base
 * locally) rather than throwing. Always attaches the base checkout locus so
 * session-init can refuse a doomed fetch-into-ref.
 */
export async function runBaseBranchSyncStatus(
  options: RunBaseBranchSyncStatusOptions,
): Promise<BaseBranchSyncStatusResult> {
  const { exec, baseBranch, remoteSyncEnabled, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = options;

  if (!remoteSyncEnabled) {
    return {
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      checkout: { kind: "not-checked-out" },
    };
  }

  const checkout = await resolveBaseCheckoutLocus(exec, baseBranch);

  if (!(await checkOriginExists(exec))) {
    return { state: "no-remote", ahead: 0, behind: 0, base: baseBranch, checkout };
  }

  // A non-`ok` outcome is uniformly degraded here: like base-distance, this
  // probe has no branch-gone recovery arm, so a deleted base ref simply reads
  // as remote-unavailable rather than a distinct state.
  const fetch = await boundedFetch(exec, baseBranch, fetchTimeoutMs);
  if (fetch.outcome !== "ok") {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      checkout,
      failureReason: fetch.outcome,
    };
  }

  let distance: Awaited<ReturnType<typeof countAheadBehindRef>>;
  try {
    // Local `<base>` (not HEAD) against the freshened remote base. A missing
    // local base ref makes `rev-list` throw, caught below as a degraded read.
    distance = await countAheadBehindRef(exec, baseBranch, `origin/${baseBranch}`);
  } catch {
    return {
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      checkout,
      failureReason: "error",
    };
  }

  const result = {
    state: distance.state,
    ahead: distance.ahead,
    behind: distance.behind,
    base: baseBranch,
    checkout,
  };
  // Validate for effect so schema defects propagate without letting Zod's
  // schema-key order change the established session-envelope wire bytes.
  BaseBranchSyncStatusResultSchema.parse(result);
  return result as BaseBranchSyncStatusResult;
}
