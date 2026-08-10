/**
 * `arc active in-flight` — the oracle-backed in-flight set.
 *
 * Fires the in-flight oracle behind a bounded network read and returns the
 * identity's in-flight work units and errands (identity-filtered refs, optional
 * PR enrichment), cross-worktree *and* cross-machine. This is the activation
 * scope-check's data input, supplanting the local-only `arc active roster`: it
 * surfaces remote-only work units (no local branch or worktree) the worktree roster can't
 * see. Pure logic over injected git deps — the handler resolves identity, team
 * mode, and the network/offline mode flag.
 *
 * @module
 */

import { z } from "zod";

import type { GitExec, GitExecInput } from "../../lib/git/exec.js";
import {
  analyzeInFlightSnapshot,
  deriveInFlight,
  isEligibleInFlightBranch,
  type AnalyzeInFlightSnapshotResult,
  type InFlightEntry,
  type InFlightInputSnapshot,
  type InFlightWarning,
  type PrSource,
} from "../../lib/git/in-flight-derivation.js";
import { projectTransientInFlightRead, readTransientInFlightIndexes } from "../../lib/errand/record.js";
import { readHistoryCompleteness } from "../../lib/git/history-completeness.js";
import { readObjectAvailability } from "../../lib/git/object-availability.js";
import {
  fetchRefsBounded,
  readLocalInFlightRefSnapshot,
  readRemoteHeadSnapshot,
  roundScaledFetchBudgetMs,
} from "../../lib/git/remote-ref-reader.js";
import { resolveWorktreePathsByBranchResult } from "../../lib/git/worktree-roster.js";
import { RemoteFailureReasonSchema } from "../../lib/kernel/index.js";

const CompleteExpansionSchema = z.strictObject({ status: z.literal("complete"), pendingBranchCount: z.literal(0) });
const PartialExpansionSchema = z.strictObject({
  status: z.literal("partial"),
  pendingBranchCount: z.number().int().positive(),
});
const FailedExpansionSchema = z.strictObject({ status: z.literal("failed"), pendingBranchCount: z.literal(0) });
const NotRequestedExpansionSchema = z.strictObject({
  status: z.literal("not-requested"),
  pendingBranchCount: z.literal(0),
});

/** Candidate-expansion result for explicit in-flight discovery. */
export const ActiveInFlightCandidateExpansionSchema = z.discriminatedUnion("status", [
  CompleteExpansionSchema,
  PartialExpansionSchema,
  FailedExpansionSchema,
  NotRequestedExpansionSchema,
]);

/** Candidate-expansion and evidence pairing for explicit in-flight discovery. */
export const ActiveInFlightEvidenceSchema = z.discriminatedUnion("remoteEvidence", [
  z.strictObject({
    remoteEvidence: z.literal("exact"),
    candidateExpansion: CompleteExpansionSchema,
  }),
  z.strictObject({
    remoteEvidence: z.literal("pending-fetch"),
    candidateExpansion: PartialExpansionSchema,
  }),
  z.strictObject({
    remoteEvidence: z.literal("unreachable"),
    failureReason: RemoteFailureReasonSchema,
    candidateExpansion: FailedExpansionSchema,
  }),
  z.strictObject({
    remoteEvidence: z.literal("not-applicable"),
    candidateExpansion: NotRequestedExpansionSchema,
  }),
]);

/** Evidence-qualified expansion state for the explicit command. */
export type ActiveInFlightEvidence = z.infer<typeof ActiveInFlightEvidenceSchema>;

export interface ActiveInFlightOptions {
  exec: GitExec;
  /** Repository checkout used to resolve repository-common candidate claims. */
  cwd?: string;
  /** Current identity, or `null` when unconfigured — the filter passes through. */
  identity: string | null;
  /** Team mode — gates the oracle identity filter (no-op in solo mode). */
  teamMode: boolean;
  /** `--local` / `--no-fetch`: skip the network read, derive from local refs. */
  localOnly: boolean;
  /** Configured base branch; excluded from in-flight classification. */
  baseBranch?: string;
  /** Slugs whose checkout lifecycle record classifies them as parked. */
  parkedSlugs?: ReadonlySet<string>;
  /** Per-read network timeout in ms; defaults to the reader's bound. */
  timeoutMs?: number;
  /** Open-PR enrichment seam; omitted → refs-only. */
  prSource?: PrSource;
}

/** Inputs for the explicit candidate-materialization boundary. */
export interface ActiveInFlightExpansionOptions extends ActiveInFlightOptions {
  /** Stdin-fed Git adapter used for batch local-object availability reads. */
  execInput: GitExecInput;
}

interface ActiveInFlightResultCore {
  /** Identity-filtered in-flight work units and errands, in oracle (input-branch) order. */
  entries: InFlightEntry[];
  /** Structured diagnostics emitted while deriving the in-flight set. */
  warnings: InFlightWarning[];
  /** Agreed mutable input snapshot used by fire-time probes. */
  snapshot: InFlightInputSnapshot;
  /**
   * True only when live remote membership was read and pruned against (online).
   * `false` on `--local` / unreachable — entries derive from last-known local
   * refs, a degraded view the advisory caller may note but never gates on.
   */
  reachable: boolean;
}

/** Complete explicit in-flight result with evidence-qualified expansion state. */
export type ActiveInFlightResult = ActiveInFlightResultCore & ActiveInFlightEvidence;

/** Strict supplied-evidence analysis retained for lifecycle composition. */
export type ActiveInFlightExpansionAnalysis = AnalyzeInFlightSnapshotResult & ActiveInFlightEvidence;

/**
 * Expand one captured live-head generation into locally classifiable candidates.
 *
 * @param options - Explicit acquisition dependencies plus in-flight classification policy.
 * @returns Evidence-qualified entries derived from the captured remote OIDs.
 */
export async function runActiveInFlightExpansion(
  options: ActiveInFlightExpansionOptions,
): Promise<ActiveInFlightResult> {
  if (options.localOnly) return runActiveInFlight(options);

  const analysis = await expandActiveInFlight(options);
  const core: ActiveInFlightResultCore = {
    entries: analysis.entries,
    warnings: analysis.warnings,
    snapshot: analysis.snapshot,
    reachable: analysis.reachable,
  };
  switch (analysis.remoteEvidence) {
    case "unreachable":
      return {
        ...core,
        remoteEvidence: analysis.remoteEvidence,
        failureReason: analysis.failureReason,
        candidateExpansion: analysis.candidateExpansion,
      };
    case "exact":
      return {
        ...core,
        remoteEvidence: analysis.remoteEvidence,
        candidateExpansion: analysis.candidateExpansion,
      };
    case "pending-fetch":
      return {
        ...core,
        remoteEvidence: analysis.remoteEvidence,
        candidateExpansion: analysis.candidateExpansion,
      };
    case "not-applicable":
      return {
        ...core,
        remoteEvidence: analysis.remoteEvidence,
        candidateExpansion: analysis.candidateExpansion,
      };
  }
}

/**
 * Materialize and analyze one captured live-head generation for explicit lifecycle composition.
 *
 * @param options - Explicit live-acquisition dependencies and classification policy.
 * @returns Full strict analysis plus evidence-qualified candidate expansion.
 */
export async function expandActiveInFlight(
  options: Omit<ActiveInFlightExpansionOptions, "localOnly">,
): Promise<ActiveInFlightExpansionAnalysis> {
  const { exec, execInput, cwd, identity, teamMode, baseBranch, parkedSlugs, timeoutMs, prSource } = options;
  const transientInFlight = projectTransientInFlightRead(
    await readTransientInFlightIndexes({ exec, identity }),
  );
  if (!transientInFlight.complete) {
    throw new Error("Transient identity records could not be inspected completely.");
  }
  const errandSlugByBranch = transientInFlight.indexes.slugByBranch;
  const snapshot = await readRemoteHeadSnapshot({
    exec,
    scope: { kind: "all-heads" },
    timeoutMs,
    ...(cwd === undefined ? {} : { cwd }),
  });
  if (snapshot.kind === "unreachable") {
    return {
      entries: [],
      residue: [],
      warnings: [],
      snapshot: { refs: {}, worktrees: {} },
      liveRefs: {},
      reachable: false,
      pendingBranchCount: 0,
      remoteEvidence: "unreachable",
      failureReason: snapshot.failureReason,
      candidateExpansion: { status: "failed", pendingBranchCount: 0 },
    };
  }

  const errandBranches = new Set(errandSlugByBranch.keys());
  const eligibleTips = Object.fromEntries(
    Object.entries(snapshot.tips).filter(([branch]) =>
      isEligibleInFlightBranch(branch, { baseBranch, errandBranches })),
  );
  const eligibleOids = Object.values(eligibleTips);
  const initialAvailability = await readObjectAvailability({ execInput, oids: eligibleOids, cwd });
  if (initialAvailability.kind !== "complete") {
    throw new Error("Advertised in-flight object availability could not be inspected.");
  }

  const missingBranches = Object.entries(eligibleTips)
    .filter(([, oid]) => initialAvailability.commits[oid] !== true)
    .map(([branch]) => branch);
  // One bounded fetch per branch, at most `CANDIDATE_FETCH_CONCURRENCY` in flight: a
  // fresh clone leaves every advertised head missing, and this runs on the lifecycle
  // preflight path. Per-branch success is not consulted — the availability re-read
  // below establishes what landed.
  //
  // This is the explicit acquisition path the strategy names as the `pending-fetch`
  // remedy, so it sizes its own budget rather than taking the passive default. The
  // remote is already proven reachable here — the snapshot read above returned — so
  // that budget buys rounds against a live remote rather than waiting out a dead one.
  await fetchRefsBounded({
    exec,
    branches: missingBranches,
    timeoutMs,
    totalTimeoutMs: roundScaledFetchBudgetMs(missingBranches.length, timeoutMs),
    ...(cwd === undefined ? {} : { cwd }),
  });

  const [objectAvailability, history, localRefs, worktrees] = await Promise.all([
    missingBranches.length === 0
      ? initialAvailability
      : readObjectAvailability({ execInput, oids: eligibleOids, cwd }),
    readHistoryCompleteness({ exec, cwd }),
    // Default remote, request root: these local reads join the snapshot and
    // availability facts above, so they must name the same repository.
    readLocalInFlightRefSnapshot(exec, undefined, cwd),
    resolveWorktreePathsByBranchResult(exec, cwd),
  ]);
  const analysis = await analyzeInFlightSnapshot({
    exec,
    snapshot,
    objectAvailability,
    history,
    localRefs,
    worktrees,
    identity,
    teamMode,
    errandSlugByBranch,
    baseBranch,
    parkedSlugs,
    prSource,
  });
  const evidence: ActiveInFlightEvidence = analysis.pendingBranchCount === 0
    ? {
        remoteEvidence: "exact",
        candidateExpansion: { status: "complete", pendingBranchCount: 0 },
      }
    : {
        remoteEvidence: "pending-fetch",
        candidateExpansion: { status: "partial", pendingBranchCount: analysis.pendingBranchCount },
      };
  return {
    ...analysis,
    ...evidence,
  };
}

/**
 * Resolve the identity's oracle-backed in-flight set.
 *
 * @param options - Injected git adapter plus resolved identity, team mode, and mode flag.
 * @returns The in-flight work units and errands, with the network-reachability flag.
 */
export async function runActiveInFlight(
  options: ActiveInFlightOptions,
): Promise<ActiveInFlightResult> {
  const { exec, identity, teamMode, localOnly, baseBranch, parkedSlugs, timeoutMs, prSource } = options;
  const errandSlugByBranch = projectTransientInFlightRead(
    await readTransientInFlightIndexes({ exec, identity }),
  ).indexes.slugByBranch;
  const result = await deriveInFlight({
    exec,
    localOnly,
    expandLiveOnly: false,
    baseBranch,
    timeoutMs,
    identity,
    teamMode,
    errandSlugByBranch,
    parkedSlugs,
    prSource,
  });
  const evidence: ActiveInFlightEvidence = localOnly
    ? {
        remoteEvidence: "not-applicable",
        candidateExpansion: { status: "not-requested", pendingBranchCount: 0 },
      }
    : result.reachable
      ? {
          remoteEvidence: "exact",
          candidateExpansion: { status: "complete", pendingBranchCount: 0 },
        }
      : {
          remoteEvidence: "unreachable",
          failureReason: "error",
          candidateExpansion: { status: "failed", pendingBranchCount: 0 },
        };
  return {
    entries: result.entries,
    warnings: result.warnings,
    snapshot: result.snapshot,
    reachable: result.reachable,
    ...evidence,
  };
}
