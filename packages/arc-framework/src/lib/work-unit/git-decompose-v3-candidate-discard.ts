/** Repository-bound exact-generation discard for one uncommitted decomposition candidate. */

import { lstat, readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

import {
  canonicalize,
  digestBytes,
} from "../canonical/canonical-json.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { readWorktreeMarker } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { readGitBlobBytes } from "../io-context.js";
import {
  discardV3DecomposeCandidate,
  type V3DecomposeCandidateDiscardDependencies,
  type V3DecomposeCandidateDiscardResult,
  type V3DecomposeDiscardAuthority,
  type V3DecomposeDiscardRevalidation,
} from "./decompose-candidate-discard.js";
import {
  decomposeCandidateBranch,
  type DecomposeTransientClaim,
  type DecomposeTransientReleaseEvidence,
} from "./decompose-transient-claim.js";
import { createNodeDecomposeTransientClaimStore } from "./decompose-transient-claim-store.js";
import { revalidateV3DecomposeExecutionPreflight } from "./decompose-v3-execution-preflight.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import { parseV3DecomposePreparation } from "./decompose-v3-preparation.js";
import { parseV3DecomposeReceipt } from "./decompose-v3-receipt.js";
import { createGitV3DecomposePreflight } from "./git-decompose-v3-preflight.js";
import {
  composeGitV3RepositoryPlan,
  type GitV3RepositoryPlanDependencies,
} from "./git-decompose-v3-repository-plan.js";

export type GitV3DecomposeCandidateDiscardDependencies =
  GitV3RepositoryPlanDependencies;

function bindGitCwd(exec: GitExec, cwd: string): GitExec {
  return async (command, args, options) => await exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
}

function literalPath(path: string): string {
  return `:(literal)${validateManagedPath(path)}`;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function resolveCommit(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  cwd: string,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function changedPaths(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  cwd: string,
  args: readonly string[],
): Promise<string[]> {
  const { stdout } = await dependencies.exec("git", [...args, "-z"], { cwd });
  return stdout.split("\0").filter(Boolean).sort(compareUtf8);
}

async function indexStateMatches(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  cwd: string,
  plan: ValidatedDecomposePlan,
): Promise<boolean> {
  for (const mutation of plan.mutations) {
    if (mutation.kind === "exclusive" && mutation.role === "receipt-evidence") {
      continue;
    }
    const { stdout } = await dependencies.exec(
      "git",
      ["ls-files", "--stage", "-z", "--", literalPath(mutation.path)],
      { cwd },
    );
    if (mutation.after.kind === "absent") {
      if (stdout !== "") return false;
      continue;
    }
    const entries = stdout.split("\0").filter(Boolean);
    const match = entries.length === 1
      ? /^(100644|100755) [0-9a-f]{40,64} 0\t/u.exec(entries[0] ?? "")
      : null;
    if (match?.[1] !== mutation.after.mode) return false;
    const bytes = await readGitBlobBytes(cwd, null, validateManagedPath(mutation.path));
    if (bytes === null || digestBytes(bytes) !== mutation.after.contentDigest) return false;
  }
  return true;
}

async function candidateAbsence(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  claim: DecomposeTransientClaim,
  path: string,
): Promise<DecomposeTransientReleaseEvidence & { pathAbsent: boolean }> {
  const scan = await scanRegisteredWorktrees(bindGitCwd(dependencies.exec, dependencies.cwd));
  if (!scan.ok) throw new Error(scan.message);
  const candidateRegistrations = scan.worktrees.filter(
    ({ branch, path: registeredPath }) =>
      branch === claim.binding.candidateBranch || normalize(registeredPath) === path,
  );
  const [branchHead, candidatePathExists] = await Promise.all([
    resolveCommit(
      dependencies,
      dependencies.cwd,
      `refs/heads/${claim.binding.candidateBranch}`,
    ),
    pathExists(path),
  ]);
  const marker = candidatePathExists
    ? await readWorktreeMarker(path)
    : { kind: "absent" as const };
  return {
    registrationAbsent: candidateRegistrations.length === 0,
    markerAbsent: marker.kind === "absent",
    branchOccupationAbsent: branchHead === null,
    pathAbsent: !candidatePathExists,
  };
}

function discardAuthority(plan: ValidatedDecomposePlan): V3DecomposeDiscardAuthority {
  const origin = plan.prospectiveOverlay.origin;
  return {
    planId: plan.planId,
    binding: {
      origin,
      candidateBranch: decomposeCandidateBranch(origin),
      sourceHead: plan.sourceHead,
      resultBaseHead: plan.expectedBaseHead,
      cutMapDigest: plan.cutMapDigest,
    },
  };
}

async function inspectCandidate(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  authority: V3DecomposeDiscardAuthority,
  claim: DecomposeTransientClaim,
  plan: ValidatedDecomposePlan | null,
): ReturnType<V3DecomposeCandidateDiscardDependencies["inspect"]> {
  if (plan === null || plan.planId !== authority.planId
    || canonicalize(claim.binding) !== canonicalize(authority.binding)
    || claim.registration.kind !== "registered") {
    return { status: "refused", reason: "candidate-binding-mismatch" };
  }
  const path = normalize(claim.registration.path);
  const scan = await scanRegisteredWorktrees(bindGitCwd(dependencies.exec, dependencies.cwd));
  if (!scan.ok) return { status: "refused", reason: "candidate-topology-unavailable" };
  const registrations = scan.worktrees.filter(
    ({ branch, path: registeredPath }) =>
      branch === authority.binding.candidateBranch || normalize(registeredPath) === path,
  );
  const registration = registrations[0];
  if (registrations.length !== 1 || registration === undefined
    || registration.branch !== authority.binding.candidateBranch
    || normalize(registration.path) !== path
    || registration.head !== authority.binding.resultBaseHead) {
    return registrations.length === 0
      ? { status: "absent" }
      : { status: "refused", reason: "candidate-changed" };
  }
  const [branchHead, head, marker, staged, unstaged, untracked] = await Promise.all([
    resolveCommit(
      dependencies,
      dependencies.cwd,
      `refs/heads/${authority.binding.candidateBranch}`,
    ),
    resolveCommit(dependencies, path, "HEAD"),
    readWorktreeMarker(path),
    changedPaths(dependencies, path, ["diff", "--cached", "--name-only", "--no-renames"]),
    changedPaths(dependencies, path, ["diff", "--name-only", "--no-renames"]),
    changedPaths(dependencies, path, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const expectedStaged = plan.mutations
    .filter(({ before, after }) => canonicalize(before) !== canonicalize(after))
    .map(({ path: mutationPath }) => mutationPath)
    .sort(compareUtf8);
  if (branchHead !== authority.binding.resultBaseHead
    || head !== authority.binding.resultBaseHead) {
    return { status: "refused", reason: "candidate-head-changed" };
  }
  if (marker.kind !== "present"
    || marker.marker.decompositionCandidate?.claimId !== claim.claimId
    || marker.marker.decompositionCandidate.generation !== claim.generation
    || marker.marker.decompositionCandidate.candidateWorktree !== claim.candidateWorktree) {
    return { status: "refused", reason: "candidate-marker-changed" };
  }
  if (canonicalize(staged) !== canonicalize(expectedStaged)) {
    return { status: "refused", reason: "candidate-path-set-changed" };
  }
  if (unstaged.length !== 0 || untracked.length !== 0) {
    return { status: "refused", reason: "candidate-worktree-changed" };
  }
  if (!await indexStateMatches(dependencies, path, plan)) {
    return { status: "refused", reason: "candidate-index-changed" };
  }
  const recordMutation = plan.mutations.find(
    (mutation) => mutation.kind === "exclusive" && mutation.role === "receipt-evidence",
  );
  if (recordMutation === undefined) {
    return { status: "refused", reason: "candidate-binding-mismatch" };
  }
  let record: string;
  try {
    record = await readFile(join(path, ...recordMutation.path.split("/")), "utf8");
  } catch {
    return { status: "refused", reason: "candidate-changed" };
  }
  if (parseV3DecomposeReceipt(record) !== null) {
    return { status: "refused", reason: "candidate-finalized" };
  }
  const preparation = parseV3DecomposePreparation(record);
  if (preparation === null
    || preparation.facts.prospectiveProjection.overlay.planId !== plan.planId) {
    return { status: "refused", reason: "candidate-changed" };
  }
  return {
    status: "exact",
    path,
    candidateHead: authority.binding.resultBaseHead,
    uncommitted: true,
    finalized: false,
    bindingMatches: true,
  };
}

async function buildDiscardDependencies(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  baseBranch: string,
): Promise<V3DecomposeCandidateDiscardDependencies> {
  const claims = await createNodeDecomposeTransientClaimStore(
    dependencies.exec,
    dependencies.cwd,
  );
  let currentPlan: ValidatedDecomposePlan | null = null;
  const revalidate = async (
    origin: string,
    cutMapPath: string,
  ): Promise<V3DecomposeDiscardRevalidation> => {
    const preflight = await revalidateV3DecomposeExecutionPreflight({
      readCutMap: async (path) => new Uint8Array(await readFile(path)),
      resolvePreflight: async (selectedOrigin) => {
        const result = await createGitV3DecomposePreflight({
          cwd: dependencies.cwd,
          exec: dependencies.exec,
          readBlob: (ref, path) => dependencies.readBlob(ref, path),
        }, baseBranch, selectedOrigin);
        return result.status === "ready"
          ? result
          : {
              status: "rejected",
              reason: result.reason,
              ...("locus" in result && result.locus !== undefined
                ? { locus: result.locus }
                : {}),
            };
      },
    }, origin, cutMapPath);
    if (preflight.status !== "current") {
      return {
        status: "refused",
        reason: `${preflight.reason}: ${preflight.locus}`,
      };
    }
    const composed = await composeGitV3RepositoryPlan(
      dependencies,
      baseBranch,
      preflight.completedMap,
    );
    if (composed.status === "refused") {
      return {
        status: "refused",
        reason: `${composed.refusal.stage}:${composed.refusal.reason}`,
      };
    }
    currentPlan = composed.plan;
    return { status: "current", authority: discardAuthority(composed.plan) };
  };
  return {
    claims,
    revalidate,
    inspect: async (authority, claim) =>
      await inspectCandidate(dependencies, authority, claim, currentPlan),
    cleanup: async ({ authority, claim, path }) => {
      const absence = await candidateAbsence(dependencies, claim, path);
      if (Object.values(absence).every(Boolean)) return { status: "already-absent" };
      const inspected = await inspectCandidate(dependencies, authority, claim, currentPlan);
      if (inspected.status !== "exact" || inspected.path !== path) {
        return {
          status: "refused",
          reason: inspected.status === "refused" ? inspected.reason : "candidate-not-exact",
        };
      }
      try {
        await dependencies.exec(
          "git",
          ["reset", "--hard", authority.binding.resultBaseHead],
          { cwd: path },
        );
        await dependencies.exec("git", ["worktree", "remove", path], {
          cwd: dependencies.cwd,
        });
        await dependencies.exec(
          "git",
          ["branch", "-d", authority.binding.candidateBranch],
          { cwd: dependencies.cwd },
        );
        return { status: "cleaned" };
      } catch {
        return { status: "refused", reason: "candidate-cleanup-failed" };
      }
    },
    verifyAbsent: async ({ claim, path }) => {
      const absence = await candidateAbsence(dependencies, claim, path);
      return {
        registrationAbsent: absence.registrationAbsent && absence.pathAbsent,
        markerAbsent: absence.markerAbsent,
        branchOccupationAbsent: absence.branchOccupationAbsent,
      };
    },
  };
}

/**
 * Discard the exact candidate selected by a current canonical cut map.
 *
 * @param dependencies - Exact Git/object readers and canonical cohort template.
 * @param baseBranch - Configured result base branch.
 * @param origin - Source work-unit slug.
 * @param cutMapPath - Canonical completed cut-map path.
 * @returns Exact discard completion or a closed refusal with bounded recovery.
 */
export async function discardGitV3DecomposeCandidate(
  dependencies: GitV3DecomposeCandidateDiscardDependencies,
  baseBranch: string,
  origin: string,
  cutMapPath: string,
): Promise<V3DecomposeCandidateDiscardResult> {
  try {
    return await discardV3DecomposeCandidate(
      origin,
      cutMapPath,
      await buildDiscardDependencies(dependencies, baseBranch),
    );
  } catch (error) {
    return {
      status: "refused",
      reason: error instanceof Error ? error.message : "candidate-discard-unavailable",
      recovery: { kind: "none" },
    };
  }
}
