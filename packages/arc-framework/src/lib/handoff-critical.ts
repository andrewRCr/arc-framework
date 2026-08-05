/**
 * Handoff-critical command allowlist for the dev-mode stale-build guard.
 *
 * Decides, for a given CLI command, whether a stale `dist/cli.js` must
 * fail-fast (refuse) rather than warn. Refuse for:
 * - cross-machine state (`sync`, `user save/push/sync`)
 * - gate work (`release commit/push`, session-init/handoff probes, merge lock verbs)
 * - tracked-state remedies (`hook-remedy-roadmap-conflict`)
 * - **lifecycle mutations** that mint durable branch/record state (`errand open`
 *   and siblings, `start`) so a stale build never creates a branch then only
 *   refuses later at `release commit`
 *
 * Read-only peers (e.g. `errand check`) stay warn-only.
 *
 * The one exception is the compaction-seed write: it snapshots live git and
 * task-list state for post-compaction recovery and is re-validated when
 * recovery reads it, so emitting a possibly-stale-logic seed is strictly safer
 * than emitting none. It downgrades to warn so the seed always lands, even mid
 * active development when `dist/` inevitably lags `src/`.
 *
 * Kept decoupled from commander (plain command shape) so the allowlist is unit
 * testable without importing `cli.ts`, whose module body parses and runs.
 *
 * @module
 */

/** Minimal command shape the allowlist reads — adapted from a commander `Command`. */
export interface HandoffCommand {
  /** Leaf command name, e.g. `status`. */
  name: string;
  /** Immediate parent command name, e.g. `arc` or `release`. */
  parentName: string | undefined;
  /** Parsed options for the command (camelCased flag names). */
  opts: Record<string, unknown>;
}

/** Whether a stale dev build must fail-fast for this command (vs. warn-only). */
export function isHandoffCritical(cmd: HandoffCommand): boolean {
  const { name, parentName, opts } = cmd;
  if (parentName === "arc" && name === "sync") return true;
  if (parentName === "arc" && name === "start") return true;
  if (parentName === "arc" && name === "hook-remedy-roadmap-conflict") return true;
  if (parentName === "user" && (name === "save" || name === "push" || name === "sync")) return true;
  if (parentName === "release" && (name === "commit" || name === "push")) return true;
  // Keys on the immediate parent: for `arc merge lock <verb>` that is `lock`,
  // the same shape as the `hosted` nested group below.
  if (parentName === "lock" && ["resolve", "hold", "release"].includes(name)) return true;
  if (parentName === "hosted" && (name === "request" || name === "settle")) return true;
  // Errand mutators mint branches/records; refuse before those land. `check` is advisory.
  if (
    parentName === "errand"
    && (name === "open" || name === "close" || name === "promote" || name === "link" || name === "retire")
  ) {
    return true;
  }
  if (parentName === "arc" && name === "status") {
    // The seed write must emit even against stale dist — a recovery snapshot,
    // revalidated on read, beats no snapshot. Warn, don't refuse.
    if (opts.writeCompactionSeed === true) return false;
    if (opts.json === true && (opts.sessionInit === true || opts.sessionHandoff === true)) {
      return true;
    }
  }
  return false;
}
