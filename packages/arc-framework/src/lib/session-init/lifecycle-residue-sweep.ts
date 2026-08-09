/**
 * Read-only landed transform and deferred rename projections for session entry.
 *
 * @module
 */

import type { WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import { isWorktreeClean } from "../git/worktree-cleanup.js";
import type {
  RegisteredWorktree,
} from "../git/worktree-roster.js";
import type { GitExec } from "../git/exec.js";
import { readRefTip } from "../git/ref-tree.js";
import type { ProtectionMode } from "../git/write-context.js";
import {
  projectSuccessorReadiness,
  type RetirementLifecycleResult,
} from "../work-unit/retirement-lifecycle-result.js";
import type {
  TeardownAuthorizationDecision,
  TeardownAuthorizationRequest,
} from "../work-unit/retirement-authority.js";
import {
  createTeardownRetirementAuthority,
  createTeardownRetirementAuthorityStrict,
  type TeardownBlobReader,
} from "../work-unit/teardown-retirement-driver.js";
import { resolveParkProofTarget, type ParkProofTarget } from "../work-unit/park-retirement-proof.js";
import {
  projectCleanupRemoteEvidence,
  type CleanupBaseEvidence,
  type CleanupRemoteEvidence,
} from "./cleanup-remote-evidence.js";

/** Structured outside-worktree action for one validated deferred rename move. */
export interface RenameMoveRemedy {
  argv: readonly ["git", "worktree", "move", string, string];
  text: string;
}

/** Validated path-lag projection surfaced by the session-entry sweep. */
export interface RenameMoveResidue {
  oldSlug: string;
  newSlug: string;
  branch: string;
  head: string;
  from: string;
  to: string;
  remedy: RenameMoveRemedy;
}

/** Ordinary CLI action offered for one structurally proven landed retirement. */
export interface RetirementTeardownRemedy {
  argv: readonly ["arc", "teardown", string];
  text: string;
}

/** Landed branch residue, either actionable or preserved as blocked evidence. */
export type LandedRetirementResidue =
  | {
      status: "actionable";
      worktreePath: string;
      lifecycle: RetirementLifecycleResult;
      teardown: RetirementTeardownRemedy;
    }
  | {
      status: "blocked";
      worktreePath: string;
      subject: { slug: string; branch: string };
      reason: string;
    };

export type LandedRetirementSweepResult = CleanupRemoteEvidence & {
  retirements: LandedRetirementResidue[];
  warnings: string[];
};

export interface RunLandedRetirementSweepOptions {
  topology: readonly RegisteredWorktree[];
  markers: ReadonlyMap<string, WorktreeMarkerReadResult>;
  baseBranch: string;
  protection: ProtectionMode;
  exec: GitExec;
  readBlob: TeardownBlobReader;
  remote?: string;
  /** Supplied advertised-base prerequisites from session composition. */
  baseEvidence?: CleanupBaseEvidence;
  /** Compatibility acquisition seam for callers outside session composition. */
  fetchBase?: () => Promise<boolean>;
  authorize?: (request: TeardownAuthorizationRequest) => Promise<TeardownAuthorizationDecision>;
  isClean?: (worktreePath: string) => Promise<boolean>;
}

/**
 * Validate one pending rename marker against the complete live registration.
 *
 * @param worktree - Registered worktree whose marker was read
 * @param marker - Validated marker read result
 * @param topology - Complete registered topology used to reject ambiguity and occupied targets
 * @returns An exact outside-worktree remedy, or `null` when any stamped fact is stale
 */
export function projectRenameMoveRemedy(
  worktree: RegisteredWorktree,
  marker: WorktreeMarkerReadResult,
  topology: readonly RegisteredWorktree[],
): RenameMoveResidue | null {
  if (marker.kind !== "present") return null;
  const pending = marker.marker.renameMovePending;
  if (pending === undefined) return null;
  if (
    marker.marker.createdFor?.kind !== "work-unit"
    || marker.marker.createdFor.name !== pending.newSlug
    || marker.marker.wuName !== pending.newSlug
    || worktree.detached
    || worktree.branch !== pending.branch
    || worktree.head !== pending.head
    || worktree.path !== pending.from
  ) {
    return null;
  }
  const branchRegistrations = topology.filter((entry) => entry.branch === pending.branch);
  if (
    branchRegistrations.length !== 1
    || topology.some((entry) => entry.path === pending.to)
  ) {
    return null;
  }
  return {
    ...pending,
    remedy: {
      argv: ["git", "worktree", "move", pending.from, pending.to],
      text: `Move the registered worktree from ${JSON.stringify(pending.from)} to ${JSON.stringify(pending.to)}.`,
    },
  };
}

/**
 * Discover still-branched retired worktrees from protection-aware base evidence.
 *
 * @param options - Registered topology, marker facts, and authority adapters
 * @returns Actionable and blocked retirement residue plus degraded-read warnings
 */
export async function runLandedRetirementSweep(
  options: RunLandedRetirementSweepOptions,
): Promise<LandedRetirementSweepResult> {
  const projectedEvidence = projectCleanupRemoteEvidence(options.baseBranch, options.baseEvidence);
  const candidates = options.topology.filter((entry) => {
    if (entry.detached || entry.branch === null) return false;
    const marker = options.markers.get(entry.path);
    return marker?.kind === "present"
      && marker.marker.createdFor?.kind === "work-unit"
      && marker.marker.wuName === marker.marker.createdFor.name
      && marker.marker.husk === undefined
      && marker.marker.renameMovePending === undefined;
  });
  if (candidates.length === 0) return { ...projectedEvidence, retirements: [], warnings: [] };

  const remote = options.remote ?? "origin";
  const baseRef = options.protection === "full" ? `${remote}/${options.baseBranch}` : options.baseBranch;
  let authorityExec = options.exec;
  let proofTarget: ParkProofTarget;
  if (options.baseEvidence !== undefined) {
    const baseEvidence = options.baseEvidence;
    if (!baseEvidence.remoteSyncEnabled || baseEvidence.snapshot.kind === "unreachable") {
      return blockedRetirements(projectedEvidence, candidates, options.markers);
    }
    const baseOid = baseEvidence.snapshot.tips[options.baseBranch];
    if (baseOid === undefined) {
      return blockedRetirements(projectedEvidence, candidates, options.markers);
    }
    if (baseEvidence.objectAvailability.kind !== "complete") {
      throw new Error("Advertised retirement object availability could not be inspected.");
    }
    const baseCommitIsLocal = baseEvidence.objectAvailability.commits[baseOid];
    if (baseCommitIsLocal === false) {
      return blockedRetirements(projectedEvidence, candidates, options.markers);
    }
    if (baseCommitIsLocal === undefined) {
      throw new Error("The advertised base commit has no local availability fact.");
    }
    if (baseEvidence.history.kind === "shallow") {
      return blockedRetirements(projectedEvidence, candidates, options.markers);
    }
    if (baseEvidence.history.kind !== "complete") {
      throw new Error("Local retirement history completeness could not be inspected.");
    }
    authorityExec = (command, args, execOptions) => options.exec(command, args, {
      ...execOptions,
      objectAccess: "local-only",
    });
    proofTarget = { ref: baseOid, head: baseOid };
  } else {
    try {
      proofTarget = await resolveParkProofTarget({
        refreshRemoteBase: async (remoteName, baseBranch) => {
          const fetched = options.fetchBase === undefined
            ? await fetchAuthorityBase(options.exec, remoteName, baseBranch)
            : await options.fetchBase();
          if (!fetched) throw new Error("remote base refresh failed");
          const head = await readRefTip(options.exec, `${remoteName}/${baseBranch}`);
          if (head === null) throw new Error("remote base read failed");
          return head;
        },
        readLocalBase: async (baseBranch) => {
          const head = await readRefTip(options.exec, baseBranch);
          if (head === null) throw new Error("local base read failed");
          return head;
        },
      }, {
        protection: options.protection,
        remote,
        baseBranch: options.baseBranch,
      });
    } catch {
      return {
        ...projectedEvidence,
        retirements: [],
        warnings: [`Could not resolve lifecycle authority ref \`${baseRef}\`; retirement cleanup remains manual.`],
      };
    }
  }

  const authority = options.authorize === undefined
    ? (options.baseEvidence === undefined
        ? createTeardownRetirementAuthority(authorityExec, proofTarget, options.readBlob)
        : createTeardownRetirementAuthorityStrict(authorityExec, proofTarget, options.readBlob)
      ).authorize
    : options.authorize;
  const clean = options.isClean
    ?? (async (worktreePath: string) => await isWorktreeClean({ exec: options.exec, cwd: worktreePath }));
  const projected = await Promise.all(candidates.map(async (
    candidate,
  ): Promise<LandedRetirementResidue | null> => {
    const marker = options.markers.get(candidate.path);
    if (marker?.kind !== "present" || marker.marker.createdFor?.kind !== "work-unit") return null;
    const slug = marker.marker.createdFor.name;
    if (candidate.branch === null) return null;
    const decision = await authority({
      subject: { kind: "work-unit", name: slug },
      branch: candidate.branch,
      head: candidate.head,
      remote,
      requestedMode: "abandoned",
    });
    if (decision.status !== "authorized") {
      if (decision.reason !== "evidence-missing" && decision.reason !== "unsupported-transition") {
        return {
          status: "blocked",
          worktreePath: candidate.path,
          subject: { slug, branch: candidate.branch },
          reason: decision.reason,
        };
      }
      return null;
    }
    const evidence = decision.evidence;
    if (evidence.kind !== "git-transition" || evidence.transition !== "abandon") return null;
    if (!await clean(candidate.path)) {
      return {
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch },
        reason: "uncommitted",
      };
    }
    const pending = { status: "pending" } as const;
    return {
      status: "actionable",
      worktreePath: candidate.path,
      lifecycle: {
        subject: { slug, branch: candidate.branch },
        transition: "abandon",
        cleanup: {
          branch: pending,
          worktree: pending,
          userWorkspace: pending,
        },
        successorReadiness: projectSuccessorReadiness([], true),
      },
      teardown: {
        argv: ["arc", "teardown", slug],
        text: `arc teardown ${slug}`,
      },
    };
  }));
  const retirements = projected.filter((entry): entry is LandedRetirementResidue => entry !== null);
  return { ...projectedEvidence, retirements, warnings: [] };
}

function blockedRetirements(
  evidence: CleanupRemoteEvidence,
  candidates: readonly RegisteredWorktree[],
  markers: ReadonlyMap<string, WorktreeMarkerReadResult>,
): LandedRetirementSweepResult {
  return {
    ...evidence,
    retirements: candidates.flatMap((candidate): LandedRetirementResidue[] => {
      const marker = markers.get(candidate.path);
      return candidate.branch !== null
        && marker?.kind === "present"
        && marker.marker.createdFor?.kind === "work-unit"
        ? [{
            status: "blocked",
            worktreePath: candidate.path,
            subject: { slug: marker.marker.createdFor.name, branch: candidate.branch },
            reason: "evidence-unavailable",
          }]
        : [];
    }),
    warnings: [],
  };
}

async function fetchAuthorityBase(exec: GitExec, remote: string, baseBranch: string): Promise<boolean> {
  try {
    await exec("git", ["fetch", remote, baseBranch]);
    return true;
  } catch {
    return false;
  }
}
