/** Superseded-commit reset offers and their orientation-only explanation. */

import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import { composeSupersessionHead } from "../../lib/session-init/recommended-action.js";
import type { AgendaCompileInput, SyncChannels } from "./compile-input.js";
import type { AgendaStep } from "./schema.js";
import { createSyncOffer, syncPending } from "./sync-steps.js";

const RESET_ID = "superseded:reset";

/** Offer the literal reset only while its question remains pending on this channel set. */
export function compileSupersededSync(input: AgendaCompileInput, channels: SyncChannels = "all"): AgendaStep | null {
  const facts = supersededFacts(input);
  if (facts === null || !resetPending(input, channels)) return null;
  const target = `origin/${facts.branch}`;
  return createSyncOffer(input, { id: RESET_ID, text: facts.prompt,
    label: "Reset superseded commits", actions: [{ text: `git reset --hard ${quoteShellArgument(target)}`,
      argv: ["git", "reset", "--hard", target] }] });
}

/** Render the explanation when a reset question is no longer pending on this row. */
export function renderSuperseded(input: AgendaCompileInput, channels: SyncChannels = "all"): Extract<AgendaStep, { type: "render" }> | null {
  const facts = supersededFacts(input);
  if (facts === null || resetPending(input, channels)) return null;
  return { type: "render", surface: "superseded", text: composeSupersessionHead(facts.branch) };
}

function resetPending(input: AgendaCompileInput, channels: SyncChannels): boolean {
  return channels === "all" && syncPending(input, RESET_ID);
}

function supersededFacts(input: AgendaCompileInput): { branch: string; prompt: string } | null {
  const slot = input.envelope.worktree;
  if (!slot.ok || slot.value.state !== "diverged" || !slot.value.supersession?.superseded || slot.value.branch === null) {
    return null;
  }
  return { branch: slot.value.branch, prompt: slot.value.recommendedPromptText };
}
