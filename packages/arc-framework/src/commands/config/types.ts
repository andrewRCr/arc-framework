/**
 * Type contracts for `arc config status`.
 *
 * The discriminated union on `mode` separates the full settings view from
 * the session-init-scoped subset. Settings values are raw strings —
 * consumers interpret against the enum semantics documented in
 * arc-config.yml. `hooks.*` keys are intentionally excluded from both
 * shapes: they are shell-consumed by git hooks, never by the agent.
 *
 * The session-init result also carries a top-level `autonomy` field with
 * resolved-with-provenance shape — agent-consumed at session-init time
 * (the agent renders the structured task-completion prompt against it).
 * Distinct from the raw `settings` map, which stays string-valued.
 */

import type { AutonomyPolicy } from "../../lib/autonomy-policy.js";
import type { GitExec } from "../../lib/git/index.js";

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
  "session.init_pull.worktree": string;
  "session.init_pull.notes": string;
  "user.sync_push": string;
}

/**
 * Init-gating subset — fields that affect session-init decisions before a
 * dedicated workflow or method loads (sync probe, planning branch under
 * full protection, capture routing, commit format for first commit).
 */
export interface ConfigSessionInitSettings {
  "session.remote_sync": string;
  "session.init_pull.worktree": string;
  "session.init_pull.notes": string;
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
  /** Non-fatal diagnostics (file-access failures, invalid enum values). Empty on a clean read. */
  warnings: string[];
}

/** Session-init-scoped result — the init-gating subset plus resolved autonomy. */
export interface ConfigSessionInitResult {
  mode: "session-init";
  settings: ConfigSessionInitSettings;
  defaultsApplied: string[];
  warnings: string[];
  autonomy: {
    value: AutonomyPolicy;
    source: "git-config" | "yaml" | "default";
  };
}

export type ConfigResult = ConfigStatusResult | ConfigSessionInitResult;

export interface ConfigStatusOptions {
  cwd: string;
}

export interface ConfigSessionInitOptions {
  cwd: string;
  /** Required for `git config arc.autonomy` lookup at the resolver's git-config tier. */
  exec: GitExec;
}
