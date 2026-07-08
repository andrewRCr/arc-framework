/**
 * Pure retired-subdir reconciliation decision — the read-only "which per-WU
 * subdirs are safe to reconcile?" half of retired-subdir cleanup. Removal (the
 * `.internal/` backup + recursive delete) is the caller's; this module only
 * classifies.
 *
 * A per-WU user subdir under `user/{identity}/` is *retired* — reconcilable —
 * when its WU has shipped (its slug is in the shipped set, read from
 * `origin/<base>`) and no same-machine worktree is still in flight for that WU.
 * Removal is recoverable (the caller writes an `.internal/` backup first).
 * Whether the operator stashed extra files in the subdir governs only how loudly
 * the removal is announced ({@link stashedFilesInSubdir}), not whether it happens.
 *
 * The shipped gate is load-bearing for the no-current-WU path (an errand or
 * `main` session): there, every local subdir looks "not the current WU", so
 * without the shipped gate the reconcile would sweep every in-flight WU's
 * workspace. Gating on shipped confines it to genuinely-retired subdirs without
 * needing a current-WU input.
 *
 * @module
 */

import { wuNameOfPath } from "./classifier.js";

/** Why a present subdir was spared from reconciliation. */
export type PreservedReason = "not-shipped" | "in-flight";

/** A present subdir kept in place, with the condition that spared it. */
export interface PreservedSubdir {
  subdir: string;
  reason: PreservedReason;
}

/** The reconcile/preserve partition of the present per-WU subdirs. */
export interface RetiredSubdirPlan {
  /** Subdirs to reconcile — every shipped subdir present locally. */
  reconcile: string[];
  /** Present subdirs spared, each tagged with the condition that spared it. */
  preserved: PreservedSubdir[];
}

export interface RetiredSubdirPlanInput {
  /** WU-name subdirs present locally under `user/{identity}/`. */
  localSubdirs: readonly string[];
  /** Shipped WU-name slugs (read from the `origin/<base>` `completed/` tree). */
  shipped: ReadonlySet<string>;
  /** WU-name slugs with a same-machine worktree still in flight. */
  inFlight?: ReadonlySet<string>;
}

/**
 * Partition present per-WU subdirs into reconcile vs. preserve.
 *
 * Pure and total over the input — no I/O, no current-WU input. Output preserves
 * `localSubdirs` iteration order. A shipped subdir reconciles unless a local
 * worktree is still in flight for that WU; a not-shipped one is preserved.
 *
 * @param input - Local subdirs plus the shipped reference set.
 * @returns The reconcile/preserve partition.
 */
export function planRetiredSubdirReconcile(
  input: RetiredSubdirPlanInput,
): RetiredSubdirPlan {
  const reconcile: string[] = [];
  const preserved: PreservedSubdir[] = [];
  const inFlight = input.inFlight ?? new Set<string>();

  for (const subdir of input.localSubdirs) {
    if (!input.shipped.has(subdir)) {
      preserved.push({ subdir, reason: "not-shipped" });
    } else if (inFlight.has(subdir)) {
      preserved.push({ subdir, reason: "in-flight" });
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
 * Basenames ARC itself writes into a per-WU user subdir. Anything else under
 * `<wu>/` is operator-stashed content — ARC permits arbitrary text files there —
 * which is what makes a retired-subdir removal worth announcing loudly.
 */
export const ARC_PER_WU_FILENAMES: ReadonlySet<string> = new Set(["SESSION-NOTES.md"]);

/**
 * The operator-stashed (non-ARC) files a subdir carries, named by their path
 * within the subdir, drawn from a set of manifest-relative paths. ARC ownership
 * is matched against the *within-subdir* path, so only `<wu>/SESSION-NOTES.md`
 * counts as ARC's own — a nested `<wu>/notes/SESSION-NOTES.md` is operator
 * content and reported as `notes/SESSION-NOTES.md`. Empty when the subdir holds
 * only ARC's own files — the signal that a retired-subdir removal is routine
 * rather than worth a louder "you stashed files here" notice.
 *
 * @param paths - Manifest-relative paths under `user/{identity}/`.
 * @param subdir - The per-WU subdir name to inspect.
 * @returns The stashed within-subdir paths, in `paths` iteration order.
 */
export function stashedFilesInSubdir(paths: Iterable<string>, subdir: string): string[] {
  const prefix = `${subdir}/`;
  const stashed: string[] = [];
  for (const path of paths) {
    if (wuNameOfPath(path) !== subdir) continue;
    const rel = path.slice(prefix.length);
    if (!ARC_PER_WU_FILENAMES.has(rel)) stashed.push(rel);
  }
  return stashed;
}
