/**
 * Interactive prompts for `arc init`.
 *
 * Three-prompt sequence using @clack/prompts:
 * 1. project_name — text input, defaults to basename of cwd
 * 2. tools — multiselect of AI development tools
 * 3. pm_mode — select for Project Management approach
 *
 * Returns an {@link InitPromptResult} that the init command maps to
 * {@link InstallConfig}, token map, and condition config.
 */

import * as p from "@clack/prompts";
import { basename } from "node:path";

/** Display-label to condition-value mapping for tool selection. */
const TOOL_OPTIONS: { value: string; label: string }[] = [
    { value: "claude", label: "Claude Code" },
    { value: "codex", label: "Codex" },
    { value: "cursor", label: "Cursor" },
    { value: "copilot", label: "GitHub Copilot" },
    { value: "windsurf", label: "Windsurf" },
    { value: "gemini", label: "Gemini" },
    { value: "warp", label: "Warp" },
];

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
}

/**
 * Run the interactive init prompt sequence.
 *
 * @param cwd - Working directory (used to derive default project name)
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runInitPrompts(
    cwd: string,
): Promise<InitPromptResult | null> {
    const result = await p.group(
        {
            project_name: () =>
                p.text({
                    message: "Project name?",
                    defaultValue: basename(cwd),
                    placeholder: basename(cwd),
                }),

            tools: () =>
                p.multiselect({
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
        },
        {
            onCancel: () => {
                p.cancel("Setup cancelled.");
                process.exit(0);
            },
        },
    );

    return {
        project_name: result.project_name,
        tools: result.tools as string[],
        pm_mode: result.pm_mode as string,
    };
}
