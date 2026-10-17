/** Explicit inspection and designation of the ref store's clone-local remotes. */

import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declarePromptSite } from "../lib/command-input/declaration.js";
import { prompt } from "../lib/command-input/prompter.js";
import { runStoreRemote } from "../lib/store/create.js";
import { StoreRemoteInputSchema, type StoreRemoteResult } from "../lib/store/commands.js";
import { invalidStoreCommand, renderStoreCommand, storeCommandDependencies, type StoreCommandDependencies } from "./store-output.js";

/** Output and explicit publication options supplied by Commander. */
export interface StoreRemoteOptions { json?: boolean; ownState?: boolean }

/** Publishing this clone's complete store requires its explicit affirmative answer. */
export const storeOwnStatePromptSite = declarePromptSite("prompt.store.own-state", "confirm",
  { file: "commands/store-remote.ts", symbol: "storeOwnStatePromptSite" }, {
    acquisition: "protected-confirmation", schemaOwnership: "owned", schemaField: "ownState", cancellation: "stop",
    automation: { noInput: "require-authority", flags: ["--own-state"], acceptedSyntax: ["--own-state"] },
    mutationBoundary: "publishing this clone's complete store on another remote", subprocess: "none",
  });

/** Run the explicit ref-store remote entry through native production ports. */
export async function handleStoreRemote(remote: string | undefined, role: string | undefined,
  options: StoreRemoteOptions, interaction: InteractionContext,
  overrides: Partial<StoreCommandDependencies> = {}): Promise<StoreRemoteResult> {
  const io = await storeCommandDependencies(overrides);
  const parsed = StoreRemoteInputSchema.safeParse({ remote, role, ownState: options.ownState });
  if (!parsed.success) {
    const refused = invalidStoreCommand("remote", parsed.error.message);
    renderStoreCommand(refused, options.json === true, io); return refused;
  }
  const input = parsed.data;
  let result = await runStoreRemote(io.ports, input);
  if (result.status === "confirmation-needed") {
    const answer = await prompt(storeOwnStatePromptSite, interaction, { message: result.condition, initialValue: false }, io.promptRenderer);
    if (answer.kind === "answered" && answer.value) result = await runStoreRemote(io.ports, { ...input, ownState: true });
    else if (answer.kind !== "refused") {
      io.write("Remote setting left unchanged.\n");
      result = await runStoreRemote(io.ports);
    }
  }
  renderStoreCommand(result, options.json === true, io);
  return result;
}
