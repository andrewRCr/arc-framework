/** The terminal boundary that renders declared questions through Clack. */
import * as p from "@clack/prompts";
import type { InteractionContext } from "./interaction-context.js";
import type { SelectQuestion, MultiselectQuestion, PromptRenderer, RenderedPrompt } from "./prompt-types.js";

function rendered<Value>(value: Value | symbol): RenderedPrompt<Value> {
  return p.isCancel(value) ? { kind: "cancelled" } : { kind: "answered", value };
}

/** Native prompt rendering on the invocation's declared input/output streams. */
export const CLACK_PROMPT_RENDERER: PromptRenderer = {
  confirm: async (context, question) => rendered(await p.confirm({
    ...question, input: context.promptInput, output: context.promptOutput,
  })),
  text: async (context, question) => rendered(await p.text({
    ...question, input: context.promptInput, output: context.promptOutput,
  })),
  select: async <Value>(context: InteractionContext,
    question: SelectQuestion<Value>) => rendered(await p.select<Value>({
    ...question, options: [...question.options] as p.Option<Value>[],
    input: context.promptInput, output: context.promptOutput,
  })),
  multiselect: async <Value>(context: InteractionContext,
    question: MultiselectQuestion<Value>) => rendered(await p.autocompleteMultiselect<Value>({
    ...question, options: [...question.options] as p.Option<Value>[],
    input: context.promptInput, output: context.promptOutput,
  })),
};
