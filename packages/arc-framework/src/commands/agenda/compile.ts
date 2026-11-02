/** Compile session entry decisions into an asserted agenda or an actionable refusal. */

import { compileOrient } from "./orient.js";
import { compileStartSignal } from "./signal-start.js";
import { compileCurrentHusk } from "./husk.js";
import { compileTransientResume } from "./transient.js";
import { createSessionInitAgenda } from "./document.js";
import { compileHousekeepSignal, compileContextSignal } from "./signal-checkout.js";
import { compilePlanSignal } from "./signal-plan.js";
import { compileErrandSignal } from "./signal-errand.js";
import { compileBranchGone } from "./recovery.js";
import { compileWorkUnitResume } from "./resume.js";
import { resolveAgendaRow } from "./row.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { AgendaRefusal } from "./parse.js";
import { type AgendaStep, type SessionInitAgenda } from "./schema.js";
import { renderDegradedSlot, renderLocus } from "./render.js";

/** A compiled agenda or a row whose implementation is not available yet. */
export type AgendaCompileResult = { ok: true; agenda: SessionInitAgenda } | { ok: false; refusal: AgendaRefusal };

/** Compile the next session boundary from the current probe and recorded decisions. */
export async function compileSessionInitAgenda(input: AgendaCompileInput): Promise<AgendaCompileResult> {
  const row = resolveAgendaRow(input.envelope, input.signals);
  if (row === "stop") return { ok: true, agenda: compileStop(input) };
  if (row === "branch-gone") return { ok: true, agenda: await compileBranchGone(input) };
  if (row === "context") return { ok: true, agenda: await compileContextSignal(input) };
  if (row === "housekeep") return { ok: true, agenda: await compileHousekeepSignal(input) };
  if (row === "plan") return { ok: true, agenda: await compilePlanSignal(input) };
  if (row === "errand") return { ok: true, agenda: await compileErrandSignal(input) };
  if (row === "start") return compileStartEntry(input);
  if (row === "orient") return { ok: true, agenda: await compileOrient(input) };
  if (row === "current-husk") return { ok: true, agenda: await compileCurrentHusk(input) };
  if (row === "transient") return { ok: true, agenda: await compileTransientResume(input) };
  if (row === "work-unit") return { ok: true, agenda: await compileWorkUnitResume(input) };
  return { ok: false, refusal: {
    code: "row-not-compiled", flags: [], row,
    remedy: `This invocation selects the ${row} row, which is not compiled yet. `
      + "Follow session-init.md from the base branch for this session, or start the arm from another checkout.",
  } };
}

async function compileStartEntry(input: AgendaCompileInput): Promise<AgendaCompileResult> {
  const start = await compileStartSignal(input);
  if (start.ok) return start;
  const signals = { ...input.signals };
  delete signals.start;
  const fallback = await compileSessionInitAgenda({ ...input, signals });
  if (!fallback.ok) return fallback;
  const steps: AgendaStep[] = [start.note, ...fallback.agenda.steps.map((step): AgendaStep =>
    step.type === "gate" && step.kind === "proceed" ? { ...step, autoProceed: false } : step)];
  return { ok: true, agenda: createSessionInitAgenda(input, fallback.agenda.orientation, steps) };
}

function compileStop(input: AgendaCompileInput): SessionInitAgenda {
  const { envelope } = input;
  const steps: AgendaStep[] = [];
  const locus = renderLocus(envelope, true);
  if (locus !== null) steps.push(locus);
  const degradedHusk = renderDegradedSlot("currentHusk", envelope.currentHusk);
  if (degradedHusk !== null) steps.push(degradedHusk);
  steps.push({ type: "gate", kind: "stop", autoProceed: false });
  return createSessionInitAgenda(input, { shape: "none" }, steps);
}
