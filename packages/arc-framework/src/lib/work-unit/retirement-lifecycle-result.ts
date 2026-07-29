/**
 * Shared retirement lifecycle projections returned by transform verbs and
 * consumed by landed-cleanup discovery.
 *
 * @module
 */

/** One independently projected retirement-cleanup leg. */
export type RetirementCleanupProjection =
  | { status: "not-applicable" }
  | { status: "pending" }
  | { status: "completed" }
  | { status: "blocked"; reason: string };

/** Evidence identity for a retirement. */
export type RetirementLifecycleAuthority = {
  kind: "receipt-backed";
  receiptId: string;
  authorityVersion: string;
};

/** Exact default-spawn command offered for one authoritative ready successor. */
export interface SuccessorStartRemedy {
  /** Tokenized command, safe for a caller to execute without reparsing prose. */
  argv: readonly ["arc", "start", string];
  /** Precomposed display text for workflow and status surfaces. */
  text: string;
}

/** Candidate members and any uniquely selectable authoritative start action. */
export interface SuccessorReadinessProjection {
  /** Members whose complete projected dependency set is empty. */
  candidates: readonly string[];
  /** Whether the receipt and member artifacts are authoritative on the base. */
  actionable: boolean;
  /** One default-spawn action, present only for one actionable candidate. */
  remedy: SuccessorStartRemedy | null;
}

/** Complete cross-transform account of retirement evidence and deferred cleanup. */
export interface RetirementLifecycleResult {
  /** Retiring work-unit identity as recorded by the transform. */
  subject: {
    slug: string;
    branch: string | null;
  };
  /** Transform that produced the result. */
  transition: "decompose" | "abandon";
  /** Receipt identity for the completed retirement. */
  authority: RetirementLifecycleAuthority;
  /** Independently replayable cleanup legs. */
  cleanup: {
    branch: RetirementCleanupProjection;
    worktree: RetirementCleanupProjection;
    userWorkspace: RetirementCleanupProjection;
  };
  /** Decompose successor projection; absent candidates are valid for abandon. */
  successorReadiness: SuccessorReadinessProjection;
}

/** Inputs for one newly recorded receipt-backed retirement result. */
export interface PendingRetirementLifecycleParams {
  slug: string;
  branch: string | null;
  transition: "decompose" | "abandon";
  receiptId: string;
  authorityVersion: string;
  successorCandidates?: readonly string[];
}

/**
 * Build the non-destructive result returned immediately after receipt recording.
 *
 * @param params - Recorded retirement identity and optional ready successors.
 * @returns Pending cleanup for a started subject, or non-applicability for a branchless stub.
 */
export function projectPendingRetirementLifecycle(
  params: PendingRetirementLifecycleParams,
): RetirementLifecycleResult {
  const branch = params.branch === null || params.branch === "[none]" ? null : params.branch;
  const cleanup: RetirementCleanupProjection = branch === null
    ? { status: "not-applicable" }
    : { status: "pending" };
  return {
    subject: { slug: params.slug, branch },
    transition: params.transition,
    authority: {
      kind: "receipt-backed",
      receiptId: params.receiptId,
      authorityVersion: params.authorityVersion,
    },
    cleanup: {
      branch: cleanup,
      worktree: cleanup,
      userWorkspace: cleanup,
    },
    successorReadiness: projectSuccessorReadiness(params.successorCandidates ?? [], false),
  };
}

/**
 * Project successor candidates into a typed, precomposed start action.
 *
 * @param candidates - Dependency-free member slugs.
 * @param actionable - Whether landed base evidence authorizes offering a start.
 * @returns The candidate list and, only when unique and actionable, its remedy.
 */
export function projectSuccessorReadiness(
  candidates: readonly string[],
  actionable: boolean,
): SuccessorReadinessProjection {
  const projected = [...candidates];
  const candidate = actionable && projected.length === 1 ? projected[0] : undefined;
  return {
    candidates: projected,
    actionable,
    remedy: candidate === undefined
      ? null
      : {
          argv: ["arc", "start", candidate],
          text: `arc start ${candidate}`,
        },
  };
}
