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
  deriveDecomposeSuccessorCandidates,
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

/** Exact outside-worktree command for one validated deferred rename move. */
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

export interface LandedRetirementSweepResult {
  retirements: LandedRetirementResidue[];
  warnings: string[];
}

export interface RunLandedRetirementSweepOptions {
  roster: WorktreeRosterResult;
  topology: readonly RegisteredWorktree[];
  markers: ReadonlyMap<string, WorktreeMarkerReadResult>;
  baseBranch: string;
  protection: ProtectionMode;
  exec: GitExec;
  readBlob: TeardownBlobReader;
  remote?: string;
  fetchBase?: () => Promise<boolean>;
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
      text: `git worktree move ${pending.from} ${pending.to}`,
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
  const activePaths = new Set(
    options.roster.entries
      .filter((entry) => entry.metaFilePath !== undefined)
      .map((entry) => entry.worktreePath),
  );
  const candidates = options.topology.filter((entry) => {
    if (entry.detached || entry.branch === null || activePaths.has(entry.path)) return false;
    const marker = options.markers.get(entry.path);
    return marker?.kind === "present"
      && marker.marker.createdFor?.kind === "work-unit"
      && marker.marker.wuName === marker.marker.createdFor.name
      && marker.marker.husk === undefined
      && marker.marker.renameMovePending === undefined;
  });
  if (candidates.length === 0) return { retirements: [], warnings: [] };

  const remote = options.remote ?? "origin";
  const baseRef = options.protection === "full" ? `${remote}/${options.baseBranch}` : options.baseBranch;
  if (options.protection === "full") {
    const fetched = options.fetchBase === undefined
      ? await fetchAuthorityBase(options.exec, remote, options.baseBranch)
      : await options.fetchBase();
    if (!fetched) {
      return {
        retirements: [],
        warnings: [`Could not refresh lifecycle authority ref \`${baseRef}\`; retirement cleanup remains manual.`],
      };
    }
  }

  let enumeration: RetirementRecordEnumerationResult;
  try {
    enumeration = await (options.enumerateRecords === undefined
      ? enumerateGitRetirementRecords(options.exec, baseRef)
      : options.enumerateRecords(baseRef));
  } catch (error) {
    return {
      retirements: [],
      warnings: [`Could not read retirement authority from \`${baseRef}\`: ${errorMessage(error)}`],
    };
  }
  if (enumeration.status !== "valid") {
    return {
      retirements: [],
      warnings: [`Retirement authority at \`${baseRef}\` is ${enumeration.status}; cleanup remains manual.`],
    };
  }

  const authority = options.authorize === undefined
    ? createTeardownRetirementAuthority(options.exec, baseRef, options.readBlob).authorize
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
    if (receipts.length > 1) {
      retirements.push({
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch as string },
        reason: "authority-ambiguous",
      });
      continue;
    }
    const receipt = receipts[0];
    if (receipt === undefined || candidate.branch === null) continue;
    if (!await clean(candidate.path)) {
      retirements.push({
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch },
        reason: "uncommitted",
      });
      continue;
    }
    const decision = await authority({
      subject: { kind: "work-unit", name: slug },
      branch: candidate.branch,
      head: candidate.head,
      remote,
      requestedMode: "abandoned",
    });
    if (decision.status !== "authorized") {
      retirements.push({
        status: "blocked",
        worktreePath: candidate.path,
        subject: { slug, branch: candidate.branch },
        reason: decision.reason,
      });
      continue;
    }
    const successorCandidates = receipt.result.kind === "decompose"
      ? deriveDecomposeSuccessorCandidates(receipt.result.allocation)
      : [];
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
        successorReadiness: projectSuccessorReadiness(successorCandidates, true),
      },
      teardown: {
        argv: ["arc", "teardown", slug],
        text: `arc teardown ${slug}`,
      },
    });
  }
  return { retirements, warnings: [] };
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
  transition: "abandon" | "decompose";
  result:
    | Extract<RetirementReceipt["result"], { kind: "discard" }>
    | Extract<RetirementReceipt["result"], { kind: "decompose" }>;
};

function isLandedRetirementReceipt(
  receipt: RetirementReceipt,
  slug: string,
): receipt is LandedRetirementReceipt {
  return receipt.subject.kind === "work-unit"
    && receipt.subject.name === slug
    && (receipt.transition === "abandon" || receipt.transition === "decompose")
    && (receipt.result.kind === "discard" || receipt.result.kind === "decompose");
}

async function fetchAuthorityBase(exec: GitExec, remote: string, baseBranch: string): Promise<boolean> {
  try {
    await exec("git", ["fetch", remote, baseBranch]);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
