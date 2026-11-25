/**
 * Type contracts for `arc config status`.
 *
 * The discriminated union on `mode` separates the full settings view from
 * the session-init-scoped subset. The full view carries raw settings;
 * the session-init view validates its selected policy values at the envelope
 * boundary. `hooks.*` keys are intentionally excluded from both
 * shapes: they are shell-consumed by git hooks, never by the agent.
 *
 */

import type { ConfigSettings } from "../../lib/config/schema.js";
import type { z } from "zod";
import type { ConfigSessionInitResultSchema, ConfigSessionInitSettingsSchema } from "./status.js";

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
export type ConfigSessionInitSettings = z.infer<typeof ConfigSessionInitSettingsSchema>;

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
export type ConfigSessionInitResult = z.infer<typeof ConfigSessionInitResultSchema>;

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
