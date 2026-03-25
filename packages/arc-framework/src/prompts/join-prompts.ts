/**
 * Interactive prompts for `arc join`.
 *
 * Two-prompt sequence using @clack/prompts:
 * 1. role — select between Team member (maintainer) and Contributor
 * 2. tools — autocomplete multiselect of AI development tools (shared with init)
 *
 * Returns a {@link JoinPromptResult} for the join orchestrator.
 */

import * as p from "@clack/prompts";
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
}

/**
 * Run the interactive join prompt sequence.
 *
 * @param options - Optional overrides (e.g., --contributor flag)
 * @returns Prompt results, or `null` if the user cancelled
 */
export async function runJoinPrompts(
  options?: JoinPromptOptions,
): Promise<JoinPromptResult | null> {
  const sentinel = Symbol("prompt-cancelled");

  try {
    // 1. Role selection — skip if --contributor flag was passed
    let role: string;
    if (options?.contributor) {
      role = "contributor";
      p.log.info("Role: contributor (via --contributor flag)");
    } else {
      const selected = await p.select({
        message: "What's your role in this project?",
        options: ROLE_OPTIONS,
        initialValue: "maintainer",
      });
      if (p.isCancel(selected)) {
        p.cancel("Setup cancelled.");
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- sentinel for clack cancellation flow
        throw sentinel;
      }
      role = selected;
    }

    // 2. Tools selection (shared prompt)
    const tools = await promptTools(sentinel);

    return {
      role: role as "maintainer" | "contributor",
      tools,
    };
  } catch (err) {
    if (typeof err === "symbol") return null;
    throw err;
  }
}
