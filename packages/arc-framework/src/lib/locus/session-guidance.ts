/** CLI-precomposed locus narration shared by session envelopes. */

import { z } from "zod";

import type { LocusRowV1, LocusStateV1 } from "./schema/index.js";

const ready = z.strictObject({
  kind: z.literal("ready"),
  currentFrame: z.string().optional(),
  primaryAvailability: z.string().optional(),
  recovery: z.string().optional(),
  reconciliation: z.string().optional(),
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
 * @returns Stable session, recovery, reconciliation, and cleanup narration.
 */
export function deriveLocusSessionGuidance(
  probe: LocusProbe,
): LocusSessionGuidance {
  if (!probe.ok) {
    return LocusSessionGuidanceSchema.parse({
      kind: "unavailable",
      message: `Session locus state is unavailable (${probe.error.kind}): ${probe.error.message}`,
    });
  }
  const state = probe.value;
  const currentFrame = renderCurrent(state);
  const primaryAvailability = renderPrimary(state);
  const recovery = renderRecovery(state);
  const reconciliation = renderReconciliation(state);
  return LocusSessionGuidanceSchema.parse({
    kind: "ready",
    ...(currentFrame === null ? {} : { currentFrame }),
    ...(primaryAvailability === null ? {} : { primaryAvailability }),
    ...(recovery === null ? {} : { recovery }),
    ...(reconciliation === null ? {} : { reconciliation }),
    identities: state.inFlightIdentities.map(({ identity, actions }) =>
      `${identity.kind} '${identity.key}' is ${identity.state}; available actions: ${actions.join(" → ")}.`),
    cleanup: state.roster.rows.flatMap(renderCleanup),
    diagnostics: state.roster.diagnostics.filter((item) => item.code !== "worktree-without-role").map((item) =>
      `${item.code} at ${item.source.kind} '${item.source.key}': ${item.message}`),
  });
}

function renderCurrent(state: LocusStateV1): string | null {
  const current = state.current;
  if (current.kind === "none") return null;
  if (current.kind === "ambiguous") {
    return `Active session locus is ambiguous (${current.reasons.join(", ")}); reconcile before continuing.`;
  }
  return null;
}

function renderPrimary(state: LocusStateV1): string | null {
  const primary = state.primaryAvailability;
  if (primary.kind === "unsafe") {
    return `Primary checkout ${primary.checkoutPath} is unsafe (${primary.reasons.join(", ")}); reconcile before allocation.`;
  }
  return null;
}

function renderRecovery(state: LocusStateV1): string | null {
  const recovery = state.recovery;
  if (recovery.kind === "none") return null;
  if (recovery.kind === "resume") return `Resume session locus record ${recovery.activeRecordId}.`;
  if (recovery.kind === "residue") {
    return `Session locus residue ${recovery.recordId} offers: ${recovery.actions.join(" → ")}.`;
  }
  return `Session locus recovery is stopped (${recovery.reasons.join(", ")}).`;
}

function renderReconciliation(state: LocusStateV1): string | null {
  const reconciliation = state.reconciliation;
  if (reconciliation.kind === "clean") return null;
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
    if (["stale-record", "malformed-record", "duplicate-locus"].includes(row.kind)) {
      return [`Reconcile session locus ${target} manually before cleanup.`];
    }
    return [];
  }
  if (row.lease?.state === "unknown") return [`Cleanup for ${target} is manual because lease liveness is unknown.`];
  return [];
}
