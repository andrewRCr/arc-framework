/** CLI-precomposed locus narration shared by session envelopes. */

import { z } from "zod";

import type { LocusRowV1, LocusStateV1 } from "./schema/index.js";
import { isIdleWorkUnitRow, selectCheckoutWorkUnit } from "./state.js";

const ready = z.strictObject({
  kind: z.literal("ready"),
  currentFrame: z.string(),
  primaryAvailability: z.string(),
  recovery: z.string(),
  reconciliation: z.string(),
  identities: z.array(z.string()),
  cleanup: z.array(z.string()),
  diagnostics: z.array(z.string()),
});

export const LocusSessionGuidanceSchema = z.discriminatedUnion("kind", [
  ready,
  z.strictObject({ kind: z.literal("unavailable"), message: z.string() }),
]);

export type LocusSessionGuidance = z.infer<typeof LocusSessionGuidanceSchema>;

type LocusProbe =
  | { ok: true; value: LocusStateV1 }
  | { ok: false; error: { kind: string; message: string } };

/**
 * Precompose stable session and cleanup narration without adding authority.
 *
 * @param probe - Shared locus-state probe result.
 * @param checkoutPath - Exact physical checkout when the caller resolved it.
 * @returns Stable session, recovery, reconciliation, and cleanup narration.
 */
export function deriveLocusSessionGuidance(
  probe: LocusProbe,
  checkoutPath?: string,
): LocusSessionGuidance {
  if (!probe.ok) {
    return LocusSessionGuidanceSchema.parse({
      kind: "unavailable",
      message: `Session locus state is unavailable (${probe.error.kind}): ${probe.error.message}`,
    });
  }
  const state = probe.value;
  return LocusSessionGuidanceSchema.parse({
    kind: "ready",
    currentFrame: renderCurrent(state, checkoutPath),
    primaryAvailability: renderPrimary(state),
    recovery: renderRecovery(state),
    reconciliation: renderReconciliation(state),
    identities: state.inFlightIdentities.map(({ identity, actions }) =>
      `${identity.kind} '${identity.key}' is ${identity.state}; available actions: ${actions.join(" → ")}.`),
    cleanup: state.roster.rows.flatMap(renderCleanup),
    diagnostics: state.roster.diagnostics.map((item) =>
      `${item.code} at ${item.source.kind} '${item.source.key}': ${item.message}`),
  });
}

function renderCurrent(state: LocusStateV1, checkoutPath: string | undefined): string {
  const current = state.current;
  if (current.kind === "none") {
    const selected = checkoutPath === undefined ? { kind: "none" as const } : selectCheckoutWorkUnit(state, checkoutPath);
    if (selected.kind === "resolved" && isIdleWorkUnitRow(selected.row)) {
      return `Current work-unit checkout is ${checkoutPath}; no transient operation is active.`;
    }
    return "No active local session locus is resolved.";
  }
  if (current.kind === "ambiguous") {
    return `Active session locus is ambiguous (${current.reasons.join(", ")}); reconcile before continuing.`;
  }
  const active = state.roster.rows.find((row) => row.recordId === current.activeRecordId);
  const frame = active?.frame ?? "unresolved";
  const path = active?.checkoutPath ?? "an unavailable checkout";
  return `Current ${frame} frame is at ${path}.`;
}

function renderPrimary(state: LocusStateV1): string {
  const primary = state.primaryAvailability;
  if (primary.kind === "free") return `Primary checkout ${primary.checkoutPath} is free.`;
  if (primary.kind === "occupied") {
    return `Primary checkout ${primary.checkoutPath} is occupied (lease ${primary.leaseState}).`;
  }
  return `Primary checkout ${primary.checkoutPath} is unsafe (${primary.reasons.join(", ")}).`;
}

function renderRecovery(state: LocusStateV1): string {
  const recovery = state.recovery;
  if (recovery.kind === "none") return "No session locus recovery action is pending.";
  if (recovery.kind === "resume") return `Resume session locus record ${recovery.activeRecordId}.`;
  if (recovery.kind === "residue") {
    return `Session locus residue ${recovery.recordId} offers: ${recovery.actions.join(" → ")}.`;
  }
  return `Session locus recovery is stopped (${recovery.reasons.join(", ")}).`;
}

function renderReconciliation(state: LocusStateV1): string {
  const reconciliation = state.reconciliation;
  if (reconciliation.kind === "clean") return "Session locus reconciliation is clean.";
  if (reconciliation.kind === "stop") {
    return `Session locus reconciliation is stopped (${reconciliation.reasons.join(", ")}).`;
  }
  const actions = reconciliation.actions.map((action) => {
    const target = action.checkoutPath ?? action.recordId ?? "unresolved target";
    return `${action.kind} ${target}`;
  });
  return `Session locus reconciliation offers: ${actions.join(" → ")}.`;
}

function renderCleanup(row: LocusRowV1): string[] {
  const target = row.checkoutPath ?? row.recordId;
  if (target === null) return [];
  if (row.kind !== "managed-role") {
    if (["stale-record", "malformed-record", "duplicate-locus", "unmanaged-checkout"].includes(row.kind)) {
      return [`Cleanup for ${target} requires manual reconciliation; this row grants no deletion authority.`];
    }
    return [];
  }
  if (row.lease?.state === "live") return [`Keep ${target}: a live session lease occupies this session locus.`];
  if (row.lease?.state === "unknown") return [`Cleanup for ${target} is manual because lease liveness is unknown.`];
  return [
    `Cleanup for ${target} remains guarded by provenance, cleanliness, terminal-head, ref, user-surface, `
      + "and current-session-locus checks; lease state alone never authorizes removal.",
  ];
}
