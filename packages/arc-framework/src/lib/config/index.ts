/**
 * Arc-config.yml parsing, writing, and config/token map assembly.
 *
 * Shared by init (writes config from prompts) and update (rebuilds maps
 * from stored install_config). Also used by cli.ts to read existing config
 * during join mode.
 */

import { CONFIG_KEY_PM_MODE, CONFIG_KEY_TEAM_MODE } from "../constants.js";

// --- Config Key Overrides ---

/**
 * Build the config key overrides for arc-config.yml rendering.
 *
 * Produces the map of dotted config keys that should be programmatically
 * set in the rendered arc-config.yml (overriding template defaults).
 * Used by both init and update to ensure consistent config rendering.
 *
 * @param source - Prompt results or stored install config
 * @returns Config key override map for `renderConfigOverrides`
 */
export function buildConfigKeyOverrides(
  source: { pm_mode: string; team_mode?: boolean },
): Record<string, string> {
  return {
    [CONFIG_KEY_PM_MODE]: source.pm_mode,
    [CONFIG_KEY_TEAM_MODE]: String(source.team_mode ?? false),
    "user.notes_push": source.team_mode ? "prompt" : "on-sync",
  };
}

// --- Config Map Assembly ---

/**
 * Build the condition evaluation config map from prompt results.
 *
 * Maps prompt responses to the dotted keys used in recipe conditions:
 * - `pm.mode` from pm_mode selection
 * - `tools` as comma-separated string from tools multiselect
 *
 * @param source - Prompt results or stored install config
 * @returns Config map for condition evaluation
 */
export function buildConfigMap(
  source: { pm_mode: string; tools: string[]; team_mode?: boolean },
): Record<string, string> {
  return {
    [CONFIG_KEY_PM_MODE]: source.pm_mode,
    "tools": source.tools.join(","),
    [CONFIG_KEY_TEAM_MODE]: String(source.team_mode ?? false),
  };
}

/**
 * Build the token substitution map from prompt results or install config.
 *
 * Only init-time tokens are included here. Guide-text placeholders in
 * template files are left untouched by the render engine.
 *
 * @param source - Prompt results or stored install config
 * @param cwd - Repository root directory
 * @returns Token map for `{{TOKEN}}` substitution
 */
export function buildTokenMap(
  source: { project_name: string },
  cwd: string,
): Record<string, string> {
  return {
    PROJECT_NAME: source.project_name,
    REPO_ROOT: cwd,
  };
}

// --- arc-config.yml Parsing ---

/**
 * Parse an arc-config.yml file into a key-value map.
 *
 * Reads the flat `key.name: value` format, skipping comments and blank lines.
 *
 * @param content - Raw file content
 * @returns Map of dotted config keys to string values
 */
export function parseArcConfig(content: string): Record<string, string> {
  const config: Record<string, string> = {};
  // Normalize CRLF to LF before parsing (cross-platform safety)
  const normalized = content.replace(/\r\n/g, "\n");
  for (const line of normalized.split("\n")) {
    const match = line.match(/^([\w.]+):\s*(.*)$/);
    if (match) {
      const [, key = "", rawValue = ""] = match;
      let value = rawValue.trim();
      // Skip empty values — matches shell-side arc_config_get behavior
      // where empty values fall through to the default
      if (!value) continue;
      // Strip surrounding quotes (matches shell-side sed patterns)
      // Shell: sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/"
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      config[key] = value;
    }
  }
  return config;
}
