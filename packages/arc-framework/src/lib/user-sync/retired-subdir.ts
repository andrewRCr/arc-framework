/**
 * Pure retired-subdir reconciliation decision — the read-only "which per-WU
 * subdirs are safe to reconcile?" half of retired-subdir cleanup. Removal (the
 * `.internal/` backup + recursive delete) is the caller's; this module only
 * classifies.
 *
 * A per-WU user subdir under `user/{identity}/` is *retired* — reconcilable —
 * only when all of these hold:
 *
 * - it is present locally,
 * - no note in the recent-notes window still carries it (absent from notes),
 * - its WU has shipped (its slug is in the {@link readShippedWorkUnits} set).
 *
 * The shipped gate is load-bearing for the no-current-WU path (an errand or
 * `main` session): there, every local subdir looks "not the current WU" and
 * none are carried in this session's notes, so without the shipped gate the
 * reconcile would sweep every in-flight WU's workspace. Gating on shipped
 * confines it to genuinely-retired subdirs without needing a current-WU input.
 *
 * @module
 */

import { wuNameOfPath } from "./classifier.js";
import type { RecentNote } from "./notes-ref.js";

/** Why a present subdir was spared from reconciliation. */
export type PreservedReason = "still-in-notes" | "not-shipped";

/** A present subdir kept in place, with the condition that spared it. */
export interface PreservedSubdir {
  subdir: string;
  reason: PreservedReason;
}

/** The reconcile/preserve partition of the present per-WU subdirs. */
export interface RetiredSubdirPlan {
  /** Subdirs to reconcile — absent from the recent-notes window AND shipped. */
  reconcile: string[];
  /** Present subdirs spared, each tagged with the condition that spared it. */
  preserved: PreservedSubdir[];
}

export interface RetiredSubdirPlanInput {
  /** WU-name subdirs present locally under `user/{identity}/`. */
  localSubdirs: readonly string[];
  /** WU names still referenced anywhere in the recent-notes window. */
  notesWuNames: ReadonlySet<string>;
  /** Shipped WU-name slugs (from {@link readShippedWorkUnits}). */
  shipped: ReadonlySet<string>;
}

/**
 * Partition present per-WU subdirs into reconcile vs. preserve.
 *
 * Pure and total over the input — no I/O, no current-WU input. Output preserves
 * `localSubdirs` iteration order. The still-in-notes check precedes the
 * shipped check, so a shipped subdir still carried in the notes window is
 * preserved as `still-in-notes` (it is live elsewhere, not yet retired).
 *
 * @param input - Local subdirs plus the notes and shipped reference sets.
 * @returns The reconcile/preserve partition.
 */
export function planRetiredSubdirReconcile(
  input: RetiredSubdirPlanInput,
): RetiredSubdirPlan {
  const reconcile: string[] = [];
  const preserved: PreservedSubdir[] = [];

  for (const subdir of input.localSubdirs) {
    if (input.notesWuNames.has(subdir)) {
      preserved.push({ subdir, reason: "still-in-notes" });
    } else if (!input.shipped.has(subdir)) {
      preserved.push({ subdir, reason: "not-shipped" });
    } else {
      reconcile.push(subdir);
    }
  }

  return { reconcile, preserved };
}

/**
 * Distinct per-WU subdir names carried by a set of manifest-relative paths.
 * Flat (cross-WU) and dot-prefixed (never-synced) paths carry no subdir and are
 * dropped. Order follows first appearance.
 *
 * @param paths - Manifest-relative paths under `user/{identity}/`.
 * @returns The distinct owning WU-name subdirs.
 */
export function subdirsFromPaths(paths: Iterable<string>): string[] {
  const subdirs = new Set<string>();
  for (const path of paths) {
    const wu = wuNameOfPath(path);
    if (wu !== null) subdirs.add(wu);
  }
  return [...subdirs];
}

/**
 * WU names referenced by any per-WU path across a recent-notes window. A note
 * whose content is not a usable manifest (bad JSON, no `files` object) is
 * skipped rather than throwing — the window read tolerates a stray entry.
 *
 * @param recentNotes - Recency-ordered notes from `readRecentUserNotes`.
 * @returns The set of WU names still carried somewhere in the window.
 */
export function collectNotesWuNames(recentNotes: readonly RecentNote[]): Set<string> {
  const names = new Set<string>();
  for (const note of recentNotes) {
    for (const path of manifestFilePaths(note.content)) {
      const wu = wuNameOfPath(path);
      if (wu !== null) names.add(wu);
    }
  }
  return names;
}

/** Best-effort manifest `files` keys; `[]` when the content isn't a usable manifest. */
function manifestFilePaths(noteContent: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(noteContent);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const files = (parsed as { files?: unknown }).files;
  if (typeof files !== "object" || files === null) return [];
  return Object.keys(files);
}
