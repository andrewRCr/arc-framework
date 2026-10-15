/** Complete runtime contract for advisory worktree and retirement cleanup. */

import { z } from "zod";
import { withRemoteEvidence } from "../kernel/index.js";
import { CurrentHuskAdvisorySchema } from "./current-husk-advisory.js";

const WorktreeSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), name: z.string() }),
  z.strictObject({ kind: z.literal("errand"), slug: z.string() }),
  z.strictObject({ kind: z.literal("branch"), ref: z.string() }),
]);
const HuskStampSchema = CurrentHuskAdvisorySchema.shape.stamp;
const BranchedCleanupDecisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("removable") }),
  z.strictObject({
    action: z.literal("blocked"),
    reason: z.enum(["uncommitted", "user-surfaces", "unmerged", "evidence-unavailable"]),
  }),
  z.strictObject({ action: z.literal("external") }),
]);
const HuskCleanupDecisionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("removable") }),
  z.strictObject({
    action: z.literal("blocked"),
    reason: z.enum(["uncommitted", "head-moved", "evidence-mismatch", "evidence-unavailable"]),
  }),
  z.strictObject({ action: z.literal("outside"), reason: z.enum(["untrusted-marker", "missing-stamp"]) }),
]);
const StaleWorktreeReportSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("branched"), worktreePath: z.string(), branch: z.string(), decision: BranchedCleanupDecisionSchema,
  }),
  z.strictObject({
    kind: z.literal("husk"), worktreePath: z.string(), branch: z.null(), stampedBranch: z.string(),
    completedWorkUnit: z.string().nullable(), subject: WorktreeSubjectSchema,
    stamp: HuskStampSchema, decision: HuskCleanupDecisionSchema,
  }),
]);
const RetirementCleanupProjectionSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["not-applicable", "pending", "completed"]) }),
  z.strictObject({ status: z.literal("blocked"), reason: z.string() }),
]);
const SuccessorReadinessSchema = z.strictObject({
  candidates: z.array(z.string()).readonly(),
  actionable: z.boolean(),
  remedy: z.strictObject({
    argv: z.tuple([z.literal("arc"), z.literal("start"), z.string()]).readonly(), text: z.string(),
  }).nullable(),
});
const LandedRetirementResidueSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("actionable"), worktreePath: z.string(),
    lifecycle: z.strictObject({
      subject: z.strictObject({ slug: z.string(), branch: z.string().nullable() }),
      transition: z.literal("abandon"),
      cleanup: z.strictObject({
        branch: RetirementCleanupProjectionSchema, worktree: RetirementCleanupProjectionSchema,
        userWorkspace: RetirementCleanupProjectionSchema,
      }),
      successorReadiness: SuccessorReadinessSchema,
    }),
    teardown: z.strictObject({
      argv: z.tuple([z.literal("arc"), z.literal("teardown"), z.string()]).readonly(), text: z.string(),
    }),
  }),
  z.strictObject({
    status: z.literal("blocked"), worktreePath: z.string(),
    subject: z.strictObject({ slug: z.string(), branch: z.string() }), reason: z.string(),
  }),
]);
const RenameMoveResidueSchema = z.strictObject({
  oldSlug: z.string(), newSlug: z.string(), branch: z.string(), head: z.string(), from: z.string(), to: z.string(),
  remedy: z.strictObject({
    argv: z.tuple([z.literal("git"), z.literal("worktree"), z.literal("move"), z.string(), z.string()]).readonly(),
    text: z.string(),
  }),
});

/** Complete cleanup advisory with exact-evidence authorization constraints. */
export const StaleWorktreeSweepResultSchema = withRemoteEvidence({
  worktrees: z.array(StaleWorktreeReportSchema), renameMoves: z.array(RenameMoveResidueSchema),
  retirements: z.array(LandedRetirementResidueSchema), warnings: z.array(z.string()),
}).superRefine((value, context) => {
  if (value.remoteEvidence === "exact") return;
  if (value.worktrees.some((report) => report.decision.action === "removable")) {
    context.addIssue({ code: "custom", path: ["worktrees"], message: "incomplete evidence cannot remove worktrees" });
  }
  if (value.retirements.some((retirement) => retirement.status === "actionable")) {
    context.addIssue({ code: "custom", path: ["retirements"], message: "incomplete evidence cannot authorize teardown" });
  }
});
