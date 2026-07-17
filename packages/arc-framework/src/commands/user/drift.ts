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

/** Basename of the per-WU session-context file the safe auto-load sub-case keys on. */
const SESSION_NOTES_BASENAME = "SESSION-NOTES.md";

/**
 * Identity-global surfaces siblings edit between notes exports. Disk-ahead
 * divergence confined to these is the parallel-session steady state, not an anomaly.
 */
const IDENTITY_GLOBAL_SURFACES = new Set(["USER-INBOX.md", "WORKING-MEMORY.md"]);

/**
 * Manifest paths the disk carries that the note does not (disk-ahead extras).
 *
 * @param diskManifest - The disk-side manifest.
 * @param noteManifest - The note-side manifest.
 * @returns Paths present only on disk.
 */
export function listExtraFiles(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): string[] {
  return Object.keys(diskManifest.files).filter(
    (path) => noteManifest.files[path] === undefined,
  );
}

/**
 * Manifest paths both sides carry with differing content.
 *
 * @param diskManifest - The disk-side manifest.
 * @param noteManifest - The note-side manifest.
 * @returns Paths present on both sides with unequal content hashes.
 */
export function listModifiedFiles(
  diskManifest: SyncManifest,
  noteManifest: SyncManifest,
): string[] {
  const modified: string[] = [];
  for (const [path, diskHash] of Object.entries(diskManifest.files)) {
    const noteHash = noteManifest.files[path];
    if (noteHash !== undefined && noteHash !== diskHash) modified.push(path);
  }
  return modified;
}

/**
 * Manifest paths the note carries that the disk does not.
 *
 * @param diskManifest - The disk-side manifest, or `null` when disk is empty.
 * @param noteManifest - The note-side manifest.
 * @returns Paths present only in the note.
 */
export function listMissingFiles(
  diskManifest: SyncManifest | null,
  noteManifest: SyncManifest,
): string[] {
  return Object.keys(noteManifest.files).filter(
    (path) => diskManifest?.files[path] === undefined,
  );
}

/**
 * Whether every disk-ahead path is a parallel-session expected surface: a
 * fresh-seeded active WU `SESSION-NOTES.md` (disk-only extra) and/or
 * identity-global `USER-INBOX.md` / `WORKING-MEMORY.md` (extra or modified).
 * Requires no missing files (ahead, not behind) and at least one disk-ahead
 * path. A content-modified active SESSION-NOTES is real local work, not a seed.
 *
 * @param input - Active WU name and the three path sets from the manifest diff.
 * @returns `true` when the divergence is expected healthy parallelism.
 */
export function isExpectedParallelSessionDrift(input: {
  activeWuName: string | null;
  extraFiles: readonly string[];
  modifiedFiles: readonly string[];
  missingFiles: readonly string[];
}): boolean {
  if (input.missingFiles.length > 0) return false;
  const aheadPaths = [...input.extraFiles, ...input.modifiedFiles];
  if (aheadPaths.length === 0) return false;
  const activeSessionNotes =
    input.activeWuName !== null ? `${input.activeWuName}/${SESSION_NOTES_BASENAME}` : null;
  // Active SESSION-NOTES is expected only as a fresh seed (disk-only extra), never as a
  // content-modified file that already exists in the note basis.
  return aheadPaths.every((path) => {
    if (IDENTITY_GLOBAL_SURFACES.has(path)) return true;
    return path === activeSessionNotes && input.extraFiles.includes(path);
  });
}

/**
 * Whether a note-present/disk-absent file set is intentional retirement rather
 * than real drift, judged against the authoritative shipped-WU oracle.
 *
 * A missing file whose work unit has shipped (its slug `∈ shippedWuNames`, read
 * from the `completed/` tree on `origin/<base>`) was deliberately retired when
 * that WU closed: its per-WU subdir is gone from disk while a not-yet-rewritten
 * note still carries it — benign, not unsaved work at risk. A missing file whose
 * WU has not shipped, or a non-per-WU top-level file (whose `wuNameOfPath` is
 * `null`), is a real divergence to surface. Retirement requires *every* missing
 * file to belong to a shipped WU; a single live-WU or top-level file makes the
 * whole set drift.
 *
 * This reads the same shipped-set oracle the retired-subdir reconcile uses, so
 * detection and remediation cannot disagree — including for a note-only ghost of
 * a WU that shipped before this machine's last sync, which the prior
 * last-sync-file-list heuristic could not recognize. Pure: the caller supplies
 * the shipped set.
 *
 * @param input - The missing-file set and the shipped-WU slug set.
 * @returns `true` only when every missing file belongs to a shipped work unit.
 */
export function missingFilesAreIntentionalRetirement(input: {
  missingFiles: string[];
  shippedWuNames: ReadonlySet<string>;
}): boolean {
  const { missingFiles, shippedWuNames } = input;
  if (missingFiles.length === 0) return false;
  return missingFiles.every((path) => {
    const wu = wuNameOfPath(path);
    return wu !== null && shippedWuNames.has(wu);
  });
}

/**
 * The session-init clean-arm verdict over a notes/disk divergence: whether to
 * auto-load (non-destructive, safe) or surface an advisory (possible stale or
 * expected parallel-session state the developer should see graded correctly).
 */
export interface CleanArmNotesVerdict {
  /**
   * Auto-load is safe — the load only adds content the disk is missing, with no
   * local-only work to clobber. Drives the workflow's notes-load dispatch.
   */
  loadNeeded: boolean;
  /**
   * Advisory surface when the divergence is neither a safe auto-load nor silent
   * local-only work. Carries `register: "expected"` for parallel-session steady
   * state (fresh seed / sibling identity-global churn) and `"caution"` for
   * genuine inspect-before-rely drift. Absent when there is nothing to surface.
   */
  driftSurface?: {
    direction: Exclude<UserUnsavedDirection, "behind">;
    register: "expected" | "caution";
  };
}

/**
 * Decide the clean-arm notes/disk verdict (D3) from the whole-tree divergence
 * direction, the three path sets from the manifest diff, and the active work unit.
 *
 * - `behind` → auto-load: the note advanced past a disk that matches the
 *   materialized basis, so loading overwrites nothing local.
 * - `missing` → auto-load **only** the narrow safe sub-case: the sole missing
 *   file is the active WU's `SESSION-NOTES.md` (a live WU's notes that arrived
 *   in the note but were never materialized — pure-additive). Anything else is a
 *   genuine arrival and surfaces as caution. Benign retirement (a note-only ghost
 *   of a shipped WU) never reaches here — it is resolved upstream against the
 *   shipped-set oracle, where such a divergence collapses to no divergence.
 * - Disk-ahead paths (`edits` / `modified` / `mixed` with no missing files)
 *   confined to a fresh-seeded active WU `SESSION-NOTES.md` (extra only) and/or
 *   identity-global `USER-INBOX.md` / `WORKING-MEMORY.md` → calm `expected`
 *   surface (parallel-session steady state; converges at next save or handoff).
 * - Other `mixed` → caution surface (may carry real local edits a load would
 *   clobber).
 * - Other `edits` / `modified` / `null` → no action: ordinary unsaved work (not a
 *   stale arrival D3 owns) or no divergence at all.
 *
 * Pure and side-effect-free. The active-WU-dependent sub-cases are resolved by the
 * caller that knows the active WU name (the session-init orchestrator).
 *
 * @param input - Direction, path sets, and the active WU name or `null`.
 * @returns The auto-load decision plus any advisory surface.
 */
export function resolveCleanArmNotesVerdict(input: {
  direction: UserUnsavedDirection | null;
  missingFiles: string[];
  extraFiles?: string[];
  modifiedFiles?: string[];
  activeWuName: string | null;
}): CleanArmNotesVerdict {
  const {
    direction,
    missingFiles,
    extraFiles = [],
    modifiedFiles = [],
    activeWuName,
  } = input;

  if (direction === "behind") return { loadNeeded: true };

  if (direction === "missing") {
    const onlyActiveSessionNotesMissing =
      activeWuName !== null &&
      missingFiles.length === 1 &&
      missingFiles[0] === `${activeWuName}/${SESSION_NOTES_BASENAME}`;
    if (onlyActiveSessionNotesMissing) return { loadNeeded: true };
    return {
      loadNeeded: false,
      driftSurface: { direction: "missing", register: "caution" },
    };
  }

  if (
    direction === "edits" ||
    direction === "modified" ||
    direction === "mixed"
  ) {
    if (
      isExpectedParallelSessionDrift({
        activeWuName,
        extraFiles,
        modifiedFiles,
        missingFiles,
      })
    ) {
      return {
        loadNeeded: false,
        driftSurface: { direction, register: "expected" },
      };
    }
    if (direction === "mixed") {
      return {
        loadNeeded: false,
        driftSurface: { direction: "mixed", register: "caution" },
      };
    }
    return { loadNeeded: false };
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
