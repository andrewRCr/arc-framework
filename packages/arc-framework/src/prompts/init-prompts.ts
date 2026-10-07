/**
 * Interactive prompts for `arc init`.
 *
 * Four declared questions:
 * 1. project_name — text input, defaults to basename of cwd
 * 2. tools — autocomplete multiselect of AI development tools
 * 3. pm_mode — note preamble + select for Project Management approach
 * 4. team_mode — confirm for multi-developer coordination
 *
 * Returns an {@link InitPromptResult} that the init command maps to
 * {@link InstallConfig}, token map, and condition config.
 */

import * as p from "../lib/terminal.js";
import { declarePromptSite, type PromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";

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

/** Cancel the prompt sequence and display a cancellation message. */
function cancelAndThrow(sentinel: symbol): never {
  p.cancel("Setup cancelled.");
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
  throw sentinel;
}

/**
 * Display the tools preamble note and run the tools prompt.
 *
 * Shared between fresh and join modes.
 * @param site - Caller-owned tools declaration
 * @param context - Invocation interaction and authority
 * @param sentinel - Caller-owned cancellation sentinel
 * @param initialValues - Current tools and forbidden-mode default
 * @param explicitAnswer - Explicit tools from command input
 * @returns Selected tools
 */
export async function promptTools(site: PromptSite<"multiselect">, context: InteractionContext,
  sentinel: symbol, initialValues: string[] = [], explicitAnswer?: string[]): Promise<string[]> {
  if (context.interaction === "allowed" && explicitAnswer === undefined) {
    p.note(
      "ARC installs Skills as triggers for common workflows (commits,\n" +
        "handoffs, etc.) into your tools' skill directories.\n" +
        "\n" +
        "Most tools share .agents/skills/, but existing tool-native\n" +
        "directories are respected. Some tools require their own\n" +
        "(shown in hints).",
      "Skill installation",
    );

  }

  const answer = await prompt(site, context, {
    message: "Which AI tools will you use in this repo? (type to search)",
    options: TOOL_OPTIONS,
    maxItems: 8,
    ...(initialValues.length > 0 ? { initialValues } : {}),
    runtimeDefault: initialValues,
    explicitAnswer,
  });
  if (answer.kind !== "answered") cancelAndThrow(sentinel);
  const selected = answer.value;

  if (context.interaction === "allowed" && explicitAnswer === undefined && selected.length > 0) {
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
 * @param context - Invocation interaction and authority
 * @param supplied - Explicit values supplied by the command adapter
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runInitPrompts(
  cwd: string,
  context: InteractionContext,
  supplied: {
    readonly name?: string;
    readonly tools?: readonly string[];
    readonly pmMode?: string;
    readonly teamMode?: boolean;
  } = {},
): Promise<InitPromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {

    // 1. Project name
    const dirName = basename(cwd);
    const defaultName = dirName;

    if (context.interaction === "allowed") p.note(
      "Used in documentation headers and project references.\n" +
        "Any casing is fine \u2014 this is a display name, not a slug.",
      "Project name",
    );

    const nameAnswer = await prompt(initNamePromptSite, context, {
        message: "Project name?",
        defaultValue: defaultName,
        placeholder: defaultName,
        runtimeDefault: defaultName,
        explicitAnswer: supplied.name,
      });
    if (nameAnswer.kind !== "answered") cancelAndThrow(sentinel);
    const project_name = nameAnswer.value;

    // 2. Tools
    const tools = await promptTools(initToolsPromptSite, context, sentinel, [],
      supplied.tools === undefined ? undefined : [...supplied.tools]);

    // 3. PM mode — note preamble with descriptions, then clean select
    if (context.interaction === "allowed") p.note(
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

    const pmAnswer = await prompt(initPmPromptSite, context, {
        message: "Project management approach?",
        options: PM_MODE_OPTIONS,
        initialValue: "none",
        runtimeDefault: "none",
        explicitAnswer: supplied.pmMode,
      });
    if (pmAnswer.kind !== "answered") cancelAndThrow(sentinel);
    const pm_mode = pmAnswer.value;

    // 4. Team mode
    const teamAnswer = await prompt(initTeamPromptSite, context, {
        message:
          "Enable multi-developer coordination? (ARC Team Mode: task ownership, team handoffs, team branching)",
        initialValue: false,
        runtimeDefault: false,
        explicitAnswer: supplied.teamMode,
      });
    if (teamAnswer.kind !== "answered") cancelAndThrow(sentinel);
    const team_mode = teamAnswer.value;

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

/** Declared acquisition policy for init tools selection. */
export const initToolsPromptSite = declarePromptSite("prompt.init.tools", "multiselect",
  { file: "prompts/init-prompts.ts", symbol: "initToolsPromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "tools",
    defaultSource: "empty or current tool list",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--tools"],
      acceptedSyntax: ["--tools <list>"]
    },
    mutationBoundary: "installation tool selection",
    subprocess: "none"
  });

/** Declared acquisition policy for init name selection. */
export const initNamePromptSite = declarePromptSite("prompt.init.name", "text",
  { file: "prompts/init-prompts.ts", symbol: "initNamePromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "projectName",
    defaultSource: "current directory name",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--name"],
      acceptedSyntax: ["--name <name>"]
    },
    mutationBoundary: "installation project configuration",
    subprocess: "none"
  });

/** Declared acquisition policy for init pm-mode selection. */
export const initPmPromptSite = declarePromptSite("prompt.init.pm-mode", "select",
  { file: "prompts/init-prompts.ts", symbol: "initPmPromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "pmMode",
    defaultSource: "none",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--pm-mode"],
      acceptedSyntax: ["--pm-mode <mode>"]
    },
    mutationBoundary: "installation project configuration",
    subprocess: "none"
  });

/** Declared acquisition policy for init team selection. */
export const initTeamPromptSite = declarePromptSite("prompt.init.team", "confirm",
  { file: "prompts/init-prompts.ts", symbol: "initTeamPromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "teamMode",
    defaultSource: "disabled",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--team"],
      acceptedSyntax: ["--team"]
    },
    mutationBoundary: "installation project configuration",
    subprocess: "none"
  });
