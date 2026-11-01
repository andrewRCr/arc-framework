/** Adapter for compiling a session initialization agenda from invocation intent. */

import * as p from "../../lib/terminal.js";
import { compileSessionInitAgenda } from "./compile.js";
import { createAgendaReadPort } from "./compile-input.js";
import { composeSessionInitStatus } from "../../handlers/status.js";
import { createSessionStatusContext } from "../../handlers/status/session-context.js";
import { requireArcProjectRoot } from "../../handlers/shared.js";
import { createGitExec, createRawGitExec } from "../../lib/io-context.js";
import type { RawGitExec } from "../../lib/git/exec.js";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import type { AgendaCliOptions } from "./input.js";
import { parseAgendaInput, type AgendaRefusal } from "./parse.js";

export type { AgendaCliOptions } from "./input.js";

/** Compile the requested ceremony with the invocation's subprocess policy. */
export async function handleAgenda(
  ceremony: string,
  seed: string | undefined,
  options: AgendaCliOptions,
  interaction?: InteractionContext,
): Promise<void> {
  const parsed = parseAgendaInput({ ceremony, seed, ...options });
  if (!parsed.ok) {
    renderRefusal(parsed.refusal, options.json === true);
    return;
  }
  const cwd = requireArcProjectRoot();
  if (!cwd) return;
  const exec = createGitExec(interaction?.subprocess);
  const transitionExec = createRawGitExec(cwd);
  const localOnlyTransitionExec: RawGitExec = (args, settings) => transitionExec(args, {
    ...settings, objectAccess: "local-only",
  });
  const context = await createSessionStatusContext(cwd, exec, transitionExec, localOnlyTransitionExec, interaction);
  const { result } = await composeSessionInitStatus(context);
  const compiled = compileSessionInitAgenda({ envelope: result, signals: parsed.signals, answers: parsed.answers,
    read: createAgendaReadPort(cwd, exec) });
  if (!compiled.ok) { renderRefusal(compiled.refusal, options.json === true); return; }
  if (options.json) { process.stdout.write(`${JSON.stringify(compiled.agenda)}\n`); return; }
  p.intro("arc agenda");
  p.note(JSON.stringify(compiled.agenda, null, 2), "Session Init");
  p.outro("Done.");
}

function renderRefusal(refusal: AgendaRefusal, json: boolean): void {
  if (json) process.stdout.write(`${JSON.stringify(refusal)}\n`);
  else process.stderr.write(`${refusal.code}: ${refusal.remedy}\n`);
  process.exitCode = 1;
}
