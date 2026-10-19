/** Full identity-global user-reference reconciliation session contract. */
import { z } from "zod";
import { ScratchReconcilePlanSchema } from "./user-reference-scratch.js";
import { RemedySchema } from "./store/refusal.js";
import { SessionActionsSchema } from "./session-init/actions.js";
import { ReachableReferenceTransitionSchema, TrackedReferenceReplacementSchema } from "./work-unit/reference-reconcile-schema.js";
const NON_EMPTY_TEXT = z.string().min(1);
const UserReferenceAuthoritySchema = z.union([
  z.strictObject({ status: z.literal("unavailable"), ref: NON_EMPTY_TEXT, reason: z.literal("state-unavailable"), condition: z.string(), remedy: RemedySchema, remoteEvidence: z.literal("not-applicable") }),
  z.strictObject({
    status: z.literal("ready"),
    ref: NON_EMPTY_TEXT,
    transitions: z.array(ReachableReferenceTransitionSchema).readonly(),
    remoteEvidence: z.enum(["exact", "not-applicable"]),
  }),
  z.strictObject({
    status: z.literal("pending"),
    ref: NON_EMPTY_TEXT,
    reason: z.literal("base-object-pending-fetch"),
    remoteEvidence: z.literal("pending-fetch"),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    ref: NON_EMPTY_TEXT,
    reason: z.literal("remote-base-absent"),
    remoteEvidence: z.literal("exact"),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    ref: NON_EMPTY_TEXT,
    reason: z.literal("remote-not-required"),
    remoteEvidence: z.literal("not-applicable"),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    ref: NON_EMPTY_TEXT,
    remoteEvidence: z.literal("unreachable"),
    failureReason: z.enum(["timeout", "network", "auth", "error"]),
  }),
  z.strictObject({
    status: z.literal("conflict"),
    ref: NON_EMPTY_TEXT,
    reason: z.enum(["ambiguous-history", "namespace-corrupt"]),
    remoteEvidence: z.enum(["exact", "not-applicable"]),
  }),
]).superRefine((value, context) => {
  const carriesFailureReason = Object.hasOwn(value, "failureReason");
  if (value.remoteEvidence === "unreachable" && !carriesFailureReason) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "unreachable evidence requires a reason" });
  }
  if (value.remoteEvidence !== "unreachable" && carriesFailureReason) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "only unreachable evidence carries a reason" });
  }
});

const UserReferenceReconcileSessionObjectSchema = z.strictObject({
  actions: SessionActionsSchema.optional(),
  status: z.enum(["clean", "pending", "advisory", "unavailable", "conflict"]),
  authority: UserReferenceAuthoritySchema,
  plan: z.strictObject({
    status: z.enum(["clean", "pending", "advisory"]),
    scratch: ScratchReconcilePlanSchema.optional(),
    edits: z.array(z.strictObject({ path: z.string(), content: z.string(),
      replacements: z.array(TrackedReferenceReplacementSchema).readonly() })).readonly(),
    advisories: z.array(z.strictObject({ path: z.string(), line: z.number(), context: z.string(), subject: z.string(),
      successors: z.array(z.string()).readonly().optional(), kind: z.enum(["prose", "terminal", "conflict"]), disposition: z.enum(["review-rename", "remove-or-retarget", "inspect-history"]) })).readonly(),
  }).nullable(),
  recommendedAction: z.enum(["skip", "apply", "surface"]),
  recommendedCommand: z.array(z.string()).readonly().nullable(),
  recommendedPromptText: z.string(),
});

function validateUnavailableAuthority(
  value: z.infer<typeof UserReferenceReconcileSessionObjectSchema>,
  context: z.RefinementCtx,
): void {
  const quiet = value.authority.status === "unavailable" && value.authority.remoteEvidence === "not-applicable" && value.authority.reason === "remote-not-required";
  if (value.status !== value.authority.status || value.plan !== null
    || value.recommendedAction !== (quiet ? "skip" : "surface") || value.recommendedCommand !== null
    || (value.recommendedPromptText === "") !== quiet) {
    context.addIssue({ code: "custom", path: ["status"], message: "must match unavailable authority" });
  }
}

/** Complete identity-global reconcile facts and dispatch coherence. */
export const UserReferenceReconcileSessionResultSchema = UserReferenceReconcileSessionObjectSchema.superRefine((value, context) => {
  const authorityStatus = value.authority.status;
  if (authorityStatus !== "ready") {
    validateUnavailableAuthority(value, context);
    return;
  }

  if (value.plan === null) {
    context.addIssue({ code: "custom", path: ["plan"], message: "ready authority requires a reconcile plan" });
    return;
  }
  const expected = value.plan.status === "clean"
    ? { status: "clean", action: "skip", command: null, promptEmpty: true }
    : value.plan.status === "pending"
      ? {
          status: "pending",
          action: "apply",
          command: ["arc", "user", "reconcile-references", "--apply", "--json"],
          promptEmpty: false,
        }
      : {
          status: "advisory",
          action: "surface",
          command: ["arc", "user", "reconcile-references", "--json"],
          promptEmpty: false,
        };
  const commandMatches = expected.command === null
    ? value.recommendedCommand === null
    : value.recommendedCommand !== null
      && value.recommendedCommand.length === expected.command.length
      && expected.command.every((part, index) => value.recommendedCommand?.[index] === part);
  const repairCount = value.plan.edits.length + (value.plan.scratch?.moves.length ?? 0);
  const advisoryCount = value.plan.advisories.length + (value.plan.scratch?.advisories.length ?? 0);
  const planContentMatches = value.plan.status === "clean"
    ? repairCount === 0 && advisoryCount === 0
    : value.plan.status === "pending"
      ? repairCount > 0
      : repairCount === 0 && advisoryCount > 0;
  if (
    value.status !== expected.status
    || value.recommendedAction !== expected.action
    || !commandMatches
    || !planContentMatches
    || (value.recommendedPromptText === "") !== expected.promptEmpty
  ) {
    context.addIssue({ code: "custom", path: ["status"], message: "must match the ready-authority reconcile plan" });
  }
});
