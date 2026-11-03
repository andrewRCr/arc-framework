/** Compile branch-gone recovery before synchronization or explicit entry signals. */
import { compileRecoveryDecision } from "./recovery-decisions.js";
import { compileResumeContext } from "./context.js";
import type { AgendaCompileInput } from "./compile-input.js";
import { createSessionInitAgenda } from "./document.js";
import { compileSessionOrientation, orderOrientationSurfaces } from "./orientation.js";
import { renderDegradedSlot } from "./render.js";
import { renderBranchGone } from "./recovery-orientation.js";
import { compileUniversalReads, selectedAgendaContext } from "./reads.js";
import { carryAgendaAnswers } from "./progress.js";
import { resolveRecoveryDestinations } from "./recovery-destinations.js";
import type { AgendaOrientation, AgendaStep, SessionInitAgenda } from "./schema.js";

/** Execute only a proven free recovery switch; retain all other recovery in this checkout. */
export async function compileBranchGone(input: AgendaCompileInput): Promise<SessionInitAgenda> {
  const recovery = input.envelope.recovery?.ok ? input.envelope.recovery.value : null;
  const destinations = await resolveRecoveryDestinations(recovery, input.read);
  const steps: AgendaStep[] = [];
  const decision = compileRecoveryDecision({ recovery, destinations, signals: input.signals, answers: input.answers });
  if (decision !== null) steps.push(decision);
  if (steps.at(-1)?.type !== "exec") {
    const context = selectedAgendaContext(input) === null
      ? await compileUniversalReads(input) : (await compileResumeContext(input, { notesLoadCanRestore: false })).steps;
    const reads = context.filter(step => step.type === "read");
    const findings = context.filter(step => step.type === "render" || step.type === "note");
    const surfaces = compileSessionOrientation(input, findings).filter(surface => surface.id !== "unconsumed-signal");
    const degraded = renderDegradedSlot("recovery", input.envelope.recovery);
    if (degraded !== null) surfaces.push({ id: "degraded-slot", steps: [degraded] });
    surfaces.push({ id: "branch-gone", steps: [renderBranchGone(input, destinations)] });
    steps.push(...reads, ...orderOrientationSurfaces(surfaces), { type: "gate", kind: "stop", autoProceed: false });
  }
  return createSessionInitAgenda(input, recoveryOrientation(input), carryAgendaAnswers(input, steps));
}

function recoveryOrientation(input: AgendaCompileInput): AgendaOrientation {
  const frame = input.envelope.derivedLocusState;
  const row = frame.ok && frame.value.entering.kind === "selected" ? frame.value.entering.row : null;
  return row?.kind === "transient"
    ? { shape: "subject", subject: { kind: row.subject.kind, key: row.subject.key } } : { shape: "work-state" };
}
