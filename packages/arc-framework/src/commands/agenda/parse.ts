/** Pure acquisition and refusal of session agenda signals and recorded decisions. */

import type { AgendaAnswers, AgendaSignals } from "./schema.js";
import { AgendaCommandInputSchema, type AgendaCommandInput } from "./input.js";

const DECISION_KEY_PATTERN = /^[^\s:+]+:[^\s:+]+(?::[^\s:+]+)?$/u;

/** One actionable input refusal before session probing. */
export interface AgendaRefusal {
  code: "invalid-input";
  flags: string[];
  row: string | null;
  remedy: string;
}

/** Validated invocation intent or a typed refusal before probing. */
export type AgendaParseResult = { ok: true; signals: AgendaSignals; answers: AgendaAnswers }
  | { ok: false; refusal: AgendaRefusal };

/** Acquire invocation intent without reading or mutating session state. */
export function parseAgendaInput(input: unknown): AgendaParseResult {
  const parsed = AgendaCommandInputSchema.safeParse(input);
  if (!parsed.success) {
    const flags = [...new Set(parsed.error.issues.map(issue => {
      const name = String(issue.path[0] ?? "input");
      return name === "ceremony" || name === "seed" || name === "input" ? name : `--${name}`;
    }))];
    return refused(flags, `Correct the invocation: ${parsed.error.issues.map(issue => issue.message).join("; ")}`);
  }
  const flagRefusal = validateSignals(parsed.data);
  if (flagRefusal) return { ok: false, refusal: flagRefusal };
  const decisions = parseDecisions(parsed.data);
  if (!decisions.ok) return decisions;
  return { ok: true, signals: acquireSignals(parsed.data), answers: decisions.answers };
}

function validateSignals(input: AgendaCommandInput): AgendaRefusal | null {
  if (input.ceremony !== "session-init") {
    return refused(["ceremony"], "Use the supported ceremony: arc agenda session-init.").refusal;
  }
  const leaves = (["errand", "housekeep", "plan", "context"] as const).filter(key => input[key] !== undefined);
  if (leaves.length > 1) {
    return refused(leaves.map(key => `--${key}`), `Choose only one of ${leaves.map(key => `--${key}`).join(", ")}.`).refusal;
  }
  if (typeof input.errand === "string" && input.next) {
    return refused(["--errand", "--next"], "Use bare --errand --next, or remove --next when naming an errand.").refusal;
  }
  if (input.isolate && input.errand === undefined) {
    return refused(["--isolate"], "Add --errand when using --isolate, or remove --isolate.").refusal;
  }
  return null;
}

function acquireSignals(input: AgendaCommandInput): AgendaSignals {
  const signals: AgendaSignals = {};
  if (input.seed !== undefined) signals.seed = input.seed;
  if (input.plan !== undefined) signals.plan = input.plan;
  if (input.errand !== undefined) signals.errand = input.errand;
  if (input.next !== undefined) signals.next = input.next;
  if (input.isolate !== undefined) signals.isolate = input.isolate;
  if (input.start !== undefined) signals.start = input.start;
  if (input.housekeep !== undefined) signals.housekeep = input.housekeep;
  if (input.context !== undefined) signals.context = input.context;
  return signals;
}

type RefusedInput = Extract<AgendaParseResult, { ok: false }>;

function parseDecisions(input: AgendaCommandInput): { ok: true; answers: AgendaAnswers } | RefusedInput {
  const answered = new Map<string, "accept" | "decline">();
  for (const token of input.answered ?? []) {
    const separator = token.lastIndexOf("=");
    const key = token.slice(0, separator);
    const answer = token.slice(separator + 1);
    const validKey = key === "plan-stub:" || DECISION_KEY_PATTERN.test(key);
    if (separator <= 0 || !validKey || (answer !== "accept" && answer !== "decline")) {
      return refused(["--answered"], "Use --answered <key>=accept or --answered <key>=decline.");
    }
    const previous = answered.get(key);
    if (previous !== undefined && previous !== answer) {
      return refused(["--answered"], `Supply one consistent answer for ${key}.`);
    }
    answered.set(key, answer);
  }
  for (const id of input.done ?? []) {
    if (!DECISION_KEY_PATTERN.test(id)) {
      return refused(["--done"], "Use --done <surface>:<action>, optionally followed by :<operand>.");
    }
  }
  return { ok: true, answers: { answered: Object.fromEntries(answered), done: [...(input.done ?? [])] } };
}

function refused(flags: string[], remedy: string): RefusedInput {
  return { ok: false, refusal: { code: "invalid-input", flags, row: null, remedy } };
}
