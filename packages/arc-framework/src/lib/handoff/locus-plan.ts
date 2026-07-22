/** Deterministic handoff action selected from one reader-owned locus snapshot. */

import { z } from "zod";

import {
  LocusAbsolutePathSchema,
  LocusDigestSchema,
  LocusOpaqueTextSchema,
  LocusTokenSchema,
  type LocusRowV1,
  type LocusStateV1,
} from "../locus/schema/index.js";
import { isIdleWorkUnitRow, selectCheckoutWorkUnit } from "../locus/state.js";

const HandoffRefusalReasonSchema = z.enum([
  "locus-unresolved",
  "housekeep-incomplete",
  "groom-incomplete",
  "partial-handoff-forbidden",
  "preservation-unproven",
]);

/** Exact next operation for releasing the current session frame at handoff. */
export const HandoffLocusPlanSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("between-work-units") }),
  z.strictObject({
    kind: z.literal("release-work-unit"),
    recordId: LocusDigestSchema,
    leaseId: LocusTokenSchema.nullable(),
    checkoutPath: LocusAbsolutePathSchema,
  }),
  z.strictObject({
    kind: z.literal("leave-errand"),
    slug: LocusOpaqueTextSchema,
    claimId: LocusTokenSchema,
    recordId: LocusDigestSchema,
    leaseId: LocusTokenSchema,
    checkoutPath: LocusAbsolutePathSchema,
    parentRecordId: LocusDigestSchema.nullable(),
    parentCheckoutPath: LocusAbsolutePathSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("refused"),
    reason: HandoffRefusalReasonSchema,
    recordId: LocusDigestSchema.nullable(),
    recommendedPromptText: LocusOpaqueTextSchema,
  }),
]);

export type HandoffLocusPlan = z.infer<typeof HandoffLocusPlanSchema>;

/**
 * Derive handoff's subject action before any branch or active-meta heuristic.
 *
 * @param state - Reader-owned locus state for the handoff snapshot.
 * @param checkoutPath - Exact physical checkout running the handoff.
 * @returns The generation-bound handoff action or refusal.
 */
export function deriveHandoffLocusPlan(state: LocusStateV1, checkoutPath: string): HandoffLocusPlan {
  if (state.current.kind === "none") {
    if (state.recovery.kind !== "none") {
      return refusal("locus-unresolved", null, "Resolve the retained locus residue before handing off.");
    }
    const selected = selectCheckoutWorkUnit(state, checkoutPath);
    if (selected.kind === "ambiguous") {
      return refusal("locus-unresolved", null, "Resolve the ambiguous checkout role before handing off.");
    }
    if (selected.kind === "none") return { kind: "between-work-units" };
    if (!isIdleWorkUnitRow(selected.row)) {
      return refusal(
        "locus-unresolved",
        selected.row.recordId,
        "The current work-unit checkout is not an idle managed frame.",
      );
    }
    return HandoffLocusPlanSchema.parse({
      kind: "release-work-unit",
      recordId: selected.row.recordId,
      leaseId: null,
      checkoutPath: selected.row.checkoutPath,
    });
  }
  if (state.current.kind === "ambiguous") {
    return refusal("locus-unresolved", null, "Resolve the ambiguous current locus before handing off.");
  }
  if (state.recovery.kind !== "resume"
    || state.recovery.activeRecordId !== state.current.activeRecordId
    || state.recovery.parentRecordId !== state.current.parentRecordId) {
    return refusal("locus-unresolved", state.current.activeRecordId, "Refresh the changed locus generation before handing off.");
  }

  const active = exactRow(state.roster.rows, state.current.activeRecordId);
  if (active === null
    || active.kind !== "managed-role"
    || active.checkoutPath === null
    || active.role === null
    || active.lease === null
    || active.lease.state !== "live"
    || active.frame !== "active"
    || active.diagnostics.length > 0) {
    return refusal("locus-unresolved", state.current.activeRecordId, "The current locus generation is incomplete or changed.");
  }

  if (active.role.kind === "work-unit") {
    if (state.current.parentRecordId !== null || state.current.sessionHomeRecordId !== active.recordId) {
      return refusal("locus-unresolved", active.recordId, "The selected work-unit frame has an invalid parent edge.");
    }
    return HandoffLocusPlanSchema.parse({
      kind: "release-work-unit",
      recordId: active.recordId,
      leaseId: active.lease.leaseId,
      checkoutPath: active.checkoutPath,
    });
  }

  const parent = validateParent(state, active);
  if (parent === undefined) {
    return refusal("locus-unresolved", active.recordId, "The selected transient frame has an invalid parent edge.");
  }
  if (active.role.kind === "housekeep") {
    return refusal("housekeep-incomplete", active.recordId, "Complete or abandon housekeeping before handing off.");
  }
  if (active.role.kind === "groom") {
    return refusal("groom-incomplete", active.recordId, "Ship, close, or abandon grooming before handing off.");
  }
  if (active.role.kind !== "errand") {
    return refusal("locus-unresolved", active.recordId, "The selected transient role is unsupported at handoff.");
  }
  if (active.role.subject.kind === "partial-errand") {
    return refusal(
      "partial-handoff-forbidden",
      active.recordId,
      "Finish, promote, or abandon the partial Errand before handing off.",
    );
  }
  const identity = active.identity;
  if (identity?.kind !== "errand"
    || identity.purpose !== "errand"
    || identity.state !== "open"
    || identity.key !== active.role.subject.key
    || identity.claimId !== active.role.subject.claimId) {
    return refusal("preservation-unproven", active.recordId, "The ordinary Errand identity generation is not leaveable.");
  }
  return HandoffLocusPlanSchema.parse({
    kind: "leave-errand",
    slug: identity.key,
    claimId: identity.claimId,
    recordId: active.recordId,
    leaseId: active.lease.leaseId,
    checkoutPath: active.checkoutPath,
    parentRecordId: parent?.recordId ?? null,
    parentCheckoutPath: parent?.checkoutPath ?? null,
  });
}

function exactRow(rows: readonly LocusRowV1[], recordId: string): LocusRowV1 | null {
  const matches = rows.filter((row) => row.recordId === recordId);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function validateParent(state: LocusStateV1, active: LocusRowV1): LocusRowV1 | null | undefined {
  if (state.current.kind !== "resolved") return undefined;
  if (state.current.parentRecordId === null) {
    return active.role?.parentCheckoutPath === null
      && state.current.sessionHomeRecordId === active.recordId
      && active.lease?.sessionHomePath === active.checkoutPath
      ? null
      : undefined;
  }
  const parent = exactRow(state.roster.rows, state.current.parentRecordId);
  return parent?.kind === "managed-role"
    && parent.role?.kind === "work-unit"
    && parent.checkoutPath === active.role?.parentCheckoutPath
    && parent.recordId === state.current.sessionHomeRecordId
    && parent.frame === "suspended"
    && parent.diagnostics.every((item) => item.code === "lease-dead")
    && active.lease?.sessionHomePath === parent.checkoutPath
    ? parent
    : undefined;
}

function refusal(
  reason: z.infer<typeof HandoffRefusalReasonSchema>,
  recordId: string | null,
  recommendedPromptText: string,
): HandoffLocusPlan {
  return HandoffLocusPlanSchema.parse({ kind: "refused", reason, recordId, recommendedPromptText });
}
