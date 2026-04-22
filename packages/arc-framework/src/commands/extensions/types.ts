/**
 * Type contracts for `arc extensions status`.
 *
 * The discriminated union on `mode` separates the full-state view
 * (default + `--all`) from the session-init-scoped view consumed by the
 * agent harness, so callers branch once on shape.
 */

import type { ExtensionPointRef } from "../../lib/extensions/point-scanner.js";

/** One extension as it appears in the extensions directory. */
export interface ExtensionSummary {
  name: string;
  active: boolean;
  description: string;
}

/** A reference whose target no longer exists in the extensions directory. */
export type ExtensionOrphanEntry = ExtensionPointRef;

/** Full status for default rendering and `--all`. */
export interface ExtensionsStatusResult {
  mode: "full";
  extensions: ExtensionSummary[];
  activeCount: number;
  inactiveCount: number;
  orphanCount: number;
  /** Per-reference orphan detail; populated only when `includeOrphanDetails`. */
  orphans: ExtensionOrphanEntry[];
  includeOrphanDetails: boolean;
  /** Diagnostics from malformed extension frontmatter, keyed by filename. */
  warnings: string[];
}

/** Session-init-scoped result — the active-extensions list only. */
export interface ExtensionsSessionInitResult {
  mode: "session-init";
  active: string[];
}

export type ExtensionsResult = ExtensionsStatusResult | ExtensionsSessionInitResult;

export interface ExtensionsStatusOptions {
  cwd: string;
  /** Include the full orphan detail list (otherwise only the count). */
  includeOrphanDetails?: boolean;
}

export interface ExtensionsSessionInitOptions {
  cwd: string;
}
