/** Combined worktree and notes choices retain one synchronization/recompile boundary. */

import { ArcError } from "../../lib/kernel/index.js";
import { buildAgendaArgv } from "./argv.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { AgendaAnswers, AgendaStep, OfferChoice } from "./schema.js";

type Offer = Extract<AgendaStep, { type: "offer" }>;
type ActionChoice = Extract<OfferChoice, { kind: "actions" }>;

/** Combine the two eligible channels while retaining each individual acceptance path. */
export function combineSyncOffers(input: AgendaCompileInput, worktree: Offer, notes: Offer): Offer {
  const worktreeChoice = worktree.choices[0];
  const notesChoice = notes.choices[0];
  if (worktree.id !== "worktree:pull" || !["notes:pull", "notes:load"].includes(notes.id)
    || worktreeChoice?.kind !== "actions" || notesChoice?.kind !== "actions") {
    throw new ArcError("Combined synchronization requires worktree and notes action offers", "session-envelope.invalid");
  }
  const keys = [worktree.id, notes.id];
  const text = notes.id === "notes:pull" ? input.envelope.recommendedCombinedPrompt : `${worktree.text}\n${notes.text}`;
  if (text === null) throw new ArcError("Combined synchronization has no published prompt", "session-envelope.invalid");
  const choice = (label: string, accepts: string[]): ActionChoice => {
    const answered: AgendaAnswers["answered"] = {};
    for (const key of keys) answered[key] = accepts.includes(key) ? "accept" : "decline";
    return { kind: "actions", label, accepts,
      actions: [...(accepts.includes(worktree.id) ? worktreeChoice.actions : []),
        ...(accepts.includes(notes.id) ? notesChoice.actions : [])],
      then: { kind: "recompile", argv: buildAgendaArgv(input.signals, input.answers, { answered }) } };
  };
  const both = choice(notes.id === "notes:pull" ? "Pull both" : "Pull worktree and load notes", keys);
  const worktreeOnly = choice("Worktree only", [worktree.id]);
  const notesOnly = choice(notes.id === "notes:pull" ? "Pull notes only" : "Load notes only", [notes.id]);
  return { type: "offer", ask: "now", id: keys.join("+"), text,
    choices: [...(notes.id === "notes:pull" ? [both, worktreeOnly, notesOnly] : [worktreeOnly, notesOnly, both]),
      { kind: "bare", label: "Skip", decline: true }],
  };
}
