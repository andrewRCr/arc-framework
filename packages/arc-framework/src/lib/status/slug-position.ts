/** Project a work unit's checkout-derived lifecycle position and the scope window routing reads from it. */

import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type { LifecycleState } from "../work-unit/lifecycle-resolver.js";

/** Whether a work unit can still take a routed concern: freely, only by a narrow test, or not at all. */
export type ScopeWindow = "open" | "gated" | "closed";

type ResolvedContext = NonNullable<DerivedCheckoutRow["context"]>;

/** A checkout row whose subject meta resolved. */
export type ResolvedCheckoutRow = DerivedCheckoutRow & { readonly context: ResolvedContext };

/** Where one work unit stands, as its registered checkout derives it. */
export interface DerivedSlugPosition {
  readonly checkoutPath: string;
  readonly sessionType: ResolvedContext["sessionType"];
  readonly stage: ResolvedContext["stage"];
  readonly workUnitStage: NonNullable<ResolvedContext["workUnitStage"]> | null;
  readonly taskListPath: string | null;
  readonly taskCursor: NonNullable<ResolvedContext["taskCursor"]>["status"] | null;
  readonly openTask: { readonly id: string; readonly title: string } | null;
  readonly verifying: boolean;
}

/** The scope window and what it was derived from. */
export interface ScopeWindowFact {
  readonly window: ScopeWindow | null;
  readonly basis: "checkout" | "lifecycle";
  readonly reason: string;
}

/** The terminal work-unit verification task every task list ends with. */
const TERMINAL_VERIFICATION_TITLE = "complete verification";

/**
 * Select the one registered checkout that holds a work unit with a resolved context.
 * @param roster - Rows from one derived locus read.
 * @param slug - Work-unit slug.
 * @returns The row, or null when no single resolved row holds the work unit.
 */
export function selectWorkUnitRow(roster: readonly DerivedCheckoutRow[], slug: string): ResolvedCheckoutRow | null {
  const matches = roster.filter((row): row is ResolvedCheckoutRow =>
    row.kind === "work-unit" && row.subject.kind === "work-unit" && row.subject.key === slug && row.context !== null);
  return matches.length === 1 ? matches[0] ?? null : null;
}

/**
 * Project a resolved checkout row into the work unit's position.
 * @param row - The work unit's registered checkout row.
 * @returns The position, including whether its open task is the terminal verification task.
 */
export function projectDerivedSlugPosition(row: ResolvedCheckoutRow): DerivedSlugPosition {
  const { context } = row;
  const cursor = context.taskCursor;
  const openTask = cursor?.status === "found"
    ? { id: cursor.cursor.section.id, title: cursor.cursor.section.title }
    : null;
  return {
    checkoutPath: row.checkout.path,
    sessionType: context.sessionType,
    stage: context.stage,
    workUnitStage: context.workUnitStage ?? null,
    taskListPath: context.taskListPath,
    taskCursor: cursor?.status ?? null,
    openTask,
    verifying: openTask !== null && isTerminalVerificationTask(openTask),
  };
}

/**
 * Read a work unit's position from the checkout roster, when it holds a checkout here.
 * @param options - Slug, its worktree path if one is registered, the reading identity, and the roster reader.
 * @returns The position or null, and a warning when the roster read fails.
 */
export async function readDerivedSlugPosition(options: {
  readonly slug: string;
  readonly worktreePath: string | undefined;
  readonly identity: string | null;
  readonly readRoster: (identity: string) => Promise<readonly DerivedCheckoutRow[]>;
}): Promise<{ position: DerivedSlugPosition | null; warnings: string[] }> {
  if (options.worktreePath === undefined || options.identity === null) return { position: null, warnings: [] };
  try {
    const row = selectWorkUnitRow(await options.readRoster(options.identity), options.slug);
    return { position: row === null ? null : projectDerivedSlugPosition(row), warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { position: null, warnings: [`Derived position for ${options.slug} is unavailable: ${message}`] };
  }
}

/**
 * Derive the scope window from a checkout position when one is available, otherwise from lifecycle state alone.
 * @param state - The work unit's lifecycle state.
 * @param position - Its checkout-derived position, or null without a single resolved checkout.
 * @returns The window, or a null window with the reason it cannot be read.
 */
export function projectScopeWindow(state: LifecycleState, position: DerivedSlugPosition | null): ScopeWindowFact {
  const fromCheckout = position === null ? null : checkoutWindow(position);
  return fromCheckout ?? lifecycleWindow(state);
}

/** One terminal task of the final phase, titled by the task-list format. */
function isTerminalVerificationTask(task: { readonly id: string; readonly title: string }): boolean {
  return /^\d+\.1$/u.test(task.id) && task.title.trim().toLowerCase() === TERMINAL_VERIFICATION_TITLE;
}

/** Window from a checkout position; null when the position has no session type to read. */
function checkoutWindow(position: DerivedSlugPosition): ScopeWindowFact | null {
  const fact = (window: ScopeWindow | null, reason: string): ScopeWindowFact => ({ window, basis: "checkout", reason });
  switch (position.sessionType) {
    case "planning": {
      const tasks = position.taskListPath === null ? "" : ", task list recorded";
      return fact("open", `not yet activated (planning${position.stage === null ? "" : `: ${position.stage}`}${tasks})`);
    }
    case "execution":
      if (position.workUnitStage === "verification-closeout") return fact("closed", "in verification closeout");
      if (position.openTask === null) {
        return fact(null, `task cursor is ${position.taskCursor ?? "absent"}, so whether verification began cannot be read`);
      }
      return position.verifying
        ? fact("closed", `in its verification phase (task ${position.openTask.id})`)
        : fact("gated", `activated, before its verification phase (task ${position.openTask.id})`);
    case "prepublication":
      return fact("closed", "in prepublication");
    case "integration":
      return fact("closed", "in integration");
    case null:
      return null;
  }
}

/** Window from lifecycle state alone, when no checkout position can be read. */
function lifecycleWindow(state: LifecycleState): ScopeWindowFact {
  const fact = (window: ScopeWindow | null, reason: string): ScopeWindowFact => ({ window, basis: "lifecycle", reason });
  switch (state) {
    case "provisional":
    case "planned":
      return fact("open", "in the backlog");
    case "planning":
      return fact("open", "not yet activated (planning)");
    case "active":
      return fact(null, "activated; without its checkout here, whether verification began cannot be read");
    case "integrating":
      return fact("closed", "integrating");
    case "shipped":
      return fact("closed", "shipped");
    case "parked":
      return fact(null, "parked; a routed concern waits for its resumption");
    case "nonexistent":
      return fact(null, "no such work unit");
  }
}
