/**
 * Shared constants for the ARC CLI.
 *
 * Centralizes magic strings used across commands — config paths, config keys,
 * PM mode values, and recipe condition strings.
 */

// --- Config Paths ---

/** Template-relative path to arc-config.yml. */
export const ARC_CONFIG_TEMPLATE_PATH = "system/arc-config.yml";

/** Repo-relative path segments to arc-config.yml under .arc/. */
export const ARC_CONFIG_SEGMENTS = [".arc", "system", "arc-config.yml"] as const;

// --- Config Keys ---

/** Config key for Project Management mode. */
export const CONFIG_KEY_PM_MODE = "pm.mode";

/** Config key for team mode. */
export const CONFIG_KEY_TEAM_MODE = "team.mode";

// --- PM Mode Values ---

/** PM mode value for ARC's built-in project management. */
export const PM_MODE_ARC_IN_GIT = "arc-in-git";

/** Recipe condition string for arc-in-git file inclusion. */
export const ARC_IN_GIT_CONDITION = `${CONFIG_KEY_PM_MODE} == ${PM_MODE_ARC_IN_GIT}`;
