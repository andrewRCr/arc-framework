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

import type { z } from "zod";
import { StaleWorktreeSweepResultSchema } from "./stale-worktree-sweep-schema.js";
import type { Store } from "../store/contract.js";
import { readStoreCompletedEvidence } from "../store/lifecycle-completed.js";
import { selectStoreCleanupTopology, selectStoreWorktreeCleanup } from "./store-worktree-selection.js";
import type { GitExec } from "../git/exec.js";
import { isLandedInBaseStrict } from "../git/branch-containment.js";
import {
  decideHuskCleanup,
  decideWorktreeCleanup,
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
import { checkWorktreeRemoval, type ProjectionRemovalSlots } from "../git/worktree-removal.js";
import { readMissingWorktreeFolders } from "./missing-worktree-folders.js";
import { workUnitTeardownAction, type SessionAction } from "./actions.js";
import type { WorktreeIdentity } from "../git/worktree-identity.js";
import type { ProtectionMode } from "../git/write-context.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import {
  resolvePrimaryWorktreePath,
  scanRegisteredWorktrees,
  type RegisteredWorktree,
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
  type RenameMoveResidue,
} from "./lifecycle-residue-sweep.js";
import { locusWorkUnitAtPath } from "./locus-classification.js";
import {
  projectCleanupRemoteEvidence,
  type CleanupBaseEvidence,
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
    candidates: roster.entries.filter((entry) => entry.branch !== undefined && isShippedWorkUnit(entry.branch, shipped)),
    warnings: roster.warnings,
  };
}

/** Incomplete evidence blocks cleanup without claiming a negative merge proof. */
export type EvidenceUnavailableDecision = { action: "blocked"; reason: "evidence-unavailable" };
/** One swept worktree paired with its marker-gated cleanup disposition. */
export type StaleWorktreeReport = (
  | {
      kind: "branched";
      worktreePath: string;
      branch: string;
      decision: Exclude<WorktreeCleanupDecision, { action: "missing" }> | EvidenceUnavailableDecision;
    }
  | { kind: "detached"; worktreePath: string; branch: null; workUnit: string;
      decision: Exclude<WorktreeCleanupDecision, { action: "missing" }> | EvidenceUnavailableDecision; }
  | {
      kind: "husk";
      worktreePath: string;
      branch: null;
      subject: WorktreeSubject;
      stampedBranch: string;
      stamp: DecodedWorktreeHuskStamp;
      completedWorkUnit: string | null;
      decision: HuskCleanupDecision | EvidenceUnavailableDecision | { action: "blocked"; reason: "locked" | "unobservable" };
    }) & { actions?: SessionAction[] };

export type StaleWorktreeSweepResult = z.infer<typeof StaleWorktreeSweepResultSchema>;

export interface RunStaleWorktreeSweepOptions {
  store?: Store;
  projectId?: () => Promise<string>;
  /** Projection policy used by each read-only removal check. */
  projectionRemovalSlots?: ProjectionRemovalSlots;
  /** Filesystem boundary for checkout folder observations. */
  folderExists?: (path: string) => Promise<boolean>;
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
    return { ...projectedEvidence, worktrees: [], missingFolders: [], renameMoves: [], retirements: [], warnings: roster.warnings };
  }

  if (
    worktreeIdentity.kind === "linked"
    && options.teamMode === true
    && (options.identity === null || options.identity === undefined)
  ) {
    return { ...projectedEvidence, worktrees: [], missingFolders: [], renameMoves: [], retirements: [], warnings: roster.warnings };
  }

  let shipped: ReadonlySet<string>;
  let mergeBase = integrationTarget;
  let exactBaseOid: string | null = null;
  let analysisExec = exec;
  const baseEvidence = options.baseEvidence;
  if (baseEvidence === undefined) {
    shipped = options.store?.capabilities.stateOffBranch ? new Set() : await readShippedWorkUnitsFromRef(exec, integrationTarget);
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
          shipped = options.store?.capabilities.stateOffBranch ? new Set() : await readShippedWorkUnitsFromExactRef(analysisExec, baseOid);
        }
      }
    }
  }
  const storeWarnings: string[] = [];
  if (options.store?.capabilities.stateOffBranch) {
    const completed = await readStoreCompletedEvidence(options.store);
    shipped = completed.status === "unavailable" ? new Set() : new Set(completed.records.keys());
    if (completed.status !== "available") storeWarnings.push("Completed work-unit inventory is incomplete; repair the store and retry cleanup.");
  }
  // Incomplete advertised-base evidence leaves `shipped` empty, so no entry
  // qualifies and the sweep reports nothing. Enumerating the whole roster here
  // would render active, never-shipped worktrees as cleanup residue; the
  // slot-level `remoteEvidence` already carries the degradation, and the
  // envelope schema refuses a `removable` decision on anything but `exact`.
  const selected = !options.store?.capabilities.stateOffBranch && worktreeIdentity.kind === "primary"
    ? findStaleWorktreeCandidates({ roster, shipped, worktreeIdentity })
    : { candidates: [], warnings: roster.warnings };
  const warnings = [...selected.warnings, ...storeWarnings];
  const scan = await (options.scanWorktrees ?? scanRegisteredWorktrees)(exec);
  const cleanupTopology = !scan.ok ? [] : options.store?.capabilities.stateOffBranch
    ? selectStoreCleanupTopology(derivedRoster, scan.worktrees, warnings) : scan.worktrees;
  const storeSelection = options.store?.capabilities.stateOffBranch && scan.ok
    ? await selectStoreWorktreeCleanup({ ...options, store: options.store, derivedRoster, topology: cleanupTopology, readMarker }) : null;
  warnings.push(...(storeSelection?.warnings ?? []));
  const retainedRoleCandidates = !options.store?.capabilities.stateOffBranch && worktreeIdentity.kind === "primary" && scan.ok
    ? scan.worktrees.flatMap((entry): WorktreeRosterEntry[] => {
        if (entry.primary || entry.branch === null) return [];
        const owned = locusWorkUnitAtPath(derivedRoster, entry.path);
        return owned !== null && shipped.has(owned.name)
          ? [{ worktreePath: entry.path, branch: entry.branch }]
          : [];
      })
    : [];
  const missingPaths = new Set(derivedRoster.filter((row) => !row.checkout.folderPresent).map((row) => row.checkout.path));
  const missingFolders = worktreeIdentity.kind === "primary" ? await readMissingWorktreeFolders({
    store: options.store, projectId: options.projectId, warnings, rows: derivedRoster, shipped, exec, check: options.projectionRemovalSlots?.check, folderExists: options.folderExists,
  }) : [];
  const candidates = [...new Map(
    [...selected.candidates, ...retainedRoleCandidates, ...(storeSelection?.ended.flatMap(({ checkout }) => checkout.branch === null ? [] : [{ worktreePath: checkout.path, branch: checkout.branch }]) ?? [])].filter((entry): entry is WorktreeRosterEntry & { branch: string } => entry.branch !== undefined).map((entry) => [entry.worktreePath, entry]),
  ).values()].filter((entry) => !missingPaths.has(entry.worktreePath));
  const primaryWorktreePath = candidates.length === 0 && !storeSelection?.ended.length ? null : await resolvePrimaryWorktreePath(exec);

  const worktrees: StaleWorktreeReport[] = await Promise.all(candidates.map((entry) => inspectBranchedRemoval(entry, {
    options, readMarker, userSurfaceFs, primaryWorktreePath, exactBaseOid, analysisExec, mergeBase,
  })));

  worktrees.push(...(storeSelection?.releases ?? []));
  for (const { checkout, name } of storeSelection?.ended ?? []) {
    if (checkout.branch !== null || missingPaths.has(checkout.path)) continue;
    const report = await inspectBranchedRemoval({ worktreePath: checkout.path, branch: checkout.head }, { options, readMarker, userSurfaceFs, primaryWorktreePath, exactBaseOid, analysisExec, mergeBase });
    worktrees.push({ ...report, kind: "detached", branch: null, workUnit: name });
  }

  if (!scan.ok) {
    warnings.push(`Could not scan registered worktrees: ${scan.message}`);
    return { ...projectedEvidence, worktrees, missingFolders, renameMoves: [], retirements: [], warnings };
  }

  const renameMoves: RenameMoveResidue[] = [];
  const branchedMarkers = new Map<string, WorktreeMarkerReadResult>();
  for (const entry of cleanupTopology) {
    const branched = !entry.detached && entry.branch !== null;
    if (!branched && !options.store?.capabilities.stateOffBranch) continue;
    let marker: WorktreeMarkerReadResult;
    try {
      marker = await readMarker(entry.path);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      warnings.push(`Could not read ${branched ? "branched" : "detached"} worktree marker at ${entry.path}: ${detail}`);
      continue;
    }
    if (
      marker.kind === "present"
      && !options.store?.capabilities.stateOffBranch
      && options.teamMode === true
      && options.identity !== null
      && options.identity !== undefined
      && marker.marker.spawningIdentity !== options.identity
    ) {
      continue;
    }
    if (branched) branchedMarkers.set(entry.path, marker);
    const projected = projectRenameMoveRemedy(entry, marker, scan.worktrees);
    if (projected !== null) renameMoves.push(projected);
  }
  const retirementSweep = await runLandedRetirementSweep({
    store: options.store, projectId: options.projectId,
    topology: cleanupTopology,
    markers: branchedMarkers,
    baseBranch,
    protection: options.protection ?? "partial",
    exec,
    readBlob: options.readBlob,
    projectionRemovalSlots: options.projectionRemovalSlots,
    ...(options.baseEvidence === undefined ? {} : { baseEvidence: options.baseEvidence }),
  });
  warnings.push(...retirementSweep.warnings);

  for (const entry of cleanupTopology) {
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
    const report = await inspectHuskRemoval({ entry, marker, options, exactBaseOid, shipped, warnings });
    if (report !== null) worktrees.push(withHuskActions(report, worktreeIdentity));
  }

  return {
    ...projectedEvidence,
    worktrees,
    missingFolders,
    renameMoves,
    retirements: retirementSweep.retirements,
    warnings,
  };
}


async function inspectBranchedRemoval(entry: WorktreeRosterEntry & { branch: string }, context: {
  options: RunStaleWorktreeSweepOptions;
  readMarker: (path: string) => Promise<WorktreeMarkerReadResult>;
  userSurfaceFs: UserSurfaceMigrationFs;
  primaryWorktreePath: string | null;
  exactBaseOid: string | null;
  analysisExec: GitExec;
  mergeBase: string;
}): Promise<Extract<StaleWorktreeReport, { kind: "branched" }>> {
  const { options, readMarker, userSurfaceFs, primaryWorktreePath, exactBaseOid, analysisExec, mergeBase } = context;
  const { exec } = options;
  const [marker, removalCheck, merged, userSurfacesSafe] = await Promise.all([
    readMarker(entry.worktreePath),
    checkWorktreeRemoval({ exec, checkoutPath: entry.worktreePath, disposition: "remove", check: options.projectionRemovalSlots?.check, folderExists: options.folderExists }),
    exactBaseOid === null
      ? Promise.resolve(false)
      : isLandedInBaseStrict(analysisExec, entry.branch, mergeBase),
    linkedIdentityGlobalUserSurfacesAreSafe({
      primaryWorktreePath,
      worktreePath: entry.worktreePath,
      fs: userSurfaceFs,
    }),
  ]);
  const localDecision = decideWorktreeCleanup({ marker, removalCheck, userSurfacesSafe, merged, context: "shipped" });
  const decision = exactBaseOid === null
    && localDecision.action === "blocked"
    && localDecision.reason === "unmerged"
    ? { action: "blocked" as const, reason: "evidence-unavailable" as const }
    : localDecision.action === "missing" ? { action: "external" as const } : localDecision;
  const report = { kind: "branched" as const, worktreePath: entry.worktreePath, branch: entry.branch, decision };
  if (decision.action !== "removable") return report;
  const name = marker.kind === "present" ? marker.marker.wuName : undefined;
  return name === undefined ? { ...report, decision: { action: "external" as const } }
    : { ...report, actions: [workUnitTeardownAction(name)] };
}

async function inspectHuskRemoval(context: {
  entry: RegisteredWorktree;
  marker: Extract<WorktreeMarkerReadResult, { kind: "present" }>;
  options: RunStaleWorktreeSweepOptions;
  exactBaseOid: string | null;
  shipped: ReadonlySet<string>;
  warnings: string[];
}): Promise<Extract<StaleWorktreeReport, { kind: "husk" }> | null> {
  const { entry, marker, options, exactBaseOid, shipped, warnings } = context;
  const { exec } = options;
  const stamp = marker.marker.husk;
  if (stamp === undefined) return null;
  const removalCheck = await checkWorktreeRemoval({ exec, checkoutPath: entry.path, disposition: "remove",
    check: options.projectionRemovalSlots?.check, folderExists: options.folderExists });
  if (removalCheck.kind === "missing") return null;
  const clean = removalCheck.kind === "removable";
  let decoded = decodeWorktreeHuskStamp(stamp);
  let decision: Extract<StaleWorktreeReport, { kind: "husk" }>["decision"] = removalCheck.kind === "refused"
    && (removalCheck.reason === "unobservable" || removalCheck.reason === "locked")
    ? { action: "blocked", reason: removalCheck.reason }
    : decideHuskCleanup({ marker, clean, head: entry.head });
  const removalBlocked = removalCheck.kind === "refused"
    && (removalCheck.reason === "unobservable" || removalCheck.reason === "locked");
  if (decoded.kind === "current" && !removalBlocked) {
    const evidence = await inspectCurrentHuskEvidence({ entry, stamp, decoded, options, exactBaseOid, warnings });
    if (evidence === "unavailable") decision = { action: "blocked", reason: "evidence-unavailable" };
    if (evidence === "invalid") {
      decoded = { kind: "manual-only", reason: "evidence-mismatch" };
      decision = { action: "blocked", reason: "evidence-mismatch" };
    }
  }
  if (exactBaseOid === null && decision.action === "removable") {
    decision = { action: "blocked", reason: "evidence-unavailable" };
  }
  return {
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
  };
}

async function inspectCurrentHuskEvidence(context: {
  entry: RegisteredWorktree;
  stamp: NonNullable<Extract<WorktreeMarkerReadResult, { kind: "present" }>["marker"]["husk"]>;
  decoded: Extract<DecodedWorktreeHuskStamp, { kind: "current" }>;
  options: RunStaleWorktreeSweepOptions;
  exactBaseOid: string | null;
  warnings: string[];
}): Promise<"valid" | "invalid" | "unavailable"> {
  const { entry, stamp, decoded, options, exactBaseOid, warnings } = context;
  if (exactBaseOid === null) {
    warnings.push(`Retirement evidence at ${entry.path} could not be revalidated without exact base evidence.`);
    return "unavailable";
  }
  const valid = await (options.revalidateEvidence === undefined
    ? revalidateDecodedHuskRetirementEvidenceStrict(options.exec, stamp, decoded, exactBaseOid, options.readBlob)
    : options.revalidateEvidence(stamp, decoded, exactBaseOid));
  return valid ? "valid" : "invalid";
}

function withHuskActions(
  report: Extract<StaleWorktreeReport, { kind: "husk" }>,
  locus: WorktreeIdentity,
): StaleWorktreeReport {
  if (report.stamp.kind === "manual-only") {
    return { ...report, actions: [{ text: `Inspect husk \`${report.worktreePath}\` (${report.stamp.reason}); cleanup requires a manual decision.` }] };
  }
  if (report.decision.action !== "removable") return report;
  const subject = report.subject;
  if (subject.kind === "work-unit") {
    const argv = ["arc", "teardown", subject.name,
      ...(locus.kind === "linked" ? ["--husk", report.worktreePath] : [])];
    return { ...report, actions: [{ text: argv.join(" "), argv }] };
  }
  if (subject.kind === "branch" && locus.kind === "primary") {
    return { ...report, actions: [{ text: `arc teardown --branch ${subject.ref}`,
      argv: ["arc", "teardown", "--branch", subject.ref] }] };
  }
  return { ...report, actions: [{ text: `Husk \`${report.worktreePath}\` belongs to ${subject.kind} \`${subject.kind === "branch" ? subject.ref : subject.slug}\`; cleanup is manual because no exact husk cleanup driver serves it here.` }] };
}
