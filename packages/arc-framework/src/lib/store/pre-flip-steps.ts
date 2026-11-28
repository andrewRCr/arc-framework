/** The concrete step that does a verb's job while state stays in the checkout, one source for every in-repo refusal. */
import { basename } from "node:path";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import type { z } from "zod";
import type { ReviewAdversarialActivitySchema } from "./kinds/review/adversarial-pass/schema.js";

const personalInbox = (): string =>
  basename(resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity: SlugSchema.parse("person") } }));
const projectInbox = (): string => resolveArcPath({ kind: "inbox", scope: { kind: "project" } });
const sessionNotes = (): string => basename(resolveArcPath({ kind: "user-document", identity: SlugSchema.parse("person"),
  document: { kind: "session-notes", workUnit: SlugSchema.parse("work-unit") } }));
const PASS_ENTRY = "each finding with its account and action, the conditional decision, the response-performance check,"
  + " and the consumption fact";

/** Name the hand mark that closes or defers a task, and the commit that carries it.
 * @param operation - The task verb refused.
 * @returns The pre-flip step.
 */
export function taskMarkStep(operation: "close" | "defer"): string {
  return `Mark the task ${operation === "close" ? "[x]" : "[~]"} by hand in the task list and commit the mark, staged with`
    + " the task's own commit when that commit is still to come.";
}

/** Name the hand mark a closing commit stages, and the commit made without the close.
 * @returns The pre-flip step.
 */
export function releaseCloseStep(): string {
  return "Mark the task [x] by hand in the task list, stage the mark with this commit, and run arc release commit again"
    + " without --close.";
}

/** Name the commit that keeps tracked state beside the save that keeps personal state.
 * @returns The pre-flip step.
 */
export function projectionSaveStep(): string {
  return "Before the flip, state is the checkout's own files: commit edited tracked ARC files with git commit, and save"
    + " personal files with arc user save.";
}

/** Name the hand-written handoff: the meta's progress fields and their commit, then the session notes.
 * @returns The pre-flip step.
 */
export function handoffWriteStep(): string {
  return "Write the handoff by hand: update the active meta's Last Completed, Next Task, and Next Action and commit it,"
    + ` then write ${sessionNotes()} in the work unit's personal workspace, with that commit as its Commit at Handoff and`
    + " the session's context, and save it with arc user save.";
}

/** Name the file or command that lists one inbox form.
 * @param list - `personal`, `project`, or a work unit's slug.
 * @param target - The work unit a personal listing filters to.
 * @returns The pre-flip step.
 */
export function inboxListStep(list: string, target?: string): string {
  if (list === "personal" && target === undefined) return `Read the personal inbox, ${personalInbox()} in your personal workspace.`;
  if (list === "personal") return `Run arc user inbox-list --target ${target}, which lists the personal captures whose WU_Target`
    + " names it.";
  if (list === "project") return `Read the project inbox, ${projectInbox()}.`;
  return `Run arc user inbox-list --target ${list} for the personal captures whose WU_Target names it; a backlog or Planning`
    + " work unit holds its routed entries in its draft's Inbound Buffer — Pending Integration section.";
}

/** Name where each routed entry is written by hand.
 * @returns The pre-flip step.
 */
export function routeStep(): string {
  return `Route by hand: a capture goes in ${personalInbox()} in your personal workspace with a WU_Target line naming its`
    + " work unit and a _Shapes:_ line; an entry for a backlog or Planning work unit goes in its draft's Inbound Buffer —"
    + ` Pending Integration section; a project capture goes in ${projectInbox()}.`;
}

/** Name where the Errand queue is read, or the command that writes it.
 * @param operation - Read the queue or set it.
 * @returns The pre-flip step.
 */
export function errandQueueStep(operation: "read" | "set"): string {
  return operation === "set" ? "Mark and order the queue with arc user inbox-mark-execute-bound."
    : `The queue is the execute-bound entries in the Errand section of ${personalInbox()}, in file order; arc errand next`
      + " offers its head.";
}

/** Name the archive sweep that closes a cohort's tracked file.
 * @returns The pre-flip step.
 */
export function cohortCloseStep(): string {
  return "A cohort closes when arc archive archives its final member, sweeping its tracked cohort-<name>.md into the"
    + " closeout sidecar; author the closeout there and commit it with the archive.";
}

/** Name the deletion that removes an empty cohort's tracked file.
 * @returns The pre-flip step.
 */
export function cohortRemoveStep(): string {
  return "Delete the empty cohort's tracked cohort-<name>.md and commit the deletion.";
}

const LEAVE_CUT = "Leave the rejected cut as decompose left it, staged on the base or on its ARC-owned candidate branch,"
  + " and ask the Owner how to clean it up";

/** Name the cleanup direction a rejected cut waits on, and the preflight that plans its revision.
 * @param origin - The decomposed work unit.
 * @returns The pre-flip step.
 */
export function decomposeRevisionStep(origin: string): string {
  return `${LEAVE_CUT}; after the cleanup, plan the revised cut with arc decompose ${origin} --preflight.`;
}

/** Name the cleanup direction a discarded cut waits on.
 * @returns The pre-flip step.
 */
export function decomposeDiscardStep(): string {
  return `${LEAVE_CUT}.`;
}

/** Name the record an approved adversarial pass is kept in by hand, and the entry it holds.
 * @param activity - The pass's activity.
 * @param workUnit - The work unit reviewed.
 * @returns The pre-flip step.
 */
export function adversarialRecordStep(activity: z.infer<typeof ReviewAdversarialActivitySchema>, workUnit: string): string {
  return activity === "verification" || activity === "criteria"
    ? `Keep this approved pass by hand with work unit \`${workUnit}\`'s criteria report, in its verification task's`
      + ` verification record: ${PASS_ENTRY}.`
    : `Append this approved pass by hand to ADVERSARIAL-PASSES.md in work unit \`${workUnit}\`'s personal workspace,`
      + ` beside SESSION-NOTES: ${PASS_ENTRY}.`;
}

/** Name the parked-work resume that serves before the flip.
 * @param name - The work unit.
 * @returns The pre-flip step.
 */
export function resumeParkedStep(name: string): string {
  return `Resume the parked work unit with arc resume ${name}, which restores its preserved branch.`;
}

/** Name the meta edit and commit that hand a work unit over.
 * @returns The pre-flip step.
 */
export function handoverStep(): string {
  return "Edit Owner in the work unit's meta and commit the edit.";
}

/** Name the title removal that serves an inbox entry's removal by ID.
 * @returns The pre-flip step.
 */
export function inboxRemoveByIdStep(): string {
  return "Remove the entry by its title with arc user inbox-remove --inbox-title-file <file>.";
}
