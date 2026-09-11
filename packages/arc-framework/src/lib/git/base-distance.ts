/**
 * Shared base-drift analyzer with an invocation-owned fetched base identity.
 *
 * Raw Git distance exclusively controls the verdict. Integration and overlap
 * evidence enrich a healthy reading without weakening that safety fact.
 *
 * @module
 */

import {
  boundedGitInvocation,
  checkOriginExists,
  getCurrentBranch,
  type GitExec,
} from "./exec.js";
import { analyzeIntegrationEvidence } from "./base-integration-evidence.js";
import { composeBaseDriftRegister, composeUnavailableRegister } from "./base-drift-register.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import { readHistoryCompleteness } from "./history-completeness.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";
import type { RemoteHeadSnapshotResult } from "./remote-ref-reader.js";
import type { RemoteFailureReason } from "../kernel/index.js";
import { analyzeBaseOverlap } from "./base-overlap.js";
import { isGitObjectId } from "./object-id.js";
import { isGitProcessError } from "./process-error.js";
import type {
  BaseDriftMode,
  BaseDriftResult,
  BaseDriftUnavailableReason,
  BaseMovement,
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  PathTreatmentClassifier,
} from "./base-drift-types.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
  type WorktreeSyncState,
} from "./worktree-sync.js";

export type BaseDistanceStatusResult = BaseDriftResult;

export interface RunBaseDriftOptions {
  exec: GitExec;
  baseBranch: string;
  fetchTimeoutMs?: number;
  /**
   * Acquiring base drift is authoritative-only; an advisory reading analyzes supplied
   * snapshot evidence instead. Advertising the wider `BaseDriftMode` let a typed caller
   * construct a contract-valid call that always threw.
   */
  mode: "authoritative";
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation?: PathTreatmentClassifier;
}

/** Supplied remote and local prerequisites for read-only base-distance analysis. */
export interface AnalyzeBaseDistanceSnapshotOptions {
  exec: GitExec;
  baseBranch: string;
  mode?: BaseDriftMode;
  snapshot: RemoteHeadSnapshotResult;
  objectAvailability: ObjectAvailabilityResult;
  history: HistoryCompletenessResult;
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation?: PathTreatmentClassifier;
}

/** Base-distance result classified against one immutable advertised snapshot. */
export type BaseDistanceSnapshotAnalysisResult = Omit<BaseDriftResult, "failureReason"> & (
  | { remoteEvidence: "exact" | "pending-fetch" }
  | { remoteEvidence: "unreachable"; failureReason: RemoteFailureReason }
);

/** Analyze base distance from supplied advertised evidence without acquiring it. */
export async function analyzeBaseDistanceSnapshot(
  options: AnalyzeBaseDistanceSnapshotOptions,
): Promise<BaseDistanceSnapshotAnalysisResult> {
  const mode = options.mode ?? "advisory";
  if (options.snapshot.kind === "unreachable") {
    return {
      mode,
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      baseOid: null,
      headOid: null,
      integrationEvidence: null,
      overlap: null,
      register: null,
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) {
    return {
      mode,
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      baseOid: null,
      headOid: null,
      unavailableReason: "remote-base-absent",
      integrationEvidence: null,
      overlap: null,
      register: mode === "authoritative"
        ? composeUnavailableRegister(options.baseBranch, "remote-base-absent")
        : null,
      remoteEvidence: "exact",
    };
  }
  if (options.objectAvailability.kind !== "complete") {
    throw new Error(options.objectAvailability.reason === "execution"
      ? "Local base object-availability inspection failed."
      : "Local base object-availability inspection returned malformed output.");
  }
  const baseCommitIsLocal = options.objectAvailability.commits[baseOid];
  if (baseCommitIsLocal === false) {
    return {
      mode,
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: options.baseBranch,
      baseOid,
      headOid: null,
      unavailableReason: "base-object-pending-fetch",
      integrationEvidence: null,
      overlap: null,
      register: mode === "authoritative"
        ? composeUnavailableRegister(options.baseBranch, "base-object-pending-fetch")
        : null,
      remoteEvidence: "pending-fetch",
    };
  }
  if (baseCommitIsLocal === undefined) {
    throw new Error("The advertised base commit has no local availability fact.");
  }
  if (options.history.kind !== "complete") {
    throw new Error(options.history.kind === "shallow"
      ? "Complete local history is required for base-distance analysis."
      : options.history.reason === "execution"
        ? "Local base history inspection failed."
        : "Local base history inspection returned malformed output.");
  }
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const headOid = (await localOnlyExec("git", ["rev-parse", "--verify", "HEAD^{commit}"])).stdout.trim();
  if (!isGitObjectId(headOid)) throw new Error("Git returned an invalid local head OID.");
  const analysis = await analyzeAvailableBase({
    exec: localOnlyExec,
    mode,
    baseBranch: options.baseBranch,
    baseOid,
    headOid,
    resolver: options.resolver,
    resolverFactory: options.resolverFactory,
    classifyReconciliation: options.classifyReconciliation ?? (() => "reviewable"),
  });
  return { ...analysis, remoteEvidence: "exact" };
}

/** Analyze current HEAD against a freshly fetched immutable base commit. */
export async function runBaseDrift(options: RunBaseDriftOptions): Promise<BaseDriftResult> {
  // Unreachable for a typed caller now that `mode` admits only `authoritative`, and
  // retained deliberately for one that is not: this refuses before any Git invocation,
  // so a mislabeled advisory request cannot fetch. Dropping it would silently run the
  // acquiring path under an advisory label, which is worse than the throw.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (options.mode !== "authoritative") {
    throw new Error("Advisory base distance requires supplied snapshot evidence.");
  }
  return runAuthoritativeBaseDrift(options);
}

async function runAuthoritativeBaseDrift(options: RunBaseDriftOptions): Promise<BaseDriftResult> {
  const {
    exec,
    baseBranch,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    resolver,
    resolverFactory,
    classifyReconciliation = () => "reviewable",
  } = options;
  const sourceRef = `refs/heads/${baseBranch}`;
  try {
    if (baseBranch === "" || baseBranch.startsWith("-") || sourceRef.includes(":")) {
      throw new Error("Unsafe base ref.");
    }
    await exec("git", ["check-ref-format", sourceRef]);
  } catch {
    return unavailable("authoritative", "invalid-base", "remote-unavailable", baseBranch);
  }
  if ((await getCurrentBranch(exec)) === null) {
    return unavailable("authoritative", "detached-head", "detached-head", null);
  }
  if (!(await checkOriginExists(exec))) {
    return unavailable("authoritative", "no-remote", "no-remote", baseBranch);
  }
  const fetchRefspec = `+${sourceRef}:refs/remotes/origin/${baseBranch}`;
  const fetch = await boundedGitInvocation(
    exec,
    ["fetch", "origin", fetchRefspec],
    fetchTimeoutMs,
  );
  if (fetch.outcome !== "ok") {
    if (isGitProcessError(fetch.error) && fetch.error.expectedOutcome === "absent-remote-ref") {
      return {
        mode: "authoritative",
        verdict: "unavailable",
        state: "remote-unavailable",
        ahead: 0,
        behind: 0,
        base: baseBranch,
        baseOid: null,
        headOid: null,
        unavailableReason: "remote-base-absent",
        integrationEvidence: null,
        overlap: null,
        register: composeUnavailableRegister(baseBranch, "remote-base-absent"),
      };
    }
    return unavailable(
      "authoritative",
      fetch.outcome === "timeout" ? "fetch-timeout" : "fetch-failed",
      "remote-unavailable",
      baseBranch,
      fetch.outcome,
    );
  }

  let baseOid: string;
  try {
    baseOid = (await exec(
      "git",
      ["rev-parse", "--verify", `refs/remotes/origin/${baseBranch}^{commit}`],
    )).stdout.trim();
    if (!isGitObjectId(baseOid)) throw new Error("Invalid fetched base OID.");
  } catch {
    return unavailable("authoritative", "fetched-base-unresolved", "remote-unavailable", baseBranch);
  }

  try {
    const analysis = await analyzeBaseDistanceSnapshot({
      exec,
      baseBranch,
      mode: "authoritative",
      snapshot: { kind: "available", scope: "exact", tips: { [baseBranch]: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: await readHistoryCompleteness({ exec }),
      resolver,
      resolverFactory,
      classifyReconciliation,
    });
    if (analysis.remoteEvidence !== "exact") {
      throw new Error("Authoritative base materialization did not produce exact evidence.");
    }
    return {
      mode: analysis.mode,
      verdict: analysis.verdict,
      state: analysis.state,
      ahead: analysis.ahead,
      behind: analysis.behind,
      base: analysis.base,
      baseOid: analysis.baseOid,
      headOid: analysis.headOid,
      movement: analysis.movement,
      unavailableReason: analysis.unavailableReason,
      integrationEvidence: analysis.integrationEvidence,
      overlap: analysis.overlap,
      register: analysis.register,
    };
  } catch {
    return unavailable("authoritative", "distance-read-failed", "remote-unavailable", baseBranch);
  }
}

interface AnalyzeAvailableBaseOptions {
  exec: GitExec;
  mode: BaseDriftMode;
  baseBranch: string;
  baseOid: string;
  headOid: string;
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation: PathTreatmentClassifier;
}

async function analyzeAvailableBase(options: AnalyzeAvailableBaseOptions): Promise<BaseDriftResult> {
  const {
    exec,
    mode,
    baseBranch,
    baseOid,
    headOid,
    resolver,
    resolverFactory,
    classifyReconciliation,
  } = options;
  const { ahead, behind, state } = await countAheadBehindRef(exec, headOid, baseOid);

  if (behind === 0) {
    return {
      mode,
      verdict: "clean",
      state,
      ahead,
      behind,
      base: baseBranch,
      baseOid,
      headOid,
      movement: "disjoint",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 0,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    };
  }

  const [integrationEvidence, overlap] = await Promise.all([
    analyzeIntegrationEvidence({
      exec,
      baseOid,
      headOid,
      resolver: resolveResolver(resolver, resolverFactory, baseOid),
    }),
    analyzeBaseOverlap({
      exec,
      baseOid,
      headOid,
      ahead,
      behind,
      classify: classifyReconciliation,
    }),
  ]);
  const movement = classifyBaseMovement(overlap);
  return {
    mode,
    verdict: "reconcile",
    state,
    ahead,
    behind,
    base: baseBranch,
    baseOid,
    headOid,
    movement,
    integrationEvidence,
    overlap,
    register: composeBaseDriftRegister(baseBranch, behind, integrationEvidence, overlap, movement),
  };
}

function classifyBaseMovement(overlap: NonNullable<BaseDriftResult["overlap"]>): BaseMovement {
  if (overlap.status === "unavailable") return "unknown";
  return overlap.substantivePaths.length === 0 ? "disjoint" : "overlapping";
}

function resolveResolver(
  resolver: IntegrationEvidenceResolver | undefined,
  resolverFactory: IntegrationEvidenceResolverFactory | undefined,
  baseOid: string,
): IntegrationEvidenceResolver | undefined {
  if (resolver !== undefined || resolverFactory === undefined) return resolver;
  try {
    return resolverFactory(baseOid);
  } catch {
    return undefined;
  }
}

function unavailable(
  mode: BaseDriftMode,
  reason: BaseDriftUnavailableReason,
  state: WorktreeSyncState,
  base: string | null,
  failureReason: "timeout" | "error" = "error",
): BaseDriftResult {
  return {
    mode,
    verdict: "unavailable",
    state,
    ahead: 0,
    behind: 0,
    base,
    baseOid: null,
    headOid: null,
    unavailableReason: reason,
    integrationEvidence: null,
    overlap: null,
    register: mode === "authoritative" ? composeUnavailableRegister(base, reason) : null,
    ...(state === "remote-unavailable" ? { failureReason } : {}),
  };
}

export type {
  BaseDriftMode,
  BaseDriftResult,
  BaseDriftUnavailableReason,
  BaseMovement,
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  PathTreatmentClassifier,
} from "./base-drift-types.js";
