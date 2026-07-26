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
import { ARC_CONFIG_SUFFIX } from "../constants.js";
import { materializeArcPath, resolveArcPath } from "../layout/index.js";
import {
  AGENT_CONSUMABLE_CONFIG_FIELDS,
  ConfigSettingsSchema,
  getArcConfigField,
  type AgentConsumableConfigKey,
  type ConfigSettings,
} from "./schema.js";

export { AGENT_CONSUMABLE_CONFIG_FIELDS } from "./schema.js";

/**
 * Per-key allowed value sets for keys validated at parse time. Keys absent
 * from this map are passed through verbatim — shell-side `validate-config.sh`
 * remains the broader enum gate. `user.notes_push` is intentionally absent —
 * see the module-level layering-boundary note.
 */
const TOLERANT_POLICY_KEYS = [
  "session.init_pull.worktree",
  "session.init_pull.notes",
  "session.init_pull.base",
  "session.init_load.notes",
  "sync.auto_pull",
  "archive.cadence",
] as const satisfies readonly AgentConsumableConfigKey[];

function allowedValues(key: (typeof TOLERANT_POLICY_KEYS)[number]): readonly string[] {
  const policy = getArcConfigField(key).policy;
  if (policy.kind === "enum") return policy.values;
  return ["true", "false"];
}

const ENUM_VALIDATORS = Object.fromEntries(
  TOLERANT_POLICY_KEYS.map((key) => [key, allowedValues(key)]),
) as Partial<Record<AgentConsumableConfigKey, readonly string[]>>;

/** The set of agent-consumable keys — all settings except `hooks.*`. */
export const AGENT_CONSUMABLE_KEYS = AGENT_CONSUMABLE_CONFIG_FIELDS.map(({ key }) => key);

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
  const configPath = join(materializeArcPath(cwd, resolveArcPath({ kind: "arc-root" })), ...ARC_CONFIG_SUFFIX);
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

  const settings: Record<string, string> = {};
  for (const { key, defaultValue } of AGENT_CONSUMABLE_CONFIG_FIELDS) {
    const value = raw[key];
    if (value === undefined) {
      settings[key] = defaultValue;
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
      settings[key] = defaultValue;
      continue;
    }
    settings[key] = value;
  }

  return {
    settings: ConfigSettingsSchema.parse(settings),
    defaultsApplied,
    warnings,
  };
}
