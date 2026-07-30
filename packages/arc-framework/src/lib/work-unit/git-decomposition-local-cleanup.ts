/**
 * Git orchestration for exact-base, local-only decomposition cleanup.
 *
 * @module
 */

import { lstat } from "node:fs/promises";

import type { GitExec } from "../git/exec.js";
import { isWorktreeClean } from "../git/worktree-cleanup.js";
import {
  readWorktreeMarker,
  type WorktreeMarkerReadResult,
} from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktree,
  type RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import {
  nodeReconcileWorktreeFs,
  reconcileWorktree,
} from "./mutators/reconcile-worktree.js";
import {
  resolveConfiguredBaseDecompositionAnchor,
  type ConfiguredBaseDecompositionAnchorResult,
} from "./configured-base-decomposition-anchor.js";
import {
  authorizeDecompositionCleanup,
  releaseDecompositionCleanupRegistration,
  type DecompositionCleanupAuthorization,
  type DecompositionCleanupReleaseResult,
} from "./decomposition-cleanup-gate.js";
import {
  createNodeDecomposeTransientClaimStore,
  type DecomposeTransientClaimStore,
} from "./decompose-transient-claim-store.js";
import { decomposeCandidateBranch } from "./decompose-transient-claim.js";

/** Mutable boundaries used by the landed decomposition cleanup driver. */
export interface GitDecompositionLocalCleanupDependencies {
  cwd: string;
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
  closeUserWorkspace(origin: string): Promise<void>;
  chdir?: (path: string) => void;
  scanWorktrees?: () => Promise<RegisteredWorktreeScanResult>;
  readMarker?: (path: string) => Promise<WorktreeMarkerReadResult>;
  removeWorktree?: (path: string) => Promise<void>;
  claims?: DecomposeTransientClaimStore;
}

/** One local projection's idempotent cleanup disposition. */
export interface DecompositionLocalProjectionCleanup {
  branch: string;
  branchOutcome: "deleted" | "already-absent";
  worktreeOutcome: "removed" | "already-absent";
}

/** Completed local-only cleanup and exact claim lifecycle outcomes. */
export interface GitDecompositionLocalCleanupCompleted {
  status: "cleaned";
  retirement: "retired" | "already-retired-matching" | "not-applicable";
  registration:
    | "released"
    | "already-released-matching"
    | "not-applicable";
  source: DecompositionLocalProjectionCleanup;
  candidate: DecompositionLocalProjectionCleanup;
  remote: { kind: "not-authorized" };
}

/** Observable outcomes retained when local cleanup stops after mutation begins. */
export interface GitDecompositionLocalCleanupProgress {
  source: {
    branch: string;
    branchOutcome: DecompositionLocalProjectionCleanup["branchOutcome"] | null;
    worktreeOutcome: DecompositionLocalProjectionCleanup["worktreeOutcome"] | null;
  };
  candidate: {
    branch: string;
    branchOutcome: DecompositionLocalProjectionCleanup["branchOutcome"] | null;
    worktreeOutcome: DecompositionLocalProjectionCleanup["worktreeOutcome"] | null;
  };
  userWorkspace: "pending" | "closed";
}

/** Closed public result for decomposition-aware teardown dispatch. */
export type GitDecompositionLocalCleanupResult =
  | GitDecompositionLocalCleanupCompleted
  | { status: "not-decomposition" }
  | {
      status: "refused";
      reason: string;
      progress?: GitDecompositionLocalCleanupProgress;
    };

async function resolveLocalRef(
  deps: GitDecompositionLocalCleanupDependencies,
  branch: string,
): Promise<string | null> {
  const { stdout } = await deps.exec(
    "git",
    ["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`],
    { cwd: deps.cwd },
  );
  const heads = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (heads.length === 0) return null;
  const head = heads.length === 1 ? heads[0] : undefined;
  if (head === undefined || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(head)) {
    throw new Error(`could not resolve one exact local branch head for \`${branch}\``);
  }
  return head;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

function sourceMarkerMatches(marker: WorktreeMarkerReadResult, origin: string): boolean {
  if (marker.kind !== "present" || !marker.marker.spawnedByArc) return false;
  return marker.marker.wuName === origin
    || (marker.marker.createdFor?.kind === "work-unit"
      && marker.marker.createdFor.name === origin);
}

async function readCleanupMarker(
  deps: GitDecompositionLocalCleanupDependencies,
  path: string,
): Promise<WorktreeMarkerReadResult> {
  return deps.readMarker === undefined
    ? await readWorktreeMarker(path)
    : await deps.readMarker(path);
}

function candidateMarkerMatches(
  marker: WorktreeMarkerReadResult,
  authorization: DecompositionCleanupAuthorization,
): boolean {
  if (authorization.retirement.kind !== "required" || marker.kind !== "present") return false;
  const candidate = marker.marker.decompositionCandidate;
  return candidate?.claimId === authorization.retirement.claim.claimId
    && candidate.generation === authorization.retirement.claim.generation
    && candidate.candidateWorktree === authorization.retirement.claim.candidateWorktree;
}

function uniqueProjection(
  scan: Extract<RegisteredWorktreeScanResult, { ok: true }>,
  branch: string,
  path?: string,
): RegisteredWorktree | null | false {
  const matches = scan.worktrees.filter(
    (entry) => entry.branch === branch || (path !== undefined && entry.path === path),
  );
  if (matches.length === 0) return null;
  return matches.length === 1 ? matches[0] ?? false : false;
}

function anchorRefusal(result: Exclude<ConfiguredBaseDecompositionAnchorResult, { status: "resolved" }>): string {
  switch (result.status) {
    case "absent":
      return "absent";
    case "ambiguous":
      return "ambiguous decomposition receipts on the configured base";
    case "not-landed":
      return "the decomposition is not landed on the exact configured base";
    case "stale":
      return "the configured base moved during decomposition cleanup selection";
    case "refused": {
      const location = result.reason === "namespace-corrupt"
        && result.ref !== undefined
        && result.record !== undefined
        ? ` at ref ${result.ref}, record ${result.record}`
        : "";
      return `decomposition cleanup authority is unavailable (${result.reason}${location})`;
    }
  }
}

async function validateProjection(
  deps: GitDecompositionLocalCleanupDependencies,
  scan: Extract<RegisteredWorktreeScanResult, { ok: true }>,
  input: {
    branch: string;
    head: string;
    path?: string;
    markerMatches(marker: WorktreeMarkerReadResult): boolean;
  },
): Promise<{ status: "valid"; worktree: RegisteredWorktree | null } | { status: "refused"; reason: string }> {
  const branchHead = await resolveLocalRef(deps, input.branch);
  if (branchHead !== null && branchHead !== input.head) {
    return {
      status: "refused",
      reason: `local branch \`${input.branch}\` moved from its receipt-bound head`,
    };
  }
  const worktree = uniqueProjection(scan, input.branch, input.path);
  if (worktree === false) {
    return {
      status: "refused",
      reason: `multiple local worktree projections match \`${input.branch}\``,
    };
  }
  if (worktree === null) {
    if (input.path !== undefined && await pathExists(input.path)) {
      return {
        status: "refused",
        reason: `the receipt-bound candidate path exists without an exact Git registration`,
      };
    }
    return { status: "valid", worktree: null };
  }
  if (worktree.head !== input.head
    || (worktree.branch !== input.branch && !worktree.detached)
    || (input.path !== undefined && worktree.path !== input.path)) {
    return {
      status: "refused",
      reason: `the registered worktree for \`${input.branch}\` does not match its exact cleanup authority`,
    };
  }
  const marker = await readCleanupMarker(deps, worktree.path);
  if (!input.markerMatches(marker)) {
    return {
      status: "refused",
      reason: `the registered worktree for \`${input.branch}\` lacks its exact ARC ownership marker`,
    };
  }
  if (!await isWorktreeClean({ exec: deps.exec, cwd: worktree.path })) {
    return {
      status: "refused",
      reason: `refusing to remove dirty worktree \`${worktree.path}\``,
    };
  }
  return { status: "valid", worktree };
}

async function deleteExactLocalBranch(
  deps: GitDecompositionLocalCleanupDependencies,
  branch: string,
  head: string,
): Promise<"deleted" | "already-absent"> {
  const current = await resolveLocalRef(deps, branch);
  if (current === null) return "already-absent";
  if (current !== head) throw new Error(`local branch \`${branch}\` moved during cleanup`);
  await deps.exec(
    "git",
    ["update-ref", "-d", `refs/heads/${branch}`, head],
    { cwd: deps.cwd },
  );
  if (await resolveLocalRef(deps, branch) !== null) {
    throw new Error(`local branch \`${branch}\` remains after exact deletion`);
  }
  return "deleted";
}

async function removeProjectionWorktree(
  deps: GitDecompositionLocalCleanupDependencies,
  worktree: RegisteredWorktree | null,
): Promise<"removed" | "already-absent"> {
  if (worktree === null) return "already-absent";
  if (deps.removeWorktree !== undefined) {
    await deps.removeWorktree(worktree.path);
  } else {
    await reconcileWorktree(
      {
        exec: deps.exec,
        chdir: (path) => {
          if (deps.chdir === undefined) process.chdir(path);
          else deps.chdir(path);
        },
        fs: nodeReconcileWorktreeFs,
      },
      {
        mutation: "teardown",
        worktreePath: worktree.path,
        currentLocus: deps.cwd,
      },
    );
  }
  return "removed";
}

async function candidateReleaseEvidence(
  deps: GitDecompositionLocalCleanupDependencies,
  branch: string,
  path: string | null,
): Promise<{
  registrationAbsent: boolean;
  markerAbsent: boolean;
  branchOccupationAbsent: boolean;
}> {
  const scan = await (deps.scanWorktrees ?? (() => scanRegisteredWorktrees(deps.exec)))();
  if (!scan.ok) {
    return {
      registrationAbsent: false,
      markerAbsent: false,
      branchOccupationAbsent: false,
    };
  }
  const registrationAbsent = !scan.worktrees.some(
    (entry) => entry.branch === branch || (path !== null && entry.path === path),
  );
  const markerAbsent = path === null
    || (await readCleanupMarker(deps, path)).kind === "absent";
  return {
    registrationAbsent,
    markerAbsent,
    branchOccupationAbsent: registrationAbsent && await resolveLocalRef(deps, branch) === null,
  };
}

function releaseOutcome(
  release: DecompositionCleanupReleaseResult,
): GitDecompositionLocalCleanupCompleted["registration"] | null {
  if (release.status === "not-applicable") return "not-applicable";
  if (release.status === "released") return release.outcome;
  return null;
}

/**
 * Retire one exact landed decomposition claim, remove only its local source and
 * candidate projections, and release the candidate registration after absence
 * proof.
 *
 * @param configuredBaseRef - Local configured-base ref containing the exact landing
 * @param origin - Retired source work-unit slug
 * @param deps - Git, object, claim, workspace, and worktree boundaries
 * @returns Completed local cleanup, a non-decomposition fallback signal, or a refusal
 */
export async function cleanupGitLandedDecompositionLocally(
  configuredBaseRef: string,
  origin: string,
  deps: GitDecompositionLocalCleanupDependencies,
): Promise<GitDecompositionLocalCleanupResult> {
  let selection: ConfiguredBaseDecompositionAnchorResult;
  try {
    selection = await resolveConfiguredBaseDecompositionAnchor(
      configuredBaseRef,
      origin,
      { exec: deps.exec, readBlob: async (oid) => await deps.readBlob(oid) },
    );
  } catch (error) {
    return {
      status: "refused",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (selection.status === "absent") return { status: "not-decomposition" };
  if (selection.status !== "resolved") {
    return { status: "refused", reason: anchorRefusal(selection) };
  }

  let claims: DecomposeTransientClaimStore;
  try {
    claims = deps.claims
      ?? await createNodeDecomposeTransientClaimStore(deps.exec, deps.cwd);
  } catch (error) {
    return {
      status: "refused",
      reason: `decomposition claim store is unavailable (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
  const sourceBranch =
    selection.anchor.receipt.prepared.completedMap.machine.source.logicalBranch;
  let authorization: Awaited<ReturnType<typeof authorizeDecompositionCleanup>>;
  try {
    authorization = await authorizeDecompositionCleanup(
      selection,
      {
        origin,
        branch: sourceBranch,
        head: selection.anchor.sourceHead,
        locality: "local",
      },
      claims,
    );
  } catch (error) {
    return {
      status: "refused",
      reason: `decomposition cleanup authorization failed (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
  if (authorization.status !== "authorized") {
    return {
      status: "refused",
      reason: `decomposition cleanup authorization refused (${authorization.reason})`,
    };
  }

  const candidateBranch = authorization.authorization.retirement.kind === "required"
    ? authorization.authorization.retirement.claim.binding.candidateBranch
    : decomposeCandidateBranch(origin);
  const candidatePath = authorization.authorization.retirement.kind === "required"
    ? authorization.authorization.retirement.claim.registration.kind === "registered"
      ? authorization.authorization.retirement.claim.registration.path
      : authorization.authorization.retirement.claim.registration.kind === "released"
        ? authorization.authorization.retirement.claim.registration.lastPath
        : null
    : null;
  let scan: RegisteredWorktreeScanResult;
  try {
    scan = await (deps.scanWorktrees ?? (() => scanRegisteredWorktrees(deps.exec)))();
  } catch (error) {
    return {
      status: "refused",
      reason: `could not read registered worktrees (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }
  if (!scan.ok) {
    return { status: "refused", reason: `could not read registered worktrees (${scan.message})` };
  }
  let candidate: Awaited<ReturnType<typeof validateProjection>>;
  let source: Awaited<ReturnType<typeof validateProjection>>;
  try {
    if (authorization.authorization.retirement.kind === "not-applicable") {
      const unexpectedCandidate = await resolveLocalRef(deps, candidateBranch) !== null
        || scan.worktrees.some(({ branch }) => branch === candidateBranch);
      if (unexpectedCandidate) {
        return {
          status: "refused",
          reason: `partial-protection cleanup found unexpected candidate projection \`${candidateBranch}\``,
        };
      }
      candidate = { status: "valid", worktree: null };
    } else {
      candidate = await validateProjection(deps, scan, {
        branch: candidateBranch,
        head: selection.anchor.candidateCommitHead,
        ...(candidatePath === null ? {} : { path: candidatePath }),
        markerMatches: (marker) =>
          candidateMarkerMatches(marker, authorization.authorization),
      });
    }
    if (candidate.status === "refused") return candidate;
    source = await validateProjection(deps, scan, {
      branch: sourceBranch,
      head: selection.anchor.sourceHead,
      markerMatches: (marker) => sourceMarkerMatches(marker, origin),
    });
    if (source.status === "refused") return source;
  } catch (error) {
    return {
      status: "refused",
      reason: `could not validate exact local cleanup projections (${
        error instanceof Error ? error.message : String(error)
      })`,
    };
  }

  const progress: GitDecompositionLocalCleanupProgress = {
    candidate: {
      branch: candidateBranch,
      branchOutcome: null,
      worktreeOutcome: null,
    },
    source: {
      branch: sourceBranch,
      branchOutcome: null,
      worktreeOutcome: null,
    },
    userWorkspace: "pending",
  };
  try {
    const candidateWorktreeOutcome = await removeProjectionWorktree(deps, candidate.worktree);
    progress.candidate.worktreeOutcome = candidateWorktreeOutcome;
    const candidateBranchOutcome = await deleteExactLocalBranch(
      deps,
      candidateBranch,
      selection.anchor.candidateCommitHead,
    );
    progress.candidate.branchOutcome = candidateBranchOutcome;
    const sourceWorktreeOutcome = await removeProjectionWorktree(deps, source.worktree);
    progress.source.worktreeOutcome = sourceWorktreeOutcome;
    const sourceBranchOutcome = await deleteExactLocalBranch(
      deps,
      sourceBranch,
      selection.anchor.sourceHead,
    );
    progress.source.branchOutcome = sourceBranchOutcome;
    await deps.closeUserWorkspace(origin);
    progress.userWorkspace = "closed";

    const evidence = await candidateReleaseEvidence(
      deps,
      candidateBranch,
      candidatePath,
    );
    const complete = Object.values(evidence).every(Boolean);
    const release = await releaseDecompositionCleanupRegistration(
      authorization.authorization,
      complete
        ? { status: "completed", releaseEvidence: evidence }
        : { status: "failed" },
      claims,
    );
    const registration = releaseOutcome(release);
    if (registration === null) {
      return {
        status: "refused",
        reason: release.status === "preserved"
          ? `decomposition claim registration was preserved (${release.reason})`
          : "decomposition claim registration could not be released",
        progress,
      };
    }
    return {
      status: "cleaned",
      retirement: authorization.authorization.retirement.kind === "required"
        ? authorization.authorization.retirement.outcome
        : "not-applicable",
      registration,
      source: {
        branch: sourceBranch,
        branchOutcome: sourceBranchOutcome,
        worktreeOutcome: sourceWorktreeOutcome,
      },
      candidate: {
        branch: candidateBranch,
        branchOutcome: candidateBranchOutcome,
        worktreeOutcome: candidateWorktreeOutcome,
      },
      remote: { kind: "not-authorized" },
    };
  } catch (error) {
    await releaseDecompositionCleanupRegistration(
      authorization.authorization,
      { status: "failed" },
      claims,
    );
    return {
      status: "refused",
      reason: error instanceof Error ? error.message : String(error),
      progress,
    };
  }
}
