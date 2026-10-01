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
import { z } from "zod";
import { analyzeIntegrationEvidence } from "./base-integration-evidence.js";
import { composeBaseDriftRegister, composeUnavailableRegister } from "./base-drift-register.js";
import type { HistoryCompletenessResult } from "./history-completeness.js";
import { readHistoryCompleteness } from "./history-completeness.js";
import type { ObjectAvailabilityResult } from "./object-availability.js";
import type { RemoteHeadSnapshotResult } from "./remote-ref-reader.js";
import { RemoteFailureReasonSchema } from "../kernel/index.js";
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
import { BaseDriftResultSchema } from "./base-drift-types.js";
import {
  countAheadBehindRef,
  DEFAULT_FETCH_TIMEOUT_MS,
  type WorktreeSyncState,
} from "./worktree-sync.js";

export type BaseDistanceStatusResult = BaseDriftResult;

function snapshotEvidenceArms<T extends z.ZodRawShape>(fields: T) {
  const { failureReason: _driftFailureReason, ...snapshotFields } = fields;
  void _driftFailureReason;
  return [
    z.strictObject({ ...snapshotFields, remoteEvidence: z.literal("exact") }),
    z.strictObject({ ...snapshotFields, remoteEvidence: z.literal("pending-fetch") }),
    z.strictObject({ ...snapshotFields, remoteEvidence: z.literal("unreachable"), failureReason: RemoteFailureReasonSchema }),
  ] as const;
}

const [CleanDrift, ReconcileDrift, UnavailableDrift, SkippedDrift] = BaseDriftResultSchema.options;

/** Strict snapshot readings on each evidence arm, preserving every drift verdict. */
export const BaseDistanceSnapshotAnalysisResultSchema = z.union([
  ...snapshotEvidenceArms(CleanDrift.shape),
  ...snapshotEvidenceArms(ReconcileDrift.shape),
  ...snapshotEvidenceArms(UnavailableDrift.shape),
  ...snapshotEvidenceArms(SkippedDrift.shape),
]);
export type BaseDistanceSnapshotAnalysisResult = z.infer<typeof BaseDistanceSnapshotAnalysisResultSchema>;

/** Readings resolved before snapshot evidence is consulted. */
export const BaseDistanceNotApplicableResultSchema = z.union([
  z.strictObject({ ...SkippedDrift.shape, state: z.literal("skipped"),
    remoteEvidence: z.literal("not-applicable") }),
  z.strictObject({ ...UnavailableDrift.shape, state: z.literal("no-remote"),
    unavailableReason: z.literal("no-remote"), remoteEvidence: z.literal("not-applicable") }),
  z.strictObject({ ...UnavailableDrift.shape, state: z.literal("detached-head"),
    unavailableReason: z.literal("detached-head"), remoteEvidence: z.literal("not-applicable") }),
]);
export type BaseDistanceNotApplicableResult = z.infer<typeof BaseDistanceNotApplicableResultSchema>;

/** Registered full base-distance root. */
export const BaseDistanceSnapshotResultSchema = z.union([
  BaseDistanceSnapshotAnalysisResultSchema,
  BaseDistanceNotApplicableResultSchema,
]);

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

/** Build a session reading that never consulted snapshot evidence. */
export function buildBaseDistanceNotApplicable(
  state: "skipped" | "no-remote" | "detached-head",
  baseBranch: string,
): BaseDistanceNotApplicableResult {
  if (state === "skipped") {
    return {
      mode: "advisory", verdict: "skipped", state, ahead: 0, behind: 0,
      base: baseBranch, baseOid: null, headOid: null,
      integrationEvidence: null, overlap: null, register: null,
      remoteEvidence: "not-applicable",
    };
  }
  const base = state === "detached-head" ? null : baseBranch;
  return {
    mode: "advisory", verdict: "unavailable", state, ahead: 0, behind: 0,
    base, baseOid: null, headOid: null, unavailableReason: state,
    integrationEvidence: null, overlap: null, register: null,
    detail: state === "detached-head"
      ? "Base drift requires a checked-out branch, but HEAD is detached."
      : "The repository has no origin remote from which to observe the base.",
    coordinates: { base, baseOid: null, headOid: null },
    continuation: {
      kind: "terminal-explanation",
      terminalExplanation: state === "detached-head"
        ? "Check out the intended work branch, then repeat session initialization."
        : "Configure the origin remote, then repeat session initialization.",
    },
    remoteEvidence: "not-applicable",
  } as BaseDistanceNotApplicableResult;
}

type WithoutDriftFailureReason<T> = T extends unknown ? Omit<T, "failureReason"> : never;

function withoutDriftFailureReason<T extends BaseDriftResult>(drift: T): WithoutDriftFailureReason<T> {
  const { failureReason: _driftFailureReason, ...snapshot } = drift;
  void _driftFailureReason;
  return snapshot as WithoutDriftFailureReason<T>;
}

/** Analyze base distance from supplied advertised evidence without acquiring it. */
export async function analyzeBaseDistanceSnapshot(
  options: AnalyzeBaseDistanceSnapshotOptions,
): Promise<BaseDistanceSnapshotAnalysisResult> {
  const mode = options.mode ?? "advisory";
  if (options.snapshot.kind === "unreachable") {
    return {
      ...withoutDriftFailureReason(unavailable(
        mode,
        "remote-evidence-unreachable",
        "remote-unavailable",
        options.baseBranch,
        "error",
        `Remote snapshot evidence was unreachable (${options.snapshot.failureReason}).`,
      )),
      register: null,
      remoteEvidence: "unreachable",
      failureReason: options.snapshot.failureReason,
    };
  }
  const baseOid = options.snapshot.tips[options.baseBranch];
  if (baseOid === undefined) {
    return {
      ...withoutDriftFailureReason(unavailable(mode, "remote-base-absent", "remote-unavailable", options.baseBranch)),
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
      ...withoutDriftFailureReason(unavailable(mode, "base-object-pending-fetch", "remote-unavailable", options.baseBranch)),
      baseOid,
      coordinates: { base: options.baseBranch, baseOid, headOid: null },
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
  return { ...withoutDriftFailureReason(analysis), remoteEvidence: "exact" };
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
  } catch (error) {
    return unavailable("authoritative", "invalid-base", "remote-unavailable", baseBranch, "error", error);
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
      return unavailable("authoritative", "remote-base-absent", "remote-unavailable", baseBranch);
    }
    return unavailable(
      "authoritative",
      fetch.outcome === "timeout" ? "fetch-timeout" : "fetch-failed",
      "remote-unavailable",
      baseBranch,
      fetch.outcome,
      fetch.error,
    );
  }

  let baseOid: string;
  try {
    baseOid = (await exec(
      "git",
      ["rev-parse", "--verify", `refs/remotes/origin/${baseBranch}^{commit}`],
    )).stdout.trim();
    if (!isGitObjectId(baseOid)) throw new Error("Invalid fetched base OID.");
  } catch (error) {
    return unavailable(
      "authoritative", "fetched-base-unresolved", "remote-unavailable", baseBranch, "error", error,
    );
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
    const { remoteEvidence, ...result } = analysis;
    void remoteEvidence;
    return result;
  } catch (error) {
    return unavailable("authoritative", "distance-read-failed", "remote-unavailable", baseBranch, "error", error);
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
  switch (overlap.status) {
    case "available":
      return overlap.substantivePaths.length === 0 ? "disjoint" : "overlapping";
    case "ambiguous":
    case "unrelated":
    case "unavailable":
      return "unknown";
  }
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
  diagnostic?: unknown,
): Extract<BaseDriftResult, { verdict: "unavailable" }> {
  const detail = baseDriftFailureDetail(reason, base, diagnostic);
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
    detail,
    coordinates: { base, baseOid: null, headOid: null },
    continuation: {
      kind: "terminal-explanation",
      terminalExplanation: baseDriftTerminalExplanation(reason, base),
    },
    ...(mode === "authoritative" && state === "remote-unavailable" ? { failureReason } : {}),
  };
}

function baseDriftFailureDetail(
  reason: BaseDriftUnavailableReason,
  base: string | null,
  diagnostic: unknown,
): string {
  const namedBase = base ?? "the configured base";
  const fallback: Record<typeof reason, string> = {
    "config-unavailable": "ARC configuration could not be read, so the configured base branch is unknown.",
    "invalid-base": `Configured base ${namedBase} is not a safe Git branch name.`,
    "detached-head": "Base drift requires a checked-out branch, but HEAD is detached.",
    "no-remote": "The repository has no origin remote from which to observe the base.",
    "fetch-timeout": `Fetching origin/${namedBase} timed out before drift evidence was available.`,
    "fetch-failed": `Fetching origin/${namedBase} failed before drift evidence was available.`,
    "base-object-pending-fetch": `The advertised ${namedBase} commit is not available in the local object store.`,
    "remote-base-absent": `Remote base origin/${namedBase} does not identify an advertised commit.`,
    "fetched-base-unresolved": `The fetched origin/${namedBase} ref did not resolve to a commit.`,
    "distance-read-failed": `Git could not compare HEAD with the observed ${namedBase} commit.`,
    "remote-evidence-unreachable": `Remote snapshot evidence for ${namedBase} was unreachable.`,
  };
  const raw = diagnostic === undefined
    ? ""
    : (diagnostic instanceof Error
        ? diagnostic.message
        : typeof diagnostic === "string" ? diagnostic : "Unrecognized non-Error diagnostic.")
      .replace(/\s+/gu, " ").trim();
  return `${fallback[reason]}${raw === "" ? "" : ` ${raw.slice(0, 1_024)}`}`.slice(0, 4_096);
}

function baseDriftTerminalExplanation(
  reason: BaseDriftUnavailableReason,
  base: string | null,
): string {
  const namedBase = base ?? "the configured base";
  const explanations: Record<typeof reason, string> = {
    "config-unavailable": "Repair .arc/system/arc-config.yml, then rerun arc base drift.",
    "invalid-base": "Configure branch.base with a valid Git branch name, then rerun arc base drift.",
    "detached-head": "Check out the intended work branch, then rerun arc base drift.",
    "no-remote": "Configure the origin remote, then rerun arc base drift.",
    "fetch-timeout": `Restore timely access to origin/${namedBase}, then rerun arc base drift.`,
    "fetch-failed": `Restore access to origin/${namedBase}, then rerun arc base drift.`,
    "base-object-pending-fetch": `Acquire the advertised ${namedBase} commit, then repeat the calling operation.`,
    "remote-base-absent": `Publish or correctly configure origin/${namedBase}, then rerun arc base drift.`,
    "fetched-base-unresolved": `Repair origin/${namedBase} so it resolves to a commit, then rerun arc base drift.`,
    "distance-read-failed": "Restore a complete readable Git history, then rerun arc base drift.",
    "remote-evidence-unreachable": "Restore remote evidence access, then repeat the calling operation.",
  };
  return explanations[reason];
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
