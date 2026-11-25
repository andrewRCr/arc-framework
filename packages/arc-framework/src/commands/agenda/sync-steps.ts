/** Shared step construction for synchronization questions and commands. */

import type { AgendaCompileInput } from "./compile-input.js";
import { buildAgendaArgv } from "./argv.js";
import type { AgendaStep } from "./schema.js";

/** Published or compiler-composed commands offered under one question key. */
export interface SyncOfferSpec {
  id: string;
  text: string;
  label: string;
  actions: Extract<AgendaStep, { type: "exec" }>["actions"];
}

/** Ask before synchronizing and recompile with the accepted question recorded. */
export function createSyncOffer(input: AgendaCompileInput, spec: SyncOfferSpec): Extract<AgendaStep, { type: "offer" }> {
  return { type: "offer", id: spec.id, ask: "now", text: spec.text,
    choices: [{ kind: "actions", label: spec.label, accepts: [spec.id], actions: spec.actions,
      then: { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers,
        { answered: { [spec.id]: "accept" } }) } },
    { kind: "bare", label: "Skip", decline: true }],
  };
}

/** End at a synchronization command, carrying its completion into the fresh agenda. */
export function createSyncExec(
  input: AgendaCompileInput,
  spec: Pick<SyncOfferSpec, "id" | "actions">,
): Extract<AgendaStep, { type: "exec" }> {
  return { type: "exec", id: spec.id, actions: spec.actions,
    then: { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { done: [spec.id] }) } };
}

/** A sync question or command may run only before its first recorded decision. */
export function syncPending(input: AgendaCompileInput, id: string): boolean {
  return input.answers.answered[id] === undefined && !input.answers.done.includes(id);
}
