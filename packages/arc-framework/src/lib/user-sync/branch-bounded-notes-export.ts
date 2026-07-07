/**
 * Branch-bounded user-notes export for paired worktree + notes pushes.
 *
 * A local user-notes ref is shared by sibling worktrees. Paired push has just
 * landed one branch, so the notes leg must export only notes whose annotated
 * commits are reachable from that branch. The exporter stages a temporary notes
 * ref from origin's current notes state, overlays the reachable local notes,
 * and pushes the staged ref to origin.
 *
 * @module
 */

import { readRefTip, uniqueRefToken } from "../git/ref-tree.js";
import type { GitExec } from "../git/exec.js";
import { isRemoteUnavailableError } from "./notes-merge.js";

const USER_NOTES_REF_PREFIX = "refs/notes/arc/user";
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** Planned temporary notes ref whose tip is safe to push to origin. */
export interface BranchBoundedNotesExportTarget {
  /**
   * Local notes ref to push. Usually a temporary branch-bounded ref; when the
   * caller's local notes ref is already branch-safe, this is the destination ref
   * itself so the push preserves the existing notes-ref ancestry.
   */
  ref: string;
  /** Real origin-bound notes ref this target updates. */
  destinationRef: string;
  /** Commit sha of the staged notes-ref target. */
  tip: string;
  /**
   * Local canonical notes-ref tip observed at plan time. After a successful
   * push the local ref is fast-forwarded to {@link tip} guarded by this value
   * (compare-and-swap), so a concurrent save that advanced the local ref
   * between plan and push is never clobbered.
   */
  priorLocalTip: string;
  /** Annotated commits copied from the local notes ref into the target. */
  annotatedCommits: string[];
  /** Local annotated commits deliberately omitted because the branch cannot reach them. */
  omittedCommits: string[];
}

/** Why planning could not produce an export target. */
export type BranchBoundedNotesExportSkipReason =
  | "no-local-notes"
  | "empty-export";

/** Result of deriving a branch-bounded notes target. */
export type PlanBranchBoundedNotesExportResult =
  | { kind: "planned"; target: BranchBoundedNotesExportTarget }
  | { kind: "skipped"; reason: BranchBoundedNotesExportSkipReason }
  | { kind: "refused"; message: string }
  | { kind: "failed"; error: Error };

/** Result of pushing a planned branch-bounded notes target. */
export type PushBranchBoundedNotesExportResult =
  | { kind: "pushed" }
  | { kind: "noop" }
  | { kind: "no-remote" }
  | { kind: "failed"; error: Error };

/** Inputs for {@link planBranchBoundedNotesExport}. */
export interface PlanBranchBoundedNotesExportInput {
  exec: GitExec;
  identity: string;
  /** Branch whose push has just succeeded. */
  branch: string;
}

/** Inputs for {@link pushBranchBoundedNotesExport}. */
export interface PushBranchBoundedNotesExportInput {
  exec: GitExec;
  identity: string;
  target: BranchBoundedNotesExportTarget;
}

/** Inputs for {@link cleanupBranchBoundedNotesExport}. */
export interface CleanupBranchBoundedNotesExportInput {
  exec: GitExec;
  target: BranchBoundedNotesExportTarget;
}

interface NoteEntry {
  blob: string;
  commit: string;
}

/**
 * Derive the origin-bound notes target for a paired push.
 *
 * The destination target is branch-bounded: only local notes whose annotated
 * commits are reachable from `branch` are copied. Existing remote notes are
 * preserved by staging from origin's current notes ref before overlaying local
 * reachable notes.
 *
 * @param input - Git executor, identity, and just-pushed branch.
 * @returns A planned temporary ref, or a structured skip/refusal/failure.
 */
export async function planBranchBoundedNotesExport(
  input: PlanBranchBoundedNotesExportInput,
): Promise<PlanBranchBoundedNotesExportResult> {
  const { exec, identity, branch } = input;
  const destinationRef = userNotesRef(identity);
  const tempRef = `${destinationRef}__branch_export_${uniqueRefToken()}`;

  const localTip = await readRefTip(exec, destinationRef);
  if (localTip === null) return { kind: "skipped", reason: "no-local-notes" };

  const localEntries = await listNotes(exec, destinationRef);
  if (localEntries.length === 0) return { kind: "skipped", reason: "no-local-notes" };

  try {
    const remoteTip = await readRemoteRefTip(exec, destinationRef);
    const localIncludesRemote = remoteTip === null || await isAncestor(exec, remoteTip, localTip);
    const annotatedCommits: string[] = [];
    const omittedCommits: string[] = [];

    for (const entry of localEntries) {
      if (await isAncestor(exec, entry.commit, branch)) {
        annotatedCommits.push(entry.commit);
      } else {
        omittedCommits.push(entry.commit);
      }
    }

    if (annotatedCommits.length === 0) {
      await deleteRef(exec, tempRef);
      return { kind: "skipped", reason: "empty-export" };
    }

    if (omittedCommits.length === 0 && localIncludesRemote) {
      return {
        kind: "planned",
        target: {
          ref: destinationRef,
          destinationRef,
          tip: localTip,
          priorLocalTip: localTip,
          annotatedCommits: annotatedCommits.sort(),
          omittedCommits: [],
        },
      };
    }

    await deleteRef(exec, tempRef);
    if (remoteTip !== null) {
      await exec("git", ["fetch", "--refmap=", "origin", `+${destinationRef}:${tempRef}`]);
    }

    const remoteEntries = new Map(
      (remoteTip === null ? [] : await listNotes(exec, tempRef)).map((entry) => [entry.commit, entry.blob]),
    );

    for (const entry of localEntries) {
      if (!(await isAncestor(exec, entry.commit, branch))) continue;
      const remoteBlob = remoteEntries.get(entry.commit);
      if (remoteBlob !== undefined && remoteBlob !== entry.blob && !localIncludesRemote) {
        await deleteRef(exec, tempRef);
        return {
          kind: "refused",
          message:
            `Cannot branch-bound user notes export: origin already has a different note for `
            + `${entry.commit.slice(0, 8)} and the local notes ref does not contain origin's notes tip.`,
        };
      }
      await exec("git", ["notes", `--ref=${tempRef}`, "add", "-f", "-C", entry.blob, entry.commit]);
    }

    const tip = await readRefTip(exec, tempRef);
    if (tip === null) {
      return { kind: "failed", error: new Error("Branch-bounded notes export did not create a target ref.") };
    }

    return {
      kind: "planned",
      target: {
        ref: tempRef,
        destinationRef,
        tip,
        priorLocalTip: localTip,
        annotatedCommits: annotatedCommits.sort(),
        omittedCommits: omittedCommits.sort(),
      },
    };
  } catch (err) {
    await deleteRef(exec, tempRef);
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Push a planned branch-bounded notes target to origin.
 *
 * @param input - Git executor, identity, and planned target.
 * @returns Push result in the same broad taxonomy as notes push recovery.
 */
export async function pushBranchBoundedNotesExport(
  input: PushBranchBoundedNotesExportInput,
): Promise<PushBranchBoundedNotesExportResult> {
  const { exec, target } = input;
  try {
    const remoteTip = await readRemoteRefTip(exec, target.destinationRef);
    if (remoteTip === target.tip) {
      await adoptPushedTipIntoLocalRef(exec, target);
      return { kind: "noop" };
    }
    await exec("git", ["push", "origin", `${target.ref}:${target.destinationRef}`]);
    await adoptPushedTipIntoLocalRef(exec, target);
    return { kind: "pushed" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
    return { kind: "failed", error };
  }
}

/**
 * After a successful push — or a no-op where origin already carries the pushed
 * tip — fast-forward the local canonical notes ref to that tip. The rewrite
 * path stages and pushes a fresh temporary ref but never advances the local
 * canonical ref, so without this the local ref stays permanently behind origin:
 * `arc user status` then reports a (benign) `diverged`, and every later push
 * re-rewrites the whole notes history onto origin — unbounded remote-history
 * growth.
 *
 * Two guards keep it safe:
 *
 * - **Branch-bounded subset** (`omittedCommits.length > 0`): the pushed tip is a
 *   branch-scoped subset that omits notes the current branch cannot reach, so
 *   adopting it would drop those notes. The local ref keeps its own lineage; a
 *   union reconcile for that case is out of scope here.
 * - **Concurrent local advance:** the update is a compare-and-swap against
 *   {@link BranchBoundedNotesExportTarget.priorLocalTip} (the local tip observed
 *   at plan time). A concurrent `arc user save` that moved the local ref between
 *   plan and push fails the swap, so its note is never clobbered — the ref
 *   reconciles on the next push instead.
 *
 * The fast-path target (`ref === destinationRef`) already pushes the canonical
 * ref itself, so there is nothing to adopt. Best-effort: a failed swap leaves
 * the local ref where it was (the pre-fix state), never a worse one, and never
 * changes the already-successful push outcome.
 */
async function adoptPushedTipIntoLocalRef(
  exec: GitExec,
  target: BranchBoundedNotesExportTarget,
): Promise<void> {
  if (target.ref === target.destinationRef) return;
  if (target.omittedCommits.length > 0) return;
  try {
    await exec("git", ["update-ref", target.destinationRef, target.tip, target.priorLocalTip]);
  } catch {
    // Best-effort compare-and-swap: a concurrent local advance (CAS mismatch) or
    // transient failure leaves the local ref where it was — the push already
    // succeeded, and the ref reconciles on the next push.
  }
}

/**
 * Best-effort cleanup of a planned temporary notes export ref.
 *
 * @param input - Git executor and planned target.
 */
export async function cleanupBranchBoundedNotesExport(
  input: CleanupBranchBoundedNotesExportInput,
): Promise<void> {
  if (input.target.ref === input.target.destinationRef) return;
  await deleteRef(input.exec, input.target.ref);
}

function userNotesRef(identity: string): string {
  return `${USER_NOTES_REF_PREFIX}/${identity}`;
}

async function listNotes(exec: GitExec, ref: string): Promise<NoteEntry[]> {
  try {
    const { stdout } = await exec("git", ["notes", `--ref=${ref}`, "list"]);
    return stdout
      .split("\n")
      .map(parseNoteListLine)
      .filter((entry): entry is NoteEntry => entry !== null);
  } catch {
    return [];
  }
}

function parseNoteListLine(line: string): NoteEntry | null {
  const [blob, commit] = line.trim().split(/\s+/u);
  if (
    blob === undefined
    || commit === undefined
    || !GIT_OBJECT_ID_PATTERN.test(blob)
    || !GIT_OBJECT_ID_PATTERN.test(commit)
  ) {
    return null;
  }
  return { blob, commit };
}

async function readRemoteRefTip(exec: GitExec, ref: string): Promise<string | null> {
  const { stdout } = await exec("git", ["ls-remote", "origin", ref]);
  const line = stdout
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  if (line === undefined) return null;
  const [sha] = line.split(/\s+/u);
  return sha && GIT_OBJECT_ID_PATTERN.test(sha) ? sha : null;
}

async function isAncestor(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

async function deleteRef(exec: GitExec, ref: string): Promise<void> {
  try {
    await exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Cleanup is best-effort.
  }
}
