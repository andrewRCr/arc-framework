/** Checkout-local worktree and base orientation from published probe facts. */

import type { SessionInitWorktreeValue } from "../status/types.js";
import { composeBaseBranchSyncBehindText } from "../../lib/session-init/recommended-action.js";
import type { AgendaCompileInput } from "./compile-input.js";
import type { OrientationSurface } from "./orientation.js";
import type { AgendaStep } from "./schema.js";
import { renderSuperseded } from "./superseded.js";
import type { AgendaSyncState } from "./sync-state.js";

type Render = Extract<AgendaStep, { type: "render" }>;
const render = (surface: string, text: string): Render => ({ type: "render", surface, text });

/** Compile checkout attention surfaces for the path's synchronization decisions. */
export function compileCheckoutOrientation(input: AgendaCompileInput, sync: AgendaSyncState): OrientationSurface[] {
  const steps: Render[] = [...worktreeSurfaces(input, sync), ...baseSurfaces(input, sync)];
  const superseded = renderSuperseded(input);
  if (superseded !== null) steps.push(superseded);
  const dirty = input.envelope.dirty;
  if (dirty.ok && dirty.value.state === "dirty") steps.push(render("dirty", `**Uncommitted changes:** ${dirty.value.fileCount} file(s) dirty in working tree.`));
  return steps.map(step => ({ id: step.surface, steps: [step] }));
}

function worktreeSurfaces(input: AgendaCompileInput, sync: AgendaSyncState): Render[] {
  const slot = input.envelope.worktree;
  if (!slot.ok) return [];
  const steps: Render[] = [];
  const state = worktreeStateSurface(slot.value, sync.unsynced.has("worktree:pull"));
  if (state !== null) steps.push(state);
  const husk = input.envelope.currentHusk;
  if (slot.value.branch === null && !(husk?.ok && husk.value !== null)) steps.push(render("detached-head", "**Detached HEAD:** check out a branch before push/sync."));
  return steps;
}

function worktreeStateSurface(value: SessionInitWorktreeValue, unsynced: boolean): Render | null {
  const branch = value.branch;
  switch (value.state) {
    case "diverged": return value.supersession?.superseded ? null : render("worktree-diverged",
      `**Reconcile required:** \`${branch}\` diverged from \`origin/${branch}\` (${value.ahead} ahead, ${value.behind} behind).\n`
      + "Manual rebase or merge needed before pushing. Carried forward — commit/push requests will be flagged.");
    case "local-ahead": return render("local-ahead", `**Local-ahead:** ${value.ahead} unpushed commit(s) on \`${branch}\`.`);
    case "remote-ahead": return unsynced ? render("worktree-behind", `**Worktree behind:** ${value.behind} commit(s) behind origin; pull when ready.`) : null;
    case "remote-unavailable": return render("worktree-remote-unavailable", value.remoteEvidence === "unreachable"
      ? `**Remote unavailable:** origin could not be reached (${value.failureReason}); retry sync when ready.`
      : "**Remote unavailable:** origin advanced to a commit not yet present locally; refresh remote evidence when ready.");
    case "no-upstream": return render("no-upstream", `**New branch:** \`${branch}\` has no upstream — will be set on first push.`);
    case "no-remote": return render("no-remote", "**No remote:** `origin` not configured. Set up a remote before push/sync.");
    case "clean": case "skipped": case "detached-head": case "branch-gone": return null;
  }
}

function baseSurfaces(input: AgendaCompileInput, sync: AgendaSyncState): Render[] {
  const steps: Render[] = [];
  const distance = input.envelope.baseDistance;
  if (distance.ok && distance.value.recommendedAction === "surface") steps.push(render("base-drift", distance.value.recommendedPromptText));
  const slot = input.envelope.baseBranchSync;
  if (!slot.ok) return steps;
  const value = slot.value;
  let text: string | null = value.recommendedAction === "surface" ? value.recommendedPromptText : null;
  if (text === null && value.state === "remote-ahead" && sync.unsynced.has("base-sync:pull") && value.checkout.kind === "not-checked-out") text = composeBaseBranchSyncBehindText(value);
  if (text !== null) {
    if (value.refreshRemedy !== null && !text.includes(value.refreshRemedy.text)) text += `\n${value.refreshRemedy.text}`;
    steps.push(render("stale-base", text));
  }
  return steps;
}
