/**
 * Non-interactive init mode — build InitPromptResult from CLI flags.
 *
 * Used when `arc init --yes` is passed. Produces the same InitPromptResult
 * as the interactive prompts, using sensible defaults with optional overrides.
 *
 * @module
 */

import { basename } from "node:path";
import type { InitPromptResult } from "./init-prompts.js";

/** Options for non-interactive init. */
export interface NonInteractiveOptions {
  /** Working directory (used to derive default project name). */
  cwd: string;
  /** Override project name (--name flag). */
  name?: string;
  /** Override PM mode (--pm-mode flag). */
  pmMode?: string;
  /** Override tools as CSV string (--tools flag). */
  tools?: string;
  /** Override team mode (--team flag). */
  team?: boolean;
}

/**
 * Build an InitPromptResult from CLI flags and defaults.
 *
 * Defaults: project_name from basename(cwd), tools=[], pm_mode="none".
 * Each optional flag overrides one default.
 *
 * @param options - Non-interactive options from CLI flags
 * @returns InitPromptResult matching the interactive prompt output shape
 */
export function buildNonInteractivePrompts(
  options: NonInteractiveOptions,
): InitPromptResult {
  return {
    project_name: options.name ?? basename(options.cwd),
    tools: options.tools
      ? options.tools.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    pm_mode: options.pmMode ?? "none",
    team_mode: options.team ?? false,
  };
}
