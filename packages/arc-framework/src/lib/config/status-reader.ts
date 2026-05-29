/**
 * Reader for `arc config status` — reads arc-config.yml, applies documented
 * defaults for absent keys, and returns the agent-consumable settings set.
 *
 * Shared by config status and handler code that needs session-relevant config
 * without maintaining bespoke one-key readers. `hooks.*` keys are excluded —
 * shell-consumed by git hooks, not by agents.
 *
 * **Layering boundary.** `user.notes_push` is deliberately omitted from
 * `ENUM_VALIDATORS`. Its yaml value flows through this reader as a raw
 * string; validation belongs to `resolveAllSettings` (the wrapper that
 * composes this reader with `resolveGitConfigOverride`). Single source of
 * truth — no double-validation across yaml and git-config tiers. Callers
 * needing the resolved value use the wrapper; callers consuming raw yaml
 * (`arc config status`) stay on this reader.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseArcConfig } from "./index.js";
import { ARC_CONFIG_SEGMENTS } from "../constants.js";
import type { ConfigSettings } from "../../commands/config/types.js";

/**
 * Documented defaults from arc-config.yml inline comments. When a key is
 * absent (missing file or omitted in the file), the reader substitutes the
 * corresponding value here and records the key in `defaultsApplied`.
 */
const DEFAULTS: ConfigSettings = {
  "branch.base": "main",
  "branch.protection": "partial",
  "worktree.location_template": "../{repo}.{branch}",
  "commit.format": "conventional",
  "commit.context_footer": "required",
  "commit.custom_pattern": "",
  "commit.context_pattern": "",
  "merge.strategy": "merge",
  "review.pre_merge": "enabled",
  "platform.type": "github",
  "pm.mode": "none",
  "team.mode": "false",
  "session.remote_sync": "enabled",
  "session.init_pull.worktree": "prompt",
  "session.init_pull.notes": "prompt",
  "session.init_load.notes": "prompt",
  "archive.cadence": "with-integration",
  "user.notes_push": "on-sync",
  "errands.staleness_days": "3",
};

/**
 * Per-key allowed value sets for keys validated at parse time. Keys absent
 * from this map are passed through verbatim — shell-side `validate-config.sh`
 * remains the broader enum gate. `user.notes_push` is intentionally absent —
 * see the module-level layering-boundary note.
 */
const ENUM_VALIDATORS: Partial<Record<keyof ConfigSettings, readonly string[]>> = {
  "session.init_pull.worktree": ["manual", "prompt"],
  "session.init_pull.notes": ["manual", "prompt", "always"],
  "session.init_load.notes": ["manual", "prompt", "always"],
  "archive.cadence": ["with-integration", "manual"],
};

/** The set of agent-consumable keys — all settings except `hooks.*`. */
export const AGENT_CONSUMABLE_KEYS = Object.keys(DEFAULTS) as Array<keyof ConfigSettings>;

export interface ReaderResult {
  settings: ConfigSettings;
  defaultsApplied: string[];
  warnings: string[];
}

/**
 * Read arc-config.yml and return the agent-consumable settings map with
 * documented defaults filled in for any absent keys.
 *
 * `settings` always resolves to a complete map; `warnings` carries
 * non-fatal diagnostics (file-access failures, invalid enum values) for
 * the caller to surface — both recoverable, since defaults substitute.
 */
export async function readConfigSettings(cwd: string): Promise<ReaderResult> {
  const configPath = join(cwd, ...ARC_CONFIG_SEGMENTS);
  const warnings: string[] = [];
  const defaultsApplied: string[] = [];

  let raw: Record<string, string> = {};
  try {
    const content = await readFile(configPath, "utf8");
    raw = parseArcConfig(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Unable to read arc-config.yml: ${message}`);
  }

  const settings = {} as ConfigSettings;
  for (const key of AGENT_CONSUMABLE_KEYS) {
    const value = raw[key];
    if (value === undefined) {
      settings[key] = DEFAULTS[key];
      defaultsApplied.push(key);
      continue;
    }
    const allowed = ENUM_VALIDATORS[key];
    if (allowed && !allowed.includes(value)) {
      // Invalid enum value: substitute the documented default and surface
      // a parse-time diagnostic. We do not record the key as defaulted —
      // `defaultsApplied` means "absent in the file".
      warnings.push(
        `${key}: '${value}' is not valid (expected: ${allowed.join(" | ")})`,
      );
      settings[key] = DEFAULTS[key];
      continue;
    }
    settings[key] = value;
  }

  return { settings, defaultsApplied, warnings };
}
