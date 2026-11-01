/** Carry recorded decisions through the ordered agenda. */

import { appendAgendaDecisions } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { AgendaAnswers, AgendaStep, OfferChoice } from "./schema.js";

type Offer = Extract<AgendaStep, { type: "offer" }>;
type Note = Extract<AgendaStep, { type: "note" }>;

/** Apply the progress implied by reaching each recompile. */
export function carryAgendaAnswers(input: AgendaCompileInput, steps: AgendaStep[]): AgendaStep[] {
  const progress: AgendaAnswers = { answered: { ...input.answers.answered }, done: [...input.answers.done] };
  const result: AgendaStep[] = [];
  for (const step of steps) {
    if (omitted(input.answers, step)) continue;
    result.push(carryStep(step, progress));
    if (step.type === "offer" && step.ask === "now") {
      for (const key of step.id.split("+")) progress.answered[key] = "decline";
    }
    if (step.type === "fragment" && step.target.kind === "method") progress.done.push(`fragment:${step.target.name}`);
  }
  return result;
}

function carryStep(step: AgendaStep, progress: AgendaAnswers): AgendaStep {
  if (step.type === "exec" && step.then.kind === "recompile") return { ...step, then: { kind: "recompile",
    argv: carriedArgv(step.then.argv, progress, {}, [step.id]) } };
  if (step.type === "offer") return { ...step, choices: step.choices.map(choice => carryChoice(step, choice, progress)) };
  return step;
}

/** Summarize decisions retained from earlier compiles. */
export function renderAnswered(input: AgendaCompileInput): Note | null {
  const lines = Object.entries(input.answers.answered).map(([key, answer]) => `${key}: ${answer}.`);
  for (const id of input.answers.done) if (id.startsWith("fragment:")) lines.push(`${id.slice(9)}: followed.`);
  return lines.length === 0 ? null : { type: "note", surface: "answered", text: `Already answered or followed:\n${lines.join("\n")}` };
}

function omitted(answers: AgendaAnswers, step: AgendaStep): boolean {
  if (step.type === "exec") return answers.done.includes(step.id) || answers.answered[step.id] !== undefined;
  if (step.type === "offer" && step.ask === "now") return step.id.split("+").every(key => answers.answered[key] !== undefined);
  return step.type === "fragment" && step.target.kind === "method" && answers.done.includes(`fragment:${step.target.name}`);
}

function carryChoice(offer: Offer, choice: OfferChoice, progress: AgendaAnswers): OfferChoice {
  if (choice.kind === "bare") return choice;
  const answered: AgendaAnswers["answered"] = {};
  if (offer.ask === "now" && choice.kind === "actions" && !isCascadeTeardown(offer, choice)) {
    for (const key of offer.id.split("+")) answered[key] = choice.accepts.includes(key) ? "accept" : "decline";
  } else if (offer.ask === "now" && choice.kind === "signal" && choice.decline) {
    for (const key of offer.id.split("+")) answered[key] = "decline";
  }
  const update = (argv: string[]): string[] => carriedArgv(argv, progress, answered, [], offer.ask === "orientation");
  if (choice.kind !== "actions") return { ...choice, recompile: update(choice.recompile) };
  return { ...choice, then: choice.then.kind === "handoff" ? choice.then : { kind: "recompile", argv: update(choice.then.argv) } };
}

function carriedArgv(
  original: string[], progress: AgendaAnswers, answered: AgendaAnswers["answered"], done: string[], dropNext = false,
): string[] {
  const argv: string[] = [];
  let literal = false;
  for (let index = 0; index < original.length; index += 1) {
    const token = original[index];
    if (token === undefined) break;
    if (token === "--") literal = true;
    if (!literal && (token === "--answered" || token === "--done")) { index += 1; continue; }
    if (!literal && (token.startsWith("--answered=") || token.startsWith("--done=") || (dropNext && token === "--next"))) continue;
    argv.push(token);
  }
  appendAgendaDecisions(argv, progress, { answered, done });
  return argv;
}

function isCascadeTeardown(offer: Offer, choice: Extract<OfferChoice, { kind: "actions" }>): boolean {
  return offer.id.startsWith("branch-gone:")
    && choice.actions.some(action => action.argv[0] === "arc" && action.argv[1] === "teardown");
}
