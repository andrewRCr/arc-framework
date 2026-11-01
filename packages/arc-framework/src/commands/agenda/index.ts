/** Adapter for compiling a session initialization agenda from invocation intent. */

import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import type { AgendaCliOptions } from "./input.js";
import { parseAgendaInput, type AgendaRefusal } from "./parse.js";

export type { AgendaCliOptions } from "./input.js";

/** Compile the requested ceremony with the invocation's subprocess policy. */
export function handleAgenda(
  ceremony: string,
  seed: string | undefined,
  options: AgendaCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  void interaction;
  const parsed = parseAgendaInput({ ceremony, seed, ...options });
  if (!parsed.ok) {
    renderRefusal(parsed.refusal, options.json === true);
    return Promise.resolve();
  }
  const refusal: AgendaRefusal = { code: "row-not-compiled", flags: [], row: "session-init",
    remedy: "Follow session-init.md from the base branch for this session, or start the arm from another checkout." };
  renderRefusal(refusal, options.json === true);
  return Promise.resolve();
}

function renderRefusal(refusal: AgendaRefusal, json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify(refusal)}\n`);
  else process.stderr.write(`${refusal.code}: ${refusal.remedy}\n`);
  process.exitCode = 1;
}
