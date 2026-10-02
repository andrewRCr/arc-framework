/**
 * The `reopen` verb — withdraw an `Integrating` WU back to `Active`.
 *
 * `reopen` is the inverse of `publish`: it pulls a WU out of
 * review for more work. A `set-phase`-only move — `Integrating → Active`, no
 * location move and no branch rotation (the working branch already carries its
 * `<type>/` prefix from `activate`) — that fires the `withdraw-pr` side-effect to
 * close (or, per `inputs`, convert-to-draft) the open PR. The `pr-unmerged` guard
 * clears only a positively-unmerged PR: a merged PR is refused (backing out merged
 * work is a new origin-linked follow-up, never a same-unit reopen), and so is an
 * unverifiable merge state (`gh`/remote unavailable) — the safe default.
 *
 * The verb stays thin — it forwards the merge fact and the withdrawal mode as
 * `inputs` and dispatches through {@link executeTransition}; the guard, the
 * `set-phase` leg, the `withdraw-pr` handler, and the soft-field disposition
 * (clearing the now-stale integration `Next Action` pointer) are the table's. The
 * merge fact is resolved against `gh` by the caller (never fabricated here); the
 * withdrawal mode defaults to `close`.
 *
 * @module
 */

import { join } from "node:path";

import {
  executeTransition,
  resumeTransitionFinalization,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import type { PrWithdrawMode } from "../side-effects/withdraw-pr.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";
import { parseMetaRecord } from "../../active/meta-reader.js";
import { resolveTaskListPath } from "../../../commands/active/status.js";
import { resolveTaskListCursor } from "../../task-list/cursor.js";

/** The inputs a `reopen` supplies. */
export interface ReopenParams {
  /** Target WU name (the CLI defaults this to the current Integrating WU). */
  name: string;
  /** Whether the WU's PR has merged — the `pr-unmerged` guard input (caller resolves via `gh`). */
  prMerged?: boolean;
  /** How to withdraw the open PR — `close` (default) or `draft`. */
  withdrawMode?: PrWithdrawMode;
  /** Exact reopened task orientation; absent resumes Candidate preparation. */
  nextTask?: string;
}

/** The outcome of a `reopen` attempt — a rejection, or the re-activated meta path. */
export type ReopenResult =
  | { status: "rejected"; reason: string }
  | { status: "reopened"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run `reopen`: flip the WU's phase `Integrating → Active` and withdraw its open
 * PR. Rejects when the PR has already merged or its merge state can't be confirmed
 * (the `pr-unmerged` guard) or the source is not an `Integrating` WU (the table's
 * illegal-edge lookup).
 *
 * @param ctx - The executor seams (the `withdraw-pr` handler is registered by the caller).
 * @param params - The target WU, the merge fact, and the withdrawal mode.
 * @returns A rejection (merged PR, illegal source) or the re-activated meta path.
 */
export async function runReopen(
  ctx: ExecuteTransitionContext,
  params: ReopenParams,
): Promise<ReopenResult> {
  const { name, prMerged, withdrawMode, nextTask } = params;
  const executionTask = nextTask?.trim();
  if (nextTask !== undefined && executionTask === "") {
    return { status: "rejected", reason: "reopened task orientation must not be empty." };
  }
  const parsedName = SlugSchema.safeParse(name);
  if (!parsedName.success) return { status: "rejected", reason: `Invalid work-unit name: ${name}` };
  const taskAuthority = await resolveReopenTaskAuthority(ctx, parsedName.data, executionTask);
  if (taskAuthority !== null) return { status: "rejected", reason: taskAuthority };

  const inputs = {
    prMerged,
    prWithdrawMode: withdrawMode ?? "close",
    currentWorkflowOverride: executionTask === undefined ? undefined : "process-task-loop",
    softFields: { nextTask: executionTask ?? "[none]" },
  };

  const outcome = await executeTransition(ctx, {
    verb: "reopen",
    slug: name,
    inputs,
  });

  let resolvedOutcome = outcome;
  if (outcome.status === "rejected" && outcome.stage === "lookup") {
    resolvedOutcome = await resumeTransitionFinalization(ctx, {
      verb: "reopen",
      slug: name,
      inputs,
      replayNonRoadmapSideEffects: true,
    }) ?? outcome;
  }
  if (resolvedOutcome.status !== "ok") return { status: "rejected", reason: resolvedOutcome.message };
  return {
    status: "reopened",
    outcome: resolvedOutcome,
    metaPath: resolveArcPath({
      kind: "work-unit-artifact",
      placement: { kind: "active", scope: { kind: "project" } },
      slug: parsedName.data,
      artifact: "meta",
    }),
  };
}

async function resolveReopenTaskAuthority(
  ctx: ExecuteTransitionContext,
  name: string,
  requestedTask: string | undefined,
): Promise<string | null> {
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(name),
    artifact: "meta",
  });
  let meta;
  try {
    meta = parseMetaRecord(await ctx.indexFs.readFile(join(ctx.cwd, metaPath)));
  } catch {
    return `Cannot reopen \`${name}\`: its active metadata is unavailable.`;
  }
  const taskListPath = resolveTaskListPath(metaPath, meta.taskList);
  if (taskListPath === null) {
    return `Cannot reopen \`${name}\`: its canonical task-list binding is unavailable.`;
  }
  let taskList: string;
  try {
    taskList = await ctx.indexFs.readFile(join(ctx.cwd, taskListPath));
  } catch {
    return `Cannot reopen \`${name}\`: its canonical task list is unreadable.`;
  }
  const cursor = resolveTaskListCursor(taskList);
  if (cursor.status === "malformed") {
    return `Cannot reopen \`${name}\`: its canonical task list is malformed at line ${cursor.error.line}: `
      + cursor.error.message;
  }
  if (requestedTask === undefined) {
    if (cursor.status === "no-open-task") return null;
    const expected = formatCursorTask(cursor.cursor.leaf.id, cursor.cursor.leaf.title);
    return `Cannot reopen \`${name}\` without \`--task\`: executable ${expected} remains open. `
      + `Reopen with that exact task or close it first.`;
  }
  if (cursor.status === "no-open-task") {
    return `Cannot reopen \`${name}\` with \`--task\`: the canonical task list is closed and has no open task.`;
  }
  const expected = formatCursorTask(cursor.cursor.leaf.id, cursor.cursor.leaf.title);
  if (requestedTask !== expected) {
    return `Cannot reopen \`${name}\` at \`${requestedTask}\`: the canonical executable cursor is \`${expected}\`.`;
  }
  return null;
}

function formatCursorTask(id: string, title: string): string {
  return `Task ${id} — ${title}`;
}
