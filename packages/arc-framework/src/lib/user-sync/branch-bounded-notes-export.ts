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
import type { GitExec, GitExecInput } from "../git/exec.js";
import {
  adoptCompactedNotesRef,
  readNotesCompactionManifest,
} from "./compaction.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  pairKey,
  type NotesCompactionManifest,
} from "./compaction-manifest.js";
import {
  classifyNoteSetRelation,
  resolveExcludedNotePairKeys,
  type NoteSetSnapshot,
} from "./note-set-relation.js";
import { isRemoteUnavailableError } from "./notes-merge.js";
import { listNoteTreeEntries } from "./notes-ref.js";

const USER_NOTES_REF_PREFIX = "refs/notes/arc/user";
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const BRANCH_BOUNDED_NOTES_JOIN_MESSAGE = "user notes branch-bounded export join";

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
   * Local canonical notes-ref tip observed at plan time. Any direct adoption
   * or two-parent join is compare-and-swapped against this value, so a save
   * landing between plan and push is never clobbered.
   */
  priorLocalTip: string;
  /** Annotated commits copied from the local notes ref into the target. */
  annotatedCommits: string[];
  /** Local annotated commits deliberately omitted because the branch cannot reach them. */
  omittedCommits: string[];
  /** Whether the staged tip carries every local `(blob, commit)` pair observed at plan time. */
  supersedesLocal: boolean;
  /** Whether the plan-time local notes tip contains the fetched remote tip in its ancestry. */
  localIncludesRemote: boolean;
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
  execInput?: GitExecInput;
  identity: string;
  /** Branch whose push has just succeeded. */
  branch: string;
}

/** Inputs for {@link pushBranchBoundedNotesExport}. */
export interface PushBranchBoundedNotesExportInput {
  exec: GitExec;
  execInput?: GitExecInput;
  identity: string;
  target: BranchBoundedNotesExportTarget;
}

/** Inputs for building a two-parent union of local and pushed notes trees. */
export interface BuildBranchBoundedNotesUnionCommitInput {
  exec: GitExec;
  execInput: GitExecInput;
  priorLocalTip: string;
  pushedTip: string;
}

/** A staged notes union commit and its deterministic tree. */
export interface BranchBoundedNotesUnionCommit {
  tip: string;
  tree: string;
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

interface NotesUnionState {
  local: NoteSetSnapshot;
  pushed: NoteSetSnapshot;
}

/**
 * Build a deterministic local-wins union commit over two notes trees.
 *
 * @param input - Git plumbing and the two notes-ref tips to join.
 * @returns The two-parent commit tip and deterministic union tree id.
 */
export async function buildBranchBoundedNotesUnionCommit(
  input: BuildBranchBoundedNotesUnionCommitInput,
): Promise<BranchBoundedNotesUnionCommit> {
  const state = await loadNotesUnionState(input.exec, input.priorLocalTip, input.pushedTip);
  const tree = await buildBranchBoundedNotesUnionTree(input, state);
  const tip = await commitBranchBoundedNotesUnionTree(input.exec, tree, input.priorLocalTip, input.pushedTip);
  return { tip, tree };
}

async function buildBranchBoundedNotesUnionTree(
  input: BuildBranchBoundedNotesUnionCommitInput,
  state: NotesUnionState,
): Promise<string> {
  const excluded = resolveExcludedNotePairKeys(state.local.manifest, state.pushed.manifest);
  const treeEntries = new Map<string, string>();
  for (const entry of state.pushed.entries) {
    if (!excluded.has(pairKey(entry))) treeEntries.set(entry.commit, entry.blob);
  }
  for (const entry of state.local.entries) {
    if (!excluded.has(pairKey(entry))) treeEntries.set(entry.commit, entry.blob);
  }

  const manifestSource = selectUnionManifest({
    localManifest: state.local.manifest,
    localTip: input.priorLocalTip,
    pushedManifest: state.pushed.manifest,
    pushedTip: input.pushedTip,
  });
  if (manifestSource !== null) {
    treeEntries.set(
      NOTES_COMPACTION_MANIFEST_PATH,
      await readTreeBlob(input.exec, manifestSource.tip, NOTES_COMPACTION_MANIFEST_PATH),
    );
  }

  const treeInput = [...treeEntries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, blob]) => `100644 blob ${blob}\t${path}`)
    .join("\n") + "\n";
  return (await input.execInput(["mktree"], treeInput)).trim();
}

async function commitBranchBoundedNotesUnionTree(
  exec: GitExec,
  tree: string,
  priorLocalTip: string,
  pushedTip: string,
): Promise<string> {
  const { stdout } = await exec("git", [
    "commit-tree",
    tree,
    "-p",
    priorLocalTip,
    "-p",
    pushedTip,
    "-m",
    BRANCH_BOUNDED_NOTES_JOIN_MESSAGE,
  ]);
  return stdout.trim();
}

async function loadNotesUnionState(
  exec: GitExec,
  priorLocalTip: string,
  pushedTip: string,
): Promise<NotesUnionState> {
  const [localEntries, pushedEntries, localManifest, pushedManifest] = await Promise.all([
    listNoteTreeEntries(exec, priorLocalTip),
    listNoteTreeEntries(exec, pushedTip),
    readNotesCompactionManifest(exec, priorLocalTip),
    readNotesCompactionManifest(exec, pushedTip),
  ]);
  return {
    local: { entries: localEntries, manifest: localManifest },
    pushed: { entries: pushedEntries, manifest: pushedManifest },
  };
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
  const { exec, execInput, identity, branch } = input;
  const destinationRef = userNotesRef(identity);
  const tempRef = `${destinationRef}__branch_export_${uniqueRefToken()}`;

  let localTip = await readRefTip(exec, destinationRef);
  if (localTip === null) return { kind: "skipped", reason: "no-local-notes" };

  let localEntries = await listNotes(exec, destinationRef);
  if (localEntries.length === 0) return { kind: "skipped", reason: "no-local-notes" };

  try {
    const remoteTip = await readRemoteRefTip(exec, destinationRef);
    let remoteFetched = false;
    if (remoteTip !== null) {
      await deleteRef(exec, tempRef);
      await exec("git", ["fetch", "--refmap=", "origin", `+${destinationRef}:${tempRef}`]);
      remoteFetched = true;
      const boundary = await adoptRemoteCompactionIfNewer({
        exec,
        execInput,
        fullRef: destinationRef,
        snapshotRef: tempRef,
      });
      if (boundary.kind === "conflict") {
        await deleteRef(exec, tempRef);
        return { kind: "refused", message: boundary.message };
      }
      if (boundary.kind === "failed") {
        await deleteRef(exec, tempRef);
        return { kind: "failed", error: boundary.error };
      }
      if (boundary.kind === "adopted") {
        localTip = await readRefTip(exec, destinationRef);
        if (localTip === null) {
          await deleteRef(exec, tempRef);
          return { kind: "skipped", reason: "no-local-notes" };
        }
        localEntries = await listNotes(exec, destinationRef);
        if (localEntries.length === 0) {
          await deleteRef(exec, tempRef);
          return { kind: "skipped", reason: "no-local-notes" };
        }
      }
    }
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
    const annotatedSet = new Set(annotatedCommits);

    if (annotatedCommits.length === 0) {
      await deleteRef(exec, tempRef);
      return { kind: "skipped", reason: "empty-export" };
    }

    if (omittedCommits.length === 0 && localIncludesRemote) {
      if (remoteFetched) await deleteRef(exec, tempRef);
      return {
        kind: "planned",
        target: {
          ref: destinationRef,
          destinationRef,
          tip: localTip,
          priorLocalTip: localTip,
          annotatedCommits: annotatedCommits.sort(),
          omittedCommits: [],
          supersedesLocal: true,
          localIncludesRemote,
        },
      };
    }

    if (!remoteFetched) await deleteRef(exec, tempRef);

    const remoteEntries = new Map(
      (remoteTip === null ? [] : await listNotes(exec, tempRef)).map((entry) => [entry.commit, entry.blob]),
    );
    const targetEntries = new Map(remoteEntries);

    for (const entry of localEntries) {
      if (!annotatedSet.has(entry.commit)) continue;
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
      if (remoteBlob === entry.blob) continue;
      await exec("git", ["notes", `--ref=${tempRef}`, "add", "-f", "-C", entry.blob, entry.commit]);
      targetEntries.set(entry.commit, entry.blob);
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
        supersedesLocal: containsAllEntries(targetEntries, localEntries),
        localIncludesRemote,
      },
    };
  } catch (err) {
    await deleteRef(exec, tempRef);
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

async function adoptRemoteCompactionIfNewer(input: {
  exec: GitExec;
  execInput?: GitExecInput;
  fullRef: string;
  snapshotRef: string;
}): Promise<
  | { kind: "adopted" | "not-needed" }
  | { kind: "conflict"; message: string }
  | { kind: "failed"; error: Error }
> {
  let remoteManifest: NotesCompactionManifest | null;
  let localManifest: NotesCompactionManifest | null;
  try {
    remoteManifest = await readNotesCompactionManifest(input.exec, input.snapshotRef);
    localManifest = await readNotesCompactionManifest(input.exec, input.fullRef);
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
  if (remoteManifest === null) return { kind: "not-needed" };
  if (remoteManifest.generation <= (localManifest?.generation ?? 0)) return { kind: "not-needed" };
  if (input.execInput === undefined) {
    return {
      kind: "conflict",
      message: "Cannot export user notes across a compaction boundary without git plumbing support.",
    };
  }
  const adopt = await adoptCompactedNotesRef({
    exec: input.exec,
    execInput: input.execInput,
    fullRef: input.fullRef,
    snapshotRef: input.snapshotRef,
  });
  switch (adopt.kind) {
    case "adopted":
      return { kind: "adopted" };
    case "not-newer":
      return { kind: "not-needed" };
    case "conflict":
      return { kind: "conflict", message: adopt.message };
    case "ref-moved":
      return {
        kind: "conflict",
        message: "Concurrent local notes changed during compaction adoption. Retry the paired push.",
      };
    case "failed":
      return { kind: "failed", error: adopt.error };
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
  const { exec, execInput, target } = input;
  try {
    const remoteTip = await readRemoteRefTip(exec, target.destinationRef);
    if (remoteTip === target.tip) {
      await adoptPushedTipIntoLocalRef(exec, execInput, target);
      return { kind: "noop" };
    }
    await exec("git", ["push", "origin", `${target.tip}:${target.destinationRef}`]);
    await adoptPushedTipIntoLocalRef(exec, execInput, target);
    return { kind: "pushed" };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (isRemoteUnavailableError(error.message)) return { kind: "no-remote" };
    return { kind: "failed", error };
  }
}

/**
 * After a successful push — or a no-op where origin already carries the pushed
 * tip — reconcile the local canonical notes ref with that tip. A staged target
 * that supersedes local can be adopted directly. Otherwise, git plumbing builds
 * a two-parent local-wins union when the trees are uncontested or local ancestry
 * resolves a contest.
 *
 * Two guards keep it safe:
 *
 * - **No-op:** an already-ancestral pushed tip or an uncontested union tree
 *   identical to local mints no join commit.
 * - **Contested entries:** local wins only when plan-time ancestry proves it
 *   contains the fetched remote tip; otherwise the join is refused.
 * - **Concurrent local advance:** the update is a compare-and-swap against
 *   {@link BranchBoundedNotesExportTarget.priorLocalTip} (the local tip observed
 *   at plan time). A concurrent `arc user save` that moved the local ref between
 *   plan and push fails the swap, so its note is never clobbered — the ref
 *   reconciles on the next push instead.
 *
 * The fast-path target (`ref === destinationRef`) already pushes the canonical
 * ref itself, so there is nothing to adopt. Missing stdin plumbing, read
 * failures, and failed swaps leave the local ref where it was and never change
 * the already-successful push outcome.
 */
async function adoptPushedTipIntoLocalRef(
  exec: GitExec,
  execInput: GitExecInput | undefined,
  target: BranchBoundedNotesExportTarget,
): Promise<void> {
  if (target.ref === target.destinationRef) return;
  try {
    if (target.supersedesLocal) {
      await exec("git", ["update-ref", target.destinationRef, target.tip, target.priorLocalTip]);
      return;
    }
    if (execInput === undefined) return;
    if (await isAncestor(exec, target.tip, target.priorLocalTip)) return;

    const state = await loadNotesUnionState(exec, target.priorLocalTip, target.tip);
    const relation = classifyNoteSetRelation(state.local, state.pushed);
    if (relation === "conflicting" && !target.localIncludesRemote) return;

    const unionInput = {
      exec,
      execInput,
      priorLocalTip: target.priorLocalTip,
      pushedTip: target.tip,
    };
    const unionTree = await buildBranchBoundedNotesUnionTree(unionInput, state);
    if (
      relation !== "conflicting"
      && unionTree === await readTreeId(exec, target.priorLocalTip)
    ) return;

    const unionTip = await commitBranchBoundedNotesUnionTree(
      exec,
      unionTree,
      target.priorLocalTip,
      target.tip,
    );
    await exec("git", ["update-ref", target.destinationRef, unionTip, target.priorLocalTip]);
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

function selectUnionManifest(input: {
  localManifest: NotesCompactionManifest | null;
  localTip: string;
  pushedManifest: NotesCompactionManifest | null;
  pushedTip: string;
}): { manifest: NotesCompactionManifest; tip: string } | null {
  if (
    input.pushedManifest !== null
    && input.pushedManifest.generation > (input.localManifest?.generation ?? 0)
  ) {
    return { manifest: input.pushedManifest, tip: input.pushedTip };
  }
  return input.localManifest === null
    ? null
    : { manifest: input.localManifest, tip: input.localTip };
}

async function readTreeBlob(exec: GitExec, commitish: string, path: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", `${commitish}:${path}`]);
  const blob = stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(blob)) {
    throw new Error(`Tree entry did not resolve to a git object: ${commitish}:${path}`);
  }
  return blob;
}

async function readTreeId(exec: GitExec, commitish: string): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", `${commitish}^{tree}`]);
  const tree = stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(tree)) {
    throw new Error(`Commit-ish did not resolve to a tree: ${commitish}`);
  }
  return tree;
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

function containsAllEntries(targetEntries: Map<string, string>, localEntries: NoteEntry[]): boolean {
  return localEntries.every((entry) => targetEntries.get(entry.commit) === entry.blob);
}
