/** CLI-composed locus and failed-slot surfaces for session agendas. */

import type { Probe, SessionInitProbeResult } from "../status.js";
import type { AgendaStep } from "./schema.js";

/** Render the existing locus narration, including a contextless stop's exact checkout. */
export function renderLocus(envelope: SessionInitProbeResult, stop = false): AgendaStep | null {
  const guidance = envelope.locusGuidance;
  if (guidance.kind === "unavailable") return { type: "render", surface: "locus", text: guidance.message };
  const lines = [guidance.pause, guidance.primaryAvailability, guidance.identityDiscovery,
    ...guidance.cleanup, ...guidance.diagnostics].filter((line): line is string => line !== undefined);
  if (stop) {
    if (guidance.entering !== undefined) lines.push(guidance.entering);
    const locus = envelope.derivedLocusState;
    if (locus.ok && locus.value.entering.kind === "selected") {
      lines.push(`No work-unit context resolves for checkout ${locus.value.entering.row.checkout.path}.`);
    }
  }
  return lines.length === 0 ? null : { type: "render", surface: "locus", text: lines.join("\n") };
}

/** A failed slot supplies diagnostic text and no executable authority. */
export function renderDegradedSlot(name: string, slot: Probe<unknown> | undefined): AgendaStep | null {
  if (slot === undefined || slot.ok) return null;
  return { type: "render", surface: "degraded-slot",
    text: `${name} unavailable (${slot.error.kind}): ${slot.error.message}` };
}
