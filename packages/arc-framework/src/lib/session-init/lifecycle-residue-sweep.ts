/**
 * Read-only landed transform and deferred rename projections for session entry.
 *
 * @module
 */

import type { WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import { isWorktreeClean } from "../git/worktree-cleanup.js";
import type {
  RegisteredWorktree,
  WorktreeRosterResult,
} from "../git/worktree-roster.js";
import type { GitExec } from "../git/exec.js";
import type { ProtectionMode } from "../git/write-context.js";
import { enumerateGitRetirementRecords } from "../work-unit/git-retirement-record-enumeration.js";
import {
  projectSuccessorReadiness,
  type RetirementLifecycleResult,
} from "../work-unit/retirement-lifecycle-result.js";
import type {
  RetirementReceipt,
  TeardownAuthorizationDecision,
  TeardownAuthorizationRequest,
} from "../work-unit/retirement-authority.js";
import type { RetirementRecordEnumerationResult } from "../work-unit/retirement-record-enumeration.js";
import {
  createTeardownRetirementAuthority,
  type TeardownBlobReader,
} from "../work-unit/teardown-retirement-driver.js";
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

/** Ordinary CLI action offered for one landed receipt-backed retirement. */
export interface RetirementTeardownRemedy {
  argv: readonly ["arc", "teardown", string];
  text: string;
}

/** Receipt-backed branch residue, either actionable or preserved as blocked evidence. */
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
  roster: WorktreeRosterResult;
  topology: readonly RegisteredWorktree[];
  markers: ReadonlyMap<string, WorktreeMarkerReadResult>;
  baseBranch: string;
  protection: ProtectionMode;
  exec: GitExec;
  readBlob: TeardownBlobReader;
  remote?: string;
  /** Supplied advertised-base prerequisites; omitted only by compatibility callers pending composition cutover. */
  baseEvidence?: CleanupBaseEvidence;
  enumerateRecords?: (ref: string) => Promise<RetirementRecordEnumerationResult>;
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
 * Discover still-branched receipt-backed worktrees from protection-aware base evidence.
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
  let baseRef = options.protection === "full" ? `${remote}/${options.baseBranch}` : options.baseBranch;
  let authorityExec = options.exec;
  const baseEvidence = options.baseEvidence;
  if (baseEvidence !== undefined) {
    if (!baseEvidence.remoteSyncEnabled) {
      return blockedRetirements(projectedEvidence, candidates, options.markers);
    }
    if (baseEvidence.snapshot.kind === "unreachable") {
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
    baseRef = baseOid;
    authorityExec = (command, args, execOptions) => options.exec(command, args, {
      ...execOptions,
      objectAccess: "local-only",
    });
  }

  const enumeration: RetirementRecordEnumerationResult = await (options.enumerateRecords === undefined
    ? enumerateGitRetirementRecords(authorityExec, baseRef)
    : options.enumerateRecords(baseRef));
  if (enumeration.status !== "valid") {
    return {
      ...projectedEvidence,
      retirements: [],
      warnings: [`Retirement authority at \`${baseRef}\` is ${enumeration.status}; cleanup remains manual.`],
    };
  }

  const authority = options.authorize === undefined
    ? createTeardownRetirementAuthority(authorityExec, baseRef, options.readBlob).authorize
    : options.authorize;
  const clean = options.isClean
    ?? (async (worktreePath: string) => await isWorktreeClean({ exec: options.exec, cwd: worktreePath }));
  const retirements: LandedRetirementResidue[] = [];
  for (const candidate of candidates) {
    const marker = options.markers.get(candidate.path);
    if (marker?.kind !== "present" || marker.marker.createdFor?.kind !== "work-unit") continue;
    const slug = marker.marker.createdFor.name;
    const receipts = matchingRetirementReceipts(enumeration, slug);
    if (receipts.length === 0) continue;
    if (candidate.branch === null) continue;
    const decision = await authority({
      subject: { kind: "work-unit", name: slug },
      branch: candidate.branch,
      head: candidate.head,
      remote,
      requestedMode: "abandoned",
    });
    if (decision.status !== "authorized") {
      if (await refusalConcernsCurrentRetirement(
        authorityExec,
        { branch: candidate.branch, head: candidate.head },
        receipts,
        baseEvidence !== undefined,
      )) {
        retirements.push({
          status: "blocked",
          worktreePath: candidate.path,
          subject: { slug, branch: candidate.branch },
          reason: decision.reason,
        });
      }
      continue;
    }
    const evidence = decision.evidence;
    const receipt = evidence.kind === "receipt"
      ? receipts.find((candidateReceipt) => candidateReceipt.receiptId === evidence.receiptId)
      : undefined;
    if (receipt === undefined) {
      retirements.push({
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch },
        reason: "evidence-mismatch",
      });
      continue;
    }
    if (!await clean(candidate.path)) {
      retirements.push({
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch },
        reason: "uncommitted",
      });
      continue;
    }
    const pending = { status: "pending" } as const;
    retirements.push({
      status: "actionable",
      worktreePath: candidate.path,
      lifecycle: {
        subject: { slug, branch: candidate.branch },
        transition: receipt.transition,
        authority: {
          kind: "receipt-backed",
          receiptId: receipt.receiptId,
          authorityVersion: decision.authorityVersion,
        },
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
    });
  }
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

async function refusalConcernsCurrentRetirement(
  exec: GitExec,
  candidate: { branch: string; head: string },
  receipts: readonly LandedRetirementReceipt[],
  strict: boolean,
): Promise<boolean> {
  const branchReceipts = receipts.filter((receipt) => receipt.source.branch === candidate.branch);
  const abandonReceipts = branchReceipts.filter((receipt) =>
    receipt.source.head !== candidate.head
  );
  if (abandonReceipts.length === 0) return false;

  const firstParent = await readFirstParent(exec, candidate.head, strict);
  if (firstParent.status === "unavailable") {
    // Branch binding plus a distinct source/current HEAD is the strongest
    // evidence available when Git cannot resolve the direct-transition parent.
    return true;
  }
  return firstParent.oid !== null
    && abandonReceipts.some((receipt) => receipt.source.head === firstParent.oid);
}

async function readFirstParent(
  exec: GitExec,
  head: string,
  strict: boolean,
): Promise<{ status: "resolved"; oid: string | null } | { status: "unavailable" }> {
  try {
    const { stdout } = await exec("git", ["rev-list", "--parents", "-n", "1", head]);
    const [resolvedHead, firstParent] = stdout.trim().split(/\s+/u);
    if (resolvedHead !== head) {
      if (strict) throw new Error("Malformed retirement graph output.");
      return { status: "unavailable" };
    }
    return { status: "resolved", oid: firstParent ?? null };
  } catch (error) {
    if (strict) throw error;
    return { status: "unavailable" };
  }
}

function matchingRetirementReceipts(
  enumeration: Extract<RetirementRecordEnumerationResult, { status: "valid" }>,
  slug: string,
): LandedRetirementReceipt[] {
  return enumeration.records.flatMap((entry) => {
    if (entry.record.kind !== "receipt") return [];
    const receipt = entry.record.value;
    return isLandedRetirementReceipt(receipt, slug) ? [receipt] : [];
  });
}

type LandedRetirementReceipt = RetirementReceipt & {
  transition: "abandon";
  result: Extract<RetirementReceipt["result"], { kind: "discard" }>;
};

function isLandedRetirementReceipt(
  receipt: RetirementReceipt,
  slug: string,
): receipt is LandedRetirementReceipt {
  return receipt.subject.kind === "work-unit"
    && receipt.subject.name === slug
    && receipt.transition === "abandon"
    && receipt.result.kind === "discard";
}
