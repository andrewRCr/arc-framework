/**
 * Arc-config.yml parsing, writing, and config/token map assembly.
 *
 * Shared by init (writes config from prompts) and update (rebuilds maps
 * from stored install_config). Also used by cli.ts to read existing config
 * during join mode.
 */

import type { ReadFileFn, WriteFileFn } from "./template/index.js";
import { CONFIG_KEY_PM_MODE, CONFIG_KEY_TEAM_MODE } from "./constants.js";

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

// --- arc-config.yml I/O ---

/**
 * Write arc-config.yml by reading the template and overwriting specific values.
 *
 * Preserves all comments and structure from the template. Only lines matching
 * a `config_key` pattern (`key: value`) are overwritten. This gives adopters
 * the full documented config file with their chosen values.
 *
 * @param templatePath - Path to the template arc-config.yml
 * @param destPath - Path to write the output
 * @param configKeys - Map of dotted config keys to values (e.g., `pm.mode` → `arc-in-git`)
 * @param readFile - Injectable read function
 * @param writeFile - Injectable write function
 */
export async function writeArcConfig(
  templatePath: string,
  destPath: string,
  configKeys: Record<string, string>,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  const content = await readFile(templatePath);
  const lines = content.split("\n");

  const result = lines.map((line) => {
    // Match config lines: "key.name: value" (not comments or blank lines)
    const match = line.match(/^([\w.]+):\s*(.*)$/);
    if (match) {
      const key = match[1]!;
      if (key in configKeys) {
        return `${key}: ${configKeys[key]}`;
      }
    }
    return line;
  });

  await writeFile(destPath, result.join("\n"));
}

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
  for (const line of content.split("\n")) {
    const match = line.match(/^([\w.]+):\s*(.*)$/);
    if (match) {
      config[match[1]!] = match[2]!.trim();
    }
  }
  return config;
}
