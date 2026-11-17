/** Compute a projected file's local permission mode separately from record edit rights. */
import { projectionProcessState } from "./process-state.js";
import type { RecordEntry } from "./index-schema.js";

/** The mode requested by the worktree's archive policy. */
export type ProjectionLayMode = "read-only" | "writable";

/** Select the mode for this target worktree's entry and any save landing it owns. */
export function projectionLayMode(path: string, entry?: Pick<RecordEntry, "opened">, saveLanding = false): ProjectionLayMode {
  return path.startsWith(".arc/completed/") && (entry?.opened !== true || saveLanding) ? "read-only" : "writable";
}

/** A save landing is local to the saving checkout, even when its fan-out uses the same verb. */
export function isOwnSaveLanding(verb: string | undefined, checkout: string): boolean {
  return verb === "save" && projectionProcessState().command?.checkout === checkout;
}
