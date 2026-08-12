/**
 * Orphan-branch sweep — cross-machine stale local-branch reaper.
 *
 * Integration deletes a work unit's remote head, but only the integrating
 * machine's teardown reaps the local branch — every sibling machine keeps a
 * `<type>/<name>` local whose upstream is now gone. The same shape arises from
 * `activate-work-unit`'s local-only `plan/<name> → <type>/<name>` rename.
 * From primary or identity-known linked sessions, this sweep enumerates every gone-upstream
 * type-prefixed local branch and resolves, for each, the safest cleanup offer
 * the orientation can render:
 *
 * - Slug matches a `completed/` archive record → the WU shipped; offer the
 *   re-runnable `arc teardown <name>` (its own containment guards decide the
 *   reap, so the offer is safe even when `merged` cannot be proven here).
 * - Otherwise, `merged` (commits landed in the integration base) gates the
 *   interlock-gated `git branch -d` offer; an unmerged orphan is surfaced as
 *   not-removable, never force-deleted.
 *
 * Excluded from the scan: bare (unprefixed) branches such as the base branch,
 * branches checked out in any worktree (the stale-worktree sweep's domain),
 * and branches carrying an errand record — the errand surfaces own their
 * resume / close-replay cleanup, and a bare `git branch -d` there would orphan
 * the record.
 *
 * The scan is local and network-free. Branch hygiene only: the sweep never
 * infers work-unit state from a branch's presence, and never offers `-D`.
 *
 * @module
 */

import { z } from "zod";

import { isLandedInBase } from "../git/branch-containment.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { listGoneUpstreamBranches } from "../git/gone-upstream-branches.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { SlugSchema, withRemoteEvidence } from "../kernel/index.js";
import {
  branchToWorkUnitSlug,
  readShippedWorkUnitsFromExactRef,
  readShippedWorkUnitsFromRef,
} from "../work-unit/completed-index.js";
import { locusOwnsBranch } from "./locus-classification.js";
import {
  projectCleanupRemoteEvidence,
  type CleanupBaseEvidence,
  type CleanupRemoteEvidence,
} from "./cleanup-remote-evidence.js";

/** The ref namespace scoping the sweep to local branches. */
const LOCAL_BRANCH_REF_PREFIX = "refs/heads/";

/** Runtime authority for one gone-upstream branch and its cleanup verdicts. */
const OrphanBranchNameSchema = z.string().refine((value) => value.trim().length > 0, "branch must not be empty");
export const OrphanBranchReportSchema = z.union([
  z.strictObject({
    branch: OrphanBranchNameSchema,
    merged: z.boolean(),
    shippedWorkUnit: SlugSchema.nullable(),
    blockingReason: z.null().optional(),
  }),
  z.strictObject({
    branch: OrphanBranchNameSchema,
    merged: z.null(),
    shippedWorkUnit: z.null(),
    blockingReason: z.literal("evidence-unavailable"),
  }),
]);

/** One gone-upstream local branch paired with its cleanup verdicts. */
export type OrphanBranchReport = z.infer<typeof OrphanBranchReportSchema>;

/** Runtime authority for the orphan-branch sweep advisory. */
export const OrphanBranchSweepResultSchema = withRemoteEvidence({
  orphans: z.array(OrphanBranchReportSchema),
});

/** Gone-upstream type-prefixed local branches and their cleanup verdicts. */
export type OrphanBranchSweepResult = z.infer<typeof OrphanBranchSweepResultSchema>;

/** Supplied prerequisites for orphan classification against advertised base evidence. */
export interface AnalyzeOrphanBranchesSnapshotOptions extends CleanupBaseEvidence {
  exec: GitExec;
  branches: readonly string[];
  baseBranch: string;
}

/** Analyze filtered local orphan branches against one immutable advertised base snapshot. */
export async function analyzeOrphanBranchesSnapshot(
  options: AnalyzeOrphanBranchesSnapshotOptions,
): Promise<OrphanBranchSweepResult> {
  const evidence = projectCleanupRemoteEvidence(options.baseBranch, options);
  if (evidence.remoteEvidence !== "exact") return unavailableOrphans(options.branches, evidence);
  if (options.snapshot.kind === "unreachable") return unavailableOrphans(options.branches, evidence);
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) return unavailableOrphans(options.branches, evidence);
  if (options.objectAvailability.kind !== "complete") {
    throw new Error("Advertised base commit availability could not be inspected.");
  }
  const baseCommitIsLocal = options.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) return unavailableOrphans(options.branches, { remoteEvidence: "pending-fetch" });
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  if (options.history.kind === "shallow") return unavailableOrphans(options.branches, evidence);
  if (options.history.kind !== "complete") throw new Error("Orphan history completeness could not be inspected.");
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const shipped = await readShippedWorkUnitsFromExactRef(localOnlyExec, baseOid);
  const orphans = await Promise.all(options.branches.map(async (branch) => {
    const slug = branchToWorkUnitSlug(branch);
    const shippedSlug = slug !== null && shipped.has(slug) ? SlugSchema.safeParse(slug) : null;
    return {
      branch,
      merged: await isLandedInBaseStrict(localOnlyExec, branch, baseOid),
      shippedWorkUnit: shippedSlug?.success === true ? shippedSlug.data : null,
    };
  }));
  return { ...evidence, orphans };
}

function unavailableOrphans(
  branches: readonly string[],
  evidence: CleanupRemoteEvidence,
): OrphanBranchSweepResult {
  return {
    ...evidence,
    orphans: branches.map((branch) => ({
      branch,
      merged: null,
      shippedWorkUnit: null,
      blockingReason: "evidence-unavailable" as const,
    })),
  };
}

export interface RunOrphanBranchSweepOptions {
  /** Physical-worktree identity of the calling session. */
  worktreeIdentity: WorktreeIdentity;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
  /** Supplied advertised-base prerequisites; omitted only by compatibility callers. */
  baseEvidence?: CleanupBaseEvidence;
  /**
   * Branches carrying an errand record — excluded from the sweep; the errand
   * surfaces (resume, close replay) own their cleanup. `null` when the records
   * could not be read (no resolved identity): the sweep then declines to run
   * rather than offer a delete that could orphan an errand record.
   */
  errandBranches: ReadonlySet<string> | null;
  /** Complete derived checkout roster; null suppresses cleanup offers. */
  derivedRoster: readonly DerivedCheckoutRow[] | null;
  exec: GitExec;
}

/**
 * Run the orphan-branch sweep: enumerate gone-upstream type-prefixed local
 * branches and resolve each one's merged-to-base and shipped-WU verdicts.
 *
 * The shipped-WU index (one `ls-tree` over the local remote-tracking base) is read only when the scan surfaced
 * candidates, so the clean path pays a single `for-each-ref`.
 *
 * @param options - Worktree identity, base branch, errand-branch exclusions, and the git executor
 * @returns The gone-upstream orphans, each with its cleanup verdicts
 */
export async function runOrphanBranchSweep(
  options: RunOrphanBranchSweepOptions,
): Promise<OrphanBranchSweepResult> {
  const { baseBranch, errandBranches, exec } = options;
  // Without the errand-record index an errand branch is indistinguishable from
  // a WU branch, and a `git branch -d` offer on one would orphan its record —
  // decline the whole advisory rather than risk it.
  if (errandBranches === null || options.derivedRoster === null) {
    return { orphans: [], remoteEvidence: "not-applicable" };
  }
  const derivedRoster = options.derivedRoster;

  const goneBranches = (await listGoneUpstreamBranches(exec, LOCAL_BRANCH_REF_PREFIX)).filter(
    (branch) => branchToWorkUnitSlug(branch) !== null
      && !errandBranches.has(branch)
      && !locusOwnsBranch(derivedRoster, branch),
  );
  if (goneBranches.length === 0) {
    return { orphans: [], remoteEvidence: "not-applicable" };
  }

  if (options.baseEvidence !== undefined) {
    return analyzeOrphanBranchesSnapshot({
      ...options.baseEvidence,
      exec,
      branches: goneBranches,
      baseBranch,
    });
  }

  const integrationTarget = `origin/${baseBranch}`;
  const shipped = await readShippedWorkUnitsFromRef(exec, integrationTarget);

  const orphans = await Promise.all(
    goneBranches.map(async (branch) => {
      const slug = branchToWorkUnitSlug(branch);
      const shippedSlug = slug !== null && shipped.has(slug) ? SlugSchema.safeParse(slug) : null;
      return {
        branch,
        merged: await isLandedInBase(exec, branch, integrationTarget),
        shippedWorkUnit: shippedSlug?.success === true ? shippedSlug.data : null,
      };
    }),
  );

  return { orphans, remoteEvidence: "not-applicable" };
}
