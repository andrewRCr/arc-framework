/**
 * Interactive prompts for `arc init --reconfigure`.
 *
 * Settings screen — presents current install_config values as defaults,
 * lets the user change what they want. Only structural settings (pm_mode,
 * team_mode, project_name) are prompted; tools go through the add-agent
 * workflow.
 *
 * @module
 */

import * as p from "@clack/prompts";
import type { InstallConfig } from "../lib/types.js";

/** PM mode options matching the init prompt options. */
const PM_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "ARC Core" },
  { value: "arc-in-git", label: "ARC Core + Planning Module" },
  { value: "external", label: "ARC Core + External Tracker" },
];

/** Result from the reconfigure prompt sequence. */
export interface ReconfigurePromptResult {
  project_name: string;
  pm_mode: string;
  team_mode: boolean;
}

/**
 * Run the interactive reconfigure prompt sequence.
 *
 * Shows current values as defaults — the user changes only what they want.
 * Tools are excluded (handled by add-agent workflow).
 *
 * @param current - Current install config from the manifest
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runReconfigurePrompts(
  current: InstallConfig,
): Promise<ReconfigurePromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {
    p.log.message("Change the settings you want, press Enter to keep current values.");

    // 1. Project name
    const project_name = await p.text({
      message: "Project name?",
      defaultValue: current.project_name,
      placeholder: current.project_name,
    });
    if (p.isCancel(project_name)) {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    // 2. PM mode
    const pm_mode = await p.select({
      message: "Project management approach?",
      options: PM_MODE_OPTIONS,
      initialValue: current.pm_mode,
    });
    if (p.isCancel(pm_mode)) {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    // 3. Team mode
    const team_mode = await p.confirm({
      message: "Enable multi-developer coordination? (ARC Team Mode)",
      initialValue: current.team_mode ?? false,
    });
    if (p.isCancel(team_mode)) {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    // Team mode warning — only when enabling (not already enabled)
    if (team_mode && !(current.team_mode ?? false)) {
      p.log.warn(
        "Team mode changes affect all developers in this repository.\n" +
        "Other team members will see the new settings after their next 'arc update'.",
      );
    }

    return { project_name, pm_mode, team_mode };
  } catch (err) {
    if (typeof err === "symbol") return null;
    throw err;
  }
}

/**
 * Build new InstallConfig from reconfigure prompt results and current config.
 *
 * Merges prompt results (structural settings) with carried-forward values
 * (tools). Handles missing team_mode in old manifests by defaulting to false.
 *
 * @param promptResult - Results from interactive or non-interactive prompts
 * @param currentConfig - Current install config from the manifest
 * @returns Complete InstallConfig for the reconfigure operation
 */
export function buildReconfigureConfig(
  promptResult: ReconfigurePromptResult,
  currentConfig: InstallConfig,
): InstallConfig {
  return {
    project_name: promptResult.project_name,
    pm_mode: promptResult.pm_mode,
    tools: currentConfig.tools, // Carried forward — tools change via add-agent
    team_mode: promptResult.team_mode,
  };
}

/**
 * Build ReconfigurePromptResult from CLI flags for non-interactive mode.
 *
 * Uses current config values as defaults, overriding only what the user
 * explicitly specified via flags.
 *
 * @param currentConfig - Current install config from the manifest
 * @param opts - CLI flag values (undefined = use current)
 * @returns Prompt result with current values as defaults
 */
export function buildNonInteractiveReconfigurePrompts(
  currentConfig: InstallConfig,
  opts: { name?: string; pmMode?: string; team?: boolean },
): ReconfigurePromptResult {
  return {
    project_name: opts.name ?? currentConfig.project_name,
    pm_mode: opts.pmMode ?? currentConfig.pm_mode,
    team_mode: opts.team ?? currentConfig.team_mode ?? false,
  };
}

/**
 * Check whether the prompt result matches the current config (no changes).
 *
 * @param result - Prompt results to compare
 * @param currentConfig - Current install config from the manifest
 * @returns true if all values are identical
 */
export function isNoChange(
  result: ReconfigurePromptResult,
  currentConfig: InstallConfig,
): boolean {
  return (
    result.project_name === currentConfig.project_name &&
    result.pm_mode === currentConfig.pm_mode &&
    result.team_mode === (currentConfig.team_mode ?? false)
  );
}
