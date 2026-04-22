/**
 * Type contracts for `arc config status`.
 *
 * The discriminated union on `mode` separates the full settings view from
 * the session-init-scoped subset. Settings values are raw strings —
 * consumers interpret against the enum semantics documented in
 * arc-config.yml. `hooks.*` keys are intentionally excluded from both
 * shapes: they are shell-consumed by git hooks, never by the agent.
 */

/** All agent-consumable arc-config settings. Raw string values. */
export interface ConfigSettings {
  "branch.base": string;
  "branch.protection": string;
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
  "user.sync_push": string;
}

/**
 * Init-gating subset — fields that affect session-init decisions before a
 * dedicated workflow or method loads (sync probe, planning branch under
 * full protection, capture routing, commit format for first commit).
 */
export interface ConfigSessionInitSettings {
  "session.remote_sync": string;
  "branch.protection": string;
  "pm.mode": string;
  "commit.format": string;
  "commit.context_footer": string;
}

/** Full settings view — default rendering. */
export interface ConfigStatusResult {
  mode: "full";
  settings: ConfigSettings;
  /** Keys where the on-disk value was absent and a documented default was substituted. */
  defaultsApplied: string[];
  /** Diagnostics (e.g., arc-config.yml missing). Empty on a clean read. */
  errors: string[];
}

/** Session-init-scoped result — the init-gating subset only. */
export interface ConfigSessionInitResult {
  mode: "session-init";
  settings: ConfigSessionInitSettings;
  defaultsApplied: string[];
  errors: string[];
}

export type ConfigResult = ConfigStatusResult | ConfigSessionInitResult;

export interface ConfigStatusOptions {
  cwd: string;
}

export interface ConfigSessionInitOptions {
  cwd: string;
}
