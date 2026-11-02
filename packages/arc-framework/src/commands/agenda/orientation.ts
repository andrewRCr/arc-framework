/** Ordered orientation surfaces and compiler-known automatic-proceed constraints. */

import { compileAdvisoryOrientation } from "./advisories.js";
import { compileCheckoutOrientation } from "./checkout.js";
import { compileCleanupOrientation } from "./cleanup.js";
import { compileNotesOrientation } from "./notes.js";
import { quoteShellArgument } from "../../lib/release/commit-message-retry.js";
import type { SessionAction } from "../../lib/session-init/actions.js";
import { pullResultNotices } from "../../lib/store/operational-sync.js";
import { parseLifecycleMetaContent } from "../../lib/store/lifecycle-meta-content.js";
import type { AgendaCompileInput, SyncChannels } from "./compile-input.js";
import { renderDegradedSlot, renderLocus } from "./render.js";
import { renderAnswered } from "./progress.js";
import { compileSyncState, type AgendaSyncState } from "./sync-state.js";
import type { AgendaStep } from "./schema.js";

/** One surface may contain both its narration and standing remedy offers. */
export interface OrientationSurface { id: string; steps: AgendaStep[] }

/** Stable surface order shared by every orientation-producing row. */
export const ORIENTATION_SURFACE_ORDER = [
  "header", "delivery-position", "locus", "degraded-slot", "worktree-diverged", "superseded", "branch-gone",
  "local-ahead", "worktree-behind", "worktree-remote-unavailable", "base-drift", "stale-base", "current-wu-reconcile",
  "user-references", "hooks-path", "notes-lag", "notes-compaction", "notes-reconciling", "notes-conflict",
  "local-ahead-notes", "notes-behind", "notes-remote-unavailable", "notes-drift", "notes-load-pending", "store-sync",
  "no-upstream", "husk", "detached-head", "no-remote", "dirty", "retirements", "rename-moves", "stale-worktrees",
  "missing-folders", "branch-orphans", "cleanup-residues", "retired-subdirs", "reminder", "in-flight-work-units",
  "materializable-work-units", "materializable-errands", "housekeep", "concurrent-workload",
] as const;
const ORDER = new Map<string, number>(ORIENTATION_SURFACE_ORDER.map((id, index) => [id, index]));
const RESUME_SLOTS = ["worktree", "dirty", "baseDistance", "baseBranchSync", "user", "config", "domainRules", "hooksPath",
  "currentWuReconcile", "userReferenceReconcile", "deliveryPosition", "currentHusk", "partialPushMarker", "compactionAdvisory",
  "retiredSubdirs", "sweep", "orphanBranchSweep", "errandSweep", "errandState", "workUnitState"] as const;

/** Order whole surfaces while preserving their internal narration/remedy sequence. */
export function orderOrientationSurfaces(surfaces: OrientationSurface[]): AgendaStep[] {
  return [...surfaces].sort((left, right) => (ORDER.get(left.id) ?? ORDER.size) - (ORDER.get(right.id) ?? ORDER.size))
    .flatMap(surface => surface.steps);
}

/** Compile the shared orientation surfaces without selecting synchronization or a terminal gate. */
export function compileSessionOrientation(input: AgendaCompileInput, findings: Extract<AgendaStep, { type: "render" | "note" }>[], sync: AgendaSyncState = compileSyncState(input), consumed: { seed?: boolean; next?: boolean; start?: boolean } = { next: true }): OrientationSurface[] {
  return [...compileCoreOrientation(input, findings, sync, consumed), ...compileCheckoutOrientation(input, sync),
    ...compileNotesOrientation(input, sync), ...compileCleanupOrientation(input), ...compileAdvisoryOrientation(input)];
}

/** Frame an explicit entry on checkout-local facts without work-unit or discovery surfaces. */
export function compileCheckoutSessionOrientation(input: AgendaCompileInput, channels: SyncChannels = "all",
  consumed: { seed?: boolean; next?: boolean; start?: boolean } = {}): OrientationSurface[] {
  const sync = compileSyncState(input, channels);
  const steps: AgendaStep[] = [renderHeader(input), ...publishedSurfaces(input)
    .filter(step => (step.type === "render" || step.type === "note") && (step.surface === "hooks-path" || step.surface === "store-sync")),
  ...sync.unsettled, ...compileUnconsumedSignals(input, consumed)];
  const locus = renderLocus(input.envelope);
  if (locus !== null) steps.push(locus);
  const answered = renderAnswered(input);
  if (answered !== null) steps.push(answered);
  for (const name of ["worktree", "dirty", "baseDistance", "baseBranchSync", "user", "hooksPath",
    "partialPushMarker", "compactionAdvisory", "retiredSubdirs"] as const) {
    const degraded = renderDegradedSlot(name, input.envelope[name]);
    if (degraded !== null) steps.push(degraded);
  }
  return [...steps.flatMap(step => step.type === "render" || step.type === "note" ? [{ id: step.surface, steps: [step] }] : []),
    ...compileCheckoutOrientation(input, sync, channels), ...compileNotesOrientation(input, sync)];
}

/** Collect core resume surfaces and findings for the shared ordered assembly. */
export function compileCoreOrientation(input: AgendaCompileInput, findings: Extract<AgendaStep, { type: "render" | "note" }>[], sync: AgendaSyncState = compileSyncState(input), consumed: { seed?: boolean; next?: boolean; start?: boolean } = { next: true }): OrientationSurface[] {
  const steps: AgendaStep[] = [renderHeader(input), ...publishedSurfaces(input), ...findings];
  const locus = renderLocus(input.envelope);
  if (locus !== null) steps.push(locus);
  for (const name of RESUME_SLOTS) {
    const degraded = renderDegradedSlot(name, input.envelope[name]);
    if (degraded !== null) steps.push(degraded);
  }
  const domain = input.envelope.domainRules;
  if (domain.ok) for (const text of domain.value.warnings) steps.push({ type: "note", surface: "domain-rules", text });
  const answered = renderAnswered(input);
  if (answered !== null) steps.push(answered);
  steps.push(...sync.unsettled, ...compileUnconsumedSignals(input, consumed));
  return steps.flatMap(step => step.type === "render" || step.type === "note" ? [{ id: step.surface, steps: [step] }] : []);
}

function renderHeader(input: AgendaCompileInput): AgendaStep {
  const { worktree, dirty } = input.envelope;
  const branch = worktree.ok ? ` · \`${worktree.value.branch ?? "detached HEAD"}\`` : "";
  const linked = worktree.ok && worktree.value.identity.kind === "linked" ? ` · \`worktree: ${worktree.value.identity.path}\`` : "";
  const state = dirty.ok ? ` · ${dirty.value.state === "dirty" ? "uncommitted changes" : "clean"}` : "";
  return { type: "render", surface: "header", text: `**ARC session initialized**${branch}${linked}${state}` };
}

function publishedSurfaces(input: AgendaCompileInput): AgendaStep[] {
  const steps: AgendaStep[] = [];
  const delivery = input.envelope.deliveryPosition;
  if (delivery?.ok && delivery.value !== null) steps.push({ type: "render", surface: "delivery-position", text: delivery.value.line });
  for (const [surface, slot] of [["current-wu-reconcile", input.envelope.currentWuReconcile],
    ["user-references", input.envelope.userReferenceReconcile]] as const) {
    if (slot?.ok && slot.value.recommendedAction === "surface") steps.push({ type: "render", surface,
      text: guidanceText(slot.value.recommendedPromptText, slot.value.actions, slot.value.recommendedCommand) });
  }
  const hooks = input.envelope.hooksPath;
  if (hooks.ok && hooks.value.recommendedAction === "surface") steps.push({ type: "render", surface: "hooks-path", text: hooks.value.recommendedPromptText });
  const store = renderStoreSync(input);
  if (store !== null) steps.push(store);
  return steps;
}

function guidanceText(prompt: string, actions: readonly SessionAction[] | undefined, command: readonly string[] | null): string {
  const remedies = new Set(actions?.map(action => action.text));
  const published = command !== null && actions?.some(action => action.argv?.length === command.length
    && action.argv.every((part, index) => part === command[index]));
  if (command !== null && !published) remedies.add(command.map(quoteShellArgument).join(" "));
  return [prompt, ...[...remedies].filter(text => text !== prompt)].join("\n");
}

/** Name invocation intent that the selected row does not consume. */
export function compileUnconsumedSignals(input: Pick<AgendaCompileInput, "signals">, consumed: { seed?: boolean; next?: boolean; start?: boolean } = {}): Extract<AgendaStep, { type: "note" }>[] {
  const steps: Extract<AgendaStep, { type: "note" }>[] = [];
  const add = (text: string): void => { steps.push({ type: "note", surface: "unconsumed-signal", text }); };
  if (input.signals.seed !== undefined && !consumed.seed) add(`Entry seed '${input.signals.seed}' was not consumed; starting fresh work from it means spawning or checking out a new worktree and entering there.`);
  if (input.signals.next && !consumed.next) add("--next auto-proceeds only a work-unit resume.");
  if (input.signals.start !== undefined && !consumed.start) add(`Run arc-session --start '${input.signals.start}' on its own to vet that launch.`);
  return steps;
}

/** Permit only a requested, bare-clean resume with no compiler-known blocker. */
export function canAutoProceed(input: AgendaCompileInput, steps: AgendaStep[], metaContent: string | null): boolean {
  if (!input.signals.next || !input.envelope.dirty.ok || input.envelope.dirty.value.state !== "clean" || metaContent === null) return false;
  const meta = parseLifecycleMetaContent(metaContent);
  if (!meta.success || meta.data.blockers !== null) return false;
  return !steps.some(step => step.type === "offer"
    || ((step.type === "render" || step.type === "note") && step.surface !== "header" && step.surface !== "answered"));
}

function renderStoreSync(input: AgendaCompileInput): AgendaStep | null {
  const slot = input.envelope.user;
  if (!slot.ok || slot.value === null || !("status" in slot.value)) return null;
  const value = slot.value;
  const quiet = (value.status === "noop" || value.status === "no-remote")
    && pullResultNotices(value).length === 0 && (value.advisories?.length ?? 0) === 0;
  if (quiet) return null;
  const text = [value.summary, ...(value.actions?.map(action => action.text) ?? [])].join("\n");
  return { type: "note", surface: "store-sync", text };
}
