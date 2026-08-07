/**
 * Stale-worktree sweep — candidate enumeration.
 *
 * In the main worktree, the sweep cross-references the in-flight roster against
 * the base ref's `completed/` archive. In identity-known linked worktrees, a
 * private cleanup roster enables a local sibling-husk scan without widening
 * general discovery or completion consumers.
 *
 * {@link findStaleWorktreeCandidates} selects *which* worktrees are shipped-WU
 * candidates; {@link runStaleWorktreeSweep} then gathers each candidate's
 * marker / clean / merged signals and maps them through the shared cleanup
 * decision (removable / blocked / external) — worktrees are only ever
 * surfaced, never auto-removed without the marker-gated clean-and-merged guard.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import {
  decideHuskCleanup,
  decideWorktreeCleanup,
  isWorktreeClean,
  type HuskCleanupDecision,
  type WorktreeCleanupDecision,
} from "../git/worktree-cleanup.js";
import {
  decodeWorktreeHuskStamp,
  readWorktreeMarker,
  type DecodedWorktreeHuskStamp,
  type WorktreeMarkerReadResult,
  type WorktreeSubject,
} from "../git/worktree-marker.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type { ProtectionMode } from "../git/write-context.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import {
  resolvePrimaryWorktreePath,
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
  type WorktreeRosterEntry,
  type WorktreeRosterResult,
} from "../git/worktree-roster.js";
import {
  linkedIdentityGlobalUserSurfacesAreSafe,
  nodeUserSurfaceMigrationFs,
  type UserSurfaceMigrationFs,
} from "../user-surface-migration.js";
import {
  isShippedWorkUnit,
  readShippedWorkUnitsFromExactRef,
  readShippedWorkUnitsFromRef,
} from "../work-unit/completed-index.js";
import {
  revalidateDecodedHuskRetirementEvidenceStrict,
  type TeardownBlobReader,
} from "../work-unit/teardown-retirement-driver.js";
import {
  projectRenameMoveRemedy,
  runLandedRetirementSweep,
  type LandedRetirementResidue,
  type RenameMoveResidue,
} from "./lifecycle-residue-sweep.js";
import { locusWorkUnitAtPath } from "./locus-classification.js";
import {
  projectCleanupRemoteEvidence,
  type CleanupBaseEvidence,
  type CleanupRemoteEvidence,
} from "./cleanup-remote-evidence.js";

export interface StaleWorktreeSweepInput {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Shipped WU-name slugs from `readShippedWorkUnits`. */
  shipped: ReadonlySet<string>;
  /** Physical-worktree identity of the session — the sweep runs only when `primary`. */
  worktreeIdentity: WorktreeIdentity;
}

export interface StaleWorktreeCandidatesResult {
  /** Roster entries whose WU has shipped — lingering worktrees to surface for cleanup. */
  candidates: WorktreeRosterEntry[];
  /** Roster warnings, passed through untouched. */
  warnings: string[];
}

/**
 * Select the lingering shipped-WU worktrees from the roster.
 *
 * Returns no candidates when the session is not in the primary worktree: the
 * sweep is a main-worktree-only check, so a linked-worktree (resume) session
 * never scans its siblings.
 *
 * @param input - Roster, shipped-WU set, and the session's worktree identity
 * @returns The shipped-WU candidate worktrees plus passed-through warnings
 */
export function findStaleWorktreeCandidates(
  input: StaleWorktreeSweepInput,
): StaleWorktreeCandidatesResult {
  const { roster, shipped, worktreeIdentity } = input;
  if (worktreeIdentity.kind !== "primary") {
    return { candidates: [], warnings: roster.warnings };
  }
  return {
    candidates: roster.entries.filter((entry) => isShippedWorkUnit(entry.branch, shipped)),
    warnings: roster.warnings,
  };
}

/** Incomplete evidence blocks cleanup without claiming a negative merge proof. */
export type EvidenceUnavailableDecision = { action: "blocked"; reason: "evidence-unavailable" };
/** One swept worktree paired with its marker-gated cleanup disposition. */
export type StaleWorktreeReport =
  | {
      kind: "branched";
      worktreePath: string;
      branch: string;
      decision: WorktreeCleanupDecision | EvidenceUnavailableDecision;
    }
  | {
      kind: "husk";
      worktreePath: string;
      branch: null;
      subject: WorktreeSubject;
      stampedBranch: string;
      stamp: DecodedWorktreeHuskStamp;
      completedWorkUnit: string | null;
      decision: HuskCleanupDecision | EvidenceUnavailableDecision;
    };

export type StaleWorktreeSweepResult = CleanupRemoteEvidence & {
  /** Lingering shipped-WU worktrees, each with its cleanup disposition. */
  worktrees: StaleWorktreeReport[];
  /** Validated deferred rename moves that can run only from outside their source worktrees. */
  renameMoves: RenameMoveResidue[];
  /** Still-branched receipt-backed retirements projected from authoritative base evidence. */
  retirements: LandedRetirementResidue[];
  /** Roster warnings, passed through untouched. */
  warnings: string[];
};

export interface RunStaleWorktreeSweepOptions {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Physical-worktree identity of the calling session. */
  worktreeIdentity: WorktreeIdentity;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
  /** Supplied advertised-base prerequisites; omitted only by compatibility callers pending composition cutover. */
  baseEvidence?: CleanupBaseEvidence;
  exec: GitExec;
  /** Reads a worktree's ownership marker; injected for testability. */
  readMarker?: (worktreePath: string) => Promise<WorktreeMarkerReadResult>;
  /** Filesystem seam for ignored identity-global user-surface safety scans. */
  userSurfaceFs?: UserSurfaceMigrationFs;
  /** Resolved developer identity for team-mode ownership filtering. */
  identity?: string | null;
  /** Whether another identity's stamped husks should be omitted. */
  teamMode?: boolean;
  /** Registered topology scan seam. */
  scanWorktrees?: (exec: GitExec) => Promise<RegisteredWorktreeScanResult>;
  /** Exact current linked path, excluded so the current-husk surface owns it. */
  excludeWorktreePath?: string;
  /** Configured result projection used to revalidate non-shipped receipt evidence. */
  protection?: ProtectionMode;
  /** Exact committed-blob reader for retirement-evidence validation. */
  readBlob: TeardownBlobReader;
  /** Retirement-evidence validation seam for structurally current stamps. */
  revalidateEvidence?: (
    stamp: NonNullable<Extract<WorktreeMarkerReadResult, { kind: "present" }>["marker"]["husk"]>,
    decoded: Extract<DecodedWorktreeHuskStamp, { kind: "current" }>,
    baseOid: string,
  ) => Promise<boolean>;
  /** Complete derived checkout roster; null suppresses cleanup offers. */
  derivedRoster: readonly DerivedCheckoutRow[] | null;
}

/**
 * Run the stale-worktree sweep: read the shipped-WU set, select the lingering
 * shipped-WU worktrees, and resolve each one's marker-gated cleanup decision.
 *
 * Branched shipped candidates remain primary-only; linked sessions inspect
 * detached sibling husks and exclude the exact current path.
 *
 * @param options - Roster, identity, base branch, and I/O bindings
 * @returns The swept worktrees with cleanup dispositions, plus warnings
 */
export async function runStaleWorktreeSweep(
  options: RunStaleWorktreeSweepOptions,
): Promise<StaleWorktreeSweepResult> {
  const { roster, worktreeIdentity, baseBranch, exec } = options;
  const readMarker = options.readMarker ?? readWorktreeMarker;
  const userSurfaceFs = options.userSurfaceFs ?? nodeUserSurfaceMigrationFs;
  const integrationTarget = `origin/${baseBranch}`;
  const projectedEvidence = projectCleanupRemoteEvidence(baseBranch, options.baseEvidence);

  const derivedRoster = options.derivedRoster;
  if (derivedRoster === null) {
    return { ...projectedEvidence, worktrees: [], renameMoves: [], retirements: [], warnings: roster.warnings };
  }

  if (
    worktreeIdentity.kind === "linked"
    && options.teamMode === true
    && (options.identity === null || options.identity === undefined)
  ) {
    return { ...projectedEvidence, worktrees: [], renameMoves: [], retirements: [], warnings: roster.warnings };
  }

  let shipped: ReadonlySet<string>;
  let mergeBase = integrationTarget;
  let exactBaseOid: string | null = null;
  let analysisExec = exec;
  const baseEvidence = options.baseEvidence;
  if (baseEvidence === undefined) {
    shipped = await readShippedWorkUnitsFromRef(exec, integrationTarget);
  } else if (!baseEvidence.remoteSyncEnabled || baseEvidence.snapshot.kind === "unreachable") {
    shipped = new Set();
  } else {
    const baseOid = baseEvidence.snapshot.tips[baseBranch];
    if (baseOid === undefined) {
      shipped = new Set();
    } else {
      if (baseEvidence.objectAvailability.kind !== "complete") {
        throw new Error("Advertised stale-worktree object availability could not be inspected.");
      }
      const baseCommitIsLocal = baseEvidence.objectAvailability.commits[baseOid];
      if (baseCommitIsLocal === false) {
        shipped = new Set();
      } else {
        if (baseCommitIsLocal === undefined) {
          throw new Error("The advertised base commit has no local availability fact.");
        }
        if (baseEvidence.history.kind === "shallow") {
          shipped = new Set();
        } else {
          if (baseEvidence.history.kind !== "complete") {
            throw new Error("Local stale-worktree history completeness could not be inspected.");
          }
          analysisExec = (command, args, execOptions) => exec(command, args, {
            ...execOptions,
            objectAccess: "local-only",
          });
          mergeBase = baseOid;
          exactBaseOid = baseOid;
          shipped = await readShippedWorkUnitsFromExactRef(analysisExec, baseOid);
        }
      }
    }
  }
  const selected = worktreeIdentity.kind === "primary"
    ? baseEvidence !== undefined && exactBaseOid === null
      ? { candidates: [...roster.entries], warnings: roster.warnings }
      : findStaleWorktreeCandidates({ roster, shipped, worktreeIdentity })
    : { candidates: [], warnings: roster.warnings };
  const warnings = [...selected.warnings];
  const scan = await (options.scanWorktrees ?? scanRegisteredWorktrees)(exec);
  const retainedRoleCandidates = worktreeIdentity.kind === "primary" && scan.ok
    ? scan.worktrees.flatMap((entry): WorktreeRosterEntry[] => {
        if (entry.primary || entry.branch === null) return [];
        const owned = locusWorkUnitAtPath(derivedRoster, entry.path);
        return owned !== null && shipped.has(owned.name)
          ? [{ worktreePath: entry.path, branch: entry.branch }]
          : [];
      })
    : [];
  const candidates = [...new Map(
    [...selected.candidates, ...retainedRoleCandidates].map((entry) => [entry.worktreePath, entry]),
  ).values()];
  const primaryWorktreePath = candidates.length === 0 ? null : await resolvePrimaryWorktreePath(exec);

  const worktrees: StaleWorktreeReport[] = await Promise.all(
    candidates.map(async (entry) => {
      const [marker, clean, merged, userSurfacesSafe] = await Promise.all([
        readMarker(entry.worktreePath),
        isWorktreeClean({ exec, cwd: entry.worktreePath }),
        exactBaseOid === null
          ? Promise.resolve(false)
          : isLandedInBaseStrict(analysisExec, entry.branch, mergeBase),
        linkedIdentityGlobalUserSurfacesAreSafe({
          primaryWorktreePath,
          worktreePath: entry.worktreePath,
          fs: userSurfaceFs,
        }),
      ]);
      const localDecision = decideWorktreeCleanup({ marker, clean, userSurfacesSafe, merged, context: "shipped" });
      const decision = exactBaseOid === null
        && localDecision.action === "blocked"
        && localDecision.reason === "unmerged"
        ? { action: "blocked" as const, reason: "evidence-unavailable" as const }
        : localDecision;
      return {
        kind: "branched" as const,
        worktreePath: entry.worktreePath,
        branch: entry.branch,
        decision,
      };
    }),
  );

  if (!scan.ok) {
    warnings.push(`Could not scan registered worktrees: ${scan.message}`);
    return { ...projectedEvidence, worktrees, renameMoves: [], retirements: [], warnings };
  }

  const renameMoves: RenameMoveResidue[] = [];
  const branchedMarkers = new Map<string, WorktreeMarkerReadResult>();
  for (const entry of scan.worktrees) {
    if (entry.detached || entry.branch === null) continue;
    let marker: WorktreeMarkerReadResult;
    try {
      marker = await readMarker(entry.path);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read branched worktree marker at ${entry.path}: ${detail}`);
      continue;
    }
    if (
      marker.kind === "present"
      && options.teamMode === true
      && options.identity !== null
      && options.identity !== undefined
      && marker.marker.spawningIdentity !== options.identity
    ) {
      continue;
    }
    branchedMarkers.set(entry.path, marker);
    const projected = projectRenameMoveRemedy(entry, marker, scan.worktrees);
    if (projected !== null) renameMoves.push(projected);
  }
  const retirementSweep = await runLandedRetirementSweep({
    roster,
    topology: scan.worktrees,
    markers: branchedMarkers,
    baseBranch,
    protection: options.protection ?? "partial",
    exec,
    readBlob: options.readBlob,
    ...(options.baseEvidence === undefined ? {} : { baseEvidence: options.baseEvidence }),
  });
  warnings.push(...retirementSweep.warnings);

  for (const entry of scan.worktrees) {
    if (!entry.detached || entry.path === options.excludeWorktreePath) continue;
    let marker: WorktreeMarkerReadResult;
    try {
      marker = await readMarker(entry.path);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read detached worktree marker at ${entry.path}: ${detail}`);
      continue;
    }
    if (marker.kind !== "present" || marker.marker.husk === undefined) continue;
    if (
      options.teamMode === true
      && options.identity !== null
      && options.identity !== undefined
      && marker.marker.spawningIdentity !== options.identity
    ) {
      continue;
    }
    const stamp = marker.marker.husk;
    const clean = await isWorktreeClean({ exec, cwd: entry.path });
    let decoded = decodeWorktreeHuskStamp(stamp);
    let decision: HuskCleanupDecision | EvidenceUnavailableDecision = decideHuskCleanup({ marker, clean, head: entry.head });
    let evidenceValid = decoded.kind !== "current";
    let evidenceUnavailable = false;
    if (decoded.kind === "current") {
      if (exactBaseOid === null) {
        evidenceUnavailable = true;
        warnings.push(`Retirement evidence at ${entry.path} could not be revalidated without exact base evidence.`);
      } else {
        evidenceValid = await (options.revalidateEvidence === undefined
          ? revalidateDecodedHuskRetirementEvidenceStrict(exec, stamp, decoded, exactBaseOid, options.readBlob)
          : options.revalidateEvidence(stamp, decoded, exactBaseOid));
      }
    }
    if (decoded.kind === "current" && evidenceUnavailable) {
      decision = { action: "blocked", reason: "evidence-unavailable" };
    } else if (
      decoded.kind === "current"
      && !evidenceValid
    ) {
      decoded = { kind: "manual-only", reason: "evidence-mismatch" };
      decision = { action: "blocked", reason: "evidence-mismatch" };
    }
    if (exactBaseOid === null && decision.action === "removable") {
      decision = { action: "blocked", reason: "evidence-unavailable" };
    }
    worktrees.push({
      kind: "husk",
      worktreePath: entry.path,
      branch: null,
      subject: stamp.subject,
      stampedBranch: stamp.branch,
      stamp: decoded,
      completedWorkUnit:
        stamp.subject.kind === "work-unit" && shipped.has(stamp.subject.name)
          ? stamp.subject.name
          : null,
      decision,
    });
  }

  return {
    ...projectedEvidence,
    worktrees,
    renameMoves,
    retirements: retirementSweep.retirements,
    warnings,
  };
}
