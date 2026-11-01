/** Compile session entry decisions into an asserted agenda or an actionable refusal. */

import { resolveAgendaRow } from "./row.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { AgendaRefusal } from "./parse.js";
import { assertSessionInitAgenda, type AgendaStep, type SessionInitAgenda } from "./schema.js";
import { renderDegradedSlot, renderLocus } from "./render.js";

/** A compiled agenda or a row whose implementation is not available yet. */
export type AgendaCompileResult = { ok: true; agenda: SessionInitAgenda } | { ok: false; refusal: AgendaRefusal };

/** Compile the next session boundary from the current probe and recorded decisions. */
export function compileSessionInitAgenda(input: AgendaCompileInput): AgendaCompileResult {
  const row = resolveAgendaRow(input.envelope, input.signals);
  if (row === "stop") return { ok: true, agenda: compileStop(input) };
  return { ok: false, refusal: {
    code: "row-not-compiled", flags: [], row,
    remedy: `This invocation selects the ${row} row, which is not compiled yet. `
      + "Follow session-init.md from the base branch for this session, or start the arm from another checkout.",
  } };
}

function compileStop(input: AgendaCompileInput): SessionInitAgenda {
  const { envelope, signals, answers } = input;
  const steps: AgendaStep[] = [];
  const locus = renderLocus(envelope, true);
  if (locus !== null) steps.push(locus);
  const degradedHusk = renderDegradedSlot("currentHusk", envelope.currentHusk);
  if (degradedHusk !== null) steps.push(degradedHusk);
  steps.push({ type: "gate", kind: "stop", autoProceed: false });
  const agenda: SessionInitAgenda = {
    schemaVersion: 1, mode: "agenda", ceremony: "session-init", signals, answers,
    orientation: { shape: "none" },
    residual: { config: envelope.config, releaseRouting: envelope.releaseRouting, domainRules: envelope.domainRules,
      ...(envelope.inboxState === undefined ? {} : { inboxState: envelope.inboxState }) },
    steps,
  };
  assertSessionInitAgenda(agenda);
  return agenda;
}
