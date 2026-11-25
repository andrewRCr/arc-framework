/** Notes-backed pull and load compilation isolated from the other entry channels. */

import type { AgendaCompileInput } from "./compile-input.js";
import type { OrientationSurface } from "./orientation.js";
import type { AgendaSyncState } from "./sync-state.js";
import type { AgendaStep } from "./schema.js";
import type { SessionInitUserValue } from "../status/types.js";
import { createSyncExec, createSyncOffer, syncPending } from "./sync-steps.js";

type NotesValue = Extract<NonNullable<SessionInitUserValue>, { state: string }>;
type Render = Extract<AgendaStep, { type: "render" }>;

const LOAD_PROMPT = "Notes: local notes are current but disk lags the latest note. Load?";

/** Compile the next notes mutation before any context reads. */
export function compileNotesSync(input: AgendaCompileInput): AgendaStep[] {
  const slot = input.envelope.user;
  const notes = slot.ok && slot.value !== null && "state" in slot.value ? slot.value : null;
  if (notes?.recommendedAction === "pull" || notes?.recommendedAction === "prompt") {
    if (!syncPending(input, "notes:pull")) return [];
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
  if ((!loadNeeded && !retiredTrigger) || !syncPending(input, "notes:load")) return [];
  const config = input.envelope.config;
  const policy = config.ok ? config.value.settings["session.init_load.notes"] : "prompt";
  if (policy === "manual") return [];
  const text = retiredTrigger ? retired.value.recommendedPromptText : LOAD_PROMPT;
  const retiredPrompts = retiredTrigger && retired.value.recommendedAction === "prompt";
  const spec = { id: "notes:load", text, label: "Load notes",
    actions: [{ text: "arc user load", argv: ["arc", "user", "load"] }] };
  return [policy === "always" && !retiredPrompts ? createSyncExec(input, spec) : createSyncOffer(input, spec)];
}

/** Compile notes attention without running advisory commands. */
export function compileNotesOrientation(input: AgendaCompileInput, sync: AgendaSyncState): OrientationSurface[] {
  const steps: Render[] = renderNotesNudges(input);
  const slot = input.envelope.user;
  const notes = slot.ok && slot.value !== null && "state" in slot.value ? slot.value : null;
  if (notes !== null) steps.push(...renderNotesState(notes, sync));
  if (notes?.loadNeeded && sync.unsynced.has("notes:load")) steps.push({ type: "render", surface: "notes-load-pending",
    text: "**Notes load pending:** disk lags the latest note; run `arc user load` when ready." });
  const retired = input.envelope.retiredSubdirs;
  if (retired?.ok && retired.value.candidates.length > 0 && (retired.value.recommendedAction === "surface"
    || sync.unsynced.has("notes:load") || sync.unsynced.has("notes:pull"))) {
    const policy = retired.value.recommendedAction === "surface" ? " (warn-only under the current policy)" : "";
    steps.push({ type: "render", surface: "retired-subdirs",
      text: `**Retired subdirs:** ${retired.value.candidates.length} shipped-WU user subdir(s) linger; reconcile with \`arc user load\`${policy}:\n`
        + retired.value.candidates.map(candidate => `- \`${candidate}\``).join("\n") });
  }
  return steps.map(step => ({ id: step.surface, steps: [step] }));
}

function renderNotesState(notes: NotesValue, sync: AgendaSyncState): Render[] {
  const steps: Render[] = [];
  const add = (surface: string, text: string): void => { steps.push({ type: "render", surface, text }); };
  if (notes.state === "conflict") {
    if (notes.contentRelation !== undefined && ["local-subset", "equal", "mixed-uncontested"].includes(notes.contentRelation)) {
      add("notes-reconciling", "**Notes reconciling:** local and remote notes diverged without contested entries; expected residue will reconcile at the next paired push. No pull action is needed.");
    } else add("notes-conflict", [notes.summary, ...notes.detailLines].join("\n"));
  }
  if (notes.state === "clean" && (notes.refState === "local-ahead"
    || (notes.refState === "diverged" && notes.contentRelation === "remote-subset"))) {
    add("local-ahead-notes", "**Local-ahead notes:** local user-notes ref is ahead of remote. Push (or `arc sync`) when ready; non-blocking.");
  }
  if (notes.state === "remote-ahead" && sync.unsynced.has("notes:pull")) add("notes-behind", notes.summary);
  if (notes.state === "remote-unavailable") add("notes-remote-unavailable", notes.summary);
  const drift = notes.notesDriftSurface;
  if (drift !== undefined) add("notes-drift", drift.register === "expected"
    ? `**Notes/disk drift:** expected with live sibling sessions or a fresh seed (${drift.direction}); converges at next save or handoff — lag, not loss.`
    : `**Notes/disk drift:** on-disk user files diverge from the latest note (${drift.direction}); inspect with \`arc user status\` before relying on session notes — no auto-load (may carry local edits).`);
  return steps;
}

function renderNotesNudges(input: AgendaCompileInput): Render[] {
  const steps: Render[] = [];
  const lag = input.envelope.partialPushMarker;
  if (lag?.ok && lag.value.markers.length > 0) steps.push({ type: "render", surface: "notes-lag",
    text: `**Notes lag:** ${lag.value.markers.length} sibling notes push(es) attempted but not yet at origin (lag, not loss):\n`
      + lag.value.markers.map(marker => `- \`${marker.lastAttemptedCommit.slice(0, 10)}\` attempted ${marker.attemptTimestamp} by machine \`${marker.machineId}\` — proceed with context; don't force-push to resolve.`).join("\n") });
  const compact = input.envelope.compactionAdvisory;
  if (compact?.ok && compact.value.shouldSuggest && compact.value.nudge.shouldNudge) {
    const { historyCommitCount, threshold, nudge } = compact.value;
    steps.push({ type: "render", surface: "notes-compaction",
      text: `**Notes compaction:** user-notes history has ${historyCommitCount} commit(s) (threshold ${threshold}); run \`arc user compact\` when ready.`,
      ...(nudge.markerPath === null ? {} : { marker: { path: nudge.markerPath, value: nudge.today } }) });
  }
  return steps;
}
