/** Context-backed prompt and presentation capabilities. */

import { z } from "zod";

import type { InteractionContext } from "./interaction-context.js";
import {
  resolvePromptInput,
  type InputRequirement,
  type InputResolution,
} from "./resolution.js";

/** Acquire and validate one prompt answer only when interaction is available. */
export async function acquirePromptInput<T extends z.ZodType>(
  context: Pick<InteractionContext, "interaction">,
  schema: T,
  requirement: InputRequirement,
  prompt: () => Promise<unknown>,
): Promise<InputResolution<z.output<T>>> {
  if (context.interaction === "forbidden") return { kind: "unavailable", missing: [requirement] };
  return resolvePromptInput(schema, await prompt());
}
/** Render directly when presenter interaction is forbidden; otherwise use the supplied presenter. */
export async function presentWithInteraction(
  context: { readonly subprocess: { readonly presenters: "allowed" | "forbidden" } },
  content: string,
  output: {
    readonly direct: (content: string) => Promise<void> | void;
    readonly paged: (content: string) => Promise<void> | void;
  },
): Promise<void> {
  if (context.subprocess.presenters === "allowed") await output.paged(content);
  else await output.direct(content);
}
