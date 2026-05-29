/**
 * Type contracts for `arc config status`.
 *
 * The discriminated union on `mode` separates the full settings view from
 * the session-init-scoped subset. Settings values are raw strings —
 * consumers interpret against the enum semantics documented in
 * arc-config.yml. `hooks.*` keys are intentionally excluded from both
 * shapes: they are shell-consumed by git hooks, never by the agent.
 *
 */

/** All agent-consumable arc-config settings. Raw string values. */
export interface ConfigSettings {
  "branch.base": string;
  "branch.protection": string;
  "worktree.location_template": string;
  "commit.format": string;
  "commit.context_footer": string;
  "commit.custom_pattern": string;
  "commit.context_pattern": string;
  "merge.strategy": string;
  "review.pre_merge": string;
  "platform.type": string;
  "pm.mode": string;
  "team.mode": string;
  "session.remote_sync": string;
  "session.init_pull.worktree": string;
  "session.init_pull.notes": string;
  "session.init_load.notes": string;
  "archive.cadence": string;
  "user.notes_push": string;
  "errands.staleness_days": string;
}

/**
 * Init-gating subset — fields that affect session-init decisions before a
 * dedicated workflow or method loads (sync probe, planning branch under
 * full protection, capture routing, commit format for first commit,
 * commit/push interlock modes for prompt-prefix composition).
 *
 * `user.notes_push` carries a three-tier-resolved value (git-config → yaml
 * → default); `commit.interlock` / `push.interlock` carry git-config-resolved
 * values from `arc.commitInterlock` / `arc.pushInterlock` (with documented
 * defaults when unset); other keys carry raw yaml values per
 * `readConfigSettings`.
 */
export interface ConfigSessionInitSettings {
  "session.remote_sync": string;
  "session.init_pull.worktree": string;
  "session.init_pull.notes": string;
  "session.init_load.notes": string;
  "user.notes_push": string;
  "branch.protection": string;
  "pm.mode": string;
  "commit.format": string;
  "commit.context_footer": string;
  "commit.interlock": string;
  "push.interlock": string;
}

/** Full settings view — default rendering. */
export interface ConfigStatusResult {
  mode: "full";
  settings: ConfigSettings;
  /** Keys where the on-disk value was absent and a documented default was substituted. */
  defaultsApplied: string[];
  /** Non-fatal diagnostics (file-access failures, invalid enum values). Empty on a clean read. */
  warnings: string[];
}

/** Session-init-scoped result — the init-gating subset. */
export interface ConfigSessionInitResult {
  mode: "session-init";
  settings: ConfigSessionInitSettings;
  defaultsApplied: string[];
  warnings: string[];
}

export type ConfigResult = ConfigStatusResult | ConfigSessionInitResult;

export interface ConfigStatusOptions {
  cwd: string;
}

export interface ConfigSessionInitOptions {
  cwd: string;
  /** Optional pre-resolved settings from a parent orchestrator; avoids duplicate release-mode probes. */
  resolvedSettings?: import("../../lib/config/resolved-settings.js").ResolvedSettingsResult;
  /** Optional git-exec injection for tests; defaults to the real `gitExec`. */
  exec?: import("../../lib/git/index.js").GitExec;
  /** Optional file-reader injection for tests; defaults to `node:fs/promises` `readFile`. */
  readFile?: (path: string) => Promise<string>;
}
