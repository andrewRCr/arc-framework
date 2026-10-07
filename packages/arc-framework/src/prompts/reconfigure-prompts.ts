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
import { declarePromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";

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
 * @param context - Invocation interaction and authority
 * @param supplied - Explicit values supplied by the command adapter
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runReconfigurePrompts(
  current: InstallConfig,
  context: InteractionContext,
  supplied: {
    readonly projectName?: string;
    readonly pmMode?: string;
    readonly teamMode?: boolean;
  } = {},
): Promise<ReconfigurePromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {
    if (context.interaction === "allowed") p.log.message("Change the settings you want, press Enter to keep current values.");

    // 1. Project name
    const nameAnswer = await prompt(reconfigureNamePromptSite, context, {
        message: "Project name?",
        defaultValue: current.project_name,
        placeholder: current.project_name,
        runtimeDefault: current.project_name,
        explicitAnswer: supplied.projectName,
      });
    if (nameAnswer.kind !== "answered") {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    const project_name = nameAnswer.value;

    // 2. PM mode
    const pmAnswer = await prompt(reconfigurePmPromptSite, context, {
        message: "Project management approach?",
        options: PM_MODE_OPTIONS,
        initialValue: current.pm_mode,
        runtimeDefault: current.pm_mode,
        explicitAnswer: supplied.pmMode,
      });
    if (pmAnswer.kind !== "answered") {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    const pm_mode = pmAnswer.value;

    // 3. Team mode
    const teamAnswer = await prompt(reconfigureTeamPromptSite, context, {
        message: "Enable multi-developer coordination? (ARC Team Mode)",
        initialValue: current.team_mode ?? false,
        runtimeDefault: current.team_mode ?? false,
        explicitAnswer: supplied.teamMode,
      });
    if (teamAnswer.kind !== "answered") {
      p.cancel("Reconfigure cancelled.");
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
      throw sentinel;
    }

    const team_mode = teamAnswer.value;

    // Team mode warning — only when enabling (not already enabled)
    if (context.interaction === "allowed" && team_mode && !(current.team_mode ?? false)) {
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

/** Declared acquisition policy for reconfigure name selection. */
export const reconfigureNamePromptSite = declarePromptSite("prompt.reconfigure.name", "text",
  { file: "prompts/reconfigure-prompts.ts", symbol: "reconfigureNamePromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "projectName",
    defaultSource: "current project name",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--name"],
      acceptedSyntax: ["--name <name>"]
    },
    mutationBoundary: "reconfiguration project settings",
    subprocess: "none"
  });

/** Declared acquisition policy for reconfigure pm-mode selection. */
export const reconfigurePmPromptSite = declarePromptSite("prompt.reconfigure.pm-mode", "select",
  { file: "prompts/reconfigure-prompts.ts", symbol: "reconfigurePmPromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "pmMode",
    defaultSource: "current project-management mode",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--pm-mode"],
      acceptedSyntax: ["--pm-mode <mode>"]
    },
    mutationBoundary: "reconfiguration project settings",
    subprocess: "none"
  });

/** Declared acquisition policy for reconfigure team selection. */
export const reconfigureTeamPromptSite = declarePromptSite("prompt.reconfigure.team", "confirm",
  { file: "prompts/reconfigure-prompts.ts", symbol: "reconfigureTeamPromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "teamMode",
    defaultSource: "current team mode",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--team"],
      acceptedSyntax: ["--team"]
    },
    mutationBoundary: "reconfiguration project settings",
    subprocess: "none"
  });
