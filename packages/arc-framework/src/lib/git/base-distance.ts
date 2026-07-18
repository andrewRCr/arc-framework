/**
 * Shared base-drift analyzer with an invocation-owned fetched base identity.
 *
 * Raw Git distance exclusively controls the verdict. Integration and overlap
 * evidence enrich a healthy reading without weakening that safety fact.
 *
 * @module
 */

import { randomBytes } from "node:crypto";

import {
  boundedGitInvocation,
  checkOriginExists,
  getCurrentBranch,
  type GitExec,
} from "./exec.js";
import { analyzeIntegrationEvidence } from "./base-integration-evidence.js";
import { composeBaseDriftRegister, composeUnavailableRegister } from "./base-drift-register.js";
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

export interface RunBaseDistanceStatusOptions {
  exec: GitExec;
  baseBranch: string;
  remoteSyncEnabled: boolean;
  fetchTimeoutMs?: number;
  mode?: BaseDriftMode;
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation?: ReconciliationClassifier;
  token?: () => string;
}

export type RunBaseDriftOptions = Omit<RunBaseDistanceStatusOptions, "remoteSyncEnabled"> & {
  mode: BaseDriftMode;
  remoteSyncEnabled?: boolean;
};

/** Compatibility entry point used by the session-init status composition. */
export async function runBaseDistanceStatus(
  options: RunBaseDistanceStatusOptions,
): Promise<BaseDistanceStatusResult> {
  return runBaseDrift({ ...options, mode: options.mode ?? "advisory" });
}

/** Analyze current HEAD against a freshly fetched immutable base commit. */
export async function runBaseDrift(options: RunBaseDriftOptions): Promise<BaseDriftResult> {
  const {
    exec,
    baseBranch,
    mode,
    remoteSyncEnabled = true,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
    resolver,
    resolverFactory,
    classifyReconciliation = () => "substantive",
    token = defaultToken,
  } = options;

  if (mode === "advisory" && !remoteSyncEnabled) {
    return {
      mode,
      verdict: "skipped",
      state: "skipped",
      ahead: 0,
      behind: 0,
      base: baseBranch,
      baseOid: null,
      integrationEvidence: null,
      overlap: null,
      register: null,
    };
  }

  const sourceRef = `refs/heads/${baseBranch}`;
  try {
    if (baseBranch === "" || baseBranch.startsWith("-") || sourceRef.includes(":")) {
      throw new Error("Unsafe base ref.");
    }
    await exec("git", ["check-ref-format", sourceRef]);
  } catch {
    return unavailable(mode, "invalid-base", "remote-unavailable", baseBranch);
  }

  if ((await getCurrentBranch(exec)) === null) {
    return unavailable(mode, "detached-head", "detached-head", null);
  }
  if (!(await checkOriginExists(exec))) {
    return unavailable(mode, "no-remote", "no-remote", baseBranch);
  }

  const invocationRef = `refs/arc/base-drift/${token()}`;
  const fetch = await boundedGitInvocation(
    exec,
    ["fetch", "--no-write-fetch-head", "origin", `${sourceRef}:${invocationRef}`],
    fetchTimeoutMs,
  );
  if (fetch.outcome !== "ok") {
    try {
      await exec("git", ["update-ref", "-d", invocationRef]);
    } catch {
      return unavailable(
        mode,
        "temporary-ref-cleanup-failed",
        "remote-unavailable",
        baseBranch,
      );
    }
    return unavailable(
      mode,
      fetch.outcome === "timeout" ? "fetch-timeout" : "fetch-failed",
      "remote-unavailable",
      baseBranch,
      fetch.outcome,
    );
  }

  let analysis: BaseDriftResult;
  try {
    analysis = await analyzeFetchedBase({
      exec,
      mode,
      baseBranch,
      invocationRef,
      resolver,
      resolverFactory,
      classifyReconciliation,
    });
  } catch {
    analysis = unavailable(mode, "distance-read-failed", "remote-unavailable", baseBranch);
  }
  // The exact process-owned ref is the only mutable resource. Cleanup is part
  // of the safety result, so a failure overrides any analysis outcome.
  try {
    await exec("git", ["update-ref", "-d", invocationRef]);
  } catch {
    return unavailable(
      mode,
      "temporary-ref-cleanup-failed",
      "remote-unavailable",
      baseBranch,
    );
  }
  return analysis;
}

interface AnalyzeFetchedBaseOptions {
  exec: GitExec;
  mode: BaseDriftMode;
  baseBranch: string;
  invocationRef: string;
  resolver?: IntegrationEvidenceResolver;
  resolverFactory?: IntegrationEvidenceResolverFactory;
  classifyReconciliation: ReconciliationClassifier;
}

async function analyzeFetchedBase(options: AnalyzeFetchedBaseOptions): Promise<BaseDriftResult> {
  const {
    exec,
    mode,
    baseBranch,
    invocationRef,
    resolver,
    resolverFactory,
    classifyReconciliation,
  } = options;
  let baseOid: string;
  try {
    baseOid = (await exec("git", ["rev-parse", "--verify", `${invocationRef}^{commit}`])).stdout.trim();
    if (!/^[0-9a-f]{40,64}$/u.test(baseOid)) throw new Error("Invalid fetched base OID.");
  } catch {
    return unavailable(mode, "fetched-base-unresolved", "remote-unavailable", baseBranch);
  }

  let ahead: number;
  let behind: number;
  let state: WorktreeSyncState;
  try {
    ({ ahead, behind, state } = await countAheadBehindRef(exec, "HEAD", baseOid));
  } catch {
    return unavailable(mode, "distance-read-failed", "remote-unavailable", baseBranch);
  }

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
    analyzeIntegrationEvidence({ exec, baseOid, resolver: resolver ?? resolverFactory?.(baseOid) }),
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

function defaultToken(): string {
  return `${process.pid}-${Date.now().toString(36)}-${randomBytes(12).toString("hex")}`;
}

export type {
  BaseDriftMode,
  BaseDriftResult,
  BaseDriftUnavailableReason,
  IntegrationEvidenceResolver,
  IntegrationEvidenceResolverFactory,
  ReconciliationClassifier,
} from "./base-drift-types.js";
