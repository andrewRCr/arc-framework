/**
 * Shared base-drift analyzer with an invocation-owned fetched base identity.
 *
 * Raw Git distance exclusively controls the verdict. Integration and overlap
 * evidence enrich a healthy reading without weakening that safety fact.
 *
 * @module
 */

import {
  boundedFetch,
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
import type {
  BaseDriftMode,
  BaseDriftResult,
  BaseDriftUnavailableReason,
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  ReconciliationClassifier,
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
  mode: BaseDriftMode;
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation?: ReconciliationClassifier;
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
  classifyReconciliation?: ReconciliationClassifier;
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
    throw new Error("The advertised base commit is unavailable locally.");
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
    throw new Error("Complete local history is required for base-distance analysis.");
  }
  const localOnlyExec: GitExec = (command, args, execOptions) => options.exec(command, args, {
    ...execOptions,
    objectAccess: "local-only",
  });
  const analysis = await analyzeAvailableBase({
    exec: localOnlyExec,
    mode,
    baseBranch: options.baseBranch,
    baseOid,
    resolver: options.resolver,
    resolverFactory: options.resolverFactory,
    classifyReconciliation: options.classifyReconciliation ?? (() => "substantive"),
  });
  return { ...analysis, remoteEvidence: "exact" };
}

/** Analyze current HEAD against a freshly fetched immutable base commit. */
export async function runBaseDrift(options: RunBaseDriftOptions): Promise<BaseDriftResult> {
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
    classifyReconciliation = () => "substantive",
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
  const fetch = await boundedFetch(exec, baseBranch, fetchTimeoutMs);
  if (fetch.outcome !== "ok") {
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
    if (!/^[0-9a-f]{40,64}$/u.test(baseOid)) throw new Error("Invalid fetched base OID.");
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
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation: ReconciliationClassifier;
}

async function analyzeAvailableBase(options: AnalyzeAvailableBaseOptions): Promise<BaseDriftResult> {
  const {
    exec,
    mode,
    baseBranch,
    baseOid,
    resolver,
    resolverFactory,
    classifyReconciliation,
  } = options;
  const { ahead, behind, state } = await countAheadBehindRef(exec, "HEAD", baseOid);

  if (behind === 0) {
    return {
      mode,
      verdict: "clean",
      state,
      ahead,
      behind,
      base: baseBranch,
      baseOid,
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
    analyzeIntegrationEvidence({ exec, baseOid, resolver: resolveResolver(resolver, resolverFactory, baseOid) }),
    analyzeBaseOverlap({
      exec,
      baseOid,
      ahead,
      behind,
      classify: classifyReconciliation,
    }),
  ]);
  return {
    mode,
    verdict: "reconcile",
    state,
    ahead,
    behind,
    base: baseBranch,
    baseOid,
    integrationEvidence,
    overlap,
    register: composeBaseDriftRegister(baseBranch, behind, integrationEvidence, overlap),
  };
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
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  ReconciliationClassifier,
} from "./base-drift-types.js";
