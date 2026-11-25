/** CLI-composed locus and failed-slot surfaces for session agendas. */

import type { LocusSessionGuidance } from "../../lib/locus/session-guidance.js";
import type { Probe, SessionInitProbeResult } from "../status.js";
import type { AgendaStep } from "./schema.js";

/** Render the existing locus narration, including a contextless stop's exact checkout. */
export function renderLocus(envelope: SessionInitProbeResult, stop = false): AgendaStep | null {
  const guidance = envelope.locusGuidance;
  if (guidance.kind === "unavailable") return { type: "render", surface: "locus", text: guidance.message };
  const lines = renderReadyLocusLines(guidance, stop);
  if (stop) {
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

/** Retain all ready-guidance lines appropriate to this orientation boundary. */
export function renderReadyLocusLines(guidance: Extract<LocusSessionGuidance, { kind: "ready" }>, stop = false): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(guidance)) {
    if (key === "kind" || (key === "entering" && !stop)) continue;
    if (typeof value === "string") lines.push(value);
    else if (Array.isArray(value)) lines.push(...value);
  }
  return lines;
}
