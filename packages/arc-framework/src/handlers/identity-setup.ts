/** Caller-owned confirmation for an existing personal identity. */
import * as p from "../lib/terminal.js";
import { prompt, type PromptRenderer } from "../lib/command-input/prompter.js";
import type { PromptSite } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
/** A running spinner the question interrupts, and the label it resumes under once the identity is confirmed. */
export interface InterruptedProgress { spinner: { clear(): void; start(message?: string): void }; label: string }

/**
 * Warn in every mode, then use the verb's declared proceed default or explicit answer.
 * A running spinner is cleared first: while it runs it takes Ctrl-C itself and ends the process with exit 0, so a
 * cancelled question would never reach the caller's refusal.
 */
export function confirmPersonalIdentity(site: PromptSite<"confirm">, context?: InteractionContext, renderer?: PromptRenderer,
  progress?: InterruptedProgress) {
  return async (identity: string): Promise<boolean> => {
    progress?.spinner.clear();
    p.log.warn(`Identity '${identity}' already has personal records. Confirm that this identity is yours.`);
    const confirmed = context === undefined || await askIdentity(site, context, identity, renderer);
    if (confirmed) progress?.spinner.start(progress.label);
    return confirmed;
  };
}

async function askIdentity(site: PromptSite<"confirm">, context: InteractionContext, identity: string, renderer?: PromptRenderer): Promise<boolean> {
  const answer = await prompt(site, context, { message: `Is '${identity}' your identity?`, runtimeDefault: true }, renderer);
  return answer.kind === "answered" && answer.value;
}
