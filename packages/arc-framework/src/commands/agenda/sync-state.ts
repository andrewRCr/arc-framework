/** Decisions and unsynced facts shared by prefix and orientation compilation. */

import type { AgendaCompileInput, SyncChannels } from "./compile-input.js";
import { compileNotesSync } from "./notes.js";
import type { AgendaStep } from "./schema.js";

/** State retained after the synchronization prefix. */
export interface AgendaSyncState {
  unsettled: AgendaStep[];
  unsynced: Set<string>;
}

const CHANNEL_POLICIES = {
  "worktree:pull": "session.init_pull.worktree", "notes:pull": "session.init_pull.notes",
  "notes:load": "session.init_load.notes", "base-sync:pull": "session.init_pull.base",
} as const;

/** Derive which synchronization decisions remain unresolved on this path. */
export function compileSyncState(input: AgendaCompileInput, channels: SyncChannels = "all"): AgendaSyncState {
  const requested = requestedSyncIds(input);
  const completed = (id: string): boolean => input.answers.answered[id] === "accept" || input.answers.done.includes(id);
  const unsettled: AgendaStep[] = [...requested].filter(completed).map(id => ({ type: "note", surface: "sync-unsettled",
    text: `${id}: the session accepted or ran this sync, but the current probe still recommends it. Continue as declined.` }));
  const unsynced = new Set<string>();
  for (const [id, policy] of Object.entries(CHANNEL_POLICIES)) {
    if (completed(id) && !requested.has(id)) continue;
    const skipped = channels === "notes" && (id === "worktree:pull" || id === "base-sync:pull");
    const manual = input.envelope.config.ok && input.envelope.config.value.settings[policy] === "manual";
    if (manual || skipped || requested.has(id) || input.answers.answered[id] === "decline") unsynced.add(id);
  }
  return { unsettled, unsynced };
}

function requestedSyncIds(input: AgendaCompileInput): Set<string> {
  const fresh = { ...input, answers: { answered: {}, done: [] } };
  const ids = new Set<string>();
  for (const step of compileNotesSync(fresh)) if (step.type === "exec" || step.type === "offer") ids.add(step.id);
  const { worktree, baseBranchSync, userReferenceReconcile } = input.envelope;
  if (worktree.ok) {
    if (worktree.value.recommendedAction === "prompt") ids.add("worktree:pull");
    if (worktree.value.state === "diverged" && worktree.value.supersession?.superseded) ids.add("superseded:reset");
  }
  if (baseBranchSync.ok && ["prompt", "pull"].includes(baseBranchSync.value.recommendedAction)) ids.add("base-sync:pull");
  if (userReferenceReconcile?.ok && userReferenceReconcile.value.recommendedAction === "apply") ids.add("user-references:apply");
  return ids;
}
