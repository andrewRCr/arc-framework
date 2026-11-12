/** Deterministic handoff action selected from the exact entering checkout row. */

import { z } from "zod";

import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type {
  DerivedTransientSubject,
  DerivedWorkUnitSubject,
} from "../locus/role-derivation.js";
import {
  LocusAbsolutePathSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
} from "../locus/schema/index.js";

const HandoffRefusalReasonSchema = z.enum([
  "locus-unresolved",
  "housekeep-incomplete",
  "groom-incomplete",
  "partial-handoff-forbidden",
  "preservation-unproven",
]);

const WorkUnitSubjectSchema = z.strictObject({
  kind: z.literal("work-unit"),
  key: LocusOpaqueTextSchema,
});

const TransientSubjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("partial-errand"), key: LocusOpaqueTextSchema, claimId: z.null() }),
  z.strictObject({
    kind: z.enum(["errand", "groom", "housekeep"]),
    key: LocusOpaqueTextSchema,
    claimId: LocusTokenSchema,
  }),
]);

const HandoffSubjectSchema = z.union([WorkUnitSubjectSchema, TransientSubjectSchema]);

/** Exact next operation for preserving or closing the current checkout at handoff. */
export const HandoffLocusPlanSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("between-work-units"),
    checkoutPath: LocusAbsolutePathSchema,
  }),
  z.strictObject({
    kind: z.literal("release-work-unit"),
    subject: WorkUnitSubjectSchema,
    checkoutPath: LocusAbsolutePathSchema,
    workflow: LocusOpaqueTextSchema,
    sessionType: z.enum(["planning", "execution", "prepublication", "integration"]),
  }),
  z.strictObject({
    kind: z.literal("leave-errand"),
    subject: TransientSubjectSchema.and(z.object({ kind: z.literal("errand") })),
    checkoutPath: LocusAbsolutePathSchema,
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("refused"),
    reason: HandoffRefusalReasonSchema,
    subject: HandoffSubjectSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema,
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
    recommendedPromptText: LocusOpaqueTextSchema,
  }),
]);

export type HandoffLocusPlan = z.infer<typeof HandoffLocusPlanSchema>;

/** Derive handoff solely from the reader-selected current checkout. */
export function deriveHandoffLocusPlan(frame: DerivedLocusFrame): HandoffLocusPlan {
  if (frame.entering.kind === "unresolved") {
    return refusal({
      row: null,
      checkoutPath: frame.entering.checkoutPath,
      reason: "locus-unresolved",
      message: `Current checkout handoff facts are unresolved: ${diagnosticText(frame.entering.diagnostics)}`,
    });
  }

  const row = frame.entering.row;
  if (row.kind === "free-primary" || row.kind === "unmanaged-checkout") {
    return HandoffLocusPlanSchema.parse({
      kind: "between-work-units",
      checkoutPath: row.checkout.path,
    });
  }
  if (row.kind === "unresolved-checkout" || row.kind === "retired") {
    return refusal({
      row,
      reason: "locus-unresolved",
      message: row.kind === "retired"
        ? "The current checkout is retired and cannot be handed off as active work."
        : `Current checkout handoff facts are unresolved: ${diagnosticText(row.diagnostics)}`,
    });
  }
  if (row.kind === "work-unit" && row.subject.kind === "work-unit") {
    return workUnitPlan(row, row.subject);
  }
  if (row.kind === "transient" && row.subject.kind !== "work-unit") {
    return transientPlan(row, row.subject);
  }
  return refusal({
    row,
    reason: "locus-unresolved",
    message: "The current checkout subject does not match its derived role.",
  });
}

function workUnitPlan(row: DerivedCheckoutRow, subject: DerivedWorkUnitSubject): HandoffLocusPlan {
  const context = row.context;
  if (context === null || context.workflow === null || context.sessionType === null) {
    return refusal({
      row,
      reason: "locus-unresolved",
      message: "The current work-unit checkout has no complete workflow/session projection.",
    });
  }
  return HandoffLocusPlanSchema.parse({
    kind: "release-work-unit",
    subject,
    checkoutPath: row.checkout.path,
    workflow: context.workflow,
    sessionType: context.sessionType,
  });
}

function transientPlan(row: DerivedCheckoutRow, subject: DerivedTransientSubject): HandoffLocusPlan {
  if (subject.kind === "housekeep") {
    return refusal({
      row,
      reason: "housekeep-incomplete",
      message: "Complete or abandon housekeeping before handing off.",
    });
  }
  if (subject.kind === "groom") {
    return refusal({
      row,
      reason: "groom-incomplete",
      message: "Ship, close, or abandon grooming before handing off.",
    });
  }
  if (subject.kind === "partial-errand") {
    return refusal({
      row,
      reason: "partial-handoff-forbidden",
      message: "Finish, promote, or abandon the partial Errand before handing off.",
    });
  }
  const identity = row.identity;
  if (identity?.kind !== "errand" || identity.purpose !== "errand" || identity.state !== "open"
    || identity.key !== subject.key || identity.claimId !== subject.claimId) {
    return refusal({
      row,
      reason: "preservation-unproven",
      message: "The ordinary Errand identity generation is not leaveable.",
    });
  }
  return HandoffLocusPlanSchema.parse({
    kind: "leave-errand",
    subject,
    checkoutPath: row.checkout.path,
    parentCheckoutPath: row.parentCheckoutPath,
  });
}

function refusal(options: {
  row: DerivedCheckoutRow | null;
  checkoutPath?: string;
  reason: z.infer<typeof HandoffRefusalReasonSchema>;
  message: string;
}): HandoffLocusPlan {
  return HandoffLocusPlanSchema.parse({
    kind: "refused",
    reason: options.reason,
    subject: options.row?.subject ?? null,
    checkoutPath: options.checkoutPath ?? options.row?.checkout.path,
    parentCheckoutPath: options.row?.parentCheckoutPath ?? null,
    recommendedPromptText: options.message,
  });
}

function diagnosticText(diagnostics: readonly { readonly message: string }[]): string {
  return diagnostics.length === 0 ? "no authoritative current-checkout row" : diagnostics.map((item) => item.message).join("; ");
}
