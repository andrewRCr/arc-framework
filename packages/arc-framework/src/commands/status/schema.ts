/**
 * Runtime contracts for session-init and recovery status envelopes.
 *
 * Shared and deep value views in this module deliberately validate only the
 * fields that drive workflow routing. Every view is pass-through so unowned
 * payload fields remain under their handwritten home-module authorities.
 */

import { z } from "zod";

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, "value must not be empty");

/** Thin routing view of a working-tree dirty-state result. */
export const DirtyStateValueViewSchema = z.object({ state: z.enum(["clean", "dirty"]) }).loose();

/** Thin routing view of a worktree synchronization result. */
export const WorktreeSyncValueViewSchema = z
  .object({
    state: z.enum([
      "skipped",
      "clean",
      "remote-ahead",
      "local-ahead",
      "diverged",
      "no-upstream",
      "detached-head",
      "no-remote",
      "branch-gone",
      "remote-unavailable",
    ]),
    supersession: z.object({ superseded: z.boolean() }).loose().nullable().optional(),
  })
  .loose();

/** Thin routing view of a base-distance advisory. */
export const BaseDistanceValueViewSchema = z
  .object({ verdict: z.enum(["clean", "reconcile", "unavailable", "skipped"]) })
  .loose();

/** Object-only view of the worktree roster, whose nested fields do not route workflows. */
export const WorktreeRosterValueViewSchema = z.object({}).loose();

const WorktreeSubjectViewSchema = z
  .object({ kind: z.enum(["work-unit", "errand", "branch"]) })
  .loose();
const HuskStampViewSchema = z
  .object({ kind: z.enum(["legacy", "current", "manual-only"]) })
  .loose();

/** Thin routing view of the current-worktree husk advisory. */
export const CurrentHuskAdvisoryViewSchema = z
  .object({
    subject: z.object({ kind: z.literal("work-unit") }).loose(),
    stamp: HuskStampViewSchema,
  })
  .loose();

const BranchedCleanupDecisionViewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("removable") }).loose(),
  z
    .object({ action: z.literal("blocked"), reason: z.enum(["uncommitted", "user-surfaces", "unmerged"]) })
    .loose(),
  z.object({ action: z.literal("external") }).loose(),
]);
const HuskCleanupDecisionViewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("removable") }).loose(),
  z
    .object({ action: z.literal("blocked"), reason: z.enum(["uncommitted", "head-moved", "evidence-mismatch"]) })
    .loose(),
  z
    .object({ action: z.literal("outside"), reason: z.enum(["untrusted-marker", "missing-stamp"]) })
    .loose(),
]);
const StaleWorktreeReportViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("branched"), decision: BranchedCleanupDecisionViewSchema }).loose(),
  z
    .object({
      kind: z.literal("husk"),
      subject: WorktreeSubjectViewSchema,
      stamp: HuskStampViewSchema,
      decision: HuskCleanupDecisionViewSchema,
    })
    .loose(),
]);

/** Thin routing view of the stale-worktree cleanup advisory. */
export const StaleWorktreeSweepValueViewSchema = z
  .object({ worktrees: z.array(StaleWorktreeReportViewSchema) })
  .loose();

const WorkUnitReportViewSchema = z
  .object({
    state: z.enum(["awaiting-review", "stale", "blocked", "mergeable", "merged-needs-archival"]),
    behindBase: z.boolean(),
  })
  .loose();

/** Thin routing view of the work-unit state advisory. */
export const WorkUnitStateValueViewSchema = z
  .object({
    inFlight: z.object({ workUnits: z.array(WorkUnitReportViewSchema) }).loose(),
    nudge: z.object({ shouldNudge: z.boolean() }).loose(),
  })
  .loose();

const ErrandReportViewSchema = z
  .object({ state: z.enum(["in-progress", "awaiting-merge", "stale", "merged-cleanup"]) })
  .loose();
const MaterializableErrandViewSchema = z
  .object({ slug: NON_EMPTY_TEXT, branch: NON_EMPTY_TEXT })
  .loose();

/** Thin routing view of the errand state advisory. */
export const ErrandStateValueViewSchema = z
  .object({
    resume: z.object({ resumable: z.boolean() }).loose(),
    inFlight: z.object({ errands: z.array(ErrandReportViewSchema) }).loose(),
    materializable: z.object({ candidates: z.array(MaterializableErrandViewSchema) }).loose(),
    nudge: z.object({ shouldNudge: z.boolean() }).loose(),
  })
  .loose();
