/**
 * Branch-gone recovery cascade — resolution logic.
 *
 * When a session opens on a branch whose upstream was deleted (the work shipped
 * elsewhere), session-init must point the operator somewhere: another in-flight
 * worktree, a recently-active remote branch, or `main`. This module is the pure
 * decision step. Given the candidate destinations gathered from the worktree
 * roster and from recent remote branches, it resolves to one of three outcomes:
 *
 * - `resolved` — exactly one candidate in the highest-priority non-empty tier;
 *   the workflow confirms and switches.
 * - `surface` — two or more candidates in that tier; the choice is ambiguous,
 *   so every candidate is surfaced for the operator to pick rather than guessed.
 * - `main-fallback` — no candidate in any tier; fall back to `main` with
 *   explicit confirmation.
 *
 * Tiers are consulted in confidence order: local in-flight worktrees first (the
 * strongest signal — a checked-out branch), then recently-active remote
 * branches. The first non-empty tier decides the outcome; lower tiers are not
 * consulted once a higher one yields. Pure — no git I/O; callers gather the
 * signals and pass them in.
 *
 * @module
 */

import { z } from "zod";

import { decideWorktreeCleanup } from "../git/worktree-cleanup.js";
import type { WorktreeMarkerReadResult } from "../git/worktree-marker.js";

/** Proposed disposition for a recovery candidate's worktree. */
export const CandidateActionSchema = z.enum(["switch", "removable", "external"]);

/** Proposed disposition for a recovery candidate's worktree. */
export type CandidateAction = z.infer<typeof CandidateActionSchema>;

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, "value must not be empty");

/** Runtime authority for a branch-gone recovery destination. */
export const CascadeCandidateSchema = z.discriminatedUnion("proposedAction", [
  z.strictObject({
    branch: NON_EMPTY_TEXT,
    worktreePath: NON_EMPTY_TEXT.optional(),
    proposedAction: z.literal("switch"),
  }),
  z.strictObject({
    branch: NON_EMPTY_TEXT,
    worktreePath: NON_EMPTY_TEXT,
    proposedAction: z.literal("removable"),
  }),
  z.strictObject({
    branch: NON_EMPTY_TEXT,
    worktreePath: NON_EMPTY_TEXT,
    proposedAction: z.literal("external"),
  }),
]);

/** A recovery destination the cascade can resolve to. */
export type CascadeCandidate = z.infer<typeof CascadeCandidateSchema>;

/** Structured explicit refresh for an incomplete advertised recovery tier. */
export const RecoveryRefreshRemedySchema = z.strictObject({
  argv: z.tuple([z.literal("arc"), z.literal("active"), z.literal("in-flight"), z.literal("--json")]),
  text: NON_EMPTY_TEXT,
});

/** Explicit refresh for an incomplete advertised recovery tier. */
export type RecoveryRefreshRemedy = z.infer<typeof RecoveryRefreshRemedySchema>;

/** Runtime authority for the three branch-gone recovery outcomes. */
const ResolvedCascadeResolutionSchema = z.strictObject({
  kind: z.literal("resolved"),
  remoteEvidence: z.literal("exact"),
  candidate: CascadeCandidateSchema,
});
const SurfaceCascadeResolutionSchema = z.strictObject({
  kind: z.literal("surface"),
  remoteEvidence: z.literal("exact"),
  candidates: z.array(CascadeCandidateSchema).min(2),
});
const MainFallbackCascadeResolutionSchema = z.strictObject({
  kind: z.literal("main-fallback"),
  remoteEvidence: z.literal("exact"),
});
const PendingCascadeResolutionSchema = z.strictObject({
  kind: z.literal("pending"),
  remoteEvidence: z.literal("pending-fetch"),
  candidates: z.array(CascadeCandidateSchema),
  pendingBranchCount: z.number().int().positive(),
  refreshRemedy: RecoveryRefreshRemedySchema,
});

export const CascadeResolutionSchema = z.discriminatedUnion("kind", [
  ResolvedCascadeResolutionSchema,
  SurfaceCascadeResolutionSchema,
  MainFallbackCascadeResolutionSchema,
  PendingCascadeResolutionSchema,
]);

/** Outcome of the recovery cascade. */
export type CascadeResolution = z.infer<typeof CascadeResolutionSchema>;

const RecoveryRecommendationFields = {
  recommendedAction: z.enum(["switch", "prompt", "surface"]),
  recommendedPromptText: z.string(),
};

/** Workflow-facing recovery result with CLI-composed dispatch and narration. */
export const SessionInitRecoveryValueSchema = z.discriminatedUnion("kind", [
  ResolvedCascadeResolutionSchema.extend(RecoveryRecommendationFields),
  SurfaceCascadeResolutionSchema.extend(RecoveryRecommendationFields),
  MainFallbackCascadeResolutionSchema.extend(RecoveryRecommendationFields),
  PendingCascadeResolutionSchema.extend(RecoveryRecommendationFields),
]).superRefine((value, context) => {
  const action = value.recommendedAction;
  const textIsEmpty = value.recommendedPromptText.trim().length === 0;
  const expectedAction = value.kind === "resolved"
    ? value.candidate.proposedAction === "external"
      ? "surface"
      : value.candidate.proposedAction === "removable"
        ? "prompt"
        : null
    : "prompt";

  if (expectedAction !== null && action !== expectedAction) {
    context.addIssue({
      code: "custom",
      path: ["recommendedAction"],
      message: `must be ${expectedAction} for this recovery outcome`,
    });
  }
  if (value.kind === "resolved" && value.candidate.proposedAction === "switch") {
    if (action === "surface") {
      context.addIssue({
        code: "custom",
        path: ["recommendedAction"],
        message: "must be switch or prompt for an exact switch candidate",
      });
    }
    if ((action === "switch") !== textIsEmpty) {
      context.addIssue({
        code: "custom",
        path: ["recommendedPromptText"],
        message: "must be empty only for an automatic switch",
      });
    }
  } else if (textIsEmpty) {
    context.addIssue({
      code: "custom",
      path: ["recommendedPromptText"],
      message: "must carry explicit recovery guidance",
    });
  }
});

/** Workflow-facing recovery result with CLI-composed dispatch and narration. */
export type SessionInitRecoveryValue = z.infer<typeof SessionInitRecoveryValueSchema>;

/** Candidate tiers, supplied in confidence order. */
export interface ResolveCascadeInput {
  /**
   * Strongest tier: in-flight worktrees from the roster (identity-filtered,
   * with the branch-gone worktree itself excluded).
   */
  worktreeCandidates: CascadeCandidate[];
  /**
   * Fallback tier: recently-active remote branches within the recency window
   * (with the gone branch and any branch already represented in
   * `worktreeCandidates` excluded).
   */
  recentBranchCandidates: CascadeCandidate[];
  /** Eligible advertised heads whose objects are not locally available. */
  pendingBranchCount?: number;
}

/**
 * Resolve the recovery cascade. Walks the candidate tiers in confidence order
 * and stops at the first non-empty one: a lone candidate resolves; two or more
 * surface for an explicit choice. When every tier is empty, falls back to
 * `main`.
 *
 * @param input - Candidate tiers in confidence order
 * @returns The resolved outcome
 */
export function resolveCascade(input: ResolveCascadeInput): CascadeResolution {
  const worktreeResolution = resolveTier(input.worktreeCandidates);
  if (worktreeResolution !== null) return worktreeResolution;
  if ((input.pendingBranchCount ?? 0) > 0) {
    return {
      kind: "pending",
      remoteEvidence: "pending-fetch",
      candidates: input.recentBranchCandidates,
      pendingBranchCount: input.pendingBranchCount ?? 0,
      refreshRemedy: composeRecoveryRefreshRemedy(),
    };
  }
  return resolveTier(input.recentBranchCandidates) ?? { kind: "main-fallback", remoteEvidence: "exact" };
}

/** Compose the exact live expansion action used by pending recovery. */
export function composeRecoveryRefreshRemedy(): RecoveryRefreshRemedy {
  return {
    argv: ["arc", "active", "in-flight", "--json"],
    text: "Refresh live in-flight branch evidence.",
  };
}

/**
 * Resolve a single tier: `null` when empty (the caller falls through to the
 * next tier), a `resolved` outcome for a lone candidate, or `surface` when the
 * tier is ambiguous.
 */
function resolveTier(candidates: CascadeCandidate[]): CascadeResolution | null {
  if (candidates.length === 0) return null;
  const [first] = candidates;
  if (candidates.length === 1 && first !== undefined) {
    return { kind: "resolved", remoteEvidence: "exact", candidate: first };
  }
  return { kind: "surface", remoteEvidence: "exact", candidates };
}

/** Signals for determining a recovery candidate's proposed action. */
export interface CandidateActionInputs {
  /**
   * Whether the worktree is the main / admin checkout (no WU). Such a worktree
   * is always a safe switch destination, so it short-circuits the cleanup
   * decision below.
   */
  isMainOrAdmin: boolean;
  /** Result of reading the candidate worktree's ownership marker. */
  marker: WorktreeMarkerReadResult;
  /** Whether the candidate worktree's tree is clean. */
  clean: boolean;
  /** Whether ignored identity-global user surfaces are absent or safely mergeable. */
  userSurfacesSafe?: boolean;
  /** Whether the candidate's branch is merged into the integration target. */
  merged: boolean;
}

/**
 * Determine the proposed action for a recovery candidate's worktree.
 *
 * A main / admin worktree is always a `switch` destination. For a WU worktree,
 * the shared cleanup decision is mapped to a candidate action: a shipped-and-
 * clean WU (branch merged, trustworthy marker) is `removable`; a live WU
 * (uncommitted or unmerged) is a `switch` target; an untrustworthy marker
 * (absent / malformed) stays `external`.
 *
 * @param inputs - Worktree role plus marker / clean / merged signals
 * @returns The candidate action
 */
export function determineCandidateAction(inputs: CandidateActionInputs): CandidateAction {
  if (inputs.isMainOrAdmin) return "switch";
  const decision = decideWorktreeCleanup({
    marker: inputs.marker,
    clean: inputs.clean,
    userSurfacesSafe: inputs.userSurfacesSafe,
    merged: inputs.merged,
    context: "shipped",
  });
  switch (decision.action) {
    case "removable":
      return "removable";
    case "blocked":
      return "switch";
    case "external":
      return "external";
  }
}
