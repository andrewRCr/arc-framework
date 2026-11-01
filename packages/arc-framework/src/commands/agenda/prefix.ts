/** Compile the synchronization prefix before session context reads. */

import type { AgendaCompileInput, SyncChannels } from "./compile-input.js";
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import { createSyncExec, createSyncOffer } from "./sync-steps.js";
import { compileSupersededSync } from "./superseded.js";
import { combineSyncOffers } from "./combine.js";
import { compileNotesSync } from "./notes.js";
import type { AgendaStep } from "./schema.js";

/** Compile the next synchronization boundary for the row's channel set. */
export function compileSyncPrefix(input: AgendaCompileInput, channels: SyncChannels = "all"): AgendaStep[] {
  const notes = compileNotesSync(input);
  if (channels === "notes") return notes;
  const automaticNotes = notes.find(step => step.type === "exec");
  if (automaticNotes !== undefined) return [automaticNotes];
  const base = compileBaseSync(input);
  if (base?.type === "exec") return [base];
  const steps: AgendaStep[] = [];
  const superseded = compileSupersededSync(input);
  if (superseded !== null) steps.push(superseded);
  steps.push(...compileWorktreeAndNotes(input, notes));
  if (base !== null) steps.push(base);
  const references = compileUserReferences(input);
  if (references !== null) steps.push(references);
  return steps;
}

function compileBaseSync(input: AgendaCompileInput): AgendaStep | null {
  const slot = input.envelope.baseBranchSync;
  if (!slot.ok) return null;
  const { recommendedAction, recommendedPromptText, base } = slot.value;
  if (recommendedAction !== "pull" && recommendedAction !== "prompt") return null;
  const spec = { id: "base-sync:pull", text: recommendedPromptText, label: "Sync base branch",
    actions: [{ text: `git fetch origin ${quoteShellArgument(`${base}:${base}`)}`,
      argv: ["git", "fetch", "origin", `${base}:${base}`] }] };
  return recommendedAction === "pull" ? createSyncExec(input, spec) : createSyncOffer(input, spec);
}

function compileUserReferences(input: AgendaCompileInput): AgendaStep | null {
  const slot = input.envelope.userReferenceReconcile;
  if (!slot?.ok || slot.value.recommendedAction !== "apply" || slot.value.recommendedCommand === null) return null;
  const argv = [...slot.value.recommendedCommand];
  const published = slot.value.actions?.find(action => action.argv?.length === argv.length
    && action.argv.every((part, index) => part === argv[index]));
  return createSyncExec(input, { id: "user-references:apply", actions: [{
    text: published?.text ?? argv.map(quoteShellArgument).join(" "), argv,
    ...(published?.checkout === undefined ? {} : { checkout: published.checkout }),
  }] });
}

function compileWorktreeAndNotes(input: AgendaCompileInput, notes: AgendaStep[]): AgendaStep[] {
  const slot = input.envelope.worktree;
  if (!slot.ok || slot.value.recommendedAction !== "prompt") return notes;
  const worktree = createSyncOffer(input, { id: "worktree:pull", text: slot.value.recommendedPromptText,
    label: "Pull worktree", actions: [{ text: "git pull --ff-only", argv: ["git", "pull", "--ff-only"] }] });
  const note = notes[0];
  return notes.length === 1 && note?.type === "offer" ? [combineSyncOffers(input, worktree, note)] : [worktree, ...notes];
}
