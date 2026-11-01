/** Literal recompile arguments preserving invocation intent and recorded decisions. */

import { ArcError } from "../../lib/kernel/index.js";
import { SessionInitAgendaSchema, type AgendaAnswers, type AgendaSignals, type OfferChoice } from "./schema.js";

const SIGNAL_FLAGS = ["plan", "errand", "next", "isolate", "start", "housekeep", "context"] as const;

/** Intent and decisions added by reaching a compiled action or choice. */
export interface AgendaArgvChanges {
  signal?: Pick<Extract<OfferChoice, { kind: "signal" }>, "signal" | "value">;
  elicit?: "errand" | "plan";
  dropNext?: boolean;
  dropSeed?: boolean;
  answered?: AgendaAnswers["answered"];
  done?: readonly string[];
}

/** Build literal arguments for a fresh agenda with accumulated decisions. */
export function buildAgendaArgv(
  signals: AgendaSignals,
  answers: AgendaAnswers,
  changes: AgendaArgvChanges = {},
): string[] {
  const next = changedSignals(signals, changes);
  const argv = ["arc", "agenda", "session-init", "--json"];
  if (next.seed !== undefined && !next.seed.startsWith("-")) argv.push(next.seed);
  for (const name of SIGNAL_FLAGS) {
    const value = next[name];
    if (value === undefined) continue;
    if (value === true) argv.push(`--${name}`);
    else appendAgendaOption(argv, `--${name}`, value);
  }
  appendDecisions(argv, answers, changes);
  if (next.seed?.startsWith("-")) argv.push("--", next.seed);
  return argv;
}

/** Compose a stable question key with percent-encoded variable segments. */
export function agendaQuestionKey(surface: string, action: string, operand?: string): string {
  const parts = [surface, encodeURIComponent(action)];
  if (operand !== undefined) parts.push(encodeURIComponent(operand));
  return parts.join(":");
}

function changedSignals(signals: AgendaSignals, changes: AgendaArgvChanges): AgendaSignals {
  const next: Record<string, unknown> = { ...signals };
  if (changes.signal) {
    const { signal, value } = changes.signal;
    if (value === null) {
      Reflect.deleteProperty(next, signal);
      if (signal === "errand") delete next.isolate;
    } else next[signal] = value;
  }
  // Elicitation inserts the missing signal later, retaining requested isolation.
  if (changes.elicit) Reflect.deleteProperty(next, changes.elicit);
  if (changes.dropNext) delete next.next;
  if (changes.dropSeed) delete next.seed;
  return SessionInitAgendaSchema.shape.signals.parse(next);
}

function appendDecisions(argv: string[], answers: AgendaAnswers, changes: AgendaArgvChanges): void {
  const answered = new Map(Object.entries(answers.answered));
  for (const [key, answer] of Object.entries(changes.answered ?? {})) {
    const previous = answered.get(key);
    if (previous !== undefined && previous !== answer) {
      throw new ArcError(`Recompilation cannot replace the recorded answer for ${key}`, "session-envelope.invalid");
    }
    answered.set(key, answer);
  }
  for (const [key, answer] of answered) appendAgendaOption(argv, "--answered", `${key}=${answer}`);
  const done = [...answers.done];
  for (const id of changes.done ?? []) if (!done.includes(id)) done.push(id);
  for (const id of done) appendAgendaOption(argv, "--done", id);
}

/** Add one literal option value to a recompile invocation. */
export function appendAgendaOption(argv: string[], flag: string, value: string): void {
  const elements = value.startsWith("-") ? [`${flag}=${value}`] : [flag, value];
  const delimiter = argv.indexOf("--");
  argv.splice(delimiter < 0 ? argv.length : delimiter, 0, ...elements);
}
