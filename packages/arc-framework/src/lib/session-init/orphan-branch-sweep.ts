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
 *   `git branch -D` action: patch-equivalent rebased commits need not be
 *   reachable from base, so `-d` would refuse. Unmerged orphans stay advisory.
 *
 * Excluded from the scan: bare (unprefixed) branches such as the base branch,
 * branches checked out in any worktree (the stale-worktree sweep's domain),
 * and branches carrying an errand record — the errand surfaces own their
 * resume / close-replay cleanup, and a bare `git branch -d` there would orphan
 * the record.
 *
 * The scan is local and network-free. Branch hygiene only: the sweep never
 * infers work-unit state from a branch's presence; deletion requires shipped or landed evidence.
 *
 * @module
 */

import { readOrphanStoreCandidates, type OrphanStoreOptions, type OrphanStoreCandidate } from "./orphan-store-candidates.js";
import { z } from "zod";
import { SessionActionsSchema } from "./actions.js";

import { isLandedInBase } from "../git/branch-containment.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import type { GitExec } from "../git/exec.js";
import { listGoneUpstreamBranches } from "../git/gone-upstream-branches.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { SlugSchema, withRemoteEvidence } from "../kernel/index.js";
import { readShippedWorkUnitsFromExactRef, readShippedWorkUnitsFromRef } from "../work-unit/completed-index.js";
import { branchToWorkUnitSlug } from "../work-unit/work-unit-slug.js";
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
    actions: SessionActionsSchema.optional(),
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
  warnings: z.array(z.string()).optional(),
});

/** Gone-upstream type-prefixed local branches and their cleanup verdicts. */
export type OrphanBranchSweepResult = z.infer<typeof OrphanBranchSweepResultSchema>;

/** Supplied prerequisites for orphan classification against advertised base evidence. */
export interface AnalyzeOrphanBranchesSnapshotOptions extends CleanupBaseEvidence, OrphanStoreOptions {
  exec: GitExec;
  branches: readonly string[];
  baseBranch: string;
}

/** Analyze filtered local orphan branches against one immutable advertised base snapshot. */
export async function analyzeOrphanBranchesSnapshot(
  options: AnalyzeOrphanBranchesSnapshotOptions,
): Promise<OrphanBranchSweepResult> {
  if (options.store?.capabilities.stateOffBranch === true) {
    const selected = await readOrphanStoreCandidates(options, options.branches);
    if (selected.status !== "ready") return { orphans: [], warnings: [selected.reason], remoteEvidence: "not-applicable" };
    return analyzeStoreSnapshot(options, selected.candidates);
  }
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
    const name = branchToWorkUnitSlug(branch);
    const shippedName = name !== null && shipped.has(name) ? name : null;
    const shippedSlug = shippedName === null ? null : SlugSchema.safeParse(shippedName);
    return {
      branch,
      merged: await isLandedInBaseStrict(localOnlyExec, branch, baseOid),
      shippedWorkUnit: shippedSlug?.success === true ? shippedSlug.data : null,
    };
  }));
  return { ...evidence, orphans: orphans.map(withOrphanActions) };
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

export interface RunOrphanBranchSweepOptions extends OrphanStoreOptions {
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
  if (options.store?.capabilities.stateOffBranch === true) {
    if (options.derivedRoster === null) return { orphans: [], remoteEvidence: "not-applicable" };
    const branches = await listGoneUpstreamBranches(exec, LOCAL_BRANCH_REF_PREFIX);
    const selected = await readOrphanStoreCandidates(options, branches, options.derivedRoster);
    if (selected.status !== "ready") return { orphans: [], warnings: [selected.reason], remoteEvidence: "not-applicable" };
    if (selected.candidates.length === 0) return { orphans: [], remoteEvidence: "not-applicable" };
    if (options.baseEvidence !== undefined) return analyzeStoreSnapshot({ ...options, ...options.baseEvidence, branches }, selected.candidates);
    const orphans = await Promise.all(selected.candidates.map(async candidate => storeOrphanReport(candidate,
      await isLandedInBase(exec, candidate.branch, `origin/${baseBranch}`))));
    return { orphans, remoteEvidence: "not-applicable" };
  }
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
      store: options.store,
      projectId: options.projectId,
    });
  }

  const integrationTarget = `origin/${baseBranch}`;
  const shipped = await readShippedWorkUnitsFromRef(exec, integrationTarget);

  const orphans = await Promise.all(
    goneBranches.map(async (branch) => {
      const name = branchToWorkUnitSlug(branch);
      const shippedName = name !== null && shipped.has(name) ? name : null;
      const shippedSlug = shippedName === null ? null : SlugSchema.safeParse(shippedName);
      return {
        branch,
        merged: await isLandedInBase(exec, branch, integrationTarget),
        shippedWorkUnit: shippedSlug?.success === true ? shippedSlug.data : null,
      };
    }),
  );

  return { orphans: orphans.map(withOrphanActions), remoteEvidence: "not-applicable" };
}


function withOrphanActions(report: OrphanBranchReport): OrphanBranchReport {
  if (report.shippedWorkUnit !== null) {
    return { ...report, actions: [{ text: `arc teardown ${report.shippedWorkUnit}`,
      argv: ["arc", "teardown", report.shippedWorkUnit] }] };
  }
  if (report.merged === true) {
    return { ...report, actions: [{ text: `git branch -D ${report.branch}`,
      argv: ["git", "branch", "-D", report.branch] }] };
  }
  return report;
}

/** Classify selected store candidates against the exact advertised base without rereading identity state. */
async function analyzeStoreSnapshot(options: AnalyzeOrphanBranchesSnapshotOptions,
  candidates: readonly OrphanStoreCandidate[]): Promise<OrphanBranchSweepResult> {
  const evidence = projectCleanupRemoteEvidence(options.baseBranch, options);
  const branches = candidates.map(candidate => candidate.branch);
  if (evidence.remoteEvidence !== "exact" || options.snapshot.kind === "unreachable") return unavailableOrphans(branches, evidence);
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) return unavailableOrphans(branches, evidence);
  if (options.objectAvailability.kind !== "complete") throw new Error("Advertised base commit availability could not be inspected.");
  if (options.objectAvailability.commits[baseOid] === false) return unavailableOrphans(branches, { remoteEvidence: "pending-fetch" });
  if (options.objectAvailability.commits[baseOid] === undefined) throw new Error("The advertised base commit has no local availability fact.");
  if (options.history.kind === "shallow") return unavailableOrphans(branches, evidence);
  if (options.history.kind !== "complete") throw new Error("Orphan history completeness could not be inspected.");
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, { ...execOptions, objectAccess: "local-only" });
  const orphans = await Promise.all(candidates.map(async candidate => storeOrphanReport(candidate,
    await isLandedInBaseStrict(localOnlyExec, candidate.branch, baseOid))));
  return { ...evidence, orphans };
}

function storeOrphanReport(candidate: OrphanStoreCandidate, merged: boolean): OrphanBranchReport {
  const { branch, authority: { record, link } } = candidate;
  const shippedWorkUnit = record.reference.kind === "work-item/meta" && record.placement?.kind === "completed"
    && link.linkedAs === "created" ? SlugSchema.parse(record.reference.owner.name) : null;
  const report = withOrphanActions({ branch, merged, shippedWorkUnit });
  return link.linkedAs === "adopted" && !merged ? { branch, merged, shippedWorkUnit, actions: [{
    text: `Branch ${branch} is kept for its owner. Its owner may run git branch -D ${branch} after preserving its work.`,
  }] } : report;
}
