/** Assemble and assert the shared session agenda envelope. */
import type { AgendaCompileInput } from "./compile-input.js";
import { assertSessionInitAgenda, type AgendaOrientation, type AgendaStep, type SessionInitAgenda } from "./schema.js";

/** Preserve residual probes and invocation intent unchanged around compiled steps. */
export function createSessionInitAgenda(input: AgendaCompileInput, orientation: AgendaOrientation, steps: AgendaStep[]): SessionInitAgenda {
  const { envelope, signals, answers } = input;
  const agenda: SessionInitAgenda = { schemaVersion: 1, mode: "agenda", ceremony: "session-init", signals, answers, orientation,
    residual: { config: envelope.config, releaseRouting: envelope.releaseRouting, domainRules: envelope.domainRules,
      ...(envelope.inboxState === undefined ? {} : { inboxState: envelope.inboxState }) }, steps };
  assertSessionInitAgenda(agenda);
  return agenda;
}
