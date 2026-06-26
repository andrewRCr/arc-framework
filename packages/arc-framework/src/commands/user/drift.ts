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
import type { RecentNote } from "../../lib/user-sync/index.js";

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
 * Parse a note's serialized content into a {@link SyncManifest}, or `null` when
 * it is not a usable manifest (bad JSON, no `files` object). Mirrors the
 * tolerant window read elsewhere — a stray entry is skipped, not thrown over.
 */
function parseNoteManifest(content: string): SyncManifest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const files = (parsed as { files?: unknown }).files;
  if (typeof files !== "object" || files === null) return null;
  return parsed as SyncManifest;
}

/**
 * The drift basis for a subdir — the manifest of the most recent note in the
 * window that still carries it. A subdir absent from the latest note (because its
 * WU shipped and the note dropped it) but present in an earlier in-window note
 * resolves to that earlier note: comparing disk against the *latest* note would
 * read the present-on-disk subdir as local `edits` and wrongly flag every retired
 * subdir as drift. `null` when no note in the window carries it (no basis).
 *
 * @param subdir - The per-WU subdir name.
 * @param recentNotes - Recency-ordered notes (`[0]` most recent).
 * @returns The basis manifest, or `null` when no note carries the subdir.
 */
function resolveSubdirDriftBasis(
  subdir: string,
  recentNotes: readonly RecentNote[],
): SyncManifest | null {
  for (const note of recentNotes) {
    const parsed = parseNoteManifest(note.content);
    if (parsed && Object.keys(parsed.files).some((path) => wuNameOfPath(path) === subdir)) {
      return parsed;
    }
  }
  return null;
}

/**
 * The subset of `localSubdirs` carrying unpushed local drift — possible unsaved
 * work that must not be reconciled away. Each subdir is judged against its own
 * last-pushed basis ({@link resolveSubdirDriftBasis}); a subdir with no basis in
 * the window does not drift (it reconciles, with the pre-load backup as the net).
 *
 * The per-subdir half of the D-shared drift signal, consumed by the retired-subdir
 * removal gate. Pure — the caller supplies the disk manifest and the note window.
 *
 * @param input - Local subdirs, the disk manifest, and the recent-notes window.
 * @returns The set of drifting subdir names.
 */
export function computeDriftingSubdirs(input: {
  localSubdirs: readonly string[];
  diskManifest: SyncManifest;
  recentNotes: readonly RecentNote[];
}): Set<string> {
  const drifting = new Set<string>();
  for (const subdir of input.localSubdirs) {
    const basis = resolveSubdirDriftBasis(subdir, input.recentNotes);
    if (basis === null) continue;
    if (hasUnpushedLocalDriftForScope(input.diskManifest, basis, { kind: "subdir", name: subdir })) {
      drifting.add(subdir);
    }
  }
  return drifting;
}

/** Basename of the per-WU session-context file the safe auto-load sub-case keys on. */
const SESSION_NOTES_BASENAME = "SESSION-NOTES.md";

/**
 * Whether a note-present/disk-absent file set is intentional retirement rather
 * than real drift, judged against the file list captured at last sync.
 *
 * A missing file that was present at last sync (`∈ priorFileList`) was
 * materialized on this machine and has since been removed locally — a deliberate
 * removal (its WU shipped, its subdir retired), not unsaved work at risk. A
 * missing file absent from that list was never materialized here (a fresh
 * arrival in the note), which is real drift. Retirement requires *every* missing
 * file to have been present before; a single fresh arrival makes the whole set
 * drift. Without a prior list (never synced here) retirement cannot be proven, so
 * the conservative answer is `false` (surface).
 *
 * @param input - The missing-file set and the last-sync file list (or `null`).
 * @returns `true` only when the whole missing set is deliberate local retirement.
 */
export function missingFilesAreIntentionalRetirement(input: {
  missingFiles: string[];
  priorFileList: string[] | null;
}): boolean {
  const { missingFiles, priorFileList } = input;
  if (priorFileList === null || missingFiles.length === 0) return false;
  const prior = new Set(priorFileList);
  return missingFiles.every((path) => prior.has(path));
}

/**
 * The session-init clean-arm verdict over a notes/disk divergence: whether to
 * auto-load (non-destructive, safe) or surface an advisory (possible stale or
 * unsaved state the developer should inspect).
 */
export interface CleanArmNotesVerdict {
  /**
   * Auto-load is safe — the load only adds content the disk is missing, with no
   * local-only work to clobber. Drives the workflow's notes-load dispatch.
   */
  loadNeeded: boolean;
  /**
   * Advisory surface when the divergence is neither a safe auto-load nor benign:
   * `mixed` (may carry real edits) or general `missing` (could be stale arrival
   * or — pre-retirement-distinction — intentional retirement). Absent when there
   * is nothing to surface.
   */
  driftSurface?: { direction: "mixed" | "missing" };
}

/**
 * Decide the clean-arm notes/disk verdict (D3) from the whole-tree divergence
 * direction, the note-present/disk-absent file set, and the active work unit.
 *
 * - `behind` → auto-load: the note advanced past a disk that matches the
 *   materialized basis, so loading overwrites nothing local.
 * - `missing` → auto-load **only** the narrow safe sub-case: the sole missing
 *   file is the active WU's `SESSION-NOTES.md` (a live WU's notes that arrived
 *   in the note but were never materialized — pure-additive, provably not a
 *   retired file). A broader missing set that is wholly intentional retirement
 *   (`missingAreRetirement`) is benign — files deliberately removed locally when
 *   their WU shipped, not stale arrivals. Anything else surfaces.
 * - `mixed` → surface: the disk both adds and drops files, so it may carry
 *   local-only edits a load would clobber; the retirement flag never suppresses
 *   a `mixed` surface (the local-only siblings are themselves real drift).
 * - `edits` / `modified` / `null` → no action: local unsaved work (not a stale
 *   arrival D3 owns) or no divergence at all.
 *
 * Pure and side-effect-free. The active-WU-dependent sub-case is resolved by the
 * caller that knows the active WU name (the session-init orchestrator).
 *
 * @param input - The whole-tree direction, the missing-file set (manifest paths
 *   present in the note and absent on disk), the active WU name or `null`, and
 *   whether the missing set is wholly intentional retirement.
 * @returns The auto-load decision plus any advisory surface.
 */
export function resolveCleanArmNotesVerdict(input: {
  direction: UserUnsavedDirection | null;
  missingFiles: string[];
  activeWuName: string | null;
  missingAreRetirement?: boolean;
}): CleanArmNotesVerdict {
  const { direction, missingFiles, activeWuName, missingAreRetirement } = input;

  if (direction === "behind") return { loadNeeded: true };

  if (direction === "missing") {
    const onlyActiveSessionNotesMissing =
      activeWuName !== null &&
      missingFiles.length === 1 &&
      missingFiles[0] === `${activeWuName}/${SESSION_NOTES_BASENAME}`;
    if (onlyActiveSessionNotesMissing) return { loadNeeded: true };
    if (missingAreRetirement) return { loadNeeded: false };
    return { loadNeeded: false, driftSurface: { direction: "missing" } };
  }

  if (direction === "mixed") {
    return { loadNeeded: false, driftSurface: { direction: "mixed" } };
  }

  return { loadNeeded: false };
}

/**
 * Classify the disk-vs-note manifest difference into a single direction.
 *
 * Pure manifest diff: counts whether disk carries extra files, whether it
 * modifies a shared file, and whether it is missing files the note has. More
 * than one mismatch kind is `mixed`, no mismatch at all is `null` (identical
 * manifests), otherwise the single kind names the direction. Never returns
 * `behind` — that distinction needs sync-state context the manifests alone don't
 * carry and is supplied by the caller.
 *
 * @param diskManifest - The disk-side manifest.
 * @param noteManifest - The note-side manifest.
 * @returns The disk-vs-note direction, or `null` when the manifests are identical.
 */
export function computeUnsavedDirection(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): UserUnsavedDirection | null {
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
  if (mismatchKinds === 0) return null;
  if (hasExtraFiles) return "edits";
  if (hasModifiedFiles) return "modified";
  return "missing";
}
