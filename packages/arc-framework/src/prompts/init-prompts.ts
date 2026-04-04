/**
 * Interactive prompts for `arc init`.
 *
 * Four-prompt sequence using @clack/prompts:
 * 1. project_name — text input, defaults to basename of cwd
 * 2. tools — autocomplete multiselect of AI development tools
 * 3. pm_mode — note preamble + select for Project Management approach
 * 4. team_mode — confirm for multi-developer coordination
 *
 * Returns an {@link InitPromptResult} that the init command maps to
 * {@link InstallConfig}, token map, and condition config.
 */

import * as p from "@clack/prompts";
import { basename } from "node:path";

/**
 * Tool options sorted alphabetically.
 *
 * Most tools share `.agents/skills/` by default — if a tool-native directory
 * already exists (e.g., `.codex/skills/`), ARC uses that instead.
 * Standalone tools always use their own fixed directory (noted in hints).
 */
const TOOL_OPTIONS: { value: string; label: string; hint?: string }[] = [
  { value: "amp", label: "Amp" },
  { value: "antigravity", label: "Antigravity", hint: "uses .agent/skills/" },
  { value: "augment", label: "Augment", hint: "uses .augment/skills/" },
  { value: "claude", label: "Claude Code", hint: "uses .claude/skills/" },
  { value: "cline", label: "Cline" },
  { value: "codex", label: "Codex" },
  { value: "cursor", label: "Cursor" },
  { value: "gemini", label: "Gemini CLI" },
  { value: "copilot", label: "GitHub Copilot" },
  { value: "kimi", label: "Kimi Code CLI" },
  { value: "opencode", label: "OpenCode" },
  { value: "warp", label: "Warp" },
  { value: "windsurf", label: "Windsurf" },
];

/** PM mode options with short labels — descriptions shown in a note preamble. */
const PM_MODE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  { value: "none", label: "ARC Core" },
  { value: "arc-in-git", label: "ARC Core + Planning Module" },
  { value: "external", label: "ARC Core + External Tracker" },
];

/** Result from the interactive init prompt sequence. */
export interface InitPromptResult {
  project_name: string;
  tools: string[];
  pm_mode: string;
  team_mode: boolean;
}

/** Convert a slug like "my-cool-app" to title case "My Cool App". */
function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

/** Cancel the prompt sequence and display a cancellation message. */
function cancelAndThrow(sentinel: symbol): never {
  p.cancel("Setup cancelled.");
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
  throw sentinel;
}

/**
 * Display the tools preamble note and run the tools prompt.
 *
 * Shared between fresh, join, and arc join modes.
 */
export async function promptTools(sentinel: symbol, initialValues?: string[]): Promise<string[]> {
  p.note(
    "ARC installs Skills as triggers for common workflows (commits,\n" +
      "handoffs, etc.) into your tools' skill directories.\n" +
      "\n" +
      "Most tools share .agents/skills/, but existing tool-native\n" +
      "directories are respected. Some tools require their own\n" +
      "(shown in hints).",
    "Skill installation",
  );

  const tools = await p.autocompleteMultiselect({
    message: "Which AI tools will you use in this repo? (type to search)",
    options: TOOL_OPTIONS,
    maxItems: 8,
    ...(initialValues && initialValues.length > 0 ? { initialValues } : {}),
  });
  if (p.isCancel(tools)) cancelAndThrow(sentinel);
  const selected = tools;

  if (selected.length > 0) {
    const labels = selected.map(
      (v) => TOOL_OPTIONS.find((o) => o.value === v)?.label ?? v,
    );
    p.log.message(`Selected: ${labels.join(", ")}`);
  }

  return selected;
}

/**
 * Run the interactive init prompt sequence.
 *
 * Prompts for project name, tools, PM mode, and team mode.
 *
 * @param cwd - Working directory (used to derive default project name)
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runInitPrompts(
  cwd: string,
): Promise<InitPromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {

    // 1. Project name
    const dirName = basename(cwd);
    const defaultName = titleCase(dirName);

    p.note(
      "Used in documentation headers and project references.\n" +
        "Any casing is fine \u2014 this is a display name, not a slug.",
      "Project name",
    );

    const project_name = await p.text({
      message: "Project name?",
      defaultValue: defaultName,
      placeholder: defaultName,
    });
    if (p.isCancel(project_name)) cancelAndThrow(sentinel);

    // 2. Tools
    const tools = await promptTools(sentinel);

    // 3. PM mode — note preamble with descriptions, then clean select
    p.note(
      "ARC Core\n" +
        "  Structured methodology: session continuity across tools and\n" +
        "  machines, task execution workflows, configurable codified\n" +
        "  standards, and commit traceability.\n" +
        "\n" +
        "ARC Core + Planning Module (arc-in-git)\n" +
        "  Adds ARC's planning pipeline \u2014 roadmap, backlog, and work\n" +
        "  intake \u2014 all managed in git alongside your code.\n" +
        "\n" +
        "ARC Core + External Tracker\n" +
        "  Core methodology plus guided setup for connecting ARC\n" +
        "  workflows to Jira, Linear, GitHub Issues, or similar.",
      "Project Management options",
    );

    const pm_mode = await p.select({
      message: "Project management approach?",
      options: PM_MODE_OPTIONS,
      initialValue: "none",
    });
    if (p.isCancel(pm_mode)) cancelAndThrow(sentinel);

    // 4. Team mode
    const team_mode = await p.confirm({
      message:
        "Enable multi-developer coordination? (ARC Team Mode: task ownership, team handoffs, team branching)",
      initialValue: false,
    });
    if (p.isCancel(team_mode)) cancelAndThrow(sentinel);

    return {
      project_name: project_name,
      tools,
      pm_mode: pm_mode,
      team_mode: team_mode,
    };
  } catch (err) {
    if (typeof err === "symbol") return null;
    throw err;
  }
}
