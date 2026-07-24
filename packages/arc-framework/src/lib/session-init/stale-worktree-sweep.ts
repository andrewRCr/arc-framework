/**
 * Stale-worktree sweep — candidate enumeration.
 *
 * In the main worktree, the sweep cross-references the in-flight roster against
 * the base ref's `completed/` archive. In identity-known linked worktrees, a
 * private cleanup roster enables a local sibling scan without widening general
 * discovery or completion consumers. Transient ownership evidence is retained
 * as diagnostic-only and never enters either removal oracle.
 *
 * {@link findStaleWorktreeCandidates} selects *which* worktrees are shipped-WU
 * candidates; {@link runStaleWorktreeSweep} then gathers each candidate's
 * marker / clean / merged signals and maps them through the shared cleanup
 * decision (removable / blocked / external) — worktrees are only ever
 * surfaced, never auto-removed without the marker-gated clean-and-merged guard.
 *
 * Those predicates read the worktree, not who is on it, so every offer is first
 * vetoed by locus occupancy at that checkout: a live lease suppresses removal,
 * and occupancy whose authority is unestablished stays manual. The veto rides
 * ahead of the surface's own verdict for both branched and husk reports.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { isLandedInBase } from "../git/branch-containment.js";
import {
  decideHuskCleanup,
  decideWorktreeCleanup,
  isWorktreeClean,
  type HuskCleanupDecision,
  type WorktreeCleanupDecision,
} from "../git/worktree-cleanup.js";
import {
  decodeWorktreeHuskStamp,
  classifyTransientWorktreeProvenance,
  readWorktreeMarker,
  type DecodedWorktreeHuskStamp,
  type WorktreeMarkerReadResult,
  type LegacyWorktreeSubject,
  type TransientWorktreeProvenance,
  type TransientWorktreeSubject,
} from "../git/worktree-marker.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type { ProtectionMode } from "../git/write-context.js";
import type { LocusStateV1 } from "../locus/schema/index.js";
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
import { isShippedWorkUnit, readShippedWorkUnitsFromRef } from "../work-unit/completed-index.js";
import {
  revalidateDecodedHuskRetirementEvidence,
  type TeardownBlobReader,
} from "../work-unit/teardown-retirement-driver.js";
import { locusOccupancyAtPath, locusWorkUnitAtPath } from "./locus-classification.js";

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

/**
 * Disposition the locus occupancy veto imposes, overriding whatever the surface's
 * own predicates concluded: `locus-occupied` for a live lease, `locus-unverified`
 * for occupancy whose authority is not established.
 */
export type LocusVetoDecision = {
  action: "blocked";
  reason: "locus-occupied" | "locus-unverified";
};

/** One swept worktree paired with its marker-gated cleanup disposition. */
export type StaleWorktreeReport =
  | {
      kind: "branched";
      worktreePath: string;
      branch: string;
      decision: WorktreeCleanupDecision | LocusVetoDecision;
    }
  | {
      kind: "husk";
      worktreePath: string;
      branch: null;
      subject: LegacyWorktreeSubject;
      stampedBranch: string;
      stamp: DecodedWorktreeHuskStamp;
      completedWorkUnit: string | null;
      decision: HuskCleanupDecision | LocusVetoDecision;
    }
  | {
      kind: "transient";
      worktreePath: string;
      branch: string | null;
      provenance: TransientWorktreeProvenance;
      decision: { action: "blocked"; reason: "transient-provenance" };
    };

export interface StaleWorktreeSweepResult {
  /** Lingering shipped-WU worktrees, each with its cleanup disposition. */
  worktrees: StaleWorktreeReport[];
  /** Roster warnings, passed through untouched. */
  warnings: string[];
}

export interface RunStaleWorktreeSweepOptions {
  /** Identity-filtered in-flight worktree roster (reused from the session-init roster slot). */
  roster: WorktreeRosterResult;
  /** Physical-worktree identity of the calling session. */
  worktreeIdentity: WorktreeIdentity;
  /** Integration base branch short-name (e.g. `main`); the merged check targets `origin/<base>`. */
  baseBranch: string;
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
  ) => Promise<boolean>;
  /** Exact transient identity generation keyed by its branch projection. */
  expectedTransientByBranch?: ReadonlyMap<string, TransientWorktreeSubject>;
  /**
   * Complete locus projection; null suppresses cleanup offers. Required so no
   * caller can reach a removable decision without the occupancy veto below.
   */
  locusState: LocusStateV1 | null;
}

/** The occupancy veto over one checkout, or null when occupancy permits the surface's own verdict. */
function locusVeto(state: LocusStateV1, checkoutPath: string): LocusVetoDecision | null {
  const occupancy = locusOccupancyAtPath(state, checkoutPath);
  if (occupancy === "clear") return null;
  return {
    action: "blocked",
    reason: occupancy === "suppress" ? "locus-occupied" : "locus-unverified",
  };
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
  const evidenceBaseRef = options.protection === "full" ? integrationTarget : baseBranch;

  const locusState = options.locusState;
  if (locusState === null) {
    return { worktrees: [], warnings: roster.warnings };
  }

  if (
    worktreeIdentity.kind === "linked"
    && options.teamMode === true
    && (options.identity === null || options.identity === undefined)
  ) {
    return { worktrees: [], warnings: roster.warnings };
  }

  const shipped = await readShippedWorkUnitsFromRef(exec, integrationTarget);
  const selected = worktreeIdentity.kind === "primary"
    ? findStaleWorktreeCandidates({ roster, shipped, worktreeIdentity })
    : { candidates: [], warnings: roster.warnings };
  const warnings = [...selected.warnings];
  const scan = await (options.scanWorktrees ?? scanRegisteredWorktrees)(exec);
  const retainedRoleCandidates = scan.ok
    ? scan.worktrees.flatMap((entry): WorktreeRosterEntry[] => {
        if (entry.primary || entry.branch === null) return [];
        const owned = locusWorkUnitAtPath(locusState, entry.path);
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
      const veto = locusVeto(locusState, entry.worktreePath);
      if (veto !== null) {
        return {
          kind: "branched" as const,
          worktreePath: entry.worktreePath,
          branch: entry.branch,
          decision: veto,
        };
      }
      const [marker, clean, merged, userSurfacesSafe] = await Promise.all([
        readMarker(entry.worktreePath),
        isWorktreeClean({ exec, cwd: entry.worktreePath }),
        isLandedInBase(exec, entry.branch, integrationTarget),
        linkedIdentityGlobalUserSurfacesAreSafe({
          primaryWorktreePath,
          worktreePath: entry.worktreePath,
          fs: userSurfaceFs,
        }),
      ]);
      return {
        kind: "branched" as const,
        worktreePath: entry.worktreePath,
        branch: entry.branch,
        decision: decideWorktreeCleanup({ marker, clean, userSurfacesSafe, merged, context: "shipped" }),
      };
    }),
  );

  if (!scan.ok) {
    warnings.push(`Could not scan registered worktrees: ${scan.message}`);
    return { worktrees, warnings };
  }

  for (const entry of scan.worktrees) {
    if (entry.primary || entry.path === options.excludeWorktreePath) continue;
    let marker: WorktreeMarkerReadResult;
    try {
      marker = await readMarker(entry.path);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read registered worktree marker at ${entry.path}: ${detail}`);
      continue;
    }
    if (
      options.teamMode === true
      && options.identity !== null
      && options.identity !== undefined
      && marker.kind === "present"
      && marker.marker.spawningIdentity !== options.identity
    ) {
      continue;
    }
    const expected = entry.branch === null ? undefined : options.expectedTransientByBranch?.get(entry.branch);
    const transient = classifyTransientWorktreeProvenance(marker, expected);
    if (transient !== null) {
      worktrees.push({
        kind: "transient",
        worktreePath: entry.path,
        branch: entry.branch,
        provenance: transient,
        decision: { action: "blocked", reason: "transient-provenance" },
      });
      continue;
    }
    if (!entry.detached || marker.kind !== "present" || marker.marker.husk === undefined) continue;
    const stamp = marker.marker.husk;
    const clean = await isWorktreeClean({ exec, cwd: entry.path });
    let decoded = decodeWorktreeHuskStamp(stamp);
    let decision = decideHuskCleanup({ marker, clean, head: entry.head });
    const evidenceValid = decoded.kind !== "current"
      || await (options.revalidateEvidence === undefined
        ? revalidateDecodedHuskRetirementEvidence(
          exec,
          stamp,
          decoded,
          evidenceBaseRef,
          options.readBlob,
        )
        : options.revalidateEvidence(stamp, decoded));
    if (
      decoded.kind === "current"
      && !evidenceValid
    ) {
      decoded = { kind: "manual-only", reason: "evidence-mismatch" };
      decision = { action: "blocked", reason: "evidence-mismatch" };
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
      decision: locusVeto(locusState, entry.path) ?? decision,
    });
  }

  return { worktrees, warnings };
}
