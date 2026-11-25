/** Locate recovery branches without treating missing roster paths as free checkouts. */

import { isGitProcessError } from "../../lib/git/process-error.js";
import { resolveWorktreePathsByBranchResult } from "../../lib/git/worktree-roster.js";
import type { CascadeCandidate, SessionInitRecoveryValue } from "../../lib/session-init/branch-gone-cascade.js";
import type { AgendaReadPort } from "./compile-input.js";
import type { AgendaStep } from "./schema.js";

type ExecutableAction = Extract<AgendaStep, { type: "exec" }>["actions"][number];

/** A recovery branch's checkout disposition, with commands only for proven free branches. */
export type RecoveryDestination = { branch: string } & (
  | { kind: "free"; actions: ExecutableAction[] }
  | { kind: "elsewhere"; checkoutPath: string }
  | { kind: "unavailable" }
  | { kind: "manual" }
);

/** Locate the exact switch destinations that the recovery evidence permits. */
export async function resolveRecoveryDestinations(
  recovery: SessionInitRecoveryValue | null, read: AgendaReadPort,
): Promise<RecoveryDestination[]> {
  const candidates: CascadeCandidate[] = recovery?.kind === "resolved" ? [recovery.candidate]
    : recovery?.kind === "surface" ? recovery.candidates
      : recovery?.kind === "main-fallback" ? [{ branch: recovery.baseBranch, proposedAction: "switch" as const }] : [];
  const switches = candidates.filter(candidate => candidate.proposedAction === "switch");
  const worktrees = switches.some(candidate => candidate.worktreePath === undefined)
    ? await resolveWorktreePathsByBranchResult(async (_command, args) => ({ stdout: await read.git(args) })) : null;
  return Promise.all(switches.map(async (candidate): Promise<RecoveryDestination> => {
    const checkoutPath = candidate.worktreePath ?? worktrees?.paths.get(candidate.branch);
    if (checkoutPath !== undefined) return { branch: candidate.branch, kind: "elsewhere", checkoutPath };
    if (candidate.branch === "-") return { branch: candidate.branch, kind: "manual" };
    if (worktrees?.ok !== true) return { branch: candidate.branch, kind: "unavailable" };
    return compileFreeDestination(candidate.branch, read);
  }));
}

async function compileFreeDestination(branch: string, read: AgendaReadPort): Promise<RecoveryDestination> {
  let hasLocalRef = true;
  try { await read.git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]); }
  catch (error) {
    if (!isGitProcessError(error) || error.kind !== "nonzero-exit" || error.exitCode !== 1) {
      return { branch, kind: "unavailable" };
    }
    hasLocalRef = false;
  }
  const actions: ExecutableAction[] = [];
  if (!hasLocalRef) actions.push({ argv: ["git", "fetch", "origin", "--", branch], text: `git fetch origin -- ${branch}` });
  actions.push({ argv: ["git", "switch", "--", branch], text: `git switch -- ${branch}` });
  return { branch, kind: "free", actions };
}
