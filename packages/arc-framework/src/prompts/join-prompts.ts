/**
 * Interactive prompts for `arc join`.
 *
 * Two declared questions:
 * 1. role — select between Team member (maintainer) and Contributor
 * 2. tools — autocomplete multiselect of AI development tools (shared with init)
 *
 * Returns a {@link JoinPromptResult} for the join orchestrator.
 */

import * as p from "../lib/terminal.js";
import { declarePromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";

import { promptTools } from "./init-prompts.js";
import type { JoinPromptResult } from "../commands/join.js";

/** Role options for the join prompt. */
const ROLE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  { value: "maintainer", label: "Team member", hint: "full ARC workflow access" },
  { value: "contributor", label: "Contributor", hint: "streamlined workflow" },
];

/** Options for the join prompt sequence. */
export interface JoinPromptOptions {
  /** When true, skip role prompt and use "contributor". */
  contributor?: boolean;
  /** Current role (for reconfigure — used as default selection). */
  currentRole?: "maintainer" | "contributor";
  /** Current tools (for reconfigure — used as default selection). */
  currentTools?: string[];
  /** Adapter-resolved role; skips the role prompt when present. */
  suppliedRole?: "maintainer" | "contributor";
  /** Adapter-resolved tools; skips the tools prompt when present. */
  suppliedTools?: readonly string[];
}

/**
 * Run the interactive join prompt sequence.
 *
 * @param context - Invocation interaction and authority
 * @param options - Optional overrides (e.g., --contributor flag)
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runJoinPrompts(
  context: InteractionContext,
  options: JoinPromptOptions = {},
): Promise<JoinPromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {
    const answer = await prompt(joinRolePromptSite, context, {
      message: "What's your role in this project?",
      options: ROLE_OPTIONS,
      initialValue: options.currentRole ?? "maintainer",
      runtimeDefault: options.currentRole ?? "maintainer",
      explicitAnswer: options.suppliedRole ?? (options.contributor ? "contributor" : undefined),
    });
    if (answer.kind !== "answered") {
      p.cancel("Setup cancelled.");
      return null;
    }
    const role = answer.value;
    if (context.interaction === "allowed" && options.contributor && options.suppliedRole === undefined) {
      p.log.info("Role: contributor (via --contributor flag)");
    }
    const tools = await promptTools(joinToolsPromptSite, context, sentinel, options.currentTools ?? [],
      options.suppliedTools === undefined ? undefined : [...options.suppliedTools]);

    return {
      role: role as "maintainer" | "contributor",
      tools,
    };
  } catch (err) {
    if (typeof err === "symbol") return null;
    throw err;
  }
}

/** Declared acquisition policy for join role selection. */
export const joinRolePromptSite = declarePromptSite("prompt.join.role", "select",
  { file: "prompts/join-prompts.ts", symbol: "joinRolePromptSite" }, {
    acquisition: "safe-default",
    schemaOwnership: "owned",
    schemaField: "role",
    defaultSource: "current role or maintainer",
    cancellation: "stop",
    automation: {
      noInput: "use-default",
      flags: ["--contributor"],
      acceptedSyntax: ["--contributor"]
    },
    mutationBoundary: "workspace role selection",
    subprocess: "none"
  });

/** Declared acquisition policy for join tools selection. */
export const joinToolsPromptSite = declarePromptSite("prompt.join.tools", "multiselect",
  { file: "prompts/join-prompts.ts", symbol: "joinToolsPromptSite" }, {
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
    mutationBoundary: "workspace tool selection",
    subprocess: "none"
  });
