/**
 * Proof-gated publication of the immutable canonical user-notes tip.
 *
 * @module
 */

import type { GitExec, GitExecInput } from "../git/exec.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  deserializeNotesCompactionManifest,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
} from "./compaction-manifest.js";
import { isRemoteUnavailableError } from "./notes-merge.js";
import { proveNotesPublication } from "./notes-publication-proof.js";
import { readLocalExclusiveAnnotatedNoteCommits } from "./notes-ref.js";

const USER_NOTES_REF_PREFIX = "refs/notes/arc/user";
const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** Released-history subject retained for read compatibility. */
export const BRANCH_BOUNDED_NOTES_JOIN_MESSAGE = "user notes branch-bounded export join";

/** Immutable, proof-bearing canonical notes target. */
export interface BranchBoundedNotesExportTarget {
  /** Real origin-bound canonical notes ref. */
  destinationRef: string;
  /** Canonical local tip captured and proven by the planner. */
  capturedTip: string;
}

/** Stable class for a well-formed publication refusal. */
export type BranchBoundedNotesExportRefusalReason =
  | "unpublished-history"
  | "history-diverged"
  | "compaction-lineage"
  | "proof-unavailable";

/** Result of deriving a canonical notes publication target. */
export type PlanBranchBoundedNotesExportResult =
  | { kind: "planned"; target: BranchBoundedNotesExportTarget }
  | { kind: "skipped"; reason: "no-local-notes" }
  | { kind: "refused"; reason: BranchBoundedNotesExportRefusalReason; message: string }
  | { kind: "failed"; error: Error };

/** Result of pushing a planned canonical notes target. */
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
}

/** Inputs for {@link pushBranchBoundedNotesExport}. */
export interface PushBranchBoundedNotesExportInput {
  exec: GitExec;
  target: BranchBoundedNotesExportTarget;
}

/**
 * Derive an immutable canonical target only after every safety proof passes.
 *
 * @param input - Git adapters and the identity whose canonical notes ref is inspected.
 * @returns A pinned target, a stable skip/refusal, or a strict read failure.
 */
export async function planBranchBoundedNotesExport(
  input: PlanBranchBoundedNotesExportInput,
): Promise<PlanBranchBoundedNotesExportResult> {
  const destinationRef = `${USER_NOTES_REF_PREFIX}/${input.identity}`;
  let capturedTip: string | null;
  try {
    capturedTip = await readStrictLocalRefTip(input.exec, destinationRef);
  } catch (error) {
    return failed(error);
  }
  if (capturedTip === null) return { kind: "skipped", reason: "no-local-notes" };

  const fetchedRef = `${destinationRef}__publication_${uniqueRefToken()}`;
  try {
    const remoteTip = await readStrictRemoteRefTip(input.exec, destinationRef);
    if (remoteTip !== null) {
      await deleteRef(input.exec, fetchedRef);
      await input.exec("git", ["fetch", "--refmap=", "origin", `+${destinationRef}:${fetchedRef}`]);
      const fetchedTip = await readStrictLocalRefTip(input.exec, fetchedRef);
      if (fetchedTip !== remoteTip) {
        throw new Error("Fetched canonical notes snapshot did not match the observed remote tip.");
      }
      if (remoteTip === capturedTip) return planned(destinationRef, capturedTip);
    }

    const localManifest = await readStrictOptionalNotesCompactionManifest(input.exec, capturedTip);
    if (remoteTip !== null) {
      const remoteManifest = await readStrictOptionalNotesCompactionManifest(input.exec, fetchedRef);
      if (!sameManifest(localManifest, remoteManifest)) {
        return refused(
          "compaction-lineage",
          "Local and origin user notes cross an incompatible compaction boundary. Preserve both snapshots and "
            + "inspect them explicitly before choosing an authoritative state. Automatic repair is disabled: "
            + "either accept the remote snapshot, or verify the materialized user state and establish a fresh "
            + "authoritative save after manual canonical-ref repair.",
        );
      }
      if (!await isAncestorStrict(input.exec, remoteTip, capturedTip)) {
        return refused(
          "history-diverged",
          "Local and origin user-notes histories diverged. Run the preflighted `arc user push` reconciliation path.",
        );
      }
    }

    const annotatedCommits = await readLocalExclusiveAnnotatedNoteCommits(
      input.exec,
      capturedTip,
      remoteTip,
    );
    const proof = await proveNotesPublication({
      exec: input.exec,
      ...(input.execInput === undefined ? {} : { execInput: input.execInput }),
      annotatedCommits,
    });
    switch (proof.kind) {
      case "proven":
        return planned(destinationRef, capturedTip);
      case "unpublished":
        return refused(
          "unpublished-history",
          `User-notes history references unpublished commit(s): ${proof.commits.map(shortObjectId).join(", ")}. `
            + "Publish those commits on a live origin branch, then retry paired sync or the preflighted "
            + "`arc user push` path.",
        );
      case "unavailable":
        return refused(
          "proof-unavailable",
          `User-notes publication proof is unavailable: ${proof.message} Restore remote and object visibility, `
            + "then retry a non-force publication path.",
        );
    }
  } catch (error) {
    return failed(error);
  } finally {
    await deleteRef(input.exec, fetchedRef);
  }
}

/**
 * Push exactly the captured canonical tip without local post-push adoption.
 *
 * @param input - Git adapter and the proof-bearing target returned by the planner.
 * @returns Whether the target was pushed, already current, unavailable, or rejected.
 */
export async function pushBranchBoundedNotesExport(
  input: PushBranchBoundedNotesExportInput,
): Promise<PushBranchBoundedNotesExportResult> {
  try {
    const remoteTip = await readStrictRemoteRefTip(input.exec, input.target.destinationRef);
    if (remoteTip === input.target.capturedTip) return { kind: "noop" };
    await input.exec("git", [
      "push",
      "origin",
      `${input.target.capturedTip}:${input.target.destinationRef}`,
    ]);
    return { kind: "pushed" };
  } catch (error) {
    const normalized = toError(error);
    if (isRemoteUnavailableError(normalized.message)) return { kind: "no-remote" };
    return { kind: "failed", error: normalized };
  }
}

/** Read a local ref tip, returning `null` only for verified absence. */
export async function readStrictLocalRefTip(exec: GitExec, ref: string): Promise<string | null> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["rev-parse", "--verify", "--quiet", ref]));
  } catch (error) {
    if (exitCode(error) === 1) return null;
    throw error;
  }
  const tip = stdout.trim();
  if (!GIT_OBJECT_ID_PATTERN.test(tip)) throw new Error(`Git ref returned a malformed object id: ${ref}`);
  return tip;
}

async function readStrictRemoteRefTip(exec: GitExec, ref: string): Promise<string | null> {
  const { stdout } = await exec("git", ["ls-remote", "origin", ref]);
  const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length !== 1) throw new Error(`Remote ref query returned duplicate or mismatched records: ${ref}`);
  const [tip, returnedRef, ...extra] = lines[0]?.split(/\s+/u) ?? [];
  if (
    tip === undefined
    || returnedRef !== ref
    || extra.length !== 0
    || !GIT_OBJECT_ID_PATTERN.test(tip)
  ) {
    throw new Error(`Remote ref query returned malformed output: ${ref}`);
  }
  return tip;
}

/**
 * Read a compaction manifest while distinguishing absence from malformed or unreadable state.
 *
 * @param exec - Git runner.
 * @param commitish - Notes ref or captured notes-history commit to inspect.
 * @returns The validated manifest, or `null` only when the tree entry is absent.
 */
export async function readStrictOptionalNotesCompactionManifest(
  exec: GitExec,
  commitish: string,
): Promise<NotesCompactionManifest | null> {
  const { stdout } = await exec("git", [
    "ls-tree",
    "--full-tree",
    commitish,
    "--",
    NOTES_COMPACTION_MANIFEST_PATH,
  ]);
  const lines = stdout.split("\n").map((line) => line.trimEnd()).filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length !== 1) throw new Error(`Compaction manifest tree entry is ambiguous at ${commitish}.`);
  const match = /^100644 blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(lines[0] ?? "");
  if (match === null || match[2] !== NOTES_COMPACTION_MANIFEST_PATH) {
    throw new Error(`Compaction manifest tree entry is malformed at ${commitish}.`);
  }
  const { stdout: content } = await exec("git", ["cat-file", "blob", match[1] ?? ""]);
  const manifest = deserializeNotesCompactionManifest(content);
  if (manifest === null) throw new Error(`Compaction manifest content is malformed at ${commitish}.`);
  return manifest;
}

async function isAncestorStrict(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    if (exitCode(error) === 1) return false;
    throw error;
  }
}

function sameManifest(left: NotesCompactionManifest | null, right: NotesCompactionManifest | null): boolean {
  if (left === null || right === null) return left === right;
  return serializeNotesCompactionManifest(left) === serializeNotesCompactionManifest(right);
}

async function deleteRef(exec: GitExec, ref: string): Promise<void> {
  try {
    await exec("git", ["update-ref", "-d", ref]);
  } catch {
    // Caller-unique temporary ref cleanup is best-effort.
  }
}

function exitCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function planned(destinationRef: string, capturedTip: string): PlanBranchBoundedNotesExportResult {
  return { kind: "planned", target: { destinationRef, capturedTip } };
}

function refused(
  reason: BranchBoundedNotesExportRefusalReason,
  message: string,
): PlanBranchBoundedNotesExportResult {
  return { kind: "refused", reason, message };
}

function failed(error: unknown): PlanBranchBoundedNotesExportResult {
  return { kind: "failed", error: toError(error) };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function shortObjectId(objectId: string): string {
  return objectId.slice(0, 8);
}
