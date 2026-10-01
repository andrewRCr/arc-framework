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
import { z } from "zod";

import { resolveAllSettings } from "../../lib/config/resolved-settings.js";
import { getArcConfigField } from "../../lib/config/schema.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { gitExec } from "../../lib/io-context.js";
import { CommitInterlockSchema, PushInterlockSchema } from "../../lib/release/schema.js";
import type {
  ConfigSessionInitOptions,
  ConfigSessionInitResult,
  ConfigSessionInitSettings,
  ConfigStatusOptions,
  ConfigStatusResult,
} from "./types.js";

/** Strict policy values for the session-init settings selected from the catalog. */
export const ConfigSessionInitSettingsSchema = z.strictObject({
  "session.remote_sync": z.enum(getArcConfigField("session.remote_sync").policy.values),
  "session.init_pull.worktree": z.enum(getArcConfigField("session.init_pull.worktree").policy.values),
  "session.init_pull.notes": z.enum(getArcConfigField("session.init_pull.notes").policy.values),
  "session.init_pull.base": z.enum(getArcConfigField("session.init_pull.base").policy.values),
  "session.init_load.notes": z.enum(getArcConfigField("session.init_load.notes").policy.values),
  "user.notes_push": z.enum(getArcConfigField("user.notes_push").policy.values),
  "branch.protection": z.enum(getArcConfigField("branch.protection").policy.values),
  "pm.mode": z.enum(getArcConfigField("pm.mode").policy.values),
  "commit.format": z.enum(getArcConfigField("commit.format").policy.values),
  "commit.context_footer": z.enum(getArcConfigField("commit.context_footer").policy.values),
  "commit.interlock": CommitInterlockSchema,
  "push.interlock": PushInterlockSchema,
});

/** Full strict session-init configuration result. */
export const ConfigSessionInitResultSchema = z.strictObject({
  mode: z.literal("session-init"),
  settings: ConfigSessionInitSettingsSchema,
  defaultsApplied: z.array(z.string()),
  warnings: z.array(z.string()),
});

const SESSION_INIT_KEYS = [
  "session.remote_sync",
  "session.init_pull.worktree",
  "session.init_pull.notes",
  "session.init_pull.base",
  "session.init_load.notes",
  "user.notes_push",
  "branch.protection",
  "pm.mode",
  "commit.format",
  "commit.context_footer",
  "commit.interlock",
  "push.interlock",
] as const satisfies ReadonlyArray<keyof ConfigSessionInitSettings>;

const RESOLVED_KEY_SOURCES = {
  "commit.interlock": "commitInterlock",
  "push.interlock": "pushInterlock",
} as const;

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
  const { settings, resolved, defaultsApplied, warnings } = options.resolvedSettings
    ?? await resolveAllSettings({
      cwd: options.cwd,
      exec,
      readFile,
    });
  const scoped: Record<string, string> = {};
  for (const key of SESSION_INIT_KEYS) {
    if (key in RESOLVED_KEY_SOURCES) {
      const source = RESOLVED_KEY_SOURCES[key as keyof typeof RESOLVED_KEY_SOURCES];
      scoped[key] = resolved[source].value;
    } else {
      scoped[key] = settings[key as keyof typeof settings];
    }
  }
  const scopedKeys: readonly string[] = SESSION_INIT_KEYS;
  const scopedDefaults = defaultsApplied.filter((k) => scopedKeys.includes(k));

  return {
    mode: "session-init",
    settings: scoped as ConfigSessionInitSettings,
    defaultsApplied: scopedDefaults,
    warnings,
  };
}
