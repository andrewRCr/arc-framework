/**
 * Pure unpushed-local-drift primitives shared across the cross-machine arrival
 * surfaces: the notes/disk clean-arm drift surface (whole-tree) and the
 * retired-subdir removal gate (per-subdir).
 *
 * The question both answer is the same — *does this scope carry local-only
 * content not represented in the pushed note basis?* — so it is settled once
 * here and consumed from both sites rather than re-derived per surface. A real
 * local edit (`edits` / `modified` / `mixed`) is drift; a scope that is merely
 * behind or missing files the basis carries is benign (no local-only work at
 * risk).
 *
 * Manifest-only and side-effect-free — no git calls, no hashing — so callers
 * supply the comparison basis and these stay unit-testable in isolation.
 *
 * @module
 */

import type { SyncManifest } from "../../lib/git/index.js";
import { wuNameOfPath } from "../../lib/user-sync/index.js";

import type { UserUnsavedDirection } from "./types.js";

/**
 * The portion of a comparison the drift question is asked over: the whole user
 * tree, or a single per-WU subdir.
 */
export type DriftScope =
  | { kind: "tree" }
  | { kind: "subdir"; name: string };

/**
 * Whether a disk-vs-basis direction represents unpushed local drift.
 *
 * Maps the {@link UserUnsavedDirection} matrix to the drift question: `edits`,
 * `modified`, and `mixed` carry local-only content (drift); `behind`, `missing`,
 * and the no-basis `null` do not. `behind` in particular is benign — the disk is
 * older than the latest note, not ahead of it — which is why the sync-state-aware
 * direction is mapped here rather than re-derived from a raw manifest diff.
 *
 * @param direction - The disk-vs-basis comparison outcome, or `null` when there
 *   is no comparison basis.
 * @returns `true` when the direction carries local-only content at risk.
 */
export function hasUnpushedLocalDrift(
  direction: UserUnsavedDirection | null,
): boolean {
  return direction === "edits" || direction === "modified" || direction === "mixed";
}

/**
 * Restrict a manifest to the files a scope covers. The whole-tree scope passes
 * through; a subdir scope keeps only the per-WU files owned by that subdir.
 */
function scopeManifest(manifest: SyncManifest, scope: DriftScope): SyncManifest {
  if (scope.kind === "tree") return manifest;

  const files: Record<string, string> = {};
  for (const [path, content] of Object.entries(manifest.files)) {
    if (wuNameOfPath(path) === scope.name) files[path] = content;
  }
  return { version: manifest.version, files };
}

/**
 * The disk-vs-note direction restricted to a scope.
 *
 * Returns `null` when the scope is empty on both sides (no comparison basis) —
 * e.g. a subdir present in neither manifest — so the drift question resolves to
 * benign rather than forcing a spurious direction.
 *
 * @param disk - The disk-side manifest.
 * @param note - The pushed-note-side manifest (the basis).
 * @param scope - The portion to compare.
 * @returns The scoped direction, or `null` for an empty basis.
 */
export function unsavedDirectionForScope(
  disk: SyncManifest,
  note: SyncManifest,
  scope: DriftScope,
): UserUnsavedDirection | null {
  const scopedDisk = scopeManifest(disk, scope);
  const scopedNote = scopeManifest(note, scope);

  if (
    Object.keys(scopedDisk.files).length === 0 &&
    Object.keys(scopedNote.files).length === 0
  ) {
    return null;
  }

  return computeUnsavedDirection(scopedDisk, scopedNote);
}

/**
 * Whether a scope carries unpushed local drift over a disk-vs-note basis.
 *
 * The scoped composition consumed by the retired-subdir removal gate (per-subdir)
 * and available to the clean-arm surface (whole-tree): scope the basis, derive
 * its direction, and map it through {@link hasUnpushedLocalDrift}.
 *
 * @param disk - The disk-side manifest.
 * @param note - The pushed-note-side manifest (the basis).
 * @param scope - The portion to ask the drift question over.
 * @returns `true` when the scope carries local-only content at risk.
 */
export function hasUnpushedLocalDriftForScope(
  disk: SyncManifest,
  note: SyncManifest,
  scope: DriftScope,
): boolean {
  return hasUnpushedLocalDrift(unsavedDirectionForScope(disk, note, scope));
}

/**
 * Classify the disk-vs-note manifest difference into a single direction.
 *
 * Pure manifest diff: counts whether disk carries extra files, whether it
 * modifies a shared file, and whether it is missing files the note has. More
 * than one mismatch kind is `mixed`; otherwise the single kind names the
 * direction. Never returns `behind` — that distinction needs sync-state context
 * the manifests alone don't carry and is supplied by the caller.
 *
 * @param diskManifest - The disk-side manifest.
 * @param noteManifest - The note-side manifest.
 * @returns The disk-vs-note direction.
 */
export function computeUnsavedDirection(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): UserUnsavedDirection {
  const diskKeys = new Set(Object.keys(diskManifest.files));
  const noteKeys = new Set(Object.keys(noteManifest.files));

  let hasExtraFiles = false;
  let hasModifiedFiles = false;
  for (const key of diskKeys) {
    const noteValue = noteManifest.files[key];
    if (noteValue === undefined) {
      hasExtraFiles = true;
      continue;
    }
    if (noteValue !== diskManifest.files[key]) {
      hasModifiedFiles = true;
    }
  }

  let diskMissing = false;
  for (const key of noteKeys) {
    if (!diskKeys.has(key)) {
      diskMissing = true;
      break;
    }
  }

  const mismatchKinds = [hasExtraFiles, diskMissing, hasModifiedFiles]
    .filter(Boolean)
    .length;

  if (mismatchKinds > 1) return "mixed";
  if (hasExtraFiles) return "edits";
  if (hasModifiedFiles) return "modified";
  return "missing";
}
