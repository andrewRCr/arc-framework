/** Deterministic session-entry selection over the shared probe result. */

import type { DerivedCheckoutRow } from "../../lib/locus/derived-roster.js";
import type { SessionInitProbeResult } from "../status.js";
import type { AgendaSignals } from "./schema.js";

/** One winning session entry arm after applying precedence. */
export type AgendaRow = "stop" | "branch-gone" | "errand" | "housekeep" | "plan" | "context" | "start"
  | "transient" | "work-unit" | "current-husk" | "cold-start" | "orient";

/** Select one arm from the probe authority and explicit invocation intent. */
export function resolveAgendaRow(envelope: SessionInitProbeResult, signals: AgendaSignals): AgendaRow {
  const row = usableEnteringRow(envelope);
  if (row === null) return "stop";
  if (envelope.worktree.ok && envelope.worktree.value.state === "branch-gone") return "branch-gone";
  for (const signal of ["errand", "housekeep", "plan", "context"] as const) {
    if (signals[signal] !== undefined) return signal;
  }
  if (signals.start !== undefined) return "start";
  return resolveEnteringRow(row);
}

function usableEnteringRow(envelope: SessionInitProbeResult): DerivedCheckoutRow | null {
  if (!envelope.derivedLocusState.ok || envelope.locusGuidance.kind === "unavailable") return null;
  const entering = envelope.derivedLocusState.value.entering;
  if (entering.kind === "unresolved" || entering.row.kind === "unresolved-checkout") return null;
  const row = entering.row;
  const husk = envelope.currentHusk;
  if (row.kind === "work-unit" && row.context === null && !(husk?.ok && husk.value !== null)) return null;
  return row;
}

function resolveEnteringRow(row: DerivedCheckoutRow): AgendaRow {
  switch (row.kind) {
    case "transient": return "transient";
    case "work-unit": return row.context === null ? "current-husk" : "work-unit";
    case "unmanaged-checkout": return !row.checkout.primary && row.checkout.branch !== null ? "cold-start" : "orient";
    case "free-primary": case "retired": return "orient";
    case "unresolved-checkout": return "stop";
  }
}
