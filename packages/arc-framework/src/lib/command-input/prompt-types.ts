/** Typed question values, renderer boundary and policy outcomes. */
import type { InteractionContext } from "./interaction-context.js";

export type PromptOutcome<Value> =
  | { readonly kind: "answered"; readonly value: Value }
  | { readonly kind: "refused"; readonly acceptedSyntax: readonly string[] }
  | { readonly kind: "cancelled" };
export type RenderedPrompt<Value> = Exclude<PromptOutcome<Value>, { kind: "refused" }>;

interface PromptValues<Value> {
  readonly message: string;
  readonly runtimeDefault?: Value;
  readonly explicitAnswer?: Value;
}
export interface ConfirmQuestion extends PromptValues<boolean> {
  readonly initialValue?: boolean;
  readonly active?: string;
  readonly inactive?: string;
}
export interface TextQuestion extends PromptValues<string> {
  readonly initialValue?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly validate?: (value: string | undefined) => string | Error | undefined;
}
export interface PromptOption<Value> {
  readonly value: Value;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}
export interface SelectQuestion<Value> extends PromptValues<Value> {
  readonly options: readonly PromptOption<Value>[];
  readonly initialValue?: Value;
  readonly maxItems?: number;
}
export interface MultiselectQuestion<Value> extends PromptValues<Value[]> {
  readonly options: readonly PromptOption<Value>[];
  readonly initialValues?: Value[];
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly maxItems?: number;
}

/** Only this injected boundary may draw a question or observe terminal cancellation. */
export interface PromptRenderer {
  readonly confirm: (context: InteractionContext, question: ConfirmQuestion) => Promise<RenderedPrompt<boolean>>;
  readonly text: (context: InteractionContext, question: TextQuestion) => Promise<RenderedPrompt<string>>;
  readonly select: <Value>(context: InteractionContext, question: SelectQuestion<Value>) => Promise<RenderedPrompt<Value>>;
  readonly multiselect: <Value>(context: InteractionContext, question: MultiselectQuestion<Value>) => Promise<RenderedPrompt<Value[]>>;
}
