/** Directed-command capability, warm-entry gating, and checkout-pinned execution. */

import type { GitExec } from "../git/exec.js";
import { createLocusMutationResult } from "./mutation.js";
import type { LocusAnchor, LocusMutationResultV1 } from "./schema/index.js";

export interface EnteringProcessCapabilities {
  readonly directedCommands: boolean;
}

export type WarmLocusOpenOperation = "errand-open" | "plan-open" | "housekeep-open";

const DIRECTED_COMMAND_SELECTORS = new Set(["codex", "claude"]);
const COLD_ENTRY_PROMPT =
  "Start a cold session with Codex or Claude for this operation; warm entry cannot direct commands safely.";

/**
 * Derive fixed entering-process capabilities without inspecting ambient process state.
 *
 * @param anchor - The already-selected entering session anchor.
 * @returns Capability flags for warm entry.
 */
export function enteringProcessCapabilities(anchor: LocusAnchor): EnteringProcessCapabilities {
  return {
    directedCommands: anchor.kind === "process" && DIRECTED_COMMAND_SELECTORS.has(anchor.selector),
  };
}

/**
 * Refuse incapable warm entry before invoking identity or local allocation mutation.
 *
 * @param options - Entering anchor, open operation, and deferred mutation closure.
 * @returns A cold-entry refusal or the mutation result produced after admission.
 */
export async function guardWarmLocusEntry(options: {
  anchor: LocusAnchor;
  operation: WarmLocusOpenOperation;
  mutate(): Promise<LocusMutationResultV1>;
}): Promise<LocusMutationResultV1> {
  if (!enteringProcessCapabilities(options.anchor).directedCommands) {
    return createLocusMutationResult({
      outcome: "refused",
      operation: options.operation,
      reason: "cold-entry-required",
      recommendedPromptText: COLD_ENTRY_PROMPT,
    });
  }
  return createLocusMutationResult(await options.mutate());
}

/**
 * Pin every Git invocation to one resolved locus, ignoring ambient or caller-supplied cwd.
 *
 * @param exec - Underlying Git execution boundary.
 * @param checkoutPath - Absolute active-locus or session-home path.
 * @returns A Git executor with the target cwd fixed.
 */
export function pinLocusGitExec(exec: GitExec, checkoutPath: string): GitExec {
  return (command, args, options) => exec(command, args, { ...options, cwd: checkoutPath });
}
