/**
 * `arc config status` probe implementations.
 *
 * Two entry points:
 *
 * - {@link runConfigStatus} — full settings view for default rendering.
 * - {@link runConfigSessionInitStatus} — init-gating subset consumed by
 *   the session-init harness.
 *
 * Both read through the shared {@link readConfigSettings} helper; the
 * session-init variant filters to the narrow key set documented in the
 * types module.
 *
 * @module
 */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import type {
  ConfigSessionInitOptions,
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./types.js";

const SESSION_INIT_KEYS = [
  "session.remote_sync",
  "branch.protection",
  "pm.mode",
  "commit.format",
  "commit.context_footer",
] as const satisfies ReadonlyArray<keyof ConfigSessionInitSettings>;

/** Produce the full settings view for `arc config status` (default mode). */
export async function runConfigStatus(
  options: ConfigStatusOptions,
): Promise<ConfigStatusResult> {
  const { settings, defaultsApplied, errors } = await readConfigSettings(options.cwd);
  return {
    mode: "full",
    settings,
    defaultsApplied,
    errors,
  };
}

/**
 * Produce the init-gating subset for `arc config status --session-init`.
 *
 * Narrow slice of settings that gate session-init decisions before a
 * dedicated workflow or method loads: sync probe gate, planning-branch
 * routing under full protection, capture routing, and first-commit format.
 */
export async function runConfigSessionInitStatus(
  options: ConfigSessionInitOptions,
): Promise<ConfigSessionInitResult> {
  const { settings, defaultsApplied, errors } = await readConfigSettings(options.cwd);
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
    errors,
  };
}
