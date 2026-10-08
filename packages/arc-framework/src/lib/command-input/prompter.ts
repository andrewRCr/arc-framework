/** Declaration-bound prompt policy, independent from terminal rendering and caller output. */
import { CLACK_PROMPT_RENDERER } from "./prompt-renderer.js";
import type { PromptForm, PromptSite } from "./declaration.js";
import type { InteractionContext } from "./interaction-context.js";
import type { ConfirmQuestion, TextQuestion, SelectQuestion, MultiselectQuestion, PromptOutcome, PromptRenderer, RenderedPrompt } from "./prompt-types.js";
export type { ConfirmQuestion, TextQuestion, SelectQuestion, MultiselectQuestion, PromptOutcome, PromptRenderer } from "./prompt-types.js";

export function prompt(site: PromptSite<"confirm">, context: InteractionContext, question: ConfirmQuestion,
  renderer?: PromptRenderer): Promise<PromptOutcome<boolean>>;
export function prompt(site: PromptSite<"text">, context: InteractionContext, question: TextQuestion,
  renderer?: PromptRenderer): Promise<PromptOutcome<string>>;
export function prompt<Value>(site: PromptSite<"select">, context: InteractionContext, question: SelectQuestion<Value>,
  renderer?: PromptRenderer): Promise<PromptOutcome<Value>>;
export function prompt<Value>(site: PromptSite<"multiselect">, context: InteractionContext, question: MultiselectQuestion<Value>,
  renderer?: PromptRenderer): Promise<PromptOutcome<Value[]>>;
/**
 * Answer one question from its declaration and invocation values.
 * @param site - Branded question declaration
 * @param context - Resolved invocation interaction and authority
 * @param question - Runtime values for the declared form
 * @param renderer - Injectable terminal boundary
 * @returns An answered, refused or cancelled policy outcome
 */
export async function prompt(site: PromptSite<PromptForm>, context: InteractionContext,
  question: ConfirmQuestion | TextQuestion | SelectQuestion<unknown> | MultiselectQuestion<unknown>,
  renderer: PromptRenderer = CLACK_PROMPT_RENDERER): Promise<PromptOutcome<unknown>> {
  if (question.explicitAnswer !== undefined) return { kind: "answered", value: question.explicitAnswer };
  if (context.interaction === "allowed") {
    const answer = await renderQuestion(site.form, context, question, renderer);
    if (answer.kind === "cancelled" && site.cancellation === "safe-default" && question.runtimeDefault !== undefined) {
      return { kind: "answered", value: question.runtimeDefault };
    }
    return answer;
  }
  switch (site.automation.noInput) {
    case "use-default":
      if (question.runtimeDefault !== undefined) return { kind: "answered", value: question.runtimeDefault };
      break;
    case "require-authority":
      if (context.confirmation === "accept") return { kind: "answered", value: true };
      break;
    case "require-explicit": break;
    case "proceed": return { kind: "answered", value: true };
    case "refuse": return { kind: "refused", acceptedSyntax: [] };
  }
  return { kind: "refused", acceptedSyntax: site.automation.acceptedSyntax };
}

function renderQuestion(form: PromptForm, context: InteractionContext,
  question: ConfirmQuestion | TextQuestion | SelectQuestion<unknown> | MultiselectQuestion<unknown>,
  renderer: PromptRenderer): Promise<RenderedPrompt<unknown>> {
  switch (form) {
    case "confirm": return renderer.confirm(context, question as ConfirmQuestion);
    case "text": return renderer.text(context, question as TextQuestion);
    case "select": return renderer.select(context, question as SelectQuestion<unknown>);
    case "multiselect": return renderer.multiselect(context, question as MultiselectQuestion<unknown>);
  }
}
