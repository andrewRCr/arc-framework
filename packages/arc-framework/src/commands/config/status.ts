/**
 * `arc config status` probe implementations.
 *
 * Two entry points:
 *
 * - {@link runConfigStatus} — full settings view for default rendering.
 * - {@link runConfigSessionInitStatus} — init-gating subset consumed by
 *   the session-init harness.
 *
 * The full view reads through {@link readConfigSettings} (yaml-only); the
 * session-init variant reads through {@link resolveAllSettings} so
 * `user.notes_push` reflects any git-config override without requiring a
 * downstream re-probe. Both then filter to the narrow key set documented
 * in the types module.
 *
 * @module
 */

import { readFile as nodeReadFile } from "node:fs/promises";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { gitExec } from "../../lib/io-context.js";
import type {
  ConfigSessionInitOptions,
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./types.js";

const SESSION_INIT_KEYS = [
  "session.remote_sync",
  "session.init_pull.worktree",
  "session.init_pull.notes",
  "session.init_load.notes",
  "user.notes_push",
  "branch.protection",
  "pm.mode",
  "commit.format",
  "commit.context_footer",
] as const satisfies ReadonlyArray<keyof ConfigSessionInitSettings>;

/** Produce the full settings view for `arc config status` (default mode). */
export async function runConfigStatus(
  options: ConfigStatusOptions,
): Promise<ConfigStatusResult> {
  const { settings, defaultsApplied, warnings } = await readConfigSettings(options.cwd);
  return {
    mode: "full",
    settings,
    defaultsApplied,
    warnings,
  };
}

/**
 * Produce the init-gating subset for `arc config status --session-init`.
 *
 * Narrow slice of settings that gate session-init decisions before a
 * dedicated workflow or method loads: sync probe gate, planning-branch
 * routing under full protection, capture routing, first-commit format,
 * and `user.notes_push`.
 *
 * `user.notes_push` is three-tier-resolved (git-config → yaml → default) so
 * downstream consumers read its final value without re-probing.
 * `defaultsApplied` retains its yaml-absence semantics — `user.notes_push`
 * may appear there while its resolved source is `"git-config"`.
 */
export async function runConfigSessionInitStatus(
  options: ConfigSessionInitOptions,
): Promise<ConfigSessionInitResult> {
  const exec = options.exec ?? gitExec;
  const readFile = options.readFile ?? ((path: string) => nodeReadFile(path, "utf-8"));
  const { settings, defaultsApplied, warnings } = options.resolvedSettings
    ?? await resolveAllSettings({
      cwd: options.cwd,
      exec,
      readFile,
    });
  const scoped = {} as ConfigSessionInitSettings;
  for (const key of SESSION_INIT_KEYS) {
    scoped[key] = settings[key];
  }
  const scopedKeys: readonly string[] = SESSION_INIT_KEYS;
  const scopedDefaults = defaultsApplied.filter((k) => scopedKeys.includes(k));

  return {
    mode: "session-init",
    settings: scoped,
    defaultsApplied: scopedDefaults,
    warnings,
  };
}
