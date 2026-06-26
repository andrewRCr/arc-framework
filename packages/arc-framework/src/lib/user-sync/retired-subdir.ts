/**
 * Pure retired-subdir reconciliation decision — the read-only "which per-WU
 * subdirs are safe to reconcile?" half of retired-subdir cleanup. Removal (the
 * `.internal/` backup + recursive delete) is the caller's; this module only
 * classifies.
 *
 * A per-WU user subdir under `user/{identity}/` is *retired* — reconcilable —
 * only when both of these hold:
 *
 * - its WU has shipped (its slug is in the shipped set, read from `origin/<base>`),
 * - it carries no unpushed local drift (no unsaved work at risk).
 *
 * The shipped gate is load-bearing for the no-current-WU path (an errand or
 * `main` session): there, every local subdir looks "not the current WU", so
 * without the shipped gate the reconcile would sweep every in-flight WU's
 * workspace. Gating on shipped confines it to genuinely-retired subdirs without
 * needing a current-WU input. The drift gate replaces the former recency-window
 * proxy — it answers "is there unsaved local work here?" directly rather than by
 * how recently a note carried the subdir.
 *
 * @module
 */

import { wuNameOfPath } from "./classifier.js";

/** Why a present subdir was spared from reconciliation. */
export type PreservedReason = "not-shipped" | "has-drift";

/** A present subdir kept in place, with the condition that spared it. */
export interface PreservedSubdir {
  subdir: string;
  reason: PreservedReason;
}

/** The reconcile/preserve partition of the present per-WU subdirs. */
export interface RetiredSubdirPlan {
  /** Subdirs to reconcile — shipped AND carrying no unpushed local drift. */
  reconcile: string[];
  /** Present subdirs spared, each tagged with the condition that spared it. */
  preserved: PreservedSubdir[];
}

export interface RetiredSubdirPlanInput {
  /** WU-name subdirs present locally under `user/{identity}/`. */
  localSubdirs: readonly string[];
  /** Shipped WU-name slugs (read from the `origin/<base>` `completed/` tree). */
  shipped: ReadonlySet<string>;
  /** Subdirs carrying unpushed local drift (possible unsaved work) — preserved. */
  driftingSubdirs: ReadonlySet<string>;
}

/**
 * Partition present per-WU subdirs into reconcile vs. preserve.
 *
 * Pure and total over the input — no I/O, no current-WU input. Output preserves
 * `localSubdirs` iteration order. The shipped check precedes the drift check, so
 * a not-shipped subdir is preserved as `not-shipped` regardless of incidental
 * drift — a live WU's workspace is never reconciled, and the dominant gate names
 * the reason.
 *
 * @param input - Local subdirs plus the shipped and drifting reference sets.
 * @returns The reconcile/preserve partition.
 */
export function planRetiredSubdirReconcile(
  input: RetiredSubdirPlanInput,
): RetiredSubdirPlan {
  const reconcile: string[] = [];
  const preserved: PreservedSubdir[] = [];

  for (const subdir of input.localSubdirs) {
    if (!input.shipped.has(subdir)) {
      preserved.push({ subdir, reason: "not-shipped" });
    } else if (input.driftingSubdirs.has(subdir)) {
      preserved.push({ subdir, reason: "has-drift" });
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
