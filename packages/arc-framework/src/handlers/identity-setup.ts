/** Caller-owned confirmation for an existing personal identity. */
import * as p from "../lib/terminal.js";
import { prompt, type PromptRenderer } from "../lib/command-input/prompter.js";
import type { PromptSite } from "../lib/command-input/declaration.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
/** Warn in every mode, then use the verb's declared proceed default or explicit answer. */
export function confirmPersonalIdentity(site: PromptSite<"confirm">, context?: InteractionContext, renderer?: PromptRenderer) {
  return async (identity: string): Promise<boolean> => {
    p.log.warn(`Identity '${identity}' already has personal records. Confirm that this identity is yours.`);
    if (context === undefined) return true;
    const answer = await prompt(site, context, { message: `Is '${identity}' your identity?`, runtimeDefault: true }, renderer);
    return answer.kind === "answered" && answer.value;
  };
}
