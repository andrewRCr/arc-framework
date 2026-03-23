/**
 * Interactive prompts for `arc init`.
 *
 * Three-prompt sequence using @clack/prompts:
 * 1. project_name — text input, defaults to basename of cwd
 * 2. tools — grouped multiselect of AI development tools
 * 3. pm_mode — select for Project Management approach
 *
 * Returns an {@link InitPromptResult} that the init command maps to
 * {@link InstallConfig}, token map, and condition config.
 */

import * as p from "@clack/prompts";
import { basename } from "node:path";

/** Sentinel thrown from onCancel to abort prompt group without process.exit. */
const PROMPT_CANCELLED = Symbol("prompt-cancelled");

/**
 * Tool options grouped by skill directory tier.
 *
 * Universal tools share `.agents/skills/` — one copy serves all.
 * Standalone tools require their own directories (noted in hints).
 */
const TOOL_OPTIONS: Record<string, { value: string; label: string; hint?: string }[]> = {
  "Universal (.agents/skills/)": [
    { value: "amp", label: "Amp" },
    { value: "cline", label: "Cline" },
    { value: "codex", label: "Codex" },
    { value: "cursor", label: "Cursor" },
    { value: "gemini", label: "Gemini CLI" },
    { value: "copilot", label: "GitHub Copilot" },
    { value: "kimi", label: "Kimi Code CLI" },
    { value: "opencode", label: "OpenCode" },
    { value: "warp", label: "Warp" },
    { value: "windsurf", label: "Windsurf" },
  ],
  "Standalone": [
    { value: "antigravity", label: "Antigravity", hint: ".agent/skills/" },
    { value: "augment", label: "Augment", hint: ".augment/skills/" },
    { value: "claude", label: "Claude Code", hint: ".claude/skills/" },
  ],
};

/** PM mode options with descriptive labels. */
const PM_MODE_OPTIONS: { value: string; label: string; hint: string }[] = [
  {
    value: "none",
    label: "ARC Core",
    hint: "The structured ARC development methodology \u2014 session continuity across tools and machines, spec-driven task execution, codified standards, and commit traceability. No integrated planning layer (can be added later).",
  },
  {
    value: "arc-in-git",
    label: "ARC Core + Planning Module",
    hint: "Adds ARC's planning infrastructure \u2014 roadmap, backlogs, task capture, and project status \u2014 all managed in git alongside your code.",
  },
  {
    value: "external",
    label: "ARC Core + External Tracker",
    hint: "Everything in Core, plus guided setup for connecting ARC workflows to Jira, Linear, GitHub Issues, or similar.",
  },
];

/** Result from the interactive init prompt sequence. */
export interface InitPromptResult {
  project_name: string;
  tools: string[];
  pm_mode: string;
  team_mode: boolean;
}

/**
 * Run the interactive init prompt sequence.
 *
 * In fresh mode, prompts for all values. In join mode, only prompts for tools
 * (project-level config is read from the existing installation).
 *
 * @param cwd - Working directory (used to derive default project name)
 * @param mode - Init mode: 'fresh' (default) or 'join'
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runInitPrompts(
  cwd: string,
  mode: "fresh" | "join" = "fresh",
): Promise<InitPromptResult | null> {
  const onCancel = (): never => {
    p.cancel("Setup cancelled.");
    throw PROMPT_CANCELLED;
  };

  try {
    if (mode === "join") {
      // Join mode: only tools prompt — project config already established
      const result = await p.group(
        {
          tools: () =>
            p.groupMultiselect({
              message: "Which AI development tools do you use?",
              options: TOOL_OPTIONS,
              required: false,
            }),
        },
        { onCancel },
      );

      return {
        project_name: "",
        tools: result.tools as string[],
        pm_mode: "",
        team_mode: false,
      };
    }

    // Fresh mode: full prompt sequence
    const result = await p.group(
      {
        project_name: () =>
          p.text({
            message: "Project name?",
            defaultValue: basename(cwd),
            placeholder: basename(cwd),
          }),

        tools: () =>
          p.groupMultiselect({
            message: "Which AI development tools do you use?",
            options: TOOL_OPTIONS,
            required: false,
          }),

        pm_mode: () =>
          p.select({
            message: "Project management approach?",
            options: PM_MODE_OPTIONS,
            initialValue: "none",
          }),

        team_mode: () =>
          p.confirm({
            message: "Will other developers work in this repository?",
            initialValue: false,
          }),
      },
      { onCancel },
    );

    return {
      project_name: result.project_name,
      tools: result.tools as string[],
      pm_mode: result.pm_mode as string,
      team_mode: result.team_mode as boolean,
    };
  } catch (err) {
    if (err === PROMPT_CANCELLED) return null;
    throw err;
  }
}
