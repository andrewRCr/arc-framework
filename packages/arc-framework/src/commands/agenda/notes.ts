/** Notes-backed pull and load compilation isolated from the other entry channels. */

import type { AgendaCompileInput } from "./compile-input.js";
import type { AgendaStep } from "./schema.js";
import { createSyncExec, createSyncOffer } from "./sync-steps.js";

const LOAD_PROMPT = "Notes: local notes are current but disk lags the latest note. Load?";

/** Compile the next notes mutation before any context reads. */
export function compileNotesSync(input: AgendaCompileInput): AgendaStep[] {
  const slot = input.envelope.user;
  const notes = slot.ok && slot.value !== null && "state" in slot.value ? slot.value : null;
  if (notes?.recommendedAction === "pull" || notes?.recommendedAction === "prompt") {
    const spec = { id: "notes:pull", text: notes.recommendedPromptText, label: "Pull notes",
      actions: [{ text: "arc user pull", argv: ["arc", "user", "pull"] }] };
    return [notes.recommendedAction === "pull" ? createSyncExec(input, spec) : createSyncOffer(input, spec)];
  }
  return compileNotesLoad(input, notes?.loadNeeded === true);
}

function compileNotesLoad(input: AgendaCompileInput, loadNeeded: boolean): AgendaStep[] {
  const retired = input.envelope.retiredSubdirs;
  const retiredTrigger = retired?.ok
    && (retired.value.recommendedAction === "pull" || retired.value.recommendedAction === "prompt");
  if (!loadNeeded && !retiredTrigger) return [];
  const config = input.envelope.config;
  const policy = config.ok ? config.value.settings["session.init_load.notes"] : "prompt";
  if (policy === "manual") return [];
  const text = retiredTrigger ? retired.value.recommendedPromptText : LOAD_PROMPT;
  const retiredPrompts = retiredTrigger && retired.value.recommendedAction === "prompt";
  const spec = { id: "notes:load", text, label: "Load notes",
    actions: [{ text: "arc user load", argv: ["arc", "user", "load"] }] };
  return [policy === "always" && !retiredPrompts ? createSyncExec(input, spec) : createSyncOffer(input, spec)];
}
